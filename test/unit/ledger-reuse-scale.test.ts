// The index-backed lookupAnswers/exactReuse must agree with a from-scratch linear scan, at a size that
// exercises repeated keys, mixed outcomes, and more than one (adapter, model) — every knob reuse depends on.
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { writeSyntheticLedger } from '../gen/synthetic-ledger.ts';
import { isContractRun, readLedger, type LedgerRecord } from '../../src/ledger/log.ts';
import { __testOnly } from '../../src/ledger/index.ts';
import { exactReuse, lookupAnswers, type Who } from '../../src/ledger/reuse.ts';
import { tempProject } from '../helpers/project.ts';
import { seededRandom } from '../gen/prng.ts';

/** Task 11's original, deliberately-linear reuse logic, kept here as the oracle — not the code under test. */
function blockedRuns(records: readonly LedgerRecord[]): Set<string> {
  const latest = new Map<string, string>();
  for (const r of records) if (r.kind === 'outcome') latest.set(r.of, r.outcome);
  return new Set([...latest].filter(([, o]) => o !== 'held').map(([id]) => id));
}
function linearLookup(records: readonly LedgerRecord[], who: Who, keys: readonly string[]): Map<string, { id: string; answer: unknown }> {
  const want = new Set(keys);
  const out = new Map<string, { id: string; answer: unknown }>();
  const blocked = blockedRuns(records);
  for (const r of records) {
    if (!isContractRun(r) || r.adapter !== who.adapter || r.model !== who.model || blocked.has(r.id)) continue;
    for (const [qid, key] of Object.entries(r.keys)) {
      const answer = r.answers[qid];
      const id = r.reusedFrom[qid] ?? r.id;
      if (answer && want.has(key) && !blocked.has(id)) out.set(key, { id, answer });
    }
  }
  return out;
}
/** lookupAnswers now returns each hit's own ts/commit/where too (for age/commits-since display and
 *  staleness eviction) — this oracle only ever claimed id/answer correctness, so every comparison against it
 *  projects the real result down to that same shape first. */
function idAnswerOnly(m: ReadonlyMap<string, { id: string; answer: unknown }>): Record<string, { id: string; answer: unknown }> {
  return Object.fromEntries([...m].map(([k, v]) => [k, { id: v.id, answer: v.answer }]));
}
function linearExact(records: readonly LedgerRecord[], who: Who, keys: readonly string[]): string | undefined {
  if (!keys.length) return undefined;
  const blocked = blockedRuns(records);
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i]!;
    if (!isContractRun(r) || r.adapter !== who.adapter || r.model !== who.model || blocked.has(r.id)) continue;
    // A key "holds" only if its ORIGIN (reusedFrom[qid], or r itself when it asked fresh) is unblocked — not
    // merely that r itself isn't blocked. The generator this file's other tests use never populates reusedFrom
    // (every generated run is its own origin), so this distinction was previously untested here; a real chain
    // (see the dedicated test below) needs it to be a faithful oracle for exactReuse, which checks exactly this.
    const holds = keys.every((k) => {
      const qid = Object.entries(r.keys).find(([, key]) => key === k)?.[0];
      if (qid === undefined) return false;
      const origin = r.reusedFrom[qid] ?? r.id;
      return !blocked.has(origin);
    });
    if (holds) return r.id;
  }
  return undefined;
}

describe('index-backed reuse agrees with the linear oracle at scale', () => {
  // exactReuse's "not found" case is genuinely O(candidates for that who) — same as the oracle it's checked
  // against, which is O(the whole ledger) — since only a full scan can conclusively rule out any run holding
  // every requested key together. At 6000 runs and 300 multi-key queries that adds up past vitest's default
  // 5 s; the work itself, not a bug, is why this test gets more room. Task 29 (revised): the SQL engine adds a
  // real (small, ~4 ms at this size) per-call open+self-heal-check cost on TOP of that same O(candidates) walk
  // — 600 calls (lookupAnswers + exactReuse x 300) push this from "fits in 20 s" to "needs ~25-30 s" on a loaded
  // CI box; 40 s keeps real margin without hiding a genuine regression if the walk itself ever got slower.
  it(
    'across many random (who, keys) queries on a mixed-outcome, multi-provider ledger',
    () => {
      const { paths } = tempProject({});
      writeSyntheticLedger(paths, {
        seed: 'reuse-scale',
        runs: 6000,
        outcomeRate: 0.5,
        badRate: 0.25,
        providers: [
          { adapter: 'typesafe', model: 'jev-1.13.0', weight: 3 },
          { adapter: 'fake', model: 'mm3-fake-1', weight: 1 },
        ],
      });
      const records = readLedger(paths);
      const allKeys = [...new Set(records.filter(isContractRun).flatMap((r) => Object.values(r.keys)))];
      const rand = seededRandom('reuse-scale-queries');
      const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
      for (let i = 0; i < 300; i++) {
        const who: Who = pick([{ adapter: 'typesafe', model: 'jev-1.13.0' }, { adapter: 'fake', model: 'mm3-fake-1' }, { adapter: 'typesafe', model: 'jev-1.12.0' }]);
        const keys = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(allKeys));
        const wantLookup = linearLookup(records, who, keys);
        const gotLookup = lookupAnswers(paths, who, keys);
        expect(idAnswerOnly(gotLookup)).toEqual(Object.fromEntries(wantLookup));
        expect(exactReuse(paths, who, keys)).toBe(linearExact(records, who, keys));
      }
    },
    120_000, // 40 s was not enough on Intel macOS and Windows hosted runners
  );

  it('an answer whose original run was later overruled is never reused, even reached through a chain', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'reuse-chain', runs: 50, outcomeRate: 1, badRate: 1 }); // every run gets a bad outcome
    const records = readLedger(paths);
    const who: Who = { adapter: 'typesafe', model: 'jev-1.13.0' };
    const anyKey = [...new Set(records.filter(isContractRun).flatMap((r) => Object.values(r.keys)))][0]!;
    expect(lookupAnswers(paths, who, [anyKey]).size).toBe(0);
    expect(exactReuse(paths, who, [anyKey])).toBeUndefined();
  });

  // The generator above (writeSyntheticLedger/generateLedgerRecords) always sets reusedFrom: {} — every run is
  // its own origin, so the previous test's "even reached through a chain" never actually built one. This test
  // hand-writes a REAL chain: two runs (MM3-0002, MM3-0003) whose own reusedFrom points back at a common origin
  // (MM3-0001), plus a separate "blocked newest holder" pair (MM3-0004 older/valid, MM3-0005 newer/blocked) for
  // the same key — exactly the two gaps a profiling review flagged as untested.
  it('a real multi-hop reusedFrom chain traces back to its true origin, and a blocked newest holder falls back to an older valid one', () => {
    const { paths } = tempProject({});
    const who: Who = { adapter: 'typesafe', model: 'jev-1.13.0' };
    const mkAnswer = (p: number): unknown => ({ kind: 'yesno', p });
    const mkRun = (id: string, ts: string, keys: Record<string, string>, answers: Record<string, unknown>, reusedFrom: Record<string, string>): string =>
      JSON.stringify({
        kind: 'run',
        v: 2,
        id,
        uid: `${id}-u`,
        ts,
        verb: 'class',
        actor: 'agent',
        task: null,
        goal: `goal for ${id}`,
        depth: 'quick',
        where: ['src/a.ts'],
        parent: null,
        from: null,
        compare: null,
        mdl: null,
        ask: { categories: [], layers: [] },
        over: null,
        items: null,
        answers,
        keys,
        reusedFrom,
        categories: {},
        gate: 'pass',
        goalGate: 'pass',
        goalP: 0.9,
        consensus: 'STRONG',
        response: `mak:\n  id: ${id}\n`,
        notes: [],
        adapter: who.adapter,
        model: who.model,
        costUsd: 0.01,
        calls: 1,
      });

    const lines = [
      // MM3-0001: the true origin of k-chain.
      mkRun('MM3-0001', '2026-09-01T00:00:00Z', { '1': 'k-chain' }, { '1': mkAnswer(0.9) }, {}),
      // MM3-0002: reuses k-chain FROM MM3-0001 — a real hop.
      mkRun('MM3-0002', '2026-09-01T00:05:00Z', { '1': 'k-chain' }, { '1': mkAnswer(0.9) }, { '1': 'MM3-0001' }),
      // MM3-0003: reuses k-chain from MM3-0001 too — a second, independent hop from the same origin.
      mkRun('MM3-0003', '2026-09-01T00:10:00Z', { '1': 'k-chain' }, { '1': mkAnswer(0.9) }, { '1': 'MM3-0001' }),
      // MM3-0004: an older, independent fresh ask of k-newest (its own origin).
      mkRun('MM3-0004', '2026-09-01T00:15:00Z', { '1': 'k-newest' }, { '1': mkAnswer(0.2) }, {}),
      // MM3-0005: a LATER, independent fresh ask of the SAME key (also its own origin) — the "newest holder"
      // the answer_keys table's self-compacting design would otherwise overwrite MM3-0004's row with.
      mkRun('MM3-0005', '2026-09-01T00:20:00Z', { '1': 'k-newest' }, { '1': mkAnswer(0.3) }, {}),
    ];
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.log, `${lines.join('\n')}\n`);
    // MM3-0001 (the chain's true origin) and MM3-0005 (the newest k-newest holder) are both overruled.
    appendFileSync(
      paths.log,
      `${JSON.stringify({ kind: 'outcome', id: 'MM3-0001-outcome', uid: 'o1', ts: '2026-09-01T00:25:00Z', of: 'MM3-0001', outcome: 'overruled', by: 'owner' })}\n`,
    );
    appendFileSync(
      paths.log,
      `${JSON.stringify({ kind: 'outcome', id: 'MM3-0005-outcome', uid: 'o2', ts: '2026-09-01T00:26:00Z', of: 'MM3-0005', outcome: 'overruled', by: 'owner' })}\n`,
    );

    const records = readLedger(paths);

    // The chain: k-chain must be unreusable everywhere, even via B or C, since its true origin is blocked —
    // not just "MM3-0001 itself is blocked" but "everything that ever copied from it is blocked too."
    expect(lookupAnswers(paths, who, ['k-chain']).size).toBe(0);
    expect(exactReuse(paths, who, ['k-chain'])).toBeUndefined();
    expect(idAnswerOnly(lookupAnswers(paths, who, ['k-chain']))).toEqual(Object.fromEntries(linearLookup(records, who, ['k-chain'])));
    expect(exactReuse(paths, who, ['k-chain'])).toBe(linearExact(records, who, ['k-chain']));

    // The blocked-newest-holder case: MM3-0005 (newest) is blocked, so the older, still-valid MM3-0004 must be
    // the one found — the self-compacting answer_keys table's single "current holder" row for k-newest points
    // at MM3-0005, so this only works if the fallback correctly walks PAST a blocked current holder.
    const gotNewest = lookupAnswers(paths, who, ['k-newest']);
    expect(gotNewest.get('k-newest')?.id).toBe('MM3-0004');
    expect(idAnswerOnly(gotNewest)).toEqual(Object.fromEntries(linearLookup(records, who, ['k-newest'])));
    expect(exactReuse(paths, who, ['k-newest'])).toBe(linearExact(records, who, ['k-newest']));

    // Cross-check against the fallback engine too: both engines must agree, not just each agree with the oracle.
    __testOnly.forceFallback = true;
    try {
      expect(idAnswerOnly(lookupAnswers(paths, who, ['k-chain', 'k-newest']))).toEqual(Object.fromEntries(linearLookup(records, who, ['k-chain', 'k-newest'])));
      expect(exactReuse(paths, who, ['k-newest'])).toBe(linearExact(records, who, ['k-newest']));
    } finally {
      __testOnly.forceFallback = false;
    }
  });
});

// global-constraints.md: "deleting or corrupting the index must never change an answer, a reuse decision, or an
// id." index.db is disposable by construction (ledger/index.ts self-heals it from log.jsonl alone whenever it's
// missing or unreadable); this proves that for reuse specifically, not just findRun/nextRunNumber (already
// covered in ledger-index.test.ts).
describe('deleting or corrupting index.db never changes a reuse decision', () => {
  it('lookupAnswers and exactReuse give the same answers with the index missing, corrupt, or warm', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, {
      seed: 'reuse-index-disposable',
      runs: 800,
      outcomeRate: 0.5,
      badRate: 0.3,
      providers: [{ adapter: 'typesafe', model: 'jev-1.13.0', weight: 1 }],
    });
    const records = readLedger(paths);
    const who: Who = { adapter: 'typesafe', model: 'jev-1.13.0' };
    const allKeys = [...new Set(records.filter(isContractRun).flatMap((r) => Object.values(r.keys)))];
    const keys = allKeys.slice(0, 3);

    // Warm: index.db doesn't exist yet, so this call builds it from scratch.
    const warmLookup = Object.fromEntries(lookupAnswers(paths, who, keys));
    const warmExact = exactReuse(paths, who, keys);

    rmSync(paths.index, { force: true }); // missing
    expect(Object.fromEntries(lookupAnswers(paths, who, keys))).toEqual(warmLookup);
    expect(exactReuse(paths, who, keys)).toBe(warmExact);

    writeFileSync(paths.index, '{ not: valid json'); // corrupt
    expect(Object.fromEntries(lookupAnswers(paths, who, keys))).toEqual(warmLookup);
    expect(exactReuse(paths, who, keys)).toBe(warmExact);

    writeFileSync(paths.index, JSON.stringify({ v: 1, upto: 0, lineCount: 0, runCount: 0, runOffset: {}, blocked: {}, reuseKey: {} })); // the old (pre-Task-29-revised) JSON sidecar's shape, at the new .db path — still just garbage bytes to the SQLite/fallback self-heal check
    expect(Object.fromEntries(lookupAnswers(paths, who, keys))).toEqual(warmLookup);
    expect(exactReuse(paths, who, keys)).toBe(warmExact);
  });
});

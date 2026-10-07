// The SQLite ledger index (ledger/index.ts): nextRunNumber/findRun match a linear scan, catch up incrementally,
// self-heal on corruption (missing, garbage bytes, truncated, stale schema, a fingerprint mismatch), never
// trust a stale offset, never hide ledger corruption (fail closed, same wording as readLedger), the linear
// fallback (used when node:sqlite can't be imported, or forced for this test) agrees with it exactly, and
// dry runs / no-ledger reads create nothing on disk. Host is Node 20 (no node:sqlite): everything here runs
// against the fallback; the same file, run in the Node 22 container, exercises the real SQLite path too.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { generateLedgerRecords, toJsonl, writeSyntheticLedger } from '../gen/synthetic-ledger.ts';
import { formatRunId } from '../../src/ledger/ids.ts';
import { appendContractRun, appendLookup, findRun, isContractRun, isRun, nextRunNumber, readLedger } from '../../src/ledger/log.ts';
import { __testOnly, isSqliteExperimentalWarning, readRecordAt, sweepPlaces, withIndex } from '../../src/ledger/index.ts';
import { exactReuse, lookupAnswers } from '../../src/ledger/reuse.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun } from '../helpers/runs.ts';

afterEach(() => {
  __testOnly.forceFallback = false;
  __testOnly.throwOnCandidates = false;
  __testOnly.forceSqliteMissing = false;
});

/** True on this test run's own Node (>= 22.13): guards the handful of tests here that need to manipulate
 *  index.db's own SQL content directly, which only means something when node:sqlite is real. Host is Node 20
 *  (this predicts `false` there, skipping those specific tests — the fallback never persists a db file to
 *  manipulate); the same file, run in the Node 22 container, exercises them for real.
 *  Resolving node:sqlite AT ALL — a plain `await import(...)`, OR `process.getBuiltinModule` — fires its own
 *  deferred ExperimentalWarning the first time any process does it (verified directly: the warning prints
 *  asynchronously, after the resolving call returns, whether that call constructs a DatabaseSync or not). This
 *  probe wraps process.emitWarning first, the same way ledger/index.ts's own installSqliteWarningFilter does,
 *  so this file's own capability check doesn't leak raw warning noise — duplicated here (not imported) because
 *  ledger/index.ts's resolver is private, and this file must be able to probe availability BEFORE any test
 *  calls into production code, not after. */
const hasNodeSqlite = (() => {
  const getBuiltin = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  if (typeof getBuiltin !== 'function') return false;
  const original = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const message = typeof warning === 'string' ? warning : warning.message;
    const type = typeof rest[0] === 'string' ? rest[0] : ((rest[0] as { type?: string } | undefined)?.type ?? '');
    if (isSqliteExperimentalWarning({ name: type, message })) return;
    return (original as (...args: unknown[]) => void)(warning, ...rest);
  }) as typeof process.emitWarning;
  return !!getBuiltin('node:sqlite');
})();

/** generateLedgerRecords always numbers its own batch from MM3-0001 — right for a fresh ledger, but a real
 *  "append more to an existing ledger" scenario needs ids that continue past what's already there (a real
 *  ledger's ids are always unique: nextRunNumber always computes off the CURRENT count). Remaps `idOffset` runs
 *  are already used, matching the runs table's `id PK` schema — a colliding id would (correctly) INSERT OR
 *  REPLACE the same row rather than add a new one, exactly like a real duplicate-id ledger would. */
function remapIds(records: readonly unknown[], idOffset: number): unknown[] {
  const shift = (id: string): string => formatRunId(Number(id.slice(3)) + idOffset);
  return records.map((r) => {
    const rec = r as Record<string, unknown>;
    if (rec.kind === 'run') return { ...rec, id: shift(rec.id as string) };
    if (rec.kind === 'outcome') return { ...rec, id: `${shift(rec.of as string)}-outcome`, of: shift(rec.of as string) };
    return rec;
  });
}

describe('the index matches a linear scan', () => {
  it('nextRunNumber and findRun agree with readLedger, at a small size npm test can afford', () => {
    const { paths } = tempProject({});
    const { count } = writeSyntheticLedger(paths, { seed: 'idx-1', runs: 2000 });
    const linear = readLedger(paths);
    const runs = linear.filter((r) => r.kind === 'run');
    expect(nextRunNumber(paths)).toBe(runs.length + 1);
    expect(runs.length).toBeGreaterThanOrEqual(count); // outcomes/failed don't count as runs
    for (const id of [runs[0]!.id, runs[Math.floor(runs.length / 2)]!.id, runs.at(-1)!.id, 'MM3-9999']) {
      expect(findRun(paths, id)).toEqual(linear.find((r) => r.kind === 'run' && r.id === id));
    }
  });

  it('catches up from an existing index after more records are appended by another process, without rescanning what it already had', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'idx-2', runs: 500 });
    const first = withIndex(paths, (h) => ({ upto: h.upto(), runCount: h.runCount() }));
    expect(first.runCount).toBe(nextRunNumber(paths) - 1);
    // "another process": appended directly to log.jsonl, bypassing appendRun/the lock entirely.
    const more = remapIds(generateLedgerRecords({ seed: 'idx-2-more', runs: 50, start: '2026-10-01T00:00:00Z' }), 500);
    appendFileSync(paths.log, toJsonl(more));
    const second = withIndex(paths, (h) => ({ upto: h.upto(), runCount: h.runCount() }));
    expect(second.upto).toBeGreaterThan(first.upto);
    expect(second.runCount).toBe(readLedger(paths).filter((r) => r.kind === 'run').length);
  });

  it('an in-progress tail line (no trailing newline) is not counted yet, and is picked up once it is complete', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'idx-3', runs: 5 });
    const before = nextRunNumber(paths);
    const partial = JSON.stringify({ kind: 'run', v: 2, id: 'MM3-9999' }).slice(0, -1); // truncated, mid-write
    appendFileSync(paths.log, partial); // no trailing \n
    expect(nextRunNumber(paths)).toBe(before); // not counted: might still be writing
    appendFileSync(paths.log, '}\n'); // "finish" it as a line the shape checker will still reject (missing fields) — corruption, not a real run
    expect(() => nextRunNumber(paths)).toThrow(/is not a ledger record/);
  });

  it("a corrupt line fails closed with readLedger's exact wording, at the right line number across two catch-ups", () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'idx-4', runs: 3 });
    nextRunNumber(paths); // caches an index at upto = end of the first 3 (or more, with outcomes) lines
    const before = readLedger(paths).length;
    appendFileSync(paths.log, 'not json at all\n');
    expect(() => nextRunNumber(paths)).toThrow(`✖ ledger: line ${before + 1} of .mm3/log.jsonl is not valid JSON → fix or remove that line`);
  });

  it('a log shorter than the index (replaced or truncated) rebuilds instead of trusting stale offsets', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'idx-6', runs: 400 });
    nextRunNumber(paths);
    writeSyntheticLedger(paths, { seed: 'idx-6b', runs: 10 }); // a much shorter, different ledger at the same path
    expect(nextRunNumber(paths)).toBe(readLedger(paths).filter((r) => r.kind === 'run').length + 1);
  });

  it('[C-120] fix #2: placeCandidates finds a sweep run by its own item unit paths and category tags, on both engines', () => {
    const { paths } = tempProject({});
    const run = sampleContractRun({
      where: [],
      ask: {
        categories: [],
        layers: [{ name: 'file', categories: [{ name: 'injection', section: 'concerns', pass: 'no', need: 'all', tags: ['sql-risk'], questions: [{ n: 1, kind: 'yesno', text: 'q?' }] }] }],
      },
      items: {
        'src/a.ts': { layer: 'file', fill: {}, unit: { path: 'src/a.ts', kind: 'file', name: 'src/a.ts', lines: '1-2' }, status: 'asked', gate: 'fail', categories: { injection: 'fail' } },
      },
      categories: {},
    });
    appendContractRun(paths, run, Date.now(), 'b'); // MM3-0001
    // sweepPlaces itself, off the now-appended (fully-shaped) record: exactly one deduped 'where' and one 'tag'.
    const saved = readLedger(paths).find(isContractRun)!;
    expect(sweepPlaces(saved)).toEqual([
      { kind: 'where', val: 'src/a.ts' },
      { kind: 'tag', val: 'sql-risk' },
    ]);
    for (const forceFallback of [false, true]) {
      __testOnly.forceFallback = forceFallback;
      const byPath = withIndex(paths, (h) => h.placeCandidates('src/a.ts'));
      const byTag = withIndex(paths, (h) => h.placeCandidates('sql-risk'));
      expect(byPath.map((c) => c.id)).toEqual(['MM3-0001']);
      expect(byTag.map((c) => c.id)).toEqual(['MM3-0001']);
    }
  });
});

describe('self-healing: index.db missing, corrupted or stale never changes an answer, only speed', () => {
  it('a missing index.db triggers a silent rebuild, not a failure', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'heal-missing', runs: 300 });
    const want = nextRunNumber(paths); // builds (and, when SQLite is available, persists) index.db
    rmSync(paths.index, { force: true });
    rmSync(`${paths.index}-wal`, { force: true });
    rmSync(`${paths.index}-shm`, { force: true });
    expect(nextRunNumber(paths)).toBe(want);
  });

  it('garbage bytes in index.db (not a database at all) trigger a rebuild', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'heal-garbage', runs: 300 });
    const want = nextRunNumber(paths);
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.index, 'this is not a sqlite database, just garbage bytes');
    expect(nextRunNumber(paths)).toBe(want);
    expect(lookupAnswers(paths, { adapter: 'stub', model: 'stub-1' }, ['nope']).size).toBe(0);
  });

  it('a truncated index.db (a crash mid-write) triggers a rebuild', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'heal-truncated', runs: 300 });
    nextRunNumber(paths);
    if (existsSync(paths.index) && statSync(paths.index).size > 4) {
      truncateSync(paths.index, Math.floor(statSync(paths.index).size / 3));
    }
    const want = readLedger(paths).filter((r) => r.kind === 'run').length + 1;
    expect(nextRunNumber(paths)).toBe(want);
  });

  it('an index.db that is a directory is disposable too: never fatal, just costs a rebuild', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'heal-dir', runs: 50 });
    const want = nextRunNumber(paths);
    rmSync(paths.index, { force: true, recursive: true });
    mkdirSync(paths.index, { recursive: true });
    expect(() => nextRunNumber(paths)).not.toThrow();
    expect(nextRunNumber(paths)).toBe(want);
  });

  it('the ledger replaced with an unrelated, different-size one (fingerprint mismatch) rebuilds, never serves the old data', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'heal-fp-a', runs: 200 });
    nextRunNumber(paths); // index built against the "a" ledger
    const aIds = readLedger(paths).filter((r) => r.kind === 'run').map((r) => r.id);
    writeSyntheticLedger(paths, { seed: 'heal-fp-b', runs: 205 }); // same order of magnitude, different content
    const bRecords = readLedger(paths).filter((r) => r.kind === 'run');
    expect(nextRunNumber(paths)).toBe(bRecords.length + 1);
    // findRun for an id that only ever existed in "a" must not resolve to some stale "b" line at the same offset.
    const staleId = aIds.find((id) => !bRecords.some((r) => r.id === id));
    if (staleId) expect(findRun(paths, staleId)).toBeUndefined();
  });

  it('a log that merely grew (log_size increased, same prefix) catches up — never a full rebuild\'s worth of a behavior change', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'heal-grow', runs: 1000 });
    nextRunNumber(paths);
    const more = remapIds(generateLedgerRecords({ seed: 'heal-grow-more', runs: 5, start: '2026-10-02T00:00:00Z' }), 1000);
    appendFileSync(paths.log, toJsonl(more));
    expect(nextRunNumber(paths)).toBe(readLedger(paths).filter((r) => r.kind === 'run').length + 1);
  });

  it.skipIf(!hasNodeSqlite)('a stale schema_version in an otherwise-healthy index.db triggers a rebuild, not a failure', async () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'heal-schema', runs: 300 });
    const want = nextRunNumber(paths); // builds and persists a real index.db
    const { DatabaseSync } = (await import('node:sqlite')) as unknown as { DatabaseSync: new (p: string) => { exec(sql: string): void; close(): void } };
    const db = new DatabaseSync(paths.index);
    db.exec("UPDATE meta SET value = '999999' WHERE key = 'schema_version'");
    db.close();
    // The stale-schema db must never be trusted as-is (a mismatched schema means the column shapes this code
    // expects may not even be there): nextRunNumber must rebuild it from the log and give the SAME right answer.
    expect(nextRunNumber(paths)).toBe(want);
  });
});

describe('findRun recovers from a stale or bad index without crashing', () => {
  it('readRecordAt returns undefined (never throws) for an offset at or past EOF', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'idx-7', runs: 20 });
    const size = statSync(paths.log).size;
    expect(readRecordAt(paths.log, size)).toBeUndefined(); // exactly at EOF
    expect(readRecordAt(paths.log, size + 10_000)).toBeUndefined(); // well past EOF
    expect(readRecordAt(paths.log, -1)).toBeUndefined();
  });

  it('a log truncated after the index was built does not crash findRun', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'idx-9', runs: 50 });
    const linear = readLedger(paths).filter((r) => r.kind === 'run');
    const lastId = linear.at(-1)!.id;
    nextRunNumber(paths); // caches offsets for every run, including lastId near the end
    const fullText = readFileSync(paths.log, 'utf8');
    writeFileSync(paths.log, fullText.slice(0, Math.floor(fullText.length / 2))); // truncate away the tail
    expect(() => findRun(paths, lastId)).not.toThrow();
    // lastId's line was in the truncated-away tail: genuinely gone now, so undefined, never a crash.
    expect(findRun(paths, lastId)).toBeUndefined();
  });
});

// a record written before mdl v2 may still carry the old `mdl.nodes` (a single chain string)
// instead of `uses` — readRecordAt (report.ts's and view.ts's own per-record reader, and findRun which uses it)
// must read it back as a 1-item `uses` list.
it('readRecordAt reads an old mdl.nodes record as a 1-item uses list', () => {
  const { paths } = tempProject({});
  const withNodes = sampleContractRun({ mdl: { nodes: 'container:web-app' } } as unknown as Parameters<typeof sampleContractRun>[0]);
  const saved = appendContractRun(paths, withNodes, Date.parse('2026-09-25T12:00:00Z'), 'b');
  const run = findRun(paths, saved.id);
  expect(run && isContractRun(run) ? run.mdl : undefined).toEqual({ uses: ['container:web-app'] });
});

describe('the fallback path gives identical results to whatever engine is really available', () => {
  it('lookupAnswers, exactReuse, nextRunNumber and findRun agree with forceFallback on and off [C-089]', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'fallback-parity', runs: 600, outcomeRate: 0.4, badRate: 0.3 });
    const who = { adapter: 'typesafe', model: 'jev-1.13.0' };
    const records = readLedger(paths).filter(isContractRun);
    const keys = [...new Set(records.flatMap((r) => Object.values(r.keys)))].slice(0, 5);
    const ids = readLedger(paths)
      .filter((r) => r.kind === 'run')
      .map((r) => r.id);

    __testOnly.forceFallback = false;
    const a = {
      count: nextRunNumber(paths),
      found: ids.map((id) => findRun(paths, id)),
      reuse: Object.fromEntries(lookupAnswers(paths, who, keys)),
      exact: exactReuse(paths, who, keys),
    };

    __testOnly.forceFallback = true;
    const b = {
      count: nextRunNumber(paths),
      found: ids.map((id) => findRun(paths, id)),
      reuse: Object.fromEntries(lookupAnswers(paths, who, keys)),
      exact: exactReuse(paths, who, keys),
    };

    expect(b).toEqual(a);
  });

  it('familyCounts (family/section per category, indexed) agrees between the two engines', () => {
    const { paths } = tempProject({});
    appendContractRun(
      paths,
      sampleContractRun({
        ask: {
          categories: [
            { name: 'injection', section: 'concerns', family: 'injection', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'q1?' }] },
            { name: 'access', section: 'concerns', family: 'access', pass: 'no', need: 'all', tags: [], questions: [{ n: 2, kind: 'yesno', text: 'q2?' }] },
          ],
          layers: [],
        },
        categories: { injection: 'fail', access: 'pass' },
      }),
      Date.now(),
      'b',
    ); // MM3-0001: two categories, two families
    appendContractRun(
      paths,
      sampleContractRun({
        ask: { categories: [{ name: 'sql', section: 'concerns', family: 'injection', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'q?' }] }], layers: [] },
        categories: { sql: 'unsure' },
      }),
      Date.now(),
      'b',
    ); // MM3-0002: a second run in the SAME family as MM3-0001's "injection" — proves aggregation across runs

    for (const forceFallback of [false, true]) {
      __testOnly.forceFallback = forceFallback;
      expect(withIndex(paths, (h) => h.familyCounts())).toEqual([
        { family: 'injection', categories: 2, runs: 2, pass: 0, fail: 1, unsure: 1 },
        { family: 'access', categories: 1, runs: 1, pass: 1, fail: 0, unsure: 0 },
      ]);
    }
  });
});

describe('node:sqlite genuinely unavailable never silently falls back in production (owner ruling) [C-107]', () => {
  it('withIndex throws a LedgerError naming the Node requirement, instead of quietly using the linear scan', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'sqlite-missing', runs: 5 });
    __testOnly.forceSqliteMissing = true;
    expect(() => withIndex(paths, (h) => h.runCount())).toThrow(/node:sqlite is unavailable/);
    expect(() => withIndex(paths, (h) => h.runCount())).toThrow(/Node 22\.13/);
  });

  it('forceFallback (the test-only equivalence path) still answers normally — only genuinely-missing sqlite throws', () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'sqlite-missing-2', runs: 5 });
    __testOnly.forceFallback = true;
    expect(() => withIndex(paths, (h) => h.runCount())).not.toThrow();
    expect(withIndex(paths, (h) => h.runCount())).toBe(5);
  });
});

describe('a query that throws mid-fn falls back cleanly, with no leaked partial state', () => {
  it.skipIf(!hasNodeSqlite)('lookupAnswers gives the identical result whether or not candidates() throws partway through', () => {
    const { paths } = tempProject({});
    // outcomeRate 0.5 / badRate 1: roughly half the keys' current holders are blocked (falling to the
    // candidates() walk, where the injected fault lands) and roughly half are not (resolved by the fast path
    // first, so `out` already has entries by the time the walk — and the fault — would run).
    writeSyntheticLedger(paths, {
      seed: 'fault-inject',
      runs: 150,
      outcomeRate: 0.5,
      badRate: 1,
      providers: [{ adapter: 'typesafe', model: 'jev-1.13.0', weight: 1 }],
    });
    nextRunNumber(paths); // build and persist a real index.db so candidates() below runs against real SQLite
    const who = { adapter: 'typesafe', model: 'jev-1.13.0' };
    const records = readLedger(paths).filter(isContractRun);
    const allKeys = [...new Set(records.flatMap((r) => Object.values(r.keys)))].slice(0, 8);

    const clean = lookupAnswers(paths, who, allKeys);

    __testOnly.throwOnCandidates = true;
    const withFault = lookupAnswers(paths, who, allKeys);
    // The fault must have actually fired (proving this test exercises the walk, not just the fast path) and
    // then cleared itself (consumed exactly once, by the failed SQL attempt — never re-thrown by the retry).
    expect(__testOnly.throwOnCandidates).toBe(false);
    expect(Object.fromEntries(withFault)).toEqual(Object.fromEntries(clean));
  });
});

describe('dry runs and free reads create nothing on disk when there is no ledger yet', () => {
  it('withIndex over a missing log never creates .mm3/, with or without the fallback forced', () => {
    for (const forceFallback of [false, true]) {
      __testOnly.forceFallback = forceFallback;
      const { root, paths } = tempProject({});
      expect(existsSync(paths.dir)).toBe(false);
      expect(withIndex(paths, (h) => h.runCount())).toBe(0);
      expect(withIndex(paths, (h) => h.findOffset('MM3-0001'))).toBeUndefined();
      expect(lookupAnswers(paths, { adapter: 'a', model: 'm' }, ['k']).size).toBe(0);
      expect(exactReuse(paths, { adapter: 'a', model: 'm' }, ['k'])).toBeUndefined();
      expect(existsSync(paths.dir)).toBe(false);
      rmSync(root, { recursive: true, force: true });
    }
    __testOnly.forceFallback = false;
  });

  it('once the log exists, the index may persist — but an empty log (file present, zero bytes) still creates nothing', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.log, '');
    expect(withIndex(paths, (h) => h.runCount())).toBe(0);
    expect(existsSync(paths.index)).toBe(false);
  });
});

describe('isSqliteExperimentalWarning: silences only node:sqlite\'s own ExperimentalWarning', () => {
  it('matches the real message, case-insensitively, and nothing else', () => {
    expect(isSqliteExperimentalWarning({ name: 'ExperimentalWarning', message: 'SQLite is an experimental feature and might change at any time' })).toBe(true);
    expect(isSqliteExperimentalWarning({ name: 'ExperimentalWarning', message: 'sqlite is EXPERIMENTAL' })).toBe(true);
    expect(isSqliteExperimentalWarning({ name: 'ExperimentalWarning', message: 'fetch is an experimental feature' })).toBe(false);
    expect(isSqliteExperimentalWarning({ name: 'DeprecationWarning', message: 'SQLite something' })).toBe(false);
    expect(isSqliteExperimentalWarning({})).toBe(false);
  });
});

describe('generateLedgerRecords', () => {
  it('is deterministic (same seed, same records) and produces ids readLedger accepts', () => {
    const a = generateLedgerRecords({ seed: 'gen-1', runs: 200 });
    const b = generateLedgerRecords({ seed: 'gen-1', runs: 200 });
    expect(a).toEqual(b);
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'gen-1', runs: 200 });
    expect(() => readLedger(paths)).not.toThrow();
    const runs = readLedger(paths).filter(isRun);
    const contract = readLedger(paths).filter(isContractRun);
    expect(runs.length + contract.length).toBeGreaterThan(0);
    expect(new Set([...runs, ...contract].map((r) => r.id)).size).toBe(runs.length + contract.length); // ids unique, no gaps checked by nextRunNumber tests above
  });
});

describe('an append keeps a current index current (no read-only reader falls back to a full scan)', () => {
  it.skipIf(!hasNodeSqlite)('appending one lookup catches index.db up in place: same file (no rebuild), upto == log size, read-only reads stay indexed', async () => {
    const { paths } = tempProject({});
    writeSyntheticLedger(paths, { seed: 'append-fresh', runs: 60 });
    withIndex(paths, (h) => h.runCount()); // writer path builds index.db
    const inoBefore = statSync(paths.index).ino;
    const { DatabaseSync } = await import('node:sqlite');
    const upto = (): number => {
      const db = new DatabaseSync(paths.index, { readOnly: true });
      try {
        return Number((db.prepare("SELECT value FROM meta WHERE key = 'upto'").get() as { value: string }).value);
      } finally {
        db.close();
      }
    };
    expect(upto()).toBe(statSync(paths.log).size);

    appendLookup(paths, { goal: 'src/user.ts', where: ['src/user.ts'], hit: false, reused: null });

    expect(statSync(paths.index).ino).toBe(inoBefore); // caught up in place, not rebuilt
    expect(upto()).toBe(statSync(paths.log).size); // so a readOnly reader sees it fresh and queries SQLite
    expect(withIndex(paths, (h) => h.findOffset('MM3-0001'), { readOnly: true })).toBeGreaterThanOrEqual(0);
    expect(statSync(paths.index).ino).toBe(inoBefore);
  });
});

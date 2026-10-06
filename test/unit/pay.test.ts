// The paid path, with a fault injected at every stage. After every case the budget and the ledger agree:
// budget runs == contract runs that made a call + failed records.
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBudget } from '../../src/budget/budget.ts';
import { writeConfigOverride } from '../../src/config/write.ts';
import { createChaosAdapter, type ChaosStep } from '../../src/classifier/chaos.ts';
import type { ClassifierPort, ClassifierResult } from '../../src/classifier/port.ts';
import { goalQuestion, type AskedQuestion } from '../../src/contract/translate.ts';
import { isContractRun, readLedger } from '../../src/ledger/log.ts';
import type { Mm3Paths } from '../../src/ledger/paths.ts';
import { askAll, oneLine, preflight, record, recordFree, type PlannedCall } from '../../src/verbs/pay.ts';
import type { VerbContext } from '../../src/verbs/types.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun } from '../helpers/runs.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const env = { MM3_ACTOR: 'reviewer-7' };
const Q: AskedQuestion[] = [goalQuestion('It is safe'), { id: '1', n: 1, kind: 'yesno', text: 'Is it wrong?' }, { id: '2', n: 2, kind: 'scale', text: 'How bad?', levels: ['low', 'high'] }];
const call = (questions = Q): PlannedCall => ({ state: { goal: 'It is safe' }, questions });
const ctxOf = (paths: Mm3Paths, provider: ClassifierPort): VerbContext => ({ paths, provider, env });

function expectAgree(paths: Mm3Paths): void {
  const records = readLedger(paths);
  const counted = records.filter((r) => (isContractRun(r) && r.calls > 0) || r.kind === 'failed').length;
  expect(loadBudget(paths).state.runs).toBe(counted);
}

/** A port that returns whatever it is handed (junk on purpose), once per call. */
const scripted = (...results: unknown[]): ClassifierPort & { calls: number } => {
  const port = { adapter: 'stub', model: 'stub-1', calls: 0, ask: async () => results[port.calls++] as ClassifierResult };
  return port;
};

describe('preflight: stops before any call or spend', () => {
  // a brand-new project (no legacy budget.json, no config.yaml) just runs on silent defaults now —
  // `created` is true only when a legacy budget.json is found and migrated into config.yaml (see budget.test.ts).
  it('ok, and reports no legacy migration when there is nothing to migrate', () => {
    const { paths } = tempProject({});
    const r = preflight(ctxOf(paths, stubProvider()));
    expect(r.ok && r.value.created).toBe(false);
  });

  it('the cap reached: exit 3', () => {
    const { paths } = tempProject({});
    writeConfigOverride(paths, { budget: { runs: 1 } });
    recordCall1(paths);
    const r = preflight(ctxOf(paths, stubProvider()));
    // fix #5c: the run cap alone tripped, so the hint names budget.runs only (see budget.test.ts).
    expect(!r.ok && r.result).toEqual({
      exit: 3,
      text: '✖ budget: cap reached ($0.00 of $5.00 · 1 of 1 runs) → ask the owner to raise budget.runs in .mm3/config.yaml, then run mm3 config --load\n→ see: mm3 agent budget',
    });
  });

  it('needsBudget: false (fix #5a) [C-136] skips the cap even when it is already reached — a fully-reused run is free', () => {
    const { paths } = tempProject({});
    writeConfigOverride(paths, { budget: { runs: 1 } });
    recordCall1(paths);
    const r = preflight(ctxOf(paths, stubProvider()), { needsBudget: false });
    expect(r.ok).toBe(true);
  });

  it('needsBudget: false still fails closed on a ledger that cannot be written', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.log, { recursive: true }); // a directory where the log file should be: unwritable
    const r = preflight(ctxOf(paths, stubProvider()), { needsBudget: false });
    expect(r).toMatchObject({ ok: false, result: { exit: 1 } });
  });

  // budget.json is no longer the live authority (config.yaml is) — it's read at most once, purely
  // to migrate its caps, and any problem reading it (missing, corrupt, wrong shape) is simply "nothing to
  // migrate," never a fail-closed stop, since a stale legacy file must never block a real run.
  it('a corrupt legacy budget.json is silently ignored; a corrupt ledger or an unwritable one still fails closed at exit 1', () => {
    const a = tempProject({}).paths;
    mkdirSync(a.dir, { recursive: true });
    writeFileSync(a.budget, '{"capUsd": 5, "runs": ');
    expect(preflight(ctxOf(a, stubProvider()))).toMatchObject({ ok: true });
    const b = tempProject({}).paths;
    mkdirSync(b.dir, { recursive: true });
    writeFileSync(b.log, 'garbage\n');
    expect(preflight(ctxOf(b, stubProvider()))).toEqual({ ok: false, result: { exit: 1, text: '✖ ledger: line 1 of .mm3/log.jsonl is not valid JSON → fix or remove that line' } });
    const c = tempProject({}).paths;
    mkdirSync(c.log, { recursive: true });
    expect(preflight(ctxOf(c, stubProvider()))).toMatchObject({ ok: false, result: { exit: 1 } });
  });
});

function recordCall1(paths: Mm3Paths): void {
  const r = record(ctxOf(paths, stubProvider()), 0, sampleContractRun());
  if (!r.ok) throw new Error(r.result.text);
}

describe('askAll: provider faults', () => {
  it.each<[ChaosStep, string]>([
    ['503', '✖ classifier: HTTP 503: service unavailable → retry later, or set MM3_PROVIDER=fake to check the request'],
    ['429', '✖ classifier: HTTP 429: rate limited → retry later, or set MM3_PROVIDER=fake to check the request'],
    ['401', '✖ classifier: HTTP 401: invalid API key → retry later, or set MM3_PROVIDER=fake to check the request'],
    ['timeout', '✖ classifier: request timed out after 20000ms → retry later, or set MM3_PROVIDER=fake to check the request'],
  ])('%s on the first call: exit 1, nothing logged, NOT counted', async (step, text) => {
    const { paths } = tempProject({});
    const r = await askAll(ctxOf(paths, createChaosAdapter([step])), 'class', [call()]);
    expect(r).toEqual({ ok: false, result: { exit: 1, text } });
    expect(readLedger(paths)).toEqual([]);
    expect(loadBudget(paths).state.runs).toBe(0);
  });

  it.each<[string, unknown, RegExp]>([
    ['no result', null, /^the provider returned no answers$/],
    ['text', 'garbage', /^the provider returned no answers$/],
    ['answers: []', { answers: [] }, /^the provider returned no answers$/],
    ['a missing answer', { answers: {}, costUsd: 0 }, /^no yes\/no answer for the goal$/],
    ['p out of range', { answers: { goal: { type: 'noul', probability: 1.5 } }, costUsd: 0 }, /^the goal probability 1\.5 is not between 0 and 1$/],
  ])('junk (%s): exit 1, counted, logged as a failed record', async (_name, junk, reason) => {
    const { paths } = tempProject({});
    const r = await askAll(ctxOf(paths, scripted(junk)), 'class', [call()]);
    expect(!r.ok && r.result.exit).toBe(1);
    expect(!r.ok && r.result.text).toMatch(/^✖ classifier: .+ → retry; the call was counted against the budget$/);
    const [failed] = readLedger(paths);
    expect(failed).toMatchObject({ kind: 'failed', verb: 'class', actor: 'reviewer-7', adapter: 'stub' });
    expect((failed as { reason: string }).reason).toMatch(reason);
    expectAgree(paths);
  });

  it('chaos malformed and missing answers are caught the same way', async () => {
    for (const step of ['malformed', 'missing'] as ChaosStep[]) {
      const { paths } = tempProject({});
      const r = await askAll(ctxOf(paths, createChaosAdapter([step])), 'class', [call()]);
      expect(!r.ok && r.result.exit).toBe(1);
      expect(readLedger(paths)[0]).toMatchObject({ kind: 'failed', adapter: 'chaos' });
      expectAgree(paths);
    }
  });

  it('a scale answer with a bad distribution is junk too', async () => {
    const { paths } = tempProject({});
    const answers = { goal: { type: 'noul', probability: 0.5 }, 1: { type: 'noul', probability: 0.5 }, 2: { type: 'score', score: 0, distribution: [Number.NaN, 1], confidence: 1 } };
    const r = await askAll(ctxOf(paths, scripted({ answers, costUsd: 0 })), 'class', [call()]);
    expect(!r.ok && r.result.text).toBe('✖ classifier: question 2 has a probability NaN that is not between 0 and 1 → retry; the call was counted against the budget');
  });

  it('call 2 of 2 fails after call 1 was paid: counted, with call 1\'s cost', async () => {
    const { paths } = tempProject({});
    const first = await stubProvider({ yes: () => 0.9, costUsd: 0.01 }).ask(Q.map((q) => ({ type: q.kind === 'scale' ? 'score' : 'noul', id: q.id, ask: q.text, levels: q.levels ?? [] }) as never), {});
    const port: ClassifierPort = { adapter: 'stub', model: 'stub-1', ask: async (qs) => (qs[0]!.id === 'goal' ? first : Promise.reject(new Error('boom'))) };
    const r = await askAll(ctxOf(paths, port), 'loop', [call(), call([{ id: 'x#1', n: 1, kind: 'yesno', text: 'Is x ok?', item: 'x' }])]);
    expect(r).toEqual({ ok: false, result: { exit: 1, text: '✖ classifier: call 2 of 2: boom → retry; the call was counted against the budget' } });
    expect(readLedger(paths)[0]).toMatchObject({ kind: 'failed', verb: 'loop', costUsd: 0.01 });
    expect(loadBudget(paths).state).toMatchObject({ runs: 1, spentUsd: 0.01 });
  });

  it('answers from every call are merged; costs add up, and any unreported cost makes the total unknown', async () => {
    const { paths } = tempProject({});
    const ok = await askAll(ctxOf(paths, stubProvider({ yes: () => 0.9, costUsd: 0.01 })), 'loop', [call(), call([{ id: 'x#1', n: 1, kind: 'yesno', text: 'Is x ok?', item: 'x' }])]);
    expect(ok.ok && Object.keys(ok.value.answers).sort()).toEqual(['1', '2', 'goal', 'x#1']);
    expect(ok.ok && ok.value.costUsd).toBeCloseTo(0.02, 10);
    const unknown = await askAll(ctxOf(paths, stubProvider({ costUsd: undefined })), 'class', [call()]);
    expect(unknown.ok && unknown.value.costUsd).toBeUndefined();
    expect(ok.ok && ok.value.answers['2']).toEqual({ kind: 'scale', dist: { low: 0.9, high: 0.1 } });
    expect(ok.ok && ok.value.costEstimated).toBe(false);
  });

  it('costEstimated (fix #4) is true when ANY summed call\'s cost was an estimate, not the provider\'s own figure', async () => {
    const { paths } = tempProject({});
    const answers: ClassifierResult['answers'] = {
      goal: { type: 'noul', probability: 0.9 },
      '1': { type: 'noul', probability: 0.9 },
      '2': { type: 'score', score: 0, distribution: [0.9, 0.1], confidence: 0.9 },
    };
    const results: ClassifierResult[] = [
      { answers, costUsd: 0.01, costEstimated: false },
      { answers, costUsd: 0.02, costEstimated: true },
    ];
    const port: ClassifierPort = { adapter: 'stub', model: 'stub-1', ask: async () => results.shift()! };
    const r = await askAll(ctxOf(paths, port), 'class', [call(), call()]);
    expect(r.ok && r.value.costUsd).toBeCloseTo(0.03, 10);
    expect(r.ok && r.value.costEstimated).toBe(true);
  });
});

describe('oneLine: redacts secret-shaped text before it ever becomes VerbResult text (P6)', () => {
  it('strips an API key and a bearer token from a provider error message', () => {
    const key = 'sk-' + 'A'.repeat(24);
    const bearer = `${'Bearer'} ${'B'.repeat(24)}`;
    const line = oneLine(new Error(`upstream said: key ${key} rejected, header ${bearer} invalid`));
    expect(line).not.toContain(key);
    expect(line).not.toContain('B'.repeat(24));
    expect(line).toContain('[redacted]');
  });

  it('the first-call-failure branch never leaks a secret in its VerbResult.text', async () => {
    const { paths } = tempProject({});
    const key = 'sk-' + 'A'.repeat(24);
    const port: ClassifierPort = { adapter: 'stub', model: 'stub-1', ask: async () => { throw new Error(`auth failed: ${key}`); } };
    const r = await askAll(ctxOf(paths, port), 'class', [call()]);
    expect(!r.ok && r.result.exit).toBe(1);
    expect(!r.ok && r.result.text).not.toContain(key);
    expect(!r.ok && r.result.text).toContain('[redacted]');
  });

  it('a failed record\'s reason (paid, logged) is also redacted in the returned text', async () => {
    const { paths } = tempProject({});
    const key = 'sk-' + 'A'.repeat(24);
    const first = await stubProvider({ yes: () => 0.9, costUsd: 0.01 }).ask(Q.map((q) => ({ type: q.kind === 'scale' ? 'score' : 'noul', id: q.id, ask: q.text, levels: q.levels ?? [] }) as never), {});
    const port: ClassifierPort = { adapter: 'stub', model: 'stub-1', ask: async (qs) => (qs[0]!.id === 'goal' ? first : Promise.reject(new Error(`boom: ${key}`))) };
    const r = await askAll(ctxOf(paths, port), 'loop', [call(), call([{ id: 'x#1', n: 1, kind: 'yesno', text: 'Is x ok?', item: 'x' }])]);
    expect(!r.ok && r.result.text).not.toContain(key);
    expect(!r.ok && r.result.text).toContain('[redacted]');
  });
});

describe('record: the spend and the run in one lock section', () => {
  it('a held lock when recording: exit 1, NOT counted, nothing logged', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.lock, `${process.pid}\n`);
    const r = record(ctxOf(paths, stubProvider()), 0, sampleContractRun());
    expect(r).toEqual({ ok: false, result: { exit: 1, text: '✖ lock: .mm3/lock is locked → wait for the other run, or delete the lock file if no run is active (the call was NOT counted against the budget)' } });
    rmSync(paths.lock);
    expect(loadBudget(paths).state.runs).toBe(0);
    expect(readLedger(paths)).toEqual([]);
  }, 15_000);

  it('a ledger corrupted during the call: nothing to roll back (spend is ledger-derived), exit 1, NOT counted', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    appendFileSync(paths.log, 'garbage\n');
    const r = record(ctxOf(paths, stubProvider()), 0.02, sampleContractRun());
    expect(!r.ok && r.result.text).toBe('✖ ledger: line 1 of .mm3/log.jsonl is not valid JSON → fix or remove that line (the call was NOT counted against the budget)');
    // budget state is derived from the ledger itself, so a corrupted ledger can no longer answer
    // "what's the current spend/run count" at all — loadBudget correctly fails closed here too, same as every
    // other ledger read on corrupt log.jsonl; there is no separate budget.json counter left to check instead.
    expect(() => loadBudget(paths)).toThrow(/not valid JSON/);
  });

  it('recordFree logs a run that made no call, without spending', () => {
    const { paths } = tempProject({});
    const r = recordFree(ctxOf(paths, stubProvider()), sampleContractRun({ calls: 0 }));
    expect(r.ok && r.value.run.id).toBe('MM3-0001');
    expect(loadBudget(paths).state.runs).toBe(0);
    expectAgree(paths);
  });
});

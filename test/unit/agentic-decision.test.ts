// The decision a release report ends with [C-264]: SHIP, SHIP WITH EXCEPTIONS or DO NOT SHIP, from one recorded run, with the
// reasons in plain words and a targeted fix for each problem. Only the gate model's misses block; a smaller model's misses and
// exception-level criteria are recorded as improvements and never block. Recovery after a stop is measured from the calls.
import { describe, expect, it } from 'vitest';
import type { ClaudeCall, ClaudeRun } from '../../scripts/agentic/claude.ts';
import { noUsage } from '../../scripts/agentic/claude.ts';
import { decide } from '../../scripts/agentic/decision.ts';
import { definitionOf, type FinishedRecord, type StartedRecord } from '../../scripts/agentic/ledger.ts';
import { grade, type FullScenario } from '../../scripts/agentic/run.ts';
import { recoveryOf } from '../../scripts/agentic/trace.ts';

const RULES = { gateModel: 'sonnet', floorModel: 'haiku', mustPassTrials: 2, trialsPerScenario: 3, firstAttemptTarget: 0.8 };
const spec = { full: [{ id: 'S1', title: 'Ask a plain question', goal: 'g', prompt: 'p', model: 'sonnet', routes: ['mcp'], promise: 3, checkpoints: ['engaged', 'stays-on-mm3'] }], rules: RULES };
const started = (o: Partial<StartedRecord> = {}): StartedRecord => ({ kind: 'ceremony', phase: 'started', schema: 2, id: 'CER-0009', ts: '2026-10-06T09:00:00.000Z', version: 'v', versionCommit: 'abc', head: 'abc', dirty: false, fingerprint: 'f', definition: definitionOf(spec, { tag: 't', sha: 's' }), mode: 'free', trialsOverride: null, formal: true, formalReason: 'ok', ...o });
const row = (o: Partial<NonNullable<FinishedRecord['level3']>[number]> = {}): NonNullable<FinishedRecord['level3']>[number] => ({ id: 'S1', route: 'mcp', model: 'sonnet', trial: 1, pass: true, failed: [], attempts: [1], firstRequestAccepted: true, mm3Calls: 1, transcript: 't', ...o });
const end = (rows: ReturnType<typeof row>[], o: Partial<FinishedRecord> = {}): FinishedRecord => ({ kind: 'ceremony', phase: 'finished', startedId: 'CER-0009', ts: 't', passed: true, level1: [{ name: 'tests', ok: true, detail: '' }], level3: rows, firstRequestAcceptedRate: 1, ...o });
const ok = { chainOk: true, gaps: [] as string[] };

const mm3 = (args: string[], result: string, parent: string | null = null): ClaudeCall => ({ tool: 'mcp__plugin_mm3_mm3__mm3', input: { args }, parent, id: `${Math.random()}`, result });
const STOP = '✖ mak.ask.decisions: 0 categories → give 2–5';
const OK = 'mak:\n  id: MM3-0001\n  gate: fail';
const read = (): ClaudeCall => ({ tool: 'Read', input: { file_path: 'a.ts' }, parent: null, id: 'r', result: 'code' });

describe('recovery after a stop [C-264]', () => {
  it('[C-264] a stop followed by MM3 is on track; one followed by a file read, or by nothing, is not', () => {
    expect(recoveryOf([mm3(['class', '-'], STOP), mm3(['template', 'class'], 'skeleton'), mm3(['class', '-'], OK)])).toEqual({ stops: 1, onTrack: 1, fixedNext: 1 });
    expect(recoveryOf([mm3(['class', '-'], STOP), read(), mm3(['class', '-'], OK)])).toEqual({ stops: 1, onTrack: 0, fixedNext: 1 });
    expect(recoveryOf([mm3(['class', '-'], STOP)])).toEqual({ stops: 1, onTrack: 0, fixedNext: 0 }); // the agent's work ended on the stop
  });
  it('[C-264] agents are judged separately: a helper\'s stop is not rescued by the lead\'s next call', () => {
    const r = recoveryOf([mm3(['class', '-'], STOP, 'h1'), mm3(['agent'], 'card', null), mm3(['class', '-'], OK, 'h1')]);
    expect(r).toEqual({ stops: 1, onTrack: 1, fixedNext: 1 });
    expect(recoveryOf([mm3(['class', '-'], STOP, 'h1'), mm3(['agent'], 'card', null)]).onTrack).toBe(0);
  });
  it('[C-264] the stays-on-mm3 criterion is exception-level: the trial still passes, the miss is recorded', () => {
    const s = { id: 'S1', goal: 'g', prompt: 'p', model: 'sonnet' as const, routes: ['mcp' as const], promise: 3, checkpoints: ['engaged', 'stays-on-mm3'] } satisfies FullScenario;
    const run: ClaudeRun = { calls: [mm3(['class', '-'], STOP), read(), mm3(['class', '-'], OK)], answer: 'MM3-0001', usage: noUsage(), turns: [], model: null, plugins: [], mcp: [], ok: true };
    const g = grade(s, run, '/nonexistent', 'mcp', 'sonnet', 1);
    expect(g.pass).toBe(true);
    expect(g.checks.find((c) => c.id === 'stays-on-mm3')?.pass).toBe(false);
    expect(g.recovery).toEqual({ stops: 1, onTrack: 0, fixedNext: 1 });
  });
});

describe('the decision [C-264]', () => {
  it('[C-264] everything met, first requests accepted, every stop followed by MM3: SHIP', () => {
    const d = decide(started(), end([row({ recovery: { stops: 2, onTrack: 2, fixedNext: 2 } })]), ok);
    expect(d.verdict).toBe('SHIP');
    expect(d.exceptions).toEqual([]);
    expect(d.headline).toBe('SHIP');
  });
  it('[C-264] a first-request rate below the target is accepted as an exception, with its targeted fix: SHIP WITH EXCEPTIONS', () => {
    const d = decide(started(), end([row()], { firstRequestAcceptedRate: 0.25 }), ok);
    expect(d.verdict).toBe('SHIP WITH EXCEPTIONS');
    expect(d.exceptions[0]).toMatchObject({ id: 'first-request-rate' });
    expect(d.exceptions[0]!.fix).toContain('mm3 template <verb>');
  });
  it('[C-264] leaving MM3 after a stop is an exception, not a blocker, and shows the numbers', () => {
    const d = decide(started(), end([row({ recovery: { stops: 4, onTrack: 3, fixedNext: 2 }, failed: ['stays-on-mm3'] })]), ok);
    expect(d.verdict).toBe('SHIP WITH EXCEPTIONS');
    expect(d.blockers).toEqual([]);
    expect(d.exceptions.map((e) => e.id)).toEqual(['stays-on-mm3']);
    expect(d.exceptions[0]!.saw).toBe('after 4 stop(s) sonnet stayed on MM3 3 time(s) and its next MM3 request fixed it 2 time(s)');
  });
  it('[C-264] the gate model missing a blocking criterion is DO NOT SHIP, naming the criterion and the job in words', () => {
    const d = decide(started(), end([row({ pass: false, failed: ['engaged'] })]), ok);
    expect(d.verdict).toBe('DO NOT SHIP');
    expect(d.blockers).toEqual(['sonnet missed "engaged" in: Ask a plain question']);
    expect(d.improvements[0]).toMatchObject({ id: 'engaged', models: ['sonnet'], themes: ['guidance-start-here'] }); // tagged so it groups with others
  });
  it('[C-264] a smaller model\'s misses never block: they are recorded as improvements and a lower-tier pattern', () => {
    const d = decide(started(), end([row(), row({ model: 'haiku', pass: false, failed: ['engaged'] })]), ok);
    expect(d.verdict).toBe('SHIP');
    expect(d.improvements.map((i) => i.id)).toEqual(['engaged', 'lower-tier-models']);
  });
  it('[C-264] a failed free check, an incomplete record or a broken chain each block', () => {
    expect(decide(started(), end([row()], { level1: [{ name: 'plugin bundle', ok: false, detail: 'stale' }] }), ok).blockers).toEqual(['a free check failed: plugin bundle']);
    expect(decide(started(), end([row()]), { chainOk: true, gaps: ['tokens'] }).verdict).toBe('DO NOT SHIP');
    expect(decide(started(), end([row()]), { chainOk: false, gaps: [] }).blockers).toEqual(['the ledger chain is broken']);
  });
  it('[C-264] a rehearsal says so: the verdict is for the record only and a formal run has to confirm it', () => {
    const d = decide(started({ formal: false }), end([row()]), ok);
    expect(d.headline).toBe('REHEARSAL, for the record only: this would be SHIP; a formal run on the published commit has to confirm it');
  });
});

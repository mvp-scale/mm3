// Carrying jobs forward in the agentic ceremony [C-267]: a run may copy a job's passing rows from an earlier formal run only when
// nothing an agent runs or reads changed; every refusal is one line saying what to change. A carried run reads like any other
// to the release gate and the report. No network, no claude calls.
import { describe, expect, it } from 'vitest';
import { agenticProblem } from '../../scripts/check-agentic.ts';
import { carriedJobs, carryProblem, type CarryInput } from '../../scripts/agentic/carry.ts';
import { definitionOf, lastFormal, recordGaps, type FinishedRecord, type Spec, type StartedRecord } from '../../scripts/agentic/ledger.ts';
import { tellRun } from '../../scripts/agentic/release-report.ts';

const RULES = { gateModel: 'sonnet', floorModel: 'haiku', mustPassTrials: 2, trialsPerScenario: 3, firstAttemptTarget: 0.8 };
const FIX = { tag: 'v1.0.0', sha: 'a'.repeat(40) };
const job = (id: string, prompt = 'Is it safe?'): Spec['full'][number] => ({ id, goal: 'goal', prompt, model: 'sonnet', routes: ['mcp'], promise: 3, checkpoints: ['engaged', 'answer-cites-run-id'] });
const spec = (o: { b?: string } = {}): Spec => ({ full: [job('A'), job('B', o.b), job('C')], rules: RULES });
const USAGE = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 1, cacheCreationTokens: 1, turns: 1 };
const ECO = { mm3: { calls: 1, argsTokens: 1, resultTokens: 1 }, bash: { calls: 0, argsTokens: 0, resultTokens: 0 }, files: { calls: 0, argsTokens: 0, resultTokens: 0 }, agent: { calls: 0, argsTokens: 0, resultTokens: 0 }, other: { calls: 0, argsTokens: 0, resultTokens: 0 } };
const row = (id: string, o: object = {}): NonNullable<FinishedRecord['level3']>[number] => ({ id, route: 'mcp', model: 'sonnet', resolvedModel: 'claude-sonnet-x', trial: 1, pass: true, failed: [], attempts: [1], firstRequestAccepted: true, mm3Calls: 1, usage: USAGE, economics: ECO, transcript: 't.json', transcriptSha256: 'ab', ...o });
const rows = (id: string, o: object = {}): ReturnType<typeof row>[] => [1, 2, 3].map((trial) => row(id, { trial, ...o }));
const srcStarted = (o: Partial<StartedRecord> = {}): StartedRecord => ({ kind: 'ceremony', phase: 'started', schema: 2, guidance: { surfaces: 58, snapshot: 's' }, environment: { node: 'v22', vitest: '5', claude: '2.1', os: 'Linux' }, artifact: { npmIntegrity: 'sha512-x', npmShasum: 'abc', pluginCommit: 'abc1234' }, id: 'CER-0001', ts: '2026-10-05T10:00:00.000Z', version: '0.1.2-nightly.one', versionCommit: 'abc1234', head: 'abc1234', dirty: false, fingerprint: 'f'.repeat(64), definition: definitionOf(spec(), FIX), mode: 'free', trialsOverride: null, formal: true, formalReason: 'ok', ...o });
const srcFinished = (o: Partial<FinishedRecord> = {}): FinishedRecord => ({ kind: 'ceremony', phase: 'finished', schema: 2, startedId: 'CER-0001', ts: '2026-10-05T10:30:00.000Z', passed: false, level1: [{ name: 'x', ok: true, detail: 'ok' }], level2: [{ id: 'a', level: 'none', pass: true }], level3: [...rows('A'), ...rows('B', { pass: false, failed: ['engaged'] }), ...rows('C')], usage: { ...USAGE, claudeRuns: 1, mm3Calls: 1 }, firstRequestAcceptedRate: 1, ...o });
const input = (o: Partial<CarryInput> = {}): CarryInput => ({ id: 'CER-0001', source: { started: srcStarted(), finished: srcFinished() }, only: ['B'], fingerprint: 'f'.repeat(64), definition: definitionOf(spec(), FIX), changed: ['scripts/ceremony.ts', 'test/unit/x.test.ts', 'docs/contract.md', '.github/workflows/ci.yml', 'CHANGELOG.md', 'BACKLOG.md', 'AGENTS.md'], ...o });

describe('agentic carry [C-267]', () => {
  it('[C-267] a carry is allowed when the source passed those jobs, nothing an agent reads changed and only harness, docs and tests moved', () => {
    expect(carryProblem(input())).toBeUndefined();
    expect(carriedJobs(definitionOf(spec(), FIX), ['B'])).toEqual(['A', 'C']);
  });
  it('[C-267] a carry is refused, in one line saying what to change, when the source is missing, unfinished, not formal or disqualified', () => {
    expect(carryProblem(input({ source: undefined }))).toMatch(/^✖ carry: no run CER-0001 in the ledger → /u);
    expect(carryProblem(input({ source: { started: srcStarted(), finished: undefined } }))).toMatch(/^✖ carry: CER-0001 never finished → /u);
    expect(carryProblem(input({ source: { started: srcStarted(), finished: srcFinished({ phase: 'aborted' }) } }))).toMatch(/never finished/u);
    expect(carryProblem(input({ source: { started: srcStarted({ formal: false, formalReason: 'uncommitted changes' }), finished: srcFinished() } }))).toMatch(/not a formal ceremony run \(uncommitted changes\) → /u);
    expect(carryProblem(input({ invalid: 'wrong provider' }))).toMatch(/disqualified \(wrong provider\) → /u);
  });
  it('[C-267] a job that did not pass in the source cannot be carried; it has to be in --only', () => {
    expect(carryProblem(input({ only: ['C'] }))).toBe('✖ carry: B did not pass in CER-0001 (or has no rows there) → add it to --only C,B');
    expect(carryProblem(input({ source: { started: srcStarted(), finished: srcFinished({ level3: rows('C') }) } }))).toMatch(/^✖ carry: A did not pass/u);
  });
  it('[C-267] a carry is refused when the guidance fingerprint moved', () => {
    expect(carryProblem(input({ fingerprint: 'e'.repeat(64) }))).toMatch(/^✖ carry: the guidance changed since CER-0001 \(ffffffffffff → eeeeeeeeeeee\) → /u);
  });
  it('[C-267] a carried job whose definition changed is refused; a changed job that is re-run is not', () => {
    expect(carryProblem(input({ definition: definitionOf({ full: [job('A', 'new prompt'), job('B'), job('C')], rules: RULES }, FIX) }))).toMatch(/^✖ carry: A is defined differently than in CER-0001 → add it to --only B,A/u);
    expect(carryProblem(input({ definition: definitionOf(spec({ b: 'a fixed prompt' }), FIX) }))).toBeUndefined();
    expect(carryProblem(input({ definition: definitionOf({ full: [...spec().full, job('D')], rules: RULES }, FIX) }))).toMatch(/D did not pass/u); // a new job is not in the source
    expect(carryProblem(input({ definition: definitionOf(spec(), { ...FIX, tag: 'v2.0.0' }) }))).toMatch(/rules or the pinned fixture differ/u);
  });
  it('[C-267] a carry is refused when anything outside the harness, tests, docs and workflows changed since the source commit', () => {
    for (const p of ['src/verbs/class.ts', 'skills/mm3/SKILL.md', 'hooks/x.json', 'bin/mm3.mjs', '.claude-plugin/plugin.json', 'package.json', 'README.md']) {
      expect(carryProblem(input({ changed: ['scripts/a.ts', p] }))).toMatch(new RegExp(`^✖ carry: ${p.replace(/[.]/gu, '\\.')} changed since CER-0001's commit abc1234, and an agent may run or read it → `, 'u'));
    }
    expect(carryProblem(input({ changed: undefined }))).toMatch(/^✖ carry: cannot list what changed since abc1234 → /u);
  });
});

describe('a carried run stands on its own at the gate and in the report [C-267]', () => {
  const carry = { from: 'CER-0001', jobs: ['A', 'C'], only: ['B'], note: 'B differs by scoring only' };
  const started = srcStarted({ id: 'CER-0002', definition: definitionOf(spec({ b: 'fixed' }), FIX), carry });
  const carried = (r: ReturnType<typeof row>) => ({ ...r, carriedFrom: 'CER-0001' });
  const finished = srcFinished({ startedId: 'CER-0002', passed: true, decision: { verdict: 'SHIP', formal: true, blockers: [], exceptions: [], improvements: [] }, level3: [...rows('A').map(carried), ...rows('B'), ...rows('C').map(carried)] });
  const cur = { fingerprint: 'f'.repeat(64), definitionHash: started.definition.hash };

  it('[C-267] the gate and the record check read carried rows like fresh ones', () => {
    expect(lastFormal([started, finished])?.started.id).toBe('CER-0002');
    expect(agenticProblem(cur, { started, finished })).toBeUndefined();
    expect(recordGaps(started, finished)).toEqual([]);
  });
  it('[C-267] a carried run with no row for a job is an incomplete record', () => {
    expect(recordGaps(started, { ...finished, level3: rows('B') })).toEqual(expect.arrayContaining(['a level 3 row for A (neither run nor carried)']));
  });
  it('[C-267] the release report says in one line which jobs were carried from which run, and marks them', () => {
    const t = tellRun([started, finished], 'CER-0002', undefined).join('\n');
    expect(t).toContain('CARRIED  2 job(s) were not re-run here; their rows are copied unchanged from CER-0001 (marked "carried" below): A, C. Note: B differs by scoring only');
    expect(t).toContain('(carried from CER-0001, not re-run)');
    expect(t.match(/carried from CER-0001, not re-run/gu)?.length).toBe(4); // each carried job, in the story and in the data
  });
});

// Reading a ceremony run back as a story [C-263]: five steps, each with the criteria it had to meet and whether it did; one
// trial told call by call from the tokens the model started with, with every MM3 call marked as a sample-provider call, and
// a transcript trusted only when its digest matches the ledger's.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ClaudeCall } from '../../scripts/agentic/claude.ts';
import { definitionOf, type FinishedRecord, type StartedRecord } from '../../scripts/agentic/ledger.ts';
import { tellRun } from '../../scripts/agentic/story.ts';

const spec = { full: [{ id: 'S1', goal: 'a goal', prompt: 'Is it safe?', model: 'sonnet', routes: ['mcp'], promise: 3, checkpoints: ['engaged', 'answer-cites-run-id'] }], rules: { gateModel: 'sonnet', floorModel: 'haiku', mustPassTrials: 2, trialsPerScenario: 3, firstAttemptTarget: 0.8 } };
const started: StartedRecord = { kind: 'ceremony', phase: 'started', id: 'CER-0007', ts: '2026-10-06T09:00:00.000Z', version: '0.1.2-nightly.test', versionCommit: 'abc1234', head: 'abc1234def', dirty: false, fingerprint: 'f'.repeat(64), definition: definitionOf(spec, { tag: 'v1', sha: 'a'.repeat(40) }), mode: 'free', trialsOverride: null, formal: true, formalReason: 'ok' };
const calls: ClaudeCall[] = [
  { tool: 'mcp__plugin_mm3_mm3__mm3', input: { args: ['class', '-'] }, parent: null, id: '1', result: '✖ mak.ask.decisions: 0 categories → give 2–5', turn: 1 },
  { tool: 'mcp__plugin_mm3_mm3__mm3', input: { args: ['class', '-'] }, parent: null, id: '2', result: 'mak:\n  id: MM3-0001\n  gate: fail', turn: 2 },
];
const body = JSON.stringify({ calls, turns: [{ turn: 1, agent: 'lead', inputTokens: 10, outputTokens: 30, cacheReadTokens: 0, cacheCreationTokens: 7000 }, { turn: 2, agent: 'lead', inputTokens: 12, outputTokens: 40, cacheReadTokens: 7000, cacheCreationTokens: 300 }] });
const finished = (o: Partial<FinishedRecord> = {}): FinishedRecord => ({
  kind: 'ceremony', phase: 'finished', startedId: 'CER-0007', ts: '2026-10-06T09:30:00.000Z', passed: false,
  level1: [{ name: 'hygiene', ok: true, detail: 'hygiene OK' }, { name: 'plugin bundle', ok: false, detail: 'stale' }],
  level2: [{ id: 'a', level: 'none', pass: true }, { id: 'a', level: 'some', pass: false }],
  level3: [{ id: 'S1', route: 'mcp', model: 'sonnet', resolvedModel: 'claude-sonnet-x', trial: 1, pass: false, failed: ['answer-cites-run-id'], attempts: [2], firstRequestAccepted: false, mm3Calls: 2, usage: { inputTokens: 22, outputTokens: 70, cacheReadTokens: 7000, cacheCreationTokens: 7300, turns: 2 }, transcript: 't.json', transcriptSha256: createHash('sha256').update(body).digest('hex') }],
  firstRequestAcceptedRate: 0, ...o,
});
const load = (text: string) => () => ({ text, calls, turns: JSON.parse(text).turns });

describe('agentic story [C-263]', () => {
  it('[C-263] a run is told in five steps, each with what it had to meet and whether it did', () => {
    const t = tellRun([started, finished()], 'CER-0007', undefined).join('\n');
    expect(t).toContain('CER-0007 · 0.1.2-nightly.test · a FORMAL run · FAILED');
    expect(t).toContain('STEP 1 · what was to be proven, stated before anything ran');
    expect(t).toContain('STEP 2 · level 1, the free checks: 1 of 2 met their criterion');
    expect(t).toContain('✖ plugin bundle: stale');
    expect(t).toContain('STEP 3 · level 2');
    expect(t).toContain('STEP 4 · level 3, real agents on the pinned project with the sample provider: 0 of 1 trials met every criterion');
    expect(t).toContain('1 of 2 criteria (missed: answer-cites-run-id)');
    expect(t).toContain('STEP 5 · the gate: FAIL');
  });

  it('[C-263] one trial is told call by call: the starting tokens, each MM3 call marked as a sample call, the stop and the verdict', () => {
    const t = tellRun([started, finished()], 'CER-0007', 'S1/mcp/sonnet/1', load(body)).join('\n');
    expect(t).toContain('digest matches the ledger');
    expect(t).toContain('no live call, no spend');
    expect(t).toContain('start: the model began with 7,010 tokens of context');
    expect(t).toMatch(/1\. lead\s+MM3 call mm3 class -.*a stop: ✖ mak\.ask\.decisions/u);
    expect(t).toMatch(/2\. lead\s+MM3 call mm3 class -.*verdict MM3-0001 recorded/u);
    expect(t).toContain('context then 7,312');
    expect(t).toContain('totals (exact, from the run\'s own usage): 14,322 tokens in, 70 out, 2 model turns, 2 MM3 calls');
    expect(t).toContain('✖ The final answer states the MM3 run id');
  });

  it('[C-263] a transcript whose digest does not match the ledger is called out, and a missing one is said to be missing', () => {
    expect(tellRun([started, finished()], 'CER-0007', 'S1/mcp/sonnet/1', load(`${body} `)).join('\n')).toContain('DIGEST DOES NOT MATCH THE LEDGER');
    expect(tellRun([started, finished()], 'CER-0007', 'S1/mcp/sonnet/1').join('\n')).toContain('is not on this machine');
  });

  it('[C-263] an unknown run, an unknown row and a run that never closed each say so', () => {
    expect(tellRun([started], 'CER-0099', undefined)[0]).toMatch(/no run CER-0099/u);
    expect(tellRun([started, finished()], 'CER-0007', 'X/mcp/sonnet/1')[0]).toMatch(/no level 3 row X\/mcp\/sonnet\/1/u);
    expect(tellRun([started], 'CER-0007', undefined).join('\n')).toContain('INCOMPLETE (it never closed)');
  });
});

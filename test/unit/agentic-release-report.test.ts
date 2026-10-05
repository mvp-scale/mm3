// The agentic release report [C-263], a ceremony run read back for a release decision: five steps, each with the criteria it had to meet and whether it did; one
// trial told call by call from the tokens the model started with, with every MM3 call marked as a sample-provider call, and
// a transcript trusted only when its digest matches the ledger's.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ClaudeCall } from '../../scripts/agentic/claude.ts';
import { definitionOf, type FinishedRecord, type StartedRecord } from '../../scripts/agentic/ledger.ts';
import { tellRun } from '../../scripts/agentic/release-report.ts';

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

describe('agentic release report [C-263]', () => {
  it('[C-263] a run is reported on one screen: the verdict, the five steps, a criteria matrix per scenario, tokens and the record check', () => {
    const t = tellRun([started, finished()], 'CER-0007', undefined).join('\n');
    expect(t).toContain('AGENTIC RELEASE REPORT  CER-0007  FAILED · FORMAL: the release gate reads it');
    expect(t).toContain('version   0.1.2-nightly.test');
    expect(t).toMatch(/record\s+old format, not checked · chain intact/u); // the fixture predates the schema; a complete record says "complete"
    expect(t).toContain('2 FREE      1/2   ✔ hygiene · ✖ plugin bundle');
    expect(t).toMatch(/3 CONTEXT\s+none 1\/1 · instructions 0\/1 · \+cards 0\/0/u);
    expect(t).toContain('4 AGENTS    sonnet 0/1 ✖');
    expect(t).toContain('e engaged · c cites run id'); // the legend names each column letter
    expect(t).toMatch(/mcp\s+sonnet\s+✔ ✖\s+\[2\]\s+14k\/70\s+2/u); // the matrix row: criteria, tries, tokens in/out, calls
    expect(t).toContain('5 GATE      FAIL · first request accepted 0% of sonnet trials (target 80%)');
    expect(t).toContain('READ MORE   --row S1/mcp/sonnet/1');
    expect(Math.max(...t.split('\n').map((l) => l.length))).toBeLessThanOrEqual(150);
  });

  it('[C-263] with transcripts on hand each trial carries a context path: bars of the context the lead carried at each turn', () => {
    const t = tellRun([started, finished()], 'CER-0007', undefined, load(body)).join('\n');
    expect(t).toMatch(/mcp\s+sonnet\s+✔ ✖\s+\[2\]\s+14k\/70\s+2\s+[▁-█]{2}/u);
  });

  it('[C-263] one trial is reported call by call: the starting tokens, each MM3 call marked as a sample call, the stop and the verdict', () => {
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
    const open = tellRun([started], 'CER-0007', undefined).join('\n');
    expect(open).toContain('CER-0007  INCOMPLETE');
    expect(open).toContain('the run never closed');
  });
});

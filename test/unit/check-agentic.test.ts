// The agentic release gate and ledger [C-260]: a formal run stands only while it finished, passed, and the guidance and the
// definition of success it ran under are still today's. Every run is recorded, and an unclosed run shows as incomplete.
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { agenticProblem } from '../../scripts/check-agentic.ts';
import { append, chainProblem, compareRuns, definitionOf, incomplete, lastFormal, nextId, recordGaps, type FinishedRecord, type LedgerRecord, type Spec, type StartedRecord } from '../../scripts/agentic/ledger.ts';

const RULES = { gateModel: 'sonnet', floorModel: 'haiku', mustPassTrials: 2, trialsPerScenario: 3, firstAttemptTarget: 0.8 };
const FIX = { tag: 'v1.0.0', sha: 'a'.repeat(40) };
const spec = (o: { goal?: string; prompt?: string; model?: string } = {}): Spec => ({ full: [{ id: 'S1', goal: o.goal ?? 'goal', prompt: o.prompt ?? 'Is it safe?', model: o.model ?? 'sonnet', routes: ['mcp'], promise: 3, checkpoints: ['engaged', 'answer-cites-run-id'] }], rules: RULES });
const started = (o: Partial<StartedRecord> = {}): StartedRecord => ({ kind: 'ceremony', phase: 'started', schema: 1, guidance: { surfaces: 58, snapshot: 'test/golden/guidance/surfaces.txt' }, environment: { node: 'v22', vitest: '5', claude: '2.1', os: 'Linux' }, artifact: { npmIntegrity: 'sha512-x', npmShasum: 'abc', pluginCommit: 'abc1234' }, id: 'CER-0001', ts: '2026-10-05T10:00:00.000Z', version: '0.1.2-nightly.test', versionCommit: 'abc1234', head: 'abc1234', dirty: false, fingerprint: 'f'.repeat(64), definition: definitionOf(spec(), FIX), mode: 'free', trialsOverride: null, formal: true, formalReason: 'ok', ...o });
const USAGE = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 1, cacheCreationTokens: 1, turns: 1 };
const ECO = { mm3: { calls: 1, argsTokens: 1, resultTokens: 1 }, bash: { calls: 0, argsTokens: 0, resultTokens: 0 }, files: { calls: 0, argsTokens: 0, resultTokens: 0 }, agent: { calls: 0, argsTokens: 0, resultTokens: 0 }, other: { calls: 0, argsTokens: 0, resultTokens: 0 } };
const ROW = { id: 'S1', route: 'mcp', model: 'sonnet', resolvedModel: 'claude-sonnet-x', trial: 1, pass: true, failed: [], attempts: [1], firstRequestAccepted: true, mm3Calls: 1, usage: USAGE, economics: ECO, transcript: 't.json', transcriptSha256: 'ab' };
const finished = (o: Partial<FinishedRecord> = {}): FinishedRecord => ({ kind: 'ceremony', phase: 'finished', startedId: 'CER-0001', ts: '2026-10-05T10:30:00.000Z', passed: true, level1: [{ name: 'x', ok: true, detail: 'ok' }], level2: [{ id: 'a', level: 'none', pass: true }], level3: [ROW], usage: { ...USAGE, claudeRuns: 1, mm3Calls: 1 }, firstRequestAcceptedRate: 1, ...o });
const cur = { fingerprint: 'f'.repeat(64), definitionHash: definitionOf(spec(), FIX).hash };

describe('agentic ledger and gate [C-260]', () => {
  it('[C-260] with no formal run recorded the gate fails and says how to make one', () => {
    expect(agenticProblem(cur, undefined)).toMatch(/no formal ceremony run .* npm run ceremony -- --version/u);
  });
  it('[C-260] a formal run that failed fails the gate, naming the run and the version', () => {
    expect(agenticProblem(cur, { started: started(), finished: finished({ passed: false }) })).toMatch(/CER-0001 \(0\.1\.2-nightly\.test, 2026-10-05\) did not pass/u);
  });
  it('[C-260] a pass under a different guidance fingerprint is stale', () => {
    expect(agenticProblem({ ...cur, fingerprint: 'e'.repeat(64) }, { started: started(), finished: finished() })).toMatch(/guidance changed since CER-0001 passed \(ffffffffffff → eeeeeeeeeeee/u);
  });
  it('[C-260] the definition hash covers every part of success: a changed goal, prompt, model or pin moves it', () => {
    const base = definitionOf(spec(), FIX).hash;
    expect(definitionOf(spec({ goal: 'other' }), FIX).hash).not.toBe(base);
    expect(definitionOf(spec({ prompt: 'Is it SAFE?' }), FIX).hash).not.toBe(base);
    expect(definitionOf(spec({ model: 'haiku' }), FIX).hash).not.toBe(base);
    expect(definitionOf(spec(), { ...FIX, tag: 'v2.0.0' }).hash).not.toBe(base);
    expect(definitionOf(spec(), FIX).hash).toBe(base);
  });
  it('[C-260] the definition also carries a plain-English sentence for a person', () => {
    expect(definitionOf(spec(), FIX).plain).toBe('1 scenarios (S1) on OWASP Juice Shop v1.0.0, over the mcp route; sonnet must pass 2 of 3 trials of each, haiku is reported but does not gate; every agent must get a verdict within its promised verb requests (3); first-request target 80%; sample provider, no key, no spend');
  });
  it('[C-260] a pass under a different definition of success is stale', () => {
    expect(agenticProblem({ ...cur, definitionHash: definitionOf(spec({ prompt: 'changed' }), FIX).hash }, { started: started(), finished: finished() })).toMatch(/definition of success changed since CER-0001/u);
  });
  it('[C-260] a pass under today\'s guidance and definition stands', () => {
    expect(agenticProblem(cur, { started: started(), finished: finished() })).toBeUndefined();
  });
  it('[C-260] only a finished FORMAL run counts: non-formal and unclosed runs are ignored, and the unclosed one shows as incomplete', () => {
    const records: LedgerRecord[] = [started({ id: 'CER-0001' }), finished({ startedId: 'CER-0001' }), started({ id: 'CER-0002', formal: false, formalReason: 'trials override' }), finished({ startedId: 'CER-0002', passed: false }), started({ id: 'CER-0003' })];
    expect(lastFormal(records)?.started.id).toBe('CER-0001'); // 0002 is not formal; 0003 never closed
    expect(incomplete(records).map((r) => r.id)).toEqual(['CER-0003']);
    expect(nextId(records)).toBe('CER-0004');
  });

  it('[C-260] every appended line carries the hash of the line before it, and an edited or removed line is caught', () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'mm3-ledger-')), 'ledger.jsonl');
    append(started({ id: 'CER-0001' }), file);
    append(finished({ startedId: 'CER-0001' }), file);
    append(started({ id: 'CER-0002' }), file);
    expect(chainProblem(file)).toBeUndefined();
    const rows = readFileSync(file, 'utf8').trim().split('\n');
    expect(JSON.parse(rows[0]!).prev).toBe('genesis');
    writeFileSync(file, `${rows[0]!.replace('"passed"', '"x"').replace('0.1.2-nightly.test', '0.9.9')}\n${rows[1]}\n${rows[2]}\n`);
    expect(chainProblem(file)).toMatch(/line 2 does not follow line 1/u);
    writeFileSync(file, `${rows[1]}\n${rows[2]}\n`);
    expect(chainProblem(file)).toMatch(/does not follow/u);
    appendFileSync(file, '');
  });

  it('[C-260] a line written before the schema existed is exempt, but still feeds the next line\'s hash', () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'mm3-ledger-')), 'ledger.jsonl');
    writeFileSync(file, `${JSON.stringify({ kind: 'ceremony', phase: 'started', id: 'CER-0001' })}\n`);
    append(finished({ startedId: 'CER-0001' }), file);
    expect(chainProblem(file)).toBeUndefined();
  });

  it('[C-260] comparing two runs says what changed: the code, the guidance, the definition, and the results', () => {
    const a = { started: started({ id: 'CER-0001', head: 'aaaaaaa1111' }), finished: finished({ startedId: 'CER-0001', firstRequestAcceptedRate: 0.25, usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 900, cacheCreationTokens: 0, turns: 6, claudeRuns: 2, mm3Calls: 3 }, level3: [{ id: 'S1', route: 'mcp', model: 'sonnet', trial: 1, pass: false, failed: ['engaged'], attempts: [0], firstRequestAccepted: false, mm3Calls: 3, transcript: 'a.json' }] }) };
    const b = { started: started({ id: 'CER-0002', head: 'bbbbbbb2222', fingerprint: 'e'.repeat(64), definition: definitionOf(spec({ prompt: 'new prompt' }), FIX) }), finished: finished({ startedId: 'CER-0002', firstRequestAcceptedRate: 0.75, level3: [{ id: 'S1', route: 'mcp', model: 'sonnet', trial: 1, pass: true, failed: [], attempts: [1], firstRequestAccepted: true, mm3Calls: 2, transcript: 'b.json' }] }) };
    const text = compareRuns(a, b).join('\n');
    expect(text).toContain('code: aaaaaaa → bbbbbbb');
    expect(text).toContain('guidance: CHANGED');
    expect(text).toContain('S1: prompt changed');
    expect(text).toContain('level 3 gate-model trials passed: 0/1 → 1/1');
    expect(text).toContain('first request accepted: 25% → 75%');
    expect(text).toContain('usage: 1000 in / 50 out, 6 turns, 3 MM3 calls → 3 in / 1 out, 1 turns, 1 MM3 calls'); // tokens and turns, never a dollar figure
    expect(text).toContain('S1 · mcp · sonnet: 0/1 → 1/1');
  });

  it('[C-260] comparing against an older record that never stored prompts or models says "not recorded", not "changed"', () => {
    const old = started({ id: 'CER-0001' });
    const legacy = { ...old, definition: { ...old.definition, hash: 'legacy-shape', scenarios: old.definition.scenarios.map(({ prompt: _p, model: _m, routes: _r, ...rest }) => rest) as unknown as StartedRecord['definition']['scenarios'] } };
    const text = compareRuns({ started: legacy as StartedRecord }, { started: started({ id: 'CER-0002' }) }).join('\n');
    expect(text).toContain('S1: prompt was not recorded in the older run');
    expect(text).not.toContain('prompt changed');
  });

  it('[C-260] a complete record has no gaps; each missing piece is named, and an old-format record is not held to the schema', () => {
    expect(recordGaps(started(), finished())).toEqual([]);
    expect(recordGaps(started({ environment: undefined }), finished())).toEqual(['the environment (node, vitest, claude, OS)']);
    expect(recordGaps(started({ artifact: { npmIntegrity: null, npmShasum: null, pluginCommit: null } }), finished())[0]).toMatch(/tested artifact/u);
    expect(recordGaps(started(), finished({ level3: [{ ...ROW, transcriptSha256: undefined, usage: undefined }] }))).toEqual(['S1/mcp/sonnet/1: tokens', 'S1/mcp/sonnet/1: the transcript digest']);
    expect(recordGaps(started())).toContain('the closing line (the run never finished)');
    expect(recordGaps(started({ schema: undefined }), finished())[0]).toMatch(/written before the schema existed/u);
  });

  it('[C-260] the gate fails on a formal run whose record is incomplete, naming what is missing', () => {
    expect(agenticProblem(cur, { started: started(), finished: finished({ level3: [{ ...ROW, usage: undefined }] }) })).toMatch(/the record of CER-0001 is incomplete \(S1\/mcp\/sonnet\/1: tokens\)/u);
  });
});

// The agentic release gate and ledger [C-260]: a formal run stands only while it finished, passed, and the guidance and the
// definition of success it ran under are still today's. Every run is recorded, and an unclosed run shows as incomplete.
import { describe, expect, it } from 'vitest';
import { agenticProblem } from '../../scripts/check-agentic.ts';
import { definitionOf, incomplete, lastFormal, nextId, type FinishedRecord, type LedgerRecord, type StartedRecord } from '../../scripts/agentic/ledger.ts';

const spec = (extra = '') => ({ full: [{ id: 'S1', goal: `goal${extra}`, promise: 3, checkpoints: ['engaged', 'answer-cites-run-id'] }], rules: { gateModel: 'sonnet' } });
const started = (o: Partial<StartedRecord> = {}): StartedRecord => ({ kind: 'ceremony', phase: 'started', id: 'CER-0001', ts: '2026-10-05T10:00:00.000Z', version: '0.1.2-nightly.test', versionCommit: 'abc1234', head: 'abc1234', dirty: false, fingerprint: 'f'.repeat(64), definition: definitionOf(spec()), mode: 'free', trialsOverride: null, formal: true, formalReason: 'ok', ...o });
const finished = (o: Partial<FinishedRecord> = {}): FinishedRecord => ({ kind: 'ceremony', phase: 'finished', startedId: 'CER-0001', ts: '2026-10-05T10:30:00.000Z', passed: true, ...o });
const cur = { fingerprint: 'f'.repeat(64), definitionHash: definitionOf(spec()).hash };

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
  it('[C-260] a pass under a different definition of success is stale: changing a goal changes the hash', () => {
    expect(definitionOf(spec()).hash).not.toBe(definitionOf(spec('!')).hash);
    expect(agenticProblem({ ...cur, definitionHash: definitionOf(spec('!')).hash }, { started: started(), finished: finished() })).toMatch(/definition of success changed since CER-0001/u);
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
});

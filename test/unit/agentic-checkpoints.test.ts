// The agentic stage's definition of success [C-261], tested without any agent: synthetic transcripts go through the same
// checkpoints the harness and the human sheet use, so the grader itself is proven before it grades a run.
import { describe, expect, it } from 'vitest';
import type { ClaudeCall } from '../../scripts/agentic/claude.ts';
import { evaluate, metrics, type Evidence } from '../../scripts/agentic/checkpoints.ts';

const mm3 = (args: string[], result: string, parent: string | null = null): ClaudeCall => ({ tool: 'mcp__plugin_mm3_mm3__mm3', input: { args }, parent, id: `${Math.random()}`, result });
const OK = 'mak:\n  id: MM3-0001\n  gate: fail';
const STOP = '✖ mak.ask.decisions: 0 categories → give 2–5';
const ev = (calls: ClaudeCall[], o: Partial<Evidence> = {}): Evidence => ({ calls, answer: 'verdict fail, run MM3-0001', ledger: '{"id":"MM3-0001"}', promise: 3, helpers: 0, ...o });
const ids = (e: Evidence, list: string[]): Record<string, boolean> => Object.fromEntries(evaluate(list, e).map((c) => [c.id, c.pass]));

describe('agentic checkpoints [C-261]', () => {
  it('[C-261] a clean run passes every checkpoint, with no key involved', () => {
    const e = ev([mm3(['agent'], 'card'), mm3(['class', '-'], OK)]);
    expect(ids(e, ['engaged', 'verdict-in-promise', 'last-request-accepted', 'answer-cites-run-id', 'run-id-in-ledger'])).toEqual({ engaged: true, 'verdict-in-promise': true, 'last-request-accepted': true, 'answer-cites-run-id': true, 'run-id-in-ledger': true });
    expect(metrics(e)).toEqual({ mm3Calls: 2, verbRequests: 1, discoveryCalls: 1, firstRequestAccepted: true });
  });

  it('[C-261] discovery calls do not count as attempts; the promise counts verb requests only', () => {
    const calls = [mm3(['class', '-'], STOP), mm3(['agent', 'probe'], 'card'), mm3(['template', 'class'], 'skeleton'), mm3(['class', '-'], STOP), mm3(['class', '-'], OK)];
    expect(ids(ev(calls), ['verdict-in-promise'])['verdict-in-promise']).toBe(true); // 3rd verb request
    expect(ids(ev(calls, { promise: 2 }), ['verdict-in-promise'])['verdict-in-promise']).toBe(false);
    expect(metrics(ev(calls)).firstRequestAccepted).toBe(false);
  });

  it('[C-261] an agent that never gets a verdict fails the promise and the last-request check', () => {
    const e = ev([mm3(['class', '-'], STOP), mm3(['class', '-'], STOP)]);
    expect(ids(e, ['verdict-in-promise', 'last-request-accepted'])).toEqual({ 'verdict-in-promise': false, 'last-request-accepted': false });
  });

  it('[C-261] a run id the ledger does not hold is caught, and so is a missing citation', () => {
    expect(ids(ev([mm3(['class', '-'], OK)], { answer: 'run MM3-0009' }), ['run-id-in-ledger'])['run-id-in-ledger']).toBe(false);
    expect(ids(ev([mm3(['class', '-'], OK)], { answer: 'looks fine' }), ['answer-cites-run-id', 'run-id-in-ledger'])).toEqual({ 'answer-cites-run-id': false, 'run-id-in-ledger': false });
  });

  it('[C-261] one stop then an accepted request satisfies first-fix-works; two stops do not', () => {
    expect(ids(ev([mm3(['class', '-'], STOP), mm3(['class', '-'], OK)]), ['first-fix-works'])['first-fix-works']).toBe(true);
    expect(ids(ev([mm3(['class', '-'], STOP), mm3(['class', '-'], STOP), mm3(['class', '-'], OK)]), ['first-fix-works'])['first-fix-works']).toBe(false);
  });

  it('[C-261] delegation: helpers spawned, the card in every prompt, each helper a verdict and a cited id', () => {
    const spawn = (n: number, card: boolean): ClaudeCall => ({ tool: 'Agent', input: { prompt: card ? `go. never read .mm3/log.jsonl ${n}` : `go ${n}` }, parent: null, id: `a${n}`, result: '' });
    const back = (n: number): ClaudeCall => ({ tool: 'SubagentHandback', input: { message: `done MM3-000${n}` }, parent: `a${n}`, id: `b${n}`, result: '' });
    const helper = (n: number): ClaudeCall => mm3(['class', '-'], OK, `a${n}`);
    const good = ev([spawn(1, true), spawn(2, true), spawn(3, true), helper(1), helper(2), helper(3), back(1), back(2), back(3)], { helpers: 3, answer: 'MM3-0001 MM3-0002 MM3-0003', ledger: 'MM3-0001 MM3-0002 MM3-0003' });
    const all = ['helpers-spawned', 'delegate-card-in-prompts', 'verdict-in-promise', 'helpers-cite-ids', 'answer-cites-run-id', 'run-id-in-ledger'];
    expect(Object.values(ids(good, all)).every(Boolean)).toBe(true);
    const noCard = ev([spawn(1, true), spawn(2, false), spawn(3, true), helper(1), helper(2), helper(3), back(1), back(2), back(3)], { helpers: 3 });
    expect(ids(noCard, ['delegate-card-in-prompts'])['delegate-card-in-prompts']).toBe(false);
    const oneHelper = ev([spawn(1, true), helper(1), back(1)], { helpers: 3 });
    expect(ids(oneHelper, ['helpers-spawned', 'verdict-in-promise'])).toEqual({ 'helpers-spawned': false, 'verdict-in-promise': false });
  });

  it('[C-261] an unknown checkpoint name is an error, not a silent pass', () => {
    expect(() => evaluate(['no-such-checkpoint'], ev([]))).toThrow(/unknown checkpoint/u);
  });
});

// The agentic stage's definition of success [C-261], tested without any agent: synthetic transcripts go through the same
// checkpoints the harness and the human sheet use, so the grader itself is proven before it grades a run.
import { describe, expect, it } from 'vitest';
import type { ClaudeCall } from '../../scripts/agentic/claude.ts';
import { evaluate, metrics, type Evidence } from '../../scripts/agentic/checkpoints.ts';

const mm3 = (args: string[], result: string, parent: string | null = null): ClaudeCall => ({ tool: 'mcp__plugin_mm3_mm3__mm3', input: { args }, parent, id: `${Math.random()}`, result });
const OK = 'mak:\n  id: MM3-0001\n  gate: fail';
const STOP = '✖ mak.ask.decisions: 0 categories → give 2–5';
const ev = (calls: ClaudeCall[], o: Partial<Evidence> = {}): Evidence => ({ calls, answer: 'verdict fail, run MM3-0001', ledger: '{"id":"MM3-0001"}', promise: 3, helpers: 0, read: () => undefined, ...o });
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

// The jobs for the features new since the last release: each criterion is checked from the files the agent left and the ledger, never from a verdict's content.
describe('feature job checkpoints [C-266]', () => {
  const cfg = (usd: number, runs?: number): string => JSON.stringify({ kind: 'config', id: 'X', settings: { budget: { usd, ...(runs ? { runs } : {}) } } });
  const files = (m: Record<string, string>) => (rel: string): string | undefined => m[rel];
  const run = (list: string[], e: Evidence): Record<string, boolean> => ids(e, list);

  it('[C-266] changing a setting: the file holds the cap, the ledger holds a receipt for it, and the answer says what changed', () => {
    const good = ev([mm3(['config', '--load'], '✔ valid · loaded')], { read: files({ '.mm3/config.yaml': 'budget:\n  usd: 3\n' }), ledger: cfg(3), answer: 'Set budget.usd to 3; the load recorded a receipt in the ledger.' });
    expect(Object.values(run(['config-file-has-cap', 'config-receipt-shows-cap', 'answer-states-the-change'], good)).every(Boolean)).toBe(true);
    const unloaded = ev([], { read: files({ '.mm3/config.yaml': 'budget:\n  usd: 3\n' }), ledger: '', answer: 'Changed it to 3 dollars.' });
    expect(run(['config-file-has-cap', 'config-receipt-shows-cap', 'answer-states-the-change'], unloaded)).toEqual({ 'config-file-has-cap': true, 'config-receipt-shows-cap': false, 'answer-states-the-change': false });
    expect(run(['config-file-has-cap'], ev([], { read: files({ '.mm3/config.yaml': '#   usd: 3\n' }) }))['config-file-has-cap']).toBe(false); // a commented-out line is not a setting
  });

  it('[C-266] the spend cap: the cap raised in the file AND recorded, two verdicts, and a verdict after any stop', () => {
    const stop = mm3(['class', '-'], '✖ budget: cap reached ($0.00 of $5.00 · 1 of 1 runs) → ask the owner to raise budget.runs in .mm3/config.yaml');
    const second = mm3(['class', '-'], 'mak:\n  id: MM3-0002\n  gate: fail');
    const stopped = ev([mm3(['class', '-'], OK), stop, mm3(['config', '--load'], '✔ valid'), second], { read: files({ '.mm3/config.yaml': 'budget:\n  runs: 5\n' }), ledger: cfg(5, 5) });
    expect(run(['cap-raised-in-config', 'two-verdicts', 'continued-after-stop'], stopped)).toEqual({ 'cap-raised-in-config': true, 'two-verdicts': true, 'continued-after-stop': true });
    // an agent that read the cap first and raised it before the stop never meets the stop: that is as good
    const anticipated = ev([mm3(['budget'], 'budget: 1 of 1 runs left'), mm3(['class', '-'], OK), mm3(['config', '--load'], '✔ valid'), second], { read: files({ '.mm3/config.yaml': 'budget:\n  runs: 5\n' }), ledger: cfg(5, 5) });
    expect(run(['cap-raised-in-config', 'two-verdicts', 'continued-after-stop'], anticipated)).toEqual({ 'cap-raised-in-config': true, 'two-verdicts': true, 'continued-after-stop': true });
    const stuck = ev([mm3(['class', '-'], OK), stop], { read: files({ '.mm3/config.yaml': 'budget:\n  runs: 1\n' }), ledger: '' });
    expect(run(['cap-raised-in-config', 'two-verdicts', 'continued-after-stop'], stuck)).toEqual({ 'cap-raised-in-config': false, 'two-verdicts': false, 'continued-after-stop': false });
    expect(run(['two-verdicts'], ev([mm3(['class', '-'], OK), mm3(['class', '-'], OK)]))['two-verdicts']).toBe(false); // the same run twice is one verdict
  });

  it('[C-266] install health: the warning was seen, the older copy is named with how to update it, and a nightly copy is never sent to @latest', () => {
    const doctor = mm3(['doctor'], 'versions: "⚠ the plugin is 0.1.1 (f337f61) and this copy is 0.1.2-nightly.x → update the older one: /plugin update in Claude Code, or npm install -g @mvpscale/mm3@nightly"');
    expect(run(['doctor-versions-seen', 'right-fix-reported'], ev([doctor], { answer: 'The plugin is the older copy. Run /plugin update in Claude Code.' }))).toEqual({ 'doctor-versions-seen': true, 'right-fix-reported': true });
    expect(run(['right-fix-reported'], ev([doctor], { answer: 'Run /plugin update, or npm install -g @mvpscale/mm3@latest' }))['right-fix-reported']).toBe(false); // would downgrade a nightly copy
    expect(run(['right-fix-reported'], ev([doctor], { answer: 'Update something.' }))['right-fix-reported']).toBe(false);
    const localDoctor = mm3(['doctor'], 'versions: "⚠ the plugin is 0.1.1 (f337f61) and this copy is 0.1.2 → update the older one: /plugin update in Claude Code, or npm install -g @mvpscale/mm3@latest"');
    expect(run(['right-fix-reported'], ev([localDoctor], { answer: 'Run /plugin update (doctor also lists npm install -g @mvpscale/mm3@latest).' }))['right-fix-reported']).toBe(true); // a non-nightly copy: quoting doctor's own line is fine
    expect(run(['doctor-versions-seen'], ev([mm3(['doctor'], 'versions: ✔ the plugin and this copy are both 0.1.2')]))['doctor-versions-seen']).toBe(false);
  });

  it('[C-266] setting a project up: the block is in AGENTS.md and a CLAUDE.md imports it (either location)', () => {
    const block = '<!-- mm3:agents -->\nIf the `mm3` tool is available…\n<!-- /mm3:agents -->';
    expect(run(['agents-block-written', 'claude-md-imports'], ev([], { read: files({ 'AGENTS.md': block, 'CLAUDE.md': '@AGENTS.md\n' }) }))).toEqual({ 'agents-block-written': true, 'claude-md-imports': true });
    expect(run(['claude-md-imports'], ev([], { read: files({ '.claude/CLAUDE.md': '# c\n@../AGENTS.md\n' }) }))['claude-md-imports']).toBe(true);
    expect(run(['agents-block-written', 'claude-md-imports'], ev([], { read: files({ 'AGENTS.md': block }) }))).toEqual({ 'agents-block-written': true, 'claude-md-imports': false });
  });

  it('[C-266] the wrong field: the agent starts at the stop, and its very first MM3 call must put the request in "stdin" and be accepted', () => {
    const call = (input: Record<string, unknown>, result: string): ClaudeCall => ({ tool: 'mcp__plugin_mm3_mm3__mm3', input, parent: null, id: `${Math.random()}`, result });
    const IGNORED = `✖ request: empty → start with "mak:"\n✖ arguments: ignored "request" → the tool takes only args, stdin and project: the request YAML goes in "stdin" (args: ["class","-"])`;
    const fixed = ['ignored-stop-fixed'];
    const yaml = 'mak:\n  goal: x';
    expect(run(fixed, ev([call({ args: ['class', '-'], stdin: yaml }, OK)]))['ignored-stop-fixed']).toBe(true);
    expect(run(fixed, ev([call({ args: ['class', '-'], request: yaml }, IGNORED), call({ args: ['class', '-'], stdin: yaml }, OK)]))['ignored-stop-fixed']).toBe(false); // repeated the wrong field first
    expect(run(fixed, ev([call({ args: ['class', '-'], stdin: yaml, request: yaml }, OK)]))['ignored-stop-fixed']).toBe(false); // the field is still sent, even if the tool took the call
    expect(run(fixed, ev([call({ args: ['class', '-'], stdin: yaml }, STOP)]))['ignored-stop-fixed']).toBe(false); // right field, but the request itself was stopped
    expect(run(fixed, ev([call({ args: ['agent', 'class'] }, 'card'), call({ args: ['class', '-'], stdin: yaml }, OK)]))['ignored-stop-fixed']).toBe(false); // went elsewhere first
    expect(run(fixed, ev([]))['ignored-stop-fixed']).toBe(false);
  });

  it('[C-266] a helper gets the guidance: the verdict must come from a helper, not from the lead', () => {
    const asHelper = ev([mm3(['agent', 'delegate'], 'card'), mm3(['class', '-'], OK, 'a1')], { helpers: 1 });
    expect(run(['helper-made-the-call'], asHelper)['helper-made-the-call']).toBe(true);
    const lead = ev([mm3(['class', '-'], OK)], { helpers: 1 });
    expect(run(['helper-made-the-call', 'verdict-in-promise'], lead)).toEqual({ 'helper-made-the-call': false, 'verdict-in-promise': true }); // verdict-in-promise alone cannot tell a lead from a helper
    expect(run(['helper-made-the-call'], ev([mm3(['class', '-'], '✖ mak.ask.decisions: 0 categories', 'a1')], { helpers: 1 }))['helper-made-the-call']).toBe(false);
  });

  it('[C-266] terminal and plugin: both ran the same command, the texts match, and the answer says they agree (a wrong claim either way fails)', () => {
    const shell = (command: string, result: string): ClaudeCall => ({ tool: 'Bash', input: { command }, parent: null, id: command, result });
    const list = ['terminal-and-plugin-both-used', 'routes-agree-and-said-so'];
    const card = 'tool: agent\nrules:\n- start from a template';
    const wrapped = JSON.stringify([{ type: 'text', text: card }]); // how the stream can hand back an MCP result
    const good = ev([shell('mm3 agent', card), mm3(['agent'], wrapped)], { answer: 'The two answers agree: the same card.' });
    expect(run(list, good)).toEqual({ 'terminal-and-plugin-both-used': true, 'routes-agree-and-said-so': true });
    expect(run(list, ev([shell('mm3 agent', card)], { answer: 'They agree.' }))).toEqual({ 'terminal-and-plugin-both-used': false, 'routes-agree-and-said-so': false });
    expect(run(list, ev([shell('mm3 doctor', 'ok'), mm3(['agent'], card)], { answer: 'They agree.' }))['terminal-and-plugin-both-used']).toBe(false); // not the same command
    expect(run(list, ev([shell('mm3 agent', card), mm3(['agent'], `${card}\n- something else`)], { answer: 'They agree.' }))['routes-agree-and-said-so']).toBe(false); // said so, but the texts differ
    expect(run(list, ev([shell('mm3 agent', card), mm3(['agent'], card)], { answer: 'They do not agree.' }))['routes-agree-and-said-so']).toBe(false);
    expect(run(list, ev([shell('mm3 agent', card), mm3(['agent'], card)], { answer: 'Both ran fine.' }))['routes-agree-and-said-so']).toBe(false); // never said whether they agree
  });
});

// Two scoring rules the ceremony got wrong on CER-0004, pinned with the real answers and commands that tripped them [C-266].
import { describe, expect, it } from 'vitest';
import { attemptsByAgent, shellVerb, type ClaudeCall } from '../../scripts/agentic/claude.ts';
import { saysTheyDiffer } from '../../scripts/agentic/checkpoints.ts';

describe('scoring: a shell command that runs MM3 through a variable still counts as a verb request [C-266]', () => {
  it('finds the verb behind $M and behind a path that contains mm3', () => {
    expect(shellVerb('cd /tmp/mm3-agentic-project-x; export MM3_HOME=$PWD; M=/tmp/npm/node_modules/.bin/mm3; $M class login.yaml')).toBe('class');
    expect(shellVerb('M=/x/mm3; ${M} view MM3-0001')).toBe('view');
    expect(shellVerb('/tmp/npm/node_modules/.bin/mm3 scan - --dry-run')).toBe('scan');
    expect(shellVerb('npx mm3 drill req.yaml')).toBe('drill');
  });
  it('does not call a card, a template or an unrelated command a verb request', () => {
    expect(shellVerb('$M agent class')).toBeUndefined();
    expect(shellVerb('mm3 template class')).toBeUndefined();
    expect(shellVerb('cd /tmp/mm3-req; sed -i s/a/b/ login.yaml')).toBeUndefined();
  });
});

describe('scoring: only a claim that the outputs differ counts as disagreeing [C-266]', () => {
  it('accepts the three real answers that said the routes agree', () => {
    expect(saysTheyDiffer('The two answers agree. Both runs returned the same card, line for line. I saw no differences in the rules, the ordering, or the wording.')).toBe(false);
    expect(saysTheyDiffer("Yes, the two answers agree. They are word for word the same.\n\nOne difference, and it doesn't change the content. The card says there is no `mm3` command on PATH, but the shell command ran fine here.")).toBe(false);
    expect(saysTheyDiffer('The two answers agree. Both returned the same card. One thing to flag: the card says there is no mm3 command on PATH, a mismatch between the card and this environment.')).toBe(false);
    expect(saysTheyDiffer('The two outputs agree. I found no differences between them. One thing to note: that is a quirk of this environment, not a disagreement between the outputs.')).toBe(false);
  });
  it('still catches an answer that says they differ or do not agree', () => {
    expect(saysTheyDiffer('The two answers differ: the plugin adds a line.')).toBe(true);
    expect(saysTheyDiffer('There are differences between the terminal and the plugin output.')).toBe(true);
    expect(saysTheyDiffer('They do not agree.')).toBe(true);
    expect(saysTheyDiffer('The answers disagree on the second rule.')).toBe(true);
  });
});

describe('scoring: an accepted dry run is validation, not a failed attempt [C-274]', () => {
  const mm3 = (args: string[], result: string): ClaudeCall => ({ tool: 'mcp__plugin_mm3_mm3__mm3', input: { args }, parent: null, id: 'x', result });
  const STOP = '✖ mak.ask.decisions: 0 categories → give 2–5';
  const PLAN = 'plan:\n  calls: 1\n  questions: 12\nnotes: ["dry run: no call, no spend"]';
  const OK = 'mak:\n  id: MM3-0001\n  gate: fail';
  it('[C-274] stop, accepted dry run, verdict is two attempts (the stop, the verdict), not three', () => {
    expect(attemptsByAgent([mm3(['class', '-'], STOP), mm3(['class', '-', '--dry-run'], PLAN), mm3(['class', '-'], OK)])).toEqual([{ who: 'lead', outcomes: [false, true] }]);
  });
  it('[C-274] one command that dry-runs and then runs for real is an accepted attempt, not skipped (CER-0006: three correct runs scored as no attempt)', () => {
    const chained: ClaudeCall = { tool: 'Bash', input: { command: 'mm3 class req.yaml --dry-run && mm3 class req.yaml' }, parent: null, id: 'x', result: `${PLAN}\n${OK}` };
    expect(attemptsByAgent([chained])).toEqual([{ who: 'lead', outcomes: [true] }]);
  });
  it('[C-274] a dry run that was rejected still counts', () => {
    expect(attemptsByAgent([mm3(['class', '-', '--dry-run'], STOP), mm3(['class', '-'], OK)])).toEqual([{ who: 'lead', outcomes: [false, true] }]);
    expect(attemptsByAgent([mm3(['class', '-', '--dry-run'], STOP), mm3(['class', '-', '--dry-run'], STOP), mm3(['class', '-'], OK)])).toEqual([{ who: 'lead', outcomes: [false, false, true] }]);
  });
});

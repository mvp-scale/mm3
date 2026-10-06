// The token economics of a run [C-262]: every call is sorted into a kind, and each kind's calls, what the agent wrote and
// what came back into its context are summed, so a comparison can say where tokens went and whether a change added or saved them.
import { describe, expect, it } from 'vitest';
import type { ClaudeCall } from '../../scripts/agentic/claude.ts';
import { addEconomics, approxTokens, economics, economicsLine, kindOf, pathOf, traceTable } from '../../scripts/agentic/trace.ts';

const call = (tool: string, input: Record<string, unknown>, result: string, parent: string | null = null): ClaudeCall => ({ tool, input, parent, id: 'x', result, turn: 1 });

describe('agentic token economics [C-262]', () => {
  it('[C-262] every call lands in one kind: the MM3 tool or a shell mm3, other shell, files, delegation', () => {
    expect(kindOf(call('mcp__plugin_mm3_mm3__mm3', { args: ['agent'] }, ''))).toBe('mm3');
    expect(kindOf(call('Bash', { command: 'mm3 class -' }, ''))).toBe('mm3');
    expect(kindOf(call('Bash', { command: 'ls -la' }, ''))).toBe('bash');
    expect(kindOf(call('Bash', { command: 'which mm3 || echo none' }, ''))).toBe('bash'); // naming it is not running it
    expect(kindOf(call('Bash', { command: 'MM3_HOME=$PWD mm3 class req.yaml | tail -80' }, ''))).toBe('mm3');
    expect(kindOf(call('Bash', { command: 'cat req.yaml | mm3 class -' }, ''))).toBe('mm3');
    expect(kindOf(call('Bash', { command: '/tmp/x/node_modules/.bin/mm3 doctor' }, ''))).toBe('mm3');
    expect(kindOf(call('Read', { file_path: 'a.ts' }, ''))).toBe('files');
    expect(kindOf(call('Agent', { prompt: 'p' }, ''))).toBe('agent');
    expect(kindOf(call('SubagentHandback', { message: 'm' }, ''))).toBe('agent');
    expect(kindOf(call('WebFetch', {}, ''))).toBe('other');
  });

  it('[C-262] calls, written tokens and returned tokens are summed per kind (characters ÷ 4, rounded up)', () => {
    expect(approxTokens('abcdefghi')).toBe(3);
    const e = economics([call('mcp__plugin_mm3_mm3__mm3', { args: ['agent'] }, 'x'.repeat(400)), call('mcp__plugin_mm3_mm3__mm3', { args: ['class', '-'] }, 'y'.repeat(40)), call('Read', { file_path: 'a.ts' }, 'z'.repeat(80))]);
    expect(e.mm3).toEqual({ calls: 2, argsTokens: approxTokens('{"args":["agent"]}') + approxTokens('{"args":["class","-"]}'), resultTokens: 110 });
    expect(e.files.calls).toBe(1);
    expect(e.bash.calls).toBe(0);
    expect(economicsLine(e)).toMatch(/^mm3 2 calls, ≈\d+ tokens written, ≈110 came back · files 1 calls/u);
  });

  it('[C-262] runs add up kind by kind', () => {
    const a = economics([call('Bash', { command: 'ls' }, 'a'.repeat(40))]);
    const b = economics([call('Bash', { command: 'pwd' }, 'b'.repeat(80))]);
    expect(addEconomics(a, b).bash).toMatchObject({ calls: 2, resultTokens: 30 });
  });

  it('[C-262] the call-by-call trace shows the turn, who made the call, its kind and its two sizes', () => {
    const rows = traceTable([call('mcp__plugin_mm3_mm3__mm3', { args: ['agent'] }, 'x'.repeat(400)), call('Read', { file_path: 'a.ts' }, 'z', 'helper-1')], [{ turn: 1, agent: 'lead', inputTokens: 10, outputTokens: 5, cacheReadTokens: 100, cacheCreationTokens: 0 }]);
    expect(rows[1]).toMatch(/^1\s+1\s+lead\s+mm3\s+\d+\s+100\s+mm3 \["agent"\]/u);
    expect(rows[2]).toMatch(/^2\s+1\s+helper\s+files/u);
    expect(rows.join('\n')).toContain('1 model turns as the stream showed them (approximate): ≈110 tokens in, ≈5 out');
  });
});

describe('the decision path of a run [C-275]', () => {
  const mm3 = (args: string[], result: string): ClaudeCall => call('mcp__plugin_mm3_mm3__mm3', { args }, result);
  it('[C-275] one line: cards, the stop and what it said, a dry run accepted, an edit, the verdict', () => {
    const path = pathOf([
      mm3(['class', '-'], '✖ mak.ask.decisions: 0 categories → give 2–5'),
      mm3(['agent', 'class'], 'verb: class'),
      call('Edit', { file_path: 'r.yaml' }, 'ok'),
      mm3(['class', '-', '--dry-run'], 'plan:\n  calls: 1'),
      mm3(['class', '-'], 'mak:\n  id: MM3-0001\n  gate: fail'),
    ]);
    expect(path).toBe('class✖[mak.ask.decisions: 0 categories] → card:class → Edit → class(dry)✔plan → class✔verdict');
  });
  it('[C-275] a shell command that runs mm3 is labelled by its verb', () => {
    expect(pathOf([call('Bash', { command: 'mm3 class req.yaml --dry-run' }, 'plan:\n  calls: 1'), call('Bash', { command: 'mm3 template class' }, '# class')])).toBe('class(dry)✔plan → template');
  });
});

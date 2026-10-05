// The three-attempt promise, without an agent [C-259]: each way an agent really got a request wrong (taken from headless
// runs) stops with one "✖ field: problem → fix" line, the same through the terminal and through MCP, and the corrected
// request is accepted on the next call. The exact stop texts are pinned in test/golden/guidance/stops.txt, because a
// reworded stop is a guidance change (`npm run guidance:accept` rewrites it).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeDrift, parseSnapshot, renderSnapshot } from '../../helpers/guidance-surfaces.ts';
import { expectCleanStop, mm3 } from '../../helpers/cli.ts';
import { overMcp } from '../../helpers/mcp.ts';
import { tempProject, USER_TS } from '../../helpers/project.ts';

const FILES = { 'src/user.ts': USER_TS, 'src/handlers/user.ts': USER_TS };
const GOOD = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');
const STOPS = 'test/golden/guidance/stops.txt';

// What an agent actually sent, and what it should read back. `fix` is the words the stop must carry.
const CASES: Array<{ id: string; args: string[]; stdin?: string; fix: RegExp }> = [
  { id: 'no-decisions', args: ['class', '-'], stdin: GOOD.split('\n    decisions:')[0] + '\n', fix: /decisions: .* → give 2–5/u }, // the valid request with its decisions section cut off
  { id: 'yaml-not-parsing', args: ['class', '-'], stdin: 'mak:\n  goal: x: y\n', fix: /yaml: line \d+ does not parse → .*quotes/u },
  { id: 'empty-stdin', args: ['class', '-'], stdin: '', fix: /request: empty → start with "mak:"/u },
  { id: 'dash-missing', args: ['class'], fix: /missing arguments → mm3 class <request-file \| ->/u },
  { id: 'unknown-verb', args: ['classs', '-'], stdin: GOOD, fix: /→ /u },
];

describe('stop and recover [C-259]', () => {
  const stops: Record<string, string> = {};

  for (const c of CASES) {
    it(`[C-259] ${c.id}: one stop line that names the fix, the same over MCP, and the corrected request goes through`, async () => {
      const cli = tempProject(FILES);
      const stop = expectCleanStop(mm3(cli.root, c.args, { input: c.stdin ?? '' }), 2);
      expect(stop).toMatch(c.fix);
      stops[c.id] = `${stop}\n`;

      const mcp = tempProject(FILES);
      const m = await overMcp(mcp.root, [{ args: c.args, ...(c.stdin === undefined ? {} : { stdin: c.stdin }) }, { args: ['class', '-'], stdin: GOOD }]);
      expect(m.errors[0], 'the stop is flagged isError over MCP').toBe(true);
      expect(m.texts[0]).toContain(stop);
      expect(m.errors[1], 'the corrected request over MCP is accepted').toBe(false);
      expect(m.texts[1]).toMatch(/id: MM3-0001/u);

      const again = mm3(cli.root, ['class', '-'], { input: GOOD });
      expect(again.status, 'the corrected request in the terminal is accepted').toBe(0);
      expect(again.stdout).toMatch(/id: MM3-0001/u);
    });
  }

  it('[C-259] the YAML sent under a field of its own over MCP: the stop says it was ignored, and "stdin" fixes it', async () => {
    const { root } = tempProject(FILES);
    const m = await overMcp(root, [{ args: ['class', '-'], extra: { request: GOOD } }, { args: ['class', '-'], stdin: GOOD }]);
    expect(m.errors[0]).toBe(true);
    expect(m.texts[0]).toMatch(/✖ arguments: ignored "request" → .*"stdin"/u);
    expect(m.errors[1]).toBe(false);
    stops['ignored-field-mcp'] = `${m.texts[0]!.split('\n').filter((l) => l.startsWith('✖ arguments')).join('\n')}\n`;
  });

  it('[C-259] args sent as one string over MCP (the YAML folded into it): the stop names the array form, and the corrected call goes through', async () => {
    const { root } = tempProject(FILES);
    const m = await overMcp(root, [{ args: '["class","-"],"stdin":"mak:"' as unknown as string[] }, { args: ['class', '-'], stdin: GOOD }]);
    expect(m.errors[0]).toBe(true);
    expect(m.texts[0]).toMatch(/✖ args: must be an array of strings, got string → args: \["class","-"\]/u);
    expect(m.errors[1]).toBe(false);
    stops['args-not-array-mcp'] = `${m.texts[0]}\n`;
  });

  it('[C-259] the exact stop texts match the committed snapshot', () => {
    const accept = process.env.MM3_ACCEPT_GUIDANCE === '1';
    const now = Object.fromEntries(Object.entries(stops).sort(([a], [b]) => a.localeCompare(b)));
    if (accept) {
      writeFileSync(STOPS, renderSnapshot(now));
      return;
    }
    const before = existsSync(STOPS) ? parseSnapshot(readFileSync(STOPS, 'utf8')) : {};
    const names = [...new Set([...Object.keys(before), ...Object.keys(now)])];
    const drift = names.filter((n) => before[n] !== now[n]).map((n) => describeDrift(`stop/${n}`, before[n], now[n]));
    expect(drift.length, `a stop message changed → read the diff; if intended run \`npm run guidance:accept\` and re-run the agentic stage\n\n${drift.join('\n\n')}\n`).toBe(0);
  });
});

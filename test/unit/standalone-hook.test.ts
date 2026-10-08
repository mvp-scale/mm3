// The standalone's copy of the plugin nudge (src/setup/standalone-hook.ts): the binary embeds hooks/nudge.mjs as
// CommonJS and runs it from inside itself. Here the embedded map is faked in a child process the way
// scripts/build-binary.ts defines it, and the output must equal the real script's, byte for byte, on the same input.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { embeddedFiles } from '../../scripts/build-binary.ts';
import { HOOK_ARG, isHookLaunch } from '../../src/setup/standalone-hook.ts';

let scratch = '';
let project = '';
beforeAll(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'mm3-standalone-hook-'));
  project = path.join(scratch, 'proj');
  mkdirSync(path.join(project, '.mm3'), { recursive: true });
  const driver = path.join(scratch, 'driver.mts');
  writeFileSync(driver, `import { readFileSync } from 'node:fs';\n(globalThis as any).__MM3_EMBEDDED__ = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));\nconst { runEmbeddedHook } = await import(${JSON.stringify(pathToFileURL(path.resolve('src/setup/standalone-hook.ts')).href)});\nrunEmbeddedHook();\n`);
  writeFileSync(path.join(scratch, 'embedded.json'), JSON.stringify(embeddedFiles()));
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const input = (extra: Record<string, unknown>): string => JSON.stringify({ session_id: `s-${Math.random()}`, cwd: project, hook_event_name: 'PreToolUse', ...extra });
// each run gets its own marker folder, so the "once per session" rule does not make the second run quiet
// (Windows: node needs SystemRoot to start, and takes its temp folder from TEMP, not TMPDIR)
const env = (): Record<string, string> => {
  const tmp = mkdtempSync(path.join(scratch, 'tmp-'));
  return { PATH: process.env.PATH ?? '', TMPDIR: tmp, ...(process.platform === 'win32' ? { TEMP: tmp, TMP: tmp, SystemRoot: process.env.SystemRoot ?? '' } : {}) };
};
const viaNode = (raw: string) => spawnSync('node', ['hooks/nudge.mjs'], { input: raw, encoding: 'utf8', env: env() });
const viaBinaryPath = (raw: string) => spawnSync('node', ['--import', 'tsx', path.join(scratch, 'driver.mts'), path.join(scratch, 'embedded.json')], { input: raw, encoding: 'utf8', env: env() });

describe('the standalone hook runs the same script', () => {
  it('embeds the hook list and the nudge as CommonJS, and not the .mjs', () => {
    const files = embeddedFiles();
    expect(Object.keys(files).filter((k) => k.startsWith('hooks/')).sort()).toEqual(['hooks/hooks.json', 'hooks/nudge.cjs']);
  });

  it.each([
    ['a helper about to be spawned', { tool_name: 'Agent', tool_input: { prompt: 'x' } }],
    ['a commit', { tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }],
    ['a command that decides nothing', { tool_name: 'Bash', tool_input: { command: 'git status' } }],
    ['another tool', { tool_name: 'Read', tool_input: {} }],
  ])('prints what the node script prints for %s, and exits 0', (_name, extra) => {
    const raw = input(extra);
    const a = viaNode(raw);
    const b = viaBinaryPath(raw);
    expect(b.status).toBe(0);
    expect(b.stdout).toBe(a.stdout);
    expect(b.stderr).toBe('');
  });

  it('prints nothing and exits 0 on input that is not JSON', () => {
    const b = viaBinaryPath('not json');
    expect({ out: b.stdout, status: b.status }).toEqual({ out: '', status: 0 });
  });

  it('is a launch only for the hidden argument', () => {
    expect(HOOK_ARG).toBe('__hook');
    expect(isHookLaunch(['node', 'x', '__hook'])).toBe(false); // not inside the binary
  });
});

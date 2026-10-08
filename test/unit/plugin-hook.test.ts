// The plugin's PreToolUse nudge (hooks/hooks.json + hooks/nudge.mjs): it is declared the documented way, it speaks one
// short line at two moments (a helper about to be spawned, a commit/merge/push/PR about to happen), only in a project
// with `.mm3/`, once per moment, and on anything else it prints nothing and exits 0 so it can never stop a tool call.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SCRIPT = 'hooks/nudge.mjs';
let scratch = '';
let project = '';
let bare = '';
let n = 0;

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'mm3-hook-test-'));
  project = join(scratch, 'with-mm3');
  bare = join(scratch, 'without-mm3');
  mkdirSync(join(project, '.mm3'), { recursive: true });
  mkdirSync(join(project, 'sub'), { recursive: true });
  mkdirSync(bare);
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Runs the hook as Claude Code does: node, the input JSON on stdin; the marker folder is private to the test. */
function fire(input: unknown, opts: { env?: Record<string, string> } = {}): { out: string; status: number | null } {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', TMPDIR: scratch, ...(opts.env ?? {}) };
  const r = spawnSync('node', [SCRIPT], { input: raw, encoding: 'utf8', env });
  return { out: r.stdout, status: r.status };
}
const fresh = (): string => `s${(n += 1)}-${Date.now()}`;
const bash = (command: string, extra: Record<string, unknown> = {}) => ({ session_id: fresh(), cwd: project, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, ...extra });
const agent = (extra: Record<string, unknown> = {}) => ({ session_id: fresh(), cwd: project, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { prompt: 'x', description: 'x', subagent_type: 'general-purpose' }, ...extra });
const ctx = (out: string): string => (JSON.parse(out) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } }).hookSpecificOutput.additionalContext;

const AGENT_LINE = 'MM3 is set up here (.mm3/). Before you hand work to a helper, get the rules for it: mm3 tool, args ["agent","delegate"], then paste them into its prompt. Cite MM3-#### ids.';
const DECIDE_LINE = 'MM3 is set up here (.mm3/). Before you call this safe, done or ready, get a verdict with the mm3 tool: view (free) first, then class; args ["agent"] lists the commands. Cite the MM3-#### id.';

describe('hooks/hooks.json [C-268]', () => {
  const file = JSON.parse(readFileSync('hooks/hooks.json', 'utf8')) as Record<string, any>;

  it('[C-268] is the documented shape: a top-level "hooks" event map, PreToolUse plus the launcher\'s SessionStart, command handlers with documented fields', () => {
    expect(Object.keys(file).sort()).toEqual(['description', 'hooks']);
    expect(Object.keys(file.hooks)).toEqual(['PreToolUse', 'SessionStart']);
    for (const group of [...file.hooks.PreToolUse, ...file.hooks.SessionStart]) {
      expect(Object.keys(group).sort()).toEqual(group.matcher === undefined ? ['hooks'] : ['hooks', 'matcher']);
      for (const h of group.hooks) {
        expect(h.type).toBe('command');
        expect(Object.keys(h).every((k) => ['type', 'command', 'args', 'timeout'].includes(k))).toBe(true);
        expect(h.timeout).toBeLessThanOrEqual(10);
      }
    }
  });

  it('[C-268] fires on the helper spawn (Agent, and the older Task) and on Bash, and runs a script that ships in the plugin', () => {
    const matchers = file.hooks.PreToolUse.map((g: { matcher: string }) => g.matcher);
    expect(matchers).toEqual(['Agent|Task', 'Bash']);
    for (const group of file.hooks.PreToolUse) {
      const [h] = group.hooks;
      expect(h.command).toBe('sh');
      expect(h.args).toEqual(['${CLAUDE_PLUGIN_ROOT}/launcher/mm3-launch', 'hook']); // the launcher runs `node hooks/nudge.mjs` when Node 22.13+ is there (test/unit/launcher.test.ts)
    }
    expect(file.hooks.SessionStart[0].hooks[0].args).toEqual(['${CLAUDE_PLUGIN_ROOT}/launcher/mm3-launch', 'session-start']);
    expect(existsSync(SCRIPT)).toBe(true);
    expect(existsSync('launcher/mm3-launch')).toBe(true);
  });
});

describe('the nudge speaks at the two moments [C-268]', () => {
  it('[C-268] before a helper is spawned: one JSON line that points at mm3 agent delegate', () => {
    const r = fire(agent());
    expect(r.status).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: AGENT_LINE } });
  });

  it('[C-268] the older Task tool name is the same moment', () => {
    expect(ctx(fire(agent({ tool_name: 'Task' })).out)).toBe(AGENT_LINE);
  });

  it.each(['git commit -m "x"', 'git merge nightly', 'git push origin main', 'gh pr create --fill', 'npm test && git commit -am x', 'git -C /tmp/x push', 'FOO=1 git push', 'A=1 B=2 git -c k=v -C /x merge', '( git push )', 'echo hi | gh pr view', 'git --no-pager commit'])(
    '[C-268] before a decision (%s): one JSON line that says to get a verdict first',
    (command) => {
      const r = fire(bash(command));
      expect(r.status).toBe(0);
      expect(JSON.parse(r.out)).toEqual({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: DECIDE_LINE } });
    },
  );

  it('[C-268] the line is one line of at most 200 characters, with the id format to cite', () => {
    for (const line of [AGENT_LINE, DECIDE_LINE]) {
      expect(line.length).toBeLessThanOrEqual(200);
      expect(line).not.toMatch(/\n/u);
      expect(line).toContain('MM3-####');
    }
    expect(ctx(fire(agent()).out)).toBe(AGENT_LINE);
  });

  it('[C-268] a subagent calling Bash is a moment of its own, and the project is found from a folder below it', () => {
    expect(ctx(fire(bash('git commit -m x', { cwd: join(project, 'sub'), agent_id: 'sub-1' })).out)).toBe(DECIDE_LINE);
    expect(ctx(fire(bash('git commit -m x', { cwd: bare, agent_id: 'sub-1' }), { env: { CLAUDE_PROJECT_DIR: project } }).out)).toBe(DECIDE_LINE);
  });
});

describe('the nudge is quiet otherwise, and never fails [C-268]', () => {
  it.each(['git status', 'git log --oneline', 'ls -la', 'npm run typecheck', 'echo git commit', 'git commitment', 'gh issue list', 'git -C /x status', 'FOO=1 git log', 'gh prx', 'git'])('[C-268] prints nothing for a command that decides nothing (%s)', (command) => {
    const r = fire(bash(command));
    expect(r).toEqual({ out: '', status: 0 });
  });

  it('[C-268] prints nothing for another tool, and for another event', () => {
    expect(fire({ ...bash('git commit -m x'), tool_name: 'Read' })).toEqual({ out: '', status: 0 });
    expect(fire({ ...bash('git commit -m x'), hook_event_name: 'PostToolUse' })).toEqual({ out: '', status: 0 });
  });

  it('[C-268] prints nothing in a project without .mm3/', () => {
    expect(fire(bash('git commit -m x', { cwd: bare }))).toEqual({ out: '', status: 0 });
    expect(fire(agent({ cwd: bare }))).toEqual({ out: '', status: 0 });
  });

  it('[C-268] speaks once per moment per session, then stays quiet; another session hears it again', () => {
    const session_id = fresh();
    expect(fire(bash('git commit -m x', { session_id })).out).not.toBe('');
    expect(fire(bash('git push', { session_id }))).toEqual({ out: '', status: 0 });
    expect(fire(agent({ session_id })).out).not.toBe('');
    expect(fire(agent({ session_id }))).toEqual({ out: '', status: 0 });
    expect(fire(bash('git commit -m x', { session_id: fresh() })).out).not.toBe('');
  });

  it.each(['', 'not json', '[]', 'null', '{"tool_name":', '{"tool_name":"Bash","tool_input":{"command":42},"cwd":7}', '{"tool_name":"Bash","tool_input":null}'])(
    '[C-268] exits 0 and prints nothing on garbage input (%j)',
    (raw) => {
      expect(fire(raw)).toEqual({ out: '', status: 0 });
    },
  );
});

describe('the matcher cannot be stalled, and the marker folder is private [C-268]', () => {
  it('[C-268] a long run of option-like words returns at once (no catastrophic backtracking)', () => {
    const hostile = 'git ' + '-C -! '.repeat(50000);
    const t = Date.now();
    expect(fire(bash(hostile))).toEqual({ out: '', status: 0 });
    expect(fire(bash(hostile + 'push')).out).not.toBe('');
    // two spawns of node, so the bound is generous; the old pattern ran for minutes here
    expect(Date.now() - t).toBeLessThan(3000);
  });

  it('[C-268] the marker is made in a private folder named for the user, mode 0700 for the folder and 0600 for the marker', () => {
    if (typeof process.getuid !== 'function') return;
    const t = mkdtempSync(join(scratch, 'priv-'));
    fire(bash('git commit -m x'), { env: { TMPDIR: t } });
    const dir = join(t, `mm3-nudge-${process.getuid()}`);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    const marker = readdirSync(dir)[0] ?? '';
    expect(statSync(join(dir, marker)).mode & 0o777).toBe(0o600);
  });

  it('[C-268] a marker folder that is a symlink is not used: the nudge still speaks, every time, and writes nothing through it', () => {
    if (typeof process.getuid !== 'function') return;
    const t = mkdtempSync(join(scratch, 'link-'));
    const elsewhere = mkdtempSync(join(scratch, 'elsewhere-'));
    symlinkSync(elsewhere, join(t, `mm3-nudge-${process.getuid()}`));
    const session_id = fresh();
    expect(fire(bash('git commit -m x', { session_id }), { env: { TMPDIR: t } }).out).not.toBe('');
    expect(fire(bash('git commit -m x', { session_id }), { env: { TMPDIR: t } }).out).not.toBe('');
    expect(readdirSync(elsewhere)).toEqual([]);
  });
});

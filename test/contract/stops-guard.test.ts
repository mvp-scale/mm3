// Guard for the shape of every stop [C-197]: whatever a caller does wrong, a non-zero answer (and a plugin
// isError) says `✖ <area>: <what> → <fix>` on every ✖ line and ends with exactly one `→ see: mm3 agent <topic>`
// line that points at a card `mm3 agent` really has (or the overview). A table of triggers, one or more per
// family (request, usage, project, provider, ledger, config, setup, tools, plugin), all offline: no network, the
// fake provider, throwaway projects. A new stop that forgets its fix or its pointer fails here by name.
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runCli, type CliCtx } from '../../src/cli.ts';
import { runAgent } from '../../src/help/agent.ts';
import { appendRun } from '../../src/ledger/log.ts';
import { pathsFor } from '../../src/ledger/paths.ts';
import { handleMessage } from '../../src/mcp/protocol.ts';
import { runMcpServer } from '../../src/mcp/stdio.ts';
import { gitCommit, gitInit, tempProject, USER_TS } from '../helpers/project.ts';
import { sampleRun } from '../helpers/runs.ts';

const fixture = (name: string): string => readFileSync(`test/fixtures/requests/valid/${name}.yaml`, 'utf8');
const GOOD = fixture('class');
const SCAN = fixture('scan');
const DRILL = fixture('drill');
const swap = (text: string, from: string, to: string): string => {
  if (!text.includes(from)) throw new Error(`trigger text moved: ${JSON.stringify(from)}`);
  return text.replace(from, to);
};

// A code in parentheses after a plain description ("cannot write .mm3/lock (EACCES) → make .mm3/ writable") is a
// label, not the system's own words; the bare token, the system's sentence and the process-spawn text are not.
const RAW = /\b(EISDIR|ENOENT|ENOTDIR|EPERM|EACCES|spawnSync)\b|cannot be stringified|illegal operation/u;
const POINTER = /^→ see: mm3 agent(?: (\S+))?$/u;

/** The shape rule, on any stop text. Returns the problems (empty = fine). */
function stopProblems(text: string): string[] {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  const problems: string[] = [];
  const pointers = lines.filter((l) => l.startsWith('→ see: mm3 agent'));
  const last = lines.at(-1) ?? '';
  if (pointers.length !== 1) problems.push(`${pointers.length} pointer lines, want exactly 1`);
  const m = POINTER.exec(last);
  if (!m) problems.push(`the last line is not "→ see: mm3 agent <topic>": ${JSON.stringify(last)}`);
  else if (runAgent(m[1]).exit !== 0) problems.push(`the pointer names "${m[1]}", which mm3 agent has no card for`);
  for (const l of lines.filter((x) => x.startsWith('✖ '))) {
    if (!/^✖ [^:\n]+: .+ → .+/u.test(l)) problems.push(`no "✖ <area>: <what> → <fix>": ${JSON.stringify(l.slice(0, 100))}`);
  }
  if (RAW.test(text.replace(/ \(E[A-Z]+\)/gu, ''))) problems.push('a raw system token leaked');
  return problems;
}

function ctxFor(root: string, env: Record<string, string | undefined> = {}, over: Partial<CliCtx> = {}): CliCtx {
  return {
    env: { MM3_PROVIDER: 'fake', MM3_HOME: root, MM3_ACTOR: 'guard', XDG_CONFIG_HOME: path.join(root, 'xdg'), TYPESAFE_API_KEY: '', AI_GATEWAY_API_KEY: '', ...env },
    cwd: root,
    platform: process.platform,
    runner: () => ({ status: 1, stdout: '', stderr: 'not used' }),
    packageDir: process.cwd(),
    pkg: { name: '@mvpscale/mm3', version: '0.0.0-test' },
    homeDir: path.join(root, 'home'),
    nodeVersion: process.version,
    stdin: () => Buffer.from(''),
    io: { input: new PassThrough(), output: new PassThrough() },
    ...over,
  };
}

interface Trigger {
  name: string;
  argv: string[];
  stdin?: string;
  files?: Record<string, string>;
  setup?: (root: string) => void;
  env?: Record<string, string | undefined>;
  ctx?: (root: string) => Partial<CliCtx>;
}

const REQUEST: Trigger[] = [
  { name: 'A empty stdin', argv: ['class', '-'], stdin: '' },
  { name: 'A not a request', argv: ['class', '-'], stdin: 'hello' },
  { name: 'A tab indent', argv: ['class', '-'], stdin: swap(GOOD, '  depth: quick', '\tdepth: quick') },
  { name: 'A two documents', argv: ['class', '-'], stdin: `${GOOD}---\n${GOOD}` },
  { name: 'B missing goal', argv: ['class', '-'], stdin: swap(GOOD, '  goal: This login handler is safe to merge\n', '') },
  { name: 'B unknown depth', argv: ['class', '-'], stdin: swap(GOOD, 'depth: quick', 'depth: deep') },
  { name: 'B unknown top-level key', argv: ['class', '-'], stdin: `${GOOD}foo: 1\n` },
  { name: 'B field the verb does not take', argv: ['class', '-'], stdin: swap(GOOD, '  where:', '  over: {file: src/*.ts}\n  where:') },
  { name: 'C scan layer outside the project', argv: ['scan', '-'], stdin: swap(SCAN, 'src/handlers/*.ts', '../*.ts'), files: { 'src/handlers/a.ts': USER_TS } },
  { name: 'C class given a sweep', argv: ['class', '-'], stdin: SCAN },
  { name: 'E where outside the project', argv: ['class', '-'], stdin: swap(GOOD, '[src/user.ts:1-3]', '[../x.ts]') },
  { name: 'E where does not exist', argv: ['class', '-'], stdin: swap(GOOD, '[src/user.ts:1-3]', '[nope.ts]') },
  { name: 'DR drill parent not in the ledger', argv: ['drill', '-'], stdin: DRILL },
  { name: 'V view an unknown run id', argv: ['view', 'MM3-9999'] },
  {
    name: 'R replay a git ref that does not exist',
    argv: ['replay', '--parent', 'MM3-0001', '--compare', 'nope..HEAD', '--expect', 'injection'],
    setup: (root) => {
      gitInit(root);
      gitCommit(root);
      appendRun(pathsFor(root), sampleRun());
    },
  },
];

const USAGE: Trigger[] = [
  { name: 'D bare mm3', argv: [] },
  { name: 'D unknown command', argv: ['frob'] },
  { name: 'D whole command in one argument', argv: ['class -'] },
  { name: 'D flag before the command', argv: ['--dry-run', 'class', '-'] },
  { name: 'D missing request argument', argv: ['class'] },
  { name: 'D extra argument', argv: ['class', 'a', 'b'] },
  { name: 'D unknown flag', argv: ['class', '--bogus', '-'] },
  { name: 'D flag given twice', argv: ['class', '-', '--dry-run', '--dry-run'], stdin: GOOD },
  { name: 'D request file not found', argv: ['class', 'nope.yaml'] },
  { name: 'D request path is a folder', argv: ['class', 'src'] },
  { name: 'D help unknown topic', argv: ['help', 'frob'] },
  { name: 'D agent unknown topic', argv: ['agent', 'frob'] },
  { name: 'D view bad level', argv: ['view', 'x', '--level', '9'] },
  { name: 'D mcp with an argument', argv: ['mcp', 'extra'] },
  { name: 'D no project here', argv: ['class', '-'], stdin: GOOD, ctx: () => ({ cwd: os.tmpdir(), env: { MM3_PROVIDER: 'fake' } }) },
  { name: 'U project folder does not exist', argv: ['class', '-'], stdin: GOOD, env: { MM3_HOME: '/nonexistent/mm3-guard' } },
  { name: 'node too old', argv: ['view', 'src'], ctx: () => ({ nodeVersion: 'v20.0.0' }) },
];

const TOOLS: Trigger[] = [
  { name: 'T outcome: not a run id', argv: ['outcome', 'x', 'held', '--by', 'a'] },
  { name: 'T outcome: not an outcome', argv: ['outcome', 'MM3-0001', 'nope', '--by', 'a'] },
  { name: 'T outcome: no --by', argv: ['outcome', 'MM3-0001', 'held'] },
  { name: 'T outcome: run not in the ledger', argv: ['outcome', 'MM3-0001', 'held', '--by', 'a'] },
  { name: 'T budget set (removed)', argv: ['budget', 'set'] },
  { name: 'T budget reset (removed)', argv: ['budget', 'reset'] },
  { name: 'T budget bad subcommand', argv: ['budget', 'bogus'] },
  { name: 'T template: not a verb', argv: ['template', 'nope'] },
  { name: 'T template: --where needs --from', argv: ['template', 'class', '--where', 'x'] },
  { name: 'T template --from a missing file', argv: ['template', 'class', '--from', '/nonexistent/mm3-guard.yaml'] },
  {
    name: 'T template --from a tab-indented file',
    argv: ['template', 'class', '--from', 'bad.yaml'],
    setup: (root) => writeFileSync(path.join(root, 'bad.yaml'), 'mak:\n\tgoal: x\n'),
    ctx: (root) => ({ env: { MM3_PROVIDER: 'fake', MM3_HOME: root } }),
  },
  { name: 'T report: unknown view', argv: ['report', 'nope'] },
  { name: 'DC doctor: request file not found', argv: ['doctor', 'nope.yaml'] },
  { name: 'DC doctor: unknown flag', argv: ['doctor', '--bogus'] },
  {
    name: 'DC doctor: a config with a problem (exit 0, ✖ lines)',
    argv: ['doctor'],
    setup: (root) => {
      mkdirSync(path.join(root, '.mm3'), { recursive: true });
      writeFileSync(path.join(root, '.mm3', 'config.yaml'), 'budget:\n  usdd: 1\n');
    },
  },
];

const STATE: Trigger[] = [
  { name: 'K paid provider with no key', argv: ['class', '-'], stdin: GOOD, env: { MM3_PROVIDER: 'typesafe' } },
  { name: 'K unknown provider', argv: ['class', '-'], stdin: GOOD, env: { MM3_PROVIDER: 'nope' } },
  { name: 'K bad TYPESAFE_BASE_URL (stops at config, before any network)', argv: ['class', '-'], stdin: GOOD, env: { MM3_PROVIDER: 'typesafe', TYPESAFE_API_KEY: 'dummy-not-a-key', TYPESAFE_BASE_URL: 'notaurl' } },
  {
    name: 'L a corrupt ledger line',
    argv: ['view', 'MM3-0001'],
    setup: (root) => {
      mkdirSync(path.join(root, '.mm3'), { recursive: true });
      writeFileSync(path.join(root, '.mm3', 'log.jsonl'), 'this is not json\n');
    },
  },
  {
    name: 'L the ledger file is a folder',
    argv: ['view', 'src'],
    setup: (root) => mkdirSync(path.join(root, '.mm3', 'log.jsonl'), { recursive: true }),
  },
  {
    name: 'L .mm3 is read-only',
    argv: ['class', '-'],
    stdin: GOOD,
    setup: (root) => {
      mkdirSync(path.join(root, '.mm3'), { recursive: true });
      chmodSync(path.join(root, '.mm3'), 0o500);
    },
  },
  {
    name: 'CF a config with a problem stops a paid run',
    argv: ['class', '-'],
    stdin: GOOD,
    setup: (root) => {
      mkdirSync(path.join(root, '.mm3'), { recursive: true });
      writeFileSync(path.join(root, '.mm3', 'config.yaml'), 'budget:\n  usdd: 1\n');
    },
  },
  { name: 'CF config --load a missing file', argv: ['config', '--load', 'nope.yaml'] },
  { name: 'CF config unknown flag', argv: ['config', '--bogus'] },
];

const SETUP: Trigger[] = [
  { name: 'S init --global --user', argv: ['init', '--global', '--user'] },
  { name: 'S init --claude --no-claude', argv: ['init', '--claude', '--no-claude'] },
  { name: 'S init --key-stdin --no-key', argv: ['init', '--key-stdin', '--no-key'] },
  { name: 'S init --scope x', argv: ['init', '--scope', 'x'] },
  { name: 'S init --agents --global', argv: ['init', '--agents', '--global'] },
  { name: 'S uninstall --nope', argv: ['uninstall', '--nope'] },
  {
    name: 'S init: npm is not installed (a failed step exits 1)',
    argv: ['init', '--yes', '--no-key', '--no-claude', '--user'],
    setup: (root) => mkdirSync(path.join(root, '.git'), { recursive: true }),
    ctx: () => ({ runner: () => ({ status: 1, stdout: '', stderr: 'spawnSync npm ENOENT' }) }),
  },
  {
    name: 'S init --agents: an unmatched marker',
    argv: ['init', '--agents', '--yes'],
    setup: (root) => {
      mkdirSync(path.join(root, '.git'), { recursive: true });
      writeFileSync(path.join(root, 'AGENTS.md'), '<!-- mm3:agents -->\nhalf a block\n');
    },
  },
];

const TABLE = [...REQUEST, ...USAGE, ...TOOLS, ...STATE, ...SETUP];

describe('every stop has a fix and one pointer [C-197]', () => {
  it.each(TABLE.map((t) => [t.name, t] as const))('%s', async (_name, t) => {
    const { root } = tempProject({ 'src/user.ts': USER_TS, 'AGENTS.md': '# p\n', ...(t.files ?? {}) });
    t.setup?.(root);
    const r = await runCli(t.argv, ctxFor(root, t.env, { stdin: () => Buffer.from(t.stdin ?? ''), ...(t.ctx?.(root) ?? {}) }));
    if (t.name.includes('.mm3 is read-only') && r.exit === 0) return; // running as root ignores the chmod
    const stopped = r.exit !== 0 || (t.name.includes('exit 0, ✖ lines') && r.text.includes('✖'));
    expect(stopped, `${t.name} was meant to stop; exit ${r.exit}: ${r.text.slice(0, 200)}`).toBe(true);
    expect(stopProblems(r.text), `${t.name}\n${r.text}`).toEqual([]);
  });

  it('a stop that lost its fix or its pointer is caught (the guard itself is not vacuous)', () => {
    expect(stopProblems('✖ request: empty → start with "mak:"\n→ see: mm3 agent class\n')).toEqual([]);
    expect(stopProblems('✖ request: empty → start with "mak:"\n→ see: mm3 agent\n')).toEqual([]);
    expect(stopProblems('✖ request: empty\n→ see: mm3 agent class\n')).toHaveLength(1);
    expect(stopProblems('✖ request: empty → start with "mak:"\n')).not.toEqual([]);
    expect(stopProblems('✖ a: b → c\n→ see: mm3 agent class\n→ see: mm3 agent class\n')).not.toEqual([]);
    expect(stopProblems('✖ a: b → c\n→ see: mm3 agent nosuchcard\n')).not.toEqual([]);
    expect(stopProblems('✖ mm3: EISDIR: illegal operation on a directory, read → retry\n→ see: mm3 agent\n')).not.toEqual([]);
  });
});

describe('the plugin\'s own stops follow the same rule [C-197]', () => {
  const root = tempProject({ 'src/user.ts': USER_TS }).root;
  const ctx = ctxFor(root);
  const call = async (args: Record<string, unknown>, runOne = (a: string[], stdin?: string, project?: string) => runCli(a, { ...ctx, env: { ...ctx.env, ...(project ? { MM3_HOME: project } : {}) }, stdin: () => Buffer.from(stdin ?? '') })) => {
    const resp = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'mm3', arguments: args } }, { runOne, serverVersion: '0.0.0-test' });
    const result = resp?.result as { content: Array<{ text: string }>; isError: boolean };
    return { isError: result.isError, text: result.content[0]!.text };
  };
  const MCP: Array<[string, () => Promise<{ isError: boolean; text: string }>]> = [
    ['args is a string', () => call({ args: 'class -' })],
    ['the YAML under "request"', () => call({ args: ['class', '-'], request: GOOD })],
    ['an unknown field next to a bad request', () => call({ args: ['class', '-'], stdin: swap(GOOD, 'depth: quick', 'depth: deep'), yaml: GOOD })],
    ['stdin is an object', () => call({ args: ['class', '-'], stdin: { goal: 'x' } })],
    ['the whole command in one argument', () => call({ args: ['class -'] })],
    ['project folder does not exist', () => call({ args: ['view', 'src'], project: '/nonexistent/mm3-guard' })],
    ['no args at all', () => call({})],
    ['a call that throws', () => call({ args: ['view', 'x'] }, async () => { throw new Error('boom'); })],
  ];
  it.each(MCP)('%s', async (_name, run) => {
    const r = await run();
    expect(r.isError).toBe(true);
    expect(stopProblems(r.text), r.text).toEqual([]);
  });

  it('the JSON-RPC errors say what to send, and point', async () => {
    const run = async (msg: Record<string, unknown>) => (await handleMessage({ jsonrpc: '2.0', id: 1, ...msg }, { runOne: async () => ({ exit: 0, text: '' }), serverVersion: '0.0.0-test' }))?.error?.message ?? '';
    for (const message of [await run({ method: 'tools/call', params: { name: 'x' } }), await run({ method: 'nope/method' }), await run({ method: 'tools/list', jsonrpc: '1.0' })]) {
      expect(stopProblems(message), message).toEqual([]);
    }
  });

  it('a line that is not JSON gets the same kind of answer from the real stdio loop', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const seen: string[] = [];
    output.on('data', (d: Buffer) => seen.push(d.toString()));
    const done = runMcpServer({ input, output }, async () => ({ exit: 0, text: '' }), '0.0.0-test');
    input.write('not json at all\n');
    input.end();
    await done;
    const message = (JSON.parse(seen.join('').trim()) as { error: { message: string } }).error.message;
    expect(stopProblems(message), message).toEqual([]);
  });
});

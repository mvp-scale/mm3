// mm3 init: makes the CLI reachable and stores a key (both per user), then — inside a git project — wires
// the Claude Code plugin (project scope by default) and sets up .mm3/. npm/claude/the keychain all stand
// in for a scripted fake Runner, and a fake TTY pair stands in for the terminal. No real process is ever
// spawned here.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { envFilePath, readEnvFile } from '../../../src/setup/env-file.ts';
import { readInstallRecord } from '../../../src/setup/install-record.ts';
import { type InitCtx, type InitFlags, runInit } from '../../../src/setup/init.ts';
import type { RunResult, Runner } from '../../../src/setup/runner.ts';

// POSIX-only cases are skipped on Windows, each with its reason beside it (symlinks need a privilege there; chmod mode bits do not stop writes).
const WINDOWS = process.platform === 'win32';

const PKG = { name: '@mvpscale/mm3', version: '0.0.0' };

function fakeTty(): { input: PassThrough & { isTTY: boolean }; output: PassThrough & { isTTY: boolean } } {
  return { input: Object.assign(new PassThrough(), { isTTY: true }), output: Object.assign(new PassThrough(), { isTTY: true }) };
}

interface Scripted { calls: Array<{ cmd: string; args: string[]; input?: string }>; runner: Runner }

/** A dispatcher-style fake: matches on the command plus the leading args, so one test can script npm, claude
 *  and the keychain tool all at once. Anything not explicitly scripted fails (ENOENT-like), matching a real
 *  missing tool — every real call site here already has to handle that as "fall through", never a throw. */
function scriptedRunner(handlers: Record<string, (call: { cmd: string; args: string[]; input?: string }) => RunResult>): Scripted {
  const calls: Scripted['calls'] = [];
  const runner: Runner = (cmd, args, opts) => {
    const call = { cmd, args: [...args], input: opts?.input };
    calls.push(call);
    const twoArgKey = `${cmd} ${args[0] ?? ''} ${args[1] ?? ''}`.trim();
    const oneArgKey = `${cmd} ${args[0] ?? ''}`.trim();
    const handler = handlers[twoArgKey] ?? handlers[oneArgKey] ?? handlers[cmd];
    return handler ? handler(call) : { status: 1, stdout: '', stderr: 'not found' };
  };
  return { calls, runner };
}

function baseCtx(overrides: Partial<InitCtx> = {}): { ctx: InitCtx; home: string } {
  const home = mkdtempSync(path.join(os.tmpdir(), 'mm3-home-'));
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'mm3-cwd-'));
  const { runner } = scriptedRunner({});
  const { input, output } = fakeTty();
  const ctx: InitCtx = {
    env: { XDG_CONFIG_HOME: path.join(home, '.config'), PATH: '/does/not/exist' },
    cwd,
    platform: 'linux',
    runner,
    io: { input, output },
    packageDir: path.join(home, 'pkg'), // no package-lock.json above it: detectSelfSpec falls back to the registry spec
    pkg: PKG,
    homeDir: home,
    now: () => '2026-09-27T00:00:00Z',
    ...overrides,
  };
  return { ctx, home };
}

function unwritablePrefix(home: string): string {
  const locked = path.join(home, 'locked-prefix');
  mkdirSync(locked);
  chmodSync(locked, 0o500);
  return locked;
}

const YES_NO_CLAUDE_STDIN: InitFlags = { key: 'stdin', claude: false, yes: true };

describe('runInit: a fresh --yes --no-claude --key-stdin run, inside a git project', () => {
  // skipped on Windows: chmod mode bits do not make a folder unwritable there, so the prefix stays writable
  it.skipIf(WINDOWS)('installs --user when the global prefix is not writable and cwd has no package.json, stores the key to the env file (secret-tool absent), and creates a self-ignoring .mm3/ [C-099][C-101]', async () => {
    const { ctx, home } = baseCtx();
    if (process.getuid && process.getuid() === 0) return; // root ignores the chmod; skip under root
    const prefix = unwritablePrefix(home);
    mkdirSync(path.join(ctx.cwd, '.git')); // "inside a git project" for the plugin/project steps
    const npmCalls: string[][] = [];
    const { runner, calls } = scriptedRunner({
      'npm config': () => ({ status: 0, stdout: `${prefix}\n`, stderr: '' }),
      npm: (c) => {
        npmCalls.push(c.args);
        return { status: 0, stdout: '', stderr: '' };
      },
      'secret-tool store': () => ({ status: 1, stdout: '', stderr: 'not found' }),
    });
    ctx.runner = runner;
    const keyStdin = new PassThrough();
    ctx.keyStdin = keyStdin;
    keyStdin.write('dummy-key-value-123\n');

    const r = await runInit(YES_NO_CLAUDE_STDIN, ctx);
    expect(r.exit).toBe(0);
    expect(r.text).toContain('✔ cli: installed --user');
    expect(r.text).toContain('✔ key: stored in');
    expect(r.text).toContain('– plugin: skipped (--no-claude)');
    expect(r.text).toContain('✔ project: created .mm3/');
    expect(r.text).not.toContain('dummy-key-value-123');

    expect(npmCalls[0]).toEqual(['install', '-g', '--prefix', path.join(home, '.local'), '@mvpscale/mm3@0.0.0']);
    for (const c of calls) for (const a of c.args) expect(a).not.toContain('dummy-key-value-123');

    expect(readInstallRecord(ctx.env)).toMatchObject({ mode: 'user', npmPrefix: path.join(home, '.local') });
    expect(readEnvFile(envFilePath(ctx.env))).toMatchObject({ values: { TYPESAFE_API_KEY: 'dummy-key-value-123' } });
    expect(existsSync(path.join(ctx.cwd, '.mm3', '.gitignore'))).toBe(true);
    // config.yaml is the one file under .mm3/ meant to be committed (ledger/paths.ts's ensureDir).
    expect(readFileSync(path.join(ctx.cwd, '.mm3', '.gitignore'), 'utf8')).toBe('*\n!config.yaml\n');
  });

  it('defaults to --local when cwd has a package.json, regardless of the global prefix', async () => {
    const { ctx } = baseCtx();
    mkdirSync(path.join(ctx.cwd, '.git'));
    writeFileSync(path.join(ctx.cwd, 'package.json'), JSON.stringify({ name: 'consumer', version: '1.0.0' }));
    const { runner, calls } = scriptedRunner({
      'npm config': () => ({ status: 0, stdout: '/usr/local\n', stderr: '' }),
      npm: () => ({ status: 0, stdout: '', stderr: '' }),
    });
    ctx.runner = runner;
    ctx.keyStdin = new PassThrough({ read() {} });

    const r = await runInit({ key: 'no', claude: false, yes: true }, ctx);
    expect(r.text).toContain('✔ cli: installed --local');
    const install = calls.find((c) => c.cmd === 'npm' && c.args[0] === 'install');
    expect(install?.args).toEqual(['install', '-D', '@mvpscale/mm3@0.0.0']);
    expect(readInstallRecord(ctx.env)).toMatchObject({ mode: 'local', projectDir: ctx.cwd });
  });

  it.skipIf(WINDOWS)('an explicit --global against an unwritable prefix never runs sudo — it stops that one step with a fix', async () => {
    const { ctx, home } = baseCtx();
    if (process.getuid && process.getuid() === 0) return;
    const prefix = unwritablePrefix(home);
    const { runner, calls } = scriptedRunner({ 'npm config': () => ({ status: 0, stdout: `${prefix}\n`, stderr: '' }) });
    ctx.runner = runner;

    const r = await runInit({ mode: 'global', key: 'no', claude: false, yes: true }, ctx);
    expect(r.text).toContain('✖ cli: the global npm prefix needs sudo → re-run "mm3 init --user" instead');
    expect(calls.some((c) => c.args[0] === 'install')).toBe(false); // never attempted, never mind sudo
  });
});

describe('runInit: the plugin step defaults to project scope', () => {
  it('installs mm3@mvp-scale at project scope by default (an owner ruling: using MM3 is per project)', async () => {
    const { ctx } = baseCtx();
    mkdirSync(path.join(ctx.cwd, '.git'));
    const { runner, calls } = scriptedRunner({
      npm: () => ({ status: 0, stdout: '', stderr: '' }),
      'npm config': () => ({ status: 0, stdout: '/usr/local\n', stderr: '' }),
      'claude plugin marketplace': () => ({ status: 0, stdout: '', stderr: '' }), // not yet added
      'claude plugin list': () => ({ status: 0, stdout: '[]', stderr: '' }),
      'claude plugin install': () => ({ status: 0, stdout: '', stderr: '' }),
    });
    ctx.runner = runner;
    const r = await runInit({ mode: 'local', key: 'no', claude: true, yes: true }, ctx);
    expect(r.text).toContain('✔ plugin: installed mm3@mvp-scale (project scope)');
    const install = calls.find((c) => c.cmd === 'claude' && c.args[1] === 'install');
    expect(install?.args).toEqual(['plugin', 'install', 'mm3@mvp-scale', '--scope', 'project']);
  });

  it('--scope user overrides the project-scope default explicitly', async () => {
    const { ctx } = baseCtx();
    mkdirSync(path.join(ctx.cwd, '.git'));
    const { runner } = scriptedRunner({
      npm: () => ({ status: 0, stdout: '', stderr: '' }),
      'npm config': () => ({ status: 0, stdout: '/usr/local\n', stderr: '' }),
      'claude plugin marketplace': () => ({ status: 0, stdout: 'mvp-scale\n', stderr: '' }),
      'claude plugin list': () => ({ status: 0, stdout: '[]', stderr: '' }),
      'claude plugin install': () => ({ status: 0, stdout: '', stderr: '' }),
    });
    ctx.runner = runner;
    const r = await runInit({ mode: 'local', key: 'no', claude: true, scope: 'user', yes: true }, ctx);
    expect(r.text).toContain('✔ plugin: installed mm3@mvp-scale (user scope)');
  });
});

describe('runInit: outside a git project', () => {
  it('runs only the per-user steps (CLI, key), then stops with the exact one-line fix — never creates .mm3/, never touches the plugin [C-099]', async () => {
    const { ctx } = baseCtx();
    const { runner, calls } = scriptedRunner({
      'npm config': () => ({ status: 0, stdout: '/usr/local\n', stderr: '' }),
      npm: () => ({ status: 0, stdout: '', stderr: '' }),
    });
    ctx.runner = runner;
    const r = await runInit({ key: 'no', claude: true, yes: true }, ctx);
    const stepLines = r.text.split('\n\n')[0]!; // the step lines, before the blank line and doctor's own output
    expect(stepLines).toContain('✔ cli:');
    expect(stepLines).toContain('– project: not in a git project → cd into one and run "mm3 init" there to enable MM3 for it');
    expect(stepLines).not.toContain('plugin:'); // doctor's own output (after the blank line) does say "plugin:" — that's fine, this checks only the steps actually run
    // doctor's own report still probes overall plugin status (a "claude plugin list" call) — the thing that must
    // never happen outside a project is init's OWN plugin step actually changing anything.
    expect(calls.some((c) => c.cmd === 'claude' && (c.args.includes('add') || c.args.includes('install')))).toBe(false);
    expect(existsSync(path.join(ctx.cwd, '.mm3'))).toBe(false);
  });
});

describe('runInit: idempotent re-run', () => {
  it.skipIf(WINDOWS)('CLI already reachable, project already there: every line says so, nothing changes [C-099]', async () => {
    const { ctx, home } = baseCtx();
    mkdirSync(path.join(ctx.cwd, '.git'));
    // Pre-seed a layout npm itself would produce: <prefix>/bin/mm3 is a symlink into
    // <prefix>/lib/node_modules/@mvpscale/mm3/dist/cli.js — isPackageBin walks up from the symlink's
    // *real* path, so the bin must actually live under the package dir, not just sit beside it.
    const pkgDir = path.join(home, 'installed', 'lib', 'node_modules', '@mvpscale', 'mm3');
    mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
    writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(PKG));
    writeFileSync(path.join(pkgDir, 'dist', 'cli.js'), '#!/usr/bin/env node\n');
    chmodSync(path.join(pkgDir, 'dist', 'cli.js'), 0o755);
    const binDir = path.join(home, 'installed', 'bin');
    mkdirSync(binDir, { recursive: true });
    const bin = path.join(binDir, 'mm3');
    const { symlinkSync } = await import('node:fs');
    symlinkSync(path.join(pkgDir, 'dist', 'cli.js'), bin);
    ctx.env.PATH = binDir;

    const { runner } = scriptedRunner({});
    ctx.runner = runner;

    const r1 = await runInit({ key: 'no', claude: false, yes: true }, ctx);
    expect(r1.text).toContain('✔ project: created .mm3/');

    const r2 = await runInit({ key: 'no', claude: false, yes: true }, ctx);
    expect(r2.text).toContain(`· cli: already reachable as ${bin}`);
    expect(r2.text).toContain('· project: already has .mm3/');
  });
});

describe('runInit: a throwaway npx cache copy is never "already reachable"', () => {
  it.skipIf(WINDOWS)('mm3 resolved from inside npm\'s _npx cache still gets installed somewhere durable, not just reported as reachable', async () => {
    const { ctx, home } = baseCtx();
    mkdirSync(path.join(ctx.cwd, '.git'));
    // Mimics npm's own npx cache layout closely enough for isPackageBin to recognize it as this package too —
    // the ONLY thing that should stop "already reachable" here is the _npx path-segment check.
    const pkgDir = path.join(home, '.npm', '_npx', 'abc123', 'node_modules', '@mvpscale', 'mm3');
    mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
    writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(PKG));
    writeFileSync(path.join(pkgDir, 'dist', 'cli.js'), '#!/usr/bin/env node\n');
    chmodSync(path.join(pkgDir, 'dist', 'cli.js'), 0o755);
    const binDir = path.join(home, '.npm', '_npx', 'abc123', 'node_modules', '.bin');
    mkdirSync(binDir, { recursive: true });
    const bin = path.join(binDir, 'mm3');
    const { symlinkSync } = await import('node:fs');
    symlinkSync(path.join(pkgDir, 'dist', 'cli.js'), bin);
    ctx.env.PATH = binDir;

    const { runner, calls } = scriptedRunner({
      'npm config': () => ({ status: 0, stdout: '/usr/local\n', stderr: '' }),
      npm: () => ({ status: 0, stdout: '', stderr: '' }),
    });
    ctx.runner = runner;
    ctx.keyStdin = new PassThrough({ read() {} });

    const r = await runInit({ key: 'no', claude: false, yes: true }, ctx);
    expect(r.text).not.toContain('already reachable');
    expect(r.text).toMatch(/✔ cli: installed --(local|user|global)/);
    expect(calls.some((c) => c.cmd === 'npm' && c.args[0] === 'install')).toBe(true);
  });
});

describe('runInit: the key step', () => {
  it('an interactive run with no existing key: the hidden prompt, stored to the keychain when the tool succeeds', async () => {
    const { ctx } = baseCtx();
    const { runner, calls } = scriptedRunner({ 'secret-tool store': () => ({ status: 0, stdout: '', stderr: '' }) });
    ctx.runner = runner;
    const promise = runInit({ key: 'ask', claude: false, yes: false, mode: 'local' }, ctx);
    // Give the prompt a tick to attach before writing to it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    (ctx.io.input as PassThrough).write('typed-secret-value\n');
    await new Promise((resolve) => setTimeout(resolve, 0));
    (ctx.io.input as PassThrough).write('\n'); // provider question: Enter = default (typesafe)
    const r = await promise;
    expect(r.text).toContain('✔ key: stored in OS keychain');
    expect(r.text).not.toContain('typed-secret-value');
    const store = calls.find((c) => c.cmd === 'secret-tool' && c.args[0] === 'store');
    expect(store?.input).toBe('typed-secret-value');
  });

  it('--yes with no --key-stdin: behaves like Enter on the prompt — skipped, fake provider', async () => {
    const { ctx } = baseCtx();
    const r = await runInit({ key: 'ask', claude: false, yes: true }, ctx);
    expect(r.text).toContain('– key: skipped (no key entered');
  });

  it('a pasted value with whitespace is refused, not silently mangled', async () => {
    const { ctx } = baseCtx();
    ctx.keyStdin = new PassThrough();
    (ctx.keyStdin as PassThrough).write('has a space\n');
    const r = await runInit({ key: 'stdin', claude: false, yes: true }, ctx);
    expect(r.text).toContain('✖ key: the pasted value has whitespace');
  });

  it('a pasted value with a single quote is refused (the env file can\'t represent it)', async () => {
    const { ctx } = baseCtx();
    ctx.keyStdin = new PassThrough();
    (ctx.keyStdin as PassThrough).write("has-a-'-quote\n");
    const r = await runInit({ key: 'stdin', claude: false, yes: true }, ctx);
    expect(r.text).toContain('✖ key: the pasted value contains a single quote');
  });
});

describe('runInit: the final "next:" line [C-176]', () => {
  it('a clean run (no ✖ anywhere) points at "mm3 agent" as the first thing to run', async () => {
    const { ctx } = baseCtx();
    mkdirSync(path.join(ctx.cwd, '.git'));
    const { runner } = scriptedRunner({
      'npm config': () => ({ status: 0, stdout: '/usr/local\n', stderr: '' }),
      npm: () => ({ status: 0, stdout: '', stderr: '' }),
    });
    ctx.runner = runner;
    const r = await runInit({ mode: 'local', key: 'no', claude: false, yes: true }, ctx);
    expect(r.text).not.toContain('✖');
    expect(r.text).toContain('next: run "mm3 agent"');
    expect(r.text).not.toContain('not usable yet');
  });

  it('a partial run (a step logged ✖) never claims it\'s usable — it names the fix instead', async () => {
    const { ctx, home } = baseCtx();
    if (process.getuid && process.getuid() === 0) return; // root ignores the chmod; skip under root
    const prefix = unwritablePrefix(home);
    const { runner } = scriptedRunner({ 'npm config': () => ({ status: 0, stdout: `${prefix}\n`, stderr: '' }) });
    ctx.runner = runner;
    const r = await runInit({ mode: 'global', key: 'no', claude: false, yes: true }, ctx);
    expect(r.text).toContain('✖ cli:'); // the partial condition this test is actually exercising
    expect(r.text).toContain('next: not usable yet — fix the ✖ line(s) above, then re-run "mm3 init"');
    expect(r.text).not.toContain('ask Claude to use MM3');
  });
});

describe('runInit: a failed step is a failed run, said in words [C-176]', () => {
  it('npm not installed: exit 1, "npm was not found on PATH" and the fix, never "spawnSync npm ENOENT"', async () => {
    const { ctx } = baseCtx();
    const { runner } = scriptedRunner({ npm: () => ({ status: 1, stdout: '', stderr: 'spawnSync npm ENOENT' }) });
    ctx.runner = runner;
    const r = await runInit({ mode: 'user', key: 'no', claude: false, yes: true }, ctx);
    expect(r.exit).toBe(1);
    expect(r.text).toContain('✖ cli: npm install -g --prefix');
    expect(r.text).toContain('failed (npm was not found on PATH) → install Node.js, which includes npm, then re-run "mm3 init"');
    expect(r.text).not.toContain('ENOENT');
    expect(r.text).not.toContain('spawnSync');
  });

  it('an install that errors keeps npm\'s own first line and still exits 1', async () => {
    const { ctx } = baseCtx();
    const { runner } = scriptedRunner({ npm: () => ({ status: 1, stdout: '', stderr: 'npm ERR! network down\nmore' }) });
    ctx.runner = runner;
    const r = await runInit({ mode: 'local', key: 'no', claude: false, yes: true }, ctx);
    expect(r.exit).toBe(1);
    expect(r.text).toContain('failed → npm ERR! network down');
  });

  it('a clean run, and install advice that the folder is not on PATH yet, still exit 0', async () => {
    const { ctx } = baseCtx();
    const { runner } = scriptedRunner({ npm: () => ({ status: 0, stdout: '', stderr: '' }) });
    ctx.runner = runner;
    const r = await runInit({ mode: 'user', key: 'no', claude: false, yes: true }, ctx);
    expect(r.text).toContain('is not on PATH → add');
    expect(r.exit).toBe(0);
  });

  it('init --agents with an unmatched marker exits 1 as well', async () => {
    const { ctx } = baseCtx();
    mkdirSync(path.join(ctx.cwd, '.git'));
    writeFileSync(path.join(ctx.cwd, 'AGENTS.md'), '<!-- mm3:agents -->\nhalf a block\n');
    const r = await runInit({ agents: true, key: 'no', yes: true }, ctx);
    expect(r.text).toContain('✖ agents: AGENTS.md has an unmatched');
    expect(r.exit).toBe(1);
  });
});

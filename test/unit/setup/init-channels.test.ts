// Two install channels, one ~/.local/bin/mm3: npm links it into its package, the standalone places a real file.
// Whichever ran init first owns the install; the second says so in one `·` line and changes nothing (never two
// copies, never a silent replace). The real two-container run is `npm run parity:install` (transition stages).
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { type InitCtx, runInit } from '../../../src/setup/init.ts';
import { readInstallRecord, writeInstallRecord } from '../../../src/setup/install-record.ts';
import type { Runner } from '../../../src/setup/runner.ts';

// POSIX-only cases are skipped on Windows, each with its reason beside it (symlinks need a privilege there; chmod mode bits do not stop writes).
const WINDOWS = process.platform === 'win32';

const g = globalThis as { __MM3_EMBEDDED__?: Record<string, string> };
afterEach(() => {
  delete g.__MM3_EMBEDDED__;
});

function ctxIn(home: string, calls: string[]): InitCtx {
  const runner: Runner = (cmd, args) => {
    calls.push(`${cmd} ${args.join(' ')}`);
    return { status: 1, stdout: '', stderr: 'not found' };
  };
  const tty = () => Object.assign(new PassThrough(), { isTTY: true });
  return {
    env: { XDG_CONFIG_HOME: path.join(home, '.config'), PATH: path.join(home, '.local', 'bin') },
    cwd: mkdtempSync(path.join(os.tmpdir(), 'mm3-cwd-')),
    platform: 'linux',
    runner,
    io: { input: tty(), output: tty() },
    packageDir: path.join(home, 'pkg'),
    pkg: { name: '@mvpscale/mm3', version: '1.0.0' },
    homeDir: home,
    now: () => '2026-10-07T00:00:00Z',
  };
}

const FLAGS = { key: 'no', claude: false, yes: true } as const;
const binOf = (home: string): string => path.join(home, '.local', 'bin', 'mm3');

describe('the standalone meets an npm install', () => {
  it.skipIf(WINDOWS)('leaves npm\'s link in place, says so in one · line, writes no plugin folder and no record, and exits 0', async () => {
    g.__MM3_EMBEDDED__ = {};
    const home = mkdtempSync(path.join(os.tmpdir(), 'mm3-home-'));
    const pkg = path.join(home, '.local', 'lib', 'node_modules', '@mvpscale', 'mm3');
    mkdirSync(path.join(pkg, 'dist'), { recursive: true });
    writeFileSync(path.join(pkg, 'dist', 'cli.js'), '// npm');
    mkdirSync(path.dirname(binOf(home)), { recursive: true });
    symlinkSync(path.join(pkg, 'dist', 'cli.js'), binOf(home));
    const r = await runInit(FLAGS, ctxIn(home, []));
    expect(r.exit).toBe(0);
    expect(r.text).toMatch(/^· cli: mm3 is already installed from npm \(.*mm3 -> .*cli\.js\) → kept, not replaced/m);
    expect(lstatSync(binOf(home)).isSymbolicLink()).toBe(true);
    expect(existsSync(path.join(home, '.local', 'share', 'mm3'))).toBe(false);
    expect(readInstallRecord(ctxIn(home, []).env)).toBeUndefined();
  });
});

describe('npm meets a standalone install', () => {
  it('runs no npm command, keeps the file and the record, says so in one · line, and exits 0', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'mm3-home-'));
    mkdirSync(path.dirname(binOf(home)), { recursive: true });
    writeFileSync(binOf(home), 'standalone');
    const calls: string[] = [];
    const ctx = ctxIn(home, calls);
    writeInstallRecord(ctx.env, { mode: 'standalone', binPath: binOf(home), pluginDir: path.join(home, '.local', 'share', 'mm3', 'plugin'), version: '1.0.0', installedAt: 'x' });
    const r = await runInit(FLAGS, ctx);
    expect(r.exit).toBe(0);
    expect(r.text).toMatch(/^· cli: mm3 is already installed as the standalone \(.*mm3\) → kept, not replaced/m);
    expect(calls.filter((c) => c.startsWith('npm'))).toEqual([]);
    expect(readFileSync(binOf(home), 'utf8')).toBe('standalone');
    expect(readInstallRecord(ctx.env)?.mode).toBe('standalone');
  });

  it('does not stop a plain npm install when nothing else is there', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'mm3-home-'));
    const calls: string[] = [];
    await runInit({ ...FLAGS, mode: 'user' }, ctxIn(home, calls));
    expect(calls.some((c) => c.startsWith('npm install -g --prefix'))).toBe(true);
  });
});

// The plugin launcher with the REAL self-contained MM3 file and the REAL Claude Code: install the plugin into an isolated Claude config,
// with no Node on PATH, serve the built file from 127.0.0.1 as the release, and `claude mcp list` must show the MM3 server connected;
// a second start downloads nothing. Skipped, with the reason in the title, when the standalone file is not built (npm run build:binary,
// or MM3_BIN=<file>) or `claude` is not installed. Free: no model call, no key, no network beyond 127.0.0.1. CI: .github/workflows/standalone.yml.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cleanKits, HOST_KEY, VERSION, launcherSkipReason, makeKit, pinFile, serveRelease } from '../../helpers/launcher.ts';

const pkgVersion = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
const BIN = process.env.MM3_BIN ?? path.resolve(`dist-binary/mm3-${pkgVersion}-linux-x64`);
const claude = (process.env.PATH ?? '').split(path.delimiter).map((d) => path.join(d, 'claude')).find((p) => existsSync(p));
const skip = launcherSkipReason() ?? (process.platform !== 'linux' ? 'the standalone file under test is the Linux one' : !existsSync(BIN) ? `the standalone file is not built (npm run build:binary -- --target linux-x64, or set MM3_BIN): ${BIN}` : !claude ? 'claude is not on PATH' : undefined);

if (skip !== undefined && process.env.MM3_REQUIRE_LAUNCHER) it('[C-281] the real-Claude launcher test must run here (MM3_REQUIRE_LAUNCHER is set)', () => { throw new Error(`launcher e2e is skipped: ${skip}`); });

const closers: Array<() => Promise<void>> = [];
afterAll(async () => { await Promise.all(closers.splice(0).map((c) => c())); cleanKits(); });

function run(cmd: string, args: string[], env: Record<string, string>, cwd: string): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { env, cwd });
    let out = '';
    c.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    c.stderr.on('data', (d: Buffer) => { out += d.toString(); });
    const t = setTimeout(() => c.kill('SIGKILL'), 90_000);
    c.on('close', (code) => { clearTimeout(t); resolve({ code, out }); });
  });
}

describe.skipIf(skip !== undefined)(`launcher with real Claude Code and the real standalone${skip ? ` (skipped: ${skip})` : ''}`, () => {
  it('[C-281] [C-283] no Node: claude mcp list shows MM3 connected after one verified download, and the next start downloads nothing', async () => {
    const kit = makeKit('none');
    symlinkSync(claude!, path.join(kit.tools, 'claude'));
    const gitPath = (process.env.PATH ?? '').split(path.delimiter).map((d) => path.join(d, 'git')).find((p) => existsSync(p));
    if (gitPath) symlinkSync(gitPath, path.join(kit.tools, 'git'));
    // a plugin folder exactly as the repo ships it, with the pin file naming the built file
    const market = path.join(kit.root, 'marketplace');
    for (const d of ['.claude-plugin', 'hooks', 'launcher', 'skills']) cpSync(path.resolve(d), path.join(market, d), { recursive: true });
    cpSync(path.resolve('bin/mm3.mjs'), path.join(market, 'bin', 'mm3.mjs'));
    const asset = `mm3-${VERSION}-${HOST_KEY}`;
    const realKit = { ...kit, plugin: market };
    pinFile(realKit, BIN, HOST_KEY, asset);
    const rel = await serveRelease({ [asset]: BIN });
    closers.push(rel.close);
    const proj = path.join(kit.root, 'proj');
    mkdirSync(proj);
    const env = { ...kit.env, CLAUDE_CONFIG_DIR: path.join(kit.root, 'cfg'), MM3_TEST_RELEASE_URL: rel.url, CLAUDE_CODE_DISABLE_AUTOUPDATE: '1', DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
    if (gitPath) spawnSync(gitPath, ['init', '-q', '.'], { cwd: proj });
    expect((await run('claude', ['plugin', 'marketplace', 'add', market], env, proj)).code).toBe(0);
    expect((await run('claude', ['plugin', 'install', 'mm3@mvp-scale'], env, proj)).code).toBe(0);

    const first = await run('claude', ['mcp', 'list'], env, proj);
    expect(first.out).toMatch(/plugin:mm3:mm3: .*mm3-launch mcp - ✔ Connected/u);
    expect(rel.requests.filter((r) => r.includes(asset)).length).toBeGreaterThanOrEqual(1);
    expect(existsSync(path.join(kit.home, '.local', 'bin', 'mm3'))).toBe(true);
    const seen = rel.requests.length;

    const second = await run('claude', ['mcp', 'list'], env, proj);
    expect(second.out).toMatch(/✔ Connected/u);
    expect(rel.requests.length).toBe(seen);
  }, 180_000);
});

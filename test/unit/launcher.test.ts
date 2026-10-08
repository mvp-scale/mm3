// The plugin launcher (launcher/mm3-launch), run for real with `sh` against a fake GitHub Release on 127.0.0.1 (no real network) and a
// stand-in for the self-contained MM3 file. Every case gets its own private PATH, so "no Node" is true no matter what runs the tests.
// The real standalone file + real Claude Code run is test/e2e/cli/launcher-claude.test.ts; Windows is the standalone workflow's job.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MIN_NODE_LABEL } from '../../src/util/node-version.ts';
import { cleanKits, FAKE_STANDALONE, HOST_KEY, INITIALIZE, VERSION, launcherSkipReason, makeKit, pinFile, runLauncher, serveRelease, type Kit, type NodeKind, type Release } from '../helpers/launcher.ts';

const skip = launcherSkipReason();
if (skip !== undefined && process.env.MM3_REQUIRE_LAUNCHER) it('[C-281] the launcher tests must run here (MM3_REQUIRE_LAUNCHER is set)', () => { throw new Error(`launcher tests are skipped: ${skip}`); });
const closers: Array<() => Promise<void>> = [];
afterAll(async () => { await Promise.all(closers.splice(0).map((c) => c())); cleanKits(); }); // not afterEach: the cases run concurrently

/** A kit with the fake standalone pinned and served; the release is closed after the test. */
async function setup(node: NodeKind, o: { uname?: { s: string; m: string }; pinKey?: string; tamper?: boolean; slow?: number; truncateAfter?: number; serve?: boolean } = {}): Promise<{ kit: Kit; rel: Release; env: Record<string, string>; asset: string }> {
  const kit = makeKit(node, o.uname ? { uname: o.uname } : {});
  const bin = path.join(kit.root, 'fake-standalone');
  writeFileSync(bin, FAKE_STANDALONE); // 0644 on purpose: a release download carries no execute bit
  const key = o.pinKey ?? HOST_KEY;
  const asset = `mm3-${VERSION}-${key}`;
  pinFile(kit, bin, key, asset);
  const served = path.join(kit.root, 'served');
  mkdirSync(served);
  writeFileSync(path.join(served, asset), o.tamper ? `${FAKE_STANDALONE}# one byte more\n` : FAKE_STANDALONE);
  const rel = await serveRelease({ [asset]: path.join(served, asset) }, { ...(o.slow ? { slowMsPerChunk: o.slow } : {}), ...(o.truncateAfter !== undefined ? { truncateAfter: o.truncateAfter } : {}) });
  closers.push(rel.close);
  return { kit, rel, env: { MM3_TEST_RELEASE_URL: rel.url }, asset };
}
const installed = (kit: Kit): string => path.join(kit.home, '.local', 'bin', 'mm3');
const partFiles = (kit: Kit): string[] => (existsSync(kit.data) ? readdirSync(kit.data).filter((f) => f.includes('.part.')) : []);

describe.skipIf(skip !== undefined).concurrent(`plugin launcher${skip ? ` (skipped: ${skip})` : ''}`, () => {
  it('[C-280] Node 22.13+ present: starts MM3 exactly as before (node bin/mm3.mjs mcp), downloads and writes nothing, says nothing', async () => {
    const { kit, rel, env } = await setup('node22');
    const r = await runLauncher(kit, 'mcp', { stdin: INITIALIZE, env });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout.trim().split('\n')[0]!).result.serverInfo.name).toBe('mm3');
    expect(r.stderr).toBe('');
    expect(rel.requests).toEqual([]);
    expect(existsSync(path.join(kit.home, '.local'))).toBe(false);
    expect(existsSync(kit.data)).toBe(false);
    const calls = readFileSync(kit.nodeLog, 'utf8').trim().split('\n');
    expect(calls[0]).toBe('node --version');
    expect(calls[1]).toMatch(/^node .*\/plugin\/bin\/mm3\.mjs --version$/u); // the one extra start: "will MM3 start here?"
    expect(calls[2]).toMatch(/^node .*\/plugin\/bin\/mm3\.mjs mcp$/u);
  }, 30_000);

  it('[C-280] Node 22.13+ present: the hook runs node hooks/nudge.mjs with no probe, and prints what the nudge prints', async () => {
    const { kit, env } = await setup('node22');
    const project = path.join(kit.root, 'proj');
    mkdirSync(path.join(project, '.mm3'), { recursive: true });
    const input = JSON.stringify({ session_id: 's1', cwd: project, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -m x' } });
    const r = await runLauncher(kit, 'hook', { stdin: input, env: { ...env, TMPDIR: kit.root } });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toContain('get a verdict');
    const calls = readFileSync(kit.nodeLog, 'utf8').trim().split('\n');
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatch(/^node .*\/plugin\/hooks\/nudge\.mjs$/u);
  }, 30_000);

  it('[C-280] Node 22.13+ present: the start-up message is silent and fetches nothing', async () => {
    const { kit, rel, env } = await setup('node22');
    const r = await runLauncher(kit, 'session-start', { env });
    expect(r).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(rel.requests).toEqual([]);
  }, 30_000);

  it('[C-281] [C-283] no Node: fetches the file once, checks it against the pinned hash, makes it executable, installs it, runs it', async () => {
    const { kit, rel, env, asset } = await setup('none');
    expect(spawnSync(path.join(kit.tools, 'sh'), ['-c', 'command -v node'], { env: { PATH: kit.tools } }).status).not.toBe(0); // the launcher's PATH really has no node
    const r = await runLauncher(kit, 'mcp', { stdin: INITIALIZE, env });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('FAKE-STANDALONE-MCP');
    expect(r.stderr).toContain('Node.js is not installed. Using the self-contained MM3 build instead.');
    expect(r.stderr).toContain(`downloading the self-contained MM3 ${VERSION} for ${HOST_KEY}`);
    expect(r.stderr).toContain('checked: sha256 matches the value pinned in the plugin');
    expect(r.stderr).toContain('what I did: used the self-contained MM3 because Node.js is not installed.');
    expect(rel.requests).toEqual([`GET /${asset}`]);
    expect(statSync(installed(kit)).mode & 0o111).not.toBe(0); // chmod by the launcher, after a download that had no execute bit
    expect(partFiles(kit)).toEqual([]);
    expect(existsSync(path.join(kit.data, '.lock'))).toBe(false);
  }, 30_000);

  it('[C-281] Node 20.20.2: the same fallback, and the message names the old version', async () => {
    const { kit, rel, env } = await setup('node20');
    const r = await runLauncher(kit, 'mcp', { stdin: INITIALIZE, env });
    expect(r.code).toBe(0);
    expect(r.stderr).toContain(`Node.js v20.20.2 is older than the ${MIN_NODE_LABEL} that MM3 needs. Using the self-contained MM3 build instead.`);
    expect(r.stdout).toContain('FAKE-STANDALONE-MCP');
    expect(rel.requests).toHaveLength(1);
  }, 30_000);

  it('[C-281] a Node 22 that cannot start MM3: the same fallback, and it says MM3 would not start', async () => {
    const { kit, rel, env } = await setup('node22-broken');
    const r = await runLauncher(kit, 'mcp', { stdin: INITIALIZE, env });
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/MM3 would not start on Node\.js v\d+\.\d+\.\d+\. Using the self-contained MM3 build instead\./u);
    expect(r.stdout).toContain('FAKE-STANDALONE-MCP');
    expect(rel.requests).toHaveLength(1);
  }, 30_000);

  it('[C-282] a download that is not the pinned file: installs nothing, leaves nothing, says so in one ✖ line', async () => {
    const { kit, rel, env } = await setup('none', { tamper: true });
    const r = await runLauncher(kit, 'mcp', { stdin: INITIALIZE, env });
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/mm3: ✖ the download does not match the checksum pinned in this plugin \(expected [0-9a-f]{64}, got [0-9a-f]{64}\) → NOT installed/u);
    expect(rel.requests).toHaveLength(1);
    expect(existsSync(path.join(kit.home, '.local'))).toBe(false);
    expect(partFiles(kit)).toEqual([]);
    expect(existsSync(path.join(kit.data, '.lock'))).toBe(false);
  }, 30_000);

  it('[C-282] no network (nothing listening): installs nothing and says what to check', async () => {
    const { kit, rel, env } = await setup('none');
    await rel.close();
    const r = await runLauncher(kit, 'mcp', { stdin: INITIALIZE, env });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('mm3: ✖ could not download');
    expect(r.stderr).toContain('check your internet connection (or proxy) and restart Claude Code; nothing was installed');
    expect(existsSync(path.join(kit.home, '.local'))).toBe(false);
    expect(partFiles(kit)).toEqual([]);
  }, 30_000);

  it('[C-282] a connection cut half way: installs nothing and leaves no partial file', async () => {
    const { kit, env } = await setup('none', { truncateAfter: 100 });
    const r = await runLauncher(kit, 'mcp', { stdin: INITIALIZE, env });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('mm3: ✖ could not download');
    expect(existsSync(path.join(kit.home, '.local'))).toBe(false);
    expect(partFiles(kit)).toEqual([]);
  }, 30_000);

  it('[C-283] the second start finds the installed file and downloads nothing', async () => {
    const { kit, rel, env } = await setup('none');
    expect((await runLauncher(kit, 'mcp', { stdin: INITIALIZE, env })).code).toBe(0);
    expect(rel.requests).toHaveLength(1);
    const second = await runLauncher(kit, 'mcp', { stdin: INITIALIZE, env });
    expect(second.code).toBe(0);
    expect(second.stdout).toContain('FAKE-STANDALONE-MCP');
    expect(second.stderr).toContain('Node.js is not installed. Using the self-contained MM3 build instead.');
    expect(second.stderr).not.toContain('downloading');
    expect(rel.requests).toHaveLength(1);
  }, 30_000);

  it('[C-283] the hook falls back to the installed file (`__hook`) once there is one, and is silent before that', async () => {
    const { kit, env } = await setup('none');
    const before = await runLauncher(kit, 'hook', { stdin: '{}', env });
    expect(before).toEqual({ code: 0, stdout: '', stderr: '' });
    await runLauncher(kit, 'mcp', { stdin: INITIALIZE, env });
    const after = await runLauncher(kit, 'hook', { stdin: '{}', env });
    expect(after.code).toBe(0);
    expect(after.stdout.trim()).toBe('{"fake":"standalone-hook"}');
  }, 30_000);

  it('[C-283] the start-up message: starts the download in the background, tells the person, and says "installed" once afterwards', async () => {
    const { kit, rel, env } = await setup('none');
    const first = await runLauncher(kit, 'session-start', { env });
    expect(first.code).toBe(0);
    expect(JSON.parse(first.stdout).systemMessage).toContain('Node.js is not installed. Downloading its self-contained build once');
    for (let i = 0; i < 100 && !existsSync(path.join(kit.data, 'install.ok')); i++) await new Promise((ok) => setTimeout(ok, 100));
    expect(existsSync(path.join(kit.data, 'install.ok'))).toBe(true);
    expect(rel.requests).toHaveLength(1);
    const second = await runLauncher(kit, 'session-start', { env });
    expect(JSON.parse(second.stdout).systemMessage).toContain('MM3 is installed (self-contained build, no Node needed)');
    expect((await runLauncher(kit, 'session-start', { env })).stdout).toBe('');
    expect(rel.requests).toHaveLength(1);
  }, 30_000);

  it.each([
    ['Linux', 'x86_64', 'linux-x64'], ['Linux', 'aarch64', 'linux-arm64'], ['Darwin', 'arm64', 'darwin-arm64'], ['Darwin', 'x86_64', 'darwin-x64'],
  ])('[C-284] %s %s: asks for the %s build, checks it, installs it (the sh launcher maps uname to all four POSIX keys)', async (s, m, key) => {
    const { kit, rel, env, asset } = await setup('none', { uname: { s, m }, pinKey: key });
    const r = await runLauncher(kit, 'mcp', { stdin: INITIALIZE, env });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('FAKE-STANDALONE-MCP');
    expect(r.stderr).toContain(`downloading the self-contained MM3 ${VERSION} for ${key}`);
    expect(r.stderr).toContain('checked: sha256 matches the value pinned in the plugin');
    expect(rel.requests).toEqual([`GET /${asset}`]);
    expect(asset).toBe(`mm3-${VERSION}-${key}`);
  }, 30_000);

  it('[C-284] a machine with no build listed (here Linux riscv64): no download, one ✖ line that says what to do', async () => {
    const { kit, rel, env } = await setup('none', { uname: { s: 'Linux', m: 'riscv64' }, pinKey: 'linux-x64' }); // the pin lists no linux-riscv64 build
    const r = await runLauncher(kit, 'mcp', { stdin: INITIALIZE, env });
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain(`mm3: ✖ no self-contained MM3 build for linux-riscv64 (Node.js is not installed) → install Node.js ${MIN_NODE_LABEL} or newer from https://nodejs.org, then restart Claude Code`);
    expect(rel.requests).toEqual([]);
    expect(existsSync(kit.data)).toBe(false);
    const msg = await runLauncher(kit, 'session-start', { env });
    expect(JSON.parse(msg.stdout).systemMessage).toContain('no self-contained MM3 build for linux-riscv64.');
    expect(rel.requests).toEqual([]);
  }, 30_000);

  it('[C-283] a slow download: answers Claude Code\'s handshake itself, then hands over to the real server and says the tools changed', async () => {
    const { kit, env } = await setup('none', { slow: 400 });
    // ~13 chunks x 400 ms is longer than the 1 s allowance set here, so the stub answers first
    writeFileSync(path.join(kit.root, 'served', `mm3-${VERSION}-${HOST_KEY}`), FAKE_STANDALONE + '#'.repeat(200_000));
    pinFile(kit, path.join(kit.root, 'served', `mm3-${VERSION}-${HOST_KEY}`));
    const child = spawn(path.join(kit.tools, 'sh'), [path.join(kit.plugin, 'launcher', 'mm3-launch'), 'mcp'], { env: { ...kit.env, ...env, MM3_TEST_WAIT: '1' }, cwd: kit.home });
    let out = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    const exited = new Promise<number | null>((ok) => child.on('close', ok));
    child.stdin.write(INITIALIZE);
    const waitFor = async (re: RegExp, ms: number): Promise<void> => { for (let i = 0; i < ms / 100 && !re.test(out); i++) await new Promise((ok) => setTimeout(ok, 100)); };
    await waitFor(/"installing"/u, 15_000);
    expect(out).toContain('"serverInfo":{"name":"mm3","version":"installing"}');
    await waitFor(/tools\/list_changed/u, 30_000);
    expect(out).toContain('notifications/tools/list_changed');
    child.stdin.end();
    expect(await exited).toBe(0);
  }, 60_000);
});

it('[C-285] the Node floor in the launcher (sh and PowerShell) is the one mm3 enforces and package.json states', () => {
  const sh = /^MIN_NODE=(\d+\.\d+)\b/mu.exec(readFileSync('launcher/mm3-launch', 'utf8'))?.[1];
  const ps = /^\$MinNode\s*=\s*'(\d+\.\d+)'/mu.exec(readFileSync('launcher/mm3-launch.ps1', 'utf8'))?.[1];
  const engines = (JSON.parse(readFileSync('package.json', 'utf8')) as { engines: { node: string } }).engines.node;
  expect(sh).toBe(MIN_NODE_LABEL);
  expect(ps).toBe(MIN_NODE_LABEL);
  expect(engines).toBe(`>=${MIN_NODE_LABEL}`);
});

it('the PowerShell launcher computes sha256 with .NET, not Get-FileHash: Claude Code starts it with no PSModulePath, so module cmdlets are "not recognized"', () => {
  const ps = readFileSync('launcher/mm3-launch.ps1', 'utf8').split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
  expect(ps).not.toMatch(/Get-FileHash/u);
  expect(ps).toMatch(/SHA256\]::Create\(\)/u);
});

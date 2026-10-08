// Test kit for the plugin launcher (launcher/mm3-launch): a throwaway plugin folder, a private PATH of symlinked tools (so a test can
// have NO node, a Node 20, or the real Node), a stand-in for the self-contained MM3 file, and a fake GitHub Release served from
// 127.0.0.1 (never the real network). Used by test/unit/launcher.test.ts and test/e2e/cli/launcher-claude.test.ts.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmodSync, copyFileSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { renderChecksums } from '../../scripts/check-launcher.ts';

export const LAUNCHER = path.resolve('launcher/mm3-launch');
export const VERSION = '9.9.9';

const REQUIRED = ['sh', 'sed', 'awk', 'cat', 'chmod', 'cp', 'curl', 'cut', 'date', 'dirname', 'basename', 'head', 'ls', 'mkdir', 'mkfifo', 'mktemp', 'mv', 'rm', 'sleep', 'tail', 'tr', 'uname', 'sha256sum'];
const OPTIONAL = ['nohup', 'setsid', 'env', 'touch', 'ln', 'kill'];

function onPath(name: string): string | undefined {
  for (const d of (process.env.PATH ?? '').split(path.delimiter)) {
    const p = path.join(d, name);
    if (d && existsSync(p)) return p;
  }
  return undefined;
}

/** Why the shell tests cannot run on this machine, or undefined when they can. */
export function launcherSkipReason(): string | undefined {
  if (process.platform === 'win32') return 'the launcher is a POSIX shell script; Windows is proven by the standalone workflow on a real Windows runner';
  const missing = REQUIRED.filter((t) => onPath(t) === undefined);
  return missing.length ? `needs ${missing.join(', ')} on PATH` : undefined;
}

/** The OS-CPU key the launcher derives from `uname -s` / `uname -m` (the asset it looks for in checksums.json). */
export function keyFor(uname: { s: string; m: string }): string {
  const os_ = uname.s === 'Linux' ? 'linux' : uname.s === 'Darwin' ? 'darwin' : uname.s;
  const cpu = uname.m === 'x86_64' || uname.m === 'amd64' ? 'x64' : uname.m === 'aarch64' || uname.m === 'arm64' ? 'arm64' : uname.m;
  return `${os_}-${cpu}`;
}
export const HOST_KEY = keyFor({ s: process.platform === 'darwin' ? 'Darwin' : 'Linux', m: process.arch === 'arm64' ? 'arm64' : 'x86_64' });

export type NodeKind = 'none' | 'node20' | 'node22' | 'node22-broken';

export interface Kit {
  root: string;           // scratch folder
  plugin: string;         // plugin root (launcher/, bin/, hooks/)
  home: string;
  data: string;           // CLAUDE_PLUGIN_DATA
  tools: string;          // the private PATH
  nodeLog: string;        // every `node ...` call the node22 shim saw
  env: Record<string, string>;
}

/** A fake "self-contained MM3": answers --version, init (copies itself to ~/.local/bin/mm3), mcp (one fixed reply), __hook. */
export const FAKE_STANDALONE = `#!/bin/sh
case "$1" in
  --version) echo "mm3 fake-standalone" ;;
  init) mkdir -p "$HOME/.local/bin" && cp "$0" "$HOME/.local/bin/mm3" && echo "✔ cli: installed" ;;
  mcp) read -r line; echo '{"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"FAKE-STANDALONE-MCP"}}}' ;;
  __hook) cat >/dev/null; echo '{"fake":"standalone-hook"}' ;;
esac
`;

export const sha256File = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

const roots: string[] = [];
/** Removes every scratch folder makeKit made (call from afterAll). */
export function cleanKits(): void {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
}

export function makeKit(node: NodeKind, opts: { uname?: { s: string; m: string } } = {}): Kit {
  const root = mkdtempSync(path.join(os.tmpdir(), 'mm3-launcher-'));
  roots.push(root);
  const plugin = path.join(root, 'plugin');
  const tools = path.join(root, 'tools');
  const home = path.join(root, 'home');
  const data = path.join(root, 'data');
  for (const d of [path.join(plugin, 'launcher'), path.join(plugin, 'bin'), path.join(plugin, 'hooks'), tools, home]) mkdirSync(d, { recursive: true });
  copyFileSync(LAUNCHER, path.join(plugin, 'launcher', 'mm3-launch'));
  copyFileSync(path.resolve('launcher/mm3-launch.ps1'), path.join(plugin, 'launcher', 'mm3-launch.ps1'));
  symlinkSync(path.resolve('hooks/nudge.mjs'), path.join(plugin, 'hooks', 'nudge.mjs'));
  if (node === 'node22-broken') writeFileSync(path.join(plugin, 'bin', 'mm3.mjs'), 'throw new Error("boom");\n');
  else symlinkSync(path.resolve('bin/mm3.mjs'), path.join(plugin, 'bin', 'mm3.mjs'));
  for (const t of [...REQUIRED, ...OPTIONAL]) {
    const p = onPath(t);
    if (p) symlinkSync(p, path.join(tools, t));
  }
  const nodeLog = path.join(root, 'node-calls.log');
  if (node === 'node20') writeFileSync(path.join(tools, 'node'), '#!/bin/sh\n[ "$1" = --version ] && echo v20.20.2\n');
  if (node === 'node22' || node === 'node22-broken') writeFileSync(path.join(tools, 'node'), `#!/bin/sh\necho "node $*" >> "${nodeLog}"\nexec "${process.execPath}" "$@"\n`);
  if (node !== 'none') chmodSync(path.join(tools, 'node'), 0o755);
  if (opts.uname) rmSync(path.join(tools, 'uname'), { force: true });
  if (opts.uname) writeFileSync(path.join(tools, 'uname'), `#!/bin/sh\ncase "$1" in -s) echo ${opts.uname.s};; -m) echo ${opts.uname.m};; *) echo ${opts.uname.s};; esac\n`, { mode: 0o755 });
  return { root, plugin, home, data, tools, nodeLog, env: { PATH: tools, HOME: home, CLAUDE_PLUGIN_DATA: data, MM3_TEST_WAIT: '20' } };
}

/** Writes launcher/checksums.json into the kit's plugin for the file at `binFile` (its real hash), served at `base`. */
export function pinFile(kit: Kit, binFile: string, key = HOST_KEY, name = `mm3-${VERSION}-${key}`, tamperedHash?: string): void {
  const text = renderChecksums({
    version: VERSION,
    base: `https://github.com/mvp-scale/mm3/releases/download/v${VERSION}`,
    assets: { [key]: { file: name, sha256: tamperedHash ?? sha256File(binFile), bytes: statSync(binFile).size } },
  });
  writeFileSync(path.join(kit.plugin, 'launcher', 'checksums.json'), text);
}

export interface Release { url: string; requests: string[]; close: () => Promise<void> }
export interface ReleaseOpts { slowMsPerChunk?: number; truncateAfter?: number }

/** Serves `files` (asset name to a path on disk) at 127.0.0.1:<port>. Like GitHub's download, the bytes carry no execute bit. */
export async function serveRelease(files: Record<string, string>, opts: ReleaseOpts = {}): Promise<Release> {
  const requests: string[] = [];
  const server: Server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    const file = files[(req.url ?? '').replace(/^\//u, '')];
    if (!file) { res.writeHead(404); res.end('no'); return; }
    const size = statSync(file).size;
    res.writeHead(200, { 'content-length': size });
    const stream = createReadStream(file, { highWaterMark: 16 * 1024 });
    let sent = 0;
    stream.on('data', (chunk: string | Buffer) => {
      const b = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      sent += b.length;
      if (opts.truncateAfter !== undefined && sent > opts.truncateAfter) { stream.destroy(); res.destroy(); return; }
      if (opts.slowMsPerChunk) { stream.pause(); res.write(b, () => setTimeout(() => stream.resume(), opts.slowMsPerChunk)); } else res.write(b);
    });
    stream.on('end', () => res.end());
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, requests, close: () => new Promise<void>((ok) => { server.closeAllConnections(); server.close(() => ok()); }) };
}

export interface Ran { code: number | null; stdout: string; stderr: string }

/** Runs `sh <plugin>/launcher/mm3-launch <mode>` in the kit's private environment. `stdin` is written then closed. */
export function runLauncher(kit: Kit, mode: string, opts: { stdin?: string; env?: Record<string, string>; cwd?: string; timeoutMs?: number } = {}): Promise<Ran> {
  return new Promise((resolve) => {
    const child = spawn(path.join(kit.tools, 'sh'), [path.join(kit.plugin, 'launcher', 'mm3-launch'), mode], { env: { ...kit.env, ...(opts.env ?? {}) }, cwd: opts.cwd ?? kit.home, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 40_000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    child.stdin.on('error', () => undefined);
    child.stdin.end(opts.stdin ?? '');
  });
}

export const INITIALIZE = `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } })}\n`;

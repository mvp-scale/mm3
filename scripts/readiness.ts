/**
 * `npm run readiness`: the install-readiness check. For every supported agent (scripts/readiness/agents.json) on a clean
 * Ubuntu 24.04 container, across a ladder of Node states (none, stock 18, 20, 22.12, 22.13, 24), it runs the agent's own
 * commands to add MM3 and reads back what the agent registered, then appends one row per cell to test/readiness/ledger.jsonl.
 *   L1  the marketplace and plugin install (or the direct MCP registration) ran without error
 *   L2  the agent's own list command shows the plugin / the MCP server
 * Each route runs twice: the primary (the plugin folder as shipped, started with node) and the failover (the same folder with
 * the launcher manifests, the standalone served from 127.0.0.1 and checked against a pin written for the run). Nothing past L2
 * is tested: no key, no sign-in, no model call. Linux only, on purpose: an agent that takes the same commands here takes them elsewhere.
 * Not part of `npm test`, the ceremony or CI; run it when the Node floor, the standalone, the launcher, the plugin manifests or the
 * supported agents change. Needs Docker, the network (the image installs the agents), and `npm run build:binary -- --target linux-x64`.
 *   npm run readiness [-- --agents claude,codex --nodes none,22.13 --rebuild --dry-run --no-ledger]
 *   npm run readiness -- --report        the table for the newest run in the ledger
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

const LEDGER = 'test/readiness/ledger.jsonl';
const IMAGE = 'mm3-readiness:ubuntu-24.04';
const SCHEMA = 1;
const MAX_PARALLEL = 3; // AGENTS.md rule 1: stay light on shared machines

interface Route { name: string; steps: string[]; list: string | null; expect: string | null; starts?: boolean }
interface Agent { id: string; name?: string; version: string; routes: Route[] }
export interface NodeState { id: string; dir?: string; label: string }
export type Level = 'ok' | 'fail' | 'skip' | 'n/a';
export interface Cell {
  kind: 'cell'; run: string; ts: string; agent: string; agentVersion: string; route: string; variant: 'primary' | 'failover'; node: string; nodeId: string;
  boots: Level; l1: Level; l2: Level; fetched: boolean; secondStart: boolean; firstError: string; how: string[]; ms: number;
}

export const NODES: NodeState[] = [
  { id: 'none', label: 'no Node' },
  { id: 'stock', label: 'stock (apt)' },
  { id: '20', dir: '20.18.0', label: '20.18' },
  { id: '22.12', dir: '22.12.0', label: '22.12' },
  { id: '22.13', dir: '22.13.0', label: '22.13' },
  { id: '24', dir: '24.21.0', label: '24.21' },
];

const sq = (s: string): string => `'${s.replace(/'/gu, `'\\''`)}'`;
const sha = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex');
const first = (s: string): string => (s.split('\n').find((l) => l.trim() !== '') ?? '').replace(/\u001b\[[0-9;?]*[A-Za-z]/gu, '').trim().slice(0, 160);

/** Fills a route's placeholders for one plugin folder and one way of starting the server. */
export function fill(text: string, src: string, variant: 'primary' | 'failover'): string {
  const exe = variant === 'primary' ? 'node' : `${src}/launcher/mm3-launch`;
  const argv = variant === 'primary' ? [`${src}/bin/mm3.mjs`, 'mcp'] : ['mcp'];
  return text
    .replaceAll('{src}', src).replaceAll('{name}', path.basename(src))
    .replaceAll('{jsonargv}', JSON.stringify(argv)).replaceAll('{jsoncmd}', JSON.stringify([exe, ...argv]))
    .replaceAll('{exe}', exe).replaceAll('{argv}', argv.join(' '));
}

/** The shell that runs one cell inside the container: pick the Node, boot the agent, run the steps, print the list output between markers. */
export function cellScript(node: NodeState, agent: Agent, route: Route, src: string, variant: 'primary' | 'failover'): string {
  const steps = route.steps.map((s) => fill(s, src, variant));
  const pick = node.id === 'none' ? 'mv /usr/bin/node /usr/bin/node.off 2>/dev/null' : node.id === 'stock' ? ':' : `export PATH=/opt/node/${node.dir}/bin:$PATH`;
  const L = [
    'export HOME=/root PATH="/root/.local/bin:$PATH"', pick,
    'git config --global --add safe.directory "*"',
    'mkdir -p /root/.gemini && printf \'{"/pj":"TRUST_FOLDER","/mkt":"TRUST_FOLDER","/mktl":"TRUST_FOLDER"}\' > /root/.gemini/trustedFolders.json',
    'export GEMINI_CLI_TRUSTED_FOLDERS_PATH=/root/.gemini/trustedFolders.json',
    'mkdir -p /pj && cd /pj && git init -q .',
    'echo "@@node $(node -v 2>/dev/null || echo none)"',
    `o=$(timeout 25 sh -c ${sq(agent.version)} 2>&1 </dev/null); c=$?; echo "@@boot $c $(echo "$o" | head -1 | cut -c1-120)"; echo "$o" | grep -q -E "SyntaxError|cannot read|node:internal|No such file" && echo "@@bootbad"`,
  ];
  steps.forEach((s, i) => L.push(`o=$(timeout 70 sh -c ${sq(s)} 2>&1 </dev/null); c=$?; echo "@@step ${i} $c $(echo "$o" | grep -v -E "^[^[:alnum:]]*(Done)?$" | tail -1 | cut -c1-140)"; [ $c -ne 0 ] && exit 0`));
  if (route.list !== null) {
    const list = `timeout 70 sh -c ${sq(fill(route.list, src, variant))} 2>&1 </dev/null`;
    L.push('echo "@@list"', list, 'echo "@@end"');
    if (variant === 'failover') L.push('echo "@@list2"', list, 'echo "@@end2"'); // the first start may spend its time downloading; the second shows the settled state
  }
  return `${L.join('\n')}\n`;
}

/** Reads a cell's marker lines back into levels. Exported for the unit test. */
export function readCell(out: string, route: Route, src: string, variant: 'primary' | 'failover'): Pick<Cell, 'node' | 'boots' | 'l1' | 'l2' | 'secondStart' | 'firstError' | 'agentVersion'> {
  const lines = out.split('\n');
  const get = (p: string): string | undefined => lines.find((l) => l.startsWith(p))?.slice(p.length);
  const boot = get('@@boot ') ?? '';
  const booted = boot.startsWith('0 ') && !lines.includes('@@bootbad');
  const stepLines = lines.filter((l) => l.startsWith('@@step '));
  const failed = stepLines.find((l) => l.split(' ')[2] !== '0');
  let l1: Level = !booted ? 'skip' : failed ? 'fail' : stepLines.length === route.steps.length ? 'ok' : 'fail';
  const between = (a: string, b: string): string => (out.includes(`\n${a}\n`) ? out.slice(out.indexOf(`\n${a}\n`) + a.length + 2, out.indexOf(`\n${b}`) >= 0 ? out.indexOf(`\n${b}`) : undefined) : '');
  const listed = between('@@list', '@@end'), listed2 = between('@@list2', '@@end2');
  const re = route.expect === null ? undefined : new RegExp(fill(route.expect, src, variant), 'u');
  const first1 = re?.test(listed) ?? false, again = !first1 && (re?.test(listed2) ?? false);
  let l2: Level = l1 !== 'ok' ? 'skip' : route.list === null || re === undefined ? 'n/a' : first1 || again ? 'ok' : 'fail';
  if (!booted) l1 = 'skip';
  if (l1 === 'skip') l2 = 'skip';
  const firstError = !booted ? first(boot.replace(/^\d+ /u, '')) : failed ? first(failed.split(' ').slice(3).join(' ')) : l2 === 'fail' ? first(listed) || 'the list command printed nothing' : '';
  return { node: get('@@node ') ?? '?', boots: booted ? 'ok' : 'fail', l1, l2, secondStart: again, firstError, agentVersion: boot.replace(/^\d+ /u, '').replace(/\(.*$/u, '').trim().slice(0, 40) };
}

/** The file's non-empty lines, read once: an absent file is an empty ledger (no exists-then-read gap). */
function ledgerLines(file: string): string[] {
  try { return readFileSync(file, 'utf8').split('\n').filter(Boolean); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
}
function readRows(file = LEDGER): Array<Record<string, unknown>> {
  return ledgerLines(file).map((l) => JSON.parse(l) as Record<string, unknown>);
}
function append(row: Record<string, unknown>, file = LEDGER): void {
  const lines = ledgerLines(file);
  appendFileSync(file, `${JSON.stringify({ ...row, schema: SCHEMA, prev: lines.length ? sha(lines[lines.length - 1]!) : 'genesis' })}\n`);
}
const nextRun = (rows: Array<Record<string, unknown>>): string => `RDY-${String(Math.max(0, ...rows.flatMap((r) => (typeof r.run === 'string' ? [Number(/\d+/u.exec(r.run)?.[0] ?? 0)] : []))) + 1).padStart(4, '0')}`;

/** The table for one run: a row per agent route and variant, a column per Node state. */
export function table(cells: Cell[], nodes: NodeState[]): string {
  const sym = (c: Cell): string => (c.route === 'none' ? 'n/a' : c.boots !== 'ok' ? '✖boot' : `${c.l1 === 'ok' ? 'L1' : '✖L1'}${c.l2 === 'ok' ? '+L2' : c.l2 === 'n/a' ? '' : c.l1 === 'ok' ? ' ✖L2' : ''}`);
  const keys = [...new Set(cells.map((c) => `${c.agent} ${c.route} ${c.variant}`))];
  const w = Math.max(...keys.map((k) => k.length), 12);
  const head = `${'agent route variant'.padEnd(w)}  ${nodes.map((n) => n.label.padEnd(13)).join('')}`;
  const body = keys.map((k) => `${k.padEnd(w)}  ${nodes.map((n) => { const c = cells.find((x) => `${x.agent} ${x.route} ${x.variant}` === k && x.nodeId === n.id); return (c ? sym(c) : '-').padEnd(10); }).join('')}`);
  return [head, ...body].join('\n');
}

export type Status = 'install-ready' | 'install-only' | 'not-ready' | 'no-surface';
export type Proof = 'connected' | 'registered' | 'installed' | 'none';
export type RouteState = Proof | 'failed' | 'absent';
export interface AgentSummary { agent: string; version: string; status: Status; proof: Proof; route: string; plugin: RouteState; mcp: RouteState; failover: 'covered' | 'covered where the agent starts' | 'agent needs Node' | 'partial' | 'not shown'; notes: string[] }
const OLD = ['none', 'stock', '20', '22.12']; // the Node states below MM3's floor (22.13), where the failover has to take over

/** One line of truth per agent from a run's cells: the best route at Node 22.13+ (primary), and whether the failover covers the states below the floor. */
export function summarize(cells: Cell[], catalog: Agent[] = []): AgentSummary[] {
  return [...new Set(cells.map((c) => c.agent))].map((agent) => {
    const mine = cells.filter((c) => c.agent === agent);
    const version = /\d+(?:\.\d+)+[\w.-]*/u.exec(mine.find((c) => c.boots === 'ok' && c.agentVersion)?.agentVersion ?? '')?.[0]?.replace(/\.$/u, '') ?? ''; // the number, without the agent's own name around it
    if (mine.every((c) => c.route === 'none')) return { agent, version, status: 'no-surface' as const, proof: 'none' as const, plugin: 'absent' as const, mcp: 'absent' as const, route: '-', failover: 'not shown' as const, notes: [mine[0]?.firstError ?? ''] };
    const routes = [...new Set(mine.map((c) => c.route))].filter((r) => r !== 'none');
    const at = (route: string, variant: Cell['variant'], ids: string[]): Cell[] => mine.filter((c) => c.route === route && c.variant === variant && ids.includes(c.nodeId));
    const startsOf = (r: string): boolean => catalog.find((a) => a.id === agent)?.routes.find((x) => x.name === r)?.starts === true;
    // each of the two ways in (the plugin, the MCP server) on its own, at Node 22.13 and up
    const state = (r: string): RouteState => {
      if (!routes.includes(r)) return 'absent';
      const cs = at(r, 'primary', ['22.13', '24']);
      return cs.every((c) => c.l1 === 'ok' && c.l2 === 'ok') ? (startsOf(r) ? 'connected' : 'registered') : cs.every((c) => c.l1 === 'ok' && c.l2 === 'n/a') ? 'installed' : 'failed';
    };
    const plugin = state('plugin'), mcp = state('mcp');
    const rank: RouteState[] = ['connected', 'registered', 'installed'];
    const best = [...routes].sort((a, b) => (rank.indexOf(state(a)) + 9) % 9 - (rank.indexOf(state(b)) + 9) % 9)[0] ?? '-';
    const route = rank.includes(state(best)) ? best : routes[0] ?? '-';
    const status: Status = [plugin, mcp].some((x) => x === 'connected' || x === 'registered') ? 'install-ready' : [plugin, mcp].includes('installed') ? 'install-only' : 'not-ready';
    const old = at(route, 'failover', OLD);
    const runs = old.filter((c) => c.boots === 'ok'); // where the agent itself starts; where it does not, there is nothing to fall back from
    const failover = status === 'not-ready' ? 'not shown' : !runs.length ? 'agent needs Node' : runs.every((c) => c.l1 === 'ok' && (c.l2 === 'ok' || c.l2 === 'n/a')) ? (runs.length < old.length ? 'covered where the agent starts' : 'covered') : 'partial';
    const bestState = state(route);
    const proof: Proof = bestState === 'connected' || bestState === 'registered' || bestState === 'installed' ? bestState : 'none';
    // what failed at Node 22.13 and up (below that, failures are the Node floor, not the agent), once per route, in plain words
    const notes = [...new Set(mine.filter((c) => c.route !== 'none' && ['22.13', '24'].includes(c.nodeId) && c.variant === 'primary' && (c.l1 === 'fail' || c.l2 === 'fail') && c.firstError && !/^[^A-Za-z]*(Done)?$/u.test(c.firstError)).map((c) => `${c.route} route: ${c.firstError.replace(/\/mktl?\//gu, 'the plugin folder/')}`))];
    return { agent, version, status, proof, route, plugin, mcp, failover, notes };
  });
}

/** docs/evidence/readiness.md: the GitHub-facing checklist, written from a run (`--report --write`). */
export function evidenceMarkdown(cells: Cell[], meta: { run: string; ts: string; mm3: string }, catalog: Agent[] = []): string {
  const sums = summarize(cells, catalog);
  const mark: Record<Status, string> = { 'install-ready': '✅ install-ready', 'install-only': '🟡 install-only', 'not-ready': '❌ not ready', 'no-surface': '– no plugin or MCP surface' };
  const way: Record<RouteState, string> = { connected: '✓ connected', registered: '✓ registered', installed: '✓ installed', failed: '✗ not yet', absent: '–', none: '–' };
  const rows = sums.map((a) => `| ${a.agent} | ${a.version.replace(/\|/gu, '/') || '?'} | ${mark[a.status]} | ${way[a.plugin]} | ${way[a.mcp]} | ${a.failover} |`);
  const problems = sums.filter((a) => a.notes.length).flatMap((a) => [`**${a.agent}**`, ...a.notes.slice(0, 6).map((n) => `- ${n}`), '']);
  return [
    '# Install readiness',
    '',
    `Generated by \`scripts/readiness.ts\` from \`test/readiness/ledger.jsonl\` (newest run ${meta.run}, ${meta.ts.slice(0, 10)}, MM3 ${meta.mm3}, clean Ubuntu 24.04; each cell shows its newest result and earlier runs stay in the ledger): can each supported agent install MM3 through its own commands, with and without the right Node? This is an install check only: no key, no sign-in, no model call, one operating system.`,
    '',
    '- **install-ready**: the marketplace/plugin install (or MCP registration) ran without error on Node 22.13 and 24, and the agent\'s own list command shows it (L1 + L2).',
    '- **install-only**: it installed, but the agent has no command to read it back.',
    '- **proof**: *connected* where the agent\'s list command starts the MCP server (Claude, OpenCode, Cursor, Gemini); *registered* where it only shows the plugin or server as installed; *installed* where the agent has no way to list it back. Codex lists the server with `${CLAUDE_PLUGIN_ROOT}` unexpanded in its arguments; whether it expands at launch is not yet tested.',
    '- **failover**: with no Node, or Node 18, 20 or 22.12, the plugin\'s launcher fetches the standalone build (checked against a pinned sha256) and the same check passes. *covered where the agent starts* means the agent itself will not start on some of those Node states (it needs Node), so there is nothing for MM3 to fall back from there.',
    '',
    '| agent | version tested | status | plugin | MCP server | failover below Node 22.13 |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
    '## Every cell',
    '',
    '`L1` installed without error, `L2` the agent lists it; `✖boot` the agent itself did not start; `n/a` no route to test.',
    '',
    '```text',
    table(cells, NODES),
    '```',
    '',
    ...(problems.length ? ['## What did not work, and the first error', '', ...problems] : []),
    '## Run it again',
    '',
    '`npm run readiness` (Docker and the network; `npm run build:binary -- --target linux-x64` first), then `npm run readiness -- --report --write`. Run it when the Node floor, the standalone, the launcher, the plugin manifests or the supported agents change.',
    '',
  ].join('\n');
}

const xml = (t: string): string => t.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** docs/assets/agents.svg: the README's picture of where MM3 installs. Tested agents come from the ledger's summary, expected ones from the catalog, so it cannot claim more than the data. */
export function agentsSvg(sums: AgentSummary[], catalog: Agent[], extra: string[]): string {
  const name = (id: string): string => catalog.find((a) => a.id === id)?.name ?? id;
  const tested = sums.filter((a) => a.status === 'install-ready' || a.status === 'install-only').map((a) => name(a.agent));
  const expected = [...sums.filter((a) => a.status === 'no-surface' || a.status === 'not-ready').map((a) => name(a.agent)), ...extra, 'any agent that reads AGENTS.md'];
  const W = 900, PAD = 28, COL = (W - PAD * 3) / 2, CH = 30, GAP = 10;
  const chips = (names: string[], x0: number, y0: number, cls: string): { svg: string; h: number } => {
    let x = x0, y = y0, out = '';
    for (const n of names) {
      const w = Math.ceil(n.length * 8.2 + 26);
      if (x + w > x0 + COL - 32) { x = x0; y += CH + GAP; }
      out += `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${CH}" rx="15"/><text class="chip ${cls}t" x="${x + w / 2}" y="${y + 20}">${xml(n)}</text>`;
      x += w + GAP;
    }
    return { svg: out, h: y + CH - y0 };
  };
  const top = 20;
  const a = chips(tested, PAD + 16, top + 84, 'ok'), b = chips(expected, PAD * 2 + COL + 16, top + 84, 'ex');
  const cardH = 84 + Math.max(a.h, b.h) + 22, H = top + cardH + 50;
  const desc = `Tested, installed and registered through each agent's own commands: ${tested.join(', ')}. Expected to work, following the same open standards but not installed by us yet: ${expected.join(', ')}. The exact command for each agent is at mm3lab.dev/agents.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">
<!-- Generated by scripts/readiness.ts (the report command with the write flag) from the readiness ledger summary; do not hand-edit. -->
  <title id="t">Agents MM3 was tested on, and agents expected to work</title>
  <desc id="d">${xml(desc)}</desc>
  <style>
    text{font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}
    .ground{fill:#0b1424;stroke:#24344f}
    .card{fill:#0e1829;stroke:#24344f}
    .ct{font-size:13px;font-weight:700;letter-spacing:.14em}
    .cn{font-size:30px;font-weight:700}
    .ok{fill:#0f2a22;stroke:#1f6f55} .okt{fill:#6ee7b7}
    .ex{fill:#131f33;stroke:#2b3f5e} .ext{fill:#9fb0c9}
    .chip{font-size:14px;font-weight:600;text-anchor:middle}
    .foot{fill:#7f93b0;font-size:13px}
  </style>
  <rect class="ground" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14"/>
  <rect class="card" x="${PAD}" y="${top}" width="${COL}" height="${cardH}" rx="12"/>
  <text class="ct okt" x="${PAD + 16}" y="${top + 28}">TESTED: INSTALLS AND REGISTERS</text>
  <text class="cn okt" x="${PAD + 16}" y="${top + 64}">${tested.length} agents</text>
  ${a.svg}
  <rect class="card" x="${PAD * 2 + COL}" y="${top}" width="${COL}" height="${cardH}" rx="12"/>
  <text class="ct ext" x="${PAD * 2 + COL + 16}" y="${top + 28}">EXPECTED TO WORK: SAME STANDARDS</text>
  <text class="cn ext" x="${PAD * 2 + COL + 16}" y="${top + 64}">${expected.length - 1} more</text>
  ${b.svg}
  <text class="foot" x="${PAD}" y="${H - 24}">Tested: the agent&apos;s own commands installed MM3 and it listed it (no model call). Each agent&apos;s exact command: mm3lab.dev/agents</text>
</svg>
`;
}

/** Serves the built standalone from 127.0.0.1. Each cell gets its own path prefix (`/<job>/file`), so the counts say which cell downloaded it. */
function serve(file: string): Promise<{ url: string; hits: Map<string, number>; close: () => void }> {
  const hits = new Map<string, number>();
  const body = readFileSync(file); // read once; the server answers from memory
  return new Promise((resolve) => {
    const s = createServer((req, res) => {
      if (req.url?.endsWith(path.basename(file))) { const k = req.url.split('/')[1] ?? ''; hits.set(k, (hits.get(k) ?? 0) + 1); res.writeHead(200, { 'content-length': body.length }); res.end(body); } else { res.writeHead(404); res.end(); }
    }).listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(s.address() as AddressInfo).port}`, hits, close: () => s.close() }));
  });
}

function sh(cmd: string, args: string[], opts: { input?: string; cwd?: string } = {}): { code: number; out: string } {
  const r = spawnSync(cmd, args, { encoding: 'utf8', input: opts.input, cwd: opts.cwd, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** The plugin folder as `npm pack` ships it (primary) and a copy with the launcher manifests and a pin for the built standalone (failover). */
function prepare(tmp: string, version: string): { mkt: string; mktl: string; binary: string; sha256: string; commit: string } {
  const binary = path.resolve(`dist-binary/mm3-${version}-linux-x64`);
  let bin: Buffer;
  try { bin = readFileSync(binary); } catch { throw new Error(`✖ standalone: ${binary} is not built → run: npm run build:binary -- --target linux-x64`); }
  const pk = sh('npm', ['pack', '--silent', '--pack-destination', tmp]);
  if (pk.code !== 0) throw new Error(`✖ npm pack failed: ${first(pk.out)}`);
  const tgz = path.join(tmp, pk.out.trim().split('\n').pop()!);
  sh('tar', ['-xzf', tgz, '-C', tmp]);
  const mkt = path.join(tmp, 'mkt');
  cpSync(path.join(tmp, 'package'), mkt, { recursive: true });
  const mktl = path.join(tmp, 'mktl');
  cpSync(mkt, mktl, { recursive: true });
  cpSync('launcher/manifests/plugin.json', path.join(mktl, '.claude-plugin/plugin.json'));
  cpSync('launcher/manifests/hooks.json', path.join(mktl, 'hooks/hooks.json'));
  // Gemini's manifest in the failover copy starts the server through the launcher too (its `${extensionPath}${/}` form of the same command)
  const gem = JSON.parse(readFileSync(path.join(mktl, 'gemini-extension.json'), 'utf8')) as { mcpServers: { mm3: { command: string; args: string[] } } };
  gem.mcpServers.mm3 = { command: '${extensionPath}${/}launcher${/}mm3-launch', args: ['mcp'] };
  writeFileSync(path.join(mktl, 'gemini-extension.json'), `${JSON.stringify(gem, null, 2)}\n`);
  const asset = path.basename(binary);
  // the launcher reads this file with sed, one asset per line, exactly as `npm run gen:checksums` writes it
  writeFileSync(path.join(mktl, 'launcher/checksums.json'), `{\n  "version": "${version}",\n  "base": "http://127.0.0.1:0",\n  "assets": {\n    "linux-x64": { "file": "${asset}", "sha256": "${sha(bin)}", "bytes": ${bin.length} }\n  }\n}\n`);
  for (const d of [mkt, mktl]) { sh('git', ['init', '-q', '.'], { cwd: d }); sh('git', ['add', '-A'], { cwd: d }); sh('git', ['-c', 'user.email=r@r', '-c', 'user.name=readiness', 'commit', '-qm', 'readiness'], { cwd: d }); }
  return { mkt, mktl, binary, sha256: sha(bin), commit: sh('git', ['rev-parse', 'HEAD']).out.trim() };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const opt = (n: string): string | undefined => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const catalog = (JSON.parse(readFileSync('scripts/readiness/agents.json', 'utf8')) as { agents: Agent[] }).agents;
  if (argv.includes('--report')) {
    const rows = readRows();
    const all = rows.filter((r) => r.kind === 'cell') as unknown as Cell[];
    if (!all.length) { console.log('✖ readiness: no run in the ledger yet → npm run readiness'); return; }
    // the view is the newest result for each cell: a partial run (one agent) updates its cells and leaves the rest as they were
    const latest = new Map<string, Cell>();
    for (const c of all) latest.set(`${c.agent}|${c.route}|${c.variant}|${c.nodeId}`, c);
    const cells = [...latest.values()];
    const run = all[all.length - 1]!.run;
    console.log(`${run}  ${all[all.length - 1]!.ts}  (each cell's newest result)\n${table(cells, NODES)}`);
    if (argv.includes('--write')) {
      const started = rows.find((r) => r.phase === 'started' && r.run === run) as { mm3?: string } | undefined;
      const meta = { run, ts: all[all.length - 1]!.ts, mm3: started?.mm3 ?? '?' };
      writeFileSync('docs/evidence/readiness.md', evidenceMarkdown(cells, meta, catalog));
      const extra = (JSON.parse(readFileSync('scripts/readiness/agents.json', 'utf8')) as { expected?: string[] }).expected ?? [];
      writeFileSync('docs/assets/agents.svg', agentsSvg(summarize(cells, catalog), catalog, extra));
      writeFileSync('docs/evidence/readiness.json', `${JSON.stringify({ ...meta, os: 'ubuntu-24.04', agents: summarize(cells, catalog) }, null, 2)}\n`);
      console.log('wrote docs/evidence/readiness.md, readiness.json and docs/assets/agents.svg (then: npx tsx scripts/evidence-index.ts)');
    }
    return;
  }
  const only = opt('--agents')?.split(',');
  const agents = catalog.filter((a) => !only || only.includes(a.id));
  const nodeIds = opt('--nodes')?.split(',');
  const nodes = NODES.filter((n) => !nodeIds || nodeIds.includes(n.id));
  const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  const jobs = agents.flatMap((a) => nodes.flatMap((n) => (a.routes.length ? a.routes : [{ name: 'none', steps: [], list: null, expect: null } as Route]).flatMap((r) => (['primary', 'failover'] as const).map((v) => ({ a, n, r, v })))));
  console.log(`readiness: ${agents.length} agents x ${nodes.length} Node states = ${jobs.length} cells (primary and failover per route), MM3 ${version}`);
  if (argv.includes('--dry-run')) return;

  if (argv.includes('--rebuild') || sh('docker', ['image', 'inspect', IMAGE]).code !== 0) {
    console.log(`building ${IMAGE} (installs every agent; once, a few minutes)…`);
    const b = sh('docker', ['build', '-q', '-f', 'scripts/readiness/Dockerfile', '-t', IMAGE, 'scripts/readiness']);
    if (b.code !== 0) throw new Error(`✖ image build failed: ${first(b.out)}`);
  }
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'mm3-readiness-'));
  const prep = prepare(tmp, version);
  const rel = await serve(prep.binary);
  const rows = readRows();
  const run = nextRun(rows);
  const record = !argv.includes('--no-ledger');
  const defn = { agents: agents.map((a) => a.id), nodes: nodes.map((n) => n.id), image: sh('docker', ['image', 'inspect', '-f', '{{.Id}}', IMAGE]).out.trim(), os: 'ubuntu-24.04', commit: sh('git', ['rev-parse', 'HEAD']).out.trim(), mm3: version, standaloneSha256: prep.sha256 };
  if (record) append({ kind: 'run', phase: 'started', run, ts: new Date().toISOString(), ...defn });

  const cells: Cell[] = [];
  let seq = 0;
  const runJob = (j: (typeof jobs)[number]): Promise<void> => new Promise((resolve) => {
    const src = j.v === 'primary' ? '/mkt' : '/mktl';
    const t0 = Date.now(), id = `j${++seq}`;
    if (j.r.name === 'none') {
      const none: Cell = { kind: 'cell', run, ts: new Date().toISOString(), agent: j.a.id, agentVersion: '', route: 'none', variant: j.v, node: '', nodeId: j.n.id, boots: 'skip', l1: 'n/a', l2: 'n/a', fetched: false, secondStart: false, firstError: 'this agent has no plugin or MCP surface', how: [], ms: 0 };
      cells.push(none);
      if (record) append(none as unknown as Record<string, unknown>);
      resolve();
      return;
    }
    const args = ['run', '--rm', '-i', '-v', `${prep.mkt}:/mkt`, '-v', `${prep.mktl}:/mktl`, ...(j.v === 'failover' ? ['--network', 'host', '-e', `MM3_TEST_RELEASE_URL=${rel.url}/${id}`] : []), IMAGE, 'sh', '-s'];
    const c = spawn('docker', args);
    let out = '';
    c.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    c.stderr.on('data', (d: Buffer) => { out += d.toString(); });
    c.on('close', () => {
      const r = readCell(out, j.r, src, j.v);
      const cell: Cell = { kind: 'cell', run, ts: new Date().toISOString(), agent: j.a.id, route: j.r.name, variant: j.v, nodeId: j.n.id, fetched: (rel.hits.get(id) ?? 0) > 0, how: j.r.steps.map((s) => fill(s, src, j.v)), ms: Date.now() - t0, ...r };
      cells.push(cell);
      if (record) append(cell as unknown as Record<string, unknown>);
      console.log(`  ${j.a.id.padEnd(13)} ${j.r.name.padEnd(7)} ${j.v.padEnd(8)} ${j.n.label.padEnd(12)} boots ${cell.boots} L1 ${cell.l1} L2 ${cell.l2}${cell.secondStart ? ' (on the second start)' : ''}${cell.fetched ? ' (fetched the standalone)' : ''}${cell.firstError ? `  ← ${cell.firstError}` : ''}`);
      resolve();
    });
    c.stdin.end(cellScript(j.n, j.a, j.r, src, j.v));
  });
  const queue = [...jobs];
  await Promise.all(Array.from({ length: MAX_PARALLEL }, async () => { for (let j = queue.shift(); j; j = queue.shift()) await runJob(j); }));
  rel.close();
  rmSync(tmp, { recursive: true, force: true });
  const ok = cells.filter((c) => c.l1 === 'ok' && (c.l2 === 'ok' || c.l2 === 'n/a')).length;
  if (record) append({ kind: 'run', phase: 'finished', run, ts: new Date().toISOString(), cells: cells.length, ready: ok });
  console.log(`\n${run}  ${ok}/${cells.length} cells reached L1+L2${record ? `  (recorded in ${LEDGER})` : '  (not recorded)'}\n${table(cells, nodes)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e: Error) => { console.error(e.message); process.exit(1); });

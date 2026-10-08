/**
 * `npm run parity:install`: the install A/B. Two clean Ubuntu 24.04 containers, each `--network none`, each with a
 * throwaway HOME and a stub `claude` that records the plugin commands (no Claude, no key, no paid call):
 *   A  the npm channel: Node present (the official tarball already cached by build:binary, mounted read-only),
 *      `npm pack` of this repo installed with `npm exec <tgz> -- mm3 init`, offline from a copy of the npm cache.
 *   B  the standalone channel: NO Node and no npm (asserted first), the one file placed, `<file> init`.
 * Then, in both and in this order: the same fixed verbs on the offline fake provider (the scripts/parity.ts
 * step list), `mcp` launched with the command line read back out of the plugin manifest Claude cached, the plugin
 * hook launched with the command line read back out of the hooks.json Claude cached (the same PreToolUse JSON
 * fed to both; output, exit and the 5-second timeout must match), a re-run
 * of init (twice: the bootstrap command and the installed `mm3`), an upgrade to a newer build, and
 * `uninstall --all`. After every stage it compares output and the file tree of HOME (every file's hash) between A
 * and B, and the tree before and after within each channel where nothing should change. A difference is
 * EXPECTED (a rule below names it and why) or MUST FIX, as in scripts/parity.ts; exit is non-zero only on MUST
 * FIX. The stub is only a recorder: a real `claude` is the one thing this cannot exercise.
 * Last come the TRANSITION stages (T-a..T-f), run in the same two containers with HOME reset between them, for the
 * time the two channels share a machine (both write ~/.local/bin/mm3 and ~/.config/mm3/install.json; the first to
 * run init owns the install and the second says so in one `·` line and changes nothing): T-a npm then standalone
 * init, T-b standalone then npm init, T-c a box with no Node (init needs the standalone, npm cannot run), T-d the
 * Node box with both present (what wins the path, what each init prints, npm installed over the file by hand),
 * T-e uninstall after each leaves nothing behind and the other channel's files alone, T-f the standalone on a box
 * that HAS Node against the same on a box with none (output, trees, verbs, mcp, hook must match).
 * Needs: Docker, ubuntu:24.04 cached locally, `npm run build:binary -- --target linux-x64` done once (it
 * also caches the Node archive), and the npm cache holding yaml (a copy of ~/.npm is used, never written).
 */
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, chmodSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { buildBinary } from './build-binary.ts';
import { classify, makeFixture, normalise, renderTable, STEPS, type Ctx, type ExpectedRule, type Field, type Row, type Step } from './parity.ts';

const IMAGE = 'mm3-ab:ubuntu24-git';
const HOME = '/home/mm3';
const PROJ = `${HOME}/proj`;
const CLAUDE_CACHE = `${HOME}/.claude/plugins/cache/mvp-scale/mm3`;
const BASE_PATH = `${HOME}/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`;

/** What the stub `claude` does: the same five commands init/uninstall run, kept as plain files under ~/.claude. */
const CLAUDE_STUB = `#!/bin/sh
# Test stand-in for \`claude plugin ...\`: records marketplace and plugin installs as files, copies the folder the
# way Claude caches it, never touches the network.
S="$HOME/.claude/plugins"
mkdir -p "$S/installed"
case "$1 $2 $3" in
  "plugin list --json")
    out='['; sep=''
    for f in "$S"/installed/*; do [ -e "$f" ] || continue; out="$out$sep{\\"id\\":\\"mm3@mvp-scale\\",\\"name\\":\\"mm3\\",\\"scope\\":\\"$(cat "$f")\\"}"; sep=','; done
    echo "$out]" ;;
  "plugin marketplace list") if [ -d "$S/marketplaces/mvp-scale" ]; then echo "mvp-scale (directory)"; else echo "No marketplaces configured"; fi ;;
  "plugin marketplace add") mkdir -p "$S/marketplaces"; rm -rf "$S/marketplaces/mvp-scale"; cp -R "$4" "$S/marketplaces/mvp-scale" ;;
  "plugin marketplace remove") rm -rf "$S/marketplaces/mvp-scale" ;;
  "plugin install mm3@mvp-scale") mkdir -p "$S/cache/mvp-scale"; rm -rf "$S/cache/mvp-scale/mm3"; cp -R "$S/marketplaces/mvp-scale" "$S/cache/mvp-scale/mm3"; echo "$5" > "$S/installed/$5" ;;
  "plugin uninstall mm3@mvp-scale") rm -f "$S/installed/$5" ;;
  *) echo "claude stub: unsupported: $*" >&2; exit 1 ;;
esac
`;

// ---- expected differences ---------------------------------------------------------------------------------

/** The two names `normaliseTree` gives the plugin folder (npm package or standalone) and Claude's copies of it. */
const PKG = '<(?:PLUGIN_ROOT|CLAUDE_COPY)>';
const NPM_PKG_ONLY = 'the npm package carries its code files; the standalone carries the code inside the one file';

/** Every differing line of `field` in a stage whose name matches `cmd` must match `line`. A: npm channel, B: standalone. */
export const INSTALL_EXPECTED: ExpectedRule[] = [
  // output wording of the cli step and doctor's cli line
  { cmd: /./, field: 'stdout', line: /^[✔·] cli: /, reason: 'cli step wording: npm names its prefix and package, the standalone names the file and the plugin folder it placed' },
  { cmd: /./, field: 'stdout', line: /^\s+cli: /, reason: 'doctor cli line: npm names its prefix, the standalone its file and version' },
  { cmd: /install\.json/, field: 'stdout', line: /^\s*("mode"|"npmPrefix"|\{|\})/, reason: 'install.json records the install: npm mode and prefix vs standalone' },
  // trees
  { cmd: /./, field: 'stdout', line: /^d \.\/\.local\/(lib|share)(\/|$)/, reason: 'npm keeps the package under lib/node_modules, the standalone keeps its plugin folder under share/mm3' },
  { cmd: /./, field: 'stdout', line: /^l \.\/\.local\/bin\/mm3 -> /, reason: 'npm links the bin to the package; the standalone places the file itself (next row)' },
  { cmd: /./, field: 'stdout', line: /^f [0-9a-f]{12} \.\/\.local\/bin\/mm3$/, reason: 'the standalone file itself (npm has a link here)' },
  { cmd: /./, field: 'stdout', line: new RegExp(`^[fdl] (?:[0-9a-f]{12} )?\\.?/?${PKG}/(dist|node_modules|bin)(/|$)`), reason: NPM_PKG_ONLY + ' (bin/mm3.mjs is the plugin bundle the npm manifest launches)' },
  { cmd: /./, field: 'stdout', line: new RegExp(`^f [0-9a-f]{12} \\./?${PKG}/(package\\.json|README\\.md|LICENSE)$`), reason: NPM_PKG_ONLY },
  { cmd: /./, field: 'stdout', line: new RegExp(`^[fd] (?:[0-9a-f]{12} )?\\.?/?${PKG}/launcher(/|$)`), reason: 'the npm package\'s plugin carries the launcher (mm3-launch, mm3-launch.ps1, checksums.json) that fetches the self-contained build when Node 22.13+ is missing; the standalone is that build and has no use for it' },
  { cmd: /./, field: 'stdout', line: new RegExp(`^f [0-9a-f]{12} \\./?${PKG}/hooks/nudge\\.mjs$`), reason: 'the npm package carries the nudge script as a file; the standalone runs the same script from inside the one file (hooks.json names "<file> __hook")' },
  { cmd: /./, field: 'stdout', line: new RegExp(`^f [0-9a-f]{12} \\./?${PKG}/hooks/hooks\\.json$`), reason: 'the hook command names the installed standalone file with __hook instead of "node ${CLAUDE_PLUGIN_ROOT}/hooks/nudge.mjs"' },
  { cmd: /./, field: 'stdout', line: new RegExp(`^f [0-9a-f]{12} \\./?${PKG}/\\.claude-plugin/plugin\\.json$`), reason: 'the MCP command names the installed standalone file instead of "node ${CLAUDE_PLUGIN_ROOT}/bin/mm3.mjs"' },
  { cmd: /./, field: 'stdout', line: /^f [0-9a-f]{12} \.\/\.config\/mm3\/install\.json$/, reason: 'install.json records the install: npm prefix and mode vs file, plugin folder and version' },
  { cmd: /./, field: 'stdout', line: /^f [0-9a-f]{12} \.\/\.local\/lib\/node_modules\/\.package-lock\.json$/, reason: NPM_PKG_ONLY },
  // upgrade
  { cmd: /upgrade.*manifest/, field: 'stdout', line: /^\{"jsonrpc":"2\.0","id":1,"result":\{"protocolVersion"/, reason: 'after `npm install -g` the plugin Claude cached still launches its own bin/mm3.mjs (the old version) until the plugin is updated; the standalone\'s manifest names the installed file, which the upgrade replaced. Only serverInfo.version differs' },
  { cmd: /upgrade/, field: 'exit', line: /./, reason: 'npm upgrades with npm itself (init says "already reachable"); the standalone upgrades by running the newer file\'s init' },
];

// ---- docker plumbing --------------------------------------------------------------------------------------

interface Outcome {
  exit: number | null;
  stdout: string;
  stderr: string;
}

interface Channel {
  label: string;
  name: string;
  work: string;
  ledgerBefore: number;
}

const docker = (args: string[], input?: string, timeout = 300_000) => spawnSync('docker', args, { encoding: 'utf8', input, timeout, maxBuffer: 256 * 1024 * 1024 });

function exec(c: Channel, argv: string[], o: { stdin?: string; cwd?: string; timeoutMs?: number } = {}): Outcome {
  const r = docker(['exec', '-i', '-w', o.cwd ?? PROJ, c.name, ...argv], o.stdin ?? '', o.timeoutMs ?? 180_000);
  return { exit: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
const sh = (c: Channel, script: string, o: { stdin?: string; cwd?: string } = {}): Outcome => exec(c, ['sh', '-c', script], o);

function startChannel(label: string, work: string, nodeDir: string | undefined): Channel {
  const name = `mm3-ab-${label.toLowerCase()}-${process.pid}`;
  const args = ['run', '-d', '--rm', '--network', 'none', '--user', '1000:1000', '--cpus', '2', '--memory', '2g', '--name', name,
    '-e', `HOME=${HOME}`, '-e', `PATH=${BASE_PATH}${nodeDir ? ':/opt/node/bin' : ''}`, '-e', 'MM3_PROVIDER=fake', '-e', 'MM3_ACTOR=e2e-agent',
    '-e', 'TYPESAFE_API_KEY=', '-e', 'AI_GATEWAY_API_KEY=', '-e', `MM3_HOME=${PROJ}`,
    '-v', `${work}:/work`, ...(nodeDir ? ['-v', `${nodeDir}:/opt/node:ro`, '-e', 'npm_config_cache=/work/npm-cache', '-e', 'npm_config_offline=true', '-e', 'npm_config_update_notifier=false', '-e', 'npm_config_fund=false', '-e', 'npm_config_audit=false'] : []),
    IMAGE, 'sleep', '7200'];
  const r = docker(args);
  if (r.status !== 0) throw new Error(`could not start container ${name}: ${r.stderr}`);
  const c: Channel = { label, name, work, ledgerBefore: 0 };
  const cp = sh(c, `mkdir -p ${HOME} && cp -a /work/fixture ${PROJ}`, { cwd: '/' });
  if (cp.exit !== 0) throw new Error(`could not place the project in ${name}: ${cp.stderr}`);
  return c;
}

function ensureImage(scratch: string): void {
  if (docker(['image', 'inspect', IMAGE]).status === 0) return;
  const ctx = path.join(scratch, 'image');
  mkdirSync(ctx, { recursive: true });
  // git is copied from this machine (Ubuntu 24.04 too): the containers have no network to apt-get it.
  cpSync('/usr/bin/git', path.join(ctx, 'git'));
  cpSync('/usr/lib/git-core', path.join(ctx, 'git-core'), { recursive: true });
  cpSync('/usr/share/git-core', path.join(ctx, 'share-git-core'), { recursive: true });
  writeFileSync(path.join(ctx, 'claude'), CLAUDE_STUB);
  chmodSync(path.join(ctx, 'claude'), 0o755);
  writeFileSync(path.join(ctx, 'Dockerfile'), [
    'FROM ubuntu:24.04',
    'COPY git /usr/bin/git',
    'COPY git-core /usr/lib/git-core',
    'COPY share-git-core /usr/share/git-core',
    'COPY claude /usr/local/bin/claude',
    'RUN mkdir -p /home/mm3 /work && chmod 777 /home/mm3 /work && git --version',
    '',
  ].join('\n'));
  const b = docker(['build', '--network', 'none', '-q', '-t', IMAGE, ctx]);
  if (b.status !== 0) throw new Error(`could not build ${IMAGE} (needs ubuntu:24.04 cached locally): ${b.stderr}`);
}

// ---- snapshots --------------------------------------------------------------------------------------------

/** Every path under HOME (not the project's .git), with a hash for files outside the project (the ledger is compared row by row instead) and the target for links. */
const TREE_SCRIPT = `cd ${HOME} && find . -mindepth 1 -not -path './proj/.git' -not -path './proj/.git/*' -not -name 'index.db*' | LC_ALL=C sort | while IFS= read -r p; do if [ -L "$p" ]; then echo "l $p -> $(readlink "$p")"; elif [ -d "$p" ]; then echo "d $p"; else case "$p" in ./proj/*) echo "f - $p";; *) echo "f $(sha256sum < "$p" | cut -c1-12) $p";; esac; fi; done`;

/** Paths rewritten so the npm package folder, the standalone plugin folder and Claude's two copies of it line up. */
function normaliseTree(text: string): string {
  return text
    .replace(/\.\/\.local\/lib\/node_modules\/@mvpscale\/mm3(?=\/|$)/g, './<PLUGIN_ROOT>')
    .replace(/\.\/\.local\/share\/mm3\/plugin(?=\/|$)/g, './<PLUGIN_ROOT>')
    .replace(/\.\/\.claude\/plugins\/(?:marketplaces\/mvp-scale|cache\/mvp-scale\/mm3)(?=\/|$)/g, './<CLAUDE_COPY>');
}

const tree = (c: Channel): string => sh(c, TREE_SCRIPT, { cwd: HOME }).stdout.trim();

// ---- the stages -------------------------------------------------------------------------------------------

const rows: Row[] = [];
let stageCount = 0;

const clipText = (s: string, n = 160): string => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

function note(stage: string, field: Row['field'], kind: Row['kind'], detail: string, reason = ''): void {
  rows.push({ step: stage, field, kind, detail, reason });
}

function compareOutcome(stage: string, a: Outcome, b: Outcome): void {
  stageCount += 1;
  const fields: Array<[Field, string, string]> = [
    ['exit', `exit ${a.exit}`, `exit ${b.exit}`],
    ['stdout', normalise(a.stdout, []), normalise(b.stdout, [])],
    ['stderr', normalise(a.stderr, []), normalise(b.stderr, [])],
  ];
  for (const [field, x, y] of fields) {
    const v = classify(stage, field, x, y, INSTALL_EXPECTED);
    if (v.kind !== 'same') note(stage, field, v.kind, v.detail, v.reason);
  }
}

function compareTrees(stage: string, ta: string, tb: string): void {
  stageCount += 1;
  const v = classify(stage, 'stdout', normaliseTree(ta), normaliseTree(tb), INSTALL_EXPECTED);
  if (v.kind !== 'same') note(`${stage}: file trees of HOME`, 'files', v.kind, v.detail, v.reason);
}

/** Nothing should have changed within one channel between two snapshots. The one allowance is the npm channel's
 *  install.json after a re-run through `npm exec`, which reinstalls and stamps a new installedAt (npm's behaviour). */
function expectUnchanged(stage: string, label: string, before: string, after: string): void {
  stageCount += 1;
  const isRecord = (l: string): boolean => l.endsWith(' ./.config/mm3/install.json');
  const keep = (t: string): string => (label === 'A' ? t.split('\n').filter((l) => !isRecord(l)).join('\n') : t);
  if (keep(before) !== keep(after)) {
    const b = keep(before).split('\n');
    const a = keep(after).split('\n');
    note(`${stage}: ${label} tree changed`, 'files', 'must-fix', [...b.filter((l) => !a.includes(l)).map((l) => `was: ${l}`), ...a.filter((l) => !b.includes(l)).map((l) => `now: ${l}`)].join(' | '));
  } else if (before !== after) {
    note(`${stage}: ${label} install.json changed`, 'files', 'expected', 'install.json rewritten', 'the npm channel\'s bootstrap re-run (npm exec) reinstalls and stamps a new installedAt; the standalone writes nothing when nothing changed');
  }
}

function ledgerRows(c: Channel): string[] {
  const r = sh(c, `cat ${PROJ}/.mm3/log.jsonl 2>/dev/null || true`);
  return r.stdout.split('\n').filter(Boolean);
}

function runVerb(c: Channel, step: Step, ctx: Ctx): Outcome & { ledger: string } {
  const args = typeof step.args === 'function' ? step.args(ctx) : step.args;
  const before = ledgerRows(c).length;
  const r = exec(c, ['mm3', ...args], { stdin: step.stdin ?? '' });
  const ledger = ledgerRows(c).slice(before).join('\n');
  if (step.save) sh(c, `cat > ${PROJ}/${step.save}`, { stdin: r.stdout });
  if (step.capture) ctx.captured[step.capture.key] = step.capture.re.exec(r.stdout)?.[1] ?? '';
  return { ...r, ledger };
}

function runSteps(stage: string, a: Channel, b: Channel, steps: Step[], ctxs: { A: Ctx; B: Ctx }): void {
  for (const step of steps) {
    const ra = runVerb(a, step, ctxs.A);
    const rb = runVerb(b, step, ctxs.B);
    compareOutcome(`${stage}: ${step.name}`, ra, rb);
    stageCount += 1;
    const v = classify(step.name, 'ledger', normalise(ra.ledger, []), normalise(rb.ledger, []), INSTALL_EXPECTED);
    if (v.kind !== 'same') note(`${stage}: ${step.name}`, 'ledger', v.kind, v.detail, v.reason);
  }
}

/** `mcp` over stdio inside the container: initialize, tools/list, one tools/call. */
function mcp(c: Channel, argv: string[], env: Record<string, string>): Promise<Outcome> {
  return new Promise((resolve) => {
    const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
    const child = spawn('docker', ['exec', '-i', '-w', PROJ, ...envArgs, c.name, ...argv], { stdio: ['pipe', 'pipe', 'pipe'] });
    const replies: string[] = [];
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'parity-install', version: '0' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['template', 'class'] } } },
    ];
    let done = false;
    const finish = (code: number | null, extra = ''): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      resolve({ exit: code, stdout: replies.join('\n'), stderr: stderr + extra });
    };
    const timer = setTimeout(() => finish(null, `\nmcp gave ${replies.length} of 3 replies in 30s`), 30_000);
    createInterface({ input: child.stdout }).on('line', (line) => {
      replies.push(line);
      if (replies.length === 3) {
        child.stdin.end();
        finish(0);
      }
    });
    child.on('error', (e) => finish(null, `\n${e.message}`));
    child.on('close', (code) => finish(code === 0 ? null : code));
    for (const q of requests) child.stdin.write(`${JSON.stringify(q)}\n`);
  });
}

/** The command line the plugin manifest in Claude's cache launches the MCP server with. */
function manifestLaunch(c: Channel): { argv: string[]; env: Record<string, string> } | undefined {
  const r = sh(c, `cat ${CLAUDE_CACHE}/.claude-plugin/plugin.json`);
  if (r.exit !== 0) return undefined;
  const server = (JSON.parse(r.stdout) as { mcpServers: { mm3: { command: string; args: string[]; env?: Record<string, string> } } }).mcpServers.mm3;
  const sub = (s: string): string => s.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, CLAUDE_CACHE).replace(/\$\{user_config\.[a-z_]+\}/g, '');
  return { argv: [sub(server.command), ...server.args.map(sub)], env: Object.fromEntries(Object.entries(server.env ?? {}).map(([k, v]) => [k, sub(v)])) };
}

async function mcpStages(stage: string, a: Channel, b: Channel): Promise<void> {
  const la = manifestLaunch(a);
  const lb = manifestLaunch(b);
  if (!la || !lb) {
    note(`${stage}: mcp launched from the manifest`, 'exit', 'must-fix', `no plugin manifest in Claude's cache (A ${la ? 'ok' : 'missing'}, B ${lb ? 'ok' : 'missing'})`);
    return;
  }
  note(`${stage}: mcp manifest command lines`, 'stdout', 'expected', `A: ${la.argv.join(' ')} | B: ${lb.argv.join(' ')}`, 'the manifest\'s own command: node + bin/mm3.mjs for the npm package, the installed standalone file for B');
  const [ma, mb] = await Promise.all([mcp(a, la.argv, la.env), mcp(b, lb.argv, lb.env)]);
  compareOutcome(`${stage}: mcp launched from the manifest (initialize, tools/list, tools/call)`, ma, mb);
  if (mb.exit !== 0 || mb.stderr.trim()) note(`${stage}: mcp launched from the manifest`, 'exit', 'must-fix', `the standalone's manifest command did not answer: ${clipText(mb.stderr)}`);
  // The npm channel again, through the `mm3` on PATH, so the MCP answers are still compared when its manifest cannot launch.
  const [pa, pb] = await Promise.all([mcp(a, ['mm3', 'mcp'], {}), mcp(b, ['mm3', 'mcp'], {})]);
  compareOutcome(`${stage}: mcp launched as "mm3 mcp" from PATH`, pa, pb);
}

interface HookGroup { matcher: string; hooks: Array<{ command: string; args?: string[]; timeout?: number }> }

/** The hook list Claude cached for the plugin, each command line resolved the way Claude resolves ${CLAUDE_PLUGIN_ROOT}. */
function hookGroups(c: Channel): HookGroup[] | undefined {
  const r = sh(c, `cat ${CLAUDE_CACHE}/hooks/hooks.json`);
  if (r.exit !== 0) return undefined;
  return (JSON.parse(r.stdout) as { hooks: { PreToolUse: HookGroup[] } }).hooks.PreToolUse;
}

/** Fires the plugin's hook in both channels with the same PreToolUse JSON, through the command each cached hooks.json
 *  names (A: node + the script, B: the standalone file with __hook), picked by matcher as Claude picks it. */
function hookStages(stage: string, a: Channel, b: Channel): void {
  const ga = hookGroups(a);
  const gb = hookGroups(b);
  stageCount += 1;
  if (!ga || !gb) {
    note(`${stage}: plugin hook`, 'exit', 'must-fix', `no hooks.json in Claude's cache (A ${ga ? 'ok' : 'missing'}, B ${gb ? 'ok' : 'missing'})`);
    return;
  }
  const shape = (g: HookGroup[]): string => JSON.stringify(g.map((x) => ({ matcher: x.matcher, timeouts: x.hooks.map((h) => h.timeout) })));
  if (shape(ga) !== shape(gb)) note(`${stage}: plugin hook list`, 'stdout', 'must-fix', `matchers or timeouts differ: A ${shape(ga)} | B ${shape(gb)}`);
  const sub = (v: string): string => v.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, CLAUDE_CACHE);
  const argvFor = (g: HookGroup[], tool: string): string[] | undefined => {
    const h = g.find((x) => new RegExp(`^(?:${x.matcher})$`).test(tool))?.hooks[0];
    return h ? [sub(h.command), ...(h.args ?? []).map(sub)] : undefined;
  };
  const la = argvFor(ga, 'Bash');
  const lb = argvFor(gb, 'Bash');
  note(`${stage}: plugin hook command lines`, 'stdout', 'expected', `A: ${la?.join(' ')} | B: ${lb?.join(' ')}`, 'the hook\'s own command: node + hooks/nudge.mjs for the npm package, the installed standalone file with __hook for B');
  sh(a, 'mkdir -p /tmp/hookproj/.mm3 /tmp/hookbare');
  sh(b, 'mkdir -p /tmp/hookproj/.mm3 /tmp/hookbare');
  const input = (session: string, tool: string, extra: Record<string, unknown>): string => JSON.stringify({ session_id: `${stage}-${session}`, hook_event_name: 'PreToolUse', tool_name: tool, ...extra });
  const bash = (command: string) => ({ command });
  const cases: Array<[string, string, string, boolean]> = [
    ['a helper about to be spawned', 'Agent', input('agent', 'Agent', { cwd: '/tmp/hookproj', tool_input: { prompt: 'x' } }), true],
    ['an older Task spawn', 'Task', input('task', 'Task', { cwd: '/tmp/hookproj', tool_input: { prompt: 'x' } }), true],
    ['a commit', 'Bash', input('commit', 'Bash', { cwd: '/tmp/hookproj', tool_input: bash('git commit -m x') }), true],
    ['the same commit again, same session', 'Bash', input('commit', 'Bash', { cwd: '/tmp/hookproj', tool_input: bash('git commit -m x') }), false],
    ['a push', 'Bash', input('push', 'Bash', { cwd: '/tmp/hookproj', tool_input: bash('FOO=1 git -C /x push origin main') }), true],
    ['a command that decides nothing', 'Bash', input('status', 'Bash', { cwd: '/tmp/hookproj', tool_input: bash('git status') }), false],
    ['a commit in a project without .mm3', 'Bash', input('bare', 'Bash', { cwd: '/tmp/hookbare', tool_input: bash('git commit -m x') }), false],
    ['another tool', 'Read', input('read', 'Read', { cwd: '/tmp/hookproj', tool_input: {} }), false],
    ['input that is not JSON', 'Bash', 'not json', false],
  ];
  for (const [name, tool, raw, speaks] of cases) {
    const ca = argvFor(ga, tool) ?? argvFor(ga, 'Bash')!;
    const cb = argvFor(gb, tool) ?? argvFor(gb, 'Bash')!;
    const ra = exec(a, ca, { stdin: raw, cwd: '/tmp' });
    const t0 = Date.now();
    const rb = exec(b, cb, { stdin: raw, cwd: '/tmp' });
    const ms = Date.now() - t0;
    compareOutcome(`${stage}: plugin hook, ${name}`, ra, rb);
    stageCount += 1;
    for (const [label, r] of [['A', ra], ['B', rb]] as const) {
      if (r.exit !== 0 || r.stderr.trim()) note(`${stage}: plugin hook, ${name}: ${label}`, 'exit', 'must-fix', `the hook must always exit 0 and say nothing on stderr: exit ${r.exit} ${clipText(r.stderr)}`);
      if (speaks !== r.stdout.includes('MM3 is set up here')) note(`${stage}: plugin hook, ${name}: ${label}`, 'stdout', 'must-fix', `${speaks ? 'should have' : 'should not have'} printed the nudge: ${clipText(r.stdout)}`);
    }
    if (ms > 5000) note(`${stage}: plugin hook, ${name}: B`, 'exit', 'must-fix', `the standalone hook took ${ms} ms, over the hook's 5 s timeout`);
  }
}

// ---- transition stages: both channels on one machine ----------------------------------------------------------

/** Wipes everything a channel put under HOME (and the project's ledger) so the next combination starts clean. */
const resetHome = (c: Channel): void => {
  sh(c, `rm -rf ${HOME}/.local ${HOME}/.config ${HOME}/.claude ${PROJ}/.mm3`, { cwd: '/' });
};
const must = (stage: string, ok: boolean, detail: string): void => {
  stageCount += 1;
  if (!ok) note(stage, 'stdout', 'must-fix', detail);
};
const fact = (stage: string, detail: string, reason: string): void => note(stage, 'stdout', 'expected', clipText(detail, 400), reason);
const cliLines = (text: string): string => text.split('\n').filter((l) => /^[✔·–✖] (cli|plugin):/.test(l)).join(' / ');
/** What is left under HOME after an uninstall: not the project, not Claude's own cache, not bare directories. */
const leftovers = (t: string): string[] => t.split('\n').filter((l) => !/^d /.test(l) && !/ \.\/proj(\/|$)/.test(l) && !/ \.\/\.claude\/plugins\/(cache|installed)/.test(l));

async function transitionStages(a: Channel, b: Channel, tgz: string, bin: string, ctxs: { A: Ctx; B: Ctx }): Promise<void> {
  const npmInit = (c: Channel): Outcome => exec(c, ['npm', 'exec', '--yes', `--package=/work/${tgz}`, '--', 'mm3', 'init', '--yes', '--no-key']);
  const saInit = (c: Channel): Outcome => exec(c, [`/work/${bin}`, 'init', '--yes', '--no-key']);
  const shaOf = (c: Channel, file: string): string => sh(c, `sha256sum < ${file}`, { cwd: HOME }).stdout.trim();
  const binState = (c: Channel): string => sh(c, `if [ -L ${HOME}/.local/bin/mm3 ]; then echo "link -> $(readlink ${HOME}/.local/bin/mm3)"; elif [ -f ${HOME}/.local/bin/mm3 ]; then echo file; else echo none; fi`, { cwd: HOME }).stdout.trim();
  const recordMode = (c: Channel): string => /"mode": "(\w+)"/.exec(sh(c, 'cat ~/.config/mm3/install.json', { cwd: HOME }).stdout)?.[1] ?? 'none';
  const uninstallCheck = (stage: string, c: Channel): void => {
    const x = exec(c, ['mm3', 'uninstall', '--all', '--yes']);
    must(`${stage}: uninstall --all exits 0`, x.exit === 0, `exit ${x.exit}: ${clipText(x.stderr || x.stdout)}`);
    const left = leftovers(tree(c));
    must(`${stage}: nothing orphaned in HOME after uninstall`, left.length === 0, left.join(' | '));
    const w = sh(c, 'command -v mm3; true', { cwd: HOME });
    must(`${stage}: mm3 gone from PATH after uninstall`, w.stdout.trim() === '', w.stdout);
  };

  // T-a  npm channel first, then the standalone's init on top
  resetHome(a);
  const a1 = npmInit(a);
  must('T-a: npm init', a1.exit === 0, clipText(a1.stderr || a1.stdout));
  const a1tree = tree(a);
  const a1bin = binState(a);
  const a2 = saInit(a);
  fact('T-a: standalone init on top of npm: prints', cliLines(a2.stdout), 'one · line names the npm install and says it was kept; the plugin lines follow from the marketplace npm registered');
  must('T-a: standalone init on top of npm exits 0 and says npm owns it', a2.exit === 0 && /^· cli: mm3 is already installed from npm \(.*\) → kept, not replaced/m.test(a2.stdout), clipText(a2.stdout));
  const a2tree = tree(a);
  must('T-a: the tree of HOME is byte-for-byte unchanged by the standalone init', a1tree === a2tree, [...a1tree.split('\n').filter((l) => !a2tree.includes(l)).map((l) => `was: ${l}`), ...a2tree.split('\n').filter((l) => !a1tree.includes(l)).map((l) => `now: ${l}`)].join(' | '));
  must('T-a: ~/.local/bin/mm3 is still npm\'s link and the record still says npm', binState(a) === a1bin && a1bin.startsWith('link') && recordMode(a) === 'user', `${binState(a)} / record ${recordMode(a)}`);
  const standaloneSha = shaOf(a, `/work/${bin}`);
  uninstallCheck('T-a', a);
  must('T-a: the downloaded standalone file was not touched by npm\'s uninstall', shaOf(a, `/work/${bin}`) === standaloneSha, 'its hash changed or it is gone');

  // T-b  standalone first, then npm's init on top; this standalone-only state on a Node box is also T-f's left side
  resetHome(a);
  const fa = saInit(a);
  must('T-b: standalone init on a box that has Node', fa.exit === 0, clipText(fa.stderr || fa.stdout));
  const b1tree = tree(a);
  const b1bin = binState(a);
  const fb = (() => {
    resetHome(b);
    return saInit(b);
  })();
  // T-f  the same standalone on a box that has Node and on a box with none: output, trees, verbs, mcp, hook
  compareOutcome('T-f: standalone init, Node box vs no-Node box', fa, fb);
  compareTrees('T-f: standalone init', b1tree, tree(b));
  runSteps('T-f verbs', a, b, STEPS, ctxs);
  await mcpStages('T-f', a, b);
  hookStages('T-f', a, b);
  const vTree = [tree(a), tree(b)] as const;
  compareTrees('T-f after verbs, mcp and hook', vTree[0], vTree[1]);
  must('T-f: the Node box really has Node on PATH while mm3 resolves to the standalone', /\/opt\/node\/bin\/node/.test(sh(a, 'command -v node', { cwd: HOME }).stdout) && sh(a, 'command -v mm3', { cwd: HOME }).stdout.trim() === `${HOME}/.local/bin/mm3`, 'PATH layout is not as the stage assumes');

  const preB2 = tree(a);
  const b2 = npmInit(a);
  fact('T-b: npm init on top of the standalone: prints', cliLines(b2.stdout), 'one · line names the standalone file and says it was kept; npm installs nothing');
  must('T-b: npm init on top of the standalone exits 0 and says the standalone owns it', b2.exit === 0 && /^· cli: mm3 is already installed as the standalone \(.*\) → kept, not replaced/m.test(b2.stdout), clipText(b2.stdout));
  must('T-b: the tree of HOME is byte-for-byte unchanged by the npm init', preB2 === tree(a), 'trees differ');
  must('T-b: ~/.local/bin/mm3 is still the standalone file and the record still says standalone', binState(a) === b1bin && b1bin === 'file' && recordMode(a) === 'standalone', `${binState(a)} / record ${recordMode(a)}`);
  const npmSha = shaOf(a, `/work/${tgz}`);
  uninstallCheck('T-b', a);
  must('T-b: the npm tarball was not touched by the standalone\'s uninstall', shaOf(a, `/work/${tgz}`) === npmSha, 'its hash changed or it is gone');

  // T-c  no Node at all: init needs the standalone, npm cannot run
  resetHome(b);
  const c0 = exec(b, ['npm', 'exec', '--yes', `--package=/work/${tgz}`, '--', 'mm3', 'init', '--yes', '--no-key']);
  must('T-c: the npm route cannot run without Node', c0.exit !== 0, 'npm exec succeeded on a box that should have no npm');
  fact('T-c: npm route on the no-Node box', c0.stderr || c0.stdout, 'there is no npm to run, so on a box with no Node the standalone is the only route');
  const c1 = saInit(b);
  must('T-c: the standalone init needs no Node and exits 0', c1.exit === 0 && /^✔ cli: installed \(/m.test(c1.stdout) && recordMode(b) === 'standalone' && binState(b) === 'file', clipText(c1.stderr || c1.stdout));
  const c1tree = tree(b);
  const c2 = saInit(b);
  must('T-c: its re-run says already and changes nothing', c2.exit === 0 && /^· cli: already installed/m.test(c2.stdout) && tree(b) === c1tree, clipText(c2.stdout));
  uninstallCheck('T-c', b);

  // T-d  the Node box with the standalone also present: which one wins, what each init prints, npm installed over the file by hand
  resetHome(a);
  saInit(a);
  fact('T-d: standalone first: who answers `mm3`', `${binState(a)} · ${sh(a, 'command -v mm3', { cwd: HOME }).stdout.trim()} · ${exec(a, ['mm3', '--version']).stdout.trim()}`, 'the first channel to run init owns ~/.local/bin/mm3');
  const d1 = exec(a, ['mm3', 'init', '--yes', '--no-key']);
  fact('T-d: the installed standalone\'s own init, Node present', cliLines(d1.stdout), 'its own re-run: already installed');
  const d2 = exec(a, ['npm', 'install', '-g', '--prefix', `${HOME}/.local`, `/work/${tgz}`]);
  fact('T-d: `npm install -g --prefix ~/.local` run by hand over the standalone', `exit ${d2.exit}; ${clipText(d2.stderr || d2.stdout, 200)}; bin is now: ${binState(a)}`, 'init never does this; this records what npm itself does with a file already at the link path');
  must('T-d: a hand-run npm install over the standalone either refuses or leaves a file that runs', d2.exit !== 0 || exec(a, ['mm3', '--version']).exit === 0, 'mm3 is broken after the hand-run npm install');
  resetHome(a);
  npmInit(a);
  fact('T-d: npm first: who answers `mm3`', `${binState(a)} · ${sh(a, 'command -v mm3', { cwd: HOME }).stdout.trim()}`, 'npm\'s link owns the path; the standalone\'s init then keeps it (T-a)');
  uninstallCheck('T-d npm cleanup', a);

  // T-e  the one forced mix, as T-d leaves it: the standalone's record, npm's link at its path (npm installed over the file with --force)
  resetHome(a);
  saInit(a);
  const e1 = exec(a, ['npm', 'install', '-g', '--force', '--prefix', `${HOME}/.local`, `/work/${tgz}`]);
  fact('T-e: npm --force installed over the standalone', `exit ${e1.exit}; bin is now: ${binState(a)}; record: ${recordMode(a)}`, 'a forced mix, not a path init takes');
  if (e1.exit === 0) {
    const pkgBefore = sh(a, `ls ${HOME}/.local/lib/node_modules/@mvpscale/mm3 | wc -l`, { cwd: HOME }).stdout.trim();
    const e2 = exec(a, ['mm3', 'uninstall', '--all', '--yes']);
    fact('T-e: uninstall run in the forced mix: prints', e2.stdout.split('\n').filter((l) => /^[✔·–✖] cli:/.test(l)).join(' / '), 'the standalone\'s record removes its own files; the link at its path is npm\'s and is left, with a ✖ line saying a second copy still resolves');
    must('T-e: npm\'s package folder is untouched by the standalone\'s uninstall', sh(a, `ls ${HOME}/.local/lib/node_modules/@mvpscale/mm3 | wc -l`, { cwd: HOME }).stdout.trim() === pkgBefore, 'npm package files were removed');
    must('T-e: npm\'s link is untouched by the standalone\'s uninstall', binState(a).startsWith('link'), binState(a));
  }
  resetHome(a);
}

// ---- the run ----------------------------------------------------------------------------------------------

function newestMs(dir: string): number {
  const st = statSync(dir);
  if (!st.isDirectory()) return st.mtimeMs;
  return readdirSync(dir).reduce((m, e) => Math.max(m, newestMs(path.join(dir, e))), 0);
}

function bump(version: string): string {
  const [x, y, z] = version.split('.');
  return `${x}.${y}.${Number(z) + 1}`;
}

export async function runInstallParity(): Promise<{ rows: Row[]; stages: number }> {
  const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  const next = bump(version);
  const bin = path.resolve('dist-binary', `mm3-${version}-linux-x64`);
  const nodeArchive = path.resolve('dist-binary', 'cache', 'node-v24.21.0-linux-x64.tar.xz');
  if (!existsSync(bin) || !existsSync(nodeArchive)) throw new Error('the standalone or the cached Node archive is missing → run "npm run build:binary -- --target linux-x64" (needs the network once)');
  if ([newestMs('src'), newestMs('skills'), newestMs('.claude-plugin')].some((m) => m > statSync(bin).mtimeMs)) throw new Error(`${bin} is older than src/, skills/ or .claude-plugin/ → rebuild it with "npm run build:binary -- --target linux-x64"`);
  const npmCache = path.join(os.homedir(), '.npm', '_cacache');
  if (!existsSync(npmCache)) throw new Error(`no npm cache at ${npmCache} → run "npm install" once so yaml is cached (the containers have no network)`);

  const scratch = mkdtempSync(path.join(os.tmpdir(), 'mm3-parity-install-'));
  let a: Channel | undefined;
  let b: Channel | undefined;
  try {
    ensureImage(scratch);
    execFileSync('npm', ['run', 'build', '--silent'], { stdio: 'inherit' });

    // inputs: the project, the package (now and "newer"), the standalone (now and "newer"), Node for A only
    const fixture = path.join(scratch, 'fixture');
    mkdirSync(fixture);
    const commits = makeFixture(fixture);
    const pkgDir = path.join(scratch, 'pkg');
    mkdirSync(pkgDir);
    const packed = execFileSync('npm', ['pack', '--pack-destination', pkgDir, '--silent'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').pop()!;
    const tgz = path.join(pkgDir, packed);
    const up = path.join(scratch, 'up');
    mkdirSync(up);
    execFileSync('tar', ['-xzf', tgz, '-C', up]);
    const pj = path.join(up, 'package', 'package.json');
    writeFileSync(pj, readFileSync(pj, 'utf8').replace(`"version": "${version}"`, `"version": "${next}"`));
    const tgzNext = path.join(pkgDir, packed.replace(version, next));
    execFileSync('tar', ['-czf', tgzNext, '-C', up, 'package']);
    const outNext = path.join(scratch, 'next-bin');
    mkdirSync(outNext);
    cpSync(path.resolve('dist-binary', 'cache'), path.join(outNext, 'cache'), { recursive: true });
    console.error(`parity:install: building the "newer" standalone (${next}) for the upgrade stage`);
    const binNext = (await buildBinary('linux-x64', outNext, next)).file;
    const nodeDir = path.join(scratch, 'node');
    mkdirSync(nodeDir);
    execFileSync('tar', ['-xJf', nodeArchive, '-C', nodeDir, '--strip-components=1']);

    const workA = path.join(scratch, 'workA');
    const workB = path.join(scratch, 'workB');
    for (const w of [workA, workB]) {
      mkdirSync(w);
      cpSync(fixture, path.join(w, 'fixture'), { recursive: true });
    }
    cpSync(npmCache, path.join(workA, 'npm-cache', '_cacache'), { recursive: true });
    cpSync(tgz, path.join(workA, path.basename(tgz)));
    cpSync(tgzNext, path.join(workA, path.basename(tgzNext)));
    cpSync(bin, path.join(workA, path.basename(bin)));
    cpSync(bin, path.join(workB, path.basename(bin)));
    cpSync(binNext, path.join(workB, path.basename(binNext)));
    // The containers run as uid 1000. On a developer machine that is the same user; on a CI runner (uid 1001) the copies above are
    // owned by someone else and npm cannot write its cache (EACCES mkdtemp /work/npm-cache/_cacache/tmp). Open the folders to every user.
    for (const w of [workA, workB]) execFileSync('chmod', ['-R', 'a+rwX', w]);

    a = startChannel('A', workA, nodeDir);
    b = startChannel('B', workB, undefined);
    const ctxs = { A: { commits, captured: {} } as Ctx, B: { commits, captured: {} } as Ctx };
    const stepNamed = (...names: string[]): Step[] => names.map((n) => STEPS.find((s) => s.name === n) ?? (() => { throw new Error(`no parity step named ${n}`); })());

    // 0 preflight
    const nodeA = sh(a, 'command -v node && command -v npm');
    const nodeB = sh(b, 'command -v node; command -v npm; true');
    stageCount += 2;
    if (nodeA.exit !== 0) note('preflight', 'exit', 'must-fix', `channel A has no node/npm: ${nodeA.stderr}`);
    if (nodeB.stdout.trim() !== '') note('preflight', 'stdout', 'must-fix', `channel B is not clean: found ${nodeB.stdout.trim()}`);
    const treeEmpty = [tree(a), tree(b)];
    compareTrees('0 before install', treeEmpty[0]!.replace(/.*proj.*\n?/g, ''), treeEmpty[1]!.replace(/.*proj.*\n?/g, ''));

    // 1 install
    const ia = exec(a, ['npm', 'exec', '--yes', `--package=/work/${path.basename(tgz)}`, '--', 'mm3', 'init', '--yes', '--no-key']);
    const ib = exec(b, [`/work/${path.basename(bin)}`, 'init', '--yes', '--no-key']);
    compareOutcome('1 install: init', ia, ib);
    for (const [c, r] of [[a, ia], [b, ib]] as const) if (r.exit !== 0) note('1 install: init', 'exit', 'must-fix', `channel ${c.label} init exited ${r.exit}: ${clipText(r.stderr || r.stdout)}`);
    const t1 = [tree(a), tree(b)] as const;
    compareTrees('1 install', t1[0], t1[1]);
    for (const [label, c] of [['A', a], ['B', b]] as const) {
      const w = sh(c, 'command -v mm3', { cwd: HOME });
      stageCount += 1;
      if (w.stdout.trim() !== `${HOME}/.local/bin/mm3`) note(`1 install: ${label} mm3 on PATH`, 'stdout', 'must-fix', w.stdout || w.stderr);
    }
    const inst = [sh(a, 'cat ~/.config/mm3/install.json', { cwd: HOME }), sh(b, 'cat ~/.config/mm3/install.json', { cwd: HOME })] as const;
    const stripVolatile = (t: string): string => t.replace(/^\s*"(installedAt|binPath|pluginDir|version)".*\n/gm, '');
    compareOutcome('1 install: install.json', { ...inst[0], stdout: stripVolatile(inst[0].stdout) }, { ...inst[1], stdout: stripVolatile(inst[1].stdout) });
    const mm3v = [exec(a, ['mm3', '--version']), exec(b, ['mm3', '--version'])] as const;
    compareOutcome('1 install: mm3 --version', mm3v[0], mm3v[1]);

    // 2 the core verbs
    runSteps('2 verbs', a, b, STEPS, ctxs);
    // 3 mcp through the manifest
    await mcpStages('3', a, b);
    hookStages('3', a, b);

    // 4 idempotence: the bootstrap command again, then the installed mm3
    const t3 = [tree(a), tree(b)] as const;
    const r4 = [
      [exec(a, ['npm', 'exec', '--yes', `--package=/work/${path.basename(tgz)}`, '--', 'mm3', 'init', '--yes', '--no-key']), exec(b, [`/work/${path.basename(bin)}`, 'init', '--yes', '--no-key'])],
      [exec(a, ['mm3', 'init', '--yes', '--no-key']), exec(b, ['mm3', 'init', '--yes', '--no-key'])],
    ] as const;
    compareOutcome('4 re-init: the bootstrap command again', r4[0][0], r4[0][1]);
    compareOutcome('4 re-init: the installed mm3', r4[1][0], r4[1][1]);
    const t4 = [tree(a), tree(b)] as const;
    expectUnchanged('4 re-init', 'A', t3[0], t4[0]);
    expectUnchanged('4 re-init', 'B', t3[1], t4[1]);
    compareTrees('4 re-init', t4[0], t4[1]);

    // 5 upgrade to the newer build, then the same verbs against the ledger the old build wrote
    const ua = [
      exec(a, ['npm', 'install', '-g', '--prefix', `${HOME}/.local`, `/work/${path.basename(tgzNext)}`]),
      exec(a, ['mm3', 'init', '--yes', '--no-key']),
    ] as const;
    const ub = exec(b, [`/work/${path.basename(binNext)}`, 'init', '--yes', '--no-key']);
    stageCount += 1;
    if (ua[0].exit !== 0) note('5 upgrade: npm install -g (A)', 'exit', 'must-fix', clipText(ua[0].stderr));
    compareOutcome('5 upgrade: init after the swap', ua[1], ub);
    const t5 = [tree(a), tree(b)] as const;
    compareTrees('5 upgrade', t5[0], t5[1]);
    const v5 = [exec(a, ['mm3', '--version']), exec(b, ['mm3', '--version'])] as const;
    compareOutcome('5 upgrade: mm3 --version', v5[0], v5[1]);
    for (const [label, r] of [['A', v5[0]], ['B', v5[1]]] as const) {
      stageCount += 1;
      if (r.stdout.trim() !== next) note(`5 upgrade: ${label} reports ${next}`, 'stdout', 'must-fix', r.stdout || r.stderr);
    }
    runSteps('5 upgrade', a, b, stepNamed('doctor', 'view id', 'class reuse', 'report'), ctxs);
    await mcpStages('5 upgrade', a, b);
    hookStages('5 upgrade', a, b);
    const t5pre = [tree(a), tree(b)] as const;
    const r5 = [exec(a, ['mm3', 'init', '--yes', '--no-key']), exec(b, ['mm3', 'init', '--yes', '--no-key'])] as const;
    compareOutcome('5 upgrade: re-init after the upgrade', r5[0], r5[1]);
    const t5b = [tree(a), tree(b)] as const;
    expectUnchanged('5 upgrade then re-init', 'A', t5pre[0], t5b[0]);
    expectUnchanged('5 upgrade then re-init', 'B', t5pre[1], t5b[1]);

    // 6 uninstall
    const xa = exec(a, ['mm3', 'uninstall', '--all', '--yes']);
    const xb = exec(b, ['mm3', 'uninstall', '--all', '--yes']);
    compareOutcome('6 uninstall --all', xa, xb);
    const t6 = [tree(a), tree(b)] as const;
    compareTrees('6 uninstall', t6[0], t6[1]);
    for (const [label, c, t] of [['A', a, t6[0]], ['B', b, t6[1]]] as const) {
      const left = t.split('\n').filter((l) => !/^d /.test(l) && !/ \.\/proj(\/|$)/.test(l) && !/ \.\/\.claude\/plugins\/(cache|installed)/.test(l));
      stageCount += 1;
      if (left.length) note(`6 uninstall: ${label} files left in HOME (not the project, not Claude's own cache)`, 'files', 'must-fix', left.join(' | '));
      const w = sh(c, 'command -v mm3; true', { cwd: HOME });
      if (w.stdout.trim()) note(`6 uninstall: ${label} mm3 still on PATH`, 'stdout', 'must-fix', w.stdout);
    }
    await transitionStages(a, b, path.basename(tgz), path.basename(bin), ctxs);
    return { rows, stages: stageCount };
  } finally {
    for (const c of [a, b]) if (c) docker(['rm', '-f', c.name]);
    // files the containers created belong to uid 1000, which a runner user cannot delete; a leftover scratch folder is not a failure
    try { rmSync(scratch, { recursive: true, force: true }); } catch { /* temp folder; the runner is thrown away */ }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { rows: out, stages } = await runInstallParity();
    const j = process.argv.indexOf('--json');
    if (j >= 0) writeFileSync(process.argv[j + 1]!, JSON.stringify(out, null, 2));
    console.log(renderTable(out));
    const bad = out.filter((r) => r.kind === 'must-fix').length;
    for (const r of out.filter((x) => x.kind === 'must-fix')) console.log(`\nMUST FIX · ${r.step} · ${r.field}\n  ${r.detail.split(' | ').join('\n  ')}`);
    console.log(`\nparity:install: ${stages} comparisons, ${out.length} difference${out.length === 1 ? '' : 's'} (${out.length - bad} expected, ${bad} MUST FIX)`);
    process.exit(bad ? 1 : 0);
  } catch (e) {
    console.error(`✖ parity:install: ${(e as Error).message}`);
    process.exit(2);
  }
}

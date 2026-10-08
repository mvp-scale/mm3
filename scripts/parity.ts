/**
 * `npm run parity`: the same fixed inputs through (A) the npm build (node dist/cli.js) and (B) the standalone
 * binary (dist-binary/mm3-<version>-<target>, or --bin <file> / MM3_BIN), each in its own temp copy of one
 * identical project, with the offline fake provider (free: no network, no key, a throwaway HOME). Per command it
 * compares exit code, stdout, stderr and the ledger rows the command wrote, after normalising only text that
 * legitimately varies per run (timestamps, run uids, temp paths, millisecond timings). Anything else that
 * differs is a finding: EXPECTED (a rule below names the line and the one-line reason) or MUST FIX. Exits
 * non-zero only on MUST FIX. Launch env comes from test/helpers/cli.ts (cliEnv); the project and request
 * sequence mirror scripts/flows.sh. Nothing here changes product behaviour: it only runs and compares.
 */
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { cliEnv } from '../test/helpers/cli.ts';

export type Field = 'exit' | 'stdout' | 'stderr' | 'ledger';
export type Kind = 'same' | 'expected' | 'must-fix';

/** A difference MM3 owners already know about: every differing line of `field` in a case matching `cmd` must
 *  match `line`, and `reason` says why it is fine. Keep this list short; an unexplained diff is a MUST FIX. */
export interface ExpectedRule {
  cmd: RegExp;
  field: Field | '*';
  line: RegExp;
  reason: string;
}

export const EXPECTED: ExpectedRule[] = [
  { cmd: /^doctor$/, field: 'stdout', line: /^\s+node: v\d/, reason: 'the standalone carries its own pinned Node; the npm build reports the host Node' },
];

/** Replaces per-run text with fixed tokens. `dirs` are this side's temp folders (replaced by `<DIR>`). */
export function normalise(text: string, dirs: string[]): string {
  let out = text;
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) out = out.split(d).join('<DIR>');
  return out
    .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z/g, '<TS>')
    .replace(/("u?id":")[0-9A-Z]{26}(")/g, '$1<UID>$2')
    .replace(/(\buid: )[0-9A-Z]{26}\b/g, '$1<UID>')
    .replace(/("(?:ms|latencyMs|durationMs|elapsedMs)":)\d+/g, '$1<MS>')
    .replace(/\b\d+(?:\.\d+)? ?ms\b/g, '<MS>');
}

export interface Diff {
  /** `A: <line>` for lines only the npm build produced, `B: <line>` for lines only the standalone produced. */
  lines: string[];
}

/** Lines that are not in both texts (a multiset difference, so order-only changes are not reported). */
export function diffLines(a: string, b: string): Diff {
  const count = new Map<string, number>();
  for (const l of a.split('\n')) count.set(l, (count.get(l) ?? 0) + 1);
  const onlyB: string[] = [];
  for (const l of b.split('\n')) {
    const n = count.get(l) ?? 0;
    if (n > 0) count.set(l, n - 1);
    else onlyB.push(l);
  }
  const onlyA: string[] = [];
  for (const [l, n] of count) for (let i = 0; i < n; i++) onlyA.push(l);
  return { lines: [...onlyA.map((l) => `A: ${l}`), ...onlyB.map((l) => `B: ${l}`)] };
}

export interface Verdict {
  kind: Kind;
  detail: string;
  reason: string;
}

/** Same, EXPECTED (every differing line is covered by a rule) or MUST FIX, for one field of one command. */
export function classify(cmd: string, field: Field, a: string, b: string, rules: ExpectedRule[] = EXPECTED): Verdict {
  if (a === b) return { kind: 'same', detail: '', reason: '' };
  const { lines } = diffLines(a, b);
  const detail = lines.map((l) => l.trim()).join(' | ');
  const reasons: string[] = [];
  for (const l of lines) {
    const text = l.slice(3);
    const rule = rules.find((r) => r.cmd.test(cmd) && (r.field === '*' || r.field === field) && r.line.test(text));
    if (!rule) return { kind: 'must-fix', detail, reason: '' };
    if (!reasons.includes(rule.reason)) reasons.push(rule.reason);
  }
  return { kind: 'expected', detail, reason: reasons.join('; ') };
}

// ---- the fixed input set ---------------------------------------------------------------------------------

export interface Ctx {
  commits: [string, string];
  captured: Record<string, string>;
}

export interface Step {
  name: string;
  args: string[] | ((c: Ctx) => string[]);
  stdin?: string;
  /** Write this step's stdout into a file in the project (a request the next steps run). */
  save?: string;
  /** Keep a value from this step's stdout for later steps (this side's own). */
  capture?: { key: string; re: RegExp };
}

const BAD_REQUEST = 'mak:\n  goal: only a goal, nothing else\n';

export const STEPS: Step[] = [
  { name: 'help', args: ['help'] },
  { name: 'help class', args: ['help', 'class'] },
  { name: 'help authoring', args: ['help', 'authoring'] },
  { name: '--version', args: ['--version'] },
  { name: 'no arguments', args: [] },
  { name: 'doctor', args: ['doctor'] },
  { name: 'agent', args: ['agent'] },
  { name: 'agent class', args: ['agent', 'class'] },
  { name: 'agent probe', args: ['agent', 'probe'] },
  { name: 'template view', args: ['template', 'view'] },
  { name: 'template class', args: ['template', 'class'], save: 'req-class.yaml' },
  { name: 'template replay', args: ['template', 'replay'] },
  { name: 'template scan', args: ['template', 'scan'], save: 'req-scan.yaml' },
  { name: 'template drill', args: ['template', 'drill'] },
  { name: 'template loop', args: ['template', 'loop'], save: 'req-loop.yaml' },
  { name: 'template nonsense', args: ['template', 'nonsense'] },
  { name: 'unknown command', args: ['frobnicate'] },
  { name: 'init bad scope', args: ['init', '--scope', 'bogus'] },
  { name: 'view empty place', args: ['view', 'src'] },
  { name: 'class dry-run', args: ['class', 'req-class.yaml', '--dry-run'] },
  { name: 'class invalid request', args: ['class', 'bad.yaml'] },
  { name: 'class missing file', args: ['class', 'nope.yaml'] },
  { name: 'class', args: ['class', 'req-class.yaml'] },
  { name: 'class reuse', args: ['class', 'req-class.yaml'] },
  { name: 'view request', args: ['view', 'req-class.yaml'] },
  { name: 'view id', args: ['view', 'MM3-0001'] },
  { name: 'template drill from run', args: ['template', 'drill', '--parent', 'MM3-0001', '--from', 'injection'], save: 'req-drill.yaml' },
  { name: 'drill', args: ['drill', 'req-drill.yaml'] },
  { name: 'replay', args: (c) => ['replay', '--parent', 'MM3-0001', '--compare', `${c.commits[0]}..${c.commits[1]}`, '--expect', 'injection'] },
  { name: 'scan', args: ['scan', 'req-scan.yaml'], capture: { key: 'scan', re: /^ {2}id: (\S+)/m } },
  { name: 'template drill from scan', args: (c) => ['template', 'drill', '--parent', c.captured.scan ?? 'MM3-0000', '--from', 'src/handlers/user.ts/findUser'], save: 'req-drill-sweep.yaml' },
  { name: 'drill sweep', args: ['drill', 'req-drill-sweep.yaml'] },
  { name: 'loop', args: ['loop', 'req-loop.yaml'] },
  { name: 'report', args: ['report'] },
  { name: 'report hits', args: ['report', 'hits'] },
  { name: 'report patterns', args: ['report', 'patterns'] },
  { name: 'report problems', args: ['report', 'problems'] },
  { name: 'report graph', args: ['report', 'graph'] },
  { name: 'report history', args: ['report', 'history'] },
  { name: 'outcome refused (own run)', args: ['outcome', 'MM3-0001', 'held', '--by', 'e2e-agent'] },
  { name: 'outcome held', args: ['outcome', 'MM3-0001', 'held', '--by', 'qa-reviewer'] },
  { name: 'outcome repeat', args: ['outcome', 'MM3-0001', 'held', '--by', 'qa-reviewer'] },
  { name: 'budget', args: ['budget'] },
  { name: 'budget set (removed)', args: ['budget', 'set', '--usd', '5'] },
  { name: 'init --agents', args: ['init', '--agents'] },
];

// ---- running one side ------------------------------------------------------------------------------------

interface Outcome {
  exit: number | null;
  stdout: string;
  stderr: string;
  ledger: string;
  /** Present on a side that did not run the step. */
  skipped?: boolean;
}

interface Side {
  label: 'A' | 'B';
  cmd: string[];
  dir: string;
  home: string;
  dirs: string[];
}

const FIXTURE = {
  'src/user.ts': 'export function findUser(id: string) {\n  const q = "SELECT * FROM users WHERE id = " + id;\n  return db.query(q);\n}\n',
};

/** One project (a git repo, two commits, same bytes everywhere) built once and copied for each side. */
export function makeFixture(root: string): [string, string] {
  const git = (...a: string[]): string => execFileSync('git', ['-c', 'user.email=parity@mm3.local', '-c', 'user.name=parity', ...a], { cwd: root, encoding: 'utf8' }).trim();
  mkdirSync(path.join(root, 'src/handlers'), { recursive: true });
  writeFileSync(path.join(root, 'src/user.ts'), FIXTURE['src/user.ts']);
  writeFileSync(path.join(root, 'src/handlers/user.ts'), FIXTURE['src/user.ts']);
  writeFileSync(path.join(root, 'bad.yaml'), BAD_REQUEST);
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'first: findUser reads request text straight into a query', '--date', '2026-01-01T00:00:00Z');
  const c1 = git('rev-parse', 'HEAD');
  writeFileSync(path.join(root, 'src/user.ts'), `${FIXTURE['src/user.ts']}// reviewed\n`);
  git('add', '-A');
  git('commit', '-q', '-m', 'second: a reviewer comment');
  return [c1, git('rev-parse', 'HEAD')];
}

function sideEnv(s: Side): NodeJS.ProcessEnv {
  return cliEnv(s.dir, { HOME: s.home, USERPROFILE: s.home });
}

function readLedger(dir: string): string[] {
  const file = path.join(dir, '.mm3', 'log.jsonl');
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
}

function runStep(s: Side, args: string[], stdin: string, ledgerBefore: number): Outcome {
  const [prog, ...pre] = s.cmd;
  const r = spawnSync(prog!, [...pre, ...args], { cwd: s.dir, input: stdin, encoding: 'utf8', env: sideEnv(s), timeout: 120_000, killSignal: 'SIGKILL' });
  const rows = readLedger(s.dir).slice(ledgerBefore);
  return { exit: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', ledger: rows.join('\n') };
}

/** `mm3 mcp` over stdio: initialize, tools/list, one tools/call of the `mm3` tool. Returns each reply as text. */
function runMcp(s: Side): Promise<Outcome> {
  return new Promise((resolve) => {
    const [prog, ...pre] = s.cmd;
    const child = spawn(prog!, [...pre, 'mcp'], { cwd: s.dir, env: sideEnv(s), stdio: ['pipe', 'pipe', 'pipe'] });
    const replies: string[] = [];
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'parity', version: '0' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'mm3', arguments: { args: ['template', 'class'] } } },
    ];
    const expected = 3;
    const rl = createInterface({ input: child.stdout });
    let done = false;
    const finish = (code: number | null, note = ''): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      resolve({ exit: code, stdout: replies.join('\n'), stderr: stderr + note, ledger: '' });
    };
    const timer = setTimeout(() => finish(null, `\nparity: mcp gave ${replies.length} of ${expected} replies in 30s`), 30_000);
    rl.on('line', (line) => {
      replies.push(line);
      if (replies.length === expected) {
        child.stdin.end();
        finish(0);
      }
    });
    child.on('error', (e) => finish(null, `\nparity: ${e.message}`));
    for (const q of requests) child.stdin.write(`${JSON.stringify(q)}\n`);
  });
}

function projectFiles(dir: string): string {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
      if (e.name === '.git' || e.name === 'home') continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(`${path.relative(dir, full)}${statSync(full).size === 0 ? ' (empty)' : ''}`);
    }
  };
  walk(dir);
  return out.join('\n');
}

// ---- the comparison --------------------------------------------------------------------------------------

export interface Row {
  step: string;
  field: Field | 'files';
  kind: Kind;
  detail: string;
  reason: string;
}

function mustFix(step: string, field: Row['field'], detail: string): Row {
  return { step, field, kind: 'must-fix', detail, reason: '' };
}

function clip(s: string, n = 150): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}

function compare(step: string, a: Outcome, b: Outcome, sa: Side, sb: Side): Row[] {
  const rows: Row[] = [];
  const fields: Array<[Field, string, string]> = [
    ['exit', `exit ${a.exit}`, `exit ${b.exit}`],
    ['stdout', normalise(a.stdout, sa.dirs), normalise(b.stdout, sb.dirs)],
    ['stderr', normalise(a.stderr, sa.dirs), normalise(b.stderr, sb.dirs)],
    ['ledger', normalise(a.ledger, sa.dirs), normalise(b.ledger, sb.dirs)],
  ];
  for (const [field, x, y] of fields) {
    const v = classify(step, field, x, y);
    if (v.kind !== 'same') rows.push({ step, field, kind: v.kind, detail: clip(v.detail), reason: v.reason });
  }
  return rows;
}

function setup(label: 'A' | 'B', cmd: string[], fixture: string, scratch: string): Side {
  const dir = path.join(scratch, label);
  cpSync(fixture, dir, { recursive: true });
  const home = path.join(dir, 'home');
  mkdirSync(home, { recursive: true });
  const real = realpathSync(dir);
  return { label, cmd, dir, home, dirs: [...new Set([dir, real])] };
}

/** Newest mtime of a file under `dir` (or of `dir` itself when it is a file). */
function newest(dir: string, skip: (p: string) => boolean = () => false): number {
  const st = statSync(dir);
  if (!st.isDirectory()) return st.mtimeMs;
  let m = 0;
  for (const e of readdirSync(dir)) if (!skip(e)) m = Math.max(m, newest(path.join(dir, e), skip));
  return m;
}

function defaultBinary(version: string): string {
  const target = process.platform === 'win32' ? 'win-x64' : 'linux-x64';
  return path.resolve('dist-binary', `mm3-${version}-${target}${process.platform === 'win32' ? '.exe' : ''}`);
}

export async function runParity(opts: { bin?: string; verbose?: boolean } = {}): Promise<{ rows: Row[]; steps: number }> {
  const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  const bin = opts.bin ?? process.env.MM3_BIN ?? defaultBinary(version);
  const cli = path.resolve('dist/cli.js');
  if (!existsSync(cli) || newest('src') > newest(cli)) {
    console.error('parity: dist/cli.js is missing or older than src/, building (npm run build)');
    execFileSync('npm', ['run', 'build', '--silent'], { stdio: 'inherit' });
  }
  if (!existsSync(bin)) throw new Error(`the standalone ${bin} is missing → run "npm run build:binary -- --target linux-x64" (needs the network once)`);
  if (newest('src') > statSync(bin).mtimeMs || newest('skills') > statSync(bin).mtimeMs || newest('.claude-plugin') > statSync(bin).mtimeMs) {
    throw new Error(`the standalone ${bin} is older than src/, skills/ or .claude-plugin/ → rebuild it with "npm run build:binary -- --target linux-x64"`);
  }

  const scratch = mkdtempSync(path.join(os.tmpdir(), 'mm3-parity-'));
  try {
    const fixture = path.join(scratch, 'fixture');
    mkdirSync(fixture);
    const commits = makeFixture(fixture);
    const a = setup('A', [process.execPath, cli], fixture, scratch);
    const b = setup('B', [path.resolve(bin)], fixture, scratch);
    const ctx = { A: { commits, captured: {} as Record<string, string> }, B: { commits, captured: {} as Record<string, string> } } satisfies Record<string, Ctx>;
    const rows: Row[] = [];

    for (const step of STEPS) {
      const out: Record<'A' | 'B', Outcome> = { A: undefined as never, B: undefined as never };
      for (const s of [a, b]) {
        const c = ctx[s.label];
        const args = typeof step.args === 'function' ? step.args(c) : step.args;
        out[s.label] = runStep(s, args, step.stdin ?? '', readLedger(s.dir).length);
        if (step.save) writeFileSync(path.join(s.dir, step.save), out[s.label].stdout);
        if (step.capture) c.captured[step.capture.key] = step.capture.re.exec(out[s.label].stdout)?.[1] ?? '';
      }
      rows.push(...compare(step.name, out.A, out.B, a, b));
      if (opts.verbose) console.error(`  ${step.name}: A exit ${out.A.exit}, B exit ${out.B.exit}, ledger rows ${out.A.ledger ? out.A.ledger.split('\n').length : 0}/${out.B.ledger ? out.B.ledger.split('\n').length : 0}`);
    }

    const [ma, mb] = await Promise.all([runMcp(a), runMcp(b)]);
    rows.push(...compare('mcp initialize + tools/list + tools/call', ma, mb, a, b));
    if (ma.exit !== 0 || mb.exit !== 0) rows.push(mustFix('mcp', 'exit', `a side did not answer all three requests (A exit ${ma.exit}, B exit ${mb.exit}): ${clip(ma.stderr + mb.stderr)}`));

    const fa = normalise(projectFiles(a.dir), a.dirs).replace(/^\.mm3\/index\.db.*\n?/gm, '');
    const fb = normalise(projectFiles(b.dir), b.dirs).replace(/^\.mm3\/index\.db.*\n?/gm, '');
    const v = classify('project files', 'stdout', fa, fb);
    if (v.kind !== 'same') rows.push({ step: 'files left in the project', field: 'files', kind: v.kind, detail: clip(v.detail), reason: v.reason });

    return { rows, steps: STEPS.length + 2 };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function renderTable(rows: Row[]): string {
  if (!rows.length) return 'no differences';
  const head = ['kind', 'step', 'field', 'difference (A = npm build, B = standalone)', 'why expected'];
  const body = rows.map((r) => [r.kind === 'must-fix' ? 'MUST FIX' : 'expected', r.step, r.field, r.detail || '-', r.reason || '-']);
  const widths = head.map((h, i) => Math.min(70, Math.max(h.length, ...body.map((r) => r[i]!.length))));
  const line = (cells: string[]): string => cells.map((c, i) => (c.length > widths[i]! ? `${c.slice(0, widths[i]! - 1)}…` : c.padEnd(widths[i]!))).join(' | ');
  return [line(head), widths.map((w) => '-'.repeat(w)).join('-|-'), ...body.map(line)].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--bin');
  try {
    const { rows, steps } = await runParity({ bin: i >= 0 ? argv[i + 1] : undefined, verbose: argv.includes('--verbose') });
    console.log(renderTable(rows));
    const bad = rows.filter((r) => r.kind === 'must-fix').length;
    console.log(`\nparity: ${steps} steps, ${rows.length} difference${rows.length === 1 ? '' : 's'} (${rows.length - bad} expected, ${bad} MUST FIX)`);
    process.exit(bad ? 1 : 0);
  } catch (e) {
    console.error(`✖ parity: ${(e as Error).message}`);
    process.exit(2);
  }
}

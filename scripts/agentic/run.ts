// Level 3, the full agentic run: a real agent does a real task with the published tool on the baseline project, over the
// CLI route (the npm package installed into a clean prefix, `mm3` on PATH) or the MCP route (the plugin loaded from a
// clean checkout of the version's commit). Each scenario states its goal and its checkpoints up front
// (test/agentic/scenarios/baseline.json, scripts/agentic/checkpoints.ts); a run passes when every checkpoint does, and a
// red checkpoint says where to look. The gate model runs several trials and must pass most of them; the floor model runs
// once and is reported, not gated. The sample provider is used throughout, so no checkpoint depends on a key.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { attemptsByAgent, runClaude, type ClaudeRun } from './claude.ts';
import { evaluate, metrics } from './checkpoints.ts';

export interface FullScenario {
  id: string;
  goal: string;
  prompt: string;
  model: 'haiku' | 'sonnet';
  routes: Array<'cli' | 'mcp'>;
  helpers?: number;
  promise: number;
  checkpoints: string[];
}

export interface FullRow {
  id: string;
  route: 'cli' | 'mcp';
  model: string;
  resolvedModel: string | null;
  trial: number;
  pass: boolean;
  checks: Array<{ id: string; text: string; means: string; pass: boolean }>;
  attempts: number[]; // verb requests to a verdict, per agent (0 = never)
  firstRequestAccepted: boolean;
  mm3Calls: number;
  problems: string[];
  costUsd: number;
  transcript?: string; // file name under lab/archive/agentic
  transcriptSha256?: string; // digest of that file, so the record can say which transcript it means
}

export interface Rules {
  attemptsToVerdict: number;
  firstAttemptTarget: number;
  gateModel: 'haiku' | 'sonnet';
  floorModel: 'haiku' | 'sonnet';
  trialsPerScenario: number;
  mustPassTrials: number;
}

const sh = (cmd: string, args: string[], cwd?: string): string => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${(r.stderr || r.stdout).slice(0, 300)}`);
  return r.stdout.trim();
};
const expand = (p: string): string => p.replace(/^~/u, os.homedir());

/** The pinned baseline checkout, verified, copied to a throwaway folder for one run. */
export function prepareProject(fixtureFile = 'test/agentic/fixture.json', source = process.env.JUICE_SHOP): string {
  const fx = JSON.parse(readFileSync(fixtureFile, 'utf8')) as { sha: string; tag: string; defaultCheckout: string };
  const from = expand(source ?? fx.defaultCheckout);
  if (!existsSync(from)) throw new Error(`baseline project not found at ${from}`);
  const sha = sh('git', ['rev-parse', 'HEAD'], from);
  if (sha !== fx.sha) throw new Error(`baseline project is at ${sha.slice(0, 7)}, the pin is ${fx.tag} (${fx.sha.slice(0, 7)})`);
  const dest = mkdtempSync(path.join(os.tmpdir(), 'mm3-agentic-project-'));
  cpSync(from, dest, { recursive: true });
  rmSync(path.join(dest, '.mm3'), { recursive: true, force: true }); // a fresh ledger every run, whatever was done by hand in the source folder
  return dest;
}

/** The commit a nightly version was built from: `x.y.z-nightly.<date>.g<sha>`. */
export const commitOf = (version: string): string | undefined => /\.g([0-9a-f]{7,40})$/u.exec(version)?.[1];

/** A clean checkout of this repo at `commit`: what a marketplace install of that build is. */
export function checkoutPlugin(commit: string): string {
  const dest = mkdtempSync(path.join(os.tmpdir(), 'mm3-agentic-plugin-'));
  sh('git', ['clone', '-q', '--shared', process.cwd(), dest]);
  sh('git', ['checkout', '-q', commit], dest);
  return dest;
}

/** The published npm package, installed into a clean prefix; returns the bin directory to put on PATH. */
export function installPackage(version: string): string {
  const prefix = mkdtempSync(path.join(os.tmpdir(), 'mm3-agentic-npm-'));
  sh('npm', ['install', '--prefix', prefix, '--no-audit', '--no-fund', '--silent', `@mvpscale/mm3@${version}`]);
  return path.join(prefix, 'node_modules', '.bin');
}

export function grade(s: FullScenario, run: ClaudeRun, project: string, route: 'cli' | 'mcp', model: string, trial: number): FullRow {
  const log = path.join(project, '.mm3', 'log.jsonl');
  const ev = { calls: run.calls, answer: run.answer, ledger: existsSync(log) ? readFileSync(log, 'utf8') : '', promise: s.promise, helpers: s.helpers ?? 0 };
  const checks = evaluate(s.checkpoints, ev);
  const m = metrics(ev);
  const problems = checks.filter((c) => !c.pass).map((c) => `${c.id}: ${c.means}`);
  if (!run.ok) problems.unshift(`the run did not finish${run.error ? ` (${run.error})` : ''}`);
  const attempts = attemptsByAgent(run.calls).map((g) => g.outcomes.indexOf(true) + 1);
  return { id: s.id, route, model, resolvedModel: run.model, trial, pass: run.ok && checks.every((c) => c.pass), checks, attempts, firstRequestAccepted: m.firstRequestAccepted, mm3Calls: m.mm3Calls, problems, costUsd: run.costUsd };
}

/** Gate rows (the gate model, several trials) and floor rows (the other model, once). */
export function runFull(scenarios: FullScenario[], version: string, rules: Rules, log: (s: string) => void = () => undefined, trialsOverride?: number): FullRow[] {
  const commit = commitOf(version);
  const rows: FullRow[] = [];
  const bin = scenarios.some((s) => s.routes.includes('cli')) ? installPackage(version) : '';
  const plugin = scenarios.some((s) => s.routes.includes('mcp')) ? (commit ? checkoutPlugin(commit) : (() => { throw new Error(`cannot find the commit in version ${version}; the MCP route needs it`); })()) : '';
  const plan = scenarios.flatMap((s) => s.routes.flatMap((route) => [
    ...Array.from({ length: trialsOverride ?? rules.trialsPerScenario }, (_, i) => ({ s, route, model: rules.gateModel, trial: i + 1 })),
    { s, route, model: rules.floorModel, trial: 1 },
  ]));
  for (const { s, route, model, trial } of plan) {
    const project = prepareProject();
    const isolated = { MM3_PROVIDER: 'fake', TYPESAFE_API_KEY: '', AI_GATEWAY_API_KEY: '', XDG_CONFIG_HOME: path.join(project, '.no-config'), MM3_ACTOR: 'agentic' };
    const base = ['Read', 'Glob', 'Grep'];
    const shell = ['Bash(mm3 *)', 'Bash(*/.bin/mm3 *)', 'Bash(command -v *)', 'Bash(which *)', 'Bash(cat *)', 'Bash(echo *)', 'Bash(printf *)', 'Bash(ls *)', 'Bash(pwd)', 'Bash(grep *)', 'Bash(find *)'];
    const run = route === 'cli'
      ? runClaude({ prompt: s.prompt, model, cwd: project, tools: [...base, 'Write', 'Bash'], allowedTools: [...base, 'Write', ...shell], env: { ...isolated, PATH: `${bin}:${process.env.PATH}` }, budgetUsd: 2 })
      : runClaude({ prompt: s.prompt, model, cwd: project, tools: [...base, 'Agent'], allowedTools: [...base, 'Agent', 'mcp__plugin_mm3_mm3__mm3'], pluginDir: plugin, env: isolated, budgetUsd: 2 });
    const row = grade(s, run, project, route, model, trial);
    rows.push(row);
    // every transcript is kept (gitignored lab/archive) so a red row can be read, not guessed at
    mkdirSync('lab/archive/agentic', { recursive: true });
    const file = `${version}-${s.id}-${route}-${model}-${trial}.json`;
    const body = JSON.stringify({ row, answer: run.answer, plugins: run.plugins, mcp: run.mcp, calls: run.calls }, null, 1);
    writeFileSync(`lab/archive/agentic/${file}`, body);
    row.transcript = file;
    row.transcriptSha256 = createHash('sha256').update(body).digest('hex');
    log(`  ${row.pass ? '✔' : '✖'} ${s.id} · ${route} · ${model} · trial ${trial}: attempts ${JSON.stringify(row.attempts)}${row.problems.length ? ` — ${row.problems.join(' | ')}` : ''}`);
  }
  return rows;
}

export interface Cell { id: string; route: string; model: string; passed: number; trials: number }

/** Passes per scenario × route × model. */
export function cells(rows: FullRow[]): Cell[] {
  const key = (r: FullRow): string => `${r.id}|${r.route}|${r.model}`;
  return [...new Set(rows.map(key))].map((k) => {
    const rs = rows.filter((r) => key(r) === k);
    return { id: rs[0]!.id, route: rs[0]!.route, model: rs[0]!.model, passed: rs.filter((r) => r.pass).length, trials: rs.length };
  });
}

/** The level 3 gate: the gate model passes at least `mustPassTrials` of its trials in every scenario × route. The floor model never gates. */
export function level3Passes(rows: FullRow[], rules: Rules): boolean {
  const gate = cells(rows).filter((c) => c.model === rules.gateModel);
  return gate.length > 0 && gate.every((c) => c.passed >= Math.min(rules.mustPassTrials, c.trials));
}

if (process.argv[1]?.endsWith('run.ts')) {
  const version = process.argv[2];
  if (!version) throw new Error('usage: tsx scripts/agentic/run.ts <exact npm version> [scenario id] [--trials N]');
  const spec = JSON.parse(readFileSync('test/agentic/scenarios/baseline.json', 'utf8')) as { full: FullScenario[]; rules: Rules };
  const only = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : undefined;
  const t = process.argv.indexOf('--trials');
  const rows = runFull(only ? spec.full.filter((s) => s.id === only) : spec.full, version, spec.rules, console.log, t > 0 ? Number(process.argv[t + 1]) : undefined);
  for (const c of cells(rows)) console.log(`${c.id} · ${c.route} · ${c.model}: ${c.passed}/${c.trials}${c.model === spec.rules.gateModel ? '' : ' (floor, not gating)'}`);
  console.log(`\nlevel 3 gate (${spec.rules.gateModel}, at least ${spec.rules.mustPassTrials} of ${spec.rules.trialsPerScenario}): ${level3Passes(rows, spec.rules) ? 'PASS' : 'FAIL'} · notional cost $${rows.reduce((a, r) => a + r.costUsd, 0).toFixed(2)}`);
}

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
import { addUsage, attemptsByAgent, noUsage, runClaude, type ClaudeRun, type Usage } from './claude.ts';
import { economics, recoveryOf, type Economics, type Recovery } from './trace.ts';
import { CHECKPOINTS, evaluate, metrics } from './checkpoints.ts';

export interface FullScenario {
  id: string;
  goal: string;
  prompt: string;
  model: 'haiku' | 'sonnet';
  routes: Array<'cli' | 'mcp'>;
  helpers?: number;
  promise: number;
  setup?: 'config-runs-1' | 'plugin-record-mismatch'; // what the project (or the environment) is set up with before the agent starts
  shell?: 'mm3-only'; // the agent's shell may run only mm3: for a job about asking MM3 itself, so it cannot read the machine around it
  terminal?: boolean; // on the MCP route, the agent also gets a shell with the `mm3` command: for a job that compares the terminal with the plugin
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
  usage: Usage;
  economics: Economics; // where the tokens went, by kind of call
  recovery: Recovery; // after each stop: did the agent stay on MM3, and did its next MM3 request fix it
  spentUsd?: number; // paid trials: the real TypeSafe dollars this run spent
  adapters?: Record<string, number>; // which providers answered this run's MM3 requests, read from the project ledger
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

/** For the install-health job on the CLI route: Claude Code uses CLAUDE_CONFIG_DIR for its own login, so the fake plugin record cannot be set for the whole session.
 *  A small `mm3` on the path sets it for MM3 alone and runs the real one. Returns the folder to put first on PATH. */
export function shimMm3(realBin: string, claudeDir: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mm3-agentic-shim-'));
  writeFileSync(path.join(dir, 'mm3'), `#!/bin/sh\nCLAUDE_CONFIG_DIR=${JSON.stringify(claudeDir)} exec ${JSON.stringify(path.join(realBin, 'mm3'))} "$@"\n`, { mode: 0o755 });
  return dir;
}

/** The state a job starts from, written before the agent runs. Returns any extra environment it needs. Plain files, nothing hidden from the agent. */
export function applySetup(setup: FullScenario['setup'], project: string): Record<string, string> {
  if (setup === 'config-runs-1') {
    mkdirSync(path.join(project, '.mm3'), { recursive: true });
    writeFileSync(path.join(project, '.mm3', 'config.yaml'), 'budget:\n  runs: 1\n');
    return {};
  }
  if (setup === 'plugin-record-mismatch') {
    // Claude's own record of an installed mm3 plugin, at an older commit than the copy under test
    const claude = mkdtempSync(path.join(os.tmpdir(), 'mm3-agentic-claude-')); // outside the project, so the agent does not find the fixture by looking around
    const install = path.join(claude, 'plugins', 'cache', 'mm3', 'mm3', 'f337f612ebb4');
    mkdirSync(install, { recursive: true });
    writeFileSync(path.join(install, 'package.json'), JSON.stringify({ name: '@mvpscale/mm3', version: '0.1.1' }));
    writeFileSync(path.join(claude, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'mm3@mvp-scale': [{ scope: 'user', installPath: install, version: 'f337f612ebb4', gitCommitSha: 'f337f612ebb4deadbeefdeadbeefdeadbeefdead', lastUpdated: '2026-10-01T00:00:00.000Z' }] } }));
    return { CLAUDE_CONFIG_DIR: claude };
  }
  return {};
}

export function grade(s: FullScenario, run: ClaudeRun, project: string, route: 'cli' | 'mcp', model: string, trial: number): FullRow {
  const log = path.join(project, '.mm3', 'log.jsonl');
  const read = (rel: string): string | undefined => (existsSync(path.join(project, rel)) ? readFileSync(path.join(project, rel), 'utf8') : undefined);
  const ev = { calls: run.calls, answer: run.answer, ledger: existsSync(log) ? readFileSync(log, 'utf8') : '', promise: s.promise, helpers: s.helpers ?? 0, read };
  const checks = evaluate(s.checkpoints, ev);
  const m = metrics(ev);
  const problems = checks.filter((c) => !c.pass).map((c) => `${c.id}: ${c.means}`);
  if (!run.ok) problems.unshift(`the run did not finish${run.error ? ` (${run.error})` : ''}`);
  const attempts = attemptsByAgent(run.calls).map((g) => g.outcomes.indexOf(true) + 1);
  return { id: s.id, route, model, resolvedModel: run.model, trial, pass: run.ok && checks.every((c) => c.pass || CHECKPOINTS[c.id]?.severity === 'exception'), checks, attempts, firstRequestAccepted: m.firstRequestAccepted, mm3Calls: m.mm3Calls, problems, usage: run.usage, economics: economics(run.calls), recovery: recoveryOf(run.calls) };
}

/** The real TypeSafe dollars a project's own ledger recorded, summed over its runs. */
export function spentUsd(ledger: string): number {
  return ledger.split('\n').filter((l) => l.includes('"kind":"run"')).reduce((sum, l) => {
    try {
      const c = (JSON.parse(l) as { costUsd?: unknown }).costUsd;
      return sum + (typeof c === 'number' ? c : 0);
    } catch {
      return sum;
    }
  }, 0);
}

/** Which providers answered the runs in a project's ledger. A paid trial that shows `fake` here never reached the live classifier, whatever it was labelled. */
export function adapters(ledger: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of ledger.split('\n').filter((x) => x.includes('"kind":"run"'))) {
    try {
      const a = (JSON.parse(l) as { adapter?: unknown }).adapter;
      if (typeof a === 'string') out[a] = (out[a] ?? 0) + 1;
    } catch {
      /* a line that is not json is not a run */
    }
  }
  return out;
}

/** Puts a dollar cap into the project's config file so MM3's own budget enforces it, keeping whatever the job's setup already wrote. */
export function setCap(project: string, usd: number): void {
  const file = path.join(project, '.mm3', 'config.yaml');
  mkdirSync(path.dirname(file), { recursive: true });
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    /* no config file yet: start one */
  }
  // one pure rewrite and one write: no "does it exist" check between reading and writing the same file
  const next = /^\s{2}usd:/mu.test(text)
    ? text.replace(/^(\s{2}usd:).*$/mu, `$1 ${usd}`)
    : /^budget:/mu.test(text)
      ? text.replace(/^budget:.*$/mu, `budget:\n  usd: ${usd}`)
      : `${text}${text && !text.endsWith('\n') ? '\n' : ''}budget:\n  usd: ${usd}\n`;
  writeFileSync(file, next);
}

export interface RunOptions {
  build?: { bin: string; plugin: string }; // a build to test that is not a published version (a trial's working tree); skips the install and the checkout
  models?: Array<'haiku' | 'sonnet'>; // run exactly these models, `trials` times each, and no floor (a trial picks its model)
  trials?: number;
  paid?: { approvedUsd: number }; // use the live classifier within this many real dollars; the free path is the default
}

/** Gate rows (the gate model, several trials) and floor rows (the other model, once); or, with `models`, exactly those. */
export function runFull(scenarios: FullScenario[], version: string, rules: Rules, log: (s: string) => void = () => undefined, trialsOverride?: number, opts: RunOptions = {}): FullRow[] {
  const commit = commitOf(version);
  const rows: FullRow[] = [];
  const bin = opts.build?.bin ?? (scenarios.some((s) => s.routes.includes('cli') || s.terminal) ? installPackage(version) : '');
  const plugin = opts.build?.plugin ?? (scenarios.some((s) => s.routes.includes('mcp')) ? (commit ? checkoutPlugin(commit) : (() => { throw new Error(`cannot find the commit in version ${version}; the MCP route needs it`); })()) : '');
  const trials = opts.trials ?? trialsOverride ?? rules.trialsPerScenario;
  const plan = scenarios.flatMap((s) => s.routes.flatMap((route) => opts.models
    ? opts.models.flatMap((model) => Array.from({ length: trials }, (_, i) => ({ s, route, model, trial: i + 1 })))
    : [...Array.from({ length: trials }, (_, i) => ({ s, route, model: rules.gateModel, trial: i + 1 })), { s, route, model: rules.floorModel, trial: 1 }]));
  let spent = 0;
  for (const { s, route, model, trial } of plan) {
    if (opts.paid && spent >= opts.paid.approvedUsd) {
      log(`  ■ stopped: the approved $${opts.paid.approvedUsd} is spent ($${spent.toFixed(4)}); ${plan.length - rows.length} planned run(s) not made`);
      break;
    }
    const project = prepareProject();
    const setupEnv = applySetup(s.setup, project);
    if (opts.paid) setCap(project, opts.paid.approvedUsd - spent);
    // free: the sample provider and no key. paid: the owner's own key and settings, never read or printed here; MM3's budget holds the cap.
    // paid is forced onto the live provider: with no key MM3 stops instead of answering from the sample provider, so paid and fake cannot coexist
    const env: Record<string, string> = opts.paid ? { MM3_ACTOR: 'agentic', MM3_PROVIDER: 'typesafe', ...setupEnv } : { MM3_PROVIDER: 'fake', TYPESAFE_API_KEY: '', AI_GATEWAY_API_KEY: '', XDG_CONFIG_HOME: path.join(project, '.no-config'), MM3_ACTOR: 'agentic', ...setupEnv };
    const strict = opts.paid !== undefined; // paid runs deny anything not pre-approved, so the approved list is the real boundary (a strict free run also blocks harmless piping, which real agents do)
    const base = ['Read', 'Glob', 'Grep'];
    // a paid run gets only the mm3 command in the shell: nothing that could print a stored key
    const shell = opts.paid || s.shell === 'mm3-only' ? ['Bash(mm3 *)', 'Bash(*/.bin/mm3 *)', 'Bash(which *)', 'Bash(head *)', 'Bash(tail *)', 'Bash(echo *)'] : ['Bash(mm3 *)', 'Bash(*/.bin/mm3 *)', 'Bash(command -v *)', 'Bash(which *)', 'Bash(cat *)', 'Bash(echo *)', 'Bash(printf *)', 'Bash(ls *)', 'Bash(pwd)', 'Bash(grep *)', 'Bash(find *)'];
    // the fake plugin record must reach MM3 only: Claude Code itself reads CLAUDE_CONFIG_DIR for its login
    const claudeDir = env.CLAUDE_CONFIG_DIR;
    const shim = route === 'cli' && claudeDir ? shimMm3(bin, claudeDir) : undefined;
    if (shim) delete env.CLAUDE_CONFIG_DIR;
    const run = route === 'cli'
      ? runClaude({ prompt: s.prompt, model, cwd: project, tools: [...base, 'Write', 'Edit', 'Bash'], allowedTools: [...base, 'Write', 'Edit', ...shell], env: { ...env, PATH: `${shim ? `${shim}:` : ''}${bin}:${process.env.PATH}` }, budgetUsd: 2, strict })
      : runClaude({ prompt: s.prompt, model, cwd: project, tools: [...base, 'Write', 'Edit', 'Agent', ...(s.terminal ? ['Bash'] : [])], allowedTools: [...base, 'Write', 'Edit', 'Agent', ...(s.terminal ? shell : []), 'mcp__plugin_mm3_mm3__mm3'], pluginDir: plugin, env: s.terminal ? { ...env, PATH: `${bin}:${process.env.PATH}` } : env, budgetUsd: 2, strict }); // both routes get the file tools a Claude Code user has: some jobs change a setting in the project's own files
    const row = grade(s, run, project, route, model, trial);
    const logFile = path.join(project, '.mm3', 'log.jsonl');
    const ledgerText = existsSync(logFile) ? readFileSync(logFile, 'utf8') : '';
    row.adapters = adapters(ledgerText);
    if (opts.paid) {
      row.spentUsd = spentUsd(ledgerText);
      spent += row.spentUsd;
      if ((adapters(ledgerText).fake ?? 0) > 0) {
        row.pass = false;
        row.problems.unshift('the paid trial ran on the sample provider (adapter fake): the key never reached MM3 on this route → store it with `mm3 init` (keychain) for the MCP route, or use --route cli');
      }
    }
    rows.push(row);
    // every transcript is kept (gitignored lab/archive) so a red row can be read, not guessed at
    mkdirSync('lab/archive/agentic', { recursive: true });
    const file = `${version.replace(/[^A-Za-z0-9._+-]/gu, '_')}-${s.id}-${route}-${model}-${trial}.json`;
    const body = JSON.stringify({ row, answer: run.answer, plugins: run.plugins, mcp: run.mcp, turns: run.turns, calls: run.calls }, null, 1);
    writeFileSync(`lab/archive/agentic/${file}`, body);
    row.transcript = file;
    row.transcriptSha256 = createHash('sha256').update(body).digest('hex');
    log(`  ${row.pass ? '✔' : '✖'} ${s.id} · ${route} · ${model} · trial ${trial}: attempts ${JSON.stringify(row.attempts)}${row.problems.length ? ` — ${row.problems.join(' | ')}` : ''}${opts.paid ? ` · spent $${(row.spentUsd ?? 0).toFixed(4)} (running total $${spent.toFixed(4)} of $${opts.paid.approvedUsd})` : ''}`);
  }
  return rows;
}

/** One line for a person: how much a run asked of the model. */
export const usageLine = (u: Usage, runs: number): string => `${runs} runs · ${u.turns} model turns · ${u.inputTokens + u.cacheReadTokens + u.cacheCreationTokens} tokens in, ${u.outputTokens} out`;

export interface Cell { id: string; route: string; model: string; passed: number; trials: number }

/** Passes per scenario × route × model. */
export function cells(rows: Array<{ id: string; route: string; model: string; pass: boolean }>): Cell[] {
  const key = (r: { id: string; route: string; model: string }): string => `${r.id}|${r.route}|${r.model}`;
  return [...new Set(rows.map(key))].map((k) => {
    const rs = rows.filter((r) => key(r) === k);
    return { id: rs[0]!.id, route: rs[0]!.route, model: rs[0]!.model, passed: rs.filter((r) => r.pass).length, trials: rs.length };
  });
}

/** The level 3 gate: the gate model passes at least `mustPassTrials` of its trials in every scenario × route. The floor model never gates. */
export function level3Passes(rows: Array<{ id: string; route: string; model: string; pass: boolean }>, rules: Rules): boolean {
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
  console.log(`\nlevel 3 gate (${spec.rules.gateModel}, at least ${spec.rules.mustPassTrials} of ${spec.rules.trialsPerScenario}): ${level3Passes(rows, spec.rules) ? 'PASS' : 'FAIL'} · ${usageLine(rows.reduce((a, r) => addUsage(a, r.usage), noUsage()), rows.length)}`);
}

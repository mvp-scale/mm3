// Level 3, the full agentic run: a real agent (Haiku or Sonnet) does a real task with the published tool on the
// baseline project, over the CLI route (the npm package installed into a clean prefix, `mm3` on PATH) or the MCP route
// (the plugin loaded from a clean checkout of the version's commit). Graded on what the promise says: a verdict within
// three attempts for every agent that tried, the cited run id real in the ledger. The first-attempt rate is reported
// against its 80% target but does not gate.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { attemptsByAgent, runClaude, type ClaudeRun } from './claude.ts';

export interface FullScenario {
  id: string;
  prompt: string;
  model: 'haiku' | 'sonnet';
  routes: Array<'cli' | 'mcp'>;
  helpers?: number;
}

export interface FullRow {
  id: string;
  route: 'cli' | 'mcp';
  model: string;
  pass: boolean;
  agents: number;
  firstAttempt: number; // share of agents whose first request got a verdict
  attempts: number[]; // attempts to a verdict, per agent (0 = never)
  runIdReal: boolean;
  problems: string[];
  costUsd: number;
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

export function grade(s: FullScenario, run: ClaudeRun, project: string, route: 'cli' | 'mcp', max = 3): FullRow {
  const groups = attemptsByAgent(run.calls);
  const wanted = s.helpers ?? 1;
  const attempts = groups.map((g) => g.outcomes.indexOf(true) + 1);
  const problems: string[] = [];
  if (!run.ok) problems.push(`run did not finish${run.error ? `: ${run.error}` : ''}`);
  if (groups.length < wanted) problems.push(`${groups.length} agent(s) made an MM3 request, ${wanted} expected`);
  attempts.forEach((a, i) => {
    if (a === 0) problems.push(`agent ${i + 1} never got a verdict (${groups[i]!.outcomes.length} tries)`);
    else if (a > max) problems.push(`agent ${i + 1} needed ${a} attempts, the promise is ${max}`);
  });
  const ids = [...run.answer.matchAll(/MM3-\d{4}/gu)].map((m) => m[0]);
  const log = path.join(project, '.mm3', 'log.jsonl');
  const ledger = existsSync(log) ? readFileSync(log, 'utf8') : '';
  const runIdReal = ids.length > 0 && ids.every((id) => ledger.includes(`"${id}"`) || ledger.includes(id));
  if (ids.length === 0) problems.push('the answer cites no MM3 run id');
  else if (!runIdReal) problems.push('the answer cites a run id that is not in the ledger');
  if (/i (don'?t|do not) understand/iu.test(run.answer)) problems.push('the agent said it did not understand');
  const first = attempts.length ? attempts.filter((a) => a === 1).length / attempts.length : 0;
  return { id: s.id, route, model: s.model, pass: problems.length === 0, agents: groups.length, firstAttempt: first, attempts, runIdReal, problems, costUsd: run.costUsd };
}

export function runFull(scenarios: FullScenario[], version: string, log: (s: string) => void = () => undefined): FullRow[] {
  const commit = commitOf(version);
  const rows: FullRow[] = [];
  const bin = scenarios.some((s) => s.routes.includes('cli')) ? installPackage(version) : '';
  const plugin = scenarios.some((s) => s.routes.includes('mcp')) ? (commit ? checkoutPlugin(commit) : (() => { throw new Error(`cannot find the commit in version ${version}; the MCP route needs it`); })()) : '';
  for (const s of scenarios) {
    for (const route of s.routes) {
      const project = prepareProject();
      const isolated = { MM3_PROVIDER: 'fake', TYPESAFE_API_KEY: '', AI_GATEWAY_API_KEY: '', XDG_CONFIG_HOME: path.join(project, '.no-config'), MM3_ACTOR: 'agentic' };
      const base = ['Read', 'Glob', 'Grep'];
      const run = route === 'cli'
        ? runClaude({ prompt: s.prompt, model: s.model, cwd: project, tools: [...base, 'Write', 'Bash'], allowedTools: [...base, 'Write', 'Bash(mm3 *)', 'Bash(*/.bin/mm3 *)', 'Bash(cat *)', 'Bash(echo *)', 'Bash(printf *)', 'Bash(ls *)', 'Bash(pwd)'], // the shell a user's agent has: write a request file, pipe or heredoc it into mm3
        env: { ...isolated, PATH: `${bin}:${process.env.PATH}` }, budgetUsd: 1.5 })
        : runClaude({ prompt: s.prompt, model: s.model, cwd: project, tools: [...base, 'Agent'], allowedTools: [...base, 'Agent', 'mcp__plugin_mm3_mm3__mm3'], pluginDir: plugin, env: isolated, budgetUsd: 1.5 });
      const row = grade(s, run, project, route);
      rows.push(row);
      if (process.env.AGENTIC_DEBUG) {
        for (const c of run.calls) log(`      ${c.parent ? 'helper' : 'lead'} ${c.tool} ${JSON.stringify(c.input).slice(0, 110)} → ${c.result.replace(/\s+/gu, ' ').slice(0, 110)}`);
        log(`      answer: ${run.answer.replace(/\s+/gu, ' ').slice(0, 200)}`);
      }
      log(`  ${row.pass ? '✔' : '✖'} ${row.id} · ${route} · ${row.model}: attempts ${JSON.stringify(row.attempts)}${row.problems.length ? ` — ${row.problems.join('; ')}` : ''}`);
    }
  }
  return rows;
}

if (process.argv[1]?.endsWith('run.ts')) {
  const version = process.argv[2];
  if (!version) throw new Error('usage: tsx scripts/agentic/run.ts <exact npm version> [scenario id]');
  const all = (JSON.parse(readFileSync('test/agentic/scenarios/baseline.json', 'utf8')) as { full: FullScenario[] }).full;
  const rows = runFull(process.argv[3] ? all.filter((s) => s.id === process.argv[3]) : all, version, console.log);
  console.log(`\nfull run (${version}): ${rows.filter((r) => r.pass).length}/${rows.length} passed · notional cost $${rows.reduce((a, r) => a + r.costUsd, 0).toFixed(2)}`);
}

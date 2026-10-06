// `npm run agentic:feature -- <job> [--model sonnet|haiku] [--trials N] [--route cli|mcp] [--paid --approve-usd N]`: a trial.
// A trial is the development check of ONE job, on a build of the working tree (not a published version), with whatever model
// and trial count you choose. It is tailor-made for the feature being built and it is recorded in the same ledger as a TRL-####
// run, with the same definition of success written before it starts and the same release report to read it back. It is never
// formal and never counts toward the release gate: the ceremony does that, on the published nightly. The free path (the sample
// provider, no key, no TypeSafe spend) is the default. `--paid` uses the live classifier, only with an explicit dollar cap on the
// command line: MM3's own budget holds the cap in every trial project and the run stops when it is reached.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectSurfaces, manifestOf } from '../../test/helpers/guidance-surfaces.ts';
import { decide, providerContradiction } from './decision.ts';
import { append, chainProblem, definitionOf, nextId, readLedger, type FinishedRecord, type Spec, type StartedRecord } from './ledger.ts';
import { toLedgerRows } from './record.ts';
import { runFull, type FullScenario, type Rules } from './run.ts';
import { addUsage, noUsage } from './claude.ts';

export interface TrialArgs {
  job: string;
  model: 'haiku' | 'sonnet';
  trials: number;
  route: 'cli' | 'mcp' | undefined;
  paid: { approvedUsd: number } | undefined;
}

/** Reads the command line. Anything unclear is an error with the fix, not a guess. */
export function parseTrialArgs(argv: string[]): TrialArgs {
  const flag = (n: string): string | undefined => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const job = argv.find((a) => !a.startsWith('--') && a !== flag('--model') && a !== flag('--trials') && a !== flag('--route') && a !== flag('--approve-usd'));
  if (!job) throw new Error('✖ trial: name a job → npm run agentic:feature -- <job id> (npm run agentic:feature -- --list shows them)');
  const model = (flag('--model') ?? 'sonnet') as TrialArgs['model'];
  if (model !== 'haiku' && model !== 'sonnet') throw new Error(`✖ trial: --model ${model} is not a model → sonnet or haiku`);
  const trials = Number(flag('--trials') ?? 1);
  if (!Number.isInteger(trials) || trials < 1 || trials > 10) throw new Error('✖ trial: --trials must be a whole number from 1 to 10 → for example --trials 3');
  const route = flag('--route');
  if (route !== undefined && route !== 'cli' && route !== 'mcp') throw new Error(`✖ trial: --route ${route} is not a route → cli or mcp`);
  const approve = flag('--approve-usd');
  if (argv.includes('--paid') && approve === undefined) throw new Error('✖ trial: --paid needs the dollars you approve → --paid --approve-usd 0.50 (MM3\'s budget holds the cap; the free path needs neither flag)');
  if (approve !== undefined && !argv.includes('--paid')) throw new Error('✖ trial: --approve-usd only means something with --paid → add --paid, or drop it for the free path');
  const usd = approve === undefined ? undefined : Number(approve);
  if (usd !== undefined && !(usd > 0)) throw new Error('✖ trial: --approve-usd must be a positive number of dollars → for example --approve-usd 0.50');
  return { job, model, trials, route: route as TrialArgs['route'], paid: usd === undefined ? undefined : { approvedUsd: usd } };
}

/** True when `mm3 doctor`'s own output says a key resolves and the provider is not the sample one. Reads doctor's words, never a key. */
export const keyFound = (doctorText: string): boolean => /^\s*key: yes/mu.test(doctorText) && !/^\s*provider: fake/mu.test(doctorText);

const sh = (cmd: string, args: string[], cwd?: string): string => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${(r.stderr || r.stdout).slice(0, 300)}`);
  return r.stdout.trim();
};

/** Builds the working tree the way a user would receive it: a packed copy for the CLI route, the tree itself as the plugin. */
function buildLocal(needCli: boolean): { bin: string; plugin: string } {
  sh('npm', ['run', 'build:plugin']);
  let bin = '';
  if (needCli) {
    sh('npm', ['run', 'build']);
    const dir = mkdtempSync(path.join(os.tmpdir(), 'mm3-trial-pack-'));
    const tgz = sh('npm', ['pack', '--silent', '--pack-destination', dir]).split('\n').pop()!;
    const prefix = mkdtempSync(path.join(os.tmpdir(), 'mm3-trial-npm-'));
    sh('npm', ['install', '--prefix', prefix, '--no-audit', '--no-fund', '--silent', path.join(dir, tgz)]);
    bin = path.join(prefix, 'node_modules', '.bin');
  }
  return { bin, plugin: process.cwd() };
}

if (process.argv[1]?.endsWith('trial.ts')) {
  const spec = JSON.parse(readFileSync('test/agentic/scenarios/baseline.json', 'utf8')) as { full: FullScenario[]; rules: Rules } & Omit<Spec, 'full' | 'rules'>;
  if (process.argv.includes('--list')) {
    for (const s of spec.full) console.log(`${s.id.padEnd(24)} ${(s as { title?: string }).title ?? ''}  (${s.routes.join('/')})`);
    process.exit(0);
  }
  const a = parseTrialArgs(process.argv.slice(2));
  const job = spec.full.find((s) => s.id === a.job);
  if (!job) throw new Error(`✖ trial: no job "${a.job}" → one of ${spec.full.map((s) => s.id).join(', ')}`);
  const broken = chainProblem();
  if (broken) throw new Error(broken);
  const scoped: FullScenario = a.route ? { ...job, routes: [a.route] } : job;
  const fixture = JSON.parse(readFileSync('test/agentic/fixture.json', 'utf8')) as { tag: string; sha: string };
  const head = sh('git', ['rev-parse', 'HEAD']);
  const dirty = sh('git', ['status', '--porcelain']) !== '';
  const label = `local+${head.slice(0, 7)}${dirty ? '+dirty' : ''}`;
  const records = readLedger();
  const definition = definitionOf({ ...spec, full: [scoped] } as unknown as Spec, fixture);
  const started: StartedRecord = {
    kind: 'trial', phase: 'started', id: nextId(records, 'TRL'), ts: new Date().toISOString(), version: label, versionCommit: head.slice(0, 7), head: head.slice(0, 12), dirty,
    fingerprint: manifestOf(collectSurfaces()).fingerprint, guidance: { surfaces: Object.keys(collectSurfaces()).length, snapshot: 'test/golden/guidance/surfaces.txt' }, definition,
    environment: { node: process.version, vitest: /"vitest": "([^"]+)"/u.exec(readFileSync('package.json', 'utf8'))?.[1] ?? '?', claude: sh('claude', ['--version']), os: `${os.type()} ${os.release()} ${os.arch()}` },
    artifact: { npmIntegrity: null, npmShasum: null, pluginCommit: head.slice(0, 7), note: 'a local build of the working tree: a packed copy for the CLI route, the tree itself as the plugin' },
    mode: a.paid ? 'paid' : 'free', ...(a.paid ? { paid: a.paid } : {}), trialsOverride: a.trials, formal: false,
    formalReason: 'a development trial of one job on a local build: it never counts toward the release gate',
  };
  if (a.paid) {
    // before anything is recorded or run: does a key resolve the way each route will need it? The plugin's MCP server takes its key from the
    // plugin's own setting, not from the shell, so for that route the key has to be stored (keychain or the user file), not just exported.
    const check = (withoutEnvKey: boolean): boolean => {
      const env = { ...process.env } as NodeJS.ProcessEnv;
      delete env.MM3_PROVIDER;
      if (withoutEnvKey) {
        delete env.TYPESAFE_API_KEY;
        delete env.AI_GATEWAY_API_KEY;
      }
      const doctor = spawnSync('node', [path.resolve('dist/cli.js'), 'doctor'], { cwd: process.cwd(), env, encoding: 'utf8' });
      return keyFound(`${doctor.stdout}${doctor.stderr}`);
    };
    if (!check(false)) throw new Error('✖ trial: --paid found no TypeSafe key → put TYPESAFE_API_KEY in the shell you run this from, or run `mm3 init` to store one (nothing was recorded and nothing was spent; the key is never read or printed here)');
    if (scoped.routes.includes('mcp') && !check(true)) throw new Error('✖ trial: the MCP route cannot use a key that is only in the shell: the plugin passes its own setting to its server → store the key with `mm3 init` (keychain), or run this job with --route cli (nothing was recorded and nothing was spent)');
  }
  append(started);
  console.log(`AGENTIC FEATURE TRIAL ${started.id} · ${(job as { title?: string }).title ?? job.id} · ${a.model} × ${a.trials} · ${a.paid ? `PAID: up to $${a.paid.approvedUsd} of real TypeSafe spend, approved on the command line` : 'free path (sample provider, no key, no spend)'}`);
  console.log(`  build: ${label} (the working tree)\n  success, stated before the run: ${(job as { success?: string }).success ?? job.goal}`);
  let closed = false;
  try {
    const build = buildLocal(scoped.routes.includes('cli'));
    const rows = runFull([scoped], label, spec.rules, (l) => console.log(l), undefined, { build, models: [a.model], trials: a.trials, ...(a.paid ? { paid: a.paid } : {}) });
    const asked = rows.filter((r) => r.attempts.length > 0);
    const rate = asked.length ? asked.filter((r) => r.firstRequestAccepted).length / asked.length : 0;
    const usage = rows.map((r) => r.usage).reduce(addUsage, noUsage());
    const spent = rows.reduce((t, r) => t + (r.spentUsd ?? 0), 0);
    const record: Omit<FinishedRecord, 'kind' | 'startedId' | 'ts'> = {
      phase: 'finished', passed: rows.length > 0 && rows.every((r) => r.pass) && !providerContradiction(started, rows), level3: toLedgerRows(rows), firstRequestAcceptedRate: Number(rate.toFixed(2)),
      usage: { ...usage, claudeRuns: rows.length, mm3Calls: rows.reduce((t, r) => t + r.mm3Calls, 0) }, ...(a.paid ? { spentUsd: Number(spent.toFixed(6)) } : {}),
    };
    const d = decide(started, { kind: 'trial', startedId: started.id, ts: '', ...record }, { chainOk: true, gaps: [] });
    append({ kind: 'trial', startedId: started.id, ts: new Date().toISOString(), ...record, decision: { verdict: d.verdict, formal: false, blockers: d.blockers, exceptions: d.exceptions, improvements: d.improvements } });
    closed = true;
    console.log(`\n${d.verdict === 'INVALID' ? '' : `${rows.filter((r) => r.pass).length} of ${rows.length} trial(s) met every blocking criterion · `}${d.headline}${a.paid ? ` · spent $${spent.toFixed(4)} of the approved $${a.paid.approvedUsd}` : ''}`);
    console.log(`  recorded as ${started.id}: read it with  npm run agentic:release-report -- ${started.id}`);
  } catch (e) {
    if (!closed) append({ kind: 'trial', phase: 'aborted', startedId: started.id, ts: new Date().toISOString(), passed: false, reason: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) });
    throw e;
  }
}

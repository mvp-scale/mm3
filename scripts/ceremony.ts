// `npm run ceremony -- --version <exact npm version>`: the agentic test ceremony, one command, fixed order, always recorded.
// Nothing here runs unrecorded. Before any step, a `started` line goes into test/agentic/ledger.jsonl carrying the version,
// the commit, the guidance fingerprint and the definition of success (every scenario's goal and checkpoints, hashed); a
// `finished` line closes it (an `aborted` line if it stops early). A run counts toward the release gate (formal) only when
// this checkout is the clean commit the version was built from and the rules' full trial count is used; anything else is
// recorded too, marked not formal, with the reason. `--only <jobs> --carry CER-####` re-runs just those jobs and copies the other
// jobs' rows (and the context test) from that earlier formal run, tagged `carriedFrom`, but only when scripts/agentic/carry.ts finds
// nothing an agent runs or reads has changed; a refused carry stops before anything is recorded. It uses the sample provider: no key, no TypeSafe spend. A paid mode
// does not exist yet and will need explicit approval on the command line.
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { readFileSync } from 'node:fs';
import { collectSurfaces, manifestOf } from '../test/helpers/guidance-surfaces.ts';
import { byLevel, LEVELS, runContext, type ContextRow } from './agentic/context.ts';
import { carriedJobs, carryProblem } from './agentic/carry.ts';
import { decide, providerContradiction } from './agentic/decision.ts';
import { toLedgerRows } from './agentic/record.ts';
import { append, chainProblem, definitionOf, invalidReason, nextId, readLedger, type FinishedRecord, type Spec, type StartedRecord } from './agentic/ledger.ts';
import { addUsage, noUsage } from './agentic/claude.ts';
import { addEconomics, economicsLine, emptyEconomics } from './agentic/trace.ts';
import { cells, commitOf, level3Passes, runFull, usageLine, type FullRow, type FullScenario, type Rules } from './agentic/run.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const version = flag('--version');
if (!version || version.startsWith('--')) throw new Error('usage: npm run ceremony -- --version <exact npm version> [--trials N] [--only <jobId,jobId> [--carry CER-#### [--note "<text>"]]]');
if (args.includes('--paid')) throw new Error('--paid: the keyed suite (verdict quality, capped real spend) is not built yet; the free path is the only path');
if (args.includes('--dry')) throw new Error('--dry is gone: every ceremony run is recorded; a quick look is `--trials 1`, recorded as not formal');
const trialsOverride = flag('--trials') === undefined ? undefined : Number(flag('--trials'));
const valueOf = (name: string): string | undefined => {
  const v = flag(name);
  if (args.includes(name) && (!v || v.startsWith('--'))) throw new Error(`✖ ${name}: needs a value → see the usage line above`);
  return v;
};
const only = valueOf('--only')?.split(',').filter(Boolean);
const carryId = valueOf('--carry');
const note = valueOf('--note');
if (carryId && !only) throw new Error('✖ carry: --carry needs --only → name the jobs that changed: --only <jobId,jobId> --carry CER-####');
if (note && !carryId) throw new Error('✖ note: --note records a carry → add --carry CER-####');

const out = (s = ''): void => console.log(s);
const run = (cmd: string, a: string[]): { ok: boolean; text: string } => {
  const r = spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, text: `${r.stdout}${r.stderr}` };
};
const grab = (text: string, re: RegExp): string => re.exec(text)?.[1] ?? '?';

// 1. identify, and state success BEFORE anything runs
const spec = JSON.parse(readFileSync('test/agentic/scenarios/baseline.json', 'utf8')) as Spec & { full: FullScenario[]; rules: Rules };
const fixture = JSON.parse(readFileSync('test/agentic/fixture.json', 'utf8')) as { tag: string; sha: string };
const broken = chainProblem();
if (broken) throw new Error(broken);
const rules = spec.rules;
const unknownJob = only?.find((id) => !spec.full.some((s) => s.id === id));
if (unknownJob) throw new Error(`✖ only: no job ${unknownJob} → the jobs are ${spec.full.map((s) => s.id).join(', ')}`);
const versionCommit = commitOf(version) ?? null;
const head = run('git', ['rev-parse', 'HEAD']).text.trim();
const dirty = run('git', ['status', '--porcelain']).text.trim() !== '';
const fingerprint = manifestOf(collectSurfaces()).fingerprint;
const records = readLedger();
const definition = definitionOf(spec, fixture);
const source = carryId ? records.find((r): r is StartedRecord => r.phase === 'started' && r.id === carryId) : undefined;
const sourceEnd = carryId ? records.find((r): r is FinishedRecord => (r.phase === 'finished' || r.phase === 'aborted') && r.startedId === carryId) : undefined;
if (carryId) {
  const diff = source?.versionCommit ? run('git', ['diff', '--name-only', source.versionCommit, 'HEAD']) : undefined;
  const refused = carryProblem({ id: carryId, source: source ? { started: source, finished: sourceEnd } : undefined, invalid: invalidReason(records, carryId), only: only!, fingerprint, definition, changed: diff?.ok ? diff.text.split('\n').filter(Boolean) : undefined });
  if (refused) {
    console.error(refused);
    process.exit(1);
  }
}
const carriedRows = (sourceEnd?.level3 ?? []).filter((r) => !only!.includes(r.id)).map((r) => ({ ...r, carriedFrom: r.carriedFrom ?? carryId }));
const carry = carryId ? { from: carryId, jobs: carriedJobs(definition, only!), only: only!, ...(note ? { note } : {}) } : undefined;
// which bits are being tested: the published tarball's own integrity hash, and the commit the plugin route checks out
const npmView = run('npm', ['view', `@mvpscale/mm3@${version}`, 'dist.integrity', 'dist.shasum', '--json']);
let npmInfo: { 'dist.integrity'?: string; 'dist.shasum'?: string } = {};
try { npmInfo = JSON.parse(npmView.text) as typeof npmInfo; } catch { /* not published, or offline: recorded as null with a note */ }
const reasons = [
  ...(versionCommit === null ? ['the version names no commit'] : head.startsWith(versionCommit) ? [] : [`this checkout (${head.slice(0, 7)}) is not the commit ${version} was built from (${versionCommit})`]),
  ...(dirty ? ['uncommitted changes'] : []),
  ...(only && !carryId ? [`--only ${only.join(',')} without --carry: a partial run cannot stand alone`] : []),
  ...(trialsOverride !== undefined ? [`--trials ${trialsOverride} instead of the rules' ${rules.trialsPerScenario}`] : []),
];
const formal = reasons.length === 0;
const env = { node: process.version, vitest: grab(readFileSync('package.json', 'utf8'), /"vitest": "([^"]+)"/u), claude: run('claude', ['--version']).text.trim(), os: `${os.type()} ${os.release()} ${os.arch()}` };
const started: StartedRecord = {
  kind: 'ceremony', phase: 'started', id: nextId(records), ts: new Date().toISOString(), version, versionCommit, head: head.slice(0, 12), dirty, fingerprint,
  guidance: { surfaces: Object.keys(collectSurfaces()).length, snapshot: 'test/golden/guidance/surfaces.txt' },
  definition, environment: env,
  artifact: { npmIntegrity: npmInfo['dist.integrity'] ?? null, npmShasum: npmInfo['dist.shasum'] ?? null, pluginCommit: versionCommit, ...(npmInfo['dist.integrity'] ? {} : { note: `npm view found no published ${version} (offline, or not published)` }) },
  mode: 'free', trialsOverride: trialsOverride ?? null, formal, formalReason: formal ? `this checkout is the clean commit the version was built from, at the rules' full trial count${carry ? `, with ${carry.jobs.length} job(s) carried from ${carry.from}` : ''}` : reasons.join('; '),
  ...(carry ? { carry } : {}),
};
append(started);
out(`AGENTIC CEREMONY ${started.id} · ${version} · free path (sample provider, no key)`);
out(`\n1. IDENTIFY AND STATE SUCCESS (recorded in test/agentic/ledger.jsonl before anything runs)`);
out(`   ${definition.plain}\n   version ${version}\n   commit ${head.slice(0, 7)}${dirty ? ' (dirty)' : ''} · guidance fingerprint ${fingerprint.slice(0, 16)} · definition of success ${definition.hash.slice(0, 16)}`);
out(`   this run is ${formal ? 'FORMAL: it counts toward the release gate' : `NOT FORMAL (recorded, not counted): ${reasons.join('; ')}`}`);
out(`   node ${env.node} · vitest ${env.vitest} · ${env.claude} · ${env.os}\n   tested artifact: npm integrity ${(started.artifact?.npmIntegrity ?? 'not found').slice(0, 24)}… · plugin commit ${versionCommit ?? 'none'}`);
if (definition.purpose) out(`   the question: ${definition.purpose}`);
for (const s of started.definition.scenarios) out(`   ${s.title ?? s.id}: ${s.success ?? s.goal}\n      criteria: ${s.checkpoints.map((c) => c.id).join(', ')} (promise ${s.promise})`);

let finishedWritten = false;
const close = (r: Omit<FinishedRecord, 'kind' | 'startedId' | 'ts'>): void => {
  append({ kind: 'ceremony', startedId: started.id, ts: new Date().toISOString(), ...r });
  finishedWritten = true;
};

try {
  // 2. level 1
  out('\n2. LEVEL 1 · free checks');
  const l1: Array<{ name: string; ok: boolean; detail: string }> = [];
  for (const [name, cmd, a, re] of [
    ['unit, contract, golden', 'npm', ['test'], /Tests\s+(.+)\n/u],
    ['CLI end to end', 'npm', ['run', 'test:cli'], /Tests\s+(.+)\n/u],
    ['requirement trace', 'npm', ['run', 'check:trace'], /(\d+\/\d+ claims traced)/u],
    ['hygiene', 'npm', ['run', 'check:hygiene'], /(hygiene OK)/u],
    ['plugin bundle', 'npm', ['run', 'check:plugin'], /(plugin bundle OK|bin\/mm3\.mjs is stale)/u],
  ] as Array<[string, string, string[], RegExp]>) {
    const r = run(cmd, a);
    const row = { name, ok: r.ok, detail: grab(r.text, re).replace(/\s+/gu, ' ').trim() };
    l1.push(row);
    out(`   ${row.ok ? '✔' : '✖'} ${name}: ${row.detail}`);
  }

  // 3. level 2
  out(`\n3. LEVEL 2 · context test (Haiku, no tools; next step from text alone)${carry ? ` · NOT re-run: taken from ${carry.from}` : ''}`);
  const l2: ContextRow[] = carry ? [] : runContext(undefined, 'haiku', (s) => out(s.replace(/^ {2}/u, '   ')));
  const l2rec = carry ? (sourceEnd?.level2 ?? []) : l2.map((r) => ({ id: r.id, level: r.level, pass: r.pass }));
  const lv = byLevel(l2rec);
  out(`   → ${LEVELS.map((l) => `${l} ${lv[l].pass}/${lv[l].total}`).join(' · ')} (recorded; does not gate)`);

  // 4. level 3
  out('\n4. LEVEL 3 · full agentic baseline (real agents, real tool, the pinned project, the sample provider)');
  if (carry) out(`   running only ${carry.only.join(', ')}; carrying ${carry.jobs.length} job(s) unchanged from ${carry.from}: ${carry.jobs.join(', ')}`);
  out(`   gate: ${rules.gateModel} passes at least ${rules.mustPassTrials} of ${rules.trialsPerScenario} trials of every scenario on every route; ${rules.floorModel} runs once and is reported, not gated`);
  const l3: FullRow[] = runFull(only ? (spec.full as FullScenario[]).filter((s) => only.includes(s.id)) : spec.full, version, rules, (s) => out(s.replace(/^ {2}/u, '   ')), trialsOverride);
  const all = [...toLedgerRows(l3), ...carriedRows]; // the rows the gate reads: what ran here, then what was carried
  const gateRows = all.filter((r) => r.model === rules.gateModel);
  const asked = gateRows.filter((r) => r.attempts.length > 0); // jobs with no verb request (a setting, a health check) say nothing about first requests
  const first = asked.length ? asked.filter((r) => r.firstRequestAccepted).length / asked.length : 0;
  for (const c of cells(all)) out(`   ${c.id} · ${c.route} · ${c.model}: ${c.passed}/${c.trials}${c.model === rules.gateModel ? '' : ' (floor, not gating)'}`);
  out(`   → first request accepted in ${(first * 100).toFixed(0)}% of gate trials (target ${(rules.firstAttemptTarget * 100).toFixed(0)}%, reported)`);

  // 5. gate and record
  const passed = l1.every((r) => r.ok) && level3Passes(all, rules) && !providerContradiction(started, all);
  const usage = [...l2.map((r) => r.usage), ...l3.map((r) => r.usage)].reduce(addUsage, noUsage());
  const calls = l2.length + l3.length;
  const record: Omit<FinishedRecord, 'kind' | 'startedId' | 'ts'> = {
    phase: 'finished', passed,
    level1: l1,
    level2: l2rec,
    level3: all,
    firstRequestAcceptedRate: Number(first.toFixed(2)),
    usage: { ...usage, claudeRuns: calls, mm3Calls: l3.reduce((a, r) => a + r.mm3Calls, 0) },
  };
  const d = decide(started, { kind: 'ceremony', startedId: started.id, ts: '', ...record }, { chainOk: !chainProblem(), gaps: [] });
  close({ ...record, decision: { verdict: d.verdict, formal: d.formal, blockers: d.blockers, exceptions: d.exceptions, improvements: d.improvements } });
  out(`\n   DECISION: ${d.headline}${d.blockers.length ? `\n     because: ${d.blockers.join('; ')}` : ''}${d.improvements.length ? `\n     ${d.improvements.length} improvement(s) recorded (npm run agentic:release-report -- ${started.id})` : ''}`);
  out(`\n5. GATE · ${passed ? 'PASS' : 'FAIL'} (level 1 all green, and the level 3 gate above) · ${formal ? 'FORMAL' : 'not formal'}\n   usage: ${usageLine(usage, calls)} · ${l3.reduce((a, r) => a + r.mm3Calls, 0)} MM3 calls\n   where it went (level 3, by kind of call; ≈ is characters ÷ 4): ${economicsLine(l3.reduce((acc, r) => addEconomics(acc, r.economics), emptyEconomics()))}`);
  out(`   recorded: ${started.id} closed in test/agentic/ledger.jsonl`);
  process.exit(passed ? 0 : 1);
} catch (e) {
  if (!finishedWritten) close({ phase: 'aborted', passed: false, reason: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) });
  throw e;
}

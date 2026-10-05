// `npm run ceremony -- --version <exact npm version>`: the agentic test ceremony, one command, fixed order, one record.
// It tests a PUBLISHED build (the version and the commit it was built from), so it refuses to run from a different
// commit. Steps: identify · level 1 (free checks) · level 2 (context test) · level 3 (full agentic baseline on the
// pinned project) · gate and record. A pass writes test/agentic/last-run.json (the gate check:agentic reads) and
// docs/evidence/agentic.md (the human record). `--dry` runs everything and records nothing.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { collectSurfaces, manifestOf } from '../test/helpers/guidance-surfaces.ts';
import { byLevel, LEVELS, runContext, type ContextRow } from './agentic/context.ts';
import { cells, commitOf, level3Passes, runFull, type FullRow, type FullScenario, type Rules } from './agentic/run.ts';
import type { AgenticRun } from './check-agentic.ts';

const args = process.argv.slice(2);
const version = args[args.indexOf('--version') + 1];
const dry = args.includes('--dry');
if (!version || version.startsWith('--')) throw new Error('usage: npm run ceremony -- --version <exact npm version> [--dry]');

const out = (s = ''): void => console.log(s);
const run = (cmd: string, a: string[]): { ok: boolean; text: string } => {
  const r = spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, text: `${r.stdout}${r.stderr}` };
};
const grab = (text: string, re: RegExp): string => re.exec(text)?.[1] ?? '?';

out(`AGENTIC CEREMONY · ${version}${dry ? ' · DRY RUN (nothing recorded)' : ''}`);

// 1. identify
const commit = commitOf(version);
const head = run('git', ['rev-parse', 'HEAD']).text.trim();
const dirty = run('git', ['status', '--porcelain']).text.trim() !== '';
if (!dry && (!commit || !head.startsWith(commit) || dirty)) {
  throw new Error(`this checkout (${head.slice(0, 7)}${dirty ? ', uncommitted changes' : ''}) is not the commit ${version} was built from (${commit ?? 'none in the version'}) → check it out clean, or use --dry`);
}
const fingerprint = manifestOf(collectSurfaces()).fingerprint;
const fixture = JSON.parse(readFileSync('test/agentic/fixture.json', 'utf8')) as { tag: string; sha: string };
const env = { date: new Date().toISOString().slice(0, 10), node: process.version, vitest: grab(readFileSync('package.json', 'utf8'), /"vitest": "([^"]+)"/u), claude: run('claude', ['--version']).text.trim() };
out(`\n1. IDENTIFY\n   version ${version}\n   commit ${head.slice(0, 7)}${dirty ? ' (dirty)' : ''}\n   guidance fingerprint ${fingerprint.slice(0, 16)}\n   baseline project ${fixture.tag} (${fixture.sha.slice(0, 7)})\n   ${env.date} · node ${env.node} · vitest ${env.vitest} · claude ${env.claude}`);

// 2. level 1
out('\n2. LEVEL 1 · free checks');
const l1: Array<{ name: string; ok: boolean; detail: string }> = [];
for (const [name, cmd, a, re] of [
  ['unit, contract, golden', 'npm', ['test'], /Tests\s+(.+)\n/u],
  ['CLI end to end', 'npm', ['run', 'test:cli'], /Tests\s+(.+)\n/u],
  ['requirement trace', 'npm', ['run', 'check:trace'], /(\d+\/\d+ claims traced)/u],
  ['hygiene', 'npm', ['run', 'check:hygiene'], /(hygiene OK)/u],
  ['plugin bundle', 'npm', ['run', 'check:plugin'], /(plugin bundle OK)/u],
] as Array<[string, string, string[], RegExp]>) {
  const r = run(cmd, a);
  const row = { name, ok: r.ok, detail: grab(r.text, re).replace(/\s+/gu, ' ').trim() };
  l1.push(row);
  out(`   ${row.ok ? '✔' : '✖'} ${name}: ${row.detail}`);
}

// 3. level 2
out('\n3. LEVEL 2 · context test (Haiku, no tools; next step from text alone)');
const l2: ContextRow[] = runContext(undefined, 'haiku', (s) => out(s.replace(/^ {2}/u, '   ')));
const lv = byLevel(l2);
out(`   → none ${lv.none.pass}/${lv.none.total} · some ${lv.some.pass}/${lv.some.total} · detailed ${lv.detailed.pass}/${lv.detailed.total} (recorded; does not gate)`);

// 4. level 3
out('\n4. LEVEL 3 · full agentic baseline (real agents, real tool, the pinned project, the sample provider: no key)');
const spec = JSON.parse(readFileSync('test/agentic/scenarios/baseline.json', 'utf8')) as { full: FullScenario[]; rules: Rules };
const rules = spec.rules;
out(`   gate: ${rules.gateModel} passes at least ${rules.mustPassTrials} of ${rules.trialsPerScenario} trials of every scenario on every route; ${rules.floorModel} runs once and is reported, not gated`);
const l3: FullRow[] = runFull(spec.full, version, rules, (s) => out(s.replace(/^ {2}/u, '   ')));
const gateRows = l3.filter((r) => r.model === rules.gateModel);
const first = gateRows.length ? gateRows.filter((r) => r.firstRequestAccepted).length / gateRows.length : 0;
for (const c of cells(l3)) out(`   ${c.id} · ${c.route} · ${c.model}: ${c.passed}/${c.trials}${c.model === rules.gateModel ? '' : ' (floor, not gating)'}`);
out(`   → first request accepted in ${(first * 100).toFixed(0)}% of gate trials (target ${(rules.firstAttemptTarget * 100).toFixed(0)}%, reported)`);

// 5. gate and record
const passed = l1.every((r) => r.ok) && level3Passes(l3, rules);
const cost = l2.reduce((a, r) => a + r.costUsd, 0) + l3.reduce((a, r) => a + r.costUsd, 0);
out(`\n5. GATE · ${passed ? 'PASS' : 'FAIL'} (level 1 all green, and the level 3 gate above) · notional cost $${cost.toFixed(2)}`);
if (dry) {
  out('   dry run: nothing written');
  process.exit(passed ? 0 : 1);
}
const record: AgenticRun = { version, fingerprint, date: env.date, passed, firstAttempt: Number(first.toFixed(2)), summary: `level 1 ${l1.filter((r) => r.ok).length}/${l1.length}; level 2 ${LEVELS.map((l) => `${l} ${lv[l].pass}/${lv[l].total}`).join(', ')}; level 3 gate model ${gateRows.filter((r) => r.pass).length}/${gateRows.length} trials` };
writeFileSync('test/agentic/last-run.json', `${JSON.stringify(record, null, 2)}\n`);
const md = [
  '# Agentic ceremony record', '',
  `**Version tested:** \`${version}\` · **commit** \`${head.slice(0, 7)}\` · **result: ${passed ? 'PASS' : 'FAIL'}** · ${env.date}`, '',
  `Guidance fingerprint \`${fingerprint.slice(0, 16)}\` (the snapshot in \`test/golden/guidance/\`). Baseline project: OWASP Juice Shop ${fixture.tag} (\`${fixture.sha.slice(0, 7)}\`). node ${env.node} · vitest ${env.vitest} · ${env.claude}.`, '',
  '## Level 1 · free checks', '', '| Check | Result | Detail |', '|---|---|---|', ...l1.map((r) => `| ${r.name} | ${r.ok ? 'pass' : 'FAIL'} | ${r.detail} |`), '',
  '## Level 2 · context test (Haiku, no tools)', '', `none ${lv.none.pass}/${lv.none.total} · some ${lv.some.pass}/${lv.some.total} · detailed ${lv.detailed.pass}/${lv.detailed.total}. Recorded, not gating.`, '',
  '| Scenario | none | some | detailed |', '|---|---|---|---|', ...[...new Set(l2.map((r) => r.id))].map((id) => `| ${id} | ${LEVELS.map((l) => (l2.find((r) => r.id === id && r.level === l)?.pass ? 'pass' : 'miss')).join(' | ')} |`), '',
  '## Level 3 · full agentic baseline', '', `Sample provider throughout (no key, $0 of TypeSafe spend): nothing here grades whether a verdict is right, only whether an agent could get a well-formed verdict recorded. Gate: ${rules.gateModel} passes at least ${rules.mustPassTrials} of ${rules.trialsPerScenario} trials of every scenario on every route; ${rules.floorModel} is reported, not gated. First request accepted in ${(first * 100).toFixed(0)}% of gate trials (target ${(rules.firstAttemptTarget * 100).toFixed(0)}%, reported).`, '',
  '| Scenario | Route | Model | Trials passed | Failed checkpoints (what each points at) |', '|---|---|---|---|---|',
  ...cells(l3).map((c) => `| ${c.id} | ${c.route} | ${c.model} | ${c.passed}/${c.trials} | ${[...new Set(l3.filter((r) => r.id === c.id && r.route === c.route && r.model === c.model).flatMap((r) => r.problems))].join('; ') || '-'} |`), '',
  `Notional cost of the run: $${cost.toFixed(2)} (Claude subscription quota; MM3 itself used the sample provider, so $0 of TypeSafe spend).`, '',
];
writeFileSync('docs/evidence/agentic.md', md.join('\n'));
out('   wrote test/agentic/last-run.json and docs/evidence/agentic.md');
process.exit(passed ? 0 : 1);

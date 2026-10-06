// scan: a code sweep with per-function reuse. Review Focus #2: a second scan of unchanged code is free.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBudget } from '../../src/budget/budget.ts';
import { writeConfigOverride } from '../../src/config/write.ts';
import { readLedger, isContractRun } from '../../src/ledger/log.ts';
import { runScan } from '../../src/verbs/scan.ts';
import { tempProject } from '../helpers/project.ts';
import { stubProvider, type Stub } from '../helpers/stub-provider.ts';

/** Wraps a stub so its answer reports an estimated cost, without changing stub-provider.ts (shared by other crews). */
const withEstimatedCost = (inner: Stub): Stub => ({ ...inner, ask: async (q, s) => ({ ...(await inner.ask(q, s)), costEstimated: true }) });

const env = { MM3_ACTOR: 'r' };
// A full, contract-valid finest-layer ask (quick: exactly 3 concerns categories x 3 probes, plus decisions
// with >=1 scale and >=1 choice) — injection keeps probe "1" (the one every test's `yes` callback keys off
// of, e.g. `q.id.endsWith('bad#1')`); access/leaks/severity/route all default to passing unless a test says
// otherwise, so they never interfere with the specific injection-only scenarios below.
const ASK_LINES = [
  '  ask:',
  '    function:',
  '      concerns:',
  '        injection:',
  '          pass: no',
  '          1: Does {function} put request text straight into a query?',
  '          2: Is the query built by string concatenation instead of a bound parameter?',
  '          3: Does {function} run the query with db.query on that string?',
  '        access:',
  '          pass: no',
  '          4: Does {function} return a record without checking its owner?',
  '          5: Is the caller id compared to the record owner id?',
  '          6: Could {function} be called without any permission check?',
  '        leaks:',
  '          pass: no',
  '          7: Does {function} send back a raw database error?',
  '          8: Does {function} log the full request body?',
  '          9: Does the response from {function} include fields nobody asked for?',
  '      decisions:',
  '        severity:',
  '          pass: [none, low]',
  '          10:',
  '            scale: How severe is the worst issue in {function}?',
  '            levels: [none, low, medium, high, critical]',
  '        route:',
  '          pass: [ship]',
  '          11:',
  '            choice: Where should {function} go?',
  '            options: [ship, fix, block]',
].join('\n');
const REQUEST = `mak:\n  goal: Handlers don't trust request input\n  depth: quick\n  over:\n    file: src/*.ts\n    function: each\n${ASK_LINES}\nmdl:\n  why: find\n  area: api\n`;
const FILES = {
  'src/a.ts': 'export function bad(req) { return db.query(`x ${req.id}`); }\n',
  'src/b.ts': 'export function good(req) { return db.query("x", [req.id]); }\n',
};

describe('scan', () => {
  it('the contract shape: scanned, failing worst first, passing/reused as counts [C-070]', async () => {
    const { paths } = tempProject(FILES);
    const provider = stubProvider({ yes: (q) => (q.id.endsWith('bad#1') ? 0.9 : 0.1) });
    const r = await runScan(REQUEST, { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('scanned: {file: 2, function: 2}');
    expect(r.text).toContain('src/a.ts/bad: {injection: fail, 1: 0.90}');
    expect(r.text).toContain('passing: 1');
    expect(r.text).toContain('reused: 0');
    expect(r.text).toContain('next: mm3 template drill --parent MM3-0001 --from src/a.ts/bad');
    expect(provider.calls).toHaveLength(1); // one call: the function layer (file has no ask categories)
  });

  // Fix #17: a scan hints what it never looked at — a common entrypoint/config file outside every over:
  // pattern is easy to miss entirely. [C-146]
  it('notes a common entrypoint/config file that sits outside every over: pattern', async () => {
    const { paths } = tempProject({ ...FILES, 'app.js': 'require("express")();\n', 'config/db.json': '{}\n' });
    const provider = stubProvider({ yes: () => 0.1 });
    const r = await runScan(REQUEST, { paths, provider, env }); // over: file: src/*.ts never reaches app.js or config/
    expect(r.text).toContain('entrypoints/config outside over:');
    expect(r.text).toContain('app.js');
    expect(r.text).toContain('config/db.json');
  });

  it('says nothing when over: already reaches the usual entrypoints', async () => {
    const { paths } = tempProject({ 'app.js': 'function boot() { return 1; }\n' });
    const provider = stubProvider({ yes: () => 0.1 });
    const reachesApp = REQUEST.replace('file: src/*.ts', 'file: app.js');
    const r = await runScan(reachesApp, { paths, provider, env });
    expect(r.text).not.toContain('entrypoints/config outside over:');
  });

  // R2: .env* must never appear in the note — naming it would invite sending secrets to the classifier via
  // over:. [C-146]
  it('never names a .env file in the entrypoint note, even when it sits outside every over: pattern', async () => {
    const { paths } = tempProject({ ...FILES, '.env': 'SECRET=1\n', '.env.local': 'SECRET=2\n', 'app.js': 'require("express")();\n' });
    const provider = stubProvider({ yes: () => 0.1 });
    const r = await runScan(REQUEST, { paths, provider, env }); // over: file: src/*.ts never reaches .env or app.js
    expect(r.text).toContain('entrypoints/config outside over:');
    expect(r.text).toContain('app.js');
    expect(r.text).not.toContain('.env');
  });

  // R2: a config/** glob can match many files; the note shows at most 3, then "… N more" instead of all of
  // them. [C-168]
  it('caps the entrypoint note at 3 missed paths, then says how many more', async () => {
    const configFiles: Record<string, string> = {};
    for (let i = 0; i < 6; i++) configFiles[`config/c${i}.json`] = '{}\n';
    const { paths } = tempProject({ ...FILES, ...configFiles });
    const provider = stubProvider({ yes: () => 0.1 });
    const r = await runScan(REQUEST, { paths, provider, env }); // over: file: src/*.ts never reaches config/
    const line = r.text.split('\n').find((l) => l.includes('entrypoints/config outside over:'));
    expect(line).toBeDefined();
    const shownPaths = line!.match(/config\/c\d\.json/gu) ?? [];
    expect(shownPaths).toHaveLength(3);
    expect(line).toContain('… 3 more');
  });

  it('a second scan of unchanged code is free [C-072] [C-073]', async () => {
    const { paths } = tempProject(FILES);
    const provider = stubProvider({ yes: (q) => (q.id.endsWith('bad#1') ? 0.9 : 0.1) });
    const r1 = await runScan(REQUEST, { paths, provider, env });
    const budgetAfterFirst = loadBudget(paths).state;
    const r2 = await runScan(REQUEST, { paths, provider, env });
    expect(provider.calls).toHaveLength(1); // still just the one call from the first run
    expect(r2.text).toContain('reused: 2');
    // The second run's ledger line answers identically to the first: same worst-first failing entry.
    expect(r1.text).toContain('src/a.ts/bad: {injection: fail, 1: 0.90}');
    expect(r2.text).toContain('src/a.ts/bad: {injection: fail, 1: 0.90}');
    // Free really means free: budget spend and run count unchanged by the second (all-reused) run.
    const budgetAfterSecond = loadBudget(paths).state;
    expect(budgetAfterSecond.runs).toBe(budgetAfterFirst.runs);
    expect(budgetAfterSecond.spentUsd).toBe(budgetAfterFirst.spentUsd);
    const runs = readLedger(paths).filter(isContractRun);
    expect(runs[1]).toMatchObject({ id: 'MM3-0002', verb: 'scan', calls: 0 });
    // [C-073] a sweep run's own top-level categories stays empty; the per-function grading lives only
    // under items[id].categories (same shape loop.test.ts pins for C-083) — no folder/category query reads
    // this field for scan today.
    expect(runs[1]!.categories).toEqual({});
  });

  // Fix #5/#6 follow-through: same pattern as class.ts.
  it('a fully-reused scan is never blocked by an already-reached cap [C-150]', async () => {
    const { paths } = tempProject(FILES);
    const provider = stubProvider({ yes: (q) => (q.id.endsWith('bad#1') ? 0.9 : 0.1) });
    await runScan(REQUEST, { paths, provider, env }); // MM3-0001, 1 run
    writeConfigOverride(paths, { budget: { runs: 1 } }); // already used up by the run above
    const r = await runScan(REQUEST, { paths, provider, env }); // fully reused: no call needed
    expect(r.exit).toBe(0);
    expect(r.text).toContain('reused: 2');
  });

  it('notes when the cost was estimated from tokens (fix #4), same as class.ts', async () => {
    const { paths } = tempProject(FILES);
    const provider = withEstimatedCost(stubProvider({ yes: (q) => (q.id.endsWith('bad#1') ? 0.9 : 0.1) }));
    const r = await runScan(REQUEST, { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('cost estimated from tokens (no live pricing reported)');
  });

  it('a changed function forces exactly one new call carrying only it; the unchanged one stays reused [C-036] [C-214]', async () => {
    const { root, paths } = tempProject(FILES);
    const provider = stubProvider({ yes: (q) => (q.id.endsWith('bad#1') ? 0.9 : 0.1) });
    await runScan(REQUEST, { paths, provider, env });
    expect(provider.calls).toHaveLength(1);

    // Same function name, same file, different body: every one of its answer keys (keyed on the function's
    // own text) no longer matches the ledger, so only this one function is asked again — but ALL its
    // questions, since the evidence behind every one of them changed together.
    writeFileSync(path.join(root, 'src/a.ts'), 'export function bad(req) { return db.query(`y ${req.id}`); }\n');

    const r2 = await runScan(REQUEST, { paths, provider, env });
    expect(provider.calls).toHaveLength(2); // exactly one new call
    const secondCall = provider.calls[1]!;
    // Plan 2c B11: the goal's own reuse key is the sorted concatenation of every resolved item's own text
    // (bad's changed, good's didn't) — bad's own text changing moves that concatenation, so the goal itself
    // is no longer reused either, and rides this same call (first in the questions list) alongside bad's 11.
    expect(secondCall.questions.map((q) => q.id)).toEqual(['goal', ...Array.from({ length: 11 }, (_, i) => `src/a.ts/bad#${i + 1}`)]);
    expect(Object.keys(secondCall.state.items ?? {})).toEqual(['src/a.ts/bad']); // and it carries only that function
    expect(r2.text).toContain('reused: 1'); // src/b.ts/good, unchanged, is still free
  });

  it('--dry-run: no provider call, no ledger line [C-088]', async () => {
    const { paths } = tempProject(FILES);
    const provider = stubProvider();
    const r = await runScan(REQUEST, { paths, provider, env, dryRun: true });
    expect(r.exit).toBe(0);
    expect(r.text).toBe('plan:\n  calls: 1\n  questions: 22\n  items: 4\n  reused: 2\n  route: fake\nnotes: ["dry run: no call, no spend"]\n');
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths)).toEqual([]);
  });

  it('an invalid request exits 2 before any ledger read', async () => {
    const { paths } = tempProject(FILES);
    const provider = stubProvider();
    const r = await runScan('mak:\n  goal: x\n', { paths, provider, env });
    expect(r.exit).toBe(2);
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths)).toEqual([]);
  });

  it('mdl: {recorded: [why, area]}', async () => {
    const { paths } = tempProject(FILES);
    const provider = stubProvider({ yes: () => 0.9 });
    const r = await runScan(REQUEST, { paths, provider, env });
    expect(r.text).toContain('mdl: {recorded: [why, area]}');
  });

  it('a goal that misses the bar on an all-passing scan: next says so, not a passing item [C-071]', async () => {
    const { paths } = tempProject(FILES);
    // Every function passes injection (pass: no, low P(yes)); only the goal itself misses the 0.70 bar, so
    // worstFirst has nothing to point at — this used to throw on worst[0]!.id, then (fix round 1) wrongly
    // drilled into src/a.ts/bad even though it passed.
    const provider = stubProvider({ yes: (q) => (q.id === 'goal' ? 0.1 : 0.1) });
    const r = await runScan(REQUEST, { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('goal: {gate: fail, p: 0.10}');
    expect(r.text).toContain('passing: 2');
    expect(r.text).toContain('failing: {}');
    expect(r.text).toContain('next: the goal missed though every part passed · fix what is missing, then run it again');
  });

  it('a glob matching nothing and a missed goal: next says every item was skipped, not a crash [C-071]', async () => {
    const { paths } = tempProject(FILES); // FILES are on disk, but the pattern below matches none of them
    const NOTHING_MATCHES = REQUEST.replace('file: src/*.ts', 'file: src/nope/*.ts');
    // Nothing to grade at all (zero files matched, so zero functions); the goal still rides its own call and misses.
    const provider = stubProvider({ yes: () => 0.1 });
    const r = await runScan(NOTHING_MATCHES, { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(provider.calls).toHaveLength(1); // the goal alone
    expect(r.text).toContain('scanned: {file: 0, function: 0}');
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('passing: 0');
    expect(r.text).toContain('reused: 0');
    expect(r.text).toContain('next: every item was skipped · raise depth or narrow over, then run it again');
  });

  it('a rehearsal adapter (fake) labels its notes "not evidence" (BRIEF §5) [C-092]', async () => {
    const { paths } = tempProject(FILES);
    const provider = stubProvider({ yes: (q) => (q.id.endsWith('bad#1') ? 0.9 : 0.1), adapter: 'fake' });
    const r = await runScan(REQUEST, { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('adapter fake · not evidence');
  });

  // budget.json is no longer the source of truth (caps live in config.yaml, spend is ledger-derived)
  // — a brand-new project with neither file runs on silent defaults. The "created" note now fires only once,
  // the first time a legacy budget.json is found and migrated into config.yaml.
  it('a legacy budget.json is migrated into config.yaml, and the first run says so (BRIEF §5) [C-093]', async () => {
    const { paths } = tempProject(FILES);
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.budget, JSON.stringify({ capUsd: 5, capRuns: 500, spentUsd: 0, runs: 0, resetAt: '2020-01-01T00:00:00Z' }));
    const provider = stubProvider({ yes: (q) => (q.id.endsWith('bad#1') ? 0.9 : 0.1) });
    const r = await runScan(REQUEST, { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('budget file created with defaults ($5.00 · 500 runs)');
  });
});

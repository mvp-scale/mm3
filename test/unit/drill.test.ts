// drill: down from one item (sweep shape) or one category (class shape), depending on the parent's own shape.
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { writeConfigOverride } from '../../src/config/write.ts';
import { appendContractRun, appendRun, isContractRun, readLedger } from '../../src/ledger/log.ts';
import { runClass } from '../../src/verbs/class.ts';
import { runLoop } from '../../src/verbs/loop.ts';
import { runScan } from '../../src/verbs/scan.ts';
import { runDrill } from '../../src/verbs/drill.ts';
import { runView } from '../../src/verbs/view.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun, sampleRun } from '../helpers/runs.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const env = { MM3_ACTOR: 'r' };
const T = Date.parse('2026-09-26T12:00:00Z');

type Obj = Record<string, unknown>;

/** A concerns category: 3 yes/no probes numbered from..from+2, uniform phrasing so a single stub score grades
 *  every probe in the category identically — the tests below only care about the category's overall gate.
 *  `tag` only varies the wording (never the number): two categories that would otherwise read identically
 *  (same evidence text, same probe text) would answer from the SAME reuse key — several fixtures below reuse
 *  one file across a scan's "function" item and a drill's "call" item, which literally are the same one-line
 *  source, so their own asks need visibly different wording to get fresh answers instead of silently reusing
 *  each other's. */
const concern = (from: number, label: string, pass: 'yes' | 'no' = 'no', tag = ''): Obj => {
  const c: Obj = { pass };
  for (let i = 0; i < 3; i++) c[from + i] = `Is ${label}${tag} thing ${from + i} wrong?`;
  return c;
};
// `tag` (same reasoning as `concern`'s own comment above): several fixtures below share one file's evidence
// across two different asks (a sweep parent's own run and a drill continuing from it, or a class parent and a
// drill sending it fresh questions) — decisions text has to vary too, or it silently reuses across them.
const scaleDecision = (n: number, pass: string[] = ['none'], tag = ''): Obj => ({ pass, [n]: { scale: `How bad is it${tag}?`, levels: ['none', 'low', 'high'] } });
const choiceDecision = (n: number, pass: string[] = ['ship'], tag = ''): Obj => ({ pass, [n]: { choice: `Where should it go${tag}?`, options: ['ship', 'block'] } });

/** The minimal valid one-subject (or unconstrained-depth sweep-layer) ask: one concerns category (3 probes)
 *  plus decisions (severity/route). Drill's one-subject shape, and any layer with no depth to check against,
 *  only enforce the per-category and decisions-range rules — this always satisfies both, whatever `start` is. */
const oneAsk = (name: string, start = 1, pass: 'yes' | 'no' = 'no'): Obj => ({
  concerns: { [name]: concern(start, name, pass) },
  decisions: { severity: scaleDecision(start + 3), route: choiceDecision(start + 4) },
});

/** A full, depth-checked ask (a sweep's finest layer, or a one-subject verb that requires depth): 3k concerns
 *  categories (3 probes each) + decisions. `named` stays the first category, at its given `namedPass`, so
 *  assertions can still target it by name and control its gate; the filler categories are always pass: 'yes'
 *  so the ambient high default score these stub providers return (0.9 and up) passes them quietly, leaving
 *  only `named` visible in a sweep item's failing: entry. k=1 (quick) → 3 categories. */
const fullAsk = (named: string, namedPass: 'yes' | 'no', k: number, start = 1, tag = ''): Obj => {
  const count = 3 * k;
  const concerns: Obj = { [named]: concern(start, named, namedPass, tag) };
  for (let i = 1; i < count; i++) concerns[`c${i}`] = concern(start + i * 3, `c${i}`, 'yes', tag);
  const n = start + count * 3;
  return { concerns, decisions: { severity: scaleDecision(n, undefined, tag), route: choiceDecision(n + 1, undefined, tag) } };
};

const req = (mak: Obj): string => stringify({ mak });

const SCAN_REQ = req({ goal: 'handlers stay safe', depth: 'quick', over: { file: 'src/*.ts', function: 'each' }, ask: { function: fullAsk('injection', 'no', 1) } });
const CLASS_REQ = req({ goal: 'check this code', depth: 'quick', where: ['src/a.ts'], ask: fullAsk('injection', 'no', 1) });

describe('drill: parent and from resolution', () => {
  it('a parent not in the ledger stops', async () => {
    const { paths } = tempProject({});
    const r = await runDrill(req({ goal: 'check this thing', parent: 'MM3-0042', from: 'x', ask: oneAsk('a', 1, 'yes') }), { paths, provider: stubProvider(), env });
    expect(r.exit).toBe(2);
    expect(r.text).toBe('✖ mak.parent: MM3-0042 is not in the ledger → check the id\n→ see: mm3 agent drill');
  });

  it('a legacy (Plan 1) parent stops', async () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun()); // MM3-0001: a Plan 1 run, no v: 2
    const r = await runDrill(req({ goal: 'check this thing', parent: 'MM3-0001', from: 'x', ask: oneAsk('a', 1, 'yes') }), { paths, provider: stubProvider(), env });
    expect(r.exit).toBe(2);
    expect(r.text).toBe('✖ mak.parent: MM3-0001 predates the YAML contract → run class or scan again\n→ see: mm3 agent drill');
  });

  // Fix #10: a sweep item that has code (a unit) can be drilled flat, one subject, no further layer — the
  // fresh ask: categories are answered straight against that item's own lines, class-style. [C-144]
  it('a sweep parent, no over:, from: names a coded item — a flat one-subject proof', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(`x ${req.id}`); }\n' });
    await runScan(SCAN_REQ, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001
    const r = await runDrill(req({ goal: 'find the bug', parent: 'MM3-0001', from: 'src/a.ts/findUser', ask: oneAsk('injection', 1, 'no') }), {
      paths,
      provider: stubProvider({ yes: () => 0.95 }),
      env,
    });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('injection: {gate: fail, 1: 0.95, 2: 0.95, 3: 0.95}');
    expect(r.text).toContain('consensus:');
    // replay --parent points at THIS drill (MM3-0002, items: null), not the sweep it was drilled from
    // (MM3-0001, items !== null — replay refuses a sweep parent outright).
    expect(r.text).toContain('next: fix it, then mm3 replay --parent MM3-0002 --compare <before>..<after>');
  });

  // C-171: a sweep item's own whole-file range is MM3's own choice (scan's file-layer item), not a
  // user-typed where: — part 1 turning an oversized where: entry into a stop must never reach this path.
  it('a sweep parent, no over:, from: names an oversized FILE-layer item — still proves flat, no stop [C-171]', async () => {
    const big = Array.from({ length: 1000 }, () => 'x'.repeat(30)).join('\n'); // well over the per-file evidence limit
    const { paths } = tempProject({ 'src/big.ts': big });
    await runScan(SCAN_REQ, { paths, provider: stubProvider({ yes: () => 0.1 }), env }); // MM3-0001; src/big.ts has no functions, just the file item
    const r = await runDrill(req({ goal: 'check the whole file', parent: 'MM3-0001', from: 'src/big.ts', ask: oneAsk('injection', 1, 'no') }), {
      paths,
      provider: stubProvider({ yes: () => 0.2 }),
      env,
    });
    expect(r.exit).toBe(0);
    expect(r.text).not.toContain('too big to send');
    expect(r.text).toContain('gate:');
  });

  // The item exists but is an idea (loop's own kind, no unit) — nothing to prove flatly without over:.
  it('a sweep parent (loop), no over:, from: names an idea item — a clean stop, not a crash', async () => {
    const { paths } = tempProject({});
    const loopReq = req({ goal: 'the plan holds up', depth: 'quick', over: { part: ['payments'] }, ask: { part: fullAsk('risk', 'no', 1) } });
    await runLoop(loopReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001
    const bad = req({ goal: 'find the bug', parent: 'MM3-0001', from: 'payments', ask: oneAsk('a', 1, 'yes') });
    const r = await runDrill(bad, { paths, provider: stubProvider(), env });
    expect(r.exit).toBe(2);
    expect(r.text).toBe(
      '✖ mak.from: "payments" has no code → add over: with the next layer down, or drill an item scan found (mm3 template drill --parent MM3-0001 --from payments)\n→ see: mm3 agent drill',
    );
  });

  it('a sweep parent, a from: that names no item it listed', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(`x ${req.id}`); }\n' });
    await runScan(SCAN_REQ, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001
    const bad = req({ goal: 'find the bug', parent: 'MM3-0001', from: 'nope', over: { call: 'each' }, ask: { call: oneAsk('x', 1, 'no') } });
    const r = await runDrill(bad, { paths, provider: stubProvider(), env });
    expect(r.exit).toBe(2);
    expect(r.text).toContain('✖ mak.from: "nope" is not an item MM3-0001 listed → use one of:');
  });

  it('a one-subject parent given over: stops', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'x' });
    await runClass(CLASS_REQ, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001
    const bad = req({ goal: 'find the bug', parent: 'MM3-0001', from: 'injection', over: { call: 'each' }, ask: { call: oneAsk('x', 1, 'no') } });
    const r = await runDrill(bad, { paths, provider: stubProvider(), env });
    expect(r.exit).toBe(2);
    expect(r.text).toBe("✖ mak.over: MM3-0001 wasn't a sweep → remove over\n→ see: mm3 agent drill");
  });
});

describe('drill: a sweep parent (scan) — the sweep shape, worst first, passing as a count', () => {
  const drillReq = req({
    goal: 'Find exactly where request text reaches the query',
    parent: 'MM3-0001',
    from: 'src/a.ts/findUser',
    depth: 'quick',
    over: { call: 'each' },
    // Tagged " (call)": the drilled call site and the scan's own function item are the same one-line source in
    // this fixture, so the wording has to differ from SCAN_REQ's or the two would share a reuse key.
    ask: { call: fullAsk('injection', 'no', 1, 1, ' (call)') },
  });

  it("drills into a function's calls [C-009] [C-074] [C-076] [C-078]", async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(`x ${req.id}`); }\n' });
    await runScan(SCAN_REQ, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    const r = await runDrill(drillReq, { paths, provider: stubProvider({ yes: () => 0.96 }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('src/a.ts/findUser/db.query: {injection: fail, 1: 0.96, 2: 0.96, 3: 0.96}');
    expect(r.text).toContain('passing: 0');
    // Controller ruling (task-21-brief): a sweep parent's fail/unsure next fixes-and-reruns the drill (cheap,
    // reuse-aware), never mm3 replay — replay.ts refuses a sweep parent (Decision 2).
    expect(r.text).toContain('next: fix it, then run this drill again');
    expect(r.text).not.toContain('mm3 replay');
    const [run] = readLedger(paths).filter((x) => isContractRun(x) && x.verb === 'drill');
    expect(run).toMatchObject({ parent: 'MM3-0001', from: 'src/a.ts/findUser' });
  });

  it('--dry-run: no provider call, no ledger line [C-088]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(`x ${req.id}`); }\n' });
    await runScan(SCAN_REQ, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    const provider = stubProvider();
    const r = await runDrill(drillReq, { paths, provider, env, dryRun: true });
    expect(r.exit).toBe(0);
    // fullAsk(1) on the finest layer: 3 categories x 3 probes + 2 decisions = 11 questions for the one call item.
    expect(r.text).toBe('plan:\n  calls: 1\n  questions: 11\n  items: 1\n  reused: 0\n  route: fake\nnotes: ["dry run: no call, no spend"]\n');
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths).filter(isContractRun)).toHaveLength(1); // just the scan parent, MM3-0001
  });

  it('a rehearsal adapter (fake) labels its notes "not evidence" (BRIEF §5) [C-092]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(`x ${req.id}`); }\n' });
    await runScan(SCAN_REQ, { paths, provider: stubProvider({ yes: () => 0.9, adapter: 'fake' }), env });
    const r = await runDrill(drillReq, { paths, provider: stubProvider({ yes: () => 0.96, adapter: 'fake' }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('adapter fake · not evidence');
  });

  // Fix #5/#6 follow-through: same needsBudget/costEstimated pattern as class.ts/scan.ts (no reused: count
  // added here — this shape, like loop's, has never documented one; see C-078's own worked example).
  it('a fully-reused sweep drill is never blocked by an already-reached cap', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(`x ${req.id}`); }\n' });
    await runScan(SCAN_REQ, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001
    await runDrill(drillReq, { paths, provider: stubProvider({ yes: () => 0.96 }), env }); // MM3-0002
    writeConfigOverride(paths, { budget: { runs: 2 } }); // exactly used up
    const r = await runDrill(drillReq, { paths, provider: stubProvider(), env }); // fully reused: no call needed
    expect(r.exit).toBe(0);
  });

  it('notes when the cost was estimated from tokens (fix #4), same as class.ts', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(`x ${req.id}`); }\n' });
    await runScan(SCAN_REQ, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    const withEstimatedCost = (inner: ReturnType<typeof stubProvider>): typeof inner => ({
      ...inner,
      ask: async (q, s) => ({ ...(await inner.ask(q, s)), costEstimated: true }),
    });
    const r = await runDrill(drillReq, { paths, provider: withEstimatedCost(stubProvider({ yes: () => 0.96 })), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('cost estimated from tokens (no live pricing reported)');
  });

  // budget.json is no longer the source of truth — a brand-new project with neither budget.json nor
  // config.yaml runs on silent defaults; the "created" note now fires once, when a legacy budget.json migrates.
  it('a legacy budget.json is migrated into config.yaml (BRIEF §5) [C-093]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(`x ${req.id}`); }\n' });
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.budget, JSON.stringify({ capUsd: 5, capRuns: 500, spentUsd: 0, runs: 0, resetAt: '2020-01-01T00:00:00Z' }));
    const parent = sampleContractRun({
      items: {
        'src/a.ts/findUser': {
          layer: 'function',
          fill: { file: 'src/a.ts', function: 'findUser' },
          unit: { path: 'src/a.ts', kind: 'function', name: 'findUser', lines: '1-1' },
          status: 'asked',
          gate: 'fail',
          categories: { injection: 'fail' },
        },
      },
      ask: { categories: [], layers: [{ name: 'function', categories: [{ name: 'injection', section: 'concerns', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'is it unsafe?' }] }] }] },
      over: { file: 'src/*.ts', function: 'each' },
    });
    appendContractRun(paths, parent, T, 'b'); // MM3-0001
    const r = await runDrill(drillReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('budget file created with defaults ($5.00 · 500 runs)');
  });
});

describe('drill: a sweep parent (loop) — an idea item has no unit, unlike scan/class [C-075] [C-076]', () => {
  const loopReq = req({
    goal: 'The checkout redesign is sound',
    depth: 'quick',
    over: { part: [{ name: 'gateway', story: ['guest checkout'] }, { name: 'payments', story: ['refunds'] }] },
    ask: { story: fullAsk('done', 'yes', 1, 1, ' (story)') }, // story is the finest layer; part's ask is optional, so it's omitted
  });
  // done occupies probes 1-3; failing all three fails "done" for exactly the targeted item, same effect as a
  // single failing probe used to have, now spread across a category that must hold exactly 3.
  const failsFirstCategory =
    (id: string) =>
    (q: { id: string }): boolean =>
      new RegExp(`^${id.replace(/[/]/gu, '\\/')}#[1-3]$`, 'u').test(q.id);

  it('drilling into an idea item with a new list of ideas works (no code to resolve, so no resolver is needed)', async () => {
    const { paths } = tempProject({});
    const failsDone = failsFirstCategory('payments/refunds');
    await runLoop(loopReq, { paths, provider: stubProvider({ yes: (q) => (failsDone(q) ? 0.2 : 0.9) }), env }); // MM3-0001
    const drillReq = req({
      goal: 'find why refunds is unsound',
      parent: 'MM3-0001',
      from: 'payments/refunds',
      depth: 'quick',
      over: { cause: ['double charge', 'silent failure'] },
      ask: { cause: fullAsk('risk', 'yes', 1, 1, ' (cause)') },
    });
    const failsCause = failsFirstCategory('payments/refunds/double charge');
    const r = await runDrill(drillReq, { paths, provider: stubProvider({ yes: (q) => (failsCause(q) ? 0.2 : 0.9) }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('payments/refunds/double charge: {risk: fail, 1: 0.20, 2: 0.20, 3: 0.20}');
  });

  it('drilling into an idea item with "each" cannot resolve code that does not exist — a clean stop, not a crash', async () => {
    const { paths } = tempProject({});
    const failsDone = failsFirstCategory('payments/refunds');
    await runLoop(loopReq, { paths, provider: stubProvider({ yes: (q) => (failsDone(q) ? 0.2 : 0.9) }), env }); // MM3-0001
    const drillReq = req({
      goal: 'find why refunds is unsound',
      parent: 'MM3-0001',
      from: 'payments/refunds',
      depth: 'quick',
      over: { cause: 'each' },
      ask: { cause: fullAsk('risk', 'yes', 1, 1, ' (cause)') },
    });
    const r = await runDrill(drillReq, { paths, provider: stubProvider(), env });
    expect(r.exit).toBe(2);
    expect(r.text).toBe(
      '✖ mak.over.cause: "payments/refunds" is an idea, not code → give cause as a list of items (there is nothing to split with each)\n→ see: mm3 agent drill',
    );
  });
});

describe('drill: a one-subject parent (class) — the class shape', () => {
  const drillReq = req({
    goal: 'Find exactly where request text reaches the query',
    parent: 'MM3-0001',
    from: 'injection',
    ask: {
      concerns: {
        source: {
          pass: 'no',
          1: 'Is the value concatenated straight into the string?',
          2: 'Does it skip a parameterized query?',
          3: 'Is the query run with that raw string?',
        },
      },
      // Tagged: this drill shares its parent class run's own evidence (src/a.ts, unchanged) — untagged
      // decisions text here would collide with CLASS_REQ's own severity/route reuse keys.
      decisions: { severity: scaleDecision(4, undefined, ' (source)'), route: choiceDecision(5, undefined, ' (source)') },
    },
  });

  it('sends new, narrower questions inside the named category [C-033] [C-077] [C-078]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`x ${x}`); }\n' });
    await runClass(CLASS_REQ, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    const r = await runDrill(drillReq, { paths, provider: stubProvider({ yes: () => 0.95 }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('source: {gate: fail, 1: 0.95, 2: 0.95, 3: 0.95}');
    expect(r.text).toContain('consensus:');
    // Controller ruling: a one-subject parent's fail/unsure next keeps fix-then-replay.
    expect(r.text).toContain('next: fix it, then mm3 replay --parent MM3-0001 --compare <before>..<after>');

    // [C-079] the narrower "source" category drill invented becomes part of the record at this place: it
    // rides drill's own run (where: parent.where), so view's per-category history now carries it too — view
    // only matches by category name, so a thinner (2-probe) ask here still finds the drill's 3-probe record.
    const viewText = req({
      goal: 'check this code',
      depth: 'quick',
      where: ['src/a.ts'],
      ask: { concerns: { source: { pass: 'no', 1: 'Is the value concatenated straight into the string?', 2: 'Does it skip a parameterized query?' } } },
    });
    const v = runView(viewText, 1, { paths, env: {} });
    expect(v.text).toContain('source: {runs: 1, pass: 0, fail: 1, last: MM3-0002}');
  });

  it('a from that names neither a category nor an item: a clean stop', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'x' });
    await runClass(CLASS_REQ, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    const bad = req({ goal: 'find the bug', parent: 'MM3-0001', from: 'nope', ask: oneAsk('a', 1, 'yes') });
    const r = await runDrill(bad, { paths, provider: stubProvider(), env });
    expect(r.exit).toBe(2);
    expect(r.text).toContain('✖ mak.from: "nope" is not a category of MM3-0001');
  });

  it('--dry-run: no provider call, no ledger line [C-088]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`x ${x}`); }\n' });
    await runClass(CLASS_REQ, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    const provider = stubProvider();
    const r = await runDrill(drillReq, { paths, provider, env, dryRun: true });
    expect(r.exit).toBe(0);
    // goal + source's 3 probes + severity + route = 6.
    expect(r.text).toBe('plan:\n  calls: 1\n  questions: 6\n  reused: 0\n  route: fake\nnotes: ["dry run: no call, no spend"]\n');
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths).filter(isContractRun)).toHaveLength(1); // just the class parent, MM3-0001
  });

  // Fix #5/#6 follow-through: same pattern as class.ts — reuse is resolved before preflight, so a fully-reused
  // drill is never blocked by an already-reached budget cap, and the response says which run its answers came from.
  it('a fully-reused drill is never blocked by an already-reached cap, and names the run it reused [C-149]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`x ${x}`); }\n' });
    await runClass(CLASS_REQ, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001, 1 run
    await runDrill(drillReq, { paths, provider: stubProvider({ yes: () => 0.95 }), env }); // MM3-0002, 1 run
    writeConfigOverride(paths, { budget: { runs: 2 } }); // exactly used up by the two runs above
    const r = await runDrill(drillReq, { paths, provider: stubProvider(), env }); // fully reused: no call needed
    expect(r.exit).toBe(0);
    expect(r.text).toContain('reused: [MM3-0002]');
  });

  it('a rehearsal adapter (fake) labels its notes "not evidence" (BRIEF §5) [C-092]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`x ${x}`); }\n' });
    await runClass(CLASS_REQ, { paths, provider: stubProvider({ yes: () => 0.9, adapter: 'fake' }), env });
    const r = await runDrill(drillReq, { paths, provider: stubProvider({ yes: () => 0.95, adapter: 'fake' }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('adapter fake · not evidence');
  });

  // budget.json is no longer the source of truth — a brand-new project with neither budget.json nor
  // config.yaml runs on silent defaults; the "created" note now fires once, when a legacy budget.json migrates.
  it('a legacy budget.json is migrated into config.yaml, and the first run says so (BRIEF §5) [C-093]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`x ${x}`); }\n' });
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.budget, JSON.stringify({ capUsd: 5, capRuns: 500, spentUsd: 0, runs: 0, resetAt: '2020-01-01T00:00:00Z' }));
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'] }), T, 'b'); // MM3-0001: the default "injection" category
    const r = await runDrill(drillReq, { paths, provider: stubProvider({ yes: () => 0.95 }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('budget file created with defaults ($5.00 · 500 runs)');
  });
});

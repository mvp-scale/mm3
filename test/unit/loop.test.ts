// loop: the contract's own example end to end, tree order for failing: and passing:.
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { writeConfigOverride } from '../../src/config/write.ts';
import { runLoop } from '../../src/verbs/loop.ts';
import { isContractRun, readLedger } from '../../src/ledger/log.ts';
import { tempProject } from '../helpers/project.ts';
import { stubProvider, type Stub } from '../helpers/stub-provider.ts';

/** Wraps a stub so its answer reports an estimated cost, without changing stub-provider.ts (shared by other crews). */
const withEstimatedCost = (inner: Stub): Stub => ({ ...inner, ask: async (q, s) => ({ ...(await inner.ask(q, s)), costEstimated: true }) });

// part is not the finest layer (story is) — a thin "boundaries" ask (2 probes, no decisions) is fine there.
// story IS the finest layer: it needs a full 3 concerns x 3 probes + decisions ask. done (q3-5, pass: yes) and
// risk (q6-8, pass: no) keep their ORIGINAL first-probe numbers (3 and, before this migration, 4 — now 6,
// since each category grew from 1 probe to 3); a new "fit" concerns category and severity/route decisions
// round out the contract. Every test below keys off done's/risk's own first probe only, same as before.
const LOOP =
  'mak:\n  goal: The checkout redesign is sound\n  depth: quick\n  over:\n    part:\n      - name: gateway\n        story: [guest checkout, saved cards]\n      - name: payments\n        story: [refunds, retries, partial capture]\n      - ledger\n  ask:\n    part:\n      concerns:\n        boundaries:\n          pass: yes\n          1: Does {part} own one clear responsibility?\n          2: Can {part} be deployed without the others?\n    story:\n      concerns:\n        done:\n          pass: yes\n          3: Is "{story}" testable against {part} as written?\n          4: Does "{story}" have a named owner?\n          5: Is "{story}" small enough to ship on its own?\n        risk:\n          pass: no\n          6: Does "{story}" need data {part} doesn\'t own?\n          7: Does "{story}" depend on another part\'s release order?\n          8: Could "{story}" fail silently in production?\n        fit:\n          pass: yes\n          9: Does "{story}" match how {part} is meant to be used?\n          10: Would "{story}" survive {part} being replaced later?\n          11: Is "{story}" covered by an existing test today?\n      decisions:\n        severity:\n          pass: [none, low]\n          12:\n            scale: How risky is "{story}"?\n            levels: [none, low, medium, high, critical]\n        route:\n          pass: [build-now]\n          13:\n            choice: What should happen to "{story}" next?\n            options: [build-now, rework, redesign]\nmdl:\n  why: validate\n  area: api\n';

describe('loop', () => {
  it('the contract example: payments and its failing children show up, tree order, worst-target next [C-080] [C-082]', async () => {
    const { paths } = tempProject({});
    const yes = (q: { id: string }) =>
      q.id === 'payments#2' ? 0.18 : q.id === 'payments/refunds#3' ? 0.22 : q.id === 'payments/refunds#6' ? 0.91 : q.id === 'payments/partial capture#6' ? 0.48 : /#(6|7|8)$/.test(q.id) ? 0.1 : 0.9;
    const r = await runLoop(LOOP, { paths, provider: stubProvider({ yes }), env: {} });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('payments: {boundaries: fail, 2: 0.18}');
    expect(r.text).toContain('payments/refunds: {done: fail, risk: fail, 3: 0.22, 6: 0.91}');
    expect(r.text).toContain('payments/partial capture: {risk: unsure, 6: 0.48}');
    expect(r.text).toContain('passing: [gateway, gateway/guest checkout, gateway/saved cards, payments/retries, ledger]');
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('mdl: {recorded: [why, area]}');
    // worstFirst picks the worst item (most fails, then unsures): refunds (2 failing categories) over
    // payments itself (1) or partial capture (0 fails, 1 unsure) — matches the contract's own golden example.
    expect(r.text).toContain('next: mm3 template drill --parent MM3-0001 --from payments/refunds');
    // part: 2 probes x 3 items = 6; story: 11 probes (9 concerns + 2 decisions) x 5 items = 55; 6+55 = 61.
    expect(r.text).toMatch(/2 calls · 61 questions · budget: \$[\d.]+ left/);
    expect(r.run).toBeDefined();
  });

  it('--dry-run: no provider call, no budget file, no ledger line [C-088]', async () => {
    const { paths } = tempProject({});
    const provider = stubProvider();
    const r = await runLoop(LOOP, { paths, provider, env: {}, dryRun: true });
    expect(r.exit).toBe(0);
    expect(r.text).toBe('plan:\n  calls: 2\n  questions: 61\n  items: 8\n  reused: 0\n  route: fake\nnotes: ["dry run: no call, no spend"]\n');
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths)).toEqual([]);
  });

  it('a goal that clears the bar on a fully-passing sweep: gate pass, next says build it and then prove it with replay [C-232]', async () => {
    const { paths } = tempProject({});
    const ALL_PASS =
      'mak:\n  goal: The checkout redesign is sound\n  depth: quick\n  over:\n    part:\n      - gateway\n      - payments\n  ask:\n    part:\n      concerns:\n        boundaries:\n          pass: yes\n          1: Does {part} own one clear responsibility?\n          2: Can {part} be deployed without the others?\n          3: Does {part} have a single clear owner?\n        clarity:\n          pass: yes\n          4: Is {part}\'s purpose documented?\n          5: Is {part}\'s interface stable?\n          6: Is {part} easy to test in isolation?\n        fit:\n          pass: yes\n          7: Does {part} fit the overall design?\n          8: Is {part} loosely coupled to its neighbors?\n          9: Would {part} survive a neighbor being replaced?\n      decisions:\n        severity:\n          pass: [none, low]\n          10:\n            scale: How risky is {part}?\n            levels: [none, low, medium, high, critical]\n        route:\n          pass: [ship]\n          11:\n            choice: What should happen to {part}?\n            options: [ship, fix, block]\nmdl:\n  why: validate\n  area: api\n';
    const r = await runLoop(ALL_PASS, { paths, provider: stubProvider({ yes: () => 0.95 }), env: {} });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: pass');
    expect(r.text).toContain('next: build it, then class the code · after the commit, mm3 replay --parent MM3-0001 --compare <before>..HEAD\n');
    expect(r.text).toContain('passing: [gateway, payments]');
  });

  it('a goal that misses the bar on an all-passing sweep: next says so, not a passing item', async () => {
    const { paths } = tempProject({});
    const ALL_PASS =
      'mak:\n  goal: The checkout redesign is sound\n  depth: quick\n  over:\n    part:\n      - gateway\n      - payments\n  ask:\n    part:\n      concerns:\n        boundaries:\n          pass: yes\n          1: Does {part} own one clear responsibility?\n          2: Can {part} be deployed without the others?\n          3: Does {part} have a single clear owner?\n        clarity:\n          pass: yes\n          4: Is {part}\'s purpose documented?\n          5: Is {part}\'s interface stable?\n          6: Is {part} easy to test in isolation?\n        fit:\n          pass: yes\n          7: Does {part} fit the overall design?\n          8: Is {part} loosely coupled to its neighbors?\n          9: Would {part} survive a neighbor being replaced?\n      decisions:\n        severity:\n          pass: [none, low]\n          10:\n            scale: How risky is {part}?\n            levels: [none, low, medium, high, critical]\n        route:\n          pass: [ship]\n          11:\n            choice: What should happen to {part}?\n            options: [ship, fix, block]\nmdl:\n  why: validate\n  area: api\n';
    // Every item's own category clears the bar; only the goal itself misses — worstFirst has nothing to point
    // at, so this used to throw on worst!.id, then (fix round 1) wrongly drilled into gateway even though it passed.
    const yes = (q: { id: string }) => (q.id === 'goal' ? 0.1 : 0.95);
    const r = await runLoop(ALL_PASS, { paths, provider: stubProvider({ yes }), env: {} });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('goal: {gate: fail, p: 0.10}');
    expect(r.text).toContain('passing: [gateway, payments]');
    expect(r.text).toContain('next: the goal missed though every part passed · fix what is missing, then run it again');
  });

  it('the full per-item category record is kept in the ledger even though no per-layer query surfaces it yet [C-084]', async () => {
    const { paths } = tempProject({});
    const yes = (q: { id: string }) =>
      q.id === 'payments#2' ? 0.18 : q.id === 'payments/refunds#3' ? 0.22 : q.id === 'payments/refunds#6' ? 0.91 : q.id === 'payments/partial capture#6' ? 0.48 : /#(6|7|8)$/.test(q.id) ? 0.1 : 0.9;
    const r = await runLoop(LOOP, { paths, provider: stubProvider({ yes }), env: {} });
    // Unlike class (view's request mode reads a per-category, per-place record straight off the ledger),
    // a sweep run's own top-level `categories` is always {} — the per-item categories below are the only
    // place this run's grading lives, and today only this run's own response reads them back, not a
    // dedicated cross-run pattern query. That's the real, current shape of "mdl learns" for loop.
    if (!r.run || !isContractRun(r.run)) throw new Error('expected a v2 contract run');
    expect(r.run.categories).toEqual({});
    expect(r.run.items?.['payments']?.categories).toEqual({ boundaries: 'fail' });
    expect(r.run.items?.['payments/refunds']?.categories).toEqual({ done: 'fail', risk: 'fail', fit: 'pass', severity: 'pass', route: 'pass' });
  });

  it('a rehearsal adapter (fake) labels its notes "not evidence" (BRIEF §5) [C-092]', async () => {
    const { paths } = tempProject({});
    const yes = (q: { id: string }) =>
      q.id === 'payments#2' ? 0.18 : q.id === 'payments/refunds#3' ? 0.22 : q.id === 'payments/refunds#6' ? 0.91 : q.id === 'payments/partial capture#6' ? 0.48 : /#(6|7|8)$/.test(q.id) ? 0.1 : 0.9;
    const r = await runLoop(LOOP, { paths, provider: stubProvider({ yes, adapter: 'fake' }), env: {} });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('adapter fake · not evidence');
  });

  // Fix #5/#6 follow-through: same pattern as class.ts/scan.ts.
  it('a fully-reused loop is never blocked by an already-reached cap [C-151]', async () => {
    const { paths } = tempProject({});
    const yes = () => 0.9;
    await runLoop(LOOP, { paths, provider: stubProvider({ yes }), env: {} }); // MM3-0001, 2 runs' worth of calls in one run
    writeConfigOverride(paths, { budget: { runs: 1 } }); // already used up
    const r = await runLoop(LOOP, { paths, provider: stubProvider(), env: {} }); // fully reused: no call needed
    expect(r.exit).toBe(0);
  });

  // a sweep's fully-reused second run shows each reused origin's age, not just that reuse
  // happened — the same reusedAgeNotes line class.ts/drill.ts/replay.ts now show, wired here into the shared
  // sweep engine's own response.
  it('a fully-reused second run names the origin run and its age in notes', async () => {
    const { paths } = tempProject({});
    await runLoop(LOOP, { paths, provider: stubProvider({ yes: () => 0.9 }), env: {} }); // MM3-0001
    const r2 = await runLoop(LOOP, { paths, provider: stubProvider(), env: {} }); // fully reused, no call needed
    expect(r2.exit).toBe(0);
    expect(r2.text).toContain('reused: MM3-0001 (0d)');
  });

  it('notes when the cost was estimated from tokens (fix #4), same as class.ts', async () => {
    const { paths } = tempProject({});
    const provider = withEstimatedCost(stubProvider({ yes: () => 0.9 }));
    const r = await runLoop(LOOP, { paths, provider, env: {} });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('cost estimated from tokens (no live pricing reported)');
  });

  // budget.json is no longer the source of truth — a brand-new project with neither budget.json nor
  // config.yaml runs on silent defaults; the "created" note now fires once, when a legacy budget.json migrates.
  it('a legacy budget.json is migrated into config.yaml, and the first run says so (BRIEF §5) [C-093]', async () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.budget, JSON.stringify({ capUsd: 5, capRuns: 500, spentUsd: 0, runs: 0, resetAt: '2020-01-01T00:00:00Z' }));
    const yes = (q: { id: string }) =>
      q.id === 'payments#2' ? 0.18 : q.id === 'payments/refunds#3' ? 0.22 : q.id === 'payments/refunds#6' ? 0.91 : q.id === 'payments/partial capture#6' ? 0.48 : /#(6|7|8)$/.test(q.id) ? 0.1 : 0.9;
    const r = await runLoop(LOOP, { paths, provider: stubProvider({ yes }), env: {} });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('budget file created with defaults ($5.00 · 500 runs)');
  });
});

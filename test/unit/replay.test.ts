// replay: re-runs a parent's questions on two states; fixed/still/regressed. A one-subject parent (class,
// replay, drill's one-subject form) is answered category-by-category; a sweep parent (scan, loop, drill's sweep
// form) re-runs the sweep at both refs and answers item-by-item — only a drill sweep CONTINUATION
// (anchored on a root item this run can't rebuild) and a legacy (Plan 1) parent still stop.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ClassifierAnswer, ClassifierPort, ClassifierState } from '../../src/classifier/port.ts';
import { EVIDENCE_LIMITS } from '../../src/evidence/code.ts';
import { hasGit } from '../../src/evidence/git.ts';
import { appendContractRun, appendRun, isContractRun, readLedger } from '../../src/ledger/log.ts';
import { writeConfigOverride } from '../../src/config/write.ts';
import { runReplay } from '../../src/verbs/replay.ts';
import { runClass } from '../../src/verbs/class.ts';
import { runDrill } from '../../src/verbs/drill.ts';
import { runScan } from '../../src/verbs/scan.ts';
import { gitCommit, gitInit, tempProject } from '../helpers/project.ts';
import { sampleContractRun, sampleRun } from '../helpers/runs.ts';
import { stubProvider, type Stub } from '../helpers/stub-provider.ts';

/** Wraps a stub so its answer reports an estimated cost, without changing stub-provider.ts (shared by other crews). */
const withEstimatedCost = (inner: Stub): Stub => ({ ...inner, ask: async (q, s) => ({ ...(await inner.ask(q, s)), costEstimated: true }) });

const env = { MM3_ACTOR: 'r' };
const T = Date.parse('2026-09-26T12:00:00Z');

/** A full, valid quick-depth ask (3 concerns categories x 3 probes + 2 decisions), for class requests
 *  that replay.ts's own tests build a parent from — replay never cares about the exact question text, only
 *  that "injection" (the category most of these tests check) is real and its questions are numbered 1-3. */
const QUICK_ASK =
  '  ask:\n    concerns:\n      injection:\n        pass: no\n        1: q1?\n        2: q2?\n        3: q3?\n      access:\n        pass: no\n        4: q4?\n        5: q5?\n        6: q6?\n      leaks:\n        pass: no\n        7: q7?\n        8: q8?\n        9: q9?\n    decisions:\n      severity:\n        pass: [none, low]\n        10:\n          scale: How bad?\n          levels: [none, low, high]\n      route:\n        pass: [ship]\n        11:\n          choice: Where to?\n          options: [ship, block]\n';

/** Answers by inspecting the evidence text itself ("does state.code contain <marker>?"), not the question id
 *  or which state it's asking about — so a test using this proves fixed/still/regressed come from real content. */
function markerProvider(): ClassifierPort {
  return {
    adapter: 'stub',
    model: 'stub-1',
    async ask(questions, state: ClassifierState) {
      const code = (state.code ?? {}) as Record<string, string>;
      const text = Object.values(code).join('\n');
      const answers: Record<string, ClassifierAnswer> = {};
      for (const q of questions) {
        if (q.type !== 'noul') continue;
        const marker = /contain (\w+)\?/.exec(q.ask)?.[1];
        answers[q.id] = { type: 'noul', probability: marker && text.includes(marker) ? 0.9 : 0.05 };
      }
      return { answers, costUsd: 0 };
    },
  };
}

/** The sweep-shaped twin of markerProvider: answers by inspecting the SPECIFIC item's own text (state.items,
 *  keyed by the classifier question's own `item` field — translate.ts's itemQuestions/toClassifierQuestion),
 *  not the whole call's evidence — so two items sharing one call (one layer, one batch) are graded
 *  independently, the same way real code content would be. */
function sweepMarkerProvider(): ClassifierPort {
  return {
    adapter: 'stub',
    model: 'stub-1',
    async ask(questions, state: ClassifierState) {
      const items = (state.items ?? {}) as Record<string, string>;
      const answers: Record<string, ClassifierAnswer> = {};
      for (const q of questions) {
        if (q.type === 'score') {
          const distribution = q.levels.map((_, i) => (i === 0 ? 0.9 : 0.1 / (q.levels.length - 1 || 1)));
          answers[q.id] = { type: 'score', score: 0, distribution, confidence: 0.9 };
          continue;
        }
        if (q.type === 'choice') {
          const options = Object.keys(q.options);
          const probabilities = Object.fromEntries(options.map((o, i) => [o, i === 0 ? 0.9 : 0.1 / (options.length - 1 || 1)]));
          answers[q.id] = { type: 'choice', choice: options[0]!, probabilities, confidence: 0.9 };
          continue;
        }
        const marker = /contain (\w+)\?/.exec(q.ask)?.[1];
        const text = q.item !== undefined ? (items[q.item] ?? '') : Object.values(items).join('\n');
        answers[q.id] = { type: 'noul', probability: marker && text.includes(marker) ? 0.9 : 0.05 };
      }
      return { answers, costUsd: 0 };
    },
  };
}

describe('replay', () => {
  it('a class parent that has since been fixed on the worktree: fixed, no regression [C-060] [C-063] [C-211]', async () => {
    const { paths, root } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`SELECT * FROM t WHERE id = ${x}`); }\n' });
    const classText = `mak:\n  goal: fix sql injection\n  depth: quick\n  where: [src/a.ts]\n${QUICK_ASK}`;
    await runClass(classText, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    writeFileSync(path.join(root, 'src/a.ts'), 'export function f(x) { return db.query("SELECT * FROM t WHERE id = ?", [x]); }\n');
    const changeText = 'mak:\n  goal: The fix works\n  parent: MM3-0001\n  compare: {before: worktree, after: worktree}\n  expect: [injection]\n';
    // (before === after === worktree here only to exercise the plumbing without a real git repo; git-evidence.test.ts covers refs.)
    const r = await runReplay(changeText, { paths, provider: stubProvider({ yes: () => 0.05 }), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('injection: {before: pass, after: pass}');
    expect(r.text).not.toContain('probes:');
    expect(r.text).toContain('regressed: []');
    expect(r.text).toContain('reading whole files: line ranges may not match the parent run');
    const [run] = readLedger(paths).filter((x) => isContractRun(x) && x.verb === 'replay');
    expect(run).toMatchObject({ verb: 'replay', parent: 'MM3-0001' });
  });

  it('a scan (sweep) parent replays at two refs: fixed/still/regressed per item, an unchanged item reuses straight from the parent itself, and a clean item is left out of items: [C-063] [C-216] [C-217]', async (ctx) => {
    if (!hasGit()) return ctx.skip();
    const { paths, root } = tempProject({
      'src/a.ts': 'export function f(x) {\n  return db.query(`SELECT * FROM t WHERE id = ${x}`); // VULN STILL_BAD\n}\n',
      'src/b.ts': 'export const STABLE = 1;\n',
    });
    gitInit(root);
    const beforeRef = gitCommit(root, 'vulnerable');

    const scanReq =
      'mak:\n  goal: check handlers\n  depth: quick\n  over:\n    file: src/*.ts\n  ask:\n    file:\n      concerns:\n        injection:\n          pass: no\n          1: Does the file contain VULN?\n          2: Does the file contain STILL_BAD?\n          3: Does the file contain NEW_BUG?\n        access:\n          pass: no\n          4: q4?\n          5: q5?\n          6: q6?\n        leaks:\n          pass: no\n          7: q7?\n          8: q8?\n          9: q9?\n      decisions:\n        severity:\n          pass: [none, low]\n          10:\n            scale: How bad?\n            levels: [none, low, high]\n        route:\n          pass: [ship]\n          11:\n            choice: Where to?\n            options: [ship, block]\n';
    // MM3-0001: scan reads the current working tree, which is beforeRef's own content (nothing's been touched yet).
    await runScan(scanReq, { paths, provider: sweepMarkerProvider(), env });

    // A partial fix on a.ts only: VULN is gone (fixed), STILL_BAD remains (still), a refactor adds NEW_BUG
    // (regressed). b.ts never changes at all.
    writeFileSync(path.join(root, 'src/a.ts'), 'export function f(x) {\n  return db.query("SELECT * FROM t WHERE id = ?", [x]); // STILL_BAD NEW_BUG\n}\n');
    const afterRef = gitCommit(root, 'partial fix, new bug');

    const r = await runReplay(`mak:\n  goal: verify the partial fix\n  parent: MM3-0001\n  compare: {before: ${beforeRef}, after: ${afterRef}}\n  expect: [injection]\n`, {
      paths,
      provider: sweepMarkerProvider(),
      env,
    });

    expect(r.exit).toBe(0);
    expect(r.text).toContain('items:\n    src/a.ts: {before: fail, after: fail, fixed: [1], still: [2], probes: 1/2 fixed}');
    expect(r.text).not.toContain('src/b.ts'); // unchanged and always-passing: nothing to say, left out of items:
    expect(r.text).toContain('regressed: [src/a.ts#3]');
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('expected: {fixed: [], still: [injection]}');
    expect(r.text).toContain('reused: [MM3-0001]'); // b.ts (both states) and a.ts's own "before" all reuse MM3-0001 directly
    const [run] = readLedger(paths).filter((x) => isContractRun(x) && x.verb === 'replay');
    expect(run).toMatchObject({ verb: 'replay', parent: 'MM3-0001', where: ['src/a.ts', 'src/b.ts'] });
    expect(run && isContractRun(run) ? Object.keys(run.items ?? {}) : null).toEqual(['src/a.ts', 'src/b.ts']);
  });

  // Round 3 smoke test root cause (STOPS.md #1, .mm3/QUESTION-DETAIL.md #3): the confirming run was
  // `drill --parent MM3-0001 --from contributions.js` with `over: {function: each}` — a single new layer
  // added to an already-scoped file item, not scan's own chained file+function sweep (which would also carry
  // a file-layer item alongside it). Because the handler was defined as `this.x = () => {}` inside a
  // constructor, that layer found exactly ONE item — yet `parent.items !== null` still made it sweep-shaped,
  // and replay refuses it regardless of how many items the sweep actually found. Reproduced end to end here
  // through a real scan (MM3-0001, one file item) then a real drill (MM3-0002, exactly one function item) —
  // not a hand-built ledger record — with the item count asserted directly off the ledger, not inferred.
  it('a drill sweep CONTINUATION (over: starts with "each", anchored on a root item this run cannot rebuild) is refused, even with exactly one item', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function onlyFn(req) { return db.query(`x ${req.id}`); }\n' });
    const scanReq =
      'mak:\n  goal: check handlers\n  depth: quick\n  over:\n    file: src/a.ts\n  ask:\n    file:\n      concerns:\n        injection:\n          pass: no\n          1: is {file} unsafe?\n          2: q2?\n          3: q3?\n        access:\n          pass: no\n          4: q4?\n          5: q5?\n          6: q6?\n        leaks:\n          pass: no\n          7: q7?\n          8: q8?\n          9: q9?\n      decisions:\n        severity:\n          pass: [none, low]\n          10:\n            scale: How bad?\n            levels: [none, low, high]\n        route:\n          pass: [ship]\n          11:\n            choice: Where to?\n            options: [ship, block]\n';
    await runScan(scanReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001: one file-layer item, no function layer yet
    const drillReq =
      'mak:\n  goal: check each function\n  parent: MM3-0001\n  from: src/a.ts\n  over:\n    function: each\n  ask:\n    function:\n      concerns:\n        injection:\n          pass: no\n          1: Does {function} put request text straight into a query?\n          2: q2?\n          3: q3?\n        access:\n          pass: no\n          4: q4?\n          5: q5?\n          6: q6?\n        leaks:\n          pass: no\n          7: q7?\n          8: q8?\n          9: q9?\n      decisions:\n        severity:\n          pass: [none, low]\n          10:\n            scale: How bad?\n            levels: [none, low, high]\n        route:\n          pass: [ship]\n          11:\n            choice: Where to?\n            options: [ship, block]\n';
    await runDrill(drillReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0002: sweep-shaped, exactly one function item

    const sw2 = readLedger(paths).find((x) => x.id === 'MM3-0002');
    expect(sw2 && isContractRun(sw2) ? Object.keys(sw2.items ?? {}) : null).toEqual(['src/a.ts/onlyFn']); // items !== null, length 1

    const r = await runReplay('mak:\n  goal: verify the fix\n  parent: MM3-0002\n  compare: {before: worktree, after: worktree}\n  expect: [injection]\n', {
      paths,
      provider: stubProvider(),
      env,
    });
    expect(r.exit).toBe(2);
    expect(r.text).toBe(
      '✖ mak.parent: MM3-0002 is a drill continuation (over: starts with "each") → replay can\'t rebuild its root item; run the sweep again instead\n→ see: mm3 agent replay',
    );
  });

  it('a legacy (Plan 1) parent stops', async () => {
    const { paths } = tempProject({});
    appendRun(paths, sampleRun()); // MM3-0001: a Plan 1 run, no v: 2
    const r = await runReplay('mak:\n  goal: check the fix\n  parent: MM3-0001\n  compare: {before: worktree, after: worktree}\n  expect: [injection]\n', {
      paths,
      provider: stubProvider(),
      env,
    });
    expect(r.exit).toBe(2);
    expect(r.text).toBe('✖ mak.parent: MM3-0001 predates the YAML contract → run class again on this code\n→ see: mm3 agent replay');
  });

  it('a parent not in the ledger stops, naming the id', async () => {
    const { paths } = tempProject({});
    const r = await runReplay('mak:\n  goal: check the fix\n  parent: MM3-0042\n  compare: {before: worktree, after: worktree}\n  expect: [injection]\n', {
      paths,
      provider: stubProvider(),
      env,
    });
    expect(r.exit).toBe(2);
    expect(r.text).toBe('✖ mak.parent: MM3-0042 is not in the ledger → check the id\n→ see: mm3 agent replay');
  });

  it("expect: must name one of the parent's actual concerns", async () => {
    const { paths } = tempProject({ 'src/a.ts': 'anything\n' });
    await runClass(`mak:\n  goal: check this code\n  depth: quick\n  where: [src/a.ts]\n${QUICK_ASK}`, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001
    const r = await runReplay(
      'mak:\n  goal: verify the fix\n  parent: MM3-0001\n  compare: {before: worktree, after: worktree}\n  expect: [not-a-real-concern]\n',
      { paths, provider: stubProvider(), env },
    );
    expect(r.exit).toBe(2);
    expect(r.text).toBe('✖ mak.expect: "not-a-real-concern" is not a concern of MM3-0001 → use one of injection, access, leaks\n→ see: mm3 agent replay');
  });

  it('expected: grades the prediction against fixed/still, leaving an already-passing concern out of both', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'anything\n' });
    const parent = sampleContractRun({
      where: ['src/a.ts'],
      ask: {
        categories: [
          { name: 'injection', section: 'concerns', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'q1?' }] },
          { name: 'access', section: 'concerns', pass: 'no', need: 'all', tags: [], questions: [{ n: 2, kind: 'yesno', text: 'q2?' }] },
          { name: 'leaks', section: 'concerns', pass: 'no', need: 'all', tags: [], questions: [{ n: 3, kind: 'yesno', text: 'q3?' }] },
        ],
        layers: [],
      },
      // injection missed before (0.9, "no" doesn't clear); access already passed before (0.05); leaks missed before too.
      answers: { goal: { kind: 'yesno', p: 0.1 }, '1': { kind: 'yesno', p: 0.9 }, '2': { kind: 'yesno', p: 0.05 }, '3': { kind: 'yesno', p: 0.9 } },
      keys: { goal: 'k-goal', '1': 'k-1', '2': 'k-2', '3': 'k-3' },
      categories: { injection: 'fail', access: 'pass', leaks: 'fail' },
      gate: 'fail',
    });
    appendContractRun(paths, parent, T, 'b'); // MM3-0001
    // The parent's own stored answers/keys are arbitrary (not real answerKey() hashes), so "before" is always a
    // fresh call here, never a reuse — the provider must answer both before: and after: explicitly.
    // before: injection misses, access already clears, leaks misses. after: injection now clears (fixed);
    // access still clears (already passing, not a prediction outcome); leaks still misses (still).
    const provider = stubProvider({
      yes: (q) => (q.id === 'goal' ? 0.9 : q.id === 'after:1' ? 0.05 : q.id === 'before:2' || q.id === 'after:2' ? 0.05 : 0.9),
    });
    const r = await runReplay(
      'mak:\n  goal: verify the predicted fix\n  parent: MM3-0001\n  compare: {before: worktree, after: worktree}\n  expect: [injection, access, leaks]\n',
      { paths, provider, env },
    );
    expect(r.exit).toBe(0);
    expect(r.text).toContain('expected: {fixed: [injection], still: [leaks]}');
  });

  it('regressed populated when something got worse: the top-level gate fails even though every "after" category can grade fine on its own', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'anything\n' });
    const parent = sampleContractRun({
      where: ['src/a.ts'],
      ask: {
        categories: [
          {
            name: 'injection',
            section: 'concerns',
            pass: 'no',
            need: 'all',
            tags: [],
            questions: [
              { n: 1, kind: 'yesno', text: 'q1?' },
              { n: 2, kind: 'yesno', text: 'q2?' },
            ],
          },
        ],
        layers: [],
      },
      answers: { goal: { kind: 'yesno', p: 0.1 }, '1': { kind: 'yesno', p: 0.05 }, '2': { kind: 'yesno', p: 0.05 } },
      keys: { goal: 'k-goal', '1': 'k-1', '2': 'k-2' },
      categories: { injection: 'pass' },
      gate: 'pass',
    });
    appendContractRun(paths, parent, T, 'b'); // MM3-0001

    // Grading is driven entirely by question id here (not file content): question 2 regresses on "after".
    const provider = stubProvider({ yes: (q) => (q.id === 'after:2' ? 0.95 : 0.05) });
    const r = await runReplay('mak:\n  goal: verify no regressions\n  parent: MM3-0001\n  compare: {before: worktree, after: worktree}\n  expect: [injection]\n', {
      paths,
      provider,
      env,
    });

    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('regressed: [2]');
    expect(r.text).toContain('injection: {before: pass, after: fail}');
  });

  it('the top gate fails from a regression alone, even though the "after" category still passes on its own (need: any) [C-091]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'anything\n' });
    const parent = sampleContractRun({
      where: ['src/a.ts'],
      ask: {
        categories: [
          {
            name: 'injection',
            section: 'concerns',
            pass: 'no',
            need: 'any', // only one question needs to pass for the category itself to pass
            tags: [],
            questions: [
              { n: 1, kind: 'yesno', text: 'q1?' },
              { n: 2, kind: 'yesno', text: 'q2?' },
            ],
          },
        ],
        layers: [],
      },
      answers: { goal: { kind: 'yesno', p: 0.1 }, '1': { kind: 'yesno', p: 0.05 }, '2': { kind: 'yesno', p: 0.05 } },
      keys: { goal: 'k-goal', '1': 'k-1', '2': 'k-2' },
      categories: { injection: 'pass' },
      gate: 'pass',
    });
    appendContractRun(paths, parent, T, 'b'); // MM3-0001

    // goal passes; question 1 passes both before and after; only question 2 regresses. With need: any, the
    // "after" category grades pass on its own (question 1 alone clears it) and so would combine() alone — only
    // the regressed-length override (replay.ts) can be forcing gate: fail here, which is what this test pins.
    // The fake/stub provider pins these answers so the regression-only case is forced deterministically.
    const provider = stubProvider({ yes: (q) => (q.id === 'goal' ? 0.9 : q.id === 'after:2' ? 0.95 : 0.05) });
    const r = await runReplay('mak:\n  goal: verify no regressions\n  parent: MM3-0001\n  compare: {before: worktree, after: worktree}\n  expect: [injection]\n', {
      paths,
      provider,
      env,
    });

    expect(r.exit).toBe(0);
    expect(r.text).toContain('injection: {before: pass, after: pass}'); // the "after" category is clean on its own
    expect(r.text).toContain('regressed: [2]');
    expect(r.text).toContain('gate: fail'); // ...yet the top gate still fails, from the regression alone
    // outcomeNext's own "which category matches the overall gate?" search finds nothing here (injection itself
    // grades pass), so unpatched this fell through to GOAL_ONLY_NEXT ("the goal missed though every part
    // passed") even though the goal passed too — regressed: must be named instead, per C-065.
    expect(r.text).not.toContain('the goal missed though every part passed');
    expect(r.text).toContain('next: mm3 template drill --parent MM3-0002 --from injection');
  });

  it('two real git refs: fixed/still/regressed come from the actual file content across two commits, not the ref name or question id [C-064]', async (ctx) => {
    if (!hasGit()) return ctx.skip();
    const { paths, root } = tempProject({ 'src/a.ts': 'export function f(x) {\n  return db.query(`SELECT * FROM t WHERE id = ${x}`); // VULN STILL_BAD\n}\n' });
    gitInit(root);
    const beforeRef = gitCommit(root, 'vulnerable');

    const parent = sampleContractRun({
      where: ['src/a.ts'],
      ask: {
        categories: [
          {
            name: 'injection',
            section: 'concerns',
            pass: 'no',
            need: 'all',
            tags: [],
            questions: [
              { n: 1, kind: 'yesno', text: 'Does the file contain VULN?' },
              { n: 2, kind: 'yesno', text: 'Does the file contain STILL_BAD?' },
              { n: 3, kind: 'yesno', text: 'Does the file contain NEW_BUG?' },
            ],
          },
        ],
        layers: [],
      },
      answers: { goal: { kind: 'yesno', p: 0.1 }, '1': { kind: 'yesno', p: 0.9 }, '2': { kind: 'yesno', p: 0.9 }, '3': { kind: 'yesno', p: 0.05 } },
      keys: { goal: 'k-goal', '1': 'k-1', '2': 'k-2', '3': 'k-3' },
      categories: { injection: 'fail' },
      gate: 'fail',
    });
    appendContractRun(paths, parent, T, 'b'); // MM3-0001

    // A partial fix: VULN is gone (fixed), STILL_BAD remains (still), and the refactor introduces NEW_BUG (regressed).
    writeFileSync(path.join(root, 'src/a.ts'), 'export function f(x) {\n  return db.query("SELECT * FROM t WHERE id = ?", [x]); // STILL_BAD NEW_BUG\n}\n');
    const afterRef = gitCommit(root, 'partial fix, new bug');

    const r = await runReplay(`mak:\n  goal: verify the partial fix\n  parent: MM3-0001\n  compare: {before: ${beforeRef}, after: ${afterRef}}\n  expect: [injection]\n`, {
      paths,
      provider: markerProvider(),
      env,
    });

    expect(r.exit).toBe(0);
    expect(r.text).toContain('injection: {before: fail, after: fail, fixed: [1], still: [2], probes: 1/2 fixed}');
    expect(r.text).toContain('regressed: [3]');
    expect(r.text).toContain('gate: fail');
  });

  it('expect: none predicts no flips at all; a flip that happens anyway is listed as unexpected: [N4] [C-210] [C-213]', async (ctx) => {
    if (!hasGit()) return ctx.skip();
    const { paths, root } = tempProject({ 'src/a.ts': 'export function f(x) {\n  return db.query(`SELECT * FROM t WHERE id = ${x}`); // VULN\n}\n' });
    gitInit(root);
    const beforeRef = gitCommit(root, 'before');
    const parent = sampleContractRun({
      where: ['src/a.ts'],
      ask: {
        categories: [
          { name: 'injection', section: 'concerns', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'Does the file contain VULN?' }] },
        ],
        layers: [],
      },
      answers: { goal: { kind: 'yesno', p: 0.1 }, '1': { kind: 'yesno', p: 0.9 } },
      keys: { goal: 'k-goal', '1': 'k-1' },
      categories: { injection: 'fail' },
      gate: 'fail',
    });
    appendContractRun(paths, parent, T, 'b'); // MM3-0001

    // The fix is real (VULN is gone), but the agent didn't name injection in expect: — expect: none predicts no
    // flips at all, so this unpredicted fix surfaces as unexpected:, not silently folded into expected: fixed.
    writeFileSync(path.join(root, 'src/a.ts'), 'export function f(x) {\n  return db.query("SELECT * FROM t WHERE id = ?", [x]);\n}\n');
    const afterRef = gitCommit(root, 'fix');

    const r = await runReplay(`mak:\n  goal: verify nothing changed\n  parent: MM3-0001\n  compare: {before: ${beforeRef}, after: ${afterRef}}\n  expect: none\n`, {
      paths,
      provider: markerProvider(),
      env,
    });

    expect(r.exit).toBe(0);
    expect(r.text).toContain('injection: {before: fail, after: pass, fixed: [1], probes: 1/1 fixed}');
    expect(r.text).toContain('expected: {fixed: [], still: []}');
    expect(r.text).toContain('unexpected: [injection]');
    const [run] = readLedger(paths).filter((x) => isContractRun(x) && x.verb === 'replay');
    expect(run).toMatchObject({ expect: 'none', commit: afterRef, commits: { before: beforeRef, after: afterRef } });
  });

  // Round 2 smoke test root cause (archive/round-2/QUESTION-DETAIL.md #3, archive/round-2/REPORT.md friction
  // 3): `✖ mak.compare.before: "HEAD~1" not found by git` because the MM3 project root wasn't the git
  // repo that actually held the target file (a nested checkout one level down, e.g. stage/NodeGoat). C-147
  // and git.ts's gitRootOf() claim this is fixed; git-evidence.test.ts proves it at the readGitEvidence level.
  // This confirms it end to end through runReplay itself, on an MM3 root that is NOT a git repo at all —
  // the exact round-2 layout, not just readGitEvidence in isolation.
  it('proves a fix through a nested repo one level below a non-git MM3 root (round 2 regression) [C-147]', async (ctx) => {
    if (!hasGit()) return ctx.skip();
    const { paths, root } = tempProject({}); // the MM3 root itself is never a git repo here
    const nested = path.join(root, 'stage', 'NodeGoat');
    mkdirSync(path.join(nested, 'app'), { recursive: true });
    writeFileSync(path.join(nested, 'app', 'a.ts'), 'export function f(x) { return db.query(`SELECT * FROM t WHERE id = ${x}`); }\n');
    gitInit(nested);
    const beforeRef = gitCommit(nested, 'vulnerable');

    const classReqNested = `mak:\n  goal: check this code\n  depth: quick\n  where: [stage/NodeGoat/app/a.ts]\n${QUICK_ASK}`;
    await runClass(classReqNested, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001

    writeFileSync(path.join(nested, 'app', 'a.ts'), 'export function f(x) { return db.query("SELECT * FROM t WHERE id = ?", [x]); }\n');
    const afterRef = gitCommit(nested, 'fixed');

    const r = await runReplay(`mak:\n  goal: verify the fix\n  parent: MM3-0001\n  compare: {before: ${beforeRef}, after: ${afterRef}}\n  expect: [injection]\n`, {
      paths,
      provider: stubProvider({ yes: (q) => (q.id === 'goal' ? 0.9 : 0.05) }),
      env,
    });
    expect(r.exit).toBe(0);
    // "before" is answered for free, reused from MM3-0001's own class run against the identical vulnerable
    // content at beforeRef (proof that the nested repo was actually read, not just "not found by git" again);
    // "after" is a fresh, fresh-content call against the fixed commit.
    expect(r.text).toContain('reused: [MM3-0001]');
    expect(r.text).toContain('injection: {before: fail, after: pass, fixed: [1, 2, 3], probes: 3/3 fixed}');
    expect(r.text).toContain('unexpected: [access, leaks]');
    expect(r.text).toContain('gate: pass');
    expect(r.text).not.toContain('not found by git');
  });

  it('the "reading whole files" note appears once, even though both states are read', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'anything\n' });
    appendContractRun(paths, sampleContractRun({ where: ['src/a.ts'] }), T, 'b'); // MM3-0001
    const provider = stubProvider({ yes: () => 0.05 });
    const r = await runReplay('mak:\n  goal: check note dedupe\n  parent: MM3-0001\n  compare: {before: worktree, after: worktree}\n  expect: [injection]\n', { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text.match(/reading whole files/g)).toHaveLength(1);
  });

  it('two line-ranges on the same file in the parent are read (and charged) once, not twice', async () => {
    const a = 'x'.repeat(EVIDENCE_LIMITS.perFileChars); // exactly the per-file cap: no per-file truncation note on its own
    const b = 'y'.repeat(100);
    const { paths } = tempProject({ 'src/a.ts': a, 'src/b.ts': b });
    const parent = sampleContractRun({
      where: ['src/a.ts:1-10', 'src/a.ts:20-30', 'src/a.ts:40-50', 'src/b.ts'], // 3 ranges on a.ts, deduped to one file read
      ask: { categories: [{ name: 'injection', section: 'concerns', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'q1?' }] }], layers: [] },
      answers: { goal: { kind: 'yesno', p: 0.1 }, '1': { kind: 'yesno', p: 0.05 } },
      keys: { goal: 'k-goal', '1': 'k-1' },
      categories: { injection: 'pass' },
      gate: 'pass',
    });
    appendContractRun(paths, parent, T, 'b'); // MM3-0001
    const provider = stubProvider({ yes: () => 0.05 });
    const r = await runReplay('mak:\n  goal: check file dedupe\n  parent: MM3-0001\n  compare: {before: worktree, after: worktree}\n  expect: [injection]\n', { paths, provider, env });
    expect(r.exit).toBe(0);
    // Unduped, the 3 ranges on a.ts alone would spend the whole 60,000-char total budget, leaving nothing for b.ts.
    expect(r.text).not.toContain('evidence limit reached');
  });

  it('--dry-run: no provider call, questions = n*2+1 (Controller ruling) [C-088]', async (ctx) => {
    if (!hasGit()) return ctx.skip();
    const { paths, root } = tempProject({ 'src/api/user.ts': 'x\n' });
    gitInit(root);
    const rev = gitCommit(root, 'init'); // whatever git init's own default branch is named, HEAD/the sha always resolve
    appendContractRun(paths, sampleContractRun(), T, 'b'); // MM3-0001: 1 question
    const provider = stubProvider();
    const r = await runReplay(`mak:\n  goal: dry run check\n  parent: MM3-0001\n  compare: {before: ${rev}, after: HEAD}\n  expect: [injection]\n`, {
      paths,
      provider,
      env,
      dryRun: true,
    });
    expect(r.exit).toBe(0);
    expect(r.text).toBe('plan:\n  calls: 2\n  questions: 3\n  reused: 0\n  route: fake\nnotes: ["dry run: no call, no spend"]\n');
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths).filter((x) => isContractRun(x) && x.verb === 'replay')).toEqual([]);
  });

  // Fix #13/#5: --dry-run used to return before ever reading a ref, so a typo'd or nonexistent ref looked
  // fine until the real (paid) run. It now checks the same way class/scan/drill/loop already do: evidence
  // (here, both git refs) is read before the dry-run branch, not after. [C-148]
  it('--dry-run stops on a ref that does not exist, same as a real run would', async (ctx) => {
    if (!hasGit()) return ctx.skip();
    const { paths, root } = tempProject({ 'src/api/user.ts': 'x\n' });
    gitInit(root);
    gitCommit(root, 'init');
    appendContractRun(paths, sampleContractRun(), T, 'b'); // MM3-0001
    const provider = stubProvider();
    const r = await runReplay('mak:\n  goal: dry run check\n  parent: MM3-0001\n  compare: {before: not-a-real-ref-xyz, after: HEAD}\n  expect: [injection]\n', {
      paths,
      provider,
      env,
      dryRun: true,
    });
    expect(r.exit).toBe(2);
    expect(r.text).toContain('not found by git');
    expect(provider.calls).toHaveLength(0);
  });

  // Fix #5/#6 follow-through: same pattern as class.ts/scan.ts.
  const classReq = `mak:\n  goal: check this code\n  depth: quick\n  where: [src/a.ts]\n${QUICK_ASK}`;
  const changeReq = 'mak:\n  goal: verify the fix\n  parent: MM3-0001\n  compare: {before: worktree, after: worktree}\n  expect: [injection]\n';

  it('a fully-reused replay is never blocked by an already-reached cap, and names the runs it reused [C-152]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`x ${x}`); }\n' });
    await runClass(classReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001, 1 run
    await runReplay(changeReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0002, 1 run
    writeConfigOverride(paths, { budget: { runs: 2 } }); // exactly used up by the two runs above
    const r = await runReplay(changeReq, { paths, provider: stubProvider(), env }); // fully reused: no call needed
    expect(r.exit).toBe(0);
    expect(r.text).toContain('reused: [');
  });

  it('notes when the cost was estimated from tokens (fix #4), same as class.ts', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`x ${x}`); }\n' });
    await runClass(classReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env });
    const r = await runReplay(changeReq, { paths, provider: withEstimatedCost(stubProvider({ yes: () => 0.9 })), env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('cost estimated from tokens (no live pricing reported)');
  });

  it('on gate: pass (goal and every category clear, nothing regressed), next: records the outcome held on the parent [C-065]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'anything\n' });
    const parent = sampleContractRun({
      where: ['src/a.ts'],
      ask: { categories: [{ name: 'injection', section: 'concerns', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'q1?' }] }], layers: [] },
      answers: { goal: { kind: 'yesno', p: 0.1 }, '1': { kind: 'yesno', p: 0.05 } },
      keys: { goal: 'k-goal', '1': 'k-1' },
      categories: { injection: 'pass' },
      gate: 'pass',
    });
    appendContractRun(paths, parent, T, 'b'); // MM3-0001
    // goal clears the bar (0.9 ≥ 0.70); the "no" category clears it too (1 - 0.05 = 0.95), before and after alike.
    const provider = stubProvider({ yes: (q) => (q.id === 'goal' ? 0.9 : 0.05) });
    const r = await runReplay('mak:\n  goal: verify the fix holds\n  parent: MM3-0001\n  compare: {before: worktree, after: worktree}\n  expect: [injection]\n', { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: pass');
    expect(r.text).toContain('regressed: []');
    expect(r.text).toContain('next: mm3 outcome MM3-0001 held --by <you>');
  });

  it('a rehearsal adapter (fake) labels its notes "not evidence" (BRIEF §5) [C-092]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'anything\n' });
    const parent = sampleContractRun({
      where: ['src/a.ts'],
      ask: { categories: [{ name: 'injection', section: 'concerns', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'q1?' }] }], layers: [] },
      answers: { goal: { kind: 'yesno', p: 0.1 }, '1': { kind: 'yesno', p: 0.05 } },
      keys: { goal: 'k-goal', '1': 'k-1' },
      categories: { injection: 'pass' },
      gate: 'pass',
    });
    appendContractRun(paths, parent, T, 'b'); // MM3-0001
    const provider = stubProvider({ yes: (q) => (q.id === 'goal' ? 0.9 : 0.05), adapter: 'fake' });
    const r = await runReplay('mak:\n  goal: verify the fix holds\n  parent: MM3-0001\n  compare: {before: worktree, after: worktree}\n  expect: [injection]\n', { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('adapter fake · not evidence');
  });

  // budget.json is no longer the source of truth — a brand-new project with neither budget.json nor
  // config.yaml runs on silent defaults; the "created" note now fires once, when a legacy budget.json migrates.
  it('a legacy budget.json is migrated into config.yaml, and the first run says so (BRIEF §5) [C-093]', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'anything\n' });
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.budget, JSON.stringify({ capUsd: 5, capRuns: 500, spentUsd: 0, runs: 0, resetAt: '2020-01-01T00:00:00Z' }));
    const parent = sampleContractRun({
      where: ['src/a.ts'],
      ask: { categories: [{ name: 'injection', section: 'concerns', pass: 'no', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'q1?' }] }], layers: [] },
      answers: { goal: { kind: 'yesno', p: 0.1 }, '1': { kind: 'yesno', p: 0.05 } },
      keys: { goal: 'k-goal', '1': 'k-1' },
      categories: { injection: 'pass' },
      gate: 'pass',
    });
    appendContractRun(paths, parent, T, 'b'); // MM3-0001, seeded directly — no preflight call, so budget.json doesn't exist yet
    const provider = stubProvider({ yes: (q) => (q.id === 'goal' ? 0.9 : 0.05) });
    const r = await runReplay('mak:\n  goal: verify the fix holds\n  parent: MM3-0001\n  compare: {before: worktree, after: worktree}\n  expect: [injection]\n', { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('budget file created with defaults ($5.00 · 500 runs)');
  });
});

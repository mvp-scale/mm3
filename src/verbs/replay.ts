/**
 * replay: "did the fix work?" Replays a parent run's own questions on two states (before/after a ref, or the
 * worktree). A one-subject parent (class, replay, or drill's one-subject form): two calls at most (one per
 * state), reusing per question exactly like class.ts; goal is asked once, on the "after" state only. Grading
 * pairs before/after per category (fixed/still) and across all of them (regressed), which alone can fail the
 * gate even when every "after" category passes. A sweep parent (scan, loop, or drill's sweep form
 * C2): re-runs the parent's own sweep.ts engine TWICE, once per ref, over a ref-aware code resolver
 * (evidence/units.ts's createCodeResolverAt) instead of the working tree — unchanged units reuse for free
 * (planSweep's own reuse lookup keys on unit text, identical at both refs for anything that didn't change, so
 * it can reuse straight from the parent's own original run too); fixed/still/regressed/expected are graded the
 * same way, per item instead of per category. A drill's own sweep CONTINUATION (over: starting with "each",
 * anchored on a root item this run can't reconstruct) is refused — replay can't rebuild the root, only the
 * top-level, self-contained over: a scan or loop stores.
 */
import { providerIdentity } from '../classifier/select.ts';
import { configOf } from '../config/load.ts';
import { combine, gradeItems, gradeSubject, goalGate, sweepGate, worstFirst, type CategoryGrade, type ItemGrade, type Mark } from '../contract/grade.ts';
import { firstStringLayer } from '../contract/layers.ts';
import { answerKey, goalQuestion, subjectEvidence, subjectQuestions, type AskedQuestion } from '../contract/translate.ts';
import type { Answer, Category, Gate, Request } from '../contract/types.ts';
import { effectiveMdlFields } from '../contract/mdl-fields.ts';
import { isGitOption, readGitEvidence, resolveRefSha, WHOLE_FILE_NOTE } from '../evidence/git.ts';
import { createCodeResolver, createCodeResolverAt } from '../evidence/units.ts';
import { findRun, isContractRun, type ContractRun, type NewContractRun, type TelemetryEntry } from '../ledger/log.ts';
import { redact } from '../ledger/redact.ts';
import { cacheTelemetry, lookupAnswers, reusedAgeNotes, type Reusable } from '../ledger/reuse.ts';
import { m, type Value } from '../contract/emit.ts';
import type { Mm3Config } from '../config/defaults.ts';
import { actorOf, askAll, createdNote, preflight, record, recordFree, splitReuse, type PlannedCall } from './pay.ts';
import { contractLimits, loadRequest, stopText } from './request.ts';
import { commonNotes, COST_ESTIMATED_NOTE, drillNext, dryRunText, outcomeNext, regressionNext, respondText, reusedIds, sweepNext, mdlRecorded } from './respond.ts';
import { itemRecords, planNeedsBudget, plannedCallCount, planSweep, recordSweep, runSweep } from './sweep.ts';
import type { VerbContext, VerbResult } from './types.ts';

/** Every unreused question goes in one call; the reused ones are answered (and credited) for free. null when nothing to ask. */
function planCall(
  keyed: readonly (readonly [AskedQuestion, string])[],
  reused: ReadonlyMap<string, Reusable>,
  state: Record<string, unknown>,
  answers: Record<string, Answer>,
  reusedFrom: Record<string, string>,
): PlannedCall | null {
  const toAsk = splitReuse(keyed, reused, answers, reusedFrom).map(([q]) => q);
  return toAsk.length ? { state, questions: toAsk } : null;
}

export interface ReplayCategoryGrade {
  name: string;
  before: Gate;
  after: Gate;
  /** Question numbers that missed/mid before and pass now. */
  fixed: number[];
  /** Question numbers that missed/mid before and still don't pass. */
  still: number[];
}

export interface ReplayGrade {
  categories: ReplayCategoryGrade[];
  goal: { gate: Gate; p: number };
  /** Passing before, not any more — sorted ascending. Non-empty alone fails the gate. */
  regressed: number[];
  gate: Gate;
}

/** The before/after grade a replay run reports and stores: read straight from a replay run's own `ask.categories`
 *  and `answers` (keyed `before:<n>`/`after:<n>`/`goal` by `contract/translate.ts`'s `subjectQuestions`) — no new
 *  ledger write, and reusable read-side by anything (e.g. `report.ts`) that needs the run's own regression call
 *  instead of a stale comparison against another run. */
export function gradeReplay(categories: readonly Category[], answers: Record<string, Answer>): ReplayGrade {
  const beforeGrade = gradeSubject(categories, answers, 'before:');
  const afterCatsGrade = gradeSubject(categories, answers, 'after:');
  const g = answers['goal'] as { kind: 'yesno'; p: number };
  const goal = { gate: goalGate(g.p), p: g.p };

  const beforeMarks = new Map<number, Mark>();
  for (const c of beforeGrade.categories) for (const [n, mk] of c.marks) beforeMarks.set(n, mk);
  const afterMarks = new Map<number, Mark>();
  for (const c of afterCatsGrade.categories) for (const [n, mk] of c.marks) afterMarks.set(n, mk);

  const categoryGrades: ReplayCategoryGrade[] = categories.map((c, i) => {
    const beforeCat = beforeGrade.categories[i]!;
    const afterCat = afterCatsGrade.categories[i]!;
    const fixed = [...beforeCat.marks].filter(([n, mk]) => mk !== 'pass' && afterCat.marks.get(n) === 'pass').map(([n]) => n);
    const still = [...beforeCat.marks].filter(([n, mk]) => mk !== 'pass' && afterCat.marks.get(n) !== 'pass').map(([n]) => n);
    return { name: c.name, before: beforeCat.gate, after: afterCat.gate, fixed, still };
  });

  const regressed = categories
    .flatMap((c) => c.questions)
    .map((q) => q.n)
    .filter((n) => beforeMarks.get(n) === 'pass' && afterMarks.get(n) !== 'pass')
    .sort((a, b) => a - b);

  const gate = regressed.length > 0 ? 'fail' : combine([goal.gate, ...afterCatsGrade.categories.map((c) => c.gate)]);

  return { categories: categoryGrades, goal, regressed, gate };
}

export async function runReplay(text: string, ctx: VerbContext): Promise<VerbResult> {
  // a project's own .mm3/config.yaml mdl: overrides apply to every mdl: block it validates.
  const cfg = configOf(ctx).config;
  const mdlFields = effectiveMdlFields(cfg.mdl);
  const loaded = loadRequest(text, 'replay', mdlFields, contractLimits(cfg, 'replay'));
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;

  const parent = findRun(ctx.paths, request.mak.parent!);
  // Each of these three ran as a bare string, missing the "→ see: mm3 agent replay" pointer every other
  // stop carries (stopText's own job) — round 2/3 smoke testing hit all three with no pointer to follow
  // (round3-findings.md, STOPS.md #1). Routed through stopText so they match every other verb's stop shape.
  if (!parent) return { exit: 2, text: stopText([`✖ mak.parent: ${request.mak.parent} is not in the ledger → check the id`], 'replay') };
  if (!isContractRun(parent)) return { exit: 2, text: stopText([`✖ mak.parent: ${parent.id} predates the YAML contract → run class again on this code`], 'replay') };
  // a sweep parent (scan, loop, or drill's sweep form) is replayed by re-running its own sweep at
  // both refs, not refused — see runSweepReplay's own header comment.
  if (parent.items !== null) return runSweepReplay(ctx, request, loaded, parent, cfg);

  const categories = parent.ask.categories;
  // expect: names which of the parent's concerns this replay should turn to pass, or the literal
  // "none" to predict no flips at all — every named entry must be a real concern of the parent;
  // decisions categories don't count (they're never "fixed").
  const concernNames = categories.filter((c) => c.section === 'concerns').map((c) => c.name);
  const expect = request.mak.expect!;
  const expectList = expect === 'none' ? [] : expect;
  const badExpect = expectList.find((name) => !concernNames.includes(name));
  if (badExpect !== undefined) {
    return { exit: 2, text: stopText([`✖ mak.expect: "${badExpect}" is not a concern of ${parent.id} → use one of ${concernNames.join(', ')}`], 'replay') };
  }
  // Two ranges on one file (parent.where can hold both) must read and charge it once, not once per range.
  const paths = [...new Set(parent.where.map((w) => w.split(':')[0]!))];

  const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });

  // Evidence (both refs) is read before the dry-run branch, same as class/scan/drill/loop, so a dry run still
  // catches a missing ref instead of skipping the check.
  const compare = request.mak.compare!;
  const before = readGitEvidence(ctx.paths.root, compare.before, 'before', paths, { limits: { perFileChars: cfg.evidence.perItemChars, totalChars: cfg.evidence.totalChars } });
  const after = readGitEvidence(ctx.paths.root, compare.after, 'after', paths, { limits: { perFileChars: cfg.evidence.perItemChars, totalChars: cfg.evidence.totalChars } });
  if (!before.ok || !after.ok) {
    const errors = [...(before.ok ? [] : before.errors), ...(after.ok ? [] : after.errors)];
    return { exit: 2, text: stopText(errors, 'replay') };
  }

  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const beforeEvidenceStr = subjectEvidence(before.files);
  const afterEvidenceStr = subjectEvidence(after.files);
  const beforeQuestions = subjectQuestions(categories, 'before:');
  const afterQuestions = [goalQuestion(request.mak.goal), ...subjectQuestions(categories, 'after:')];
  const beforeKeyed = beforeQuestions.map((q) => [q, answerKey(beforeEvidenceStr, q)] as const);
  const afterKeyed = afterQuestions.map((q) => [q, answerKey(afterEvidenceStr, q)] as const);
  // Reuse is resolved before preflight/dry-run, same as class.ts: a fully-reused replay's free run is never
  // blocked by an already-reached budget cap, and a dry run can predict how much reuses.
  const beforeReused = lookupAnswers(ctx.paths, who, beforeKeyed.map(([, k]) => k), { readOnly: ctx.dryRun ?? false, reuse: cfg.reuse });
  const afterReused = lookupAnswers(ctx.paths, who, afterKeyed.map(([, k]) => k), { readOnly: ctx.dryRun ?? false, reuse: cfg.reuse });

  const answers: Record<string, Answer> = {};
  const reusedFrom: Record<string, string> = {};
  const beforeCall = planCall(beforeKeyed, beforeReused, { code: before.files }, answers, reusedFrom);
  const afterCall = planCall(afterKeyed, afterReused, { goal: redact(request.mak.goal), code: after.files }, answers, reusedFrom);
  const calls: PlannedCall[] = [...(beforeCall ? [beforeCall] : []), ...(afterCall ? [afterCall] : [])];

  if (ctx.dryRun) {
    const total = beforeKeyed.length + afterKeyed.length;
    const askedQuestions = calls.reduce((n, c) => n + c.questions.length, 0);
    return { exit: 0, text: dryRunText({ calls: calls.length, questions: askedQuestions, reused: total - askedQuestions, route: identity.route, baseURL: identity.baseURL }) };
  }

  const pre = preflight(ctx, { needsBudget: calls.length > 0 });
  if (!pre.ok) return pre.result;

  let costUsd: number | undefined = 0;
  let costEstimated = false;
  let telemetry: TelemetryEntry[] = [];
  if (calls.length > 0) {
    const asked = await askAll(ctx, 'replay', calls);
    if (!asked.ok) return asked.result;
    Object.assign(answers, asked.value.answers);
    costUsd = asked.value.costUsd;
    costEstimated = asked.value.costEstimated;
    telemetry = asked.value.telemetry;
  }

  const keys: Record<string, string> = {};
  for (const [q, k] of [...beforeKeyed, ...afterKeyed]) keys[q.id] = k;

  const replayGrade = gradeReplay(categories, answers);
  const { goal, regressed, gate } = replayGrade;
  const afterCatsGrade = gradeSubject(categories, answers, 'after:');

  // B3: each category line names how many of its own probes fixed (question numbers that missed/were mid
  // before and clear now) out of the count of questions that were NOT passing before (fixed.length +
  // still.length) — e.g. `probes: 2/3 fixed`. A category every one of whose questions already passed before
  // has nothing to probe, so the field is omitted entirely rather than printed as `probes: 0/N fixed`.
  const catEntries: Array<[string, Value]> = replayGrade.categories.map((c) => {
    const probeCount = c.fixed.length + c.still.length;
    return [
      c.name,
      m(
        ['before', c.before],
        ['after', c.after],
        ...(c.fixed.length ? [['fixed', c.fixed] as [string, Value]] : []),
        ...(c.still.length ? [['still', c.still] as [string, Value]] : []),
        ...(probeCount > 0 ? [['probes', `${c.fixed.length}/${probeCount} fixed`] as [string, Value]] : []),
      ),
    ];
  });

  // The agent's own prediction, graded against what actually happened: a concern named in expect: is "fixed"
  // when it missed/was mid before and clears now, "still" when it missed/was mid before and still doesn't
  // clear. A concern that already passed before predicts nothing meaningful either way, so it's left out of
  // both lists ("grading the prediction against the expected concerns"). N4: expect: none predicts no
  // flips at all — either way, any CONCERN category that flips (before != after) without being named in expect
  // (an empty list, for "none") is reported separately as unexpected:, replacing the old forced workaround of
  // having to name every affected concern up front.
  const gradeByName = new Map(replayGrade.categories.map((c) => [c.name, c]));
  const expectedFixed: string[] = [];
  const expectedStill: string[] = [];
  for (const name of expectList) {
    const g = gradeByName.get(name);
    if (!g || g.before === 'pass') continue;
    (g.after === 'pass' ? expectedFixed : expectedStill).push(name);
  }
  const expectSet = new Set(expectList);
  const unexpected = concernNames.filter((name) => {
    const g = gradeByName.get(name);
    return g !== undefined && g.before !== g.after && !expectSet.has(name);
  });

  // Both states can add WHOLE_FILE_NOTE (once per call, per git.ts); shown once here, since it's one fact about the run.
  let sawWholeFileNote = false;
  const evidenceNotes = [...before.notes, ...after.notes].filter((n) => {
    if (n !== WHOLE_FILE_NOTE) return true;
    if (sawWholeFileNote) return false;
    sawWholeFileNote = true;
    return true;
  });

  // Which prior runs this run's answers came from, when any were reused.
  const reusedRunIds = reusedIds(reusedFrom);
  const reusedAges = reusedAgeNotes(ctx.paths, reusedRunIds);
  telemetry = [...telemetry, ...cacheTelemetry(ctx.paths, reusedFrom)];
  const response = (id: string, budget: string): string =>
    respondText(
      m(
        ['id', id],
        ['gate', gate],
        ['goal', m(['gate', goal.gate], ['p', goal.p])],
        ...catEntries,
        ['expected', m(['fixed', expectedFixed], ['still', expectedStill])],
        ...(unexpected.length ? [['unexpected', unexpected] as [string, Value]] : []),
        ['regressed', regressed],
        ...(reusedRunIds.length ? [['reused', reusedRunIds] as [string, Value]] : []),
      ),
      mdlRecorded(request.mdl, ['parent']),
      // A regression alone can fail the gate even when every "after" category passes on its own (C-064) —
      // outcomeNext's gate-matching search would then find nothing and wrongly blame the goal (GOAL_ONLY_NEXT).
      // regressed takes priority: name it, per C-065 (revert or drill into it). [C-091]
      regressed.length
        ? regressionNext(id, regressed, categories)
        : outcomeNext(id, gate, afterCatsGrade.categories, categories, `mm3 outcome ${request.mak.parent} held --by <you>`),
      commonNotes(
        [...loaded.notes, ...evidenceNotes, ...reusedAges, ...(pre.value.created ? [createdNote(pre.value.state)] : []), ...(costEstimated ? [COST_ESTIMATED_NOTE] : [])],
        `2 states · ${budget}`,
        ctx.provider.adapter,
        ctx.paths,
        ctx.notes,
      ),
    );

  // commit is the AFTER ref's own resolved sha (in the repo that actually contains the parent's
  // where files), plus commits: {before, after} for both refs resolved the same way — replacing the old
  // "always null" (replay has no single worktree-HEAD commit the way class/scan/drill/loop do, but its two
  // compared refs each resolve to a real sha).
  const beforeSha = resolveRefSha(ctx.paths.root, compare.before, parent.where);
  const afterSha = resolveRefSha(ctx.paths.root, compare.after, parent.where);

  const run: NewContractRun = {
    verb: 'replay',
    actor: actorOf(ctx),
    task: ctx.env.MM3_TASK?.trim() || null,
    goal: request.mak.goal,
    depth: null,
    where: parent.where,
    parent: request.mak.parent!,
    from: null,
    compare,
    expect,
    mdl: request.mdl,
    ask: { categories, layers: [] },
    over: null,
    items: null,
    answers,
    keys,
    reusedFrom,
    categories: Object.fromEntries(afterCatsGrade.categories.map((c) => [c.name, c.gate])),
    gate,
    goalGate: goal.gate,
    goalP: goal.p,
    consensus: null,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls: calls.length,
    route: identity.route,
    baseURL: identity.baseURL,
    commit: afterSha,
    commits: { before: beforeSha, after: afterSha },
    telemetry,
  };

  const rec = calls.length === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}

/** One item's own before/after gate (its OWN categories only, same as ItemGrade.ownGate — never its children's:
 *  a sweep parent's items nest file -> function -> call, and rolling children up here would double-count a
 *  change already reported by the child's own entry), fixed/still (question numbers that missed/were mid
 *  before and clear now, or still don't) and regressed (passing before, not after now) — the sweep-shaped twin
 *  of gradeReplay's own per-category computation above, keyed by item id instead of category name ("the same fixed/still/regressed/expected output per item"). undefined when the item was graded (asked or
 *  reused) at NEITHER state — skipped past the depth cap, or its layer has no categories, at both refs, same as
 *  a sweep's own `failing:`/`passing:` counts already only cover graded items. */
export interface SweepReplayItemGrade {
  before: Gate;
  after: Gate;
  fixed: number[];
  still: number[];
  /** This item's own question numbers only — the caller prefixes each with the item's id ("<id>#<n>") to build
   *  the run-wide, unambiguous `regressed:` list (several items can share the same question numbers). */
  regressed: number[];
}

function itemMarks(ig: ItemGrade | undefined): Map<number, Mark> | undefined {
  if (!ig || (ig.status !== 'asked' && ig.status !== 'reused')) return undefined;
  const marks = new Map<number, Mark>();
  for (const c of ig.own) for (const [n, mk] of c.marks) marks.set(n, mk);
  return marks;
}

function sweepReplayItemGrade(beforeIg: ItemGrade | undefined, afterIg: ItemGrade | undefined): SweepReplayItemGrade | undefined {
  const beforeMarks = itemMarks(beforeIg);
  const afterMarks = itemMarks(afterIg);
  if (!beforeMarks && !afterMarks) return undefined;
  const nums = new Set([...(beforeMarks?.keys() ?? []), ...(afterMarks?.keys() ?? [])]);
  const fixed: number[] = [];
  const still: number[] = [];
  const regressed: number[] = [];
  for (const n of [...nums].sort((a, b) => a - b)) {
    const b = beforeMarks?.get(n);
    const a = afterMarks?.get(n);
    if (b !== undefined && b !== 'pass' && a === 'pass') fixed.push(n);
    else if (b !== undefined && b !== 'pass' && a !== undefined && a !== 'pass') still.push(n);
    if (b === 'pass' && a !== undefined && a !== 'pass') regressed.push(n);
  }
  return { before: beforeMarks ? beforeIg!.ownGate : 'unsure', after: afterMarks ? afterIg!.ownGate : 'unsure', fixed, still, regressed };
}

/** A sweep parent's before/after grade, per item — `itemIds` fixes the display order (the
 *  "after" state's own item order, then any item that only ever existed "before", e.g. a file deleted between
 *  the two refs). Pure: reads two already-graded `gradeItems()` maps, same "reuse gradeReplay's own logic, just
 *  keyed differently" shape as this file's other grading function, gradeReplay. */
export function gradeSweepReplay(
  itemIds: readonly string[],
  beforeGrades: ReadonlyMap<string, ItemGrade>,
  afterGrades: ReadonlyMap<string, ItemGrade>,
): Map<string, SweepReplayItemGrade> {
  const out = new Map<string, SweepReplayItemGrade>();
  for (const id of itemIds) {
    const g = sweepReplayItemGrade(beforeGrades.get(id), afterGrades.get(id));
    if (g) out.set(id, g);
  }
  return out;
}

/** The `where` a sweep-parent replay records (same convention scan.ts/drill.ts each apply to their own sweep,
 *  duplicated here rather than shared — neither of those files is this crew's to import from): every item's own
 *  code path touched by EITHER state, unique, sorted, capped at 50. */
const WHERE_CAP = 50;
function whereFromItems(items: readonly { unit?: { path: string } }[]): string[] {
  return [...new Set(items.flatMap((i) => (i.unit ? [i.unit.path] : [])))].sort().slice(0, WHERE_CAP);
}

/** A ref-aware Resolver for a sweep-parent replay's file layer: the working tree for `ref === 'worktree'`
 *  (createCodeResolver, exactly what scan/drill already use), otherwise the ref-aware mirror
 *  (createCodeResolverAt) — `wherePaths` is the parent's own item paths, so a nested repo resolves the same way
 *  C-147 already resolves one for one-subject replay. */
function sweepResolverAt(root: string, ref: string, notes: string[], wherePaths: readonly string[], maxFiles: number) {
  return ref === 'worktree' ? createCodeResolver(root, notes, maxFiles) : createCodeResolverAt(root, ref, notes, wherePaths, maxFiles);
}

/**
 * replays a SWEEP parent's own questions (scan, loop, or drill's sweep form) at two refs, instead of
 * refusing it. Same engine as scan/drill (sweep.ts's planSweep/runSweep), run twice — once per ref, over a
 * ref-aware resolver (units.ts's createCodeResolverAt) instead of the working tree — with the SAME categories/
 * layers the parent asked (`parent.ask.layers`) and the SAME `over:` it swept (`parent.over`). An unchanged
 * unit's text is identical at both refs (and identical to the parent's own original run), so planSweep's own
 * answerKey-based reuse lookup answers it for free from the ledger — often straight from the parent run itself,
 * never just between this replay's own two calls.
 *
 * Judgement calls (documented, not obvious from the plan text alone):
 *  - A drill's own sweep CONTINUATION (`over:` whose first chain layer is the literal string "each", anchored on
 *    a root item stored only in the grandparent run) is refused outright: replaying it would need to
 *    reconstruct that root, which this run has no way to do. Only a self-contained `over:` (a scan's own file
 *    pattern, or loop's own idea lists) is replayed.
 *  - Every question id this run stores is prefixed `before:`/`after:` same as one-subject replay, but item-
 *    qualified (`before:<item id>#<n>`, `before:goal`) — a sweep's own item ids repeat the same question numbers
 *    per item, so a bare `before:<n>` (one-subject's own scheme) would collide across items.
 *  - `expect:`/`unexpected:` are graded in AGGREGATE across every item, per concern name (the parent's layers
 *    can repeat the same category at file/function/call depth): a concern counts as `fixed` only when EVERY one
 *    of its own not-passing-before occurrences is passing after (a partial fix anywhere still reads as `still`);
 *    `unexpected` fires when ANY occurrence of an unnamed concern flips at all.
 *  - The response's `items:` map lists every item whose own before/after wasn't a clean pass/pass (an unchanged,
 *    already-passing item says nothing new) — the sweep-shaped equivalent of one-subject's "always show every
 *    category" (a sweep can hold far more items than a one-subject run has categories, so "nothing changed,
 *    nothing to say" is worth leaving out).
 *  - `next:` reuses sweepNext (drill the worst AFTER item) with regressionNext's own priority rule: a non-empty
 *    `regressed` always wins, pointing at the first regressed item, even when the sweep gate would otherwise
 *    read pass on its own categories.
 */
async function runSweepReplay(ctx: VerbContext, request: Request, loaded: { notes: string[] }, parent: ContractRun, cfg: Mm3Config): Promise<VerbResult> {
  const layers = parent.ask.layers;
  const over = parent.over ?? {};

  // A drill sweep continuation's over: (e.g. {function: each}) is anchored on a root item (the file) that only
  // the grandparent run stored — nothing here can rebuild it. Only a self-contained over: (scan's own file
  // pattern, or loop's own idea lists — never starting with the literal "each") is replayed.
  const chain0 = Object.keys(over)[0];
  if (chain0 !== undefined && over[chain0] === 'each') {
    return {
      exit: 2,
      text: stopText([`✖ mak.parent: ${parent.id} is a drill continuation (over: starts with "each") → replay can't rebuild its root item; run the sweep again instead`], 'replay'),
    };
  }

  const concernNames = [...new Set(layers.flatMap((l) => l.categories.filter((c) => c.section === 'concerns').map((c) => c.name)))];
  const expect = request.mak.expect!;
  const expectList = expect === 'none' ? [] : expect;
  const badExpect = expectList.find((name) => !concernNames.includes(name));
  if (badExpect !== undefined) {
    return { exit: 2, text: stopText([`✖ mak.expect: "${badExpect}" is not a concern of ${parent.id} → use one of ${concernNames.join(', ')}`], 'replay') };
  }

  const itemPaths = [...new Set(Object.values(parent.items ?? {}).flatMap((it) => (it.unit ? [it.unit.path] : [])))];
  const compare = request.mak.compare!;
  const needsCode = firstStringLayer(over) !== null;

  // Evidence (both refs) is checked before the dry-run branch, same as the one-subject path above (C-148): a
  // typo'd or nonexistent ref stops a dry run too, not just a real one. An idea sweep (loop: no string layer at
  // all) reads no code, so there is nothing to check a ref against.
  if (needsCode) {
    const checkRef = (ref: string, field: 'before' | 'after'): string | undefined => {
      if (ref === 'worktree') return undefined;
      if (isGitOption(ref)) return `✖ mak.compare.${field}: "${ref}" looks like an option, not a ref → use a branch, tag or commit`;
      return resolveRefSha(ctx.paths.root, ref, itemPaths) === null
        ? `✖ mak.compare.${field}: "${ref}" not found by git (or the project isn't a repo there) → check the ref`
        : undefined;
    };
    const errors = [checkRef(compare.before, 'before'), checkRef(compare.after, 'after')].filter((e): e is string => e !== undefined);
    if (errors.length) return { exit: 2, text: stopText(errors, 'replay') };
  }

  const sweepRequest: Request = { mak: { goal: request.mak.goal, where: [], categories: [], layers, over }, mdl: request.mdl };
  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
  const beforeNotes: string[] = [];
  const afterNotes: string[] = [];
  const limits = { sweep: cfg.sweep, reuse: cfg.reuse, evidence: cfg.evidence };
  const beforeOpts = needsCode ? { resolve: sweepResolverAt(ctx.paths.root, compare.before, beforeNotes, itemPaths, cfg.evidence.maxFiles) } : {};
  const afterOpts = needsCode ? { resolve: sweepResolverAt(ctx.paths.root, compare.after, afterNotes, itemPaths, cfg.evidence.maxFiles) } : {};
  const beforePlan = planSweep(sweepRequest, who, ctx.paths, ctx.dryRun ?? false, beforeOpts, limits);
  const afterPlan = planSweep(sweepRequest, who, ctx.paths, ctx.dryRun ?? false, afterOpts, limits);

  if (ctx.dryRun) {
    const reusedOf = (plan: typeof beforePlan): number => plan.items.length - plan.planned.reduce((n, p) => n + p.itemIds.length + p.skipped.length, 0);
    return {
      exit: 0,
      text: dryRunText(
        {
          calls: plannedCallCount(beforePlan) + plannedCallCount(afterPlan),
          questions: beforePlan.askedQuestions + afterPlan.askedQuestions,
          items: beforePlan.items.length + afterPlan.items.length,
          reused: reusedOf(beforePlan) + reusedOf(afterPlan),
          route: identity.route,
          baseURL: identity.baseURL,
        },
        [...beforePlan.splitNotes, ...afterPlan.splitNotes],
      ),
    };
  }

  // A fully-reused sweep-parent replay must never be blocked by an already-reached cap.
  const pre = preflight(ctx, { needsBudget: planNeedsBudget(beforePlan) || planNeedsBudget(afterPlan) });
  if (!pre.ok) return pre.result;

  const beforeSwept = await runSweep(ctx, 'replay', beforePlan);
  if (!beforeSwept.ok) return beforeSwept.result;
  const afterSwept = await runSweep(ctx, 'replay', afterPlan);
  if (!afterSwept.ok) return afterSwept.result;

  const combineCost = (a: number | undefined, b: number | undefined): number | undefined => (a === undefined || b === undefined ? undefined : a + b);
  const costUsd = combineCost(beforeSwept.value.costUsd, afterSwept.value.costUsd);
  const costEstimated = beforeSwept.value.costEstimated || afterSwept.value.costEstimated;
  const calls = plannedCallCount(beforePlan) + plannedCallCount(afterPlan);
  const askedQuestions = beforePlan.askedQuestions + afterPlan.askedQuestions;

  const categoriesOf = (layer: string): readonly Category[] => layers.find((l) => l.name === layer)?.categories ?? [];
  const beforeGrades = gradeItems(beforePlan.items, categoriesOf, beforeSwept.value.statusOf, beforeSwept.value.answers);
  const afterGrades = gradeItems(afterPlan.items, categoriesOf, afterSwept.value.statusOf, afterSwept.value.answers);

  const itemIds: string[] = [];
  const seenIds = new Set<string>();
  for (const it of [...afterPlan.items, ...beforePlan.items]) {
    if (seenIds.has(it.id)) continue;
    seenIds.add(it.id);
    itemIds.push(it.id);
  }

  const itemGrades = gradeSweepReplay(itemIds, beforeGrades, afterGrades);
  const regressedFlat: string[] = [];
  for (const [id, g] of itemGrades) for (const n of g.regressed) regressedFlat.push(`${id}#${n}`);

  const categoryAt = (grades: ReadonlyMap<string, ItemGrade>, id: string, name: string): CategoryGrade | undefined =>
    grades.get(id)?.own.find((c) => c.name === name);
  const expectedFixed: string[] = [];
  const expectedStill: string[] = [];
  for (const name of expectList) {
    let anyNotPassBefore = false;
    let allFixed = true;
    for (const id of itemIds) {
      const b = categoryAt(beforeGrades, id, name);
      if (!b || b.gate === 'pass') continue;
      anyNotPassBefore = true;
      const a = categoryAt(afterGrades, id, name);
      if (!a || a.gate !== 'pass') allFixed = false;
    }
    if (anyNotPassBefore) (allFixed ? expectedFixed : expectedStill).push(name);
  }
  const expectSet = new Set(expectList);
  const unexpected = concernNames.filter(
    (name) => !expectSet.has(name) && itemIds.some((id) => { const b = categoryAt(beforeGrades, id, name); const a = categoryAt(afterGrades, id, name); return b && a && b.gate !== a.gate; }),
  );

  const afterGoalAnswer = afterSwept.value.answers['goal'] as { kind: 'yesno'; p: number };
  const afterGoalGate = goalGate(afterGoalAnswer.p);
  const gate: Gate = regressedFlat.length > 0 ? 'fail' : sweepGate(afterGoalGate, afterGrades);
  const afterGraded = [...afterGrades.values()].filter((g) => g.status === 'asked' || g.status === 'reused');
  const passing = afterGraded.filter((g) => g.ownGate === 'pass').length;

  const itemsValue: Array<[string, Value]> = [];
  for (const id of itemIds) {
    const g = itemGrades.get(id);
    if (!g || (g.before === 'pass' && g.after === 'pass')) continue;
    const probeCount = g.fixed.length + g.still.length;
    itemsValue.push([
      id,
      m(
        ['before', g.before],
        ['after', g.after],
        ...(g.fixed.length ? [['fixed', g.fixed] as [string, Value]] : []),
        ...(g.still.length ? [['still', g.still] as [string, Value]] : []),
        ...(probeCount > 0 ? [['probes', `${g.fixed.length}/${probeCount} fixed`] as [string, Value]] : []),
      ),
    ]);
  }

  // Which prior runs this run's answers came from (both refs combined), when any were reused.
  const reusedFromObj: Record<string, string> = { ...Object.fromEntries(beforePlan.reusedFrom), ...Object.fromEntries(afterPlan.reusedFrom) };
  const reusedRunIds = reusedIds(reusedFromObj);
  const reusedAges = reusedAgeNotes(ctx.paths, reusedRunIds);
  const telemetry = [...beforeSwept.value.telemetry, ...afterSwept.value.telemetry, ...cacheTelemetry(ctx.paths, reusedFromObj)];

  const response = (id: string, budget: string): string =>
    respondText(
      m(
        ['id', id],
        ['gate', gate],
        ['goal', m(['gate', afterGoalGate], ['p', afterGoalAnswer.p])],
        ['items', m(...itemsValue)],
        ['passing', passing],
        ['expected', m(['fixed', expectedFixed], ['still', expectedStill])],
        ...(unexpected.length ? [['unexpected', unexpected] as [string, Value]] : []),
        ['regressed', regressedFlat],
        ...(reusedRunIds.length ? [['reused', reusedRunIds] as [string, Value]] : []),
      ),
      mdlRecorded(request.mdl, ['parent']),
      regressedFlat.length
        ? drillNext(id, regressedFlat[0]!.split('#')[0]!)
        : sweepNext(id, gate, worstFirst(afterGrades.values()), afterGraded, `mm3 outcome ${request.mak.parent} held --by <you>`),
      commonNotes(
        [
          ...loaded.notes,
          ...beforeNotes,
          ...afterNotes,
          ...beforePlan.splitNotes,
          ...afterPlan.splitNotes,
          ...reusedAges,
          ...(pre.value.created ? [createdNote(pre.value.state)] : []),
          ...(costEstimated ? [COST_ESTIMATED_NOTE] : []),
        ],
        `2 refs · ${calls} call${calls === 1 ? '' : 's'} · ${askedQuestions} question${askedQuestions === 1 ? '' : 's'} · ${budget}`,
        ctx.provider.adapter,
        ctx.paths,
        ctx.notes,
      ),
    );

  const prefixed = (prefix: 'before' | 'after', qid: string): string => `${prefix}:${qid}`;
  const answers: Record<string, Answer> = {};
  for (const [qid, a] of Object.entries(beforeSwept.value.answers)) answers[prefixed('before', qid)] = a;
  for (const [qid, a] of Object.entries(afterSwept.value.answers)) answers[prefixed('after', qid)] = a;
  const keys: Record<string, string> = {};
  for (const [qid, k] of beforePlan.keys) keys[prefixed('before', qid)] = k;
  for (const [qid, k] of afterPlan.keys) keys[prefixed('after', qid)] = k;
  const reusedFrom: Record<string, string> = {};
  for (const [qid, r] of beforePlan.reusedFrom) reusedFrom[prefixed('before', qid)] = r;
  for (const [qid, r] of afterPlan.reusedFrom) reusedFrom[prefixed('after', qid)] = r;

  const where = whereFromItems([...afterPlan.items, ...beforePlan.items]);
  const beforeSha = resolveRefSha(ctx.paths.root, compare.before, itemPaths);
  const afterSha = resolveRefSha(ctx.paths.root, compare.after, itemPaths);

  const run: NewContractRun = {
    verb: 'replay',
    actor: actorOf(ctx),
    task: ctx.env.MM3_TASK?.trim() || null,
    goal: request.mak.goal,
    depth: null,
    where,
    parent: request.mak.parent!,
    from: null,
    compare,
    expect,
    mdl: request.mdl,
    ask: { categories: [], layers },
    over,
    items: itemRecords(afterPlan.items, afterGrades),
    answers,
    keys,
    reusedFrom,
    categories: {},
    gate,
    goalGate: afterGoalGate,
    goalP: afterGoalAnswer.p,
    consensus: null,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls,
    route: identity.route,
    baseURL: identity.baseURL,
    commit: afterSha,
    commits: { before: beforeSha, after: afterSha },
    telemetry,
  };

  return recordSweep(ctx, calls, costUsd, run);
}

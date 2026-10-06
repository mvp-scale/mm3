/**
 * drill: "why did this one thing fail?" Goes down from one item, or one category, in a parent run's own
 * arrays — shaped like that parent (docs/contract.md "drill"). Which shape branches on parent.items:
 *   a sweep parent (scan or loop, items !== null) → from: names one of its items; drill sweeps the next
 *     layer down from that one item (sweep.ts's shared engine), worst first, same as scan.
 *   a one-subject parent (class, replay, or an earlier drill, items === null) → from: names one of its
 *     categories; drill sends brand-new, narrower questions straight under ask: and answers with class's
 *     own shape.
 * Both branches share parent/from resolution and next:'s own rule: drill's own next: always points at
 * fixing-then-proving, never at drilling further (you're already at the bottom) —
 * a one-subject parent keeps "fix it, then replay"; a sweep parent says to fix and re-run this drill instead
 * (unchanged items are reused, so it is nearly free), since replay refuses a sweep parent outright.
 */
import { providerIdentity } from '../classifier/select.ts';
import type { Mm3Config } from '../config/defaults.ts';
import { configOf } from '../config/load.ts';
import { m, type Value } from '../contract/emit.ts';
import { goalGate, gradeItems, gradeSubject, sweepGate, worstFirst } from '../contract/grade.ts';
import { firstStringLayer, type Item } from '../contract/layers.ts';
import { answerKey, goalQuestion, subjectEvidence, subjectQuestions } from '../contract/translate.ts';
import type { Answer, Category, Request } from '../contract/types.ts';
import { effectiveMdlFields } from '../contract/mdl-fields.ts';
import { readCodeEvidence, type ReadCodeEvidenceOptions } from '../evidence/code.ts';
import { currentCommitSha } from '../evidence/git.ts';
import { createCodeResolver, readUnit } from '../evidence/units.ts';
import { findRun, isContractRun, type ItemRecord, type NewContractRun, type TelemetryEntry } from '../ledger/log.ts';
import { redact } from '../ledger/redact.ts';
import { cacheTelemetry, lookupAnswers, reusedAgeNotes, type ReuseLimits } from '../ledger/reuse.ts';
import { clip } from '../util/text.ts';
import { actorOf, askAll, createdNote, preflight, record, recordFree, splitReuse, type PlannedCall } from './pay.ts';
import { contractLimits, loadRequest, stopText } from './request.ts';
import { commonNotes, consensusAndEscalate, COST_ESTIMATED_NOTE, dryRunText, probeWarnings, reusedIds, respondText, subjectMak, sweepEntry, sweepNext, mdlRecorded } from './respond.ts';
import { itemRecords, planNeedsBudget, plannedCallCount, planSweep, recordSweep, runSweep, sweepDryRun } from './sweep.ts';
import type { VerbContext, VerbResult } from './types.ts';

/** A sweep parent's fail/unsure next: fix the worst item, then re-run this drill — cheap, since sweep.ts
 * reuses every item that didn't change. Never mm3 replay: replay.ts refuses a sweep parent. */
const REDRILL_NEXT = 'fix it, then run this drill again (unchanged items are reused, so it is nearly free)';

/** The `where` a sweep drill records (recorded for every verb): every item's own code path, unique,
 *  sorted, capped at 50 — same rule scan.ts applies to its own sweep, duplicated rather than shared (the two
 *  verb files own no common module here). An idea item (no `unit`, e.g. drilling a loop item) contributes
 *  nothing, same as scan's own code-only items. */
const WHERE_CAP = 50;
function whereFromItems(items: readonly { unit?: { path: string } }[]): string[] {
  return [...new Set(items.flatMap((i) => (i.unit ? [i.unit.path] : [])))].sort().slice(0, WHERE_CAP);
}

/**
 * The one-subject shape (docs/contract.md "drill"): fresh, narrower ask: categories answered straight against
 * `where` — class's own flow verbatim, just with drill's own record shape (parent/from set, next: never
 * points at drilling further). Shared by BOTH an existing one-subject-parent drill and a flat
 * proof of one coded sweep item with no over: — they differ only in where the evidence comes from and which
 * run `replay` should build on next: a one-subject PARENT already has items: null, so `request.mak.parent`
 * itself is a valid replay parent; a sweep parent (items !== null) is not — replay refuses it outright — so a
 * flat proof of one of its items must point `replay` at itself (this new drill run's own id) instead.
 */
async function runOneSubjectProof(
  ctx: VerbContext,
  loaded: { notes: string[] },
  request: Request,
  where: readonly string[],
  replayParent: (id: string) => string,
  reuseLimits: ReuseLimits | undefined,
  settings: Pick<Mm3Config, 'lens' | 'evidence'>,
  evidenceOpts?: ReadCodeEvidenceOptions,
): Promise<VerbResult> {
  const evidence = readCodeEvidence(ctx.paths.root, where, { ...evidenceOpts, limits: { perFileChars: settings.evidence.perItemChars, totalChars: settings.evidence.totalChars } });
  if (!evidence.ok) return { exit: 2, text: stopText(evidence.errors, 'drill') };

  const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const evidenceStr = subjectEvidence(evidence.evidence.files);
  const questions = [goalQuestion(request.mak.goal), ...subjectQuestions(request.mak.categories)];
  const keyed = questions.map((q) => [q, answerKey(evidenceStr, q)] as const);
  // Reuse is resolved before preflight/dry-run, same as class.ts: a fully-reused drill's free call is never
  // blocked by an already-reached budget cap, and a dry run can predict how much reuses..
  // reuse.maxAgeDays/maxCommits apply here too, not just view's own exact-reuse.
  const reused = lookupAnswers(ctx.paths, who, keyed.map(([, k]) => k), { readOnly: ctx.dryRun ?? false, reuse: reuseLimits });

  const answers: Record<string, Answer> = {};
  const reusedFrom: Record<string, string> = {};
  const toAsk = splitReuse(keyed, reused, answers, reusedFrom);

  if (ctx.dryRun) {
    return {
      exit: 0,
      text: dryRunText(
        { calls: toAsk.length ? 1 : 0, questions: toAsk.length, reused: keyed.length - toAsk.length, route: identity.route, baseURL: identity.baseURL },
        probeWarnings(request.mak),
      ),
    };
  }

  const pre = preflight(ctx, { needsBudget: toAsk.length > 0 });
  if (!pre.ok) return pre.result;

  let costUsd: number | undefined;
  let costEstimated = false;
  let calls: number;
  let telemetry: TelemetryEntry[] = [];
  if (toAsk.length === 0) {
    costUsd = 0;
    calls = 0;
  } else {
    const call: PlannedCall = { state: { goal: redact(request.mak.goal), code: evidence.evidence.files }, questions: toAsk.map(([q]) => q) };
    const asked = await askAll(ctx, 'drill', [call]);
    if (!asked.ok) return asked.result;
    Object.assign(answers, asked.value.answers);
    costUsd = asked.value.costUsd;
    costEstimated = asked.value.costEstimated;
    telemetry = asked.value.telemetry;
    calls = 1;
  }

  const keys: Record<string, string> = {};
  for (const [q, k] of keyed) keys[q.id] = k;

  const { consensus, escalate } = consensusAndEscalate(request.mak.categories, answers, request.mak.depth, loaded.notes, settings.lens);
  const subject = gradeSubject(request.mak.categories, answers);

  const oneSubjectNext = (gate: 'pass' | 'fail' | 'unsure', id: string): string =>
    gate === 'pass' ? 'act on it' : `fix it, then mm3 replay --parent ${replayParent(id)} --compare <before>..<after>`;

  // Which prior runs this drill's answers came from, when any were reused.
  const reusedRunIds = reusedIds(reusedFrom);
  const reusedAges = reusedAgeNotes(ctx.paths, reusedRunIds);
  telemetry = [...telemetry, ...cacheTelemetry(ctx.paths, reusedFrom)];
  const response = (id: string, budget: string): string =>
    respondText(
      subjectMak(id, subject.gate, subject, [
        ['consensus', consensus],
        ['escalate', escalate],
        ...(reusedRunIds.length ? [['reused', reusedRunIds] as [string, Value]] : []),
      ]),
      mdlRecorded(request.mdl),
      oneSubjectNext(subject.gate, id),
      commonNotes(
        [...loaded.notes, ...evidence.evidence.notes, ...reusedAges, ...(pre.value.created ? [createdNote(pre.value.state)] : []), ...(costEstimated ? [COST_ESTIMATED_NOTE] : [])],
        budget,
        ctx.provider.adapter,
        ctx.paths,
        ctx.notes,
      ),
    );

  const run: NewContractRun = {
    verb: 'drill',
    actor: actorOf(ctx),
    task: ctx.env.MM3_TASK?.trim() || null,
    goal: request.mak.goal,
    depth: request.mak.depth ?? null,
    where: [...where],
    parent: request.mak.parent!,
    from: request.mak.from!,
    compare: null,
    commit: currentCommitSha(ctx.paths.root, where),
    mdl: request.mdl,
    ask: { categories: request.mak.categories, layers: [] },
    over: null,
    items: null,
    answers,
    keys,
    reusedFrom,
    categories: Object.fromEntries(subject.categories.map((c) => [c.name, c.gate])),
    gate: subject.gate,
    goalGate: subject.goal?.gate ?? null,
    goalP: subject.goal?.p ?? null,
    consensus,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls,
    route: identity.route,
    baseURL: identity.baseURL,
    telemetry,
  };

  const rec = calls === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}

export async function runDrill(text: string, ctx: VerbContext): Promise<VerbResult> {
  // a project's own .mm3/config.yaml mdl: overrides apply to every mdl: block it validates.
  const cfg = configOf(ctx).config;
  const mdlFields = effectiveMdlFields(cfg.mdl);
  const loaded = loadRequest(text, 'drill', mdlFields, contractLimits(cfg, 'drill'));
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;

  const parent = findRun(ctx.paths, request.mak.parent!);
  if (!parent) return { exit: 2, text: stopText([`✖ mak.parent: ${request.mak.parent} is not in the ledger → check the id`], 'drill') };
  if (!isContractRun(parent)) return { exit: 2, text: stopText([`✖ mak.parent: ${parent.id} predates the YAML contract → run class or scan again`], 'drill') };

  if (parent.items !== null) {
    // The parent was a sweep: from: names one of its items.
    const itemRec: ItemRecord | undefined = parent.items[request.mak.from!];
    if (!itemRec) {
      return {
        exit: 2,
        text: stopText(
          [`✖ mak.from: "${clip(request.mak.from!, 40)}" is not an item ${parent.id} listed → use one of: ${clip(Object.keys(parent.items).join(', '), 80)}`],
          'drill',
        ),
      };
    }

    // No over: at all — a flat, one-subject proof of just this one item, no further layer. Only
    // a coded item (a unit) has evidence to read this way; an idea item (loop's own kind) has none.
    if (!request.mak.over) {
      if (!itemRec.unit) {
        return {
          exit: 2,
          text: stopText(
            [
              `✖ mak.from: "${clip(request.mak.from!, 40)}" has no code → add over: with the next layer down, or drill an item scan found (mm3 template drill --parent ${parent.id} --from ${request.mak.from})`,
            ],
            'drill',
          ),
        };
      }
      // C-171: this range is the item's own whole-file/function/call span, chosen by scan/loop's own resolver,
      // never typed by a user — an oversized one still gets truncated with a note, not stopped.
      return runOneSubjectProof(ctx, loaded, request, [`${itemRec.unit.path}:${itemRec.unit.lines}`], (id) => id, cfg.reuse, cfg, { stopOnOversize: false });
    }

    const from = request.mak.from!;
    const name = from.includes('/') ? from.slice(from.lastIndexOf('/') + 1) : from;
    const parentId = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : null;
    let itemText = name; // an idea item's text is its own name (layers.ts), unless it's code (a unit)
    if (itemRec.unit) {
      const read = readUnit(ctx.paths.root, itemRec.unit);
      if (!read.ok) return { exit: 2, text: stopText([`✖ mak.from: the code has changed since ${parent.id} (${read.error}) → run scan again`], 'drill') };
      itemText = read.text;
    }
    const root: Item = { id: from, layer: itemRec.layer, name, parent: parentId, fill: itemRec.fill, text: itemText, ...(itemRec.unit ? { unit: itemRec.unit } : {}) };

    // An idea item (from loop, or an earlier idea drill) has no unit — nothing for createCodeResolver to
    // dispatch on (units.ts's `parent.unit!.kind` would throw). It also has no code to split with "each": the
    // next layer down has to be a literal list of new ideas, same as loop's own over:, so no resolver runs at
    // all. A string layer under an idea root is incoherent, not a crash — stop and say so.
    if (!itemRec.unit) {
      const badLayer = firstStringLayer(request.mak.over!);
      if (badLayer) {
        return {
          exit: 2,
          text: stopText(
            [`✖ mak.over.${badLayer}: "${clip(from, 40)}" is an idea, not code → give ${badLayer} as a list of items (there is nothing to split with each)`],
            'drill',
          ),
        };
      }
    }

    const notes: string[] = [];
    const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
    const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
    const plan = planSweep(
      request,
      who,
      ctx.paths,
      ctx.dryRun ?? false,
      itemRec.unit ? { resolve: createCodeResolver(ctx.paths.root, notes, cfg.evidence.maxFiles), root } : { root },
      { sweep: cfg.sweep, reuse: cfg.reuse, evidence: cfg.evidence },
    );

    if (ctx.dryRun) return sweepDryRun(plan, identity, probeWarnings(request.mak));

    // A fully-reused sweep drill must never be blocked by an already-reached cap.
    const pre = preflight(ctx, { needsBudget: planNeedsBudget(plan) });
    if (!pre.ok) return pre.result;

    const swept = await runSweep(ctx, 'drill', plan);
    if (!swept.ok) return swept.result;
    const { answers, costUsd, costEstimated, telemetry, statusOf } = swept.value;

    const categoriesOf = (layer: string): readonly Category[] => request.mak.layers.find((l) => l.name === layer)?.categories ?? [];
    const grades = gradeItems(plan.items, categoriesOf, statusOf, answers);

    const goalAnswer = answers['goal'] as { kind: 'yesno'; p: number };
    const goalGrade = goalGate(goalAnswer.p);
    const gate = sweepGate(goalGrade, grades);

    const graded = [...grades.values()].filter((g) => g.status === 'asked' || g.status === 'reused');
    const worst = worstFirst(grades.values());
    const failing = m(...worst.map((g) => sweepEntry(g)));
    const passing = graded.filter((g) => g.ownGate === 'pass').length;

    const calls = plannedCallCount(plan);

    const items = itemRecords(plan.items, grades);
    const reusedFromObj = Object.fromEntries(plan.reusedFrom);
    const reusedAges = reusedAgeNotes(ctx.paths, reusedIds(reusedFromObj));
    const fullTelemetry = [...telemetry, ...cacheTelemetry(ctx.paths, reusedFromObj)];

    // Combines sweepNext's own never-drill-a-passing-item edge cases (goal-only-missed, everything skipped)
    // with drill's own rule: when there IS a worst item to fix, say so and re-run — never drill further.
    const response = (id: string, budget: string): string =>
      respondText(
        m(['id', id], ['gate', gate], ['goal', m(['gate', goalGrade], ['p', goalAnswer.p])], ['failing', failing], ['passing', passing]),
        mdlRecorded(request.mdl),
        worst.length ? REDRILL_NEXT : sweepNext(id, gate, worst, graded, 'act on it'),
        commonNotes(
          [...loaded.notes, ...notes, ...plan.splitNotes, ...reusedAges, ...(pre.value.created ? [createdNote(pre.value.state)] : []), ...(costEstimated ? [COST_ESTIMATED_NOTE] : [])],
          `${calls} call${calls === 1 ? '' : 's'} · ${plan.askedQuestions} question${plan.askedQuestions === 1 ? '' : 's'} · ${budget}`,
          ctx.provider.adapter,
          ctx.paths,
          ctx.notes,
        ),
      );

    const where = whereFromItems(plan.items);
    const run: NewContractRun = {
      verb: 'drill',
      actor: actorOf(ctx),
      task: ctx.env.MM3_TASK?.trim() || null,
      goal: request.mak.goal,
      depth: request.mak.depth ?? null,
      where,
      parent: request.mak.parent!,
      from: request.mak.from!,
      compare: null,
      commit: currentCommitSha(ctx.paths.root, where),
      mdl: request.mdl,
      ask: { categories: [], layers: request.mak.layers },
      over: request.mak.over!,
      items,
      answers,
      keys: Object.fromEntries(plan.keys),
      reusedFrom: Object.fromEntries(plan.reusedFrom),
      categories: {},
      gate,
      goalGate: goalGrade,
      goalP: goalAnswer.p,
      consensus: null,
      response,
      notes: [],
      adapter: ctx.provider.adapter,
      model: ctx.provider.model,
      costUsd: costUsd ?? null,
      calls,
      route: identity.route,
      baseURL: identity.baseURL,
      telemetry: fullTelemetry,
    };

    return recordSweep(ctx, calls, costUsd, run);
  }

  // The parent was one subject: from: names one of its categories.
  if (request.mak.over) return { exit: 2, text: stopText([`✖ mak.over: ${parent.id} wasn't a sweep → remove over`], 'drill') };
  if (!parent.ask.categories.some((c) => c.name === request.mak.from)) {
    return {
      exit: 2,
      text: stopText(
        [`✖ mak.from: "${clip(request.mak.from!, 40)}" is not a category of ${parent.id} → use one of: ${parent.ask.categories.map((c) => c.name).join(', ')}`],
        'drill',
      ),
    };
  }
  return runOneSubjectProof(ctx, loaded, request, parent.where, () => request.mak.parent!, cfg.reuse, cfg);
}

/**
 * loop: "does this idea hold up?" A sweep of ideas the agent wrote itself (a design, a plan, a feature), graded
 * the same way scan grades code. No evidence to read (over: is plain arrays, never a resolver), so this is
 * mostly wiring: planSweep/runSweep do the reuse-aware work; loop grades, orders (tree order, unlike
 * scan/drill's worst-first) and responds.
 */
import { providerIdentity } from '../classifier/select.ts';
import { configOf } from '../config/load.ts';
import { gradeItems, goalGate, sweepGate, worstFirst } from '../contract/grade.ts';
import { m } from '../contract/emit.ts';
import type { Category } from '../contract/types.ts';
import { effectiveMdlFields } from '../contract/mdl-fields.ts';
import { currentCommitSha } from '../evidence/git.ts';
import type { NewContractRun } from '../ledger/log.ts';
import { cacheTelemetry, reusedAgeNotes } from '../ledger/reuse.ts';
import { actorOf, createdNote, preflight } from './pay.ts';
import { contractLimits, loadRequest } from './request.ts';
import { commonNotes, COST_ESTIMATED_NOTE, probeWarnings, respondText, reusedIds, sweepEntry, sweepNext, mdlRecorded } from './respond.ts';
import { itemRecords, planNeedsBudget, plannedCallCount, planSweep, recordSweep, runSweep, sweepDryRun } from './sweep.ts';
import type { VerbContext, VerbResult } from './types.ts';

export async function runLoop(text: string, ctx: VerbContext): Promise<VerbResult> {
  // a project's own .mm3/config.yaml mdl: overrides apply to every mdl: block it validates.
  const cfg = configOf(ctx).config;
  const mdlFields = effectiveMdlFields(cfg.mdl);
  const loaded = loadRequest(text, 'loop', mdlFields, contractLimits(cfg, 'loop'));
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;

  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
  const plan = planSweep(request, who, ctx.paths, ctx.dryRun ?? false, {}, { sweep: cfg.sweep, reuse: cfg.reuse, evidence: cfg.evidence });

  if (ctx.dryRun) return sweepDryRun(plan, identity, probeWarnings(request.mak));

  // A fully-reused loop (every layer's call: null) must never be blocked by an already-reached cap.
  const pre = preflight(ctx, { needsBudget: planNeedsBudget(plan) });
  if (!pre.ok) return pre.result;

  const ran = await runSweep(ctx, 'loop', plan);
  if (!ran.ok) return ran.result;
  const { answers, costUsd, costEstimated, telemetry, statusOf } = ran.value;

  const categoriesOf = (layer: string): readonly Category[] => request.mak.layers.find((l) => l.name === layer)!.categories;
  const grades = gradeItems(plan.items, categoriesOf, statusOf, answers);

  const goalAnswer = answers['goal'] as { kind: 'yesno'; p: number } | undefined;
  const goal = goalAnswer ? goalGate(goalAnswer.p) : 'pass'; // vacuous: the goal is always present, reused or asked
  const gate = sweepGate(goal, grades);

  // Tree order, not worst-first: failing: and passing: read in the order the request was written.
  const failingIds = plan.items.filter((i) => grades.get(i.id)!.ownGate !== 'pass').map((i) => i.id);
  const failing = m(...failingIds.map((id) => sweepEntry(grades.get(id)!)));
  const passing = plan.items.filter((i) => grades.get(i.id)!.gate === 'pass').map((i) => i.id);

  // worstFirst only picks drill's target; failing: above stays in tree order regardless.
  const graded = [...grades.values()].filter((g) => g.status === 'asked' || g.status === 'reused');
  const worst = worstFirst(graded);

  const calls = plannedCallCount(plan);

  const items = itemRecords(plan.items, grades);
  const reusedFromObj = Object.fromEntries(plan.reusedFrom);
  const reusedAges = reusedAgeNotes(ctx.paths, reusedIds(reusedFromObj));
  const fullTelemetry = [...telemetry, ...cacheTelemetry(ctx.paths, reusedFromObj)];

  const response = (id: string, budget: string): string =>
    respondText(
      m(['id', id], ['gate', gate], ['goal', m(['gate', goal], ['p', goalAnswer?.p ?? 0])], ['failing', failing], ['passing', passing]),
      mdlRecorded(request.mdl),
      sweepNext(id, gate, worst, graded, `build it, then class the code · after the commit, mm3 replay --parent ${id} --compare <before>..HEAD`),
      commonNotes(
        [...loaded.notes, ...plan.splitNotes, ...reusedAges, ...(pre.value.created ? [createdNote(pre.value.state)] : []), ...(costEstimated ? [COST_ESTIMATED_NOTE] : [])],
        `${calls} call${calls === 1 ? '' : 's'} · ${plan.askedQuestions} question${plan.askedQuestions === 1 ? '' : 's'} · ${budget}`,
        ctx.provider.adapter,
        ctx.paths,
        ctx.notes,
      ),
    );

  const run: NewContractRun = {
    verb: 'loop',
    actor: actorOf(ctx),
    task: ctx.env.MM3_TASK?.trim() || null,
    goal: request.mak.goal,
    depth: request.mak.depth ?? null,
    where: request.mak.where,
    parent: request.mak.parent ?? request.mdl?.parent ?? null,
    from: null,
    compare: null,
    commit: currentCommitSha(ctx.paths.root, request.mak.where),
    mdl: request.mdl,
    ask: { categories: [], layers: request.mak.layers },
    over: request.mak.over!,
    items,
    answers,
    keys: Object.fromEntries(plan.keys),
    reusedFrom: Object.fromEntries(plan.reusedFrom),
    categories: {},
    gate,
    goalGate: goal,
    goalP: goalAnswer?.p ?? null,
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

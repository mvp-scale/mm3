/**
 * class: "does the evidence support this one goal?" One pass through the contract:
 *   request → evidence → reuse what the ledger already answered for the same questions on the same evidence →
 *   (dry run: stop here) → preflight → one call for the rest → grade → consensus → the spend and the run in
 *   one lock section → the compact mak: response. A run fully answered from the ledger makes no call and is
 *   free — sweeps and one-subject runs reuse alike. Reuse is resolved before preflight, so a fully-reused
 *   run's free call is never blocked by an already-reached budget cap, and a dry run can predict how much of
 *   it would be reused.
 */
import { providerIdentity } from '../classifier/select.ts';
import { checkBudget, peekBudget } from '../budget/budget.ts';
import { configOf } from '../config/load.ts';
import type { Value } from '../contract/emit.ts';
import { gradeSubject } from '../contract/grade.ts';
import { answerKey, goalQuestion, subjectEvidence, subjectQuestions } from '../contract/translate.ts';
import type { Answer } from '../contract/types.ts';
import { effectiveMdlFields } from '../contract/mdl-fields.ts';
import { readCodeEvidence } from '../evidence/code.ts';
import { currentCommitSha } from '../evidence/git.ts';
import type { NewContractRun, TelemetryEntry } from '../ledger/log.ts';
import { redact } from '../ledger/redact.ts';
import { cacheTelemetry, lookupAnswers, reusedAgeNotes } from '../ledger/reuse.ts';
import { staleNotes } from '../ledger/stale.ts';
import { actorOf, askAll, createdNote, preflight, record, recordFree, splitReuse, type PlannedCall } from './pay.ts';
import { contractLimits, loadRequest, stopText } from './request.ts';
import { commonNotes, consensusAndEscalate, COST_ESTIMATED_NOTE, dryRunText, outcomeNext, probeWarnings, respondText, reusedIds, subjectMak, mdlRecorded } from './respond.ts';
import type { VerbContext, VerbResult } from './types.ts';

const CAP_NOTE = 'would be blocked: the budget cap is already reached';

export async function runClass(text: string, ctx: VerbContext): Promise<VerbResult> {
  // a project's own .mm3/config.yaml mdl: overrides apply to every mdl: block it validates.
  const cfg = configOf(ctx).config;
  const mdlFields = effectiveMdlFields(cfg.mdl);
  const loaded = loadRequest(text, 'class', mdlFields, contractLimits(cfg, 'class'));
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;

  // Evidence is read before touching budget or ledger at all: a bad path is a request problem, not a paid one.
  const evidence = readCodeEvidence(ctx.paths.root, request.mak.where, { limits: { perFileChars: cfg.evidence.perItemChars, totalChars: cfg.evidence.totalChars } });
  if (!evidence.ok) return { exit: 2, text: stopText(evidence.errors, 'class') };

  const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const evidenceStr = subjectEvidence(evidence.evidence.files);
  const questions = [goalQuestion(request.mak.goal), ...subjectQuestions(request.mak.categories)];
  const keyed = questions.map((q) => [q, answerKey(evidenceStr, q)] as const);
  // readOnly on a dry run (dry runs and free reads write nothing): never persists a catch-up
  // or rebuild of index.db just to predict what a real run would do.
  const reused = lookupAnswers(ctx.paths, who, keyed.map(([, k]) => k), { readOnly: ctx.dryRun ?? false, reuse: cfg.reuse });

  const answers: Record<string, Answer> = {};
  const reusedFrom: Record<string, string> = {};
  const toAsk = splitReuse(keyed, reused, answers, reusedFrom);

  if (ctx.dryRun) {
    // A dry run predicts reuse, and checks (without spending) whether a real run's one call would itself be
    // blocked by an already-reached cap — never a hard stop, just a heads-up.
    let capNote: string[] = [];
    if (toAsk.length > 0) {
      // peekBudget, not loadBudget: a dry run must never be the thing that creates .mm3/budget.json with
      // defaults. No file yet, or a corrupt one, just means "can't positively say the cap is reached" — the
      // real run still gets loadBudget's own proper creation/corruption handling.
      const state = peekBudget(ctx.paths);
      if (state && !checkBudget(state).ok) capNote = [CAP_NOTE];
    }
    return {
      exit: 0,
      text: dryRunText(
        { calls: toAsk.length ? 1 : 0, questions: toAsk.length, reused: keyed.length - toAsk.length, route: identity.route, baseURL: identity.baseURL },
        [...capNote, ...probeWarnings(request.mak)],
      ),
    };
  }

  const pre = preflight(ctx, { needsBudget: toAsk.length > 0 });
  if (!pre.ok) return pre.result;

  // A question about to be asked fresh may have been answered before, at an overlapping place, on code that's
  // since changed — say so, rather than re-asking blind with no comment.
  const stale = staleNotes(ctx.paths, request.mak.where, toAsk);

  let costUsd: number | undefined;
  let costEstimated = false;
  let calls: number;
  let telemetry: TelemetryEntry[] = [];
  if (toAsk.length === 0) {
    costUsd = 0;
    calls = 0;
  } else {
    const call: PlannedCall = { state: { goal: redact(request.mak.goal), code: evidence.evidence.files }, questions: toAsk.map(([q]) => q) };
    const asked = await askAll(ctx, 'class', [call]);
    if (!asked.ok) return asked.result;
    Object.assign(answers, asked.value.answers);
    costUsd = asked.value.costUsd;
    costEstimated = asked.value.costEstimated;
    telemetry = asked.value.telemetry;
    calls = 1;
  }

  // Every question's key, reused or freshly asked, so a later run can reuse from this one too.
  const keys: Record<string, string> = {};
  for (const [q, k] of keyed) keys[q.id] = k;

  const { consensus, escalate } = consensusAndEscalate(request.mak.categories, answers, request.mak.depth, loaded.notes, cfg.lens);
  const subject = gradeSubject(request.mak.categories, answers);

  // Which prior runs this run's answers came from, when any were reused — not just that reuse happened.
  const reusedRunIds = reusedIds(reusedFrom);
  const reusedAges = reusedAgeNotes(ctx.paths, reusedRunIds);
  // one cache-side telemetry entry per distinct origin reused from, alongside whatever
  // provider call(s) this run itself made.
  telemetry = [...telemetry, ...cacheTelemetry(ctx.paths, reusedFrom)];
  const response = (id: string, budget: string): string =>
    respondText(
      subjectMak(id, subject.gate, subject, [
        ['consensus', consensus],
        ['escalate', escalate],
        ...(reusedRunIds.length ? [['reused', reusedRunIds] as [string, Value]] : []),
      ]),
      mdlRecorded(request.mdl),
      outcomeNext(id, subject.gate, subject.categories, request.mak.categories, `act on it · then prove it with mm3 replay --parent ${id} --compare <before>..HEAD`),
      commonNotes(
        [...loaded.notes, ...evidence.evidence.notes, ...stale, ...reusedAges, ...(pre.value.created ? [createdNote(pre.value.state)] : []), ...(costEstimated ? [COST_ESTIMATED_NOTE] : [])],
        budget,
        ctx.provider.adapter,
        ctx.paths,
        ctx.notes,
      ),
    );

  const run: NewContractRun = {
    verb: 'class',
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

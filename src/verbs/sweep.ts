/**
 * The shared sweep engine (contract "How it becomes TypeSafe calls": a sweep = one call per layer). Used by
 * loop (idea items, no resolver) and, later, scan and drill (code items, via a Resolver). Two phases:
 *   planSweep: expand over: into items, decide per item — reused (free), skipped (over the depth cap) or asked
 *     (its missing questions go into that layer's one call) — with a single batched ledger lookup. Pure: no
 *     calls, no spend.
 *   runSweep: pay for whatever planSweep queued (askAll), and merge with the answers already resolved for free.
 * The goal question rides on the first layer that ends up with a call; if its own answer is reused, it never
 * needs one at all. A skipped item is graded 'unsure': none of its questions are asked or
 * pulled from reuse, so it never shows up half-answered.
 * sweepDryRun/recordSweep are the two bits of a sweep verb's own wiring (its --dry-run reply and its
 * paid/free ledger epilogue) that don't vary by verb at all — loop, scan and drill share them verbatim.
 */
import { SWEEP_ITEM_CAP } from '../contract/types.ts';
import type { Answer, Request, Verb } from '../contract/types.ts';
import { expand, type ExpandOptions, type Item } from '../contract/layers.ts';
import { answerKey, goalQuestion, itemQuestions, itemsState, type AskedQuestion } from '../contract/translate.ts';
import type { ItemGrade, ItemStatus } from '../contract/grade.ts';
import type { ClassifierState } from '../classifier/port.ts';
import { DEFAULT_CONFIG, type Mm3Config } from '../config/defaults.ts';
import type { ItemRecord, NewContractRun, TelemetryEntry } from '../ledger/log.ts';
import { redact } from '../ledger/redact.ts';
import { lookupAnswers, type ReuseLimits, type Who } from '../ledger/reuse.ts';
import type { Mm3Paths } from '../ledger/paths.ts';
import { askAll, record, recordFree, type PlannedCall, type Step } from './pay.ts';
import { dryRunText } from './respond.ts';
import type { VerbContext, VerbResult } from './types.ts';

/** planSweep's optional project settings — sourced from a caller's own
 *  `resolveConfig(ctx.paths, ctx.env).config`; omitted (every pre-existing 4-arg call site, including this
 *  file's own unit tests) keeps the code's own defaults: no extra item cap beyond the depth ceiling, no
 *  question-per-call split, no reuse age/commit limit. */
interface SweepLimits {
  sweep?: Omit<Mm3Config['sweep'], 'itemsPerLayer'> & Partial<Pick<Mm3Config['sweep'], 'itemsPerLayer'>>;
  /** Evidence cap per item and per call; omitted, the built-in defaults (translate.ts's ITEM_LIMITS). */
  evidence?: Pick<Mm3Config['evidence'], 'perItemChars' | 'totalChars'>;
  reuse?: ReuseLimits;
}

interface PlannedLayer {
  layer: string;
  call: PlannedCall | null;
  /** Extra calls beyond `call`, when this layer's questions exceeded `sweep.maxQuestionsPerCall` and had to be
   *  split — empty in the common case (well under the default 500). `call` (chunk 0, which
   *  carries the goal when this layer has it) plus `extraCalls`, in order, is the full list of calls this layer
   *  makes; runSweep/sweepDryRun/plannedCallCount all read it that way rather than assuming one call per layer. */
  extraCalls: PlannedCall[];
  /** Items this layer's call asks about (pushed into state.items), in item order. */
  itemIds: string[];
  /** Items over the depth cap this layer: not asked, not reused. */
  skipped: string[];
}

interface SweepPlan {
  /** Every layer expand() found (including layers with no ask: entry). */
  layers: string[];
  /** Every item, parents before children. */
  items: Item[];
  /** One entry per asked layer (request.mak.layers order), call: null when nothing to ask there. */
  planned: PlannedLayer[];
  /** Question id -> its answer key (translate.ts answerKey), for every question resolved (asked or reused). */
  keys: Map<string, string>;
  /** Question id -> the run whose answer was reused for it. */
  reusedFrom: Map<string, string>;
  /** Every reused answer, already resolved (merged with the asked answers by runSweep). */
  answers: Record<string, Answer>;
  /** Item questions actually placed into a call; the goal is never counted here. */
  askedQuestions: number;
  /** One line per layer whose questions exceeded sweep.maxQuestionsPerCall and had to be split into more than
   *  one call — empty when nothing was split. Callers fold this into their own response
   *  notes (and sweepDryRun's own extraNotes) so a split is visible, not silent. */
  splitNotes: string[];
}

interface LayerAsk {
  q: AskedQuestion;
  key: string;
}

interface LayerWork {
  layer: string;
  callItems: Item[];
  callQuestions: AskedQuestion[];
  itemIds: string[];
  skipped: string[];
  /** Every item this run actually resolved (reused whole, or asked) — i.e. everything with an ask that wasn't
   *  skipped past the depth cap. Plan 2c B11: this is the set the goal's own reuse key is built from, since it
   *  stays identical between two runs of the same unchanged sweep regardless of which individual items happen
   *  to reuse vs get asked fresh — only a real code/text change to one of them (or a change in which items are
   *  skipped) can move it. */
  resolvedItems: Item[];
}

/** Groups items by .layer, preserving relative order. */
function groupByLayer(items: readonly Item[]): Map<string, Item[]> {
  const out = new Map<string, Item[]>();
  for (const it of items) {
    const arr = out.get(it.layer);
    if (arr) arr.push(it);
    else out.set(it.layer, [it]);
  }
  return out;
}

/** Splits `arr` into chunks of at most `size` (size <= 0 means "no limit": one chunk). */
function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0 || arr.length <= size) return [[...arr]];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * planSweep(request, who, paths, dryRun, opts, limits) — pure except for the one batched ledger read
 * (lookupAnswers). No resolver: loop's over: is always plain arrays (checkOver's 'none' rule), so expand never
 * needs one. `dryRun`: threaded into lookupAnswers as `readOnly` — a sweep verb's --dry-run reply (sweepDryRun)
 * is built from THIS plan, so a plan built for a dry run must never persist a catch-up/rebuild of index.db to
 * disk (dry runs and free reads write nothing); a real run's plan self-heals as before. `limits`: a caller's own `resolveConfig(ctx.paths, ctx.env).config` sweep/reuse settings — omitted (every
 * pre-existing call site until this round, and this file's own unit tests), the code's own defaults apply: the
 * depth's compiled-in item cap, no question-per-call split, no reuse staleness limit.
 */
export function planSweep(request: Request, who: Who, paths: Mm3Paths, dryRun: boolean, opts: ExpandOptions = {}, limits: SweepLimits = {}): SweepPlan {
  const { layers, items } = expand(request.mak.over!, opts);
  const itemsByLayer = groupByLayer(items);
  const reuseLimits = limits.reuse;
  // Lower-only (defaults.ts's own doc on sweep.maxItems): a project may tighten the depth's compiled-in item
  // ceiling (sweep.itemsPerLayer, default SWEEP_ITEM_CAP), never raise past it — Math.min only moves the cap down.
  const projectMaxItems = limits.sweep?.maxItems;
  const maxQuestionsPerCall = limits.sweep?.maxQuestionsPerCall ?? DEFAULT_CONFIG.sweep.maxQuestionsPerCall;

  // Pass 1: every ask, flat, grouped by item so pass 2 can look a whole item's asks up at once. The goal's own
  // key isn't known yet (it depends on which items pass 2 ends up ASKING), so it isn't collected
  // here; item keys only.
  const asksByItem = new Map<string, LayerAsk[]>();
  const allKeys: string[] = [];
  for (const layer of request.mak.layers) {
    for (const item of itemsByLayer.get(layer.name) ?? []) {
      const asks = itemQuestions(item, layer.categories).map((q) => ({ q, key: answerKey(item.text, q) }));
      asksByItem.set(item.id, asks);
      for (const a of asks) allKeys.push(a.key);
    }
  }
  const goalQ = goalQuestion(request.mak.goal);

  // One lookup for every item key collected above — not one per item.
  const reused = lookupAnswers(paths, who, allKeys, { readOnly: dryRun, reuse: reuseLimits });

  const depthCap = (limits.sweep?.itemsPerLayer ?? SWEEP_ITEM_CAP)[request.mak.depth ?? 'quick'];
  const cap = projectMaxItems !== undefined ? Math.min(depthCap, projectMaxItems) : depthCap;
  const keys = new Map<string, string>();
  const reusedFrom = new Map<string, string>();
  const answers: Record<string, Answer> = {};
  let askedQuestions = 0;

  // Pass 2: decide status per item, respecting the layer's depth cap, without yet placing the goal.
  const work: LayerWork[] = request.mak.layers.map((layer) => {
    let askedCount = 0;
    const callItems: Item[] = [];
    const callQuestions: AskedQuestion[] = [];
    const itemIds: string[] = [];
    const skipped: string[] = [];
    const resolvedItems: Item[] = [];
    for (const item of itemsByLayer.get(layer.name) ?? []) {
      const itemAsks = asksByItem.get(item.id) ?? [];
      if (!itemAsks.length) continue; // this layer has no categories: status stays 'none'
      const missing = itemAsks.filter((a) => !reused.has(a.key));
      if (missing.length === 0) {
        resolvedItems.push(item);
        for (const a of itemAsks) {
          const hit = reused.get(a.key)!;
          reusedFrom.set(a.q.id, hit.id);
          keys.set(a.q.id, a.key);
          answers[a.q.id] = hit.answer;
        }
      } else if (askedCount >= cap) {
        skipped.push(item.id);
      } else {
        askedCount += 1;
        callItems.push(item);
        itemIds.push(item.id);
        resolvedItems.push(item);
        for (const a of itemAsks) {
          keys.set(a.q.id, a.key);
          const hit = reused.get(a.key);
          if (hit) {
            reusedFrom.set(a.q.id, hit.id);
            answers[a.q.id] = hit.answer;
          } else {
            callQuestions.push(a.q);
            askedQuestions += 1;
          }
        }
      }
    }
    return { layer: layer.name, callItems, callQuestions, itemIds, skipped, resolvedItems };
  });

  // B11: the goal's own reuse key includes evidence — the sorted concatenation of every RESOLVED
  // item's own unit text (every item with an ask that wasn't skipped past the depth cap: reused whole or asked
  // fresh both count, so the same unchanged sweep always builds the identical concatenation whether or not any
  // individual item happens to reuse this time — only a real change to one of them, or a change in which items
  // are skipped, can move it). Any code change to a resolved item changes its `item.text`, which
  // changes this concatenation, which changes the key — so the goal can never wrongly reuse an old verdict
  // against code that changed underneath it. Sorted by item id for a deterministic order regardless of layer/
  // item enumeration order; joined by "\n" (item text itself never contains a literal newline — itemsState/
  // answerKey already treat it as one line). Empty when no item was asked at all this run (every item reused or
  // skipped) — nothing new to invalidate the goal against, so it keys the same as an empty sweep always did.
  const resolvedItems = work.flatMap((w) => w.resolvedItems).sort((a, b) => a.id.localeCompare(b.id));
  const resolvedText = resolvedItems.map((it) => it.text).join('\n');
  const goalKey = answerKey(resolvedText, goalQ);
  // A second, separate ledger READ (never a paid provider call — this doesn't touch the "one call per layer"
  // rule) now that the key is finally known; readOnly matches the item lookup above.
  const goalReused = lookupAnswers(paths, who, [goalKey], { readOnly: dryRun, reuse: reuseLimits });

  // The goal: one reuse key for the whole run, resolved once. Unreused, it rides the first layer (in order):
  // that layer either already has item questions (the goal joins them) or gets a call just to carry the goal.
  const goalHit = goalReused.get(goalKey);
  if (goalHit) {
    reusedFrom.set(goalQ.id, goalHit.id);
    keys.set(goalQ.id, goalKey);
    answers[goalQ.id] = goalHit.answer;
  } else {
    const first = work[0];
    if (first) {
      first.callQuestions = [goalQ, ...first.callQuestions];
      keys.set(goalQ.id, goalKey);
    }
  }

  // a layer's questions past sweep.maxQuestionsPerCall split into several calls, each with
  // only the evidence its own chunk's questions actually reference (never the whole layer's items repeated in
  // every chunk) — chunk 0 still carries the goal, since callQuestions always puts it first when present.
  const splitNotes: string[] = [];
  const planned: PlannedLayer[] = work.map(({ layer, callItems, callQuestions, itemIds, skipped }) => {
    if (!callQuestions.length) return { layer, call: null, extraCalls: [], itemIds, skipped };
    const hasGoal = callQuestions[0] === goalQ;
    const chunks = chunk(callQuestions, maxQuestionsPerCall);
    if (chunks.length > 1) {
      splitNotes.push(`${layer}: ${callQuestions.length} questions split into ${chunks.length} calls (over sweep.maxQuestionsPerCall: ${maxQuestionsPerCall})`);
    }
    const calls = chunks.map((qs, i) => {
      const notes: string[] = []; // truncation notes from itemsState: not surfaced by this engine (SweepPlan carries none)
      const wanted = new Set(qs.map((q) => q.item).filter((id): id is string => id !== undefined));
      const chunkItems = wanted.size ? callItems.filter((it) => wanted.has(it.id)) : callItems;
      const state: ClassifierState = { ...(i === 0 && hasGoal ? { goal: redact(request.mak.goal) } : {}), items: itemsState(chunkItems, notes, limits.evidence) };
      return { state, questions: qs };
    });
    return { layer, call: calls[0]!, extraCalls: calls.slice(1), itemIds, skipped };
  });

  return { layers, items, planned, keys, reusedFrom, answers, askedQuestions, splitNotes };
}

/** Whether a real run of this plan would make any call at all — the one thing preflight's own budget
 *  cap check needs to know before it runs, so a fully-reused sweep (every layer's call: null) is never blocked
 *  by an already-reached cap it will never touch. Pass as `preflight(ctx, { needsBudget: planNeedsBudget(plan) })`. */
export function planNeedsBudget(plan: SweepPlan): boolean {
  return plan.planned.some((p) => p.call !== null);
}

/** Every call this plan would actually make, in layer order: a layer's own call (chunk 0, or none) then its
 *  extraCalls (the split) — the one flat list askAll/telemetry/dryRunText all count against. */
function plannedCalls(plan: SweepPlan): PlannedCall[] {
  return plan.planned.flatMap((p) => (p.call ? [p.call, ...p.extraCalls] : []));
}

/** How many real provider calls this plan would make — a layer split into several calls counts each one, not
 *  just the layer itself. loop/scan/drill each use this for their own `calls`/budget-note count. */
export function plannedCallCount(plan: SweepPlan): number {
  return plannedCalls(plan).length;
}

/** runSweep(ctx, verb, plan): pays for whatever planSweep queued, merged with the answers already free. */
export async function runSweep(
  ctx: VerbContext,
  verb: Verb,
  plan: SweepPlan,
): Promise<Step<{ answers: Record<string, Answer>; costUsd: number | undefined; costEstimated: boolean; telemetry: TelemetryEntry[]; statusOf: (id: string) => ItemStatus }>> {
  const skippedIds = new Set(plan.planned.flatMap((p) => p.skipped));
  const askedIds = new Set(plan.planned.flatMap((p) => p.itemIds));
  const reusedItemIds = new Set<string>();
  for (const qid of plan.reusedFrom.keys()) {
    const at = qid.lastIndexOf('#');
    if (at > 0) reusedItemIds.add(qid.slice(0, at));
  }
  const statusOf = (id: string): ItemStatus => {
    if (skippedIds.has(id)) return 'skipped';
    if (askedIds.has(id)) return 'asked';
    if (reusedItemIds.has(id)) return 'reused';
    return 'none';
  };

  const calls = plannedCalls(plan);
  if (calls.length === 0) return { ok: true, value: { answers: plan.answers, costUsd: 0, costEstimated: false, telemetry: [], statusOf } };

  const asked = await askAll(ctx, verb, calls);
  if (!asked.ok) return asked;
  return {
    ok: true,
    value: { answers: { ...plan.answers, ...asked.value.answers }, costUsd: asked.value.costUsd, costEstimated: asked.value.costEstimated, telemetry: asked.value.telemetry, statusOf },
  };
}

/** A sweep verb's --dry-run reply: validate, expand and count; no call, no spend. `identity` is the route/base
 *  URL a real call would use (providerIdentity(ctx.env)) — the only thing beyond the plan itself this needs.
 *  `extraNotes` (item F): each caller's own `probeWarnings(request.mak)`, so a sweep's dry run warns on the
 *  same mechanically-checkable authoring issues a one-subject dry run does. */
export function sweepDryRun(plan: SweepPlan, identity: { route: string; baseURL: string | null }, extraNotes: readonly string[] = []): VerbResult {
  const calls = plannedCallCount(plan);
  const askedItems = plan.planned.reduce((n, p) => n + p.itemIds.length, 0);
  const skippedItems = plan.planned.reduce((n, p) => n + p.skipped.length, 0);
  return {
    exit: 0,
    text: dryRunText(
      {
        calls,
        questions: plan.askedQuestions,
        items: plan.items.length,
        reused: plan.items.length - askedItems - skippedItems,
        route: identity.route,
        baseURL: identity.baseURL,
      },
      [...extraNotes, ...plan.splitNotes],
    ),
  };
}

/** A sweep verb's epilogue: log the run — free when it made no call, paid otherwise — and answer with its response. */
export function recordSweep(ctx: VerbContext, calls: number, costUsd: number | undefined, run: NewContractRun): VerbResult {
  const rec = calls === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}

/** Every item's stored record, from its own layer/fill/unit passthrough plus this run's grade — the same shape
 *  loop, scan and drill (sweep-parent branch) all build a `run.items` map out of. */
export function itemRecords(items: readonly Item[], grades: ReadonlyMap<string, ItemGrade>): Record<string, ItemRecord> {
  const out: Record<string, ItemRecord> = {};
  for (const it of items) {
    const g = grades.get(it.id)!;
    out[it.id] = {
      layer: it.layer,
      fill: it.fill,
      ...(it.unit ? { unit: it.unit } : {}),
      status: g.status,
      gate: g.gate,
      categories: Object.fromEntries(g.own.map((c) => [c.name, c.gate])),
    };
  }
  return out;
}

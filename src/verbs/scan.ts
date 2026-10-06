/**
 * scan: "where in this code should we look?" A sweep across code (file, then function, then call), graded the
 * same way loop grades ideas — but read from disk instead of written by the agent. createCodeResolver turns
 * over:'s file pattern into items; planSweep/runSweep do the reuse-aware work, so an unchanged function costs
 * nothing on a later scan. Unlike loop: failing: is worst first, passing: and reused: are counts (not lists),
 * and the response carries an extra scanned: {layer: count, ...} line.
 */
import { providerIdentity } from '../classifier/select.ts';
import { configOf } from '../config/load.ts';
import { gradeItems, goalGate, sweepGate, worstFirst } from '../contract/grade.ts';
import { m, type Value } from '../contract/emit.ts';
import type { Category } from '../contract/types.ts';
import { effectiveMdlFields } from '../contract/mdl-fields.ts';
import { expandGlob } from '../evidence/glob.ts';
import { currentCommitSha } from '../evidence/git.ts';
import { createCodeResolver } from '../evidence/units.ts';
import type { NewContractRun } from '../ledger/log.ts';
import { cacheTelemetry, reusedAgeNotes } from '../ledger/reuse.ts';
import { actorOf, createdNote, preflight } from './pay.ts';
import { contractLimits, loadRequest } from './request.ts';
import { commonNotes, COST_ESTIMATED_NOTE, probeWarnings, respondText, reusedIds, sweepEntry, sweepNext, mdlRecorded } from './respond.ts';
import { itemRecords, planNeedsBudget, plannedCallCount, planSweep, recordSweep, runSweep, sweepDryRun } from './sweep.ts';
import type { VerbContext, VerbResult } from './types.ts';

// A scan only ever looks at what over: names — nothing says so if that misses the file most likely
// to matter. A short, fixed list (never grown per-project, never a stop): a real entrypoint or config file
// outside every over: pattern is worth a note, not silence. Never .env* — naming it here would invite sending
// secrets to the classifier via over: (AGENTS.md: secrets never in the project, config, ledger or output).
const ENTRYPOINT_GLOBS = ['server.js', 'app.js', 'index.js', 'main.js', 'config/**'];

// The note names at most this many missed paths, then says how many more — a config/** glob can match dozens
// of files, and spelling out every one works against "help first, be concise." [C-168]
const MISSED_SHOWN = 3;

/** The `where` a sweep run records (recorded for every verb): every item's own code path, unique,
 *  sorted, capped at 50 — a sweep's own `where` on the wire is always `[]` (over: names the files instead),
 *  but the run itself still touched real paths worth showing in `view`/`report`. */
const WHERE_CAP = 50;
function whereFromItems(items: readonly { unit?: { path: string } }[]): string[] {
  return [...new Set(items.flatMap((i) => (i.unit ? [i.unit.path] : [])))].sort().slice(0, WHERE_CAP);
}

/** Entrypoint/config files that exist in the project but were never one of this scan's own items (at any
 *  layer — unit.path is the same original file path all the way down file -> function -> call). undefined
 *  when there's nothing to say. */
function unlookedEntrypoints(root: string, items: readonly { unit?: { path: string } }[], maxFiles: number): string | undefined {
  const touched = new Set(items.flatMap((i) => (i.unit ? [i.unit.path] : [])));
  const missed = [...new Set(ENTRYPOINT_GLOBS.flatMap((pattern) => expandGlob(root, pattern, maxFiles).files))].filter((f) => !touched.has(f));
  if (!missed.length) return undefined;
  const shown = missed.slice(0, MISSED_SHOWN);
  const named = missed.length > shown.length ? `${shown.join(', ')}, … ${missed.length - shown.length} more` : shown.join(', ');
  return `entrypoints/config outside over: ${named} — add them to over: file if they matter here`;
}

export async function runScan(text: string, ctx: VerbContext): Promise<VerbResult> {
  // a project's own .mm3/config.yaml mdl: overrides apply to every mdl: block it validates.
  const cfg = configOf(ctx).config;
  const mdlFields = effectiveMdlFields(cfg.mdl);
  const loaded = loadRequest(text, 'scan', mdlFields, contractLimits(cfg, 'scan'));
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;
  const notes: string[] = [];

  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
  const plan = planSweep(request, who, ctx.paths, ctx.dryRun ?? false, { resolve: createCodeResolver(ctx.paths.root, notes, cfg.evidence.maxFiles) }, { sweep: cfg.sweep, reuse: cfg.reuse, evidence: cfg.evidence });

  if (ctx.dryRun) return sweepDryRun(plan, identity, probeWarnings(request.mak));

  const entrypointNote = unlookedEntrypoints(ctx.paths.root, plan.items, cfg.evidence.maxFiles);
  if (entrypointNote) notes.push(entrypointNote);

  // A fully-reused scan (every layer's call: null) must never be blocked by an already-reached cap.
  const pre = preflight(ctx, { needsBudget: planNeedsBudget(plan) });
  if (!pre.ok) return pre.result;

  const swept = await runSweep(ctx, 'scan', plan);
  if (!swept.ok) return swept.result;
  const { answers, costUsd, costEstimated, telemetry, statusOf } = swept.value;

  // The `?? []`, not a bang-assertion: a layer nobody asked about (like the contract example's `file`) has no
  // entry in mak.layers at all, and must still grade as 'none' rather than throw.
  const categoriesOf = (layer: string): readonly Category[] => request.mak.layers.find((l) => l.name === layer)?.categories ?? [];
  const grades = gradeItems(plan.items, categoriesOf, statusOf, answers);

  const goalAnswer = answers['goal'] as { kind: 'yesno'; p: number };
  const goalGrade = goalGate(goalAnswer.p);
  const gate = sweepGate(goalGrade, grades);

  const graded = [...grades.values()].filter((g) => g.status === 'asked' || g.status === 'reused');
  const worst = worstFirst(grades.values()); // every failing/unsure item, worst first — not tree order like loop
  const failing = m(...worst.map((g) => sweepEntry(g)));
  const passing = graded.filter((g) => g.ownGate === 'pass').length;
  const reused = graded.filter((g) => g.status === 'reused').length;
  const scanned = m(...plan.layers.map((l): [string, Value] => [l, plan.items.filter((i) => i.layer === l).length]));

  const calls = plannedCallCount(plan);

  const items = itemRecords(plan.items, grades);
  const reusedFromObj = Object.fromEntries(plan.reusedFrom);
  const reusedAges = reusedAgeNotes(ctx.paths, reusedIds(reusedFromObj));
  const fullTelemetry = [...telemetry, ...cacheTelemetry(ctx.paths, reusedFromObj)];

  const response = (id: string, budget: string): string =>
    respondText(
      m(
        ['id', id],
        ['gate', gate],
        ['goal', m(['gate', goalGrade], ['p', goalAnswer.p])],
        ['scanned', scanned],
        ['failing', failing],
        ['passing', passing],
        ['reused', reused],
      ),
      mdlRecorded(request.mdl),
      sweepNext(id, gate, worst, graded, 'act on it'),
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
    verb: 'scan',
    actor: actorOf(ctx),
    task: ctx.env.MM3_TASK?.trim() || null,
    goal: request.mak.goal,
    depth: request.mak.depth ?? null,
    where,
    parent: request.mak.parent ?? request.mdl?.parent ?? null,
    from: null,
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

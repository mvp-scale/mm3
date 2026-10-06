/**
 * `mm3 report [hits|patterns|history|web|graph|problems|mdl|calls|fields]`: the one way knowledge leaves
 * the ledger besides a run's own response — free, read-only, never calls a provider, no options beyond the view
 * name (`hits` default) and `fields`'s own `--accept <field>`. hits/patterns/history read through
 * `withIndex(..., {readOnly:true})`, exactly like `view.ts`, so they work unchanged on the linear-fallback path
 * too (no on-disk index, or Node < 22.13's own test hook); `web` (report-web.ts) reads the whole ledger directly
 * instead (it needs every run, not a capped index-backed view) and is the one view that writes something — a
 * self-contained `.mm3/viewer.html`. graph/problems/mdl/calls/fields read the graph tier
 * and/or the hot tier's own raw tables straight off disk (ledger/graph.ts) — each calls `ensureHotIndexFresh`
 * (a real, non-readOnly `withIndex` catch-up/rebuild of the HOT tier) and, for graph/problems/mdl/calls,
 * `refreshGraph` after it (readers refresh both tiers; the paid path never does), so these always reflect the
 * ledger even with no index.db yet or a stale one — see `ensureHotIndexFresh`'s own comment for why raw-SQL
 * readers need this and hits/patterns/history don't. A clean message replaces a stack trace when
 * `GraphUnavailableError` fires (Node < 22.13). `fields` reads undeclared `mdl.extras` keys
 * straight off the hot tier's own `runs.mdl` column and suggests a shape to promote one into `config.mdl`
 * with `--accept`.
 *   hits     — the newest run's own gate per place x category, worst first, flagging a one-subject answer
 *              whose code has since changed (re-derived live, on the bounded set of rows actually shown —
 *              never a full-ledger scan; see isStale below).
 *   patterns — every question-set fingerprint (ledger/index.ts's patternFingerprint) ever run, with its
 *              pass/fail/unsure split, places touched, and outcomes.
 *   history  — a merged, newest-first feed of `replay` results (fixed/regressed, derived from the replay run's
 *              own before/after answers — never a new ledger write) and recorded outcomes.
 *   web      — a place x concern consensus map, a heat map and a session summary, as one static HTML file
 *              (report-web.ts), opened in a browser when one is available.
 *   graph    — a small neighborhood (depth 2) around one `kind:label` target node (the second positional),
 *              rendered as `kind:label --predicate--> kind:label` lines. No target names is a clean note, never
 *              a whole-graph dump.
 *   problems — family x place gate counts (ledger/graph.ts's problemCounts), worst (most fail) first — the
 *              ranked, agent-facing knowledge pull.
 *   mdl     — every run's own mdl fields (ledger/graph.ts's mdlRows), newest first.
 *   calls    — telemetry rolled up by day/verb/model/source (ledger/graph.ts's callStats), default last 30 days.
 *   fields   — undeclared `mdl.extras` keys, with counts/samples and a suggested type to promote into
 *              `config.mdl` (closed/pattern/reference), or `no suggestion yet`; `--accept <field>` writes the
 *              suggestion into `.mm3/config.yaml`.
 */
import { configOf, type ResolvedConfig } from '../config/load.ts';
import { writeConfigOverride } from '../config/write.ts';
import { MDL_KEYS } from '../contract/mdl-fields.ts';
import { answerKey, subjectEvidence, subjectQuestions } from '../contract/translate.ts';
import { readCodeEvidence } from '../evidence/code.ts';
import {
  callStats,
  graphAround,
  type GraphEdge,
  GraphUnavailableError,
  problemCounts,
  refreshGraph,
  undeclaredFieldSamples,
  mdlRows,
} from '../ledger/graph.ts';
import { readRecordAt, stripLines, sweepPlaces, withIndex, type PatternRow } from '../ledger/index.ts';
import { isContractRun, isRun, type ContractRun, type LedgerRecord } from '../ledger/log.ts';
import type { Mm3Paths } from '../ledger/paths.ts';
import { realRunner, type Runner } from '../setup/runner.ts';
import { clip, hasControlChars } from '../util/text.ts';
import { gradeReplay } from './replay.ts';
import { runReportWeb, type ReportWebContext } from './report-web.ts';
import { stopText } from './request.ts';
import type { VerbResult } from './types.ts';

export interface ReportContext {
  paths: Mm3Paths;
  /** Resolved once at the request entry (see VerbContext.config); read by `fields`. */
  config?: ResolvedConfig;
  /** Only 'web' needs these; every other view ignores them. Optional so every existing call site (a pure read)
   *  stays unchanged — defaulted to the real process env/runner/platform when 'web' actually needs them. */
  env?: Record<string, string | undefined>;
  runner?: Runner;
  platform?: NodeJS.Platform;
}

const VIEWS = ['hits', 'patterns', 'history', 'web', 'graph', 'problems', 'mdl', 'calls', 'fields'] as const;
type ReportView = (typeof VIEWS)[number];
const isView = (s: string): s is ReportView => (VIEWS as readonly string[]).includes(s);

const VIEW_LIST_TEXT = 'hits, patterns, history, web, graph, problems, mdl, calls or fields';

const ROW_LIMIT = 30;

/** Every view caps its rows the same way: show up to `ROW_LIMIT`, worst/newest first,
 *  and say plainly how many more exist rather than silently dropping them. */
function withCap(lines: readonly string[], total: number): string[] {
  const shown = lines.slice(0, ROW_LIMIT);
  return total > shown.length ? [...shown, `… ${total - shown.length} more not shown`] : [...shown];
}

const heading = (view: ReportView, n: number, noun: string): string => `mm3 report ${view} · ${n} ${noun}${n === 1 ? '' : 's'}`;

/** A one-subject run's category answer is stale when the code at its own `where` has changed since: re-derive
 *  the current evidence key for one of that category's questions (the same way class.ts computed it originally)
 *  and compare to the run's own stored key. A sweep item's evidence isn't reconstructed here (its own text
 *  isn't just "the file" — evidence/units.ts builds it), so it's always reported as fresh. */
function isStale(root: string, rec: ContractRun, categoryName: string): boolean {
  const cat = rec.ask.categories.find((c) => c.name === categoryName);
  if (!cat || !cat.questions.length) return false;
  const [q] = subjectQuestions([cat]);
  const evidence = readCodeEvidence(root, rec.where);
  if (!evidence.ok) return true; // the code this run read can't even be re-read the same way any more
  const key = answerKey(subjectEvidence(evidence.evidence.files), q!);
  return rec.keys[q!.id] !== key;
}

interface HitRow {
  place: string;
  category: string;
  gate: string;
  runId: string;
  goal: string;
  /** Present only for a one-subject row — the record to re-check staleness against, deferred until we know
   *  this row survives the ROW_LIMIT cap (C-163: never a full-ledger, or full-result, re-read). undefined for
   *  a sweep item's row, which is never marked stale. */
  rec?: ContractRun;
}

const GATE_RANK: Record<string, number> = { fail: 0, unsure: 1, pass: 2 };

function reportHits(paths: Mm3Paths): VerbResult {
  const rows = withIndex(
    paths,
    (handle) => {
      const out: HitRow[] = [];
      const places = handle.distinctPlaces().filter((p) => p.kind === 'where');
      for (const { val: place } of places) {
        const newest = handle.placeCandidates(place).at(-1); // oldest-first: the last one is the newest
        if (!newest) continue;
        const rec = readRecordAt(paths.log, newest.offset);
        if (!rec || !isContractRun(rec)) continue;
        if (rec.items === null) {
          for (const [category, gate] of Object.entries(rec.categories)) {
            out.push({ place, category, gate, runId: rec.id, goal: rec.goal, rec });
          }
        } else {
          for (const item of Object.values(rec.items)) {
            if (item.unit?.path !== place) continue;
            for (const [category, gate] of Object.entries(item.categories)) out.push({ place, category, gate, runId: rec.id, goal: rec.goal });
          }
        }
      }
      return out;
    },
    { readOnly: true },
  );
  if (!rows.length) return { exit: 0, text: 'mm3 report hits · no runs yet → "mm3 class <request>" starts one' };
  rows.sort((a, b) => GATE_RANK[a.gate]! - GATE_RANK[b.gate]! || a.place.localeCompare(b.place) || a.category.localeCompare(b.category));
  // C-163: the stale re-read only ever runs for rows that actually make it into the capped output below.
  const shown = rows.slice(0, ROW_LIMIT);
  const lines = shown.map((r) => {
    const stale = r.rec ? isStale(paths.root, r.rec, r.category) : false;
    return `${clip(r.place, 50)} · ${r.category} ${r.gate} · ${r.runId} "${clip(r.goal, 40)}"${stale ? ' · stale' : ''}`;
  });
  return { exit: 0, text: [heading('hits', rows.length, 'row'), ...withCap(lines, rows.length)].join('\n') };
}

function reportPatterns(paths: Mm3Paths): VerbResult {
  const rows: PatternRow[] = withIndex(paths, (h) => h.patternCounts(), { readOnly: true });
  if (!rows.length) return { exit: 0, text: 'mm3 report patterns · no runs yet → "mm3 class <request>" starts one' };
  const lines = rows.map(
    (r) =>
      `${r.pattern} · runs ${r.runs} · places ${r.places} · pass ${r.pass} fail ${r.fail} unsure ${r.unsure} · ` +
      `held ${r.outcomes.held} overruled ${r.outcomes.overruled} failed ${r.outcomes.failed} open ${r.outcomes.open}`,
  );
  return { exit: 0, text: [heading('patterns', rows.length, 'pattern'), ...withCap(lines, rows.length)].join('\n') };
}

/** Every place a run (of either shape) touched, for one display line — the same sources view.ts's own place
 *  matching reads from, just joined rather than matched against one target. */
function placesOf(rec: LedgerRecord | undefined): string {
  if (!rec) return '(unknown place)';
  if (isRun(rec)) return rec.where.map((w) => w.path).join(', ') || '(no place)';
  if (!isContractRun(rec)) return '(unknown place)';
  const ws = rec.where.map(stripLines);
  if (ws.length) return ws.join(', ');
  const sweep = sweepPlaces(rec)
    .filter((p) => p.kind === 'where')
    .map((p) => p.val);
  return sweep.length ? sweep.join(', ') : '(no place)';
}

/** `replay` results turn into 'fixed'/'regressed' from the run's OWN before/after answers — `replay.ts`'s
 *  `gradeReplay`, shared rather than copied, is the same regression call `replay` itself already made (any
 *  regression anywhere wins over any fix). Never the parent's stored gate, which can be stale by the time this
 *  reads it. A run that changed nothing worth naming (every category held steady) yields no row at all. */
function replayStatus(rec: ContractRun): 'fixed' | 'regressed' | undefined {
  const graded = gradeReplay(rec.ask.categories, rec.answers);
  if (graded.regressed.length) return 'regressed';
  return graded.categories.some((c) => c.before !== 'pass' && c.after === 'pass') ? 'fixed' : undefined;
}

function reportHistory(paths: Mm3Paths): VerbResult {
  const rows = withIndex(
    paths,
    (handle) => {
      const out: { ts: string; text: string }[] = [];
      for (const { offset } of handle.recentReplays(ROW_LIMIT)) {
        const rec = readRecordAt(paths.log, offset);
        if (!rec || !isContractRun(rec)) continue;
        const status = replayStatus(rec);
        if (!status) continue;
        out.push({ ts: rec.ts, text: `${placesOf(rec)} · ${rec.id} replay · ${status}` });
      }
      for (const o of handle.recentOutcomes(ROW_LIMIT)) {
        const runOffset = handle.findOffset(o.runId);
        const rec = runOffset === undefined ? undefined : readRecordAt(paths.log, runOffset);
        out.push({ ts: o.ts, text: `${placesOf(rec)} · ${o.runId} · ${o.outcome} by ${o.by}` });
      }
      return out;
    },
    { readOnly: true },
  );
  if (!rows.length) return { exit: 0, text: 'mm3 report history · nothing yet → run "replay" or "outcome" to start one' };
  rows.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return { exit: 0, text: [heading('history', rows.length, 'event'), ...withCap(rows.map((r) => r.text), rows.length)].join('\n') };
}

/** graph/problems/mdl/calls/fields are readers of the graph tier (ledger/graph.ts) and/or the hot tier's own
 *  raw tables (ledger/index.ts's `runs`/`categories`/`places`), read straight off disk via `ledger/graph.ts`'s
 *  own SQL — unlike hits/patterns/history (which go through `withIndex(..., {readOnly:true})`'s `IndexHandle`
 *  and so can never be wrong, only slow, when the on-disk index is stale: a stale check falls back to a full
 *  in-memory scan), these five have no such fallback. A caller that skipped this and opened `paths.index`
 *  directly would show whatever the hot tier last happened to have on disk — missing entirely (no index.db
 *  yet: every one of these tables, not just the graph tier's, is absent) or short by however many runs landed
 *  since the last write-path catch-up (nothing about a `class`/`scan`/etc. call guarantees a report reader will
 *  run again before the ledger grows further). `ensureHotIndexFresh` below is the fix: the exact same
 *  self-heal/catch-up a real writer already gets (`withIndex`, non-readOnly), just triggered from a read
 *  command instead — so "the ledger is always the truth" holds for every `report` view, not only the three
 *  that happened to go through `IndexHandle` already. */
function ensureHotIndexFresh(paths: Mm3Paths): void {
  withIndex(paths, () => undefined);
}

function graphUnavailableText(view: ReportView): string {
  return `mm3 report ${view} · graph needs node:sqlite (Node ≥ 22.13) → see "mm3 doctor"`;
}

/** Runs `fn` after ensuring BOTH tiers are fresh, turning `GraphUnavailableError` into the shared plain message
 *  above rather than letting it propagate as a stack trace. Any other error still propagates (a real bug, never
 *  swallowed). Order matters: `ensureHotIndexFresh` runs FIRST — a hot-tier rebuild replaces the whole
 *  `index.db` file (ledger/index.ts's `rebuildToDisk`), which would silently wipe an already-fresh graph tier's
 *  own `nodes`/`triples` tables if it ran after `refreshGraph`; running it first means `refreshGraph` always
 *  gets the last word, self-healing from byte 0 if that just happened (exactly the "harmless" case its own
 *  header comment already documents), never leaving the graph tier stale behind a hot-tier rebuild it can't see. */
function withGraphView(paths: Mm3Paths, env: Record<string, string | undefined>, view: ReportView, fn: () => VerbResult): VerbResult {
  try {
    ensureHotIndexFresh(paths);
    refreshGraph(paths, env);
  } catch (e) {
    if (e instanceof GraphUnavailableError) return { exit: 0, text: graphUnavailableText(view) };
    throw e;
  }
  return fn();
}

function reportProblems(paths: Mm3Paths, env: Record<string, string | undefined>): VerbResult {
  return withGraphView(paths, env, 'problems', () => {
    // problemCounts already ranks worst (most fail) first; the max limit is requested here so `withCap` below
    // reports an accurate "… N more not shown" count rather than one capped twice.
    const rows = problemCounts(paths, { limit: 500 });
    if (!rows.length) return { exit: 0, text: 'mm3 report problems · no runs yet → "mm3 class <request>" starts one' };
    const lines = rows.map((r) => `${r.family} × ${clip(r.place, 50)} · fail ${r.fail} unsure ${r.unsure} pass ${r.pass}`);
    return { exit: 0, text: [heading('problems', rows.length, 'row'), ...withCap(lines, rows.length)].join('\n') };
  });
}

function reportMdl(paths: Mm3Paths, env: Record<string, string | undefined>): VerbResult {
  return withGraphView(paths, env, 'mdl', () => {
    const rows = mdlRows(paths, { limit: 1000 }); // already newest-first (ORDER BY ts DESC)
    if (!rows.length) return { exit: 0, text: 'mm3 report mdl · no runs yet → "mm3 class <request>" starts one' };
    const lines = rows.map(
      (r) =>
        `${r.id} ${r.verb} · why:${r.why ?? '—'} area:${r.area ?? '—'} stage:${r.stage ?? '—'} change:${r.change ?? '—'} risk:${r.risk ?? '—'} blast:${r.blast ?? '—'}` +
        (r.problem ? ` · ${clip(r.problem, 60)}` : ''),
    );
    return { exit: 0, text: [heading('mdl', rows.length, 'run'), ...withCap(lines, rows.length)].join('\n') };
  });
}

function reportCalls(paths: Mm3Paths, env: Record<string, string | undefined>): VerbResult {
  return withGraphView(paths, env, 'calls', () => {
    const rows = callStats(paths, {}); // its own default window (last 30 days) and cap — not overridden here
    if (!rows.length) return { exit: 0, text: 'mm3 report calls · no calls in the last 30 days → "mm3 class <request>" starts one' };
    rows.sort((a, b) => b.day.localeCompare(a.day) || a.verb.localeCompare(b.verb) || a.model.localeCompare(b.model) || a.source.localeCompare(b.source));
    const lines = rows.map((r) => `${r.day} · ${r.verb} · ${r.model} (${r.source}) · calls ${r.calls} · tokens ${r.tokens} · cost $${r.costUsd.toFixed(4)} · saved $${r.savedUsd.toFixed(4)}`);
    return { exit: 0, text: [heading('calls', rows.length, 'row'), ...withCap(lines, rows.length)].join('\n') };
  });
}

/** The inverse of `graph.ts`'s own `gateScore` (pass/fail/unsure → 1/0/0.5), for display on a `judged` edge.
 *  undefined for any other score (including null: an edge with no score at all, e.g. `checks`). */
function gateWord(score: number | null): string | undefined {
  if (score === 0) return 'fail';
  if (score === 0.5) return 'unsure';
  if (score === 1) return 'pass';
  return undefined;
}

interface EdgeGroup {
  p: string;
  s: number;
  o: number;
  score: number | null;
  provenance: string;
  runs: string[];
}

/** Aggregates duplicate edges — the same (s, p, o, score, provenance) witnessed by more than one run — into one
 *  group, so `report graph` shows one line with a `×N` run count rather than N near-identical lines (controller
 *  fix, 2026-09-28). `score` is part of the grouping key on purpose: two runs that judged the same
 *  category×place pair DIFFERENTLY (a fix landed between them) are a genuine disagreement worth keeping as
 *  separate lines, never silently merged into one "average" verdict. */
function groupEdges(edges: readonly GraphEdge[]): EdgeGroup[] {
  const byKey = new Map<string, EdgeGroup>();
  for (const e of edges) {
    const key = `${e.p}\u0000${e.s}\u0000${e.o}\u0000${e.score ?? ''}\u0000${e.provenance}`;
    let g = byKey.get(key);
    if (!g) {
      g = { p: e.p, s: e.s, o: e.o, score: e.score, provenance: e.provenance, runs: [] };
      byKey.set(key, g);
    }
    if (!g.runs.includes(e.run)) g.runs.push(e.run);
  }
  return [...byKey.values()];
}

/** Up to 3 run ids shown in full; more than that, a sorted first..last range — "the list/first-last of runs"
 *  the controller fix asked for. */
function runsLabel(runs: readonly string[]): string {
  const sorted = [...runs].sort();
  return sorted.length <= 3 ? sorted.join(', ') : `${sorted[0]}..${sorted[sorted.length - 1]}`;
}

/** One `report graph` line: `s --p[ gate (p score[, ×N])]--> o (provenance) [runs]`. A `judged` edge shows its
 *  gate word and score; any edge witnessed by more than one run shows a `×N` count; every edge — not only an
 *  `inferred` one — always shows its own provenance (extracted | declared | inferred) and witnessing run(s). */
function renderEdge(byId: Map<number, string>, g: EdgeGroup): string {
  const sLabel = byId.get(g.s) ?? String(g.s);
  const oLabel = byId.get(g.o) ?? String(g.o);
  const word = gateWord(g.score);
  const count = g.runs.length;
  const pred =
    word !== undefined
      ? count > 1
        ? `${g.p} ${word} (p ${g.score}, ×${count})`
        : `${g.p} ${word} (p ${g.score})`
      : count > 1
        ? `${g.p} (×${count})`
        : g.p;
  return `${sLabel} --${pred}--> ${oLabel} (${g.provenance}) [${runsLabel(g.runs)}]`;
}

function reportGraph(paths: Mm3Paths, env: Record<string, string | undefined>, target: string | undefined): VerbResult {
  return withGraphView(paths, env, 'graph', () => {
    const t = target?.trim();
    if (!t) return { exit: 0, text: 'mm3 report graph · name a target → mm3 report graph <kind>:<label> (e.g. category:injection)' };
    const colon = t.indexOf(':');
    if (colon <= 0 || colon === t.length - 1) {
      return { exit: 2, text: stopText([`✖ report graph: "${clip(t, 40)}" is not kind:label → e.g. category:injection`], 'report') };
    }
    const kind = t.slice(0, colon);
    const label = t.slice(colon + 1);
    const { nodes, edges } = graphAround(paths, { kind, label, depth: 2 });
    if (!nodes.length) return { exit: 0, text: `mm3 report graph ${t} · not found → run "mm3 class <request>" first, or check the kind:label spelling` };
    const byId = new Map(nodes.map((n) => [n.id, `${n.kind}:${n.label}`]));
    const groups = groupEdges(edges);
    const lines = groups.map((g) => renderEdge(byId, g));
    const headingLine = `mm3 report graph ${t} · ${groups.length} edge${groups.length === 1 ? '' : 's'} (depth 2, ${nodes.length} node${nodes.length === 1 ? '' : 's'})`;
    return { exit: 0, text: [headingLine, ...withCap(lines, groups.length)].join('\n') };
  });
}

/** ≤8 distinct values across ≥5 runs → closed; else one fixed candidate regex (most specific first) matching
 *  every value → pattern; else every value looks like a where/route path (contains "/" and ends in a short
 *  extension-like suffix) → reference (`link: where`); else no suggestion yet ("foundational only" —
 *  no attempt to correlate a value back to a specific run's own `where` list). */
interface FieldSuggestion {
  kind: 'closed' | 'pattern' | 'reference';
  values?: string[];
  pattern?: string;
}

const CLOSED_MAX_DISTINCT = 8;
const CLOSED_MIN_RUNS = 5;

const PATTERN_CANDIDATES: readonly RegExp[] = [
  /^\d+$/u, // numeric — most specific
  /^\d+\.\d+\.\d+(?:[-+][\w.]+)?$/u, // semver-ish
  /^[\w.-]+$/u, // identifier-like — broadest, tried last
];

const isPathLike = (v: string): boolean => v.includes('/') && /\.[A-Za-z0-9]{1,8}$/u.test(v);

function classifyField(count: number, values: readonly string[]): FieldSuggestion | undefined {
  if (!values.length) return undefined;
  if (values.length <= CLOSED_MAX_DISTINCT && count >= CLOSED_MIN_RUNS) return { kind: 'closed', values: [...values] };
  for (const re of PATTERN_CANDIDATES) {
    if (values.every((v) => re.test(v))) return { kind: 'pattern', pattern: re.source };
  }
  if (values.every(isPathLike)) return { kind: 'reference' };
  return undefined;
}

function suggestionText(s: FieldSuggestion | undefined): string {
  if (!s) return 'no suggestion yet — not enough signal';
  if (s.kind === 'closed') return `closed [${s.values!.join(', ')}]`;
  if (s.kind === 'pattern') return `pattern: ${s.pattern}`;
  return 'reference (link: where)';
}

function reportFields(paths: Mm3Paths, env: Record<string, string | undefined>, accept: string | undefined, resolved?: ResolvedConfig): VerbResult {
  ensureHotIndexFresh(paths); // fields reads the hot tier's own `runs.mdl` column directly; see ensureHotIndexFresh's own comment
  const { config } = configOf({ paths, env, config: resolved });
  const knownKeys = [...MDL_KEYS, ...Object.keys(config.mdl)];
  const fields = undeclaredFieldSamples(paths, { knownKeys });

  if (accept !== undefined) {
    const field = fields.find((f) => f.key === accept);
    if (!field) {
      return { exit: 2, text: stopText([`✖ report fields --accept: "${clip(accept, 40)}" is not an undeclared field → run "mm3 report fields" to see what's available`], 'report') };
    }
    const suggestion = classifyField(field.count, field.values);
    if (!suggestion) {
      return { exit: 2, text: stopText([`✖ report fields --accept: "${clip(accept, 40)}" has no suggestion yet → not enough signal, keep collecting runs`], 'report') };
    }
    const patch =
      suggestion.kind === 'closed'
        ? { mdl: { [accept]: { values: suggestion.values! } } }
        : suggestion.kind === 'pattern'
          ? { mdl: { [accept]: { pattern: suggestion.pattern! } } }
          : { mdl: { [accept]: { link: 'where' } } };
    writeConfigOverride(paths, patch);
    const shown = suggestion.kind === 'closed' ? `values: [${suggestion.values!.join(', ')}]` : suggestion.kind === 'pattern' ? `pattern: ${suggestion.pattern}` : 'link: where';
    return { exit: 0, text: `mm3 report fields --accept ${accept} · wrote mdl.${accept} (${shown}) to .mm3/config.yaml` };
  }

  if (!fields.length) return { exit: 0, text: 'mm3 report fields · no undeclared fields yet → every mdl key so far is a base field or already configured' };
  const lines = fields.map((f) => `${f.key} (${f.count} run${f.count === 1 ? '' : 's'}) · samples: ${f.samples.join(', ') || '(no values)'} · suggest: ${suggestionText(classifyField(f.count, f.values))}`);
  return { exit: 0, text: [heading('fields', fields.length, 'field'), ...withCap(lines, fields.length)].join('\n') };
}

export function runReport(view: string | undefined, ctx: ReportContext, target?: string, accept?: string): VerbResult {
  const requested = view?.trim() || 'hits';
  if (hasControlChars(requested)) return { exit: 2, text: stopText([`✖ report: the view name has control characters → use ${VIEW_LIST_TEXT}`], 'report') };
  if (!isView(requested)) return { exit: 2, text: stopText([`✖ report: "${clip(requested, 40)}" is not a view → use ${VIEW_LIST_TEXT}`], 'report') };
  const env = ctx.env ?? process.env;
  if (requested === 'hits') return reportHits(ctx.paths);
  if (requested === 'patterns') return reportPatterns(ctx.paths);
  if (requested === 'history') return reportHistory(ctx.paths);
  if (requested === 'graph') return reportGraph(ctx.paths, env, target);
  if (requested === 'problems') return reportProblems(ctx.paths, env);
  if (requested === 'mdl') return reportMdl(ctx.paths, env);
  if (requested === 'calls') return reportCalls(ctx.paths, env);
  if (requested === 'fields') return reportFields(ctx.paths, env, accept, ctx.config);
  return runReportWeb({ paths: ctx.paths, env, runner: ctx.runner ?? realRunner, platform: ctx.platform ?? process.platform } satisfies ReportWebContext);
}

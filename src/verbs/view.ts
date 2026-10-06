/**
 * view: "what do we already know here?" Free and read-only (no classifier call, no budget, no ledger write).
 * Three modes on one input string: a `mak:`/JSON draft is request mode (the contract's own cache check —
 * runs, per-category record, and `reuse` when the exact question set was asked before); otherwise the raw
 * string is a place (a folder or tag, showing the newest 10/20/30 runs with outcome counts) or a run id
 * (showing its lineage up and down). Rehearsal-adapter runs (fake, chaos) are labelled and counted apart.
 * The hot cache replaces the linear reads without changing the output. `--answers` adds, for a
 * run id only, one line per question that run actually asked: its text, its checked answer, whether it was
 * reused (and from which run id), and its answer key.
 */
import path from 'node:path';
import { providerIdentity } from '../classifier/select.ts';
import { isRehearsal } from '../classifier/port.ts';
import type { ResolveStored } from '../classifier/typesafe/client.ts';
import { configOf, type ResolvedConfig } from '../config/load.ts';
import { m, type Value } from '../contract/emit.ts';
import { fillBlanks } from '../contract/layers.ts';
import { answerKey, goalQuestion, subjectEvidence, subjectQuestions } from '../contract/translate.ts';
import { effectiveMdlFields } from '../contract/mdl-fields.ts';
import { readCodeEvidence } from '../evidence/code.ts';
import type { Answer, Gate } from '../contract/types.ts';
import { RUN_ID } from '../ledger/ids.ts';
import { readRecordAt, stripLines, sweepPlaces, withIndex, type IndexHandle } from '../ledger/index.ts';
import { appendLookup, findRun, isContractRun, isRun, latestOutcome, readLedger, type ContractRun, type Outcome, type RunRecord } from '../ledger/log.ts';
import type { Mm3Paths } from '../ledger/paths.ts';
import { exactReuse, reuseAge } from '../ledger/reuse.ts';
import type { Level } from '../lens/request.ts';
import { clip, hasControlChars } from '../util/text.ts';
import { contractLimits, loadRequest, stopText } from './request.ts';
import { respondText, mdlRecorded } from './respond.ts';
import type { VerbResult } from './types.ts';

/** view never spends and never picks a live provider: just enough of VerbContext to read the ledger and evidence.
 *  `resolveStored`, when given, lets `providerIdentity` below see a keychain/user-file key too, the same as
 *  `doctor`/`agent` — see VerbContext's own note on why this matters for reuse-key matching. */
export interface ViewContext {
  paths: Mm3Paths;
  env: Record<string, string | undefined>;
  /** Resolved once at the request entry (see VerbContext.config). */
  config?: ResolvedConfig;
  resolveStored?: ResolveStored;
}

type AnyRun = RunRecord | ContractRun;

const REQUEST_MODE = /^mak\s*:/mu;

function runLine(r: AnyRun, outcome: Outcome | 'open'): string {
  const rehearsal = isRehearsal(r.adapter) ? ' · rehearsal' : '';
  const line = isRun(r)
    ? `${r.id} ${r.ts.slice(0, 10)} ${r.verb} L${r.level} ${r.consensus} ${r.verdict} "${clip(r.focus, 48)}" · ${outcome}`
    : `${r.id} ${r.ts.slice(0, 10)} ${r.verb} ${r.depth ?? '-'} ${r.gate} "${clip(r.goal, 48)}" · ${outcome}`;
  return `${clip(line, 120 - rehearsal.length)}${rehearsal}`;
}

/** A sweep's own category tags (ask.layers[].categories[].tags) count as tags too, alongside a Plan 1
 *  run's own `tags` array — the two shapes' only source of a tag. */
const tagsMatch = (r: AnyRun, place: string): boolean => {
  if (isRun(r)) return r.tags.includes(place);
  return isContractRun(r) && r.ask.layers.some((l) => l.categories.some((c) => c.tags.includes(place)));
};

/** A path or a path prefix ("place/…"). */
const pathMatches = (p: string, place: string): boolean => p === place || p.startsWith(`${place}/`);

function whereMatches(r: AnyRun, place: string): boolean {
  if (isRun(r)) return r.where.some((w) => pathMatches(w.path, place));
  if (r.where.some((w) => pathMatches(stripLines(w), place))) return true;
  // A sweep's own `where` is always [] — its real locations live in items[id].unit.path.
  return isContractRun(r) && !!r.items && Object.values(r.items).some((it) => !!it.unit && pathMatches(it.unit.path, place));
}

/** A folder, a tag or a path as a project-relative place; an absolute path inside the project is fine. */
function toPlace(target: string, root: string): { place: string } | { stop: string } {
  if (hasControlChars(target)) return { stop: stopText(['✖ view: the target has control characters → use a folder, a tag, or MM3-####'], 'view') };
  if (!path.isAbsolute(target) && !target.split(/[\\/]/).includes('..')) return { place: target.replace(/^\.\//, '').replace(/\/+$/, '') || '.' };
  const rel = path.relative(root, path.resolve(root, target));
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { stop: stopText([`✖ view: "${clip(target, 60)}" is outside the project → use a folder inside it, a tag, or MM3-####`], 'view') };
  }
  return { place: rel.split(path.sep).join('/') || '.' };
}

/** Renders byPlace's response for `hits`, already in ledger append order (oldest first) — shared by the
 *  full-scan path ('.') and the index-backed path, which differ only in how `hits` and `outcomeOf` were built. */
function renderPlace(place: string, hits: readonly AnyRun[], outcomeOf: (id: string) => Outcome | undefined, limit: number): VerbResult {
  if (!hits.length) return { exit: 0, text: `mm3 view ${clip(place, 60)} · no runs yet → "mm3 class <request>" starts one` };
  const counts = { held: 0, overruled: 0, failed: 0, open: 0 };
  let rehearsal = 0;
  for (const r of hits) {
    if (isRehearsal(r.adapter)) rehearsal += 1;
    else counts[outcomeOf(r.id) ?? 'open'] += 1;
  }
  const head = `mm3 view ${clip(place, 60)} · ${hits.length} run${hits.length === 1 ? '' : 's'} · held ${counts.held} · overruled ${counts.overruled} · failed ${counts.failed} · open ${counts.open}${rehearsal ? ` · rehearsal ${rehearsal}` : ''}`;
  const shown = hits.slice(-limit).reverse();
  const older = hits.length - shown.length;
  return {
    exit: 0,
    text: [head, ...shown.map((r) => runLine(r, outcomeOf(r.id) ?? 'open')), ...(older ? [`… ${older} older → raise the level to see more`] : [])].join('\n'),
  };
}

const GATE_RANK: Record<Gate, number> = { fail: 0, unsure: 1, pass: 2 };

/** `--summary`: one line per distinct place — a `where` path, or (a sweep's own `where` is always [])
 *  an item's own code path — from the LATEST contract run that touched it (ledger append order, so a later
 *  entry in `hits` simply overwrites an earlier one in the map), worst gate first. The free onboarding
 *  briefing: read this before class, instead of hand-assembling it from several `view <folder>` calls. A
 *  legacy (Plan 1) run has no gate/categories to summarize and is skipped, same as view's own per-category
 *  "categories:" breakdown in request mode. */
function renderSummary(scope: string, hits: readonly AnyRun[]): VerbResult {
  const latest = new Map<string, ContractRun>();
  for (const r of hits) {
    if (!isContractRun(r)) continue;
    for (const w of r.where.map(stripLines)) latest.set(w, r);
    for (const p of sweepPlaces(r)) if (p.kind === 'where') latest.set(p.val, r);
  }
  if (!latest.size) return { exit: 0, text: `mm3 view ${clip(scope, 60)} --summary · no runs yet → "mm3 class <request>" starts one` };
  const rows = [...latest.entries()].sort(([pa, ra], [pb, rb]) => GATE_RANK[ra.gate] - GATE_RANK[rb.gate] || pa.localeCompare(pb));
  return {
    exit: 0,
    text: [
      `mm3 view ${clip(scope, 60)} --summary · ${rows.length} place${rows.length === 1 ? '' : 's'}`,
      ...rows.map(([place, r]) => `${clip(place, 60)} · ${r.verb} ${r.gate} · ${r.id} "${clip(r.goal, 48)}"`),
    ].join('\n'),
  };
}

/** place mode, the full-scan way: every run in the ledger, filtered by whereMatches/tagsMatch. Used for '.'
 *  (every run — the index's place table has nothing narrower to offer there) and as byPlaceIndexed's own
 *  fallback if the index can't be used for some reason (paths.log missing is handled the same way either path). */
function byPlaceFullScan(place: string, paths: Mm3Paths, limit: number, summary: boolean): VerbResult {
  const records = readLedger(paths, { partialTail: true });
  const runs = records.filter((r): r is AnyRun => isRun(r) || isContractRun(r));
  const hits = runs.filter((r) => place === '.' || tagsMatch(r, place) || whereMatches(r, place));
  if (summary) return renderSummary(place, hits);
  return renderPlace(place, hits, (id) => latestOutcome(records, id) ?? undefined, limit);
}

/**
 * place mode, index-backed (place history is served via the index): `placeCandidates` narrows to the
 * ids whose where/tag entries could match `place` (oldest first, by offset), each pread by offset instead of
 * streaming the whole log. Every candidate is still re-checked against the real record with the EXACT same
 * whereMatches/tagsMatch predicate byPlaceFullScan uses — the index is a candidate generator, never the final
 * word — so a stale offset, a missed escape, or any other index quirk can only cost a wasted pread, never a
 * wrong answer. `outcomesFor` replaces the old per-hit `latestOutcome(records, id)` rescan (O(hits × records))
 * with one batched query over just the hit ids.
 */
function byPlaceIndexed(place: string, paths: Mm3Paths, limit: number, summary: boolean): VerbResult {
  // readOnly: view is free and read-only (dry runs and free reads write nothing) — it must
  // never be the thing that persists a catch-up or rebuild of index.db to disk.
  return withIndex(
    paths,
    (handle) => {
      const hits: AnyRun[] = [];
      for (const { offset } of handle.placeCandidates(place)) {
        const rec = readRecordAt(paths.log, offset);
        if (rec && (isRun(rec) || isContractRun(rec)) && (tagsMatch(rec, place) || whereMatches(rec, place))) hits.push(rec);
      }
      if (summary) return renderSummary(place, hits);
      const outcomes = handle.outcomesFor(hits.map((r) => r.id));
      return renderPlace(place, hits, (id) => outcomes.get(id), limit);
    },
    { readOnly: true },
  );
}

/** B4: a place browse (a folder, a tag, or '.') is logged too, free — the same "what agents search
 *  for" signal request mode's own draft check already gave (`kind: 'lookup'`, no MM3-#### id, never counted
 *  toward the budget or any run total). There's no exact-answer reuse to report for a bare place browse (that
 *  concept only applies to a real draft check's own question set), so `hit`/`reused` are always false/null here
 *  — `goal` carries the place string itself, so the record still says WHAT was searched for. */
function byPlace(place: string, paths: Mm3Paths, limit: number, summary: boolean): VerbResult {
  const result = place === '.' ? byPlaceFullScan(place, paths, limit, summary) : byPlaceIndexed(place, paths, limit, summary);
  appendLookup(paths, { goal: place, where: [place], hit: false, reused: null });
  return result;
}

/** The run at this id, from `handle`'s own offset — undefined for an id it doesn't have, or a stale offset whose
 *  real record no longer matches (never trusted blindly, same discipline as findRun's matchingRun). */
function runAt(paths: Mm3Paths, handle: IndexHandle, id: string): AnyRun | undefined {
  const offset = handle.findOffset(id);
  if (offset === undefined) return undefined;
  const rec = readRecordAt(paths.log, offset);
  return rec && (isRun(rec) || isContractRun(rec)) && rec.id === id ? rec : undefined;
}

/** Every run whose real record's own `parent` is exactly `parentId`, oldest first — `handle.childrenOf` is a
 *  candidate set (see its own doc comment); each one is re-read and re-checked before being trusted. */
function childrenAt(paths: Mm3Paths, handle: IndexHandle, parentId: string): AnyRun[] {
  const out: AnyRun[] = [];
  for (const { offset } of handle.childrenOf(parentId)) {
    const rec = readRecordAt(paths.log, offset);
    if (rec && (isRun(rec) || isContractRun(rec)) && rec.parent === parentId) out.push(rec);
  }
  return out;
}

/**
 * view <id>, index-backed (lineage is served via the index): "up" is an ordinary run-by-id walk (each
 * ancestor's own `parent` field points at the next one, resolved through the SAME findOffset lookup findRun
 * uses elsewhere — no schema change needed for this direction); "down" is a level-order walk of the NEW `parent`
 * column (childrenAt), oldest child first per level — the same order the old full-ledger scan always produced,
 * since it walked `runs` in ledger append order too. `outcomesFor` replaces the old per-id `latestOutcome`
 * rescan (O(lineage × ledger)) with one batched query over just the ids actually shown. readOnly: view is free
 * and read-only, and must never be the thing that persists a catch-up/rebuild of index.db to disk.
 */
/** `--level` on a run id controls answer DETAIL about the run itself, in addition to how many lineage
 *  rows are shown (level * 10, regardless of depth). Level 1: nothing
 *  extra (today's one-line summary). Level 2: the run's own category gates (a one-subject run), or an items
 *  summary (a sweep, whose `categories` is always {} — docs/contract.md). Level 3: adds its notes and adapter/model.
 *  A legacy (Plan 1) run has none of this stored, so every level above 1 is silently a no-op for it. */
function detailLines(self: AnyRun, level: Level): string[] {
  if (level < 2 || !isContractRun(self)) return [];
  const lines: string[] = [];
  const cats = Object.entries(self.categories);
  if (cats.length) lines.push(`  categories: ${cats.map(([n, g]) => `${n}=${g}`).join(', ')}`);
  else if (self.items) {
    const items = Object.values(self.items);
    const failing = items.filter((it) => it.gate !== 'pass').length;
    lines.push(`  items: ${items.length} (${failing} failing)`);
  }
  if (level >= 3) {
    if (self.notes.length) lines.push(`  notes: ${self.notes.join('; ')}`);
    lines.push(`  adapter: ${self.adapter} · model: ${self.model}`);
  }
  return lines;
}

/** One dist-shaped answer's winning entry (same "highest share wins" pick as contract/grade.ts's own gate
 *  logic) — the display picks the same winner the grade already trusts, never a different one. */
function formatAnswer(a: Answer): string {
  if (a.kind === 'yesno') return `p ${a.p}`;
  const [level, p] = Object.entries(a.dist).reduce((best, e) => (e[1] > best[1] ? e : best));
  return `${level} ${p}`;
}

/** One `--answers` row: rendered as `<id> "<text>" · <answer>[ · reused <id>][ · key <hex>]` — `reused`/`key`
 *  only when the run actually has one (every question does carry a key, but `reusedFrom` only has entries for
 *  the ones actually reused; the guard is defensive, not expected to ever omit `key` in practice). */
function answerLine(r: { id: string; text: string; answer: Answer; reusedFrom?: string; key?: string }): string {
  const reused = r.reusedFrom ? ` · reused ${r.reusedFrom}` : '';
  const key = r.key ? ` · key ${r.key}` : '';
  return `${r.id} "${clip(r.text, 60)}" · ${formatAnswer(r.answer)}${reused}${key}`;
}

/** Every question a contract run actually asked, in the order it asked them: one subject is goal then "1".."N"
 *  (translate.ts's own subjectQuestions/goalQuestion — reused here rather than re-deriving ids by hand); replay
 *  is before:1..N, goal (the after goal, C-056's own "after" state), then after:1..N, matching replay.ts's own
 *  construction exactly; a sweep has no request-level questions at all (`ask.categories` is always [] for one —
 *  C-120) — its questions live per item, `<item id>#<n>`, filled from that item's own `fill` map (contract/
 *  layers.ts's fillBlanks, the same substitution itemQuestions uses when a sweep actually asks). A question with
 *  no `self.answers` entry (shouldn't happen for anything this run's own ask claims) is skipped rather than
 *  shown with a made-up answer. */
function questionRows(self: ContractRun): { id: string; text: string; answer: Answer; reusedFrom?: string; key?: string }[] {
  const rows: { id: string; text: string; answer: Answer; reusedFrom?: string; key?: string }[] = [];
  const add = (id: string, text: string): void => {
    const answer = self.answers[id];
    if (answer) rows.push({ id, text, answer, reusedFrom: self.reusedFrom[id], key: self.keys[id] });
  };
  if (self.items) {
    for (const [itemId, item] of Object.entries(self.items)) {
      const cats = self.ask.layers.find((l) => l.name === item.layer)?.categories ?? [];
      for (const q of [...cats.flatMap((c) => c.questions)].sort((a, b) => a.n - b.n)) add(`${itemId}#${q.n}`, fillBlanks(q.text, item.fill));
    }
  } else if (self.verb === 'replay') {
    for (const q of subjectQuestions(self.ask.categories, 'before:')) add(q.id, q.text);
    add('goal', self.goal);
    for (const q of subjectQuestions(self.ask.categories, 'after:')) add(q.id, q.text);
  } else {
    add('goal', self.goal);
    for (const q of subjectQuestions(self.ask.categories)) add(q.id, q.text);
  }
  return rows;
}

/** `--answers` [C-215]: one line per question this run actually asked, on top of whatever `--level` already
 *  shows — only meaningful for a run id (byId's own caller decides whether to call this at all; place/tag and
 *  request-draft modes never do, same as `--summary` is ignored for those, C-124). A legacy (Plan 1) run has
 *  none of this stored, so it's a silent no-op, the same idiom `--level` above 1 already uses for one (C-123)
 *  — never a stop. A contract run that, for whatever reason, has no rows to show says so plainly instead of
 *  printing nothing, so an empty block always reads as "checked, found none" rather than "forgot to render". */
function answersLines(self: AnyRun): string[] {
  if (!isContractRun(self)) return [];
  const rows = questionRows(self);
  if (!rows.length) return ['  answers: none recorded'];
  return [`  answers ${rows.length}:`, ...rows.map((r) => `    ${answerLine(r)}`)];
}

/** B4: a run-id view is logged too, on a HIT only (same discipline as request mode: a validation
 *  failure — here, `id` not in the ledger — never writes a lookup, mirroring loadRequest's own early return
 *  before runRequestMode's appendLookup call). Called after withIndex returns (never nested inside its
 *  callback): appendLookup takes its own lock, and this avoids any question of lock re-entrancy across the two. */
function byId(id: string, paths: Mm3Paths, level: Level, limit: number, answers: boolean): VerbResult {
  const result = withIndex<VerbResult>(
    paths,
    (handle) => {
      const self = runAt(paths, handle, id);
      if (!self) return { exit: 2, text: stopText([`✖ view: ${id} is not in the ledger → "mm3 view <folder>" lists recent runs`], 'view') };
      const up: AnyRun[] = [];
      let cursor = self.parent ? runAt(paths, handle, self.parent) : undefined;
      while (cursor && up.length < limit) {
        up.unshift(cursor);
        cursor = cursor.parent ? runAt(paths, handle, cursor.parent) : undefined;
      }
      const down: AnyRun[] = [];
      const queue = [id];
      while (queue.length && down.length < limit) {
        const parent = queue.shift()!;
        for (const r of childrenAt(paths, handle, parent)) {
          if (down.length >= limit) break;
          down.push(r);
          queue.push(r.id);
        }
      }
      const outcomes = handle.outcomesFor([...up, self, ...down].map((r) => r.id));
      const outcomeOf = (r: AnyRun): Outcome | 'open' => outcomes.get(r.id) ?? 'open';
      return {
        exit: 0,
        text: [
          `mm3 view ${id} · lineage ${up.length} up · ${down.length} down`,
          ...up.map((r) => `↑ ${runLine(r, outcomeOf(r))}`),
          `▶ ${runLine(self, outcomeOf(self))}`,
          ...detailLines(self, level),
          ...(answers ? answersLines(self) : []),
          ...down.map((r) => `↓ ${runLine(r, outcomeOf(r))}`),
        ].join('\n'),
      };
    },
    { readOnly: true },
  );
  if (result.exit === 0) appendLookup(paths, { goal: id, where: [], hit: false, reused: null });
  return result;
}

/** One category's record here: `{runs: 0}` when it's never been asked, else counts and the newest run holding it. */
function categoryEntry(name: string, runsHere: readonly ContractRun[]): [string, Value] {
  let runs = 0;
  let pass = 0;
  let fail = 0;
  let last: string | undefined;
  for (const r of runsHere) {
    const gate = r.categories[name];
    if (gate === undefined) continue;
    runs += 1;
    if (gate === 'pass') pass += 1;
    else if (gate === 'fail') fail += 1;
    last = r.id; // ledger order is append order, so the last match seen is the newest
  }
  return [name, runs ? m(['runs', runs], ['pass', pass], ['fail', fail], ['last', last!]) : m(['runs', 0])];
}

/**
 * Request mode's own place lookup, index-backed: every requested `where` entry's candidates (handle.
 * placeCandidates — the same lookup byPlaceIndexed uses) are unioned by offset (a run matching more than one
 * requested place is read, and counted, only once) and read back in ledger append order — the order
 * categoryEntry's own "last match wins" logic depends on to find each category's newest holder. Only contract
 * runs (v2) count, same as before; a candidate whose real record doesn't actually match any requested place (a
 * place-table hit from a legacy tag, or the LIKE-prefix's own false positive) is dropped, never trusted blindly.
 */
function runsForPlaces(paths: Mm3Paths, places: readonly string[]): ContractRun[] {
  return withIndex(
    paths,
    (handle) => {
      const offsets = new Set<number>();
      for (const place of places) for (const c of handle.placeCandidates(place)) offsets.add(c.offset);
      const hits: ContractRun[] = [];
      for (const offset of [...offsets].sort((a, b) => a - b)) {
        const rec = readRecordAt(paths.log, offset);
        if (rec && isContractRun(rec) && places.some((place) => whereMatches(rec, place))) hits.push(rec);
      }
      return hits;
    },
    { readOnly: true },
  );
}

/** Request mode: the contract's own view shape. loadRequest and readCodeEvidence stop it exactly as class does. */
function runRequestMode(text: string, ctx: ViewContext): VerbResult {
  // a project's own .mm3/config.yaml mdl: overrides apply to every mdl: block it validates.
  const cfg = configOf(ctx).config;
  const mdlFields = effectiveMdlFields(cfg.mdl);
  const loaded = loadRequest(text, 'view', mdlFields, contractLimits(cfg, 'view'));
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;

  const evidence = readCodeEvidence(ctx.paths.root, request.mak.where, { limits: { perFileChars: cfg.evidence.perItemChars, totalChars: cfg.evidence.totalChars } });
  if (!evidence.ok) return { exit: 2, text: stopText(evidence.errors, 'view') };

  const places = request.mak.where.map(stripLines);
  const runsHere = runsForPlaces(ctx.paths, places);

  const categoryNames = request.mak.categories.length
    ? request.mak.categories.map((c) => c.name)
    : [...new Set(runsHere.flatMap((r) => Object.keys(r.categories)))];

  let reuse: string | undefined;
  // when there's no exact reuse, say why — "never asked" (no prior run touched this place at
  // all) vs "code in where changed since MM3-x" (a prior run is right there, its evidence just no longer
  // matches this exact question set) — instead of just omitting the field, as before.
  let reuseMiss: string | undefined;
  if (request.mak.categories.length > 0) {
    const questions = [goalQuestion(request.mak.goal), ...subjectQuestions(request.mak.categories)];
    const evidenceStr = subjectEvidence(evidence.evidence.files);
    const keys = questions.map((q) => answerKey(evidenceStr, q));
    const who = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
    // an answer older than reuse.maxAgeDays/maxCommits is treated as a miss, not reused.
    const reuseLimits = cfg.reuse;
    reuse = exactReuse(ctx.paths, who, keys, { reuse: reuseLimits });
    if (reuse === undefined) reuseMiss = runsHere.length ? `code in where changed since ${runsHere.at(-1)!.id}` : 'never asked';
    // A real draft check (a full ask, not just a bare place/id lookup) is logged, free — CONTRACT's own claim
    // ("the lookup is logged") was untrue until this: never a run (no MM3-#### id, appendLookup's own comment),
    // never counted toward the budget or any report's run totals.
    appendLookup(ctx.paths, { goal: request.mak.goal, where: request.mak.where, hit: reuse !== undefined, reused: reuse ?? null });
  }

  // a found reuse also shows its own age/commits-since, right beside the id it already showed.
  // `reuse` names the matching run itself (not necessarily one of `runsHere`, which is scoped by place, not by
  // exact question-key match), so its own record is looked up directly.
  const reuseRun = reuse ? findRun(ctx.paths, reuse) : undefined;
  const age = reuseRun && isContractRun(reuseRun) ? reuseAge(ctx.paths, { ts: reuseRun.ts, commit: reuseRun.commit ?? null, where: reuseRun.where }) : undefined;
  const next = reuse ? `mm3 view ${reuse}` : 'mm3 class';
  const mak = m(
    ['view', request.mak.where.join(', ')],
    ...(reuse ? [['reuse', reuse] as [string, Value]] : reuseMiss ? [['reuse', reuseMiss] as [string, Value]] : []),
    ...(age ? [['reuseAge', m(['days', age.ageDays], ...(age.commitsSince !== null ? [['commits', age.commitsSince] as [string, Value]] : []))] as [string, Value]] : []),
    ['runs', runsHere.length],
    ['categories', m(...categoryNames.map((name) => categoryEntry(name, runsHere)))],
  );
  return { exit: 0, text: respondText(mak, mdlRecorded(null), next, ['free']) };
}

/**
 * `arg` is always the thing the caller actually named (a path, folder, tag or MM3-####) — never overwritten by a
 * file's own bytes. `content`, when given, is whatever text cli.ts already read for `arg` (a file's contents, or
 * stdin for `-`): it's used ONLY to test for request mode (a `mak:`/JSON draft). Viewing a real source
 * file that isn't a request (no `mak:`) must show it as a PLACE (`arg` itself), never misread its code as a
 * garbled request just because cli.ts happened to read the file's bytes first. Omitting `content` (every
 * existing caller that already has the text in hand, e.g. a request string read from stdin) keeps checking
 * `arg` itself for request mode, unchanged. `summary` (`--summary`) only applies to place mode — a
 * run id or a request draft ignores it, since "one line per place" makes no sense for either. `answers`
 * (`--answers`) only applies to a run id — place/tag and request-draft modes ignore it, the
 * same restriction as `summary`'s, just reversed. */
export function runView(arg: string, level: Level, ctx: ViewContext, content?: string, summary = false, answers = false): VerbResult {
  const probe = (content ?? arg).trim();
  if (REQUEST_MODE.test(probe) || probe.startsWith('{')) return runRequestMode(content ?? arg, ctx);

  const at = RUN_ID.test(arg) ? undefined : toPlace(arg, ctx.paths.root);
  if (at && 'stop' in at) return { exit: 2, text: at.stop };
  const limit = level * 10;
  return at ? byPlace(at.place, ctx.paths, limit, summary) : byId(arg, ctx.paths, level, limit, answers);
}

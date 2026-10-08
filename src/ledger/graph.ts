/**
 * The graph tier: a SECOND, independent set of tables in the SAME `.mm3/index.db` file the hot tier
 * (ledger/index.ts) already uses — its own `nodes`/`triples` tables, its own `meta` keys (`graph_schema_version`,
 * `graph_upto`), never touching the hot tier's own `schema_version`/`upto`/`runs`/`places`/`categories` etc. A
 * graph-schema change here never forces the hot tier to rebuild; the other direction also holds:
 * a hot-tier rebuild replaces the WHOLE db file (ledger/index.ts's `rebuildToDisk`, a tmp file + atomic rename),
 * which wipes this tier's tables too — harmless, since the next call here just finds no `graph_schema_version`
 * meta key, treats that exactly like a schema-version mismatch, and rebuilds from byte 0. Same self-healing
 * spirit as the hot tier's own header comment: "a missing/corrupt/stale index just costs the next call a
 * rebuild — never a wrong answer."
 *
 * NEVER called from the paid path (class/scan/drill/loop/replay/pay.ts never import this module). Refreshed
 * only when a reader calls `refreshGraph` — a future `report`/`view`/web/export path, not built here.
 *
 * Schema:
 *   nodes(id PK, kind, label, UNIQUE(kind,label)) — a dictionary: entity resolution at ingest (normalizeLabel)
 *     means the same place/category/chain-part always resolves to the same row.
 *   triples(p, s, o, run, provenance, score) WITHOUT ROWID, PK (p,s,o,run) — `p` is plain-TEXT lower-kebab (the
 *     fixed predicate vocabulary below, or a custom/config-driven one), NOT dictionary-encoded (the vocabulary
 *     is small and fixed; a second join buys nothing at this scale). `run` is the witnessing run's own MM3-####
 *     id as plain TEXT provenance/witness metadata — NOT a node id — completely separate from `s`/`o` (which
 *     ARE node ids). A run can ALSO appear as a graph subject/object (`nodes(kind='run', label=<id>)`) — that
 *     duplication (a run id as both a `nodes.label` and, separately, many `triples.run` values) is intentional.
 *   meta: two new keys reusing the hot tier's own `meta` table — `graph_schema_version` (this file's own,
 *     starts at '1') and `graph_upto` (bytes of log.jsonl this tier's ingest has consumed — the same watermark
 *     idea as the hot tier's own `upto`, tracked completely independently).
 *
 * Ingest is append-only per run: re-deriving the same triples from the same run on a later catch-up is always a
 * no-op re-insert of identical rows (INSERT OR IGNORE + the PK make this free) — so no per-run dedup bookkeeping
 * is needed beyond "don't call insert needlessly inside one pass."
 *
 * `mdl.problem` is deliberately NEVER promoted into a triple ("solves" was considered and dropped): it's
 * already fully captured, verbatim, in the hot tier's own `runs.mdl` JSON column (index.ts's private
 * `mdlJson`) — a future `v_mdl` reader reads it from there directly. Do not "fix" this later by adding a
 * problem triple; it would just duplicate what `runs.mdl` already answers.
 *
 * Predicate vocabulary implemented in `ingestContractRun`/`ingestOutcome` below: about, is-a,
 * checks (run --checks--> category: the run checked this category — controller fix, 2026-09-28: this used to
 * be named `asks`, and the name `checks` used to be misapplied one hop further down, below), judged (category
 * --judged--> place, WITH the gate's own score: what that check found there — the run-level "judged (run,
 * category, score)" triple this used to be is gone, folded into `checks` above since the hot tier's own
 * `categories` table already answers "which gate did this run give this category" without a graph triple for
 * it), at, contains (three sources: uses-chain '/' segments, sweep item hierarchy, and an inferred
 * place×component cross-signal), builds-on/narrows/replays, resolved-as, reaches, touches, uses, plus
 * custom/config-driven fields (`mdl.extras`, via `.mm3/config.yaml`'s `mdl.<key>` overrides). Every
 * triple's own `provenance` column (extracted | declared | inferred) is always populated, never null — a
 * reader (`report graph`) shows it on every edge, not only the inferred ones.
 *
 * Node:sqlite availability: if `getSqliteCtor()` (ledger/index.ts) returns null (Node < 22.13, or sqlite
 * genuinely unavailable), every entry point here throws `GraphUnavailableError` — there is no linear-scan
 * fallback for this tier (deliberately out of scope: "foundational only", and the hot tier's own fallback is a
 * different, already-solved problem for a different tier).
 */
import { closeSync, existsSync, openSync, readSync } from 'node:fs';
import type { MdlFieldOverride } from '../config/defaults.ts';
import { resolveConfig } from '../config/load.ts';
import type { Category } from '../contract/types.ts';
import { getSqliteCtor, normalizeRecordMdl, readRecordAt, stripLines } from './index.ts';
import { isContractRun, type ContractRun, type LedgerRecord, type OutcomeRecord } from './log.ts';
import { statLog, withLock } from './lock.ts';
import { ensureDir, type Mm3Paths } from './paths.ts';

// Bumped to '2' (from '1') here: the PK (p, s, o, run) WITHOUT ROWID orders `triples` by predicate first, so
// neither an OUTBOUND walk (`WHERE s = ?`, any predicate — `graphAround`'s own out-edges and `traverse`'s
// recursive-CTE join) nor an INBOUND one (`WHERE o = ?`, any predicate — `graphAround`'s own in-edges) can use
// the PK, or the old `idx_triples_pos (p, o, s)` (predicate-first: only helps a query that already knows the
// predicate, which neither of these does) — both fell back to a full table scan, confirmed via `EXPLAIN QUERY
// PLAN` (SCAN triples) and named in docs/evidence/ledger-scale.md's own "likely cause" note for the
// `graphRebuild`/`traverseDepth4` misses at 100k. `idx_triples_spo`/`idx_triples_o` below fix both directions
// (also confirmed via EXPLAIN QUERY PLAN: SEARCH ... USING [COVERING] INDEX); `idx_triples_pos` itself is
// dropped — nothing in this codebase queries by predicate+object today, so it was pure insert overhead with no
// read ever benefiting from it. A schema-version bump means an existing (v1) graph tier self-heals via the
// same missing/wrong-schema path `needsCatchUp`/`catchUpGraph` already use for any other mismatch — a full
// re-ingest from byte 0, not a migration.
const GRAPH_SCHEMA_VERSION = '2';

const GRAPH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  UNIQUE(kind, label)
);
CREATE TABLE IF NOT EXISTS triples (
  p TEXT NOT NULL,
  s INTEGER NOT NULL,
  o INTEGER NOT NULL,
  run TEXT NOT NULL,
  provenance TEXT NOT NULL,
  score REAL,
  PRIMARY KEY (p, s, o, run)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_triples_spo ON triples(s, p, o);
CREATE INDEX IF NOT EXISTS idx_triples_o ON triples(o, p, s);
`;

// The hot tier (ledger/index.ts) always creates `meta` itself, but this module must work even the first time
// it's ever called on a project (a graph read before any paid run has built index.db) — cheap no-op otherwise.
const META_TABLE_SQL = `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`;

/** Thrown by every entry point here when node:sqlite isn't available. No linear-scan fallback for this tier
 *  (see this module's own header comment) — a future caller (report/view) catches this and shows it plainly. */
export class GraphUnavailableError extends Error {
  constructor() {
    super('graph: needs node:sqlite (Node ≥ 22.13) → upgrade Node to build the knowledge graph');
    this.name = 'GraphUnavailableError';
  }
}

// A structural (not imported) mirror of ledger/index.ts's own private SqliteDb/SqliteStatement shape — the
// values getSqliteCtor() hands back satisfy this by construction, so no cast is needed at the call site.
interface GraphStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}
interface GraphDb {
  exec(sql: string): void;
  prepare(sql: string): GraphStatement;
  close(): void;
}

function openGraphDb(dbPath: string): GraphDb {
  const Ctor = getSqliteCtor();
  if (!Ctor) throw new GraphUnavailableError();
  return new Ctor(dbPath);
}

function getMeta(db: GraphDb, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? String(row.value) : undefined;
}

function setMeta(db: GraphDb, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
}

/** Entity resolution at ingest (I6): trim every label; a `place` label additionally goes through `stripLines`
 *  (drops a trailing ":start" / ":start-end") plus a leading "./" strip. C4-chain labels are already
 *  lower-kebab by the mdl grammar, so nothing further is needed for them beyond what the caller already does
 *  (stripping a trailing "?" before it ever reaches here). */
function normalizeLabel(kind: string, raw: string): string {
  let s = raw.trim();
  if (kind === 'place') {
    s = stripLines(s);
    if (s.startsWith('./')) s = s.slice(2);
  }
  return s;
}

/** Upsert-then-read (RETURNING support in this repo's node:sqlite wasn't confirmed, so the simpler, always-safe
 *  two-statement form is used, per this piece's own instructions). */
function nodeId(db: GraphDb, kind: string, rawLabel: string): number {
  const label = normalizeLabel(kind, rawLabel);
  db.prepare('INSERT OR IGNORE INTO nodes (kind, label) VALUES (?, ?)').run(kind, label);
  const row = db.prepare('SELECT id FROM nodes WHERE kind = ? AND label = ?').get(kind, label);
  if (!row) throw new Error(`graph: node upsert failed for ${kind}:${label}`);
  return Number(row.id);
}

/** Append-only per run: a given run's own ledger line never changes, so re-deriving the same triple on a later
 *  catch-up is a no-op re-insert of an identical row (the PK makes this free) — see this module's own header. */
function addTriple(db: GraphDb, p: string, s: number, o: number, run: string, provenance: 'extracted' | 'declared' | 'inferred', score: number | null): void {
  db.prepare('INSERT OR IGNORE INTO triples (p, s, o, run, provenance, score) VALUES (?, ?, ?, ?, ?, ?)').run(p, s, o, run, provenance, score);
}

/** Every category a contract run's own ask carries: one-subject (`ask.categories`) or a sweep's own layers
 *  (`ask.layers[].categories`), never both — the same rule ledger/index.ts's own (private) `runCategories`
 *  follows; reimplemented here rather than imported since exporting it would be more than "a tiny hook". */
function runCategories(rec: ContractRun): Category[] {
  return rec.ask.categories.length ? rec.ask.categories : rec.ask.layers.flatMap((l) => l.categories);
}

/** Every place this run touches, stripLines-normalized and deduped: `where` for a one-subject run, or every
 *  item's own `unit.path` for a sweep (a sweep's own `where` is always `[]` — see index.ts's `sweepPlaces`). */
function runPlaces(rec: ContractRun): string[] {
  const raw = rec.items ? Object.values(rec.items).flatMap((it) => (it.unit ? [it.unit.path] : [])) : rec.where;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of raw) {
    const norm = normalizeLabel('place', w);
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

/** A C4-chain part ("component:web-app/orders-handler?") split into its level and its full name, with a
 *  trailing "?" (guessed/unbuilt) dropped from the label — the grammar (mdl-fields.ts's CHAIN_RE) already
 *  validated every string reaching here, so no re-validation happens. */
function parseChainPart(part: string): { level: string; name: string } {
  const colon = part.indexOf(':');
  const level = part.slice(0, colon);
  const raw = part.slice(colon + 1);
  const name = raw.endsWith('?') ? raw.slice(0, -1) : raw;
  return { level, name };
}

/** Rules 1/10/11/12/13 (about/reaches/touches/uses/uses-contains) — the ONLY mdl-driven predicates that a
 *  project's config can mark `literal: true` and thereby skip (config/defaults.ts's MdlFieldOverride). */
function isLiteral(mdlConfig: Record<string, MdlFieldOverride>, key: string): boolean {
  return mdlConfig[key]?.literal === true;
}

/** pass/fail/unsure → 1/0/0.5, for a `judged` triple's own `score` column — deliberate simplification
 *  (documented, not a gap): a per-category calibrated `p` isn't tracked separately from the discrete gate
 *  today. undefined/anything else → null (no score recorded). */
function gateScore(gate: string | undefined): number | null {
  return gate === 'pass' ? 1 : gate === 'fail' ? 0 : gate === 'unsure' ? 0.5 : null;
}

/** One contract run's own triples (the predicate list). `mdlConfig` is the effective project config's
 *  `mdl:` overrides (`resolveConfig(...).config.mdl`), resolved once per `refreshGraph` call, never per line. */
function ingestContractRun(db: GraphDb, rec: ContractRun, mdlConfig: Record<string, MdlFieldOverride>): void {
  const RUN = rec.id;
  const runNode = nodeId(db, 'run', RUN);
  const mdl = rec.mdl;

  // 1. about — mdl.area (≤2), unless config marks it literal.
  if (mdl?.area !== undefined && !isLiteral(mdlConfig, 'area')) {
    const areas = Array.isArray(mdl.area) ? mdl.area : [mdl.area];
    for (const a of areas) addTriple(db, 'about', runNode, nodeId(db, 'area', a), RUN, 'extracted', null);
  }

  // 2/3. checks / is-a — every category this run's ask carries. `checks` is run --checks--> category (the run
  // checked this category); its own verdict on a PLACE is rule 4/5's `judged`, below.
  const cats = runCategories(rec);
  for (const cat of cats) {
    const catNode = nodeId(db, 'category', cat.name);
    addTriple(db, 'checks', runNode, catNode, RUN, 'extracted', null);
    if (cat.family) addTriple(db, 'is-a', catNode, nodeId(db, 'family', cat.family), RUN, 'extracted', null);
  }

  // 4/5. judged — a category's own verdict on a place: category --judged--> place, scored from the gate.
  // Deliberate simplification (documented, not a gap): the schema's `score` is one REAL column, and a
  // per-category calibrated `p` isn't tracked separately from the gate today — pass/fail/unsure → 1/0/0.5.
  // One-subject: every category against every place this run touched, at the RUN's own gate for that category.
  // Sweep: every layer's categories against the places its own items touched, at each ITEM's own gate for that
  // category — more precise than a single run-wide gate, since a sweep's own items can disagree with each other.
  if (!rec.items) {
    const places = runPlaces(rec);
    for (const cat of cats) {
      const catNode = nodeId(db, 'category', cat.name);
      const score = gateScore(rec.categories[cat.name]);
      for (const placeLabel of places) addTriple(db, 'judged', catNode, nodeId(db, 'place', placeLabel), RUN, 'extracted', score);
    }
  } else {
    for (const layer of rec.ask.layers) {
      const layerItems = Object.values(rec.items).filter((it) => it.layer === layer.name && it.unit);
      for (const cat of layer.categories) {
        const catNode = nodeId(db, 'category', cat.name);
        for (const item of layerItems) {
          const placeLabel = normalizeLabel('place', item.unit!.path);
          addTriple(db, 'judged', catNode, nodeId(db, 'place', placeLabel), RUN, 'extracted', gateScore(item.categories[cat.name]));
        }
      }
    }
  }

  // 6. at — runNode 'at' every place; also collected for rule 14's cross-signal below.
  const placeNodeIds = new Set<number>();
  for (const placeLabel of runPlaces(rec)) {
    const pid = nodeId(db, 'place', placeLabel);
    placeNodeIds.add(pid);
    addTriple(db, 'at', runNode, pid, RUN, 'extracted', null);
  }

  // 7b. contains — sweep item hierarchy, reconstructed from the item record keys themselves: `expand()`
  // (contract/layers.ts) keys every item by `parent ? \`${parent.id}/${name}\` : name`, and stores items
  // "parents before children" (its own comment) — so `ItemRecord` (log.ts) never needing its own stored
  // `parent` field is NOT a gap: the parent id is always `id.slice(0, id.lastIndexOf('/'))`, and that parent is
  // guaranteed to be a key of this same `items` map when it exists. Checked directly against layers.ts/log.ts
  // before assuming this — ItemRecord genuinely carries no `parent` field, unlike the in-memory `Item`.
  if (rec.items) {
    for (const [id, item] of Object.entries(rec.items)) {
      const slash = id.lastIndexOf('/');
      if (slash === -1) continue;
      const parent = rec.items[id.slice(0, slash)];
      if (!parent?.unit || !item.unit) continue;
      const parentLabel = parent.unit.kind === 'file' ? parent.unit.path : `${parent.unit.path}::${parent.unit.kind}:${parent.unit.name}`;
      const childLabel = item.unit.kind === 'file' ? item.unit.path : `${item.unit.path}::${item.unit.kind}:${item.unit.name}`;
      addTriple(db, 'contains', nodeId(db, 'place', parentLabel), nodeId(db, 'place', childLabel), RUN, 'extracted', null);
    }
  }

  // 8. builds-on / narrows / replays — when this run has a parent.
  if (rec.parent) {
    const pred = rec.verb === 'replay' ? 'replays' : rec.verb === 'drill' ? 'narrows' : 'builds-on';
    addTriple(db, pred, runNode, nodeId(db, 'run', rec.parent), RUN, 'extracted', null);
  }

  // 10. reaches — mdl.blast (a single value), unless config marks it literal.
  if (mdl?.blast !== undefined && !isLiteral(mdlConfig, 'blast')) {
    addTriple(db, 'reaches', runNode, nodeId(db, 'level', mdl.blast), RUN, 'extracted', null);
  }

  // 11. touches — mdl.touches (≤5), unless config marks it literal.
  if (mdl?.touches !== undefined && !isLiteral(mdlConfig, 'touches')) {
    for (const t of mdl.touches) addTriple(db, 'touches', runNode, nodeId(db, 'entity', t.toLowerCase().trim()), RUN, 'extracted', null);
  }

  // 12/13. uses + its own "contains" (from '/' segments), unless config marks 'uses' literal.
  const compOrCode = new Set<number>();
  if (mdl?.uses !== undefined && !isLiteral(mdlConfig, 'uses')) {
    for (const chain of mdl.uses) {
      const parts = chain.split(' -> ').map(parseChainPart);
      const partNodeIds = parts.map((part) => nodeId(db, part.level, part.name));
      for (let i = 0; i < partNodeIds.length - 1; i++) addTriple(db, 'uses', partNodeIds[i]!, partNodeIds[i + 1]!, RUN, 'declared', null);
      parts.forEach((part, i) => {
        if (part.level === 'component' || part.level === 'code') compOrCode.add(partNodeIds[i]!);
      });
      // 13. Every segment before the last is a generic 'container' — the grammar states only ONE level per
      // part, for its fully-qualified name (e.g. "component:web-app/orders-handler" = a component whose
      // qualified name is web-app/orders-handler); there is no stated level for "web-app" alone. Deliberate
      // simplification, not a gap.
      for (const part of parts) {
        const segs = part.name.split('/');
        if (segs.length < 2) continue;
        for (let i = 1; i < segs.length; i++) {
          const parentLabel = segs.slice(0, i).join('/');
          const childLabel = segs.slice(0, i + 1).join('/');
          const childKind = i + 1 === segs.length ? part.level : 'container';
          const childNode = nodeId(db, childKind, childLabel);
          addTriple(db, 'contains', nodeId(db, 'container', parentLabel), childNode, RUN, 'declared', null);
          if (childKind === 'component' || childKind === 'code') compOrCode.add(childNode);
        }
      }
    }
  }

  // 14. contains (inferred) — every place this run is `at` paired with every component/code node it `uses`,
  // within this SAME run: the "architecture layers can emerge from the data" signal. One
  // row per witnessing run; a reader rolling this up can COUNT(DISTINCT run) per (s,p,o) for confidence later.
  for (const placeId of placeNodeIds) for (const compId of compOrCode) addTriple(db, 'contains', placeId, compId, RUN, 'inferred', null);

  // 15. solves — deliberately NOT stored; see this module's own header comment.

  // 16. custom / config-driven fields (mdl.extras) — an unconfigured custom key stays a property only (no
  // triple); a configured one promotes to a node, optionally cross-linked to `where`/item places via `link`.
  const extras = mdl?.extras;
  if (extras) {
    const places = runPlaces(rec);
    for (const [key, rawValue] of Object.entries(extras)) {
      const override = mdlConfig[key];
      if (!override) continue; // undeclared custom key: property-only, never promoted into the graph
      const predicate = override.as ?? key;
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      for (const v of values) {
        const valueNode = nodeId(db, 'value', v.toLowerCase().trim());
        addTriple(db, predicate, runNode, valueNode, RUN, 'declared', null);
        if (override.link === 'where') {
          for (const placeLabel of places) addTriple(db, 'handled-by', valueNode, nodeId(db, 'place', placeLabel), RUN, 'declared', null);
        }
      }
    }
  }
}

/** 9. resolved-as — from an OutcomeRecord line. */
function ingestOutcome(db: GraphDb, rec: OutcomeRecord): void {
  const runNode = nodeId(db, 'run', rec.of);
  const outcomeNode = nodeId(db, 'outcome', rec.outcome);
  addTriple(db, 'resolved-as', runNode, outcomeNode, rec.of, 'extracted', null);
}

/** Resets the graph tier to empty (schema mismatch, or first-ever use): drops+recreates nodes/triples, resets
 *  the watermark to 0, and stamps the current schema version. Always preceded by ensuring `meta` itself exists. */
function resetGraphSchema(db: GraphDb): void {
  db.exec('DROP TABLE IF EXISTS nodes; DROP TABLE IF EXISTS triples;');
  db.exec(GRAPH_SCHEMA_SQL);
  setMeta(db, 'graph_upto', '0');
  setMeta(db, 'graph_schema_version', GRAPH_SCHEMA_VERSION);
}

/** Reads every COMPLETE line from `buf` in [from, to) — a trailing partial line (no `\n` yet) is left
 *  unconsumed, same safety idea as the hot tier's own chunked scan, just done the simple way (whole-buffer
 *  slicing) since this tier's ingest runs far less often, off the paid path. `\n` (0x0a) is never a UTF-8
 *  continuation byte, so splitting on it is always a safe multi-byte-character boundary. */
function scanCompleteLines(buf: Buffer, from: number, to: number): { consumed: number; lines: string[] } {
  const lines: string[] = [];
  let pos = from;
  for (;;) {
    const nl = buf.indexOf(0x0a, pos);
    if (nl === -1 || nl >= to) break;
    lines.push(buf.subarray(pos, nl).toString('utf8'));
    pos = nl + 1;
  }
  return { consumed: pos, lines };
}

/** True when the graph tier needs work: missing/wrong-schema (a full rebuild), or merely behind the log's
 *  current size (an incremental catch-up). Never throws for "no sqlite" here — that surfaces properly from the
 *  real attempt inside `catchUpGraph`, which this function's callers always run next when it returns true. */
function needsCatchUp(paths: Mm3Paths, logSize: number): boolean {
  if (!existsSync(paths.index)) return true;
  let db: GraphDb;
  try {
    db = openGraphDb(paths.index);
  } catch {
    return true;
  }
  try {
    db.exec(META_TABLE_SQL);
    if (getMeta(db, 'graph_schema_version') !== GRAPH_SCHEMA_VERSION) return true;
    return Number(getMeta(db, 'graph_upto') ?? '0') < logSize;
  } catch {
    return true;
  } finally {
    db.close();
  }
}

/** Runs under paths.lock (see refreshGraph): re-derives the effective config once, schema-checks (rebuilding
 *  from byte 0 on a mismatch), then ingests every complete new line since the stored watermark, in one
 *  transaction, and persists the new watermark. */
function catchUpGraph(paths: Mm3Paths, env: Record<string, string | undefined>): void {
  ensureDir(paths);
  const db = openGraphDb(paths.index);
  try {
    db.exec(META_TABLE_SQL);
    if (getMeta(db, 'graph_schema_version') !== GRAPH_SCHEMA_VERSION) resetGraphSchema(db);
    const upto = Number(getMeta(db, 'graph_upto') ?? '0');
    const size = statLog(paths.log)?.size ?? 0;
    if (upto >= size) return; // another process already caught this up while we waited for the lock
    // Only the unread tail [upto, size), never the whole log: a one-line catch-up must not pull a 100k-run
    // ledger (hundreds of MB) into memory.
    const buf = Buffer.alloc(size - upto);
    const fd = openSync(paths.log, 'r');
    let got = 0;
    try {
      while (got < buf.length) {
        const n = readSync(fd, buf, got, buf.length - got, upto + got);
        if (n === 0) break;
        got += n;
      }
    } finally {
      closeSync(fd);
    }
    const tail = scanCompleteLines(buf, 0, got);
    const consumed = upto + tail.consumed;
    const lines = tail.lines;
    const mdlConfig = resolveConfig(paths, env).config.mdl;
    db.exec('BEGIN');
    try {
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue; // the hot tier/readLedger already fail the ledger closed on real corruption; be lenient here
        }
        if (!parsed || typeof parsed !== 'object') continue;
        const rec = normalizeRecordMdl(parsed as LedgerRecord);
        if (rec.kind === 'run' && isContractRun(rec)) ingestContractRun(db, rec, mdlConfig);
        else if (rec.kind === 'outcome') ingestOutcome(db, rec);
      }
      setMeta(db, 'graph_upto', String(consumed));
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  } finally {
    db.close();
  }
}

/**
 * The one entry point that catches the graph tier up to the current log — schema-check, then an incremental
 * scan from its own `graph_upto` watermark. Idempotent and cheap when already fresh (checked before taking the
 * lock at all — a pure-read fast path, same spirit as the hot tier's own `tryOpenAndCheck`); re-checked again
 * INSIDE the lock in case another process already caught up while this one waited (same race the hot tier's
 * own `refreshUnderLock` guards against). A project with no ledger yet does nothing at all — no `.mm3/`,
 * no `index.db` — matching the hot tier's own "never touch disk before the first write" rule.
 */
export function refreshGraph(paths: Mm3Paths, env: Record<string, string | undefined> = process.env): void {
  const logStat = statLog(paths.log);
  if (!logStat || logStat.size === 0) return;
  if (!needsCatchUp(paths, logStat.size)) return;
  withLock(paths.lock, () => catchUpGraph(paths, env));
}

// ---------------------------------------------------------------------------------------------------------------
// Query / traversal surface (a later piece wires these into `mm3 report`). Every reader here is a PURE
// read: never takes the lock, never writes, and degrades to an empty/undefined result (never a crash) when the
// graph tier's tables don't exist yet (a project whose graph has never been refreshed) — the caller decides
// whether to call `refreshGraph` first.
// ---------------------------------------------------------------------------------------------------------------

export interface GraphNode {
  kind: string;
  label: string;
}

export interface GraphEdge {
  p: string;
  s: number;
  o: number;
  run: string;
  provenance: string;
  score: number | null;
}

const EMPTY_NEIGHBORHOOD: { nodes: (GraphNode & { id: number })[]; edges: GraphEdge[] } = { nodes: [], edges: [] };

/** A small neighborhood around one node: every node within `depth` hops (either direction) and the edges
 *  between them. `depth` defaults to 2 and is capped at 6, same as `traverse` below. */
export function graphAround(paths: Mm3Paths, opts: { kind: string; label: string; depth?: number }): { nodes: (GraphNode & { id: number })[]; edges: GraphEdge[] } {
  if (!existsSync(paths.index)) return EMPTY_NEIGHBORHOOD;
  const db = openGraphDb(paths.index);
  try {
    const label = normalizeLabel(opts.kind, opts.label);
    const start = db.prepare('SELECT id FROM nodes WHERE kind = ? AND label = ?').get(opts.kind, label);
    if (!start) return EMPTY_NEIGHBORHOOD;
    const depth = Math.min(Math.max(opts.depth ?? 2, 0), 6);
    const startId = Number(start.id);
    const visited = new Set<number>([startId]);
    let frontier = [startId];
    const outStmt = db.prepare('SELECT p, s, o, run, provenance, score FROM triples WHERE s = ?');
    const inStmt = db.prepare('SELECT p, s, o, run, provenance, score FROM triples WHERE o = ?');
    const edgeSeen = new Set<string>();
    const edges: GraphEdge[] = [];
    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const next: number[] = [];
      for (const id of frontier) {
        for (const row of [...outStmt.all(id), ...inStmt.all(id)]) {
          const edge: GraphEdge = { p: String(row.p), s: Number(row.s), o: Number(row.o), run: String(row.run), provenance: String(row.provenance), score: row.score === null || row.score === undefined ? null : Number(row.score) };
          const key = `${edge.p}\u0000${edge.s}\u0000${edge.o}\u0000${edge.run}`;
          if (!edgeSeen.has(key)) {
            edgeSeen.add(key);
            edges.push(edge);
          }
          const other = edge.s === id ? edge.o : edge.s;
          if (!visited.has(other)) {
            visited.add(other);
            next.push(other);
          }
        }
      }
      frontier = next;
    }
    const ids = [...visited];
    const nodeRows = ids.length ? db.prepare(`SELECT id, kind, label FROM nodes WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];
    return { nodes: nodeRows.map((r) => ({ id: Number(r.id), kind: String(r.kind), label: String(r.label) })), edges };
  } catch {
    return EMPTY_NEIGHBORHOOD;
  } finally {
    db.close();
  }
}

export interface MdlRow {
  id: string;
  verb: string;
  ts: string;
  why: string | null;
  area: string | null;
  stage: string | null;
  change: string | null;
  risk: string | null;
  problem: string | null;
  blast: string | null;
}

/** Runs × their own mdl fields, straight off the hot tier's own `runs.mdl` JSON column via `json_extract` —
 *  the same idiom `scripts/bench-ledger.ts`'s `benchMdlQuery` already proves works. Reads a table (`runs`) that
 *  belongs to the hot tier, not this one — fine, it's the same db file, no coupling to index.ts's internals. */
export function mdlRows(paths: Mm3Paths, opts: { limit?: number } = {}): MdlRow[] {
  if (!existsSync(paths.index)) return [];
  const db = openGraphDb(paths.index);
  try {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
    const rows = db
      .prepare(
        `SELECT id, verb, ts,
           json_extract(mdl, '$.mdl.why') AS why,
           json_extract(mdl, '$.mdl.area') AS area,
           json_extract(mdl, '$.mdl.stage') AS stage,
           json_extract(mdl, '$.mdl.change') AS change,
           json_extract(mdl, '$.mdl.risk') AS risk,
           json_extract(mdl, '$.mdl.problem') AS problem,
           json_extract(mdl, '$.mdl.blast') AS blast
         FROM runs ORDER BY ts DESC LIMIT ?`,
      )
      .all(limit);
    return rows.map((r) => ({
      id: String(r.id),
      verb: String(r.verb),
      ts: String(r.ts),
      why: r.why === null || r.why === undefined ? null : String(r.why),
      area: r.area === null || r.area === undefined ? null : String(r.area),
      stage: r.stage === null || r.stage === undefined ? null : String(r.stage),
      change: r.change === null || r.change === undefined ? null : String(r.change),
      risk: r.risk === null || r.risk === undefined ? null : String(r.risk),
      problem: r.problem === null || r.problem === undefined ? null : String(r.problem),
      blast: r.blast === null || r.blast === undefined ? null : String(r.blast),
    }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export interface ProblemCount {
  family: string;
  place: string;
  pass: number;
  fail: number;
  unsure: number;
}

/** family × place × gate counts — computed directly from the hot tier's own `categories`/`places` tables (a
 *  plain SQL join), NOT from `triples`: faster, and this piece doesn't need the graph tier's own tables at all.
 *  Ranked worst (most fail) first, capped. */
export function problemCounts(paths: Mm3Paths, opts: { limit?: number } = {}): ProblemCount[] {
  if (!existsSync(paths.index)) return [];
  const db = openGraphDb(paths.index);
  try {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 500);
    const rows = db
      .prepare(
        `SELECT c.family AS family, p.val AS place,
           SUM(CASE WHEN c.gate = 'pass' THEN 1 ELSE 0 END) AS pass,
           SUM(CASE WHEN c.gate = 'fail' THEN 1 ELSE 0 END) AS fail,
           SUM(CASE WHEN c.gate = 'unsure' THEN 1 ELSE 0 END) AS unsure
         FROM categories c
         JOIN places p ON p.run_id = c.run_id AND p.kind = 'where'
         WHERE c.family IS NOT NULL AND c.gate IS NOT NULL
         GROUP BY c.family, p.val
         ORDER BY fail DESC, unsure DESC
         LIMIT ?`,
      )
      .all(limit);
    return rows.map((r) => ({ family: String(r.family), place: String(r.place), pass: Number(r.pass), fail: Number(r.fail), unsure: Number(r.unsure) }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export interface CallStat {
  day: string;
  verb: string;
  model: string;
  /** 'none' marks a fallback row: a pre-telemetry record with no `telemetry` array at
   *  all — its own aggregate `calls`/`costUsd`/`adapter`/`model` stand in, so an old ledger still shows its
   *  calls and cost instead of silently vanishing from this view. */
  source: 'provider' | 'cache' | 'none';
  calls: number;
  tokens: number;
  costUsd: number;
  savedUsd: number;
}

/** Telemetry rollup (cost/tokens/latency-adjacent counts, by day/verb/model/source): the hot tier does not
 *  index `telemetry` (it lives inside each run's full JSON body), so this reads full records via
 *  `readRecordAt` for a WINDOWED, CAPPED run set (default the last 30 days, and a hard run
 *  cap regardless), never a full-ledger scan. A run written before telemetry existed (or any run whose `telemetry`
 *  simply wasn't recorded) carries no `telemetry` array — rather than drop it from this view entirely, its own
 *  `calls`/`costUsd`/`adapter`/`model` (always present, every schema version) fill in one `source: 'none'` row
 *  per day/verb/model, with `tokens`/`savedUsd` left at 0 (unknown at that granularity). */
export function callStats(paths: Mm3Paths, opts: { sinceIso?: string; limit?: number } = {}): CallStat[] {
  if (!existsSync(paths.index)) return [];
  const since = opts.sinceIso ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 5000);
  let rows: Record<string, unknown>[];
  const db = openGraphDb(paths.index);
  try {
    rows = db.prepare('SELECT offset, verb, ts FROM runs WHERE ts >= ? ORDER BY ts DESC LIMIT ?').all(since, limit);
  } catch {
    return [];
  } finally {
    db.close();
  }
  const agg = new Map<string, CallStat>();
  for (const row of rows) {
    const rec = readRecordAt(paths.log, Number(row.offset));
    if (!rec || !isContractRun(rec)) continue;
    const day = String(row.ts).slice(0, 10);
    if (rec.telemetry && rec.telemetry.length) {
      for (const t of rec.telemetry) {
        const model = t.source === 'provider' ? t.model : 'reused';
        const key = `${day}\u0000${rec.verb}\u0000${model}\u0000${t.source}`;
        const cur = agg.get(key) ?? { day, verb: rec.verb, model, source: t.source, calls: 0, tokens: 0, costUsd: 0, savedUsd: 0 };
        cur.calls += 1;
        if (t.source === 'provider') {
          cur.tokens += (t.inputTokens ?? 0) + (t.outputTokens ?? 0);
          cur.costUsd += t.costUsd ?? 0;
        } else {
          cur.tokens += t.original.inputTokens ?? 0;
          cur.savedUsd += t.savedUsd ?? 0;
        }
        agg.set(key, cur);
      }
    } else if (rec.calls > 0) {
      // Pre-telemetry (or telemetry-less) record that genuinely made provider calls: fall back to its own
      // aggregate fields rather than showing nothing for it.
      const key = `${day}\u0000${rec.verb}\u0000${rec.model}\u0000none`;
      const cur = agg.get(key) ?? { day, verb: rec.verb, model: rec.model, source: 'none' as const, calls: 0, tokens: 0, costUsd: 0, savedUsd: 0 };
      cur.calls += rec.calls;
      cur.costUsd += rec.costUsd ?? 0;
      agg.set(key, cur);
    }
  }
  return [...agg.values()];
}

export interface UndeclaredField {
  key: string;
  /** How many runs' own `mdl.extras` carried this key (once per run, regardless of a list value). */
  count: number;
  /** Up to MAX_SAMPLES_PER_KEY raw values, for a card/report to show. */
  samples: string[];
  /** Every distinct raw value seen, capped at MAX_VALUES_PER_KEY — classification (closed/pattern/reference) is
   *  presentation logic and belongs to the caller (report.ts), not this tier. */
  values: string[];
}

const MAX_UNDECLARED_KEYS = 50;
const MAX_VALUES_PER_KEY = 200;
const MAX_SAMPLES_PER_KEY = 5;

/** `mm3 report fields`: every `mdl.extras` key across the hot tier's own `runs.mdl` JSON
 *  column (see index.ts's `mdlJson`: `{mdl, categories}`, the same column `mdlRows` above already reads)
 *  that ISN'T one of `opts.knownKeys` — the caller passes the built-in mdl catalog keys plus whatever a
 *  project's own `config.mdl` already declares. Bounded on both axes (distinct keys, and distinct values per
 *  key) so a large ledger with many one-off custom keys can't turn this into an unbounded scan — "foundational
 *  only," per this piece's own instructions, not a general-purpose analytics query. */
export function undeclaredFieldSamples(paths: Mm3Paths, opts: { knownKeys: readonly string[] }): UndeclaredField[] {
  if (!existsSync(paths.index)) return [];
  const db = openGraphDb(paths.index);
  try {
    const known = new Set(opts.knownKeys);
    const rows = db.prepare('SELECT mdl FROM runs WHERE mdl IS NOT NULL').all();
    const byKey = new Map<string, { count: number; values: string[] }>();
    for (const row of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(row.mdl));
      } catch {
        continue;
      }
      const extras = (parsed as { mdl?: { extras?: Record<string, unknown> } } | null)?.mdl?.extras;
      if (!extras || typeof extras !== 'object') continue;
      for (const [key, rawValue] of Object.entries(extras)) {
        if (known.has(key)) continue;
        let entry = byKey.get(key);
        if (!entry) {
          if (byKey.size >= MAX_UNDECLARED_KEYS) continue; // cap distinct keys, not just values per key
          entry = { count: 0, values: [] };
          byKey.set(key, entry);
        }
        entry.count += 1;
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        for (const v of values) {
          const s = String(v);
          if (entry.values.length < MAX_VALUES_PER_KEY && !entry.values.includes(s)) entry.values.push(s);
        }
      }
    }
    return [...byKey.entries()].map(([key, e]) => ({ key, count: e.count, samples: e.values.slice(0, MAX_SAMPLES_PER_KEY), values: e.values }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export interface TraversalHit {
  path: string[];
  nodes: GraphNode[];
}

const PATH_SEP = '\u001f'; // never appears in a real label; safer than a human-looking separator like " > "

/** One `WITH RECURSIVE` traversal from a start node, depth-capped at 6 server-side regardless of what's asked
 * , with a cycle guard (a comma-joined visited-id list + `NOT LIKE`) and a row `LIMIT` so a
 *  dense graph can't blow up one query. Returns instantly (and correctly — zero rows) when the graph is
 *  empty/small or the start node doesn't exist. */
export function traverse(paths: Mm3Paths, opts: { kind: string; label: string; maxDepth?: number; limit?: number }): TraversalHit[] {
  if (!existsSync(paths.index)) return [];
  const db = openGraphDb(paths.index);
  try {
    const label = normalizeLabel(opts.kind, opts.label);
    const start = db.prepare('SELECT id FROM nodes WHERE kind = ? AND label = ?').get(opts.kind, label);
    if (!start) return [];
    const maxDepth = Math.min(Math.max(opts.maxDepth ?? 4, 1), 6);
    const limit = Math.min(Math.max(opts.limit ?? 200, 1), 2000);
    const rows = db
      .prepare(
        `WITH RECURSIVE walk(node, depth, pids, plabels) AS (
           SELECT n.id, 0, ',' || n.id || ',', n.kind || ':' || n.label
           FROM nodes n WHERE n.id = ?
           UNION ALL
           SELECT t.o, walk.depth + 1, walk.pids || t.o || ',', walk.plabels || '${PATH_SEP}' || n2.kind || ':' || n2.label
           FROM triples t
           JOIN walk ON t.s = walk.node
           JOIN nodes n2 ON n2.id = t.o
           WHERE walk.depth < ? AND walk.pids NOT LIKE '%,' || t.o || ',%'
         )
         SELECT plabels FROM walk WHERE depth > 0 LIMIT ?`,
      )
      .all(Number(start.id), maxDepth, limit);
    return rows.map((r) => {
      const segs = String(r.plabels).split(PATH_SEP);
      const nodes = segs.map((s) => {
        const i = s.indexOf(':');
        return { kind: s.slice(0, i), label: s.slice(i + 1) };
      });
      return { path: segs, nodes };
    });
  } catch {
    return [];
  } finally {
    db.close();
  }
}

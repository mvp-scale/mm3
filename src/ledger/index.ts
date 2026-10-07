/**
 * The id index: .mm3/index.db, a disposable SQLite sidecar (node:sqlite, lazy dynamic import) speeding up
 * every read log.ts/reuse.ts/view.ts do against log.jsonl. The log stays the source of truth (AGENTS.md): this
 * file never rewrites log.jsonl, and a missing/corrupt/stale index just costs the next call a rebuild — never a
 * wrong answer. This file's schema and on-disk layout are not being tuned further for now; see
 * docs/evidence/ledger-scale.md's own note.
 *
 * Two engines behind one `withIndex` entry point, both fed by ONE line-interpretation (`applyLine`/`Sink`), so
 * they can never disagree about what a line means — only about where the answer is stored:
 *   - SQLite (node:sqlite `DatabaseSync`): self-healing on open (rebuild on missing/corrupt/wrong-schema/shorter
 *     log/fingerprint mismatch; catch-up on pure growth), persisted to .mm3/index.db under the ledger lock
 *     (skipped when this process already holds it — see withLockIfNeeded).
 *   - Linear fallback (in-memory only, never persisted): the always-correct oracle a real SQLite call still
 *     falls back to when it throws (a corrupt or mid-write index.db — self-heal's own safety net, unrelated to
 *     Node version). Node ≥ 22.13 is a hard requirement ([C-107]): node:sqlite genuinely missing
 *     is no longer a silent reason to use this path in production — `runSqlite` throws a LedgerError instead,
 *     since cli.ts's own version guard means every command but `doctor` already stops before reaching here at
 *     all; this throw is only the backstop for a caller (a library consumer) that reaches the ledger directly,
 *     bypassing the CLI. `__testOnly.forceFallback`/`forceSqliteMissing` force this path on purpose, on any
 *     Node, to prove the two engines agree (ledger-index.test.ts) — never set outside a test.
 * A project with no ledger yet (log.jsonl missing or empty) never touches disk here at all — no .mm3/, no
 * index.db — for either engine: dry runs, `view`, and any command before the first write must create nothing.
 * Once a real write happens, log.jsonl exists first (appendLine's own mkdir), so the next index build has
 * something to persist against.
 *
 * Schema (slim — no full JSON copy; bodies are read back from the ledger by offset, `readRecordAt`):
 *   meta(key,value): schema_version, upto (bytes indexed), line_count, fp_start + fingerprint (sha256 of the
 *     line ending at upto, for a same-size-or-larger swap statSync's size check alone would miss).
 *   runs(id PK, offset, adapter, model, verb, ts, gate, blocked, mdl, parent, pattern): `mdl` is a small JSON
 *     blob — the mdl object plus category names — so a future Mdl query can `json_extract` it; nothing bulky
 *     (answers, response, items) is copied here. `parent` (indexed) is the run's own `parent` field verbatim
 *     (NULL for none) — view's lineage walk goes up by id (an ordinary findOffset lookup on the parent id
 *     already read off the child's own record) and down via `WHERE parent = ?` on this column. `pattern`
 *     (`patternFingerprint` below) is a short hash of the run's own question set (categories/layers,
 *     names+pass+need+question text, evidence-independent) — NULL for a Plan 1 run or one with no `ask` at all
 *     — so `mm3 report patterns` can `GROUP BY` it without re-reading every record's own body.
 *   answer_keys(adapter, model, key PK, run_id, qid): the newest holder's *origin* (resolved through
 *     reusedFrom), self-compacting — one row per (who, key) ever asked, overwritten on every later touch.
 *   outcomes(run_id PK, outcome, ts, by): latest outcome per run.
 *   places(kind, val, run_id): one row per `where` entry (kind 'where') or legacy tag (kind 'tag'), literal
 *     values only (no prefix expansion at write time — `placeCandidates` below does a range-prefix read instead).
 *   categories(run_id, name, section, family, gate): one row per category a run's own ask carried — one-subject
 *     (`ask.categories`) or a sweep's own layers (`ask.layers[].categories`), never both — so `mm3 report`
 *     can `GROUP BY family` with a plain indexed query instead of a JSON blob (the "family per category
 *     as queryable"; see `runCategories` below). The `mdl` column's own JSON blob already carries
 *     problem/nodes/touches/blast for free (it serializes the run's whole `Mdl` object verbatim, and that
 *     type gained those fields too) — no schema change needed for those; `family` (and `section`)
 *     are the genuinely new things to index here, since they live on each `Category`, not on `mdl`.
 */
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, type Stats } from 'node:fs';
import type { Category, Gate, Verb } from '../contract/types.ts';
import { normalizeMdl } from '../contract/mdl-fields.ts';
import { isContractRun, isRecord, LedgerError, notARecord, shownLog, type ConfigRecord, type ContractRun, type FailedRecord, type LedgerRecord, type OutcomeRecord, type RunRecord } from './log.ts';
import { isAbsent, withLock } from './lock.ts';
import { ensureDir, type Mm3Paths } from './paths.ts';
import { MIN_NODE_LABEL } from '../util/node-version.ts';

const whoKey = (who: { adapter: string; model: string }): string => `${who.adapter}|${who.model}`;

/** Strips a trailing ":start" or ":start-end" from a v2 `where` entry — the same shape evidence/code.ts and
 *  view.ts parse. Shared here (rather than duplicated in view.ts) so the index and view agree on what a place
 *  string is. */
export const stripLines = (entry: string): string => entry.replace(/:(\d+(?:-\d+)?)$/u, '');

/** A sweep run's own `where` is always `[]` (scan.ts/loop.ts/drill.ts) — its real code locations live in
 *  `items[id].unit.path`, and its category names for `view <tag>` live in `ask.layers[].categories[].tags`. Both
 *  sinks call this so they can never disagree about what a sweep run's places are. Deduped: a sweep can visit the
 *  same file (or tag) many times over. Shared with view.ts's whereMatches/tagsMatch, which re-verify every
 *  candidate this produces against the real record (never trusted blindly, same discipline as every other index
 *  candidate here). */
export function sweepPlaces(rec: ContractRun): { kind: 'where' | 'tag'; val: string }[] {
  if (!rec.items) return [];
  const out: { kind: 'where' | 'tag'; val: string }[] = [];
  const seen = new Set<string>();
  const add = (kind: 'where' | 'tag', val: string): void => {
    const k = `${kind}\u0000${val}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ kind, val });
  };
  for (const item of Object.values(rec.items)) if (item.unit) add('where', item.unit.path);
  for (const layer of rec.ask.layers) for (const cat of layer.categories) for (const tag of cat.tags) add('tag', tag);
  return out;
}

/** One category's question-set shape, evidence-independent (name/pass/need/question text+kind+levels/options) —
 *  the unit `patternFingerprint` hashes. Two categories with the same name/pass/need/questions fingerprint the
 *  same regardless of where or when they were asked, which is exactly "the same question set" the
 *  `patterns` view groups by. */
function categoryShape(c: Category): unknown {
  return {
    name: c.name,
    pass: c.pass,
    need: c.need,
    questions: [...c.questions]
      .sort((a, b) => a.n - b.n)
      .map((q) => ({ kind: q.kind, text: q.text, ...(q.kind === 'scale' ? { levels: q.levels } : {}), ...(q.kind === 'choice' ? { options: q.options } : {}) })),
  };
}

/** For `mm3 report patterns`: a short hash of a contract run's own question set — its categories
 *  (one subject) or its layers of categories (a sweep), sorted by name so the SAME set fingerprints identically
 *  regardless of authoring order. NULL for a Plan 1 run, or a contract run with no `ask` at all (shouldn't occur
 *  in practice, but never crash over it). Deliberately excludes the evidence: two runs asking the identical
 *  questions of different code are the same "pattern," which is the whole point of grouping by it. */
export function patternFingerprint(rec: RunRecord | ContractRun): string | null {
  if (!isContractRun(rec)) return null;
  const { categories, layers } = rec.ask;
  if (!categories.length && !layers.length) return null;
  const shape = categories.length
    ? [...categories].sort((a, b) => a.name.localeCompare(b.name)).map(categoryShape)
    : [...layers].map((l) => ({ name: l.name, categories: [...l.categories].sort((a, b) => a.name.localeCompare(b.name)).map(categoryShape) }));
  return sha256hex(JSON.stringify(shape)).slice(0, 16);
}

/** One row of `mm3 report patterns`: a question-set fingerprint, how often it's been run, its pass/fail/
 *  unsure split, how many distinct places it's touched, and its outcomes so far. */
export interface PatternRow {
  pattern: string;
  runs: number;
  pass: number;
  fail: number;
  unsure: number;
  places: number;
  outcomes: { held: number; overruled: number; failed: number; open: number };
}

/** One row of a future `mm3 report families`: a concern `family`, how many categories (across every run)
 *  carried it, how many distinct runs that touched, and those categories' own pass/fail/unsure split — plan
 *  2b's "family per category as queryable". Counted per CATEGORY, not per run: a run with two categories of the
 *  same family (rare, but the schema allows it) counts twice, since each category has its own gate. Not exported:
 *  the report command that would consume this is explicitly out of scope for this plan ("the report re-key on
 *  family" — out of scope for the plan that added it); `familyCounts()`
 *  itself stays, proven correct (both index engines agree) so that future command has real, tested data to read. */
interface FamilyRow {
  family: string;
  categories: number;
  runs: number;
  pass: number;
  fail: number;
  unsure: number;
}

interface ReuseHit {
  runId: string;
  qid: string;
  offset: number;
  blocked: boolean;
}

type Candidate = { id: string; offset: number };

/** What `view <place>` shows besides the runs themselves: how many runs touched a place (every run for null), how
 *  they split by adapter and latest outcome (the rehearsal split is the caller's, by adapter name), and the newest
 *  few. Counts only, no record is read to produce it. */
interface PlaceRunStats {
  total: number;
  breakdown: { adapter: string; outcome: OutcomeRecord['outcome'] | null; n: number }[];
  /** Newest first, at most the requested limit. */
  newest: Candidate[];
}

/** One row of `newestPerWherePlace`: a `where` place, its newest candidate run, and (when the index can vouch for
 *  it) that run's complete `{category: gate}` map as rows. */
interface NewestPlaceRun {
  place: string;
  id: string;
  offset: number;
  categories?: { name: string; gate: string }[];
}

/** What log.ts/reuse.ts/view.ts can ask the index, regardless of which engine answered it. Every method is a
 *  point read or a small bounded query — never a full-ledger scan on the SQLite path. */
export interface IndexHandle {
  findOffset(id: string): number | undefined;
  runCount(): number;
  /** Bytes of the log already reflected here — checkLedger's targeted tail read starts here. */
  upto(): number;
  /** 1-based line count already reflected here (so checkTail's tail can name the right line number). */
  lineCount(): number;
  isBlocked(id: string): boolean;
  /** The fast O(1) reuse path: a key's newest origin holder (already resolved through reusedFrom). */
  reuseKeyHit(adapter: string, model: string, key: string): ReuseHit | undefined;
  /** Every UNBLOCKED contract run for (adapter, model), newest first, with its offset. */
  candidates(adapter: string, model: string): Candidate[];
  /** Runs whose recorded where/tag entries could match `place` (exact, or a descendant path), oldest first (log
   *  append order, by offset) — matching the order view.ts's byPlace has always shown its "newest N" from. A
   *  candidate SET ONLY — callers still verify against the real record, so a false positive here is harmless. */
  placeCandidates(place: string): Candidate[];
  /** For `mm3 report hits`: for EVERY distinct `where` place, its newest candidate run — exactly
   *  `placeCandidates(place).at(-1)` — in one set-based query instead of one candidate list (all of its runs, only
   *  the last wanted) plus one record read per place. `categories` is present only when the index itself can vouch
   *  for the complete answer: every category gate of that run read back from the `categories` table, proven
   *  complete against the key count the run's own `mdl` column carries (`Object.keys(rec.categories)`). Absent
   *  means "read the record" (a sweep, a Plan 1 run, or a run whose categories the index cannot vouch for). */
  newestPerWherePlace(): NewestPlaceRun[];
  /** For `view <place>`: the same candidate set as `placeCandidates(place)` (null: every run), counted and split in
   *  SQL instead of listed, plus its newest `limit` members. A candidate SET ONLY, like placeCandidates: callers
   *  re-verify the few records they actually show. */
  placeRunStats(place: string | null, limit: number): PlaceRunStats;
  /** Every run whose `parent` is exactly this id, oldest first (append order) — view's lineage walk "down". A
   *  candidate set only, same discipline as placeCandidates: callers re-verify against the real record. */
  childrenOf(parentId: string): Candidate[];
  /** run id -> its latest outcome, for a small batch of ids (view's outcome counts). */
  outcomesFor(ids: readonly string[]): Map<string, OutcomeRecord['outcome']>;
  /** True when SOME run has ever held this key for (adapter, model) — a raw answer_keys row check, independent
   *  of whether that holder is currently blocked. False proves conclusively that no candidate walk could ever
   *  find this key (the linear oracle would find nothing either, since no run's own `keys` map ever held it),
   *  so lookupAnswers/exactReuse skip the O(candidates) walk entirely for a key nobody ever asked — the common
   *  "genuinely new question" case a reuse MISS pays for today. */
  everHeld(adapter: string, model: string, key: string): boolean;
  /** The latest recorded outcome for one run id (outcome + who recorded it + its own uid/ts), or undefined if
   *  none yet — appendOutcome's own "is this exactly the same outcome, by the same actor, already there?"
   *  no-op check, without a full ledger scan. */
  latestOutcomeOf(id: string): { outcome: OutcomeRecord['outcome']; uid: string; ts: string; by: string } | undefined;
  /** For `mm3 report`: every distinct place (a `where` path or a sweep tag) ever recorded — report's
   *  own enumeration of "everywhere there's something to say," unlike placeCandidates, which narrows FROM one
   *  already-known place. */
  distinctPlaces(): { kind: 'where' | 'tag'; val: string }[];
  /** For `mm3 report patterns`: every question-set fingerprint (patternFingerprint) that's ever been
   *  run, with its run/pass/fail/unsure/place/outcome counts. Runs with no fingerprint (a Plan 1 run, or a
   *  contract run with no `ask`) are excluded — there's nothing to group them by. */
  patternCounts(): PatternRow[];
  /** For a future `mm3 report families`: every concern `family` any category has ever carried, with how
   *  many categories (and distinct runs) touched it and their pass/fail/unsure split — the "family per
   *  category as queryable" made real, not just stored. Categories with no family set are excluded (nothing to
   *  group them by, same discipline as patternCounts). */
  familyCounts(): FamilyRow[];
  /** For `mm3 report history`: every `replay`-verb run, newest first, capped at `limit`. */
  recentReplays(limit: number): Candidate[];
  /** For `mm3 report history`: every recorded outcome, newest first, capped at `limit`. */
  recentOutcomes(limit: number): { runId: string; outcome: OutcomeRecord['outcome']; ts: string; by: string }[];
  /** For the budget: total `costUsd` and count of every contract-run/run/failed record with
   *  `ts >= sinceIso` — one indexed query, never a full-ledger scan on the paid path. See `budgetRollup` below. */
  budgetRollup(sinceIso: string): { spentUsd: number; runs: number };
  /** Byte offset of the newest config receipt in the log, or undefined when there is none. */
  latestConfigOffset(): number | undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Shared line interpretation: the one place a JSONL line becomes index state, fed to either engine's Sink.
// ---------------------------------------------------------------------------------------------------------------

interface Sink {
  run(rec: RunRecord | ContractRun, offset: number): void;
  outcome(rec: OutcomeRecord): void;
  /** A failed call: never gets an id-index entry (no MM3-####, nothing to look up by), but its `ts`/`costUsd`
   *  still count toward the budget rollup below ("budget.runs == paid runs + failed records") —
   *  see budgetRollup's own comment for why this needs its own tiny table rather than living in `runs`. */
  failed(rec: FailedRecord): void;
  /** A config receipt: only where the newest one sits is kept (the index never copies its contents). */
  config(offset: number): void;
}

const CHUNK_BYTES = 1 << 20; // 1 MiB: bounds memory during a scan regardless of log.jsonl's size.

/** Whether a run/contract record counts toward the budget rollup (the invariant: "budget.runs == paid
 *  runs (calls > 0) + failed records"). A Plan-1 `RunRecord` has no `calls` field — it predates reuse/free runs
 *  entirely, so every one of them was paid. A `ContractRun` counts only when it actually made a call:
 *  `recordFree`'s fully-reused runs (`calls: 0`) must never inflate the run cap or its spend. */
function countsTowardBudget(rec: RunRecord | ContractRun): boolean {
  return !isContractRun(rec) || rec.calls > 0;
}

/** A ledger record written before mdl v2 may still carry `mdl.nodes` (a single chain string) instead
 *  of `mdl.uses` — every raw-JSON parse site in the ledger (this file's own `parseLedgerLine`/`readRecordAt`, and
 *  log.ts's `readLedger`) runs a freshly-parsed record through here so every reader (report, view, report patterns/
 *  history) sees `uses` uniformly, without each of them having to check for the old shape. Guarded: most records
 *  carry `mdl: null`, which `normalizeMdl` would throw on if called directly on it. It also lifts the pre-rename
 *  `wise`/`side` keys to `mdl`/`mak`. Exported so log.ts's own
 *  parse site can reuse it rather than duplicating the guard. */
export function normalizeRecordMdl<T>(value: T): T {
  // compat: records written before the MM3 rename carry `wise`/`side` keys where new ones carry `mdl`/`mak`
  const legacy = value as Record<string, unknown>;
  for (const [oldKey, newKey] of [['wise', 'mdl'], ['side', 'mak']] as const) {
    if (oldKey in legacy && !(newKey in legacy)) legacy[newKey] = legacy[oldKey];
    delete legacy[oldKey];
  }
  const w = (value as { mdl?: unknown }).mdl;
  if (w && typeof w === 'object' && !Array.isArray(w)) {
    (value as { mdl?: unknown }).mdl = normalizeMdl(w as { uses?: string[]; nodes?: string });
  }
  return value;
}

function parseLedgerLine(raw: string, lineNo: number, shown: string): LedgerRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new LedgerError(`✖ ledger: line ${lineNo} of ${shown} is not valid JSON → fix or remove that line`);
  }
  if (!isRecord(value)) {
    throw notARecord(value, lineNo, shown);
  }
  return normalizeRecordMdl(value);
}

/** Applies one line to `sink`, and reports whether it was a 'run' line — scanRange tracks `runsSeen` from this,
 *  independent of whatever the sink itself does with `runs.id PK`. That independence matters: the SQL sink's
 *  `runs` table is keyed by id (INSERT OR REPLACE — a colliding id, which a real ledger's own id-assignment
 *  invariant never produces, replaces a row rather than adding one), so `SELECT COUNT(*) FROM runs` alone would
 *  silently under-count in a corrupt/hand-edited ledger with duplicate ids. nextRunNumber must count LINES, the
 *  same way readLedger's own linear scan always has, on both engines, matching either way in every real case
 *  and staying honest (not silently wrong) in a corrupt one. */
function applyLine(sink: Sink, raw: string, startByte: number, lineNo: number, shown: string): boolean {
  const value = parseLedgerLine(raw, lineNo, shown);
  if (value.kind === 'outcome') {
    sink.outcome(value);
    return false;
  }
  if (value.kind === 'failed') {
    sink.failed(value);
    return false; // never gets an id-index entry — see Sink.failed's own comment
  }
  if (value.kind === 'config') {
    sink.config(startByte);
    return false;
  }
  if (value.kind !== 'run') return false;
  sink.run(value, startByte);
  return true;
}

interface ScanResult {
  upto: number;
  lineCount: number;
  /** Count of 'run' lines applied during THIS call only (a delta, not a running total — see writeMetaStateFull/
   *  writeMetaStateCatchUp, which add it to the previously stored run_count). */
  runsSeen: number;
  /** Start byte of the last COMPLETE line actually applied during this call (unchanged from the input when no
   *  new complete line was found — e.g. only a partial in-progress tail was added). */
  lastLineStart: number;
  /** Raw text of that same last complete line ('' when nothing changed), for the fingerprint. */
  lastLineRaw: string;
}

/** Scans [from, to) of an open fd in bounded chunks, applying each complete `\n`-terminated line to `sink`.
 *  Works on raw bytes until a line is found, so a chunk boundary can never split a multi-byte UTF-8 character.
 *  The final partial line (no trailing \n) is left unconsumed — an append in progress is picked up next time. */
function scanRange(fd: number, from: number, to: number, sink: Sink, shown: string, startUpto: number, startLineCount: number): ScanResult {
  let at = startUpto;
  let line = startLineCount;
  let runsSeen = 0;
  let lastLineStart = startUpto;
  let lastLineRaw = '';
  let pos = from;
  let carry = Buffer.alloc(0);
  const buf = Buffer.alloc(Math.min(CHUNK_BYTES, Math.max(1, to - from)));
  while (pos < to) {
    const want = Math.min(buf.length, to - pos);
    const got = readSync(fd, buf, 0, want, pos);
    if (got <= 0) break;
    pos += got;
    const chunk = carry.length ? Buffer.concat([carry, buf.subarray(0, got)]) : Buffer.from(buf.subarray(0, got));
    let lineStart = 0;
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] !== 0x0a) continue;
      const raw = chunk.toString('utf8', lineStart, i);
      const startByte = at;
      at += i - lineStart + 1;
      line += 1;
      lastLineStart = startByte;
      lastLineRaw = raw;
      if (raw.trim() && applyLine(sink, raw, startByte, line, shown)) runsSeen += 1;
      lineStart = i + 1;
    }
    carry = Buffer.from(chunk.subarray(lineStart));
  }
  return { upto: at, lineCount: line, runsSeen, lastLineStart, lastLineRaw };
}

const sha256hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** Targeted read of the log's CURRENT bytes [from, to) — never the whole file — for verifying a stored
 *  fingerprint against what's on disk right now (self-heal's own check, before trusting a stored `upto`). */
function hashLogRange(logPath: string, from: number, to: number): string {
  if (to <= from) return sha256hex('');
  const fd = openSync(logPath, 'r');
  try {
    const buf = Buffer.alloc(to - from);
    let got = 0;
    while (got < buf.length) {
      const n = readSync(fd, buf, got, buf.length - got, from + got);
      if (n <= 0) break;
      got += n;
    }
    return sha256hex(buf.subarray(0, got).toString('utf8'));
  } finally {
    closeSync(fd);
  }
}

/** Opens the log once and sizes that same open file (never a stat-then-open pair): the open descriptor and its stat, or undefined when there is no log yet. The caller closes the descriptor. */
function openLog(logPath: string): { fd: number; st: Stats } | undefined {
  let fd: number;
  try {
    fd = openSync(logPath, 'r');
  } catch (e) {
    if (isAbsent(e)) return undefined;
    throw e;
  }
  try {
    return { fd, st: fstatSync(fd) };
  } catch (e) {
    closeSync(fd);
    throw e;
  }
}

/**
 * Opens log.jsonl once and returns a reader over it, for a caller that reads many records in one go (report's
 * newest-run-per-place pass): the same bytes-by-offset read `readRecordAt` does — one open, one size, a reused
 * descriptor — without paying an open/fstat/close per record. `read(offset)` has `readRecordAt`'s contract: the
 * parsed record, or undefined for a missing log, an offset at or past the size seen at open time, or bytes that
 * do not parse as JSON (a stale offset, never a crash). Always `close()` it.
 */
export function openRecordReader(logPath: string): { read(offset: number): LedgerRecord | undefined; close(): void } {
  let fd: number | undefined;
  let size = 0;
  try {
    fd = openSync(logPath, 'r');
    size = fstatSync(fd).size;
  } catch {
    if (fd !== undefined) closeSync(fd);
    fd = undefined;
  }
  return {
    read(offset: number): LedgerRecord | undefined {
      if (fd === undefined || offset < 0 || offset >= size) return undefined; // missing log, or a stale offset
      try {
        let chunkSize = Math.min(4096, size - offset);
        for (;;) {
          const buf = Buffer.alloc(chunkSize);
          const got = readSync(fd, buf, 0, chunkSize, offset);
          if (got <= 0) return undefined;
          const nl = buf.subarray(0, got).indexOf(0x0a);
          const complete = nl !== -1 ? buf.toString('utf8', 0, nl) : offset + got >= size ? buf.toString('utf8', 0, got) : null;
          if (complete !== null) {
            try {
              return normalizeRecordMdl(JSON.parse(complete) as LedgerRecord);
            } catch {
              return undefined; // garbled at this offset: stale, not a crash
            }
          }
          chunkSize = Math.min(chunkSize * 2, size - offset);
        }
      } catch {
        return undefined;
      }
    },
    close(): void {
      if (fd !== undefined) closeSync(fd);
      fd = undefined;
    },
  };
}

/**
 * Reads one line of log.jsonl starting at `offset` (to the next \n, or EOF) and parses it, or returns undefined
 * if it can't: `offset` at or past the log's current size, or the bytes there don't parse as JSON. Never an
 * error on its own — a stale offset (a bad entry, or the log changing between the index read and this call) is
 * exactly the situation findRun's rebuild-and-retry is for, never a raw crash. Grows its read window
 * exponentially from 4 KiB so a normal-sized line costs one small read, not one read of the whole file.
 */
export function readRecordAt(logPath: string, offset: number): LedgerRecord | undefined {
  const reader = openRecordReader(logPath);
  try {
    return reader.read(offset);
  } finally {
    reader.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Linear fallback: in-memory only, never persisted. The oracle — one full scan, always correct, just slower.
// ---------------------------------------------------------------------------------------------------------------

interface MemoryState {
  runOffset: Map<string, number>;
  blocked: Set<string>;
  reuseKey: Map<string, Map<string, { runId: string; qid: string }>>;
  candidatesByWho: Map<string, Candidate[]>;
  places: { kind: 'where' | 'tag'; val: string; runId: string }[];
  /** Mirrors the SQL engine's `categories` table (family/section per category, queryable) — feeds
   *  familyCounts below (see runCategories's own comment for how both engines fill this identically). */
  categories: { runId: string; name: string; section: string; family: string | null; gate: string | null }[];
  childrenByParent: Map<string, Candidate[]>;
  outcomes: Map<string, { outcome: OutcomeRecord['outcome']; uid: string; ts: string; by: string }>;
  /** id -> {ts, cost}, one entry per run/failed record ever applied (keyed, like the SQL `spend` table's own
   *  PRIMARY KEY, so a reprocessed id replaces rather than double-counts) B1's budget rollup source. */
  spend: Map<string, { ts: string; cost: number }>;
  /** Every run, oldest first, regardless of adapter/model — `recentReplays`/`patternCounts` need a global view
   *  `candidatesByWho` (scoped per adapter+model) can't give them. */
  allRuns: { id: string; offset: number; verb: Verb; gate: Gate | null; pattern: string | null; adapter: string }[];
  runCount: number;
  upto: number;
  lineCount: number;
  /** Where the newest config receipt starts in the log. */
  configOffset: number | undefined;
}

function emptyMemoryState(): MemoryState {
  return { runOffset: new Map(), blocked: new Set(), reuseKey: new Map(), candidatesByWho: new Map(), places: [], categories: [], childrenByParent: new Map(), outcomes: new Map(), allRuns: [], spend: new Map(), runCount: 0, upto: 0, lineCount: 0, configOffset: undefined };
}

function memorySink(state: MemoryState): Sink {
  return {
    run(rec, offset) {
      state.runCount += 1;
      if (countsTowardBudget(rec)) state.spend.set(rec.id, { ts: rec.ts, cost: rec.costUsd ?? 0 });
      state.runOffset.set(rec.id, offset);
      state.allRuns.push({ id: rec.id, offset, verb: rec.verb, gate: isContractRun(rec) ? rec.gate : null, pattern: patternFingerprint(rec), adapter: rec.adapter });
      const parent = rec.parent ?? null;
      if (parent) {
        if (!state.childrenByParent.has(parent)) state.childrenByParent.set(parent, []);
        state.childrenByParent.get(parent)!.push({ id: rec.id, offset });
      }
      if (isContractRun(rec)) {
        const wk = whoKey({ adapter: rec.adapter, model: rec.model });
        if (!state.candidatesByWho.has(wk)) state.candidatesByWho.set(wk, []);
        state.candidatesByWho.get(wk)!.unshift({ id: rec.id, offset });
        if (!state.reuseKey.has(wk)) state.reuseKey.set(wk, new Map());
        const table = state.reuseKey.get(wk)!;
        for (const [qid, key] of Object.entries(rec.keys)) table.set(key, { runId: rec.reusedFrom[qid] ?? rec.id, qid });
        for (const w of rec.where) state.places.push({ kind: 'where', val: stripLines(w), runId: rec.id });
        for (const p of sweepPlaces(rec)) state.places.push({ ...p, runId: rec.id });
        for (const c of runCategories(rec)) state.categories.push({ runId: rec.id, name: c.name, section: c.section, family: c.family ?? null, gate: rec.categories[c.name] ?? null });
      } else {
        for (const w of rec.where) state.places.push({ kind: 'where', val: w.path, runId: rec.id });
        for (const t of rec.tags) state.places.push({ kind: 'tag', val: t, runId: rec.id });
      }
    },
    outcome(rec) {
      if (rec.outcome === 'held') state.blocked.delete(rec.of);
      else state.blocked.add(rec.of);
      state.outcomes.set(rec.of, { outcome: rec.outcome, uid: rec.uid, ts: rec.ts, by: rec.by });
    },
    failed(rec) {
      state.spend.set(rec.id, { ts: rec.ts, cost: rec.costUsd ?? 0 });
    },
    config(offset) {
      state.configOffset = offset;
    },
  };
}

/** The linear engine's placeCandidates: every run whose recorded where entries are `place` or below it, or whose
 *  tag is `place`, oldest first. Shared by placeCandidates and placeRunStats. */
function memoryPlaceCandidates(state: MemoryState, place: string): Candidate[] {
  const prefix = `${place}/`;
  const ids = new Set<string>();
  for (const p of state.places) {
    const hit = p.kind === 'tag' ? p.val === place : p.val === place || p.val.startsWith(prefix);
    if (hit) ids.add(p.runId);
  }
  return [...ids]
    .map((id) => ({ id, offset: state.runOffset.get(id) }))
    .filter((c): c is Candidate => c.offset !== undefined)
    .sort((a, b) => a.offset - b.offset);
}

function handleFromMemory(state: MemoryState): IndexHandle {
  return {
    findOffset: (id) => state.runOffset.get(id),
    runCount: () => state.runCount,
    upto: () => state.upto,
    lineCount: () => state.lineCount,
    isBlocked: (id) => state.blocked.has(id),
    reuseKeyHit: (adapter, model, key) => {
      const hit = state.reuseKey.get(whoKey({ adapter, model }))?.get(key);
      if (!hit) return undefined;
      const offset = state.runOffset.get(hit.runId);
      return offset === undefined ? undefined : { ...hit, offset, blocked: state.blocked.has(hit.runId) };
    },
    candidates: (adapter, model) => (state.candidatesByWho.get(whoKey({ adapter, model })) ?? []).filter((c) => !state.blocked.has(c.id)),
    placeCandidates: (place) => memoryPlaceCandidates(state, place),
    newestPerWherePlace: () => {
      // Same answer as placeCandidates(place).at(-1) for every distinct where place, in one pass: each recorded
      // place string credits its newest run to itself and to every ancestor directory ("a/b/c.ts" -> "a/b/c.ts",
      // "a/b", "a"); a tag equal to a where place credits that place too (placeCandidates' tag branch).
      const wherePlaces = new Set<string>();
      for (const p of state.places) if (p.kind === 'where') wherePlaces.add(p.val);
      const newest = new Map<string, { id: string; offset: number }>();
      const credit = (place: string, runId: string): void => {
        if (!wherePlaces.has(place)) return;
        const offset = state.runOffset.get(runId);
        if (offset === undefined) return;
        const cur = newest.get(place);
        if (!cur || offset > cur.offset) newest.set(place, { id: runId, offset });
      };
      for (const p of state.places) {
        if (p.kind === 'tag') {
          credit(p.val, p.runId);
          continue;
        }
        credit(p.val, p.runId);
        for (let i = p.val.indexOf('/'); i !== -1; i = p.val.indexOf('/', i + 1)) credit(p.val.slice(0, i), p.runId);
      }
      return [...newest.entries()].map(([place, n]) => ({ place, id: n.id, offset: n.offset }));
    },
    placeRunStats: (place, limit) => {
      const adapterOf = new Map(state.allRuns.map((r) => [r.id, r.adapter]));
      const cands = place === null ? state.allRuns.map((r) => ({ id: r.id, offset: r.offset })) : memoryPlaceCandidates(state, place);
      const byKey = new Map<string, { adapter: string; outcome: OutcomeRecord['outcome'] | null; n: number }>();
      for (const c of cands) {
        const adapter = adapterOf.get(c.id) ?? '';
        const outcome = state.outcomes.get(c.id)?.outcome ?? null;
        const key = `${adapter}\u0000${outcome ?? ''}`;
        const cur = byKey.get(key);
        if (cur) cur.n += 1;
        else byKey.set(key, { adapter, outcome, n: 1 });
      }
      return { total: cands.length, breakdown: [...byKey.values()], newest: cands.slice(-limit).reverse() };
    },
    childrenOf: (parentId) => state.childrenByParent.get(parentId) ?? [],
    outcomesFor: (ids) => {
      const want = new Set(ids);
      const out = new Map<string, OutcomeRecord['outcome']>();
      for (const [id, rec] of state.outcomes) if (want.has(id)) out.set(id, rec.outcome);
      return out;
    },
    everHeld: (adapter, model, key) => state.reuseKey.get(whoKey({ adapter, model }))?.has(key) ?? false,
    latestOutcomeOf: (id) => state.outcomes.get(id),
    distinctPlaces: () => {
      const seen = new Set<string>();
      const out: { kind: 'where' | 'tag'; val: string }[] = [];
      for (const p of state.places) {
        const k = `${p.kind}\u0000${p.val}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ kind: p.kind, val: p.val });
      }
      return out;
    },
    patternCounts: () => {
      const patternOfRun = new Map<string, string>();
      const byPattern = new Map<string, { runs: number; pass: number; fail: number; unsure: number }>();
      for (const r of state.allRuns) {
        if (!r.pattern) continue;
        patternOfRun.set(r.id, r.pattern);
        const cur = byPattern.get(r.pattern) ?? { runs: 0, pass: 0, fail: 0, unsure: 0 };
        cur.runs += 1;
        if (r.gate === 'pass') cur.pass += 1;
        else if (r.gate === 'fail') cur.fail += 1;
        else if (r.gate === 'unsure') cur.unsure += 1;
        byPattern.set(r.pattern, cur);
      }
      const placesByPattern = new Map<string, Set<string>>();
      for (const p of state.places) {
        const pat = patternOfRun.get(p.runId);
        if (!pat) continue;
        if (!placesByPattern.has(pat)) placesByPattern.set(pat, new Set());
        placesByPattern.get(pat)!.add(`${p.kind}\u0000${p.val}`);
      }
      const outcomesByPattern = new Map<string, { held: number; overruled: number; failed: number }>();
      for (const [runId, rec] of state.outcomes) {
        const pat = patternOfRun.get(runId);
        if (!pat) continue;
        const cur = outcomesByPattern.get(pat) ?? { held: 0, overruled: 0, failed: 0 };
        cur[rec.outcome] += 1;
        outcomesByPattern.set(pat, cur);
      }
      return [...byPattern.entries()]
        .map(([pattern, c]) => {
          const oc = outcomesByPattern.get(pattern) ?? { held: 0, overruled: 0, failed: 0 };
          return { pattern, ...c, places: placesByPattern.get(pattern)?.size ?? 0, outcomes: { ...oc, open: c.runs - oc.held - oc.overruled - oc.failed } };
        })
        .sort((a, b) => b.runs - a.runs || a.pattern.localeCompare(b.pattern));
    },
    familyCounts: () => {
      const byFamily = new Map<string, { categories: number; pass: number; fail: number; unsure: number; runs: Set<string> }>();
      for (const c of state.categories) {
        if (!c.family) continue;
        const cur = byFamily.get(c.family) ?? { categories: 0, pass: 0, fail: 0, unsure: 0, runs: new Set<string>() };
        cur.categories += 1;
        cur.runs.add(c.runId);
        if (c.gate === 'pass') cur.pass += 1;
        else if (c.gate === 'fail') cur.fail += 1;
        else if (c.gate === 'unsure') cur.unsure += 1;
        byFamily.set(c.family, cur);
      }
      return [...byFamily.entries()]
        .map(([family, v]) => ({ family, categories: v.categories, runs: v.runs.size, pass: v.pass, fail: v.fail, unsure: v.unsure }))
        .sort((a, b) => b.categories - a.categories || a.family.localeCompare(b.family));
    },
    recentReplays: (limit) =>
      state.allRuns
        .filter((r) => r.verb === 'replay')
        .slice(-limit)
        .reverse()
        .map((r) => ({ id: r.id, offset: r.offset })),
    recentOutcomes: (limit) =>
      [...state.outcomes.entries()]
        .slice(-limit)
        .reverse()
        .map(([runId, r]) => ({ runId, outcome: r.outcome, ts: r.ts, by: r.by })),
    budgetRollup: (sinceIso) => {
      let spentUsd = 0;
      let runs = 0;
      for (const s of state.spend.values()) {
        if (s.ts < sinceIso) continue;
        spentUsd += s.cost;
        runs += 1;
      }
      return { spentUsd, runs };
    },
    latestConfigOffset: () => state.configOffset,
  };
}

/** A full linear scan, in memory, never written to disk. The oracle for the SQLite path, and Node 20's only path. */
/**
 * A one-slot, in-process-only cache of the last full scan: this fallback has no persisted store of its own (a
 * project with no real SQLite already loses the point of a disposable disk index — Node 20's whole story is "one
 * correct, in-memory rescan"), so without this, every single withIndex call — checkLedger, lookupAnswers,
 * nextRunNumber, all three per paid verb — would each rescan the whole log from scratch. Keyed on the log's own
 * size + mtime, which any real append always changes; never persisted, never shared across processes, so it can
 * only ever be *too eager to rescan*, never stale in a way that returns a wrong answer (worst case: a same-size,
 * same-millisecond-mtime content swap inside one process goes undetected — not a real-ledger scenario, since a
 * ledger only ever grows by appending).
 */
let memoryCache: { logPath: string; size: number; mtimeMs: number; state: MemoryState } | undefined;

function buildMemoryHandle(paths: Mm3Paths): IndexHandle {
  const log = openLog(paths.log);
  try {
    const size = log?.st.size ?? 0;
    const mtimeMs = log ? Math.round(log.st.mtimeMs) : 0;
    if (memoryCache && memoryCache.logPath === paths.log && memoryCache.size === size && memoryCache.mtimeMs === mtimeMs) {
      return handleFromMemory(memoryCache.state);
    }
    const state = emptyMemoryState();
    if (log && size > 0) {
      const result = scanRange(log.fd, 0, size, memorySink(state), shownLog(paths), 0, 0);
      state.upto = result.upto;
      state.lineCount = result.lineCount;
    }
    memoryCache = { logPath: paths.log, size, mtimeMs, state };
    return handleFromMemory(state);
  } finally {
    if (log) closeSync(log.fd);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// SQLite engine.
// ---------------------------------------------------------------------------------------------------------------

// Bumped to 6 (from 5) here: a new `spend` table carries one row per costed record (every RunRecord/
// ContractRun AND, newly, every FailedRecord too — failed calls previously had no index row at all; see
// Sink.failed's own comment) so the budget can compute spentUsd/runs since a given timestamp with
// one indexed query instead of a full-ledger scan. Caps (usd/runs/per/since) now live in `.mm3/
// config.yaml`, not a separate running counter — see src/budget/budget.ts.
// Bumped to 5 (from 4) here: a new `categories` table carries each contract run's own category shapes
// (name, section, family, its own gate) — the "family per category as queryable" — populated the same
// way `places`/`answer_keys` are, from the same one-subject `ask.categories` or sweep `ask.layers[].categories`
// (never both). The new mdl fields (problem/nodes/touches/blast) need no schema change at all: `mdlJson`
// already serializes the whole `mdl` object into `runs.mdl` verbatim, so they're already queryable via
// json_extract on that column, same as why/area/stage were before them.
// Bumped to 4 (from 3) here: runs gained a `pattern` column (+ its own index, and one on `verb`) for
// `mm3 report patterns`/`history` (patternCounts/recentReplays) — see patternFingerprint's own comment.
// Bumped to 3 (from 2) here: runs gained a `parent` column (+ its own index) so view's "down" lineage walk
// (WHERE parent = ?) no longer needs a full-ledger scan. Bumped to 2 (from 1): outcomes gained a `uid` column
// (appendOutcome's own no-op "repeat" check now reads the index instead of a full readLedger — it
// needs the original outcome record's uid back). A stale on-disk index built under an older version self-heals
// via the existing schema-version-mismatch rebuild trigger — no migration needed, just a rebuild, which is
// exactly what self-healing is for.
const SCHEMA_VERSION = 8; // 8: the newest config receipt's offset is kept in meta (7: `runs.wise` became `runs.mdl`); an older index is stale and rebuilds

const SCHEMA_SQL = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  offset INTEGER NOT NULL,
  adapter TEXT NOT NULL,
  model TEXT NOT NULL,
  verb TEXT NOT NULL,
  ts TEXT NOT NULL,
  gate TEXT,
  blocked INTEGER NOT NULL DEFAULT 0,
  mdl TEXT,
  parent TEXT,
  pattern TEXT
);
CREATE INDEX idx_runs_adapter_model ON runs(adapter, model, blocked);
CREATE INDEX idx_runs_parent ON runs(parent);
CREATE INDEX idx_runs_verb ON runs(verb);
CREATE INDEX idx_runs_pattern ON runs(pattern);
CREATE TABLE answer_keys (
  adapter TEXT NOT NULL,
  model TEXT NOT NULL,
  key TEXT NOT NULL,
  run_id TEXT NOT NULL,
  qid TEXT NOT NULL,
  PRIMARY KEY (adapter, model, key)
);
CREATE TABLE outcomes (
  run_id TEXT PRIMARY KEY,
  outcome TEXT NOT NULL,
  uid TEXT NOT NULL,
  ts TEXT NOT NULL,
  by TEXT NOT NULL
);
CREATE TABLE places (
  kind TEXT NOT NULL,
  val TEXT NOT NULL,
  run_id TEXT NOT NULL,
  PRIMARY KEY (kind, val, run_id)
);
CREATE INDEX idx_places_val ON places(kind, val);
CREATE TABLE categories (
  run_id TEXT NOT NULL,
  name TEXT NOT NULL,
  section TEXT NOT NULL,
  family TEXT,
  gate TEXT,
  PRIMARY KEY (run_id, name)
);
CREATE INDEX idx_categories_family ON categories(family);
CREATE TABLE spend (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  cost REAL NOT NULL
);
CREATE INDEX idx_spend_ts ON spend(ts);
`;

/** Every category a contract run's own ask carries: one-subject (`ask.categories`) or a sweep's own layers
 *  (`ask.layers[].categories`), never both (validate.ts's checkCross builds it the same way) — feeds the
 *  `categories` table (family/section per category), populated identically by both engines below. */
function runCategories(rec: RunRecord | ContractRun): Category[] {
  if (!isContractRun(rec)) return [];
  return rec.ask.categories.length ? rec.ask.categories : rec.ask.layers.flatMap((l) => l.categories);
}

// Minimal surface used from node:sqlite (see node-sqlite.d.ts): kept as a structural type so the fallback path
// never has to import the module eagerly, and a test can hand in a fake for fault injection.
interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
type DatabaseSyncCtor = new (location: string) => SqliteDb;

/** Test-only fault injection: `forceFallback` forces every withIndex call to take the fallback path, to prove it
 *  gives the same answers as SQLite without needing a corrupt Node build. `throwOnCandidates`, when true, makes
 *  the NEXT `candidates()` call on a real SQL handle throw once (then clears itself) — simulating a query that
 *  fails partway through an otherwise-successful `fn`, so a caller like lookupAnswers can be proven to fall back
 *  to the linear scan with identical results and no state leaked from the aborted attempt. `forceSqliteMissing`
 *  makes `getSqliteCtor()` itself return null, as if node:sqlite genuinely doesn't exist — simulating a real
 *  Node < 22.13 without needing one, to prove `runSqlite` throws a LedgerError instead of silently falling back
 *  [C-107] (`forceFallback` alone still exercises the silent-on-purpose test path, unchanged). Never set outside
 *  a test. */
export const __testOnly = { forceFallback: false, throwOnCandidates: false, forceSqliteMissing: false };

/** True for the one warning node:sqlite prints (once per process) on Node 22/24: an ExperimentalWarning naming
 *  SQLite. Every other warning (including a differently-worded ExperimentalWarning) is left alone — matched by
 *  name AND message, not silenced wholesale. Exported so it's independently testable (a pure function, no
 *  process.on side effect). */
export function isSqliteExperimentalWarning(w: { name?: string; message?: string }): boolean {
  return w.name === 'ExperimentalWarning' && /sqlite/iu.test(w.message ?? '');
}

let warningFilterInstalled = false;

/** An emitWarning wrapper, not a process.on('warning', ...) listener: Node still prints the ORIGINAL default
 *  text for a warning even when a 'warning' listener is attached (verified directly, in the Node 22 container —
 *  that event does not suppress the default console output for this one, unlike what the Node docs imply for a
 *  plain process.emitWarning() call; node:sqlite's own experimental-feature warning apparently doesn't honor
 *  it). Wrapping emitWarning itself intercepts BEFORE Node's own default handling ever runs, so the swallowed
 *  case prints nothing and everything else still goes through the original emitWarning unchanged. Installed
 *  lazily, from getSqliteCtor() below, right before node:sqlite is ever touched for real — never as a side
 *  effect of merely importing this module (this file is reachable from the library's own public export,
 *  src/index.ts, not just the CLI entry; a library consumer who never asks the ledger for anything must never
 *  have process.emitWarning silently rewritten underneath it). Verified directly (Node 22 container): the
 *  warning fires at `new DatabaseSync(...)` construction time, not at module resolution, so installing it here
 *  — before getSqliteCtor() ever returns a constructor a caller can construct — is still early enough. */
function installSqliteWarningFilter(): void {
  if (warningFilterInstalled) return;
  warningFilterInstalled = true;
  const originalEmitWarning = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const message = typeof warning === 'string' ? warning : warning.message;
    const type = typeof rest[0] === 'string' ? rest[0] : ((rest[0] as { type?: string } | undefined)?.type ?? '');
    if (isSqliteExperimentalWarning({ name: type, message })) return;
    return (originalEmitWarning as (...args: unknown[]) => void)(warning, ...rest);
  }) as typeof process.emitWarning;
}

/**
 * node:sqlite's DatabaseSync, resolved lazily and SYNCHRONOUSLY on first real use — never at module import time,
 * and never async. `process.getBuiltinModule` (present since Node 22.3; simply absent as a function on earlier
 * Nodes, including this repo's Node 20 host — verified directly, it's `undefined` there, not a throw) resolves a
 * built-in module by id without `import()`'s promise: on Node < 22.13 it either doesn't exist as a function, or
 * returns undefined for an id it doesn't recognize yet, so `sqliteCtor` ends up `null` either way, exactly like
 * today's fallback. This replaces a top-level `await import('node:sqlite')`: every ledger call in this codebase
 * (nextRunNumber, findRun, checkLedger, lookupAnswers, exactReuse, appendOutcome, …) is synchronous, so a
 * per-call dynamic import would have cascaded `await` through pay.ts and every verb — but a top-level await had
 * its own cost this fix round removes: it ran (and, with it, installed the warning filter and touched
 * process.emitWarning) the instant this module was FIRST IMPORTED, by anything — including a library consumer
 * who only wants `redact` or `formatRunId` and will never touch the ledger. Resolved once and cached (`null`
 * means "resolved to unavailable," `undefined` means "not yet asked").
 */
let sqliteCtor: DatabaseSyncCtor | null | undefined;

export function getSqliteCtor(): DatabaseSyncCtor | null {
  if (__testOnly.forceSqliteMissing) return null; // test-only: simulate a genuine Node < 22.13, no cache poisoned
  if (sqliteCtor !== undefined) return sqliteCtor;
  const getBuiltin = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  if (typeof getBuiltin !== 'function') {
    sqliteCtor = null;
    return null;
  }
  installSqliteWarningFilter(); // before node:sqlite is touched at all, even just to read DatabaseSync off it
  try {
    const mod = getBuiltin('node:sqlite') as { DatabaseSync?: unknown } | undefined;
    sqliteCtor = typeof mod?.DatabaseSync === 'function' ? (mod.DatabaseSync as unknown as DatabaseSyncCtor) : null;
  } catch {
    sqliteCtor = null;
  }
  return sqliteCtor;
}

/** True when node:sqlite is available in this runtime (Node ≥ 22.13); false when every ledger read/write here
 *  uses the always-correct linear fallback instead (`mm3 doctor`, P5, reports this). */
export function sqliteAvailable(): boolean {
  return getSqliteCtor() !== null;
}

function getMeta(db: SqliteDb, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? String(row.value) : undefined;
}

function setMeta(db: SqliteDb, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
}

interface SqlStatements {
  insertRun: SqliteStatement;
  insertKey: SqliteStatement;
  insertOutcome: SqliteStatement;
  insertPlace: SqliteStatement;
  insertCategory: SqliteStatement;
  updateBlocked: SqliteStatement;
  insertSpend: SqliteStatement;
  setLastConfig: SqliteStatement;
}

function prepStatements(db: SqliteDb): SqlStatements {
  return {
    insertRun: db.prepare('INSERT OR REPLACE INTO runs (id, offset, adapter, model, verb, ts, gate, blocked, mdl, parent, pattern) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)'),
    insertKey: db.prepare('INSERT OR REPLACE INTO answer_keys (adapter, model, key, run_id, qid) VALUES (?, ?, ?, ?, ?)'),
    insertOutcome: db.prepare('INSERT OR REPLACE INTO outcomes (run_id, outcome, uid, ts, by) VALUES (?, ?, ?, ?, ?)'),
    insertPlace: db.prepare('INSERT OR IGNORE INTO places (kind, val, run_id) VALUES (?, ?, ?)'),
    insertCategory: db.prepare('INSERT OR REPLACE INTO categories (run_id, name, section, family, gate) VALUES (?, ?, ?, ?, ?)'),
    updateBlocked: db.prepare('UPDATE runs SET blocked = ? WHERE id = ?'),
    insertSpend: db.prepare('INSERT OR REPLACE INTO spend (id, ts, cost) VALUES (?, ?, ?)'),
    setLastConfig: db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_config_offset', ?)"),
  };
}

/** Only the small searchable subtree the schema asks for: mdl + the run's category names — never answers,
 *  response or items. json_extract($.mdl.area) etc. can group/filter on this without a full-ledger scan. */
function mdlJson(rec: RunRecord | ContractRun): string | null {
  if (!isContractRun(rec)) return null;
  const categories = Object.keys(rec.categories ?? {});
  if (rec.mdl === null && categories.length === 0) return null;
  return JSON.stringify({ mdl: rec.mdl, categories });
}

function sqlSink(stmts: SqlStatements): Sink {
  return {
    run(rec, offset) {
      const gate = 'gate' in rec ? (rec.gate ?? null) : null;
      stmts.insertRun.run(rec.id, offset, rec.adapter, rec.model, rec.verb, rec.ts, gate, mdlJson(rec), rec.parent ?? null, patternFingerprint(rec));
      if (countsTowardBudget(rec)) stmts.insertSpend.run(rec.id, rec.ts, rec.costUsd ?? 0);
      if (isContractRun(rec)) {
        for (const [qid, key] of Object.entries(rec.keys)) stmts.insertKey.run(rec.adapter, rec.model, key, rec.reusedFrom[qid] ?? rec.id, qid);
        for (const w of rec.where) stmts.insertPlace.run('where', stripLines(w), rec.id);
        for (const p of sweepPlaces(rec)) stmts.insertPlace.run(p.kind, p.val, rec.id);
        for (const c of runCategories(rec)) stmts.insertCategory.run(rec.id, c.name, c.section, c.family ?? null, rec.categories[c.name] ?? null);
      } else {
        for (const w of rec.where) stmts.insertPlace.run('where', w.path, rec.id);
        for (const t of rec.tags) stmts.insertPlace.run('tag', t, rec.id);
      }
    },
    outcome(rec) {
      stmts.insertOutcome.run(rec.of, rec.outcome, rec.uid, rec.ts, rec.by);
      stmts.updateBlocked.run(rec.outcome === 'held' ? 0 : 1, rec.of);
    },
    failed(rec) {
      stmts.insertSpend.run(rec.id, rec.ts, rec.costUsd ?? 0);
    },
    config(offset) {
      stmts.setLastConfig.run(String(offset));
    },
  };
}

function readMetaState(db: SqliteDb): { upto: number; lineCount: number; runCount: number } {
  return { upto: Number(getMeta(db, 'upto') ?? '0'), lineCount: Number(getMeta(db, 'line_count') ?? '0'), runCount: Number(getMeta(db, 'run_count') ?? '0') };
}

/** The fingerprint is always a fresh targeted read of the file at [from, to) (never the in-memory `lastLineRaw`
 *  scanRange also returns) — that range INCLUDES the line's trailing \n (upto is "one past the newline"), while
 *  `lastLineRaw` deliberately excludes it (readLedger/JSON.parse never want the newline). Hashing the in-memory
 *  string directly would hash a different byte range than tryOpenAndCheck's later verify-time hashLogRange call
 *  reads, so the two would never agree — a real bug caught here: every open looked "mismatched" and rebuilt from
 *  scratch, every single time. Going through hashLogRange on both sides guarantees they hash identical bytes. */
function fingerprintNow(logPath: string, from: number, to: number): string {
  return hashLogRange(logPath, from, to);
}

/** Rebuild only: `result` always starts from byte 0, so it's authoritative even when the log is empty or has no
 *  complete line yet — an empty fingerprint (sha256 of '') is a well-defined "nothing indexed" state, not a gap.
 *  run_count is stored separately from `SELECT COUNT(*) FROM runs` on purpose — see applyLine's comment: a
 *  rebuild's `result.runsSeen` is already the whole-log total (startLineCount was 0), so it's stored as-is. */
function writeMetaStateFull(db: SqliteDb, logPath: string, result: ScanResult): void {
  setMeta(db, 'upto', String(result.upto));
  setMeta(db, 'line_count', String(result.lineCount));
  setMeta(db, 'run_count', String(result.runsSeen));
  setMeta(db, 'fp_start', String(result.lastLineStart));
  setMeta(db, 'fingerprint', fingerprintNow(logPath, result.lastLineStart, result.upto));
}

/** Catch-up only: `result` may have found zero new COMPLETE lines (only a partial in-progress tail was added
 *  since last time) — in that case upto/lineCount/fp_start/fingerprint all still describe the last REAL line
 *  correctly and must be left untouched, not overwritten with scanRange's "nothing new yet" starting values.
 *  `result.runsSeen` is only this call's delta (scanRange starts counting from 0 every call), so it's ADDED to
 *  the previously stored run_count, not written over it. */
function writeMetaStateCatchUp(db: SqliteDb, logPath: string, before: { upto: number; lineCount: number; runCount: number }, result: ScanResult): void {
  if (result.upto === before.upto) return; // no complete new line: nothing to persist
  setMeta(db, 'upto', String(result.upto));
  setMeta(db, 'line_count', String(result.lineCount));
  setMeta(db, 'run_count', String(before.runCount + result.runsSeen));
  setMeta(db, 'fp_start', String(result.lastLineStart));
  setMeta(db, 'fingerprint', fingerprintNow(logPath, result.lastLineStart, result.upto));
}

/** The place queries, as text: module-level so test/unit/ledger-place-plan.test.ts can EXPLAIN QUERY PLAN the exact
 *  statements the handle runs and fail the day one of them goes back to scanning every `places` row.
 *
 *  - candidates: three indexed branches, not one OR/LIKE: the OR form made SQLite scan every kind='where' row
 *    (MULTI-INDEX OR with a kind-only first leg). The prefix leg is a plain range ("a/" <= val < "a0": '0' is the
 *    byte after '/'), which is exactly "starts with place/" and, unlike LIKE, case-sensitive, matching the linear
 *    engine's startsWith. UNION de-duplicates a run that matches by more than one leg. Params: place, place/,
 *    place0, place.
 *  - newest: report hits, each distinct where place's newest candidate run (the same three legs, the last two
 *    seeded from the distinct places), plus that run's category gates and the key count its mdl column carries.
 *    "Newest" is the largest places.rowid: rows are inserted as the log is applied, in append order, never deleted
 *    (rebuild and catch-up both walk the log forward), so rowid order IS offset order, and picking the winner needs
 *    no join with `runs` per row (a random read of the wide runs table for every place row: 0.2 s at 100k). `runs`
 *    is joined once per place, for the winner only. Each leg reads covering index entries only.
 *  - breakdown / spanNewest: view <place>, the candidate set counted by adapter and latest outcome, and its
 *    newest few, without listing every candidate. Same params as candidates plus the limit for spanNewest. */
export const PLACE_SQL = {
  candidates:
    `SELECT r.id AS id, r.offset AS offset FROM places p JOIN runs r ON r.id = p.run_id WHERE p.kind = 'where' AND p.val = ? ` +
    `UNION SELECT r.id, r.offset FROM places p JOIN runs r ON r.id = p.run_id WHERE p.kind = 'where' AND p.val >= ? AND p.val < ? ` +
    `UNION SELECT r.id, r.offset FROM places p JOIN runs r ON r.id = p.run_id WHERE p.kind = 'tag' AND p.val = ? ORDER BY offset ASC`,
  newest:
    `WITH dp AS (SELECT DISTINCT val FROM places WHERE kind = 'where'), ` +
    `hit(place, rid) AS (` +
    `SELECT val, MAX(rowid) FROM places WHERE kind = 'where' GROUP BY val ` +
    `UNION ALL SELECT dp.val, (SELECT MAX(p.rowid) FROM places p WHERE p.kind = 'where' AND p.val >= dp.val || '/' AND p.val < dp.val || '0') FROM dp ` +
    `UNION ALL SELECT dp.val, (SELECT MAX(p.rowid) FROM places p WHERE p.kind = 'tag' AND p.val = dp.val) FROM dp), ` +
    `newest(place, rid) AS (SELECT place, MAX(rid) FROM hit GROUP BY place) ` +
    `SELECT n.place AS place, r.id AS id, r.offset AS offset, json_array_length(json_extract(r.mdl, '$.categories')) AS keyCount, c.name AS cname, c.gate AS cgate ` +
    `FROM newest n JOIN places p ON p.rowid = n.rid JOIN runs r ON r.id = p.run_id LEFT JOIN categories c ON c.run_id = r.id AND c.gate IS NOT NULL`,
  breakdown:
    `WITH hit(run_id) AS (SELECT run_id FROM places WHERE kind = 'where' AND val = ? UNION SELECT run_id FROM places WHERE kind = 'where' AND val >= ? AND val < ? UNION SELECT run_id FROM places WHERE kind = 'tag' AND val = ?) ` +
    `SELECT r.adapter AS adapter, o.outcome AS outcome, COUNT(*) AS n FROM hit h JOIN runs r ON r.id = h.run_id LEFT JOIN outcomes o ON o.run_id = r.id GROUP BY r.adapter, o.outcome`,
  spanNewest:
    `WITH hit(run_id) AS (SELECT run_id FROM places WHERE kind = 'where' AND val = ? UNION SELECT run_id FROM places WHERE kind = 'where' AND val >= ? AND val < ? UNION SELECT run_id FROM places WHERE kind = 'tag' AND val = ?) ` +
    `SELECT r.id AS id, r.offset AS offset FROM hit h JOIN runs r ON r.id = h.run_id ORDER BY r.offset DESC LIMIT ?`,
};

function handleFromSql(db: SqliteDb): IndexHandle {
  const stFindOffset = db.prepare('SELECT offset FROM runs WHERE id = ?');
  const stIsBlocked = db.prepare('SELECT blocked FROM runs WHERE id = ?');
  const stReuseHit = db.prepare(
    'SELECT ak.run_id AS runId, ak.qid AS qid, r.offset AS offset, r.blocked AS blocked FROM answer_keys ak JOIN runs r ON r.id = ak.run_id WHERE ak.adapter = ? AND ak.model = ? AND ak.key = ?',
  );
  const stCandidates = db.prepare('SELECT id, offset FROM runs WHERE adapter = ? AND model = ? AND blocked = 0 ORDER BY rowid DESC');
  const stPlaces = db.prepare(PLACE_SQL.candidates);
  const stNewestPlaces = db.prepare(PLACE_SQL.newest);
  const stPlaceBreakdown = db.prepare(PLACE_SQL.breakdown);
  const stPlaceNewest = db.prepare(PLACE_SQL.spanNewest);
  const stAllBreakdown = db.prepare(
    'SELECT r.adapter AS adapter, o.outcome AS outcome, COUNT(*) AS n FROM runs r LEFT JOIN outcomes o ON o.run_id = r.id GROUP BY r.adapter, o.outcome',
  );
  const stAllNewest = db.prepare('SELECT id, offset FROM runs ORDER BY offset DESC LIMIT ?');
  const stEverHeld = db.prepare('SELECT 1 FROM answer_keys WHERE adapter = ? AND model = ? AND key = ?');
  const stLatestOutcome = db.prepare('SELECT outcome, uid, ts, by FROM outcomes WHERE run_id = ?');
  const stChildren = db.prepare('SELECT id, offset FROM runs WHERE parent = ? ORDER BY offset ASC');
  const stDistinctPlaces = db.prepare('SELECT DISTINCT kind, val FROM places');
  const stPatternBase = db.prepare(
    `SELECT pattern, COUNT(*) AS runs, SUM(CASE WHEN gate = 'pass' THEN 1 ELSE 0 END) AS pass, ` +
      `SUM(CASE WHEN gate = 'fail' THEN 1 ELSE 0 END) AS fail, SUM(CASE WHEN gate = 'unsure' THEN 1 ELSE 0 END) AS unsure ` +
      `FROM runs WHERE pattern IS NOT NULL GROUP BY pattern`,
  );
  const stPatternPlaces = db.prepare(
    `SELECT r.pattern AS pattern, COUNT(DISTINCT p.kind || ':' || p.val) AS places FROM runs r JOIN places p ON p.run_id = r.id ` +
      `WHERE r.pattern IS NOT NULL GROUP BY r.pattern`,
  );
  const stPatternOutcomes = db.prepare(
    `SELECT r.pattern AS pattern, o.outcome AS outcome, COUNT(*) AS n FROM runs r JOIN outcomes o ON o.run_id = r.id ` +
      `WHERE r.pattern IS NOT NULL GROUP BY r.pattern, o.outcome`,
  );
  const stFamilyCounts = db.prepare(
    `SELECT family, COUNT(*) AS categories, COUNT(DISTINCT run_id) AS runs, ` +
      `SUM(CASE WHEN gate = 'pass' THEN 1 ELSE 0 END) AS pass, SUM(CASE WHEN gate = 'fail' THEN 1 ELSE 0 END) AS fail, ` +
      `SUM(CASE WHEN gate = 'unsure' THEN 1 ELSE 0 END) AS unsure ` +
      `FROM categories WHERE family IS NOT NULL GROUP BY family`,
  );
  const stRecentReplays = db.prepare('SELECT id, offset FROM runs WHERE verb = ? ORDER BY rowid DESC LIMIT ?');
  const stRecentOutcomes = db.prepare('SELECT run_id AS runId, outcome, ts, by FROM outcomes ORDER BY rowid DESC LIMIT ?');
  const stBudgetRollup = db.prepare('SELECT COALESCE(SUM(cost), 0) AS spentUsd, COUNT(*) AS runs FROM spend WHERE ts >= ?');

  return {
    findOffset: (id) => {
      const row = stFindOffset.get(id);
      return row ? Number(row.offset) : undefined;
    },
    // A line count (run_count in meta), not SELECT COUNT(*) FROM runs — see applyLine's comment: `runs.id` is a
    // PK (INSERT OR REPLACE), which a real ledger's id-assignment invariant never collides, but nextRunNumber
    // must still count LINES the way readLedger's own linear scan always has, matching the fallback exactly.
    runCount: () => Number(getMeta(db, 'run_count') ?? '0'),
    upto: () => Number(getMeta(db, 'upto') ?? '0'),
    lineCount: () => Number(getMeta(db, 'line_count') ?? '0'),
    isBlocked: (id) => {
      const row = stIsBlocked.get(id);
      return !!row && Number(row.blocked) !== 0;
    },
    reuseKeyHit: (adapter, model, key) => {
      const row = stReuseHit.get(adapter, model, key);
      return row ? { runId: String(row.runId), qid: String(row.qid), offset: Number(row.offset), blocked: Number(row.blocked) !== 0 } : undefined;
    },
    candidates: (adapter, model) => {
      // Test-only fault injection (__testOnly.throwOnCandidates): consumed once, so a retried attempt (the
      // fallback runSqlite falls back to after catching this) never trips it a second time.
      if (__testOnly.throwOnCandidates) {
        __testOnly.throwOnCandidates = false;
        throw new Error('injected SQLite fault (test only)');
      }
      return stCandidates.all(adapter, model).map((r) => ({ id: String(r.id), offset: Number(r.offset) }));
    },
    placeCandidates: (place) => stPlaces.all(place, `${place}/`, `${place}0`, place).map((r) => ({ id: String(r.id), offset: Number(r.offset) })),
    newestPerWherePlace: () => {
      const byPlace = new Map<string, NewestPlaceRun & { keyCount: number; rows: { name: string; gate: string }[] }>();
      for (const r of stNewestPlaces.all()) {
        const place = String(r.place);
        let cur = byPlace.get(place);
        if (!cur) {
          cur = { place, id: String(r.id), offset: Number(r.offset), keyCount: r.keyCount === null ? -1 : Number(r.keyCount), rows: [] };
          byPlace.set(place, cur);
        }
        if (r.cname !== null) cur.rows.push({ name: String(r.cname), gate: String(r.cgate) });
      }
      // The index vouches for a run's gates only when it holds as many gated category rows as the run's own
      // `categories` map has keys (and at least one): anything else (a sweep, whose map is {}, a Plan 1 run, a
      // run whose map differs from its ask) is left for the caller to read.
      return [...byPlace.values()].map(({ keyCount, rows, ...n }) => (rows.length > 0 && rows.length === keyCount ? { ...n, categories: rows } : n));
    },
    placeRunStats: (place, limit) => {
      const rows = place === null ? stAllBreakdown.all() : stPlaceBreakdown.all(place, `${place}/`, `${place}0`, place);
      const breakdown = rows.map((r) => ({ adapter: String(r.adapter), outcome: r.outcome === null ? null : (String(r.outcome) as OutcomeRecord['outcome']), n: Number(r.n) }));
      const newest = (place === null ? stAllNewest.all(limit) : stPlaceNewest.all(place, `${place}/`, `${place}0`, place, limit)).map((r) => ({ id: String(r.id), offset: Number(r.offset) }));
      return { total: breakdown.reduce((sum, b) => sum + b.n, 0), breakdown, newest };
    },
    childrenOf: (parentId) => stChildren.all(parentId).map((r) => ({ id: String(r.id), offset: Number(r.offset) })),
    outcomesFor: (ids) => {
      const out = new Map<string, OutcomeRecord['outcome']>();
      if (!ids.length) return out;
      const stmt = db.prepare(`SELECT run_id AS runId, outcome FROM outcomes WHERE run_id IN (${ids.map(() => '?').join(',')})`);
      for (const row of stmt.all(...ids)) out.set(String(row.runId), row.outcome as OutcomeRecord['outcome']);
      return out;
    },
    everHeld: (adapter, model, key) => !!stEverHeld.get(adapter, model, key),
    latestOutcomeOf: (id) => {
      const row = stLatestOutcome.get(id);
      return row ? { outcome: row.outcome as OutcomeRecord['outcome'], uid: String(row.uid), ts: String(row.ts), by: String(row.by) } : undefined;
    },
    distinctPlaces: () => stDistinctPlaces.all().map((r) => ({ kind: r.kind as 'where' | 'tag', val: String(r.val) })),
    patternCounts: () => {
      const placesByPattern = new Map(stPatternPlaces.all().map((r) => [String(r.pattern), Number(r.places)]));
      const outcomesByPattern = new Map<string, { held: number; overruled: number; failed: number }>();
      for (const r of stPatternOutcomes.all()) {
        const pattern = String(r.pattern);
        const cur = outcomesByPattern.get(pattern) ?? { held: 0, overruled: 0, failed: 0 };
        const outcome = r.outcome as OutcomeRecord['outcome'];
        cur[outcome] += Number(r.n);
        outcomesByPattern.set(pattern, cur);
      }
      return stPatternBase
        .all()
        .map((b) => {
          const pattern = String(b.pattern);
          const runs = Number(b.runs);
          const oc = outcomesByPattern.get(pattern) ?? { held: 0, overruled: 0, failed: 0 };
          return {
            pattern,
            runs,
            pass: Number(b.pass),
            fail: Number(b.fail),
            unsure: Number(b.unsure),
            places: placesByPattern.get(pattern) ?? 0,
            outcomes: { ...oc, open: runs - oc.held - oc.overruled - oc.failed },
          };
        })
        .sort((a, b) => b.runs - a.runs || a.pattern.localeCompare(b.pattern));
    },
    familyCounts: () =>
      stFamilyCounts
        .all()
        .map((r) => ({ family: String(r.family), categories: Number(r.categories), runs: Number(r.runs), pass: Number(r.pass), fail: Number(r.fail), unsure: Number(r.unsure) }))
        .sort((a, b) => b.categories - a.categories || a.family.localeCompare(b.family)),
    recentReplays: (limit) => stRecentReplays.all('replay', limit).map((r) => ({ id: String(r.id), offset: Number(r.offset) })),
    recentOutcomes: (limit) =>
      stRecentOutcomes.all(limit).map((r) => ({ runId: String(r.runId), outcome: r.outcome as OutcomeRecord['outcome'], ts: String(r.ts), by: String(r.by) })),
    budgetRollup: (sinceIso) => {
      const row = stBudgetRollup.get(sinceIso) as { spentUsd: number; runs: number };
      return { spentUsd: Number(row.spentUsd), runs: Number(row.runs) };
    },
    latestConfigOffset: () => {
      const v = getMeta(db, 'last_config_offset');
      return v === undefined ? undefined : Number(v);
    },
  };
}

/** Runs `fn` under paths.lock, unless this process already holds it (the lock file's body is our own pid) — a
 *  reentrant caller (checkLedger already holds it; nextRunNumber/findRun run inside appendRunLocked's caller's
 *  lock) would otherwise deadlock against itself waiting for a lock it is already holding. */
function withLockIfNeeded<T>(lockPath: string, fn: () => T): T {
  let heldByUs = false;
  try {
    heldByUs = Number.parseInt(readFileSync(lockPath, 'utf8').trim(), 10) === process.pid;
  } catch {
    /* no lock file, or unreadable: not held by us */
  }
  return heldByUs ? fn() : withLock(lockPath, fn);
}

function tmpDbPath(dbPath: string): string {
  return `${dbPath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
}

function rmDbFiles(dbPath: string): void {
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(f)) rmSync(f, { force: true });
  }
}

/** Only the -wal/-shm siblings, never the main file — used right before a rename replaces the main file, so a
 *  stale WAL/SHM left over from the file being REPLACED (normal operation always checkpoints and removes these
 *  on close, verified directly, but this guards an abnormal prior state) can never be misread against the new
 *  main file's content after the rename. */
function rmSiblingWalShm(dbPath: string): void {
  for (const f of [`${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(f)) rmSync(f, { force: true });
  }
}

/** Full rebuild: fresh tables, one transaction, streamed from byte 0. Written to a tmp file in the same dir,
 *  then renamed into place — a reader can never observe a half-built index.db. Must run under paths.lock. */
function rebuildToDisk(paths: Mm3Paths, Db: DatabaseSyncCtor): SqliteDb {
  ensureDir(paths);
  const tmp = tmpDbPath(paths.index);
  rmDbFiles(tmp);
  const db = new Db(tmp);
  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec(SCHEMA_SQL);
    const stmts = prepStatements(db);
    const log = openLog(paths.log);
    let result: ScanResult;
    try {
      db.exec('BEGIN');
      result = log && log.st.size > 0 ? scanRange(log.fd, 0, log.st.size, sqlSink(stmts), shownLog(paths), 0, 0) : { upto: 0, lineCount: 0, runsSeen: 0, lastLineStart: 0, lastLineRaw: '' };
    } finally {
      if (log) closeSync(log.fd);
    }
    setMeta(db, 'schema_version', String(SCHEMA_VERSION));
    writeMetaStateFull(db, paths.log, result);
    db.exec('COMMIT');
  } catch (e) {
    db.close();
    rmDbFiles(tmp);
    throw e;
  }
  db.close();
  // Atomic replace: renameSync (same filesystem, same directory) never leaves a window where paths.index doesn't
  // exist — a concurrent reader sees either the old file or the new one, never neither. Only a directory (the
  // "index.db is a directory" self-heal case) has to be cleared first — rename(2) refuses to replace one with a
  // plain file. rmSiblingWalShm still runs first: it clears any WAL/SHM belonging to the file being REPLACED,
  // which the rename itself wouldn't touch (they're separate files with their own names) and which would
  // otherwise apply, now stale, to the just-renamed-in content.
  if (existsSync(paths.index)) {
    try {
      if (statSync(paths.index).isDirectory()) rmSync(paths.index, { recursive: true, force: true });
    } catch {
      /* stat failed: leave it, renameSync surfaces its own error */
    }
  }
  rmSiblingWalShm(paths.index);
  renameSync(tmp, paths.index);
  return new Db(paths.index);
}

/** Catches an already-open db up to the log's current size (only the new bytes). Must run under paths.lock. */
function catchUpInPlace(db: SqliteDb, paths: Mm3Paths): void {
  const stmts = prepStatements(db);
  const before = readMetaState(db);
  const log = openLog(paths.log);
  if (!log) return; // no log: nothing new
  try {
    const size = log.st.size;
    if (size <= before.upto) return; // caught up already (another process got there first), or nothing new
    db.exec('BEGIN');
    try {
      const result = scanRange(log.fd, before.upto, size, sqlSink(stmts), shownLog(paths), before.upto, before.lineCount);
      writeMetaStateCatchUp(db, paths.log, before, result);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  } finally {
    closeSync(log.fd);
  }
}

type OpenCheck = { ok: true; db: SqliteDb; fresh: boolean } | { ok: false; db?: SqliteDb };

/** A near-free truncation check (two header-only pragma reads, no page-by-page scan): a healthy SQLite file's
 *  actual size is always page_count * page_size. A mismatch is the truncation/crash-mid-write signature
 *  `PRAGMA quick_check` also catches, at a fraction of quick_check's cost (which walks every b-tree page — on
 *  the profiling review that ran on every single open, ~99% of a point call's own time at 100k). Deciding
 *  whether quick_check is worth running AT ALL, rather than running it unconditionally, is the fix: consumers
 *  already re-verify what they read from the ledger (readRecordAt's own bounds/parse checks, findRun's own
 *  re-match against the id, view's own whereMatches re-check against the real record), so a bad PAGE deeper in
 *  the file that this cheap check can't see costs the next self-heal a rebuild, never a wrong answer — running
 *  the expensive scan on every open bought a guarantee the design doesn't actually need. */
function sizeLooksSane(db: SqliteDb, dbPath: string): boolean {
  try {
    const pageCount = Number((db.prepare('PRAGMA page_count').get() as { page_count?: unknown } | undefined)?.page_count ?? -1);
    const pageSize = Number((db.prepare('PRAGMA page_size').get() as { page_size?: unknown } | undefined)?.page_size ?? -1);
    if (!(pageCount >= 0) || !(pageSize > 0)) return false;
    return pageCount * pageSize === statSync(dbPath).size;
  } catch {
    return false;
  }
}

function quickCheckOk(db: SqliteDb): boolean {
  try {
    const quick = db.prepare('PRAGMA quick_check').get();
    return !!quick && quick.quick_check === 'ok';
  } catch {
    return false;
  }
}

/** Opens index.db and checks it against the live log, WITHOUT taking the lock (a pure read): missing, an open
 *  failure, a suspicious size (escalated to the expensive quick_check to confirm), a schema mismatch, a log
 *  shorter than `upto`, or a fingerprint mismatch all come back not-ok (needs a rebuild); a log that's merely
 *  grown comes back ok/not-fresh (needs a catch-up). */
function tryOpenAndCheck(paths: Mm3Paths, Db: DatabaseSyncCtor): OpenCheck {
  if (!existsSync(paths.index)) return { ok: false };
  let db: SqliteDb;
  try {
    db = new Db(paths.index);
  } catch {
    return { ok: false };
  }
  try {
    // quick_check runs only on suspicion (the cheap size check failing) — never unconditionally. See
    // sizeLooksSane's own comment for why the cheap check is enough on the common warm-open path.
    if (!sizeLooksSane(db, paths.index) && !quickCheckOk(db)) return { ok: false, db };
    if (getMeta(db, 'schema_version') !== String(SCHEMA_VERSION)) return { ok: false, db };
    const { upto } = readMetaState(db);
    const size = existsSync(paths.log) ? statSync(paths.log).size : 0;
    if (size < upto) return { ok: false, db };
    const fpStart = Number(getMeta(db, 'fp_start') ?? '0');
    const storedFp = getMeta(db, 'fingerprint') ?? '';
    if (hashLogRange(paths.log, fpStart, upto) !== storedFp) return { ok: false, db };
    return { ok: true, db, fresh: size === upto };
  } catch {
    return { ok: false, db };
  }
}

function safeClose(db: SqliteDb): void {
  try {
    db.close();
  } catch {
    /* already unusable */
  }
}

/** Runs inside paths.lock: re-checks freshness before doing any work, since another process may have already
 *  caught up or rebuilt the on-disk index while this call waited for the lock (a real race under load — N
 *  processes each finding the index missing/stale at once must not each rebuild it in turn). Only catches up or
 *  rebuilds if STILL needed after that re-check. */
function refreshUnderLock(paths: Mm3Paths, Db: DatabaseSyncCtor): SqliteDb {
  const check = tryOpenAndCheck(paths, Db);
  if (check.ok) {
    if (!check.fresh) catchUpInPlace(check.db, paths);
    return check.db;
  }
  if (check.db) safeClose(check.db);
  return rebuildToDisk(paths, Db);
}

/**
 * `opts.readOnly`: a caller that must never write index.db to disk (view, --dry-run's ledger lookups, findRun,
 * exactReuse: dry runs and free reads write nothing; also the writers'-lock liveness fix: a
 * 100k rebuild can hold paths.lock for many seconds, well past withLock's own 5 s timeout, so a casual read
 * must never be the thing that triggers one under that same lock and makes a REAL writer time out). A readOnly
 * caller that finds the on-disk index already fresh uses it (a plain open + a few small reads — verified
 * directly that this creates no -wal/-shm side files and leaves the main file's bytes untouched); anything less
 * than fresh, readOnly returns undefined here so runSqlite falls back to the in-memory linear scan instead —
 * never taking the lock, never calling catchUpInPlace/rebuildToDisk. A non-readOnly caller behaves as before:
 * self-heals on disk under the lock, re-checking freshness once inside it (refreshUnderLock) rather than
 * blindly repeating whatever the pre-lock check already found.
 */
function ensureFreshDb(paths: Mm3Paths, Db: DatabaseSyncCtor, opts: { forceRebuild: boolean; readOnly: boolean }): SqliteDb | undefined {
  if (!opts.forceRebuild) {
    const check = tryOpenAndCheck(paths, Db);
    if (check.ok && check.fresh) return check.db;
    if (check.ok) {
      if (opts.readOnly) {
        safeClose(check.db);
        return undefined;
      }
      safeClose(check.db);
      return withLockIfNeeded(paths.lock, () => refreshUnderLock(paths, Db));
    }
    if (check.db) safeClose(check.db);
  }
  if (opts.readOnly) return undefined;
  return withLockIfNeeded(paths.lock, () => refreshUnderLock(paths, Db));
}

// ---------------------------------------------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------------------------------------------

/**
 * Called by log.ts's appendLine, under the ledger lock, right after it appended a line: if an on-disk index.db
 * existed and passes the normal open check (schema, size, fingerprint of the last indexed line) but is merely
 * behind the log by pure growth, catch it up over just the new bytes, in place — exactly what the next writer
 * would do under the same lock, done one append earlier. Without this every read-only reader (view, report,
 * findRun, reuse) finds the index one line behind and — by design — never writes it, so it falls back to a full
 * in-memory scan of the whole log (7 to 10 s and ~150 MB extra at 100k runs) on every call after any append,
 * including the lookup line `view` itself appends. Never creates, rebuilds or heals anything (a missing, stale
 * or suspect index is left for the next writer's own self-heal), and never throws: the index is disposable and
 * the append it follows has already succeeded.
 */
export function catchUpAfterAppend(paths: Mm3Paths): void {
  if (__testOnly.forceFallback || !existsSync(paths.index)) return;
  let db: SqliteDb | undefined;
  try {
    const Db = getSqliteCtor();
    if (!Db) return;
    const check = tryOpenAndCheck(paths, Db);
    db = check.db;
    if (!check.ok || check.fresh) return;
    catchUpInPlace(check.db, paths);
  } catch {
    /* disposable index: the next writer's self-heal covers it */
  } finally {
    if (db) safeClose(db);
  }
}

/**
 * Opens (self-healing) the index, calls `fn` with an IndexHandle, closes it, and returns fn's result. A project
 * with no ledger yet (log.jsonl missing or empty) never touches disk: `fn` sees a handle over an empty in-memory
 * index — dry runs, view, and any command before the first write create nothing. Otherwise tries node:sqlite
 * first; if it can't be imported or a SQLite/open call in this whole attempt throws (open,
 * self-heal, catch-up/rebuild, or a query inside `fn`), falls back to a full linear scan, in memory, never
 * persisted — the next WRITE path (an actual append) is what rebuilds the on-disk index, not this read. A
 * genuine LedgerError (corrupt ledger CONTENT, discovered while scanning) is never swallowed into that fallback
 * — it means the ledger itself is bad, not that SQLite failed, and re-scanning it via the memory engine would
 * only rediscover the same corruption a second time; it propagates straight to the caller, same as readLedger.
 * `forceRebuild`: skip the freshness check and always rebuild — findRun's retry when a specific offset it
 * already has doesn't check out (the log changed between one call and the next, in a lock-free read).
 * `readOnly`: never persist a catch-up or rebuild to disk for this call — see ensureFreshDb's own comment.
 */
export function withIndex<T>(paths: Mm3Paths, fn: (h: IndexHandle) => T, opts: { forceRebuild?: boolean; readOnly?: boolean } = {}): T {
  const logStat = existsSync(paths.log) ? statSync(paths.log) : undefined;
  if (!logStat || logStat.size === 0) return fn(handleFromMemory(emptyMemoryState()));

  return runSqlite(paths, fn, { forceRebuild: opts.forceRebuild ?? false, readOnly: opts.readOnly ?? false });
}

/** The budget's own read: total spend/run count for every record (run, contract-run or failed)
 *  timestamped `sinceIso` or later — one indexed query on the SQLite path, a bounded in-memory filter on the
 *  fallback. Safe to call from inside an already-held `paths.lock` (e.g. `recordCall`): `withIndex`/`ensureFreshDb`
 *  use `withLockIfNeeded`, which detects a lock this same process already holds and skips re-acquiring it. */
export function budgetRollup(paths: Mm3Paths, sinceIso: string, opts: { readOnly?: boolean } = {}): { spentUsd: number; runs: number } {
  return withIndex(paths, (handle) => handle.budgetRollup(sinceIso), { readOnly: opts.readOnly ?? false });
}

// The exact, always-the-same message when node:sqlite is genuinely missing (real Node < 22.13, or the
// __testOnly.forceSqliteMissing test hook standing in for one) — never assembled from the live process.version,
// since the test hook forces this path on a perfectly good Node too; the fact reported is "sqlite is
// unavailable," which is true either way, not "your Node happens to be old" (cli.ts's own nodeVersionStop
// already covers that half for the real CLI/MCP paths, which stop long before ever reaching here). [C-107]
const NODE_TOO_OLD_LEDGER_MESSAGE = `✖ ledger: node:sqlite is unavailable → install Node ${MIN_NODE_LABEL} or newer (it powers the ledger index); https://nodejs.org`;

function runSqlite<T>(paths: Mm3Paths, fn: (h: IndexHandle) => T, opts: { forceRebuild: boolean; readOnly: boolean }): T {
  // __testOnly.forceFallback: the one intentional, silent fallback left — proving the two engines agree
  // (ledger-index.test.ts). Checked before the try below so it never risks tripping the new throw underneath.
  if (__testOnly.forceFallback) return fn(buildMemoryHandle(paths));
  try {
    const Db = getSqliteCtor();
    // Production never silently degrades here anymore: node:sqlite missing for real is only
    // possible on a real Node < 22.13 — cli.ts's version guard already stops every command but `doctor` before
    // reaching this far, so this throw is purely the backstop for a caller that reaches the ledger directly
    // (a library consumer, bypassing the CLI). A LedgerError propagates straight out (see the catch below),
    // never silently answered from an in-memory scan.
    if (!Db) throw new LedgerError(NODE_TOO_OLD_LEDGER_MESSAGE);
    const db = ensureFreshDb(paths, Db, opts);
    if (!db) return fn(buildMemoryHandle(paths)); // readOnly, and the on-disk index wasn't already fresh
    try {
      return fn(handleFromSql(db));
    } finally {
      safeClose(db);
    }
  } catch (e) {
    if (e instanceof LedgerError) throw e; // genuine ledger corruption: fail closed, never silently retried
    return fn(buildMemoryHandle(paths));
  }
}

/** The newest config receipt in the ledger, or undefined when no load has ever been recorded. One indexed read of
 *  where it sits, then one targeted read of that line: never a scan of the log. */
export function latestConfigRecord(paths: Mm3Paths, opts: { readOnly?: boolean } = {}): ConfigRecord | undefined {
  const offset = withIndex(paths, (h) => h.latestConfigOffset(), { readOnly: opts.readOnly ?? false });
  if (offset === undefined) return undefined;
  const rec = readRecordAt(paths.log, offset);
  return rec && rec.kind === 'config' ? rec : undefined;
}

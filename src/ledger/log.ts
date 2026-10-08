/**
 * The ledger: .mm3/log.jsonl, append-only, one record shape for every verb. Runs get MM3-#### in order
 * under the lock, plus a ULID. Outcomes are separate appended lines, never edits. Everything is redacted
 * before it is written; identities (run actor, outcome by) keep emails so they stay comparable, but never secrets.
 * Two run shapes: contract runs (`v: 2`, written by every verb) and Plan 1's text-format runs (no `v`, read only).
 * Both count toward MM3 ids.
 */
import { accessSync, appendFileSync, closeSync, constants, fstatSync, openSync, readFileSync, readSync } from 'node:fs';
import path from 'node:path';
import type { ItemStatus } from '../contract/grade.ts';
import type { UnitRef } from '../contract/layers.ts';
import type { Answer, Category, Depth, Gate, Layer, Verb, Mdl } from '../contract/types.ts';
import type { Consensus } from '../lens/consensus.ts';
import type { Level, Place } from '../lens/request.ts';
import { formatRunId, ulid } from './ids.ts';
// A deliberate two-way import with index.ts: log.ts calls withIndex/readRecordAt (only inside function bodies,
// never at module load time), and index.ts calls back into isRecord/LedgerError/shownLog the same way. Safe in
// ESM as long as neither side touches the other's exports before both modules finish loading, which holds here.
import { catchUpAfterAppend, normalizeRecordMdl, readRecordAt, withIndex } from './index.ts';
import { folderInPlaceOfFile, isAbsent, onStore, withLock } from './lock.ts';
import { ensureDir, type Mm3Paths } from './paths.ts';
import { redact, redactDeep, redactSecrets } from './redact.ts';

export type Outcome = 'held' | 'overruled' | 'failed';

export interface LoggedSlot {
  pos: number;
  text: string;
  reverse: boolean;
  p: number;
}

export type LoggedPrimitive =
  | { kind: 'bool'; text: string; p: number }
  | { kind: 'scale' | 'direction'; text: string; options: string[]; distribution: Record<string, number> };

export interface RunRecord {
  kind: 'run';
  id: string;
  uid: string;
  ts: string;
  verb: Verb;
  level: Level;
  actor: string;
  perspective: string;
  where: Place[];
  problem: string;
  tags: string[];
  focus: string;
  parent?: string;
  slots: LoggedSlot[];
  primitives: LoggedPrimitive[];
  consensus: Consensus;
  verdict: 'concern' | 'clear';
  lean?: { option: string; p: number };
  notes: string[];
  adapter: string;
  model: string;
  costUsd: number | null;
  task: string | null;
}

export type NewRun = Omit<RunRecord, 'kind' | 'id' | 'uid' | 'ts'>;

export interface ItemRecord {
  layer: string;
  fill: Record<string, string>;
  unit?: UnitRef;
  status: ItemStatus;
  /** Rolled up (its own categories and its children). */
  gate: Gate;
  /** Its own categories' gates. */
  categories: Record<string, Gate>;
}

/** One run of any verb under the YAML contract v1. */
/** One provider call's own telemetry: additive detail alongside the run's aggregate `costUsd`/
 *  `calls` — a run's own `telemetry` array holds one entry per HTTP call actually made (never per reused
 *  answer). The `source: 'cache'` shape (a reused answer's prorated saving) is declared here for the future
 *  piece that populates it (ledger/reuse.ts's own territory) — nothing in this codebase constructs one yet. */
export type TelemetryEntry =
  | {
      source: 'provider';
      layer?: string;
      model: string;
      baseURL?: string | null;
      questions: number;
      inputTokens?: number;
      outputTokens?: number;
      /** Measured locally (Date.now() around the call), never trusted from the provider. */
      latencyMs: number;
      retries?: number;
      status: 'ok' | 'error';
      evidenceBytes: number;
      rate?: { inputPerMTok?: number; outputPerMTok?: number; perSecond?: number; perCall?: number };
      costUsd?: number;
      costEstimated?: boolean;
    }
  | {
      source: 'cache';
      from: string;
      questions: number;
      original: { inputTokens?: number; costUsd?: number };
      savedUsd?: number;
      estimated: boolean;
    };

export interface ContractRun {
  kind: 'run';
  v: 2;
  id: string;
  uid: string;
  ts: string;
  verb: Verb;
  actor: string;
  task: string | null;
  goal: string;
  depth: Depth | null;
  where: string[];
  parent: string | null;
  from: string | null;
  compare: { before: string; after: string } | null;
  mdl: Mdl | null;
  /** The questions asked: categories (one subject) or layers (a sweep). replay stores its parent's. */
  ask: { categories: Category[]; layers: Layer[] };
  over: Record<string, unknown> | null;
  items: Record<string, ItemRecord> | null;
  /** Question id ("3", "goal", "payments/refunds#3", "before:3") → the checked answer. */
  answers: Record<string, Answer>;
  /** Question id → answer key (translate.ts answerKey): what makes an answer reusable. */
  keys: Record<string, string>;
  /** Question id → the run whose answer was reused for it. */
  reusedFrom: Record<string, string>;
  /** One subject: category → gate (replay: the "after" gates). */
  categories: Record<string, Gate>;
  gate: Gate;
  goalGate: Gate | null;
  goalP: number | null;
  consensus: Consensus | null;
  /** The YAML the agent was sent. */
  response: string;
  notes: string[];
  adapter: string;
  model: string;
  costUsd: number | null;
  /** HTTP calls made (0 when every answer was reused). */
  calls: number;
  /** The route (direct/gateway/custom, or fake/chaos) and base URL a run used, never the key. Optional so an
   *  older record (no `route`/`baseURL` at all) still reads: isRecord below doesn't require them, and every
   *  reader must treat a missing value the same as these fields never having been asked about. */
  route?: string | null;
  baseURL?: string | null;
  /** git HEAD sha at run time, or null (not a repo / git absent). Optional for the same reason as
   *  route/baseURL above: an older record simply never had one. The index's own column for this is named
   *  after the OTel semantic convention `vcs.ref.head.revision` (docs only — no code depends on that name). */
  commit?: string | null;
  /** replay only: which of the parent's concerns this run's own `mak.expect` predicted would
   *  turn to pass — a list of concern names, or the literal `'none'` (predict no flips). Optional so an older
   *  record (predating this field) still reads. */
  expect?: string[] | 'none';
  /** replay only: the before/after refs' own resolved shas (evidence/git.ts's `resolveRefSha`),
   *  distinct from `commit` above (replay's `commit` is the AFTER ref's resolved sha). Optional for the same
   *  reason as `commit`. */
  commits?: { before: string | null; after: string | null };
  /** Plan 2c B2: one entry per provider call actually made (never per reused answer). Optional/additive — an
   *  older record simply lacks it. */
  telemetry?: TelemetryEntry[];
}

/** What a verb hands the ledger: the response is built inside the lock, once the id and the budget are known. */
export type NewContractRun = Omit<ContractRun, 'kind' | 'v' | 'id' | 'uid' | 'ts' | 'response'> & {
  response: (id: string, budget: string) => string;
};

export interface OutcomeRecord {
  kind: 'outcome';
  id: string;
  uid: string;
  ts: string;
  of: string;
  outcome: Outcome;
  by: string;
}

/**
 * A paid call whose answer could not be used (junk, missing answers, probabilities outside 0..1). It carries no
 * MM3 id (run ids stay gap-free) but is counted in the budget, so budget runs == run records + failed records.
 */
export interface FailedRecord {
  kind: 'failed';
  /** The record's ulid (a failed call has no MM3-#### id). */
  id: string;
  uid: string;
  ts: string;
  verb: Verb;
  actor: string;
  adapter: string;
  model: string;
  costUsd: number | null;
  reason: string;
}

export type NewFailed = Omit<FailedRecord, 'kind' | 'id' | 'uid' | 'ts'>;

/**
 * A free `view` draft check: never a run (no MM3-#### id — `id` is its own ulid, same as a failed
 * record), never counted toward the budget, and never counted as a run anywhere (index.ts's `applyLine` already
 * only treats `kind === 'run'` as a run; every run-counting/report path is untouched by this kind existing).
 * Logged so the ledger can see what agents search for, which CONTRACT already claimed happens ("the lookup is
 * logged") but didn't, until now.
 */
export interface LookupRecord {
  kind: 'lookup';
  id: string;
  uid: string;
  ts: string;
  goal: string;
  where: string[];
  hit: boolean;
  /** The run id an exact-match answer was reused from, when `hit` is true; null on a miss. */
  reused: string | null;
}

export type NewLookup = Omit<LookupRecord, 'kind' | 'id' | 'uid' | 'ts'>;

/**
 * The receipt `mm3 config --load` leaves: when the file was loaded, its hash, the settings it held (validated), what
 * changed since the previous receipt, and, when the budget changed, the moment its count restarts. It is the record of
 * a load, not the loader: every request reads config.yaml itself. Never a run, never counted toward the budget.
 */
export interface ConfigRecord {
  kind: 'config';
  id: string;
  uid: string;
  ts: string;
  /** sha256 of the config.yaml text that was loaded. */
  fingerprint: string;
  /** The validated settings the file held (a sparse tree, the same shape as the config's overrides). */
  settings: Record<string, unknown>;
  /** One line per setting that differs from the previous receipt (or from the defaults, for the first one). */
  changes: string[];
  /** The budget count starts here: set when this load changed the budget, carried forward by later loads that did not. */
  windowSince?: string;
  /** The load found no config.yaml: the receipt records going back to the defaults. */
  absent?: true;
}

export type NewConfig = Omit<ConfigRecord, 'kind' | 'id' | 'uid' | 'ts'>;

export type LedgerRecord = RunRecord | ContractRun | OutcomeRecord | FailedRecord | LookupRecord | ConfigRecord;

const KNOWN_KINDS = ['run', 'outcome', 'failed', 'lookup', 'config'];

/** The stop for a line that parsed as JSON but is not a record this copy accepts. A kind this copy has never heard of
 *  (a newer MM3 wrote it) says so and names the fix; anything else is the plain "not a ledger record". */
export function notARecord(value: unknown, lineNo: number, shown: string): LedgerError {
  const kind = value && typeof value === 'object' && !Array.isArray(value) ? (value as { kind?: unknown }).kind : undefined;
  if (typeof kind === 'string' && !KNOWN_KINDS.includes(kind)) {
    return new LedgerError(`✖ ledger: line ${lineNo} of ${shown} has a ${JSON.stringify(kind.slice(0, 30))} record this MM3 does not know → update this copy of MM3 (mm3 doctor shows which)`);
  }
  return new LedgerError(`✖ ledger: line ${lineNo} of ${shown} is not a ledger record → fix or remove that line`);
}

export class LedgerError extends Error {
  /** 1: the ledger itself is the problem · 2: the caller asked for something the ledger doesn't hold. */
  readonly exit: 1 | 2;
  constructor(message: string, exit: 1 | 2 = 1) {
    super(message);
    this.name = 'LedgerError';
    this.exit = exit;
  }
}

/** A Plan 1 text-format run (read only). */
export const isRun = (r: LedgerRecord): r is RunRecord => r.kind === 'run' && !('v' in r);
export const isContractRun = (r: LedgerRecord): r is ContractRun => r.kind === 'run' && (r as ContractRun).v === 2;
const iso = (now: number): string => new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');

const isText = (v: unknown): boolean => typeof v === 'string';
const isObj = (v: unknown): boolean => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Just enough shape for every reader (view, outcome, id counting) to use a record without crashing. Exported
 * so ledger/index.ts's line parser can reuse it verbatim: the index and readLedger must never disagree about
 * what counts as a valid record, or the index could silently hide corruption readLedger would catch.
 */
export function isRecord(v: unknown): v is LedgerRecord {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  if (r.kind === 'outcome') return [r.id, r.of, r.outcome, r.by, r.ts].every(isText);
  if (r.kind === 'failed') return [r.id, r.ts, r.verb, r.actor, r.adapter, r.model, r.reason].every(isText);
  if (r.kind === 'config') return [r.id, r.uid, r.ts, r.fingerprint].every(isText) && isObj(r.settings) && Array.isArray(r.changes) && r.changes.every(isText) && (r.windowSince === undefined || isText(r.windowSince)) && (r.absent === undefined || r.absent === true);
  if (r.kind === 'lookup') return [r.id, r.uid, r.ts, r.goal].every(isText) && Array.isArray(r.where) && r.where.every(isText) && typeof r.hit === 'boolean';
  if (r.kind !== 'run') return false;
  if (r.v === 2) {
    return (
      [r.id, r.uid, r.ts, r.verb, r.goal, r.gate, r.adapter, r.model, r.actor, r.response].every(isText) &&
      Array.isArray(r.where) &&
      r.where.every(isText) &&
      isObj(r.answers) &&
      isObj(r.keys) &&
      isObj(r.categories)
    );
  }
  return (
    [r.id, r.ts, r.verb, r.focus, r.consensus, r.verdict, r.adapter].every(isText) &&
    typeof r.level === 'number' &&
    Array.isArray(r.tags) &&
    r.tags.every(isText) &&
    Array.isArray(r.where) &&
    r.where.every((w: unknown) => !!w && typeof w === 'object' && isText((w as Record<string, unknown>).path))
  );
}

/** The ledger's path, shown relative to the project root (never absolute — AGENTS.md: no machine paths in output
 *  or errors). Shared with ledger/index.ts so a line's error text always names the file the same way readLedger does. */
export const shownLog = (paths: Mm3Paths): string => path.relative(paths.root, paths.log).split(path.sep).join('/');

/**
 * Every record, in order. A line that isn't a record refuses the whole read (fail closed): ids are counted from it.
 * `partialTail` (readers that don't hold the lock, like view): a bad last line with no trailing newline is skipped,
 * since it may be an append in progress. Writers always read strictly, under the lock.
 */
export function readLedger(paths: Mm3Paths, opts: { partialTail?: boolean } = {}): LedgerRecord[] {
  const text = onStore(paths.log, 'read', () => {
    try {
      return readFileSync(paths.log, 'utf8');
    } catch (e) {
      if (isAbsent(e)) return ''; // no ledger yet
      throw e;
    }
  });
  const shown = shownLog(paths);
  const records: LedgerRecord[] = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const inProgress = opts.partialTail === true && i === lines.length - 1; // the last segment has no newline after it
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      if (inProgress) return;
      throw new LedgerError(`✖ ledger: line ${i + 1} of ${shown} is not valid JSON → fix or remove that line`);
    }
    if (!isRecord(value)) {
      if (inProgress) return;
      throw notARecord(value, i + 1, shown);
    }
    records.push(normalizeRecordMdl(value));
  });
  return records;
}

/**
 * The id index leaves a trailing line with no `\n` yet unconsumed — "might still be writing," the same
 * partialTail leniency readLedger gives its readers (view, findRun). A writer about to append needs the
 * stricter behavior readLedger's default (non-partialTail) callers already had: an in-progress append from
 * another process (the index can be stale relative to a live writer) must refuse, not look like "ok to write."
 * Since the index has already validated everything up to `upto`, only the unconsumed tail — normally zero
 * bytes, never the whole log — needs checking here, via a targeted read (openSync/readSync at `upto`, never
 * readFileSync of the whole file), with the exact readLedger wording and line number.
 */
const folderInPlaceOfLog = folderInPlaceOfFile; // a folder where log.jsonl should be: see lock.ts

function checkTail(paths: Mm3Paths, upto: number, lineCount: number): void {
  let fd: number;
  try {
    fd = openSync(paths.log, 'r'); // open once, then size that same file: no check-then-use gap
  } catch (e) {
    if (isAbsent(e)) return;
    throw e;
  }
  let raw: string;
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw folderInPlaceOfLog();
    const size = st.size;
    if (size <= upto) return;
    const buf = Buffer.alloc(size - upto);
    let got = 0;
    while (got < buf.length) {
      const n = readSync(fd, buf, got, buf.length - got, upto + got);
      if (n <= 0) break;
      got += n;
    }
    raw = buf.subarray(0, got).toString('utf8'); // upto is always \n-aligned, so this can never split a UTF-8 char
  } finally {
    closeSync(fd);
  }
  if (!raw.trim()) return;
  const shown = shownLog(paths);
  const lineNo = lineCount + 1;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new LedgerError(`✖ ledger: line ${lineNo} of ${shown} is not valid JSON → fix or remove that line`);
  }
  if (!isRecord(value)) throw notARecord(value, lineNo, shown);
}

/** Before a paid call: the ledger reads cleanly and can be appended to, so a run we pay for can be logged.
 *  Called on every paid call (pay.ts's preflight), so this goes through the id index (withIndex) rather than a
 *  full readLedger: catch-up only parses the bytes after the index's `upto`; a first-ever call, or a
 *  stale/corrupt index, still does one full scan (a rebuild, or the linear fallback), exactly like readLedger
 *  did; checkTail then covers the one thing the index alone doesn't (see its own comment). The onStore wrap
 *  preserves the same StoreError normalization readLedger got "for free" (an errno failure — log.jsonl replaced
 *  by a folder — would otherwise surface as a raw fs error here, unlike nextRunNumber/findRun's call sites,
 *  which are fine surfacing it raw). */
export function checkLedger(paths: Mm3Paths): void {
  withLock(paths.lock, () => {
    // onStore wraps both steps together (an errno failure from either — e.g. log.jsonl replaced by a folder —
    // becomes one clean StoreError, not a raw fs error): a LedgerError has no `.code`, so onStore/storeError
    // passes it straight through unchanged, same as before. withIndex's own callback here only reads two numbers
    // off the (already self-healed, caught-up) index — it can't itself throw a "real" ledger-corruption error.
    // checkTail runs as a second, separate step (not inside withIndex's own callback) on purpose: its
    // LedgerError (genuine tail corruption) must never be mistaken for "SQLite failed" and silently retried
    // against the linear fallback (which would just rediscover the same corruption a second time, wastefully).
    onStore(paths.log, 'read', () => {
      const at = withIndex(paths, (h) => ({ upto: h.upto(), lineCount: h.lineCount() }));
      checkTail(paths, at.upto, at.lineCount);
    });
    onStore(paths.log, 'write', () => {
      try {
        accessSync(paths.log, constants.W_OK);
      } catch (e) {
        if (!isAbsent(e)) throw e; // no ledger yet: nothing to be unwritable
      }
    });
  });
}

/** True when the log doesn't need a "\n" inserted before the next line: missing, empty, or already ends in one.
 *  Reads only the LAST BYTE of the file (openSync/readSync at size-1) — never readFileSync of the whole log,
 *  which used to cost ~55% of a paid call's own time at 100k just to answer this one-byte question. */
function logEndsCleanly(logPath: string): boolean {
  let fd: number;
  try {
    fd = openSync(logPath, 'r'); // open once, then size that same file: no check-then-use gap
  } catch (e) {
    if (isAbsent(e)) return true; // no file yet: nothing to need a break from
    throw e;
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw folderInPlaceOfLog();
    const size = st.size;
    if (size === 0) return true;
    const buf = Buffer.alloc(1);
    const got = readSync(fd, buf, 0, 1, size - 1);
    return got === 1 && buf[0] === 0x0a;
  } finally {
    closeSync(fd);
  }
}

function appendLine(paths: Mm3Paths, record: LedgerRecord): void {
  onStore(paths.log, 'write', () => {
    ensureDir(paths);
    const needsBreak = !logEndsCleanly(paths.log);
    appendFileSync(paths.log, `${needsBreak ? '\n' : ''}${JSON.stringify(record)}\n`);
    catchUpAfterAppend(paths); // keep a current index current, so read-only readers never fall back to a full scan
  });
}

/** The next SW number, from the id index (ledger/index.ts) instead of a linear scan. The caller holds the lock. */
export function nextRunNumber(paths: Mm3Paths): number {
  return withIndex(paths, (h) => h.runCount()) + 1;
}

/** The record at byte offset `at` if it really is `id`'s run; undefined otherwise (unparseable, or some other
 *  record entirely — readRecordAt never throws for either, it just can't produce a match at that offset). */
function matchingRun(at: number, logPath: string, id: string): RunRecord | ContractRun | undefined {
  const record = readRecordAt(logPath, at);
  return record && record.kind === 'run' && record.id === id ? (record as RunRecord | ContractRun) : undefined;
}

/**
 * A run of either shape by MM3 id, or undefined: one index lookup plus one line read, never a full scan.
 * A missing offset is trusted as-is (id genuinely not in the ledger) — no rebuild, so a miss stays cheap, which
 * is the whole point of the index. But a *stale* offset (a bad entry, or the log changing between the index
 * read and this one — truncated or replaced by another process, with no lock held) never crashes and never
 * returns the wrong record: when an offset is found but doesn't check out, the index is forced to rebuild once
 * from the log as it is right now, and that answer is trusted either way — found, or genuinely not there. A log
 * that's genuinely corrupt (not just a stale offset) still fails closed with readLedger's usual LedgerError,
 * thrown from within that rebuild, not swallowed here.
 * Always `readOnly`: findRun is a pure query, called both inside an already-held lock (appendOutcome) and,
 * just as often, outside any lock at all (replay/drill resolving mak.parent, including during --dry-run,
 * before preflight ever runs) — it must never be the thing that takes the ledger lock to rebuild/catch up the
 * on-disk index on a real writer's behalf. When the on-disk index isn't already fresh, it falls back to an
 * in-memory scan instead (always correct, just not persisted) rather than write anything to disk.
 */
export function findRun(paths: Mm3Paths, id: string): RunRecord | ContractRun | undefined {
  const at = withIndex(paths, (h) => h.findOffset(id), { readOnly: true });
  if (at === undefined) return undefined;
  const first = matchingRun(at, paths.log, id);
  if (first) return first;
  const at2 = withIndex(paths, (h) => h.findOffset(id), { forceRebuild: true, readOnly: true });
  return at2 === undefined ? undefined : matchingRun(at2, paths.log, id);
}

/** Appends a run with the next MM3 id. The caller holds the lock (see appendRun, and recordCall in record.ts). */
export function appendRunLocked(paths: Mm3Paths, run: NewRun, now: number = Date.now()): RunRecord {
  const record: RunRecord = { kind: 'run', id: formatRunId(nextRunNumber(paths)), uid: ulid(now), ts: iso(now), ...redactDeep(run), actor: redactSecrets(run.actor) };
  appendLine(paths, record);
  return record;
}

/** Appends a contract run with the next MM3 id. The caller holds the lock (recordCall, or appendContractRun). */
export function appendContractRunLocked(paths: Mm3Paths, run: NewContractRun, now: number, budget: string): ContractRun {
  const id = formatRunId(nextRunNumber(paths));
  const { response, ...rest } = run;
  const record: ContractRun = {
    kind: 'run',
    v: 2,
    id,
    uid: ulid(now),
    ts: iso(now),
    ...redactDeep(rest),
    actor: redactSecrets(run.actor),
    response: redact(response(id, budget)),
  };
  appendLine(paths, record);
  return record;
}

/** A run that made no paid call (every answer reused): logged under the lock, not counted against the budget. */
export function appendContractRun(paths: Mm3Paths, run: NewContractRun, now: number, budget: string): ContractRun {
  return withLock(paths.lock, () => appendContractRunLocked(paths, run, now, budget));
}

/** Appends a failed call. The caller holds the lock. The ledger is validated first (via the index, plus
 *  checkTail for an in-progress tail the index alone tolerates — see checkLedger's comment), so a corrupt one
 *  refuses here too. */
export function appendFailedLocked(paths: Mm3Paths, failed: NewFailed, now: number = Date.now()): FailedRecord {
  onStore(paths.log, 'read', () => {
    const at = withIndex(paths, (h) => ({ upto: h.upto(), lineCount: h.lineCount() }));
    checkTail(paths, at.upto, at.lineCount);
  });
  const uid = ulid(now);
  const record: FailedRecord = { kind: 'failed', id: uid, uid, ts: iso(now), ...redactDeep(failed), actor: redactSecrets(failed.actor) };
  appendLine(paths, record);
  return record;
}

export function appendRun(paths: Mm3Paths, run: NewRun, now: number = Date.now()): RunRecord {
  return withLock(paths.lock, () => appendRunLocked(paths, run, now));
}

/** A free view lookup (see LookupRecord's own comment): takes the lock like every other append (concurrent
 *  writers must never interleave lines), but assigns no MM3-#### id and never touches the budget. */
/** Appends one config receipt (see ConfigRecord). Under the ledger lock like every other append. */
export function appendConfig(paths: Mm3Paths, config: NewConfig, now: number = Date.now()): ConfigRecord {
  return withLock(paths.lock, () => {
    const uid = ulid(now);
    const record: ConfigRecord = { kind: 'config', id: uid, uid, ts: iso(now), ...redactDeep(config) };
    appendLine(paths, record);
    return record;
  });
}

export function appendLookup(paths: Mm3Paths, lookup: NewLookup, now: number = Date.now()): LookupRecord {
  return withLock(paths.lock, () => {
    const uid = ulid(now);
    const record: LookupRecord = { kind: 'lookup', id: uid, uid, ts: iso(now), ...redactDeep(lookup) };
    appendLine(paths, record);
    return record;
  });
}

/**
 * Appends an outcome for a logged run. The run's latest outcome again, by the same actor, is not appended (an
 * agent retrying is a no-op): `repeat` is true and `record` is the one already there. Another actor's is appended.
 * "Does the run exist, and what's its actor" is an id lookup, so it uses the index (findRun) instead of a full
 * scan; "what was the latest outcome already recorded for it" goes through the index's own outcomes table
 * (latestOutcomeOf — outcome, uid, ts and by, self-compacting to the newest one per run id) rather than a full
 * readLedger scan. This whole function already holds paths.lock, so the withIndex calls below self-heal under that SAME lock
 * (withLockIfNeeded sees it's already ours) rather than taking a second one. Also validates the tail (same
 * discipline as checkLedger/appendFailedLocked, via checkTail): findRun's own read tolerates an in-progress
 * append (it only needs `of`'s own line, found well before any corrupt/truncated tail); an outcome append is
 * itself a write, so — like every other write path — it must refuse on a bad or in-progress tail rather than
 * append past it.
 */
export function appendOutcome(paths: Mm3Paths, of: string, outcome: Outcome, by: string, now: number = Date.now()): { record: OutcomeRecord; repeat: boolean } {
  return withLock(paths.lock, () => {
    const run = findRun(paths, of);
    // Neither stop can reuse verbs/request.ts's stopText: ledger/ sits below verbs/, and importing it here would
    // be a layering inversion (the same reason budget/budget.ts appends its own literal suffix instead).
    if (!run) throw new LedgerError(`✖ outcome: ${of} is not in the ledger → check the id with "mm3 view ${of}"\n→ see: mm3 agent outcome`, 2);
    const who = redactSecrets(by); // the same transform the run's actor went through: compare like with like
    if (outcome === 'held' && who === run.actor) {
      throw new LedgerError(`✖ outcome: ${who} asked ${of}, so it can't mark it held → another agent or the owner records "held"\n→ see: mm3 agent outcome`);
    }
    onStore(paths.log, 'read', () => {
      const at = withIndex(paths, (h) => ({ upto: h.upto(), lineCount: h.lineCount() }));
      checkTail(paths, at.upto, at.lineCount);
    });
    const latest = withIndex(paths, (h) => h.latestOutcomeOf(of));
    if (latest && latest.outcome === outcome && latest.by === who) {
      return { record: { kind: 'outcome', id: `${of}-outcome`, uid: latest.uid, ts: latest.ts, of, outcome, by: who }, repeat: true };
    }
    const record: OutcomeRecord = { kind: 'outcome', id: `${of}-outcome`, uid: ulid(now), ts: iso(now), of, outcome, by: who };
    appendLine(paths, record);
    return { record, repeat: false };
  });
}

export function latestOutcome(records: readonly LedgerRecord[], id: string): Outcome | null {
  let found: Outcome | null = null;
  for (const r of records) if (r.kind === 'outcome' && r.of === id) found = r.outcome;
  return found;
}

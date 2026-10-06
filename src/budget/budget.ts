/**
 * The budget: caps (`usd`, `runs`, `per`, `since`) live in `.mm3/config.yaml`'s `budget:` key;
 * spent/runs are derived from the ledger itself — every RunRecord/ContractRun/FailedRecord already carries its
 * own `costUsd`, summed via an index rollup (ledger/index.ts's `budgetRollup`) — so there is no separate counter
 * to ever drift out of sync with what was actually recorded. `per: total` (the default) counts everything since
 * `since` (unset = the whole ledger, from the start); `per: day`/`hour` additionally floors the window to the
 * start of the current UTC day/hour, whichever is later. The run cap always applies, including when a provider
 * does not report cost.
 *
 * `.mm3/budget.json` (the pre-2c running-counter file) is read at most once, purely to migrate its caps
 * into config.yaml the first time nothing there says otherwise (`budget.since` unset in config); after that it
 * is never consulted again, and never trusted if corrupt — config.yaml is the sole authority once it exists.
 */
import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_CONFIG, type Mm3Config } from '../config/defaults.ts';
import { resolveConfig, type ResolvedConfig } from '../config/load.ts';
import { writeConfigOverride } from '../config/write.ts';
import { budgetRollup, latestConfigRecord } from '../ledger/index.ts';
import { onStore, withLock } from '../ledger/lock.ts';
import { appendFailedLocked, type NewFailed } from '../ledger/log.ts';
import type { Mm3Paths } from '../ledger/paths.ts';

export interface BudgetState {
  capUsd: number;
  capRuns: number;
  spentUsd: number;
  runs: number;
  resetAt: string;
  /** Share of a cap at which the line turns into a warning (budget.warnAt). Omitted: BUDGET_LOW_FRACTION. */
  warnAt?: number;
}

export class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetError';
  }
}

const iso = (now: number): string => new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');
const money = (n: number): string => `$${n.toFixed(2)}`;
/** Dollars left, with just enough extra decimals (up to 6) that real spend never reads as the untouched cap:
 *  a run costs fractions of a cent, so `$4.998 left of $5.00`, never `$5.00 left of $5.00` after nine runs. */
function moneyLeft(left: number, cap: number, spent: number): string {
  if (spent <= 0) return money(left);
  for (let d = 2; d < 6; d++) if (left.toFixed(d) !== cap.toFixed(d)) return `$${left.toFixed(d)}`;
  return `$${left.toFixed(6)}`;
}
const EPOCH = iso(0);
// Every stop below carries its own fix already; the trailing line just points at the deeper card, the same
// pointer every other stop in the codebase ends with (`mm3 agent <verb|tool>`, C-153) — `budget` isn't a
// `Verb`, so this can't reuse `verbs/request.ts`'s `stopText` without `budget/` importing from `verbs/`, a
// layering inversion the rest of the codebase avoids; the literal suffix is the smaller fix.
const AGENT_POINTER = '\n→ see: mm3 agent budget';

/** The pre-2c `.mm3/budget.json` shape, read at most once for migration — never thrown on, never trusted
 *  for spend after that: any problem (missing, corrupt, wrong shape) simply reads as "nothing to migrate,"
 *  since config.yaml is the real authority now and a stale legacy file must never block a real run. */
function readLegacyBudgetJson(paths: Mm3Paths): { capUsd: number; capRuns: number; resetAt: string } | undefined {
  if (!existsSync(paths.budget)) return undefined;
  try {
    const v = JSON.parse(readFileSync(paths.budget, 'utf8')) as Record<string, unknown>;
    const capUsd = v.capUsd;
    const capRuns = v.capRuns;
    const resetAt = v.resetAt;
    if (typeof capUsd === 'number' && Number.isFinite(capUsd) && typeof capRuns === 'number' && Number.isFinite(capRuns) && typeof resetAt === 'string') {
      return { capUsd, capRuns, resetAt };
    }
  } catch {
    /* corrupt or unreadable: nothing to migrate */
  }
  return undefined;
}

/** `per: total`'s window start is `since` (or the beginning of the ledger, unset); `day`/`hour` additionally
 *  floor it to the start of the current UTC day/hour, whichever is LATER than `since` — so a mid-window reset
 *  still narrows the window further, never widens it back out. */
function windowStartMs(budget: Mm3Config['budget'], now: number): number {
  const sinceMs = budget.since ? Date.parse(budget.since) : 0;
  const floor = Number.isNaN(sinceMs) ? 0 : sinceMs;
  if (budget.per === 'total') return floor;
  const d = new Date(now);
  const periodStartMs =
    budget.per === 'day' ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
  return Math.max(floor, periodStartMs);
}

function stateFromConfig(paths: Mm3Paths, config: Mm3Config, now: number, opts: { readOnly?: boolean } = {}): BudgetState {
  let sinceMs = windowStartMs(config.budget, now);
  // A load that changed the budget started its count over: the latest receipt says where. A later start wins.
  const restart = onStore(paths.log, 'read', () => latestConfigRecord(paths, opts))?.windowSince;
  const restartMs = restart ? Date.parse(restart) : Number.NaN;
  const restarted = !Number.isNaN(restartMs) && restartMs > sinceMs;
  if (restarted) sinceMs = restartMs;
  // Wrapped in onStore, same as every other ledger read (ledger/reuse.ts's lookupAnswers/exactReuse) — a raw fs
  // error (log.jsonl replaced by a directory, permissions) must surface as the usual clean StoreError, never an
  // unwrapped errno escaping just because this read happens to go through budgetRollup instead of readLedger.
  const { spentUsd, runs } = onStore(paths.log, 'read', () => budgetRollup(paths, iso(sinceMs), opts));
  return { capUsd: config.budget.usd, capRuns: config.budget.runs, spentUsd, runs, resetAt: restarted ? iso(sinceMs) : (config.budget.since ?? EPOCH), warnAt: config.budget.warnAt };
}

/** Ledger-derived state with no side effects at all (no migration attempt, no locking of its own) — safe to
 *  call from inside an already-held `paths.lock` (ledger/record.ts's `recordCall`), unlike `loadBudget`, whose
 *  migration path takes the lock itself. */
export function budgetStateNow(paths: Mm3Paths, now: number = Date.now(), env: Record<string, string | undefined> = process.env): BudgetState {
  const { config } = resolveConfig(paths, env);
  return stateFromConfig(paths, config, now);
}

/** A read-only peek at the current budget, for a dry run: never migrates, never writes, never throws. Any
 *  problem reads as `undefined` rather than reported — a dry run only wants to warn when it can positively tell
 *  the cap is already reached; a real run still gets `loadBudget`'s own migration and error handling. */
export function peekBudget(paths: Mm3Paths, now: number = Date.now(), env: Record<string, string | undefined> = process.env): BudgetState | undefined {
  try {
    const { config } = resolveConfig(paths, env);
    return stateFromConfig(paths, config, now, { readOnly: true });
  } catch {
    return undefined;
  }
}

/** Migrates a legacy `.mm3/budget.json`'s caps into config.yaml, once — only when config.yaml doesn't
 *  already say something about `budget.since` (the marker that this project's budget has already been touched
 *  under the new scheme, whether by a `budget.since` the owner wrote or by this very migration). A no-op every subsequent
 *  call. Returns true only when it actually wrote, so `loadBudget` can report it as `created` — the same
 *  one-time-notice spirit as the old "budget file created with defaults." */
function migrateLegacyIfNeeded(paths: Mm3Paths, env: Record<string, string | undefined>, resolved: ResolvedConfig): boolean {
  if (resolved.sources['budget.since'] === 'config') return false;
  return withLock(paths.lock, () => {
    // Both reads are pure, so the legacy file is checked first: with none there is nothing to migrate and no
    // reason to read config.yaml again. A migration that raced in while the lock was awaited still wins.
    const legacy = readLegacyBudgetJson(paths);
    if (!legacy) return false;
    if (resolveConfig(paths, env).sources['budget.since'] === 'config') return false;
    writeConfigOverride(paths, { budget: { usd: legacy.capUsd, runs: legacy.capRuns, per: 'total', since: legacy.resetAt } });
    return true;
  });
}

export function loadBudget(paths: Mm3Paths, now: number = Date.now(), env: Record<string, string | undefined> = process.env): { state: BudgetState; created: boolean } {
  // One config read serves the migration check and the state — it is read again only when the migration just
  // rewrote config.yaml (then the caps in the file are the migrated ones).
  const resolved = resolveConfig(paths, env);
  const created = migrateLegacyIfNeeded(paths, env, resolved);
  return { state: stateFromConfig(paths, created ? resolveConfig(paths, env).config : resolved.config, now), created };
}

export function usedFraction(s: BudgetState): number {
  return Math.max(s.capUsd > 0 ? s.spentUsd / s.capUsd : 1, s.capRuns > 0 ? s.runs / s.capRuns : 1);
}

/** The one fix for a low or spent budget, named the same way in the warning and in the stop: the caps live in the
 *  config, and a load makes the change real. */
function raiseHint(usd: boolean, runs: boolean): string {
  const keys = [usd ? 'budget.usd' : '', runs ? 'budget.runs' : ''].filter(Boolean).join(' and ');
  return `raise ${keys} in .mm3/config.yaml, then run mm3 config --load`;
}

export function checkBudget(s: BudgetState): { ok: true } | { ok: false; message: string } {
  const runsCapped = s.runs >= s.capRuns;
  const usdCapped = s.spentUsd >= s.capUsd;
  if (runsCapped || usdCapped) {
    return { ok: false, message: `✖ budget: cap reached (${money(s.spentUsd)} of ${money(s.capUsd)} · ${s.runs} of ${s.capRuns} runs) → ask the owner to ${raiseHint(usdCapped, runsCapped)}${AGENT_POINTER}` };
  }
  return { ok: true };
}

/** Test/fixture convenience (no real caller in src/ outside this module): simulates one more spent call by
 *  appending a minimal FailedRecord with the given cost, so budget-invariant tests (and the concurrency-stress
 *  e2e fixture) can "reach the cap" without a real classifier call. Counts toward `runs`/`spentUsd` exactly like
 *  any other ledger entry — there is no separate counter left to bump directly. */
export function recordSpend(paths: Mm3Paths, costUsd: number, now: number = Date.now()): BudgetState {
  const failed: NewFailed = {
    verb: 'class',
    actor: 'test',
    adapter: 'test',
    model: 'test',
    costUsd: Number.isFinite(costUsd) ? Math.max(0, costUsd) : 0,
    reason: 'recordSpend (test helper)',
  };
  withLock(paths.lock, () => appendFailedLocked(paths, failed, now));
  return budgetStateNow(paths, now);
}
/** Share of a cap spent at which the line turns into a warning (and says what to do) — below it the line is
 *  plain headroom, so an agent reading "10% used" no longer mistakes a nearly-empty meter for a constraint. The default;
 *  a project moves it with `budget.warnAt`. [C-229] */
export const BUDGET_LOW_FRACTION = DEFAULT_CONFIG.budget.warnAt;

/** The one budget-line formatter: run notes and `mm3 budget` print exactly this. It states
 *  what is LEFT, not a percentage — `budget: $0.11 left of $0.12 · 27 of 30 runs left`. A `⚠` appears only at
 *  >= 80% used, followed by the fix for whichever cap is running low. [C-229] */
export function budgetLine(s: BudgetState): string {
  const usdLeft = Math.max(0, s.capUsd - s.spentUsd);
  const runsLeft = Math.max(0, s.capRuns - s.runs);
  // An overshot cap (concurrent runs can pass it) says so, instead of reading as exactly at the cap.
  const usdUsed = s.spentUsd > s.capUsd ? ` (${money(s.spentUsd)} used)` : '';
  const runsUsed = s.runs > s.capRuns ? ` (${s.runs} used)` : '';
  const line = `budget: ${moneyLeft(usdLeft, s.capUsd, s.spentUsd)} left of ${money(s.capUsd)}${usdUsed} · ${runsLeft} of ${s.capRuns} runs left${runsUsed}`;
  const warnAt = s.warnAt ?? BUDGET_LOW_FRACTION;
  if (usedFraction(s) < warnAt) return line;
  const lowUsd = s.capUsd > 0 ? s.spentUsd / s.capUsd >= warnAt : true;
  const lowRuns = s.capRuns > 0 ? s.runs / s.capRuns >= warnAt : true;
  return `⚠ ${line} → low: ask the owner to ${raiseHint(lowUsd, lowRuns)}`;
}

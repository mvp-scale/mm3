// The agentic ledger: test/agentic/ledger.jsonl, append-only, one JSON object per line. Every ceremony run is recorded,
// free or not, formal or not: a `started` line is written BEFORE anything runs and carries the definition of success
// (its hash and the checkpoints it names), then a `finished` line (or `aborted`) closes it. A started line with no closing
// line is an incomplete run, visible as such. The release gate (scripts/check-agentic.ts) reads only this file.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { CHECKPOINTS } from './checkpoints.ts';

export const LEDGER = 'test/agentic/ledger.jsonl';

export interface Definition {
  hash: string;
  rules: object;
  scenarios: Array<{ id: string; goal: string; promise: number; checkpoints: Array<{ id: string; text: string }> }>;
}

export interface StartedRecord {
  kind: 'ceremony';
  phase: 'started';
  id: string; // CER-0001
  ts: string;
  version: string;
  versionCommit: string | null; // the commit the version was built from
  head: string; // the commit this checkout is at
  dirty: boolean;
  fingerprint: string; // the guidance every agent reads
  definition: Definition; // success, stated before the run
  mode: 'free'; // sample provider, no key, no TypeSafe spend; a paid mode needs explicit approval and does not exist yet
  trialsOverride: number | null;
  formal: boolean; // counts toward the release gate
  formalReason: string; // why it does or does not
  backfilled?: boolean;
}

export interface FinishedRecord {
  kind: 'ceremony';
  phase: 'finished' | 'aborted';
  startedId: string;
  ts: string;
  passed: boolean;
  reason?: string; // aborted: why
  level1?: Array<{ name: string; ok: boolean; detail: string }>;
  level2?: Array<{ id: string; level: string; pass: boolean }>;
  level3?: Array<{ id: string; route: string; model: string; trial: number; pass: boolean; failed: string[]; attempts: number[]; firstRequestAccepted: boolean; mm3Calls: number; transcript: string }>;
  firstRequestAcceptedRate?: number;
  notionalCostUsd?: number;
}

export type LedgerRecord = StartedRecord | FinishedRecord;

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Success as the scenario file and the checkpoint registry state it now. Hash changes when any goal, promise, checkpoint or rule changes. */
export function definitionOf(spec: { full: Array<{ id: string; goal: string; promise: number; checkpoints: string[] }>; rules: object }): Definition {
  const scenarios = spec.full.map((s) => ({ id: s.id, goal: s.goal, promise: s.promise, checkpoints: s.checkpoints.map((c) => ({ id: c, text: CHECKPOINTS[c]?.text ?? `UNKNOWN ${c}` })) }));
  return { hash: sha(JSON.stringify({ scenarios, rules: spec.rules })), rules: spec.rules, scenarios };
}

export const readLedger = (file = LEDGER): LedgerRecord[] =>
  existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as LedgerRecord) : [];

export const nextId = (records: LedgerRecord[]): string => `CER-${String(records.filter((r) => r.phase === 'started').length + 1).padStart(4, '0')}`;

export const append = (r: LedgerRecord, file = LEDGER): void => appendFileSync(file, `${JSON.stringify(r)}\n`);

/** The newest formal run that finished, with its closing line; undefined when none. */
export function lastFormal(records: LedgerRecord[]): { started: StartedRecord; finished: FinishedRecord } | undefined {
  const starts = records.filter((r): r is StartedRecord => r.phase === 'started' && r.formal);
  for (const started of starts.reverse()) {
    const finished = records.find((r): r is FinishedRecord => r.phase !== 'started' && r.startedId === started.id && r.phase === 'finished');
    if (finished) return { started, finished };
  }
  return undefined;
}

/** Runs that began and never closed. */
export const incomplete = (records: LedgerRecord[]): StartedRecord[] =>
  records.filter((r): r is StartedRecord => r.phase === 'started').filter((s) => !records.some((r) => r.phase !== 'started' && r.startedId === s.id));

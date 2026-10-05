// The agentic ledger: test/agentic/ledger.jsonl, append-only, one JSON object per line. It is the record of what went into
// each ceremony run and what came out, so runs can be compared and the next one measured against the last: not a time
// machine, a witness. Every run is recorded, free or not, formal or not: a `started` line is written BEFORE anything runs
// and carries the definition of success in full (every prompt, model, route, checkpoint and rule, plus a plain-English
// summary and a hash), then a `finished` line (or `aborted`) closes it. Each line carries the hash of the line before it, so
// an edited or deleted line breaks every line after it. A started line with no closing line is an incomplete run.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { CHECKPOINTS } from './checkpoints.ts';

export const LEDGER = 'test/agentic/ledger.jsonl';
export const SCHEMA = 1;

export interface SpecScenario {
  id: string;
  goal: string;
  prompt: string;
  model: string;
  routes: string[];
  helpers?: number;
  promise: number;
  checkpoints: string[];
}
export interface SpecContext {
  id: string;
  situation: string;
  ask: string;
  expect: string[];
}
export interface Spec {
  preconditions?: string[];
  context?: SpecContext[];
  full: SpecScenario[];
  rules: object;
}

export interface Definition {
  hash: string;
  plain: string; // the definition in one readable sentence
  rules: object;
  preconditions: string[];
  fixture: { tag: string; sha: string };
  context: SpecContext[];
  scenarios: Array<{ id: string; goal: string; prompt: string; model: string; routes: string[]; helpers: number; promise: number; checkpoints: Array<{ id: string; text: string }> }>;
}

export interface StartedRecord {
  kind: 'ceremony';
  phase: 'started';
  schema?: number; // absent: written before the schema existed (the backfilled run)
  prev?: string; // sha256 of the previous line
  id: string; // CER-0001
  ts: string;
  version: string;
  versionCommit: string | null; // the commit the version was built from
  head: string; // the commit this checkout is at
  dirty: boolean;
  fingerprint: string; // the guidance every agent reads, hashed
  guidance?: { surfaces: number; snapshot: string }; // what that hash covers, and where the text is at this commit
  definition: Definition; // success, stated before the run
  environment?: { node: string; vitest: string; claude: string; os: string };
  artifact?: { npmIntegrity: string | null; npmShasum: string | null; pluginCommit: string | null; note?: string }; // the bits that were tested
  mode: 'free'; // sample provider, no key, no TypeSafe spend; a paid mode needs explicit approval and does not exist yet
  trialsOverride: number | null;
  formal: boolean; // counts toward the release gate
  formalReason: string; // why it does or does not
  backfilled?: boolean;
}

export interface FinishedRecord {
  kind: 'ceremony';
  phase: 'finished' | 'aborted';
  schema?: number;
  prev?: string;
  startedId: string;
  ts: string;
  passed: boolean;
  reason?: string; // aborted: why
  level1?: Array<{ name: string; ok: boolean; detail: string }>;
  level2?: Array<{ id: string; level: string; pass: boolean }>;
  level3?: Array<{ id: string; route: string; model: string; resolvedModel?: string | null; trial: number; pass: boolean; failed: string[]; attempts: number[]; firstRequestAccepted: boolean; mm3Calls: number; transcript: string; transcriptSha256?: string }>;
  firstRequestAcceptedRate?: number;
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; turns: number; claudeRuns: number; mm3Calls: number }; // what the run asked of the model
  notionalCostUsd?: number; // legacy: the first two lines recorded a dollar figure; a subscription has no per-call price, so new lines record usage instead
}

export type LedgerRecord = StartedRecord | FinishedRecord;

export const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

/** One readable sentence for a person: what this run was set to prove. */
export function plainDefinition(d: Pick<Definition, 'scenarios' | 'rules' | 'fixture'>): string {
  const r = d.rules as { gateModel?: string; floorModel?: string; mustPassTrials?: number; trialsPerScenario?: number; attemptsToVerdict?: number; firstAttemptTarget?: number };
  const routes = new Set(d.scenarios.flatMap((s) => s.routes));
  return `${d.scenarios.length} scenarios (${d.scenarios.map((s) => s.id).join(', ')}) on OWASP Juice Shop ${d.fixture.tag}, over the ${[...routes].join(' and ')} route${routes.size > 1 ? 's' : ''}; ${r.gateModel ?? '?'} must pass ${r.mustPassTrials ?? '?'} of ${r.trialsPerScenario ?? '?'} trials of each, ${r.floorModel ?? '?'} is reported but does not gate; every agent must get a verdict within its promised verb requests (${[...new Set(d.scenarios.map((s) => s.promise))].join('/')}); first-request target ${Math.round((r.firstAttemptTarget ?? 0) * 100)}%; sample provider, no key, no spend`;
}

/** Success as the scenario file, the checkpoint registry and the fixture pin state it now. The hash covers all of it: a changed prompt, model, route, checkpoint, rule or pin changes the hash. */
export function definitionOf(spec: Spec, fixture: { tag: string; sha: string } = { tag: '?', sha: '?' }): Definition {
  const scenarios = spec.full.map((s) => ({ id: s.id, goal: s.goal, prompt: s.prompt, model: s.model, routes: s.routes, helpers: s.helpers ?? 0, promise: s.promise, checkpoints: s.checkpoints.map((c) => ({ id: c, text: CHECKPOINTS[c]?.text ?? `UNKNOWN ${c}` })) }));
  const body = { scenarios, rules: spec.rules, preconditions: spec.preconditions ?? [], fixture, context: spec.context ?? [] };
  return { hash: sha(JSON.stringify(body)), plain: plainDefinition({ scenarios, rules: spec.rules, fixture }), ...body };
}

const lines = (file: string): string[] => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []);

export const readLedger = (file = LEDGER): LedgerRecord[] => lines(file).map((l) => JSON.parse(l) as LedgerRecord);

export const nextId = (records: LedgerRecord[]): string => `CER-${String(records.filter((r) => r.phase === 'started').length + 1).padStart(4, '0')}`;

/** Appends a record, stamping the schema and the hash of the line before it. */
export function append(r: LedgerRecord, file = LEDGER): void {
  const all = lines(file);
  const prev = all.length ? sha(all[all.length - 1]!) : 'genesis';
  appendFileSync(file, `${JSON.stringify({ ...r, schema: r.schema ?? SCHEMA, prev: r.prev ?? prev })}\n`);
}

/** undefined when the chain is intact; otherwise what broke. Lines written before the schema existed are exempt but still feed the next line's hash. */
export function chainProblem(file = LEDGER): string | undefined {
  const all = lines(file);
  for (let i = 0; i < all.length; i++) {
    const r = JSON.parse(all[i]!) as LedgerRecord;
    if (r.schema === undefined) continue;
    const want = i === 0 ? 'genesis' : sha(all[i - 1]!);
    if (r.prev !== want) return `✖ ledger: line ${i + 1} does not follow line ${i} (a line before it was edited, removed or reordered) → restore ${file} from git`;
  }
  return undefined;
}

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

/** What changed between two runs, in words: the build, the guidance, the definition of success, and the results. */
export function compareRuns(a: { started: StartedRecord; finished?: FinishedRecord }, b: { started: StartedRecord; finished?: FinishedRecord }): string[] {
  const out: string[] = [`${a.started.id} (${a.started.version}) → ${b.started.id} (${b.started.version})`];
  out.push(a.started.head === b.started.head ? `code: same commit ${a.started.head.slice(0, 7)}` : `code: ${a.started.head.slice(0, 7)} → ${b.started.head.slice(0, 7)} (git diff ${a.started.head.slice(0, 7)} ${b.started.head.slice(0, 7)} --stat)`);
  out.push(a.started.fingerprint === b.started.fingerprint ? 'guidance: unchanged' : `guidance: CHANGED (${a.started.fingerprint.slice(0, 12)} → ${b.started.fingerprint.slice(0, 12)}; see test/golden/guidance/surfaces.txt between those commits)`);
  if (a.started.definition.hash === b.started.definition.hash) out.push('definition of success: unchanged');
  else {
    const was = new Map(a.started.definition.scenarios.map((s) => [s.id, s]));
    const notes = b.started.definition.scenarios.flatMap((s) => {
      const o = was.get(s.id);
      if (!o) return [`new scenario ${s.id}`];
      // a field the older record never stored cannot be compared: say so instead of calling it changed
      const diff = (k: 'prompt' | 'model' | 'routes' | 'promise' | 'checkpoints'): string[] => (o[k] === undefined ? [`${s.id}: ${k} was not recorded in the older run`] : JSON.stringify(o[k]) !== JSON.stringify(s[k]) ? [`${s.id}: ${k} changed`] : []);
      return (['prompt', 'model', 'routes', 'promise', 'checkpoints'] as const).flatMap(diff);
    });
    out.push(`definition of success: CHANGED${notes.length ? ` (${notes.join('; ')})` : ' (rules, pin or context)'}`);
  }
  const l3 = (r: { started: StartedRecord; finished?: FinishedRecord }): string => {
    const gate = (r.started.definition.rules as { gateModel?: string }).gateModel;
    const rows = (r.finished?.level3 ?? []).filter((x) => x.model === gate);
    return rows.length ? `${rows.filter((x) => x.pass).length}/${rows.length}` : '-';
  };
  out.push(`level 3 gate-model trials passed: ${l3(a)} → ${l3(b)}`);
  const fr = (r: { finished?: FinishedRecord }): string => (r.finished?.firstRequestAcceptedRate === undefined ? '-' : `${Math.round(r.finished.firstRequestAcceptedRate * 100)}%`);
  out.push(`first request accepted: ${fr(a)} → ${fr(b)}`);
  const l2 = (r: { finished?: FinishedRecord }): string => (r.finished?.level2 ? `${r.finished.level2.filter((x) => x.pass).length}/${r.finished.level2.length}` : '-');
  const tok = (r: { finished?: FinishedRecord }): string => (r.finished?.usage ? `${r.finished.usage.inputTokens + r.finished.usage.cacheReadTokens + r.finished.usage.cacheCreationTokens} in / ${r.finished.usage.outputTokens} out, ${r.finished.usage.turns} turns, ${r.finished.usage.mm3Calls} MM3 calls` : 'not recorded');
  out.push(`usage: ${tok(a)} → ${tok(b)}`);
  out.push(`level 2 context test passed: ${l2(a)} → ${l2(b)}`);
  const cells = (r: { finished?: FinishedRecord }): Map<string, string> => {
    const m = new Map<string, { p: number; t: number }>();
    for (const x of r.finished?.level3 ?? []) {
      const k = `${x.id} · ${x.route} · ${x.model}`;
      const c = m.get(k) ?? { p: 0, t: 0 };
      m.set(k, { p: c.p + (x.pass ? 1 : 0), t: c.t + 1 });
    }
    return new Map([...m].map(([k, v]) => [k, `${v.p}/${v.t}`]));
  };
  const ca = cells(a);
  const cb = cells(b);
  for (const k of new Set([...ca.keys(), ...cb.keys()])) if (ca.get(k) !== cb.get(k)) out.push(`  ${k}: ${ca.get(k) ?? '-'} → ${cb.get(k) ?? '-'}`);
  return out;
}

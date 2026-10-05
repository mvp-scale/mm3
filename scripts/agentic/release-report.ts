// `npm run agentic:release-report -- [CER-0002] [--row <scenario>/<route>/<model>/<trial>]`: the agentic release report. It reads
// one ceremony run back from the ledger, step by step, the way a person approving a release needs to read it. Each step says what it had to prove, whether it did, and what it used. With --row, one
// level 3 trial is told call by call: the tokens the model started with, what each call added, each MM3 call marked as a
// sample-provider call (no live call, no key). The ledger holds the run; a transcript, when it is still on this machine and
// its digest matches the ledger's, supplies the call-by-call detail. A pure function builds the text so it can be tested.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { ClaudeCall, TurnUsage } from './claude.ts';
import { chainProblem, readLedger, recordGaps, type FinishedRecord, type LedgerRecord, type StartedRecord } from './ledger.ts';
import { approxTokens, economicsLine, kindOf } from './trace.ts';

type Row = NonNullable<FinishedRecord['level3']>[number];
export interface Transcript {
  text: string; // the raw file, to check its digest
  calls: ClaudeCall[];
  turns?: TurnUsage[];
}

const tok = (n: number): string => n.toLocaleString('en-US');
const verb = (c: ClaudeCall): string => (Array.isArray(c.input.args) ? `mm3 ${(c.input.args as unknown[]).join(' ')}` : c.tool === 'Bash' ? String(c.input.command ?? '').replace(/\s+/gu, ' ').slice(0, 70) : `${c.tool} ${JSON.stringify(c.input).slice(0, 60)}`);

/** One level 3 trial, told from the first token to the last. */
export function tellRow(started: StartedRecord, row: Row, load: (file: string) => Transcript | undefined): string[] {
  const sc = started.definition.scenarios.find((s) => s.id === row.id);
  const out: string[] = [`${row.id} · ${row.route} route · ${row.model}${row.resolvedModel ? ` (${row.resolvedModel})` : ''} · trial ${row.trial} · ${row.pass ? 'PASSED' : 'FAILED'}`];
  if (sc) out.push(`  goal: ${sc.goal}`, `  task given to the agent (nothing else): ${sc.prompt.replace(/\s+/gu, ' ').slice(0, 160)}`);
  out.push('  criteria, stated before the run:');
  for (const c of sc?.checkpoints ?? []) out.push(`    ${row.failed.includes(c.id) ? '✖' : '✔'} ${c.text}`);
  const t = load(row.transcript);
  if (!t) return [...out, `  call by call: the transcript ${row.transcript || '(none)'} is not on this machine; the ledger's summary above and the totals below are what was recorded`, ...totals(row)];
  const verified = row.transcriptSha256 === undefined ? 'no digest was recorded' : createHash('sha256').update(t.text).digest('hex') === row.transcriptSha256 ? 'digest matches the ledger' : 'DIGEST DOES NOT MATCH THE LEDGER: this file is not the one that was recorded';
  out.push(`  call by call (${verified}; the provider was the sample one: MM3 calls are canned answers, no live call, no spend):`);
  const lead = (t.turns ?? []).filter((x) => x.agent === 'lead');
  if (lead[0]) out.push(`    start: the model began with ${tok(lead[0].inputTokens + lead[0].cacheReadTokens + lead[0].cacheCreationTokens)} tokens of context (system prompt, tools and the task)`);
  let n = 0;
  for (const c of t.calls) {
    n += 1;
    const turn = (t.turns ?? []).find((x) => x.turn === c.turn);
    const ctx = turn ? turn.inputTokens + turn.cacheReadTokens + turn.cacheCreationTokens : undefined;
    const isMm3 = kindOf(c) === 'mm3';
    const stopped = /^✖|Exit code [1-9]|✖ /u.test(c.result.trimStart().slice(0, 200)) && isMm3;
    const got = isMm3 ? (/\bgate: (pass|fail|unsure)/u.test(c.result) ? `verdict ${/id: (MM3-\d+)/u.exec(c.result)?.[1] ?? ''} recorded` : stopped ? `a stop: ${c.result.replace(/\s+/gu, ' ').trim().slice(0, 70)}` : 'answered') : 'ok';
    out.push(`    ${String(n).padStart(2)}. ${c.parent ? 'helper' : 'lead  '} ${isMm3 ? 'MM3 call' : kindOf(c).padEnd(8)} ${verb(c).slice(0, 56).padEnd(56)} wrote ≈${approxTokens(JSON.stringify(c.input))}, ${got}, ≈${tok(approxTokens(c.result))} came back${ctx !== undefined ? ` · context then ${tok(ctx)}` : ''}`);
  }
  return [...out, ...totals(row), row.economics ? `  by kind: ${economicsLine(row.economics)}` : '  by kind: not recorded'];
}

function totals(row: Row): string[] {
  const u = row.usage;
  return [u ? `  totals (exact, from the run's own usage): ${tok(u.inputTokens + u.cacheReadTokens + u.cacheCreationTokens)} tokens in, ${tok(u.outputTokens)} out, ${u.turns} model turns, ${row.mm3Calls} MM3 calls` : `  totals: tokens not recorded for this run; ${row.mm3Calls} MM3 calls`, `  attempts to a verdict, per agent: ${JSON.stringify(row.attempts)} · first request accepted: ${row.firstRequestAccepted ? 'yes' : 'no'}`];
}

/** A whole run, reported in five steps, each with its criteria and its result. */
export function tellRun(records: LedgerRecord[], id: string | undefined, rowKey: string | undefined, load: (file: string) => Transcript | undefined = () => undefined): string[] {
  const starts = records.filter((r): r is StartedRecord => r.phase === 'started');
  const started = id ? starts.find((s) => s.id === id) : starts[starts.length - 1];
  if (!started) return [id ? `✖ release report: no run ${id} in the ledger → npm run agentic:runs lists them` : '✖ release report: the ledger has no runs yet → npm run ceremony -- --version <exact version>'];
  const end = records.find((r): r is FinishedRecord => r.phase !== 'started' && r.startedId === started.id);
  if (rowKey) {
    const [sid, route, model, trial] = rowKey.split('/');
    const row = end?.level3?.find((r) => r.id === sid && r.route === route && r.model === model && String(r.trial) === trial);
    return row ? tellRow(started, row, load) : [`✖ release report: no level 3 row ${rowKey} in ${started.id} → rows look like B1-class-a-file/mcp/sonnet/1`];
  }
  const gaps = recordGaps(started, end);
  const out: string[] = [
    `AGENTIC RELEASE REPORT · ${started.id} · ${started.version} · ${started.formal ? 'a FORMAL run' : 'NOT formal'} · ${end ? (end.phase === 'aborted' ? `ABORTED (${end.reason})` : end.passed ? 'PASSED' : 'FAILED') : 'INCOMPLETE (it never closed)'}`,
    `  ${started.formal ? 'counts toward the release gate' : `recorded, does not count toward the release gate: ${started.formalReason}`}`,
    `  record check: ${started.schema === undefined ? 'recorded before the schema existed (backfilled): not checked, and it cannot bless a release' : gaps.length === 0 ? 'complete: every field a release decision needs was captured' : `${gaps.length} thing(s) not captured: ${gaps.join('; ')}`}`, '',
    `STEP 1 · what was to be proven, stated before anything ran (recorded ${started.ts.slice(0, 16)}Z, definition ${started.definition.hash.slice(0, 12)})`,
    `  ${started.definition.plain}`,
    `  commit tested ${started.head.slice(0, 7)} · guidance ${started.fingerprint.slice(0, 12)}${started.guidance ? ` (${started.guidance.surfaces} surfaces)` : ''}${started.environment ? ` · node ${started.environment.node} · ${started.environment.claude}` : ''}`,
    ...(started.artifact?.npmIntegrity ? [`  tested artifact: npm ${started.artifact.npmIntegrity.slice(0, 22)}…`] : []),
    '',
  ];
  if (!end) return [...out, '  nothing further was recorded: the run did not close.'];
  out.push(`STEP 2 · level 1, the free checks: ${end.level1?.filter((r) => r.ok).length ?? 0} of ${end.level1?.length ?? 0} met their criterion`);
  for (const r of end.level1 ?? []) out.push(`  ${r.ok ? '✔' : '✖'} ${r.name}: ${r.detail}`);
  const l2 = end.level2 ?? [];
  out.push('', `STEP 3 · level 2, the context test (next step from text alone; recorded, does not gate): ${l2.filter((r) => r.pass).length} of ${l2.length} right`);
  for (const lv of ['none', 'some', 'detailed']) out.push(`  knowledge ${lv.padEnd(8)}: ${l2.filter((r) => r.level === lv && r.pass).length} of ${l2.filter((r) => r.level === lv).length}`);
  const l3 = end.level3 ?? [];
  out.push('', `STEP 4 · level 3, real agents on the pinned project with the sample provider: ${l3.filter((r) => r.pass).length} of ${l3.length} trials met every criterion`);
  for (const r of l3) {
    const sc = started.definition.scenarios.find((s) => s.id === r.id);
    const of = sc?.checkpoints.length ?? 0;
    out.push(`  ${r.pass ? '✔' : '✖'} ${r.id} · ${r.route} · ${r.model} · trial ${r.trial}: ${of - r.failed.length} of ${of} criteria${r.failed.length ? ` (missed: ${r.failed.join(', ')})` : ''} · attempts ${JSON.stringify(r.attempts)} · ${r.usage ? `${tok(r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.cacheCreationTokens)} in / ${tok(r.usage.outputTokens)} out` : 'tokens not recorded'} · ${r.mm3Calls} MM3 calls  → --row ${r.id}/${r.route}/${r.model}/${r.trial}`);
  }
  const rate = end.firstRequestAcceptedRate;
  out.push('', `STEP 5 · the gate: ${end.passed ? 'PASS' : 'FAIL'}${rate === undefined ? '' : ` · first request accepted in ${Math.round(rate * 100)}% of gate trials`}`, `  ${started.formal ? 'the release gate reads this run' : 'the release gate ignores this run (not formal)'}`);
  return out;
}

if (process.argv[1]?.endsWith('release-report.ts')) {
  const args = process.argv.slice(2);
  const rowAt = args.indexOf('--row');
  const id = args.find((a) => /^CER-\d+$/u.test(a));
  const broken = chainProblem();
  if (broken) console.log(broken);
  const load = (file: string): Transcript | undefined => {
    const p = `lab/archive/agentic/${file}`;
    if (!file || !existsSync(p)) return undefined;
    const text = readFileSync(p, 'utf8');
    const j = JSON.parse(text) as { calls: ClaudeCall[]; turns?: TurnUsage[] };
    return { text, calls: j.calls, ...(j.turns ? { turns: j.turns } : {}) };
  };
  console.log(tellRun(readLedger(), id, rowAt >= 0 ? args[rowAt + 1] : undefined, load).join('\n'));
}

// `npm run agentic:release-report -- [CER-0002] [--row <scenario>/<route>/<model>/<trial>]`: the agentic release report. It reads
// one ceremony run back from the ledger, step by step, the way a person approving a release needs to read it. Each step says what it had to prove, whether it did, and what it used. With --row, one
// level 3 trial is told call by call: the tokens the model started with, what each call added, each MM3 call marked as a
// sample-provider call (no live call, no key). The ledger holds the run; a transcript, when it is still on this machine and
// its digest matches the ledger's, supplies the call-by-call detail. A pure function builds the text so it can be tested.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { ClaudeCall, TurnUsage } from './claude.ts';
import { chainProblem, readLedger, recordGaps, type FinishedRecord, type LedgerRecord, type StartedRecord } from './ledger.ts';
import { CHECKPOINTS } from './checkpoints.ts';
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

/** Wraps a long sentence to the screen, indenting the continuation lines under the first. */
const wrap = (label: string, text: string, width = 104): string[] => {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    if ((cur + ' ' + w).length > width - label.length && cur) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  lines.push(cur);
  return lines.map((l, i) => (i === 0 ? `${label}${l}` : `${' '.repeat(label.length)}${l}`));
};

const kfmt = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const BARS = '▁▂▃▄▅▆▇█';
/** The context the lead carried at each of its turns, as a row of bars scaled to the biggest in the run. */
const path = (t: Transcript | undefined, max: number): string => {
  const lead = (t?.turns ?? []).filter((x) => x.agent === 'lead').map((x) => x.inputTokens + x.cacheReadTokens + x.cacheCreationTokens);
  const picks = lead.length > 14 ? Array.from({ length: 14 }, (_, i) => lead[Math.round((i * (lead.length - 1)) / 13)]!) : lead;
  return picks.map((v) => BARS[Math.min(BARS.length - 1, Math.floor((v / Math.max(max, 1)) * BARS.length))]).join('');
};

/** A whole run on one screen: the verdict, the five steps with their criteria matrix, the tokens, and the record's integrity. */
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
  const rules = started.definition.rules as { gateModel?: string };
  const status = end ? (end.phase === 'aborted' ? `ABORTED (${end.reason})` : end.passed ? 'PASSED' : 'FAILED') : 'INCOMPLETE';
  const l1 = end?.level1 ?? [];
  const l2 = end?.level2 ?? [];
  const l3 = end?.level3 ?? [];
  const gate = l3.filter((r) => r.model === rules.gateModel);
  const floor = l3.filter((r) => r.model !== rules.gateModel);
  const sum = (rows: Row[]): string => `${rows.filter((r) => r.pass).length}/${rows.length}`;
  const out: string[] = [
    `AGENTIC RELEASE REPORT  ${started.id}  ${status} · ${started.formal ? 'FORMAL: the release gate reads it' : 'NOT FORMAL: the release gate ignores it'}`,
    `version   ${started.version}`,
    `code      built from ${started.versionCommit ?? '?'}, ran from ${started.head.slice(0, 7)}${started.formal ? '' : `   (not formal: ${[...(started.versionCommit && started.head.startsWith(started.versionCommit) ? [] : ["checkout is not the build's commit"]), ...(started.dirty ? ['uncommitted changes'] : []), ...(started.trialsOverride !== null ? [`${started.trialsOverride} trial each`] : [])].join('; ') || started.formalReason})`}`,
    ...wrap('proven    ', started.definition.plain),
    `record    ${started.schema === undefined ? 'old format, not checked' : gaps.length === 0 ? 'complete' : `${gaps.length} thing(s) not captured`} · chain ${chainProblem() ? 'BROKEN' : 'intact'} · guidance ${started.fingerprint.slice(0, 8)} · definition ${started.definition.hash.slice(0, 8)} · stated ${started.ts.slice(0, 16)}Z, before the run`,
    '',
  ];
  if (!end) return [...out, 'nothing further was recorded: the run never closed.'];
  out.push(`1 PROVEN    ${started.definition.scenarios.length} scenarios, success defined before anything ran`);
  out.push(`2 FREE      ${l1.filter((r) => r.ok).length}/${l1.length}   ${l1.map((r) => `${r.ok ? '✔' : '✖'} ${r.name.split(',')[0]!.replace('unit', 'tests').replace('CLI end to end', 'e2e')} ${/\d[\d,]*(\/\d+)?/u.exec(r.detail)?.[0] ?? ''}`.trim()).join(' · ')}`);
  out.push(`3 CONTEXT   ${(['none', 'some', 'detailed'] as const).map((lv) => `${lv === 'some' ? 'instructions' : lv === 'detailed' ? '+cards' : 'none'} ${l2.filter((r) => r.level === lv && r.pass).length}/${l2.filter((r) => r.level === lv).length}`).join(' · ')}   (next step from text alone; not gated)`);
  out.push(`4 AGENTS    ${rules.gateModel ?? 'gate model'} ${sum(gate)} ${gate.every((r) => r.pass) ? '✔' : '✖'}   floor ${sum(floor)} (reported, not gated)   sample provider: no live call`);
  const max = Math.max(1, ...l3.flatMap((r) => (load(r.transcript)?.turns ?? []).map((x) => x.inputTokens + x.cacheReadTokens + x.cacheCreationTokens)));
  for (const sc of started.definition.scenarios) {
    out.push('', `  ${sc.id}: ${sc.goal}`, `  ${sc.checkpoints.map((c) => `${CHECKPOINTS[c.id]?.short ?? '?'} ${CHECKPOINTS[c.id]?.label ?? c.id}`).join(' · ')}`);
    out.push(`  ${'route'.padEnd(5)} ${'model'.padEnd(7)} ${sc.checkpoints.map((c) => CHECKPOINTS[c.id]?.short ?? '?').join(' ')}   ${'tries'.padEnd(9)} ${'tokens in/out'.padEnd(13)} calls  context path`);
    for (const r of l3.filter((x) => x.id === sc.id)) {
      const mark = sc.checkpoints.map((c) => (r.failed.includes(c.id) ? '✖' : '✔')).join(' ');
      const tokens = r.usage ? `${kfmt(r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.cacheCreationTokens)}/${kfmt(r.usage.outputTokens)}` : '-';
      out.push(`  ${r.route.padEnd(5)} ${(r.model + (r.model === rules.gateModel ? '' : '*')).padEnd(7)} ${mark}   ${JSON.stringify(r.attempts).padEnd(9)} ${tokens.padEnd(13)} ${String(r.mm3Calls).padStart(3)}    ${path(load(r.transcript), max)}`);
    }
  }
  const eco = Object.entries(l3.reduce<Record<string, { c: number; b: number }>>((a, r) => { for (const [k, v] of Object.entries(r.economics ?? {})) { const e = (a[k] ??= { c: 0, b: 0 }); e.c += v.calls; e.b += v.resultTokens; } return a; }, {})).filter(([, v]) => v.c > 0);
  const u = end.usage;
  out.push('', `5 GATE      ${end.passed ? 'PASS' : 'FAIL'} · first request accepted ${Math.round((end.firstRequestAcceptedRate ?? 0) * 100)}% of ${rules.gateModel ?? 'gate'} trials (target 80%)`);
  out.push(`TOKENS      ${u ? `${u.claudeRuns} runs · ${u.turns} turns · ${kfmt(u.inputTokens + u.cacheReadTokens + u.cacheCreationTokens)} in · ${kfmt(u.outputTokens)} out · ${u.mm3Calls} MM3 calls` : 'not recorded'}${eco.length ? `   by kind (calls ≈tokens back): ${eco.map(([k, v]) => `${k} ${v.c} ≈${kfmt(v.b)}`).join(' · ')}` : ''}`);
  const bad = l3.find((r) => !r.pass && r.model === rules.gateModel) ?? l3.find((r) => !r.pass);
  out.push(`READ MORE   ${'--row '}${(bad ?? l3[0])?.id}/${(bad ?? l3[0])?.route}/${(bad ?? l3[0])?.model}/${(bad ?? l3[0])?.trial}  tells one trial call by call${bad ? '  (a missed one)' : ''}`);
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

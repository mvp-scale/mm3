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
import { decide } from './decision.ts';
import { addRecovery, approxTokens, economicsLine, kindOf, recoveryOf, type Recovery } from './trace.ts';

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

export interface Names {
  purpose?: string;
  notTested?: string[];
  scenarios: Record<string, { title?: string; story?: string; success?: string; matters?: string }>;
}

/** What went wrong, in the checkpoints' own words, once each. */
const wrong = (rows: Row[]): string[] => [...new Set(rows.flatMap((r) => r.failed.map((f) => CHECKPOINTS[f]?.means ?? f)))];
const tries = (rows: Row[]): string => rows.flatMap((r) => r.attempts).map((a) => (a === 0 ? 'never' : String(a))).join(', ');

/** A whole run, plain words first: the question, the jobs and how each went, what it means for the release; then the data. */
export function tellRun(records: LedgerRecord[], id: string | undefined, rowKey: string | undefined, load: (file: string) => Transcript | undefined = () => undefined, names?: Names): string[] {
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
  const rules = started.definition.rules as { gateModel?: string; floorModel?: string };
  const gateName = rules.gateModel ?? 'the gate model';
  const l1 = end?.level1 ?? [];
  const l2 = end?.level2 ?? [];
  const l3 = end?.level3 ?? [];
  const gate = l3.filter((r) => r.model === rules.gateModel);
  const floor = l3.filter((r) => r.model !== rules.gateModel);
  const recOf = (rows: Row[]): Recovery | undefined => {
    const parts = rows.map((r) => r.recovery ?? (load(r.transcript) ? recoveryOf(load(r.transcript)!.calls) : undefined));
    return parts.length && parts.every((p) => p) ? (parts as Recovery[]).reduce(addRecovery, { stops: 0, onTrack: 0, fixedNext: 0 }) : undefined;
  };
  const decision = decide(started, end, { chainOk: !chainProblem(), gaps, ...(recOf(gate) ? { gateRecovery: recOf(gate)! } : {}) });
  const sum = (rows: Row[]): string => `${rows.filter((r) => r.pass).length}/${rows.length}`;
  const h = (sc: StartedRecord['definition']['scenarios'][number]) => ({ title: sc.title ?? names?.scenarios[sc.id]?.title ?? sc.id, story: sc.story ?? names?.scenarios[sc.id]?.story, success: sc.success ?? names?.scenarios[sc.id]?.success, matters: sc.matters ?? names?.scenarios[sc.id]?.matters });
  const purpose = started.definition.purpose ?? names?.purpose;
  const notTested = started.definition.notTested ?? names?.notTested ?? [];
  const status = end ? (end.phase === 'aborted' ? `ABORTED (${end.reason})` : end.passed ? 'PASSED' : 'FAILED') : 'INCOMPLETE';
  const out: string[] = [
    `AGENTIC RELEASE REPORT · ${started.id} · MM3 ${started.version}`,
    `RESULT  ${status}${started.formal ? '' : ' · a REHEARSAL: recorded, but it does not count toward the release gate'}`,
    `DECISION  ${decision.headline}  (reasoning at the end)`,
    '',
    'WHAT THIS TESTS',
    ...(purpose ? wrap('  ', purpose, 100) : ['  (this run was recorded before the question was written down)']),
    '  Not covered here:',
    ...notTested.flatMap((t) => wrap('   - ', t, 100)),
    '',
  ];
  if (!end) return [...out, 'nothing further was recorded: the run never closed.'];
  out.push(`THE JOBS, AND HOW EACH WENT   (${gateName} decides; ${rules.floorModel ?? 'the smaller model'} runs once for comparison, marked *)`);
  started.definition.scenarios.forEach((sc, i) => {
    const t = h(sc);
    const g = gate.filter((r) => r.id === sc.id);
    const f = floor.filter((r) => r.id === sc.id);
    out.push('', `  ${i + 1}. ${t.title}`, ...(t.story ? wrap('     ', t.story, 100) : []), ...(t.success ? wrap('     Success: ', t.success, 100) : []));
    out.push(`     Result: ${gateName} ${sum(g)} ${g.every((r) => r.pass) ? '✔' : '✖'} (tries ${tries(g)} · ${g.map((r) => r.route).join('/')})   ${rules.floorModel ?? 'smaller'}* ${sum(f)} (tries ${tries(f)})`);
    for (const m of wrong(g)) out.push(...wrap('       ✖ ', `${gateName}: ${m}`, 100));
    if (t.matters) out.push(...wrap('     Why it matters: ', t.matters, 100));
  });
  const rate = Math.round((end.firstRequestAcceptedRate ?? 0) * 100);
  out.push('', 'WHAT THIS MEANS FOR THE RELEASE');
  out.push(...wrap('  - ', gate.every((r) => r.pass) ? `${gateName}, the model that decides, completed every job on every route. Agents can get MM3 ${started.version.split('-')[0]} to work.` : `${gateName}, the model that decides, missed at least one job (marked ✖ above). That blocks the release until it is understood.`, 100));
  out.push(...wrap('  - ', `The agent's first request to MM3 was accepted ${rate}% of the time (target 80%). ${rate < 80 ? 'Agents usually needed a retry, so the instructions and error messages still cost them effort.' : 'The instructions work.'}`, 100));
  if (floor.length) out.push(...wrap('  - ', `${rules.floorModel ?? 'The smaller model'} passed ${sum(floor)}. It is a floor, not a gate: it shows how forgiving MM3 is to a weaker agent.`, 100));
  const rg = recOf(gate);
  const rf = recOf(floor);
  const recText = (x: Recovery | undefined): string => (x ? (x.stops === 0 ? 'hit no stops' : `after ${x.stops} stop(s) stayed on MM3 ${x.onTrack} time(s) and got a verdict on the next MM3 request ${x.fixedNext} time(s)`) : 'recovery not measurable for this run');
  out.push(...wrap('  - ', `Recovery, the test of a good error message: ${gateName} ${recText(rg)}.${rf ? ` ${rules.floorModel ?? 'The smaller model'}* ${recText(rf)}.` : ''} The goal is every stop followed by MM3 and fixed on the next request.`, 100));
  out.push(...wrap('  - ', started.formal ? 'This is a formal run: the release gate reads it.' : 'This is a rehearsal: it ran from a checkout that is not the published build\'s own commit, with one trial per job. A formal run on the published commit is still needed.', 100));
  out.push(...wrap('  - ', 'It does not say the 0.1.2 features work or that MM3\'s verdicts are right (see "Not covered here").', 100));

  const max = Math.max(1, ...l3.flatMap((r) => (load(r.transcript)?.turns ?? []).map((x) => x.inputTokens + x.cacheReadTokens + x.cacheCreationTokens)));
  out.push('', 'THE DATA   (the whole definition of success is in the ledger line that was written before the run)');
  out.push(`  free checks ${l1.filter((r) => r.ok).length}/${l1.length}: ${l1.map((r) => `${r.ok ? '✔' : '✖'} ${r.name.split(',')[0]!.replace('unit', 'tests').replace('CLI end to end', 'e2e')} ${/\d[\d,]*(\/\d+)?/u.exec(r.detail)?.[0] ?? ''}`.trim()).join(' · ')}`);
  out.push(`  context test (next step from text alone, not gated): ${(['none', 'some', 'detailed'] as const).map((lv) => `${lv === 'some' ? 'with instructions' : lv === 'detailed' ? 'with cards too' : 'no guidance'} ${l2.filter((r) => r.level === lv && r.pass).length}/${l2.filter((r) => r.level === lv).length}`).join(' · ')}`);
  for (const sc of started.definition.scenarios) {
    out.push('', `  ${h(sc).title} (${sc.id})`, `  ${sc.checkpoints.map((c) => `${CHECKPOINTS[c.id]?.short ?? '?'} ${CHECKPOINTS[c.id]?.label ?? c.id}${CHECKPOINTS[c.id]?.severity === 'exception' ? ' (exception-level)' : ''}`).join(' · ')}`);
    out.push(`  ${'route'.padEnd(5)} ${'model'.padEnd(7)} ${sc.checkpoints.map((c) => CHECKPOINTS[c.id]?.short ?? '?').join(' ')}   ${'tries'.padEnd(9)} ${'tokens in/out'.padEnd(13)} calls  context path`);
    for (const r of l3.filter((x) => x.id === sc.id)) {
      const mark = sc.checkpoints.map((c) => (r.failed.includes(c.id) ? '✖' : '✔')).join(' ');
      const tokens = r.usage ? `${kfmt(r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.cacheCreationTokens)}/${kfmt(r.usage.outputTokens)}` : '-';
      out.push(`  ${r.route.padEnd(5)} ${(r.model + (r.model === rules.gateModel ? '' : '*')).padEnd(7)} ${mark}   ${JSON.stringify(r.attempts).padEnd(9)} ${tokens.padEnd(13)} ${String(r.mm3Calls).padStart(3)}    ${path(load(r.transcript), max)}`);
    }
  }
  const eco = Object.entries(l3.reduce<Record<string, { c: number; b: number }>>((a, r) => { for (const [k, v] of Object.entries(r.economics ?? {})) { const e = (a[k] ??= { c: 0, b: 0 }); e.c += v.calls; e.b += v.resultTokens; } return a; }, {})).filter(([, v]) => v.c > 0);
  const u = end.usage;
  const ecoText = eco.length ? ` · by kind of call (calls ≈tokens back): ${eco.map(([k, v]) => `${k} ${v.c} ≈${kfmt(v.b)}`).join(' · ')}` : '';
  const tokenText = u ? `${u.claudeRuns} agent runs · ${u.turns} turns · ${kfmt(u.inputTokens + u.cacheReadTokens + u.cacheCreationTokens)} in · ${kfmt(u.outputTokens)} out · ${u.mm3Calls} MM3 calls` : 'not recorded';
  out.push('', ...wrap('  tokens: ', `${tokenText}${ecoText}`, 110));
  const recordText = started.schema === undefined ? 'old format, not checked' : gaps.length === 0 ? 'complete' : `${gaps.length} thing(s) not captured`;
  out.push(...wrap('  record: ', `${recordText} · chain ${chainProblem() ? 'BROKEN' : 'intact'} · version ${started.version} built from ${started.versionCommit ?? '?'}, ran from ${started.head.slice(0, 7)} · guidance ${started.fingerprint.slice(0, 8)} · definition ${started.definition.hash.slice(0, 8)} stated ${started.ts.slice(0, 16)}Z, before the run`, 110));
  const bad = l3.find((r) => !r.pass && r.model === rules.gateModel) ?? l3.find((r) => !r.pass);
  out.push(`  one trial, call by call: npm run agentic:release-report -- ${started.id} --row ${(bad ?? l3[0])?.id}/${(bad ?? l3[0])?.route}/${(bad ?? l3[0])?.model}/${(bad ?? l3[0])?.trial}${bad ? '  (a missed one)' : ''}`);
  out.push('', 'DECISION', ...wrap('  ', decision.headline, 100));
  if (decision.blockers.length) out.push('  Because:', ...decision.blockers.flatMap((b) => wrap('   - ', b, 100)));
  if (decision.exceptions.length) {
    out.push('  Accepted for now, as exceptions:');
    for (const x of decision.exceptions) out.push(...wrap('   - ', `${x.id}: ${x.saw}`, 100), ...wrap('       fix: ', x.fix, 100));
  }
  if (!decision.blockers.length && !decision.exceptions.length) out.push('  Nothing blocks it and nothing is accepted as an exception.');
  out.push('', 'SELF-IMPROVEMENT   (recorded in the ledger whether or not it is accepted; npm run agentic:patterns shows what repeats)');
  if (!decision.improvements.length) out.push('  none seen in this run');
  decision.improvements.forEach((x, i) => out.push(...wrap(`  ${i + 1}. `, `[${x.themes.join(' · ')}] ${x.id} · ${x.models.join(', ')}: ${x.saw}`, 100), ...wrap('     try: ', x.fix, 100)));
  const byTheme = new Map<string, number>();
  for (const x of decision.improvements) for (const t of x.themes) byTheme.set(t, (byTheme.get(t) ?? 0) + 1);
  if (byTheme.size) out.push('', ...wrap('  GROUPED BY THEME: ', [...byTheme].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ×${n}`).join(' · '), 100));
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
  // a run recorded before titles existed is shown with the current scenario file's plain-language names
  const spec = JSON.parse(readFileSync('test/agentic/scenarios/baseline.json', 'utf8')) as { purpose?: string; notTested?: string[]; full: Array<{ id: string; title?: string; story?: string; success?: string; matters?: string }> };
  const names: Names = { ...(spec.purpose ? { purpose: spec.purpose } : {}), ...(spec.notTested ? { notTested: spec.notTested } : {}), scenarios: Object.fromEntries(spec.full.map((x) => [x.id, x])) };
  console.log(tellRun(readLedger(), id, rowAt >= 0 ? args[rowAt + 1] : undefined, load, names).join('\n'));
}

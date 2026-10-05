// The token economics of a run, by kind of call. A run's totals say how much it asked of the model; this says where it went:
// MM3 calls, shell commands, file reads, delegation. Per call it counts what the agent wrote (the arguments) and what came
// back into its context (the result), approximated as characters ÷ 4; per model turn it keeps the stream's own usage. The
// ledger stores the per-kind summary; the transcript holds every call; `npm run agentic:trace <transcript>` prints them.
import { readFileSync } from 'node:fs';
import type { ClaudeCall, TurnUsage } from './claude.ts';

export type Kind = 'mm3' | 'bash' | 'files' | 'agent' | 'other';
export const KINDS: readonly Kind[] = ['mm3', 'bash', 'files', 'agent', 'other'];

export interface KindStats {
  calls: number;
  argsTokens: number; // ≈ what the agent wrote
  resultTokens: number; // ≈ what came back into context
}
export type Economics = Record<Kind, KindStats>;

/** `mm3` run as a command (at the start of a command or after ; & | or env assignments), not merely named, as in `which mm3`. */
const RUNS_MM3 = /(?:^|[;&|]\s*|\n\s*)(?:\w+=\S+\s+)*(?:\S*\/)?mm3\s+[a-z-]/u;

export function kindOf(c: ClaudeCall): Kind {
  if (c.tool.includes('mm3') || (c.tool === 'Bash' && RUNS_MM3.test(String(c.input.command ?? '')))) return 'mm3';
  if (c.tool === 'Bash') return 'bash';
  if (c.tool === 'Agent' || /Handback/u.test(c.tool)) return 'agent';
  if (['Read', 'Glob', 'Grep', 'Write', 'Edit'].includes(c.tool)) return 'files';
  return 'other';
}

/** Characters ÷ 4, rounded up: an estimate, labelled as one wherever it is shown. */
export const approxTokens = (s: string): number => Math.ceil(s.length / 4);

export function economics(calls: ClaudeCall[]): Economics {
  const e = Object.fromEntries(KINDS.map((k) => [k, { calls: 0, argsTokens: 0, resultTokens: 0 }])) as Economics;
  for (const c of calls) {
    const k = e[kindOf(c)];
    k.calls += 1;
    k.argsTokens += approxTokens(JSON.stringify(c.input));
    k.resultTokens += approxTokens(c.result);
  }
  return e;
}

export const addEconomics = (a: Economics, b: Economics): Economics =>
  Object.fromEntries(KINDS.map((k) => [k, { calls: a[k].calls + b[k].calls, argsTokens: a[k].argsTokens + b[k].argsTokens, resultTokens: a[k].resultTokens + b[k].resultTokens }])) as Economics;

export const emptyEconomics = (): Economics => economics([]);

/** One line per kind that was used. */
export const economicsLine = (e: Economics): string =>
  KINDS.filter((k) => e[k].calls > 0).map((k) => `${k} ${e[k].calls} calls, ≈${e[k].argsTokens} tokens written, ≈${e[k].resultTokens} came back`).join(' · ') || 'no calls';

/** The call-by-call trace of one run, as a table. */
export function traceTable(calls: ClaudeCall[], turns: TurnUsage[]): string[] {
  const rows = ['#   turn  agent   kind   ≈written  ≈returned  call'];
  calls.forEach((c, i) => {
    const what = c.tool === 'Bash' ? `Bash ${String(c.input.command ?? '').replace(/\s+/gu, ' ').slice(0, 60)}` : Array.isArray(c.input.args) ? `${c.tool.replace('mcp__plugin_mm3_mm3__', '')} ${JSON.stringify(c.input.args)}` : `${c.tool} ${JSON.stringify(c.input).slice(0, 50)}`;
    rows.push(`${String(i + 1).padEnd(3)} ${String(c.turn ?? '-').padEnd(5)} ${(c.parent ? 'helper' : 'lead').padEnd(7)} ${kindOf(c).padEnd(6)} ${String(approxTokens(JSON.stringify(c.input))).padStart(8)}  ${String(approxTokens(c.result)).padStart(9)}  ${what.slice(0, 80)}`);
  });
  const t = turns.reduce((a, x) => ({ i: a.i + x.inputTokens + x.cacheReadTokens + x.cacheCreationTokens, o: a.o + x.outputTokens }), { i: 0, o: 0 });
  rows.push('', `${turns.length} model turns as the stream showed them (approximate): ≈${t.i} tokens in, ≈${t.o} out. The run's own totals, from modelUsage, are in the ledger.`);
  return rows;
}

if (process.argv[1]?.endsWith('trace.ts')) {
  const file = process.argv[2];
  if (!file) throw new Error('usage: npm run agentic:trace -- <transcript file under lab/archive/agentic>');
  const t = JSON.parse(readFileSync(file.includes('/') ? file : `lab/archive/agentic/${file}`, 'utf8')) as { calls: ClaudeCall[]; turns?: TurnUsage[] };
  console.log(traceTable(t.calls, t.turns ?? []).join('\n'));
  console.log(`\nby kind: ${economicsLine(economics(t.calls))}`);
}

// Level 2, the context test: no tools, no project. An agent (Haiku) is handed a situation and the text of MM3's own
// guidance at one of three knowledge levels, and asked only for its next step. The answer is graded against what the
// guidance is supposed to make an agent do. Same scenario at none / some / detailed shows what each carrier is worth,
// and re-running it after a guidance change shows whether the change helped or hurt. Cheap: a few short calls.
import { readFileSync } from 'node:fs';
import { runAgent } from '../../src/help/agent.ts';
import { MM3_GUIDANCE } from '../../src/help/guidance.ts';
import { runClaude } from './claude.ts';

export type Level = 'none' | 'some' | 'detailed';
export const LEVELS: readonly Level[] = ['none', 'some', 'detailed'];

export interface ContextScenario {
  id: string;
  situation: string;
  ask: string;
  expect: string[];
  note: string;
}

export interface ContextRow {
  id: string;
  level: Level;
  pass: boolean;
  answer: string;
  costUsd: number;
}

const BASE = 'You are a coding agent in a project. A tool named `mm3` is available (an MCP tool taking `args`, an array of strings, and optional `stdin`).';

/** What the agent has been told, by knowledge level: nothing, the MCP instructions, or those plus the delegate card and the class card. */
export function knowledge(level: Level): string {
  if (level === 'none') return BASE;
  if (level === 'some') return `${BASE}\n\nThe mm3 tool's instructions say:\n${MM3_GUIDANCE}`;
  return `${BASE}\n\nThe mm3 tool's instructions say:\n${MM3_GUIDANCE}\n\nThe card from \`mm3 agent delegate\`:\n${runAgent('delegate').text}\n\nThe card from \`mm3 agent class\`:\n${runAgent('class').text}`;
}

export const loadContextScenarios = (file = 'test/agentic/scenarios/baseline.json'): ContextScenario[] =>
  (JSON.parse(readFileSync(file, 'utf8')) as { context: ContextScenario[] }).context;

export function runContext(scenarios: ContextScenario[] = loadContextScenarios(), model: 'haiku' | 'sonnet' = 'haiku', log: (s: string) => void = () => undefined): ContextRow[] {
  const rows: ContextRow[] = [];
  for (const s of scenarios) {
    for (const level of LEVELS) {
      const r = runClaude({ prompt: `${s.situation}\n\n${s.ask} Answer with the next step only, in at most three lines.`, model, cwd: process.cwd(), system: knowledge(level), budgetUsd: 0.25, timeoutMs: 120_000 });
      const answer = r.answer.trim();
      const pass = r.ok && s.expect.every((e) => answer.toLowerCase().includes(e.toLowerCase()));
      rows.push({ id: s.id, level, pass, answer, costUsd: r.costUsd });
      log(`  ${pass ? '✔' : '✖'} ${s.id} @ ${level}: ${answer.replace(/\s+/gu, ' ').slice(0, 110)}`);
    }
  }
  return rows;
}

/** pass counts per knowledge level: the table that says which carrier carries. */
export const byLevel = (rows: ContextRow[]): Record<Level, { pass: number; total: number }> =>
  Object.fromEntries(LEVELS.map((l) => [l, { pass: rows.filter((r) => r.level === l && r.pass).length, total: rows.filter((r) => r.level === l).length }])) as Record<Level, { pass: number; total: number }>;

if (process.argv[1]?.endsWith('context.ts')) {
  const rows = runContext(undefined, 'haiku', console.log);
  const t = byLevel(rows);
  console.log(`\ncontext test: none ${t.none.pass}/${t.none.total} · some ${t.some.pass}/${t.some.total} · detailed ${t.detailed.pass}/${t.detailed.total} · notional cost $${rows.reduce((a, r) => a + r.costUsd, 0).toFixed(2)}`);
}

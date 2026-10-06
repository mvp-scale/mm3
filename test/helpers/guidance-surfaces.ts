// Every piece of text an agent reads to learn how to use MM3, gathered in one place so a change to any of it is seen.
// The guidance is the product for an agentic tool: a reworded card or a different stop message can change what an agent
// does. test/golden/guidance-drift.test.ts compares this against the committed snapshot; `npm run guidance:accept`
// rewrites the snapshot on purpose; scripts/check-agentic.ts binds an agentic result to the fingerprint of the same text.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { VERBS } from '../../src/contract/types.ts';
import { AGENT_EXTRAS, AGENT_TOOLS, runAgent } from '../../src/help/agent.ts';
import { AGENT_POINTER, MM3_GUIDANCE } from '../../src/help/guidance.ts';
import { HELP_EXTRAS, HELP_TOPICS, runHelp } from '../../src/help/index.ts';
import { toolDefinition } from '../../src/mcp/protocol.ts';
import { runTemplate } from '../../src/verbs/template.ts';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? files(path.join(dir, n)) : [path.join(dir, n)]));

/** name → text, in a fixed order. Deterministic: no project, no key, no clock. */
export function collectSurfaces(root: string = process.cwd()): Record<string, string> {
  const s: Record<string, string> = {
    'mcp/instructions': MM3_GUIDANCE,
    'mcp/tool-definition': JSON.stringify(toolDefinition(), null, 2),
    'agents-md/block': AGENT_POINTER,
    'agent/overview': runAgent().text,
    'help/overview': runHelp().text,
  };
  for (const v of VERBS) s[`agent/${v}`] = runAgent(v).text;
  for (const t of [...AGENT_TOOLS, ...AGENT_EXTRAS].filter((t, i, a) => a.indexOf(t) === i)) s[`agent/${t}`] = runAgent(t).text;
  for (const v of VERBS) s[`help/${v}`] = runHelp(v).text;
  for (const t of [...HELP_TOPICS, ...HELP_EXTRAS]) s[`help/${t}`] = runHelp(t).text;
  for (const v of VERBS) s[`template/${v}`] = runTemplate(v).text;
  for (const f of files(path.join(root, 'skills')).sort()) s[path.relative(root, f).split(path.sep).join('/')] = readFileSync(f, 'utf8');
  return Object.fromEntries(Object.entries(s).map(([n, t]) => [n, t.replace(/\n*$/u, '\n')]));
}

const SEP = '=== ';

/** The snapshot file: one `=== name` header per surface, then its text. One file so a PR shows the whole drift as one diff. */
export const renderSnapshot = (surfaces: Record<string, string>): string =>
  Object.entries(surfaces).map(([name, text]) => `${SEP}${name}\n${text}`).join('');

export function parseSnapshot(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let name: string | undefined;
  let buf: string[] = [];
  const flush = (): void => {
    if (name !== undefined) out[name] = buf.join('\n').replace(/\n*$/u, '\n');
  };
  for (const line of text.split('\n')) {
    if (line.startsWith(SEP)) {
      flush();
      name = line.slice(SEP.length);
      buf = [];
    } else buf.push(line);
  }
  flush();
  return out;
}

/** What an agent can act on: backticked commands, flags and quoted values, and the numbers. A change here is a likely behavior change; a change only in the words around them is likely a refinement. */
export const actionable = (text: string): Set<string> =>
  new Set([...(text.match(/`[^`\n]+`/gu) ?? []), ...(text.match(/--[a-z][a-z-]*/gu) ?? []), ...(text.match(/\b\d[\d.,]*\b/gu) ?? [])]);

export const manifestOf = (surfaces: Record<string, string>): { fingerprint: string; surfaces: Record<string, { sha256: string; lines: number }> } => ({
  fingerprint: sha(renderSnapshot(surfaces)),
  surfaces: Object.fromEntries(Object.entries(surfaces).map(([n, t]) => [n, { sha256: sha(t), lines: t.split('\n').length }])),
});

/** A readable account of how `after` differs from `before`: the lines removed and added, and whether the actionable tokens moved. */
export function describeDrift(name: string, before: string | undefined, after: string | undefined): string {
  if (before === undefined) return `+ new surface ${name} (${(after ?? '').split('\n').length} lines)`;
  if (after === undefined) return `- surface ${name} is gone`;
  const b = new Set(before.split('\n'));
  const a = new Set(after.split('\n'));
  const removed = before.split('\n').filter((l) => !a.has(l));
  const added = after.split('\n').filter((l) => !b.has(l));
  const tb = actionable(before);
  const ta = actionable(after);
  const gone = [...tb].filter((t) => !ta.has(t));
  const came = [...ta].filter((t) => !tb.has(t));
  const verdict = gone.length + came.length > 0 ? 'LIKELY SUBSTANTIVE (commands, flags or numbers changed)' : 'likely a wording refinement (no command, flag or number changed)';
  const clip = (l: string): string => (l.length > 160 ? `${l.slice(0, 157)}...` : l);
  return [`~ ${name}: ${verdict}`, ...removed.slice(0, 12).map((l) => `    - ${clip(l)}`), ...added.slice(0, 12).map((l) => `    + ${clip(l)}`),
    ...(gone.length ? [`    tokens removed: ${gone.slice(0, 12).join(' ')}`] : []), ...(came.length ? [`    tokens added: ${came.slice(0, 12).join(' ')}`] : [])].join('\n');
}

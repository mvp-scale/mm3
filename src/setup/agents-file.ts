/**
 * The project-file side of the agent guidance: the marked block in AGENTS.md and the import line in
 * CLAUDE.md (Claude Code reads CLAUDE.md, not AGENTS.md). One place for the marker text, the block detection
 * and the edit plan, shared by `mm3 init --agents` (writes it) and agents-status.ts (the one-time `agents:`
 * note and the doctor line), so "is it set up?" and "set it up" can never disagree. Pure apart from reading the
 * project's files; writing is the caller's choice, after it has shown the plan.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { AGENT_POINTER } from '../help/guidance.ts';

const AGENTS_OPEN = '<!-- mm3:agents -->';
const AGENTS_CLOSE = '<!-- /mm3:agents -->';
export const AGENTS_FILE = 'AGENTS.md';
/** The Claude Code memory files that may need to import AGENTS.md, with the import line each one takes. */
export const CLAUDE_FILES = [
  { rel: 'CLAUDE.md', importLine: '@AGENTS.md' },
  { rel: path.join('.claude', 'CLAUDE.md'), importLine: '@../AGENTS.md' },
] as const;

export const agentsBlock = (): string => `${AGENTS_OPEN}\n${AGENT_POINTER}\n${AGENTS_CLOSE}`;

/** A line that is exactly `@AGENTS.md` or `@../AGENTS.md` once trimmed. */
export const importsAgents = (text: string): boolean => text.split('\n').some((l) => l.trim() === '@AGENTS.md' || l.trim() === '@../AGENTS.md');

type BlockSpan = { start: number; end: number } | 'none' | 'broken';

/** Where the first marked block sits (end is just past the closing marker), none, or a marker without its pair. */
export function findBlock(text: string): BlockSpan {
  const open = text.indexOf(AGENTS_OPEN);
  const close = text.indexOf(AGENTS_CLOSE);
  if (open < 0 && close < 0) return 'none';
  if (open < 0 || close < open) return 'broken';
  return { start: open, end: close + AGENTS_CLOSE.length };
}

interface AgentsEdit {
  file: string; // relative to the project root
  verb: 'create' | 'update the mm3 block in' | 'append to';
  /** The exact lines this edit adds or replaces (shown to the user before anything is written). */
  written: string;
  /** What the whole file holds after the edit. */
  content: string;
  /** The past-tense result line, without the glyph. */
  done: string;
}

interface AgentsPlan {
  edits: AgentsEdit[];
  /** A file that can't be edited safely, with the fix; when set, nothing is written. */
  problem?: string;
}

const read = (root: string, rel: string): string | undefined => {
  const p = path.join(root, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
};
const endWithNewline = (s: string): string => (s === '' || s.endsWith('\n') ? s : `${s}\n`);

/** What `init --agents` would change in this project (nothing at all when it is already set up). */
export function planAgents(root: string): AgentsPlan {
  const edits: AgentsEdit[] = [];
  const block = agentsBlock();
  const existing = read(root, AGENTS_FILE);
  if (existing === undefined) {
    edits.push({ file: AGENTS_FILE, verb: 'create', written: block, content: `${block}\n`, done: `created ${AGENTS_FILE}` });
  } else {
    const span = findBlock(existing);
    if (span === 'broken') {
      return { edits: [], problem: `${AGENTS_FILE} has an unmatched ${AGENTS_OPEN} marker → put the ${AGENTS_OPEN} and ${AGENTS_CLOSE} lines back as a pair (or delete both), then re-run "mm3 init --agents"` };
    }
    if (span === 'none') {
      const base = endWithNewline(existing);
      edits.push({ file: AGENTS_FILE, verb: 'append to', written: block, content: `${base}${base === '' ? '' : '\n'}${block}\n`, done: `appended the mm3 block to ${AGENTS_FILE}` });
    } else if (existing.slice(span.start, span.end) !== block) {
      edits.push({ file: AGENTS_FILE, verb: 'update the mm3 block in', written: block, content: `${existing.slice(0, span.start)}${block}${existing.slice(span.end)}`, done: `updated the mm3 block in ${AGENTS_FILE}` });
    }
  }
  for (const { rel, importLine } of CLAUDE_FILES) {
    const text = read(root, rel);
    if (text === undefined || importsAgents(text)) continue;
    edits.push({ file: rel, verb: 'append to', written: importLine, content: `${endWithNewline(text)}${importLine}\n`, done: `appended ${importLine} to ${rel}` });
  }
  // Claude Code reads CLAUDE.md, never AGENTS.md: with no CLAUDE.md at all the block would reach no agent (seen in a
  // headless run where the lead and its helpers ignored it), so the import gets a file of its own.
  if (CLAUDE_FILES.every(({ rel }) => read(root, rel) === undefined)) {
    const { rel, importLine } = CLAUDE_FILES[0];
    edits.push({ file: rel, verb: 'create', written: importLine, content: `${importLine}\n`, done: `created ${rel} (imports ${AGENTS_FILE})` });
  }
  return { edits };
}

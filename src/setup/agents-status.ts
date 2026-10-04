/**
 * Is this project's agent guidance wired up? `ok` (AGENTS.md has the mm3 block, a CLAUDE.md exists, and every
 * CLAUDE.md imports AGENTS.md), `claude-md-no-import` (the block is there but Claude Code, which reads CLAUDE.md
 * and not AGENTS.md, will never see it) or `no-block`. Two readers share this one answer: the one-time `agents:`
 * note every verb's response carries on a project's first real run (verbs/respond.ts's commonNotes), and the
 * `agents:` line `mm3 doctor` always prints. The note is recorded by a marker file in `.mm3/` so it appears once
 * per project; doctor never reads or writes that marker.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { nextRunNumber } from '../ledger/log.ts';
import type { Mm3Paths } from '../ledger/paths.ts';
import { AGENTS_FILE, CLAUDE_FILES, findBlock, importsAgents } from './agents-file.ts';

type AgentsState = 'ok' | 'claude-md-no-import' | 'no-block';

const read = (file: string): string | undefined => (existsSync(file) ? readFileSync(file, 'utf8') : undefined);

export function agentsState(root: string): AgentsState {
  const agents = read(path.join(root, AGENTS_FILE));
  if (agents === undefined || typeof findBlock(agents) === 'string') return 'no-block';
  const texts = CLAUDE_FILES.map(({ rel }) => read(path.join(root, rel)));
  // no CLAUDE.md at all is as dark as one without the import: Claude Code never opens AGENTS.md by itself
  if (texts.every((t) => t === undefined) || texts.some((t) => t !== undefined && !importsAgents(t))) return 'claude-md-no-import';
  return 'ok';
}

/** The fix text for a state that is not ok (no "agents: " prefix: doctor's field and the note each add their own). */
const AGENTS_FIX: Record<Exclude<AgentsState, 'ok'>, string> = {
  'claude-md-no-import': 'Claude reads CLAUDE.md, not AGENTS.md → add the line @AGENTS.md to CLAUDE.md (or run mm3 init --agents)',
  'no-block': 'no MM3 guidance in AGENTS.md → mm3 init --agents adds it (shows the lines first)',
};

/** doctor's `agents:` value: the fix while not ok, else "ok". */
export function agentsDoctorValue(root: string): string {
  const state = agentsState(root);
  return state === 'ok' ? 'ok' : AGENTS_FIX[state];
}

/** The one-time note: undefined when the project is ok, or when this is not the project's first real run (a run is
 *  already recorded in the ledger, so the note was already carried by that one). Called while a run's response is
 *  built, before that run is recorded. */
export function agentsNote(paths: Mm3Paths): string | undefined {
  if (nextRunNumber(paths) > 1) return undefined;
  const state = agentsState(paths.root);
  return state === 'ok' ? undefined : `agents: ${AGENTS_FIX[state]}`;
}

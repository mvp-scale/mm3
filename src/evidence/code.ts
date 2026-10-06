/**
 * Our code as classifier evidence: each `where` entry ("path" or "path:start-end") becomes one evidence file,
 * redacted and size-capped. Paths must stay inside the project, symlinks resolved; a folder or a bad line range
 * is a Stop. This is the one place line ranges are checked — schema-check.ts already confirmed the shape.
 *
 * An oversized entry is a Stop by default (C-169, C-170), not the silent per-file/total truncation this used
 * to do: a `where:` entry the user typed is worth stopping on and asking them to narrow, rather than quietly
 * sending the classifier less than they think it saw. The one exception is `stopOnOversize: false` (C-171):
 * evidence MM3 itself chose, not the user — today, only drill.ts's flat one-subject proof of a sweep
 * item's own whole-file range — keeps the old truncate-with-a-note behavior, since there's no `where:` for
 * anyone to narrow.
 */
import { closeSync, fstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../config/defaults.ts';
import { redact } from '../ledger/redact.ts';
import { isOutside } from './paths.ts';

export const EVIDENCE_LIMITS = { perFileChars: DEFAULT_CONFIG.evidence.perItemChars, totalChars: DEFAULT_CONFIG.evidence.totalChars } as const;

/** What a project's `evidence.perItemChars` / `evidence.totalChars` pass in; omitted, EVIDENCE_LIMITS. */
export interface EvidenceCaps {
  perFileChars: number;
  totalChars: number;
}

export interface CodeEvidence {
  files: Record<string, string>;
  notes: string[];
}

export type EvidenceResult = { ok: true; evidence: CodeEvidence } | { ok: false; errors: string[] };

export interface ReadCodeEvidenceOptions {
  /** Default true: an oversized entry stops instead of being truncated. Pass false only for a range MM3
   *  itself picked (never a user-typed `where:`), which keeps the old truncate-with-a-note behavior. */
  stopOnOversize?: boolean;
  /** The caps to apply (config's `evidence:`); default EVIDENCE_LIMITS. */
  limits?: EvidenceCaps;
}

const fmt = (n: number): string => n.toLocaleString('en-US');

const LINES = /^(\d+)(?:-(\d+))?$/;
const TAIL = /:(\d+(?:-\d+)?)$/u;

/** "start" or "start-end" with 1 ≤ start ≤ end, else undefined. */
function lineRange(lines: string): { start: number; end: number } | undefined {
  const m = LINES.exec(lines);
  if (!m) return undefined;
  const start = Number(m[1]);
  const end = m[2] === undefined ? start : Number(m[2]);
  return start >= 1 && start <= end ? { start, end } : undefined;
}

/** "path" or "path:lines" (schema-check.ts already confirmed the path itself has no other ":"). */
function splitWhere(entry: string): { path: string; lines?: string } {
  const m = TAIL.exec(entry);
  return m ? { path: entry.slice(0, m.index), lines: m[1]! } : { path: entry };
}

export function readCodeEvidence(root: string, where: readonly string[], opts: ReadCodeEvidenceOptions = {}): EvidenceResult {
  const stopOnOversize = opts.stopOnOversize ?? true;
  const caps = opts.limits ?? EVIDENCE_LIMITS;
  const errors: string[] = [];
  const notes: string[] = [];
  const files: Record<string, string> = {};
  let total = 0;
  for (const entry of where) {
    const { path: rawPath, lines } = splitWhere(entry);
    const full = path.resolve(root, rawPath);
    const rel = path.relative(root, full);
    const outside = `✖ mak.where: "${rawPath}" is outside the project → use a path inside the project`;
    if (isOutside(rel)) {
      errors.push(outside);
      continue;
    }
    const range = lines ? lineRange(lines) : undefined;
    if (lines && !range) {
      errors.push(`✖ mak.where: "${entry}" has a bad line range → use start-end with 1 ≤ start ≤ end`);
      continue;
    }
    let text: string;
    let fd: number | undefined;
    try {
      // Resolve symlinks on both sides: a link inside the project that points outside it is still outside.
      if (isOutside(path.relative(realpathSync(root), realpathSync(full)))) {
        errors.push(outside);
        continue;
      }
      fd = openSync(full, 'r'); // open once, then look at that same file: no check-then-use gap
      if (fstatSync(fd).isDirectory()) {
        errors.push(`✖ mak.where: "${rawPath}" is a folder → name a file (scan covers folders)`);
        continue;
      }
      text = readFileSync(fd, 'utf8');
    } catch {
      errors.push(`✖ mak.where: cannot read "${rawPath}" → check the path`);
      continue;
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
    const shown = `${rel.split(path.sep).join('/')}${lines ? `:${lines}` : ''}`;
    let body = redact(range ? text.split('\n').slice(range.start - 1, range.end).join('\n') : text);
    if (body.length > caps.perFileChars) {
      if (stopOnOversize) {
        // C-169: a whole file names its own line count and asks for a range; a range that's already this big
        // asks to be narrowed further — either way, the classifier never silently sees less than was asked for.
        if (range) {
          errors.push(`✖ mak.where: "${entry}" is ${fmt(range.end - range.start + 1)} lines, too big to send → narrow the range`);
        } else {
          errors.push(`✖ mak.where: "${rawPath}" is ${fmt(text.split('\n').length)} lines, too big to send whole → name a range (${rawPath}:start-end)`);
        }
        continue;
      }
      body = body.slice(0, caps.perFileChars);
      notes.push(`${shown} truncated to ${caps.perFileChars} chars`);
    }
    const room = caps.totalChars - total;
    if (room <= 0) {
      // C-170: the same silent-cut problem, just across entries instead of within one — stop the same way.
      if (stopOnOversize) {
        errors.push(`✖ mak.where: "${shown}" doesn't fit — where: is over ${fmt(caps.totalChars)} chars total → send fewer paths or narrower ranges`);
        continue;
      }
      notes.push(`${shown} skipped: evidence limit reached`);
      continue;
    }
    if (body.length > room) {
      if (stopOnOversize) {
        errors.push(`✖ mak.where: "${shown}" doesn't fit — where: is over ${fmt(caps.totalChars)} chars total → send fewer paths or narrower ranges`);
        continue;
      }
      body = body.slice(0, room);
      notes.push(`${shown} truncated: evidence limit reached`);
    }
    total += body.length;
    files[shown] = body;
  }
  return errors.length ? { ok: false, errors } : { ok: true, evidence: { files, notes } };
}

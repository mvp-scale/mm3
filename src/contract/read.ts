/**
 * Request text → a plain value. YAML 1.2 core schema through the `yaml` package, so JSON works too and
 * no/yes stay text. A parse error becomes ONE help-first stop (later errors are echoes of the first) naming
 * the line and the fix; the traps agents fall into (": " in an unquoted question, a category in { }) get
 * their own wording.
 *
 * Plan 2c N6: before any of that, `scanLines` walks the raw text once and reports EVERY numbered question
 * line with one of the same two traps (an unquoted ": " inside its text, or its text starting with an
 * unquoted "{" — someone wrapping a question in braces by hand), plus every over-`MAX_QUESTION_CHARS` line
 * (skipping full-line comments) — all in one response, capped like every other stop list (see `capStops`),
 * rather than the single stop the YAML parser itself would surface for whichever one of them it happens to
 * choke on first. It deliberately does NOT flag a mid-text "{" (e.g. a sweep's `{function}` blank): only
 * text starting with "{" is a trap here, since embedded blanks are a normal, valid feature. When the scanner
 * finds nothing, parsing proceeds exactly as before — an existing, already-passing single-trap request keeps
 * its exact original stop wording (no line-number suffix added), so this is additive, not a rewording.
 */
import { parseDocument } from 'yaml';
import { MAX_QUESTION_CHARS } from './schema-check.ts';
import { clip } from '../util/text.ts';

export type ReadResult = { ok: true; value: Record<string, unknown> } | { ok: false; stops: string[] };

const SKELETON = '(mm3 template class prints a skeleton)';
const QUESTION_LINE = /^\s*(\d+)\s*:\s?(.*)$/u;
const MAX_STOPS = 5;

/** A value already wrapped start-to-end in one matching pair of quotes — not a trap, since YAML reads it as
 *  one quoted scalar rather than plain text. */
function isQuotedWhole(s: string): boolean {
  return (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) || (s.length >= 2 && s.startsWith("'") && s.endsWith("'"));
}

/** A YAML `# comment` starts at a "#" that is either the first character or preceded by whitespace, and never
 *  inside a quoted string — stripped before either check below so a normal trailing `# explanation` (this
 *  codebase's own template style) never reads as part of the question text or inflates a line's length. */
function stripComment(line: string): string {
  let quote: '"' | "'" | undefined;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === quote) quote = undefined;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/u.test(line[i - 1]!))) return line.slice(0, i);
  }
  return line;
}

/** Every numbered question line's own ": "/leading-"{" trap, plus every over-length line (comments stripped
 *  first, full-comment lines skipped), in source order. Pure text scanning — no YAML parsing, so it runs even
 *  on text the parser can't handle. */
function scanLines(src: string): string[] {
  const stops: string[] = [];
  const lines = src.split(/\r?\n/u);
  for (const raw of lines) {
    const code = stripComment(raw);
    if (!code.trim()) continue;
    const q = QUESTION_LINE.exec(code);
    if (q) {
      const text = (q[2] ?? '').trim();
      if (!isQuotedWhole(text)) {
        if (text.startsWith('{')) stops.push(`✖ question ${q[1]} puts it in { } → use the indented form`);
        else if (/:(\s|$)/u.test(text)) stops.push(`✖ question ${q[1]} has ": " → put it in quotes`);
      }
    }
    if ([...code].length > MAX_QUESTION_CHARS) stops.push(`✖ yaml: "${clip(code.trim(), 40)}" is longer than ${MAX_QUESTION_CHARS} characters → shorten it`);
  }
  return stops;
}

/** The shared 5-stop-then-"N more" shape (verbs/request.ts's `stopText` applies the same idiom downstream) —
 *  applied here too so a pre-parse batch of stops is already capped before it ever reaches that second layer
 *  (never more than 5 lines out of this function, so `stopText`'s own re-slice is a no-op on top of it). */
function capStops(stops: readonly string[]): string[] {
  if (stops.length <= MAX_STOPS) return [...stops];
  return [...stops.slice(0, MAX_STOPS - 1), `✖ request: ${stops.length - (MAX_STOPS - 1)} more problems → fix the ones above, then run again`];
}

/** The line an error points at, or the nearest non-blank line above it (an unclosed { } is reported past its end). */
function sourceLine(lines: readonly string[], line: number): { no: number; text: string } {
  for (let no = Math.min(line, lines.length); no >= 1; no--) {
    const text = lines[no - 1] ?? '';
    if (text.trim()) return { no, text };
  }
  return { no: line, text: '' };
}

export function describeParseError(lines: readonly string[], code: string, line: number): string {
  if (code === 'MULTIPLE_DOCS') return '✖ yaml: more than one document (---) → send one request per run';
  const at = sourceLine(lines, line);
  if (code === 'TAB_AS_INDENT') return `✖ yaml: line ${at.no} is indented with a tab → indent with spaces`;
  if (code === 'DUPLICATE_KEY') {
    const key = /^\s*(?:-\s+)?([^:#]+?)\s*:/u.exec(at.text)?.[1] ?? '';
    return /^\d+$/u.test(key)
      ? `✖ question ${key}: numbered twice (line ${at.no}) → give each question its own number`
      : `✖ yaml: line ${at.no} repeats the key "${clip(key, 30)}" → give each key once`;
  }
  if (/[{}]/u.test(at.text)) return `✖ yaml: line ${at.no} puts a category or question in { } → use the indented form`;
  const q = QUESTION_LINE.exec(at.text);
  if (q && /:(\s|$)/u.test(q[2] ?? '')) return `✖ question ${q[1]} has ": " → put it in quotes`;
  if (/^\s*(?:-\s+)?[^:#]+:\s+[`@]/u.test(at.text)) return `✖ yaml: line ${at.no} starts a value with ${at.text.includes(": @") ? "an @" : "a backtick"} → put the whole value in "quotes"`;
  return `✖ yaml: line ${at.no} does not parse → use the indented form, and put any question with ": " or " #" in quotes`;
}

export function readRequestText(text: string): ReadResult {
  const src = text.replace(/^﻿/u, '');
  if (!src.trim()) return { ok: false, stops: [`✖ request: empty → start with "mak:" ${SKELETON}`] };
  if (/^\s*mm3\s+\w+\s+L\d/u.test(src)) return { ok: false, stops: [`✖ request: this is the old text format → send YAML ${SKELETON}`] };
  const scanned = scanLines(src);
  if (scanned.length) return { ok: false, stops: capStops(scanned) };
  const doc = parseDocument(src, { version: '1.2', schema: 'core', uniqueKeys: true });
  const first = doc.errors[0];
  if (first) return { ok: false, stops: [describeParseError(src.split(/\r?\n/u), first.code, first.linePos?.[0]?.line ?? 1)] };
  let value: unknown;
  try {
    value = doc.toJS({ maxAliasCount: 50 });
  } catch {
    return { ok: false, stops: ['✖ yaml: too many aliases (*) → write the request out in full'] };
  }
  if (value === null || value === undefined) return { ok: false, stops: [`✖ request: empty → start with "mak:" ${SKELETON}`] };
  if (typeof value !== 'object' || Array.isArray(value)) return { ok: false, stops: [`✖ request: not a YAML mapping → start with "mak:" ${SKELETON}`] };
  return { ok: true, value: value as Record<string, unknown> };
}

/**
 * `~/.config/mm3/env` (or `$XDG_CONFIG_HOME/mm3/env`): the fallback key store when the OS keychain
 * isn't available, at mode 0600 in a 0700 directory. It's a shell env file a user can `source` themselves, but
 * MM3 never sources or evals it — only lines of the exact shape `export NAME='value'` (single-quoted; the
 * value must not itself contain a `'`) are read, and only for a name on ALLOWED_NAMES. `#` comments and
 * anything else are left alone: a line this parser doesn't recognize is simply ignored (and, for a non-comment
 * line, counted so doctor can warn "a line was ignored" — the owner's own template on this machine is comments
 * only, and must survive untouched by every function here). Writing updates one name's line in place —
 * replacing it if present, appending if not — and never rewrites any other line.
 */
import { chmodSync, closeSync, fchmodSync, fstatSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isAbsent } from '../ledger/lock.ts';

type Env = Record<string, string | undefined>;

export const ALLOWED_NAMES = ['TYPESAFE_API_KEY', 'AI_GATEWAY_API_KEY', 'TYPESAFE_BASE_URL', 'JEV_MODEL', 'JEV_GATEWAY_MODEL', 'MM3_PROVIDER'] as const;
export type EnvFileName = (typeof ALLOWED_NAMES)[number];
const isAllowedName = (s: string): s is EnvFileName => (ALLOWED_NAMES as readonly string[]).includes(s);

// Exactly `export NAME='value'`, optional surrounding whitespace; the value may be empty but never contains a
// literal `'` (there is no escape convention here — a value that needs one just doesn't fit this file format).
const EXPORT_LINE = /^\s*export\s+([A-Za-z_][A-Za-z0-9_]*)='([^']*)'\s*$/u;

export function mm3ConfigDir(env: Env = process.env): string {
  const xdg = env.XDG_CONFIG_HOME?.trim();
  return xdg ? path.join(xdg, 'mm3') : path.join(os.homedir(), '.config', 'mm3');
}

export function envFilePath(env: Env = process.env): string {
  return path.join(mm3ConfigDir(env), 'env');
}

export interface EnvFileRead {
  values: Partial<Record<EnvFileName, string>>;
  mode: number;
  /** Non-blank, non-comment lines that didn't parse as `export <allowed name>='...'` — doctor warns on this. */
  ignoredLines: number;
}

/** undefined only when the file doesn't exist or can't be read at all — a value that IS there but for a name
 *  outside the allowlist, or a malformed export line, is not an error: it's just ignored (and counted). */
export function readEnvFile(file: string): EnvFileRead | undefined {
  let mode: number;
  let raw: string;
  let fd: number | undefined;
  try {
    fd = openSync(file, 'r'); // open once; the mode and the text both come from that same open file
    mode = fstatSync(fd).mode & 0o777;
    raw = readFileSync(fd, 'utf8');
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  const values: Partial<Record<EnvFileName, string>> = {};
  let ignoredLines = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const m = EXPORT_LINE.exec(line);
    if (m && isAllowedName(m[1]!)) {
      values[m[1] as EnvFileName] = m[2];
    } else {
      ignoredLines++;
    }
  }
  return { values, mode, ignoredLines };
}

export const canQuote = (value: string): boolean => !value.includes("'");

/** The file's lines, or undefined when there is no such file: one read, no exists-then-read gap. */
function readLines(file: string): string[] | undefined {
  try {
    return readFileSync(file, 'utf8').split('\n');
  } catch (e) {
    if (isAbsent(e)) return undefined;
    throw e;
  }
}

/** Writes the file at mode 0600: created that way, and set that way on the open file if it already existed, so it is never readable by others, not even briefly. */
function writeSecret(file: string, text: string): void {
  const fd = openSync(file, 'w', 0o600);
  try {
    fchmodSync(fd, 0o600);
    writeFileSync(fd, text);
  } finally {
    closeSync(fd);
  }
}

/** Sets `name` to `value`: replaces its existing `export NAME='...'` line if one is there, else appends a new
 *  one — every other line (comments, other names) is preserved byte for byte. Throws if `value` contains a `'`
 *  (the caller — init's key step — validates this up front so the user sees a clean ✖ line instead). */
export function setEnvFileValue(file: string, name: EnvFileName, value: string): void {
  if (!canQuote(value)) throw new Error(`env-file: "${name}"'s value contains a single quote, which this file format can't represent`);
  const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o700);
  const existing = readLines(file) ?? [];
  const newLine = `export ${name}='${value}'`;
  let replaced = false;
  const next = existing.map((line) => {
    const m = EXPORT_LINE.exec(line);
    if (m && m[1] === name) {
      replaced = true;
      return newLine;
    }
    return line;
  });
  if (!replaced) next.push(newLine);
  writeSecret(file, `${next.join('\n').replace(/\n+$/u, '')}\n`);
}

/** Removes only `name`'s line, leaving comments and every other line untouched; removes the file itself only
 *  when nothing — not even a comment — is left, so a hand-written template never disappears out from under the
 *  user just because its one key line got cleared. 'absent' when there was no such line to begin with. */
export function removeEnvFileValue(file: string, name: EnvFileName): 'removed' | 'file-removed' | 'absent' {
  const lines = readLines(file);
  if (lines === undefined) return 'absent';
  let found = false;
  const next = lines.filter((line) => {
    const m = EXPORT_LINE.exec(line);
    if (m && m[1] === name) {
      found = true;
      return false;
    }
    return true;
  });
  if (!found) return 'absent';
  if (next.join('\n').trim() === '') {
    rmSync(file, { force: true });
    return 'file-removed';
  }
  writeSecret(file, `${next.join('\n').replace(/\n+$/u, '')}\n`);
  return 'removed';
}

/** Quiet at 0600 or tighter; a ✖-style warning line otherwise. */
export function looseFileModeWarning(file: string, mode: number): string | undefined {
  if ((mode & 0o077) === 0) return undefined;
  return `✖ credentials: ${file} is mode ${mode.toString(8)}, looser than 0600 → chmod 600 ${file}`;
}

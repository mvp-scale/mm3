/**
 * Project-relative file patterns for scan (over.file) and loop's folder places, with no dependency:
 * `*` (within a folder), `**` (any depth), `?` and `{a,b}`. The walk never follows symlinks and skips .git,
 * node_modules, .mm3 and dist, so a pattern can't leave the project or wander into generated code.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../config/defaults.ts';

export const SKIP_DIRS = new Set(['.git', 'node_modules', '.mm3', 'dist']);
export const MAX_FILES = DEFAULT_CONFIG.evidence.maxFiles;

const escape = (s: string): string => s.replace(/[.+^$()|[\]\\]/gu, '\\$&');

export function globToRegExp(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        const slash = pattern[i + 2] === '/';
        re += slash ? '(?:[^/]*/)*' : '.*';
        i += slash ? 2 : 1;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = pattern.indexOf('}', i);
      if (end > i) {
        re += `(?:${pattern.slice(i + 1, end).split(',').map(escape).join('|')})`;
        i = end;
      } else re += '\\{';
    } else re += escape(c);
  }
  return new RegExp(`^${re}$`, 'u');
}

/** The folder a pattern can't match outside of: the path before its first wildcard. */
function staticPrefix(pattern: string): string {
  const parts = pattern.split('/');
  const fixed: string[] = [];
  for (const p of parts.slice(0, -1)) {
    if (/[*?{]/u.test(p)) break;
    fixed.push(p);
  }
  return fixed.join('/');
}

/** Files under root matching the pattern, sorted, at most `maxFiles` (default MAX_FILES). A pattern with a `..` segment or an
 * absolute path is rejected outright (no files, not truncated); `walk` also refuses to read outside root,
 * as defense in depth, though `rel` is built only from real directory entries and should never leave it. */
export function expandGlob(root: string, pattern: string, maxFiles: number = MAX_FILES): { files: string[]; truncated: boolean } {
  const clean = pattern.replace(/^\.\//u, '');
  if (path.isAbsolute(clean) || clean.split('/').includes('..')) return { files: [], truncated: false };
  const re = globToRegExp(clean);
  const files: string[] = [];
  let truncated = false;
  const rootResolved = path.resolve(root);
  const walk = (rel: string): void => {
    const dir = path.resolve(root, rel);
    if (dir !== rootResolved && !dir.startsWith(rootResolved + path.sep)) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      // Intentionally swallowed: a pattern's static prefix may not exist (e.g. "nope/*.ts"), or a
      // directory may be unreadable or removed mid-walk. Either way, that subtree contributes no files
      // rather than failing the whole expansion.
      return;
    }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(child);
      } else if (e.isFile() && re.test(child)) {
        if (files.length >= maxFiles) {
          truncated = true;
          return;
        }
        files.push(child);
      }
    }
  };
  walk(staticPrefix(clean));
  return { files, truncated };
}

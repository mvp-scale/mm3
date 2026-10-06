/**
 * Code units: the resolver that turns scan's `over: {file: <pattern>, function: each, call: each}` into
 * layers.ts items (file -> function -> call), plus the on-disk re-read a stored unit needs for drill
 * continuing from a parent run. createCodeResolver is dispatched by what its *parent* item's unit.kind is,
 * not by the layer's name (an agent can call a layer anything). Every pattern and path this module is handed
 * already passed checkOver before expand() ever runs a resolver, so a resolver can't itself fail — a file
 * that can't be read is a note, not a stop. readUnit is the mirror operation for drill: the ledger stores a
 * unit (path + kind + lines), not the source text itself, so the code may have moved since the parent run.
 */
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { Item, Resolved, Resolver, UnitRef } from '../contract/layers.ts';
import { listFilesAtRef, readFileAtRef, repoRootFor } from './git.ts';
import { expandGlob, globToRegExp, MAX_FILES } from './glob.ts';
import { isOutside } from './paths.ts';
import { splitCalls, splitFunctions } from './split.ts';

export type UnitReadResult = { ok: true; text: string } | { ok: false; error: string };

const LINES = /^(\d+)-(\d+)$/;

/** A unit's own "start-end" -> {start, end}, or undefined if it isn't well-formed. */
function lineRange(lines: string): { start: number; end: number } | undefined {
  const m = LINES.exec(lines);
  if (!m) return undefined;
  const start = Number(m[1]);
  const end = Number(m[2]);
  return start >= 1 && start <= end ? { start, end } : undefined;
}

/** The sweep's first layer: a glob becomes whole-file items, id = the relative path. */
function readFiles(root: string, spec: string, notes: string[], maxFiles: number): Resolved[] {
  const { files, truncated } = expandGlob(root, spec, maxFiles);
  if (truncated) notes.push(`${spec}: matched more than ${maxFiles} files, using the first ${maxFiles}`);
  const out: Resolved[] = [];
  for (const rel of files) {
    const full = path.join(root, rel);
    let text: string;
    try {
      // Defense in depth, mirroring code.ts/git.ts: expandGlob's own walk never follows a symlink, but a
      // symlinked directory named in the pattern's static prefix (its first, wildcard-free segment) is
      // handed straight to readdirSync, which does follow it. Resolve symlinks on both sides and treat an
      // escape the same as any other unreadable file, below.
      if (isOutside(path.relative(realpathSync(root), realpathSync(full)))) throw new Error('outside');
      text = readFileSync(full, 'utf8');
    } catch {
      // The directory walk (expandGlob) and this read aren't atomic: the file may have vanished, or become
      // unreadable, in between. Either way, that one file contributes nothing rather than failing the sweep.
      notes.push(`${rel}: could not read, skipped`);
      continue;
    }
    const lineCount = text ? text.split('\n').length : 1;
    out.push({ name: rel, text, unit: { path: rel, kind: 'file', name: rel, lines: `1-${lineCount}` } });
  }
  return out;
}

/** A file's functions. splitFunctions' start/end are already file-absolute. */
function readFunctions(parent: Item): Resolved[] {
  const unit = parent.unit!;
  return splitFunctions(parent.text).map((u) => ({
    name: u.name,
    text: u.text,
    unit: { path: unit.path, kind: 'function' as const, name: u.name, lines: `${u.start}-${u.end}` },
  }));
}

/** A function's (or a call's) calls. splitCalls' start/end are relative to the parent's own slice, so offset
 * by the parent's file-absolute start to land back on file-absolute lines. */
function readCalls(parent: Item): Resolved[] {
  const unit = parent.unit!;
  const base = Number(unit.lines.split('-')[0]) - 1;
  return splitCalls(parent.text).map((u) => ({
    name: u.name,
    text: u.text,
    unit: { path: unit.path, kind: 'call' as const, name: u.name, lines: `${u.start + base}-${u.end + base}` },
  }));
}

/** One Resolver for every depth of scan's chain: file -> function -> call. */
export function createCodeResolver(root: string, notes: string[], maxFiles: number = MAX_FILES): Resolver {
  return (_layer: string, spec: string, parent: Item | null): Resolved[] => {
    if (parent === null) return readFiles(root, spec, notes, maxFiles);
    if (parent.unit!.kind === 'file') return readFunctions(parent);
    return readCalls(parent);
  };
}

/** The ref-aware mirror of readFiles: lists and reads files at `ref` instead of the working tree (a sweep-parent replay re-runs the parent's own file layer at two git states). `root` resolves to its own
 *  containing git repo once (git.ts's repoRootFor, the same "repo that actually contains the run's own files"
 *  rule the rest of this codebase already applies via C-147 — `wherePaths` is the caller's own equivalent of a
 *  run's `where`, here the sweep-parent's own item paths). Paths from `git ls-tree` come back repo-relative;
 *  they're translated to root-relative before being matched against `spec` with the SAME glob semantics
 *  expandGlob uses (globToRegExp), so a pattern written the usual way (relative to the project root) still
 *  works whether or not the containing repo IS the project root. A repo that can't be found, or a ref git can't
 *  read there, yields no files — a note, never a stop, same as readFiles' own unreadable-file handling. */
function readFilesAt(root: string, ref: string, spec: string, notes: string[], wherePaths: readonly string[], maxFiles: number): Resolved[] {
  const clean = spec.replace(/^\.\//u, '');
  if (path.isAbsolute(clean) || clean.split('/').includes('..')) return [];
  const repoRoot = repoRootFor(root, wherePaths);
  if (!repoRoot) {
    notes.push(`${spec}: not inside a git repo, matched no files`);
    return [];
  }
  const re = globToRegExp(clean);
  const matched: string[] = [];
  for (const gitRel of listFilesAtRef(repoRoot, ref)) {
    const rel = path.relative(root, path.resolve(repoRoot, gitRel)).split(path.sep).join('/');
    if (isOutside(rel)) continue;
    if (re.test(rel)) matched.push(rel);
  }
  matched.sort();
  const truncated = matched.length > maxFiles;
  if (truncated) notes.push(`${spec}: matched more than ${maxFiles} files, using the first ${maxFiles}`);
  const files = truncated ? matched.slice(0, maxFiles) : matched;

  const out: Resolved[] = [];
  for (const rel of files) {
    const gitRel = path.relative(repoRoot, path.resolve(root, rel)).split(path.sep).join('/');
    const text = readFileAtRef(repoRoot, ref, gitRel);
    if (text === undefined) {
      notes.push(`${rel}: could not read at ${ref}, skipped`);
      continue;
    }
    const lineCount = text ? text.split('\n').length : 1;
    out.push({ name: rel, text, unit: { path: rel, kind: 'file', name: rel, lines: `1-${lineCount}` } });
  }
  return out;
}

/** One Resolver mirroring createCodeResolver, but reading a git ref instead of the working tree (a
 *  sweep-parent replay reads the SAME layers — file -> function -> call — at two refs). Only the first layer
 *  (file listing/reading) is ref-aware; function/call splitting is pure text parsing (splitFunctions/splitCalls),
 *  ref-agnostic, so it's shared verbatim with createCodeResolver via readFunctions/readCalls. `wherePaths`
 *  resolves the containing repo the same way resolveRefSha's own callers do — pass the sweep parent's own item
 *  paths so a nested repo (a monorepo package, a vendored project) is found the same way C-147 already finds it
 *  for one-subject replay. */
export function createCodeResolverAt(root: string, ref: string, notes: string[], wherePaths: readonly string[] = [], maxFiles: number = MAX_FILES): Resolver {
  return (_layer: string, spec: string, parent: Item | null): Resolved[] => {
    if (parent === null) return readFilesAt(root, ref, spec, notes, wherePaths, maxFiles);
    if (parent.unit!.kind === 'file') return readFunctions(parent);
    return readCalls(parent);
  };
}

/** Re-reads one stored UnitRef's current text from disk, for drill continuing from a parent run. Errors are
 * plain strings, not "✖ field: …" stops — the caller (drill.ts) knows which field is at fault (mak.from)
 * and wraps the reason into its own stop text. */
export function readUnit(root: string, unit: UnitRef): UnitReadResult {
  const full = path.resolve(root, unit.path);
  const rel = path.relative(root, full);
  const outside: UnitReadResult = { ok: false, error: `"${unit.path}" is outside the project` };
  if (isOutside(rel)) return outside;
  let text: string;
  try {
    // Resolve symlinks on both sides, like code.ts/git.ts: a link inside the project that points outside it
    // is still outside. A dangling link throws here too, and falls through to the same "cannot read" below.
    if (isOutside(path.relative(realpathSync(root), realpathSync(full)))) return outside;
    text = readFileSync(full, 'utf8');
  } catch {
    return { ok: false, error: `cannot read "${unit.path}"` };
  }
  if (unit.kind === 'file') return { ok: true, text };
  const range = lineRange(unit.lines);
  if (!range) return { ok: false, error: `"${unit.path}:${unit.lines}" has a bad line range` };
  const lines = text.split('\n');
  if (range.end > lines.length) return { ok: false, error: `"${unit.path}:${unit.lines}" is past the end of the file now` };
  return { ok: true, text: lines.slice(range.start - 1, range.end).join('\n') };
}

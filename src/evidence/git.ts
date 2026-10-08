/**
 * Git as classifier evidence for replay: two states of the same files, read either from a ref (`git show`) or
 * from the working tree (the literal ref "worktree"). A ref that looks like a git option (starts with "-")
 * must never reach git — checked before any spawnSync call, so it can't be re-split or re-interpreted as an
 * option. git is always spawned as an argv array, never through a shell.
 */
import { spawnSync } from 'node:child_process';
import { closeSync, fstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { redact } from '../ledger/redact.ts';
import { EVIDENCE_LIMITS, type EvidenceCaps } from './code.ts';
import { isOutside } from './paths.ts';

export type GitResult = { ok: true; files: Record<string, string>; notes: string[] } | { ok: false; errors: string[] };

type Spawn = typeof spawnSync;

const FATAL = /fatal: (invalid object name|Path .* does not exist)/u;

/** replay reads whole files, never line ranges. Exported so replay.ts can dedupe it across the two states. */
export const WHOLE_FILE_NOTE = 'reading whole files: line ranges may not match the parent run';

/** A string git would read as an option, not a ref: it must never be handed to git. */
export const isGitOption = (ref: string): boolean => ref.startsWith('-');

/** Whether the container has a git binary at all (git-backed tests skip when it's absent). */
export function hasGit(deps?: { spawn?: Spawn }): boolean {
  const spawn = deps?.spawn ?? spawnSync;
  return spawn('git', ['--version'], {}).status === 0;
}

/** The nearest git repo actually containing `dir` (its own `git rev-parse --show-toplevel`), not necessarily
 *  the MM3 project root — a monorepo package or a vendored project one level down is its own repo.
 *  `undefined` when `dir` isn't inside any repo at all (git itself is the source of truth here, not a
 *  `.git`-folder walk this module would have to duplicate and keep in sync with git's own rules). */
export function gitRootOf(dir: string, spawn: Spawn): string | undefined {
  const result = spawn('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' });
  const out = typeof result.stdout === 'string' ? result.stdout.trim() : '';
  if (result.status !== 0 || !out) return undefined;
  return inCallersSpelling(dir, out);
}

/** git prints the toplevel with symlinks resolved (macOS: /private/var/… for a /var/… temp folder, Windows: 8.3 names);
 *  every caller does `path.relative(<this root>, <path it built under dir>)`, which needs both in the same spelling. So the root is
 *  handed back as `dir` itself, climbed up as many levels as `dir` sits below git's toplevel. */
function inCallersSpelling(dir: string, top: string): string {
  try {
    const real = realpathSync(dir);
    if (real === dir) return top;
    const rel = path.relative(top, real);
    if (isOutside(rel)) return top;
    return rel ? path.resolve(dir, ...rel.split(path.sep).map(() => '..')) : dir;
  } catch {
    return top;
  }
}

/** The directory to resolve a run's own containing repo from: the first `where` entry (stripped of any
 *  `:line-range` suffix), resolved against `root` the same way readGitEvidence resolves a compared path — or
 *  `root` itself when there's no `where` entry at all (a sweep verb like loop, which records no file paths). */
function firstWhereDir(root: string, wherePaths: readonly string[]): string {
  const first = wherePaths[0];
  if (!first) return root;
  return path.dirname(path.resolve(root, first.split(':')[0]!));
}

/** Resolves `ref` to its sha in the git repo that actually CONTAINS this run's own `where` files (`git -C <dir
 *  of first where path>`), not necessarily the MM3 project root — a monorepo package or a vendored project
 *  one level down is its own repo. `ref === 'worktree'` resolves to that repo's own HEAD (the
 *  working tree's own commit); any other ref is resolved literally (`git rev-parse <ref>`), guarded by the same
 *  `isGitOption` check `readGitEvidence` uses so a `-`-prefixed ref can never reach git. Null when: the ref
 *  looks like an option, `where` is non-empty but its path isn't inside any repo, git can't resolve the ref, or
 *  git is absent. When `where` is empty, falls back to `root`'s own repo (exactly `currentCommitSha`'s old,
 *  pre-plan-2c behavior) — there's no file to resolve a containing repo from. Never a stop: a run without a
 *  commit sha still logs. */
export function resolveRefSha(root: string, ref: string, wherePaths: readonly string[], deps?: { spawn?: Spawn }): string | null {
  if (ref !== 'worktree' && isGitOption(ref)) return null;
  const spawn = deps?.spawn ?? spawnSync;
  const dir = firstWhereDir(root, wherePaths);
  const gitRoot = gitRootOf(dir, spawn) ?? (wherePaths.length ? undefined : root);
  if (!gitRoot) return null;
  const result = spawn('git', ['rev-parse', ref === 'worktree' ? 'HEAD' : ref], { cwd: gitRoot, encoding: 'utf8' });
  const out = typeof result.stdout === 'string' ? result.stdout.trim() : '';
  return result.status === 0 && out ? out : null;
}

/** The repo HEAD sha of whichever repo actually contains this run's own `where` files (see
 *  `resolveRefSha`), or null when it isn't in a repo, or git is absent — the ledger's own `commit` field.
 *  `wherePaths` defaults to `[]` (falls back to `root`'s own repo) for any caller with no file paths of its own. */
export function currentCommitSha(root: string, wherePaths: readonly string[] = [], deps?: { spawn?: Spawn }): string | null {
  return resolveRefSha(root, 'worktree', wherePaths, deps);
}

/** The directory form of resolveRefSha's own "repo that actually contains this run's own files" rule (a sweep-parent replay needs to run further git commands there itself — listing/reading files at a ref —
 *  not just resolve one ref to a sha). Same fallback as resolveRefSha: `root` itself when `wherePaths` is empty
 *  (nothing to resolve a containing repo from); undefined only when `wherePaths` is non-empty but isn't inside
 *  any repo at all. */
export function repoRootFor(root: string, wherePaths: readonly string[], deps?: { spawn?: Spawn }): string | undefined {
  const spawn = deps?.spawn ?? spawnSync;
  const dir = firstWhereDir(root, wherePaths);
  return gitRootOf(dir, spawn) ?? (wherePaths.length ? undefined : root);
}

/** Every file `git` knows about at `ref`, repo-relative (`git ls-tree -r --name-only`) — the ref-aware mirror of
 *  evidence/glob.ts's own directory walk, for units.ts's createCodeResolverAt (a sweep-parent replay reads two
 *  git states instead of the working tree). A ref that looks like a git option must never reach git
 *  (same `isGitOption` guard every other git-reading function here uses); a ref git can't resolve, a `repoRoot`
 *  that isn't a repo, or no git at all, is an empty list — the caller notes it, never a stop (createCodeResolver's
 *  own unreadable-file handling follows the same "a note, not a stop" discipline). */
export function listFilesAtRef(repoRoot: string, ref: string, deps?: { spawn?: Spawn }): string[] {
  if (isGitOption(ref)) return [];
  const spawn = deps?.spawn ?? spawnSync;
  const result = spawn('git', ['ls-tree', '-r', '--name-only', ref], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0 || typeof result.stdout !== 'string') return [];
  return result.stdout.split('\n').filter(Boolean);
}

/** One file's content at `ref` in the repo rooted at `repoRoot` (`git show ref:path`), or undefined when the ref
 *  or path can't be read there — same discipline as listFilesAtRef. `relPath` is already `repoRoot`-relative and
 *  forward-slashed (git's own path form), same as readGitEvidence's own `gitRel`. */
export function readFileAtRef(repoRoot: string, ref: string, relPath: string, deps?: { spawn?: Spawn }): string | undefined {
  if (isGitOption(ref)) return undefined;
  const spawn = deps?.spawn ?? spawnSync;
  const result = spawn('git', ['show', `${ref}:${relPath}`], { cwd: repoRoot, encoding: 'utf8' });
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  if (result.status !== 0 || FATAL.test(stderr)) return undefined;
  return typeof result.stdout === 'string' ? result.stdout : undefined;
}

/** Redact, then cap per file and in total, exactly like evidence/code.ts's EVIDENCE_LIMITS. */
function keep(shown: string, text: string, total: number, notes: string[], caps: EvidenceCaps): { body: string; total: number } | undefined {
  let body = redact(text);
  if (body.length > caps.perFileChars) {
    body = body.slice(0, caps.perFileChars);
    notes.push(`${shown} truncated to ${caps.perFileChars} chars`);
  }
  const room = caps.totalChars - total;
  if (room <= 0) {
    notes.push(`${shown} skipped: evidence limit reached`);
    return undefined;
  }
  if (body.length > room) {
    body = body.slice(0, room);
    notes.push(`${shown} truncated: evidence limit reached`);
  }
  return { body, total: total + body.length };
}

/**
 * `ref === 'worktree'`: each path read straight off disk, whole file. Otherwise: `git show ref:path`, whole
 * file. Either way, whole files only (replay never has line ranges) — a note says so once, not once per file.
 */
export function readGitEvidence(root: string, ref: string, field: 'before' | 'after', paths: readonly string[], deps?: { spawn?: Spawn; limits?: EvidenceCaps }): GitResult {
  if (ref !== 'worktree' && isGitOption(ref)) {
    return { ok: false, errors: [`✖ mak.compare.${field}: "${ref}" looks like an option, not a ref → use a branch, tag or commit`] };
  }

  const spawn = deps?.spawn ?? spawnSync;
  const caps = deps?.limits ?? EVIDENCE_LIMITS;
  const errors: string[] = [];
  const notes: string[] = [];
  const files: Record<string, string> = {};
  let total = 0;
  let read = false;

  for (const rawPath of paths) {
    const full = path.resolve(root, rawPath);
    const rel = path.relative(root, full);
    const outside = `✖ mak.compare.${field}: "${rawPath}" is outside the project → use a path inside the project`;
    if (isOutside(rel)) {
      errors.push(outside);
      continue;
    }
    const shown = rel.split(path.sep).join('/');

    if (ref === 'worktree') {
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
          errors.push(`✖ mak.compare.${field}: "${rawPath}" is a folder → name a file`);
          continue;
        }
        text = readFileSync(fd, 'utf8');
      } catch {
        errors.push(`✖ mak.compare.${field}: cannot read "${rawPath}" → check the path`);
        continue;
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
      read = true;
      const kept = keep(shown, text, total, notes, caps);
      if (kept) {
        files[shown] = kept.body;
        total = kept.total;
      }
      continue;
    }

    // Run git in the repo that actually contains this file (its own nearest toplevel), not always the
    // MM3 root — a nested repo is otherwise invisible ("fatal: not a git repository"). Falls back to
    // root when the file isn't inside any repo at all, same as always (an ordinary "ref not found" follows).
    const gitRoot = gitRootOf(path.dirname(full), spawn) ?? root;
    const gitRel = path.relative(gitRoot, full).split(path.sep).join('/');
    const result = spawn('git', ['show', `${ref}:${gitRel}`], { cwd: gitRoot, encoding: 'utf8' });
    const stderr = typeof result.stderr === 'string' ? result.stderr : '';
    if (result.status !== 0 || FATAL.test(stderr)) {
      errors.push(`✖ mak.compare.${field}: "${ref}" not found by git (or the path doesn't exist there) → check the ref and the path`);
      continue;
    }
    read = true;
    const kept = keep(shown, typeof result.stdout === 'string' ? result.stdout : '', total, notes, caps);
    if (kept) {
      files[shown] = kept.body;
      total = kept.total;
    }
  }

  if (errors.length) return { ok: false, errors };
  if (read) notes.push(WHOLE_FILE_NOTE);
  return { ok: true, files, notes };
}

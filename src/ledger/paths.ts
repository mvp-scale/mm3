/** Where the ledger lives: <root>/.mm3/. Root = MM3_HOME, else the nearest folder with .mm3 or .git. */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface Mm3Paths {
  root: string;
  dir: string;
  log: string;
  lock: string;
  budget: string;
  /** The id index sidecar (ledger/index.ts): a disposable SQLite db, rebuildable from log.jsonl, never the
   *  source of truth. Node < 22.13 (no node:sqlite) never creates this file at all — see index.ts's fallback. */
  index: string;
  /** Plan 2c B1: sparse, project-shared overrides of the one code defaults table (src/config/defaults.ts).
   *  Unlike everything else here, this one is meant to be committed — see ensureDir's `.gitignore` exception
   *  below — so a team's own budget/provider/pricing/reuse choices travel with the repo. Read-only from this
   *  module's own point of view: nothing under ledger/ ever creates or writes this file. */
  config: string;
  /** The ACTIVE copy of that config: the validated overrides plus a fingerprint of the file they were loaded
   *  from (config/active.ts). Requests read this, never config.yaml, once it exists. Ignored by git. */
}

export function pathsFor(root: string): Mm3Paths {
  const dir = path.join(root, '.mm3');
  return {
    root,
    dir,
    log: path.join(dir, 'log.jsonl'),
    lock: path.join(dir, 'lock'),
    budget: path.join(dir, 'budget.json'),
    index: path.join(dir, 'index.db'),
    config: path.join(dir, 'config.yaml'),
  };
}

/**
 * Creates .mm3/ (if missing) and a self-ignoring `.mm3/.gitignore` holding `*`, so nothing inside
 * is committed by default even when a user never ran `mm3 init` and
 * `.mm3/` is only ever created lazily, by the first ledger/budget/index write. Called from every one of
 * those write paths (log.ts, budget.ts, ledger/index.ts) and from init's own explicit "create the project"
 * step, so first-run users are covered either way. Idempotent and cheap: skips the write once the file exists.
 *
 * One exception to the blanket ignore: `config.yaml` holds a project's own shared settings
 * (budget caps, provider, pricing, reuse limits) — the opposite of everything else in here, which is
 * per-machine/disposable. `!config.yaml` un-ignores it so a team that chooses to create one can commit it
 * with the rest of the project; nothing here ever creates that file itself (config/load.ts only ever reads
 * it, and only if a user put it there).
 */
export function ensureDir(paths: Pick<Mm3Paths, 'dir'>): void {
  mkdirSync(paths.dir, { recursive: true });
  const gitignore = path.join(paths.dir, '.gitignore');
  try {
    writeFileSync(gitignore, '*\n!config.yaml\n', { flag: 'wx' }); // create only if absent, in one step
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
  }
}

/** The nearest folder at or above cwd holding .mm3 or .git; undefined outside any project. */
export function findRoot(cwd: string): string | undefined {
  let dir = path.resolve(cwd);
  for (;;) {
    if (existsSync(path.join(dir, '.mm3')) || existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}

/**
 * The project's paths, or undefined outside any project: we never create .mm3/ in whatever folder an agent
 * happens to be in (its home, /tmp, a scratch dir). MM3_HOME names the project explicitly.
 */
export function resolvePaths(cwd: string = process.cwd(), env: Record<string, string | undefined> = process.env): Mm3Paths | undefined {
  const home = env.MM3_HOME?.trim();
  const root = home ? path.resolve(home) : findRoot(cwd);
  return root === undefined ? undefined : pathsFor(root);
}

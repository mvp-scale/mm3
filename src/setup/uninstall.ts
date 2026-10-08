/**
 * `mm3 uninstall`: reverses init. Using MM3 is scoped per project, so by default this only disables
 * the CURRENT project — the plugin's project-scope install, and (with confirmation; kept by default, since
 * it's the user's run history) that project's `.mm3/`. The per-user parts — the stored key and the CLI
 * itself, shared across every project — are only touched with `--all`, which also then reaches every plugin
 * scope found (not just this project's) and the marketplace/cache dir it left behind. `--yes` takes the
 * default answer everywhere: yes for removal steps that run, no for `.mm3/` (removing run history needs
 * an explicit yes). `--keep-key`/`--keep-data` skip their step outright, with no question asked.
 *
 * Each step checks its own filesystem/PATH facts before asking (`stepKey` skips the question outright when
 * nothing is stored; `stepCli` falls back to `detectInstallMode` when `install.json` is missing but the CLI's
 * own resolved PATH entry makes the install mode obvious, same as `mm3 doctor`'s own `cli:` line) and
 * again after acting, so anything still found — from a failure, or a deliberate "keep it" — gets folded into a
 * final "manual backup" block with the exact command or path to finish the job by hand. The immediate
 * `✖ problem` line already says what went wrong (AGENTS.md rule 7); the backup block is the single place to
 * look afterward for everything left over.
 */
import { existsSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { clearInstallRecord, readInstallRecord, type InstallMode } from './install-record.ts';
import { removeStoredKey, resolveStoredKey } from './keystore.ts';
import { findOnPath, npmGlobalPrefix } from './npm-info.ts';
import { marketplaceExists, pluginCacheDir, pluginStatus, removeMarketplace, removePluginCacheDir, uninstallPlugin } from './plugin.ts';
import { confirm, type PromptIO } from './prompt.ts';
import type { Runner } from './runner.ts';
import { removeStandalone, standaloneBinPath, standalonePluginDir } from './standalone.ts';

export interface UninstallFlags {
  /** Also remove the per-user parts: the stored key, the CLI itself, every plugin scope (not just this
   *  project's), and the marketplace/cache dir it left behind. */
  all: boolean;
  keepKey: boolean;
  keepData: boolean;
  yes: boolean;
}

export interface UninstallCtx {
  env: Record<string, string | undefined>;
  cwd: string;
  platform: NodeJS.Platform;
  runner: Runner;
  io: PromptIO;
  homeDir: string;
  pkgName: string;
}

type Status = 'done' | 'already' | 'skipped' | 'problem';
const GLYPH: Record<Status, string> = { done: '✔', already: '·', skipped: '–', problem: '✖' };
const line = (status: Status, label: string, text: string): string => `${GLYPH[status]} ${label}: ${text}`;

async function ask(promptText: string, defaultAnswer: boolean, flags: UninstallFlags, io: PromptIO): Promise<boolean> {
  return flags.yes ? defaultAnswer : confirm(promptText, defaultAnswer, io);
}

/** When there's no `install.json` (predates this record, was cleared, or a hand-installed copy `init` never
 *  touched), guess the install mode from the CLI's own resolved PATH entry — the same signal `mm3 doctor`
 *  already trusts for its `cli:` line: under this project's own `node_modules` → local; under npm's global
 *  prefix → global; under the user prefix (`~/.local`, what `--user` installs into) → user. Undefined when
 *  `mm3` isn't found on PATH at all, or resolves somewhere none of the three explain — nothing safe to
 *  guess from either way, same as no record. */
function detectInstallMode(ctx: UninstallCtx): { mode: InstallMode; npmPrefix?: string; projectDir?: string } | undefined {
  const onPath = findOnPath('mm3', ctx.env, ctx.platform);
  if (!onPath) return undefined;
  let real: string;
  try {
    real = realpathSync(onPath);
  } catch {
    real = onPath;
  }
  const within = (dir: string): boolean => real === dir || real.startsWith(dir.endsWith(path.sep) ? dir : `${dir}${path.sep}`);
  // `real` has symlinks resolved (macOS: /private/var/… for a /var/… home or temp folder), so the folder is also tried the same way
  const under = (dir: string): boolean => {
    if (within(dir)) return true;
    try {
      return within(realpathSync(dir));
    } catch {
      return false;
    }
  };
  if (under(path.join(ctx.cwd, 'node_modules'))) return { mode: 'local', projectDir: ctx.cwd };
  const globalPrefix = npmGlobalPrefix(ctx.runner);
  if (globalPrefix && under(globalPrefix)) return { mode: 'global', npmPrefix: globalPrefix };
  const userPrefix = path.join(ctx.homeDir, '.local');
  if (under(userPrefix)) return { mode: 'user', npmPrefix: userPrefix };
  return undefined;
}

/** Default: this project's own plugin install only. `--all`: every scope found, plus the shared marketplace
 *  registration and the cache dir Claude leaves behind — both global Claude Code state, not project-scoped, so
 *  they're left alone unless the user is explicitly clearing out everything. Names what it found before asking,
 *  and folds anything kept or that failed into `manual` for the final backup block. */
async function stepPlugin(flags: UninstallFlags, ctx: UninstallCtx, manual: string[]): Promise<string[]> {
  const status = pluginStatus(ctx.runner);
  const scopesToRemove = flags.all ? status.scopes : status.scopes.filter((s) => s === 'project');
  const marketplace = flags.all && marketplaceExists(ctx.runner);
  const cacheDirExists = flags.all && existsSync(pluginCacheDir(ctx.homeDir));

  if (!scopesToRemove.length && !marketplace && !cacheDirExists) return [line('already', 'plugin', 'nothing to remove here')];

  const manualCmds = [
    ...scopesToRemove.map((s) => `claude plugin uninstall mm3@mvp-scale --scope ${s}`),
    ...(marketplace ? ['claude plugin marketplace remove mvp-scale'] : []),
    ...(cacheDirExists ? [`rm -rf ${pluginCacheDir(ctx.homeDir)}`] : []),
  ];
  const found = [
    scopesToRemove.length ? `mm3@mvp-scale at ${scopesToRemove.join(', ')} scope` : '',
    marketplace ? 'the mvp-scale marketplace' : '',
    cacheDirExists ? 'a leftover plugin cache dir' : '',
  ]
    .filter(Boolean)
    .join(', ');
  const remove = await ask(`Found ${found}. Remove ${flags.all ? 'all of it' : 'it'}?`, true, flags, ctx.io);
  if (!remove) {
    manual.push(`plugin: ${manualCmds.join(' · ')}`);
    return [line('skipped', 'plugin', 'skipped (kept)')];
  }

  const lines: string[] = [];
  for (const scope of scopesToRemove) {
    const r = uninstallPlugin(ctx.runner, scope);
    if (r.status === 0) {
      lines.push(line('done', 'plugin', `uninstalled mm3@mvp-scale (${scope} scope)`));
    } else {
      lines.push(line('problem', 'plugin', `could not uninstall (${scope} scope)`));
      manual.push(`plugin (${scope} scope): claude plugin uninstall mm3@mvp-scale --scope ${scope}`);
    }
  }
  if (marketplace) {
    const r = removeMarketplace(ctx.runner);
    if (r.status === 0) {
      lines.push(line('done', 'plugin', 'removed the mvp-scale marketplace'));
    } else {
      lines.push(line('problem', 'plugin', 'could not remove the mvp-scale marketplace'));
      manual.push('marketplace: claude plugin marketplace remove mvp-scale');
    }
  }
  if (flags.all) {
    if (removePluginCacheDir(ctx.homeDir)) lines.push(line('done', 'plugin', 'removed the plugin cache dir'));
    else lines.push(line('already', 'plugin', 'no plugin cache dir left behind'));
  }
  return lines;
}

/** Per user, shared across every project — only touched with `--all`. Checks whether a key is actually stored
 *  before asking, and re-checks after removal so a key still resolving from either source is named, not
 *  silently assumed gone. */
async function stepKey(flags: UninstallFlags, ctx: UninstallCtx, manual: string[]): Promise<string[]> {
  if (!flags.all) return [line('skipped', 'key', 'skipped (per-user; use --all to remove it)')];
  if (flags.keepKey) return [line('skipped', 'key', 'skipped (--keep-key)')];
  const found = resolveStoredKey(ctx.runner, ctx.platform, ctx.env);
  if (!found) return [line('already', 'key', 'nothing stored')];

  const remove = await ask(`Found a stored key (${found.source === 'keychain' ? 'OS keychain' : 'the env file'}). Remove it?`, true, flags, ctx.io);
  if (!remove) {
    manual.push('key: remove it by hand — the OS keychain entry, and/or TYPESAFE_API_KEY/AI_GATEWAY_API_KEY in the env file mm3 init wrote');
    return [line('skipped', 'key', 'skipped (kept)')];
  }
  const { removed } = removeStoredKey(ctx.runner, ctx.platform, ctx.env);
  const lines = [line('done', 'key', `removed from ${removed.length ? removed.join(' and ') : 'nowhere (already gone)'}`)];
  const stillThere = resolveStoredKey(ctx.runner, ctx.platform, ctx.env);
  if (stillThere) {
    lines.push(line('problem', 'key', `still resolves from ${stillThere.source} → could not remove it automatically`));
    manual.push(`key: still in the ${stillThere.source === 'keychain' ? 'OS keychain' : 'env file'} — remove it by hand`);
  }
  return lines;
}

/** This project's own `.mm3/` — always considered (not gated on --all: it's this project's data,
 *  regardless of whether the per-user parts are also being removed), kept by default even under --yes.
 *  Re-checks after `rmSync` (a permission problem doesn't always throw the way `force: true` expects) and
 *  folds a kept-or-failed directory into the manual backup block either way. */
async function stepData(flags: UninstallFlags, ctx: UninstallCtx, manual: string[]): Promise<string[]> {
  if (flags.keepData) return [line('skipped', 'project', 'skipped (--keep-data)')];
  const dir = `${ctx.cwd}/.mm3`;
  if (!existsSync(dir)) return [line('already', 'project', 'no .mm3/ here')];
  const remove = flags.yes ? false : await confirm("Remove this project's .mm3/ (your run history)? This cannot be undone.", false, ctx.io);
  if (!remove) {
    manual.push(`project data: rm -rf ${dir}`);
    return [line('skipped', 'project', 'kept .mm3/ (default: no)')];
  }
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // fall through to the re-check below, which reports it either way
  }
  if (existsSync(dir)) {
    manual.push(`project data: rm -rf ${dir}`);
    return [line('problem', 'project', `could not remove ${dir} → remove it by hand: rm -rf ${dir}`)];
  }
  return [line('done', 'project', 'removed .mm3/')];
}

/** The standalone's removal: the one file and the plugin folder `init` placed, then the record. Where the system
 *  will not delete a running program (Windows), the file is named in the manual backup block instead. */
async function stepCliStandalone(binPath: string, pluginDir: string, flags: UninstallFlags, ctx: UninstallCtx, manual: string[]): Promise<string[]> {
  const remove = await ask(`Found the standalone installed at ${binPath}. Remove it?`, true, flags, ctx.io);
  if (!remove) {
    manual.push(`cli: the standalone is at ${binPath} (plugin folder ${pluginDir}) — remove them yourself when ready`);
    return [line('skipped', 'cli', 'skipped (kept)')];
  }
  const left = removeStandalone(binPath, pluginDir);
  if (left.length) {
    manual.push(`cli: rm -rf ${left.join(' ')}`);
    return [line('problem', 'cli', `could not remove ${left.join(' and ')} → remove ${left.length > 1 ? 'them' : 'it'} by hand: rm -rf ${left.join(' ')}`)];
  }
  clearInstallRecord(ctx.env);
  const lines = [line('done', 'cli', 'uninstalled (was standalone)')];
  const stillOnPath = findOnPath('mm3', ctx.env, ctx.platform);
  if (stillOnPath) {
    lines.push(line('problem', 'cli', `still resolves on PATH at ${stillOnPath} → a stale PATH entry or a second copy elsewhere; remove it by hand if a shell still finds it`));
    manual.push(`cli: still on PATH at ${stillOnPath} — check for a second install or a stale shell hash`);
  }
  return lines;
}

/** Per user, shared across every project — only touched with `--all`. Falls back to `detectInstallMode` when
 *  there's no `install.json`, so a real, path-detectable install still gets a real removal attempt instead of
 *  immediately handing back manual commands; re-checks PATH afterward for a stale entry or a second copy. */
async function stepCli(flags: UninstallFlags, ctx: UninstallCtx, manual: string[]): Promise<string[]> {
  if (!flags.all) return [line('skipped', 'cli', 'skipped (per-user; use --all to remove it)')];
  const record = readInstallRecord(ctx.env);
  if (record?.mode === 'standalone') return stepCliStandalone(record.binPath ?? standaloneBinPath(ctx.homeDir, ctx.platform), record.pluginDir ?? standalonePluginDir(ctx.homeDir), flags, ctx, manual);
  const detected = record ? undefined : detectInstallMode(ctx);
  const loc = record ?? detected;
  if (!loc) {
    const cmds = `npm uninstall -g ${ctx.pkgName} · npm uninstall -g --prefix ~/.local ${ctx.pkgName} · npm uninstall -D ${ctx.pkgName} (in your project)`;
    manual.push(`cli: don't know how this was installed — try: ${cmds}`);
    return [line('problem', 'cli', `don't know how this was installed → run one of: ${cmds}`)];
  }

  const guessedNote = record ? '' : ' (guessed from its own path on PATH — no install record found)';
  const remove = await ask(`Found the CLI installed --${loc.mode}${guessedNote}. Remove it?`, true, flags, ctx.io);
  if (!remove) {
    manual.push(`cli: was installed --${loc.mode} — remove it yourself when ready`);
    return [line('skipped', 'cli', 'skipped (kept)')];
  }

  const args =
    loc.mode === 'global'
      ? ['uninstall', '-g', ctx.pkgName]
      : loc.mode === 'user'
        ? ['uninstall', '-g', '--prefix', loc.npmPrefix ?? '', ctx.pkgName]
        : ['uninstall', ctx.pkgName];
  const r = ctx.runner('npm', args);
  if (r.status !== 0) {
    manual.push(`cli: npm ${args.join(' ')}`);
    return [line('problem', 'cli', `npm ${args.join(' ')} failed → ${r.stderr.trim().split('\n')[0] ?? "see npm's own output"}`)];
  }
  clearInstallRecord(ctx.env);
  const lines = [line('done', 'cli', `uninstalled (was --${loc.mode}${guessedNote})`)];
  const stillOnPath = findOnPath('mm3', ctx.env, ctx.platform);
  if (stillOnPath) {
    lines.push(line('problem', 'cli', `still resolves on PATH at ${stillOnPath} → a stale PATH entry or a second copy elsewhere; remove it by hand if a shell still finds it`));
    manual.push(`cli: still on PATH at ${stillOnPath} — check for a second install or a stale shell hash`);
  }
  return lines;
}

export async function runUninstall(flags: UninstallFlags, ctx: UninstallCtx): Promise<{ exit: 0; text: string }> {
  const manual: string[] = [];
  const lines: string[] = [];
  lines.push(...(await stepPlugin(flags, ctx, manual)));
  lines.push(...(await stepData(flags, ctx, manual)));
  lines.push(...(await stepKey(flags, ctx, manual)));
  lines.push(...(await stepCli(flags, ctx, manual)));
  if (manual.length) {
    lines.push('', 'manual backup — finish these by hand if you want to:', ...manual.map((m) => `  - ${m}`));
  }
  return { exit: 0, text: `${lines.join('\n')}\n` };
}

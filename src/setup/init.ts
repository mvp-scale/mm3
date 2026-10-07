/**
 * `mm3 init`: makes the CLI reachable and gets a key stored somewhere real (both per user, shared across
 * every project), then — per project, since using MM3 is always scoped to the project whose code and
 * ledger it's answering about — wires up the Claude Code plugin at project scope and sets up `.mm3/`.
 * Idempotent (a re-run that finds a step already done says so and changes nothing) and interactive by default;
 * `--yes` takes the default answer everywhere. Every step prints exactly one line, glyph first: `✔ done`,
 * `· already`, `– skipped (why)`, or `✖ problem → fix`.
 *
 * Run outside a git project, only the two per-user steps (CLI, key) run; there's no project to enable MM3
 * for, so init stops there with one line telling the user to cd into one.
 *
 * Every external effect (npm, claude, the OS keychain, a real prompt) comes in through `InitCtx`'s `runner`/
 * `io`/`keyStdin`, so a test drives the whole flow with no real process ever spawned and no real file outside a
 * temp dir ever touched.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hasKey, resolveJevConfig } from '../classifier/typesafe/config.ts';
import { ensureDir, pathsFor } from '../ledger/paths.ts';
import { runDoctor } from '../verbs/doctor.ts';
import type { VerbResult } from '../verbs/types.ts';
import { planAgents } from './agents-file.ts';
import { readInstallRecord, writeInstallRecord, type InstallMode } from './install-record.ts';
import { resolveStoredKey, storeKey } from './keystore.ts';
import { detectSelfSpec, findOnPath, isWritableDir, npmGlobalPrefix } from './npm-info.ts';
import { addMarketplace, installPlugin, marketplaceExists, pluginStatus, type PluginScope } from './plugin.ts';
import { confirm, readHidden, readLine, readOneLine, type PromptIO } from './prompt.ts';
import type { Runner } from './runner.ts';
import { installBinary, installPluginDir, standaloneBinPath, standalonePluginDir } from './standalone.ts';
import { isStandalone } from '../util/embedded.ts';

export interface InitFlags {
  mode?: InstallMode;
  claude?: boolean; // true: --claude, false: --no-claude, undefined: auto (use claude if it's on PATH)
  scope?: 'user' | 'project'; // default: 'project' — using MM3 is scoped per project
  key: 'ask' | 'stdin' | 'no';
  yes: boolean;
  /** `--agents`: run only the AGENTS.md / CLAUDE.md guidance step (no install, key or plugin). */
  agents?: boolean;
}

export interface InitCtx {
  env: Record<string, string | undefined>;
  cwd: string;
  platform: NodeJS.Platform;
  runner: Runner;
  io: PromptIO;
  /** Only read when flags.key === 'stdin'. */
  keyStdin?: NodeJS.ReadableStream;
  packageDir: string;
  pkg: { name: string; version: string };
  homeDir: string;
  now?: () => string;
}

type Status = 'done' | 'already' | 'skipped' | 'problem';
const GLYPH: Record<Status, string> = { done: '✔', already: '·', skipped: '–', problem: '✖' };
/** Every step line, glyph first: "✔ cli: installed --user (...)". */
const line = (status: Status, label: string, text: string): string => `${GLYPH[status]} ${label}: ${text}`;
const nowIso = (ctx: InitCtx): string => (ctx.now ?? (() => new Date().toISOString()))();
const firstLine = (s: string): string => s.trim().split('\n')[0] ?? '';
/** `<what> failed → <fix>` for an outside command: the runner reports a command that is not installed as
 *  "spawnSync npm ENOENT", which says nothing a person can act on, so that becomes "not found on PATH". */
function failed(what: string, r: { stderr: string }, fallback: string): string {
  const missing = /spawnSync (\S+) ENOENT/.exec(r.stderr)?.[1];
  if (missing) return `${what} failed (${missing} was not found on PATH) → install ${missing === 'npm' ? 'Node.js, which includes npm' : missing}, then re-run "mm3 init"`;
  return `${what} failed → ${firstLine(r.stderr) || fallback}`;
}
const insideGitProject = (cwd: string): boolean => existsSync(path.join(cwd, '.git'));

/** Is `binPath` (resolved off PATH) actually a copy of the named package, not some other `mm3`? Walks up
 *  from its realpath to the first package.json it finds — a bin file always sits 1-3 levels under the package
 *  root (dist/cli.js, or a bin symlink one level up again). */
function isPackageBin(binPath: string, pkgName: string): boolean {
  try {
    let dir = path.dirname(realpathSync(binPath));
    for (let i = 0; i < 6; i++) {
      const pj = path.join(dir, 'package.json');
      if (existsSync(pj)) {
        const meta = JSON.parse(readFileSync(pj, 'utf8')) as { name?: string };
        return meta.name === pkgName;
      }
      const up = path.dirname(dir);
      if (up === dir) return false;
      dir = up;
    }
  } catch {
    return false;
  }
  return false;
}

function defaultMode(cwd: string, prefixWritable: boolean): InstallMode {
  if (existsSync(path.join(cwd, 'package.json'))) return 'local';
  return prefixWritable ? 'global' : 'user';
}

/** A path resolved inside npm's npx cache (`~/.npm/_npx/<hash>/...` on POSIX; the Windows npx cache also sits
 *  under a `_npx` folder) is a throwaway copy npx fetched for one run, not a durable install — re-running
 *  `init` from such a copy would report "already reachable" and never actually install anything that survives
 *  past that one run. Checked as a plain path segment so it works whether or not the cache entry itself has
 *  since been pruned. */
function isNpxCache(binPath: string): boolean {
  return binPath.split(path.sep).includes('_npx');
}

/** The standalone's version of the install step: the same end state npm's gives (a file on PATH, the plugin
 *  folder the marketplace registers, install.json), with the running file standing in for the package. Run
 *  again it changes nothing; run from a newer file it replaces the installed one in place. */
function stepCliStandalone(flags: InitFlags, ctx: InitCtx): string[] {
  if (flags.mode && flags.mode !== 'user') {
    return [line('problem', 'cli', `the standalone installs per user, into ~/.local/bin → drop --${flags.mode}, or run "mm3 init --user"`)];
  }
  const binPath = standaloneBinPath(ctx.homeDir, ctx.platform);
  const pluginDir = standalonePluginDir(ctx.homeDir);
  const record = readInstallRecord(ctx.env);
  const placed = installBinary(process.execPath, binPath, record?.mode === 'standalone' ? record.version : undefined, ctx.pkg.version);
  if (placed.status === 'problem') return [line('problem', 'cli', placed.text)];
  const folder = installPluginDir(pluginDir, binPath);
  if (folder.status === 'problem') return [line('done', 'cli', placed.text), line('problem', 'cli', folder.text)];
  const lines = [line(placed.status, 'cli', placed.text), line(folder.status, 'cli', folder.text)];
  if (record?.mode !== 'standalone' || record.binPath !== binPath || record.version !== ctx.pkg.version) {
    writeInstallRecord(ctx.env, { mode: 'standalone', binPath, pluginDir, version: ctx.pkg.version, installedAt: nowIso(ctx) });
  }
  const bin = path.dirname(binPath);
  if (!(ctx.env.PATH ?? '').split(path.delimiter).includes(bin)) lines.push(line('problem', 'cli', `${bin} is not on PATH → add this to your shell profile: export PATH="${bin}:$PATH"`));
  return lines;
}

async function stepCli(flags: InitFlags, ctx: InitCtx): Promise<string[]> {
  if (isStandalone()) return stepCliStandalone(flags, ctx);
  const onPath = findOnPath('mm3', ctx.env, ctx.platform);
  if (onPath && !isNpxCache(onPath) && isPackageBin(onPath, ctx.pkg.name) && !flags.mode) {
    return [line('already', 'cli', `already reachable as ${onPath}`)];
  }
  const prefix = npmGlobalPrefix(ctx.runner);
  const globalWritable = prefix ? isWritableDir(prefix) : false;
  const mode = flags.mode ?? defaultMode(ctx.cwd, globalWritable);
  const self = detectSelfSpec(ctx.packageDir, ctx.pkg);

  if (mode === 'global') {
    if (!globalWritable) {
      return [line('problem', 'cli', 'the global npm prefix needs sudo → re-run "mm3 init --user" instead (never runs sudo for you)')];
    }
    const r = ctx.runner('npm', ['install', '-g', self.spec]);
    if (r.status !== 0) return [line('problem', 'cli', failed(`npm install -g ${self.spec}`, r, "see npm's own output"))];
    writeInstallRecord(ctx.env, { mode: 'global', npmPrefix: prefix, installedAt: nowIso(ctx) });
    return [line('done', 'cli', `installed --global (npm prefix ${prefix})`)];
  }

  if (mode === 'user') {
    const userPrefix = path.join(ctx.homeDir, '.local');
    const r = ctx.runner('npm', ['install', '-g', '--prefix', userPrefix, self.spec]);
    if (r.status !== 0) return [line('problem', 'cli', failed(`npm install -g --prefix ${userPrefix} ${self.spec}`, r, "see npm's own output"))];
    writeInstallRecord(ctx.env, { mode: 'user', npmPrefix: userPrefix, installedAt: nowIso(ctx) });
    const bin = path.join(userPrefix, 'bin');
    const onPathNow = (ctx.env.PATH ?? '').split(path.delimiter).includes(bin);
    const lines = [line('done', 'cli', `installed --user (npm prefix ${userPrefix})`)];
    if (!onPathNow) lines.push(line('problem', 'cli', `${bin} is not on PATH → add this to your shell profile: export PATH="${bin}:$PATH"`));
    return lines;
  }

  // local
  const r = ctx.runner('npm', ['install', '-D', self.spec]);
  if (r.status !== 0) return [line('problem', 'cli', failed(`npm install -D ${self.spec}`, r, "see npm's own output"))];
  writeInstallRecord(ctx.env, { mode: 'local', projectDir: ctx.cwd, installedAt: nowIso(ctx) });
  return [line('done', 'cli', `installed --local (run it as npx mm3, in ${ctx.cwd})`)];
}

async function stepKey(flags: InitFlags, ctx: InitCtx): Promise<string[]> {
  if (flags.key === 'no') return [line('skipped', 'key', 'skipped (--no-key)')];

  if (flags.key === 'ask') {
    const existing = resolveJevConfig(ctx.env, { resolveStored: () => resolveStoredKey(ctx.runner, ctx.platform, ctx.env) });
    if (hasKey(existing)) {
      const replace = flags.yes ? false : await confirm(`A key already resolves (from ${existing.keySource}). Replace it?`, false, ctx.io);
      if (!replace) return [line('already', 'key', `already set (from ${existing.keySource})`)];
    }
  }

  let secret: string;
  if (flags.key === 'stdin') {
    if (!ctx.keyStdin) return [line('skipped', 'key', 'skipped (--key-stdin given but nothing to read from)')];
    secret = (await readOneLine(ctx.keyStdin)).trim();
  } else if (flags.yes) {
    secret = '';
  } else {
    secret = (await readHidden('Paste your TypeSafe API key (input hidden; Enter to skip and use the free fake provider): ', ctx.io)).trim();
  }

  if (!secret) return [line('skipped', 'key', 'skipped (no key entered — the free fake provider will be used)')];
  if (/\s/u.test(secret)) return [line('problem', 'key', 'the pasted value has whitespace in it → paste just the key, with nothing else')];
  if (secret.includes("'")) return [line('problem', 'key', "the pasted value contains a single quote, which the user file can't represent → use a key without one")];

  let provider: 'typesafe' | 'gateway' = 'typesafe';
  if (flags.key === 'ask' && !flags.yes) {
    const answer = (await readLine('Which provider is this key for? [typesafe/gateway] (default: typesafe): ', ctx.io)).trim().toLowerCase();
    if (answer === 'gateway') provider = 'gateway';
  }

  const stored = storeKey(ctx.runner, ctx.platform, ctx.env, provider, secret);
  return [line('done', 'key', `stored in ${stored.detail} — checked on first real call`)];
}

async function stepPlugin(flags: InitFlags, ctx: InitCtx): Promise<string[]> {
  if (flags.claude === false) return [line('skipped', 'plugin', 'skipped (--no-claude)')];
  const claudeOnPath = findOnPath('claude', ctx.env, ctx.platform) !== undefined;
  if (flags.claude !== true && !claudeOnPath) return [line('skipped', 'plugin', 'skipped (claude not found on PATH)')];

  const lines: string[] = [];
  if (!marketplaceExists(ctx.runner)) {
    const r = addMarketplace(ctx.runner, isStandalone() ? standalonePluginDir(ctx.homeDir) : ctx.packageDir);
    lines.push(r.status === 0 ? line('done', 'plugin', 'added the mvp-scale marketplace') : line('problem', 'plugin', `could not add the mvp-scale marketplace → ${firstLine(r.stderr)}`));
  } else {
    lines.push(line('already', 'plugin', 'mvp-scale marketplace already added'));
  }

  // Using MM3 is scoped per project: the plugin defaults to project scope, enabled just for the project
  // init runs in — --scope user remains available as an explicit override.
  const scope: PluginScope = flags.scope ?? 'project';
  const status = pluginStatus(ctx.runner);
  if (status.installed && (status.scopes as string[]).includes(scope)) {
    lines.push(line('already', 'plugin', `mm3@mvp-scale already installed (${scope} scope)`));
    return lines;
  }
  const r = installPlugin(ctx.runner, scope);
  lines.push(r.status === 0 ? line('done', 'plugin', `installed mm3@mvp-scale (${scope} scope)`) : line('problem', 'plugin', `could not install the plugin → ${firstLine(r.stderr)}`));
  return lines;
}

function stepProject(ctx: InitCtx): string[] {
  const paths = pathsFor(ctx.cwd);
  const already = existsSync(paths.dir);
  ensureDir(paths);
  return [line(already ? 'already' : 'done', 'project', `${already ? 'already has' : 'created'} .mm3/ (self-ignoring: .mm3/.gitignore)`)];
}

/** `mm3 init --agents`: show exactly what would be written to which file, then write only on --yes or a yes at
 *  the prompt. A non-terminal input (the MCP path, a pipe) is never prompted — it shows the lines and says
 *  to re-run with --yes. Idempotent: a project already set up prints one line and changes nothing. */
async function runAgentsStep(flags: InitFlags, ctx: InitCtx): Promise<string[]> {
  const root = ctx.env.MM3_HOME?.trim() || ctx.cwd;
  if (!insideGitProject(root)) return [line('skipped', 'agents', 'not in a git project → cd into one and run "mm3 init --agents" there')];
  const plan = planAgents(root);
  if (plan.problem) return [line('problem', 'agents', plan.problem)];
  if (plan.edits.length === 0) return [line('already', 'agents', 'already set up (AGENTS.md has the mm3 block; CLAUDE.md imports it) — nothing changed')];

  const preview = plan.edits.map((e) => `agents: will ${e.verb} ${e.file}:\n${e.written}`).join('\n\n');
  const interactive = !flags.yes && ctx.io.input.isTTY === true;
  let go = flags.yes;
  if (interactive) {
    ctx.io.output.write(`${preview}\n\n`);
    go = await confirm('Write these?', false, ctx.io);
  }
  const shown = interactive ? [] : [preview, ''];
  if (!go) {
    return [...shown, line('skipped', 'agents', `nothing written${flags.yes || interactive ? '' : ' → re-run with --yes to write these'}`)];
  }
  for (const e of plan.edits) {
    const file = path.join(root, e.file);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, e.content);
  }
  return [...shown, ...plan.edits.map((e) => line('done', 'agents', e.done))];
}

const NOT_A_PROJECT = line('skipped', 'project', 'not in a git project → cd into one and run "mm3 init" there to enable MM3 for it');

export async function runInit(flags: InitFlags, ctx: InitCtx): Promise<VerbResult> {
  if (flags.agents) {
    const out = await runAgentsStep(flags, ctx);
    return { exit: out.some((l) => l.startsWith(GLYPH.problem)) ? 1 : 0, text: `${out.join('\n')}\n` };
  }
  const lines: string[] = [];
  lines.push(...(await stepCli(flags, ctx))); // per user
  lines.push(...(await stepKey(flags, ctx))); // per user

  const inProject = insideGitProject(ctx.cwd);
  if (inProject) {
    lines.push(...(await stepPlugin(flags, ctx))); // per project (default scope)
    lines.push(...stepProject(ctx)); // per project
  } else {
    lines.push(NOT_A_PROJECT);
  }

  const doctorOut = runDoctor(ctx.env, inProject ? pathsFor(ctx.cwd) : undefined, process.version, {
    resolveStored: () => resolveStoredKey(ctx.runner, ctx.platform, ctx.env),
    runner: ctx.runner,
    platform: ctx.platform,
  });

  // A step above may have logged a ✖ problem line (cli/key/plugin all can). PARTIAL: never claim it's usable —
  // point at the fix instead of inviting the first real request. [C-176]
  const partial = lines.some((l) => l.startsWith(GLYPH.problem));
  const next = partial
    ? 'next: not usable yet — fix the ✖ line(s) above, then re-run "mm3 init"'
    : 'next: run "mm3 agent" for the rules and good/bad patterns before your first request, or "mm3 template class" to start by hand';
  // A failed step is not a success: the exit says so, the same way the "not usable yet" line does. Advice that the
  // install worked but its folder is not on PATH yet is a ✖ line to read, not a failed step.
  const failedStep = lines.some((l) => l.startsWith(GLYPH.problem) && !l.includes(' is not on PATH → add '));
  return { exit: failedStep ? 1 : 0, text: `${lines.join('\n')}\n\n${doctorOut.text}\n${next}\n` };
}

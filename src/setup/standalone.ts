/**
 * What `mm3 init` / `mm3 uninstall` do when the running program is the standalone single file (no Node, no
 * package folder). npm's install ends with two things on disk: the package folder (code, skills, plugin
 * manifest) and an `mm3` on PATH pointing into it; `mm3 init` then registers that folder as the `mvp-scale`
 * plugin marketplace. The standalone reproduces that end state with one file in place of the package code:
 *
 *   ~/.local/bin/mm3                       the single file (a real file, replaced in place on upgrade)
 *   ~/.local/share/mm3/plugin/             the plugin folder Claude registers: .claude-plugin/ (the same
 *                                          marketplace.json and plugin.json, but the MCP `command` names the
 *                                          file above) and skills/ (the same text), and hooks/hooks.json (the same
 *                                          events, matchers and timeout, but the command is the file above with
 *                                          `__hook`: the nudge script runs inside the file, no Node needed)
 *   ~/.config/mm3/install.json             the same record npm writes (mode "standalone", file, folder, version)
 *
 * Everything is idempotent: a file whose bytes already match is left alone, and an upgrade is the same call
 * made by a newer file. No `claude` or `npm` is run here (init's plugin step does that, unchanged).
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { embeddedUnder } from '../util/embedded.ts';
import { HOOK_ARG } from './standalone-hook.ts';

type StandaloneResult = { status: 'done' | 'already' | 'problem'; text: string };

/** Package folders the plugin folder carries. `hooks/` is not copied: only hooks.json is, rewritten (pluginFiles). */
const PLUGIN_ROOTS = ['skills'] as const;
const MANIFESTS = ['.claude-plugin/marketplace.json', '.claude-plugin/plugin.json', 'hooks/hooks.json'] as const;

export const standaloneBinPath = (homeDir: string, platform: NodeJS.Platform = process.platform): string =>
  path.join(homeDir, '.local', 'bin', platform === 'win32' ? 'mm3.exe' : 'mm3');
export const standalonePluginDir = (homeDir: string): string => path.join(homeDir, '.local', 'share', 'mm3', 'plugin');

const sha = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

/** The plugin folder's files as relative path to text: the embedded manifests and skills, with the one MCP
 *  server entry rewritten to launch the installed file instead of `node ${CLAUDE_PLUGIN_ROOT}/bin/mm3.mjs`. */
export function pluginFiles(binPath: string): Record<string, string> {
  const files: Record<string, string> = { ...embeddedUnder('.claude-plugin') };
  const hookList = embeddedUnder('hooks')['hooks/hooks.json'];
  if (hookList !== undefined) files['hooks/hooks.json'] = hookList;
  for (const root of PLUGIN_ROOTS) Object.assign(files, embeddedUnder(root));
  for (const m of MANIFESTS) if (files[m] === undefined) throw new Error(`${m} is not embedded in this build`);
  const manifest = JSON.parse(files['.claude-plugin/plugin.json']!) as { mcpServers?: Record<string, { command?: string; args?: string[] }> };
  const server = manifest.mcpServers?.mm3;
  if (!server) throw new Error('plugin.json has no mm3 MCP server to point at the standalone file');
  server.command = binPath;
  server.args = ['mcp'];
  files['.claude-plugin/plugin.json'] = `${JSON.stringify(manifest, null, 2)}\n`;
  const hooks = JSON.parse(files['hooks/hooks.json']!) as { hooks: Record<string, Array<{ hooks: Array<{ command: string; args?: string[] }> }>> };
  for (const groups of Object.values(hooks.hooks)) for (const group of groups) for (const h of group.hooks) Object.assign(h, { command: binPath, args: [HOOK_ARG] });
  files['hooks/hooks.json'] = `${JSON.stringify(hooks, null, 2)}\n`;
  return files;
}

function listFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join('/')]));
}

/** Makes `dir` hold exactly `files`: writes what is missing or different, removes anything else (a file an older
 *  build carried). Returns how many files it changed. */
function syncDir(dir: string, files: Record<string, string>): number {
  let changed = 0;
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(dir, ...rel.split('/'));
    if (existsSync(file) && readFileSync(file, 'utf8') === text) continue;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
    changed += 1;
  }
  for (const rel of listFiles(dir)) {
    if (files[rel] === undefined) {
      rmSync(path.join(dir, ...rel.split('/')), { force: true });
      changed += 1;
    }
  }
  pruneEmpty(dir);
  return changed;
}

function pruneEmpty(dir: string): void {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) pruneEmpty(path.join(dir, e.name));
  if (readdirSync(dir).length === 0) rmdirSync(dir);
}

/** Puts `self` (the running standalone) at `target`: nothing when the bytes already match, otherwise a copy
 *  beside it renamed over it, so an upgrade replaces the file in place and a running copy is never half-written. */
export function installBinary(self: string, target: string, installedVersion: string | undefined, version: string): StandaloneResult {
  try {
    const exists = existsSync(target);
    if (exists && sha(target) === sha(self)) return { status: 'already', text: `already installed as ${target} (${version})` };
    mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.tmp-${process.pid}`;
    copyFileSync(self, tmp);
    chmodSync(tmp, 0o755);
    renameSync(tmp, target);
    const how = !exists ? 'installed' : installedVersion === version ? `replaced (same version ${version}, different build)` : `updated ${installedVersion ?? 'an earlier build'} → ${version}`;
    return { status: 'done', text: `${how} (${target})` };
  } catch (e) {
    return { status: 'problem', text: `could not place the standalone at ${target} → ${(e as Error).message}` };
  }
}

/** Writes the plugin folder for `binPath`; 'already' when every file matched. */
export function installPluginDir(dir: string, binPath: string): StandaloneResult {
  try {
    const changed = syncDir(dir, pluginFiles(binPath));
    return changed === 0 ? { status: 'already', text: `plugin folder already current (${dir})` } : { status: 'done', text: `plugin folder written (${dir})` };
  } catch (e) {
    return { status: 'problem', text: `could not write the plugin folder ${dir} → ${(e as Error).message}` };
  }
}

/** uninstall: removes the file and the plugin folder (and the now-empty `share/mm3`). Returns what is still there. */
export function removeStandalone(binPath: string, pluginDir: string): string[] {
  const left: string[] = [];
  for (const target of [binPath, pluginDir]) {
    try {
      rmSync(target, { recursive: true, force: true });
    } catch {
      // reported below, the same way uninstall re-checks everything it removes
    }
    if (existsSync(target)) left.push(target);
  }
  const share = path.dirname(pluginDir);
  if (existsSync(share) && readdirSync(share).length === 0) rmdirSync(share);
  return left;
}

// The plugin launcher is shipped but not yet the plugin's start command [C-288]. The shipped manifests (.claude-plugin/plugin.json,
// hooks/hooks.json) start MM3 with node, as before the launcher existed; the launcher-form manifests live in launcher/manifests/ as data
// and are what the launcher tests and CI install. Switching over is one deliberate step: copy them over the shipped files and set
// LAUNCHER_WIRED_INTO_PLUGIN in test/helpers/launcher.ts to true. These tests fail on a half switch in either direction.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LAUNCHER_MANIFESTS, LAUNCHER_WIRED_INTO_PLUGIN } from '../helpers/launcher.ts';

type Server = { command: string; args?: string[]; env?: Record<string, string> };
type Hook = { type: string; command: string; args?: string[]; timeout: number };
type Plugin = { mcpServers: { mm3: Server }; userConfig: unknown } & Record<string, unknown>;
type Hooks = { description: string; hooks: Record<string, Array<{ matcher?: string; hooks: Hook[] }>> };

const read = (f: string): string => readFileSync(f, 'utf8');
const shippedPlugin = read('.claude-plugin/plugin.json');
const shippedHooks = read('hooks/hooks.json');
const launcherPlugin = read(LAUNCHER_MANIFESTS.plugin);
const launcherHooks = read(LAUNCHER_MANIFESTS.hooks);
const hookCommands = (h: Hooks): Hook[] => Object.values(h.hooks).flatMap((groups) => groups.flatMap((g) => g.hooks));

describe('the shipped plugin manifests and the launcher switch [C-288]', () => {
  it('[C-288] the shipped manifests name the launcher only when the switch constant says the flip is deliberate', () => {
    for (const text of [shippedPlugin, shippedHooks]) expect(text.includes('mm3-launch')).toBe(LAUNCHER_WIRED_INTO_PLUGIN);
  });

  it('[C-288] while the launcher is dormant the shipped manifests start MM3 exactly as before it existed: node bin/mm3.mjs mcp, node hooks/nudge.mjs', () => {
    if (LAUNCHER_WIRED_INTO_PLUGIN) return;
    const p = JSON.parse(shippedPlugin) as Plugin;
    expect(p.mcpServers.mm3.command).toBe('node');
    expect(p.mcpServers.mm3.args).toEqual(['${CLAUDE_PLUGIN_ROOT}/bin/mm3.mjs', 'mcp']);
    const h = JSON.parse(shippedHooks) as Hooks;
    expect(Object.keys(h.hooks)).toEqual(['PreToolUse']);
    for (const c of hookCommands(h)) {
      expect(c.command).toBe('node');
      expect(c.args).toEqual(['${CLAUDE_PLUGIN_ROOT}/hooks/nudge.mjs']);
    }
  });

  it('[C-288] after the flip the shipped manifests are byte-for-byte the launcher-form ones', () => {
    if (!LAUNCHER_WIRED_INTO_PLUGIN) return;
    expect(shippedPlugin).toBe(launcherPlugin);
    expect(shippedHooks).toBe(launcherHooks);
  });
});

describe('launcher/manifests/ (the launcher-form manifests) [C-288]', () => {
  const plugin = JSON.parse(launcherPlugin) as Plugin;
  const hooks = JSON.parse(launcherHooks) as Hooks;

  it('[C-288] differ from the shipped ones only in the start commands, so the flip is a copy', () => {
    const shipped = JSON.parse(shippedPlugin) as Plugin;
    const strip = (p: Plugin): unknown => ({ ...p, mcpServers: { mm3: { env: p.mcpServers.mm3.env } } });
    expect(strip(plugin)).toEqual(strip(shipped));
    const events = (h: Hooks): unknown => Object.fromEntries(Object.entries(h.hooks).filter(([k]) => k === 'PreToolUse').map(([k, g]) => [k, g.map((x) => x.matcher)]));
    expect(events(hooks)).toEqual(events(JSON.parse(shippedHooks) as Hooks));
  });

  it('[C-288] name the extensionless launcher, and every file the launcher needs exists (execute bit in git and on disk, the .cmd and .ps1 twins, the pin file)', () => {
    expect(plugin.mcpServers.mm3.command).toBe('${CLAUDE_PLUGIN_ROOT}/launcher/mm3-launch');
    expect(plugin.mcpServers.mm3.args).toEqual(['mcp']);
    const cmds = hookCommands(hooks);
    expect(cmds.length).toBeGreaterThanOrEqual(3);
    for (const c of cmds) expect(c.command).toMatch(/^"\$\{CLAUDE_PLUGIN_ROOT\}\/launcher\/mm3-launch" (hook|session-start)$/u);
    for (const f of ['launcher/mm3-launch', 'launcher/mm3-launch.cmd', 'launcher/mm3-launch.ps1', 'launcher/checksums.json']) expect(existsSync(f), f).toBe(true);
    if (process.platform !== 'win32') expect(statSync('launcher/mm3-launch').mode & 0o111).toBe(0o111);
  });

  it('[C-288] the hook events and timeouts are valid, and every other plugin field the manifests carry is the one the shipped plugin has', () => {
    expect(Object.keys(hooks).sort()).toEqual(['description', 'hooks']);
    for (const c of hookCommands(hooks)) {
      expect(c.type).toBe('command');
      expect(c.timeout).toBeLessThanOrEqual(10);
    }
    expect(plugin.userConfig).toEqual((JSON.parse(shippedPlugin) as Plugin).userConfig);
  });
});

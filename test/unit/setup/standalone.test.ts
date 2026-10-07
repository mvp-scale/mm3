// What the standalone's init/uninstall place and remove (src/setup/standalone.ts): the single file, the plugin folder
// with the MCP command naming that file, idempotence, upgrade in place, and removal. The embedded map is faked on
// globalThis the way scripts/build-binary.ts defines it at build time; the real end-to-end run is `npm run parity:install`.
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installBinary, installPluginDir, pluginFiles, removeStandalone, standaloneBinPath, standalonePluginDir } from '../../../src/setup/standalone.ts';

const g = globalThis as { __MM3_EMBEDDED__?: Record<string, string> };
const PLUGIN = JSON.stringify({ name: 'mm3', mcpServers: { mm3: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/bin/mm3.mjs', 'mcp'], env: { K: 'v' } } } });

const HOOKS = JSON.stringify({ description: 'd', hooks: { PreToolUse: [{ matcher: 'Agent|Task', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/nudge.mjs'], timeout: 5 }] }, { matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/nudge.mjs'], timeout: 5 }] }] } });

let home: string;
beforeEach(() => {
  g.__MM3_EMBEDDED__ = {
    '.claude-plugin/plugin.json': PLUGIN,
    '.claude-plugin/marketplace.json': '{"name":"mvp-scale"}',
    'skills/mm3/SKILL.md': 'skill',
    'skills/mm3/templates/class.yaml': 'tpl',
    'hooks/hooks.json': HOOKS,
    'hooks/nudge.cjs': '// script',
  };
  home = mkdtempSync(path.join(os.tmpdir(), 'mm3-standalone-'));
});
afterEach(() => {
  delete g.__MM3_EMBEDDED__;
});

describe('plugin folder', () => {
  it('carries the manifests, skills and hook list, and points the MCP and hook commands at the installed file', () => {
    const bin = standaloneBinPath(home, 'linux');
    const files = pluginFiles(bin);
    expect(Object.keys(files).sort()).toEqual(['.claude-plugin/marketplace.json', '.claude-plugin/plugin.json', 'hooks/hooks.json', 'skills/mm3/SKILL.md', 'skills/mm3/templates/class.yaml']);
    const server = (JSON.parse(files['.claude-plugin/plugin.json']!) as { mcpServers: { mm3: { command: string; args: string[]; env: object } } }).mcpServers.mm3;
    expect(server).toEqual({ command: bin, args: ['mcp'], env: { K: 'v' } });
  });

  it('keeps the hook list as it is (events, matchers, timeout) and changes only the command: the file with __hook, no node', () => {
    const bin = standaloneBinPath(home, 'linux');
    const got = JSON.parse(pluginFiles(bin)['hooks/hooks.json']!) as { description: string; hooks: { PreToolUse: Array<{ matcher: string; hooks: object[] }> } };
    const want = JSON.parse(HOOKS) as typeof got;
    expect(got.description).toBe(want.description);
    expect(got.hooks.PreToolUse.map((g) => g.matcher)).toEqual(['Agent|Task', 'Bash']);
    for (const g of got.hooks.PreToolUse) expect(g.hooks).toEqual([{ type: 'command', command: bin, args: ['__hook'], timeout: 5 }]);
  });

  it('is idempotent, and an update rewrites changed files and removes ones the new build no longer carries', () => {
    const dir = standalonePluginDir(home);
    const bin = standaloneBinPath(home, 'linux');
    expect(installPluginDir(dir, bin).status).toBe('done');
    expect(installPluginDir(dir, bin).status).toBe('already');
    g.__MM3_EMBEDDED__!['skills/mm3/SKILL.md'] = 'skill v2';
    delete g.__MM3_EMBEDDED__!['skills/mm3/templates/class.yaml'];
    expect(installPluginDir(dir, bin).status).toBe('done');
    expect(readFileSync(path.join(dir, 'skills/mm3/SKILL.md'), 'utf8')).toBe('skill v2');
    expect(existsSync(path.join(dir, 'skills/mm3/templates'))).toBe(false);
  });
});

describe('the single file', () => {
  it('is placed, left alone when identical, replaced in place when different, and removed with the plugin folder', () => {
    const self = path.join(home, 'self');
    const target = standaloneBinPath(home, 'linux');
    writeFileSync(self, 'v1');
    expect(installBinary(self, target, undefined, '1.0.0')).toMatchObject({ status: 'done', text: expect.stringContaining('installed') });
    expect(installBinary(self, target, '1.0.0', '1.0.0').status).toBe('already');
    writeFileSync(self, 'v2');
    expect(installBinary(self, target, '1.0.0', '1.1.0').text).toContain('updated 1.0.0 → 1.1.0');
    expect(readFileSync(target, 'utf8')).toBe('v2');

    const dir = standalonePluginDir(home);
    installPluginDir(dir, target);
    expect(removeStandalone(target, dir)).toEqual([]);
    expect(existsSync(target)).toBe(false);
    expect(existsSync(path.dirname(dir))).toBe(false);
  });
});

describe('removal next to the other channel', () => {
  it('leaves a link at the standalone\'s path alone (npm installed over it): that file is npm\'s, not ours', () => {
    const target = standaloneBinPath(home, 'linux');
    const npmFile = path.join(home, 'npm-cli.js');
    writeFileSync(npmFile, '// npm');
    mkdirSync(path.dirname(target), { recursive: true });
    symlinkSync(npmFile, target);
    const dir = standalonePluginDir(home);
    installPluginDir(dir, target);
    expect(removeStandalone(target, dir)).toEqual([]);
    expect(lstatSync(target).isSymbolicLink()).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });
});

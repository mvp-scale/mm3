// The plugin and the command line are two copies of MM3 that can be updated separately. `mm3 doctor` reads Claude's
// record of the plugin install and says plainly when this copy and the plugin are different builds, and which one to update.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pluginInstallInfo } from '../../src/util/plugin-build.ts';
import { runDoctor } from '../../src/verbs/doctor.ts';

/** A fake ~/.claude with one mm3 plugin install whose own package.json says `version`. */
function fakeClaude(version: string | undefined, sha = 'f337f612ebb4cf55b51eb82e39bcabf8bf705e76'): { home: string } {
  const home = mkdtempSync(path.join(os.tmpdir(), 'mm3-claude-'));
  const installPath = path.join(home, '.claude', 'plugins', 'cache', 'mvp-scale', 'mm3', sha.slice(0, 12));
  mkdirSync(installPath, { recursive: true });
  if (version !== undefined) writeFileSync(path.join(installPath, 'package.json'), JSON.stringify({ name: '@mvpscale/mm3', version }));
  writeFileSync(
    path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'mm3@mvp-scale': [{ scope: 'user', installPath, version: sha.slice(0, 12), gitCommitSha: sha, lastUpdated: '2026-10-01T20:24:45.071Z' }] } }),
  );
  return { home };
}

describe('the installed plugin, read from Claude\'s record', () => {
  it('[C-254] gives the plugin\'s own version and the commit it was installed from', () => {
    const { home } = fakeClaude('0.1.1');
    expect(pluginInstallInfo(home, {})).toEqual({ version: '0.1.1', sha: 'f337f612ebb4' });
  });

  it('[C-254] is undefined when nothing is installed, and a missing package.json leaves just the commit', () => {
    expect(pluginInstallInfo(mkdtempSync(path.join(os.tmpdir(), 'mm3-nohome-')), {})).toBeUndefined();
    const { home } = fakeClaude(undefined);
    expect(pluginInstallInfo(home, {})).toEqual({ sha: 'f337f612ebb4' });
  });
});

describe('doctor says whether this copy and the plugin are the same build', () => {
  const doctor = (version: string, plugin?: { version?: string; sha: string }) =>
    runDoctor({}, undefined, undefined, { version, ...(plugin ? { pluginInstall: plugin } : {}) }).text;

  it('[C-254] different versions: a warning with both and the fix', () => {
    const text = doctor('0.1.2', { version: '0.1.1', sha: 'f337f612ebb4' });
    expect(text).toContain('versions: "⚠ the plugin is 0.1.1 (f337f61) and this copy is 0.1.2 → update the older one: /plugin update in Claude Code, or npm install -g @mvpscale/mm3@latest');
  });

  it('[C-254] a nightly copy that differs from the plugin is pointed at @nightly, never at @latest (which would downgrade it)', () => {
    const text = doctor('0.1.2-nightly.20261004.1827.g471c8c7', { version: '0.1.2', sha: 'f337f612ebb4' });
    expect(text).toContain('npm install -g @mvpscale/mm3@nightly');
    expect(text).not.toContain('@latest');
  });

  it('[C-254] the same version: a tick', () => {
    expect(doctor('0.1.2', { version: '0.1.2', sha: 'f337f612ebb4' })).toContain('versions: ✔ the plugin and this copy are both 0.1.2');
  });

  it('[C-254] a nightly build and a plugin at another commit: the same base version is still a mismatch', () => {
    const text = doctor('0.1.2-nightly.20261003.g0a1b2c3', { version: '0.1.2', sha: 'f337f612ebb4' });
    expect(text).toContain('versions: "⚠');
    expect(text).toContain('0a1b2c3');
  });

  it('[C-254] a nightly build at the plugin\'s own commit is in step', () => {
    expect(doctor('0.1.2-nightly.20261003.gf337f61', { version: '0.1.2', sha: 'f337f612ebb4' })).toContain('versions: ✔');
  });

  it('[C-254] no plugin installed here: no versions line at all', () => {
    expect(doctor('0.1.2')).not.toContain('versions:');
  });
});

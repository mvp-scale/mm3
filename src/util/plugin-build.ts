/**
 * Which plugin build this copy of MM3 is. The plugin's manifest pins no version (Claude Code then versions it by
 * the source commit, so updates are seen), and the bundle's own package.json still says the base version — so
 * the commit is read from Claude's record of the install (`installed_plugins.json`), matched by install path.
 * An npm install has no such record and gets nothing; any unreadable record reads the same way.
 */
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const real = (p: string): string => {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

/** The 12-character commit Claude installed this plugin from, or undefined when this copy isn't a plugin install. */
export function pluginCommit(packageDir: string, homeDir: string, env: Record<string, string | undefined>): string | undefined {
  const claudeDir = env.CLAUDE_CONFIG_DIR || path.join(homeDir, '.claude');
  let record: unknown;
  try {
    record = JSON.parse(readFileSync(path.join(claudeDir, 'plugins', 'installed_plugins.json'), 'utf8'));
  } catch {
    return undefined;
  }
  const plugins = (record as { plugins?: Record<string, unknown> })?.plugins;
  if (!plugins || typeof plugins !== 'object') return undefined;
  const here = real(packageDir);
  for (const [name, installs] of Object.entries(plugins)) {
    if (!name.startsWith('mm3@') || !Array.isArray(installs)) continue;
    for (const i of installs as { installPath?: unknown; gitCommitSha?: unknown }[]) {
      if (typeof i?.installPath === 'string' && typeof i.gitCommitSha === 'string' && real(i.installPath) === here) return i.gitCommitSha.slice(0, 12);
    }
  }
  return undefined;
}

/** The mm3 plugin Claude has installed, whichever copy of MM3 is asking: the commit it came from and its own
 *  package.json version (the plugin's manifest pins none). The newest record wins when there are several scopes.
 *  undefined when Claude has no record or it can't be read. */
export function pluginInstallInfo(homeDir: string, env: Record<string, string | undefined>): { version?: string; sha: string } | undefined {
  const claudeDir = env.CLAUDE_CONFIG_DIR || path.join(homeDir, '.claude');
  let record: unknown;
  try {
    record = JSON.parse(readFileSync(path.join(claudeDir, 'plugins', 'installed_plugins.json'), 'utf8'));
  } catch {
    return undefined;
  }
  const plugins = (record as { plugins?: Record<string, unknown> })?.plugins;
  if (!plugins || typeof plugins !== 'object') return undefined;
  let best: { installPath?: unknown; gitCommitSha?: unknown; lastUpdated?: unknown } | undefined;
  for (const [name, installs] of Object.entries(plugins)) {
    if (!name.startsWith('mm3@') || !Array.isArray(installs)) continue;
    for (const i of installs as { installPath?: unknown; gitCommitSha?: unknown; lastUpdated?: unknown }[]) {
      if (typeof i?.gitCommitSha !== 'string') continue;
      if (!best || String(i.lastUpdated ?? '') > String(best.lastUpdated ?? '')) best = i;
    }
  }
  if (!best || typeof best.gitCommitSha !== 'string') return undefined;
  const sha = best.gitCommitSha.slice(0, 12);
  if (typeof best.installPath !== 'string') return { sha };
  try {
    const meta = JSON.parse(readFileSync(path.join(best.installPath, 'package.json'), 'utf8')) as { version?: unknown };
    return typeof meta.version === 'string' ? { version: meta.version, sha } : { sha };
  } catch {
    return { sha };
  }
}

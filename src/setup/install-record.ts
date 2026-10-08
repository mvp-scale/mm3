/**
 * `~/.config/mm3/install.json`: how `mm3 init` installed the CLI (global/user/local, and the npm
 * prefix or project dir involved) — nothing else. `mm3 uninstall` reads it to know which `npm uninstall`
 * variant reverses the install; `mm3 doctor` reads it for the `cli:` line. Deliberately separate from
 * env-file.ts's `env` file in the same directory: this file holds no secrets, so it's fine to read, log, or
 * paste into a bug report.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mm3ConfigDir } from './env-file.ts';

type Env = Record<string, string | undefined>;

export type InstallMode = 'global' | 'user' | 'local';

export interface InstallRecord {
  /** `standalone`: the single file `mm3 init` copied to `binPath` (setup/standalone.ts); the other three are npm installs. */
  mode: InstallMode | 'standalone';
  /** The npm prefix used for --global/--user (e.g. /usr/local, ~/.local); absent for --local. */
  npmPrefix?: string;
  /** The project directory for --local (where `npm install -D <self>` ran); absent otherwise. */
  projectDir?: string;
  /** The standalone file and the plugin folder next to it (only for mode `standalone`), and the version placed. */
  binPath?: string;
  pluginDir?: string;
  version?: string;
  installedAt: string;
}

export function installRecordPath(env: Env = process.env): string {
  return path.join(mm3ConfigDir(env), 'install.json');
}

function isInstallRecord(v: unknown): v is InstallRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (r.mode === 'global' || r.mode === 'user' || r.mode === 'local' || r.mode === 'standalone') && typeof r.installedAt === 'string';
}

/** undefined for "never ran init, or the record is unreadable/corrupt" — both read the same to every caller:
 *  doctor falls back to "on PATH, install unknown" and uninstall falls back to printing the command by hand. */
export function readInstallRecord(env: Env = process.env): InstallRecord | undefined {
  const file = installRecordPath(env);
  if (!existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return isInstallRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeInstallRecord(env: Env, record: InstallRecord): void {
  const file = installRecordPath(env);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
}

/** uninstall's last step, once the CLI itself is gone: no-op when there was never a record. */
export function clearInstallRecord(env: Env = process.env): void {
  const file = installRecordPath(env);
  if (existsSync(file)) rmSync(file, { force: true });
}

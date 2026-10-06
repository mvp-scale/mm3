/** Runs the built binary (dist/cli.js) the way an agent does: separate processes, fake provider, no key, no network. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isSqliteExperimentalWarning } from '../../src/ledger/index.ts';

export const CLI = path.resolve('dist/cli.js');

/** True when this test run's own Node has node:sqlite (>= 22.13) — the same test-running process the CLI
 *  subprocess inherits its `node` binary from, so this predicts whether a real run persists .mm3/index.db
 *  (SQLite) or leaves nothing on disk for the index (the Node < 22.13 fallback, e.g. this repo's Node 20 host).
 *  Resolving node:sqlite at all fires its own deferred ExperimentalWarning the first time any process does it
 *  (verified directly — asynchronous, printed after the resolving call returns). Wraps process.emitWarning
 *  first, the same way ledger/index.ts's own installSqliteWarningFilter does, so this shared test helper (loaded
 *  by many e2e test files, well before any of them touch the CLI or the ledger for real) doesn't itself leak raw
 *  warning noise into every container test run. */
export const hasNodeSqlite = (() => {
  const getBuiltin = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  if (typeof getBuiltin !== 'function') return false;
  const original = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const message = typeof warning === 'string' ? warning : warning.message;
    const type = typeof rest[0] === 'string' ? rest[0] : ((rest[0] as { type?: string } | undefined)?.type ?? '');
    if (isSqliteExperimentalWarning({ name: type, message })) return;
    return (original as (...args: unknown[]) => void)(warning, ...rest);
  }) as typeof process.emitWarning;
  return !!getBuiltin('node:sqlite');
})();

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function cliEnv(root: string | undefined, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, MM3_PROVIDER: 'fake', MM3_ACTOR: 'e2e-agent', TYPESAFE_API_KEY: '', AI_GATEWAY_API_KEY: '',
    // Never the developer's own ~/.config/mm3/env key file.
    XDG_CONFIG_HOME: path.join(os.tmpdir(), 'mm3-test-no-config'), ...extra };
  if (root === undefined) delete env.MM3_HOME;
  else env.MM3_HOME = root;
  return env;
}

/** One run, synchronous. `root` is both the cwd and MM3_HOME unless `home: false`. */
export function mm3(root: string, args: string[], o: { input?: string | Buffer; home?: boolean; env?: Record<string, string>; timeoutMs?: number } = {}): CliResult {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: root,
    input: o.input ?? '',
    encoding: 'utf8',
    env: cliEnv(o.home === false ? undefined : root, o.env),
    ...(o.timeoutMs ? { timeout: o.timeoutMs, killSignal: 'SIGKILL' as const } : {}),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** One run as a child process, for launching many at once. */
export function mm3Async(root: string, args: string[], env: Record<string, string> = {}): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: root, env: cliEnv(root, env), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

/**
 * Every file under <root>/.mm3 with its bytes, or null when the folder does not exist. Strict (pre-ff5f3e8,
 * and no longer skipping index.db*, per fix round 1's binding 7): an empty `.mm3/` is NOT treated the same
 * as no directory at all, and index.db/-wal/-shm are now VISIBLE to this snapshot — design binding #7 says a dry
 * run, view, or any command in a project with no ledger yet must not create `.mm3/` in the first place, and
 * that --dry-run/view must never create or rewrite index.db in a project that already has one (they're read-only
 * against the index — see ledger/index.ts's `readOnly` option); this snapshot has to be able to catch either
 * violation. Safe to compare byte-for-byte across a read-only call: verified directly that a plain SQLite open
 * plus a handful of small reads (no write transaction) leaves index.db's own bytes untouched and creates no
 * -wal/-shm siblings, and that a write transaction that throws and rolls back leaves no trace either once the
 * connection closes — only an index.db actually rebuilt or caught up on disk changes what this snapshot sees.
 */
export function snapshot(root: string): Record<string, string> | null {
  const dir = path.join(root, '.mm3');
  if (!existsSync(dir)) return null;
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    out[name] = statSync(full).isDirectory() ? '<dir>' : readFileSync(full, 'latin1');
  }
  return out;
}

/**
 * Like snapshot(), but drops index.db* — for the small set of cases where a REAL write-path command (one that
 * takes the ledger lock, even though its net effect on the ledger/budget is a no-op or a refusal) legitimately
 * catches up or rebuilds the on-disk index as a side effect: a repeated `outcome` that resolves to "already
 * recorded" still validates the tail through the index first, and a `class`/`outcome` refused by a corrupt TAIL
 * can still successfully index the valid PREFIX before the tail check itself throws. Both are correct, designed
 * self-healing (index writes happen under the same lock as any other ledger touch, and never change an answer,
 * only speed) — not a violation of "dry runs and free reads write nothing" (snapshot() itself, strict by
 * default, is what catches THAT). Use this only where the point of the test is "the LEDGER and BUDGET are
 * unchanged," not "nothing on disk changed at all."
 */
export function snapshotLedgerAndBudget(root: string): Record<string, string> | null {
  const full = snapshot(root);
  if (!full) return full;
  const out: Record<string, string> = {};
  for (const [name, content] of Object.entries(full)) if (!name.startsWith('index.db')) out[name] = content;
  return out;
}

/** A failure an agent can act on: exit code, nothing on stdout, one "✖ … → …" line on stderr (a stop
 *  ends with one further "→ see: mm3 agent [<topic>]" line — stripped here, so every existing
 *  caller keeps comparing against just the "✖ …" line; test/unit/request.test.ts pins that pointer's own exact
 *  shape), no stack frames. */
export function expectCleanStop(r: CliResult, status: number): string {
  const problems: string[] = [];
  if (r.status !== status) problems.push(`exit ${r.status}, wanted ${status}`);
  if (r.stdout !== '') problems.push(`stdout not empty: ${JSON.stringify(r.stdout)}`);
  const body = r.stderr.replace(/\n→ see: mm3 agent( \S+)?\n$/u, '\n');
  if (!/^✖ [^\n]+ → [^\n]+\n$/.test(body)) problems.push(`stderr is not one "✖ … → …" line: ${JSON.stringify(r.stderr)}`);
  if (/\n\s+at /.test(r.stderr)) problems.push('stack trace on stderr');
  if (problems.length) throw new Error(problems.join('; '));
  return body.trimEnd();
}

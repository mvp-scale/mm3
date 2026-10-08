/**
 * doctor: plumbing, not a verb — outside the six verbs on purpose. Free — no classifier
 * call, no budget touched, no ledger write — so an agent can check what a real call WOULD do before spending
 * anything: which provider/route/base URL would answer, whether a key is set and where it came from (never its
 * value), the pinned model, whether a project/ledger is reachable from here, the Node/node:sqlite runtime, how
 * the CLI itself was installed, and whether the Claude Code plugin is set up. A bad config (a floating
 * JEV_MODEL, a bad TYPESAFE_BASE_URL) stops here at exit 2 with the exact same ✖ message a paid verb would
 * give, just without ever risking a spend to find it out.
 *
 * doctor is the one command cli.ts's own Node-version guard (util/node-version.ts) still runs on too old a
 * Node, rather than stopping outright: it reports the problem in the `node:`/`index:` fields below (instead of
 * every other command's own generic ✖ line) but still exits 2, same as they do — never a silent 0. [C-106]
 *
 * The `key`/`cli`/`plugin` lines, and the project line's "plugin enabled here", all take their real answer from
 * an injected `deps.resolveStored`/`deps.runner` — omitted (as every existing caller of this function still
 * does), they read conservatively (env-only key, "not on PATH", "not installed") rather than ever touching a
 * real keychain, npm or claude. Only cli.ts's own production call wires the real implementations
 * (setup/keystore.ts, setup/npm-info.ts, setup/plugin.ts).
 *
 * bare `mm3 doctor` also validates `.mm3/config.yaml` when present (free, offline,
 * through `config/active.ts`'s `configStatus` — the same stops `mm3 config` shows, plus whether the file is loaded). Given a
 * file or stdin (`runDoctorFile`, wired by cli.ts as `mm3 doctor <file|->`), doctor instead checks ONE
 * document and detects its kind: a `mak:` top-level key means a REQUEST, checked with the same
 * read+validate pipeline `--dry-run` uses (verbs/request.ts's `loadRequest` — no ledger, reuse or budget
 * lookups, since those happen later, inside each verb function, never inside `loadRequest`/`validateRequest`
 * themselves); anything else is checked as a CONFIG file, via `config/validate.ts`'s `validateConfig` directly
 * (no project needed at all for this path — it only validates YAML text, never touches `.mm3/`).
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { CHAOS_MODEL } from '../classifier/chaos.ts';
import { FAKE_MODEL } from '../classifier/fake.ts';
import { hasKey, JevConfigError, resolveJevConfig, routeLabel, type JevConfig, type ResolveStored } from '../classifier/typesafe/client.ts';
import { emit, m, type Value } from '../contract/emit.ts';
import { VERBS, type Verb } from '../contract/types.ts';
import { configStatus, statusLine } from '../config/receipt.ts';
import { nearMissNotes } from '../config/config.ts';
import { validateConfig } from '../config/validate.ts';
import { sqliteAvailable } from '../ledger/index.ts';
import { relativeToCwd, type Mm3Paths } from '../ledger/paths.ts';
import { envFilePath, looseFileModeWarning, readEnvFile } from '../setup/env-file.ts';
import { agentsDoctorValue } from '../setup/agents-status.ts';
import { readInstallRecord } from '../setup/install-record.ts';
import { findOnPath } from '../setup/npm-info.ts';
import { inPluginContext, NO_KEY_PLUGIN_HINT, pluginStatus } from '../setup/plugin.ts';
import type { Runner } from '../setup/runner.ts';
import { doctorNodeValue, DOCTOR_INDEX_TOO_OLD, nodeVersionOk } from '../util/node-version.ts';
import { loadRequest } from './request.ts';
import type { VerbResult } from './types.ts';

interface Identity {
  adapter: string;
  route: string;
  model: string;
  wireModel?: string;
  baseURL: string | null;
}

/** Same key-selection rule as selectProvider (select.ts), but never builds a client — this never calls out. */
function identityFor(env: Record<string, string | undefined>, config: JevConfig): Identity {
  const wanted = env.MM3_PROVIDER?.trim();
  if (wanted === 'chaos') return { adapter: 'chaos', route: 'chaos', model: CHAOS_MODEL, baseURL: null };
  const usingTypesafe = wanted === 'typesafe' || (wanted !== 'fake' && hasKey(config));
  if (!usingTypesafe) return { adapter: 'fake', route: 'fake', model: FAKE_MODEL, baseURL: null };
  const route = routeLabel(config);
  return {
    adapter: 'typesafe',
    route,
    model: config.model,
    baseURL: config.baseURL,
    ...(config.route === 'gateway' ? { wireModel: config.wireModel } : {}),
  };
}

const octal4 = (mode: number): string => mode.toString(8).padStart(4, '0');

/** The `actor:` value — every run/outcome defaults to `by: agent` unless MM3_ACTOR is set (the
 *  same fallback pay.ts's actorOf uses; duplicated rather than imported, matching this module's own low-
 *  dependency style). On a real MCP call, cli.ts's mcp wiring sets this to "claude" before dispatch ever
 *  reaches here — see src/mcp/actor.ts — so this line shows what will actually be used. */
function actorLine(env: Record<string, string | undefined>): string {
  const set = env.MM3_ACTOR?.trim();
  return set || 'agent (default) → set MM3_ACTOR to change';
}

// Each of these builds the VALUE half only — emit()'s m() already renders "key: <value>" from the map entry,
// so a literal "key: " here would double up (caught by doctor.test.ts before this file ever shipped it).

/** The no-key hint: inside the plugin's own MCP server (CLAUDE_PLUGIN_ROOT set — see setup/plugin.ts's
 *  `inPluginContext`), `mm3 init` isn't reachable from here, so point at the config dialog instead; a bare
 *  terminal (or another MCP client) keeps the original hint. */
function noKeyHint(env: Record<string, string | undefined>): string {
  return inPluginContext(env) ? `none (sample answers only) → ${NO_KEY_PLUGIN_HINT}` : 'no  → run "mm3 init" to add one';
}

/** The `key:` value, plus, when the env file's mode is looser than 0600 or it has an ignored line, a matching
 *  note. `deps.resolveStored` omitted (the default for every caller but cli.ts) never looks past env — see the
 *  module doc. */
function keyLine(env: Record<string, string | undefined>, config: JevConfig, deps: { resolveStored?: ResolveStored }): { value: string; note?: string } {
  if (!config.apiKey) return { value: noKeyHint(env) };
  if (config.keySource === 'keychain') {
    return { value: 'yes · from OS keychain (encrypted, per user)' };
  }
  if (config.keySource === 'file') {
    const file = envFilePath(env);
    const read = readEnvFile(file);
    const mode = read?.mode ?? 0o600;
    const note = read
      ? (looseFileModeWarning(file, mode) ?? (read.ignoredLines > 0 ? `✖ credentials: ${file} has ${read.ignoredLines} line(s) mm3 ignored (not "export NAME='value'" for an allowed name) → fix or remove those lines` : undefined))
      : undefined;
    return { value: `yes · from user file ${file} (${octal4(mode)}, not encrypted)`, note };
  }
  // config.keySource === 'env' (or, for a bare call with no deps.resolveStored, simply undefined — env is the
  // only source it could have come from either way): a stored key elsewhere only matters for the note below.
  const envVar = config.route === 'gateway' ? 'AI_GATEWAY_API_KEY' : 'TYPESAFE_API_KEY';
  const stored = deps.resolveStored?.();
  return { value: `yes · from env ${envVar}${stored ? ' (overrides stored)' : ''}` };
}

/** The version of the MM3 package a `mm3` found on PATH belongs to: the nearest package.json above its real path
 *  (an npm global install, or the plugin folder), or undefined when it is some other program. */
function versionOnPath(bin: string): string | undefined {
  try {
    let dir = path.dirname(realpathSync(bin));
    for (let i = 0; i < 6; i++) {
      const pj = path.join(dir, 'package.json');
      if (existsSync(pj)) {
        const meta = JSON.parse(readFileSync(pj, 'utf8')) as { name?: string; version?: string };
        return meta.name === '@mvpscale/mm3' ? meta.version : undefined;
      }
      const up = path.dirname(dir);
      if (up === dir) return undefined;
      dir = up;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** The `versions:` value when a plugin is installed here: this copy against Claude's record of the plugin. The base
 *  versions must match; a nightly build (`x.y.z-nightly.<date>.g<sha>`) must also be at the plugin's commit. */
function versionsLine(running: string, plugin: { version?: string; sha: string }): string {
  const base = (v: string): string => v.split('-')[0] ?? v;
  const nightlySha = /\.g([0-9a-f]{7,40})$/.exec(running)?.[1];
  const sameBase = plugin.version !== undefined && base(plugin.version) === base(running);
  const sameCommit = nightlySha === undefined || plugin.sha.startsWith(nightlySha.slice(0, 7)) || nightlySha.startsWith(plugin.sha.slice(0, 7));
  if (sameBase && sameCommit) return plugin.version === running ? `✔ the plugin and this copy are both ${running}` : `✔ the plugin and this copy are the same build (${running})`;
  return `⚠ the plugin is ${plugin.version ?? 'an unknown version'} (${plugin.sha.slice(0, 7)}) and this copy is ${running} → update the older one: /plugin update in Claude Code, or npm install -g @mvpscale/mm3@${running.includes('-nightly.') ? 'nightly' : 'latest'}`; // a nightly copy is kept on the nightly tag: `latest` is the older release
}

/** The `cli:` value: where `mm3` resolves on PATH (a pure, always-safe filesystem walk — never gated on
 *  deps), plus how init installed it, from install.json, when that record exists. */
function cliLine(env: Record<string, string | undefined>, platform: NodeJS.Platform, version?: string): string {
  const resolved = findOnPath('mm3', env, platform);
  const drift = resolved && version ? versionOnPath(resolved) : undefined;
  const mismatch = drift && drift !== version ? ` · ⚠ version ${drift}, this is ${version} → run "mm3 init" to match them` : '';
  const record = readInstallRecord(env);
  if (!resolved && !record) return 'not on PATH → run "mm3 init" to install it';
  const shown = resolved ?? '(not currently on PATH)';
  if (!record) return `${shown} · on PATH${mismatch}`;
  if (record.mode === 'standalone') return `${shown} · installed standalone (file ${record.binPath ?? '?'}, ${record.version ?? 'unknown version'})${mismatch}`;
  const flag = record.mode === 'global' ? '--global' : record.mode === 'user' ? '--user' : '--local';
  const detail = record.mode === 'local' ? `project ${record.projectDir ?? '?'}` : `npm prefix ${record.npmPrefix ?? '?'}`;
  return `${shown} · installed ${flag} (${detail})${mismatch}`;
}

/** The `plugin:` value. `deps.runner` omitted (every caller but cli.ts) never actually spawns `claude` — it
 *  reads the same as "not installed", which is also the honest answer when `claude` isn't on PATH at all.
 *  When the ONLY scope found is `user`, add a one-line nudge toward `project` scope: using MM3 is scoped
 *  per project (see `stepPlugin` in setup/init.ts, which already defaults there), but `/plugin install` inside
 *  Claude Code's own UI defaults to `user` scope, so a manual install can land here without ever seeing that
 *  default questioned. [C-177] */
function pluginLine(deps: { runner?: Runner }): string {
  const status = deps.runner ? pluginStatus(deps.runner) : { installed: false, scopes: [] };
  if (!status.installed) return 'not installed → "mm3 init --claude"';
  const scopes = status.scopes as string[];
  const scope = scopes[0] ?? 'user';
  const userOnly = scopes.length === 1 && scope === 'user';
  return `mm3@mvp-scale · ${scope} scope${userOnly ? ' (every project) → for just this one, "mm3 init --scope project"' : ''}`;
}

/** Using is per project: the `project:` value names the root, then whether the plugin is
 *  enabled for THIS project specifically. `project` scope is already project-specific — checked from wherever
 *  this process runs, which is how Claude Code's own project scope is itself resolved. `user` scope counts too:
 *  a user-scope install applies to every project, this one included. `local` scope also ties to one project,
 *  but `claude plugin list --json`'s real shape carries no per-entry project path this task could verify (see
 *  setup/plugin.ts's own header comment on that) — rather than guess at an unconfirmed field, `local` is
 *  treated the same permissive way as `project`: a documented best-effort, not a real path match. */
function projectLine(root: string, deps: { runner?: Runner }): string {
  const status = deps.runner ? pluginStatus(deps.runner) : { installed: false, scopes: [] };
  const scopes = status.scopes as string[];
  const enabled = scopes.includes('project') || scopes.includes('user') || scopes.includes('local');
  return `${root} · plugin enabled here: ${enabled ? 'yes' : 'no'}`;
}

/** The `config:` field: where the config stands (config/receipt.ts) — nothing configured (the old plain "defaults"),
 *  loaded and in step with config.yaml, or a warning saying what to do. A config.yaml with problems lists every
 *  one, same `✖ config.<path>: problem → fix` shape `mm3 config`/`doctor <file>` use. Reads and hashes config.yaml;
 *  writes nothing. */
function configField(paths: Mm3Paths | undefined): Value {
  // On a Node with no node:sqlite the receipt lookup throws (the ledger backstop); doctor is the command a person on
  // old Node runs to find out why, so it must still render, with the file's own checks and no receipt [C-106].
  let status;
  try {
    status = configStatus(paths);
  } catch {
    status = configStatus(undefined);
  }
  const line = statusLine(status);
  if (status.fileStops.length) return [...status.fileStops.map((s) => s.text), ...(line ? [line] : [])];
  if (status.kind === 'defaults') return '✔ config: defaults';
  return status.kind === 'loaded' ? `✔ ${line}` : line!;
}

const MAX_DOCTOR_STOPS = 5;

/** The same "at most 5 stops, then an agent pointer" shape `verbs/request.ts`'s `stopText` uses for every other
 *  command — duplicated in miniature here rather than imported, since `doctor` isn't in that function's
 *  `AgentTarget` union and this module otherwise has no reason to depend on verbs/request.ts's own type. */
function doctorStops(lines: readonly string[]): string {
  const capped = lines.length <= MAX_DOCTOR_STOPS ? [...lines] : [...lines.slice(0, MAX_DOCTOR_STOPS), `✖ request: ${lines.length - MAX_DOCTOR_STOPS} more problems → fix the ones above, then run again`];
  return [...capped, '→ see: mm3 agent doctor'].join('\n');
}

/** A document's own top-level `mak:` key names it a REQUEST (`mdl:` alone, with no `mak:`, is never valid on
 *  its own per the schema, so this one check is enough); anything else is checked as CONFIG. A plain regex, not
 *  a full parse: kind detection must work even on YAML `loadRequest`/`validateConfig` will themselves reject —
 *  the actual validator, not this sniff, is what reports the real problem either way. */
const isRequestShaped = (text: string): boolean => /^mak\s*:/mu.test(text);

/** Best-effort `mak.verb` sniff for picking which verb to validate a standalone request file against — never
 *  the source of truth (loadRequest's own schema/cross checks are), just a hint so `doctor <file>` doesn't have
 *  to guess blindly when the file already names its verb. Any parse failure here is silently ignored: the real
 *  parse error is `loadRequest`'s to report, against the 'class' fallback. */
function sniffVerb(text: string): Verb {
  try {
    const doc = parseDocument(text, { version: '1.2', schema: 'core', uniqueKeys: true });
    if (doc.errors.length) return 'class';
    const value = doc.toJS({ maxAliasCount: 50 }) as { mak?: { verb?: unknown } } | null;
    const verb = value?.mak?.verb;
    return typeof verb === 'string' && (VERBS as readonly string[]).includes(verb) ? (verb as Verb) : 'class';
  } catch {
    return 'class';
  }
}

/** Controller-found defect: a contract cross-stop (validate.ts's checkCross) already embeds its own
 *  "→ see: mm3 agent probe" pointer in the stop line itself; loadRequest's own stopText then appends a
 *  SECOND, generic "→ see: mm3 agent <verb>" at the very end — deliberate for a real verb's own --dry-run
 *  (schema-check.ts's header comment: that pointer is an ADDITIONAL, more specific one, and the generic trailing
 *  one "still fires afterward regardless"), but doctor is meant to be simpler: every problem in one pass, each
 *  stop printed once, a SINGLE trailing pointer. This strips any embedded "→ see: mm3 agent <word>" from
 *  every line but the last (which is always stopText's own generic pointer, already exactly what doctor wants). */
function singleTrailingPointer(text: string): string {
  const lines = text.split('\n');
  const last = lines.length - 1;
  return lines.map((line, i) => (i === last ? line : line.replace(/ → see: mm3 agent \S+$/, ''))).join('\n');
}

/** `mm3 doctor <file>` / `mm3 doctor -`: checks ONE document, offline, and never writes
 *  anything — works with no project at all. See the module doc for the kind-detection rule. */
export function runDoctorFile(text: string): VerbResult {
  if (isRequestShaped(text)) {
    const verb = sniffVerb(text);
    const loaded = loadRequest(text, verb);
    if (!loaded.ok) return { ...loaded.result, text: singleTrailingPointer(loaded.result.text) };
    return { exit: 0, text: `✔ request: valid → checked as ${verb}` };
  }
  let raw: unknown;
  try {
    const doc = parseDocument(text, { version: '1.2', schema: 'core', uniqueKeys: true });
    const first = doc.errors[0];
    if (first) {
      const line = first.linePos?.[0]?.line ?? 1;
      return { exit: 2, text: doctorStops([`✖ config: line ${line} does not parse → fix the YAML syntax`]) };
    }
    raw = doc.toJS({ maxAliasCount: 50 });
  } catch {
    return { exit: 2, text: doctorStops(['✖ config: too many aliases (*) → write it out in full']) };
  }
  if (raw === null || raw === undefined) return { exit: 0, text: '✔ config: valid' };
  const { stops } = validateConfig(raw);
  if (stops.length) return { exit: 2, text: doctorStops(stops.map((s) => s.text)) };
  return { exit: 0, text: '✔ config: valid' };
}

export function runDoctor(
  env: Record<string, string | undefined>,
  paths: Mm3Paths | undefined,
  nodeVersion: string = process.version,
  deps: { resolveStored?: ResolveStored; runner?: Runner; platform?: NodeJS.Platform; version?: string; pluginInstall?: { version?: string; sha: string } } = {},
): VerbResult {
  let config: JevConfig;
  try {
    config = resolveJevConfig(env, { resolveStored: deps.resolveStored });
  } catch (e) {
    if (e instanceof JevConfigError) return { exit: 2, text: `${e.message}\n` };
    throw e;
  }

  const who = identityFor(env, config);
  const project = paths ? projectLine(relativeToCwd(process.cwd(), paths.root) || '.', deps) : 'none';
  const { value: key, note: keyNote } = keyLine(env, config, deps);
  const notes = [
    'free: no call, no spend',
    ...(paths ? [] : ['no project found here or above → run inside one, or set MM3_HOME']),
    ...(keyNote ? [keyNote] : []),
    ...nearMissNotes(paths),
  ];

  const doc = m(
    [
      'doctor',
      m(
        ['provider', who.adapter],
        ['route', who.route],
        ...(who.baseURL ? [['baseURL', who.baseURL] as [string, Value]] : []),
        ['model', who.model],
        ...(who.wireModel ? [['wireModel', who.wireModel] as [string, Value]] : []),
        ['key', key],
        ['project', project],
        ['actor', actorLine(env)],
        ['node', doctorNodeValue(nodeVersion)],
        ['index', nodeVersionOk(nodeVersion) ? (sqliteAvailable() ? 'node:sqlite' : 'unavailable (unexpected on Node 22.13+)') : DOCTOR_INDEX_TOO_OLD],
        ['cli', cliLine(env, deps.platform ?? process.platform, deps.version)],
        ['plugin', pluginLine(deps)],
        ...(deps.pluginInstall && deps.version ? [['versions', versionsLine(deps.version, deps.pluginInstall)] as [string, Value]] : []),
        ...(paths ? [['agents', agentsDoctorValue(paths.root)] as [string, Value]] : []),
        ['config', configField(paths)],
      ),
    ],
    ['notes', notes],
  );
  // Node < 22.13: doctor still runs and reports it (the node:/index: fields above), but the
  // process exits 2 just like every other command's version stop — never a silent 0.
  return { exit: nodeVersionOk(nodeVersion) ? 0 : 2, text: emit(doc) };
}

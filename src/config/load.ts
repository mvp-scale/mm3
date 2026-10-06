/**
 * The project's config → the effective `Mm3Config`: reads `.mm3/config.yaml` itself on every request (a few hundred
 * microseconds; never created or written here, same free-and-optional spirit as everything else doctor/config
 * touch), validates it (validate.ts), and merges the overrides over the one code defaults table (defaults.ts).
 * There is no loaded copy: the file is the config, and `mm3 config --load` only records a receipt in the ledger. Precedence is env > config >
 * default; the small set of settings that already have their own env var (MM3_PROVIDER,
 * TYPESAFE_BASE_URL, JEV_MODEL, JEV_TIMEOUT_MS) keep that env var as the actual runtime authority — this
 * module's `config.<field>` is the config-or-default LAYER only (never env), because the real routing already
 * has one owner (`src/classifier/typesafe/config.ts`'s `resolveJevConfig`, which re-checks env itself and
 * takes this module's value only as its own middle layer via `deps.fileConfig` — see that file). What this
 * module DOES do is label each of those fields' `source` as `'env'` whenever that env var is set, purely for
 * `mm3 config`'s own printer, even though the VALUE shown here is still the config/default one — a real
 * run's actual value for those four fields comes from resolveJevConfig, not from reading this object alone.
 * Every other key (budget, pricing, timeoutMs's siblings retries/backoffMs, sweep, requestMaxBytes, reuse,
 * mdl) has no env var at all, so config.<field> here IS the real effective value for those.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { Mm3Paths } from '../ledger/paths.ts';
import { CONFIG_KEYS, DEFAULT_CONFIG, KEYED_MAPS, UNSET_BY_DEFAULT, type ConfigSource, type Mm3Config } from './defaults.ts';
import { parseConfigText } from './parse.ts';
import { validateConfig, type ConfigStop } from './validate.ts';

interface FileReadResult {
  /** undefined when the file is missing, unreadable, or fails to parse — `stops` explains which. */
  raw: Record<string, unknown> | undefined;
  stops: ConfigStop[];
  present: boolean;
}

/** Reads and parses `paths.config` if it exists. Never throws, never writes, never creates the file. */
function readConfigFile(paths: Mm3Paths | undefined): FileReadResult {
  if (!paths || !existsSync(paths.config)) return { raw: undefined, stops: [], present: false };
  let text: string;
  try {
    text = readFileSync(paths.config, 'utf8');
  } catch {
    return { raw: undefined, stops: [], present: false };
  }
  return { ...parseConfigText(text), present: true };
}

export interface ResolvedConfig {
  config: Mm3Config;
  /** Dotted-path → where the shown value (or, for the four env-aware fields, the value that WOULD win at
   *  runtime) came from. Every leaf `mm3 config` prints has an entry. */
  sources: Record<string, ConfigSource>;
  /** Validation/parse stops from the file, if any — non-empty only when config.yaml exists and has a problem. */
  stops: ConfigStop[];
  /** Whether config.yaml exists at all (distinct from "exists but is empty/all-default"). */
  present: boolean;
}

const cleanEnv = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

function positiveOr<T extends number | undefined>(v: number | undefined, fallback: T): number | T {
  return v !== undefined && Number.isFinite(v) && v > 0 ? v : fallback;
}

type Tree = Record<string, unknown>;
const isTree = (v: unknown): v is Tree => typeof v === 'object' && v !== null && !Array.isArray(v);
const KEYED = new Set<string>(KEYED_MAPS);

/** An override value as stored: arrays are copied so the file's parse result is never aliased. */
const cloneValue = (v: unknown): unknown => (Array.isArray(v) ? v.slice() : v);

/** Every setting's source key when config.yaml is silent: each leaf (a scalar or an array), at each entry
 *  of a keyed map (`pricing.<model>`), and at each setting that is unset by default (no key in DEFAULT_CONFIG).
 *  Built once; each resolve fills a fresh map from it and relabels only what the file actually names. */
const DEFAULT_SOURCE_KEYS: string[] = [];
function labelDefaults(tree: Tree, path: string): void {
  const keyed = KEYED.has(path);
  for (const k in tree) {
    const at = path ? `${path}.${k}` : k;
    if (!keyed && isTree(tree[k])) labelDefaults(tree[k], at);
    else DEFAULT_SOURCE_KEYS.push(at);
  }
}
labelDefaults(DEFAULT_CONFIG as unknown as Tree, '');
DEFAULT_SOURCE_KEYS.push(...UNSET_BY_DEFAULT);

/** One value of the overrides laid over its default: a table merges key by key; a scalar, an array or a keyed-map
 *  entry replaces the default whole. Labels what it replaced as `config`. */
function overlay(base: unknown, over: unknown, at: string, inKeyedMap: boolean, sources: Record<string, ConfigSource>): unknown {
  if (!inKeyedMap && isTree(over) && (isTree(base) || KEYED.has(at))) return mergeTree(isTree(base) ? base : {}, over, at, sources);
  sources[at] = 'config';
  return cloneValue(over);
}

/** `base` with `over` laid over it (see overlay); a key `over` doesn't name is the (frozen) default branch itself, shared. */
function mergeTree(base: Tree, over: Tree, path: string, sources: Record<string, ConfigSource>): Tree {
  const out: Tree = {};
  const keyed = KEYED.has(path);
  const at = (k: string): string => (path ? `${path}.${k}` : k);
  for (const k in base) out[k] = over[k] === undefined ? base[k] : overlay(base[k], over[k], at(k), keyed, sources);
  for (const k in over) if (!(k in base) && over[k] !== undefined) out[k] = overlay(undefined, over[k], at(k), keyed, sources);
  return out;
}

/** DEFAULT_CONFIG with the validated overrides laid over it, plus every setting's source label. */
export function mergeConfig(overrides: Partial<Mm3Config>): { config: Mm3Config; sources: Record<string, ConfigSource> } {
  // A loop, not a spread: copying a 50-key dictionary-mode object costs ~10x more than filling a fresh one.
  const sources: Record<string, ConfigSource> = {};
  for (const key of DEFAULT_SOURCE_KEYS) sources[key] = 'default';
  const config = mergeTree(DEFAULT_CONFIG as unknown as Tree, overrides as Tree, '', sources) as unknown as Mm3Config;
  return { config, sources };
}

/** The full precedence resolution: env (where one exists) > config.yaml > DEFAULT_CONFIG. Never throws — a
 *  broken config.yaml surfaces as `stops` (the caller decides whether that's fatal, e.g. `mm3 doctor`
 *  reports it; most other callers just fall back to defaults and keep going, same as a missing key). */
export function resolveConfig(paths: Mm3Paths | undefined, env: Record<string, string | undefined> = {}): ResolvedConfig {
  // The file is the config: read and checked on every request (a few hundred microseconds). No file means defaults.
  const file = readConfigFile(paths);
  const validated = file.raw !== undefined ? validateConfig(file.raw) : { stops: [], value: {} };
  const overrides: Partial<Mm3Config> = validated.value;
  const stops: ConfigStop[] = [...file.stops, ...validated.stops];
  const present = file.present;
  const envProvider = cleanEnv(env.MM3_PROVIDER);
  const envBaseURL = cleanEnv(env.TYPESAFE_BASE_URL);
  const envModel = cleanEnv(env.JEV_MODEL);
  const envTimeoutRaw = Number(cleanEnv(env.JEV_TIMEOUT_MS));
  const envTimeout = Number.isFinite(envTimeoutRaw) && envTimeoutRaw > 0 ? envTimeoutRaw : undefined;

  // One generic merge: validated overrides over DEFAULT_CONFIG, labelling every leaf's source as it goes. The four
  // env-aware fields are then relabelled `env` when their env var is set (a LABEL only; the value stays the
  // config-or-default one, see the module doc).
  const { config, sources } = mergeConfig(overrides);
  const envSet: Record<string, boolean> = { provider: envProvider !== undefined, baseURL: envBaseURL !== undefined, model: envModel !== undefined, timeoutMs: envTimeout !== undefined };
  for (const [path, isSet] of Object.entries(envSet)) if (isSet) sources[path] = 'env';

  return { config, sources, stops, present };
}

/** Where a verb gets its config: the one resolved at the request entry (`ctx.config`), else a fresh read — direct
 *  callers (tests, library use) that never set it keep working exactly as before. */
export function configOf(ctx: { paths?: Mm3Paths; env?: Record<string, string | undefined>; config?: ResolvedConfig }): ResolvedConfig {
  return ctx.config ?? resolveConfig(ctx.paths, ctx.env);
}

/** The subset `selectProvider`/`resolveJevConfig` accept as `deps.fileConfig` — see typesafe/config.ts. Reads
 *  straight off the resolved config; env still wins inside resolveJevConfig regardless of what's passed here. */
export function classifierFileConfig(config: Mm3Config): { provider?: string; baseURL?: string; model?: string; timeoutMs?: number; retries?: number; backoffMs?: number } {
  return {
    ...(config.provider !== undefined ? { provider: config.provider } : {}),
    ...(config.baseURL !== undefined ? { baseURL: config.baseURL } : {}),
    ...(config.model !== undefined ? { model: config.model } : {}),
    timeoutMs: positiveOr(config.timeoutMs, DEFAULT_CONFIG.timeoutMs),
    retries: positiveOr(config.retries, DEFAULT_CONFIG.retries),
    backoffMs: positiveOr(config.backoffMs, DEFAULT_CONFIG.backoffMs),
  };
}

export { CONFIG_KEYS };

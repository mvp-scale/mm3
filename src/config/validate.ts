/**
 * Pure validation of a RAW, already-YAML-parsed `.mm3/config.yaml` value against the defaults table
 * (defaults.ts) — no file I/O, no env reads, so `mm3 doctor` can call this straight on a file it already
 * read itself, and load.ts can call it on its own parse result. Every problem is a help-first
 * stop in the shared `✖ config.<path>: problem → fix` shape (AGENTS.md rule 7); this module only builds text,
 * never throws.
 */
import { looksLikeSecret } from '../ledger/redact.ts';
import { DECISIONS_MAX } from '../contract/types.ts';
import { CONFIG_KEYS, CONTRACT_ONLY_KEYS, DEFAULT_CONFIG, SECRET_LIKE_KEYS, type Mm3Config } from './defaults.ts';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Levenshtein edit distance, small inputs only (config keys) — good enough for a "did you mean" hint. */
function distance(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j]!, dp[j - 1]!);
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

/** The closest known name within 2 edits, else undefined — close enough to be a typo, not a different word. */
function didYouMean(given: string, known: readonly string[]): string | undefined {
  let best: { name: string; d: number } | undefined;
  for (const name of known) {
    const d = distance(given, name);
    if (d <= 2 && (!best || d < best.d)) best = { name, d };
  }
  return best?.name;
}

export interface ConfigStop {
  /** The dotted path from the config root, e.g. `budget.usd` or `sweep.maxItems`. */
  path: string;
  text: string;
}

function stop(path: string, problem: string, fix: string): ConfigStop {
  return { path, text: `✖ config.${path}: ${problem} → ${fix}` };
}

/** Any key anywhere in the tree (dotted `path`) that looks like it's meant to hold a secret. */
function checkSecretLike(key: string, path: string, out: ConfigStop[]): boolean {
  if (SECRET_LIKE_KEYS.includes(key.toLowerCase() as (typeof SECRET_LIKE_KEYS)[number])) {
    out.push(stop(path, 'looks like it holds a secret', 'keys go in env or the keychain, never in config.yaml'));
    return true;
  }
  return false;
}

function checkEnum<T extends string>(path: string, v: unknown, allowed: readonly T[], out: ConfigStop[]): v is T {
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return true;
  out.push(stop(path, `${JSON.stringify(v)} is not valid`, `use one of ${allowed.join(', ')}`));
  return false;
}

function checkPositiveNumber(path: string, v: unknown, out: ConfigStop[]): boolean {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return true;
  out.push(stop(path, `${JSON.stringify(v)} is not a positive number`, 'give a number greater than 0'));
  return false;
}

/** A whole number of at least 1 (a count: probes, items, characters, files). */
function checkWhole(path: string, v: unknown, out: ConfigStop[]): boolean {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1) return true;
  out.push(stop(path, `${JSON.stringify(v)} is not allowed`, 'use a whole number of at least 1'));
  return false;
}

/** A share strictly between 0 and 1 (lens thresholds). */
function checkShare(path: string, v: unknown, out: ConfigStop[]): boolean {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1) return true;
  out.push(stop(path, `${JSON.stringify(v)} is not allowed`, 'use a number above 0 and below 1, e.g. 0.5'));
  return false;
}

/** The value-shaped counterpart to checkSecretLike (which flags a secret-NAMED key): a real key pasted into a
 *  config value — `baseURL`, `budget.since`, an mdl override's free text — stops here regardless of what the
 *  surrounding key is called. Reuses redact.ts's own detectors (security item) so this file never
 *  duplicates the pattern list. */
function checkSecretValue(path: string, v: string, out: ConfigStop[]): boolean {
  if (!looksLikeSecret(v)) return false;
  out.push(stop(path, 'looks like a key', 'keys go in env (TYPESAFE_API_KEY) or the keychain, never in config'));
  return true;
}

function checkNonEmptyString(path: string, v: unknown, out: ConfigStop[]): boolean {
  if (typeof v !== 'string' || !v.trim()) {
    out.push(stop(path, `${JSON.stringify(v)} is not text`, 'give a non-empty string'));
    return false;
  }
  if (checkSecretValue(path, v, out)) return false;
  return true;
}

/** A section header with every child commented out (`sweep:` alone) parses as null (or undefined): that is "no
 *  overrides", the shape `mm3 config --write`'s starter file relies on, never a "not a mapping" stop. */
const isEmptySection = (v: unknown): boolean => v === null || v === undefined;

function checkBudget(v: unknown, out: ConfigStop[]): Partial<Mm3Config['budget']> {
  if (isEmptySection(v)) return {};
  if (!isObj(v)) {
    out.push(stop('budget', 'is not a mapping', 'write usd:, runs:, per: and/or warnAt: under budget:'));
    return {};
  }
  const result: Partial<Mm3Config['budget']> = {};
  for (const k of Object.keys(v)) {
    const path = `budget.${k}`;
    if (checkSecretLike(k, path, out)) continue;
    if (k === 'usd' || k === 'runs') {
      if (checkPositiveNumber(path, v[k], out)) result[k] = v[k] as number;
    } else if (k === 'per') {
      if (checkEnum(path, v[k], ['total', 'day', 'hour'], out)) result.per = v[k] as 'total' | 'day' | 'hour';
    } else if (k === 'since') {
      if (checkNonEmptyString(path, v[k], out)) result.since = v[k] as string;
    } else if (k === 'warnAt') {
      const n = v[k];
      if (typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 1) result.warnAt = n;
      else out.push(stop(path, `${JSON.stringify(n)} is not allowed`, 'use a share above 0 and up to 1, e.g. 0.8 warns at 80% of a cap'));
    } else {
      const hint = didYouMean(k, ['usd', 'runs', 'per', 'since', 'warnAt']);
      out.push(stop(path, `"${k}" is not a budget field`, hint ? `did you mean ${hint}?` : 'use usd, runs, per, since or warnAt'));
    }
  }
  return result;
}

function checkPricing(v: unknown, out: ConfigStop[]): Mm3Config['pricing'] {
  if (isEmptySection(v)) return {};
  if (!isObj(v)) {
    out.push(stop('pricing', 'is not a mapping', 'write <model>: {inputPerMTok: <n>} under pricing:'));
    return {};
  }
  const result: Mm3Config['pricing'] = {};
  for (const model of Object.keys(v)) {
    const rate = v[model];
    const path = `pricing.${model}`;
    if (isEmptySection(rate)) continue; // `jev-1.13.0:` with every rate commented out: keep the built-in rate
    if (!isObj(rate)) {
      out.push(stop(path, 'is not a mapping', 'write {inputPerMTok, outputPerMTok, perSecond, perCall}'));
      continue;
    }
    const entry: Record<string, number> = {};
    for (const k of ['inputPerMTok', 'outputPerMTok', 'perSecond', 'perCall']) {
      if (k in rate) {
        if (checkPositiveNumber(`${path}.${k}`, rate[k], out)) entry[k] = rate[k] as number;
      }
    }
    for (const k of Object.keys(rate)) {
      if (!['inputPerMTok', 'outputPerMTok', 'perSecond', 'perCall'].includes(k)) {
        checkSecretLike(k, `${path}.${k}`, out) ||
          out.push(stop(`${path}.${k}`, `"${k}" is not a pricing field`, 'use inputPerMTok, outputPerMTok, perSecond or perCall'));
      }
    }
    result[model] = entry;
  }
  return result;
}

function checkSweep(v: unknown, out: ConfigStop[]): Partial<Mm3Config['sweep']> {
  if (isEmptySection(v)) return {};
  if (!isObj(v)) {
    out.push(stop('sweep', 'is not a mapping', 'write maxItems:, maxQuestionsPerCall: and/or itemsPerLayer: under sweep:'));
    return {};
  }
  const result: Partial<Mm3Config['sweep']> = {};
  for (const k of Object.keys(v)) {
    const path = `sweep.${k}`;
    if (k === 'maxItems' || k === 'maxQuestionsPerCall') {
      if (checkPositiveNumber(path, v[k], out)) result[k] = v[k] as number;
    } else if (k === 'itemsPerLayer') {
      const per = checkTierCounts(path, v[k], ITEM_TIERS, out);
      if (per) result.itemsPerLayer = per as Mm3Config['sweep']['itemsPerLayer'];
    } else {
      const hint = didYouMean(k, ['maxItems', 'maxQuestionsPerCall', 'itemsPerLayer']);
      out.push(stop(path, `"${k}" is not a sweep field`, hint ? `did you mean ${hint}?` : 'use maxItems, maxQuestionsPerCall or itemsPerLayer'));
    }
  }
  return result;
}

function checkReuse(v: unknown, out: ConfigStop[]): Partial<Mm3Config['reuse']> {
  if (isEmptySection(v)) return {};
  if (!isObj(v)) {
    out.push(stop('reuse', 'is not a mapping', 'write maxAgeDays: and/or maxCommits: under reuse:'));
    return {};
  }
  const result: Partial<Mm3Config['reuse']> = {};
  for (const k of Object.keys(v)) {
    const path = `reuse.${k}`;
    if (k === 'maxAgeDays' || k === 'maxCommits') {
      if (checkPositiveNumber(path, v[k], out)) result[k] = v[k] as number;
    } else {
      const hint = didYouMean(k, ['maxAgeDays', 'maxCommits']);
      out.push(stop(path, `"${k}" is not a reuse field`, hint ? `did you mean ${hint}?` : 'use maxAgeDays or maxCommits'));
    }
  }
  return result;
}

const ITEM_TIERS = ['quick', 'standard', 'thorough'] as const;

/** `itemsPerLayer`: any of quick/standard/thorough, each a whole number >= 1 (the ascending order is checked on
 *  the merged values by validateConfig, since a file may name only some of them). */
function checkTierCounts(path: string, v: unknown, tiers: readonly string[], out: ConfigStop[]): Record<string, number> | undefined {
  if (isEmptySection(v)) return undefined;
  if (!isObj(v)) {
    out.push(stop(path, 'is not a mapping', `write ${tiers.join(': <n>, ')}: <n> under it`));
    return undefined;
  }
  const result: Record<string, number> = {};
  for (const k of Object.keys(v)) {
    if (!tiers.includes(k)) {
      const hint = didYouMean(k, tiers);
      out.push(stop(`${path}.${k}`, `"${k}" is not a depth tier`, hint ? `did you mean ${hint}?` : `use ${tiers.join(', ')}`));
    } else if (checkWhole(`${path}.${k}`, v[k], out)) result[k] = v[k] as number;
  }
  return result;
}

const DEPTH_VERBS = ['class', 'scan', 'loop'] as const;
const NO_DEPTH_VERBS = ['drill', 'replay', 'view'] as const;
type Tiers = [number, number, number];

/** One verb's depth tiers: exactly three whole numbers (probes at quick, standard, thorough), ascending. */
function checkTiers(path: string, v: unknown, out: ConfigStop[]): Tiers | undefined {
  if (!Array.isArray(v)) {
    out.push(stop(path, `${JSON.stringify(v)} is not a list`, 'write three whole numbers, quick to thorough, e.g. [3, 6, 9]'));
    return undefined;
  }
  if (v.length !== 3) {
    out.push(stop(path, `${v.length} number${v.length === 1 ? '' : 's'} given`, 'give exactly 3: quick, standard, thorough, e.g. [3, 6, 9]'));
    return undefined;
  }
  let ok = true;
  v.forEach((n, i) => {
    if (typeof n === 'number' && Number.isInteger(n) && n >= 1) return;
    out.push(stop(`${path}[${i}]`, `${JSON.stringify(n)} is not allowed`, 'use whole numbers of at least 1, ascending'));
    ok = false;
  });
  if (!ok) return undefined;
  const t = v as Tiers;
  if (!(t[0] <= t[1] && t[1] <= t[2])) {
    out.push(stop(path, `[${t.join(', ')}] is not ascending`, 'make quick <= standard <= thorough, e.g. [3, 6, 9]'));
    return undefined;
  }
  return t;
}

/** `depth:` — per verb that has a depth, how many probes (3 questions each) quick, standard and thorough ask. */
function checkDepth(v: unknown, out: ConfigStop[]): Partial<Mm3Config['depth']> {
  if (isEmptySection(v)) return {};
  if (!isObj(v)) {
    out.push(stop('depth', 'is not a mapping', 'write class:, scan: and/or loop: under depth:, each a list like [3, 6, 9]'));
    return {};
  }
  const result: Partial<Mm3Config['depth']> = {};
  for (const k of Object.keys(v)) {
    const path = `depth.${k}`;
    if ((DEPTH_VERBS as readonly string[]).includes(k)) {
      const t = checkTiers(path, v[k], out);
      if (t) result[k as (typeof DEPTH_VERBS)[number]] = t;
    } else if ((NO_DEPTH_VERBS as readonly string[]).includes(k)) {
      out.push(stop(path, `${k} has no depth setting`, 'set depth for class, scan or loop only'));
    } else {
      const hint = didYouMean(k, DEPTH_VERBS);
      out.push(stop(path, `"${k}" is not a verb with a depth`, hint ? `did you mean ${hint}?` : 'use class, scan or loop'));
    }
  }
  return result;
}

const EVIDENCE_FIELDS = ['perItemChars', 'totalChars', 'maxFiles'] as const;

function checkEvidence(v: unknown, out: ConfigStop[]): Partial<Mm3Config['evidence']> {
  if (isEmptySection(v)) return {};
  if (!isObj(v)) {
    out.push(stop('evidence', 'is not a mapping', 'write perItemChars:, totalChars: and/or maxFiles: under evidence:'));
    return {};
  }
  const result: Partial<Mm3Config['evidence']> = {};
  for (const k of Object.keys(v)) {
    const path = `evidence.${k}`;
    if ((EVIDENCE_FIELDS as readonly string[]).includes(k)) {
      if (checkWhole(path, v[k], out)) result[k as (typeof EVIDENCE_FIELDS)[number]] = v[k] as number;
    } else {
      const hint = didYouMean(k, EVIDENCE_FIELDS);
      out.push(stop(path, `"${k}" is not an evidence field`, hint ? `did you mean ${hint}?` : `use ${EVIDENCE_FIELDS.join(', ')}`));
    }
  }
  return result;
}

const LENS_FIELDS = ['concernAt', 'weakBelow', 'strongAt'] as const;

function checkLens(v: unknown, out: ConfigStop[]): Partial<Mm3Config['lens']> {
  if (isEmptySection(v)) return {};
  if (!isObj(v)) {
    out.push(stop('lens', 'is not a mapping', 'write concernAt:, weakBelow: and/or strongAt: under lens:'));
    return {};
  }
  const result: Partial<Mm3Config['lens']> = {};
  for (const k of Object.keys(v)) {
    const path = `lens.${k}`;
    if ((LENS_FIELDS as readonly string[]).includes(k)) {
      if (checkShare(path, v[k], out)) result[k as (typeof LENS_FIELDS)[number]] = v[k] as number;
    } else {
      const hint = didYouMean(k, LENS_FIELDS);
      out.push(stop(path, `"${k}" is not a lens field`, hint ? `did you mean ${hint}?` : `use ${LENS_FIELDS.join(', ')}`));
    }
  }
  return result;
}

/** The rules that relate settings to each other, checked on the EFFECTIVE values (a file may set only some of a
 *  group, so each check merges what it names over the defaults first). A group that breaks its rule is dropped
 *  whole, like any other bad value — the rest of the file still applies. */
function checkRelations(value: Partial<Mm3Config>, out: ConfigStop[]): void {
  const per = value.sweep?.itemsPerLayer;
  if (per) {
    const eff = { ...DEFAULT_CONFIG.sweep.itemsPerLayer, ...per };
    if (!(eff.quick <= eff.standard && eff.standard <= eff.thorough)) {
      out.push(stop('sweep.itemsPerLayer', `quick ${eff.quick}, standard ${eff.standard}, thorough ${eff.thorough} is not ascending`, 'make quick <= standard <= thorough'));
      delete (value.sweep as Partial<Mm3Config['sweep']>).itemsPerLayer;
    }
  }
  const ev = value.evidence;
  if (ev) {
    const eff = { ...DEFAULT_CONFIG.evidence, ...ev };
    if (eff.perItemChars > eff.totalChars) {
      out.push(stop('evidence', `perItemChars ${eff.perItemChars} is larger than totalChars ${eff.totalChars}`, 'make perItemChars no larger than totalChars'));
      delete value.evidence;
    }
  }
  const lens = value.lens;
  if (lens) {
    const eff = { ...DEFAULT_CONFIG.lens, ...lens };
    if (!(eff.weakBelow < eff.concernAt && eff.concernAt < eff.strongAt)) {
      out.push(stop('lens', `weakBelow ${eff.weakBelow}, concernAt ${eff.concernAt}, strongAt ${eff.strongAt} is out of order`, 'keep weakBelow below concernAt below strongAt'));
      delete value.lens;
    }
  }
  // One call must hold a verb's whole ask: 3 questions per probe at the thorough tier, plus up to DECISIONS_MAX decisions.
  const maxQ = value.sweep?.maxQuestionsPerCall ?? DEFAULT_CONFIG.sweep.maxQuestionsPerCall;
  for (const verb of DEPTH_VERBS) {
    const tiers = value.depth?.[verb];
    if (tiers && 3 * tiers[2] + DECISIONS_MAX > maxQ) {
      out.push(stop(`depth.${verb}`, `thorough ${tiers[2]} asks ${3 * tiers[2]} questions plus up to ${DECISIONS_MAX} decisions, more than sweep.maxQuestionsPerCall (${maxQ})`, 'lower the thorough number, or raise sweep.maxQuestionsPerCall'));
      delete value.depth![verb];
    }
  }
}

const MDL_OVERRIDE_FIELDS = ['values', 'note', 'as', 'pattern', 'link', 'literal'] as const;

/** Accepted and round-tripped, but not yet consumed by mdl-fields.ts's card/validator generation (a later
 *  piece) — see defaults.ts's MdlFieldOverride doc. Still fully validated so a typo doesn't silently do
 *  nothing once that consumer lands. */
function checkMdl(v: unknown, out: ConfigStop[]): Mm3Config['mdl'] {
  if (isEmptySection(v)) return {};
  if (!isObj(v)) {
    out.push(stop('mdl', 'is not a mapping', 'write <field>: {values: [...], note: "..."} under mdl:'));
    return {};
  }
  const result: Mm3Config['mdl'] = {};
  for (const field of Object.keys(v)) {
    const override = v[field];
    const path = `mdl.${field}`;
    if (isEmptySection(override)) continue; // a field header with every override commented out: no override
    if (!isObj(override)) {
      out.push(stop(path, 'is not a mapping', 'write {values?, note?, as?, pattern?, link?, literal?}'));
      continue;
    }
    const entry: Record<string, unknown> = {};
    for (const k of Object.keys(override)) {
      if (!(MDL_OVERRIDE_FIELDS as readonly string[]).includes(k)) {
        const hint = didYouMean(k, MDL_OVERRIDE_FIELDS);
        out.push(stop(`${path}.${k}`, `"${k}" is not an mdl override field`, hint ? `did you mean ${hint}?` : `use ${MDL_OVERRIDE_FIELDS.join(', ')}`));
        continue;
      }
      const val = override[k];
      if (typeof val === 'string' && checkSecretValue(`${path}.${k}`, val, out)) continue;
      if (Array.isArray(val) && val.some((x) => typeof x === 'string' && looksLikeSecret(x))) {
        out.push(stop(`${path}.${k}`, 'looks like a key', 'keys go in env (TYPESAFE_API_KEY) or the keychain, never in config'));
        continue;
      }
      entry[k] = val;
    }
    result[field] = entry;
  }
  return result;
}

/** Validates one RAW parsed config object → the problems found, plus the parts that DID check out (so load.ts
 *  can still apply everything that passed even when something else in the file is wrong — one bad key must
 *  never blank out an otherwise-good file). `raw` is `unknown` because it's whatever `yaml`'s parser handed
 *  back — never assumed to already be shaped like Mm3Config. */
export function validateConfig(raw: unknown): { stops: ConfigStop[]; value: Partial<Mm3Config> } {
  const out: ConfigStop[] = [];
  if (!isObj(raw)) {
    out.push(stop('', 'is not a mapping', 'write budget:, provider: etc. as top-level keys'));
    return { stops: out, value: {} };
  }
  const value: Partial<Mm3Config> = {};
  for (const key of Object.keys(raw)) {
    if (checkSecretLike(key, key, out)) continue;
    if ((CONTRACT_ONLY_KEYS as readonly string[]).includes(key)) {
      out.push(stop(key, 'is a request field, not a project setting', 'not configurable (request contract) → set it per request'));
      continue;
    }
    if (!(CONFIG_KEYS as readonly string[]).includes(key)) {
      const hint = didYouMean(key, CONFIG_KEYS);
      out.push(stop(key, `"${key}" is not a config key`, hint ? `did you mean ${hint}?` : `use one of ${CONFIG_KEYS.join(', ')}`));
      continue;
    }
    const v = (raw as Record<string, unknown>)[key];
    switch (key) {
      case 'budget':
        value.budget = checkBudget(v, out) as Mm3Config['budget'];
        break;
      case 'provider':
        if (checkNonEmptyString('provider', v, out)) value.provider = v as string;
        break;
      case 'baseURL':
        if (checkNonEmptyString('baseURL', v, out)) value.baseURL = v as string;
        break;
      case 'model':
        if (checkNonEmptyString('model', v, out)) value.model = v as string;
        break;
      case 'pricing':
        value.pricing = checkPricing(v, out);
        break;
      case 'timeoutMs':
      case 'retries':
      case 'backoffMs':
      case 'requestMaxBytes':
        if (checkPositiveNumber(key, v, out)) value[key] = v as number;
        break;
      case 'sweep':
        value.sweep = checkSweep(v, out) as Mm3Config['sweep'];
        break;
      case 'reuse':
        value.reuse = checkReuse(v, out);
        break;
      case 'depth':
        value.depth = checkDepth(v, out) as Mm3Config['depth'];
        break;
      case 'evidence':
        value.evidence = checkEvidence(v, out) as Mm3Config['evidence'];
        break;
      case 'lens':
        value.lens = checkLens(v, out) as Mm3Config['lens'];
        break;
      case 'mdl':
        value.mdl = checkMdl(v, out);
        break;
    }
  }
  checkRelations(value, out);
  return { stops: out, value };
}

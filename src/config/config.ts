/**
 * `mm3 config`: prints the EFFECTIVE config as valid, copyable YAML — plain `config` never
 * writes anything. Free, like `doctor`: works with or without a project (no project just means every value is a
 * default, since there's nowhere for config.yaml to live). A broken config.yaml is reported here too (the same
 * stops `mm3 doctor` would show), but this command still prints the rest of the effective table
 * underneath — one bad key never hides everything else.
 *
 * Unlike every other verb's response, this is NOT built through contract/emit.ts's `m()`/`emit()`: that
 * formatter exists for the compact mak:/plan: response shape, and its `scalar()` double-quotes any string
 * containing " #" — exactly what a naive "value  # source" row would need, which used to make every single line
 * here a quoted string literal, not a real YAML comment (a config.yaml pasted from that output was garbage:
 * `budget: {usd: "5  # default", ...}`). This instead hand-builds real YAML text, one field per line, so the
 * whole document parses as YAML and can be edited directly:
 *   - an OVERRIDDEN field (source config/env) is a live line with a trailing real comment naming the source;
 *   - a field at its DEFAULT is a commented-out line showing that default value, so uncommenting it reproduces
 *     today's effective value exactly;
 *   - an OPTIONAL field nobody set (no default exists at all — provider, baseURL, model, budget.since,
 *     sweep.maxItems, reuse.maxAgeDays/maxCommits) is a commented EXAMPLE instead, since there's no real value
 *     to show. Either way, uncommenting any single line yields a valid config.yaml fragment.
 * That display is NOT itself a file (it is wrapped in `config:`/`project:`/`notes:`), so `mm3 config --write`
 * (runConfigWrite below) writes the real thing: a STARTER `.mm3/config.yaml`, only when none exists, built from
 * the same defaults table and the same example values as the display so the two can't drift. Every setting in it
 * is commented out and every section header is live (a header with no live child is null, which validate.ts
 * reads as "no overrides"), so it is valid as-is and stays valid when any one value line is uncommented. This
 * module also spots a near-miss file name in `.mm3/` (config.ymal, config.yml, ...) that would otherwise be
 * ignored without a word.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { scalar } from '../contract/emit.ts';
import { onStore } from '../ledger/lock.ts';
import { latestConfigRecord } from '../ledger/index.ts';
import { appendConfig } from '../ledger/log.ts';
import { ensureDir, type Mm3Paths } from '../ledger/paths.ts';
import type { VerbResult } from '../verbs/types.ts';
import { DEFAULT_CONFIG, KEYED_MAPS, type ConfigSource, type Mm3Config, type PricingRate } from './defaults.ts';
import { configStatus, fingerprintOf, statusLine } from './receipt.ts';
import { mergeConfig, resolveConfig, type ResolvedConfig } from './load.ts';
import { checkConfigText } from './parse.ts';

type Prim = string | number | boolean | readonly number[];

// Not emit.ts's own num() (String, not toFixed(2)): that helper caps display at 2 decimal places for
// probabilities, which would round a real pricing rate like $0.042/Mtok down to "0.04" — silently wrong money.
const valueText = (v: Prim): string => (typeof v === 'string' ? scalar(v, false) : Array.isArray(v) ? `[${v.join(', ')}]` : String(v));

/** One field's line. `value` is this field's real effective value (config/default), when it has one at all;
 *  `example` is only ever shown when neither an override nor a default value exists. The 4 env-aware fields
 *  (provider/baseURL/model/timeoutMs — see load.ts's own module doc) can be labeled source: 'env' while their
 *  config-layer `value` is still undefined (env only wins at real runtime, never shown as this module's own
 *  `config.<field>`); that combination gets its own line rather than crashing on a missing value. */
function fieldLine(indent: string, key: string, source: ConfigSource | undefined, value: Prim | undefined, example: Prim, extra = ''): string {
  if ((source === 'config' || source === 'env') && value !== undefined) {
    return `${indent}${key}: ${valueText(value)}  # ${source === 'config' ? 'from config.yaml' : 'env'}${extra}`;
  }
  if (value !== undefined) return `${indent}# ${key}: ${valueText(value)}  # default${extra}`;
  if (source === 'env') return `${indent}# ${key}: (set via env, not config.yaml)`;
  return `${indent}# ${key}: ${valueText(example)}  # example`;
}

/** The value shown for a setting with no built-in default (or, in the display, the commented example line):
 *  one table for the display and the starter file. Settings that do have a default show that default instead. */
const EXAMPLES: Record<string, Prim> = {
  'budget.since': '2026-01-01T00:00:00Z',
  provider: 'typesafe',
  baseURL: 'https://api.typesafe.ai',
  model: 'jev-1.13.0',
  'sweep.maxItems': 30,
  'reuse.maxAgeDays': 30,
  'reuse.maxCommits': 20,
};
const ex = (key: string): Prim => EXAMPLES[key]!;

const ITEM_TIERS = ['quick', 'standard', 'thorough'] as const;
const DEPTH_VERBS = ['class', 'scan', 'loop'] as const;
const EVIDENCE_FIELDS = ['perItemChars', 'totalChars', 'maxFiles'] as const;
const LENS_FIELDS = ['concernAt', 'weakBelow', 'strongAt'] as const;

const PRICING_FIELDS = ['inputPerMTok', 'outputPerMTok', 'perSecond', 'perCall'] as const;

function pricingLines(resolved: ResolvedConfig): string[] {
  const lines: string[] = ['  pricing:'];
  for (const [model, rate] of Object.entries(resolved.config.pricing)) {
    lines.push(`    ${scalar(model, false)}:`);
    const modelSource = resolved.sources[`pricing.${model}`];
    for (const f of PRICING_FIELDS) {
      const v = (rate as PricingRate)[f];
      if (v === undefined) continue; // this model has no rate at all for this field — nothing to show or example
      lines.push(fieldLine('      ', f, resolved.sources[`pricing.${model}.${f}`] ?? modelSource, v, 0));
    }
  }
  return lines;
}

/** mdl overrides have no "default" at all (defaults.ts's DEFAULT_CONFIG.mdl is always `{}`) — every field
 *  present came from config.yaml, so each is always a live line; with none configured, one commented example
 *  block shows the shape instead of leaving the section out entirely. */
function mdlLines(resolved: ResolvedConfig): string[] {
  const entries = Object.entries(resolved.config.mdl);
  if (!entries.length) return ['  # mdl:', '  #   risk: {values: [low, medium, high]}  # example override'];
  const lines: string[] = ['  mdl:'];
  for (const [field, override] of entries) {
    lines.push(`    ${scalar(field, false)}:`);
    for (const [k, v] of Object.entries(override)) {
      const text = Array.isArray(v) ? `[${v.map((x) => scalar(String(x), true)).join(', ')}]` : typeof v === 'boolean' ? String(v) : scalar(String(v), false);
      lines.push(`      ${k}: ${text}  # from config.yaml`);
    }
  }
  return lines;
}

/** The config file's path as shown in a note: relative to where the command ran, like the `project:` line. */
const configFileLabel = (projectLine: string): string => (projectLine === '.' || projectLine === 'none' ? '.mm3/config.yaml' : `${projectLine}/.mm3/config.yaml`);

const customizeNote = (projectLine: string): string =>
  projectLine === 'none'
    ? 'to customize: run mm3 config --write inside a project → writes .mm3/config.yaml with a commented guide'
    : 'to customize: run mm3 config --write → writes .mm3/config.yaml with a commented guide';

export function formatConfig(resolved: ResolvedConfig, projectLine: string, extraNotes: readonly string[] = []): string {
  const c = resolved.config;
  const s = resolved.sources;
  const lines: string[] = [
    'config:',
    `  project: ${scalar(projectLine, false)}`,
    '',
    '  budget:',
    fieldLine('    ', 'usd', s['budget.usd'], c.budget.usd, 5),
    fieldLine('    ', 'runs', s['budget.runs'], c.budget.runs, 500),
    fieldLine('    ', 'per', s['budget.per'], c.budget.per, 'total'),
    fieldLine('    ', 'since', s['budget.since'], c.budget.since, ex('budget.since')),
    fieldLine('    ', 'warnAt', s['budget.warnAt'], c.budget.warnAt, 0.8),
    '',
    fieldLine('  ', 'provider', s.provider, c.provider, ex('provider')),
    fieldLine('  ', 'baseURL', s.baseURL, c.baseURL, ex('baseURL')),
    fieldLine('  ', 'model', s.model, c.model, ex('model')),
    '',
    ...pricingLines(resolved),
    '',
    fieldLine('  ', 'timeoutMs', s.timeoutMs, c.timeoutMs, 20_000),
    fieldLine('  ', 'retries', s.retries, c.retries, 2),
    fieldLine('  ', 'backoffMs', s.backoffMs, c.backoffMs, 1000),
    '',
    '  sweep:',
    fieldLine('    ', 'maxItems', s['sweep.maxItems'], c.sweep.maxItems, ex('sweep.maxItems')),
    fieldLine('    ', 'maxQuestionsPerCall', s['sweep.maxQuestionsPerCall'], c.sweep.maxQuestionsPerCall, 500),
    '    itemsPerLayer:',
    ...ITEM_TIERS.map((t) => fieldLine('      ', t, s[`sweep.itemsPerLayer.${t}`], c.sweep.itemsPerLayer[t], 10)),
    '',
    fieldLine('  ', 'requestMaxBytes', s.requestMaxBytes, c.requestMaxBytes, 1_048_576),
    '',
    '  reuse:',
    fieldLine('    ', 'maxAgeDays', s['reuse.maxAgeDays'], c.reuse.maxAgeDays, ex('reuse.maxAgeDays')),
    fieldLine('    ', 'maxCommits', s['reuse.maxCommits'], c.reuse.maxCommits, ex('reuse.maxCommits')),
    '',
    '  depth:',
    ...DEPTH_VERBS.map((v) => fieldLine('    ', v, s[`depth.${v}`], c.depth[v], [3, 6, 9], ` · ${c.depth[v].map((n) => n * 3).join(', ')} questions`)),
    '',
    '  evidence:',
    ...EVIDENCE_FIELDS.map((f) => fieldLine('    ', f, s[`evidence.${f}`], c.evidence[f], 0)),
    '',
    '  lens:',
    ...LENS_FIELDS.map((f) => fieldLine('    ', f, s[`lens.${f}`], c.lens[f], 0)),
    '',
    ...mdlLines(resolved),
    '',
    'notes:',
    '  - free: never spends; plain config never writes',
    ...(resolved.present ? [`  - customized in ${configFileLabel(projectLine)} → edit it (it applies at once), then run mm3 config --load to record the change`] : ['  - no config.yaml here → every value is a default or env var', `  - ${customizeNote(projectLine)}`]),
    ...extraNotes.map((n) => `  - ${n}`),
  ];
  return `${lines.join('\n')}\n`;
}

/** Files in `.mm3/` that look like a misnamed config.yaml (config.yml, config.ymal, config.yaml.txt,
 *  config.json, Config.yaml ...) — only when the real one is missing, since then the typo is why nothing applied.
 *  One note each (at most 3), in the help-first `what → fix` shape; never a stop. */
export function nearMissNotes(paths: Mm3Paths | undefined): string[] {
  if (!paths || existsSync(paths.config)) return [];
  let names: string[];
  try {
    names = readdirSync(paths.dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.toLowerCase().startsWith('config') && n !== 'config.yaml' && !n.startsWith('config.active.json')) // a copy older versions of MM3 left behind (and its temp file) are MM3's own, not a misnamed config
    .sort()
    .slice(0, 3)
    .map((n) => `found .mm3/${n} — did you mean config.yaml? → rename it`);
}

export function runConfig(env: Record<string, string | undefined>, paths: Mm3Paths | undefined, projectLine: string): VerbResult {
  const resolved = resolveConfig(paths, env);
  const status = configStatus(paths);
  const line = statusLine(status);
  const notes = [...(line ? [line] : []), ...nearMissNotes(paths)];
  // The problems shown are the file's own, as it stands now: it is what every request reads.
  if (status.fileStops.length) {
    const stopLines = status.fileStops.map((st) => st.text).join('\n');
    return { exit: 2, text: `${stopLines}\n\n${formatConfig(resolved, projectLine, notes)}\n→ see: mm3 agent config` };
  }
  return { exit: 0, text: formatConfig(resolved, projectLine, notes) };
}

/** What each setting is, in a few plain words — the trailing comment on its line in the starter file. */
const HINTS: Record<string, string> = {
  budget: 'spending caps',
  'budget.usd': 'dollars MM3 may spend',
  'budget.runs': 'paid runs MM3 may make',
  'budget.per': 'count the caps: total | day | hour',
  'budget.since': 'only count spend after this moment',
  'budget.warnAt': 'share of a cap spent before the budget line warns (above 0, up to 1)',
  provider: 'typesafe | fake (free sample answers)',
  baseURL: 'where classifier calls go (https)',
  model: 'the pinned classifier model',
  pricing: 'what a call costs, per model, for budget estimates (dollars)',
  timeoutMs: 'give up on one call after this many ms',
  retries: 'extra tries after a retryable failure',
  backoffMs: 'first wait between tries, in ms',
  sweep: 'limits on scan and loop',
  'sweep.maxItems': 'most items one sweep may look at (can only lower the built-in cap)',
  'sweep.maxQuestionsPerCall': 'most questions in one classifier call',
  'sweep.itemsPerLayer': 'items asked per layer at each depth',
  'sweep.itemsPerLayer.quick': 'items per layer at depth quick',
  'sweep.itemsPerLayer.standard': 'items per layer at depth standard',
  'sweep.itemsPerLayer.thorough': 'items per layer at depth thorough',
  requestMaxBytes: 'largest request file MM3 will read',
  depth: 'probes (3 questions each) at quick, standard, thorough, per verb',
  'depth.class': 'class: three whole numbers, ascending',
  'depth.scan': 'scan: three whole numbers, ascending',
  'depth.loop': 'loop: three whole numbers, ascending',
  evidence: 'how much code or text one call may carry',
  'evidence.perItemChars': 'characters kept per file or item',
  'evidence.totalChars': 'characters kept in one call (at least perItemChars)',
  'evidence.maxFiles': 'files one glob may match',
  lens: 'consensus thresholds over the yes/no answers (weakBelow < concernAt < strongAt)',
  'lens.concernAt': 'a probe at or above this reads as a concern',
  'lens.weakBelow': 'consensus is WEAK below this decisiveness',
  'lens.strongAt': 'consensus is STRONG at or above this agreement',
  reuse: 'when a stored answer is too old to reuse (off unless set)',
  'reuse.maxAgeDays': 're-ask answers older than this many days',
  'reuse.maxCommits': 're-ask after this many commits',
  mdl: 'per-field overrides of the mdl catalog (see mm3 agent mdl)',
};

const PRICING_HINTS: Record<(typeof PRICING_FIELDS)[number], string> = {
  inputPerMTok: 'dollars per million input tokens',
  outputPerMTok: 'dollars per million output tokens',
  perSecond: 'dollars per second of compute',
  perCall: 'dollars per call',
};

const STARTER_FRONT = [
  '# MM3 project settings (.mm3/config.yaml).',
  '#',
  '# Every setting below is commented out, so MM3 runs on its built-in defaults. To change one, uncomment its',
  '# line (delete the leading "# ") and change the value. To go back to the default, delete the line or comment it',
  '# out again. Run mm3 config to check the file: it lists every problem and where each value comes from. Edits apply',
  '# at once; mm3 config --load checks the file and records the change in the ledger (a bad file is refused).',
  '#',
  '# Precedence: environment variable > this file > built-in default.',
  '# Safe to commit: it holds settings only, never keys (those go in env or the keychain). The ledger is not committed.',
  '',
];

function getIn(root: unknown, dotted: string): Prim | undefined {
  let cur = root;
  for (const k of dotted.split('.')) cur = typeof cur === 'object' && cur !== null ? (cur as Record<string, unknown>)[k] : undefined;
  return cur as Prim | undefined;
}

/** The text `mm3 config --write` writes. Built from DEFAULT_CONFIG (the value of every setting that has one)
 *  and EXAMPLES (the ones that don't) — the same two tables the display reads. Section headers are live so a
 *  block with every child commented out parses as null ("no overrides", validate.ts); setting lines are `# `
 *  plus the exact line they become when uncommented, each with a short trailing comment. */
export function starterConfig(): string {
  const val = (key: string): string => valueText(getIn(DEFAULT_CONFIG, key) ?? ex(key));
  const header = (indent: string, label: string, hintKey: string, hint = HINTS[hintKey]): string => `${indent}${label}:${hint ? `  # ${hint}` : ''}`;
  const setting = (indent: string, key: string, dotted: string): string => `# ${indent}${key}: ${val(dotted)}  # ${HINTS[dotted]}`;
  const top = (key: string): string => setting('', key, key);
  const lines: string[] = [
    ...STARTER_FRONT,
    header('', 'budget', 'budget'),
    setting('  ', 'usd', 'budget.usd'),
    setting('  ', 'runs', 'budget.runs'),
    setting('  ', 'per', 'budget.per'),
    setting('  ', 'since', 'budget.since'),
    setting('  ', 'warnAt', 'budget.warnAt'),
    '',
    top('provider'),
    top('baseURL'),
    top('model'),
    '',
    header('', 'pricing', 'pricing'),
  ];
  for (const [model, rate] of Object.entries(DEFAULT_CONFIG.pricing)) {
    lines.push(header('  ', scalar(model, false), '', `also: ${PRICING_FIELDS.filter((f) => (rate as PricingRate)[f] === undefined).join(', ')}`));
    for (const f of PRICING_FIELDS) {
      const v = (rate as PricingRate)[f];
      if (v !== undefined) lines.push(`#     ${f}: ${valueText(v)}  # ${PRICING_HINTS[f]}`);
    }
  }
  lines.push(
    '',
    top('timeoutMs'),
    top('retries'),
    top('backoffMs'),
    '',
    header('', 'sweep', 'sweep'),
    setting('  ', 'maxItems', 'sweep.maxItems'),
    setting('  ', 'maxQuestionsPerCall', 'sweep.maxQuestionsPerCall'),
    header('  ', 'itemsPerLayer', 'sweep.itemsPerLayer'),
    ...ITEM_TIERS.map((t) => setting('    ', t, `sweep.itemsPerLayer.${t}`)),
    '',
    top('requestMaxBytes'),
    '',
    header('', 'reuse', 'reuse'),
    setting('  ', 'maxAgeDays', 'reuse.maxAgeDays'),
    setting('  ', 'maxCommits', 'reuse.maxCommits'),
    '',
    header('', 'depth', 'depth'),
    ...DEPTH_VERBS.map((v) => setting('  ', v, `depth.${v}`)),
    '',
    header('', 'evidence', 'evidence'),
    ...EVIDENCE_FIELDS.map((f) => setting('  ', f, `evidence.${f}`)),
    '',
    header('', 'lens', 'lens'),
    ...LENS_FIELDS.map((f) => setting('  ', f, `lens.${f}`)),
    '',
    header('', 'mdl', 'mdl'),
    '#   risk: {values: [low, medium, high]}  # example: your own values for one field',
  );
  return `${lines.join('\n')}\n`;
}

/** `mm3 config --write`: writes the starter `.mm3/config.yaml` ONLY when none exists (flag `wx`: never
 *  overwrites, even in a race). An existing file is a note at exit 0, never a stop. No project → a stop, since
 *  we never create `.mm3/` in whatever folder an agent happens to be in (paths.ts resolvePaths). */
export function runConfigWrite(paths: Mm3Paths | undefined, projectLine: string): VerbResult {
  if (!paths) return { exit: 2, text: '✖ config: no project here → run inside a project (a folder with .git or .mm3), or set MM3_HOME' };
  const label = configFileLabel(projectLine);
  const exists: VerbResult = { exit: 0, text: `config: ${label} already exists → not overwritten; edit it, then run mm3 config --load to activate the change\n` };
  if (existsSync(paths.config)) return exists;
  const wrote = onStore(paths.config, 'write', () => {
    ensureDir(paths);
    try {
      const starter = starterConfig();
      writeFileSync(paths.config, starter, { flag: 'wx' });
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw e;
    }
  });
  if (!wrote) return exists;
  return { exit: 0, text: `wrote: ${label}\nnotes:\n  - every setting is commented out → uncomment a line and change its value, then run mm3 config --load to check and activate it\n` };
}

const show = (v: unknown): string => {
  if (v === undefined) return '(not set)';
  if (Array.isArray(v)) return `[${v.map(show).join(', ')}]`;
  if (typeof v === 'object' && v !== null) return `{${Object.entries(v).map(([k, x]) => `${k}: ${show(x)}`).join(', ')}}`;
  return typeof v === 'string' ? scalar(v, false) : String(v);
};
const isTree = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every setting an override changes from its default, as `path: default → value` (an override equal to its default
 *  changes nothing and is not listed). A keyed map's entry (a pricing model, an mdl field) is one change. */
function changesFrom(over: Record<string, unknown>, def: Record<string, unknown>, prefix: string, out: string[]): void {
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    const at = prefix ? `${prefix}.${k}` : k;
    const d = def[k];
    if (isTree(v) && !(KEYED_MAPS as readonly string[]).includes(prefix)) changesFrom(v, isTree(d) ? d : {}, at, out);
    else if (JSON.stringify(v) !== JSON.stringify(d)) out.push(`${at}: ${show(d)} → ${show(v)}`);
  }
}

const MAX_CHANGES_SHOWN = 20;

const isoSeconds = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
/** The caps or the window kind differ between two override sets, each read against the defaults (`warnAt` and `since` don't count). */
const budgetChanged = (a: Partial<Mm3Config>, b: Partial<Mm3Config>): boolean => {
  const d = DEFAULT_CONFIG.budget;
  return (a.budget?.usd ?? d.usd) !== (b.budget?.usd ?? d.usd) || (a.budget?.runs ?? d.runs) !== (b.budget?.runs ?? d.runs) || (a.budget?.per ?? d.per) !== (b.budget?.per ?? d.per);
};

/** `mm3 config --load` with no `.mm3/config.yaml`: the defaults already apply, so there is nothing to check. When a
 *  load of a file was recorded before, taking the file away is a change too: record a receipt of the defaults (so the
 *  ledger says when, what changed and, if the budget changed, where its count restarts) and doctor stops warning. With
 *  no earlier load, or when the defaults were already recorded, there is nothing to record. */
function loadAbsent(paths: Mm3Paths, now: number): VerbResult {
  const previous = latestConfigRecord(paths);
  if (!previous || previous.absent) return { exit: 0, text: '✔ no config.yaml · the defaults already apply · nothing to record → mm3 config --write for a starter\n' };
  const previousSettings = (previous.settings ?? {}) as Partial<Mm3Config>;
  const changes: string[] = [];
  changesFrom(mergeConfig({}).config as unknown as Record<string, unknown>, mergeConfig(previousSettings).config as unknown as Record<string, unknown>, '', changes);
  const restarted = budgetChanged(previousSettings, {});
  ensureDir(paths);
  appendConfig(paths, { fingerprint: fingerprintOf(''), settings: {}, changes, absent: true, ...(restarted ? { windowSince: isoSeconds(now) } : previous.windowSince ? { windowSince: previous.windowSince } : {}) }, now);
  const shown = changes.slice(0, MAX_CHANGES_SHOWN).map((c) => `  ${c}`);
  if (changes.length > shown.length) shown.push(`  … ${changes.length - shown.length} more`);
  return { exit: 0, text: `${['✔ no config.yaml · the defaults apply · recorded', ...shown, ...(restarted ? ['  count restarted: the budget changed, so spend is counted from now'] : [])].join('\n')}\n` };
}

/** `mm3 config --load [file]`: checks the file with the same validation `mm3 config`/`mm3 doctor` use and, only if it is
 *  clean, appends a receipt to the ledger: when, the file's hash, the settings, what changed since the previous receipt
 *  (or from the defaults, for the first). It does not change what runs read: every request already reads config.yaml
 *  itself. A bad file prints every problem, exits 2 and records nothing. A `file` other than `.mm3/config.yaml` is checked
 *  first and then copied there verbatim (comments and all; the user's own config.yaml is never rewritten in place). When
 *  the budget (usd, runs or per) changed since the previous receipt, and the file has no `budget.since` of its own, the
 *  receipt starts the budget count over from this moment; a later load that leaves the budget alone carries that start
 *  forward. */
export function runConfigLoad(paths: Mm3Paths | undefined, file: string | undefined, cwd: string, projectLine: string, now: number = Date.now()): VerbResult {
  if (!paths) return { exit: 2, text: '✖ config: no project here → run inside a project (a folder with .git or .mm3), or set MM3_HOME' };
  const label = configFileLabel(projectLine);
  if (file === undefined && !existsSync(paths.config)) return loadAbsent(paths, now);
  const source = file === undefined ? paths.config : path.resolve(cwd, file);
  let text: string;
  try {
    text = readFileSync(source, 'utf8');
  } catch {
    return {
      exit: 2,
      text:
        file === undefined
          ? `✖ config: no ${label} to load → run mm3 config --write for a starter, or name a file: mm3 config --load <file>\n`
          : `✖ config: cannot read "${file}" → check the path\n`,
    };
  }
  const checked = checkConfigText(text);
  if (checked.stops.length) {
    return { exit: 2, text: `${checked.stops.map((s) => s.text).join('\n')}\nnot loaded: nothing was recorded\n→ see: mm3 agent config\n` };
  }
  const copied = path.resolve(source) !== path.resolve(paths.config);
  if (copied) {
    onStore(paths.config, 'write', () => {
      ensureDir(paths);
      writeFileSync(paths.config, text);
    });
  }
  const previous = latestConfigRecord(paths);
  const previousSettings = (previous?.settings ?? {}) as Partial<Mm3Config>;
  const changes: string[] = [];
  changesFrom(mergeConfig(checked.overrides).config as unknown as Record<string, unknown>, mergeConfig(previousSettings).config as unknown as Record<string, unknown>, '', changes);
  let windowSince: string | undefined;
  let restarted = false;
  if (previous && checked.overrides.budget?.since === undefined) {
    if (budgetChanged(previousSettings, checked.overrides)) {
      windowSince = isoSeconds(now);
      restarted = true;
    } else windowSince = previous.windowSince;
  }
  ensureDir(paths);
  appendConfig(paths, { fingerprint: fingerprintOf(text), settings: checked.overrides as Record<string, unknown>, changes, ...(windowSince ? { windowSince } : {}) }, now);
  const shown = changes.slice(0, MAX_CHANGES_SHOWN).map((c) => `  ${c}`);
  if (changes.length > shown.length) shown.push(`  … ${changes.length - shown.length} more`);
  const head = `✔ valid · loaded · ${changes.length} changed ${previous ? 'since the last load' : 'from the defaults'}`;
  const restartLine = restarted ? ['  count restarted: the budget changed, so spend is counted from now'] : [];
  return { exit: 0, text: `${[head, ...shown, ...restartLine, ...(copied ? [`  copied ${file} → ${label}`] : [])].join('\n')}\n` };
}

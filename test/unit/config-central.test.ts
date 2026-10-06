// The central defaults table and the generic merge: moving the compiled-in numbers into DEFAULT_CONFIG and
// replacing the field-by-field merge changed no value, no source label and no exported name.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/config/defaults.ts';
import { configOf, resolveConfig } from '../../src/config/load.ts';
import { DEPTH_COUNT, SWEEP_ITEM_CAP } from '../../src/index.ts';
import { BUDGET_LOW_FRACTION } from '../../src/budget/budget.ts';
import { ITEM_LIMITS } from '../../src/contract/translate.ts';
import { MAX_FILES } from '../../src/evidence/glob.ts';
import { THRESHOLDS } from '../../src/lens/consensus.ts';
import { tempProject } from '../helpers/project.ts';

// Every key `resolveConfig` labelled before the refactor, and what the sample below made each one.
const OLD_SOURCES = {
  backoffMs: 'default',
  baseURL: 'default',
  'budget.per': 'config',
  'budget.runs': 'config',
  'budget.since': 'config',
  'budget.usd': 'config',
  'mdl.risk': 'config',
  model: 'config',
  'pricing.jev-1.13.0': 'config',
  'pricing.other-model': 'config',
  provider: 'env',
  requestMaxBytes: 'default',
  retries: 'default',
  'reuse.maxAgeDays': 'config',
  'reuse.maxCommits': 'default',
  'sweep.maxItems': 'config',
  'sweep.maxQuestionsPerCall': 'config',
  timeoutMs: 'env',
} as const;

const SAMPLE = `budget:
  usd: 2
  runs: 200
  per: day
  since: "2026-01-01T00:00:00Z"
model: jev-9
timeoutMs: 5000
pricing:
  jev-1.13.0:
    inputPerMTok: 0.05
    outputPerMTok: 0.1
  other-model:
    perCall: 0.01
sweep:
  maxItems: 12
  maxQuestionsPerCall: 100
reuse:
  maxAgeDays: 30
mdl:
  risk:
    values: [low, medium, high]
`;

function sampleProject() {
  const { paths } = tempProject();
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(path.join(paths.dir, 'config.yaml'), SAMPLE);
  return paths;
}

describe('one defaults table', () => {
  it('the new default fields hold the values that used to be compiled in', () => {
    expect(DEFAULT_CONFIG.depth).toEqual({ class: [3, 6, 9], scan: [3, 6, 9], loop: [3, 6, 9] });
    expect(DEFAULT_CONFIG.sweep.itemsPerLayer).toEqual({ quick: 10, standard: 20, thorough: 30 });
    expect(DEFAULT_CONFIG.budget.warnAt).toBe(0.8);
    expect(DEFAULT_CONFIG.evidence).toEqual({ perItemChars: 20_000, totalChars: 60_000, maxFiles: 500 });
    expect(DEFAULT_CONFIG.lens).toEqual({ concernAt: 0.5, weakBelow: 0.35, strongAt: 0.8 });
  });

  it('every old exported constant still exports the same numbers', () => {
    expect(DEPTH_COUNT).toEqual({ quick: 9, standard: 18, thorough: 27 });
    expect(SWEEP_ITEM_CAP).toEqual({ quick: 10, standard: 20, thorough: 30 });
    expect(BUDGET_LOW_FRACTION).toBe(0.8);
    expect(ITEM_LIMITS.perItemChars).toBe(20_000);
    expect(ITEM_LIMITS.totalChars).toBe(60_000);
    expect(MAX_FILES).toBe(500);
    expect(THRESHOLDS).toEqual({ concernAt: 0.5, weakBelow: 0.35, strongAt: 0.8 });
  });

  it('DEPTH_COUNT is derived from the defaults: 3 questions per concern', () => {
    expect(DEPTH_COUNT.quick).toBe(DEFAULT_CONFIG.depth.class[0] * 3);
    expect(DEPTH_COUNT.thorough).toBe(DEFAULT_CONFIG.depth.class[2] * 3);
  });

  it('with no config.yaml the resolved config is the defaults, every leaf labelled default', () => {
    const r = resolveConfig(undefined, {});
    expect(r.config).toEqual(DEFAULT_CONFIG);
    expect(new Set(Object.values(r.sources))).toEqual(new Set(['default']));
  });

  it('the defaults cannot be changed through a resolved config', () => {
    const r = resolveConfig(undefined, {});
    expect(() => {
      r.config.lens.concernAt = 0.9;
    }).toThrow();
    expect(DEFAULT_CONFIG.lens.concernAt).toBe(0.5);
  });
});

describe('the generic merge', () => {
  it('gives the effective config the field-by-field merge gave, plus the new defaults untouched', () => {
    const r = resolveConfig(sampleProject(), { MM3_PROVIDER: 'fake', JEV_TIMEOUT_MS: '9' });
    expect(r.stops).toEqual([]);
    expect(r.present).toBe(true);
    expect(r.config).toEqual({
      budget: { usd: 2, runs: 200, per: 'day', since: '2026-01-01T00:00:00Z', warnAt: 0.8 },
      model: 'jev-9',
      pricing: { 'jev-1.13.0': { inputPerMTok: 0.05, outputPerMTok: 0.1 }, 'other-model': { perCall: 0.01 } },
      timeoutMs: 5000, // the file's value: env only relabels these four, it never changes the value shown
      retries: 2,
      backoffMs: 1000,
      sweep: { maxQuestionsPerCall: 100, maxItems: 12, itemsPerLayer: { quick: 10, standard: 20, thorough: 30 } },
      requestMaxBytes: 1_048_576,
      reuse: { maxAgeDays: 30 },
      mdl: { risk: { values: ['low', 'medium', 'high'] } },
      depth: { class: [3, 6, 9], scan: [3, 6, 9], loop: [3, 6, 9] },
      evidence: { perItemChars: 20_000, totalChars: 60_000, maxFiles: 500 },
      lens: { concernAt: 0.5, weakBelow: 0.35, strongAt: 0.8 },
    });
  });

  it('labels every key it labelled before, identically; new settings are only ever default', () => {
    const r = resolveConfig(sampleProject(), { MM3_PROVIDER: 'fake', JEV_TIMEOUT_MS: '9' });
    const old = Object.fromEntries(Object.keys(OLD_SOURCES).map((k) => [k, r.sources[k]]));
    expect(old).toEqual(OLD_SOURCES);
    const added = Object.entries(r.sources).filter(([k]) => !(k in OLD_SOURCES));
    expect(added.length).toBeGreaterThan(0);
    expect(added.every(([, v]) => v === 'default')).toBe(true);
  });

  it('a keyed-map entry replaces the default entry whole, and the other defaults stay', () => {
    const r = resolveConfig(sampleProject(), {});
    expect(r.config.pricing['jev-1.13.0']).toEqual({ inputPerMTok: 0.05, outputPerMTok: 0.1 });
    expect(DEFAULT_CONFIG.pricing['jev-1.13.0']).toEqual({ inputPerMTok: 0.042 });
  });

  it('an unset-by-default setting is absent, not an empty key, until the file names it', () => {
    const r = resolveConfig(undefined, {});
    expect('since' in r.config.budget).toBe(false);
    expect('maxItems' in r.config.sweep).toBe(false);
    expect(r.sources['budget.since']).toBe('default');
  });
});

describe('configOf', () => {
  it('hands back the already-resolved config without reading the project', () => {
    const resolved = resolveConfig(undefined, {});
    const { paths } = tempProject();
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(path.join(paths.dir, 'config.yaml'), 'budget:\n  usd: 1\n');
    expect(configOf({ paths, env: {}, config: resolved })).toBe(resolved);
    expect(configOf({ paths, env: {} }).config.budget.usd).toBe(1); // no ctx.config: reads fresh, as before
  });
});

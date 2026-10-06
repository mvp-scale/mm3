// The settings that moved from code into config.yaml: depth tiers per verb, sweep.itemsPerLayer, budget.warnAt,
// evidence and lens. Each is validated with a help-first stop, merged over the defaults, shown by `mm3 config`,
// and — the point — changes what the verbs actually do. [C-235] [C-236] [C-237] [C-238] [C-239] [C-240] [C-241]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { budgetLine } from '../../src/budget/budget.ts';
import { formatConfig, starterConfig } from '../../src/config/config.ts';
import { CONFIG_KEYS, CONTRACT_ONLY_KEYS, DEFAULT_CONFIG } from '../../src/config/defaults.ts';
import { resolveConfig } from '../../src/config/load.ts';
import { validateConfig } from '../../src/config/validate.ts';
import { itemsState } from '../../src/contract/translate.ts';
import { validateRequest } from '../../src/contract/validate.ts';
import { expandGlob } from '../../src/evidence/glob.ts';
import { readCodeEvidence } from '../../src/evidence/code.ts';
import { computeConsensus } from '../../src/lens/consensus.ts';
import { runClass } from '../../src/verbs/class.ts';
import { consensusAndEscalate } from '../../src/verbs/respond.ts';
import { contractLimits } from '../../src/verbs/request.ts';
import { planSweep } from '../../src/verbs/sweep.ts';
import type { Category, Request } from '../../src/contract/types.ts';
import { tempProject } from '../helpers/project.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

type Obj = Record<string, unknown>;
const stopTexts = (raw: unknown): string[] => validateConfig(raw).stops.map((s) => s.text);

/** A project whose .mm3/config.yaml holds `text`. */
function projectWith(text: string, files?: Record<string, string>) {
  const p = tempProject(files);
  mkdirSync(p.paths.dir, { recursive: true });
  writeFileSync(path.join(p.paths.dir, 'config.yaml'), text);
  return p;
}

describe('validation: depth [C-235] [C-236]', () => {
  it('depth is a project setting now, not a request-only key', () => {
    expect((CONFIG_KEYS as readonly string[]).includes('depth')).toBe(true);
    expect((CONTRACT_ONLY_KEYS as readonly string[]).includes('depth')).toBe(false);
    expect(validateConfig({ depth: { class: [15, 30, 45], scan: [1, 3, 6], loop: [3, 6, 9] } })).toEqual({
      stops: [],
      value: { depth: { class: [15, 30, 45], scan: [1, 3, 6], loop: [3, 6, 9] } },
    });
  });

  it('a verb left out stays absent from the override (it keeps the default)', () => {
    expect(validateConfig({ depth: { class: [3, 6, 9] } }).value.depth).toEqual({ class: [3, 6, 9] });
  });

  it('three whole numbers, ascending — each way to get it wrong says what to change', () => {
    expect(stopTexts({ depth: { class: [6, 3, 9] } })).toEqual(['✖ config.depth.class: [6, 3, 9] is not ascending → make quick <= standard <= thorough, e.g. [3, 6, 9]']);
    expect(stopTexts({ depth: { class: [3, 6] } })).toEqual(['✖ config.depth.class: 2 numbers given → give exactly 3: quick, standard, thorough, e.g. [3, 6, 9]']);
    expect(stopTexts({ depth: { class: 9 } })).toEqual(['✖ config.depth.class: 9 is not a list → write three whole numbers, quick to thorough, e.g. [3, 6, 9]']);
    expect(stopTexts({ depth: { scan: [3, 0, 9] } })).toEqual(['✖ config.depth.scan[1]: 0 is not allowed → use whole numbers of at least 1, ascending']);
    expect(stopTexts({ depth: { loop: [3, 6.5, 9] } })).toEqual(['✖ config.depth.loop[1]: 6.5 is not allowed → use whole numbers of at least 1, ascending']);
    expect(stopTexts({ depth: { loop: [3, 6, '9'] } })).toEqual(['✖ config.depth.loop[2]: "9" is not allowed → use whole numbers of at least 1, ascending']);
  });

  it('drill, replay and view have no depth setting; a typo names the nearest verb', () => {
    for (const verb of ['drill', 'replay', 'view']) {
      expect(stopTexts({ depth: { [verb]: [3, 6, 9] } })).toEqual([`✖ config.depth.${verb}: ${verb} has no depth setting → set depth for class, scan or loop only`]);
    }
    expect(stopTexts({ depth: { clas: [3, 6, 9] } })).toEqual(['✖ config.depth.clas: "clas" is not a verb with a depth → did you mean class?']);
    expect(stopTexts({ depth: 'quick' })).toEqual(['✖ config.depth: is not a mapping → write class:, scan: and/or loop: under depth:, each a list like [3, 6, 9]']);
  });

  it('a bad verb is dropped alone; the good ones in the same file still apply', () => {
    const r = validateConfig({ depth: { class: [6, 3, 9], scan: [1, 2, 3] } });
    expect(r.stops).toHaveLength(1);
    expect(r.value.depth).toEqual({ scan: [1, 2, 3] });
  });

  it('3 questions per probe at thorough, plus 5 decisions, must fit sweep.maxQuestionsPerCall [C-236]', () => {
    // default maxQuestionsPerCall is 500: 3 * 165 + 5 = 500 fits, 166 does not
    expect(validateConfig({ depth: { class: [3, 6, 165] } }).stops).toEqual([]);
    expect(stopTexts({ depth: { class: [3, 6, 166] } })).toEqual([
      '✖ config.depth.class: thorough 166 asks 498 questions plus up to 5 decisions, more than sweep.maxQuestionsPerCall (500) → lower the thorough number, or raise sweep.maxQuestionsPerCall',
    ]);
    // the effective value counts: a file that raises the cap makes room, one that lowers it takes it away
    expect(validateConfig({ sweep: { maxQuestionsPerCall: 1000 }, depth: { class: [3, 6, 300] } }).stops).toEqual([]);
    expect(stopTexts({ depth: { class: [3, 6, 30] }, sweep: { maxQuestionsPerCall: 90 } })[0]).toContain('more than sweep.maxQuestionsPerCall (90)');
    // key order in the file does not matter
    expect(stopTexts({ depth: { class: [3, 6, 30] }, sweep: { maxQuestionsPerCall: 90 } })).toEqual(stopTexts({ sweep: { maxQuestionsPerCall: 90 }, depth: { class: [3, 6, 30] } }));
  });
});

describe('validation: sweep.itemsPerLayer, budget.warnAt, evidence, lens [C-237] [C-238] [C-239] [C-240]', () => {
  it('itemsPerLayer: whole numbers of at least 1, ascending on the merged values', () => {
    expect(validateConfig({ sweep: { itemsPerLayer: { quick: 5, standard: 10, thorough: 40 } } }).stops).toEqual([]);
    expect(stopTexts({ sweep: { itemsPerLayer: { quick: 0 } } })).toEqual(['✖ config.sweep.itemsPerLayer.quick: 0 is not allowed → use a whole number of at least 1']);
    expect(stopTexts({ sweep: { itemsPerLayer: { quick: 2.5 } } })).toEqual(['✖ config.sweep.itemsPerLayer.quick: 2.5 is not allowed → use a whole number of at least 1']);
    // quick: 25 alone is above the DEFAULT standard (20), so the merged values are not ascending
    expect(stopTexts({ sweep: { itemsPerLayer: { quick: 25 } } })).toEqual(['✖ config.sweep.itemsPerLayer: quick 25, standard 20, thorough 30 is not ascending → make quick <= standard <= thorough']);
    expect(validateConfig({ sweep: { itemsPerLayer: { quick: 25 } } }).value.sweep?.itemsPerLayer).toBeUndefined();
    expect(stopTexts({ sweep: { itemsPerLayer: { quik: 5 } } })).toEqual(['✖ config.sweep.itemsPerLayer.quik: "quik" is not a depth tier → did you mean quick?']);
    expect(stopTexts({ sweep: { itemsPerLayer: 5 } })[0]).toContain('config.sweep.itemsPerLayer: is not a mapping');
    expect(stopTexts({ sweep: { itemsPerLayers: {} } })).toEqual(['✖ config.sweep.itemsPerLayers: "itemsPerLayers" is not a sweep field → did you mean itemsPerLayer?']);
  });

  it('the lower-only sweep.maxItems is still accepted beside it', () => {
    expect(validateConfig({ sweep: { maxItems: 5, itemsPerLayer: { quick: 5, standard: 6, thorough: 7 } } }).stops).toEqual([]);
  });

  it('budget.warnAt: above 0 and up to 1', () => {
    expect(validateConfig({ budget: { warnAt: 1 } }).value.budget).toEqual({ warnAt: 1 });
    expect(validateConfig({ budget: { warnAt: 0.5 } }).stops).toEqual([]);
    for (const bad of [0, -0.1, 1.5, '80%']) {
      expect(stopTexts({ budget: { warnAt: bad } })).toEqual([`✖ config.budget.warnAt: ${JSON.stringify(bad)} is not allowed → use a share above 0 and up to 1, e.g. 0.8 warns at 80% of a cap`]);
    }
    expect(stopTexts({ budget: { warn: 0.5 } })).toEqual(['✖ config.budget.warn: "warn" is not a budget field → did you mean warnAt?']);
  });

  it('evidence: whole numbers of at least 1, perItemChars no larger than totalChars (on merged values)', () => {
    expect(validateConfig({ evidence: { perItemChars: 5000, totalChars: 9000, maxFiles: 50 } }).stops).toEqual([]);
    expect(stopTexts({ evidence: { maxFiles: 0 } })).toEqual(['✖ config.evidence.maxFiles: 0 is not allowed → use a whole number of at least 1']);
    expect(stopTexts({ evidence: { perItemChars: 100.5 } })).toEqual(['✖ config.evidence.perItemChars: 100.5 is not allowed → use a whole number of at least 1']);
    expect(stopTexts({ evidence: { perItemChars: 9000, totalChars: 5000 } })).toEqual(['✖ config.evidence: perItemChars 9000 is larger than totalChars 5000 → make perItemChars no larger than totalChars']);
    // perItemChars alone is above the DEFAULT totalChars (60,000)
    expect(stopTexts({ evidence: { perItemChars: 70_000 } })[0]).toContain('perItemChars 70000 is larger than totalChars 60000');
    expect(validateConfig({ evidence: { perItemChars: 70_000 } }).value.evidence).toBeUndefined();
    expect(stopTexts({ evidence: { maxFile: 5 } })).toEqual(['✖ config.evidence.maxFile: "maxFile" is not an evidence field → did you mean maxFiles?']);
  });

  it('lens: numbers strictly between 0 and 1, weakBelow < concernAt < strongAt on merged values', () => {
    expect(validateConfig({ lens: { weakBelow: 0.2, concernAt: 0.4, strongAt: 0.9 } }).stops).toEqual([]);
    for (const bad of [0, 1, 1.2, '0.5']) {
      expect(stopTexts({ lens: { concernAt: bad } })).toEqual([`✖ config.lens.concernAt: ${JSON.stringify(bad)} is not allowed → use a number above 0 and below 1, e.g. 0.5`]);
    }
    expect(stopTexts({ lens: { weakBelow: 0.6 } })).toEqual(['✖ config.lens: weakBelow 0.6, concernAt 0.5, strongAt 0.8 is out of order → keep weakBelow below concernAt below strongAt']);
    expect(stopTexts({ lens: { strongAt: 0.4 } })[0]).toContain('is out of order');
    expect(stopTexts({ lens: { concernat: 0.4 } })).toEqual(['✖ config.lens.concernat: "concernat" is not a lens field → did you mean concernAt?']);
  });

  it('an unknown top-level key still gets a nearest-name hint, now including the new keys', () => {
    expect(stopTexts({ evidences: {} })).toEqual(['✖ config.evidences: "evidences" is not a config key → did you mean evidence?']);
    expect(stopTexts({ lenz: {} })).toEqual(['✖ config.lenz: "lenz" is not a config key → did you mean lens?']);
  });
});

describe('merge: the settings reach the effective config, labelled', () => {
  const FILE = `depth:
  class: [15, 30, 45]
sweep:
  itemsPerLayer: {quick: 5, standard: 10, thorough: 15}
budget:
  warnAt: 0.5
evidence:
  maxFiles: 50
lens:
  concernAt: 0.6
`;

  it('overrides replace only what they name; everything else is the default', () => {
    const r = resolveConfig(projectWith(FILE).paths, {});
    expect(r.stops).toEqual([]);
    expect(r.config.depth).toEqual({ class: [15, 30, 45], scan: [3, 6, 9], loop: [3, 6, 9] });
    expect(r.config.sweep.itemsPerLayer).toEqual({ quick: 5, standard: 10, thorough: 15 });
    expect(r.config.budget.warnAt).toBe(0.5);
    expect(r.config.budget.usd).toBe(DEFAULT_CONFIG.budget.usd);
    expect(r.config.evidence).toEqual({ perItemChars: 20_000, totalChars: 60_000, maxFiles: 50 });
    expect(r.config.lens).toEqual({ concernAt: 0.6, weakBelow: 0.35, strongAt: 0.8 });
    expect(r.sources['depth.class']).toBe('config');
    expect(r.sources['depth.scan']).toBe('default');
    expect(r.sources['sweep.itemsPerLayer.quick']).toBe('config');
    expect(r.sources['budget.warnAt']).toBe('config');
    expect(r.sources['evidence.maxFiles']).toBe('config');
    expect(r.sources['evidence.totalChars']).toBe('default');
    expect(r.sources['lens.concernAt']).toBe('config');
  });

  it('a bad value is a stop and falls back to its default; the rest of the file applies', () => {
    const r = resolveConfig(projectWith('depth:\n  class: [9, 3, 1]\n  scan: [1, 2, 3]\nbudget:\n  warnAt: 5\n').paths, {});
    expect(r.stops).toHaveLength(2);
    expect(r.config.depth.class).toEqual([3, 6, 9]);
    expect(r.config.depth.scan).toEqual([1, 2, 3]);
    expect(r.config.budget.warnAt).toBe(0.8);
  });

  it('with no config.yaml nothing moves: the defaults, every leaf labelled default', () => {
    const r = resolveConfig(tempProject().paths, {});
    expect(r.config).toEqual(DEFAULT_CONFIG);
    expect(new Set(Object.values(r.sources))).toEqual(new Set(['default']));
  });
});

// ---- behavior -------------------------------------------------------------------------------------------------

const concern = (from: number, pass: 'yes' | 'no' = 'no'): Obj => {
  const c: Obj = { pass };
  for (let i = 0; i < 3; i++) c[from + i] = `Is thing ${from + i} wrong?`;
  return c;
};
/** A valid ask with `n` concerns categories + one scale + one choice decision. */
const askWith = (n: number): Obj => {
  const concerns: Obj = {};
  for (let i = 0; i < n; i++) concerns[`c${i + 1}`] = concern(1 + i * 3);
  const next = 1 + n * 3;
  return {
    concerns,
    decisions: {
      severity: { pass: ['none'], [next]: { scale: 'How bad?', levels: ['none', 'high'] } },
      route: { pass: ['ship'], [next + 1]: { choice: 'Where to?', options: ['ship', 'block'] } },
    },
  };
};
const classRequest = (n: number, extra: Obj = {}): Obj => ({ mak: { goal: 'The handler is safe to merge', depth: 'quick', where: ['src/user.ts'], ask: askWith(n), ...extra } });
const stopsOf = (value: unknown, verb: 'class' | 'scan' | 'loop' | 'view', limits?: ReturnType<typeof contractLimits>): string[] => {
  const v = validateRequest(value, verb, undefined, undefined, limits);
  return v.ok ? [] : v.stops.map((s) => s.text);
};

describe('behavior: depth tiers per verb [C-235] [C-237]', () => {
  const cfg = resolveConfig(projectWith('depth:\n  class: [15, 30, 45]\n  scan: [1, 3, 6]\n').paths, {}).config;

  it('depth.class [15, 30, 45] makes a quick class request expect 15 categories of 3 (45 questions)', () => {
    const limits = contractLimits(cfg, 'class');
    expect(stopsOf(classRequest(15), 'class', limits)).toEqual([]);
    const v = validateRequest(classRequest(15), 'class', undefined, undefined, limits);
    if (!v.ok) throw new Error('expected valid');
    const concerns = v.request.mak.categories.filter((c) => c.section === 'concerns');
    expect(concerns).toHaveLength(15);
    expect(concerns.flatMap((c) => c.questions)).toHaveLength(45);
    // the old count no longer fits, and the stop names the configured one
    expect(stopsOf(classRequest(3), 'class', limits)).toEqual(['✖ mak.ask.concerns: 3 categories → quick needs exactly 15 → see: mm3 agent probe']);
    // standard and thorough follow the same tiers
    expect(stopsOf(classRequest(30, { depth: 'standard' }), 'class', limits)).toEqual([]);
    expect(stopsOf(classRequest(45, { depth: 'thorough' }), 'class', limits)).toEqual([]);
  });

  it('without limits (no config) the request contract is exactly 3 / 6 / 9 categories, as before', () => {
    expect(stopsOf(classRequest(3), 'class')).toEqual([]);
    expect(stopsOf(classRequest(15), 'class')).toEqual(['✖ mak.ask.concerns: 15 categories → quick needs exactly 3 → see: mm3 agent probe']);
    expect(stopsOf(classRequest(3), 'class', contractLimits(DEFAULT_CONFIG, 'class'))).toEqual([]);
  });

  it('a missing depth: says what this project\'s tiers mean', () => {
    const noDepth = { mak: { goal: 'The handler is safe', where: ['src/user.ts'], ask: askWith(15) } };
    expect(stopsOf(noDepth, 'class', contractLimits(cfg, 'class'))).toEqual(['✖ mak.depth: class needs it → add "depth: quick" (45 yes/no questions across 15 concerns; standard 90, thorough 135)']);
    expect(stopsOf(noDepth, 'class')).toEqual(['✖ mak.depth: class needs it → add "depth: quick" (9 yes/no questions across 3 concerns; standard 18, thorough 27)']);
  });

  it('each verb has its own tiers: scan follows depth.scan, view drafts a class request so follows depth.class', () => {
    expect(contractLimits(cfg, 'scan').depth).toEqual([1, 3, 6]);
    expect(contractLimits(cfg, 'loop').depth).toEqual([3, 6, 9]);
    expect(contractLimits(cfg, 'view').depth).toEqual([15, 30, 45]);
    expect(contractLimits(cfg, 'drill').depth).toBeUndefined();
    expect(contractLimits(cfg, 'replay').depth).toBeUndefined();
  });

  it('runClass end to end: a project with depth.class [1, 2, 3] accepts a one-category quick request, and the default refuses it', async () => {
    const text = stringify(classRequest(1));
    const configured = projectWith('depth:\n  class: [1, 2, 3]\n');
    const ok = await runClass(text, { paths: configured.paths, provider: stubProvider({ yes: () => 0.1 }), env: {} });
    expect(ok.exit).toBe(0);
    const plain = tempProject();
    const refused = await runClass(text, { paths: plain.paths, provider: stubProvider({ yes: () => 0.1 }), env: {} });
    expect(refused.exit).toBe(2);
    expect(refused.text).toContain('quick needs exactly 3');
  });
});

describe('behavior: sweep.itemsPerLayer, over the lower-only maxItems [C-238]', () => {
  const category: Category = { name: 'boundaries', section: 'concerns', pass: 'yes', need: 'all', tags: [], questions: [{ n: 1, kind: 'yesno', text: 'Does {part} own one clear responsibility?' }] };
  const names = Array.from({ length: 15 }, (_, i) => `part${i}`);
  const request = (): Request => ({
    mak: { goal: 'The parts are sound', depth: 'quick', where: [], categories: [], layers: [{ name: 'part', categories: [category] }], over: { part: names } },
    mdl: null,
  });
  const WHO = { adapter: 'stub', model: 'stub-1' };

  it('a configured quick cap replaces the default 10, in both directions', () => {
    const { paths } = tempProject({});
    const up = planSweep(request(), WHO, paths, false, {}, { sweep: { maxQuestionsPerCall: 500, itemsPerLayer: { quick: 12, standard: 20, thorough: 30 } } });
    expect(up.planned[0]!.itemIds).toHaveLength(12);
    const down = planSweep(request(), WHO, paths, false, {}, { sweep: { maxQuestionsPerCall: 500, itemsPerLayer: { quick: 4, standard: 20, thorough: 30 } } });
    expect(down.planned[0]!.itemIds).toHaveLength(4);
  });

  it('maxItems still lowers whatever the configured cap is', () => {
    const { paths } = tempProject({});
    const plan = planSweep(request(), WHO, paths, false, {}, { sweep: { maxQuestionsPerCall: 500, maxItems: 3, itemsPerLayer: { quick: 12, standard: 20, thorough: 30 } } });
    expect(plan.planned[0]!.itemIds).toHaveLength(3);
  });

  it('the request check follows it too: 11 items stop by default, pass with a quick cap of 12', () => {
    const over = { mak: { goal: 'The parts are sound', depth: 'quick', over: { part: names.slice(0, 11) }, ask: { part: askWith(3) } } };
    expect(stopsOf(over, 'loop')[0]).toContain('11 items → at most 10 per layer at this depth');
    const cfg = resolveConfig(projectWith('sweep:\n  itemsPerLayer: {quick: 12}\n').paths, {}).config;
    expect(stopsOf(over, 'loop', contractLimits(cfg, 'scan')).join('\n')).not.toContain('items → at most');
  });
});

describe('behavior: budget.warnAt [C-239]', () => {
  const state = { capUsd: 10, capRuns: 100, spentUsd: 6, runs: 10, resetAt: 'x' };
  it('moves where the line starts to warn', () => {
    expect(budgetLine(state)).not.toContain('⚠'); // 60% used, default 0.8
    expect(budgetLine({ ...state, warnAt: 0.5 })).toContain('⚠');
    expect(budgetLine({ ...state, spentUsd: 8 })).toContain('⚠'); // 80% = the default
    expect(budgetLine({ ...state, spentUsd: 8, warnAt: 0.9 })).not.toContain('⚠');
  });
});

describe('behavior: evidence limits [C-240]', () => {
  it('itemsState caps per item and in total at the given limits, defaulting to 20,000 / 60,000', () => {
    const items = [{ id: 'a', text: 'x'.repeat(50) }, { id: 'b', text: 'y'.repeat(50) }];
    const notes: string[] = [];
    const out = itemsState(items as never, notes, { perItemChars: 30, totalChars: 40 });
    expect(out.a).toHaveLength(30);
    expect(out.b).toHaveLength(10);
    expect(notes).toEqual(['a truncated to 30 chars', 'b truncated to 30 chars', 'b truncated: evidence limit reached']);
    const wide: string[] = [];
    expect(itemsState(items as never, wide)).toEqual({ a: 'x'.repeat(50), b: 'y'.repeat(50) });
    expect(wide).toEqual([]);
  });

  it('maxFiles caps how many files one glob returns', () => {
    const files = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`src/f${i}.ts`, `export const f${i} = ${i};\n`]));
    const { root } = tempProject(files);
    expect(expandGlob(root, 'src/*.ts').files).toHaveLength(6);
    const capped = expandGlob(root, 'src/*.ts', 4);
    expect(capped.files).toHaveLength(4);
    expect(capped.truncated).toBe(true);
  });

  it('readCodeEvidence stops or truncates at the configured per-file and total caps', () => {
    const { root } = tempProject({ 'a.ts': 'x'.repeat(100) });
    expect(readCodeEvidence(root, ['a.ts']).ok).toBe(true);
    const r = readCodeEvidence(root, ['a.ts'], { limits: { perFileChars: 50, totalChars: 200 } });
    expect(r.ok).toBe(false);
    const cut = readCodeEvidence(root, ['a.ts'], { stopOnOversize: false, limits: { perFileChars: 50, totalChars: 200 } });
    expect(cut.ok && cut.evidence.files['a.ts']).toHaveLength(50);
  });
});

describe('behavior: lens thresholds [C-240]', () => {
  // three of four slots at p = 0.6: with concernAt 0.5 they are concerns; with concernAt 0.7 none is.
  const slots = [0.6, 0.6, 0.6, 0.6].map((p, i) => ({ pos: i + 1, reverse: false, p }));

  it('concernAt moves which answers count as a concern', () => {
    expect(computeConsensus(slots).concernSlots).toEqual([1, 2, 3, 4]);
    expect(computeConsensus(slots, { concernAt: 0.7, weakBelow: 0.1, strongAt: 0.8 }).concernSlots).toEqual([]);
  });

  it('weakBelow and strongAt move the consensus label', () => {
    // decisiveness = mean |2p - 1| = 0.2, which is WEAK under the default 0.35 but not under 0.1
    expect(computeConsensus(slots).consensus).toBe('WEAK');
    expect(computeConsensus(slots, { concernAt: 0.5, weakBelow: 0.1, strongAt: 0.8 }).consensus).toBe('STRONG');
    const split = [0.9, 0.9, 0.9, 0.1].map((p, i) => ({ pos: i + 1, reverse: false, p }));
    expect(computeConsensus(split).consensus).toBe('SPLIT'); // agreement 0.75 < 0.8
    expect(computeConsensus(split, { concernAt: 0.5, weakBelow: 0.35, strongAt: 0.7 }).consensus).toBe('STRONG');
  });

  it('consensusAndEscalate hands the project\'s thresholds to the consensus', () => {
    const categories: Category[] = [{ name: 'c', section: 'concerns', pass: 'no', need: 'all', tags: [], questions: [1, 2, 3].map((n) => ({ n, kind: 'yesno' as const, text: `q${n}?` })) }];
    const answers = { '1': { kind: 'yesno', p: 0.6 }, '2': { kind: 'yesno', p: 0.6 }, '3': { kind: 'yesno', p: 0.6 } } as never;
    expect(consensusAndEscalate(categories, answers, 'quick', []).consensus).toBe('WEAK');
    expect(consensusAndEscalate(categories, answers, 'quick', [], { concernAt: 0.5, weakBelow: 0.1, strongAt: 0.8 }).consensus).toBe('STRONG');
  });
});

describe('mm3 config and its starter file [C-241]', () => {
  const render = (text: string | undefined) => {
    const p = text === undefined ? tempProject() : projectWith(text);
    return formatConfig(resolveConfig(p.paths, {}), '.');
  };

  it('prints the new settings as commented defaults, depth with the question count beside each tier', () => {
    const out = render(undefined);
    expect(out).toContain('    # warnAt: 0.8  # default');
    expect(out).toContain('    itemsPerLayer:\n      # quick: 10  # default\n      # standard: 20  # default\n      # thorough: 30  # default');
    expect(out).toContain('    # class: [3, 6, 9]  # default · 9, 18, 27 questions');
    expect(out).toContain('    # maxFiles: 500  # default');
    expect(out).toContain('    # concernAt: 0.5  # default');
    expect(() => parse(out)).not.toThrow();
  });

  it('a configured depth is a live line naming its source and its question counts', () => {
    const out = render('depth:\n  class: [15, 30, 45]\nbudget:\n  warnAt: 0.5\n');
    expect(out).toContain('    class: [15, 30, 45]  # from config.yaml · 45, 90, 135 questions');
    expect(out).toContain('    scan: [3, 6, 9]'.replace('    scan', '    # scan'));
    expect(out).toContain('    warnAt: 0.5  # from config.yaml');
    expect(parse(out).config.depth.class).toEqual([15, 30, 45]);
  });

  it('the starter file lists every new setting, parses, and checks clean as written', () => {
    const text = starterConfig();
    for (const line of ['#   warnAt: 0.8', '  itemsPerLayer:', '#     quick: 10', 'depth:', '#   class: [3, 6, 9]', 'evidence:', '#   perItemChars: 20000', 'lens:', '#   strongAt: 0.8']) {
      expect(text).toContain(line);
    }
    const raw = parse(text);
    expect(validateConfig(raw).stops).toEqual([]);
    expect(validateConfig(raw).value).toEqual({ pricing: {}, mdl: {}, sweep: {}, reuse: {}, depth: {}, evidence: {}, lens: {}, budget: {} });
  });

  it('uncommenting a starter line for a new setting yields a valid file', () => {
    const edited = starterConfig().replace('#   class: [3, 6, 9]', '  class: [15, 30, 45]').replace('#   warnAt: 0.8', '  warnAt: 0.9');
    const r = validateConfig(parse(edited));
    expect(r.stops).toEqual([]);
    expect(r.value.depth).toEqual({ class: [15, 30, 45] });
    expect(r.value.budget).toEqual({ warnAt: 0.9 });
  });
});

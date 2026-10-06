/**
 * Help-first validation of a parsed request (every stop says what to change). Three passes, each reported on
 * its own so an agent fixes one kind of thing at a time:
 *   1. ____ blanks left from a template (mm3 template <verb>);
 *   2. the schema (schema-check.ts mirrors request.schema.json);
 *   3. the rules the schema can't express: the verb's own fields, numbering, sections, depth, layers and
 *      {blanks}. A problem that only weakens the answer is a note, never a stop — except: the concerns/decisions
 *      section and count rules are stops in class, drill, scan and loop, but only notes in view ("a
 *      partial draft is fine").
 */
import { clip } from '../util/text.ts';
import { blanksIn, checkOver, mapLayers, type StringRule } from './layers.ts';
import { checkSchema, isObj } from './schema-check.ts';
import type { MdlField } from './mdl-fields.ts';
import {
  DECISIONS_MAX,
  DECISIONS_MIN,
  DEPTH_COUNT,
  DEPTHS,
  SWEEP_ITEM_CAP,
  type Category,
  type Depth,
  type Family,
  type Layer,
  type Question,
  type Request,
  type Section,
  type Mak,
  type Stop,
  type Verb,
  type Mdl,
  FAMILIES,
} from './types.ts';

/** What a project's config says about the contract's counts; omitted (or a field left out) means the built-in
 *  defaults (DEPTH_COUNT, SWEEP_ITEM_CAP). This module stays pure: the caller resolves the config and passes it in. */
export interface ContractLimits {
  /** Probes (3 questions each) this verb asks at quick, standard and thorough. */
  depth?: readonly [number, number, number];
  /** Items asked per layer at each depth. */
  itemsPerLayer?: Readonly<Record<Depth, number>>;
}

const probesAt = (limits: ContractLimits | undefined, depth: Depth): number => limits?.depth?.[DEPTHS.indexOf(depth)] ?? DEPTH_COUNT[depth] / 3;
const itemCapAt = (limits: ContractLimits | undefined, depth: Depth): number => limits?.itemsPerLayer?.[depth] ?? SWEEP_ITEM_CAP[depth];

export type Validated = { ok: true; request: Request; notes: string[] } | { ok: false; stops: Stop[] };

type Field = 'depth' | 'where' | 'ask' | 'parent' | 'compare' | 'over' | 'from' | 'expect';

const NEEDS: Record<Verb, Field[]> = {
  class: ['depth', 'where', 'ask'],
  view: ['where'],
  replay: ['parent', 'compare', 'expect'],
  scan: ['depth', 'over', 'ask'],
  loop: ['depth', 'over', 'ask'],
  drill: ['parent', 'from', 'ask'],
};

// mak.parent is allowed on every verb now: required by drill/replay (NEEDS above), lineage-only
// everywhere else — so it is deliberately absent from every list below. mdl.parent remains an accepted alias.
const NEVER: Record<Verb, Field[]> = {
  class: ['over', 'from', 'compare', 'expect'],
  view: ['over', 'from', 'compare', 'expect'],
  replay: ['ask', 'over', 'from', 'where', 'depth'],
  scan: ['where', 'from', 'compare', 'expect'],
  loop: ['from', 'compare', 'expect'],
  drill: ['compare', 'where', 'expect'],
};

const STRINGS: Record<Verb, StringRule> = { scan: 'scan', drill: 'each-only', loop: 'none', class: 'none', view: 'none', replay: 'none' };

/** Keys the response uses beside the categories: a category can't share one. "expected" is replay's new
 *  expect: grade; a category with this name would collide with its response key. */
const RESERVED = ['id', 'gate', 'goal', 'consensus', 'escalate', 'regressed', 'expected', 'failing', 'passing', 'scanned', 'reused', 'view', 'reuse', 'runs', 'categories'];

export const IRREVERSIBLE = /\b(delete|deploy|drop|pay|payment|migrat\w*|secret|credential)s?\b/iu;
export const IRREVERSIBLE_NOTE = "looks irreversible; don't act on this alone";

function how(field: Field, verb: Verb, limits?: ContractLimits): string {
  const sweep = verb === 'scan' || verb === 'loop' || verb === 'drill';
  switch (field) {
    case 'depth':
      return sweep
        ? `add "depth: quick" (at most ${itemCapAt(limits, 'quick')} items asked per layer; standard ${itemCapAt(limits, 'standard')}, thorough ${itemCapAt(limits, 'thorough')})`
        : `add "depth: quick" (${3 * probesAt(limits, 'quick')} yes/no questions across ${probesAt(limits, 'quick')} concerns; standard ${3 * probesAt(limits, 'standard')}, thorough ${3 * probesAt(limits, 'thorough')})`;
    case 'where':
      return 'add "where: [path/to/file.ts]"';
    case 'ask':
      return `add ask: with concerns: and decisions: (mm3 template ${verb})`;
    case 'parent':
      return 'add "parent: MM3-####" (the run this builds on)';
    case 'compare':
      return 'add "compare: {before: main, after: HEAD}"';
    case 'over':
      return `add over: with the layers to sweep (mm3 template ${verb})`;
    case 'from':
      return 'add "from: <an item id or a category of the parent run>"';
    case 'expect':
      return 'add "expect: [concern-name, ...]" (which of the parent\'s concerns this replay should fix), or "expect: none" to predict no flips';
  }
}

function never(field: Field, verb: Verb): string {
  if (verb === 'replay' && field === 'ask') return "✖ mak.ask: replay re-runs the parent's questions → remove ask; for new questions, use class";
  if (field === 'expect') return '✖ mak.expect: only replay predicts fixed concerns → remove it';
  if (field === 'over') return `✖ mak.over: ${verb} asks about one subject → remove over, or use loop or scan to sweep`;
  if (field === 'where' && verb === 'scan') return '✖ mak.where: scan reads the files in over → remove where';
  if (field === 'where') return `✖ mak.where: ${verb} reads the parent run's code → remove where`;
  return `✖ mak.${field}: ${verb} doesn't take it → remove it`;
}

const cross = (text: string): Stop => ({ cls: 'cross', text });

/** Pass 1: any ____ left from a template. */
function findBlanks(v: unknown, path: string, out: Stop[]): void {
  const label = (p: string): string => {
    const q = /^mak\.ask\..*\.(\d+)$/u.exec(p);
    return q ? `question ${q[1]}` : p;
  };
  if (typeof v === 'string') {
    if (v.includes('____')) out.push(cross(`✖ ${label(path)}: still a ____ blank → fill it in`));
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => findBlanks(x, `${path}[${i}]`, out));
    return;
  }
  if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) {
      const p = path ? `${path}.${k}` : k;
      if (k.includes('____')) out.push(cross(`✖ ${label(p)}: still a ____ blank → fill it in`));
      else findBlanks(x, p, out);
    }
  }
}

function toQuestion(n: number, raw: unknown): Question {
  if (typeof raw === 'string') return { n, kind: 'yesno', text: raw };
  const o = raw as Record<string, unknown>;
  if ('scale' in o) return { n, kind: 'scale', text: o.scale as string, levels: o.levels as string[] };
  return { n, kind: 'choice', text: o.choice as string, options: o.options as string[] };
}

/** family: given explicitly (validated against FAMILIES by schema-check already) wins; else the category name
 *  when that name is itself a family; else absent. Only meaningful for concerns — a decisions category's own
 *  `family` (if written) is flagged separately, in buildCategories below. */
function familyFor(raw: Record<string, unknown>, name: string, section: Section): Pick<Category, 'family' | 'familySource'> {
  if (section !== 'concerns') return {};
  const given = raw.family;
  if (typeof given === 'string' && (FAMILIES as readonly string[]).includes(given)) return { family: given as Family, familySource: 'given' };
  if ((FAMILIES as readonly string[]).includes(name)) return { family: name as Family, familySource: 'name' };
  return {};
}

function toCategory(name: string, raw: Record<string, unknown>, section: Section): Category {
  const pass = raw.pass === true ? 'yes' : raw.pass === false ? 'no' : (raw.pass as Category['pass']);
  const questions = Object.entries(raw)
    .filter(([k]) => /^[1-9][0-9]*$/u.test(k))
    .map(([k, q]) => toQuestion(Number(k), q))
    .sort((a, b) => a.n - b.n);
  return { name, section, ...familyFor(raw, name, section), pass, need: (raw.need as Category['need']) ?? 'all', tags: (raw.tags as string[]) ?? [], questions };
}

/** One kind of question per category, a pass that fits that kind, and the per-section kind/shape rules
 *  (a concerns category is yes/no only; a decisions category's pass names the passing levels/options). The
 *  exact per-category and per-section COUNTS (3 probes, 2-5 decisions, ≥1 scale + ≥1 choice) are
 *  contractIssues's job below, since those need stop-vs-note branching by verb; this always stops. */
function checkCategory(c: Category, field: string, out: Stop[]): void {
  const kinds = new Set(c.questions.map((q) => q.kind));
  if (c.questions.length === 0) out.push(cross(`✖ ${field}: no questions → add at least one numbered question`));
  if (RESERVED.includes(c.name)) out.push(cross(`✖ ${field}: "${c.name}" is a word the answer uses → rename the category`));
  if (kinds.size > 1) {
    out.push(cross(`✖ ${field}: mixes ${[...kinds].map((k) => (k === 'yesno' ? 'yes/no' : k)).join(' and ')} questions → one kind per category`));
    return;
  }
  const kind = [...kinds][0];
  if (c.section === 'concerns') {
    if (kind && kind !== 'yesno') out.push(cross(`✖ ${field}: a concerns category must be yes/no only → use decisions: for scale or choice`));
    if (Array.isArray(c.pass)) out.push(cross(`✖ ${field}.pass: a list is for scale or choice questions → use yes or no`));
    return;
  }
  if (kind === 'yesno') out.push(cross(`✖ ${field}: a decisions category must be scale or choice → use concerns: for yes/no`));
  if (kind && kind !== 'yesno') {
    if (!Array.isArray(c.pass)) {
      out.push(cross(`✖ ${field}.pass: ${kind} questions need the passing ${kind === 'scale' ? 'levels' : 'options'} → e.g. pass: [none, low]`));
      return;
    }
    for (const q of c.questions) {
      const allowed = q.kind === 'scale' ? q.levels : q.kind === 'choice' ? q.options : [];
      const unknown = c.pass.find((p) => !allowed.includes(p));
      if (unknown !== undefined) {
        out.push(cross(`✖ ${field}.pass: "${clip(unknown, 20)}" is not ${q.kind === 'scale' ? 'a level' : 'an option'} of question ${q.n} → use some of ${allowed.join(', ')}`));
      }
    }
  }
}

/** Reads concerns:/decisions: (both optional at this point — schema-check only checked their shape) into flat
 *  Categories, concerns first then decisions (the numbering order the contract requires), running checkCategory
 *  on each. A decisions category naming `family:` is flagged here (family is concerns-only). */
function buildCategories(sections: Record<string, unknown>, field: string, out: Stop[]): Category[] {
  const cats: Category[] = [];
  for (const section of ['concerns', 'decisions'] as const) {
    const map = sections[section];
    if (!isObj(map)) continue;
    for (const [name, raw] of Object.entries(map)) {
      if (!isObj(raw)) continue;
      const c = toCategory(name, raw, section);
      checkCategory(c, `${field}.${section}.${name}`, out);
      if (section === 'decisions' && 'family' in raw) {
        out.push(cross(`✖ ${field}.decisions.${name}.family: family only applies to concerns categories → remove it`));
      }
      cats.push(c);
    }
  }
  // Numbering order (unconditional, like the duplicate/gap check below): concerns first, then decisions,
  // within this one ask block (one subject, or one sweep layer).
  const concernNums = cats.filter((c) => c.section === 'concerns').flatMap((c) => c.questions.map((q) => q.n));
  const decisionNums = cats.filter((c) => c.section === 'decisions').flatMap((c) => c.questions.map((q) => q.n));
  if (concernNums.length && decisionNums.length && Math.max(...concernNums) > Math.min(...decisionNums)) {
    out.push(cross(`✖ ${field}: decisions must be numbered after every concern → renumber decisions last`));
  }
  return cats;
}

function checkNumbers(categories: readonly Category[], out: Stop[]): void {
  const seen = new Set<number>();
  for (const n of categories.flatMap((c) => c.questions.map((q) => q.n))) {
    if (seen.has(n)) out.push(cross(`✖ question ${n}: numbered twice → give each question its own number`));
    seen.add(n);
  }
  const sorted = [...seen].sort((a, b) => a - b);
  if (sorted.some((n, i) => n !== i + 1)) out.push(cross(`✖ question numbers: ${clip(sorted.join(' '), 60)} → number them 1…${sorted.length} with no gaps`));
}

interface Issue {
  field: string;
  problem: string;
  fix: string;
}

/** The concerns/decisions section-and-count rules: exactly 3k concerns categories for the depth,
 *  2-5 decisions categories with at least one scale and one choice. `depth` is undefined to skip the
 *  concerns-count check (drill without a depth, or a sweep's non-finest layer). Returned as plain
 *  (field, problem, fix) issues so the caller can render them as stops (class/drill/scan/loop, and a sweep's
 *  finest layer) or as notes (view, and a sweep's non-finest layers — "a note if thin"). */
function contractIssues(categories: readonly Category[], depth: Depth | undefined, field: string, limits?: ContractLimits): Issue[] {
  const out: Issue[] = [];
  const concerns = categories.filter((c) => c.section === 'concerns');
  const decisions = categories.filter((c) => c.section === 'decisions');

  for (const c of concerns) {
    if (c.questions.every((q) => q.kind === 'yesno') && c.questions.length !== 3) {
      out.push({ field: `${field}.concerns.${c.name}`, problem: `${c.questions.length} probe${c.questions.length === 1 ? '' : 's'}`, fix: 'give it exactly 3' });
    }
  }
  for (const c of decisions) {
    if (c.questions.some((q) => q.kind !== 'yesno') && c.questions.length !== 1) {
      out.push({ field: `${field}.decisions.${c.name}`, problem: `${c.questions.length} questions`, fix: 'give it exactly 1' });
    }
  }
  if (depth !== undefined) {
    const want = probesAt(limits, depth);
    if (concerns.length !== want) {
      out.push({ field: `${field}.concerns`, problem: `${concerns.length} categor${concerns.length === 1 ? 'y' : 'ies'}`, fix: `${depth} needs exactly ${want}` });
    }
  }
  if (decisions.length < DECISIONS_MIN || decisions.length > DECISIONS_MAX) {
    out.push({ field: `${field}.decisions`, problem: `${decisions.length} categor${decisions.length === 1 ? 'y' : 'ies'}`, fix: `give ${DECISIONS_MIN}–${DECISIONS_MAX}` });
  } else {
    const kinds = new Set(decisions.flatMap((c) => c.questions.map((q) => q.kind)));
    if (!kinds.has('scale')) out.push({ field: `${field}.decisions`, problem: 'no scale question', fix: 'add at least one scale: question' });
    if (!kinds.has('choice')) out.push({ field: `${field}.decisions`, problem: 'no choice question', fix: 'add at least one choice: question' });
  }
  return out;
}

/** Pass 3: the rules the schema can't express. Returns the normalized mak (and any downgraded-to-note
 *  contract issues) when there are no stops. */
function checkCross(raw: Record<string, unknown>, verb: Verb, limits?: ContractLimits): { stops: Stop[]; mak?: Mak; notes: string[] } {
  const out: Stop[] = [];
  const notes: string[] = [];
  const mak = raw.mak as Record<string, unknown>;
  if (mak.verb !== undefined && mak.verb !== verb) out.push(cross(`✖ mak.verb: says "${mak.verb}" but you ran ${verb} → remove mak.verb, or run mm3 ${mak.verb}`));
  for (const f of NEEDS[verb]) if (!(f in mak)) out.push(cross(`✖ mak.${f}: ${verb} needs it → ${how(f, verb, limits)}`));
  for (const f of NEVER[verb]) if (f in mak) out.push(cross(never(f, verb)));

  const over = mak.over as Record<string, unknown> | undefined;
  const ask = (mak.ask ?? {}) as Record<string, unknown>;
  const depth = mak.depth as Depth | undefined;
  const categories: Category[] = [];
  const layers: Layer[] = [];

  if (over === undefined) {
    const categoriesGiven = Object.keys(ask).length > 0;
    const cats = buildCategories(ask, 'mak.ask', out);
    categories.push(...cats);
    for (const c of cats) {
      for (const q of c.questions) {
        const b = blanksIn(q.text)[0];
        if (b !== undefined && verb !== 'drill') out.push(cross(`✖ question ${q.n}: {${b}} has nothing to fill it → blanks are for sweeps (over:); write the name out`));
      }
    }
    checkNumbers(cats, out);
    if (categoriesGiven) {
      const issues = contractIssues(cats, depth, 'mak.ask', limits);
      if (verb === 'view') {
        for (const i of issues) notes.push(`${i.field}: ${i.problem} (${i.fix}); class will stop on this`);
      } else {
        for (const i of issues) out.push(cross(`✖ ${i.field}: ${i.problem} → ${i.fix} → see: mm3 agent probe`));
      }
    }
  } else {
    for (const p of checkOver(over, STRINGS[verb], itemCapAt(limits, depth ?? 'quick'))) out.push(cross(p));
    const map = mapLayers(over);
    const finest = map.layers.at(-1);
    for (const [name, v] of Object.entries(ask)) {
      // The one-subject shape (concerns:/decisions: straight under ask) used where a sweep needs a layer name.
      if (name === 'concerns' || name === 'decisions' || (isObj(v) && 'pass' in v)) {
        out.push(cross(`✖ mak.ask.${name}: a sweep keys categories by layer → ask: {<layer>: {concerns: ..., decisions: ...}}`));
        continue;
      }
      if (!map.layers.includes(name)) {
        out.push(cross(`✖ mak.ask.${name}: not a layer in over → use one of ${map.layers.join(', ')}`));
        continue;
      }
      const sections = (v ?? {}) as Record<string, unknown>;
      const cats = buildCategories(sections, `mak.ask.${name}`, out);
      const allowed = [name, ...(map.ancestors.get(name) ?? [])];
      for (const c of cats) {
        for (const q of c.questions) {
          for (const b of blanksIn(q.text)) {
            // drill: a blank that is not one of its own layers may name a layer of the parent run (the verb checks it).
            if (!allowed.includes(b) && !(verb === 'drill' && !map.layers.includes(b))) {
              out.push(cross(`✖ question ${q.n}: {${b}} is not ${name}'s layer or above it → use ${allowed.map((a) => `{${a}}`).join(' or ')}`));
            }
          }
        }
      }
      layers.push({ name, categories: cats });
      categories.push(...cats);

      if (cats.length > 0) {
        const isFinest = name === finest;
        const issues = contractIssues(cats, isFinest ? depth : undefined, `mak.ask.${name}`, limits);
        if (isFinest) {
          for (const i of issues) out.push(cross(`✖ ${i.field}: ${i.problem} → ${i.fix} → see: mm3 agent probe`));
        } else if (issues.length) {
          notes.push(`mak.ask.${name} ask is thin (optional layer; counts aren't enforced) — e.g. ${issues[0]!.field}: ${issues[0]!.problem}`);
        }
      }
    }
    checkNumbers(categories, out);
    layers.sort((a, b) => map.layers.indexOf(a.name) - map.layers.indexOf(b.name));
  }
  if (out.length) return { stops: out, notes };
  return {
    stops: [],
    notes,
    mak: {
      ...(mak.verb !== undefined ? { verb: mak.verb as Verb } : {}),
      goal: mak.goal as string,
      ...(depth ? { depth } : {}),
      where: (mak.where as string[] | undefined) ?? [],
      ...(mak.parent !== undefined ? { parent: mak.parent as string } : {}),
      ...(mak.from !== undefined ? { from: mak.from as string } : {}),
      ...(mak.compare !== undefined ? { compare: mak.compare as { before: string; after: string } } : {}),
      ...(mak.expect !== undefined ? { expect: (Array.isArray(mak.expect) && mak.expect.length === 0 ? 'none' : mak.expect) as string[] | 'none' } : {}),
      categories: over === undefined ? categories : [],
      layers,
      ...(over !== undefined ? { over } : {}),
    },
  };
}

/** `rawText`: the original request text (before YAML parsing), passed through only so checkSchema's mdl:
 *  line-cap check can count the block's own source lines — everything else here works on the
 *  already-parsed `value`. `mdlFields`: the caller's effective (project-config-aware) mdl table,
 *  passed straight through to checkSchema; omitted, every caller keeps the built-in table. `limits`: the project's
 *  depth tiers and items-per-layer caps (see ContractLimits); omitted, the built-in defaults. */
export function validateRequest(value: unknown, verb: Verb, rawText?: string, mdlFields?: readonly MdlField[], limits?: ContractLimits): Validated {
  const blanks: Stop[] = [];
  findBlanks(value, '', blanks);
  if (blanks.length) return { ok: false, stops: blanks };
  const schema = checkSchema(value, verb, rawText, mdlFields);
  if (schema.length) return { ok: false, stops: schema };
  const raw = value as Record<string, unknown>;
  const { stops, mak, notes: crossNotes } = checkCross(raw, verb, limits);
  if (!mak) return { ok: false, stops };
  const notes: string[] = [...crossNotes];
  const risky = IRREVERSIBLE.exec(mak.goal);
  if (risky) notes.push(`${IRREVERSIBLE_NOTE} ("${risky[0].toLowerCase()}")`);
  const w = raw.mdl as Mdl | undefined;
  return { ok: true, request: { mak, mdl: w && Object.keys(w).length ? w : null }, notes };
}

// Validation after the schema: the verb's fields, numbering, sections, kinds, depth, layers and blanks. Stops
// say what to change. Requests here are built as plain objects (validateRequest takes `unknown`, same as a
// parsed YAML value) rather than hand-indented YAML text — the shape is nested enough now (ask.concerns/
// ask.decisions) that object builders are far less fragile than string templates; contract-read.test.ts and the
// few YAML-text-specific traps below still go through readRequestText.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readRequestText } from '../../src/contract/read.ts';
import { validateRequest } from '../../src/contract/validate.ts';
import type { Verb } from '../../src/contract/types.ts';

type Obj = Record<string, unknown>;

const parse = (text: string): Obj => {
  const r = readRequestText(text);
  if (!r.ok) throw new Error(r.stops.join('\n'));
  return r.value;
};
const stopsOf = (value: unknown, verb: Verb): string[] => {
  const v = validateRequest(value, verb);
  if (v.ok) throw new Error('expected stops');
  return v.stops.map((s) => s.text);
};

/** A concerns category: 3 yes/no probes numbered from..from+2. */
const concern = (from: number, pass: 'yes' | 'no' = 'no', word = 'wrong'): Obj => {
  const c: Obj = { pass };
  for (let i = 0; i < 3; i++) c[from + i] = `Is thing ${from + i} ${word}?`;
  return c;
};
const singleYesNo = (n: number, pass: 'yes' | 'no' = 'no'): Obj => ({ pass, [n]: 'Is it wrong?' });
const scaleDecision = (n: number, pass: string[] = ['none']): Obj => ({ pass, [n]: { scale: 'How bad?', levels: ['none', 'low', 'high'] } });
const choiceDecision = (n: number, pass: string[] = ['ship']): Obj => ({ pass, [n]: { choice: 'Where to?', options: ['ship', 'block'] } });
const manyDecisions = (count: number, startNum: number): Obj => {
  const out: Obj = {};
  for (let i = 0; i < count; i++) out[`d${i}`] = i % 2 === 0 ? scaleDecision(startNum + i) : choiceDecision(startNum + i);
  return out;
};

/** 3k concerns categories (each 3 yes/no probes) + one scale + one choice decision, numbered right after,
 *  starting at `start` — a full, valid ask for depth k (quick=1, standard=2, thorough=3): exactly the
 *  contract's own "3k categories". */
const fullAsk = (k: number, start = 1): Obj => {
  const count = 3 * k;
  const concerns: Obj = {};
  for (let i = 0; i < count; i++) concerns[`c${i + 1}`] = concern(start + i * 3);
  const n = start + count * 3;
  return { concerns, decisions: { severity: scaleDecision(n), route: choiceDecision(n + 1) } };
};

const baseMak = (extra: Obj = {}): Obj => ({ goal: 'The handler is safe to merge', depth: 'quick', where: ['src/a.ts'], ask: fullAsk(1), ...extra });
const req = (makExtra: Obj = {}, mdl?: Obj): Obj => ({ mak: baseMak(makExtra), ...(mdl !== undefined ? { mdl } : {}) });

describe('validateRequest', () => {
  it('normalizes the contract class example [C-006]', () => {
    const v = validateRequest(parse(readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8')), 'class');
    if (!v.ok) throw new Error(v.stops.map((s) => s.text).join('\n'));
    expect(v.request.mak.categories.map((c) => [c.name, c.section, c.pass, c.questions.map((q) => q.n)])).toEqual([
      ['injection', 'concerns', 'no', [1, 2, 3]],
      ['access', 'concerns', 'no', [4, 5, 6]],
      ['leaks', 'concerns', 'no', [7, 8, 9]],
      ['severity', 'decisions', ['none', 'low'], [10]],
      ['route', 'decisions', ['ship'], [11]],
    ]);
    // family: given explicitly wins; else the category name when it's itself a family ("injection", "access");
    // "leaks" isn't a family name, so it stays absent.
    expect(v.request.mak.categories[0]).toMatchObject({ name: 'injection', family: 'injection', familySource: 'name' });
    expect(v.request.mak.categories[1]).toMatchObject({ name: 'access', family: 'access', familySource: 'name' });
    expect(v.request.mak.categories[2]!.family).toBeUndefined();
    expect(v.request.mak.categories[3]!.questions[0]).toEqual({ n: 10, kind: 'scale', text: 'How severe is the worst issue?', levels: ['none', 'low', 'medium', 'high', 'critical'] });
    expect(v.request.mdl).toEqual({ why: 'validate', area: 'data' });
    expect(v.notes).toEqual([]);
  });

  it('family: given explicitly wins over the name default, and is refused on a decisions category', () => {
    const ask = fullAsk(1);
    (ask.concerns as Obj).c1 = { ...concern(1), family: 'secrets' };
    const v = validateRequest(req({ ask }), 'class');
    if (!v.ok) throw new Error(v.stops.map((s) => s.text).join('\n'));
    expect(v.request.mak.categories[0]).toMatchObject({ family: 'secrets', familySource: 'given' });

    const bad = fullAsk(1);
    (bad.decisions as Obj).severity = { ...scaleDecision(10), family: 'secrets' };
    expect(stopsOf(req({ ask: bad }), 'class')).toEqual(['✖ mak.ask.decisions.severity.family: family only applies to concerns categories → remove it']);
  });

  it('pass: true / false (older parsers) mean yes / no [C-042]', () => {
    const ask = fullAsk(1);
    (ask.concerns as Obj).c1 = { pass: false, 1: 'Is thing 1 wrong?', 2: 'Is thing 2 wrong?', 3: 'Is thing 3 wrong?' };
    const v = validateRequest(req({ ask }), 'class');
    expect(v.ok && v.request.mak.categories[0]!.pass).toBe('no');
  });

  it('____ blanks from a template come first, and alone', () => {
    const value = { mak: { goal: '____', depth: 'quick', where: ['____'], ask: { concerns: { '____1': { pass: 'no', 1: '____?' } } } }, mdl: { area: '____' } };
    expect(stopsOf(value, 'class')).toEqual([
      '✖ mak.goal: still a ____ blank → fill it in',
      '✖ mak.where[0]: still a ____ blank → fill it in',
      '✖ mak.ask.concerns.____1: still a ____ blank → fill it in',
      '✖ mdl.area: still a ____ blank → fill it in',
    ]);
  });

  it('the YAML traps that parse: "#" cut a question short, "no" is not a question [C-039] [C-041]', () => {
    const oneCat = (line: string): string => `mak:\n  goal: The handler is safe to merge\n  depth: quick\n  where: [src/a.ts]\n  ask:\n    concerns:\n      leaks:\n        pass: no\n${line}`;
    expect(stopsOf(parse(oneCat('        1: Is it # really safe?\n')), 'class')).toEqual(['✖ question 1: doesn\'t end in "?" → put it in quotes']);
    expect(stopsOf(parse(oneCat('        1: no\n')), 'class')).toEqual(['✖ question 1: is not a question → write it as text']);
  });

  it("the verb's own fields [C-015] [C-062] [C-085]", () => {
    const withVerb = req();
    (withVerb.mak as Obj).verb = 'view';
    expect(stopsOf(withVerb, 'class')).toEqual(['✖ mak.verb: says "view" but you ran class → remove mak.verb, or run mm3 view']);

    expect(stopsOf({ mak: { goal: 'The handler is safe' } }, 'class')).toEqual([
      '✖ mak.depth: class needs it → add "depth: quick" (9 yes/no questions across 3 concerns; standard 18, thorough 27)',
      '✖ mak.where: class needs it → add "where: [path/to/file.ts]"',
      '✖ mak.ask: class needs it → add ask: with concerns: and decisions: (mm3 template class)',
    ]);

    expect(
      stopsOf({ mak: { goal: 'The fix works', parent: 'MM3-0042', compare: { before: 'main', after: 'HEAD' }, expect: ['a'], ask: fullAsk(1) } }, 'replay'),
    ).toEqual(["✖ mak.ask: replay re-runs the parent's questions → remove ask; for new questions, use class"]);

    // mak.parent is now allowed on every verb, as lineage (not just drill/replay).
    const v = validateRequest(req({ parent: 'MM3-0001' }), 'class');
    if (!v.ok) throw new Error(v.stops.map((s) => s.text).join('\n'));
    expect(v.request.mak.parent).toBe('MM3-0001');
  });

  it('replay needs expect: too; every other verb refuses it', () => {
    expect(stopsOf({ mak: { goal: 'The fix works', parent: 'MM3-0042', compare: { before: 'main', after: 'HEAD' } } }, 'replay')).toContainEqual(
      expect.stringContaining('✖ mak.expect: replay needs it'),
    );
    const withExpect = req({});
    (withExpect.mak as Obj).expect = ['a'];
    expect(stopsOf(withExpect, 'class')).toContainEqual('✖ mak.expect: only replay predicts fixed concerns → remove it');
  });

  it('replay expect: [] validates and is normalized to "none" [C-210]', () => {
    const v = validateRequest({ mak: { goal: 'The fix works', parent: 'MM3-0042', compare: { before: 'main', after: 'HEAD' }, expect: [] } }, 'replay');
    if (!v.ok) throw new Error(v.stops.map((s) => s.text).join('\n'));
    expect(v.request.mak.expect).toBe('none');
  });

  it('mdl is entirely optional: omitting it validates, and request.mdl is null (nothing recorded for it) [C-005]', () => {
    const v = validateRequest(req(), 'class');
    expect(v.ok && v.request.mdl).toBeNull();
  });

  it('over is sweep-only: a one-subject verb (class) refuses it even when it is validly shaped [C-007] [C-014]', () => {
    const bad = req({ over: { part: ['a', 'b'] } });
    expect(stopsOf(bad, 'class')).toContain('✖ mak.over: class asks about one subject → remove over, or use loop or scan to sweep');
  });

  it('numbering: the same number twice across categories [C-020]', () => {
    const ask = {
      concerns: { c1: concern(1), c2: concern(3), c3: concern(6) }, // c1: 1,2,3 · c2: 3,4,5 (dup 3) · c3: 6,7,8
      decisions: { severity: scaleDecision(9), route: choiceDecision(10) },
    };
    expect(stopsOf(req({ ask }), 'class')).toEqual(['✖ question 3: numbered twice → give each question its own number']);
  });

  it('numbering: a gap [C-020]', () => {
    const ask = {
      concerns: { c1: concern(1), c2: concern(4), c3: { pass: 'no', 7: 'Is thing 7 wrong?', 8: 'Is thing 8 wrong?', 11: 'Is thing 11 wrong?' } },
      decisions: { severity: scaleDecision(12), route: choiceDecision(13) },
    };
    expect(stopsOf(req({ ask }), 'class')).toEqual(['✖ question numbers: 1 2 3 4 5 6 7 8 11 12 13 → number them 1…11 with no gaps']);
  });

  it('numbering: decisions must be numbered after every concern', () => {
    const ask = { concerns: { c1: concern(3), c2: concern(6), c3: concern(9) }, decisions: { severity: scaleDecision(1), route: choiceDecision(2) } };
    expect(stopsOf(req({ ask }), 'class')).toEqual(['✖ mak.ask: decisions must be numbered after every concern → renumber decisions last']);
  });

  it('depth: the concerns section must have exactly 3k categories [C-011] [C-086]', () => {
    const few = req({ ask: { concerns: { c1: concern(1), c2: concern(4) }, decisions: { severity: scaleDecision(7), route: choiceDecision(8) } } });
    expect(stopsOf(few, 'class')).toEqual(['✖ mak.ask.concerns: 2 categories → quick needs exactly 3 → see: mm3 agent probe']);

    const many = req({
      ask: { concerns: { c1: concern(1), c2: concern(4), c3: concern(7), c4: concern(10) }, decisions: { severity: scaleDecision(13), route: choiceDecision(14) } },
    });
    expect(stopsOf(many, 'class')).toEqual(['✖ mak.ask.concerns: 4 categories → quick needs exactly 3 → see: mm3 agent probe']);

    expect(validateRequest(req(), 'class').ok).toBe(true);
  });

  it('a concerns category is yes/no only; mixing kinds in one category fails first [C-022]', () => {
    const mixed = fullAsk(1);
    (mixed.concerns as Obj).c1 = { pass: 'no', 1: 'Is it wrong?', 2: 'Is it wrong?', 3: { scale: 'How bad?', levels: ['low', 'high'] } };
    expect(stopsOf(req({ ask: mixed }), 'class')).toEqual(['✖ mak.ask.concerns.c1: mixes yes/no and scale questions → one kind per category']);

    const scaleInConcerns = fullAsk(1);
    (scaleInConcerns.concerns as Obj).c1 = { pass: 'yes', 1: { scale: 'How bad?', levels: ['low', 'high'] }, 2: { scale: 'Also?', levels: ['low', 'high'] }, 3: { scale: 'Also2?', levels: ['low', 'high'] } };
    expect(stopsOf(req({ ask: scaleInConcerns }), 'class')).toEqual(['✖ mak.ask.concerns.c1: a concerns category must be yes/no only → use decisions: for scale or choice']);
  });

  it('a decisions category is scale/choice only, holds exactly one question, and its pass: fits the kind', () => {
    const yesnoInDecisions = fullAsk(1);
    (yesnoInDecisions.decisions as Obj).severity = singleYesNo(10);
    expect(stopsOf(req({ ask: yesnoInDecisions }), 'class')).toEqual([
      '✖ mak.ask.decisions.severity: a decisions category must be scale or choice → use concerns: for yes/no',
      '✖ mak.ask.decisions: no scale question → add at least one scale: question → see: mm3 agent probe',
    ]);

    const twoQuestions = fullAsk(1);
    (twoQuestions.decisions as Obj).severity = { pass: ['none'], 10: { scale: 'How bad?', levels: ['none', 'high'] }, 11: { scale: 'How bad, really?', levels: ['none', 'high'] } };
    (twoQuestions.decisions as Obj).route = choiceDecision(12);
    expect(stopsOf(req({ ask: twoQuestions }), 'class')).toEqual(['✖ mak.ask.decisions.severity: 2 questions → give it exactly 1 → see: mm3 agent probe']);

    const unknownLevel = fullAsk(1);
    (unknownLevel.decisions as Obj).severity = scaleDecision(10, ['severe']);
    expect(stopsOf(req({ ask: unknownLevel }), 'class')).toEqual(['✖ mak.ask.decisions.severity.pass: "severe" is not a level of question 10 → use some of none, low, high']);

    const badPassShape = fullAsk(1);
    (badPassShape.decisions as Obj).severity = { pass: 'yes', 10: { scale: 'How bad?', levels: ['none', 'low', 'high'] } };
    expect(stopsOf(req({ ask: badPassShape }), 'class')).toEqual(['✖ mak.ask.decisions.severity.pass: scale questions need the passing levels → e.g. pass: [none, low]']);
  });

  // [C-270] B3 decision paths (TRL-0053, 0056): after "give 2–5" the agent read the explanation cards and wrote its own decisions from its yes/no questions in 3 of 5 trials, and only the template had a working example.
  it('[C-270] a request with no decisions section is sent to the template that has a working one, not left to invent its own', () => {
    const none = req({ ask: { concerns: fullAsk(1).concerns } });
    expect(stopsOf(none, 'class')).toEqual(['✖ mak.ask.decisions: 0 categories → copy the decisions: section from mm3 template class (2–5 categories, a scale and a choice) → see: mm3 agent probe']);
  });

  it('decisions: 2-5 categories, at least one scale and one choice', () => {
    const one = req({ ask: { concerns: fullAsk(1).concerns, decisions: { severity: scaleDecision(10) } } });
    expect(stopsOf(one, 'class')).toEqual(['✖ mak.ask.decisions: 1 category → give 2–5 → see: mm3 agent probe']);

    const six = req({ ask: { concerns: fullAsk(1).concerns, decisions: manyDecisions(6, 10) } });
    expect(stopsOf(six, 'class')).toEqual(['✖ mak.ask.decisions: 6 categories → give 2–5 → see: mm3 agent probe']);

    const noChoice = req({ ask: { concerns: fullAsk(1).concerns, decisions: { s1: scaleDecision(10), s2: scaleDecision(11, ['low']) } } });
    expect(stopsOf(noChoice, 'class')).toEqual(['✖ mak.ask.decisions: no choice question → add at least one choice: question → see: mm3 agent probe']);

    const noScale = req({ ask: { concerns: fullAsk(1).concerns, decisions: { c1: choiceDecision(10), c2: choiceDecision(11, ['block']) } } });
    expect(stopsOf(noScale, 'class')).toEqual(['✖ mak.ask.decisions: no scale question → add at least one scale: question → see: mm3 agent probe']);
  });

  it('a category may not use a word the answer uses (including "expected", replay\'s new grade key)', () => {
    const ask = fullAsk(1);
    (ask.concerns as Obj).gate = (ask.concerns as Obj).c1;
    delete (ask.concerns as Obj).c1;
    expect(stopsOf(req({ ask }), 'class')).toEqual(['✖ mak.ask.concerns.gate: "gate" is a word the answer uses → rename the category']);

    const ask2 = fullAsk(1);
    (ask2.concerns as Obj).expected = (ask2.concerns as Obj).c1;
    delete (ask2.concerns as Obj).c1;
    expect(stopsOf(req({ ask: ask2 }), 'class')).toEqual(['✖ mak.ask.concerns.expected: "expected" is a word the answer uses → rename the category']);
  });

  it('blanks: none in one subject; in a sweep only the layer or one above', () => {
    const ask = fullAsk(1);
    for (const n of [1, 2, 3]) (ask.concerns as Obj).c1 = { ...(ask.concerns as Obj).c1 as Obj, [n]: `Does {part} ${n} fail?` };
    expect(stopsOf(req({ ask }), 'class')[0]).toBe('✖ question 1: {part} has nothing to fill it → blanks are for sweeps (over:); write the name out');

    const loop = {
      mak: {
        goal: 'Ideas hold up',
        depth: 'quick',
        over: { part: [{ name: 'a', story: ['s1'] }] },
        // part is not the finest layer here (story is): a thin, minimal ask is fine there (a note, not a
        // stop) — but {story} (a CHILD layer, not part itself or an ancestor) is still an invalid blank in it.
        ask: {
          part: { concerns: { boundaries: { pass: 'yes', 1: 'Is {part} ok?', 2: 'Is {story} ok?' } } },
          story: fullAsk(1, 3),
        },
      },
    };
    expect(stopsOf(loop, 'loop')).toEqual(["✖ question 2: {story} is not part's layer or above it → use {part}"]);
  });

  it('a sweep: ask keyed by existing layers; one subject: categories straight under ask', () => {
    const noLayer = { mak: { goal: 'Ideas hold up', depth: 'quick', over: { part: ['a', 'b'] }, ask: { stories: fullAsk(1) } } };
    expect(stopsOf(noLayer, 'loop')).toEqual(['✖ mak.ask.stories: not a layer in over → use one of part']);

    const flat = { mak: { goal: 'Ideas hold up', depth: 'quick', over: { part: ['a', 'b'] }, ask: { concerns: { x: { pass: 'yes', 1: 'Is {part} ok?', 2: 'Is {part} ok?', 3: 'Is {part} ok?' } } } } };
    expect(stopsOf(flat, 'loop')).toEqual(['✖ mak.ask.concerns: a sweep keys categories by layer → ask: {<layer>: {concerns: ..., decisions: ...}}']);
  });

  it("item names can't hold / or # (ids join names with /)", () => {
    const t = { mak: { goal: 'Ideas hold up', depth: 'quick', over: { part: ['a/b', 'c#1'] }, ask: { part: fullAsk(1) } } };
    expect(stopsOf(t, 'loop')).toEqual([
      '✖ mak.over.part: item "a/b" → names are 1–80 characters, without "/" or "#"',
      '✖ mak.over.part: item "c#1" → names are 1–80 characters, without "/" or "#"',
    ]);
  });

  it("a sweep request: layers normalized in over's order [C-008]", () => {
    const v = validateRequest(parse(readFileSync('test/fixtures/requests/valid/loop.yaml', 'utf8')), 'loop');
    if (!v.ok) throw new Error(v.stops.map((s) => s.text).join('\n'));
    expect(v.request.mak.layers.map((l) => [l.name, l.categories.map((c) => c.name)])).toEqual([
      ['part', ['boundaries']],
      ['story', ['done', 'risk', 'fit', 'risk-level', 'route']],
    ]);
    expect(v.request.mak.categories).toEqual([]);
  });

  it('notes, never stops: an irreversible goal; a view draft whose sections are off', () => {
    const v = validateRequest(req({ goal: 'It is safe to deploy this migration' }), 'class');
    expect(v.ok && v.notes).toEqual(['looks irreversible; don\'t act on this alone ("deploy")']);

    // view: a partial draft (one concerns category, 2 probes, no decisions) validates — the section/count
    // rules become notes, not stops ("a partial draft is fine").
    const partial = validateRequest(parse(readFileSync('test/fixtures/requests/valid/view.yaml', 'utf8')), 'view');
    if (!partial.ok) throw new Error(partial.stops.map((s) => s.text).join('\n'));
    expect(partial.notes.length).toBeGreaterThan(0);
    expect(partial.notes.every((n) => n.endsWith('; class will stop on this'))).toBe(true);
    expect(partial.notes.some((n) => n.startsWith('mak.ask.concerns.injection'))).toBe(true);
    expect(partial.notes.some((n) => n.startsWith('mak.ask.decisions'))).toBe(true);
  });

  it('scan: where duplicates over (scan reads the files it sweeps)', () => {
    const text = { mak: { goal: 'Handlers stay safe', depth: 'quick', where: ['src/a.ts'], over: { file: 'src/handlers/*.ts', function: 'each' }, ask: { function: fullAsk(1) } } };
    expect(stopsOf(text, 'scan')).toEqual(['✖ mak.where: scan reads the files in over → remove where']);
  });

  it("drill: a blank that is not one of the sweep's own layers is deferred, not stopped (the verb resolves it against the parent)", () => {
    const ask = fullAsk(1);
    (ask.concerns as Obj).c1 = { pass: 'no', 1: 'Does {call} pass request text into SQL?', 2: 'Does {resource} get checked for ownership?', 3: 'Is {call} reachable?' };
    const text = { mak: { goal: 'Find where the leak happens', parent: 'MM3-0060', from: 'src/handlers/user.ts/findUser', over: { call: 'each' }, ask: { call: ask } } };
    const v = validateRequest(text, 'drill');
    if (!v.ok) throw new Error(v.stops.map((s) => s.text).join('\n'));
    expect(v.request.mak.layers.map((l) => [l.name, l.categories.map((c) => c.name)])).toEqual([['call', ['c1', 'c2', 'c3', 'severity', 'route']]]);
    expect(v.notes).toEqual([]);
  });

  it('loop: the same shape blank, but with no parent to defer to, IS stopped', () => {
    const ask = fullAsk(1);
    (ask.concerns as Obj).c1 = { pass: 'yes', 1: 'Is {part} ok?', 2: 'Does {resource} check out?', 3: 'Is {part} still ok?' };
    const text = { mak: { goal: 'Ideas hold up', depth: 'quick', over: { part: ['a'] }, ask: { part: ask } } };
    expect(stopsOf(text, 'loop')).toEqual(["✖ question 2: {resource} is not part's layer or above it → use {part}"]);
  });

  it('a non-finest sweep layer is optional and thin-tolerant: no ask at all, or a partial one, is only a note', () => {
    const v = validateRequest(parse(readFileSync('test/fixtures/requests/valid/loop.yaml', 'utf8')), 'loop');
    if (!v.ok) throw new Error(v.stops.map((s) => s.text).join('\n'));
    // part (non-finest) has 1 concerns category with 2 probes, no decisions at all — thin, but only a note.
    expect(v.notes.some((n) => n.startsWith('mak.ask.part ask is thin'))).toBe(true);
  });

  it('a valid scan and a valid drill fixture pass validation', () => {
    const scan = validateRequest(parse(readFileSync('test/fixtures/requests/valid/scan.yaml', 'utf8')), 'scan');
    if (!scan.ok) throw new Error(scan.stops.map((s) => s.text).join('\n'));
    expect(scan.request.mak.layers.map((l) => l.name)).toEqual(['function']);

    const drill = validateRequest(parse(readFileSync('test/fixtures/requests/valid/drill.yaml', 'utf8')), 'drill');
    if (!drill.ok) throw new Error(drill.stops.map((s) => s.text).join('\n'));
    expect(drill.request.mak.layers.map((l) => l.name)).toEqual(['call']);
  });

  it('the contract replay fixture validates, with expect: normalized onto mak', () => {
    const v = validateRequest(parse(readFileSync('test/fixtures/requests/valid/replay.yaml', 'utf8')), 'replay');
    if (!v.ok) throw new Error(v.stops.map((s) => s.text).join('\n'));
    expect(v.request.mak.expect).toEqual(['injection']);
  });
});

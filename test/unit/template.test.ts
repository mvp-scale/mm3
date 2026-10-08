// mm3 template <verb>: a copy-editable request, never a response; each one validates on its own.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRequestText } from '../../src/contract/read.ts';
import { VERBS, type Verb } from '../../src/contract/types.ts';
import { validateRequest } from '../../src/contract/validate.ts';
import { appendRun } from '../../src/ledger/log.ts';
import { runTemplate } from '../../src/verbs/template.ts';
import { runReplay } from '../../src/verbs/replay.ts';
import { runClass } from '../../src/verbs/class.ts';
import { runScan } from '../../src/verbs/scan.ts';
import { clip } from '../../src/util/text.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleRun } from '../helpers/runs.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const env = { MM3_ACTOR: 'r' };

/** A valid one-subject ask (quick: 3 concerns categories x 3 probes + a scale + a choice decision, numbered
 *  1..11) — every embedded request below has to satisfy the new contract to actually get logged. */
const ASK_ONE_SUBJECT =
  '  ask:\n    concerns:\n      injection:\n        pass: no\n        1: is question 1 true?\n        2: is question 2 true?\n        3: is question 3 true?\n      access:\n        pass: no\n        4: is question 4 true?\n        5: is question 5 true?\n        6: is question 6 true?\n      leaks:\n        pass: no\n        7: is question 7 true?\n        8: is question 8 true?\n        9: is question 9 true?\n    decisions:\n      severity:\n        pass: [none]\n        10:\n          scale: how bad?\n          levels: [none, high]\n      route:\n        pass: [ship]\n        11:\n          choice: where to?\n          options: [ship, block]\n';
/** Same shape, for the finest layer (function) of a sweep. */
const ASK_SWEEP_FUNCTION =
  '  ask:\n    function:\n      concerns:\n        injection:\n          pass: no\n          1: is it unsafe?\n          2: is question 2 true?\n          3: is question 3 true?\n        access:\n          pass: no\n          4: is question 4 true?\n          5: is question 5 true?\n          6: is question 6 true?\n        leaks:\n          pass: no\n          7: is question 7 true?\n          8: is question 8 true?\n          9: is question 9 true?\n      decisions:\n        severity:\n          pass: [none]\n          10:\n            scale: how bad?\n            levels: [none, high]\n        route:\n          pass: [ship]\n          11:\n            choice: where to?\n            options: [ship, block]\n';

describe('runTemplate', () => {
  it.each(VERBS)('%s: prints a request that validates on its own', (verb) => {
    const r = runTemplate(verb);
    expect(r.exit).toBe(0);
    const parsed = readRequestText(r.text);
    expect(parsed.ok).toBe(true);
    const v = parsed.ok && validateRequest(parsed.value, verb);
    expect(v && v.ok).toBe(true);
  });

  it('[C-185] class and scan show the visible-scope probe as a commented-out, optional recommended question', () => {
    for (const verb of ['class', 'scan'] as const) {
      const text = runTemplate(verb).text;
      expect(text).toContain('optional, recommended (TypeSafe best practice) — the visible-scope probe');
      expect(text).toContain('Can this be answered from the code shown?');
    }
  });

  it('an unknown verb: a clean stop', () => {
    expect(runTemplate('nope')).toEqual({
      exit: 2,
      text: '✖ template: "nope" is not a verb → one of view, class, replay, scan, drill, loop\n→ see: mm3 agent template',
    });
  });

  it('--parent only applies to drill', () => {
    expect(runTemplate('class', { parent: 'MM3-0001' })).toEqual({
      exit: 2,
      text: '✖ template: --parent only applies to drill → mm3 template class\n→ see: mm3 agent template',
    });
  });

  it('drill needs both flags together, or neither', () => {
    expect(runTemplate('drill', { parent: 'MM3-0001' }).exit).toBe(2);
    expect(runTemplate('drill', { from: 'x' }).exit).toBe(2);
  });

  it('drill with both flags: overlays parent/from, keeps the rest, still validates', () => {
    const r = runTemplate('drill', { parent: 'MM3-0099', from: 'access' });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('parent: MM3-0099');
    expect(r.text).toContain('from: access');
    expect(r.text).toContain('call: each'); // the sample over: is untouched
    const parsed = readRequestText(r.text);
    const v = parsed.ok && validateRequest(parsed.value, 'drill');
    expect(v && v.ok).toBe(true);
  });

  it('no ledger reachable: keeps the sweep sample (unchanged today-behaviour) [C-090]', () => {
    const r = runTemplate('drill', { parent: 'MM3-0099', from: 'access' }, undefined);
    expect(r.text).toContain('over:');
    expect(r.text).toContain('call: each');
  });

  describe('drill --parent/--from shaped by the ledger, when one is reachable [C-090]', () => {
    const classReq = `mak:\n  goal: check this code\n  depth: quick\n  where: [src/a.ts]\n${ASK_ONE_SUBJECT}`;
    const scanReq = `mak:\n  goal: handlers stay safe\n  depth: quick\n  over:\n    file: src/*.ts\n    function: each\n${ASK_SWEEP_FUNCTION}`;

    it('a one-subject parent (class): no over:, from: names the category, ask: shaped for it', async () => {
      const { paths } = tempProject({ 'src/a.ts': 'x' });
      await runClass(classReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001
      const r = runTemplate('drill', { parent: 'MM3-0001', from: 'injection' }, paths);
      expect(r.exit).toBe(0);
      expect(r.text).toContain('parent: MM3-0001');
      expect(r.text).toContain('from: injection');
      expect(r.text).not.toContain('over:');
      const parsed = readRequestText(r.text);
      const v = parsed.ok && validateRequest(parsed.value, 'drill');
      expect(v && v.ok).toBe(true);
    });

    it('a sweep parent (scan): keeps the sweep sample, over: and all', async () => {
      const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(req.id); }\n' });
      await runScan(scanReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001
      const r = runTemplate('drill', { parent: 'MM3-0001', from: 'src/a.ts/findUser' }, paths);
      expect(r.exit).toBe(0);
      expect(r.text).toContain('parent: MM3-0001');
      expect(r.text).toContain('from: src/a.ts/findUser');
      expect(r.text).toContain('over:');
      expect(r.text).toContain('call: each');
      const parsed = readRequestText(r.text);
      const v = parsed.ok && validateRequest(parsed.value, 'drill');
      expect(v && v.ok).toBe(true);
    });

    it('an unknown parent id, ledger reachable: keeps the sweep sample rather than stopping', () => {
      const { paths } = tempProject({});
      const r = runTemplate('drill', { parent: 'MM3-9999', from: 'access' }, paths);
      expect(r.exit).toBe(0);
      expect(r.text).toContain('over:');
    });
  });

  // Round 4 owner finding: an MCP-driven agent sends every request over stdin, so `.mm3/requests/` stays
  // empty — asked to reproduce its own past request, it can only rebuild from memory (not authoritative).
  // `--from MM3-####` (checked before the file-path branch: the shape is narrow and unambiguous) prints that
  // run's own request straight from the ledger instead — read-only, free, no spend, same as every other
  // template path. [C-201] [C-202]
  describe('--from MM3-#### (prints a logged run\'s own request from the ledger)', () => {
    it('a class run: goal/depth/where/ask rebuilt, validates as class', async () => {
      const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(req.id); }\n' });
      const classText =
        'mak:\n  goal: check this code\n  depth: quick\n  where: [src/a.ts]\n  ask:\n    concerns:\n      injection:\n        pass: no\n        need: any\n        tags: [sql]\n        1: is question 1 true?\n        2: is question 2 true?\n        3: is question 3 true?\n      access:\n        pass: no\n        4: is question 4 true?\n        5: is question 5 true?\n        6: is question 6 true?\n      leaks:\n        pass: no\n        7: is question 7 true?\n        8: is question 8 true?\n        9: is question 9 true?\n    decisions:\n      severity:\n        pass: [none]\n        10:\n          scale: how bad?\n          levels: [none, high]\n      route:\n        pass: [ship]\n        11:\n          choice: where to?\n          options: [ship, block]\n';
      await runClass(classText, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001
      const r = runTemplate('class', { from: 'MM3-0001' }, paths);
      expect(r.exit).toBe(0);
      expect(r.text).toContain('goal: check this code');
      expect(r.text).toContain('depth: quick');
      expect(r.text).toContain('src/a.ts');
      expect(r.text).toContain('need: any');
      expect(r.text).toContain('sql');
      expect(r.text).toContain('is question 1 true?');
      const parsed = readRequestText(r.text);
      expect(parsed.ok).toBe(true);
      const v = parsed.ok && validateRequest(parsed.value, 'class');
      expect(v && v.ok).toBe(true);
    });

    it('a scan run (a sweep): over:/layered ask: rebuilt, validates as scan', async () => {
      const { paths } = tempProject({ 'src/a.ts': 'export function findUser(req) { return db.query(req.id); }\n' });
      const scanReq = `mak:\n  goal: handlers stay safe\n  depth: quick\n  over:\n    file: src/*.ts\n    function: each\n${ASK_SWEEP_FUNCTION}`;
      await runScan(scanReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001
      const r = runTemplate('scan', { from: 'MM3-0001' }, paths);
      expect(r.exit).toBe(0);
      expect(r.text).toContain('over:');
      expect(r.text).toContain('function: each');
      expect(r.text).toContain('is it unsafe?');
      const parsed = readRequestText(r.text);
      expect(parsed.ok).toBe(true);
      const v = parsed.ok && validateRequest(parsed.value, 'scan');
      expect(v && v.ok).toBe(true);
    });

    it('a replay run: only goal/parent/compare — the parent\'s where/ask it stores for grading is never printed, since a real replay request never carries them (validate.ts NEVER: ask/over/from/where/depth)', async () => {
      const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return db.query(`SELECT * FROM t WHERE id = ${x}`); }\n' });
      const classText = `mak:\n  goal: fix sql injection\n  depth: quick\n  where: [src/a.ts]\n${ASK_ONE_SUBJECT}`;
      await runClass(classText, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001
      const replayText = 'mak:\n  goal: The fix works\n  parent: MM3-0001\n  compare: {before: worktree, after: worktree}\n  expect: [injection]\n';
      await runReplay(replayText, { paths, provider: stubProvider({ yes: () => 0.05 }), env }); // MM3-0002
      const r = runTemplate('replay', { from: 'MM3-0002' }, paths);
      expect(r.exit).toBe(0);
      expect(r.text).toContain('goal: The fix works');
      expect(r.text).toContain('parent: MM3-0001');
      expect(r.text).toContain('compare:');
      expect(r.text).not.toContain('ask:');
      expect(r.text).not.toMatch(/\bwhere:/);
      expect(r.text).not.toMatch(/\bdepth:/);
      expect(r.text).not.toMatch(/\bover:/);
      const parsed = readRequestText(r.text);
      expect(parsed.ok).toBe(true);
      const v = parsed.ok && validateRequest(parsed.value, 'replay');
      // expect: is required for replay but replay.ts doesn't store it on ContractRun yet as this
      // test was written (that lands with replay.ts's own expect: feature) — fromRunId already reads it
      // defensively, so once replay.ts starts writing it this flips to a plain `expect(v && v.ok).toBe(true)`
      // with no further change here; until then, this proves the rebuild is faithful everywhere else.
      if (v && !v.ok) expect(v.stops.every((s) => s.text.includes('mak.expect'))).toBe(true);
      else expect(v && v.ok).toBe(true);
    });

    it('--where/--goal still overlay on top of a ledger-fetched request, same as file-based --from', async () => {
      const { paths } = tempProject({ 'src/a.ts': 'x', 'src/b.ts': 'y' });
      const classText = `mak:\n  goal: old goal\n  depth: quick\n  where: [src/a.ts]\n${ASK_ONE_SUBJECT}`;
      await runClass(classText, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001
      const r = runTemplate('class', { from: 'MM3-0001', goal: 'new goal', where: ['src/b.ts'] }, paths);
      expect(r.exit).toBe(0);
      expect(r.text).toContain('goal: new goal');
      expect(r.text).toContain('src/b.ts');
      expect(r.text).not.toContain('old goal');
    });

    it('an unknown id: a clean stop, no crash', () => {
      const { paths } = tempProject({});
      const r = runTemplate('class', { from: 'MM3-9999' }, paths);
      expect(r.exit).toBe(2);
      expect(r.text).toContain('MM3-9999');
      expect(r.text).toContain('not in the ledger');
    });

    it('a legacy (Plan 1, pre-contract) run: a clean stop pointing at a request file instead', () => {
      const { paths } = tempProject({});
      appendRun(paths, sampleRun()); // MM3-0001, no v:2 — isContractRun is false
      const r = runTemplate('class', { from: 'MM3-0001' }, paths);
      expect(r.exit).toBe(2);
      expect(r.text).toContain('predates the YAML contract');
    });

    it('no project reachable: a clean stop rather than a crash (a run-id lookup has nothing to search)', () => {
      const r = runTemplate('class', { from: 'MM3-0001' }, undefined);
      expect(r.exit).toBe(2);
      expect(r.text).toContain('needs a project');
    });
  });

  // fix #16: --from alone (no --parent) names a request FILE, not an item/category — a frozen checklist
  // reused on a new subject without sed.
  describe('--from a request file (fix #16)', () => {
    const write = (root: string, text: string): string => {
      const file = path.join(root, 'saved.yaml');
      writeFileSync(file, text);
      return file;
    };
    const frozen = `mak:\n  goal: old goal\n  depth: quick\n  where: [src/old.ts]\n${ASK_ONE_SUBJECT}mdl:\n  why: validate\n  area: data\n`;

    it('[C-111] prints the file back unchanged with no overrides', () => {
      const { root } = tempProject({});
      const file = write(root, frozen);
      const r = runTemplate('class', { from: file });
      expect(r.exit).toBe(0);
      expect(r.text).toContain('goal: old goal');
      expect(r.text).toContain('where:');
      expect(r.text).toContain('injection:');
    });

    it('[C-112] --where/--goal overlay the frozen ask: onto a new subject', () => {
      const { root } = tempProject({});
      const file = write(root, frozen);
      const r = runTemplate('class', { from: file, goal: 'new goal', where: ['src/new.ts'] });
      expect(r.exit).toBe(0);
      expect(r.text).toContain('goal: new goal');
      expect(r.text).toContain('src/new.ts');
      expect(r.text).not.toContain('old.ts');
      const parsed = readRequestText(r.text);
      const v = parsed.ok && validateRequest(parsed.value, 'class');
      expect(v && v.ok).toBe(true);
    });

    it('a missing file: a clean stop', () => {
      const r = runTemplate('class', { from: '/no/such/file.yaml' });
      expect(r.exit).toBe(2);
      expect(r.text).toContain('not found');
    });

    it('a file with no mak: block: a clean stop', () => {
      const { root } = tempProject({});
      const file = write(root, 'mdl:\n  why: validate\n');
      const r = runTemplate('class', { from: file });
      expect(r).toEqual({
        exit: 2,
        text: `✖ template: --from "${clip(file, 60)}" has no mak: block → point at an MM3 request file\n→ see: mm3 agent template`,
      });
    });

    it('--where/--goal without --from: a clean stop', () => {
      expect(runTemplate('class', { goal: 'x' }).exit).toBe(2);
      expect(runTemplate('class', { where: ['a'] }).exit).toBe(2);
    });

    it('--where/--goal with --parent: a clean stop (they overlay --from, not a drill item lookup)', () => {
      const r = runTemplate('drill', { parent: 'MM3-0001', from: 'access', goal: 'x' });
      expect(r.exit).toBe(2);
    });
  });

  // Templates push the envelope of WHAT a request can do: every field a verb's own schema allows it to carry
  // must show up in that verb's template (a value, or — for a field that's merely legal, not needed here — a
  // commented-out example), marked required/optional in a trailing comment. This table is src/contract/
  // validate.ts's own NEEDS/NEVER (plus mak.verb and mdl:, which are legal on every verb) restated as data,
  // so the test drives from the same rule the validator enforces instead of re-typing it six times. [C-174]
  const ENVELOPE: Record<Verb, { required: readonly string[]; optional: readonly string[] }> = {
    class: { required: ['goal', 'depth', 'where', 'ask'], optional: ['verb'] },
    view: { required: ['goal', 'where'], optional: ['depth', 'ask', 'verb'] },
    replay: { required: ['goal', 'parent', 'compare', 'expect'], optional: ['verb'] },
    scan: { required: ['goal', 'depth', 'over', 'ask'], optional: ['verb'] },
    loop: { required: ['goal', 'depth', 'over', 'ask'], optional: ['where', 'verb'] },
    drill: { required: ['goal', 'parent', 'from', 'ask'], optional: ['depth', 'over', 'verb'] },
  };
  const MDL_KEYS = ['why', 'area', 'stage', 'change', 'risk', 'parent', 'problem', 'uses', 'touches', 'blast'];

  describe('templates show the full field envelope [C-174]', () => {
    it.each(VERBS)('%s: every mak.* field it accepts appears in its template (live or commented)', (verb) => {
      const raw = readFileSync(path.join('skills', 'mm3', 'templates', `${verb}.yaml`), 'utf8');
      const parsed = readRequestText(raw);
      expect(parsed.ok).toBe(true);
      const mak = (parsed.ok ? parsed.value.mak : {}) as Record<string, unknown>;
      const { required, optional } = ENVELOPE[verb];
      for (const field of required) expect(Object.hasOwn(mak, field)).toBe(true);
      for (const field of optional) expect(raw).toMatch(new RegExp(`\\b${field}:`));
    });

    it.each(VERBS)('%s: mdl: mentions every catalog key, live or commented', (verb) => {
      const raw = readFileSync(path.join('skills', 'mm3', 'templates', `${verb}.yaml`), 'utf8');
      for (const key of MDL_KEYS) expect(raw).toMatch(new RegExp(`\\b${key}:`));
    });

    it('class.yaml demonstrates the category-level fields (need:, tags:) once, for every verb to copy [C-175]', () => {
      const raw = readFileSync(path.join('skills', 'mm3', 'templates', 'class.yaml'), 'utf8');
      const parsed = readRequestText(raw);
      expect(parsed.ok).toBe(true);
      const ask = (parsed.ok ? (parsed.value.mak as Record<string, unknown>).ask : {}) as Record<string, Record<string, Record<string, unknown>>>;
      const categories = Object.values(ask.concerns ?? {});
      expect(categories.some((c) => 'need' in c)).toBe(true);
      expect(categories.some((c) => 'tags' in c)).toBe(true);
    });
  });

  // Pattern-shape samples (no new verb, no new option) — proof/rank/decide are files an agent copies directly,
  // not verbs runTemplate dispatches on; this just proves each one is a well-formed, valid request.
  describe.each([
    ['proof.yaml', 'class'],
    ['rank.yaml', 'scan'],
    ['decide.yaml', 'class'],
  ] as const)('pattern template %s', (file, verb) => {
    it(`validates as ${verb}`, () => {
      const raw = readFileSync(path.join('skills', 'mm3', 'templates', file), 'utf8');
      const parsed = readRequestText(raw);
      expect(parsed.ok).toBe(true);
      const v = parsed.ok && validateRequest(parsed.value, verb);
      expect(v && v.ok).toBe(true);
    });
  });
});

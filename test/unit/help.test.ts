// mm3 help [verb|topic]: free, no project needed. The rule-sharing test below is the one that matters
// most: every fact RULES claims the validator enforces must appear verbatim in the help output it names, so
// the validator and help can never quietly drift apart (lessons-2026-09-27.md §3).
import { describe, expect, it } from 'vitest';
import { VERBS } from '../../src/contract/types.ts';
import { HELP_EXTRAS, runHelp } from '../../src/help/index.ts';
import { PROBE_RULES, RULES } from '../../src/help/rules.ts';
import { TOPICS } from '../../src/help/topics.ts';

describe('runHelp', () => {
  it('[C-113] with no target: the one-screen contract card', () => {
    const r = runHelp();
    expect(r.exit).toBe(0);
    expect(r.text).toContain('## Invoke it');
    expect(r.text).toContain('mm3');
    expect(r.text).toContain('MM3 = MAK³ (make: use what is proven) + MDL³ (model: learn what is missing), each across Know / Judge / Prove.');
    expect(r.text).toContain('## Pick your verb');
    for (const verb of VERBS) expect(r.text).toContain(verb);
    expect(r.text).toContain('## Read the verdict');
  });

  it.each(VERBS)('[C-114] help %s: purpose, when, an example, and its own sharp rules', (verb) => {
    const r = runHelp(verb);
    expect(r.exit).toBe(0);
    expect(r.text).toContain(`## ${verb}`);
    expect(r.text).toContain('When:');
    expect(r.text).toContain('Example:');
    expect(r.text).toContain('Sharp rules:');
  });

  // [C-191] Round-4 finding: a cold CLI agent made zero `mm3` calls at all — it never discovered `mm3
  // agent` exists. Every verb help page now opens by pointing a cold agent at its own terse twin, first.
  it.each(VERBS)('[C-191] help %s opens with "Agents: mm3 agent <verb>", before the heading', (verb) => {
    const r = runHelp(verb);
    expect(r.text.split('\n')[0]).toBe(`Agents: mm3 agent ${verb}`);
  });

  it('[C-115] help drill: says to follow next:, not hand-author parent/from', () => {
    expect(runHelp('drill').text).toContain('next:');
  });

  it('[C-115] help replay: needs the files committed at the ref', () => {
    expect(runHelp('replay').text.toLowerCase()).toContain('committed');
  });

  it('[C-115] help scan: a scale ranks findings, and scan by file', () => {
    const text = runHelp('scan').text;
    expect(text).toContain('scale');
    expect(text.toLowerCase()).toContain('scan by file');
  });

  it('[C-115] help loop: sibling blocks, name limits, every story is asked', () => {
    const text = runHelp('loop').text;
    expect(text.toLowerCase()).toContain('sibling');
    expect(text).toContain('20 characters');
    expect(text.toLowerCase()).toContain('every item at that layer');
  });

  it('[C-183] help view and help loop now carry their own good/bad pairs too', () => {
    expect(runHelp('view').text).toContain('## Good / bad');
    expect(runHelp('loop').text).toContain('## Good / bad');
  });

  // [C-196] help verdict aligns with agent verdict's response-vocabulary facts (rules.ts's shared VERDICT_FACTS).
  it('[C-196] help verdict covers consensus, escalate, stale, reused and fixed/still/regressed', () => {
    const text = runHelp('verdict').text;
    for (const term of ['STRONG', 'SPLIT', 'WEAK', 'escalate', 'stale', 'reused', 'fixed', 'still', 'regressed']) {
      expect(text, `missing "${term}"`).toContain(term);
    }
  });

  it.each(TOPICS)('[C-116] help %s: a real topic page', (topic) => {
    const r = runHelp(topic);
    expect(r.exit).toBe(0);
    expect(r.text).toContain(`## ${topic}`);
  });

  it('[C-117] help mdl: the full catalog, closed values and what you get back', () => {
    const text = runHelp('mdl').text;
    for (const field of ['why', 'area', 'stage', 'change', 'risk']) expect(text).toContain(field);
    expect(text).toContain('what you get back');
  });

  it('[C-118] an unknown target: a clean stop naming every verb and topic', () => {
    const r = runHelp('nope');
    expect(r.exit).toBe(2);
    expect(r.text).toMatch(/^✖ help: "nope" is not a verb or topic → /);
    for (const verb of VERBS) expect(r.text).toContain(verb);
    for (const topic of TOPICS) expect(r.text).toContain(topic);
  });

  it('[C-161] help report: not a seventh verb, but its own recognized target', () => {
    const r = runHelp('report');
    expect(r.exit).toBe(0);
    expect(r.text).toContain('## report');
    expect(r.text).toContain('mm3 report');
    expect(r.text).toContain('hits');
    expect(r.text).toContain('patterns');
    expect(r.text).toContain('history');
    expect(r.text.toLowerCase()).toContain('no options beyond the view name');
  });

  it('[C-180] help probe: the 8 rules, each with its TypeSafe citation', () => {
    const text = runHelp('probe').text;
    expect(text).toContain('## probe');
    for (const r of PROBE_RULES) {
      expect(text).toContain(r.text);
      expect(text).toContain(r.cite);
    }
  });

  it('[C-182] help outcome: syntax, the self-held restriction, no --note, and a good/bad pair', () => {
    const text = runHelp('outcome').text;
    expect(text).toContain('## outcome');
    expect(text).toContain('mm3 outcome <MM3-####> held|overruled|failed --by <actor>');
    expect(text.toLowerCase()).toContain("can't mark it held");
    expect(text).toContain('--note');
    expect(text).toContain('mm3 outcome MM3-0002 held --by claude');
    expect(text).toContain('mm3 outcome MM3-0002 overruled --by claude');
  });

  it('[C-182] help budget: read-only, the caps live in the config, and a good/bad pair', () => {
    const text = runHelp('budget').text;
    expect(text).toContain('## budget');
    expect(text).toContain('mm3 config --load');
    expect(text).toContain('budget.usd');
    expect(text).toContain('mm3 budget set --usd 5');
    expect(text).toContain('was removed');
  });

  it(' help doctor: documents both the bare report and the <file|-> form', () => {
    const text = runHelp('doctor').text;
    expect(text).toContain('## doctor');
    expect(text).toContain('mm3 doctor my-request.yaml');
    expect(text).toContain('mm3 doctor -');
    expect(text.toLowerCase()).toContain('config.yaml');
  });

  it('an unknown target names every extra ("report", "outcome", "budget") too', () => {
    const r = runHelp('nope');
    for (const extra of HELP_EXTRAS) expect(r.text).toContain(`"${extra}"`);
  });

  it('a target with control characters: a clean stop', () => {
    expect(runHelp('a\u0000b').exit).toBe(2);
  });

  it('[R10] the card never claims there is no CLI on PATH (a CLI reader just ran it to see this text)', () => {
    expect(runHelp().text).not.toContain('There is no CLI on PATH');
  });

  it('[R10] the card says replay can take up to 2 calls, not "~1 call"', () => {
    expect(runHelp().text).toContain('replay (up to 2 calls)');
    expect(runHelp().text).not.toContain('replay (~1 call)');
  });

  it('[R10] help report does not open by claiming report is a MAK³ x Know grid cell', () => {
    expect(runHelp('report').text).not.toContain('MAK³ x Know');
  });

  // [C-119] the shared rule list: every fact RULES says the validator enforces shows up verbatim in the help
  // output(s) it names — this is what keeps help and the validator from drifting apart.
  it('[C-119] every validator rule appears verbatim in the help output(s) it names', () => {
    for (const rule of RULES) {
      for (const tag of rule.in) {
        const text = tag === 'card' ? runHelp().text : runHelp(tag).text;
        expect(text, `"${rule.text}" missing from help ${tag}`).toContain(rule.text);
      }
    }
  });
});

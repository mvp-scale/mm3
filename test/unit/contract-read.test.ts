// Reading a request: YAML 1.2 (JSON too), one stop per parse failure, and the contract's YAML traps worded as fixes.
import { describe, expect, it } from 'vitest';
import { readRequestText } from '../../src/contract/read.ts';

const q = (n: number, text: string): string => `mak:\n  ask:\n    leaks:\n      pass: no\n      ${n}: ${text}\n`;
const stops = (text: string): string[] => {
  const r = readRequestText(text);
  if (r.ok) throw new Error('expected stops');
  return r.stops;
};
const value = (text: string): unknown => {
  const r = readRequestText(text);
  if (!r.ok) throw new Error(r.stops.join('\n'));
  return r.value;
};

describe('readRequestText', () => {
  it('reads YAML, and JSON (valid YAML 1.2) [C-001]', () => {
    expect(value('mak:\n  goal: The handler is safe\n')).toEqual({ mak: { goal: 'The handler is safe' } });
    expect(value('{"mak": {"goal": "The handler is safe"}}')).toEqual({ mak: { goal: 'The handler is safe' } });
  });

  it('reads CRLF and a BOM like LF', () => {
    expect(value('﻿mak:\r\n  goal: abc\r\n')).toEqual(value('mak:\n  goal: abc\n'));
  });

  it('keeps no/yes as text (YAML 1.2), numbers question keys as strings [C-041]', () => {
    expect(value(q(4, 'no'))).toEqual({ mak: { ask: { leaks: { pass: 'no', 4: 'no' } } } });
    expect(Object.keys((value(q(1, 'Is it?')) as { mak: { ask: { leaks: object } } }).mak.ask.leaks)).toContain('1');
  });

  it('a question with ": " unquoted [C-038]', () => {
    expect(stops(q(4, 'Does it log: an email?'))).toEqual(['✖ question 4 has ": " → put it in quotes']);
    expect(stops(q(4, 'Does it log:'))).toEqual(['✖ question 4 has ": " → put it in quotes']);
  });

  it('a question with " #" unquoted reads as cut short (the validator stops it)', () => {
    expect(value(q(4, 'Is it # really safe?'))).toEqual({ mak: { ask: { leaks: { pass: 'no', 4: 'Is it' } } } });
  });

  it('a parse error on a line in { }, including an unclosed one reported past its end [C-040]', () => {
    expect(stops('mak:\n  ask:\n    leaks: {pass: no, 4: Does it log: an email?}\n')).toEqual(['✖ yaml: line 3 puts a category or question in { } → use the indented form']);
    expect(stops('mak:\n  ask:\n    leaks: {pass: no, 4: Is it #x safe?}\n')).toEqual(['✖ yaml: line 3 puts a category or question in { } → use the indented form']);
  });

  it('a key or question number given twice, a tab, two documents', () => {
    expect(stops('mak:\n  goal: a\n  goal: b\n')).toEqual(['✖ yaml: line 3 repeats the key "goal" → give each key once']);
    expect(stops('mak:\n  ask:\n    leaks:\n      pass: no\n      4: Is a?\n      4: Is b?\n')).toEqual(['✖ question 4: numbered twice (line 6) → give each question its own number']);
    expect(stops('mak:\n\tgoal: x\n')).toEqual(['✖ yaml: line 2 is indented with a tab → indent with spaces']);
    expect(stops('mak: 1\n---\nmak: 2\n')).toEqual(['✖ yaml: more than one document (---) → send one request per run']);
  });

  // [C-272] Trial B1 (TRL-0037, two sonnet trials): the card says to name the file in backticks, so agents wrote `goal: \`routes/login.ts\` is safe`, and a plain YAML value cannot start with one.
  it('[C-272] a value that starts with a backtick or an @ is told to be put in quotes, not given the generic parse stop', () => {
    expect(stops('mak:\n  goal: `routes/login.ts` is safe to ship\n')).toEqual(['✖ yaml: line 2 starts a value with a backtick → put the whole value in "quotes"']);
    expect(stops('mak:\n  goal: @latest is safe to ship\n')).toEqual(['✖ yaml: line 2 starts a value with an @ → put the whole value in "quotes"']);
  });

  it('anything else that does not parse: one stop with the line', () => {
    expect(stops('mak:\n  goal: abc\nThanks! Let me know what you think.\n')).toEqual([
      '✖ yaml: line 3 does not parse → use the indented form, and put any question with ": " or " #" in quotes',
    ]);
  });

  it('N6: every trap line is reported at once, before YAML parsing, not just the first', () => {
    const text = 'mak:\n  ask:\n    leaks:\n      pass: no\n      1: Does it log: an email?\n      2: {Is the id validated?}\n      3: Also logs: raw data\n';
    expect(stops(text)).toEqual([
      '✖ question 1 has ": " → put it in quotes',
      '✖ question 2 puts it in { } → use the indented form',
      '✖ question 3 has ": " → put it in quotes',
    ]);
  });

  it('N6: caps at 5 stops (4 + "N more"), same shape as stopText', () => {
    const lines = [1, 2, 3, 4, 5, 6, 7].map((n) => `      ${n}: Also logs: raw data ${n}`).join('\n');
    const text = `mak:\n  ask:\n    leaks:\n      pass: no\n${lines}\n`;
    expect(stops(text)).toEqual([
      '✖ question 1 has ": " → put it in quotes',
      '✖ question 2 has ": " → put it in quotes',
      '✖ question 3 has ": " → put it in quotes',
      '✖ question 4 has ": " → put it in quotes',
      '✖ request: 3 more problems → fix the ones above, then run again',
    ]);
  });

  it('N6: an over-160-character line is reported even when it is not a question', () => {
    const long = 'x'.repeat(170);
    const result = stops(`mak:\n  goal: ${long}\n`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^✖ yaml: ".*" is longer than 160 characters → shorten it$/u);
  });

  it('N6: a mid-text blank like {function} is never flagged (only a leading, unquoted "{")', () => {
    expect(value(q(1, 'Does {function} take request text straight from `req.query`?'))).toEqual({
      mak: { ask: { leaks: { pass: 'no', 1: 'Does {function} take request text straight from `req.query`?' } } },
    });
  });

  it('N6: a properly quoted question is never flagged', () => {
    expect(value(q(1, '"Does it log: an email?"'))).toEqual({ mak: { ask: { leaks: { pass: 'no', 1: 'Does it log: an email?' } } } });
  });

  it('empty, comments only, not a mapping, the old text format, an alias bomb', () => {
    const empty = '✖ request: empty → start with "mak:" (mm3 template class prints a skeleton)';
    expect(stops('')).toEqual([empty]);
    expect(stops('  \n')).toEqual([empty]);
    expect(stops('# only a comment\n')).toEqual([empty]);
    expect(stops('hello')).toEqual(['✖ request: not a YAML mapping → start with "mak:" (mm3 template class prints a skeleton)']);
    expect(stops('- a\n- b\n')).toEqual(['✖ request: not a YAML mapping → start with "mak:" (mm3 template class prints a skeleton)']);
    expect(stops('mm3 class L1\nwhere: src/user.ts\n 1  Is it?\n')).toEqual(['✖ request: this is the old text format → send YAML (mm3 template class prints a skeleton)']);
    const bomb = 'a: &a [x,x,x,x,x,x,x,x,x]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: [*c,*c,*c,*c,*c,*c,*c,*c,*c]\n';
    expect(stops(bomb)).toEqual(['✖ yaml: too many aliases (*) → write the request out in full']);
  });
});

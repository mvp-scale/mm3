// The parity diff's pure parts (scripts/parity.ts): what the normaliser rewrites, what it must leave alone,
// and how a difference is classified. The real run is `npm run parity` (needs the two builds).
import { describe, expect, it } from 'vitest';
import { classify, diffLines, normalise, type ExpectedRule } from '../../scripts/parity.ts';

describe('parity normaliser', () => {
  it('rewrites temp paths, timestamps, run uids and millisecond timings', () => {
    const row = '{"kind":"lookup","id":"01M4BJJKZTBT7K59CHNG91RN6X","uid":"01M4BJFFN528PZ54F91EH2JBJT","ts":"2026-10-07T16:17:23Z","ms":412,"where":"/tmp/x/A/src"}';
    expect(normalise(row, ['/tmp/x/A'])).toBe('{"kind":"lookup","id":"<UID>","uid":"<UID>","ts":"<TS>","ms":<MS>,"where":"<DIR>/src"}');
    expect(normalise('took 85 ms and 1.5ms', [])).toBe('took <MS> and <MS>');
  });

  it('leaves everything else alone: a run id, a commit, a gate', () => {
    const text = 'id: MM3-0001\ngate: fail\ncommit: b58620a34d07a487068bc53c7c1d074870b6f6a0';
    expect(normalise(text, ['/tmp/x/A'])).toBe(text);
  });
});

describe('parity classifier', () => {
  const rules: ExpectedRule[] = [{ cmd: /^doctor$/, field: 'stdout', line: /^\s+node: v\d/, reason: 'own Node' }];

  it('same text is same; order-only changes are not differences', () => {
    expect(classify('doctor', 'stdout', 'a\nb', 'a\nb', rules).kind).toBe('same');
    expect(diffLines('a\nb', 'b\na').lines).toEqual([]);
  });

  it('a difference every line of which a rule covers is expected, with its reason', () => {
    const v = classify('doctor', 'stdout', 'x\n  node: v22.1.0', 'x\n  node: v24.2.0', rules);
    expect(v).toMatchObject({ kind: 'expected', reason: 'own Node' });
  });

  it('any line no rule covers is MUST FIX, even next to a covered one, and the rule is scoped to its command and field', () => {
    expect(classify('doctor', 'stdout', 'x\n  node: v22', 'y\n  node: v24', rules).kind).toBe('must-fix');
    expect(classify('class', 'stdout', '  node: v22', '  node: v24', rules).kind).toBe('must-fix');
    expect(classify('doctor', 'stderr', '  node: v22', '  node: v24', rules).kind).toBe('must-fix');
  });
});

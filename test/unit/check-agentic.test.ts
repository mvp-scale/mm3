// The agentic release gate [C-260]: a result stands only while it passed and the guidance it ran under is still the current guidance.
import { describe, expect, it } from 'vitest';
import { agenticProblem, type AgenticRun } from '../../scripts/check-agentic.ts';

const run = (o: Partial<AgenticRun> = {}): AgenticRun => ({ version: '0.1.2-nightly.test', fingerprint: 'a'.repeat(64), date: '2026-10-04', passed: true, ...o });

describe('agentic gate [C-260]', () => {
  it('[C-260] no recorded result fails, and says to run the stage', () => {
    expect(agenticProblem('a'.repeat(64), undefined)).toMatch(/no result recorded → run the agentic stage/u);
  });
  it('[C-260] a failed run fails, naming the version', () => {
    expect(agenticProblem('a'.repeat(64), run({ passed: false }))).toMatch(/did not pass/u);
  });
  it('[C-260] a passed run under a different guidance fingerprint is stale: it says both fingerprints and to re-run', () => {
    expect(agenticProblem('b'.repeat(64), run())).toMatch(/guidance changed since the last pass \(aaaaaaaaaaaa → bbbbbbbbbbbb.*\) → re-run/u);
  });
  it('[C-260] a passed run under the current fingerprint stands', () => {
    expect(agenticProblem('a'.repeat(64), run())).toBeUndefined();
  });
});

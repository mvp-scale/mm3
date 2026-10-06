import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { budgetLine, checkBudget, loadBudget, peekBudget, recordSpend } from '../../src/budget/budget.ts';
import { resolveConfig } from '../../src/config/load.ts';
import { writeConfigOverride } from '../../src/config/write.ts';
import { tempProject } from '../helpers/project.ts';

const T = Date.parse('2026-09-25T00:00:00Z');

describe('budget', () => {
  it('runs on the $5 / 500-run defaults with no config.yaml at all, nothing created', () => {
    const { paths } = tempProject({});
    const { state, created } = loadBudget(paths, T);
    expect(created).toBe(false);
    expect(state).toEqual({ capUsd: 5, capRuns: 500, spentUsd: 0, runs: 0, resetAt: '1970-01-01T00:00:00Z', warnAt: 0.8 });
    expect(loadBudget(paths, T).created).toBe(false);
  });

  it('spend and run count are ledger-derived: every recorded call counts, no separate counter to drift', () => {
    const { paths } = tempProject({});
    writeConfigOverride(paths, { budget: { runs: 2 } });
    recordSpend(paths, 0, T + 1000);
    recordSpend(paths, 0, T + 2000);
    const gate = checkBudget(loadBudget(paths, T + 3000).state);
    // the run cap alone tripped (the $ cap has room), so the hint names only budget.runs.
    expect(gate).toEqual({
      ok: false,
      message: '✖ budget: cap reached ($0.00 of $5.00 · 2 of 2 runs) → ask the owner to raise budget.runs in .mm3/config.yaml, then run mm3 config --load\n→ see: mm3 agent budget',
    });
  });

  it('blocks on spend and names budget.usd; a budget.since in the config starts a fresh window with the same caps [C-133]', () => {
    const { paths } = tempProject({});
    writeConfigOverride(paths, { budget: { usd: 1 } });
    recordSpend(paths, 1.2, T + 1000);
    expect(checkBudget(loadBudget(paths, T + 2000).state)).toEqual({
      ok: false,
      message: '✖ budget: cap reached ($1.20 of $1.00 · 1 of 500 runs) → ask the owner to raise budget.usd in .mm3/config.yaml, then run mm3 config --load\n→ see: mm3 agent budget',
    });
    // a later `since` in the config moves the window well past the spend above — the ledger line itself is untouched
    // (never erased), only excluded from the window going forward.
    writeConfigOverride(paths, { budget: { since: '2026-09-25T00:01:00Z' } });
    const fresh = loadBudget(paths, T + 60_000).state;
    expect(fresh).toMatchObject({ capUsd: 1, capRuns: 500, spentUsd: 0, runs: 0 });
    expect(checkBudget(fresh).ok).toBe(true);
    // the old spend is still there, unharmed — a wider `per: total` window before `since` would still see it.
    expect(resolveConfig(paths).config.budget.since).toBe('2026-09-25T00:01:00Z');
  });

  it('both caps reached: names both keys, the same fix the low-budget warning gives [C-133]', () => {
    const { paths } = tempProject({});
    writeConfigOverride(paths, { budget: { usd: 1, runs: 1 } });
    recordSpend(paths, 1.2, T + 1000);
    expect(checkBudget(loadBudget(paths, T + 2000).state)).toEqual({
      ok: false,
      message: '✖ budget: cap reached ($1.20 of $1.00 · 1 of 1 runs) → ask the owner to raise budget.usd and budget.runs in .mm3/config.yaml, then run mm3 config --load\n→ see: mm3 agent budget',
    });
  });

  it('migrates a legacy budget.json into config.yaml once, then never trusts it again', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.budget, JSON.stringify({ capUsd: 2, capRuns: 20, spentUsd: 999, runs: 999, resetAt: '2020-01-01T00:00:00Z' }));
    const first = loadBudget(paths, T);
    expect(first.created).toBe(true);
    // caps and `since` came from the legacy file; spent/runs come from the (empty) ledger, never the stale counters.
    expect(first.state).toEqual({ capUsd: 2, capRuns: 20, spentUsd: 0, runs: 0, resetAt: '2020-01-01T00:00:00Z', warnAt: 0.8 });
    expect(resolveConfig(paths).config.budget).toMatchObject({ usd: 2, runs: 20, since: '2020-01-01T00:00:00Z' });
    // second call: config.yaml already has budget.since — no re-migration, never touches budget.json again.
    writeFileSync(paths.budget, '{ now corrupt, never read again');
    expect(loadBudget(paths, T + 1000).created).toBe(false);
    expect(loadBudget(paths, T + 1000).state.capUsd).toBe(2);
  });

  it('a corrupt legacy budget.json blocks nothing: config.yaml (defaults) wins instead', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.budget, '{ nope');
    const { state, created } = loadBudget(paths, T);
    expect(created).toBe(false);
    expect(state).toMatchObject({ capUsd: 5, capRuns: 500, spentUsd: 0, runs: 0 });
    expect(peekBudget(paths, T)).toMatchObject({ capUsd: 5, capRuns: 500 });
  });

  it('a write into the starter file: an empty `budget:` section (every key commented out) takes the new cap and keeps the comments', () => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.config, '# MM3 project settings\n\nbudget:  # spending caps\n#   usd: 5  # dollars MM3 may spend\n\n# provider: typesafe\n');
    writeConfigOverride(paths, { budget: { usd: 3 } });
    expect(resolveConfig(paths, {}).config.budget.usd).toBe(3);
    const text = readFileSync(paths.config, 'utf8');
    expect(text).toContain('# MM3 project settings');
    expect(text).toContain('# provider: typesafe');
  });

  it('per: day/hour additionally floors the window to the start of the current UTC day/hour', () => {
    const { paths } = tempProject({});
    writeConfigOverride(paths, { budget: { usd: 5, per: 'day' } });
    expect(resolveConfig(paths).config.budget.per).toBe('day');
    const dayStart = Date.UTC(2026, 8, 25); // 2026-09-25T00:00:00Z
    recordSpend(paths, 1, dayStart - 1000); // just before today: excluded from a `per: day` window
    recordSpend(paths, 2, dayStart + 1000); // today: included
    const state = loadBudget(paths, dayStart + 5000).state;
    expect(state).toMatchObject({ spentUsd: 2, runs: 1 });
  });

  // [C-229] The line states headroom (what is left), and warns only at >= 80% used, naming the cap that is low.
  it('[C-229] the budget line states what is left, and warns only from 80% used', () => {
    const base = { capUsd: 5, capRuns: 100, spentUsd: 0, resetAt: 'x' };
    expect(budgetLine({ ...base, runs: 12 })).toBe('budget: $5.00 left of $5.00 · 88 of 100 runs left');
    expect(budgetLine({ ...base, runs: 76 })).toBe('budget: $5.00 left of $5.00 · 24 of 100 runs left');
    expect(budgetLine({ capUsd: 0.12, capRuns: 30, spentUsd: 0.01, runs: 3, resetAt: 'x' })).toBe('budget: $0.11 left of $0.12 · 27 of 30 runs left');
    expect(budgetLine({ ...base, runs: 80 })).toBe('⚠ budget: $5.00 left of $5.00 · 20 of 100 runs left → low: ask the owner to raise budget.runs in .mm3/config.yaml, then run mm3 config --load');
    expect(budgetLine({ ...base, spentUsd: 4.5, runs: 10 })).toBe('⚠ budget: $0.50 left of $5.00 · 90 of 100 runs left → low: ask the owner to raise budget.usd in .mm3/config.yaml, then run mm3 config --load');
    expect(budgetLine({ ...base, spentUsd: 5, runs: 100 })).toBe('⚠ budget: $0.00 left of $5.00 · 0 of 100 runs left → low: ask the owner to raise budget.usd and budget.runs in .mm3/config.yaml, then run mm3 config --load');
    // an overshot cap says how much was used, never a bare "0 left"; the warning and the stop give the same command
    expect(budgetLine({ ...base, capRuns: 3, runs: 5 })).toBe('⚠ budget: $5.00 left of $5.00 · 0 of 3 runs left (5 used) → low: ask the owner to raise budget.runs in .mm3/config.yaml, then run mm3 config --load');
    expect(budgetLine({ ...base, spentUsd: 5.5, runs: 10 })).toBe('⚠ budget: $0.00 left of $5.00 ($5.50 used) · 90 of 100 runs left → low: ask the owner to raise budget.usd in .mm3/config.yaml, then run mm3 config --load');
    expect(budgetLine({ ...base, capRuns: 3, runs: 3 })).toBe('⚠ budget: $5.00 left of $5.00 · 0 of 3 runs left → low: ask the owner to raise budget.runs in .mm3/config.yaml, then run mm3 config --load');
    // sub-cent spend is never hidden: nine real runs at ~$0.0003 each must not read as "$5.00 left of $5.00"
    expect(budgetLine({ ...base, spentUsd: 0.0024, runs: 9 })).toBe('budget: $4.998 left of $5.00 · 91 of 100 runs left');
    expect(budgetLine({ ...base, spentUsd: 0.00000123, runs: 1 })).toBe('budget: $4.999999 left of $5.00 · 99 of 100 runs left');
    expect(budgetLine({ capUsd: 0.12, capRuns: 30, spentUsd: 0.004, runs: 1, resetAt: 'x' })).toBe('budget: $0.116 left of $0.12 · 29 of 30 runs left');
    for (const st of [{ ...base, capRuns: 3, runs: 3 }, { ...base, spentUsd: 5, runs: 10 }, { ...base, spentUsd: 5, capRuns: 10, runs: 10 }]) {
      const stop = checkBudget(st);
      expect(stop.ok ? '' : stop.message).toContain(/ask the owner to [^\n]*$/.exec(budgetLine(st))![0]);
    }
  });
});

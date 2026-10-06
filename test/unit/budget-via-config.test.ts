// The budget has one place to change it, the config: `mm3 budget` shows the count and says how to change it,
// `budget set` and `budget reset` are gone (a stop that points at config.yaml), a warning or a cap stop names the
// same fix, and loading a config whose budget changed restarts the count.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { budgetLine, checkBudget, loadBudget, recordSpend } from '../../src/budget/budget.ts';
import { runCli, type CliCtx } from '../../src/cli.ts';
import { tempProject } from '../helpers/project.ts';

function ctxFor(root: string): CliCtx {
  return {
    env: { MM3_PROVIDER: 'fake', MM3_HOME: root },
    cwd: root,
    platform: process.platform,
    runner: () => ({ status: 1, stdout: '', stderr: 'not used' }),
    packageDir: process.cwd(),
    pkg: { name: '@mvpscale/mm3', version: '9.9.9-test' },
    homeDir: '/nonexistent-home',
    nodeVersion: process.version,
    stdin: () => Buffer.from(''),
    io: { input: new PassThrough(), output: new PassThrough() },
  };
}
const mm3 = (root: string, argv: string[]): Promise<{ exit: number; text: string }> => runCli(argv, ctxFor(root));
const configPath = (root: string): string => path.join(root, '.mm3', 'config.yaml');
const write = (root: string, text: string): void => {
  mkdirSync(path.join(root, '.mm3'), { recursive: true });
  writeFileSync(configPath(root), text);
};
const T = Date.parse('2026-09-25T00:00:00Z');
const HOW = 'raise budget.runs in .mm3/config.yaml, then run mm3 config --load';

describe('mm3 budget shows the count and how to change it', () => {
  it('[C-251] prints the budget line, then the way to change it through the config', async () => {
    const { root } = tempProject();
    const r = await mm3(root, ['budget']);
    expect(r.exit).toBe(0);
    expect(r.text.trimEnd().split('\n')).toEqual([
      'budget: $5.00 left of $5.00 · 500 of 500 runs left',
      '→ to change it: edit budget.usd / budget.runs in .mm3/config.yaml, then run mm3 config --load',
    ]);
  });

  it('[C-251] a low budget carries its own fix in the warning, so no second hint line repeats it', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  runs: 10\n');
    await mm3(root, ['config', '--load']);
    for (let i = 0; i < 9; i++) recordSpend(paths, 0, Date.now());
    const r = await mm3(root, ['budget']);
    expect(r.text).toContain('⚠ budget:');
    expect(r.text).toContain(`ask the owner to ${HOW}`);
    expect(r.text).not.toContain('→ to change it');
  });
});

describe('a cap stop and a low warning name the same fix', () => {
  const base = { capUsd: 5, capRuns: 100, spentUsd: 0, runs: 0, resetAt: '1970-01-01T00:00:00Z', warnAt: 0.8 };

  it('[C-133] the run cap tripped: raise budget.runs', () => {
    const stop = checkBudget({ ...base, capRuns: 2, runs: 2 });
    expect(stop).toEqual({
      ok: false,
      message: `✖ budget: cap reached ($0.00 of $5.00 · 2 of 2 runs) → ask the owner to ${HOW}\n→ see: mm3 agent budget`,
    });
  });

  it('[C-133] the dollar cap tripped: raise budget.usd', () => {
    const stop = checkBudget({ ...base, capUsd: 1, spentUsd: 1.2, runs: 1 });
    expect(stop.ok ? '' : stop.message).toContain('ask the owner to raise budget.usd in .mm3/config.yaml, then run mm3 config --load');
  });

  it('[C-133] both tripped: raise both, in one sentence', () => {
    const stop = checkBudget({ ...base, capUsd: 1, spentUsd: 1.2, capRuns: 1, runs: 1 });
    expect(stop.ok ? '' : stop.message).toContain('ask the owner to raise budget.usd and budget.runs in .mm3/config.yaml, then run mm3 config --load');
  });

  it('[C-229] the warning says the same thing the stop will say', () => {
    const state = { ...base, runs: 80 };
    expect(budgetLine(state)).toBe(`⚠ budget: $5.00 left of $5.00 · 20 of 100 runs left → low: ask the owner to ${HOW}`);
    expect(checkBudget({ ...state, runs: 100 }).ok).toBe(false);
  });
});

describe('budget set and budget reset are gone', () => {
  it('[C-252] set is a stop that says where to go, and writes nothing', async () => {
    const { root } = tempProject();
    const r = await mm3(root, ['budget', 'set', '--usd', '9']);
    expect(r.exit).toBe(2);
    expect(r.text).toContain('✖ budget: set was removed → edit budget.usd / budget.runs in .mm3/config.yaml, then run mm3 config --load');
    expect(() => readFileSync(configPath(root), 'utf8')).toThrow(); // no config.yaml appeared
  });

  it('[C-252] reset is a stop that says how the count restarts, and writes nothing', async () => {
    const { root } = tempProject();
    write(root, 'budget:\n  usd: 2\n');
    const before = readFileSync(configPath(root), 'utf8');
    const r = await mm3(root, ['budget', 'reset']);
    expect(r.exit).toBe(2);
    expect(r.text).toContain('✖ budget: reset was removed → change budget.usd or budget.runs in .mm3/config.yaml and run mm3 config --load (a changed budget restarts the count), or set budget.since to now');
    expect(readFileSync(configPath(root), 'utf8')).toBe(before);
  });
});

describe('mm3 config --load restarts the count only when the budget changed', () => {
  const left = async (root: string): Promise<string> => /(\d+ of \d+ runs left)/.exec((await mm3(root, ['budget'])).text)![1]!;

  it('[C-253] new caps restart the count, and the load says so', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  runs: 5\n');
    await mm3(root, ['config', '--load']);
    for (let i = 0; i < 3; i++) recordSpend(paths, 0, Date.now() - 60_000);
    expect(await left(root)).toBe('2 of 5 runs left');
    write(root, 'budget:\n  runs: 10\n');
    const r = await mm3(root, ['config', '--load']);
    expect(r.exit).toBe(0);
    expect(r.text).toContain('count restarted');
    expect(await left(root)).toBe('10 of 10 runs left');
  });

  it('[C-253] the restarted count survives a later load that leaves the budget alone', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  runs: 5\n');
    await mm3(root, ['config', '--load']);
    for (let i = 0; i < 3; i++) recordSpend(paths, 0, Date.now() - 60_000);
    write(root, 'budget:\n  runs: 10\n');
    await mm3(root, ['config', '--load']); // restarts the count: the three runs above are before it
    write(root, 'budget:\n  runs: 10\ndepth:\n  class: [4, 6, 9]\n');
    const r = await mm3(root, ['config', '--load']); // other settings only
    expect(r.text).not.toContain('count restarted');
    expect(await left(root)).toBe('10 of 10 runs left'); // the old three do not come back
  });

  it('a load that changes only other settings keeps the count', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  runs: 5\n');
    await mm3(root, ['config', '--load']);
    for (let i = 0; i < 3; i++) recordSpend(paths, 0, Date.now());
    write(root, 'budget:\n  runs: 5\ndepth:\n  class: [4, 6, 9]\n');
    const r = await mm3(root, ['config', '--load']);
    expect(r.text).not.toContain('count restarted');
    expect(await left(root)).toBe('2 of 5 runs left');
  });

  it('changing only the warning level keeps the count', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  runs: 5\n');
    await mm3(root, ['config', '--load']);
    recordSpend(paths, 0, Date.now());
    write(root, 'budget:\n  runs: 5\n  warnAt: 0.5\n');
    await mm3(root, ['config', '--load']);
    expect(await left(root)).toBe('4 of 5 runs left');
  });

  it('[C-253] the first load of a project never restarts what was already spent', async () => {
    const { root, paths } = tempProject();
    for (let i = 0; i < 3; i++) recordSpend(paths, 0, Date.now());
    write(root, 'budget:\n  runs: 5\n');
    const r = await mm3(root, ['config', '--load']);
    expect(r.text).not.toContain('count restarted');
    expect(await left(root)).toBe('2 of 5 runs left');
  });

  it('[C-253] a budget.since written in the file wins over the automatic restart', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  runs: 5\n');
    await mm3(root, ['config', '--load']);
    for (let i = 0; i < 3; i++) recordSpend(paths, 0, T + i);
    write(root, 'budget:\n  runs: 10\n  since: 2026-01-01T00:00:00Z\n');
    const r = await mm3(root, ['config', '--load']);
    expect(r.text).not.toContain('count restarted');
    expect(loadBudget(paths, T + 10).state.resetAt).toBe('2026-01-01T00:00:00Z');
  });

  it('[C-253] changing only the window kind (per) restarts the count', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  runs: 5\n');
    await mm3(root, ['config', '--load']);
    for (let i = 0; i < 2; i++) recordSpend(paths, 0, Date.now() - 60_000);
    expect(await left(root)).toBe('3 of 5 runs left');
    write(root, 'budget:\n  runs: 5\n  per: day\n');
    const r = await mm3(root, ['config', '--load']);
    expect(r.text).toContain('count restarted');
    expect(await left(root)).toBe('5 of 5 runs left');
  });

  it('[C-253] loading a file by name restarts like any load', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  runs: 5\n');
    await mm3(root, ['config', '--load']);
    for (let i = 0; i < 2; i++) recordSpend(paths, 0, Date.now() - 60_000);
    writeFileSync(path.join(root, 'other.yaml'), 'budget:\n  runs: 10\n');
    const r = await mm3(root, ['config', '--load', 'other.yaml']);
    expect(r.text).toContain('count restarted');
    expect(await left(root)).toBe('10 of 10 runs left');
  });

  it('[C-253] never rewrites the file the owner wrote', async () => {
    const { root } = tempProject();
    write(root, '# my caps\nbudget:\n  runs: 5\n');
    await mm3(root, ['config', '--load']);
    write(root, '# my caps\nbudget:\n  runs: 10\n');
    const before = readFileSync(configPath(root), 'utf8');
    await mm3(root, ['config', '--load']);
    expect(readFileSync(configPath(root), 'utf8')).toBe(before);
  });
});

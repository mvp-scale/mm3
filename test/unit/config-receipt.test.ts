// config.yaml is the config, read on every request: nothing is loaded into memory or copied to a second file.
// `mm3 config --load` checks the file and appends a receipt to the ledger (when, the file's hash, the settings, what
// changed since the previous receipt); `mm3 config` and `mm3 doctor` compare the file with the latest receipt.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runCli, type CliCtx } from '../../src/cli.ts';
import { latestConfigRecord } from '../../src/ledger/index.ts';
import { readLedger } from '../../src/ledger/log.ts';
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
const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const files = (root: string): string[] => (existsSync(path.join(root, '.mm3')) ? readdirSync(path.join(root, '.mm3')).sort() : []);

describe('mm3 config --load leaves a receipt in the ledger', () => {
  it('[C-242] appends one config record: the file\'s hash, its settings, what changed from the defaults', async () => {
    const { root, paths } = tempProject();
    const text = '# my caps\nbudget:\n  runs: 5\n';
    write(root, text);
    const r = await mm3(root, ['config', '--load']);
    expect(r.exit).toBe(0);
    expect(r.text).toContain('✔ valid · loaded');
    expect(r.text).toContain('budget.runs: 500 → 5');
    const records = readLedger(paths).filter((x) => x.kind === 'config');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: 'config', fingerprint: sha(text), settings: { budget: { runs: 5 } }, changes: ['budget.runs: 500 → 5'] });
  });

  it('[C-242] a second load lists what changed since the previous receipt, not since the defaults', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  runs: 5\n');
    await mm3(root, ['config', '--load']);
    write(root, 'budget:\n  runs: 9\n');
    const r = await mm3(root, ['config', '--load']);
    expect(r.text).toContain('budget.runs: 5 → 9');
    expect(r.text).not.toContain('500 → 9');
    expect(latestConfigRecord(paths)?.changes).toEqual(['budget.runs: 5 → 9']);
    expect(readLedger(paths).filter((x) => x.kind === 'config')).toHaveLength(2);
  });

  it('[C-242] a setting taken out of the file shows as going back to its default', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  runs: 5\ndepth:\n  class: [4, 6, 9]\n');
    await mm3(root, ['config', '--load']);
    write(root, 'budget:\n  runs: 5\n');
    await mm3(root, ['config', '--load']);
    expect(latestConfigRecord(paths)?.changes).toEqual(['depth.class: [4, 6, 9] → [3, 6, 9]']);
  });

  it('[C-245] writes nothing but the ledger line: no config.active.json, and the file is untouched', async () => {
    const { root } = tempProject();
    const text = '# keep me\nbudget:\n  runs: 5\n';
    write(root, text);
    await mm3(root, ['config', '--load']);
    expect(files(root)).not.toContain('config.active.json');
    expect(readFileSync(configPath(root), 'utf8')).toBe(text);
  });

  it('[C-243] a file with a problem prints every problem, exits 2, and records nothing', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  usd: -5\n');
    const r = await mm3(root, ['config', '--load']);
    expect(r.exit).toBe(2);
    expect(r.text).toContain('✖ config.budget.usd: -5 is not a positive number');
    expect(readLedger(paths).filter((x) => x.kind === 'config')).toHaveLength(0);
  });
});

describe('every request reads config.yaml itself', () => {
  const runs = async (root: string): Promise<string> => /(\d+ of \d+ runs left)/.exec((await mm3(root, ['budget'])).text)![1]!;

  it('[C-245] an edit applies at once, loaded or not', async () => {
    const { root } = tempProject();
    write(root, 'budget:\n  runs: 7\n');
    expect(await runs(root)).toBe('7 of 7 runs left');
    write(root, 'budget:\n  runs: 9\n');
    expect(await runs(root)).toBe('9 of 9 runs left');
  });

  it('[C-245] deleting the file returns to the defaults at once, even after a load', async () => {
    const { root } = tempProject();
    write(root, 'budget:\n  runs: 7\n');
    await mm3(root, ['config', '--load']);
    rmSync(configPath(root));
    expect(await runs(root)).toBe('500 of 500 runs left');
  });

  it('[C-247] a file with a problem stops a paid run with the fix, and spends nothing', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  usd: -5\n');
    writeFileSync(path.join(root, 'req.yaml'), readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8'));
    const r = await mm3(root, ['class', 'req.yaml']);
    expect(r.exit).toBe(2);
    expect(r.text).toContain('✖ config.budget.usd: -5 is not a positive number');
    expect(r.text).toContain('paid runs stop until .mm3/config.yaml is fixed → fix it, then run mm3 config --load');
    expect(readLedger(paths).filter((x) => x.kind === 'run')).toHaveLength(0);
  });

  it('[C-247] a read-only command still answers on a file with a problem (the bad setting reads as its default)', async () => {
    const { root } = tempProject();
    write(root, 'budget:\n  usd: -5\n');
    const r = await mm3(root, ['budget']);
    expect(r.exit).toBe(0);
    expect(r.text).toContain('$5.00 left of $5.00');
  });
});

describe('mm3 config says where the file stands against the latest receipt', () => {
  const status = async (root: string): Promise<string> => (await mm3(root, ['config'])).text + (await mm3(root, ['doctor'])).text;

  it('[C-246] no file and no receipt: the defaults', async () => {
    const { root } = tempProject();
    expect(await status(root)).toContain('config: defaults');
  });

  it('[C-246] the file matches the latest receipt: loaded, with the time', async () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  runs: 5\n');
    await mm3(root, ['config', '--load']);
    expect(await status(root)).toContain(`config: loaded ${latestConfigRecord(paths)!.ts}`);
  });

  it('[C-246] the file differs from the latest receipt (or has none): in effect now, not recorded', async () => {
    const { root } = tempProject();
    write(root, 'budget:\n  runs: 5\n');
    expect(await status(root)).toContain('⚠ config.yaml is in effect but its latest change is not recorded → mm3 config --load');
    await mm3(root, ['config', '--load']);
    write(root, 'budget:\n  runs: 9\n');
    expect(await status(root)).toContain('⚠ config.yaml is in effect but its latest change is not recorded → mm3 config --load');
  });

  it('[C-246] the file is gone but a load was recorded: the defaults apply, and it says so', async () => {
    const { root } = tempProject();
    write(root, 'budget:\n  runs: 5\n');
    await mm3(root, ['config', '--load']);
    rmSync(configPath(root));
    expect(await status(root)).toContain('⚠ config.yaml is gone (last loaded');
  });

  it('[C-247] a file with a problem: the problem, and that paid runs stop', async () => {
    const { root } = tempProject();
    write(root, 'budget:\n  usd: -5\n');
    expect(await status(root)).toContain('✖ config.yaml has a problem → fix it: paid runs stop until you do');
  });
});

describe('taking the file away is a load too [C-248]', () => {
  const setup = async () => {
    const t = tempProject();
    write(t.root, 'budget:\n  usd: 1\n  runs: 5\n');
    await mm3(t.root, ['config', '--load']);
    rmSync(configPath(t.root));
    return t;
  };

  it('[C-248] --load with the file gone records the defaults and says so', async () => {
    const { root, paths } = await setup();
    const r = await mm3(root, ['config', '--load']);
    expect(r.exit).toBe(0);
    expect(r.text).toContain('✔ no config.yaml · the defaults apply · recorded');
    expect(r.text).toContain('budget.runs: 5 → 500');
    expect(r.text).toContain('count restarted');
    expect(latestConfigRecord(paths)).toMatchObject({ absent: true, settings: {}, changes: expect.arrayContaining(['budget.usd: 1 → 5', 'budget.runs: 5 → 500']) });
  });

  it('[C-248] doctor and config then read as the defaults, with no warning left behind', async () => {
    const { root } = await setup();
    await mm3(root, ['config', '--load']);
    const text = (await mm3(root, ['doctor'])).text + (await mm3(root, ['config'])).text;
    expect(text).toContain('config: "✔ config: defaults"');
    expect(text).not.toContain('is gone');
  });

  it('[C-248] before the load, the warning says what to run', async () => {
    const { root } = await setup();
    expect((await mm3(root, ['doctor'])).text).toContain('⚠ config.yaml is gone (last loaded');
    expect((await mm3(root, ['doctor'])).text).toContain('run mm3 config --load to record the defaults');
  });

  it('[C-248] the agent card says how to return to the defaults', async () => {
    const { root } = tempProject();
    expect((await mm3(root, ['agent', 'config'])).text).toContain('to return to the defaults, delete .mm3/config.yaml, then run mm3 config --load');
  });
});

describe('what is gone', () => {
  it('[C-248] mm3 config --reset is no longer a flag', async () => {
    const { root } = tempProject();
    const r = await mm3(root, ['config', '--reset']);
    expect(r.exit).toBe(2);
    expect(r.text).toContain('unknown flag --reset');
  });

  it('no command creates config.active.json or agents-note-shown', async () => {
    const { root } = tempProject();
    write(root, 'budget:\n  runs: 5\n');
    writeFileSync(path.join(root, 'req.yaml'), readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8'));
    await mm3(root, ['config', '--load']);
    await mm3(root, ['class', 'req.yaml']);
    await mm3(root, ['doctor']);
    await mm3(root, ['budget']);
    expect(files(root)).not.toContain('config.active.json');
    expect(files(root)).not.toContain('agents-note-shown');
  });
});

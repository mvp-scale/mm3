// `mm3 config --load` and the owner flow around it: check the file, record a receipt in the ledger, and leave every request
// reading config.yaml itself. Bad files are refused, a file elsewhere is copied in verbatim, and the user's own file is
// never rewritten. [C-242] [C-243] [C-244] [C-245] [C-250]
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { runCli, type CliCtx } from '../../src/cli.ts';
import { nearMissNotes, runConfig, runConfigLoad } from '../../src/config/config.ts';
import { resolveConfig } from '../../src/config/load.ts';
import { writeConfigOverride } from '../../src/config/write.ts';
import { latestConfigRecord } from '../../src/ledger/index.ts';
import { pathsFor } from '../../src/ledger/paths.ts';
import { runDoctor } from '../../src/verbs/doctor.ts';
import { tempProject } from '../helpers/project.ts';

type Obj = Record<string, unknown>;
const tempPathsOf = (root: string) => pathsFor(root);

function ctxFor(root: string, extraEnv: Record<string, string> = {}, stdinText = ''): CliCtx {
  return {
    env: { MM3_PROVIDER: 'fake', MM3_HOME: root, ...extraEnv },
    cwd: root,
    platform: process.platform,
    runner: () => ({ status: 1, stdout: '', stderr: 'not used' }),
    packageDir: process.cwd(),
    pkg: { name: '@mvpscale/mm3', version: '9.9.9-test' },
    homeDir: '/nonexistent-home',
    nodeVersion: process.version,
    stdin: () => Buffer.from(stdinText),
    io: { input: new PassThrough(), output: new PassThrough() },
  };
}
const mm3 = (root: string, argv: string[], stdin = ''): Promise<{ exit: number; text: string }> => runCli(argv, ctxFor(root, {}, stdin));
const write = (root: string, text: string): void => {
  mkdirSync(path.join(root, '.mm3'), { recursive: true });
  writeFileSync(path.join(root, '.mm3', 'config.yaml'), text);
};

const concern = (from: number): Obj => ({ pass: 'no', [from]: 'Is a wrong?', [from + 1]: 'Is b wrong?', [from + 2]: 'Is c wrong?' });
const oneCategoryClass = (): string =>
  stringify({
    mak: {
      goal: 'The handler is safe to merge',
      depth: 'quick',
      where: ['src/user.ts'],
      ask: {
        concerns: { c1: concern(1) },
        decisions: { severity: { pass: ['none'], 4: { scale: 'How bad?', levels: ['none', 'high'] } }, route: { pass: ['ship'], 5: { choice: 'Where to?', options: ['ship', 'block'] } } },
      },
    },
  });


describe('mm3 config --load', () => {
  it('[C-242] a clean file is checked and recorded, and the one line says what changed from the defaults', async () => {
    const { root, paths } = tempProject();
    write(root, '# my notes\ndepth:\n  class: [15, 30, 45]\nbudget:\n  usd: 2\n  runs: 500\n');
    const r = await mm3(root, ['config', '--load']);
    expect(r.exit).toBe(0);
    expect(r.text.split('\n')[0]).toBe('✔ valid · loaded · 2 changed from the defaults'); // runs: 500 is the default, so it changes nothing
    expect(r.text).toContain('  depth.class: [3, 6, 9] → [15, 30, 45]');
    expect(r.text).toContain('  budget.usd: 5 → 2');
    expect(latestConfigRecord(paths)?.settings).toEqual({ depth: { class: [15, 30, 45] }, budget: { usd: 2, runs: 500 } });
  });

  it('never rewrites the user\'s own config.yaml: comments and all stay as typed', async () => {
    const { root } = tempProject();
    const text = '# keep me\nbudget:\n  usd: 2   # trailing\n';
    write(root, text);
    await mm3(root, ['config', '--load']);
    expect(readFileSync(path.join(root, '.mm3', 'config.yaml'), 'utf8')).toBe(text);
  });


  it('a file elsewhere is checked, then copied to .mm3/config.yaml verbatim, then loaded [C-244]', async () => {
    const { root } = tempProject();
    const other = path.join(root, 'team-config.yaml');
    const text = '# team settings\nbudget:\n  usd: 3  # shared cap\n';
    writeFileSync(other, text);
    const r = await mm3(root, ['config', '--load', 'team-config.yaml']);
    expect(r.exit).toBe(0);
    expect(r.text).toContain('budget.usd: 5 → 3');
    expect(r.text).toContain('copied team-config.yaml → .mm3/config.yaml');
    expect(readFileSync(path.join(root, '.mm3', 'config.yaml'), 'utf8')).toBe(text);
    expect(resolveConfig(tempPathsOf(root), {}).config.budget.usd).toBe(3);
  });

  it('a bad file elsewhere is refused before it can replace .mm3/config.yaml', async () => {
    const { root } = tempProject();
    write(root, 'budget:\n  usd: 2\n');
    await mm3(root, ['config', '--load']);
    writeFileSync(path.join(root, 'bad.yaml'), 'budget:\n  usd: nope\n');
    const r = await mm3(root, ['config', '--load', 'bad.yaml']);
    expect(r.exit).toBe(2);
    expect(readFileSync(path.join(root, '.mm3', 'config.yaml'), 'utf8')).toBe('budget:\n  usd: 2\n');
    expect((await mm3(root, ['config', '--load', 'missing.yaml'])).text).toBe('✖ config: cannot read "missing.yaml" → check the path\n→ see: mm3 agent config\n');
  });


  it('[C-248] with no config.yaml and no earlier load there is nothing to record, and it says how to get a starter', async () => {
    const { root, paths } = tempProject();
    const r = await mm3(root, ['config', '--load']);
    expect(r.exit).toBe(0);
    expect(r.text).toContain('✔ no config.yaml · the defaults already apply · nothing to record → mm3 config --write for a starter');
    expect(latestConfigRecord(paths)).toBeUndefined();
  });


  it('--load and --write together is a usage stop with the fix [C-242]', async () => {
    const { root } = tempProject();
    const r = await mm3(root, ['config', '--load', '--write']);
    expect(r.exit).toBe(2);
    expect(r.text).toContain('--load and --write cannot go together → run mm3 config --write first, edit the file, then mm3 config --load');
    expect(existsSync(path.join(root, '.mm3', 'config.yaml'))).toBe(false);
  });

  it('a file named without --load is an extra-argument stop', async () => {
    const { root } = tempProject();
    expect((await mm3(root, ['config', 'x.yaml'])).exit).toBe(2);
  });


  it('with no project it stops like --write does', () => {
    expect(runConfigLoad(undefined, undefined, '/', 'none').exit).toBe(2);
  });
});


describe('what stays true with no file at all', () => {
  it('[C-245] defaults, and doctor keeps its exact words', async () => {
    const { root, paths } = tempProject();
    expect(resolveConfig(paths, {}).present).toBe(false);
    expect(runDoctor({}, paths).text).toContain('config: "✔ config: defaults"');
    const shown = (await mm3(root, ['config'])).text;
    expect(shown).toContain('  - no config.yaml here → every value is a default or env var');
    expect(shown).not.toContain('config: loaded');
  });

  it('env-aware fields still label env over the file', async () => {
    const { root, paths } = tempProject();
    write(root, 'model: from-file\n');
    expect(resolveConfig(paths, {}).sources.model).toBe('config');
    expect(resolveConfig(paths, { JEV_MODEL: 'x' }).sources.model).toBe('env');
    await mm3(root, ['config', '--load']);
  });
});

describe('MM3\'s own config writes are live at once, and leave the file\'s comments alone', () => {
  it('[C-245] a write into an existing file keeps its comments and takes effect', () => {
    const { root, paths } = tempProject();
    write(root, '# caps\nbudget:\n  usd: 2\n');
    writeConfigOverride(paths, { budget: { usd: 7 } });
    expect(resolveConfig(paths, {}).config.budget.usd).toBe(7);
    expect(readFileSync(path.join(root, '.mm3', 'config.yaml'), 'utf8')).toContain('# caps');
  });

  it('a write into a fresh project creates the file', () => {
    const { paths } = tempProject();
    writeConfigOverride(paths, { budget: { since: '2026-01-01T00:00:00Z' } });
    expect(resolveConfig(paths, {}).config.budget.since).toBe('2026-01-01T00:00:00Z');
  });
});

describe('the whole owner flow: --write, edit, doctor says not recorded, --load, config shows it, a request uses it', () => {
  it('[C-245] goes through every step on the one project', async () => {
    const { root } = tempProject();
    expect((await mm3(root, ['config', '--write'])).exit).toBe(0);
    expect((await mm3(root, ['doctor'])).text).toContain('config: "✔ config: defaults"'); // the starter sets nothing

    const file = path.join(root, '.mm3', 'config.yaml');
    const edited = readFileSync(file, 'utf8').replace('#   class: [3, 6, 9]', '  class: [1, 2, 3]');
    expect(edited).not.toBe(readFileSync(file, 'utf8'));
    writeFileSync(file, edited);

    expect((await mm3(root, ['doctor'])).text).toContain('⚠ config.yaml is in effect but its latest change is not recorded → mm3 config --load');
    // the edit is live at once: the one-category request is accepted with no load
    expect((await mm3(root, ['class', '-', '--dry-run'], oneCategoryClass())).exit).toBe(0);

    const loaded = await mm3(root, ['config', '--load']);
    expect(loaded.text.split('\n')[0]).toBe('✔ valid · loaded · 1 changed from the defaults');
    expect(loaded.text).toContain('depth.class: [3, 6, 9] → [1, 2, 3]');
    expect((await mm3(root, ['config'])).text).toContain('    class: [1, 2, 3]  # from config.yaml · 3, 6, 9 questions');
    expect((await mm3(root, ['doctor'])).text).toContain('config: loaded');

    const ran = await mm3(root, ['class', '-'], oneCategoryClass());
    expect(ran.exit).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(edited); // the user's file, comments and all, was never rewritten
  });
});

describe('mm3 config plain display stays a read', () => {
  it('runConfig writes nothing: no receipt, no file', () => {
    const { root, paths } = tempProject();
    write(root, 'budget:\n  usd: 2\n');
    const r = runConfig({}, paths, '.');
    expect(r.text).toContain('⚠ config.yaml is in effect but its latest change is not recorded → mm3 config --load');
    expect(latestConfigRecord(paths)).toBeUndefined();
    expect(existsSync(path.join(root, '.mm3', 'config.active.json'))).toBe(false);
  });
});

describe('the near-miss note ignores a copy older MM3 left behind [C-250]', () => {
  it('config.active.json is no misnamed config, but config.ymal still is', async () => {
    const { root, paths } = tempProject();
    writeFileSync(path.join(root, 'x'), '');
    mkdirSync(path.join(root, '.mm3'), { recursive: true });
    writeFileSync(path.join(root, '.mm3', 'config.active.json'), '{}');
    for (const text of [(await mm3(root, ['config'])).text, runDoctor({}, paths).text]) {
      expect(text).not.toContain('did you mean config.yaml');
    }
    expect(nearMissNotes(paths)).toEqual([]);
    writeFileSync(path.join(root, '.mm3', 'config.active.json.123.abc.tmp'), 'x');
    expect(nearMissNotes(paths)).toEqual([]);
    writeFileSync(path.join(root, '.mm3', 'config.ymal'), 'budget:\n');
    expect(nearMissNotes(paths)).toEqual(['found .mm3/config.ymal — did you mean config.yaml? → rename it']);
    expect(runDoctor({}, paths).text).toContain('found .mm3/config.ymal — did you mean config.yaml? → rename it');
    rmSync(path.join(root, 'x'));
  });
});

// The owner's path end to end, through the built binary: `mm3 config` shows a display (not a file), `config --write`
// writes a starter, uncommenting one value keeps it valid, a second --write never overwrites, and a misnamed file
// is called out. [C-226] [C-227] [C-228]
import { existsSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mm3 } from '../../helpers/cli.ts';
import { tempProject } from '../../helpers/project.ts';

describe('mm3 config --write (owner path)', () => {
  it('[C-226] display points at --write; --write creates the file; the display then shows no stops', () => {
    const { root } = tempProject();
    const before = mm3(root, ['config']);
    expect(before.status).toBe(0);
    expect(before.stdout).toContain('to customize: run mm3 config --write → writes .mm3/config.yaml with a commented guide');

    const w = mm3(root, ['config', '--write']);
    expect(w.status).toBe(0);
    expect(w.stdout).toContain('wrote: .mm3/config.yaml');
    const file = path.join(root, '.mm3', 'config.yaml');
    expect(readFileSync(file, 'utf8')).toMatch(/^budget:/m);
    expect(readFileSync(path.join(root, '.mm3', '.gitignore'), 'utf8')).toContain('!config.yaml');

    const after = mm3(root, ['config']);
    expect(after.status).toBe(0);
    expect(after.stdout).not.toContain('✖');
    expect(after.stdout).toContain('customized in .mm3/config.yaml');
    expect(mm3(root, ['doctor']).stdout).toContain('✔ config: defaults'); // the starter sets nothing, so it reads as the defaults
  });

  it('[C-226] [C-227] uncommenting `usd: 1` shows it as from config.yaml; uncommenting `maxItems: 30` under sweep is valid', () => {
    const { root } = tempProject();
    mm3(root, ['config', '--write']);
    const file = path.join(root, '.mm3', 'config.yaml');
    const original = readFileSync(file, 'utf8');

    writeFileSync(file, original.replace('#   usd: 5', '  usd: 1'));
    expect(mm3(root, ['config', '--load']).status).toBe(0); // an edit takes effect once loaded
    const usd = mm3(root, ['config']);
    expect(usd.status).toBe(0);
    expect(usd.stdout).not.toContain('✖');
    expect(usd.stdout).toContain('usd: 1  # from config.yaml');

    writeFileSync(file, original.replace('#   maxItems: 30', '  maxItems: 30'));
    expect(mm3(root, ['config', '--load']).status).toBe(0); // an edit takes effect once loaded
    const sweep = mm3(root, ['config']);
    expect(sweep.status).toBe(0);
    expect(sweep.stdout).not.toContain('✖');
    expect(sweep.stdout).toContain('maxItems: 30  # from config.yaml');

    writeFileSync(file, original.replace('#     inputPerMTok: 0.042', '    inputPerMTok: 0.05'));
    expect(mm3(root, ['config', '--load']).status).toBe(0); // an edit takes effect once loaded
    const price = mm3(root, ['config']);
    expect(price.status).toBe(0);
    expect(price.stdout).not.toContain('✖');
    expect(price.stdout).toContain('inputPerMTok: 0.05  # from config.yaml');
  });

  it('[C-226] a second --write does not overwrite, says so, exits 0', () => {
    const { root } = tempProject();
    mm3(root, ['config', '--write']);
    const file = path.join(root, '.mm3', 'config.yaml');
    writeFileSync(file, 'budget:\n  usd: 2\n');
    const again = mm3(root, ['config', '--write']);
    expect(again.status).toBe(0);
    expect(again.stdout).toContain('.mm3/config.yaml already exists');
    expect(readFileSync(file, 'utf8')).toBe('budget:\n  usd: 2\n');
  });

  it('[C-226] no project: --write stops with a fix and creates nothing', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'mm3-no-project-'));
    const r = mm3(root, ['config', '--write'], { home: false });
    expect(r.status).toBe(2);
    expect(r.stdout + r.stderr).toMatch(/✖ config: no project here → /);
    expect(existsSync(path.join(root, '.mm3'))).toBe(false);
  });

  it('[C-228] a misnamed config file gets a did-you-mean note in config and doctor, then goes away once renamed', () => {
    const { root } = tempProject();
    mm3(root, ['config', '--write']);
    const dir = path.join(root, '.mm3');
    renameSync(path.join(dir, 'config.yaml'), path.join(dir, 'config.ymal'));
    const note = 'found .mm3/config.ymal — did you mean config.yaml? → rename it';
    expect(mm3(root, ['config']).stdout).toContain(note);
    expect(mm3(root, ['doctor']).stdout).toContain(note);
    renameSync(path.join(dir, 'config.ymal'), path.join(dir, 'config.yaml'));
    expect(mm3(root, ['config']).stdout).not.toContain('did you mean');
  });

  it('config takes no other flags: a usage stop names the new usage line', () => {
    const { root } = tempProject();
    const r = mm3(root, ['config', '--wrte']);
    expect(r.status).toBe(2);
    expect(r.stdout + r.stderr).toContain('mm3 config [--write | --load [file]]');
  });
});

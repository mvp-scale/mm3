// File patterns: *, **, ?, {a,b}; relative to the project; no symlinks, no generated folders; capped.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { expandGlob, globToRegExp } from '../../src/evidence/glob.ts';
import { tempProject } from '../helpers/project.ts';

describe('globToRegExp', () => {
  it.each([
    ['src/*.ts', 'src/a.ts', true],
    ['src/*.ts', 'src/x/a.ts', false],
    ['src/*.ts', 'src/a.tsx', false],
    ['src/**/*.ts', 'src/a.ts', true],
    ['src/**/*.ts', 'src/x/y/a.ts', true],
    ['**/*.{ts,js}', 'a.js', true],
    ['src/?.ts', 'src/ab.ts', false],
    ['src/a.ts', 'src/a.ts', true],
  ])('%s matches %s: %s', (pattern, file, want) => {
    expect(globToRegExp(pattern).test(file)).toBe(want);
  });
});

describe('expandGlob', () => {
  it('lists matching files in path order, skipping .git, node_modules, .mm3 and dist', () => {
    const { root } = tempProject({ 'src/b.ts': '', 'src/a.ts': '', 'src/x/c.ts': '', 'node_modules/m/i.ts': '', 'dist/d.ts': '', '.git/h.ts': '', 'src/a.md': '' });
    expect(expandGlob(root, 'src/**/*.ts')).toEqual({ files: ['src/a.ts', 'src/b.ts', 'src/x/c.ts'], truncated: false });
    expect(expandGlob(root, '**/*.ts').files).toEqual(['src/a.ts', 'src/b.ts', 'src/x/c.ts']);
    expect(expandGlob(root, './src/*.ts').files).toEqual(['src/a.ts', 'src/b.ts']);
    expect(expandGlob(root, 'nope/*.ts')).toEqual({ files: [], truncated: false });
  });

  it('never follows a symlink out of the project', (ctx) => {
    const { root } = tempProject({ 'src/a.ts': '' });
    const outside = mkdtempSync(path.join(os.tmpdir(), 'mm3-out-'));
    writeFileSync(path.join(outside, 'secret.ts'), 'x');
    try {
      symlinkSync(outside, path.join(root, 'src', 'linked'));
      symlinkSync(path.join(outside, 'secret.ts'), path.join(root, 'src', 'link.ts'));
    } catch {
      ctx.skip();
    }
    expect(expandGlob(root, 'src/**/*.ts').files).toEqual(['src/a.ts']);
  });

  it('stops at 500 files and says so', () => {
    const { root } = tempProject({});
    mkdirSync(path.join(root, 'many'));
    for (let i = 0; i < 505; i++) writeFileSync(path.join(root, 'many', `f${String(i).padStart(3, '0')}.ts`), '');
    const r = expandGlob(root, 'many/*.ts');
    expect(r.files).toHaveLength(500);
    expect(r.truncated).toBe(true);
  });

  it('rejects a pattern that tries to escape the project root, even when a matching file really exists there', () => {
    const { root } = tempProject({ 'src/a.ts': '' });
    // both patterns below resolve to the same sibling of root: root's parent plus the sibling's name.
    const sibling = `${path.basename(root)}-outside`; // unique per run: a fixed '/tmp/x' collides with any file already there
    const outside = path.join(path.dirname(root), sibling);
    mkdirSync(outside, { recursive: true });
    writeFileSync(path.join(outside, 'secret.ts'), 'x');
    try {
      expect(expandGlob(root, `../${sibling}/*.ts`)).toEqual({ files: [], truncated: false });
      expect(expandGlob(root, `src/../../${sibling}/*.ts`)).toEqual({ files: [], truncated: false });
      expect(expandGlob(root, path.join(outside, '*.ts'))).toEqual({ files: [], truncated: false });
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

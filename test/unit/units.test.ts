// Code units: the resolver scan (file → function → call) and drill (a stored unit → its calls) share.
import { chmodSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { expand } from '../../src/contract/layers.ts';
import { createCodeResolver, readUnit } from '../../src/evidence/units.ts';
import { tempProject } from '../helpers/project.ts';

// POSIX-only cases are skipped on Windows, each with its reason beside it (symlinks need a privilege there; chmod mode bits do not stop writes).
const WINDOWS = process.platform === 'win32';

const HANDLERS = readFileSync('test/fixtures/code/handlers.ts', 'utf8');

describe('createCodeResolver', () => {
  it('file: a glob becomes whole-file items, id = the relative path', () => {
    const { root } = tempProject({ 'src/handlers.ts': HANDLERS, 'src/other.js': 'const x = 1;\n' });
    const notes: string[] = [];
    const { items } = expand({ file: 'src/*.ts' }, { resolve: createCodeResolver(root, notes) });
    expect(items.map((i) => i.id)).toEqual(['src/handlers.ts']);
    expect(items[0]!.text).toBe(HANDLERS);
    expect(items[0]!.unit).toEqual({ path: 'src/handlers.ts', kind: 'file', name: 'src/handlers.ts', lines: `1-${HANDLERS.split('\n').length}` });
    expect(notes).toEqual([]);
  });

  it('file → function: ids join with "/"; lines are file-absolute (matches split.test.ts)', () => {
    const { root } = tempProject({ 'src/handlers.ts': HANDLERS });
    const { items } = expand({ file: 'src/handlers.ts', function: 'each' }, { resolve: createCodeResolver(root, []) });
    expect(items.filter((i) => i.layer === 'function').map((i) => [i.id, i.unit!.lines])).toEqual([
      ['src/handlers.ts/findUser', '5-9'],
      ['src/handlers.ts/getOrder', '11-15'],
      ['src/handlers.ts/double', '17-17'],
      ['src/handlers.ts/helper', '19-21'],
      ['src/handlers.ts/OrderService.constructor', '25-25'],
      ['src/handlers.ts/OrderService.listOrders', '26-29'],
      ['src/handlers.ts/OrderService.create', '30-30'],
      ['src/handlers.ts/default', '33-35'],
    ]);
  });

  it('function → call: the offset lands back on file-absolute lines, not the function\'s own', () => {
    const { root } = tempProject({ 'src/handlers.ts': HANDLERS });
    const { items } = expand({ file: 'src/handlers.ts', function: 'each', call: 'each' }, { resolve: createCodeResolver(root, []) });
    const calls = items.filter((i) => i.parent === 'src/handlers.ts/findUser');
    expect(calls.map((i) => [i.id, i.unit!.lines])).toEqual([['src/handlers.ts/findUser/db.query', '8-8']]);
    const listOrdersCalls = items.filter((i) => i.parent === 'src/handlers.ts/OrderService.listOrders');
    expect(listOrdersCalls.map((i) => i.id)).toEqual([
      'src/handlers.ts/OrderService.listOrders/this.db.all',
      'src/handlers.ts/OrderService.listOrders/log',
      'src/handlers.ts/OrderService.listOrders/this.cache.get',
    ]);
  });

  it.skipIf(process.getuid?.() === 0 || WINDOWS)('a file matching the pattern that can\'t be read is skipped, with a note; the rest still resolve', () => {
    const { root } = tempProject({ 'src/a.ts': 'export function f() {}\n', 'src/b.ts': 'export function g() {}\n' });
    const bPath = path.join(root, 'src/b.ts');
    chmodSync(bPath, 0o000); // real EACCES on read, with expandGlob's own walk still listing the file
    try {
      const notes: string[] = [];
      const { items } = expand({ file: 'src/*.ts' }, { resolve: createCodeResolver(root, notes) });
      expect(items.map((i) => i.id)).toEqual(['src/a.ts']);
      expect(notes).toEqual(['src/b.ts: could not read, skipped']);
    } finally {
      chmodSync(bPath, 0o644);
    }
  });

  it('a symlinked directory named in the pattern is not read, even though the walk itself follows it', (ctx) => {
    // expandGlob's own Dirent-type check skips a symlink found *while walking* a real directory (proven by
    // glob.test.ts's "never follows a symlink out of the project"). But when the symlink is itself the
    // pattern's static prefix (no wildcard before it), it's handed straight to readdirSync, which — unlike
    // a Dirent check on an entry — does follow it when opening a path. This is the second-order gap the
    // read-time realpath guard in readFiles defends against.
    const { root } = tempProject({ 'src/a.ts': 'export function f() {}\n' });
    const outside = mkdtempSync(path.join(os.tmpdir(), 'mm3-outside-'));
    writeFileSync(path.join(outside, 'secret.ts'), 'TOP SECRET\n');
    try {
      symlinkSync(outside, path.join(root, 'linked'));
    } catch {
      ctx.skip(); // no symlink support here
      return;
    }
    const notes: string[] = [];
    const { items } = expand({ file: 'linked/*.ts' }, { resolve: createCodeResolver(root, notes) });
    expect(items).toEqual([]);
    expect(notes).toEqual(['linked/secret.ts: could not read, skipped']);
  });
});

describe('readUnit', () => {
  it('kind file: the whole current file', () => {
    const { root } = tempProject({ 'src/handlers.ts': HANDLERS });
    expect(readUnit(root, { path: 'src/handlers.ts', kind: 'file', name: 'src/handlers.ts', lines: '1-35' })).toEqual({ ok: true, text: HANDLERS });
  });

  it('kind function: re-reads the stored range from the current file', () => {
    const { root } = tempProject({ 'src/handlers.ts': HANDLERS });
    const r = readUnit(root, { path: 'src/handlers.ts', kind: 'function', name: 'findUser', lines: '5-9' });
    expect(r.ok && r.text).toBe(HANDLERS.split('\n').slice(4, 9).join('\n'));
  });

  it('the code moved since the parent run: a clean error, never a throw', () => {
    const { root } = tempProject({ 'src/a.ts': 'x\n' });
    expect(readUnit(root, { path: 'src/gone.ts', kind: 'file', name: 'src/gone.ts', lines: '1-1' })).toEqual({ ok: false, error: 'cannot read "src/gone.ts"' });
    expect(readUnit(root, { path: 'src/a.ts', kind: 'function', name: 'f', lines: '5-9' })).toEqual({ ok: false, error: '"src/a.ts:5-9" is past the end of the file now' });
    expect(readUnit(root, { path: '../outside.ts', kind: 'file', name: 'x', lines: '1-1' })).toEqual({ ok: false, error: '"../outside.ts" is outside the project' });
  });

  it('a symlink inside the project pointing outside it: the outside error, not the outside file\'s contents', (ctx) => {
    const { root } = tempProject({ 'src/a.ts': 'x\n' });
    const outside = mkdtempSync(path.join(os.tmpdir(), 'mm3-outside-'));
    writeFileSync(path.join(outside, 'secret.ts'), 'TOP SECRET\n');
    try {
      symlinkSync(path.join(outside, 'secret.ts'), path.join(root, 'src', 'link.ts'));
    } catch {
      ctx.skip(); // no symlink support here
      return;
    }
    expect(readUnit(root, { path: 'src/link.ts', kind: 'file', name: 'src/link.ts', lines: '1-1' })).toEqual({
      ok: false,
      error: '"src/link.ts" is outside the project',
    });
  });

  it('a dangling symlink: the unreadable error, not a throw', (ctx) => {
    const { root } = tempProject({ 'src/a.ts': 'x\n' });
    try {
      symlinkSync(path.join(root, 'src', 'never-existed.ts'), path.join(root, 'src', 'dangling.ts'));
    } catch {
      ctx.skip(); // no symlink support here
      return;
    }
    expect(readUnit(root, { path: 'src/dangling.ts', kind: 'file', name: 'src/dangling.ts', lines: '1-1' })).toEqual({
      ok: false,
      error: 'cannot read "src/dangling.ts"',
    });
  });
});

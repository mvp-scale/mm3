// CLI-install detection: PATH resolution, self-spec (registry vs. local tarball), and npm-prefix writability —
// all pure filesystem checks or through the injectable Runner, never a real npm/shell call.
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectSelfSpec, findOnPath, isWritableDir, npmGlobalPrefix, type SelfSpec } from '../../../src/setup/npm-info.ts';
import type { RunResult, Runner } from '../../../src/setup/runner.ts';

// POSIX-only cases are skipped on Windows, each with its reason beside it (symlinks need a privilege there; chmod mode bits do not stop writes).
const WINDOWS = process.platform === 'win32';

describe('findOnPath', () => {
  it.skipIf(WINDOWS)('finds an existing file on PATH', () => { // skipped on Windows: a #!/bin/sh file with an exec bit is not a Windows program
    const dir = mkdtempSync(path.join(os.tmpdir(), 'mm3-path-'));
    const bin = path.join(dir, 'mm3');
    writeFileSync(bin, '#!/bin/sh\n');
    chmodSync(bin, 0o755);
    expect(findOnPath('mm3', { PATH: `/does/not/exist${path.delimiter}${dir}` }, 'linux')).toBe(bin);
  });

  it('undefined when nothing on PATH matches', () => {
    expect(findOnPath('mm3-nope-xyz', { PATH: '/does/not/exist' }, 'linux')).toBeUndefined();
  });

  it('on windows, tries each PATHEXT extension', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'mm3-path-'));
    const bin = path.join(dir, 'mm3.CMD');
    writeFileSync(bin, '@echo off\n');
    expect(findOnPath('mm3', { PATH: dir, PATHEXT: '.EXE;.CMD;.BAT' }, 'win32')).toBe(bin);
  });
});

describe('detectSelfSpec', () => {
  const pkg = { name: '@mvpscale/mm3', version: '0.0.0' };
  const packageDir = path.join('/fake', 'node_modules', '@mvpscale', 'mm3');

  it('a lockfile entry resolved to file:... is a local tarball, resolved against the lockfile\'s own dir', () => {
    const lock = { packages: { 'node_modules/@mvpscale/mm3': { resolved: 'file:packages/mm3-0.0.0.tgz' } } };
    const readFile = (f: string): string => {
      expect(f).toBe(path.join('/fake', 'package-lock.json'));
      return JSON.stringify(lock);
    };
    const result: SelfSpec = detectSelfSpec(packageDir, pkg, readFile);
    expect(result).toEqual({ spec: path.join('/fake', 'packages', 'mm3-0.0.0.tgz'), kind: 'tarball' });
  });

  it('a registry-resolved entry (or no matching entry, or no lockfile) is the registry spec', () => {
    const registrySpec: SelfSpec = { spec: '@mvpscale/mm3@0.0.0', kind: 'registry' };
    const httpsLock = JSON.stringify({ packages: { 'node_modules/@mvpscale/mm3': { resolved: 'https://registry.npmjs.org/@mvpscale/mm3/-/mm3-0.0.0.tgz' } } });
    expect(detectSelfSpec(packageDir, pkg, () => httpsLock)).toEqual(registrySpec);
    expect(
      detectSelfSpec(packageDir, pkg, () => {
        throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
      }),
    ).toEqual(registrySpec);
  });

  it('no node_modules ancestor at all (running straight from source): the registry spec', () => {
    expect(detectSelfSpec('/opt/dev/mm3/src/setup', { name: '@mvpscale/mm3', version: '0.0.0' })).toEqual({
      spec: '@mvpscale/mm3@0.0.0',
      kind: 'registry',
    });
  });
});

describe('isWritableDir', () => {
  it('an existing writable directory is writable', () => {
    expect(isWritableDir(os.tmpdir())).toBe(true);
  });

  it('a path that does not exist yet is judged by its nearest existing ancestor', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'mm3-writable-'));
    expect(isWritableDir(path.join(dir, 'lib', 'node_modules'))).toBe(true);
  });

  it.skipIf(WINDOWS)('a directory with no write permission is not writable', () => {
    if (process.getuid && process.getuid() === 0) return; // root ignores mode bits; skip under root (e.g. some CI)
    const dir = mkdtempSync(path.join(os.tmpdir(), 'mm3-readonly-'));
    const locked = path.join(dir, 'locked');
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    try {
      expect(isWritableDir(locked)).toBe(false);
    } finally {
      chmodSync(locked, 0o700);
    }
  });
});

describe('npmGlobalPrefix', () => {
  it('trims npm config get prefix\'s stdout', () => {
    const runner: Runner = (): RunResult => ({ status: 0, stdout: '/usr/local\n', stderr: '' });
    expect(npmGlobalPrefix(runner)).toBe('/usr/local');
  });

  it('undefined when npm itself fails to run', () => {
    const runner: Runner = (): RunResult => ({ status: 1, stdout: '', stderr: 'not found' });
    expect(npmGlobalPrefix(runner)).toBeUndefined();
  });
});

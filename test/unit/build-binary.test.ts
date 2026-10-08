// The standalone binary's build pins (scripts/build-binary.ts) and the embedded-file reader (src/util/embedded.ts):
// no network and no build here, so the pins are checked for shape only; the real build is `npm run build:binary`.
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cannotBuildHere, hostTarget, NODE_VERSION, seaConfig, shasumFor, TARGETS } from '../../scripts/build-binary.ts';
import { diffOffsets } from '../../scripts/check-binary-repro.ts';
import { isStandalone, readPackageFile } from '../../src/util/embedded.ts';

describe('standalone build pins', () => {
  it('each target pins a sha256 and names its archive after the pinned Node version', () => {
    for (const t of Object.values(TARGETS)) {
      expect(t.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(t.archive).toContain(`v${NODE_VERSION}-`);
    }
  });

  it('all six platforms are targets, named os-cpu, and only the macOS ones need a Mac', () => {
    expect(Object.keys(TARGETS).sort()).toEqual(['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win-arm64', 'win-x64']);
    for (const [name, t] of Object.entries(TARGETS)) {
      expect(t.archive).toContain(`-${name}.`);
      expect(t.exe).toBe(name.startsWith('win-') ? '.exe' : '');
      expect(Boolean(t.macho)).toBe(name.startsWith('darwin-'));
      expect(cannotBuildHere(name, 'linux') === undefined).toBe(!name.startsWith('darwin-'));
      expect(cannotBuildHere(name, 'darwin')).toBeUndefined();
    }
    expect(cannotBuildHere('linux-x64', 'win32')).toContain('Linux or macOS');
    expect(TARGETS['darwin-arm64']!.member).toBe(`node-v${NODE_VERSION}-darwin-arm64/bin/node`);
    expect(TARGETS['win-arm64']!.member).toBe(`node-v${NODE_VERSION}-win-arm64/node.exe`);
  });

  it('hostTarget maps this machine to the pinned Node that runs on it', () => {
    expect(hostTarget('linux', 'x64')).toBe('linux-x64');
    expect(hostTarget('linux', 'arm64')).toBe('linux-arm64');
    expect(hostTarget('darwin', 'arm64')).toBe('darwin-arm64');
    expect(hostTarget('darwin', 'x64')).toBe('darwin-x64');
    expect(hostTarget('linux', 'riscv64')).toBeUndefined();
  });

  it('shasumFor reads the hash of one archive out of a SHASUMS256.txt body', () => {
    const body = `${'a'.repeat(64)}  node-v1-linux-x64.tar.xz\n${'b'.repeat(64)}  node-v1-win-x64.zip\n`;
    expect(shasumFor(body, 'node-v1-win-x64.zip')).toBe('b'.repeat(64));
    expect(shasumFor(body, 'node-v1-darwin-x64.tar.gz')).toBeUndefined();
  });
});

describe('reproducible build helpers', () => {
  it('the SEA config names its files relative, so no machine or scratch path reaches the blob', () => {
    const c = JSON.parse(seaConfig('mm3.cjs', 'sea.blob')) as { main: string; output: string };
    expect(c.main).toBe('mm3.cjs');
    expect(c.output).toBe('sea.blob');
    expect(path.isAbsolute(c.main) || path.isAbsolute(c.output)).toBe(false);
  });

  it('diffOffsets reports where two files differ and counts a length mismatch', () => {
    expect(diffOffsets(Buffer.from('abcd'), Buffer.from('abcd'))).toEqual({ count: 0, first: [] });
    expect(diffOffsets(Buffer.from('abcd'), Buffer.from('aXcY'))).toEqual({ count: 2, first: [1, 3] });
    expect(diffOffsets(Buffer.from('ab'), Buffer.from('abcd')).count).toBe(2);
  });
});

describe('embedded package files', () => {
  it('outside the binary nothing is embedded and reads come from the package directory', () => {
    expect(isStandalone()).toBe(false);
    const dir = mkdtempSync(path.join(os.tmpdir(), 'mm3-embedded-'));
    writeFileSync(path.join(dir, 'a.txt'), 'from disk');
    expect(readPackageFile(dir, 'a.txt')).toBe('from disk');
    expect(() => readPackageFile(dir, 'missing.txt')).toThrow(/ENOENT/);
  });
});

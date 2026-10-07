// The standalone binary's build pins (scripts/build-binary.ts) and the embedded-file reader (src/util/embedded.ts):
// no network and no build here, so the pins are checked for shape only; the real build is `npm run build:binary`.
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NODE_VERSION, seaConfig, shasumFor, TARGETS } from '../../scripts/build-binary.ts';
import { diffOffsets } from '../../scripts/check-binary-repro.ts';
import { isStandalone, readPackageFile } from '../../src/util/embedded.ts';

describe('standalone build pins', () => {
  it('each target pins a sha256 and names its archive after the pinned Node version', () => {
    for (const t of Object.values(TARGETS)) {
      expect(t.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(t.archive).toContain(`v${NODE_VERSION}-`);
    }
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

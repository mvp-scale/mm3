// scripts/check-launcher.ts: the plugin launcher's pin file (launcher/checksums.json). Pure logic on fixture text; the real run is
// `npm run check:launcher`. The last test reads the COMMITTED file, so a version bump that forgot `npm run gen:checksums` fails `npm test`.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TARGETS } from '../../scripts/build-binary.ts';
import { ASSET_KEYS, assetKey, builtFiles, checksumsProblems, releaseBase, renderChecksums, repoSlug } from '../../scripts/check-launcher.ts';

const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const KEYS = Object.keys(ASSET_KEYS);
const fileOf = (k: string): string => `mm3-1.2.3-${k}${k.startsWith('win-') ? '.exe' : ''}`;
const hashOf = (k: string): string => (k === 'linux-x64' ? H1 : k === 'win-x64' ? H2 : k.length.toString(16).padStart(2, '0').repeat(32).slice(0, 64));
const assets = (keys: string[]): Record<string, { file: string; sha256: string; bytes: number }> => Object.fromEntries(keys.map((k) => [k, { file: fileOf(k), sha256: hashOf(k), bytes: 10 }]));
const pin = (keys: string[]): string => renderChecksums({ version: '1.2.3', base: releaseBase('mvp-scale/mm3', '1.2.3'), assets: assets(keys) });
const good = pin(KEYS);
const builtAll = Object.fromEntries(KEYS.map((k) => [fileOf(k), hashOf(k)]));

describe('launcher/checksums.json checks [C-286]', () => {
  it('[C-286] a correct file has no problems, is valid JSON, and is one asset per line (the sh launcher reads it with sed)', () => {
    expect(checksumsProblems(good, '1.2.3', 'mvp-scale/mm3')).toEqual([]);
    expect(JSON.parse(good).assets['win-x64'].file).toBe('mm3-1.2.3-win-x64.exe');
    expect(good.split('\n').filter((l) => /"(linux|win|darwin)-(x64|arm64)": \{/u.test(l))).toHaveLength(6);
  });

  it('[C-286] the pin must list all six builds; a partial file names the missing ones and the runner that builds each', () => {
    expect(KEYS.sort()).toEqual(Object.keys(TARGETS).sort()); // the build script and the pin file agree on the set
    const partial = checksumsProblems(pin(KEYS.filter((k) => !k.startsWith('darwin-'))), '1.2.3', 'mvp-scale/mm3').join('\n');
    expect(partial).toContain('no asset pinned for darwin-arm64 (built on macos-14), darwin-x64 (built on macos-15-intel)');
    expect(partial).not.toContain('linux-x64 (built');
    expect(checksumsProblems(pin([...KEYS, 'linux-riscv64']), '1.2.3', 'mvp-scale/mm3').join('\n')).toContain('"linux-riscv64" is not one of');
  });

  it('[C-286] a missing file, other-version file, wrong address or wrong file name each fail with a line that says how to fix it', () => {
    expect(checksumsProblems(undefined, '1.2.3', 'mvp-scale/mm3')[0]).toMatch(/^✖ launcher\/checksums\.json: missing → build all six \(npm run build:binary/u);
    expect(checksumsProblems(good, '1.2.4', 'mvp-scale/mm3').join('\n')).toContain('names version 1.2.3 but package.json says 1.2.4');
    expect(checksumsProblems(good, '1.2.3', 'someone/else').join('\n')).toContain('base is https://github.com/mvp-scale/mm3/releases/download/v1.2.3, expected https://github.com/someone/else/releases/download/v1.2.3');
    expect(checksumsProblems(good.replace('mm3-1.2.3-win-x64.exe', 'mm3-win.exe'), '1.2.3', 'mvp-scale/mm3').join('\n')).toContain('expected mm3-1.2.3-win-x64[.exe]');
    expect(checksumsProblems('{', '1.2.3', 'mvp-scale/mm3')[0]).toContain('not valid JSON');
  });

  it('[C-286] against a build: a different hash, a file the build lacks and a built file the pin lacks all fail', () => {
    const ok = builtAll;
    expect(checksumsProblems(good, '1.2.3', 'mvp-scale/mm3', ok)).toEqual([]);
    expect(checksumsProblems(good, '1.2.3', 'mvp-scale/mm3', { ...ok, 'mm3-1.2.3-linux-x64': 'c'.repeat(64) }).join('\n')).toContain('pins aaaaaaaaaaaa… but the built mm3-1.2.3-linux-x64 is cccccccccccc…');
    expect(checksumsProblems(good, '1.2.3', 'mvp-scale/mm3', { 'mm3-1.2.3-linux-x64': H1 }).join('\n')).toContain('which the build did not produce');
    expect(checksumsProblems(good, '1.2.3', 'mvp-scale/mm3', { ...ok, 'mm3-1.2.3-linux-riscv64': H1 }).join('\n')).toContain('the build produced mm3-1.2.3-linux-riscv64, which the file does not pin');
  });

  it('[C-286] the asset names and the address come from one rule: repo from package.json, mm3-<version>-<os>-<cpu>[.exe]', () => {
    expect(repoSlug('git+https://github.com/mvp-scale/mm3.git')).toBe('mvp-scale/mm3');
    expect(assetKey('mm3-1.2.3-linux-x64', '1.2.3')).toBe('linux-x64');
    expect(assetKey('mm3-1.2.3-win-x64.exe', '1.2.3')).toBe('win-x64');
    expect(assetKey('mm3-1.2.3-win-arm64.exe', '1.2.3')).toBe('win-arm64');
    expect(assetKey('mm3-1.2.3-darwin-arm64', '1.2.3')).toBe('darwin-arm64');
    expect(assetKey('mm3-1.2.3-darwin-x64', '1.2.3')).toBe('darwin-x64');
    expect(assetKey('mm3-1.2.3-linux-arm64', '1.2.3')).toBe('linux-arm64');
    expect(assetKey('mm3-1.2.3-win-x64.exe.sig', '1.2.3')).toBeUndefined();
    expect(assetKey('SHA256SUMS', '1.2.3')).toBeUndefined();
    expect(assetKey('mm3-1.2.30-linux-x64', '1.2.3')).toBeUndefined();
  });

  it('[C-286] builtFiles hashes the release assets of this version in a folder and ignores everything else', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'mm3-built-'));
    try {
      writeFileSync(path.join(dir, 'mm3-1.2.3-linux-x64'), 'hello');
      writeFileSync(path.join(dir, 'SHA256SUMS'), 'x');
      writeFileSync(path.join(dir, 'mm3-1.2.2-linux-x64'), 'old');
      const got = builtFiles(dir, '1.2.3');
      expect(Object.keys(got)).toEqual(['mm3-1.2.3-linux-x64']);
      expect(got['mm3-1.2.3-linux-x64']).toEqual({ file: 'mm3-1.2.3-linux-x64', sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824', bytes: 5 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('[C-286] the committed launcher/checksums.json names the version in package.json and this repository\'s release address', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; repository: { url: string } };
    const slug = repoSlug(pkg.repository.url)!;
    expect(checksumsProblems(readFileSync('launcher/checksums.json', 'utf8'), pkg.version, slug)).toEqual([]);
  });
});

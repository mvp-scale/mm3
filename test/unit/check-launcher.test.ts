// scripts/check-launcher.ts: the plugin launcher's pin file (launcher/checksums.json). Pure logic on fixture text; the real run is
// `npm run check:launcher`. The last test reads the COMMITTED file, so a version bump that forgot `npm run gen:checksums` fails `npm test`.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assetKey, builtFiles, checksumsProblems, releaseBase, renderChecksums, repoSlug } from '../../scripts/check-launcher.ts';

const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const good = renderChecksums({
  version: '1.2.3',
  base: releaseBase('mvp-scale/mm3', '1.2.3'),
  assets: { 'linux-x64': { file: 'mm3-1.2.3-linux-x64', sha256: H1, bytes: 10 }, 'win-x64': { file: 'mm3-1.2.3-win-x64.exe', sha256: H2, bytes: 20 } },
});

describe('launcher/checksums.json checks [C-286]', () => {
  it('[C-286] a correct file has no problems, is valid JSON, and is one asset per line (the sh launcher reads it with sed)', () => {
    expect(checksumsProblems(good, '1.2.3', 'mvp-scale/mm3')).toEqual([]);
    expect(JSON.parse(good).assets['win-x64'].file).toBe('mm3-1.2.3-win-x64.exe');
    expect(good.split('\n').filter((l) => /"(linux|win)-x64"/u.test(l))).toHaveLength(2);
  });

  it('[C-286] a missing file, other-version file, wrong address or wrong file name each fail with a line that says how to fix it', () => {
    expect(checksumsProblems(undefined, '1.2.3', 'mvp-scale/mm3')[0]).toMatch(/^✖ launcher\/checksums\.json: missing → run "npm run build:binary/u);
    expect(checksumsProblems(good, '1.2.4', 'mvp-scale/mm3').join('\n')).toContain('names version 1.2.3 but package.json says 1.2.4');
    expect(checksumsProblems(good, '1.2.3', 'someone/else').join('\n')).toContain('base is https://github.com/mvp-scale/mm3/releases/download/v1.2.3, expected https://github.com/someone/else/releases/download/v1.2.3');
    expect(checksumsProblems(good.replace('mm3-1.2.3-win-x64.exe', 'mm3-win.exe'), '1.2.3', 'mvp-scale/mm3').join('\n')).toContain('expected mm3-1.2.3-win-x64[.exe]');
    expect(checksumsProblems('{', '1.2.3', 'mvp-scale/mm3')[0]).toContain('not valid JSON');
  });

  it('[C-286] against a build: a different hash, a file the build lacks and a built file the pin lacks all fail', () => {
    const ok = { 'mm3-1.2.3-linux-x64': H1, 'mm3-1.2.3-win-x64.exe': H2 };
    expect(checksumsProblems(good, '1.2.3', 'mvp-scale/mm3', ok)).toEqual([]);
    expect(checksumsProblems(good, '1.2.3', 'mvp-scale/mm3', { ...ok, 'mm3-1.2.3-linux-x64': 'c'.repeat(64) }).join('\n')).toContain('pins aaaaaaaaaaaa… but the built mm3-1.2.3-linux-x64 is cccccccccccc…');
    expect(checksumsProblems(good, '1.2.3', 'mvp-scale/mm3', { 'mm3-1.2.3-linux-x64': H1 }).join('\n')).toContain('which the build did not produce');
    expect(checksumsProblems(good, '1.2.3', 'mvp-scale/mm3', { ...ok, 'mm3-1.2.3-darwin-arm64': H1 }).join('\n')).toContain('the build produced mm3-1.2.3-darwin-arm64, which the file does not pin');
  });

  it('[C-286] the asset names and the address come from one rule: repo from package.json, mm3-<version>-<os>-<cpu>[.exe]', () => {
    expect(repoSlug('git+https://github.com/mvp-scale/mm3.git')).toBe('mvp-scale/mm3');
    expect(assetKey('mm3-1.2.3-linux-x64', '1.2.3')).toBe('linux-x64');
    expect(assetKey('mm3-1.2.3-win-x64.exe', '1.2.3')).toBe('win-x64');
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

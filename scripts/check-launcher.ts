/**
 * The plugin launcher's pin file, launcher/checksums.json: which self-contained MM3 files the committed plugin may download,
 * and the sha256 of each. It is GENERATED, never edited by hand:
 *
 *   npm run gen:checksums [-- --from dist-binary]   writes launcher/checksums.json from the build's SHA256SUMS
 *   npm run check:launcher [-- --against dist-binary]   fails when the file is missing, malformed, names another version than
 *                                                   package.json, points at another address than this repo's GitHub Release for
 *                                                   that version, or (with --against) names a hash that is not the built file's
 *
 * The build is byte-reproducible (npm run check:binary-repro), so the hash of a version can be written BEFORE the release is
 * published: build on the release commit, run gen:checksums, commit the file. launcher/ is not embedded in the standalone, so
 * writing the file does not change the hashes it records. The standalone workflow runs `--against` while a version has no GitHub
 * Release yet (once it has one, the file pins the published assets and the current build is allowed to move on).
 *
 * The file must pin ALL six builds (ASSET_KEYS). The standalone workflow builds each on its own runner, so no one machine has all
 * six: its `pin` job downloads them together, runs `--against`, and on a mismatch prints the complete file to commit. A partial file
 * (say, only the four a Linux machine can build) fails here and names the keys it lacks and the runner that builds each.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const CHECKSUMS_FILE = 'launcher/checksums.json';
/** Every build the pin file must list (the keys of TARGETS in scripts/build-binary.ts; test/unit/check-launcher.test.ts keeps them equal), and the runner that builds each. */
export const ASSET_KEYS: Record<string, string> = {
  'linux-x64': 'ubuntu-24.04', 'linux-arm64': 'ubuntu-24.04', 'win-x64': 'ubuntu-24.04', 'win-arm64': 'ubuntu-24.04',
  'darwin-arm64': 'macos-14', 'darwin-x64': 'macos-15-intel',
};
export interface Asset { file: string; sha256: string; bytes: number }
export interface Checksums { version: string; base: string; assets: Record<string, Asset> }

/** `github.com/<owner>/<repo>` from package.json's repository.url (`git+https://github.com/mvp-scale/mm3.git`). */
export function repoSlug(repositoryUrl: string): string | undefined {
  return /github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/u.exec(repositoryUrl)?.[1];
}

/** The address every asset of `version` is served from: the GitHub Release for tag v<version>. */
export const releaseBase = (slug: string, version: string): string => `https://github.com/${slug}/releases/download/v${version}`;

/** The asset key (`linux-x64`) of a built file name `mm3-<version>-<key>[.exe]`, or undefined. */
export function assetKey(file: string, version: string): string | undefined {
  const m = new RegExp(`^mm3-${version.replace(/\./gu, '\\.')}-([a-z0-9]+-[a-z0-9]+)(?:\\.exe)?$`, 'u').exec(file);
  return m?.[1];
}

/** The file text: valid JSON, one asset per line, because the sh launcher reads it with sed. */
export function renderChecksums(c: Checksums): string {
  const keys = Object.keys(c.assets).sort();
  const lines = keys.map((k) => `    ${JSON.stringify(k)}: { "file": ${JSON.stringify(c.assets[k]!.file)}, "sha256": ${JSON.stringify(c.assets[k]!.sha256)}, "bytes": ${c.assets[k]!.bytes} }`);
  return `{\n  "version": ${JSON.stringify(c.version)},\n  "base": ${JSON.stringify(c.base)},\n  "assets": {\n${lines.join(',\n')}\n  }\n}\n`;
}

/** Everything wrong with a pin file, one help-first line each; empty when it is fine. `built` (file name -> sha256) adds the hash check. */
export function checksumsProblems(text: string | undefined, version: string, slug: string, built?: Record<string, string>): string[] {
  const fix = '→ build all six (npm run build:binary -- --target <key>; the macOS two only on a Mac), then "npm run gen:checksums", and commit the result; the standalone workflow\'s pin job prints the complete file';
  if (text === undefined) return [`✖ ${CHECKSUMS_FILE}: missing ${fix}`];
  let c: Checksums;
  try { c = JSON.parse(text) as Checksums; } catch { return [`✖ ${CHECKSUMS_FILE}: not valid JSON ${fix}`]; }
  const problems: string[] = [];
  if (c.version !== version) problems.push(`✖ ${CHECKSUMS_FILE}: names version ${String(c.version)} but package.json says ${version} ${fix}`);
  if (c.base !== releaseBase(slug, version)) problems.push(`✖ ${CHECKSUMS_FILE}: base is ${String(c.base)}, expected ${releaseBase(slug, version)} ${fix}`);
  const keys = Object.keys(c.assets ?? {});
  if (keys.length === 0) problems.push(`✖ ${CHECKSUMS_FILE}: lists no assets ${fix}`);
  const missing = Object.keys(ASSET_KEYS).filter((k) => !keys.includes(k));
  if (keys.length > 0 && missing.length > 0) problems.push(`✖ ${CHECKSUMS_FILE}: no asset pinned for ${missing.map((k) => `${k} (built on ${ASSET_KEYS[k]})`).join(', ')}; without it the launcher says "no self-contained MM3 build" there ${fix}`);
  for (const k of keys) if (!(k in ASSET_KEYS)) problems.push(`✖ ${CHECKSUMS_FILE}: "${k}" is not one of ${Object.keys(ASSET_KEYS).join(', ')} ${fix}`);
  for (const k of keys) {
    const a = c.assets[k]!;
    if (assetKey(a.file, version) !== k) problems.push(`✖ ${CHECKSUMS_FILE}: "${k}" names file ${a.file}, expected mm3-${version}-${k}[.exe] ${fix}`);
    if (!/^[0-9a-f]{64}$/u.test(a.sha256)) problems.push(`✖ ${CHECKSUMS_FILE}: "${k}" sha256 is not 64 hex characters ${fix}`);
    if (!Number.isInteger(a.bytes) || a.bytes <= 0) problems.push(`✖ ${CHECKSUMS_FILE}: "${k}" bytes is not a size ${fix}`);
    if (built) {
      if (built[a.file] === undefined) problems.push(`✖ ${CHECKSUMS_FILE}: "${k}" names ${a.file}, which the build did not produce ${fix}`);
      else if (built[a.file] !== a.sha256) problems.push(`✖ ${CHECKSUMS_FILE}: "${k}" pins ${a.sha256.slice(0, 12)}… but the built ${a.file} is ${built[a.file]!.slice(0, 12)}… ${fix}`);
    }
  }
  if (built) for (const f of Object.keys(built)) if (!keys.some((k) => c.assets[k]!.file === f)) problems.push(`✖ ${CHECKSUMS_FILE}: the build produced ${f}, which the file does not pin ${fix}`);
  return problems;
}

/** The built files in `dir`: name -> {sha256, bytes}, only names that are release assets of `version`. Hashes are computed, not read from SHA256SUMS. */
export function builtFiles(dir: string, version: string): Record<string, Asset> {
  const out: Record<string, Asset> = {};
  for (const f of existsSync(dir) ? readdirSync(dir).sort() : []) {
    if (assetKey(f, version) === undefined) continue;
    const p = path.join(dir, f);
    out[f] = { file: f, sha256: createHash('sha256').update(readFileSync(p)).digest('hex'), bytes: statSync(p).size };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; repository: { url: string } };
  const slug = repoSlug(pkg.repository.url);
  if (!slug) { console.error('✖ package.json: repository.url is not a GitHub address → set it to https://github.com/<owner>/<repo>'); process.exit(2); }
  const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
  if (process.argv[2] === 'write') {
    const dir = arg('--from') ?? 'dist-binary';
    const files = builtFiles(dir, pkg.version);
    if (Object.keys(files).length === 0) { console.error(`✖ ${dir}: no mm3-${pkg.version}-<os>-<cpu> files → run "npm run build:binary -- --target <key>" first (keys: ${Object.keys(ASSET_KEYS).join(', ')})`); process.exit(1); }
    const assets: Record<string, Asset> = {};
    for (const f of Object.values(files)) assets[assetKey(f.file, pkg.version)!] = f;
    writeFileSync(CHECKSUMS_FILE, renderChecksums({ version: pkg.version, base: releaseBase(slug, pkg.version), assets }));
    console.log(`wrote ${CHECKSUMS_FILE}: ${Object.keys(assets).join(', ')} for ${pkg.version}`);
    const lacking = Object.keys(ASSET_KEYS).filter((k) => !(k in assets));
    if (lacking.length > 0) console.log(`⚠ not in ${dir}: ${lacking.map((k) => `${k} (built on ${ASSET_KEYS[k]})`).join(', ')}; the file is incomplete and "npm run check:launcher" fails until they are added (the workflow's pin job has all six)`);
  } else {
    const dir = arg('--against');
    const built = dir ? Object.fromEntries(Object.values(builtFiles(dir, pkg.version)).map((f) => [f.file, f.sha256])) : undefined;
    const problems = checksumsProblems(existsSync(CHECKSUMS_FILE) ? readFileSync(CHECKSUMS_FILE, 'utf8') : undefined, pkg.version, slug, built);
    if (problems.length) { for (const p of problems) console.error(p); process.exit(1); }
    console.log(`launcher OK — ${CHECKSUMS_FILE} pins ${pkg.version}${dir ? ` and matches the files in ${dir}` : ''}`);
  }
}

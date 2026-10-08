/**
 * `npm run build:binary -- --target linux-x64|linux-arm64|win-x64|win-arm64|darwin-arm64|darwin-x64`: builds the standalone binary, one self-contained file
 * that carries its own pinned Node (and so its own SQLite) and MM3, so the user's Node stops mattering. It is
 * additive: the npm package and the plugin bundle are untouched. Recipe (lab/features/single-file-binary):
 * bundle src/cli.ts to CommonJS with esbuild (the templates, skills and plugin manifests embedded, `import.meta.url` mapped to the
 * executable), write a Node single-executable-application blob with the SAME pinned Node as the base binary,
 * and inject it into a copy of the target's official Node with postject. `--build-sea` does not exist on Node
 * 22 or 24, so postject is the method. Output goes to dist-binary/ (gitignored) with a SHA256SUMS file.
 * Needs the network for the Node download (cached under dist-binary/cache/) and for postject, which is
 * installed alone into a scratch folder and is never a dependency of this repo. Unsigned (macOS: ad-hoc signed, which Apple
 * silicon requires to run at all); real signing is separate.
 * Reproducible: two builds from the same commit are byte-identical (`npm run check:binary-repro` proves it).
 * Where each target builds: Linux and Windows targets on any Linux/macOS host (postject edits ELF and PE files anywhere);
 * macOS targets only on a Mac, because the Mach-O steps need Apple's `codesign` (the standalone workflow builds them on macos-14
 * and macos-15-intel). The blob is written by a Node of the pinned version that can run on the host (the Linux x64 one on a Linux x64
 * host, else the host's own); the blob holds no code cache or snapshot, so it is the same bytes whichever Node wrote it (blobSha256).
 */
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import * as esbuild from 'esbuild';

export const NODE_VERSION = '24.21.0';
export const POSTJECT_VERSION = '1.0.0-alpha.6';
/** The fixed fuse string every Node single-executable app carries (Node's own docs). */
const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
export const OUT_DIR = 'dist-binary';
/** Package folders embedded: the templates `mm3 template` reads, and the plugin manifests, skills and hook list `mm3 init`
 *  writes into the standalone's plugin folder. The hook script itself is embedded as CommonJS (see embeddedFiles). */
const EMBED_DIRS = ['skills', '.claude-plugin', 'hooks'];

export interface Target {
  /** Official Node download for the target, and the sha256 pinned for it (also checked against SHASUMS256.txt). */
  archive: string;
  sha256: string;
  /** Path of the node program inside the archive. */
  member: string;
  exe: string;
  /** macOS only: the Mach-O steps (segment name, signature removed before injection, ad-hoc signature after) need a Mac. */
  macho?: true;
}

/** One target from its platform and the archive's SHA256 line (SHASUMS256.txt of the pinned release; the build re-checks it). */
function nodeTarget(key: string, ext: 'tar.xz' | 'tar.gz' | 'zip', sha256: string): Target {
  const dir = `node-v${NODE_VERSION}-${key}`;
  const win = ext === 'zip';
  return { archive: `${dir}.${ext}`, sha256, member: win ? `${dir}/node.exe` : `${dir}/bin/node`, exe: win ? '.exe' : '', ...(key.startsWith('darwin-') ? { macho: true as const } : {}) };
}

// darwin uses .tar.gz: macOS's bsdtar always reads gzip; xz support depends on the system's libarchive.
export const TARGETS: Record<string, Target> = {
  'linux-x64': nodeTarget('linux-x64', 'tar.xz', 'fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6'),
  'linux-arm64': nodeTarget('linux-arm64', 'tar.xz', '6ad1325edbdb5649c379b75a237147a666c95d4f9ae8d340fef2d1575d289ad2'),
  'win-x64': nodeTarget('win-x64', 'zip', '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541'),
  'win-arm64': nodeTarget('win-arm64', 'zip', '8779b1bde1d39f8d420e3b57aa657b39891af434d3de44a919044cec06785921'),
  'darwin-arm64': nodeTarget('darwin-arm64', 'tar.gz', 'bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057'),
  'darwin-x64': nodeTarget('darwin-x64', 'tar.gz', '1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097'),
};

/** Why this machine cannot build `name`, or undefined when it can. */
export function cannotBuildHere(name: string, platform: string = process.platform): string | undefined {
  if (TARGETS[name]?.macho && platform !== 'darwin') return `${name} needs a Mac (Apple's codesign and the Mach-O steps) → build it on a macOS runner (standalone workflow: macos-14 or macos-15-intel)`;
  if (platform === 'win32') return 'the build runs on Linux or macOS → use a Linux or macOS machine';
  return undefined;
}

/** The target whose pinned Node runs natively on this machine (it writes the blob unless the Linux x64 one can), or undefined. */
export function hostTarget(platform: string = process.platform, arch: string = process.arch): string | undefined {
  const key = `${platform === 'win32' ? 'win' : platform}-${arch}`;
  return TARGETS[key] ? key : undefined;
}

/** The SEA config with paths RELATIVE to the folder it is run in. Node writes `main` into the blob as given, so an absolute
 *  path into the random scratch folder made every build differ (measured: the only differing bytes were that path). */
export function seaConfig(main: string, output: string): string {
  return JSON.stringify({ main, output, disableExperimentalSEAWarning: true });
}

const sha256 = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

/** The hash listed for `archive` in a SHASUMS256.txt body, or undefined. */
export function shasumFor(shasums: string, archive: string): string | undefined {
  for (const line of shasums.split('\n')) {
    const [hash, name] = line.trim().split(/\s+/);
    if (name === archive) return hash;
  }
  return undefined;
}

async function download(url: string, file: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

/** Downloads (once, cached) and verifies the official Node archive: against the pin in this file AND against
 *  the SHASUMS256.txt of the same release, so a changed pin or a tampered download both stop the build. */
async function fetchNodeArchive(target: Target, cache: string): Promise<string> {
  mkdirSync(cache, { recursive: true });
  const base = `https://nodejs.org/dist/v${NODE_VERSION}`;
  const file = path.join(cache, target.archive);
  if (!existsSync(file) || sha256(file) !== target.sha256) await download(`${base}/${target.archive}`, file);
  const got = sha256(file);
  if (got !== target.sha256) throw new Error(`${target.archive}: sha256 ${got} is not the pinned ${target.sha256}`);
  const shasums = path.join(cache, `SHASUMS256-${NODE_VERSION}.txt`);
  if (!existsSync(shasums)) await download(`${base}/SHASUMS256.txt`, shasums);
  const listed = shasumFor(readFileSync(shasums, 'utf8'), target.archive);
  if (listed !== got) throw new Error(`${target.archive}: sha256 ${got} is not the ${listed ?? 'missing'} listed in SHASUMS256.txt`);
  return file;
}

/** Extracts the one node program from an official archive into `dir` and returns its path. */
function extractNode(archive: string, target: Target, dir: string): string {
  mkdirSync(dir, { recursive: true });
  if (target.archive.endsWith('.zip')) execFileSync('unzip', ['-o', '-j', archive, target.member, '-d', dir], { stdio: 'pipe' });
  else execFileSync('tar', [target.archive.endsWith('.tar.gz') ? '-xzf' : '-xJf', archive, '-C', dir, '--strip-components=2', target.member], { stdio: 'pipe' });
  return path.join(dir, path.basename(target.member));
}

/** The package files the binary carries, as package-relative path to text (see src/util/embedded.ts). */
export function embeddedFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (rel: string): void => {
    for (const e of readdirSync(rel, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(child);
      else files[child] = readFileSync(child, 'utf8');
    }
  };
  for (const dir of EMBED_DIRS) walk(dir);
  // The nudge hook is plain ESM that Node runs as a file; the binary runs the same source from inside itself
  // (src/setup/standalone-hook.ts), so it is embedded as CommonJS in place of the .mjs.
  files['hooks/nudge.cjs'] = esbuild.transformSync(files['hooks/nudge.mjs']!, { format: 'cjs', target: 'node22', loader: 'js' }).code;
  delete files['hooks/nudge.mjs'];
  return files;
}

/** esbuild to one CommonJS file. Inside a Node single-executable app `process.argv[1]` is the executable's own
 *  path, so `import.meta.url` (which cli.ts's isEntrypoint compares it to) is mapped to the executable. */
async function bundle(outFile: string, version?: string): Promise<void> {
  await esbuild.build({
    entryPoints: ['src/cli.ts'],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    legalComments: 'none',
    define: { 'import.meta.url': '__mm3_url', __MM3_EMBEDDED__: JSON.stringify(embeddedFiles()) },
    // `version` stamps a different number into the bundled package.json (the A/B upgrade test builds a "newer" file this way).
    plugins: version ? [{ name: 'version', setup: (b) => b.onLoad({ filter: /[\\/]package\.json$/ }, (a) => ({ contents: JSON.stringify({ ...JSON.parse(readFileSync(a.path, 'utf8')) as object, version }), loader: 'json' })) }] : [],
    banner: { js: "const __mm3_url = require('node:url').pathToFileURL(process.execPath).href;" },
  });
}

/** postject, installed alone into a scratch folder (no scripts run), never into this repo. */
function installPostject(scratch: string): string {
  writeFileSync(path.join(scratch, 'package.json'), '{"private":true}\n');
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline', `postject@${POSTJECT_VERSION}`], { cwd: scratch, stdio: 'pipe' });
  return path.join(scratch, 'node_modules', 'postject', 'dist', 'cli.js');
}

export async function buildBinary(targetName: string, outDir: string = OUT_DIR, versionOverride?: string): Promise<{ file: string; bytes: number; sha256: string; blobSha256: string }> {
  const target = TARGETS[targetName];
  if (!target) throw new Error(`--target: "${targetName}" is not one of ${Object.keys(TARGETS).join(', ')}`);
  const blocked = cannotBuildHere(targetName);
  if (blocked) throw new Error(blocked);
  const version = versionOverride ?? (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  const cache = path.join(outDir, 'cache');
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'mm3-build-binary-'));
  try {
    // The blob must be made by the same Node version as the base binary. On a Linux x64 host the pinned Linux x64 Node writes it (as in
    // every release so far); on any other host the pinned Node for that host does, since it is the one that can run there.
    const blobKey = process.platform === 'linux' && process.arch === 'x64' ? 'linux-x64' : hostTarget();
    if (!blobKey) throw new Error(`no pinned Node for this machine (${process.platform}-${process.arch}) → build on Linux x64, Linux arm64 or macOS`);
    const nodeFor = async (key: string): Promise<string> => extractNode(await fetchNodeArchive(TARGETS[key]!, cache), TARGETS[key]!, path.join(scratch, `node-${key}`));
    const blobNode = await nodeFor(blobKey);
    const baseNode = targetName === blobKey ? blobNode : await nodeFor(targetName);

    const bundleFile = path.join(scratch, 'mm3.cjs');
    const blob = path.join(scratch, 'sea.blob');
    await bundle(bundleFile, versionOverride);
    // Run from the scratch folder with relative names: the blob then carries "mm3.cjs", not the random scratch path (reproducible build).
    writeFileSync(path.join(scratch, 'sea-config.json'), seaConfig(path.basename(bundleFile), path.basename(blob)));
    execFileSync(blobNode, ['--experimental-sea-config', 'sea-config.json'], { cwd: scratch, stdio: 'pipe' });

    mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `mm3-${version}-${targetName}${target.exe}`);
    copyFileSync(baseNode, file);
    chmodSync(file, 0o755);
    // macOS (Node's SEA docs): the signature Node ships with is removed before injection, the blob goes in a Mach-O segment, and an ad-hoc
    // signature is written after (Apple silicon refuses to run an unsigned binary). `codesign` exists only on a Mac.
    if (target.macho) execFileSync('codesign', ['--remove-signature', file], { stdio: 'pipe' });
    execFileSync(process.execPath, [installPostject(scratch), file, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', SENTINEL_FUSE, ...(target.macho ? ['--macho-segment-name', 'NODE_SEA'] : [])], { stdio: 'pipe' });
    if (target.macho) execFileSync('codesign', ['--sign', '-', file], { stdio: 'pipe' });

    const hash = sha256(file);
    const sums = path.join(outDir, 'SHA256SUMS');
    let prior = '';
    try {
      prior = readFileSync(sums, 'utf8'); // one read, no exists-then-read gap
    } catch {
      prior = '';
    }
    const kept = prior.split('\n').filter((l) => l && !l.endsWith(`  ${path.basename(file)}`));
    writeFileSync(sums, `${[...kept, `${hash}  ${path.basename(file)}`].sort().join('\n')}\n`);
    return { file, bytes: statSync(file).size, sha256: hash, blobSha256: sha256(blob) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--target');
  const name = i >= 0 ? process.argv[i + 1] : undefined;
  if (!name) {
    console.error(`✖ --target: missing → pass --target ${Object.keys(TARGETS).join('|')}`);
    process.exit(2);
  }
  try {
    const r = await buildBinary(name);
    console.log(`built ${r.file} (${r.bytes} bytes, sha256 ${r.sha256}, blob sha256 ${r.blobSha256})`);
    // The blob is the same bytes on every platform (see the header); CI compares this line across all six builds.
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(path.join(OUT_DIR, `blob-${name}.sha256`), `${r.blobSha256}  blob-${name}\n`);
  } catch (e) {
    console.error(`✖ build:binary: ${(e as Error).message}`);
    process.exit(1);
  }
}

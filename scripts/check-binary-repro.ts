/**
 * `npm run check:binary-repro [-- --target <any build:binary target>|all]`: builds the standalone twice from the same checkout and
 * fails unless the two files are byte-identical (same sha256). `all` means every target this machine can build (a Linux host: the
 * Linux and Windows ones; a Mac: all six, the macOS ones included) and names the ones it skips. The standalone workflow runs it on each
 * native runner for the targets that runner builds, so macOS's ad-hoc `codesign` output is measured, not assumed. When they differ it says how many bytes and the first
 * offsets, so the cause is a measurement, not a guess. Needs the network only for the first Node download (cached).
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildBinary, cannotBuildHere, TARGETS } from './build-binary.ts';

/** Byte offsets (0-based) where two buffers differ, plus a length mismatch counted as differing tail bytes. */
export function diffOffsets(a: Buffer, b: Buffer, limit = 8): { count: number; first: number[] } {
  const first: number[] = [];
  let count = Math.abs(a.length - b.length);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) { count++; if (first.length < limit) first.push(i); }
  return { count, first };
}

async function checkTarget(name: string): Promise<boolean> {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'mm3-repro-'));
  try {
    const one = await buildBinary(name);
    const kept = path.join(scratch, 'first');
    copyFileSync(one.file, kept);
    const two = await buildBinary(name);
    if (one.sha256 === two.sha256) {
      console.log(`✔ ${name}: two builds are byte-identical (sha256 ${one.sha256}, ${one.bytes} bytes)`);
      return true;
    }
    const d = diffOffsets(readFileSync(kept), readFileSync(two.file));
    console.error(`✖ ${name}: builds differ (${one.sha256} vs ${two.sha256}); ${d.count} bytes differ, first offsets ${d.first.join(', ')} → find what the build embeds that changes per run`);
    return false;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--target');
  const want = i >= 0 ? process.argv[i + 1] : 'all';
  const names = want === 'all' ? Object.keys(TARGETS).filter((n) => {
    const why = cannotBuildHere(n);
    if (why) console.log(`- ${n}: skipped on this machine (${why})`);
    return !why;
  }) : [want ?? ''];
  let ok = true;
  for (const n of names) {
    if (!TARGETS[n]) { console.error(`✖ --target: "${n}" is not one of ${Object.keys(TARGETS).join(', ')}, all → pass one of them`); process.exit(2); }
    try { ok = (await checkTarget(n)) && ok; } catch (e) { console.error(`✖ check:binary-repro: ${(e as Error).message}`); ok = false; }
  }
  process.exit(ok ? 0 : 1);
}

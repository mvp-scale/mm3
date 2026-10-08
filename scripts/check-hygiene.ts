/**
 * Two AGENTS.md rules turned into a script: rule 8 says every module has a short header comment, and a
 * clean codebase carries no export nothing else uses — where "uses" counts a unit test importing a src
 * function directly (AGENTS.md rule 2's pattern), not just another src module. `npm run check:hygiene` runs
 * both over src/ for real; test/unit/check-hygiene.test.ts exercises the pure functions against small fixtures.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export function listSrcFiles(root = 'src'): string[] {
  const out: string[] = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) out.push(...listSrcFiles(full));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

// Every .ts under test/ (specs and the test/gen generators alike) — a real caller for the unused-export
// check's purposes, same as any file under src/: rule 8's "no export nothing else uses" isn't only about
// production code importing production code, and a lot of this repo's exports exist so a unit test can
// exercise pure logic directly (AGENTS.md rule 2's pattern), not to be re-imported by another src module.
export function listTestFiles(root = 'test'): string[] {
  const out: string[] = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) out.push(...listTestFiles(full));
    else if (e.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

export function hasHeaderComment(text: string): boolean {
  const lines = text.split('\n');
  let i = lines[0]?.startsWith('#!') ? 1 : 0; // src/cli.ts's shebang
  while (lines[i] === '') i++;
  const line = lines[i] ?? '';
  return line.startsWith('/*') || line.startsWith('//');
}

export function findMissingHeaders(files: readonly string[]): string[] {
  return files.filter((f) => !hasHeaderComment(readFileSync(f, 'utf8')));
}

export interface ExportSite { file: string; name: string }

// export function/class/interface/type/const NAME, and export { a, b as c } (skips `export default`, `export *`).
const DECL = /^export\s+(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function|class|interface|enum|type|const|let|var)\s+([A-Za-z_$][\w$]*)/gmu;
const NAMED = /^export\s+(?:type\s+)?\{([^}]*)\}\s*(?:from\s+['"][^'"]*['"])?\s*;?/gmu;

function namesFromBraceList(list: string): string[] {
  return list
    .split(',')
    .map((piece) => piece.trim())
    .filter(Boolean)
    .map((piece) => {
      const asMatch = /\bas\s+([A-Za-z_$][\w$]*)$/u.exec(piece);
      return asMatch ? asMatch[1]! : piece.replace(/^type\s+/u, '').trim();
    });
}

export function findExports(files: readonly string[]): ExportSite[] {
  const sites: ExportSite[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(DECL)) {
      if (m[0].startsWith('export default')) continue; // no name to check usage of
      sites.push({ file, name: m[1]! });
    }
    for (const m of text.matchAll(NAMED)) {
      for (const name of namesFromBraceList(m[1] ?? '')) sites.push({ file, name });
    }
  }
  return sites;
}

// `otherCallerFiles` (real run: listTestFiles() — a unit test importing a src function by name to exercise it
// directly is a real caller, not a dead export) is checked alongside `files` for the "does anything use this
// name" pass, but never for the barrel/public-surface checks above, which are about src's own public API.
export function findUnusedExports(files: readonly string[], publicSurfaceFile = 'src/index.ts', otherCallerFiles: readonly string[] = []): ExportSite[] {
  const publicText = readFileSync(publicSurfaceFile, 'utf8');
  const wholeSrc = [...files, ...otherCallerFiles].map((f) => ({ f, text: readFileSync(f, 'utf8') }));
  return findExports(files).filter((e) => {
    if (e.file === publicSurfaceFile) return false;
    const barrelName = path.relative('src', e.file).split(path.sep).join('/').replace(/\.ts$/u, '').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'); // forward slashes (Windows) and regex-escaped
    if (new RegExp(`from '\\./${barrelName}\\.ts'`, 'u').test(publicText.replace('src/', './'))) return false; // barrel-exported wholesale
    if (new RegExp(`\\b${e.name}\\b`, 'u').test(publicText)) return false; // named in index.ts: intentionally public
    return !wholeSrc.some(({ f, text }) => f !== e.file && new RegExp(`\\b${e.name}\\b`, 'u').test(text));
  });
}

export function renderHygieneReport(missingHeaders: readonly string[], unused: readonly ExportSite[]): string {
  const lines: string[] = [];
  for (const f of missingHeaders) lines.push(`✖ hygiene: ${f} has no header comment → add a one-line "/** why this module exists */" before its first import`);
  for (const e of unused) lines.push(`✖ hygiene: ${e.file} exports "${e.name}" but nothing imports it → remove it, or add it to src/index.ts if it's public API`);
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = listSrcFiles();
  const missingHeaders = findMissingHeaders(files);
  const unused = findUnusedExports(files, 'src/index.ts', listTestFiles());
  const report = renderHygieneReport(missingHeaders, unused);
  if (report) {
    console.error(report);
    process.exit(1);
  }
  console.log('hygiene OK');
}

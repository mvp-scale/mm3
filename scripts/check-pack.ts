/**
 * What actually ships in `npm pack`, checked against an allow-list and a required-files list derived from
 * package.json's own bin/exports — so this check and the fields it verifies can't drift apart by hand-editing
 * one and not the other. `npm run check:pack` runs it for real; test/unit/check-pack.test.ts exercises the
 * pure logic against a fixture, no subprocess.
 */
import { execFileSync } from 'node:child_process';
import pkg from '../package.json' with { type: 'json' };

export interface PackEntry { path: string; size: number }

export const ALLOWED_PREFIXES = ['dist/', 'skills/', '.claude-plugin/', 'hooks/'] as const;
export const ALLOWED_FILES = ['README.md', 'LICENSE', 'package.json'] as const; // npm always includes these regardless of "files"

function entryPointPaths(): string[] {
  const bin = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin as Record<string, string>);
  const exp = (pkg.exports as unknown as { '.': { types: string; import: string } })['.'];
  return [...bin, exp.import, exp.types].map((p) => p.replace(/^\.\//u, ''));
}

export const REQUIRED: readonly string[] = [
  ...entryPointPaths(),
  'skills/mm3/SKILL.md',
  'skills/mm3/references/request.schema.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'hooks/hooks.json',
  'hooks/nudge.mjs',
  'README.md',
  'LICENSE',
];

export function parsePackJson(raw: string): PackEntry[] {
  const parsed = JSON.parse(raw) as Array<{ files: PackEntry[] }>;
  return parsed[0]?.files ?? [];
}

export function checkPackContents(entries: readonly PackEntry[]): string[] {
  const problems: string[] = [];
  const paths = new Set(entries.map((e) => e.path));
  for (const e of entries) {
    const ok = ALLOWED_PREFIXES.some((p) => e.path.startsWith(p)) || (ALLOWED_FILES as readonly string[]).includes(e.path);
    if (!ok) problems.push(`✖ pack: "${e.path}" ships but isn't allowed → remove it from package.json's "files", or keep it out of the source tree it comes from (lab/, test/, docs/, scripts/, .superpowers/)`);
  }
  for (const req of REQUIRED) {
    if (!paths.has(req)) problems.push(`✖ pack: "${req}" is missing from the tarball → check package.json's "files", "bin" and "exports"`);
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' });
  const problems = checkPackContents(parsePackJson(raw));
  if (problems.length) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }
  console.log(`pack OK — ${parsePackJson(raw).length} files`);
}

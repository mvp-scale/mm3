/**
 * What actually ships in `npm pack`, checked against an allow-list and a required-files list derived from
 * package.json's own bin/exports — so this check and the fields it verifies can't drift apart by hand-editing
 * one and not the other. `npm run check:pack` runs it for real; test/unit/check-pack.test.ts exercises the
 * pure logic against a fixture, no subprocess.
 */
import { execFileSync } from 'node:child_process';
import pkg from '../package.json' with { type: 'json' };

export interface PackEntry { path: string; size: number; mode?: number }

export const ALLOWED_PREFIXES = ['dist/', 'skills/', '.claude-plugin/', 'hooks/', 'launcher/'] as const;
export const ALLOWED_FILES = ['README.md', 'LICENSE', 'package.json', 'bin/mm3.mjs', 'gemini-extension.json'] as const; // the first three npm always includes regardless of "files"; bin/mm3.mjs is the plugin bundle .claude-plugin/plugin.json launches

function entryPointPaths(): string[] {
  const bin = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin as Record<string, string>);
  const exp = (pkg.exports as unknown as { '.': { types: string; import: string } })['.'];
  return [...bin, exp.import, exp.types].map((p) => p.replace(/^\.\//u, ''));
}

const EXECUTABLE = 'launcher/mm3-launch';
export const REQUIRED: readonly string[] = [
  ...entryPointPaths(),
  'skills/mm3/SKILL.md',
  'skills/mm3/references/request.schema.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'gemini-extension.json', // Gemini CLI's own manifest: `gemini extensions install` reads it at the root of the folder and registers the MCP server and the skills
  'hooks/hooks.json',
  'hooks/nudge.mjs',
  // the launcher ships but the plugin does not start through it yet (the shipped manifests still run node); the next release copies launcher/manifests/* over them
  'launcher/mm3-launch', // run directly on macOS/Linux once the manifests name `${CLAUDE_PLUGIN_ROOT}/launcher/mm3-launch`
  'launcher/mm3-launch.cmd', // the same command on Windows: cmd adds .cmd from PATHEXT, so the extensionless manifest command runs this batch file
  'launcher/mm3-launch.ps1',
  'launcher/checksums.json', // the hashes the launcher checks a downloaded self-contained build against (generated: npm run gen:checksums)
  'launcher/manifests/plugin.json', // the launcher-form manifests (data): what the plugin switches to
  'launcher/manifests/hooks.json',
  'bin/mm3.mjs', // .claude-plugin/plugin.json launches `node ${CLAUDE_PLUGIN_ROOT}/bin/mm3.mjs mcp`: without it the plugin npm's init registers cannot start its MCP server
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
  // macOS and Linux will run the manifest's command directly once the plugin switches to the launcher, so the tarball must already carry the execute bit
  const launcher = entries.find((e) => e.path === EXECUTABLE);
  if (launcher?.mode !== undefined && (launcher.mode & 0o111) === 0) problems.push(`✖ pack: "${EXECUTABLE}" ships without its execute bit → run: git update-index --chmod=+x ${EXECUTABLE} && chmod +x ${EXECUTABLE}`);
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

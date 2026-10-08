/**
 * Package files baked into the standalone binary (scripts/build-binary.ts). The binary is one file with no
 * `skills/` folder beside it, so anything the code would read from the package directory (the request templates, and the plugin
 * manifests and skills `mm3 init` writes out) is carried inside it instead. `__MM3_EMBEDDED__` is replaced at build time with a map of
 * package-relative path (`skills/mm3/templates/class.yaml`) to file text; on the npm path and in the plugin
 * bundle it is never defined, `embeddedFiles()` is undefined, and every read goes to disk exactly as before.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

declare const __MM3_EMBEDDED__: Record<string, string> | undefined;

/** The embedded files, or undefined when this is not the standalone binary. */
function embeddedFiles(): Record<string, string> | undefined {
  return typeof __MM3_EMBEDDED__ === 'undefined' ? undefined : __MM3_EMBEDDED__;
}

/** True only inside the standalone binary. */
export const isStandalone = (): boolean => embeddedFiles() !== undefined;

/** A file under the package directory as text: from the embedded map inside the binary, from disk otherwise
 *  (a disk failure throws as readFileSync does). */
export function readPackageFile(packageDir: string, ...segments: string[]): string {
  const embedded = embeddedFiles();
  if (embedded === undefined) return readFileSync(path.join(packageDir, ...segments), 'utf8');
  const text = embedded[segments.join('/')];
  if (text === undefined) throw new Error(`${segments.join('/')} is not embedded in this build`);
  return text;
}

/** Every embedded file under `prefix` (package-relative, `/`-separated), as path to text; empty outside the
 *  standalone. The standalone's init writes its plugin folder from these (setup/standalone.ts). */
export function embeddedUnder(prefix: string): Record<string, string> {
  const embedded = embeddedFiles() ?? {};
  return Object.fromEntries(Object.entries(embedded).filter(([key]) => key === prefix || key.startsWith(`${prefix}/`)));
}

/**
 * Node ≥ 22.13 is a hard requirement: earlier runtimes have no `node:sqlite`, so
 * `ledger/index.ts` used to fall back to its slower linear scan with nothing telling the caller — the owner
 * hit exactly this on a Node 20 host, where `.mm3/index.db` was silently never built. `cli.ts`'s whole
 * dispatch checks this once, at the top, before any command but `doctor` (which still runs and reports the
 * problem) does anything real; `mm3 mcp` checks it again per tool call, so a client always gets an
 * `isError` result instead of a silent, degraded run. Kept dependency-free and pure (a version string in,
 * an answer out) so it's trivial to unit-test with an injected version instead of the machine's own Node.
 */

import { LINKS } from '../help/links.ts';

const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 13;
export const MIN_NODE_LABEL = `${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}`;

// The link in the stop line and in doctor comes from help/links.ts, so it can change without touching this wording.
// TODO: once a standalone (no-Node) build has a public release, add it to docs/node-version.md and mention
// it here. Until then nothing user-visible promises it.

/** Parses a `process.version`-shaped string ("v22.13.0", "20.11.0", ...) into {major, minor}, or undefined
 *  when it doesn't even look like one — never thrown, since an unparseable string is just treated as "too
 *  old" by `nodeVersionOk` below, not a crash. */
export function parseNodeVersion(v: string): { major: number; minor: number } | undefined {
  const m = /^v?(\d+)\.(\d+)/u.exec(v.trim());
  if (!m) return undefined;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

/** True when `v` is Node 22.13 or newer. Fails closed: an unparseable version string is never "ok". */
export function nodeVersionOk(v: string): boolean {
  const parsed = parseNodeVersion(v);
  if (!parsed) return false;
  if (parsed.major !== MIN_NODE_MAJOR) return parsed.major > MIN_NODE_MAJOR;
  return parsed.minor >= MIN_NODE_MINOR;
}

/** The exact stop line printed (and returned as an MCP `tools/call` error) for every command but `doctor` on
 *  too old a Node — verbatim. `undefined` when `v` is fine, so a caller can write
 *  `if (stop) ...` without calling `nodeVersionOk` a second time. */
export function nodeVersionStop(v: string): string | undefined {
  if (nodeVersionOk(v)) return undefined;
  return `✖ node: ${v} is too old → pin Node ${MIN_NODE_LABEL}+ for this project (nvm, fnm or Volta; no machine-wide change); see ${LINKS.nodeVersion}`;
}

/** doctor's own `node:` field value: the plain version when it's fine, or the same fact in the compact shape
 *  that fits a YAML value (doctor keeps running and reporting instead of stopping outright). */
export function doctorNodeValue(v: string): string {
  return nodeVersionOk(v) ? v : `${v} ✖ too old → pin Node ${MIN_NODE_LABEL}+ for this project; see ${LINKS.nodeVersion}`;
}

/** doctor's own `index:` field value on too old a Node — the `node:sqlite`-vs-fallback choice never even
 *  applies, since production never reaches the ledger at all before this stops the command. */
export const DOCTOR_INDEX_TOO_OLD = `none (needs Node ${MIN_NODE_LABEL}+)`;

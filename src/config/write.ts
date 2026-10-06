/**
 * The one place that WRITES `.mm3/config.yaml`. Every other config module is read-only
 * (load.ts/validate.ts/config.ts) — the one-time budget.json migration, `report fields --accept` and the starter-file writes
 * (src/budget/budget.ts) are the only callers, and they only ever merge a sparse patch into whatever is already
 * there, preserving every other key (and comments, since this goes through the `yaml` package's own Document
 * rather than a plain stringify-the-whole-object round trip — the same idiom src/verbs/template.ts uses for
 * --goal/--where overlays).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { isScalar, parseDocument } from 'yaml';
import { isAbsent, onStore } from '../ledger/lock.ts';
import { ensureDir, type Mm3Paths } from '../ledger/paths.ts';
import type { Mm3Config } from './defaults.ts';

/** Every field of `Mm3Config`, at any depth, made optional — a `writeConfigOverride` patch only ever
 *  names the leaves it wants to change. */
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function setDeep(doc: ReturnType<typeof parseDocument>, prefix: string[], value: unknown): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    // A section the starter file leaves empty (`budget:` with every key under it commented out) parses as null, and
    // `setIn` cannot descend into a null: swap each such parent for an empty map first.
    for (let i = 1; i < prefix.length; i++) {
      const parent = prefix.slice(0, i);
      const node = doc.getIn(parent, true);
      if (node === null || (isScalar(node) && node.value === null)) {
        const map = doc.createNode({});
        // The null carries the starter's commented-out lines; keep them (they move below the new keys).
        if (isScalar(node)) {
          if (node.comment !== undefined) map.comment = node.comment;
          if (node.commentBefore !== undefined) map.commentBefore = node.commentBefore;
        }
        doc.setIn(parent, map);
      }
    }
    doc.setIn(prefix, value);
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) setDeep(doc, [...prefix, k], v);
  }
}

/**
 * Merges `patch` into `.mm3/config.yaml`, creating the file (and `.mm3/`) if neither exists yet.
 * Every key not named in `patch` is left exactly as it was. Never validates (the caller already knows its own
 * patch is well-formed — `setBudget`'s own positive-number check runs before this, same as before); a config
 * file this then makes momentarily invalid in some OTHER way is caught the next time anything reads it
 * (`resolveConfig`/`mm3 doctor`), same as an agent hand-editing the file badly would be.
 */
export function writeConfigOverride(paths: Mm3Paths, patch: DeepPartial<Mm3Config>): void {
  // Wrapped in onStore, same as every other file this codebase writes (budget.json before it, log.jsonl) — a
  // raw fs error (an unwritable .mm3/, a permissions problem) must surface as the usual clean StoreError,
  // never an unwrapped errno reaching the agent. The file is the config, so the write is live at once.
  onStore(paths.config, 'write', () => {
    ensureDir(paths);
    let text = '';
    try {
      text = readFileSync(paths.config, 'utf8');
    } catch (e) {
      if (!isAbsent(e)) throw e; // no config file yet: start one
    }
    const doc = parseDocument(text, { version: '1.2', schema: 'core' });
    setDeep(doc, [], patch);
    writeFileSync(paths.config, doc.toString());
  });
}

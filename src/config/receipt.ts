/**
 * Where config.yaml stands against the ledger's latest `config` receipt. The file is the config: every request reads
 * it itself, so there is no loaded copy to keep in step and nothing to fall out of date. A load (`mm3 config --load`)
 * only checks the file and leaves a receipt in the ledger (when, the file's hash, the settings, what changed), and this
 * module compares the file now with that receipt to say "loaded", "in effect but not recorded", "gone" or "has a
 * problem". It reads and hashes config.yaml, so it is for doctor and `mm3 config`, never the per-request path, and it
 * writes nothing.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { latestConfigRecord } from '../ledger/index.ts';
import type { Mm3Paths } from '../ledger/paths.ts';
import { checkConfigText, hasSettings } from './parse.ts';
import type { ConfigStop } from './validate.ts';

export const fingerprintOf = (text: string): string => createHash('sha256').update(text).digest('hex');

type ConfigStatus =
  /** No config.yaml (or one with nothing set) and no recorded load: every value is a default. */
  | { kind: 'defaults'; fileStops: ConfigStop[] }
  /** config.yaml is exactly what the latest receipt recorded. */
  | { kind: 'loaded'; loadedAt: string; fileStops: ConfigStop[] }
  /** config.yaml is in effect, but the latest receipt is of a different file (or there is none). */
  | { kind: 'unrecorded'; fileStops: ConfigStop[] }
  /** A load was recorded, but config.yaml is gone: the defaults apply. */
  | { kind: 'gone'; loadedAt: string; fileStops: ConfigStop[] }
  /** config.yaml has problems: paid runs stop until they are fixed. */
  | { kind: 'invalid'; fileStops: ConfigStop[] };

export function configStatus(paths: Mm3Paths | undefined): ConfigStatus {
  let text: string | undefined;
  if (paths && existsSync(paths.config)) {
    try {
      text = readFileSync(paths.config, 'utf8');
    } catch {
      text = undefined;
    }
  }
  const latest = paths ? latestConfigRecord(paths) : undefined;
  // No file: the defaults apply. A recorded load of a file that is now gone warns until the defaults are recorded too.
  if (text === undefined) return latest && !latest.absent ? { kind: 'gone', loadedAt: latest.ts, fileStops: [] } : { kind: 'defaults', fileStops: [] };
  const fileStops = checkConfigText(text).stops;
  if (fileStops.length) return { kind: 'invalid', fileStops };
  if (!latest) return hasSettings(text) ? { kind: 'unrecorded', fileStops } : { kind: 'defaults', fileStops };
  return latest.fingerprint === fingerprintOf(text) ? { kind: 'loaded', loadedAt: latest.ts, fileStops } : { kind: 'unrecorded', fileStops };
}

/** The one line that says where the config stands (doctor's `config:` and `mm3 config`'s notes). `defaults` has no
 *  line of its own: callers keep their existing "defaults" wording. */
export function statusLine(s: ConfigStatus): string | undefined {
  switch (s.kind) {
    case 'defaults':
      return undefined;
    case 'loaded':
      return `config: loaded ${s.loadedAt}`;
    case 'unrecorded':
      return '⚠ config.yaml is in effect but its latest change is not recorded → mm3 config --load';
    case 'gone':
      return `⚠ config.yaml is gone (last loaded ${s.loadedAt}) → the defaults apply; run mm3 config --load to record the defaults, or restore the file`;
    case 'invalid':
      return '✖ config.yaml has a problem → fix it: paid runs stop until you do';
  }
}

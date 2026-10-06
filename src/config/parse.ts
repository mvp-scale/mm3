/**
 * config.yaml text → the raw value `validateConfig` checks, or the one stop saying why it can't be read. Split out
 * of load.ts so both the per-request path and `mm3 config --load` / doctor share one
 * parser. Pure: text in, value or stops out, no file or env access.
 */
import { parseDocument } from 'yaml';
import { validateConfig, type ConfigStop } from './validate.ts';
import type { Mm3Config } from './defaults.ts';

interface ParsedConfig {
  /** undefined when the text does not parse or is not a mapping — `stops` explains which. */
  raw: Record<string, unknown> | undefined;
  stops: ConfigStop[];
}

/** A YAML syntax error becomes one stop naming the line, the same style read.ts's request parser uses. */
export function parseConfigText(text: string): ParsedConfig {
  const doc = parseDocument(text, { version: '1.2', schema: 'core', uniqueKeys: true });
  const first = doc.errors[0];
  if (first) {
    const line = first.linePos?.[0]?.line ?? 1;
    return { raw: undefined, stops: [{ path: '', text: `✖ config: line ${line} of config.yaml does not parse → fix the YAML syntax` }] };
  }
  let value: unknown;
  try {
    value = doc.toJS({ maxAliasCount: 50 });
  } catch {
    return { raw: undefined, stops: [{ path: '', text: '✖ config: too many aliases (*) in config.yaml → write it out in full' }] };
  }
  if (value === null || value === undefined) return { raw: {}, stops: [] }; // an empty file: no overrides, no problem
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { raw: undefined, stops: [{ path: '', text: '✖ config: config.yaml is not a YAML mapping → write budget:, provider: etc. as top-level keys' }] };
  }
  return { raw: value as Record<string, unknown>, stops: [] };
}

/** Parse and validate in one go: every problem, plus the overrides that checked out. */
export function checkConfigText(text: string): { stops: ConfigStop[]; overrides: Partial<Mm3Config>; parsed: boolean } {
  const file = parseConfigText(text);
  if (file.raw === undefined) return { stops: file.stops, overrides: {}, parsed: false };
  const validated = validateConfig(file.raw);
  return { stops: [...file.stops, ...validated.stops], overrides: validated.value, parsed: true };
}

/** Whether config.yaml text holds any setting at all. A starter with every line commented out has live section
 *  headers (`budget:`) but no values, so it holds none; text that does not parse counts as holding something (it
 *  is not "nothing to load"). */
export function hasSettings(text: string): boolean {
  const { raw } = parseConfigText(text);
  if (raw === undefined) return true;
  const live = (v: unknown): boolean => v !== null && v !== undefined && (typeof v === 'object' ? Object.values(v as object).some(live) : true);
  return live(raw);
}

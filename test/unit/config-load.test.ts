// .mm3/config.yaml → the effective config (defaults < config.yaml < env), validation stops,
// and the mm3 config command's printed output.
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { DEFAULT_CONFIG } from '../../src/config/defaults.ts';
import { resolveConfig } from '../../src/config/load.ts';
import { validateConfig } from '../../src/config/validate.ts';
import { runConfig, formatConfig } from '../../src/config/config.ts';
import { resolveJevConfig } from '../../src/classifier/typesafe/client.ts';
import { selectProvider } from '../../src/classifier/select.ts';
import { classifierFileConfig } from '../../src/config/load.ts';
import { tempProject } from '../helpers/project.ts';

describe('resolveConfig', () => {
  it('no project, no file: every value is a default', () => {
    const resolved = resolveConfig(undefined, {});
    expect(resolved.present).toBe(false);
    expect(resolved.stops).toEqual([]);
    expect(resolved.config.budget).toEqual(DEFAULT_CONFIG.budget);
    expect(resolved.config.timeoutMs).toBe(DEFAULT_CONFIG.timeoutMs);
    expect(resolved.sources.timeoutMs).toBe('default');
  });

  it('a valid override file changes the effective value and shows its source as config', () => {
    const { paths } = tempProject({ '.mm3/config.yaml': 'budget:\n  usd: 25\ntimeoutMs: 5000\n' });
    const resolved = resolveConfig(paths, {});
    expect(resolved.present).toBe(true);
    expect(resolved.stops).toEqual([]);
    expect(resolved.config.budget.usd).toBe(25);
    expect(resolved.sources['budget.usd']).toBe('config');
    expect(resolved.config.timeoutMs).toBe(5000);
    expect(resolved.sources.timeoutMs).toBe('config');
    // untouched keys stay default
    expect(resolved.config.budget.runs).toBe(DEFAULT_CONFIG.budget.runs);
    expect(resolved.sources['budget.runs']).toBe('default');
  });

  it('env wins over config.yaml for the fields that have their own env var', () => {
    const { paths } = tempProject({ '.mm3/config.yaml': 'model: jev-config-model\n' });
    const resolved = resolveConfig(paths, { JEV_MODEL: 'jev-2.0.0' });
    // resolveConfig's own `config.model` is the config/default LAYER (see load.ts's module doc) — the source
    // label is what proves env would actually win at runtime.
    expect(resolved.sources.model).toBe('env');
  });

  it('a missing config.yaml is not an error; present is false', () => {
    const { paths } = tempProject({});
    const resolved = resolveConfig(paths, {});
    expect(resolved.present).toBe(false);
    expect(resolved.stops).toEqual([]);
  });

  it('a YAML syntax error names the line and never throws', () => {
    const { paths } = tempProject({ '.mm3/config.yaml': 'budget:\n  usd: [1, 2\n' });
    const resolved = resolveConfig(paths, {});
    expect(resolved.stops).toHaveLength(1);
    expect(resolved.stops[0]!.text).toMatch(/^✖ config: line \d+ of config\.yaml does not parse →/);
  });
});

describe('validateConfig', () => {
  it('an unknown top-level key suggests the nearest real one', () => {
    const { stops } = validateConfig({ providr: 'typesafe' });
    expect(stops).toHaveLength(1);
    expect(stops[0]!.text).toBe('✖ config.providr: "providr" is not a config key → did you mean provider?');
  });

  it('a bad enum value is a stop', () => {
    const { stops } = validateConfig({ budget: { per: 'weekly' } });
    expect(stops).toEqual([{ path: 'budget.per', text: '✖ config.budget.per: "weekly" is not valid → use one of total, day, hour' }]);
  });

  it('a request-contract key is not configurable here', () => {
    const { stops } = validateConfig({ goal: 'x' });
    expect(stops).toEqual([{ path: 'goal', text: '✖ config.goal: is a request field, not a project setting → not configurable (request contract) → set it per request' }]);
  });

  it('a key-shaped value (looks like a secret) is refused wherever it appears', () => {
    const top = validateConfig({ apiKey: 'sk-something' });
    expect(top.stops[0]!.text).toContain('keys go in env or the keychain');
    const nested = validateConfig({ pricing: { 'jev-1.13.0': { token: 'x' } } });
    expect(nested.stops.some((s) => s.text.includes('keys go in env or the keychain'))).toBe(true);
  });

  // a real key pasted into a config VALUE stops regardless of the key's own name —
  // baseURL isn't secret-shaped itself, only the value is. Built at runtime (never a literal secret in the repo).
  it('a key-shaped VALUE stops even under a non-secret-named key (baseURL)', () => {
    const secret = 'sk-' + 'A'.repeat(24);
    const { stops, value } = validateConfig({ baseURL: secret });
    expect(stops).toEqual([{ path: 'baseURL', text: '✖ config.baseURL: looks like a key → keys go in env (TYPESAFE_API_KEY) or the keychain, never in config' }]);
    expect(value.baseURL).toBeUndefined(); // never applied
  });

  it('a key-shaped value inside a mdl override (free text) also stops', () => {
    const secret = 'ghp_' + 'B'.repeat(30);
    const { stops, value } = validateConfig({ mdl: { risk: { note: secret } } });
    expect(stops.some((s) => s.text === '✖ config.mdl.risk.note: looks like a key → keys go in env (TYPESAFE_API_KEY) or the keychain, never in config')).toBe(true);
    expect(value.mdl?.risk?.note).toBeUndefined();
  });

  it('a good file round-trips with no stops and the parsed values', () => {
    const { stops, value } = validateConfig({ budget: { usd: 10, runs: 200 }, sweep: { maxQuestionsPerCall: 100 }, mdl: { risk: { values: ['low', 'high'] } } });
    expect(stops).toEqual([]);
    expect(value.budget).toEqual({ usd: 10, runs: 200 });
    expect(value.sweep).toEqual({ maxQuestionsPerCall: 100 });
    expect(value.mdl).toEqual({ risk: { values: ['low', 'high'] } });
  });

  it('one bad key does not blank out the rest of an otherwise-good file', () => {
    const { stops, value } = validateConfig({ timeoutMs: 5000, providr: 'x' });
    expect(stops).toHaveLength(1);
    expect(value.timeoutMs).toBe(5000);
  });
});

describe('mm3 config command', () => {
  it('prints every key with a source, and exits 0 with no config.yaml', () => {
    const r = runConfig({}, undefined, 'none');
    expect(r.exit).toBe(0);
    expect(r.text).toContain('project: none');
    expect(r.text).toContain('# default');
  });

  // mm3 config's output must be valid, copyable YAML — not the old "5  # default" quoted
  // string it used to print, which emit.ts's own scalar() double-quoted (a " #" inside a plain string disqualifies
  // it), so pasting it into config.yaml produced garbage. Every commented default/example line must, on its own,
  // uncomment into a valid config.yaml fragment.
  it('the whole document parses as YAML', () => {
    const text = formatConfig(resolveConfig(undefined, {}), 'none');
    const parsed = parse(text) as { config: Record<string, unknown>; notes: string[] };
    expect(parsed.config.project).toBe('none');
    expect(parsed.config.budget).toBeNull(); // every budget field is commented out at all-defaults
    expect(parsed.notes.length).toBeGreaterThan(0);
  });

  it('uncommenting every default/example line together yields one valid config (no stops)', () => {
    const text = formatConfig(resolveConfig(undefined, {}), 'none');
    const body = text
      .split('\n')
      .slice(1, -1) // drop the leading "config:" and the trailing blank line
      .filter((l) => !l.trimStart().startsWith('project:') && l !== 'notes:' && !l.startsWith('  - '))
      .map((l) => l.replace(/^(\s*)#\s?/, '$1')) // uncomment every commented line; live lines are untouched
      .map((l) => l.slice(2)) // dedent one level (these were all nested one level under "config:")
      .join('\n');
    const raw = parse(body) as Record<string, unknown>;
    const { stops } = validateConfig(raw);
    expect(stops).toEqual([]);
    // spot-check a few of the reconstructed values actually round-trip as the real defaults/examples shown.
    expect((raw.budget as { usd: number }).usd).toBe(DEFAULT_CONFIG.budget.usd);
    expect(raw.provider).toBe('typesafe');
    expect((raw.pricing as Record<string, { inputPerMTok: number }>)['jev-1.13.0']!.inputPerMTok).toBe(DEFAULT_CONFIG.pricing['jev-1.13.0']!.inputPerMTok);
  });

  it('an overridden field prints as a live line with its source; an untouched sibling stays commented', () => {
    const { paths } = tempProject({ '.mm3/config.yaml': 'budget:\n  usd: 10\nprovider: typesafe\n' });
    const text = formatConfig(resolveConfig(paths, {}), 'proj');
    expect(text).toContain('    usd: 10  # from config.yaml');
    expect(text).toContain('  provider: typesafe  # from config.yaml');
    expect(text).toContain('    # runs: 500  # default'); // sibling budget field, untouched, still commented
    const parsed = parse(text) as { config: { budget: { usd: number }; provider: string } };
    expect(parsed.config.budget.usd).toBe(10);
    expect(parsed.config.provider).toBe('typesafe');
  });

  it('a broken config.yaml shows its stops, then the rest of the effective table underneath, exit 2', () => {
    const { paths } = tempProject({ '.mm3/config.yaml': 'nope: 1\n' });
    const resolved = resolveConfig(paths, {});
    const text = formatConfig(resolved, 'proj');
    expect(text).toContain('config');
    const r = runConfig({}, paths, 'proj');
    expect(r.exit).toBe(2);
    expect(r.text).toContain('✖ config.nope:');
    expect(r.text).toContain('→ see: mm3 agent config');
    expect(r.text).toContain('budget');
  });
});

describe('classifier config threading (env > config.yaml > default)', () => {
  it('resolveJevConfig: fileConfig fills in only what env leaves unset', () => {
    const cfg = resolveJevConfig({}, { fileConfig: { model: 'jev-file-model', timeoutMs: 9000 } });
    expect(cfg.model).toBe('jev-file-model');
    expect(cfg.timeoutMs).toBe(9000);
    const withEnv = resolveJevConfig({ JEV_MODEL: 'jev-1.13.0' }, { fileConfig: { model: 'jev-file-model' } });
    expect(withEnv.model).toBe('jev-1.13.0');
  });

  it('every existing caller that omits fileConfig behaves exactly as before', () => {
    const cfg = resolveJevConfig({});
    expect(cfg.model).toBe('jev-1.13.0');
    expect(cfg.retries).toBeUndefined();
    expect(cfg.backoffMs).toBeUndefined();
  });

  it('classifierFileConfig round-trips a resolved config into resolveJevConfig\'s expected shape', () => {
    const resolved = resolveConfig(undefined, {});
    const fc = classifierFileConfig(resolved.config);
    expect(fc.timeoutMs).toBe(DEFAULT_CONFIG.timeoutMs);
    expect(fc.retries).toBe(DEFAULT_CONFIG.retries);
    const cfg = resolveJevConfig({}, { fileConfig: fc });
    expect(cfg.retries).toBe(DEFAULT_CONFIG.retries);
    expect(cfg.backoffMs).toBe(DEFAULT_CONFIG.backoffMs);
  });

  it('selectProvider: MM3_PROVIDER env still wins outright over config.yaml\'s provider:', () => {
    const p = selectProvider({ MM3_PROVIDER: 'fake' }, { fileConfig: { provider: 'typesafe' } });
    expect(p.adapter).toBe('fake');
  });

  it('selectProvider: config.yaml\'s provider: is used only when no env var names one', () => {
    const p = selectProvider({}, { fileConfig: { provider: 'fake' } });
    expect(p.adapter).toBe('fake');
  });

  it('every existing selectProvider caller that omits fileConfig behaves exactly as before (fake, no key)', () => {
    const p = selectProvider({});
    expect(p.adapter).toBe('fake');
  });
});

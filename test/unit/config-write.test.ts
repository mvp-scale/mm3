// `mm3 config --write` (starter .mm3/config.yaml), null-section tolerance and near-miss file names.
// [C-226] [C-227] [C-228]: see docs/contract.md's config claims. Uses the real loader/validator on real files.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { formatConfig, nearMissNotes, runConfig, runConfigWrite, starterConfig } from '../../src/config/config.ts';
import { resolveConfig } from '../../src/config/load.ts';
import { validateConfig } from '../../src/config/validate.ts';
import { runDoctor } from '../../src/verbs/doctor.ts';
import { tempProject } from '../helpers/project.ts';

/** The setting lines of the starter (everything after the commented front matter), one per uncommentable line. */
function settingLines(text: string): string[] {
  const lines = text.split('\n');
  const first = lines.findIndex((l) => l !== '' && !l.startsWith('#'));
  return lines.slice(first).filter((l) => /^# +\S/.test(l));
}
const uncomment = (text: string, line: string): string => text.replace(line, line.replace(/^# /, ''));

describe('[C-226] starter config (mm3 config --write)', () => {
  it('is valid as written: no stops, no overrides, front matter first, no wrapper keys', () => {
    const text = starterConfig();
    expect(text.startsWith('# ')).toBe(true);
    for (const wrapper of ['config:', 'project:', 'notes:']) expect(text).not.toMatch(new RegExp(`^${wrapper}`, 'm'));
    const { paths } = tempProject({ '.mm3/config.yaml': text });
    const r = resolveConfig(paths, {});
    expect(r.stops).toEqual([]);
    expect(Object.values(r.sources).filter((s) => s === 'config')).toEqual([]);
    expect(text).toContain('environment variable > this file > built-in default');
    expect(text).toContain('Safe to commit');
    expect(text).toMatch(/^budget:/m);
  });

  it('stays valid with any ONE value line uncommented (every setting, every section)', () => {
    const text = starterConfig();
    const lines = settingLines(text);
    expect(lines.length).toBeGreaterThan(15);
    for (const line of lines) {
      const { stops } = validateConfig(parse(uncomment(text, line)));
      expect(stops, line).toEqual([]);
    }
  });

  it('stays valid with EVERY value line uncommented at once, and each takes effect', () => {
    let text = starterConfig();
    for (const line of settingLines(text)) text = uncomment(text, line);
    const { paths } = tempProject({ '.mm3/config.yaml': text });
    const r = resolveConfig(paths, {});
    expect(r.stops).toEqual([]);
    expect(r.sources['budget.usd']).toBe('config');
    expect(r.sources['sweep.maxItems']).toBe('config');
  });

  it('shows the same values as the display: the defaults table and examples, not a second copy', () => {
    const { paths } = tempProject();
    const display = formatConfig(resolveConfig(paths, {}), '.');
    const body = starterConfig();
    for (const frag of ['usd: 5', 'runs: 500', 'per: total', 'inputPerMTok: 0.042', 'timeoutMs: 20000', 'retries: 2', 'backoffMs: 1000', 'maxQuestionsPerCall: 500', 'requestMaxBytes: 1048576', 'maxItems: 30', 'provider: typesafe', 'model: jev-1.13.0']) {
      expect(body, frag).toContain(frag);
      expect(display, frag).toContain(frag);
    }
  });

  it('runConfigWrite writes only a missing file (with .gitignore un-ignoring it) and never overwrites', () => {
    const { root, paths } = tempProject();
    const first = runConfigWrite(paths, '.');
    expect(first.exit).toBe(0);
    expect(first.text).toContain('wrote: .mm3/config.yaml');
    expect(readFileSync(paths.config, 'utf8')).toBe(starterConfig());
    expect(readFileSync(path.join(root, '.mm3', '.gitignore'), 'utf8')).toContain('!config.yaml');
    writeFileSync(paths.config, 'budget:\n  usd: 9\n');
    const second = runConfigWrite(paths, '.');
    expect(second.exit).toBe(0);
    expect(second.text).toContain('.mm3/config.yaml already exists');
    expect(second.text).not.toContain('✖');
    expect(readFileSync(paths.config, 'utf8')).toBe('budget:\n  usd: 9\n');
  });

  it('no project: a help-first stop, nothing created', () => {
    const r = runConfigWrite(undefined, 'none');
    expect(r.exit).toBe(2);
    expect(r.text).toMatch(/^✖ config: .* → /);
  });

  it('the display points at --write when there is no file, and names the path when there is one', () => {
    const { paths } = tempProject();
    const missing = runConfig({}, paths, '.');
    expect(missing.exit).toBe(0);
    expect(missing.text).toContain('to customize: run mm3 config --write → writes .mm3/config.yaml with a commented guide');
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.config, 'budget:\n  usd: 9\n');
    const present = runConfig({}, paths, '.');
    expect(present.text).toContain('.mm3/config.yaml');
    expect(present.text).not.toContain('to customize');
  });
});

describe('[C-227] a section with every child commented out means no overrides', () => {
  it('null budget, pricing (and a null model entry), sweep, reuse and mdl (and a null field) pass with no stops', () => {
    const { paths } = tempProject({ '.mm3/config.yaml': 'budget:\nsweep:\nreuse:\nmdl:\npricing:\n' });
    expect(resolveConfig(paths, {}).stops).toEqual([]);
    const nested = tempProject({ '.mm3/config.yaml': 'pricing:\n  jev-1.13.0:\nmdl:\n  risk:\n' });
    const r = resolveConfig(nested.paths, {});
    expect(r.stops).toEqual([]);
    expect(r.config.pricing['jev-1.13.0']).toEqual({ inputPerMTok: 0.042 }); // the built-in rate survives a null entry
    expect(r.config.mdl).toEqual({});
  });

  it('a scalar where a mapping belongs is still a stop', () => {
    expect(validateConfig({ sweep: 5 }).stops[0]?.text).toBe('✖ config.sweep: is not a mapping → write maxItems:, maxQuestionsPerCall: and/or itemsPerLayer: under sweep:');
  });
});

describe('[C-228] near-miss config file names', () => {
  it.each(['config.yml', 'config.ymal', 'config.yaml.txt', 'config.json', 'Config.yaml'])('%s gets a did-you-mean note in config and doctor', (name) => {
    const { paths } = tempProject();
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(path.join(paths.dir, name), 'budget:\n  usd: 1\n');
    const note = `found .mm3/${name} — did you mean config.yaml? → rename it`;
    expect(nearMissNotes(paths)).toEqual([note]);
    const r = runConfig({}, paths, '.');
    expect(r.exit).toBe(0);
    expect(r.text).toContain(note);
    expect(existsSync(paths.config)).toBe(false);
  });

  it('no note when config.yaml exists, or when .mm3/ holds only ledger files', () => {
    const { paths } = tempProject({ '.mm3/config.yaml': 'budget:\n', '.mm3/config.yml': 'x: 1\n' });
    expect(nearMissNotes(paths)).toEqual([]);
    const other = tempProject({ '.mm3/log.jsonl': '', '.mm3/budget.json': '{}' });
    expect(nearMissNotes(other.paths)).toEqual([]);
    expect(nearMissNotes(undefined)).toEqual([]);
  });

  it('doctor shows the note too', () => {
    const { paths } = tempProject({ '.mm3/config.ymal': 'budget:\n' });
    const r = runDoctor({}, paths, 'v22.13.0');
    expect(r.text).toContain('found .mm3/config.ymal — did you mean config.yaml? → rename it');
  });
});

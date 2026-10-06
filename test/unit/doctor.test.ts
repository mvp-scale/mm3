// doctor: plumbing, not a verb (owner ruling, P5) — free (no call, no budget, no ledger write). Reports the
// resolved provider/route/base URL, whether a key is set (never its value), project/ledger location and the
// Node/node:sqlite runtime; exit 2 with a ✖ line when the config itself is invalid.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runConfigLoad } from '../../src/config/config.ts';
import { envFilePath, setEnvFileValue } from '../../src/setup/env-file.ts';
import { writeInstallRecord } from '../../src/setup/install-record.ts';
import type { RunResult, Runner } from '../../src/setup/runner.ts';
import { runDoctor, runDoctorFile } from '../../src/verbs/doctor.ts';
import { tempProject } from '../helpers/project.ts';

function tmpXdg(): { XDG_CONFIG_HOME: string } {
  return { XDG_CONFIG_HOME: mkdtempSync(path.join(os.tmpdir(), 'mm3-doctor-')) };
}

/** A `mm3` on a PATH folder that is a symlink into a package of the given version, the way an npm global install lays it out. */
function fakeCliOnPath(version: string): { pathDir: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'mm3-clipkg-'));
  mkdirSync(path.join(root, 'dist'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@mvpscale/mm3', version }));
  writeFileSync(path.join(root, 'dist', 'cli.js'), '#!/usr/bin/env node\n');
  const pathDir = path.join(root, 'bin');
  mkdirSync(pathDir);
  symlinkSync(path.join(root, 'dist', 'cli.js'), path.join(pathDir, 'mm3'));
  chmodSync(path.join(root, 'dist', 'cli.js'), 0o755);
  return { pathDir };
}

describe('doctor (P5)', () => {
  it('no key, no project: the fake provider, "key: no", project "none"', () => {
    const r = runDoctor({}, undefined, 'v22.13.0');
    expect(r.exit).toBe(0);
    expect(r.text).toContain('doctor:');
    expect(r.text).toContain('provider: fake');
    expect(r.text).toContain('route: fake');
    expect(r.text).toContain('key: no');
    expect(r.text).not.toContain('keys:'); // the old TYPESAFE_API_KEY/AI_GATEWAY_API_KEY map is gone — key: covers it
    expect(r.text).toContain('project: none');
    expect(r.text).toContain('node: v22.13.0');
    expect(r.text).not.toContain('baseURL');
    expect(r.text).toContain('actor: agent (default) → set MM3_ACTOR to change');
  });

  // Fix #18: every run/outcome defaults to `by: agent`; doctor shows what will actually be used, so the
  // resolved value (MM3_ACTOR, set for real MCP calls by cli.ts's mcp wiring — see src/mcp/actor.ts) is
  // visible without a paid run. [C-143]
  it('actor: shows a set MM3_ACTOR verbatim', () => {
    const r = runDoctor({ MM3_ACTOR: 'dev' }, undefined, 'v22.13.0');
    expect(r.text).toContain('actor: dev');
  });

  it('actor: blank/whitespace-only MM3_ACTOR reads as unset, same as pay.ts\'s own actorOf', () => {
    const r = runDoctor({ MM3_ACTOR: '   ' }, undefined, 'v22.13.0');
    expect(r.text).toContain('actor: agent (default) → set MM3_ACTOR to change');
  });

  it('a direct key: shows the route and base URL, never the key value', () => {
    const key = 'sk-' + 'A'.repeat(24);
    const r = runDoctor({ TYPESAFE_API_KEY: key }, undefined);
    expect(r.exit).toBe(0);
    expect(r.text).not.toContain(key);
    expect(r.text).toContain('provider: typesafe');
    expect(r.text).toContain('route: direct');
    expect(r.text).toContain('baseURL: https://api.typesafe.ai');
    expect(r.text).toContain('key: yes · from env TYPESAFE_API_KEY');
  });

  it('the gateway route also shows the wire model', () => {
    const r = runDoctor({ AI_GATEWAY_API_KEY: 'g' }, undefined);
    expect(r.exit).toBe(0);
    expect(r.text).toContain('route: gateway');
    expect(r.text).toContain('baseURL: https://ai-gateway.vercel.sh/typesafe');
    expect(r.text).toContain('wireModel: typesafe-ai/jev');
  });

  it('MM3_PROVIDER=chaos names chaos, no base URL', () => {
    const r = runDoctor({ MM3_PROVIDER: 'chaos' }, undefined);
    expect(r.text).toContain('provider: chaos');
    expect(r.text).toContain('route: chaos');
    expect(r.text).not.toContain('baseURL');
  });

  it('a project is found: names its root, not "none", and says whether the plugin is enabled here [C-102]', () => {
    const { paths } = tempProject({});
    const r = runDoctor({}, paths);
    expect(r.exit).toBe(0);
    expect(r.text).not.toContain('project: none');
    // Quoted: the value contains ": " (from "plugin enabled here:"), which emit()'s scalar() always quotes.
    expect(r.text).toContain(`project: "${path.relative(process.cwd(), paths.root)} · plugin enabled here: no"`);
  });

  it('"plugin enabled here" is yes when the plugin is installed at project scope [C-102]', () => {
    const { paths } = tempProject({});
    const runner: Runner = (): RunResult => ({ status: 0, stdout: JSON.stringify([{ name: 'mm3', scope: 'project' }]), stderr: '' });
    const r = runDoctor({}, paths, undefined, { runner });
    expect(r.text).toContain('plugin enabled here: yes');
  });

  it('"plugin enabled here" is also yes for a user-scope install — it applies to every project [C-102]', () => {
    const { paths } = tempProject({});
    const runner: Runner = (): RunResult => ({ status: 0, stdout: JSON.stringify([{ name: 'mm3', scope: 'user' }]), stderr: '' });
    const r = runDoctor({}, paths, undefined, { runner });
    expect(r.text).toContain('plugin enabled here: yes');
  });

  it('"plugin enabled here" is also yes for a local-scope install (best-effort: no per-entry project path to match against) [C-102]', () => {
    const { paths } = tempProject({});
    const runner: Runner = (): RunResult => ({ status: 0, stdout: JSON.stringify([{ name: 'mm3', scope: 'local' }]), stderr: '' });
    const r = runDoctor({}, paths, undefined, { runner });
    expect(r.text).toContain('plugin enabled here: yes');
  });

  it('"plugin enabled here" is no when nothing is installed at any scope [C-102]', () => {
    const { paths } = tempProject({});
    const runner: Runner = (): RunResult => ({ status: 0, stdout: '[]', stderr: '' });
    const r = runDoctor({}, paths, undefined, { runner });
    expect(r.text).toContain('plugin enabled here: no');
  });

  it('reports whether node:sqlite is available on this (new-enough) runtime', () => {
    const r = runDoctor({}, undefined);
    expect(r.text).toMatch(/index: (node:sqlite|unavailable \(unexpected on Node 22\.13\+\))/);
  });

  describe('the Node ≥ 22.13 guard (owner ruling) [C-106]', () => {
    it('too old a Node: doctor still runs (exit 2, not a bare stop) and names it in node:/index:', () => {
      const r = runDoctor({}, undefined, 'v20.11.0');
      expect(r.exit).toBe(2);
      expect(r.text).toContain('doctor:'); // the full doc still renders — never just a bare ✖ line
      expect(r.text).toContain('node: v20.11.0 ✖ too old → install Node 22.13+');
      expect(r.text).toContain('index: none (needs Node 22.13+)');
    });

    it('exactly 22.13.0 is new enough: exit 0, plain node value, no ✖', () => {
      const r = runDoctor({}, undefined, 'v22.13.0');
      expect(r.exit).toBe(0);
      expect(r.text).toContain('node: v22.13.0');
      expect(r.text).not.toContain('✖ too old');
    });

    it('22.12.x is still too old — the minor version is a real cutoff, not just the major', () => {
      const r = runDoctor({}, undefined, 'v22.12.9');
      expect(r.exit).toBe(2);
      expect(r.text).toContain('✖ too old');
    });

    it('a newer major (e.g. v24) is always new enough', () => {
      const r = runDoctor({}, undefined, 'v24.0.0');
      expect(r.exit).toBe(0);
      expect(r.text).not.toContain('✖ too old');
    });
  });

  it('a floating JEV_MODEL: exit 2, the same ✖ message a paid verb would give', () => {
    const r = runDoctor({ JEV_MODEL: 'jev-latest' }, undefined);
    expect(r.exit).toBe(2);
    expect(r.text).toMatch(/^JEV_MODEL="jev-latest" floats/);
  });

  it('a bad TYPESAFE_BASE_URL: exit 2, ✖ TYPESAFE_BASE_URL [C-095]', () => {
    const r = runDoctor({ TYPESAFE_BASE_URL: 'http://example.com' }, undefined);
    expect(r.exit).toBe(2);
    expect(r.text).toMatch(/^✖ TYPESAFE_BASE_URL:/);
  });

  it('never leaks a key substring, even alongside an invalid config [C-095]', () => {
    const key = 'sk-' + 'B'.repeat(24);
    const ok = runDoctor({ AI_GATEWAY_API_KEY: key }, undefined);
    expect(ok.text).not.toContain(key);
    const bad = runDoctor({ AI_GATEWAY_API_KEY: key, JEV_MODEL: 'jev-latest' }, undefined);
    expect(bad.text).not.toContain(key);
  });

  describe('the key/cli/plugin lines [C-098]', () => {
    it('no key anywhere: the exact "run mm3 init" line', () => {
      const r = runDoctor({}, undefined);
      expect(r.text).toContain('key: no  → run "mm3 init" to add one');
    });

    // [C-190] Inside the plugin's own bundled MCP server (CLAUDE_PLUGIN_ROOT set), "mm3 init" isn't
    // reachable from here, so the hint points at the config dialog instead.
    it('no key, inside the plugin (CLAUDE_PLUGIN_ROOT set): points at /plugin → MM3 → Configure', () => {
      const r = runDoctor({ CLAUDE_PLUGIN_ROOT: '/plugins/mm3' }, undefined);
      expect(r.text).toContain(
        'key: none (sample answers only) → /plugin → MM3 → Configure → press Enter on "TypeSafe API key", paste, Enter, Save configuration',
      );
      expect(r.text).not.toContain('run "mm3 init" to add one');
    });

    it('no key, CLAUDE_PLUGIN_ROOT blank: still the terminal hint, not the plugin one', () => {
      const r = runDoctor({ CLAUDE_PLUGIN_ROOT: '' }, undefined);
      expect(r.text).toContain('key: no  → run "mm3 init" to add one');
    });

    it('an env key, with no deps.resolveStored injected: named by its env var, no "(overrides stored)"', () => {
      const key = 'sk-' + 'C'.repeat(24);
      const r = runDoctor({ TYPESAFE_API_KEY: key }, undefined);
      expect(r.text).toContain('key: yes · from env TYPESAFE_API_KEY');
      expect(r.text).not.toContain('overrides stored');
      expect(r.text).not.toContain(key);
    });

    it('an env key that also has a stored key underneath it: "(overrides stored)"', () => {
      const key = 'sk-' + 'D'.repeat(24);
      const r = runDoctor({ AI_GATEWAY_API_KEY: key }, undefined, undefined, {
        resolveStored: () => ({ apiKey: 'stored-elsewhere', source: 'file', provider: 'typesafe' }),
      });
      expect(r.text).toContain('key: yes · from env AI_GATEWAY_API_KEY (overrides stored)');
    });

    it('a keychain-resolved key: the exact literal line, and provider/route follow it too', () => {
      const r = runDoctor({}, undefined, undefined, { resolveStored: () => ({ apiKey: 'kc-key', source: 'keychain', provider: 'typesafe' }) });
      expect(r.text).toContain('key: yes · from OS keychain (encrypted, per user)');
      expect(r.text).toContain('provider: typesafe');
      expect(r.text).not.toContain('kc-key');
    });

    it('a file-resolved key: names the exact path and its mode', () => {
      const env = tmpXdg();
      const file = envFilePath(env);
      setEnvFileValue(file, 'TYPESAFE_API_KEY', 'file-key');
      const r = runDoctor(env, undefined, undefined, { resolveStored: () => ({ apiKey: 'file-key', source: 'file', provider: 'typesafe' }) });
      expect(r.text).toContain(`key: yes · from user file ${file} (0600, not encrypted)`);
      expect(r.text).not.toContain('file-key');
    });

    it('cli: names install.json\'s mode and prefix when a record exists', () => {
      const env = tmpXdg();
      writeInstallRecord(env, { mode: 'user', npmPrefix: '/opt/u/.local', installedAt: '2026-09-27T00:00:00Z' });
      const r = runDoctor(env, undefined);
      expect(r.text).toMatch(/cli: .* · installed --user \(npm prefix \/opt\/u\/\.local\)/);
    });

    it('cli: no PATH match and no install record → the exact stop-and-fix line', () => {
      const r = runDoctor({ PATH: '/does/not/exist' }, undefined);
      expect(r.text).toContain('cli: not on PATH → run "mm3 init" to install it');
    });

    it('cli: a copy on PATH of a different version than the one running is flagged, with the fix', () => {
      const { pathDir } = fakeCliOnPath('0.0.1');
      const r = runDoctor({ PATH: pathDir }, undefined, undefined, { version: '9.9.9' });
      expect(r.text).toContain('cli: ');
      expect(r.text).toContain('⚠ version 0.0.1, this is 9.9.9 → run "mm3 init" to match them');
    });

    it('cli: a copy on PATH of the same version says nothing extra', () => {
      const { pathDir } = fakeCliOnPath('9.9.9');
      const r = runDoctor({ PATH: pathDir }, undefined, undefined, { version: '9.9.9' });
      expect(r.text).not.toContain('⚠ version');
    });

    it('plugin: with no deps.runner injected, always reads as not installed (never spawns claude for real)', () => {
      const r = runDoctor({}, undefined);
      expect(r.text).toContain('plugin: not installed → "mm3 init --claude"');
    });

    it('plugin: installed, named scope, through an injected runner', () => {
      const runner: Runner = (): RunResult => ({ status: 0, stdout: JSON.stringify([{ name: 'mm3', scope: 'user' }]), stderr: '' });
      const r = runDoctor({}, undefined, undefined, { runner });
      expect(r.text).toContain('plugin: mm3@mvp-scale · user scope');
    });

    it('plugin: user scope ONLY nudges toward project scope — using MM3 is per project [C-177]', () => {
      const runner: Runner = (): RunResult => ({ status: 0, stdout: JSON.stringify([{ name: 'mm3', scope: 'user' }]), stderr: '' });
      const r = runDoctor({}, undefined, undefined, { runner });
      expect(r.text).toContain('plugin: mm3@mvp-scale · user scope (every project) → for just this one, "mm3 init --scope project"');
    });

    it('plugin: project scope present → no user-only nudge', () => {
      const runner: Runner = (): RunResult => ({ status: 0, stdout: JSON.stringify([{ name: 'mm3', scope: 'project' }]), stderr: '' });
      const r = runDoctor({}, undefined, undefined, { runner });
      expect(r.text).toContain('plugin: mm3@mvp-scale · project scope');
      expect(r.text).not.toContain('mm3 init --scope project');
    });
  });

  // bare `mm3 doctor` also validates .mm3/config.yaml when present.
  describe('the config: field', () => {
    it('no project at all: config: defaults', () => {
      const r = runDoctor({}, undefined);
      expect(r.text).toContain('config: "✔ config: defaults"');
    });

    it('a project with no config.yaml: config: defaults', () => {
      const { paths } = tempProject({});
      const r = runDoctor({}, paths);
      expect(r.text).toContain('config: "✔ config: defaults"');
    });

    it('a clean override file that has been loaded: config: loaded <time>', () => {
      const { paths } = tempProject({ '.mm3/config.yaml': 'budget:\n  usd: 10\nprovider: fake\n' });
      expect(runConfigLoad(paths, undefined, paths.root, '.').exit).toBe(0);
      const r = runDoctor({}, paths);
      expect(r.text).toMatch(/config: "✔ config: loaded \d{4}-\d\d-\d\dT[\d:.]+Z"/);
    });

    it('a config.yaml that was never loaded is in effect but flagged as not recorded', () => {
      const { paths } = tempProject({ '.mm3/config.yaml': 'budget:\n  usd: 10\n' });
      expect(runDoctor({}, paths).text).toContain('⚠ config.yaml is in effect but its latest change is not recorded → mm3 config --load');
    });

    it('a broken config.yaml: every problem in one pass, same ✖ config.<path> shape mm3 config uses', () => {
      const { paths } = tempProject({ '.mm3/config.yaml': 'budget:\n  usd: -1\nnope: true\n' });
      const r = runDoctor({}, paths);
      expect(r.exit).toBe(0); // a bad config.yaml is reported, not fatal to the rest of the doctor report
      expect(r.text).toContain('✖ config.budget.usd:');
      expect(r.text).toContain('✖ config.nope:');
    });
  });
});

const VALID_CLASS_REQUEST = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');

describe('runDoctorFile', () => {
  it('a request-shaped document (mak:) is checked the same way --dry-run would', () => {
    const r = runDoctorFile(VALID_CLASS_REQUEST);
    expect(r.exit).toBe(0);
    expect(r.text).toBe('✔ request: valid → checked as class');
  });

  it('an explicit mak.verb is honored over the class default', () => {
    const r = runDoctorFile('mak:\n  goal: verify the fix\n  parent: MM3-0001\n  compare: {before: a, after: b}\n  expect: none\n  verb: replay\n');
    expect(r.exit).toBe(0);
    expect(r.text).toBe('✔ request: valid → checked as replay');
  });

  it('an invalid request: the same ✖ field: problem → fix shape, pointed at the inferred verb\'s own agent card', () => {
    const r = runDoctorFile('mak:\n  goal: x\n');
    expect(r.exit).toBe(2);
    expect(r.text).toContain('✖ mak.goal:');
    // loadRequest's own stopText points at the verb it validated against (class, the fallback here) — the
    // same pointer every other class-verb stop gets, not a doctor-specific one.
    expect(r.text).toContain('→ see: mm3 agent class');
  });

  it('never touches the ledger/reuse/budget: a valid request with no project at all still just validates', () => {
    // no project/ledger exists at all here — if this reached ledger lookups it would throw, not stop cleanly.
    const r = runDoctorFile(VALID_CLASS_REQUEST);
    expect(r.exit).toBe(0);
  });

  it('anything without a top-level mak: is checked as a config file', () => {
    const r = runDoctorFile('budget:\n  usd: 10\n');
    expect(r).toEqual({ exit: 0, text: '✔ config: valid' });
  });

  it('a bad config file: every problem in one pass', () => {
    const r = runDoctorFile('budget:\n  usd: -1\nnope: true\n');
    expect(r.exit).toBe(2);
    expect(r.text).toContain('✖ config.budget.usd:');
    expect(r.text).toContain('✖ config.nope:');
    expect(r.text).toContain('→ see: mm3 agent doctor');
  });

  it('a YAML syntax error in a config-shaped file: the line number, not a crash', () => {
    const r = runDoctorFile('budget:\n  usd: [1, 2\n');
    expect(r.exit).toBe(2);
    expect(r.text).toMatch(/✖ config: line \d+ does not parse/);
  });

  it('an empty document is valid config (nothing to override)', () => {
    const r = runDoctorFile('');
    expect(r).toEqual({ exit: 0, text: '✔ config: valid' });
  });

  // Controller-found defect: a contract cross-stop (sections/angles/counts) already embeds its own
  // "→ see: mm3 agent probe" pointer; loadRequest's stopText then appends a second, generic
  // "→ see: mm3 agent <verb>" at the very end. Fine for a real verb's --dry-run (schema-check.ts's own
  // header comment says that pointer is deliberately additional there), but doctor is meant to print each stop
  // once with a SINGLE trailing pointer.
  it('a request with a contract cross-stop: exactly one trailing → see: pointer, not two', () => {
    const text = [
      'mak:',
      '  goal: This login handler is safe to merge',
      '  depth: quick',
      '  where: [src/user.ts:1-3]',
      '  ask:',
      '    concerns:',
      '      injection:',
      '        pass: no',
      '        1: Is request text placed directly into the SQL query?',
      '        2: Is the query built with string concatenation instead of a bound parameter?',
      '        3: Does the query run with db.query on that concatenated string?',
      '    decisions:',
      '      severity:',
      '        pass: [none, low]',
      '        10:',
      '          scale: How severe is the worst issue?',
      '          levels: [none, low, medium, high, critical]',
      '      route:',
      '        pass: [ship]',
      '        11:',
      '          choice: Where should this go?',
      '          options: [ship, fix, block]',
      '',
    ].join('\n');
    const r = runDoctorFile(text);
    expect(r.exit).toBe(2);
    const pointers = r.text.match(/→ see:/g) ?? [];
    expect(pointers).toHaveLength(1);
    expect(r.text.trim().endsWith('→ see: mm3 agent class')).toBe(true);
  });
});

// The agentic harness can test the standalone file instead of the npm package [C-267]: the agent's `mm3` runs the file, its PATH has
// no Node, every row says which build it tested, and the job about it runs only when a standalone is given. All offline.
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { definitionOf } from '../../scripts/agentic/ledger.ts';
import { claudeProgram } from '../../scripts/agentic/claude.ts';
import { describeStandalone, nodeLeaks, resolveOnPath, runFull, shimExec, systemToolsDir, type FullScenario, type Rules } from '../../scripts/agentic/run.ts';
import { toLedgerRows } from '../../scripts/agentic/record.ts';
import { parseTrialArgs } from '../../scripts/agentic/trial.ts';

const spec = JSON.parse(readFileSync('test/agentic/scenarios/baseline.json', 'utf8')) as { full: FullScenario[]; rules: Rules };
const tmp = (): string => mkdtempSync(path.join(os.tmpdir(), 'mm3-standalone-test-'));
/** A stand-in for the standalone: an executable that answers --version and echoes its arguments. */
function fakeStandalone(): string {
  const file = path.join(tmp(), 'mm3-9.9.9-linux-x64');
  writeFileSync(file, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 9.9.9; else echo "ran:$*"; fi\n');
  chmodSync(file, 0o755);
  return file;
}

describe('the standalone as the tool under test [C-267]', () => {
  it('[C-267] --bin or MM3_BIN names the file, --bin wins, and the standalone is CLI route only', () => {
    expect(parseTrialArgs(['B1n-class-a-file-no-node', '--bin', 'dist-binary/mm3-x'], {}).bin).toBe('dist-binary/mm3-x');
    expect(parseTrialArgs(['B1n-class-a-file-no-node'], { MM3_BIN: '/env/mm3' }).bin).toBe('/env/mm3');
    expect(parseTrialArgs(['B1n-class-a-file-no-node', '--bin', '/flag/mm3'], { MM3_BIN: '/env/mm3' }).bin).toBe('/flag/mm3');
    expect(parseTrialArgs(['B1n-class-a-file-no-node'], {}).bin).toBeUndefined();
    expect(parseTrialArgs(['B1n-class-a-file-no-node', '--bin', '/flag/mm3'], {}).job).toBe('B1n-class-a-file-no-node'); // the path is not mistaken for the job
    expect(() => parseTrialArgs(['B1n-class-a-file-no-node', '--bin'], {})).toThrow(/--bin needs the standalone file/u);
    expect(() => parseTrialArgs(['B1-class-a-file', '--bin', '/x', '--route', 'mcp'], {})).toThrow(/CLI route only/u);
  });

  it('[C-267] the file is described by what it is: absolute path, sha256, size and the version it prints', () => {
    const file = fakeStandalone();
    const d = describeStandalone(file);
    expect(d).toMatchObject({ file, version: '9.9.9', size: readFileSync(file).length });
    expect(d.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(() => describeStandalone(path.join(tmp(), 'missing'))).toThrow(/is not a file → build one/u);
  });

  it('[C-267] the agent\'s `mm3` resolves to a shim that runs the file; its PATH (shim plus system tools) finds no node, npm or npx', () => {
    const file = fakeStandalone();
    const shim = shimExec(file);
    const agentPath = `${shim}:${systemToolsDir()}`;
    expect(resolveOnPath('mm3', agentPath)).toBe(path.join(shim, 'mm3'));
    for (const name of ['node', 'npm', 'npx']) expect(resolveOnPath(name, agentPath)).toBeNull();
    expect(resolveOnPath('sh', agentPath)).not.toBeNull();
    const ran = spawnSync('/bin/sh', ['-c', 'mm3 class x'], { encoding: 'utf8', env: { PATH: agentPath } });
    expect(ran.stdout.trim()).toBe('ran:class x'); // the shim reached the file
    expect(resolveOnPath('node', process.env.PATH ?? '')).not.toBeNull(); // and the check can tell: this machine's own PATH does have node
  });

  it('[C-267] the tools folder links system programs and no JavaScript runtime', () => {
    const names = readdirSync(systemToolsDir());
    expect(names).toEqual(expect.arrayContaining(['sh', 'cat', 'ls', 'grep']));
    expect(names.filter((n) => /^(node|npm|npx|nodejs|bun|deno|tsx)$/u.test(n))).toEqual([]);
  });

  it('[C-267] variables that hand over the harness\'s own Node are blanked, and nothing else is touched', () => {
    const leaks = nodeLeaks({ npm_node_execpath: '/usr/bin/node', NODE: '/usr/bin/node', NODE_OPTIONS: '--x', npm_config_cache: '/c', INIT_CWD: '/p', _: '/usr/bin/npm', MM3_BIN: '/b', HOME: '/h', PATH: '/p', MM3_PROVIDER: 'fake' });
    expect(Object.keys(leaks).sort()).toEqual(['INIT_CWD', 'MM3_BIN', 'NODE', 'NODE_OPTIONS', '_', 'npm_config_cache', 'npm_node_execpath']);
    expect(Object.values(leaks).every((v) => v === '')).toBe(true);
  });

  it('[C-267] the job about it exists beside B1: same question and checkpoints, CLI route, standalone only', () => {
    const b1 = spec.full.find((s) => s.id === 'B1-class-a-file')!;
    const n = spec.full.find((s) => s.id === 'B1n-class-a-file-no-node')!;
    expect(n.prompt).toBe(b1.prompt); // like for like: the agent reads the same words
    expect(n.checkpoints).toEqual(b1.checkpoints);
    expect(n).toMatchObject({ routes: ['cli'], build: 'standalone' });
    expect(definitionOf({ full: [b1], rules: spec.rules } as never, { tag: 't', sha: 's' }).scenarios[0]).not.toHaveProperty('build'); // an existing job's definition is unchanged
    expect(definitionOf({ full: [n], rules: spec.rules } as never, { tag: 't', sha: 's' }).scenarios[0]).toMatchObject({ build: 'standalone' });
  });

  it('[C-267] without a standalone, a job that tests it is skipped out loud and nothing runs', () => {
    const n = spec.full.find((s) => s.id === 'B1n-class-a-file-no-node')!;
    const lines: string[] = [];
    expect(runFull([n], 'x', spec.rules, (l) => lines.push(l), undefined, { build: { bin: '/nonexistent', plugin: '' }, models: ['sonnet'], trials: 1 })).toEqual([]);
    expect(lines.join('\n')).toMatch(/B1n-class-a-file-no-node skipped: it tests the standalone file → give one with --bin/u);
  });

  it('[C-267] each ledger row carries the build it tested', () => {
    const row = { id: 'J', route: 'cli', model: 'sonnet', resolvedModel: null, trial: 1, pass: true, checks: [], attempts: [1], firstRequestAccepted: true, mm3Calls: 1, problems: [], usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, turns: 1 }, economics: {}, recovery: { stops: 0, onTrack: 0, fixedNext: 0 }, build: { kind: 'standalone', version: '0.1.3', sha256: 'ab', nodeOnPath: false } } as never;
    expect(toLedgerRows([row])[0]!.build).toEqual({ kind: 'standalone', version: '0.1.3', sha256: 'ab', nodeOnPath: false });
    expect(existsSync('scripts/agentic/run.ts')).toBe(true);
  });
});

describe('the agent can be given a PATH without claude [C-267]', () => {
  it('[C-267] claude is found on the harness\'s PATH, so a Node-free agent PATH does not stop it from starting', () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\n');
    chmodSync(path.join(dir, 'claude'), 0o755);
    expect(claudeProgram(`/nonexistent:${dir}`)).toBe(path.join(dir, 'claude'));
    expect(claudeProgram('/nonexistent')).toBe('claude');
  });
});

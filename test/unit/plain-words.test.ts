// Plain words at the boundary [C-197]: a raw system error never reaches the caller. A missing project folder, a
// ledger file that is a folder and a template source that is not valid YAML each come back as one
// "✖ <area>: <what> → <fix>" line plus the agent pointer, with no EISDIR / ENOENT / "cannot be stringified" in it.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runCli, type CliCtx } from '../../src/cli.ts';
import { clip } from '../../src/util/text.ts';
import { tempProject } from '../helpers/project.ts';

function ctxIn(cwd: string, env: Record<string, string | undefined> = {}): CliCtx {
  return {
    env: { MM3_PROVIDER: 'fake', ...env },
    cwd,
    platform: process.platform,
    runner: () => ({ status: 1, stdout: '', stderr: '' }),
    packageDir: process.cwd(),
    pkg: { name: '@mvpscale/mm3', version: '9.9.9-test' },
    homeDir: '/nonexistent-home',
    nodeVersion: process.version,
    stdin: () => Buffer.from(''),
    io: { input: new PassThrough(), output: new PassThrough() },
  };
}

const RAW = /EISDIR|ENOENT|EACCES|spawnSync|cannot be stringified|illegal operation/u;

describe('plain words at the boundary [C-197]', () => {
  it('a project folder that does not exist is named, not reported as a missing src file or an unwritable lock', async () => {
    const { root } = tempProject({});
    for (const argv of [['class', '-'], ['view', 'src'], ['budget']]) {
      const r = await runCli(argv, ctxIn(root, { MM3_HOME: path.join(root, 'no', 'such', 'folder') }));
      expect(r.exit, argv.join(' ')).toBe(2);
      expect(r.text).toMatch(/^✖ project: "(?:.*no[\\/]+such[\\/]+folder|.{79}…)" is not a folder → give an existing project folder \(MM3_HOME, or the plugin's project field\)\n→ see: mm3 agent \w+\n$/u);
      expect(r.text).not.toMatch(RAW);
    }
  });

  it('a ledger file that is a folder is one plain line, exit 1', async () => {
    const { root } = tempProject({ 'src/user.ts': 'export const a = 1;\n' });
    mkdirSync(path.join(root, '.mm3', 'log.jsonl'), { recursive: true });
    const r = await runCli(['view', 'src'], ctxIn(root, { MM3_HOME: root }));
    expect(r.exit).toBe(1);
    expect(r.text).toMatch(/^✖ files: a file MM3 reads is a folder.* → check \.mm3\/ \(log\.jsonl and budget\.json are files, the folder is writable\), then re-run\n→ see: mm3 agent view\n$/u);
    expect(r.text).not.toMatch(RAW);
  });

  it('template --from a file with a tab for indentation is one plain line, exit 1 as before', async () => {
    const { root } = tempProject({});
    const bad = path.join(root, 'bad.yaml');
    writeFileSync(bad, 'mak:\n\tgoal: x\n');
    const r = await runCli(['template', 'class', '--from', bad], ctxIn(root, { MM3_HOME: root }));
    expect(r.exit).toBe(1);
    expect(r.text).toBe(`✖ template: --from "${clip(bad, 60)}" is not valid YAML → fix it (YAML indents with spaces, never tabs), or point at an MM3 request file\n→ see: mm3 agent template\n`);
  });
});

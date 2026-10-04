// mm3 init --agents [C-233]: writes the short MM3 pointer block into the project's AGENTS.md between
// <!-- mm3:agents --> markers (and wires CLAUDE.md to import AGENTS.md), shows exactly what it will write
// first, and writes only on --yes or an explicit yes. Only this one step runs: no npm, no key, no plugin.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../../src/cli.ts';
import { AGENT_POINTER } from '../../../src/help/guidance.ts';
import { type InitCtx, type InitFlags, runInit } from '../../../src/setup/init.ts';

const BLOCK = `<!-- mm3:agents -->\n${AGENT_POINTER}\n<!-- /mm3:agents -->`;
const FLAGS: InitFlags = { key: 'no', yes: true, agents: true };

function project(files: Record<string, string> = {}): { root: string; ctx: InitCtx; typed: (s: string) => void } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'mm3-agents-'));
  mkdirSync(path.join(root, '.git'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  const input = Object.assign(new PassThrough(), { isTTY: true });
  const output = Object.assign(new PassThrough(), { isTTY: true });
  const ctx: InitCtx = {
    env: { PATH: '/does/not/exist' },
    cwd: root,
    platform: 'linux',
    runner: () => {
      throw new Error('--agents must not spawn anything');
    },
    io: { input, output },
    packageDir: root,
    pkg: { name: '@mvpscale/mm3', version: '0.0.0' },
    homeDir: root,
  };
  return { root, ctx, typed: (s) => input.write(s) };
}
const read = (root: string, rel: string): string => readFileSync(path.join(root, rel), 'utf8');

describe('mm3 init --agents [C-233]', () => {
  it('fresh project: --yes creates AGENTS.md holding just the marked block, plus a CLAUDE.md that imports it, and says exactly what it wrote', async () => {
    const { root, ctx } = project();
    const r = await runInit(FLAGS, ctx);
    expect(read(root, 'AGENTS.md')).toBe(`${BLOCK}\n`);
    expect(r.text).toContain(BLOCK); // the preview shows the exact lines
    expect(r.text).toMatch(/will create AGENTS\.md/u);
    expect(r.text).toContain('✔ agents: created AGENTS.md');
    expect(read(root, 'CLAUDE.md')).toBe('@AGENTS.md\n'); // Claude Code reads CLAUDE.md, never AGENTS.md: with none, the block would reach no agent
    expect(r.text).toContain('✔ agents: created CLAUDE.md (imports AGENTS.md)');
  });

  it('an existing AGENTS.md with other content keeps it all and gets the block appended', async () => {
    const other = '# My rules\n\n- be kind\n';
    const { root, ctx } = project({ 'AGENTS.md': other });
    await runInit(FLAGS, ctx);
    expect(read(root, 'AGENTS.md')).toBe(`${other}\n${BLOCK}\n`);
  });

  it('an existing block is replaced in place; everything outside the markers is untouched', async () => {
    const stale = '<!-- mm3:agents -->\nold guidance\n<!-- /mm3:agents -->';
    const { root, ctx } = project({ 'AGENTS.md': `# Top\n\n${stale}\n\n## Bottom\nkeep me\n` });
    const r = await runInit(FLAGS, ctx);
    expect(read(root, 'AGENTS.md')).toBe(`# Top\n\n${BLOCK}\n\n## Bottom\nkeep me\n`);
    expect(r.text).toContain('✔ agents: updated the mm3 block in AGENTS.md');
  });

  it('a second run changes nothing and says so', async () => {
    const { root, ctx } = project({ 'CLAUDE.md': '# c\n' });
    await runInit(FLAGS, ctx);
    const after = [read(root, 'AGENTS.md'), read(root, 'CLAUDE.md')];
    const r = await runInit(FLAGS, ctx);
    expect([read(root, 'AGENTS.md'), read(root, 'CLAUDE.md')]).toEqual(after);
    expect(r.text).toContain('· agents: already set up');
    expect(r.text).not.toContain('will ');
  });

  it('a CLAUDE.md with no import gets @AGENTS.md appended (its other lines untouched)', async () => {
    const { root, ctx } = project({ 'CLAUDE.md': '# Claude notes\nuse tabs' });
    const r = await runInit(FLAGS, ctx);
    expect(read(root, 'CLAUDE.md')).toBe('# Claude notes\nuse tabs\n@AGENTS.md\n');
    expect(r.text).toContain('✔ agents: appended @AGENTS.md to CLAUDE.md');
  });

  it('.claude/CLAUDE.md gets @../AGENTS.md', async () => {
    const { root, ctx } = project({ '.claude/CLAUDE.md': '# Claude notes\n' });
    await runInit(FLAGS, ctx);
    expect(read(root, '.claude/CLAUDE.md')).toBe('# Claude notes\n@../AGENTS.md\n');
  });

  it('a CLAUDE.md that already imports AGENTS.md (either form, padded) is left untouched', async () => {
    const a = '# c\n  @AGENTS.md  \n';
    const b = '# c\n@../AGENTS.md\n';
    const { root, ctx } = project({ 'CLAUDE.md': a, '.claude/CLAUDE.md': b });
    const r = await runInit(FLAGS, ctx);
    expect(read(root, 'CLAUDE.md')).toBe(a);
    expect(read(root, '.claude/CLAUDE.md')).toBe(b);
    expect(r.text).not.toContain('appended');
  });

  it('without --yes and with a "no" (or an empty Enter) it shows the lines and writes nothing', async () => {
    const { root, ctx, typed } = project({ 'CLAUDE.md': '# c\n' });
    typed('n\n');
    const r = await runInit({ ...FLAGS, yes: false }, ctx);
    expect(existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
    expect(read(root, 'CLAUDE.md')).toBe('# c\n');
    expect(r.text).toContain('– agents: nothing written');
  });

  it('without --yes and a "yes" at the prompt it writes', async () => {
    const { root, ctx, typed } = project();
    typed('y\n');
    await runInit({ ...FLAGS, yes: false }, ctx);
    expect(read(root, 'AGENTS.md')).toBe(`${BLOCK}\n`);
  });

  it('a non-terminal input (the MCP path) is never prompted: shows the lines, writes nothing, says "re-run with --yes"', async () => {
    const { root, ctx } = project();
    const input = Object.assign(new PassThrough(), { isTTY: false });
    input.end();
    const r = await runInit({ ...FLAGS, yes: false }, { ...ctx, io: { input, output: ctx.io.output } });
    expect(existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
    expect(r.text).toContain(BLOCK);
    expect(r.text).toContain('re-run with --yes');
  });

  it('an unmatched marker stops with what to fix and writes nothing', async () => {
    const { root, ctx } = project({ 'AGENTS.md': '# x\n<!-- mm3:agents -->\nhalf a block\n' });
    const r = await runInit(FLAGS, ctx);
    expect(read(root, 'AGENTS.md')).toBe('# x\n<!-- mm3:agents -->\nhalf a block\n');
    expect(r.text).toMatch(/✖ agents: .*marker.*→/u);
  });

  it('outside a git project it writes nothing and says to cd into one', async () => {
    const { root, ctx } = project();
    const bare = mkdtempSync(path.join(os.tmpdir(), 'mm3-nogit-'));
    const r = await runInit(FLAGS, { ...ctx, cwd: bare });
    expect(existsSync(path.join(bare, 'AGENTS.md'))).toBe(false);
    expect(existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
    expect(r.text).toContain('– agents: not in a git project');
  });
});

describe('mm3 init --agents on the command line [C-233]', () => {
  const cli = (root: string, args: string[]): ReturnType<typeof runCli> =>
    runCli(args, {
      env: { MM3_PROVIDER: 'fake', MM3_HOME: root, PATH: '/does/not/exist' },
      cwd: root,
      platform: 'linux',
      runner: () => ({ status: 1, stdout: '', stderr: 'not used' }),
      packageDir: process.cwd(),
      pkg: { name: '@mvpscale/mm3', version: '0.0.0-test' },
      homeDir: root,
      nodeVersion: process.version,
      stdin: () => Buffer.from(''),
      io: { input: Object.assign(new PassThrough(), { isTTY: false }), output: new PassThrough() },
    });

  it('--agents --yes writes the block; without --yes (closed input) it only shows it and says to re-run with --yes', async () => {
    const { root } = project();
    const dry = await cli(root, ['init', '--agents']);
    expect(dry.exit).toBe(0);
    expect(dry.text).toContain('re-run with --yes');
    expect(existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
    const wet = await cli(root, ['init', '--agents', '--yes']);
    expect(wet.exit).toBe(0);
    expect(read(root, 'AGENTS.md')).toBe(`${BLOCK}\n`);
  });

  it('--agents runs on its own: combined with an install/key/plugin flag it stops and says so', async () => {
    const { root } = project();
    const r = await cli(root, ['init', '--agents', '--global']);
    expect(r.exit).toBe(2);
    expect(r.text).toMatch(/^✖ init: --agents runs on its own → /u);
    expect(existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
  });
});

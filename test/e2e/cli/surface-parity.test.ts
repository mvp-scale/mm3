// One answer on every surface: the same command through the terminal (dist/cli.js) and through the plugin's MCP tool
// (bin/mm3.mjs mcp) says the same thing, the MCP instructions are the guidance in src/, and `mm3 doctor` reads Claude's
// record of the plugin the way it is shaped on disk. The two entry points share one engine; this keeps them from drifting.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MM3_GUIDANCE } from '../../../src/help/guidance.ts';
import { mm3 } from '../../helpers/cli.ts';
import { overMcp } from '../../helpers/mcp.ts';
import { tempProject, USER_TS } from '../../helpers/project.ts';

const FILES = { 'src/user.ts': USER_TS, 'src/handlers/user.ts': USER_TS };
const request = (name: string): string => readFileSync(`test/fixtures/requests/valid/${name}.yaml`, 'utf8');

describe('the terminal and the MCP tool give one answer', () => {
  it('cards, templates and a real verb run read the same through both, and a helper handed the delegate card gets the same rules', async () => {
    const commands: Array<{ args: string[]; stdin?: string }> = [
      { args: ['agent'] },
      { args: ['agent', 'delegate'] },
      { args: ['agent', 'class'] },
      { args: ['template', 'class'] },
      { args: ['class', '-'], stdin: request('class') }, // a real run: answer, run id, ledger receipt
    ];
    const cli = tempProject(FILES);
    const viaCli = commands.map((c) => mm3(cli.root, c.args, { input: c.stdin ?? '' }).stdout);
    const mcp = tempProject(FILES); // a twin project, so both start from the same empty ledger and get the same run id
    const viaMcp = await overMcp(mcp.root, commands);
    commands.forEach((c, i) => expect(viaMcp.texts[i], `mm3 ${c.args.join(' ')}`).toBe(viaCli[i]));
    expect(viaCli[4]).toMatch(/id: MM3-0001/u);
  });

  it('the MCP instructions the shipped bundle sends are exactly the guidance in src/, and the delegate card carries its body', async () => {
    const { root } = tempProject(FILES);
    const { instructions, texts } = await overMcp(root, [{ args: ['agent', 'delegate'] }]);
    expect(instructions).toBe(MM3_GUIDANCE); // catches a plugin bundle that was not rebuilt after the guidance changed
    for (const line of MM3_GUIDANCE.split('\n').slice(2)) expect(texts[0]).toContain(line);
  });
});

describe('doctor `versions:` reads the plugin record as Claude writes it', () => {
  const home = (record: unknown, installedPackage?: { version: string }): { env: Record<string, string> } => {
    const claude = mkdtempSync(path.join(os.tmpdir(), 'mm3-claude-'));
    mkdirSync(path.join(claude, 'plugins'), { recursive: true });
    const installPath = path.join(claude, 'plugins', 'cache', 'mm3', 'mm3', 'abc123abc123');
    mkdirSync(installPath, { recursive: true });
    if (installedPackage) writeFileSync(path.join(installPath, 'package.json'), JSON.stringify(installedPackage));
    const text = JSON.stringify(record).replaceAll('<install>', JSON.stringify(installPath).slice(1, -1)); // escaped: a Windows path has backslashes
    writeFileSync(path.join(claude, 'plugins', 'installed_plugins.json'), text);
    return { env: { CLAUDE_CONFIG_DIR: claude } };
  };
  // The shape Claude Code writes (version 2): scope-keyed arrays under "<plugin>@<marketplace>"; the plugin's own
  // `version` field is the 12-character commit when the manifest pins none.
  const record = (version: string): unknown => ({
    version: 2,
    plugins: {
      'context7@claude-plugins-official': [{ scope: 'user', installPath: '/elsewhere', version: 'ab024cdcfa7c', gitCommitSha: 'ab024cdcfa7ca80be204acd4907656ba5a968589', lastUpdated: '2026-10-02T12:41:58.350Z' }],
      'mm3@mm3': [{ scope: 'user', installPath: '<install>', version: 'abc123abc123', gitCommitSha: 'abc123abc123deadbeefdeadbeefdeadbeefdead', installedAt: '2026-10-01T00:00:00.000Z', lastUpdated: `2026-10-02T00:00:0${version === '9.9.9' ? 1 : 0}.000Z` }],
    },
  });
  const ours = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  const versions = (env: Record<string, string>): string => {
    const { root } = tempProject(FILES);
    return mm3(root, ['doctor'], { env }).stdout.split('\n').find((l) => l.trim().startsWith('versions:')) ?? '';
  };

  it('same base version: a tick', () => {
    expect(versions(home(record(ours), { version: ours }).env)).toMatch(/✔ the plugin and this copy are/u);
  });
  it('a different plugin version: a warning with both versions and the fix', () => {
    const line = versions(home(record('9.9.9'), { version: '9.9.9' }).env);
    expect(line).toMatch(/⚠ the plugin is 9\.9\.9/u);
    expect(line).toContain('/plugin update');
  });
  it('no mm3 in the record, no record, or a record that is not JSON: no versions line, and doctor still works', () => {
    expect(versions(home({ version: 2, plugins: { 'other@x': [] } }).env)).toBe('');
    expect(versions({ CLAUDE_CONFIG_DIR: mkdtempSync(path.join(os.tmpdir(), 'mm3-claude-')) })).toBe('');
    const claude = mkdtempSync(path.join(os.tmpdir(), 'mm3-claude-'));
    mkdirSync(path.join(claude, 'plugins'), { recursive: true });
    writeFileSync(path.join(claude, 'plugins', 'installed_plugins.json'), '{ not json');
    expect(versions({ CLAUDE_CONFIG_DIR: claude })).toBe('');
  });
});

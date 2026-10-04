// The one-time `agents:` note [C-234]: a project whose AGENTS.md lacks the mm3 block (or whose CLAUDE.md does not
// import AGENTS.md) gets ONE note on the first real run of any verb, before the budget note: the ledger knows it is
// the first (no run recorded yet), so there is no marker file; a dry run records nothing, so it never consumes it;
// `mm3 doctor` always prints the status line.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentsBlock } from '../../src/setup/agents-file.ts';
import { agentsState } from '../../src/setup/agents-status.ts';
import { runClass } from '../../src/verbs/class.ts';
import { runDoctor } from '../../src/verbs/doctor.ts';
import { runLoop } from '../../src/verbs/loop.ts';
import { runScan } from '../../src/verbs/scan.ts';
import { stubProvider } from '../helpers/stub-provider.ts';
import { tempProject } from '../helpers/project.ts';

const CLASS_YAML = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');
const NO_BLOCK = 'agents: no MM3 guidance in AGENTS.md → mm3 init --agents adds it (shows the lines first)';
const NO_IMPORT = 'agents: Claude reads CLAUDE.md, not AGENTS.md → add the line @AGENTS.md to CLAUDE.md (or run mm3 init --agents)';
const MARKER = 'agents-note-shown'; // the file older versions kept; nothing writes it any more
const SRC = { 'src/user.ts': 'export const a = 1;\n' };
const ok = (extra: Record<string, string> = {}): Record<string, string> => ({ ...SRC, 'AGENTS.md': `# x\n${agentsBlock()}\n`, ...extra });
/** The notes: list, parsed back out of the emitted response. */
const notesOf = (text: string): string[] => {
  const line = text.split('\n').find((l) => l.startsWith('notes:'))!;
  return JSON.parse(line.slice('notes:'.length)) as string[];
};
const run = (paths: ReturnType<typeof tempProject>['paths'], dryRun = false) =>
  runClass(CLASS_YAML, { paths, provider: stubProvider(), env: {}, dryRun });

describe('agentsState', () => {
  it('ok: a CLAUDE.md exists and every CLAUDE.md imports AGENTS.md', () => {
    expect(agentsState(tempProject(ok({ 'CLAUDE.md': '@AGENTS.md\n' })).root)).toBe('ok');
    expect(agentsState(tempProject(ok({ '.claude/CLAUDE.md': 'x\n@../AGENTS.md\n' })).root)).toBe('ok');
  });
  it('claude-md-no-import: the block is there but no CLAUDE.md exists, or one (root or .claude/) does not import AGENTS.md [C-234]', () => {
    expect(agentsState(tempProject(ok()).root)).toBe('claude-md-no-import'); // Claude Code never opens AGENTS.md by itself
    expect(agentsState(tempProject(ok({ 'CLAUDE.md': '# c\n' })).root)).toBe('claude-md-no-import');
    expect(agentsState(tempProject(ok({ '.claude/CLAUDE.md': '# c\n' })).root)).toBe('claude-md-no-import');
  });
  it('no-block: AGENTS.md is missing, has no mm3 block, or has a broken one', () => {
    expect(agentsState(tempProject(SRC).root)).toBe('no-block');
    expect(agentsState(tempProject({ ...SRC, 'AGENTS.md': '# x\n' }).root)).toBe('no-block');
    expect(agentsState(tempProject({ ...SRC, 'AGENTS.md': '<!-- mm3:agents -->\nhalf\n' }).root)).toBe('no-block');
    expect(agentsState(tempProject({ ...SRC, 'AGENTS.md': '# x\n', 'CLAUDE.md': '# c\n' }).root)).toBe('no-block'); // init --agents fixes both
  });
});

describe('the one-time agents: note on a real run [C-234]', () => {
  it('first run shows it, right before the budget note; the second run does not', async () => {
    const { paths } = tempProject(SRC);
    const first = notesOf((await run(paths)).text);
    expect(first.at(-2)).toBe(NO_BLOCK);
    expect(first.at(-1)).toMatch(/^budget: /u);
    expect(existsSync(path.join(paths.dir, MARKER))).toBe(false); // the ledger knows it was the first run
    const second = notesOf((await run(paths)).text);
    expect(second.some((n) => n.startsWith('agents:'))).toBe(false);
  });

  it('claude-md-no-import gets its own wording', async () => {
    const { paths } = tempProject(ok({ 'CLAUDE.md': '# c\n' }));
    expect(notesOf((await run(paths)).text)).toContain(NO_IMPORT);
  });

  it('a dry run neither shows it nor consumes it', async () => {
    const { paths } = tempProject(SRC);
    const dry = await run(paths, true);
    expect(dry.text).not.toContain('agents:');
    expect(existsSync(path.join(paths.dir, MARKER))).toBe(false);
    expect(notesOf((await run(paths)).text)).toContain(NO_BLOCK);
  });

  it('ok shows nothing and writes no marker', async () => {
    const { paths } = tempProject(ok({ 'CLAUDE.md': '@AGENTS.md\n' }));
    const r = await run(paths);
    expect(r.text).not.toContain('agents:');
    expect(existsSync(path.join(paths.dir, MARKER))).toBe(false);
  });

  it('once per project, not once per verb: a scan after a class shows nothing', async () => {
    const { paths } = tempProject(SRC);
    await run(paths);
    const scan = await runScan(readFileSync('test/fixtures/requests/valid/scan.yaml', 'utf8'), { paths, provider: stubProvider(), env: {} });
    expect(scan.text).not.toContain('agents:');
  });

  it('scan and loop carry it on a first run too', async () => {
    for (const verb of ['scan', 'loop'] as const) {
      const { paths } = tempProject(SRC);
      const yaml = readFileSync(`test/fixtures/requests/valid/${verb}.yaml`, 'utf8');
      const r = await (verb === 'scan' ? runScan : runLoop)(yaml, { paths, provider: stubProvider(), env: {} });
      expect(notesOf(r.text)).toContain(NO_BLOCK);
    }
  });

  it('a project that already has a run in its ledger gets no note, whatever its AGENTS.md says', async () => {
    const { paths } = tempProject(ok());
    await run(paths); // a first run: nothing to say, but it is recorded
    writeFileSync(path.join(paths.root, 'AGENTS.md'), '# x\n'); // now the guidance is missing
    expect((await run(paths)).text).not.toContain('agents:');
  });
});

describe('doctor agents: line [C-234]', () => {
  it('always prints the status with the fix while not ok, even after the note was consumed', async () => {
    const { paths } = tempProject(SRC);
    await run(paths); // consumes the one-time note
    const d = runDoctor({}, paths, 'v22.13.0');
    expect(d.text).toContain('agents: no MM3 guidance in AGENTS.md → mm3 init --agents adds it (shows the lines first)');
    const n = runDoctor({}, tempProject(ok({ 'CLAUDE.md': '# c\n' })).paths, 'v22.13.0');
    expect(n.text).toContain('agents: Claude reads CLAUDE.md, not AGENTS.md → add the line @AGENTS.md to CLAUDE.md (or run mm3 init --agents)');
  });
  it('says ok when set up, and nothing at all with no project; never writes the marker', () => {
    const { paths } = tempProject(ok({ 'CLAUDE.md': '@AGENTS.md\n' }));
    expect(runDoctor({}, paths, 'v22.13.0').text).toMatch(/\n\s+agents: ok\b/u);
    expect(runDoctor({}, undefined, 'v22.13.0').text).not.toContain('agents:');
    const bare = tempProject(SRC).paths;
    runDoctor({}, bare, 'v22.13.0');
    expect(existsSync(path.join(bare.dir, MARKER))).toBe(false);
  });
});

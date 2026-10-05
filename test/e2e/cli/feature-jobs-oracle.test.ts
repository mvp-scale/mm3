// The feature jobs can be passed [C-266]: an ideal sequence of commands, run through the built CLI with the job's own setup,
// satisfies every checkpoint the job names. A job nobody can pass would prove nothing about MM3; this keeps the jobs honest
// before any agent is asked to do them.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ClaudeCall } from '../../../scripts/agentic/claude.ts';
import { evaluate, type Evidence } from '../../../scripts/agentic/checkpoints.ts';
import { applySetup, type FullScenario } from '../../../scripts/agentic/run.ts';
import { mm3 } from '../../helpers/cli.ts';
import { gitInit, tempProject, USER_TS } from '../../helpers/project.ts';

const spec = JSON.parse(readFileSync('test/agentic/scenarios/baseline.json', 'utf8')) as { full: FullScenario[] };
const job = (id: string): FullScenario => spec.full.find((s) => s.id === id)!;
const GOOD = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');
const FILES = { 'src/user.ts': USER_TS, 'src/handlers/user.ts': USER_TS, 'AGENTS.md': '# a project\n' };

/** Runs one command the way an agent's shell would, and records it as the call the checkpoints read. */
function sh(root: string, calls: ClaudeCall[], args: string[], o: { input?: string; env?: Record<string, string> } = {}): string {
  const r = mm3(root, args, { ...(o.input === undefined ? {} : { input: o.input }), ...(o.env ? { env: o.env } : {}) });
  const text = `${r.stdout}${r.stderr}`;
  calls.push({ tool: 'Bash', input: { command: `mm3 ${args.join(' ')}` }, parent: null, id: String(calls.length), result: text, turn: calls.length + 1 });
  return text;
}
const evidence = (root: string, calls: ClaudeCall[], answer: string, s: FullScenario): Evidence => ({
  calls, answer, promise: s.promise, helpers: 0,
  ledger: existsSync(path.join(root, '.mm3', 'log.jsonl')) ? readFileSync(path.join(root, '.mm3', 'log.jsonl'), 'utf8') : '',
  read: (rel) => (existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel), 'utf8') : undefined),
});
const failed = (s: FullScenario, e: Evidence): string[] => evaluate(s.checkpoints.filter((c) => c !== 'stays-on-mm3'), e).filter((c) => !c.pass).map((c) => c.id);

describe('the feature jobs can be passed [C-266]', () => {
  it('[C-266] F1, change a setting: write the file, set the cap, load it, say what was recorded', () => {
    const { root } = tempProject(FILES);
    const calls: ClaudeCall[] = [];
    applySetup(job('F1-change-a-setting').setup, root);
    sh(root, calls, ['config', '--write']);
    writeFileSync(path.join(root, '.mm3', 'config.yaml'), 'budget:\n  usd: 3\n');
    const out = sh(root, calls, ['config', '--load']);
    expect(out).toContain('budget.usd');
    const answer = 'I set budget.usd to 3. Loading it recorded a config receipt in the ledger: budget.usd 5 → 3.';
    expect(failed(job('F1-change-a-setting'), evidence(root, calls, answer, job('F1-change-a-setting')))).toEqual([]);
  });

  it('[C-266] F2, the spend cap: one run, a stop on a new question, raise the cap in the file, load it, carry on', () => {
    const { root } = tempProject(FILES);
    const calls: ClaudeCall[] = [];
    const s = job('F2-spend-cap');
    applySetup(s.setup, root);
    expect(readFileSync(path.join(root, '.mm3', 'config.yaml'), 'utf8')).toBe('budget:\n  runs: 1\n'); // the setup the sheet describes
    const first = sh(root, calls, ['class', '-'], { input: GOOD });
    const second = sh(root, calls, ['class', '-'], { input: GOOD.replace(/goal: .*/u, 'goal: A different question about the same file') });
    expect(second).toContain('✖ budget: cap reached');
    writeFileSync(path.join(root, '.mm3', 'config.yaml'), 'budget:\n  runs: 5\n');
    sh(root, calls, ['config', '--load']);
    const third = sh(root, calls, ['class', '-'], { input: GOOD.replace(/goal: .*/u, 'goal: A different question about the same file') });
    const ids = [first, third].map((t) => /id: (MM3-\d+)/u.exec(t)?.[1]);
    expect(ids.every(Boolean)).toBe(true);
    expect(failed(s, evidence(root, calls, `The second check was stopped by the budget; I raised budget.runs to 5 and loaded it. Run ids: ${ids.join(' and ')}.`, s))).toEqual([]);
  });

  it('[C-266] F3, install health: doctor shows the versions warning against a plugin record at an older commit', () => {
    const { root } = tempProject(FILES);
    const calls: ClaudeCall[] = [];
    const s = job('F3-install-health');
    const env = applySetup(s.setup, root);
    const out = sh(root, calls, ['doctor'], { env });
    expect(out).toMatch(/versions: .*⚠ the plugin is 0\.1\.1 \(f337f61\)/u);
    expect(failed(s, evidence(root, calls, 'The plugin is older than this copy. Run /plugin update in Claude Code.', s))).toEqual([]);
  });

  it('[C-266] F4, set up a project: init --agents --yes writes the block and a CLAUDE.md that imports it', () => {
    const { root } = tempProject(FILES);
    gitInit(root); // the baseline project is a git checkout; init --agents only works inside one
    const calls: ClaudeCall[] = [];
    const s = job('F4-set-up-project');
    const first = sh(root, calls, ['init', '--agents']);
    expect(first).toContain('--yes'); // without --yes it only shows the lines and says to re-run
    sh(root, calls, ['init', '--agents', '--yes']);
    expect(failed(s, evidence(root, calls, 'Done: AGENTS.md has the MM3 block and CLAUDE.md imports it.', s))).toEqual([]);
  });
});

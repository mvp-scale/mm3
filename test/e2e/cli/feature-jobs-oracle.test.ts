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
import { overMcp } from '../../helpers/mcp.ts';
import { gitInit, tempProject, USER_TS } from '../../helpers/project.ts';

const spec = JSON.parse(readFileSync('test/agentic/scenarios/baseline.json', 'utf8')) as { full: FullScenario[] };
const job = (id: string): FullScenario => spec.full.find((s) => s.id === id)!;
const GOOD = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');
const FILES = { 'src/user.ts': USER_TS, 'src/handlers/user.ts': USER_TS, 'AGENTS.md': '# a project\n' };

/** Runs one command the way an agent's shell would, and records it as the call the checkpoints read. */
function sh(root: string, calls: ClaudeCall[], args: string[], o: { input?: string; env?: Record<string, string>; parent?: string } = {}): string {
  const r = mm3(root, args, { ...(o.input === undefined ? {} : { input: o.input }), ...(o.env ? { env: o.env } : {}) });
  const text = `${r.stdout}${r.stderr}`;
  calls.push({ tool: 'Bash', input: { command: `mm3 ${args.join(' ')}` }, parent: o.parent ?? null, id: String(calls.length), result: text, turn: calls.length + 1 });
  return text;
}
/** Runs calls through the real plugin tool (one `mm3 mcp` process) and records each as the call the checkpoints read; `extra` is any further field the agent put in its call. */
async function viaTool(root: string, calls: ClaudeCall[], list: Array<{ args: string[]; stdin?: string; extra?: Record<string, unknown> }>): Promise<string[]> {
  const { texts } = await overMcp(root, list);
  list.forEach((c, i) => calls.push({ tool: 'mcp__plugin_mm3_mm3__mm3', input: { args: c.args, ...(c.stdin === undefined ? {} : { stdin: c.stdin }), ...(c.extra ?? {}) }, parent: null, id: String(calls.length), result: texts[i]!, turn: calls.length + 1 }));
  return texts;
}
const evidence = (root: string, calls: ClaudeCall[], answer: string, s: FullScenario): Evidence => ({
  calls, answer, promise: s.promise, helpers: s.helpers ?? 0,
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

  it('[C-266] F5, the wrong field: the request under "request" is stopped with what was ignored, and the next call with "stdin" gets a verdict', async () => {
    const { root } = tempProject({ ...FILES, 'routes/login.ts': USER_TS });
    const calls: ClaudeCall[] = [];
    const s = job('F5-ignored-field');
    const yaml = s.prompt.slice(s.prompt.indexOf('mak:')); // the very request the agent is handed
    const [stopped, accepted] = await viaTool(root, calls, [{ args: ['class', '-'], extra: { request: yaml } }, { args: ['class', '-'], stdin: yaml }]);
    expect(stopped).toContain('✖ arguments: ignored "request"');
    const id = /id: (MM3-\d+)/u.exec(accepted ?? '')?.[1];
    expect(id).toBeDefined();
    expect(failed(s, evidence(root, calls, `The first call was stopped: the tool ignored "request" and wants the YAML in "stdin". The second was accepted: run ${id}, gate fail.`, s))).toEqual([]);
    // an agent that used "stdin" first never exercised the stop, and the job says so instead of passing
    const { root: other } = tempProject({ ...FILES, 'routes/login.ts': USER_TS });
    const direct: ClaudeCall[] = [];
    const [only] = await viaTool(other, direct, [{ args: ['class', '-'], stdin: yaml }]);
    const idOnly = /id: (MM3-\d+)/u.exec(only ?? '')?.[1];
    expect(failed(s, evidence(other, direct, `Run ${idOnly}.`, s))).toEqual(['ignored-stop-met']);
  });

  it('[C-266] F6, a helper gets the guidance: the lead pastes `mm3 agent delegate` into one helper\'s prompt, the helper makes its own request, and the lead reports its run id', () => {
    const { root } = tempProject({ ...FILES, 'routes/login.ts': USER_TS });
    const calls: ClaudeCall[] = [];
    const s = job('F6-guidance-reaches-helper');
    const card = sh(root, calls, ['agent', 'delegate']);
    calls.push({ tool: 'Agent', input: { prompt: `Check routes/login.ts with MM3 and report the run id.\n\n${card}` }, parent: null, id: 'helper1', result: '', turn: calls.length + 1 });
    sh(root, calls, ['template', 'class'], { parent: 'helper1' }); // the helper starts from the card's own advice: edit a template
    const verdict = sh(root, calls, ['class', '-'], { input: GOOD, parent: 'helper1' });
    const id = /id: (MM3-\d+)/u.exec(verdict)?.[1];
    expect(id).toBeDefined();
    calls.push({ tool: 'SubagentHandback', input: { message: `${id}: gate fail. I did not run any other verb.` }, parent: 'helper1', id: 'back1', result: '', turn: calls.length + 1 });
    expect(failed(s, evidence(root, calls, `The helper checked routes/login.ts: run ${id}, gate fail.`, s))).toEqual([]);
    // a lead that does the MM3 work itself, with no helper, is not this job
    const lone: ClaudeCall[] = [];
    const { root: other } = tempProject({ ...FILES, 'routes/login.ts': USER_TS });
    const mine = sh(other, lone, ['class', '-'], { input: GOOD });
    expect(failed(s, evidence(other, lone, `Run ${/id: (MM3-\d+)/u.exec(mine)?.[1]}.`, s))).toEqual(expect.arrayContaining(['helpers-spawned', 'helper-made-the-call']));
  });
});

// The whole command surface through the built binary, on a throwaway project in a throwaway HOME: every command,
// subcommand, flag and stop, with the fake provider (no key, no network). A command that would change state
// outside the project (init's install, uninstall's removal) runs in the form that only previews or refuses, and
// the destructive ones that are safe in a sandbox (a lowered cap) run for real. The container
// matrix runs this on Node 22 and 24, so a command that behaves differently there fails here by name.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasGit } from '../../../src/evidence/git.ts';
import { mm3 } from '../../helpers/cli.ts';
import { gitCommit, gitInit, tempProject, USER_TS } from '../../helpers/project.ts';

const fixture = (name: string): string => readFileSync(`test/fixtures/requests/valid/${name}.yaml`, 'utf8');

interface Step {
  /** What this step proves, in words. */
  name: string;
  args: string[];
  input?: string;
  /** Expected exit code (default 0). */
  exit?: number;
  /** Text the output must match. */
  has?: RegExp;
}

const VERBS = ['view', 'class', 'replay', 'scan', 'drill', 'loop'];
const TOPICS = ['authoring', 'verdict', 'mdl', 'reuse', 'probe', 'report', 'outcome', 'budget', 'doctor'];

describe('every command, subcommand and flag, through the built CLI', () => {
  it('runs each one on a throwaway project and gets the documented exit and text', () => {
    const { root } = tempProject({ 'src/user.ts': USER_TS, 'src/handlers/user.ts': USER_TS });
    const home = mkdtempSync(path.join(os.tmpdir(), 'mm3-home-'));
    const env = { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, 'xdg') };
    const run = (s: Pick<Step, 'args' | 'input'>) => mm3(root, s.args, { ...(s.input === undefined ? {} : { input: s.input }), env });
    writeFileSync(path.join(root, 'class.yaml'), fixture('class'));
    if (hasGit()) gitInit(root);
    const outputs = new Map<string, string>();
    const check = (s: Step): string => {
      const r = run(s);
      const text = `${r.stdout}${r.stderr}`;
      expect(r.status, `${s.name}: mm3 ${s.args.join(' ')}\n${text}`).toBe(s.exit ?? 0);
      if (s.has) expect(text, `${s.name}: mm3 ${s.args.join(' ')}`).toMatch(s.has);
      // A stop is one ✖ line at the top, never a stack trace or a raw Node warning.
      expect(text, `${s.name}: no stack trace`).not.toMatch(/\n\s+at .*\(.*:\d+:\d+\)|ExperimentalWarning|DeprecationWarning/);
      if ((s.exit ?? 0) === 2) expect(text.trimStart().startsWith('✖') || /^✖/m.test(text), `${s.name}: a ✖ stop`).toBe(true);
      outputs.set(s.name, text);
      return text;
    };
    const seen = new Set<string>();
    const go = (s: Step): string => {
      seen.add(s.args[0] ?? '');
      return check(s);
    };

    // Self-description: free, no project state.
    go({ name: 'version', args: ['--version'], has: /^\d+\.\d+\.\d+/ });
    go({ name: 'short help flag', args: ['-h'], has: /Pick your verb|view/ });
    go({ name: 'long help flag', args: ['--help'], has: /view/ });
    go({ name: 'help card', args: ['help'], has: /Pick your verb/ });
    for (const v of VERBS) go({ name: `help ${v}`, args: ['help', v], has: new RegExp(`## ${v}`) });
    for (const t of TOPICS) go({ name: `help ${t}`, args: ['help', t], has: new RegExp(`## ${t}`) });
    go({ name: 'agent card', args: ['agent'], has: /verbs \(pick by goal\)/ });
    for (const v of [...VERBS, 'report', 'outcome', 'budget', 'template', 'doctor', 'probe', 'verdict', 'mdl']) {
      go({ name: `agent ${v}`, args: ['agent', v], has: /tool:|verb:/ });
    }
    for (const v of VERBS) go({ name: `template ${v}`, args: ['template', v], has: /mak:/ });
    go({ name: 'template with --where and --goal', args: ['template', 'class', '--from', 'class.yaml', '--where', 'src/user.ts', '--goal', 'The handler is safe'], has: /src\/user\.ts/ });
    go({ name: 'doctor', args: ['doctor'], has: /provider: fake/ });
    go({ name: 'config view', args: ['config'], has: /budget:/ });
    go({ name: 'config --write makes the starter file', args: ['config', '--write'] });
    go({ name: 'config --load records it', args: ['config', '--load'], has: /valid · loaded/ });
    go({ name: 'config --reset is gone', args: ['config', '--reset'], exit: 2, has: /unknown flag --reset/ });
    go({ name: 'config --load with a file argument', args: ['config', '--load', '.mm3/config.yaml'] });
    go({ name: 'init --agents previews the block', args: ['init', '--agents'], has: hasGit() ? /mm3:agents/ : /git project/ });
    go({ name: 'uninstall refuses without a yes', args: ['uninstall'], has: /cannot be undone|\[y\/N\]/ });
    go({ name: 'uninstall plan with everything kept', args: ['uninstall', '--all', '--keep-key', '--keep-data'] });

    // Budget: read-only; the caps are changed in the config.
    go({ name: 'budget show', args: ['budget'], has: /budget:.*\n→ to change it: edit budget\.usd/ });
    go({ name: 'budget show, spelled out', args: ['budget', 'show'], has: /budget:/ });
    go({ name: 'budget set was removed', args: ['budget', 'set', '--usd', '3'], exit: 2, has: /was removed → edit budget\.usd/ });
    go({ name: 'budget reset was removed', args: ['budget', 'reset'], exit: 2, has: /was removed → change budget\.usd/ });
    writeFileSync(path.join(root, '.mm3', 'config.yaml'), 'budget:\n  usd: 4\n  runs: 50\n');
    go({ name: 'config --load picks up the new budget', args: ['config', '--load'], has: /budget\.usd: 5 → 4/ });
    go({ name: 'budget shows the loaded caps', args: ['budget'], has: /\$4\.00.*50 of 50/ });

    // The ledger-free reads on an empty ledger.
    go({ name: 'view a folder', args: ['view', 'src'], has: /no runs yet/ });
    go({ name: 'view --summary', args: ['view', 'src', '--summary'], has: /no runs yet/ });
    go({ name: 'view --answers', args: ['view', 'src', '--answers'], has: /no runs yet/ });
    go({ name: 'view --level', args: ['view', 'src', '--level', '2'], has: /no runs yet/ });
    for (const view of ['hits', 'patterns', 'history', 'web', 'problems', 'mdl', 'calls', 'fields']) {
      go({ name: `report ${view}`, args: ['report', view] });
    }
    go({ name: 'report with no view is hits', args: ['report'] });

    // The six verbs, one ledger, in contract order. Dry-runs first: they validate and count, never spend.
    go({ name: 'class --dry-run', args: ['class', '-', '--dry-run'], input: fixture('class'), has: /plan:|questions/ });
    go({ name: 'class from stdin', args: ['class', '-'], input: fixture('class'), has: /id: MM3-0001/ });
    go({ name: 'class from a file reuses the answer for free', args: ['class', 'class.yaml'], has: /reuse|id: MM3-/ });
    go({ name: 'view the request file', args: ['view', 'class.yaml'] });
    go({ name: 'view a run id', args: ['view', 'MM3-0001'] });
    go({ name: 'outcome held', args: ['outcome', 'MM3-0001', 'held', '--by', 'owner'], has: /held/ });
    go({ name: 'outcome overruled', args: ['outcome', 'MM3-0001', 'overruled', '--by', 'reviewer'], has: /overruled/ });
    go({ name: 'outcome failed', args: ['outcome', 'MM3-0001', 'failed', '--by', 'qa'], has: /failed/ });
    go({ name: 'outcome repeated is idempotent', args: ['outcome', 'MM3-0001', 'failed', '--by', 'qa'], has: /already recorded/ });
    go({ name: 'scan --dry-run', args: ['scan', '-', '--dry-run'], input: fixture('scan'), has: /plan:|questions|items/ });
    const scan = go({ name: 'scan', args: ['scan', '-'], input: fixture('scan'), has: /id: MM3-\d{4,}/ });
    const scanId = /id: (MM3-\d{4,})/.exec(scan)![1]!;
    const tmpl = go({ name: 'template drill from the scan', args: ['template', 'drill', '--parent', scanId, '--from', 'src/handlers/user.ts/findUser'], has: /parent/ });
    go({ name: 'drill --dry-run', args: ['drill', '-', '--dry-run'], input: tmpl });
    go({ name: 'drill', args: ['drill', '-'], input: tmpl, has: /id: MM3-\d{4,}/ });
    go({ name: 'loop --dry-run', args: ['loop', '-', '--dry-run'], input: fixture('loop') });
    go({ name: 'loop', args: ['loop', '-'], input: fixture('loop'), has: /id: MM3-\d{4,}/ });
    go({ name: 'replay worktree against worktree', args: ['replay', '--parent', 'MM3-0001', '--compare', 'worktree..worktree', '--expect', 'injection'], has: /recorded: \[parent\]/ });
    go({ name: 'replay --dry-run', args: ['replay', '--parent', 'MM3-0001', '--compare', 'worktree..worktree', '--expect', 'injection', '--dry-run'] });
    if (hasGit()) {
      const before = gitCommit(root, 'before');
      writeFileSync(path.join(root, 'src', 'user.ts'), `${USER_TS}// reviewed\n`);
      const after = gitCommit(root, 'after');
      go({ name: 'replay across two git refs', args: ['replay', '--parent', 'MM3-0001', '--compare', `${before}..${after}`, '--expect', 'injection'], has: /before|after|probes/ });
      expect(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()).toBe(after);
    }

    // The reads again, now with a populated ledger.
    for (const view of ['hits', 'patterns', 'history', 'web', 'problems', 'mdl', 'calls', 'fields']) go({ name: `report ${view}, populated`, args: ['report', view] });
    go({ name: 'report graph for a category', args: ['report', 'graph', 'category:injection'] });
    go({ name: 'view a folder, populated', args: ['view', 'src'], has: /MM3-\d{4,}/ });
    go({ name: 'view --summary, populated', args: ['view', 'src', '--summary'] });
    go({ name: 'doctor, populated', args: ['doctor'], has: /provider: fake/ });
    go({ name: 'budget show, populated', args: ['budget'], has: /runs left/ });

    // Stops: one ✖ line and a fix, exit 2 (a held lock or a cap is its own code, below).
    go({ name: 'unknown command', args: ['not-a-command'], exit: 2 });
    go({ name: 'unknown flag', args: ['class', '--nope'], exit: 2 });
    go({ name: 'flag before the command', args: ['--dry-run', 'class'], exit: 2 });
    go({ name: 'class with no request', args: ['class'], exit: 2 });
    for (const v of ['class', 'scan', 'loop']) go({ name: `${v} with no mak: block`, args: [v, '-'], input: 'mdl:\n  why: validate\n', exit: 2 });
    go({ name: 'drill with no parent', args: ['drill', '-'], input: 'mak:\n  goal: x\n', exit: 2 });
    go({ name: 'replay with no parent', args: ['replay', '--compare', 'worktree..worktree'], exit: 2 });
    go({ name: 'outcome with a bad id', args: ['outcome', 'nope', 'held', '--by', 'x'], exit: 2, has: /not a run id/ });
    go({ name: 'outcome with a bad outcome', args: ['outcome', 'MM3-0001', 'maybe', '--by', 'x'], exit: 2, has: /held, overruled or failed/ });
    go({ name: 'outcome without --by', args: ['outcome', 'MM3-0001', 'held'], exit: 2, has: /--by/ });
    go({ name: 'budget set with nothing', args: ['budget', 'set'], exit: 2, has: /was removed/ });
    go({ name: 'budget with a bad subcommand', args: ['budget', 'wipe'], exit: 2, has: /is not show/ });
    go({ name: 'report with a bad view', args: ['report', 'level2'], exit: 2, has: /not a view/ });
    go({ name: 'help for an unknown topic', args: ['help', 'init'], exit: 2, has: /not a verb or topic/ });
    go({ name: 'agent for an unknown topic', args: ['agent', 'nope'], exit: 2 });
    go({ name: 'config --load with --write', args: ['config', '--load', '--write'], exit: 2 });
    go({ name: 'config --load a missing file', args: ['config', '--load', 'missing.yaml'], exit: 2 });
    go({ name: 'init with two modes', args: ['init', '--global', '--local'], exit: 2, has: /at most one/ });
    go({ name: 'init --agents with another flag', args: ['init', '--agents', '--global'], exit: 2, has: /runs on its own/ });
    go({ name: 'init with a bad scope', args: ['init', '--scope', 'galaxy'], exit: 2, has: /user or project/ });
    go({ name: 'init with both --claude flags', args: ['init', '--claude', '--no-claude'], exit: 2 });
    go({ name: 'init with both key flags', args: ['init', '--key-stdin', '--no-key'], exit: 2 });
    go({ name: 'view a path that is not there', args: ['view', 'nowhere/at/all'] });

    // The cap: one run allowed against the whole ledger (a budget.since in the file wins over the automatic
    // restart), so the next paid call stops at exit 3 before spending.
    writeFileSync(path.join(root, '.mm3', 'config.yaml'), 'budget:\n  usd: 4\n  runs: 1\n  since: 1970-01-01T00:00:00Z\n');
    go({ name: 'lower the runs cap against the whole ledger, and load', args: ['config', '--load'] });
    go({ name: 'a paid call over the cap stops at exit 3', args: ['class', '-'], input: fixture('class').replace('login handler', 'new handler'), exit: 3, has: /ask the owner to raise budget\.runs in \.mm3\/config\.yaml, then run mm3 config --load/ });
    writeFileSync(path.join(root, '.mm3', 'config.yaml'), 'budget:\n  usd: 4\n  runs: 11\n');
    go({ name: 'raising the cap and loading restarts the count', args: ['config', '--load'], has: /count restarted/ });
    go({ name: 'the budget then shows a fresh count', args: ['budget'], has: /11 of 11 runs left/ });

    // mcp over empty stdin starts, finds the client gone, and exits clean.
    go({ name: 'mcp exits clean when the client is gone', args: ['mcp'], input: '' });

    // Completeness: every command the help card lists has a step above.
    const card = outputs.get('help card')!;
    const sections = [card.slice(card.indexOf('## Pick your verb'), card.indexOf('## The contract')), card.slice(card.indexOf('## Tools'))].join('\n');
    const listed = [...sections.matchAll(/^- (\w+):/gm)].map((m) => m[1]!);
    expect(listed.length, 'the help card lists the verbs and tools').toBeGreaterThanOrEqual(10);
    for (const cmd of [...listed, 'doctor', 'config', 'init', 'uninstall', 'help', 'agent', 'mcp']) {
      expect(seen.has(cmd), `the help card lists "${cmd}" but no step runs it`).toBe(true);
    }
    mkdirSync(path.join(root, '.mm3'), { recursive: true });
  }, 120_000);
});

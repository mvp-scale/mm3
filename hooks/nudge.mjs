// The plugin's one hook: a nudge, never a block. Claude Code runs it before the Agent tool (a helper is about to be
// spawned) and before a Bash call that commits, merges, pushes or opens a PR (a decision is about to be made), and
// whatever this prints is added to the agent's context as one line saying how to get an MM3 verdict first. It speaks
// only in a project that has a `.mm3/` folder, once per agent per moment per session, and on any doubt (bad input, no
// match, no folder, a failure of its own) it prints nothing and exits 0, so it can never stop a tool call.
// Plain node with no imports beyond the standard library: the plugin ships it as a file, not in the bundle.
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const AGENT_LINE = 'MM3 is set up here (.mm3/). Before you hand work to a helper, get the rules for it: mm3 tool, args ["agent","delegate"], then paste them into its prompt. Cite MM3-#### ids.';
const DECIDE_LINE = 'MM3 is set up here (.mm3/). Before you call this safe, done or ready, get a verdict with the mm3 tool: view (free) first, then class; args ["agent"] lists the commands. Cite the MM3-#### id.';

const DECISION = /(^|[;&|(])\s*(\w+=\S*\s+)*(git(\s+(-[cC]\s+\S+|-\S+))*\s+(commit|merge|push)|gh\s+pr)(\s|$)/u;

const hasMm3 = (dir) => {
  try {
    return statSync(join(dir, '.mm3')).isDirectory();
  } catch {
    return false;
  }
};

/** True when `.mm3/` is in the project folder Claude Code names, or in the cwd or any folder above it. */
const inMm3Project = (input) => {
  const start = [process.env.CLAUDE_PROJECT_DIR, typeof input.cwd === 'string' ? input.cwd : undefined].filter((d) => typeof d === 'string' && d !== '');
  for (const s of start) {
    for (let dir = s, prev = ''; dir !== prev; prev = dir, dir = dirname(dir)) if (hasMm3(dir)) return true;
  }
  return false;
};

/** Which moment this call is: the delegation, the decision, or none. */
const momentOf = (input) => {
  if (input.tool_name === 'Agent' || input.tool_name === 'Task') return 'delegate';
  const command = input.tool_input && typeof input.tool_input.command === 'string' ? input.tool_input.command : '';
  if (input.tool_name === 'Bash' && DECISION.test(command)) return 'decide';
  return null;
};

/** False when this agent already heard this moment in this session. A marker that cannot be written does not silence it. */
const firstTime = (input, moment) => {
  if (typeof input.session_id !== 'string' || input.session_id === '') return true;
  const safe = (s) => String(s ?? '').replace(/[^A-Za-z0-9_-]/gu, '_').slice(0, 80);
  try {
    writeFileSync(join(tmpdir(), `mm3-nudge-${safe(input.session_id)}-${safe(input.agent_id)}-${moment}`), '', { flag: 'wx' });
    return true;
  } catch (e) {
    return e?.code !== 'EEXIST';
  }
};

const run = (raw) => {
  const input = JSON.parse(raw);
  if (input === null || typeof input !== 'object' || (input.hook_event_name !== undefined && input.hook_event_name !== 'PreToolUse')) return;
  const moment = momentOf(input);
  if (moment === null || !inMm3Project(input) || !firstTime(input, moment)) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: moment === 'delegate' ? AGENT_LINE : DECIDE_LINE } }));
};

try {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    try {
      run(raw);
    } catch {
      /* fail open: say nothing */
    }
    process.exit(0);
  });
  process.stdin.on('error', () => process.exit(0));
} catch {
  process.exit(0);
}

// `npm run agentic:sheet -- <version> <scenario id> <cli|mcp> [haiku|sonnet]`: the human version of one level 3 run.
// It prints, from the same file the automated grader reads, the goal, the setup, the exact prompt, and every checkpoint
// with a box to tick, so a person and the harness are held to one definition of success. The run happens in a COPY of the
// baseline project (never the clean staging checkout), with the sample provider, so it needs no key.
import { readFileSync } from 'node:fs';
import { CHECKPOINTS } from './checkpoints.ts';
import { commitOf, type FullScenario, type Rules } from './run.ts';

const [version, id, route, modelArg] = process.argv.slice(2);
if (!version || !id || (route !== 'cli' && route !== 'mcp')) throw new Error('usage: npm run agentic:sheet -- <exact npm version> <scenario id> <cli|mcp> [haiku|sonnet]');
const spec = JSON.parse(readFileSync('test/agentic/scenarios/baseline.json', 'utf8')) as { full: FullScenario[]; rules: Rules; preconditions: string[] };
const fx = JSON.parse(readFileSync('test/agentic/fixture.json', 'utf8')) as { tag: string; defaultCheckout: string };
const s = spec.full.find((x) => x.id === id);
if (!s) throw new Error(`no scenario ${id}; have ${spec.full.map((x) => x.id).join(', ')}`);
if (!s.routes.includes(route)) throw new Error(`${id} does not run on the ${route} route`);
const model = modelArg ?? spec.rules.gateModel;
const commit = commitOf(version);
const proj = '/tmp/mm3-manual-project';
const isolation = `--model ${model} --setting-sources "" --disable-slash-commands`;
const approvals = '"Read" "Glob" "Grep" "Write" "Bash(mm3 *)" "Bash(*/.bin/mm3 *)" "Bash(command -v *)" "Bash(which *)" "Bash(cat *)" "Bash(echo *)" "Bash(printf *)" "Bash(ls *)" "Bash(pwd)" "Bash(grep *)" "Bash(find *)"';
const setup = [
  `rm -rf ${proj} && cp -r ${fx.defaultCheckout} ${proj} && rm -rf ${proj}/.mm3`,
  ...(route === 'cli'
    ? [`npm install --prefix /tmp/mm3-manual --no-audit --no-fund --silent @mvpscale/mm3@${version}`]
    : [`rm -rf /tmp/mm3-plugin && git clone -q --shared ${process.cwd()} /tmp/mm3-plugin && git -C /tmp/mm3-plugin checkout -q ${commit ?? '<commit>'}`]),
  `cd ${proj}`,
];
const launch = route === 'cli'
  ? `PATH=/tmp/mm3-manual/node_modules/.bin:$PATH MM3_PROVIDER=fake XDG_CONFIG_HOME=/tmp/mm3-no-config claude ${isolation} --strict-mcp-config --tools "Read,Glob,Grep,Write,Bash" --allowedTools ${approvals}`
  : `MM3_PROVIDER=fake XDG_CONFIG_HOME=/tmp/mm3-no-config claude ${isolation} --plugin-dir /tmp/mm3-plugin --tools "Read,Glob,Grep,Agent" --allowedTools "Read" "Glob" "Grep" "Agent" "mcp__plugin_mm3_mm3__mm3"`;

const lines = [
  `MANUAL TEST SHEET · ${id} · ${route} route · ${model} · version ${version}`, '',
  `GOAL     ${s.goal}`,
  `PROMISE  ${s.promise} verb request${s.promise === 1 ? '' : 's'} per agent to a verdict (discovery calls such as agent, template, help, probe, doctor do not count)`, '',
  'PRECONDITIONS', ...spec.preconditions.map((p) => `  - ${p}`), '',
  'SETUP (paste)', ...setup.map((c) => `  ${c}`), '',
  'LAUNCH (paste; no key needed)', `  ${launch}`, '',
  'AT THE PROMPT, type exactly this and nothing else', ...s.prompt.split('\n').map((l) => `  | ${l}`), '',
  'DURING: write down', '  1. every MM3 call in order, and what each answered (the first words are enough)', '  2. which calls were verb requests (class, scan, drill, loop, view, replay) and which got a verdict (id: MM3-#### and gate:)', '',
  'CHECKPOINTS (tick each; any unticked one is a failure, and the note says where to look)',
  ...s.checkpoints.flatMap((c) => [`  [ ] ${CHECKPOINTS[c]!.text}`, `        if not: ${CHECKPOINTS[c]!.means}`]), '',
  `PASS  every box ticked. Unticked boxes name the failing layer. Gate rule when run by the harness: ${spec.rules.gateModel} passes at least ${spec.rules.mustPassTrials} of ${spec.rules.trialsPerScenario} trials; one manual trial is evidence, not the gate.`,
  'NOT GRADED  whether the verdict is right: the sample provider answers with canned verdicts. Verdict quality is the separate keyed live suite.',
];
console.log(lines.join('\n'));

// The fixed vocabulary for grouping self-improvements: at most 25 themes, none added casually. A theme says WHERE a fix would land
// (the guidance text, an error message, the tool, a model tier, the test harness...), so improvements from different runs and different
// checkpoints can be counted together. Tags group; they never decide anything. `other` is the pressure valve: an improvement
// that fits nothing is tagged `other` and shows up in `npm run agentic:patterns` as a prompt to add a theme or to let it go.
export interface Theme {
  label: string; // plain words
  where: string; // where a fix for it lands
}

export const THEMES: Record<string, Theme> = {
  // the text agents read
  'guidance-start-here': { label: 'Reaching for MM3 at all', where: 'the MCP instructions, the skill description, the AGENTS block' },
  'guidance-template-first': { label: 'Starting every request from a template', where: 'the main guidance' },
  'guidance-delegation': { label: 'Delegating to helpers correctly', where: 'the guidance line and the delegate card' },
  'guidance-citing': { label: 'Citing run ids as evidence', where: 'the guidance' },
  'guidance-length': { label: 'Guidance too long or buried', where: 'the guidance, for smaller models especially' },
  // error messages
  'stop-next-command': { label: 'A stop should end with the one command to run next', where: 'every stop message' },
  'stop-names-the-edit': { label: 'A stop should name the exact edit', where: 'the validation stop that fired' },
  'stop-wrong-pointer': { label: 'A stop pointed at the wrong card or command', where: 'that stop\'s "see:" line' },
  'stop-misleading': { label: 'A stop blamed the wrong thing', where: 'the check that produced it' },
  'stop-jargon': { label: 'A stop used words an agent cannot act on', where: 'that stop\'s wording' },
  // the tool and its help
  'tool-schema': { label: 'The tool\'s arguments were misused', where: 'the MCP tool definition and its stops' },
  'tool-discovery': { label: 'The agent could not find the command or where to start', where: 'init, the PATH story, the first-run note' },
  'template-quality': { label: 'A template confused the agent', where: 'mm3 template output' },
  'card-content': { label: 'A help card was unclear', where: 'the mm3 agent or mm3 help card' },
  'skill-trigger': { label: 'The skill did not fire when it should', where: 'the skill description' },
  // how agents behave
  'recovery-leaves-mm3': { label: 'The agent left MM3 after a stop', where: 'the stop message, the guidance' },
  'retry-loops': { label: 'The agent repeated the same mistake', where: 'the stop message, the template' },
  'over-exploring': { label: 'Too many look-around calls before the first request', where: 'the first-move guidance' },
  // who it shows up for, and what it costs
  'lower-tier-models': { label: 'Seen mostly in smaller models', where: 'guidance tuned for them; accept only if it repeats' },
  'token-weight': { label: 'A route or step costs many tokens', where: 'what loads into context, the card sizes' },
  // not MM3
  'harness-grader': { label: 'Our grader or checkpoint was wrong', where: 'scripts/agentic' },
  'harness-permissions': { label: 'Our test setup blocked the agent', where: 'the allowed-tools list' },
  'scenario-design': { label: 'The scenario itself was unfair or unclear', where: 'test/agentic/scenarios' },
  'claude-code-behavior': { label: 'Depends on how Claude Code behaves', where: 'outside MM3: note it, adapt' },
  other: { label: 'Fits nothing above', where: 'decide: add a theme, or let it go' },
};

export const THEME_LIMIT = 25;

/** The themes each recorded improvement id is grouped under (one or two). Checkpoint ids and named patterns both live here. */
export const THEMES_OF: Record<string, string[]> = {
  engaged: ['guidance-start-here'],
  'verdict-in-promise': ['stop-next-command', 'guidance-template-first'],
  'first-fix-works': ['stop-names-the-edit', 'stop-next-command'],
  'last-request-accepted': ['stop-next-command'],
  'stays-on-mm3': ['recovery-leaves-mm3', 'stop-next-command'],
  'helpers-spawned': ['guidance-delegation'],
  'delegate-card-in-prompts': ['guidance-delegation'],
  'helper-made-the-call': ['guidance-delegation'],
  'helpers-cite-ids': ['guidance-citing', 'card-content'],
  'answer-cites-run-id': ['guidance-citing'],
  'run-id-in-ledger': ['guidance-citing'],
  'first-request-rate': ['guidance-template-first', 'stop-next-command'],
  'config-file-has-cap': ['tool-discovery'],
  'config-receipt-shows-cap': ['tool-discovery', 'card-content'],
  'answer-states-the-change': ['guidance-citing'],
  'two-verdicts': ['recovery-leaves-mm3'],
  'cap-raised-in-config': ['stop-names-the-edit', 'stop-next-command'],
  'continued-after-stop': ['recovery-leaves-mm3', 'stop-next-command'],
  'doctor-versions-seen': ['tool-discovery'],
  'right-fix-reported': ['card-content', 'stop-wrong-pointer'],
  'agents-block-written': ['tool-discovery'],
  'claude-md-imports': ['tool-discovery', 'stop-names-the-edit'],
  'terminal-and-plugin-both-used': ['tool-discovery'],
  'routes-agree-and-said-so': ['tool-schema', 'harness-grader'],
  'ignored-stop-met': ['scenario-design'],
  'ignored-stop-fixed': ['tool-schema', 'stop-names-the-edit'],
  'lower-tier-models': ['lower-tier-models', 'guidance-length'],
};

/** The themes for an improvement id; an id with no mapping is `other`, which the patterns view calls out. */
export const themesFor = (id: string): string[] => THEMES_OF[id] ?? ['other'];

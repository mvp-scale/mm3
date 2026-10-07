/**
 * `mm3 help <verb>`: purpose, when to use it, one annotated example, and that verb's own sharp rules —
 * the ones that caused a first-try reject in real use. The output opens with `Agents: mm3 agent <verb>`,
 * ahead of the `## <verb>` heading, so a cold agent reading a human help page still lands on its own terse
 * twin (round-4 smoke testing: a cold CLI agent made zero `mm3` calls at all — it never discovered
 * `mm3 agent` exists). [C-191]
 */
import type { Verb } from '../contract/types.ts';
import { proseLines } from './patterns.ts';
import { ruleLines } from './rules.ts';

const EXAMPLES: Record<Verb, string> = {
  view: 'mm3 view src/handlers          # what does the ledger already know about this folder?\nmm3 view MM3-0042               # this run\'s own lineage, up and down',
  class: [
    'mak:',
    '  goal: This login handler is safe to merge   # phrase as the exact claim to prove',
    '  depth: quick                                # => exactly 10 yes/no below',
    '  where: [src/user.ts:1-3]                     # include the wiring, not just the handler',
    '  ask:',
    '    injection: {pass: no, 1: Is request text put into a query unvalidated?, ...}',
    'mdl: {why: validate, area: auth}',
  ].join('\n'),
  replay: 'mak:\n  goal: The injection fix works\n  parent: MM3-0042\n  compare: {before: main, after: HEAD}',
  scan: [
    'mak:',
    '  goal: Handlers don\'t trust request input',
    '  depth: quick',
    '  over: {file: src/handlers/*.ts, function: each}     # scan by file when the file itself is the unit',
    '  ask:',
    '    function:',
    '      injection: {pass: no, 1: Does {function} put request text straight into a query?}',
  ].join('\n'),
  drill: 'mm3 template drill --parent MM3-0060 --from src/handlers/user.ts/findUser   # follow next:, don\'t hand-author the ids',
  loop: [
    'mak:',
    '  goal: The checkout redesign is sound',
    '  depth: quick',
    '  over:',
    '    part:                              # part and story are SIBLINGS, both under over:',
    '      - name: gateway',
    '        story: [guest checkout, saved cards]',
    '  ask:',
    '    story:',
    '      done: {pass: yes, 1: Is "{story}" testable against {part} as written?}   # asked of EVERY story',
  ].join('\n'),
};

/** Exported so `agent.ts`'s `verbCard()` can splice these into the same `rules:` list as `ruleLines(verb)` —
 *  one shared source for both views, never a second copy (round-4 finding: `agent drill`/`agent replay`
 *  rendered an empty `rules:` section since neither verb had any RULES/patterns.ts entries of its own; this
 *  prose already existed here, just unreachable from `agent`). [C-192] */
export const SHARP: Record<Verb, string[]> = {
  view: ['a code file (not a request) is a place, not a request — view <folder>, ".", a tag, or MM3-#### all work'],
  class: ['goal wording changes the verdict (that\'s a feature, not a bug) — phrase it as the claim you need proven'],
  replay: [
    'the files must be committed at the ref you name (or use "worktree" for the working tree) — replay runs git in the repo that actually holds them',
    'replay re-runs the parent\'s own questions; it never takes ask: (use class for new questions)',
    'a sweep parent (scan, loop, drill\'s sweep form) is replayed too: it re-sweeps at both refs and reports fixed/still/regressed per item — only a drill sweep CONTINUATION (over: starting with "each") is refused',
  ],
  scan: ['add a scale question to a layer to rank findings by severity, worst first, instead of an unordered map', 'scan by file when the file itself is the unit that matters, not a function inside it'],
  drill: ['follow the `next:` line rather than hand-authoring parent/from — it already names the id and the category or item'],
  loop: [
    'a sub-layer (like story under part) is a SIBLING key under over:, never nested inside its parent item',
    'a story/part name is one word or kebab-case, at most 20 characters, and never contains "/"',
    'every question under a layer is asked of every item at that layer — phrase it so that holds for all of them',
  ],
};

const PURPOSE: Record<Verb, string> = {
  view: 'MAK³ x Know: what do we already know here? Free — it reads the ledger and never calls out.',
  class: 'MAK³ x Judge: does the evidence support this one goal? One call, one subject.',
  replay: 'MAK³ x Prove: did the change work? It replays a parent run\'s questions on two states.',
  scan: 'MDL³ x Know: where in this code should we look? A sweep across code, read by us.',
  drill: 'MDL³ x Judge: why did this one thing fail? It goes down from one item in a parent run.',
  loop: 'MDL³ x Prove: does this idea hold up? A sweep across layers of ideas the agent writes.',
};

const WHEN: Record<Verb, string> = {
  view: 'before any paid call, when entering unfamiliar code, or to find proven questions.',
  class: 'a decision on one subject: merge, choose, triage, check a fix.',
  replay: 'after a fix, a refactor, a dependency bump, or to compare fix A with fix B.',
  scan: 'a new codebase, a release check, a PR\'s changed files, or a vague bug with no location yet.',
  drill: 'after a fail or unsure from class, scan, loop or replay.',
  loop: 'a design, a plan or a feature request before any code exists.',
};

/**
 * One atomic line per verb: how to pick it by goal, not by name — condensed from PURPOSE/WHEN above into the
 * one line a dense card has room for. Shared verbatim between `help`'s one-screen card (card.ts's "Pick your
 * verb" list) and `agent`'s overview (agent.ts), so an agent holding a goal ("is this safe to merge?") and a
 * human reading `help` can't be told a different story about the same verb. [C-189]
 */
export const VERB_LINE: Record<Verb, string> = {
  view: "free; what's already known for a request you wrote (mm3 view <request-file>), before any paid call",
  class: 'one decision on one thing (merge, choose, triage, check a fix)',
  replay: "re-check a run's questions across two git refs: after a fix, or what changed between releases or commits",
  scan: "sweep many files when the problem's location is unknown",
  drill: 'go down from one flagged item of an earlier run',
  loop: 'check a design or plan before code exists',
};

export function verbHelp(verb: Verb): string {
  return [
    `Agents: mm3 agent ${verb}`,
    `## ${verb}`,
    PURPOSE[verb],
    `When: ${WHEN[verb]}`,
    '',
    'Example:',
    EXAMPLES[verb],
    '',
    'Sharp rules:',
    ...SHARP[verb].map((s) => `- ${s}.`),
    ...ruleLines(verb),
    ...proseLines(verb),
  ].join('\n');
}

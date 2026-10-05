// What "success" means in the agentic stage, stated before any run and checked the same way by the automated grader and
// by the human sheet (scripts/agentic/sheet.ts). Every checkpoint is observable from the transcript and the ledger and needs
// no TypeSafe key: the sample provider answers with canned verdicts, so nothing here judges whether a verdict is RIGHT,
// only whether an agent could get a well-formed verdict recorded. Verdict correctness is a separate, keyed, capped live suite.
import { attemptsByAgent, type ClaudeCall } from './claude.ts';
import { recoveryOf } from './trace.ts';

export interface Evidence {
  calls: ClaudeCall[];
  answer: string; // the lead's final answer
  ledger: string; // .mm3/log.jsonl, or ''
  promise: number; // verb requests allowed per agent before a verdict
  helpers: number; // helper agents the scenario expects (0: the lead does the work)
}

export interface Checkpoint {
  id: string;
  short: string; // one letter: the column heading in the terminal report
  label: string; // two or three words: its legend entry
  text: string; // what is true when it passes
  means: string; // what a failure points at, so a red row says where to look
  fix: string; // the targeted fix to try when it fails, so a red row says what to do
  severity?: 'exception'; // absent: a miss blocks the release. 'exception': recorded and reported, accepted for now, never blocks
  check: (e: Evidence) => boolean;
}

const MM3_ID = /MM3-\d{4}/gu;
const idsIn = (s: string): string[] => [...s.matchAll(MM3_ID)].map((m) => m[0]);
const isMm3 = (c: ClaudeCall): boolean => c.tool.includes('mm3') || (c.tool === 'Bash' && /mm3/u.test(String(c.input.command ?? '')));
/** Agents that made verb requests, each with the outcomes in order. */
const groups = (e: Evidence): ReturnType<typeof attemptsByAgent> => attemptsByAgent(e.calls);
const expectedAgents = (e: Evidence): number => Math.max(e.helpers, 1);

export const CHECKPOINTS: Record<string, Checkpoint> = {
  'stays-on-mm3': {
    id: 'stays-on-mm3',
    severity: 'exception',
    short: 's',
    label: 'stays on MM3',
    fix: 'End every MM3 stop with the one command to run next, so the agent does not leave MM3 to explore or give up.',
    text: 'After every MM3 stop, the agent\'s very next call is MM3 again (never a file read, a shell command or a hand-off)',
    means: 'an agent that hit a stop left MM3 instead of fixing the request (the stop did not point it back)',
    check: (e) => {
      const r = recoveryOf(e.calls);
      return r.onTrack === r.stops;
    },
  },
  engaged: {
    id: 'engaged',
    fix: "Make the guidance that tells an agent to use MM3 harder to miss: the skill description and the MCP instructions' first line.",
    short: 'e',
    label: 'engaged',
    text: 'The agent calls MM3 at all',
    means: 'the guidance did not make the agent reach for MM3 (discoverability, the carriers)',
    check: (e) => e.calls.some(isMm3) || e.calls.some((c) => c.tool === 'Agent' && /mm3/iu.test(String(c.input.prompt ?? ''))),
  },
  'verdict-in-promise': {
    id: 'verdict-in-promise',
    fix: "End every request-shape stop with the one command to run next (`mm3 template <verb>`), and put 'start from the template' in the main guidance.",
    short: 'v',
    label: 'verdict in promise',
    text: 'Every agent that works gets a verdict within the promised number of verb requests',
    means: 'stops or templates did not steer the agent to a valid request in time (stop wording, template, guidance)',
    check: (e) => groups(e).length >= expectedAgents(e) && groups(e).every((g) => g.outcomes.indexOf(true) !== -1 && g.outcomes.indexOf(true) < e.promise),
  },
  'first-fix-works': {
    id: 'first-fix-works',
    fix: "Make the stop name the exact edit and end with `mm3 template <verb>`, instead of pointing at a card to read.",
    short: 'f',
    label: 'first fix works',
    text: 'After one stop that names the fix, the next request is accepted (verdict on the 2nd request at the latest)',
    means: 'the stop said what to change but the agent could not act on it (stop wording)',
    check: (e) => groups(e).length >= 1 && groups(e).every((g) => g.outcomes.indexOf(true) !== -1 && g.outcomes.indexOf(true) < 2),
  },
  'last-request-accepted': {
    id: 'last-request-accepted',
    fix: "Make the last line of every stop the one command to run next, so an agent never has to decide where to go.",
    short: 'l',
    label: 'last request ok',
    text: "Each agent's last verb request was accepted (no unrecovered stop)",
    means: 'the agent gave up or ran out of road on a stop',
    check: (e) => groups(e).length >= 1 && groups(e).every((g) => g.outcomes[g.outcomes.length - 1] === true),
  },
  'helpers-spawned': {
    id: 'helpers-spawned',
    fix: "Strengthen the delegating line in the guidance so a lead hands out the work.",
    short: 'h',
    label: 'helpers',
    text: 'The lead hands the work to the expected number of helpers',
    means: 'delegation did not happen (guidance on delegating)',
    check: (e) => e.calls.filter((c) => c.tool === 'Agent').length >= e.helpers,
  },
  'delegate-card-in-prompts': {
    id: 'delegate-card-in-prompts',
    fix: "Make `mm3 agent delegate` the first step of delegating: move its line up in the guidance and name it in the skill.",
    short: 'd',
    label: 'card in prompts',
    text: "Every helper's prompt carries the `mm3 agent delegate` card",
    means: 'the lead delegated without the card, so helpers start without MM3 guidance',
    check: (e) => e.calls.filter((c) => c.tool === 'Agent').every((c) => /never read \.mm3\/log\.jsonl|MM3 run id with its gate/u.test(String(c.input.prompt ?? ''))) && e.calls.some((c) => c.tool === 'Agent'),
  },
  'helpers-cite-ids': {
    id: 'helpers-cite-ids',
    fix: "Put the report rule at the top of the delegate card so helpers cite run ids.",
    short: 'x',
    label: 'helpers cite ids',
    text: "Each helper's report cites an MM3 run id",
    means: 'helpers did not follow the report rule on the card',
    check: (e) => {
      const back = e.calls.filter((c) => /Handback/u.test(c.tool));
      return back.length >= e.helpers && back.every((c) => MM3_ID.test(JSON.stringify(c.input)) && ((MM3_ID.lastIndex = 0), true));
    },
  },
  'answer-cites-run-id': {
    id: 'answer-cites-run-id',
    fix: "Move 'cite the run id' earlier in the guidance, and say what a citation looks like (MM3-####).",
    short: 'c',
    label: 'cites run id',
    text: 'The final answer states the MM3 run id',
    means: 'the agent did not report evidence it was asked to cite (guidance on citing)',
    check: (e) => idsIn(e.answer).length > 0,
  },
  'run-id-in-ledger': {
    id: 'run-id-in-ledger',
    fix: "Same fix as citing: the agent must quote the id MM3 printed, not remember or invent one.",
    short: 'r',
    label: 'id in ledger',
    text: 'Every run id the final answer cites is in the ledger',
    means: 'no run id was cited, or a cited id is not in the ledger (an agent reporting a run that did not happen)',
    check: (e) => {
      const ids = idsIn(e.answer);
      return ids.length > 0 && ids.every((id) => e.ledger.includes(id));
    },
  },
};

export const checkpointText = (id: string): string => CHECKPOINTS[id]?.text ?? id;

/** The result of every named checkpoint against the evidence, in the order the scenario lists them. */
export const evaluate = (ids: string[], e: Evidence): Array<{ id: string; text: string; means: string; pass: boolean }> =>
  ids.map((id) => {
    const c = CHECKPOINTS[id];
    if (!c) throw new Error(`unknown checkpoint ${id}`);
    return { id, text: c.text, means: c.means, pass: c.check(e) };
  });

/** Not gating, always reported: how rough was the road. */
export function metrics(e: Evidence): { mm3Calls: number; verbRequests: number; discoveryCalls: number; firstRequestAccepted: boolean } {
  const g = groups(e);
  const verb = g.reduce((a, x) => a + x.outcomes.length, 0);
  const mm3 = e.calls.filter(isMm3).length;
  return { mm3Calls: mm3, verbRequests: verb, discoveryCalls: Math.max(mm3 - verb, 0), firstRequestAccepted: g.length > 0 && g.every((x) => x.outcomes[0] === true) };
}

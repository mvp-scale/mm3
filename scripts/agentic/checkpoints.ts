// What "success" means in the agentic stage, stated before any run and checked the same way by the automated grader and
// by the human sheet (scripts/agentic/sheet.ts). Every checkpoint is observable from the transcript and the ledger and needs
// no TypeSafe key: the sample provider answers with canned verdicts, so nothing here judges whether a verdict is RIGHT,
// only whether an agent could get a well-formed verdict recorded. Verdict correctness is a separate, keyed, capped live suite.
import { attemptsByAgent, type ClaudeCall } from './claude.ts';

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
  check: (e: Evidence) => boolean;
}

const MM3_ID = /MM3-\d{4}/gu;
const idsIn = (s: string): string[] => [...s.matchAll(MM3_ID)].map((m) => m[0]);
const isMm3 = (c: ClaudeCall): boolean => c.tool.includes('mm3') || (c.tool === 'Bash' && /mm3/u.test(String(c.input.command ?? '')));
/** Agents that made verb requests, each with the outcomes in order. */
const groups = (e: Evidence): ReturnType<typeof attemptsByAgent> => attemptsByAgent(e.calls);
const expectedAgents = (e: Evidence): number => Math.max(e.helpers, 1);

export const CHECKPOINTS: Record<string, Checkpoint> = {
  engaged: {
    id: 'engaged',
    short: 'e',
    label: 'engaged',
    text: 'The agent calls MM3 at all',
    means: 'the guidance did not make the agent reach for MM3 (discoverability, the carriers)',
    check: (e) => e.calls.some(isMm3) || e.calls.some((c) => c.tool === 'Agent' && /mm3/iu.test(String(c.input.prompt ?? ''))),
  },
  'verdict-in-promise': {
    id: 'verdict-in-promise',
    short: 'v',
    label: 'verdict in promise',
    text: 'Every agent that works gets a verdict within the promised number of verb requests',
    means: 'stops or templates did not steer the agent to a valid request in time (stop wording, template, guidance)',
    check: (e) => groups(e).length >= expectedAgents(e) && groups(e).every((g) => g.outcomes.indexOf(true) !== -1 && g.outcomes.indexOf(true) < e.promise),
  },
  'first-fix-works': {
    id: 'first-fix-works',
    short: 'f',
    label: 'first fix works',
    text: 'After one stop that names the fix, the next request is accepted (verdict on the 2nd request at the latest)',
    means: 'the stop said what to change but the agent could not act on it (stop wording)',
    check: (e) => groups(e).length >= 1 && groups(e).every((g) => g.outcomes.indexOf(true) !== -1 && g.outcomes.indexOf(true) < 2),
  },
  'last-request-accepted': {
    id: 'last-request-accepted',
    short: 'l',
    label: 'last request ok',
    text: "Each agent's last verb request was accepted (no unrecovered stop)",
    means: 'the agent gave up or ran out of road on a stop',
    check: (e) => groups(e).length >= 1 && groups(e).every((g) => g.outcomes[g.outcomes.length - 1] === true),
  },
  'helpers-spawned': {
    id: 'helpers-spawned',
    short: 'h',
    label: 'helpers',
    text: 'The lead hands the work to the expected number of helpers',
    means: 'delegation did not happen (guidance on delegating)',
    check: (e) => e.calls.filter((c) => c.tool === 'Agent').length >= e.helpers,
  },
  'delegate-card-in-prompts': {
    id: 'delegate-card-in-prompts',
    short: 'd',
    label: 'card in prompts',
    text: "Every helper's prompt carries the `mm3 agent delegate` card",
    means: 'the lead delegated without the card, so helpers start without MM3 guidance',
    check: (e) => e.calls.filter((c) => c.tool === 'Agent').every((c) => /never read \.mm3\/log\.jsonl|MM3 run id with its gate/u.test(String(c.input.prompt ?? ''))) && e.calls.some((c) => c.tool === 'Agent'),
  },
  'helpers-cite-ids': {
    id: 'helpers-cite-ids',
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
    short: 'c',
    label: 'cites run id',
    text: 'The final answer states the MM3 run id',
    means: 'the agent did not report evidence it was asked to cite (guidance on citing)',
    check: (e) => idsIn(e.answer).length > 0,
  },
  'run-id-in-ledger': {
    id: 'run-id-in-ledger',
    short: 'r',
    label: 'id in ledger',
    text: 'Every run id the final answer cites is in the ledger',
    means: 'the agent reported a run that did not happen',
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

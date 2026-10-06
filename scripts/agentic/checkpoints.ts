// What "success" means in the agentic stage, stated before any run and checked the same way by the automated grader and
// by the human sheet (scripts/agentic/sheet.ts). Every checkpoint is observable from the transcript and the ledger and needs
// no TypeSafe key: the sample provider answers with canned verdicts, so nothing here judges whether a verdict is RIGHT,
// only whether an agent could get a well-formed verdict recorded. Verdict correctness is a separate, keyed, capped live suite.
import { attemptsByAgent, type ClaudeCall } from './claude.ts';
import { isStop, isVerbRequest, recoveryOf } from './trace.ts';

export interface Evidence {
  calls: ClaudeCall[];
  answer: string; // the lead's final answer
  ledger: string; // .mm3/log.jsonl, or ''
  promise: number; // verb requests allowed per agent before a verdict
  helpers: number; // helper agents the scenario expects (0: the lead does the work)
  read: (rel: string) => string | undefined; // a file in the project the agent worked in, as it ended up
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

/** The fields the plugin's tool takes (src/mcp/protocol.ts); the oracle sends a real extra field through the real bundle, so a change there fails a test. */
const TOOL_FIELDS = ['args', 'stdin', 'project'];
const MM3_ID = /MM3-\d{4}/gu;
const idsIn = (s: string): string[] => [...s.matchAll(MM3_ID)].map((m) => m[0]);
const isMm3 = (c: ClaudeCall): boolean => c.tool.includes('mm3') || (c.tool === 'Bash' && /mm3/u.test(String(c.input.command ?? '')));
/** Agents that made verb requests, each with the outcomes in order. */
const groups = (e: Evidence): ReturnType<typeof attemptsByAgent> => attemptsByAgent(e.calls);
const expectedAgents = (e: Evidence): number => Math.max(e.helpers, 1);


const configRecords = (ledger: string): Array<{ settings?: { budget?: { usd?: number; runs?: number } } }> =>
  ledger.split('\n').filter((l) => l.includes('"kind":"config"')).flatMap((l) => {
    try {
      return [JSON.parse(l) as { settings?: { budget?: { usd?: number; runs?: number } } }];
    } catch {
      return [];
    }
  });
/** What a call returned as plain text: over MCP the stream can hand back the tool's content as a JSON list of text parts. */
const plain = (c: ClaudeCall): string => {
  try {
    const parts = JSON.parse(c.result) as unknown;
    if (Array.isArray(parts) && parts.every((p) => typeof (p as { text?: unknown }).text === 'string')) return parts.map((p: { text: string }) => p.text).join('\n');
  } catch {
    /* plain text, not a list */
  }
  return c.result;
};
const squash = (s: string): string => s.replace(/\s+/gu, ' ').trim();
/** The same mm3 arguments run in the shell and through the plugin tool: the text each returned. A stop on either side is not an answer. */
const sameCommandBothWays = (e: Evidence): Array<{ terminal: string; plugin: string }> => {
  const shell = e.calls.filter((c) => c.tool === 'Bash').flatMap((c) => {
    const args = /(?:^|[;&|]\s*)(?:\S*\/)?mm3\s+([a-z][^|;&\n]*)/u.exec(String(c.input.command ?? ''))?.[1];
    return args === undefined || isStop(c) ? [] : [{ key: args.trim().replace(/\s+/gu, ' '), text: squash(plain(c)) }];
  });
  return e.calls.filter((c) => c.tool.includes('mm3') && Array.isArray(c.input.args) && !isStop(c)).flatMap((c) => {
    const key = (c.input.args as unknown[]).map(String).join(' ');
    const t = shell.find((x) => x.key === key);
    return t ? [{ terminal: t.text, plugin: squash(plain(c)) }] : [];
  });
};
/** Does the answer claim the two outputs differ? "I saw no differences" and "one note that does not change the content" do not; "the two answers differ" does.
 *  Negated phrases are dropped first; "differ" and "disagree" count anywhere; "difference", "mismatch" and "inconsistent" only in the first sentence, which is the verdict (an answer may note a mismatch between the card and the environment). */
export const saysTheyDiffer = (answer: string): boolean => {
  const kept = answer.replace(/\b(?:no|not|zero|without|nothing|never|n't)\b(?:\s+\w+){0,2}?\s+(?:differences?|differ(?:s|ed|ing)?|disagree\w*|mismatch\w*|inconsisten\w*)\b/giu, ' ');
  const first = kept.split(/(?<=[.!?])\s|\n/u)[0] ?? '';
  return /\b(?:differ(?:s|ed)?|disagree\w*)\b/iu.test(kept) || /\b(?:differences?|mismatch\w*|inconsisten\w*)\b/iu.test(first) || /\b(?:not|n't|never)\s+(?:agree|match|identical|the same)/iu.test(first);
};
const mm3Calls = (e: Evidence): ClaudeCall[] => e.calls.filter(isMm3);
const verdict = (c: ClaudeCall): boolean => /\bgate: (pass|fail|unsure)/u.test(c.result);
export const CHECKPOINTS: Record<string, Checkpoint> = {
  'config-file-has-cap': {
    id: 'config-file-has-cap',
    short: 'g',
    label: 'cap in config file',
    fix: "Make the first-run note and `mm3 config` say where settings live and how to change one.",
    text: "The project's config file holds the new spend cap (budget usd 3)",
    means: "the agent did not change the setting in .mm3/config.yaml",
    check: (e) => /^\s*usd:\s*3(\.0+)?\s*(#.*)?$/mu.test(e.read('.mm3/config.yaml') ?? ''),
  },
  'config-receipt-shows-cap': {
    id: 'config-receipt-shows-cap',
    short: 'p',
    label: 'receipt shows cap',
    fix: "Make `mm3 config` and the file's own header say that `mm3 config --load` is what records a change.",
    text: "The ledger holds a config receipt whose settings show the new cap",
    means: "the agent changed the file but never loaded it, so nothing was recorded",
    check: (e) => configRecords(e.ledger).some((r) => r.settings?.budget?.usd === 3),
  },
  'answer-states-the-change': {
    id: 'answer-states-the-change',
    short: 'a',
    label: 'says what changed',
    fix: "Have `mm3 config --load` print the receipt (what changed and that it is recorded) so there is something to quote.",
    text: "The answer says what was recorded: the cap, its new value, and that the ledger holds it",
    means: "the agent did not tell the developer what MM3 recorded",
    check: (e) => /usd|dollar|spend cap|\$\s*3/iu.test(e.answer) && /\b3\b/u.test(e.answer) && /receipt|recorded|ledger/iu.test(e.answer),
  },
  'two-verdicts': {
    id: 'two-verdicts',
    short: 't',
    label: 'both checks done',
    fix: 'Keep the budget guidance clear about what to do at the cap, so the second check is not given up.',
    text: 'The agent got two different verdicts: both checks were made, whatever the cap did in between',
    means: 'the agent stopped after one check, or never got past the cap',
    check: (e) => new Set(mm3Calls(e).filter(verdict).map((c) => /id: (MM3-\d+)/u.exec(c.result)?.[1]).filter(Boolean)).size >= 2,
  },
  'cap-raised-in-config': {
    id: 'cap-raised-in-config',
    short: 'u',
    label: 'raised in config',
    fix: "Make the budget stop name the exact line to change and end with `mm3 config --load`.",
    text: "The agent raised the run cap in the config file and loaded it (the ledger holds a receipt for the new cap)",
    means: "the agent did not raise the cap the way the stop says (edit budget.runs, then mm3 config --load)",
    check: (e) => Number(/^\s*runs:\s*(\d+)/mu.exec(e.read('.mm3/config.yaml') ?? '')?.[1] ?? 0) > 1 && configRecords(e.ledger).some((r) => (r.settings?.budget?.runs ?? 0) > 1),
  },
  'continued-after-stop': {
    id: 'continued-after-stop',
    short: 'n',
    label: 'carried on',
    fix: "End the budget stop with the one command to run next.",
    text: "If MM3 stopped the agent at the cap, a later MM3 request got a verdict",
    means: "the agent stopped at the cap and did not carry on once it was lifted",
    check: (e) => { const m = mm3Calls(e); const i = m.findIndex((c) => c.result.includes('✖ budget: cap reached')); return i < 0 || m.slice(i + 1).some(verdict); }, // an agent that read the cap first and raised it never meets the stop: that is fine
  },
  'doctor-versions-seen': {
    id: 'doctor-versions-seen',
    short: 'w',
    label: 'saw the warning',
    fix: "Make 'is my install healthy' lead to `mm3 doctor` in the guidance and the first-run note.",
    text: "The agent ran doctor and its versions line warned about the mismatch",
    means: "the agent did not run doctor, or doctor did not show the mismatch",
    check: (e) => mm3Calls(e).some((c) => /versions:/u.test(c.result) && /⚠/u.test(c.result)),
  },
  'right-fix-reported': {
    id: 'right-fix-reported',
    short: 'k',
    label: 'right fix, no downgrade',
    fix: "Keep the doctor fix text specific: `/plugin update`, or `npm install -g @mvpscale/mm3@nightly` for a nightly copy.",
    text: "The answer names the older copy (the plugin) and how to update it, and never sends a nightly copy to @latest",
    means: "the agent gave a fix that would downgrade a nightly copy, or none",
    check: (e) => /\/plugin update/u.test(e.answer) && !(mm3Calls(e).some((c) => c.result.includes('@nightly')) && /@latest/u.test(e.answer)), // the older copy is the plugin; a nightly copy is never sent to @latest
  },
  'agents-block-written': {
    id: 'agents-block-written',
    short: 'm',
    label: 'AGENTS.md block',
    fix: "Make `mm3 doctor`'s agents line and the first-run note name `mm3 init --agents --yes` exactly.",
    text: "AGENTS.md now carries the MM3 block",
    means: "the agent did not set the project up (no `mm3 init --agents --yes`)",
    check: (e) => (e.read('AGENTS.md') ?? '').includes('<!-- mm3:agents -->'),
  },
  'claude-md-imports': {
    id: 'claude-md-imports',
    short: 'i',
    label: 'CLAUDE.md import',
    fix: "Keep `init --agents` creating the CLAUDE.md import, and say so in its output.",
    text: "A CLAUDE.md imports AGENTS.md, so Claude Code actually reads the block",
    means: "the project was left with a block no agent reads",
    check: (e) => /^@AGENTS\.md$/mu.test(e.read('CLAUDE.md') ?? '') || /^@\.\.\/AGENTS\.md$/mu.test(e.read('.claude/CLAUDE.md') ?? ''),
  },
  'ignored-stop-fixed': {
    id: 'ignored-stop-fixed',
    short: 'j',
    label: 'first call fixed it',
    fix: 'Keep the ignored-field stop naming the field to use ("stdin") and an example of the args.',
    text: 'The agent was handed the wrong-field stop; its very first MM3 call put the request in "stdin" (and in no field the tool ignores) and was accepted',
    means: 'the agent did not fix the call in one go from the stop text: it repeated the wrong field, got another stop, or went elsewhere first (the stop wording did not say enough)',
    check: (e) => {
      const first = mm3Calls(e)[0];
      return first !== undefined && first.tool.includes('mm3') && isVerbRequest(first) && typeof first.input.stdin === 'string' && first.input.stdin.trim() !== '' && Object.keys(first.input).every((k) => TOOL_FIELDS.includes(k)) && !isStop(first) && !first.result.includes('ignored'); // the job starts the agent at the stop, so the stop is not in the trace: the first call is the one judged
    },
  },
  'terminal-and-plugin-both-used': {
    id: 'terminal-and-plugin-both-used',
    short: 'q',
    label: 'both ways used',
    fix: "Say in `mm3 agent` and the tool description that the terminal and the plugin run the same command.",
    text: 'The same mm3 command was run in the terminal and through the plugin tool, and both answered',
    means: 'the agent used only one of the two, or ran different commands, so nothing was compared',
    check: (e) => sameCommandBothWays(e).length > 0,
  },
  'routes-agree-and-said-so': {
    id: 'routes-agree-and-said-so',
    short: 'y',
    label: 'agree, and said so',
    fix: "If the two texts differ, that is a bug in one route: make the terminal and the plugin return the same text.",
    text: 'The two answers were the same text, and the final answer says they agree',
    means: 'the two routes returned different text for the same command (a real inconsistency), or the agent reported a difference that is not there, or no agreement at all',
    check: (e) => sameCommandBothWays(e).some((p) => p.terminal === p.plugin && p.terminal !== '') && /\b(agree|same|identical|match)/iu.test(e.answer) && !saysTheyDiffer(e.answer),
  },
  'stays-on-mm3': {
    id: 'stays-on-mm3',
    severity: 'exception',
    short: 's',
    label: 'stays on MM3',
    fix: 'End every MM3 stop with the one command to run next, so the agent does not leave MM3 to explore or give up.',
    text: 'After every MM3 stop, the agent\'s very next call is MM3 again, or an edit to its request file followed by MM3 (never a file read, a shell command or a hand-off)',
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
    text: "Every helper's prompt carries the `mm3 agent delegate` card, or tells the helper to fetch it (a pointer works: the helper's own first call gets the same card)",
    means: 'the lead delegated with neither the card nor a pointer to it, so helpers start without MM3 guidance',
    check: (e) => e.calls.filter((c) => c.tool === 'Agent').every((c) => /never read \.mm3\/log\.jsonl|MM3 run id with its gate|["']agent["']\s*,\s*["']delegate["']|agent delegate/u.test(String(c.input.prompt ?? ''))) && e.calls.some((c) => c.tool === 'Agent'),
  },
  'helper-made-the-call': {
    id: 'helper-made-the-call',
    short: 'b',
    label: 'helper made the call',
    fix: "Make the delegate card say the helper makes the MM3 request itself; the lead hands over the card and the file, not the answer.",
    text: 'A helper (not the lead) made its own MM3 request and got a verdict',
    means: 'the lead did the MM3 work itself, or the helper never got a verdict (the hand-off did not carry the guidance)',
    check: (e) => groups(e).filter((g) => g.who !== 'lead' && g.outcomes.includes(true)).length >= Math.max(e.helpers, 1),
  },
  'helpers-cite-ids': {
    id: 'helpers-cite-ids',
    fix: "Put the report rule at the top of the delegate card so helpers cite run ids.",
    short: 'x',
    label: 'helpers cite ids',
    text: "Each helper's MM3 run id reaches the developer: in the helper's own report, or in the lead's answer",
    means: 'a helper got a verdict but its run id was not reported, or a helper never got one',
    check: (e) => {
      // an older Claude Code stream carries each helper's own report as a call, and every one must cite an id
      const back = e.calls.filter((c) => /Handback/u.test(c.tool));
      if (back.length > 0) return back.length >= e.helpers && back.every((c) => MM3_ID.test(JSON.stringify(c.input)) && ((MM3_ID.lastIndex = 0), true));
      // the current stream reports a finished helper only as a short summary, so the end-to-end promise is read instead: every helper got a verdict and the lead's answer carries its id
      const helpers = [...new Set(e.calls.map((c) => c.parent).filter((p): p is string => p !== null))];
      return helpers.length >= e.helpers && helpers.every((h) => e.calls.filter((c) => c.parent === h && /\bgate: (pass|fail|unsure)/u.test(c.result)).flatMap((c) => [...c.result.matchAll(/\bid: (MM3-\d+)/gu)].map((m) => m[1]!)).some((id) => e.answer.includes(id)));
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

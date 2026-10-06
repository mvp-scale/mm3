/**
 * `mm3 help report|outcome|budget`: none of the three is a verb (none takes ask:, none calls the
 * classifier), so none is in help/verbs.ts's `Record<Verb, ...>` maps — help/index.ts routes each here as its
 * own recognized target instead. Round 3 smoke testing hit `outcome` directly: it appeared in neither `help`
 * nor `agent` (round3-findings.md's "PRODUCT, confirmed" finding), and every one of its own rejects
 * (STOPS.md #4-9) had no page to read first; `budget` had the same gap even though it never actually
 * tripped in that round.
 *
 * `CliPair`s are these three targets' own good/bad pairs — the same discipline as `patterns.ts`'s `Pattern`,
 * but for a bare CLI invocation rather than a `mak:` request (there's no verb to validate one against), so
 * they're hand-written and hand-verified against the real stop text instead of proven by a schema/evidence
 * check. `help/agent.ts` hand-writes its own terse cards for these targets rather than importing these (an
 * agent card is why-only with no rule prose to reuse), so these types stay internal to this module's own
 * prose rendering.
 *
 * `TOOL_LINE` below is the one exception: a one-atomic-line-each summary for all four tools — the three above
 * plus `template` (whose own full human help page doesn't exist yet, only `agent`'s terse card) — shared
 * verbatim between `help`'s one-screen card (card.ts's "Tools" list) and `agent`'s overview (agent.ts), the
 * same discipline as verbs.ts's `VERB_LINE`. [C-189]
 */
export const TOOL_LINE: Record<'report' | 'outcome' | 'budget' | 'template', string> = {
  report: 'brief from history; free, no new checks',
  outcome: 'record held/overruled/failed on a run (held needs a second actor)',
  budget: 'show or set the spend and run caps',
  template: 'print a valid starting request for a verb',
};

interface CliPair {
  /** One full sentence: why the bad version doesn't work — help's own prose. */
  readonly rule: string;
  /** The failing invocation, then the exact stop text it produces (as separate lines). */
  readonly bad: readonly string[];
  /** The fixed invocation. */
  readonly good: readonly string[];
}

const REPORT_PAIRS: readonly CliPair[] = [
  {
    rule: 'there is no view beyond hits, patterns, history, web, graph, problems, mdl, calls and fields — nothing else to ask it for.',
    bad: [
      'mm3 report level2',
      '→ ✖ report: "level2" is not a view → use hits, patterns, history, web, graph, problems, mdl, calls or fields',
    ],
    good: ['mm3 report patterns'],
  },
];

const OUTCOME_PAIRS: readonly CliPair[] = [
  {
    rule: "an agent can't certify its own run as correct — `held` needs a second party.",
    bad: [
      'mm3 outcome MM3-0002 held --by claude   # claude is the actor that asked MM3-0002',
      '→ ✖ outcome: claude asked MM3-0002, so it can\'t mark it held → another agent or the owner records "held"',
    ],
    good: ['mm3 outcome MM3-0002 held --by <the user or a reviewer agent, not you>'],
  },
  {
    rule: '`outcome` takes no reason field.',
    bad: [
      'mm3 outcome MM3-0002 overruled --by claude --note "wrong file blamed"',
      '→ ✖ args: unknown flag --note → mm3 outcome <MM3-####> held|overruled|failed --by <actor>',
    ],
    good: ['mm3 outcome MM3-0002 overruled --by claude   # keep the reason in your own notes'],
  },
];

const BUDGET_PAIRS: readonly CliPair[] = [
  {
    rule: 'the caps are changed in the config, not here.',
    bad: ['mm3 budget set --usd 5', '→ ✖ budget: set was removed → edit budget.usd / budget.runs in .mm3/config.yaml, then run mm3 config --load'],
    good: ['# edit budget.usd / budget.runs in .mm3/config.yaml, then:', 'mm3 config --load'],
  },
];

const indent = (lines: readonly string[], pad: string): string[] => lines.map((l) => `${pad}${l}`);

/** help's prose rendering: one `- <rule>` / `bad:` / `good:` block per pair, blank line between pairs. */
function proseCliPairs(pairs: readonly CliPair[]): string[] {
  return [
    '',
    '## Good / bad',
    ...pairs.flatMap((p, i) => [...(i ? [''] : []), `- ${p.rule}`, '  bad:', ...indent(p.bad, '    '), '  good:', ...indent(p.good, '    ')]),
  ];
}

export function reportHelp(): string {
  return [
    '## report',
    "A free, read-only view across everything the ledger holds, not one place: what's known, what recurs, what changed.",
    'When: briefing a teammate or picking up a codebase cold, instead of hand-assembling several `view` calls.',
    '',
    'Example:',
    'mm3 report            # same as: mm3 report hits',
    'mm3 report patterns',
    'mm3 report history',
    'mm3 report web        # writes .mm3/viewer.html and tries to open it',
    '',
    'Sharp rules:',
    '- free: never calls a provider, never writes to the ledger, and works even with no on-disk index.',
    '- no options beyond the view name — hits (default), patterns, history or web; anything else is a stop.',
    '- `hits`: the newest run\'s own gate per place, worst first; a one-subject answer is flagged `stale` once the code there has changed since.',
    '- `patterns`: every distinct question set ever run, with its pass/fail/unsure split, places touched, and outcomes.',
    '- `history`: a merged, newest-first feed of `replay` results (fixed/regressed) and recorded outcomes.',
    '- `web`: writes one self-contained `.mm3/viewer.html` (a place x concern consensus map, a heat map, a session summary) and tries to open it in a browser; always prints the file\'s path, opened or not. The only view that writes anything, and only ever that one file — never the ledger.',
    '- every view caps its rows and says plainly how many more exist, rather than dropping them silently.',
    ...proseCliPairs(REPORT_PAIRS),
  ].join('\n');
}

export function outcomeHelp(): string {
  return [
    '## outcome',
    'Records what happened to a run after the fact, so weak spots roll up later in `mm3 report history`: ' +
      '`held` (it was right), `overruled` (it was wrong) or `failed` (it was useless). Not a mak:-YAML verb: ' +
      'it never calls a provider, only appends one line to the ledger.',
    '',
    'Example:',
    'mm3 outcome MM3-0002 overruled --by claude',
    'mm3 outcome MM3-0002 held --by the-owner       # a different actor than the one who asked it',
    '',
    'Sharp rules:',
    '- exact form: mm3 outcome <MM3-####> held|overruled|failed --by <actor> — no other flags (there is no `--note`; keep a reason in your own notes, not here).',
    "- the agent that asked a run can't mark it `held` itself — `overruled` and `failed` have no such restriction.",
    '- recording the exact same outcome, by the exact same actor, again is a no-op (exit 0, "already recorded by <actor>"), not a second entry.',
    ...proseCliPairs(OUTCOME_PAIRS),
  ].join('\n');
}

/** `doctor` gained a second form (`doctor <file|->`) alongside its original bare system report —
 *  documented here the same way outcome/budget are, since neither is a `mak:`-YAML verb. */
export function doctorHelp(): string {
  return [
    '## doctor',
    'Free, offline, no key needed. Not a mak:-YAML verb: it never calls a provider. Bare `doctor` reports which ' +
      'provider/key/project would answer a real call, plus the Node/node:sqlite runtime and, when a project is ' +
      'found, whether `.mm3/config.yaml` is valid. `doctor <file>` (or `-` for stdin) instead checks just that ' +
      'one document, with no project needed at all: a `mak:` key means a request, checked the same way --dry-run ' +
      "would; anything else is checked as a config.yaml-shaped file.",
    '',
    'Example:',
    'mm3 doctor                    # the full system report',
    'mm3 doctor .mm3/config.yaml',
    'mm3 doctor my-request.yaml',
    'cat my-request.yaml | mm3 doctor -',
    '',
    'Sharp rules:',
    '- exit 0 clean, exit 2 with every problem found in one pass — never calls the classifier, never writes anything.',
    '- `doctor <file|->` never touches the ledger, reuse or budget, even from inside a real project.',
    '- kind is auto-detected (a top-level `mak:` key means a request); it is never guessed from the file name or extension.',
  ].join('\n');
}

export function budgetHelp(): string {
  return [
    '## budget',
    "Shows the project's spend and run count, and how to change the caps. Not a mak:-YAML verb: it never calls a provider " +
      'and never writes. The caps live in `.mm3/config.yaml` (`budget.usd`, `budget.runs`); change one and run `mm3 config --load`.',
    '',
    'Example:',
    'mm3 budget                          # the count, and the way to change it',
    '',
    '# to raise the cap: edit .mm3/config.yaml, then',
    'mm3 config --load',
    '',
    'Sharp rules:',
    '- read-only: `show` is the only subcommand. `set` and `reset` were removed and stop with where to go.',
    '- a load whose `budget:` section changed (usd, runs or per) restarts the count from that moment; a load that changes other settings keeps it. To restart with the same caps, set `budget.since` to now.',
    '- any verb call that would go over either cap stops at exit 3 before it spends anything.',
    ...proseCliPairs(BUDGET_PAIRS),
  ].join('\n');
}

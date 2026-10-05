/**
 * `mm3 agent [verb|tool]`: free, no project, no ledger, never spends — the terse, agent-facing twin of
 * `help` (src/help/index.ts). `help` is prose for a person reading a terminal; this is a dense card for the
 * agent about to write a request: the same enforced rules (rules.ts's RULES, shared with `help` so they can't
 * drift) then the same good/bad pairs (patterns.ts), why-only, no prose — atomic directives, one instruction
 * per line, imperative, no prose framing or decoration. Every card below — the overview and each verb/tool
 * card — is assembled by the one `renderCard` builder, in one fixed key order: identifier line(s) first
 * (`verb:`/`verbs:` for the six verbs, `tool:`/`tools:` for everything else — the overview's `verbs (pick by
 * goal):`/`tools:` sections are themselves multi-line, one purpose-bearing bullet per entry, but still land
 * before `rules:`), then `rules:`, then `patterns:` only when the target has any, then `run:` only when it
 * points further — so no card can quietly drift from another's shape (test/unit/agent.test.ts checks this
 * order holds for every card `agent` prints).
 *
 * `agent` alone (no verb) gives the universal rules plus a `verbs (pick by goal):` list and a `tools:` list,
 * each entry one atomic line naming what it's for — not just its name — so an agent holding a goal ("is this
 * handler safe to merge?") rather than a verb name can map straight to the right one, and points at
 * `mm3 agent <verb>`/`<tool>` to go deeper, and explicitly at `mm3 agent probe` for the
 * question-shape rules. Those purpose lines are never invented here: verbs.ts's `VERB_LINE` and report.ts's
 * `TOOL_LINE` are the one shared source `help`'s own one-screen card (card.ts) renders too, so the two views
 * can't state a different purpose for the same command. [C-189]
 *
 * The overview also carries one extra `run:` line, appended only when no key is configured: inside the
 * plugin's own MCP server it points at `/plugin → MM3 → Configure`, everywhere else at `mm3 init` —
 * the same detection and the same wording `doctor`'s `key:` line uses (setup/plugin.ts's `inPluginContext` and
 * `NO_KEY_PLUGIN_HINT`), so the two views can't drift on how to add a key.
 *
 * `probe`/`verdict`/`outcome`/`budget`/`report`/`template` are recognized non-verb targets too
 * (round 3 smoke testing: `outcome` was undocumented in both `help` and `agent`, round3-findings.md's
 * "PRODUCT, confirmed" finding; `budget`/`report` got the same treatment for consistency; `template` — a real
 * command a cold agent needs before writing a request, and until now missing from `agent` entirely — followed
 * the same way; `verdict` — how to read a response, round-4 smoke testing's "response vocabulary never taught
 * before it appears" finding — is the newest) — each its own bare terse card, no citations, no headings,
 * traceable to the shared source `help`'s prose pages use where one exists (rules.ts's PROBE_RULES and
 * VERDICT_FACTS; report.ts's own outcomeHelp/budgetHelp/reportHelp content, hand-mirrored here terse per that
 * module's own note, since an agent card is why-only with no rule prose to reuse) so the two views can't drift
 * apart. cli.ts wires this in next to `help`; the MCP tool answers it the same way it answers `help`, since
 * both are just another `args[0]` in the same dispatch — and the tool's own description (src/mcp/protocol.ts)
 * now tells a cold agent to call this first, before anything else.
 *
 * Every verb card also splices verbs.ts's `SHARP[verb]` bullets into its `rules:` list, alongside
 * `ruleLines(verb)` (round-4 finding: `agent drill`/`agent change` rendered an empty `rules:` section since
 * neither RULES nor patterns.ts had anything tagged for either verb, even though `help <verb>` already had
 * real prose for both — SHARP was just unreachable from here). The overview's own `rules:` list carries one
 * hand-written line beyond RULES too (`PROJECT_SCOPE_RULE` below): `where:` resolves against the MCP `project`
 * argument or `MM3_HOME`, not session cwd — a runtime fact, not a request-schema one, so it doesn't
 * belong in rules.ts's RULES (built only from schema-check.ts/validate.ts constants); it's stated only here,
 * not in `help`'s card, since an agent is the one that actually passes `project`/sets `MM3_HOME`.
 */
import { hasKey, resolveJevConfig, type ResolveStored } from '../classifier/typesafe/client.ts';
import { resolveConfig } from '../config/load.ts';
import { BLASTS, VERBS, type Verb } from '../contract/types.ts';
import { CHAIN_LEVELS, effectiveMdlFields, MAX_MDL_LINES, UNKNOWN_VALUE, MDL_FIELDS, closedValues, type MdlField } from '../contract/mdl-fields.ts';
import type { Mm3Paths } from '../ledger/paths.ts';
import { inPluginContext, NO_KEY_PLUGIN_HINT } from '../setup/plugin.ts';
import type { VerbResult } from '../verbs/types.ts';
import { clip, hasControlChars } from '../util/text.ts';
import { GUIDANCE_BODY } from './guidance.ts';
import { terseLines } from './patterns.ts';
import { TOOL_LINE } from './report.ts';
import { BAD_PROBE_EXAMPLE, FAMILY_ROLES, PROBE_RULES, ruleLines, VERDICT_FACTS } from './rules.ts';
import { SHARP, VERB_LINE } from './verbs.ts';

const isVerb = (s: string): s is Verb => (VERBS as readonly string[]).includes(s);

/** The one shape every agent card is built from: identifier line(s), then `rules:`, then `patterns:` (only
 *  when non-empty — it already carries its own leading `patterns:` line, from terseLines or hand-written
 *  below, so it's spliced in as-is), then `run:` lines (only when given). Never any other order. */
function renderCard(id: readonly string[], rules: readonly string[], patterns: readonly string[] = [], run: readonly string[] = []): string {
  return [...id, 'rules:', ...rules, ...patterns, ...run].join('\n');
}

/** The real commands beyond the six verbs a cold agent needs, in the order shown on `agent`'s own `tools:`
 *  section — setup-only commands (init, uninstall, mcp, doctor) are deliberately left off. `probe` is a rules
 *  topic, not a "tool" a request calls out to, so it's pointed at with its own `run:` line instead (below). */
export const AGENT_TOOLS = ['report', 'outcome', 'budget', 'template'] as const;

/** One extra `run:` line, appended only when no key is configured: the same plugin-context detection doctor's
 *  `key:` line uses (setup/plugin.ts's `inPluginContext`), so a cold agent reading the overview sees how to add
 *  one without a separate `doctor` call. `resolveJevConfig` can throw on a bad `TYPESAFE_BASE_URL` — that's
 *  `doctor`'s stop to report, not this free card's, so a bad config here just skips the hint rather than
 *  crashing the overview. */
function noKeyRunLine(env: Record<string, string | undefined>, deps: { resolveStored?: ResolveStored }): string[] {
  let config;
  try {
    config = resolveJevConfig(env, deps);
  } catch {
    return [];
  }
  if (hasKey(config)) return [];
  return [inPluginContext(env) ? `run: no key (sample answers only) → ${NO_KEY_PLUGIN_HINT}` : 'run: no key → mm3 init to add one'];
}

/** `verbs (pick by goal):` then `tools:`, each followed by one `- name: purpose` bullet per entry, from the
 *  same VERB_LINE/TOOL_LINE text `help`'s card renders (verbs.ts, report.ts) — never a second, divergent
 *  copy. [C-189] */
/** The `where:`/`MM3_HOME` fact: a runtime/environment rule, not a request-schema one, so it's hand-
 *  written rather than pulled from rules.ts's RULES (which is built only from schema-check.ts/validate.ts
 *  constants — see that file's own header comment). Defined once, here, since only `agent`'s overview states
 *  it: an agent is the one that actually passes the MCP `project` arg or sets `MM3_HOME`, so a cold
 *  agent — not a human reading `help` — is who needs this before its first call (round-4 finding: an agent
 *  had to fail once, `✖ mak.where: cannot read "app/routes/contributions.js"`, to learn `where:` resolves
 *  against `project`/`MM3_HOME`, not session cwd). [C-195] */
const PROJECT_SCOPE_RULE =
  "- where: resolves against the MCP `project` argument or `MM3_HOME` (CLI), never your session cwd — pass `project` (or set `MM3_HOME`) when you started elsewhere.";

/** Plan 2b: the overview points at the probe-writing skill in its first lines (the first bullet under
 *  `rules:`, right after the verb/tool lists) — before an agent writes a single probe, not after it fails one. */
const PROBE_SKILL_RULE = '- before writing or editing any request, read the mm3-probe skill (or run `mm3 agent probe`): what makes a probe worth asking.';

/** Agent-only rules (evidence discipline and how the verbs chain), hand-written here like PROJECT_SCOPE_RULE:
 *  they are about how an agent reports and sequences its work, not about a request's schema, so they are not in
 *  rules.ts's RULES. Cold-agent trials showed all three gaps: "what changed between releases?" answered with
 *  `git diff` (never `replay`), `budget: ... left` misread as a limit, and speed-gain percentages reported with
 *  no answer behind them next to a "no workarounds" claim. [C-230] [C-231] */
const CHAIN_RULES = [
  '- open goal, in order: view (free reuse) → scan (find where) → drill (go deeper on a flagged item; follow next:) → loop (check the design) → replay (after a change).',
  '- what changed or drifted between releases or commits: replay a prior run with compare: {before: <ref>, after: <ref>} (no prior run: class or scan once at one ref first); git diff is not an mm3 check.',
] as const;
const EVIDENCE_RULES = [
  '- every number or claim you report comes from an mm3 answer (cite its id, e.g. MM3-0042) or is labelled your own estimate.',
  '- a check done without mm3 (git diff, reading code to answer a question) is a workaround: say so; never claim none.',
  '- notes: budget: … left is headroom, not a limit: stop only at ⚠ or exit 3, then tell the owner.',
] as const;

function overview(env: Record<string, string | undefined>, deps: { resolveStored?: ResolveStored }): string {
  return renderCard(
    [
      'verbs (pick by goal):',
      ...VERBS.map((v) => `- ${v}: ${VERB_LINE[v]}`),
      'tools:',
      ...AGENT_TOOLS.map((t) => `- ${t}: ${TOOL_LINE[t]}`),
    ],
    [PROBE_SKILL_RULE, ...ruleLines('card'), PROJECT_SCOPE_RULE, ...CHAIN_RULES, ...EVIDENCE_RULES],
    [],
    [
      'run: mm3 agent <verb|tool> — before writing that request',
      'run: mm3 agent probe — before writing questions: how to phrase one',
      'run: mm3 agent verdict — before reading a response: how to read it',
      'run: mm3 agent delegate — before handing MM3 work to a helper agent: what to paste into its prompt',
      'run: mm3 init --agents --yes — to set this project up for agents: writes the MM3 guidance into AGENTS.md (alone, not with mm3 init)',
      ...noKeyRunLine(env, deps),
    ],
  );
}

/** SHARP[verb] first (verbs.ts's own gotcha prose, e.g. drill's "follow next:" and change's "never ask:") then
 *  ruleLines(verb) — one shared `rules:` list, never a second copy; every verb gets SHARP now, not just
 *  drill/change (round-4 finding: `agent drill`/`agent change` rendered an empty `rules:` section because
 *  neither RULES nor patterns.ts had anything tagged for them, even though this prose already existed in
 *  verbs.ts's SHARP, just unreachable from `agent`). [C-192] */
function verbCard(verb: Verb): string {
  return renderCard([`verb: ${verb}`], [...SHARP[verb].map((s) => `- ${s}.`), ...ruleLines(verb)], terseLines(verb));
}

/** PROBE_RULES (TypeSafe's own published guidance, cited in `help probe`, bare here) then `ruleLines('probe')`
 *  — MM3's own hard validator rules that also apply while writing a question (today: the per-question
 *  character cap), tagged 'probe' in rules.ts so they reach this card without a second copy. [C-194] */
function probeCard(): string {
  return renderCard(
    ['tool: probe'],
    [
      ...PROBE_RULES.map((r) => `- ${r.text}`),
      ...ruleLines('probe'),
      ...FAMILY_ROLES.map((f) => `- ${f.family}: ${f.roles.join(' · ')}`),
      `- bad: "${BAD_PROBE_EXAMPLE.bad}" — ${BAD_PROBE_EXAMPLE.why}`,
      ...BAD_PROBE_EXAMPLE.good.map((g) => `- good: ${g}`),
      '- see: the mm3-probe skill for the full model and worked examples',
    ],
  );
}

/** rules.ts's `VERDICT_FACTS` bare, no headings, no prose framing — the same list `help verdict`'s prose wraps.
 *  Round-4 finding: this response-side vocabulary (consensus, escalate, stale, reused, fixed/still/regressed,
 *  what unsure means, goal vs category gates) was never taught before a response first showed it. [C-196] */
function verdictCard(): string {
  return renderCard(['tool: verdict'], [...ruleLines('verdict'), ...VERDICT_FACTS.map((f) => `- ${f}`)]);
}

function outcomeCard(): string {
  return renderCard(
    ['tool: outcome'],
    [
      '- syntax: mm3 outcome <MM3-####> held|overruled|failed --by <actor>',
      '- no --note flag: keep a reason in your own notes, not here',
      "- an actor can't mark its own asked run held: use a different --by, or record overruled or failed",
      '- same outcome, same actor, twice: exit 0, no-op',
    ],
    [
      'patterns:',
      '- why: held needs a second actor; never self-certify',
      '  bad:',
      '    mm3 outcome MM3-0002 held --by claude',
      '  good:',
      '    mm3 outcome MM3-0002 held --by <the user or a reviewer agent, not you>',
    ],
  );
}

function budgetCard(): string {
  return renderCard(
    ['tool: budget'],
    [
      '- read-only: prints what is left and how to change it',
      '- the caps live in .mm3/config.yaml: budget.usd, budget.runs (and budget.per, budget.since, budget.warnAt)',
      '- change one, then run mm3 config --load: a changed budget restarts the count',
      '- over either cap: exit 3, before spending anything',
    ],
    [
      'patterns:',
      '- why: `budget set` and `budget reset` were removed, the config is the one place to change it',
      '  bad:',
      '    mm3 budget set --usd 5 --runs 500',
      '  good:',
      '    # edit budget.usd / budget.runs in .mm3/config.yaml, then:',
      '    mm3 config --load',
    ],
  );
}

/** `mm3 agent doctor`'s card. Bare `doctor` is the full system report (provider/key/project/
 *  node/config); `doctor <file|->` is a narrower, standalone check — no project, no ledger, no classifier — of
 *  ONE document, auto-detecting whether it's a request (`mak:`) or a `.mm3/config.yaml`-shaped file. */
function doctorCard(): string {
  return renderCard(
    ['tool: doctor'],
    [
      '- syntax: mm3 doctor  ·  or: mm3 doctor <file | ->',
      '- free: no call, no spend, never writes',
      '- bare form: reports provider/route/key/project/node/config in one pass — also validates .mm3/config.yaml when present',
      '- <file|-> form: checks ONE document, no project needed — a mak: key means a request (same checks as --dry-run); anything else is checked as config',
      '- <file|-> never touches the ledger, reuse or budget, even inside a project',
    ],
  );
}

function reportCard(): string {
  return renderCard(
    ['tool: report'],
    [
      '- free: never calls a provider, never writes to the ledger',
      '- views: hits (default), patterns, history, web, graph, problems, mdl, calls, fields',
      '- web writes one file, .mm3/viewer.html, and tries to open it — the only view that writes anything',
      '- graph/problems/mdl/calls read the graph tier (its own watermark, refreshed on read, never on a paid call)',
      '- fields: undeclared mdl keys with counts/samples/a suggested type; --accept <field> writes it into config mdl:',
    ],
    [
      'patterns:',
      '- why: no view beyond hits, patterns, history, web, graph, problems, mdl, calls or fields exists',
      '  bad:',
      '    mm3 report level2',
      '  good:',
      '    mm3 report patterns',
    ],
  );
}

function templateCard(): string {
  return renderCard(
    ['tool: template'],
    [
      '- syntax: mm3 template <verb> [--parent MM3-#### --from <item-or-category>]',
      '- or: mm3 template <verb> --from <request.yaml> [--where <path>]... [--goal <text>]',
      '- free: no project needed, never spends, never writes',
      '- --parent only applies to drill, and needs --from too',
      '- --where/--goal need --from; refused together with --parent',
    ],
    [
      'patterns:',
      '- why: --parent only works with drill',
      '  bad:',
      '    mm3 template class --parent MM3-0002 --from injection',
      '  good:',
      '    mm3 template drill --parent MM3-0002 --from injection',
    ],
  );
}

/** `mm3 agent config`'s card: `mm3 config` is free, never writes (`--write` writes only a missing starter file,
 *  `--load` records a receipt in the ledger), and works with or without a project. Terse like every other tool card here — the full key list lives in `mm3 config`'s
 *  own output (it prints every effective value plus its source), not repeated here. */
function configCard(): string {
  return renderCard(
    ['tool: config'],
    [
      '- syntax: mm3 config [--write | --load [file]]',
      '- free: plain config never writes, never spends, works with or without a project',
      '- prints every effective setting (budget, provider, baseURL, model, pricing, timeoutMs, retries, backoffMs, sweep, requestMaxBytes, reuse, depth, evidence, lens, mdl) and which of default/config/env it came from',
      '- .mm3/config.yaml IS the config: every request reads it, so an edit applies at once and deleting the file means defaults',
      '- to return to the defaults, delete .mm3/config.yaml, then run mm3 config --load (it records the change); do not guess old values',
      '- mm3 config --load [file] checks the file (a named file is copied to .mm3/config.yaml as is) and records a receipt in the ledger: ✔ valid · loaded · N changed since the last load, or every ✖ problem and nothing recorded',
      '- doctor and mm3 config compare the file with the latest receipt: ✔ config: loaded <time>, or ⚠ config.yaml is in effect but its latest change is not recorded → mm3 config --load',
      '- a changed budget (usd, runs, per) restarts the count when loaded; the receipt says so',
      '- a config.yaml with a problem stops paid runs (class, scan, drill, loop, replay) with every ✖ and the fix; reads still answer',
      '- sparse overrides only, precedence env > config > default',
      '- the display is not a file: to customize run mm3 config --write → writes .mm3/config.yaml (commented guide) only if missing, never overwrites',
      '- a misnamed .mm3/config.ymal (or config.yml, config.json) gets a did-you-mean note here and in doctor',
    ],
  );
}

/** `mm3 agent delegate`'s card: a block a lead agent pastes into every helper prompt that may use MM3. Helpers do not
 *  reliably inherit the lead's instructions (the MCP `instructions` reach the lead only), so this carries what a helper
 *  needs: the guidance body plus how to report. */
function delegateCard(): string {
  return renderCard(
    ['tool: delegate'],
    [
      '- paste this card into the prompt of every helper you hand MM3 work to',
      '- use only the `mm3` MCP tool, never the shell (there is no mm3 command on PATH), one request at a time; never read .mm3/log.jsonl',
      '- write each request by editing the output of `mm3 template <verb>`, not from scratch; quote any question that holds ": " or " #"; a verb that stops with ✖ says the fix, apply it and resend',
      '- report each MM3 run id with its gate, and say what you did NOT run; the lead checks the ids against the ledger before relying on the report',
      '- start with one small request, then the batch; a helper that stops early or says it finished is checked, not trusted',
      ...GUIDANCE_BODY,
    ],
  );
}

/** `mm3 agent mdl`'s legend card — deliberately NOT built through `renderCard`: it has its
 *  own fixed shape (FIELDS/ARCHITECTURE/WRITE IT FLAT/EXAMPLE, no `rules:`/`patterns:`/`run:`), spelled out
 *  verbatim by the plan, so it's exempt from the "every card follows the same key order" invariant
 *  (test/unit/agent.test.ts's NON_VERBS list deliberately leaves `mdl` out for this reason). The FIELDS block's
 *  values and notes come from `mdl-fields.ts`'s MDL_FIELDS table (not retyped here); a unit test cross-checks
 *  every table entry still appears in this text, so the two can't silently drift apart. With a project config,
 *  the table also gains that project's overrides. */
/** blast's own values (types.ts's BLASTS) are ordered narrowest-first (validation only cares about set
 *  membership) — the card shows them widest-first (person, the biggest blast radius, first) since that's the
 *  order a reader scans the C4 levels in. Card-display order only; validation still goes through closedValues. */
const BLAST_CARD_ORDER = ['person', 'system', 'container', 'component', 'code'];

/** A field's note, plus its project alias (`mdl.<field>.as`) when it has one — an alias ADDS a
 *  name (the original key still works too, per mdl-fields.ts's effectiveMdlFields), so the card says so
 *  rather than silently relabeling the field and hiding the original. */
function noteWithAlias(field: MdlField): string {
  return field.alias ? `${field.note ?? ''}${field.note ? ' ' : ''}(also: mdl.${field.alias})` : (field.note ?? '');
}

/** `mdlFields`: the caller's effective (project-config-aware) table — defaults to the
 *  built-in MDL_FIELDS, the exact card `mm3 agent mdl` always printed before config overrides existed.
 *  Values/notes come straight from whichever table is given; `blast`'s card-display order (below) falls back to
 *  the built-in widest-first BLAST_CARD_ORDER only when its values are still the built-in default — an override
 *  is shown in its own given order instead. */
function mdlCard(mdlFields: readonly MdlField[] = MDL_FIELDS): string {
  const [why, area, stage, change, risk, problem, uses, blast, touches] = mdlFields as unknown as [
    MdlField, MdlField, MdlField, MdlField, MdlField, MdlField, MdlField, MdlField, MdlField,
  ];
  const blastValues = blast.values === BLASTS ? BLAST_CARD_ORDER : closedValues(blast).slice(0, -1);
  return [
    `tool: mdl — optional, free, ≤${MAX_MDL_LINES} lines. Flat keys; the only nesting is a list.`,
    "Every field is optional: fill what you know, omit what doesn't apply.",
    '',
    'FIELDS',
    `  why      ${closedValues(why).slice(0, -1).join(' | ')}${why.alias ? `  (also: mdl.${why.alias})` : ''}`,
    `  area     ${closedValues(area).slice(0, -1).join(' | ')}          (list ≤${area.maxList}; ${noteWithAlias(area)})`,
    `  stage    ${closedValues(stage).slice(0, -1).join(' | ')}   (${noteWithAlias(stage)})`,
    `  change   ${closedValues(change).slice(0, -1).join(' | ')}   (${noteWithAlias(change)})`,
    `  risk     ${closedValues(risk).slice(0, -1).join(' | ')}         ${noteWithAlias(risk)}`,
    `  problem  ${noteWithAlias(problem)}`,
    `  uses     ${noteWithAlias(uses)}`,
    `  blast    ${blastValues.join(' | ')}   ${noteWithAlias(blast)}`,
    `  touches  ${noteWithAlias(touches)}`,
    `  <other>  any kebab-case key: one line ≤160 or a list ≤5, recorded as-is`,
    `  ${UNKNOWN_VALUE}  allowed as a value for any closed field`,
    '',
    'ARCHITECTURE: the C4 model (c4model.com). Five levels, each inside the one above:',
    '',
    '  system: shop',
    '  └── container: web-app                      an app or data store',
    '  │   ├── component: orders-handler           a group of code inside a container',
    '  │   │   └── code: createOrder               your own function (not a built-in)',
    '  │   └── component: orders-dao',
    '  └── container: database',
    '  person: customer                             outside the system',
    '  system: payment-service                      an outside service is its own system',
    '',
    'WRITE IT FLAT',
    '  inside  →  parent/child in the name:  component:web-app/orders-handler',
    '  uses    →  ->  between parts:         a -> b -> c',
    '  guessed or not built yet  →  end any part with ?:  component:web-app/refunds?  system:email-service?',
    '',
    '  chain   :=  part ( " -> " part )*',
    '  part    :=  level ":" name ( "/" name )* [ "?" ]',
    `  level   :=  ${CHAIN_LEVELS.join(' | ')}`,
    '  name    :=  lowercase kebab-case, or a code identifier at the code level',
    '',
    'EXAMPLE',
    '  mdl:',
    '    why: validate',
    '    problem: request input reaches a raw query in order creation',
    '    uses:',
    '      - person:customer -> container:web-app',
    '      - component:web-app/orders-handler -> component:web-app/orders-dao -> container:database',
    '    blast: container',
    '    touches: [Order, amount]',
  ].join('\n');
}

/** Non-verb targets `agent` recognizes, beyond the six verbs above. `mdl` is deliberately not a
 *  `renderCard`-shaped tool card — see mdlCard's own comment. */
const AGENT_TOPICS: Record<string, () => string> = {
  probe: probeCard,
  verdict: verdictCard,
  outcome: outcomeCard,
  budget: budgetCard,
  report: reportCard,
  template: templateCard,
  mdl: mdlCard,
  config: configCard,
  doctor: doctorCard,
  delegate: delegateCard,
};
const agentExtras = (): string[] => Object.keys(AGENT_TOPICS);
/** Re-exported for the CLI's own usage line, the same way help/index.ts's HELP_EXTRAS already is. */
export const AGENT_EXTRAS: readonly string[] = Object.keys(AGENT_TOPICS);

/** `env`/`deps` default to an empty environment (no key, not inside the plugin) so every existing caller that
 *  doesn't care about the no-key hint — every verb/tool card is unaffected by either — keeps working
 *  unchanged; cli.ts's real wiring passes `ctx.env` and the same `resolveStored` doctor uses. `deps.paths`
 *  (additive): when given, `mm3 agent mdl` reads that project's own `.mm3/config.yaml`
 *  `mdl:` overrides and generates the card from the EFFECTIVE table instead of the built-in one; omitted
 *  (every existing caller/test), the card stays exactly the built-in one it always was. */
export function runAgent(
  target?: string,
  env: Record<string, string | undefined> = {},
  deps: { resolveStored?: ResolveStored; paths?: Mm3Paths } = {},
): VerbResult {
  if (target === undefined || target === '') return { exit: 0, text: overview(env, deps) };
  if (hasControlChars(target)) return { exit: 2, text: '✖ agent: the target has control characters → use a verb name' };
  if (isVerb(target)) return { exit: 0, text: verbCard(target) };
  if (target === 'mdl' && deps.paths) return { exit: 0, text: mdlCard(effectiveMdlFields(resolveConfig(deps.paths, env).config.mdl)) };
  if (Object.hasOwn(AGENT_TOPICS, target)) return { exit: 0, text: AGENT_TOPICS[target]!() };
  return { exit: 2, text: `✖ agent: "${clip(target, 40)}" is not a verb → one of ${VERBS.join(', ')}, or ${agentExtras().map((t) => `"${t}"`).join(', ')}` };
}

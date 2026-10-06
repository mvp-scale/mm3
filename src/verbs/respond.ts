/**
 * The compact YAML response, shared by every verb (contract "Every response"). Pure formatting, no I/O: builds
 * the `mak:`/`plan:` Value tree and hands it to emit.ts. Pins the exact shapes later verbs (replay, loop, scan,
 * drill) depend on — a change here is a change to what every verb prints.
 */
import { isRehearsal } from '../classifier/port.ts';
import { emit, m, type Value } from '../contract/emit.ts';
import type { CategoryGrade, ItemGrade, Shown, SubjectGrade } from '../contract/grade.ts';
import type { Answer, Category, Depth, Gate, Mak, Mdl } from '../contract/types.ts';
import { IRREVERSIBLE_NOTE } from '../contract/validate.ts';
import type { Mm3Paths } from '../ledger/paths.ts';
import { computeConsensus, type Consensus, type SlotAnswer } from '../lens/consensus.ts';
import { agentsNote } from '../setup/agents-status.ts';
import { clip } from '../util/text.ts';

/** A bare number for yes/no; {top, p} for scale/choice. */
export function shownValue(s: Shown): Value {
  return typeof s === 'number' ? s : m(['top', s.top], ['p', s.p]);
}

export function categoryEntry(g: CategoryGrade): [string, Value] {
  return [g.name, m(['gate', g.gate], ...[...g.values].map(([n, v]): [string, Value] => [String(n), shownValue(v)]))];
}

/** One subject's `mak:` block: id, gate, the goal (when asked), every category, then whatever the verb adds. */
export function subjectMak(id: string, gate: Gate, subject: SubjectGrade, extra?: Array<[string, Value]>): Map<string, Value> {
  return m(
    ['id', id],
    ['gate', gate],
    ...(subject.goal ? [['goal', m(['gate', subject.goal.gate], ['p', subject.goal.p])] as [string, Value]] : []),
    ...subject.categories.map(categoryEntry),
    ...(extra ?? []),
  );
}

/** Every distinct run id an answer was reused from, sorted. Empty when nothing was reused — a one-subject
 *  verb's response says which prior runs its answers came from, not just that some were reused. */
export function reusedIds(reusedFrom: Record<string, string>): string[] {
  return [...new Set(Object.values(reusedFrom))].sort();
}

/** class and drill's one-subject shape both derive consensus and escalate the same way: consensus is the
 *  yes/no category answers only (never the goal, never scale/choice); escalate fires on non-STRONG consensus,
 *  `depth: thorough`, or a goal that reads as irreversible (validate.ts's own IRREVERSIBLE_NOTE). */
export function consensusAndEscalate(
  categories: readonly Category[],
  answers: Record<string, Answer>,
  depth: Depth | null | undefined,
  notes: readonly string[],
  lens?: Parameters<typeof computeConsensus>[1],
): { consensus: Consensus; escalate: boolean } {
  const slots: SlotAnswer[] = categories
    .filter((c) => c.questions[0]?.kind === 'yesno')
    .flatMap((c) => c.questions.map((q) => ({ pos: q.n, reverse: c.pass === 'yes', p: (answers[String(q.n)] as { kind: 'yesno'; p: number }).p })));
  const consensus = computeConsensus(slots, lens).consensus;
  const escalate = consensus !== 'STRONG' || depth === 'thorough' || notes.some((n) => n.startsWith(IRREVERSIBLE_NOTE));
  return { consensus, escalate };
}

/** `mdl: {recorded: [...]}` fields, or the string "none" when nothing was recorded. Named in `Mdl`'s own
 *  field order (why, area, stage, change, risk, problem, uses, touches, blast — the `uses` replaces plan
 *  2b's `nodes` in the same slot); any custom keys (mdl.extras) are appended next, sorted; `extra` (e.g.
 *  replay.ts's `['parent']`) always comes last. */
export function mdlRecorded(mdl: Mdl | null, extra?: readonly string[]): Value {
  const fields = [
    ...(mdl?.why ? ['why'] : []),
    ...(mdl?.area && (!Array.isArray(mdl.area) || mdl.area.length) ? ['area'] : []),
    ...(mdl?.stage ? ['stage'] : []),
    ...(mdl?.change ? ['change'] : []),
    ...(mdl?.risk ? ['risk'] : []),
    ...(mdl?.problem ? ['problem'] : []),
    ...(mdl?.uses?.length ? ['uses'] : []),
    ...(mdl?.touches?.length ? ['touches'] : []),
    ...(mdl?.blast ? ['blast'] : []),
    ...(mdl?.extras ? Object.keys(mdl.extras).sort() : []),
    ...(extra ?? []),
  ];
  return fields.length ? fields : 'none';
}

/** `mdl` is always shown as {recorded: ...} (contract: "mdl: {recorded: [why, area]}", or "{recorded: none}"). */
export function respondText(mak: Map<string, Value>, mdl: Value, next: string, notes: readonly string[]): string {
  return emit(m(['mak', mak], ['mdl', m(['recorded', mdl])], ['next', next], ['notes', [...notes]]));
}

/** Validation and evidence notes first; a rehearsal adapter (fake, chaos — port.ts's own REHEARSAL_ADAPTERS)
 * gets a "not evidence" label next, so an agent can't mistake a rehearsal answer for a real one just by
 * skimming notes; the one-time `agents:` note (setup/agents-status.ts) and any request-level note (`ctx.notes`) come just before the budget note, which is always last. */
export function commonNotes(notes: readonly string[], budgetNote: string, adapter?: string, paths?: Mm3Paths, requestNotes: readonly string[] = []): string[] {
  const agents = paths ? agentsNote(paths) : undefined; // first real run of the project only (a dry run prints its own plan)
  return [...notes, ...(adapter && isRehearsal(adapter) ? [`adapter ${adapter} · not evidence`] : []), ...(agents ? [agents] : []), ...requestNotes, budgetNote];
}

/**
 * The two fixed strings a non-pass gate can print with nothing concrete to drill into (no ": " in either, so
 * scalar() leaves them plain — see emit.ts). Both name what's actually true instead of pointing at a
 * passing item/category, which "why did this fail?" would make of a bare drillNext target.
 */
const GOAL_ONLY_NEXT = 'the goal missed though every part passed · fix what is missing, then run it again';
const ALL_SKIPPED_NEXT = 'every item was skipped · raise depth or narrow over, then run it again';

/**
 * pass → the verb's own text. Otherwise drill the first category whose own gate matches the subject's overall
 * gate, in written order. When no category is to blame — every one of them is 'pass', so the overall gate is
 * non-pass only because the goal itself missed — say so instead of drilling a category that's actually fine.
 */
export function outcomeNext(id: string, gate: Gate, graded: readonly CategoryGrade[], categories: readonly Category[], onPass: string): string {
  if (gate === 'pass') return onPass;
  const gateOf = new Map(graded.map((g) => [g.name, g.gate]));
  const target = categories.find((c) => gateOf.get(c.name) === gate)?.name;
  if (target) return drillNext(id, target);
  return categories.every((c) => gateOf.get(c.name) === 'pass') ? GOAL_ONLY_NEXT : drillNext(id, categories[0]!.name);
}

export function drillNext(id: string, target: string): string {
  return `mm3 template drill --parent ${id} --from ${target}`;
}

/**
 * Anything in `regressed` can alone fail replay's gate even when every "after" category grades pass on its
 * own (a `need: any` category clearing on a question that never regressed, say) — outcomeNext's own "which
 * category matches the overall gate?" search then finds nothing and falls back to GOAL_ONLY_NEXT, which is
 * wrong here: the goal can pass too. C-065: anything regressed should be reverted or drilled into; next:
 * points at the category the first regressed question belongs to (regressed is sorted, so this is stable).
 */
export function regressionNext(id: string, regressed: readonly number[], categories: readonly Category[]): string {
  const first = regressed[0]!;
  const target = categories.find((c) => c.questions.some((q) => q.n === first))?.name ?? categories[0]!.name;
  return drillNext(id, target);
}

/**
 * pass → onPass. Otherwise drill the worst item (worstFirst's own order). Two ways a sweep can be non-pass
 * with nothing to drill into: every item's own categories clear the bar and only the goal misses (`worst` is
 * empty, `graded` isn't — the goal-only case, same shape as outcomeNext's own categories-all-pass check), or
 * nothing was graded at all because every item was skipped past the depth cap (both empty). Either way,
 * pointing drillNext at a passing item ("why did this fail?" on something that didn't) would be worse than
 * just saying which of the two happened.
 */
export function sweepNext(id: string, gate: Gate, worst: readonly ItemGrade[], graded: readonly ItemGrade[], onPass: string): string {
  if (gate === 'pass') return onPass;
  if (worst.length) return drillNext(id, worst[0]!.id);
  return graded.length ? GOAL_ONLY_NEXT : ALL_SKIPPED_NEXT;
}

/** `route` (direct/gateway/custom, or fake/chaos) names what would answer; `baseURL` is shown only when
 *  there is one (fake/chaos have none) — never the key. `extraNotes`: e.g. a budget cap already
 *  reached, so a dry run can say a real run would be blocked without itself failing. */
export function dryRunText(
  plan: { calls: number; questions: number; items?: number; reused?: number; route: string; baseURL?: string | null },
  extraNotes: readonly string[] = [],
): string {
  return emit(
    m(
      [
        'plan',
        m(
          ['calls', plan.calls],
          ['questions', plan.questions],
          ...(plan.items !== undefined ? [['items', plan.items] as [string, Value]] : []),
          ...(plan.reused !== undefined ? [['reused', plan.reused] as [string, Value]] : []),
          ['route', plan.route],
          ...(plan.baseURL ? [['baseURL', plan.baseURL] as [string, Value]] : []),
        ),
      ],
      ['notes', ['dry run: no call, no spend', ...extraNotes]],
    ),
  );
}

const MAX_PROBE_WARNINGS = 3;

/** Extensions the file-path backtick check treats as "looks like a real file" — enough to tell `src/other.ts`
 *  or `config.json` (a path with nothing to answer from) apart from a backticked code identifier like
 *  `db.query` or `req.query.id` (the mm3-probe skill tells agents to backtick both kinds). */
const PATH_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'java', 'rb', 'php', 'cs', 'json', 'yaml', 'yml', 'html', 'sql', 'md', 'sh', 'env',
]);

/** A backticked token is worth checking against `where:` only when it looks like a file path: it has a `/`,
 *  or its last dotted segment is a known file extension. A bare code identifier (`db.query`, `req.query.id`)
 *  has a dot but no recognized extension, so it's left alone. */
function looksLikeFilePath(text: string): boolean {
  if (text.includes('/')) return true;
  const dot = text.lastIndexOf('.');
  if (dot <= 0 || dot === text.length - 1) return false;
  return PATH_EXTENSIONS.has(text.slice(dot + 1).toLowerCase());
}

/** Every yes/no/scale/choice question across a request's own shape: flat categories for one subject, or every
 *  layer's categories for a sweep — never both at once (`Mak.categories` is empty in a sweep, `Mak.layers` is
 *  empty for one subject). */
function allQuestions(mak: Mak): readonly { text: string }[] {
  return [...mak.categories, ...mak.layers.flatMap((l) => l.categories)].flatMap((c) => c.questions);
}

/** Item F (round 4 fix batch G): up to 3 `probe:`-prefixed WARNINGS in `--dry-run`'s own notes for
 *  mechanically-checkable authoring issues in `ask:` — never a new stop, never a new validator rule. Explicitly
 *  skips a category mixing yes/no polarity words: that's a semantic judgment call, not something this can check
 *  by pattern alone (`mm3 agent probe`'s own rule 4 already teaches it in prose). A question over 160
 *  characters is likewise skipped here — the schema stops that outright (schema-check.ts), so by the time a
 *  request reaches `--dry-run` it can no longer be true. */
export function probeWarnings(mak: Mak): string[] {
  const warnings: string[] = [];
  for (const q of allQuestions(mak)) {
    const marks = q.text.match(/\?/g)?.length ?? 0;
    if (marks >= 2 || / and /.test(q.text)) {
      warnings.push(`probe: "${clip(q.text, 60)}" reads as two questions joined into one — split it`);
    }
    if (mak.where.length > 0) {
      for (const m of q.text.matchAll(/`([^`]+)`/g)) {
        const named = m[1]!;
        if (looksLikeFilePath(named) && !mak.where.includes(named) && !mak.where.some((w) => w.startsWith(`${named}:`))) {
          warnings.push(`probe: "${clip(named, 60)}" is named in a question but not in where: — it has nothing to answer from`);
        }
      }
    }
  }
  return warnings.length > MAX_PROBE_WARNINGS
    ? [...warnings.slice(0, MAX_PROBE_WARNINGS), `probe: ${warnings.length - MAX_PROBE_WARNINGS} more question warning(s) not shown`]
    : warnings;
}

/** On the direct route TypeSafe reports no cost at all; when the answering model has a published rate
 *  (see typesafe/answers.ts), the cost is estimated from tokens instead of left at $0.00 — and this note says so. */
export const COST_ESTIMATED_NOTE = 'cost estimated from tokens (no live pricing reported)';

/** A sweep item that isn't all-pass: its own failing/unsure categories, then its failing/unsure questions, merged and sorted. */
export function sweepEntry(g: ItemGrade): [string, Value] {
  const catEntries: Array<[string, Value]> = [];
  const qEntries: Array<[number, Value]> = [];
  for (const c of g.own) if (c.gate !== 'pass') catEntries.push([c.name, c.gate]);
  for (const c of g.own) for (const [n, mark] of c.marks) if (mark !== 'pass') qEntries.push([n, shownValue(c.values.get(n)!)]);
  qEntries.sort((a, b) => a[0] - b[0]);
  return [g.id, m(...catEntries, ...qEntries.map(([n, v]): [string, Value] => [String(n), v]))];
}

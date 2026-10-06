// class on the contract: request → evidence → (reuse or) one call → grade → the compact YAML response.
import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadBudget, recordSpend } from '../../src/budget/budget.ts';
import { writeConfigOverride } from '../../src/config/write.ts';
import { EVIDENCE_LIMITS } from '../../src/evidence/code.ts';
import { hasGit } from '../../src/evidence/git.ts';
import { isContractRun, readLedger } from '../../src/ledger/log.ts';
import type { Stub } from '../helpers/stub-provider.ts';
import { runClass } from '../../src/verbs/class.ts';
import { gitCommit, gitInit, tempProject } from '../helpers/project.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

/** Wraps a stub so its answer reports an estimated cost, without changing stub-provider.ts (shared by other crews). */
const withEstimatedCost = (inner: Stub): Stub => ({ ...inner, ask: async (q, s) => ({ ...(await inner.ask(q, s)), costEstimated: true }) });

const CLASS_YAML = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');
const env = { MM3_ACTOR: 'reviewer-7' };
// The fixture's own concerns: injection [1,2,3], access [4,5,6], leaks [7,8,9] (all pass: no), then
// decisions: severity [10, scale] and route [11, choice] — 11 numbered questions + goal = 12 total.
// 10 (severity) and 11 (route) aren't yes/no: stubProvider only uses `pick` for those, never `yes`.
const P: Record<string, number> = { goal: 0.08, '1': 0.94, '2': 0.91, '3': 0.88, '4': 0.86, '5': 0.84, '6': 0.81, '7': 0.55, '8': 0.2, '9': 0.75 };
const PICK = { '10': 'high', '11': 'block' }; // neither passes (severity pass: [none, low]; route pass: [ship])

describe('class', () => {
  it('the contract class example: gate, categories, consensus STRONG, one call, logged as v2 [C-033] [C-034] [C-056]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'export function findUser(id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }\n' });
    const provider = stubProvider({ yes: (q) => P[q.id] ?? 0.5, pick: PICK });
    const r = await runClass(CLASS_YAML, { paths, provider, env, now: () => Date.parse('2026-09-26T12:00:00Z') });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('severity: {gate: fail, 10: {top: high, p: 0.90}}');
    expect(r.text).toContain('route: {gate: fail, 11: {top: block, p: 0.90}}');
    expect(r.text).toContain('consensus: STRONG');
    expect(r.text).toContain('escalate: false');
    expect(provider.calls).toHaveLength(1);
    // [C-035] one subject's call state is exactly {goal, code} — no run-level id/ts/actor/task ever reaches
    // the classifier ([C-023]: those are stamped by the engine afterwards, from the run it logs, not sent),
    // and [C-005]: mdl (why/area here) never reaches it either — mdl is ledger-only context.
    expect(Object.keys(provider.calls[0]!.state)).toEqual(['goal', 'code']);
    // [C-048] question text is never repeated in the response; the agent already has it by number.
    expect(r.text).not.toContain('Is request text placed directly into the SQL query?');
    const [run] = readLedger(paths).filter(isContractRun);
    expect(run).toMatchObject({ id: 'MM3-0001', v: 2, verb: 'class', calls: 1, consensus: 'STRONG' });
    expect(loadBudget(paths).state.runs).toBe(1);
  });

  it('a passing class points next: at Prove, with the real run id and a literal <before> placeholder [C-232]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'export function findUser(id) { return db.query("SELECT * FROM users WHERE id = ?", [id]); }\n' });
    const provider = stubProvider({ yes: (q) => (q.id === 'goal' ? 0.95 : 0.05), pick: { '10': 'low', '11': 'ship' } });
    // injection/access/leaks all pass: no, so a low P(yes) everywhere is a full pass
    const r = await runClass(CLASS_YAML, { paths, provider, env });
    expect(r.text).toContain('gate: pass');
    expect(r.text).toContain('next: act on it · then prove it with mm3 replay --parent MM3-0001 --compare <before>..HEAD\n');
  });

  it('an identical second run makes no call and is free, and says which run it reused [C-130]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'export function findUser(id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }\n' });
    const provider = stubProvider({ yes: (q) => P[q.id] ?? 0.5, pick: PICK });
    await runClass(CLASS_YAML, { paths, provider, env });
    const r2 = await runClass(CLASS_YAML, { paths, provider, env });
    expect(provider.calls).toHaveLength(1); // no second call
    expect(r2.exit).toBe(0);
    const runs = readLedger(paths).filter(isContractRun);
    expect(runs[1]).toMatchObject({ id: 'MM3-0002', calls: 0 });
    expect(loadBudget(paths).state.runs).toBe(1); // the free run isn't counted
    expect(r2.text).not.toContain('budget file created'); // only the run that actually created it says so
    expect(r2.text).toContain('reused: [MM3-0001]'); // [C-130] fix #6: which run's answers this one reused
  });

  // a fully-reused run's own telemetry gains a source:'cache' entry naming the origin,
  // prorated from that origin's real provider telemetry — the origin's whole 12-question call was reused whole
  // here, so this is an exact figure, not an estimate.
  it('a fully-reused second run records cache-side telemetry alongside the free run [C-130]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'export function findUser(id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }\n' });
    const provider = stubProvider({ yes: (q) => P[q.id] ?? 0.5, pick: PICK });
    await runClass(CLASS_YAML, { paths, provider, env }); // MM3-0001: one real call, 12 questions (goal + 11)
    await runClass(CLASS_YAML, { paths, provider, env }); // MM3-0002: fully reused
    const runs = readLedger(paths).filter(isContractRun);
    const origin = runs[0]!;
    const originTotalQuestions = origin.telemetry!.filter((t) => t.source === 'provider').reduce((n, t) => n + t.questions, 0);
    expect(runs[1]!.telemetry).toEqual([{ source: 'cache', from: origin.id, questions: originTotalQuestions, original: { costUsd: origin.costUsd }, savedUsd: origin.costUsd, estimated: false }]);
  });

  it('[C-160] a re-ask on the same place after the code changed says which older run answered it before', async () => {
    const { root, paths } = tempProject({ 'src/user.ts': 'export function findUser(id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }\n' });
    const provider = stubProvider({ yes: (q) => P[q.id] ?? 0.5, pick: PICK });
    await runClass(CLASS_YAML, { paths, provider, env }); // MM3-0001, on the original code
    writeFileSync(path.join(root, 'src/user.ts'), 'export function findUser(id) { return db.query("SELECT * FROM users WHERE id = ?", [id]); }\n');
    const r2 = await runClass(CLASS_YAML, { paths, provider, env }); // same place, same questions, changed code
    expect(r2.exit).toBe(0);
    expect(r2.text).not.toContain('reused'); // the evidence changed: nothing was free this time
    // notes: is a flow list; a note containing ": " is quoted, JSON-style, by emit.ts's own scalar() rule.
    expect(r2.text).toContain(JSON.stringify('stale: MM3-0001 answered "Is request text placed directly into the SQL quer…" on older code (p 0.94)'));
  });

  // budget.json is no longer the source of truth — a brand-new project with neither budget.json nor
  // config.yaml runs on silent defaults; the "created" note now fires once, when a legacy budget.json migrates.
  it('a legacy budget.json is migrated into config.yaml, and the first run says so (BRIEF §5) [C-093]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'export function findUser(id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }\n' });
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.budget, JSON.stringify({ capUsd: 5, capRuns: 500, spentUsd: 0, runs: 0, resetAt: '2020-01-01T00:00:00Z' }));
    const provider = stubProvider({ yes: (q) => P[q.id] ?? 0.5, pick: PICK });
    const r = await runClass(CLASS_YAML, { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('budget file created with defaults ($5.00 · 500 runs)');
  });

  it('a cost the provider only estimated (fix #4) is noted, not shown as if it were reported [C-132]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'export function findUser(id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }\n' });
    const provider = withEstimatedCost(stubProvider({ yes: (q) => P[q.id] ?? 0.5, pick: PICK }));
    const r = await runClass(CLASS_YAML, { paths, provider, env });
    expect(r.text).toContain('cost estimated from tokens (no live pricing reported)');
  });

  it('--dry-run: no provider call, no budget file, no ledger line, and predicts reuse (fix #5b) [C-088] [C-134]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'x' });
    const provider = stubProvider();
    const r = await runClass(CLASS_YAML, { paths, provider, env, dryRun: true });
    expect(r.exit).toBe(0);
    // fix #5b: nothing has ever run here, so all 12 questions (goal + 11 numbered) would be asked, none reused.
    expect(r.text).toBe('plan:\n  calls: 1\n  questions: 12\n  reused: 0\n  route: fake\nnotes: ["dry run: no call, no spend"]\n');
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths)).toEqual([]);
  });

  it('--dry-run after a real run: predicts a fully-reused, zero-call plan, and warns when the cap is already reached [C-134]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'export function findUser(id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }\n' });
    const provider = stubProvider({ yes: (q) => P[q.id] ?? 0.5, pick: PICK });
    await runClass(CLASS_YAML, { paths, provider, env });
    const dry = await runClass(CLASS_YAML, { paths, provider, env, dryRun: true });
    expect(dry.text).toBe('plan:\n  calls: 0\n  questions: 0\n  reused: 12\n  route: fake\nnotes: ["dry run: no call, no spend"]\n');
    expect(readLedger(paths)).toHaveLength(1); // the dry run itself logged nothing
  });

  it('--dry-run warns when a real run\'s one call would be blocked by an already-reached cap (fix #5b), but does not fail', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'x' });
    writeConfigOverride(paths, { budget: { runs: 1 } });
    recordSpend(paths, 0); // reach the cap without ever running class
    const provider = stubProvider();
    const r = await runClass(CLASS_YAML, { paths, provider, env, dryRun: true });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('would be blocked: the budget cap is already reached');
  });

  it('a risky-looking goal: the irreversible note comes before the budget note [C-047]', async () => {
    const RISKY_YAML = CLASS_YAML.replace('This login handler is safe to merge', 'This will delete the login handler safely');
    const { paths } = tempProject({ 'src/user.ts': 'export function findUser(id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }\n' });
    const provider = stubProvider({ yes: (q) => P[q.id] ?? 0.5, pick: PICK });
    const r = await runClass(RISKY_YAML, { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('looks irreversible');
    expect(r.text.indexOf('looks irreversible')).toBeGreaterThan(-1);
    expect(r.text.indexOf('looks irreversible')).toBeLessThan(r.text.indexOf('budget'));
  });

  // C-169: a where: entry the user typed, over the per-file limit, is a stop — never a silent truncation —
  // and class checks evidence before touching the budget or the ledger at all (a bad path is a request
  // problem, not a paid one), same as any other evidence error.
  it('an oversized source file: class stops before spending, and points at the agent card [C-169]', async () => {
    const big = 'x'.repeat(EVIDENCE_LIMITS.perFileChars + 5000);
    const { paths } = tempProject({ 'src/user.ts': big });
    const provider = stubProvider({ yes: (q) => P[q.id] ?? 0.5, pick: PICK });
    const r = await runClass(CLASS_YAML, { paths, provider, env });
    expect(r.exit).toBe(2);
    expect(r.text).toContain('too big to send');
    expect(r.text).toContain('→ see: mm3 agent class');
    expect(provider.calls).toHaveLength(0);
    expect(readLedger(paths)).toEqual([]);
  });

  it('an invalid request exits 2 before touching the budget or the ledger [C-002]', async () => {
    const { paths } = tempProject({});
    const r = await runClass('mak:\n  goal: too short one\n', { paths, provider: stubProvider(), env });
    expect(r.exit).toBe(2);
    expect(readLedger(paths)).toEqual([]);
  });

  it('a goal that misses the bar while every category passes: next says so, not categories[0]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'export function findUser(id) { return db.query("SELECT * FROM users WHERE id = ?", [id]); }\n' });
    // injection/access/leaks (all pass: no) low, so every probe clears; severity's default pick (none) and
    // route's default pick (ship) are both passing options too — every category passes. Only the goal misses.
    const ALL_PASS: Record<string, number> = { goal: 0.1, '1': 0.1, '2': 0.1, '3': 0.1, '4': 0.1, '5': 0.1, '6': 0.1, '7': 0.1, '8': 0.1, '9': 0.1 };
    const provider = stubProvider({ yes: (q) => ALL_PASS[q.id] ?? 0.5 });
    const r = await runClass(CLASS_YAML, { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('gate: fail');
    expect(r.text).toContain('goal: {gate: fail, p: 0.10}');
    expect(r.text).toContain('injection: {gate: pass');
    expect(r.text).toContain('access: {gate: pass');
    expect(r.text).toContain('leaks: {gate: pass');
    expect(r.text).toContain('severity: {gate: pass');
    expect(r.text).toContain('route: {gate: pass');
    expect(r.text).toContain('next: the goal missed though every part passed · fix what is missing, then run it again');
  });

  it('a rehearsal adapter (fake) labels its notes "not evidence" (BRIEF §5) [C-092]', async () => {
    const { paths } = tempProject({ 'src/user.ts': 'export function findUser(id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }\n' });
    const provider = stubProvider({ yes: (q) => P[q.id] ?? 0.5, pick: PICK, adapter: 'fake' });
    const r = await runClass(CLASS_YAML, { paths, provider, env });
    expect(r.exit).toBe(0);
    expect(r.text).toContain('adapter fake · not evidence');
  });

  // reuse.maxAgeDays/maxCommits now apply to every verb's reuse lookup, not just view's own
  // exact-reuse — class.ts stands in for the one-subject verbs here. maxCommits is used (not maxAgeDays) so the
  // test is deterministic without mocking the clock: git itself proves how far HEAD has moved.
  it('reuse.maxCommits: an answer further behind HEAD than the cap is re-asked, not reused', async () => {
    if (!hasGit()) return;
    const { root, paths } = tempProject({ 'src/user.ts': 'export function findUser(id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }\n' });
    gitInit(root);
    gitCommit(root, 'seed');
    const provider = stubProvider({ yes: (q) => P[q.id] ?? 0.5, pick: PICK });
    await runClass(CLASS_YAML, { paths, provider, env }); // MM3-0001, answers this exact evidence
    expect(provider.calls).toHaveLength(1);

    // Move HEAD 2 commits past the run that answered it, with no change to src/user.ts itself (same evidence).
    writeFileSync(path.join(root, 'unrelated.txt'), 'a');
    gitCommit(root, 'unrelated 1');
    writeFileSync(path.join(root, 'unrelated.txt'), 'b');
    gitCommit(root, 'unrelated 2');

    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.config, 'reuse:\n  maxCommits: 1\n');
    const r2 = await runClass(CLASS_YAML, { paths, provider, env });
    expect(r2.exit).toBe(0);
    expect(provider.calls).toHaveLength(2); // the stale answer was skipped: a real second call was made
    expect(r2.text).not.toContain('reused');
  });
});

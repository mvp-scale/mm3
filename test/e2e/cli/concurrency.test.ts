// Real concurrency: separate processes of the built CLI launched together, as agents in parallel do.
// Bounded to at most 10 processes per test (shared machine). Whatever the exit codes, budget and ledger agree:
// budget runs == run records + failed records (spend and log are one lock section).
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasNodeSqlite, mm3, mm3Async, type CliResult } from '../../helpers/cli.ts';
import { tempProject } from '../../helpers/project.ts';

const CLASS_YAML = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');
// index.db (ledger/index.ts) is a disposable SQLite sidecar: a real run persists it only when node:sqlite is
// actually available (Node >= 22.13); the Node < 22.13 fallback never writes one at all. Plan 2c B1: there's no
// budget.json any more (caps live in config.yaml, spend is ledger-derived) — a plain `class`/`outcome` flow
// with no config edit never creates config.yaml either.
// Nothing else: the one-time `agents:` note [C-234] is known from the ledger (no run recorded yet), not from a marker file.
const EXPECTED_FILES = ['.gitignore', ...(hasNodeSqlite ? ['index.db'] : []), 'log.jsonl'];

interface Line {
  kind: string;
  id: string;
  of?: string;
}

/** Reads the current run count straight off the built `mm3 budget` line (budget is
 *  ledger-derived, no separate budget.json to read) — e.g. "budget: $5.00 left of $5.00 · 497 of 500 runs left" (used = cap − left). */
function budgetRunsOf(root: string): number {
  const out = mm3(root, ['budget']).stdout;
  const m = /· (\d+) of (\d+) runs left(?: \((\d+) used\))?/.exec(out);
  if (!m) throw new Error(`could not read a run count from "mm3 budget": ${JSON.stringify(out)}`);
  return m[3] !== undefined ? Number(m[3]) : Number(m[2]) - Number(m[1]); // an overshot cap prints "(N used)"
}

/** Every log line parsed (a line that doesn't parse fails the test), plus the ledger-derived budget run count.
 *  `files` is snapshotted BEFORE the `mm3 budget` call this needs for `budgetRuns` — that call is itself a
 *  real CLI invocation (it can self-heal/persist index.db, same as any other command), so reading the directory
 *  after it would contaminate a caller that's asserting on `.files` alone (see the SIGKILL test below). */
function state(root: string): { lines: Line[]; runIds: string[]; counted: number; budgetRuns: number; files: string[] } {
  const dir = path.join(root, '.mm3');
  const lines = readFileSync(path.join(dir, 'log.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Line);
  const runIds = lines.filter((l) => l.kind === 'run').map((l) => l.id);
  const counted = runIds.length + lines.filter((l) => l.kind === 'failed').length;
  const files = readdirSync(dir).sort();
  return { lines, runIds, counted, budgetRuns: budgetRunsOf(root), files };
}

const expectedIds = (n: number): string[] => Array.from({ length: n }, (_, i) => `MM3-${String(i + 1).padStart(4, '0')}`);
const printedId = (r: CliResult): string | undefined => /^ {2}id: (MM3-\d{4,})$/m.exec(r.stdout)?.[1];
const isLockTimeout = (r: CliResult): boolean => r.status === 1 && r.stdout === '' && /^✖ lock: [^\n]+ → [^\n]+\n$/.test(r.stderr);

function project(): string {
  const { root } = tempProject();
  writeFileSync(path.join(root, 'req.yaml'), CLASS_YAML);
  return root;
}

/** A request file with a goal unique to `tag`: the contract reuses per-question answers (same evidence, same
 * question text) across requests, so two byte-identical requests race into one paid run and one free one. These
 * tests are about the lock, not reuse, so every concurrent request here gets its own goal — a key the ledger has
 * never seen — which always forces at least that one call, keeping every run paid and the counts exact. */
function reqFile(root: string, tag: string): string {
  const name = `req-${tag}.yaml`;
  writeFileSync(path.join(root, name), CLASS_YAML.replace('This login handler is safe to merge', `This login handler is safe to merge (${tag})`));
  return name;
}

describe('separate processes at once', () => {
  it('10 × class on a fresh project: unique gap-free ids, every line parses, budget runs == run + failed records', async () => {
    const root = project();
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => mm3Async(root, ['class', reqFile(root, String(i))])));
    for (const r of results) expect(r.status === 0 || isLockTimeout(r), `${r.status} ${r.stderr}`).toBe(true);
    const ok = results.filter((r) => r.status === 0);
    const s = state(root);
    expect(s.runIds).toEqual(expectedIds(ok.length));
    expect(ok.map(printedId).sort()).toEqual(s.runIds);
    expect(s.budgetRuns).toBe(s.counted);
    expect(s.files).toEqual(EXPECTED_FILES);
  }, 60_000);

  it('class and outcome interleaved: every outcome names a logged run, ids stay gap-free, budget agrees', async () => {
    const root = project();
    for (let i = 0; i < 3; i++) expect(mm3(root, ['class', reqFile(root, `seq${i}`)]).status).toBe(0);
    const jobs = [
      ...Array.from({ length: 4 }, (_, i) => mm3Async(root, ['class', reqFile(root, `par${i}`)])),
      mm3Async(root, ['outcome', 'MM3-0001', 'failed', '--by', 'owner']),
      mm3Async(root, ['outcome', 'MM3-0002', 'overruled', '--by', 'owner']),
      mm3Async(root, ['outcome', 'MM3-0003', 'held', '--by', 'owner']),
      mm3Async(root, ['outcome', 'MM3-0001', 'held', '--by', 'reviewer-2']),
    ];
    const results = await Promise.all(jobs);
    for (const r of results) expect(r.status, r.stderr).toBe(0);
    const s = state(root);
    expect(s.runIds).toEqual(expectedIds(7));
    const outcomes = s.lines.filter((l) => l.kind === 'outcome');
    expect(outcomes).toHaveLength(4);
    for (const o of outcomes) expect(s.runIds.indexOf(o.of!)).toBeGreaterThanOrEqual(0);
    expect(s.budgetRuns).toBe(s.counted);
    expect(s.counted).toBe(7);
    expect(s.files).toEqual(EXPECTED_FILES);
  }, 60_000);

  it('6 runs racing a cap of 3: at least 3 succeed, the rest are blocked; the cap may be overshot by up to concurrent − 1 (at most 8 runs)', async () => {
    const root = project();
    mkdirSync(path.join(root, '.mm3'), { recursive: true });
    writeFileSync(path.join(root, '.mm3', 'config.yaml'), 'budget:\n  runs: 3\n');
    expect(mm3(root, ['config', '--load']).status).toBe(0);
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => mm3Async(root, ['class', reqFile(root, String(i))])));
    const ok = results.filter((r) => r.status === 0);
    const blocked = results.filter((r) => r.status === 3);
    expect(ok.length + blocked.length).toBe(6);
    for (const r of blocked) {
      expect(r.stderr).toMatch(/^✖ budget: cap reached \([^\n]+\) → ask the owner to raise budget\.runs in \.mm3\/config\.yaml, then run mm3 config --load\n→ see: mm3 agent budget\n$/);
    }
    expect(ok.length).toBeGreaterThanOrEqual(3);
    expect(ok.length).toBeLessThanOrEqual(3 + (6 - 1));
    const s = state(root);
    expect(s.runIds).toEqual(expectedIds(ok.length));
    expect(s.budgetRuns).toBe(s.counted); // an overshot cap prints "(N used)", so the count is exact
    expect(s.counted).toBe(ok.length);
    expect(mm3(root, ['class', 'req.yaml']).status).toBe(3); // over the cap now: blocked until reset
  }, 60_000);

  // The dead holder's lock is broken once it is 2 s old (the grace for a pid in another namespace), so the next run
  // takes about 2 s plus its own run time; 4.5 s leaves room on a loaded machine and still proves no 5 s timeout.
  it('a process killed (SIGKILL) while holding the lock: the next run proceeds after the 2 s grace, not the 5 s timeout', async () => {
    const root = project();
    const lock = path.join(root, '.mm3', 'lock');
    const holder = spawn(
      process.execPath,
      ['-e', `const fs=require('fs');fs.mkdirSync(${JSON.stringify(path.dirname(lock))},{recursive:true});fs.writeFileSync(${JSON.stringify(lock)},process.pid+'\\n',{flag:'wx'});console.log('held');setInterval(()=>{},1000);`],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    await new Promise<void>((resolve) => holder.stdout.once('data', () => resolve()));
    const exited = new Promise((resolve) => holder.once('exit', resolve));
    holder.kill('SIGKILL');
    await exited;
    expect(readFileSync(lock, 'utf8')).toBe(`${holder.pid}\n`); // the dead holder's lock is still there

    const start = Date.now();
    const r = await mm3Async(root, ['class', 'req.yaml']);
    expect(r.status, r.stderr).toBe(0);
    expect(Date.now() - start).toBeLessThan(4500);
    // Unlike EXPECTED_FILES: this is a truly fresh project's very first command — log.jsonl doesn't exist yet
    // when checkLedger/nextRunNumber first touch the index (design binding #7: no ledger yet, touch nothing on
    // disk), and appendLine only creates log.jsonl moments later, in the same command. So this one command never
    // persists index.db even with node:sqlite available; the next command would. See ledger/index.ts's withIndex.
    expect(state(root).files).toEqual(['.gitignore', 'log.jsonl']);
  }, 30_000);
});

// A broken .mm3/ through the built CLI: a corrupt log or budget, or a log that can't be written, refuses
// with one clean line and a fix. Nothing is spent or logged, and the files are left for the owner to repair.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectCleanStop, mm3, snapshot, snapshotLedgerAndBudget } from '../../helpers/cli.ts';
import { tempProject } from '../../helpers/project.ts';

const CLASS_YAML = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');

function projectWithRun(): string {
  const { root } = tempProject();
  writeFileSync(path.join(root, 'req.yaml'), CLASS_YAML);
  expect(mm3(root, ['class', 'req.yaml']).status).toBe(0);
  return root;
}

describe('a corrupt log', () => {
  it('a garbage line mid-file: class, view and outcome refuse (exit 1) and change nothing', () => {
    const root = projectWithRun();
    appendFileSync(path.join(root, '.mm3', 'log.jsonl'), 'garbage\n{"kind":"outcome","of":"MM3-0001"}\n');
    const before = snapshot(root);
    const stop = '✖ ledger: line 2 of .mm3/log.jsonl is not valid JSON → fix or remove that line';
    expect(expectCleanStop(mm3(root, ['class', 'req.yaml']), 1)).toBe(stop);
    expect(expectCleanStop(mm3(root, ['view', 'src']), 1)).toBe(stop);
    expect(expectCleanStop(mm3(root, ['outcome', 'MM3-0001', 'failed', '--by', 'owner']), 1)).toBe(stop);
    expect(snapshot(root)).toEqual(before);
  });

  it('a truncated last line (no newline): class and outcome refuse; view reads past it (an append may be in progress)', () => {
    const root = projectWithRun();
    appendFileSync(path.join(root, '.mm3', 'log.jsonl'), '{"kind":"run","id":"MM3-00');
    // snapshotLedgerAndBudget, not the strict snapshot(): a truncated tail is NOT a mid-file parse error — the
    // incomplete last line is left unconsumed by the scanner (an append may be in progress), so class's own
    // preflight can still successfully self-heal (build or catch up) the index over the valid PREFIX before its
    // separate, stricter tail check refuses the command — legitimate self-healing, not a violation of "nothing
    // is spent or logged." budget.json must stay untouched here; log.jsonl keeps its truncated tail plus exactly
    // one new `kind:"lookup"` line from the successful view below (a place view now logs a free
    // lookup record — no longer the strict no-op this test used to pin).
    const before = snapshotLedgerAndBudget(root);
    const stop = '✖ ledger: line 2 of .mm3/log.jsonl is not valid JSON → fix or remove that line';
    expect(expectCleanStop(mm3(root, ['class', 'req.yaml']), 1)).toBe(stop);
    expect(expectCleanStop(mm3(root, ['outcome', 'MM3-0001', 'failed', '--by', 'owner']), 1)).toBe(stop);
    const view = mm3(root, ['view', 'src']);
    expect(view).toMatchObject({ status: 0, stderr: '' });
    expect(view.stdout).toMatch(/^mm3 view src · 1 run /);
    const after = snapshotLedgerAndBudget(root);
    expect(after?.['budget.json']).toEqual(before?.['budget.json']);
    expect(after?.['log.jsonl']?.startsWith(before?.['log.jsonl'] ?? '')).toBe(true);
    const appended = after!['log.jsonl']!.slice((before?.['log.jsonl'] ?? '').length);
    expect(appended.trim().split('\n')).toHaveLength(1);
    expect(appended).toContain('"kind":"lookup"');
  });
});

describe('a corrupt legacy budget.json', () => {
  // Plan 2c B1: budget.json is no longer the live authority — it's read at most once, purely to migrate its
  // caps into config.yaml, and any problem reading it (missing, corrupt, wrong shape) is simply "nothing to
  // migrate," never a fail-closed stop; class/budget/view all proceed normally on the built-in defaults.
  it('a corrupt legacy budget.json is silently ignored: class, budget and view all proceed on defaults', () => {
    const root = projectWithRun();
    writeFileSync(path.join(root, '.mm3', 'budget.json'), '{"capUsd": 5, "runs": ');
    expect(mm3(root, ['budget']).stdout.split('\n')[0]).toBe('budget: $5.00 left of $5.00 · 499 of 500 runs left');
    expect(mm3(root, ['view', 'src']).status).toBe(0);
    expect(mm3(root, ['class', 'req.yaml']).stdout).toMatch(/^mak:\n {2}id: MM3-0002\n/);
  });
});

describe('a write failure', () => {
  it('the log path is a directory: exit 1, one clean line; nothing is counted, and budget can no longer be shown either', () => {
    const { root } = tempProject();
    writeFileSync(path.join(root, 'req.yaml'), CLASS_YAML);
    mkdirSync(path.join(root, '.mm3', 'log.jsonl'), { recursive: true });
    const stop = '✖ files: cannot read .mm3/log.jsonl (EISDIR) → make .mm3/ a writable folder, with log.jsonl and budget.json as files';
    expect(expectCleanStop(mm3(root, ['class', 'req.yaml']), 1)).toBe(stop);
    // Plan 2c B1: budget is ledger-derived now — a broken log.jsonl means budget can't be computed either,
    // the same clean stop as everything else that reads the ledger (no separate budget.json left to fall back on).
    expect(expectCleanStop(mm3(root, ['budget']), 1)).toBe(stop);
  });
});

describe('a lock that is not a lock file', () => {
  it('.mm3/lock is a directory: exit 1 at once with one clean line, no spin', () => {
    const { root } = tempProject();
    writeFileSync(path.join(root, 'req.yaml'), CLASS_YAML);
    mkdirSync(path.join(root, '.mm3', 'lock'), { recursive: true });
    const start = Date.now();
    const r = mm3(root, ['class', 'req.yaml'], { timeoutMs: 8000 });
    expect(Date.now() - start).toBeLessThan(3000);
    expect(expectCleanStop(r, 1)).toBe('✖ files: .mm3/lock is not a lock file → remove it');
  });
});

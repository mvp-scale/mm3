// The ledger's `config` record: the receipt a `mm3 config --load` leaves (when, which file, the settings, what changed,
// the budget restart point). It is a record like a run or an outcome: well-formed, found again by the index on either
// engine, never counted as a run or spend, and a copy that does not know the kind says so instead of "not a record".
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { recordSpend } from '../../src/budget/budget.ts';
import { appendConfig, checkLedger, isRecord, LedgerError, nextRunNumber, readLedger } from '../../src/ledger/log.ts';
import { __testOnly, latestConfigRecord, withIndex } from '../../src/ledger/index.ts';
import { tempProject } from '../helpers/project.ts';

const receipt = (over: Record<string, unknown> = {}) => ({
  fingerprint: 'f'.repeat(64),
  settings: { budget: { runs: 5 } },
  changes: ['budget.runs: 500 → 5'],
  ...over,
});

afterEach(() => {
  __testOnly.forceFallback = false;
});

describe('the config record', () => {
  it('is appended as a well-formed record with its own id and time', () => {
    const { paths } = tempProject({});
    const r = appendConfig(paths, receipt({ windowSince: '2026-10-02T14:00:00Z' }), Date.parse('2026-10-02T14:00:00Z'));
    expect(r).toMatchObject({ kind: 'config', fingerprint: 'f'.repeat(64), changes: ['budget.runs: 500 → 5'], windowSince: '2026-10-02T14:00:00Z', ts: '2026-10-02T14:00:00Z' });
    expect(r.uid.length).toBeGreaterThan(10);
    expect(isRecord(r)).toBe(true);
    expect(readLedger(paths)).toEqual([r]);
  });

  it('[C-249] is not a run and not spend: the run counter and the budget rollup do not move', () => {
    const { paths } = tempProject({});
    recordSpend(paths, 0.5);
    const before = withIndex(paths, (h) => ({ runs: h.runCount(), spend: h.budgetRollup('1970-01-01T00:00:00Z') }));
    appendConfig(paths, receipt());
    expect(nextRunNumber(paths)).toBe(1);
    expect(withIndex(paths, (h) => ({ runs: h.runCount(), spend: h.budgetRollup('1970-01-01T00:00:00Z') }))).toEqual(before);
    expect(() => checkLedger(paths)).not.toThrow();
  });
});

describe('finding the latest receipt', () => {
  it('is undefined when the ledger holds none, and the newest one when it holds several', () => {
    const { paths } = tempProject({});
    expect(latestConfigRecord(paths)).toBeUndefined();
    appendConfig(paths, receipt({ fingerprint: '1'.repeat(64) }), 1000);
    recordSpend(paths, 0);
    appendConfig(paths, receipt({ fingerprint: '2'.repeat(64) }), 2000);
    recordSpend(paths, 0);
    expect(latestConfigRecord(paths)?.fingerprint).toBe('2'.repeat(64));
  });

  it('works the same on the in-memory engine', () => {
    const { paths } = tempProject({});
    appendConfig(paths, receipt({ fingerprint: '1'.repeat(64) }), 1000);
    appendConfig(paths, receipt({ fingerprint: '3'.repeat(64) }), 3000);
    __testOnly.forceFallback = true;
    expect(latestConfigRecord(paths)?.fingerprint).toBe('3'.repeat(64));
  });

  it('is found again after the index is rebuilt from the log', () => {
    const { paths } = tempProject({});
    appendConfig(paths, receipt({ fingerprint: '4'.repeat(64) }), 1000);
    withIndex(paths, (h) => h.runCount(), { forceRebuild: true });
    expect(latestConfigRecord(paths)?.fingerprint).toBe('4'.repeat(64));
  });
});

describe('a copy of MM3 that does not know a record kind', () => {
  const withLine = (line: string) => {
    const { paths } = tempProject({});
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.log, `${line}\n`);
    return paths;
  };

  it('[C-249] names the kind and says to update, instead of "not a ledger record"', () => {
    const paths = withLine(JSON.stringify({ kind: 'mystery', id: 'x', uid: 'x', ts: '2026-10-02T14:00:00Z' }));
    expect(() => readLedger(paths)).toThrow(/✖ ledger: line 1 of .*log\.jsonl has a "mystery" record this MM3 does not know → update this copy of MM3 \(mm3 doctor shows which\)/);
  });

  it('the index says the same, not a different message', () => {
    const paths = withLine(JSON.stringify({ kind: 'mystery', id: 'x', uid: 'x', ts: '2026-10-02T14:00:00Z' }));
    expect(() => withIndex(paths, (h) => h.runCount())).toThrow(/has a "mystery" record this MM3 does not know → update this copy/);
  });

  it('a line that is not a record at all keeps the old message', () => {
    const paths = withLine(JSON.stringify({ nope: true }));
    expect(() => readLedger(paths)).toThrow(LedgerError);
    expect(() => readLedger(paths)).toThrow(/is not a ledger record → fix or remove that line/);
    appendFileSync(path.join(paths.dir, 'x'), '');
  });
});

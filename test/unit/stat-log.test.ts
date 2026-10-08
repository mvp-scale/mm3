// statLog: the one way the ledger sizes log.jsonl. A folder in its place is an EISDIR stop on every platform
// (Windows stats a folder fine and reports a size, so the platform's own error cannot be relied on).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { statLog } from '../../src/ledger/lock.ts';

describe('statLog', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mm3-statlog-'));
  it('is undefined for a missing log, the stat for a file, and an EISDIR error for a folder', () => {
    expect(statLog(path.join(dir, 'none.jsonl'))).toBeUndefined();
    const f = path.join(dir, 'log.jsonl');
    writeFileSync(f, 'x\n');
    expect(statLog(f)?.size).toBe(2);
    const d = path.join(dir, 'folder.jsonl');
    mkdirSync(d);
    expect(() => statLog(d)).toThrow(/EISDIR/);
  });
});

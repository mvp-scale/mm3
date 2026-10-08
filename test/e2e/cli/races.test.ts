// Races between separate processes that start at the same instant (a shared start time), aimed at the few
// microseconds where two runs can collide. Lives in the cli tier: it spawns tsx workers, too heavy for `npm test`.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBudget } from '../../../src/budget/budget.ts';
import { pathsFor } from '../../../src/ledger/paths.ts';
import { tempProject } from '../../helpers/project.ts';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Runs `n` copies of a worker fixture with the same start time; resolves to their exit codes. */
function workers(n: number, fixture: string, root: string, rounds: number): Promise<number[]> {
  const startAt = Date.now() + 1500; // after every worker has started
  const errors: string[] = [];
  const one = (): Promise<number> =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, ['--import', 'tsx', path.join(FIXTURES, fixture), root, String(rounds), String(startAt)], { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      child.stderr.on('data', (d: Buffer) => (err += d.toString()));
      child.on('exit', (code) => {
        if (code !== 0 && err) errors.push(`worker exit ${code}: ${err.trim().slice(0, 600)}`); // a failing worker says why, instead of just 1
        resolve(code ?? 1);
      });
    });
  return Promise.all(Array.from({ length: n }, one)).then((codes) => {
    if (errors.length > 0) console.error(errors.join('\n'));
    return codes;
  });
}

describe('races at the same instant', () => {
  it('first use of a budget raced by 6 processes: created once, every run counted', async () => {
    const { root } = tempProject({});
    const rounds = 15;
    expect(await workers(6, 'budget-worker.ts', root, rounds)).toEqual([0, 0, 0, 0, 0, 0]);
    const runs = Array.from({ length: rounds }, (_, k) => loadBudget(pathsFor(path.join(root, `p${k}`))).state.runs);
    expect(runs).toEqual(Array.from({ length: rounds }, () => 6));
  }, 30_000);

  it('6 processes breaking the same stale lock at once: never two holders', async () => {
    const { root } = tempProject({});
    const rounds = 8;
    const dead = spawnSync(process.execPath, ['-e', '']).pid!;
    const old = new Date(Date.now() - 60_000);
    for (let k = 0; k < rounds; k++) {
      const lock = pathsFor(path.join(root, `p${k}`)).lock;
      mkdirSync(path.dirname(lock), { recursive: true });
      writeFileSync(lock, `${dead}\n`);
      utimesSync(lock, old, old);
    }
    expect(await workers(6, 'lock-worker.ts', root, rounds)).toEqual([0, 0, 0, 0, 0, 0]);
    for (let k = 0; k < rounds; k++) {
      const lines = readFileSync(path.join(root, `p${k}`, 'trace.log'), 'utf8').trimEnd().split('\n');
      expect(lines).toHaveLength(12);
      for (let i = 0; i < lines.length; i += 2) {
        // Strictly enter → exit by the same process: nobody else entered while it held the lock.
        expect(lines[i]).toMatch(/^enter \d+$/);
        expect(lines[i + 1]).toBe(lines[i]!.replace('enter', 'exit'));
      }
    }
  }, 30_000);
});

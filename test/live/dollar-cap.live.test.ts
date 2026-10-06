/**
 * Live proof that the DOLLAR cap holds on a real call [C-133] [C-229]: with budget.usd set far below one more
 * request, the first request is allowed (nothing is spent yet), the next NEW question stops with exit 3 before any call is made, and raising
 * budget.usd in the file and loading it lets the next question through. The agent-level F2 job proves an agent gets past a stop; it stops on
 * the RUN cap, so this is the only place the dollar path is exercised against the real classifier.
 *
 * Skipped unless MM3_LIVE_TEST=1 and a TypeSafe key resolves (AGENTS.md rule 2); never part of `npm test` or CI. Exactly two live calls (the
 * stopped one makes none), each a few hundredths of a cent; a counter throws before a third could be sent. Synthetic code only (rule 4).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { resolveStoredKey } from '../../src/setup/keystore.ts';
import { realRunner } from '../../src/setup/runner.ts';

const CLI = path.resolve('dist/cli.js');
const stored = resolveStoredKey(realRunner, process.platform, process.env);
const key = process.env.TYPESAFE_API_KEY?.trim() || (stored?.provider === 'typesafe' ? stored.apiKey : '');
const live = process.env.MM3_LIVE_TEST === '1' && key !== '';

const REQUEST = (goal: string): string => `mak:
  goal: ${goal}
  depth: quick
  where: [src/query.ts]
  ask:
    concerns:
      injection:
        pass: no
        1: Is the id concatenated into the SQL string instead of bound as a parameter?
        2: Is the id taken from the caller without validation?
        3: Does the query run on the concatenated string?
      secrets:
        pass: no
        4: Is a credential written into the source?
        5: Is a token logged?
        6: Is a key read from anywhere other than the environment?
      access:
        pass: no
        7: Is the caller's identity checked before the record is returned?
        8: Can one caller read another caller's record by changing the id?
        9: Is there a path that skips the check?
    decisions:
      severity:
        pass: [none, low]
        10:
          scale: How severe is the worst issue found?
          levels: [none, low, medium, high, critical]
      route:
        pass: [ship]
        11:
          choice: Where should this go?
          options: [ship, fix, block]
mdl:
  why: validate
  area: data
`;

describe.skipIf(!live)('the dollar cap on a live call', () => {
  it('allows one request, stops the next new question at exit 3, and carries on once the cap is raised in the file', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'mm3-live-usd-'));
    mkdirSync(path.join(root, '.mm3'));
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src', 'query.ts'), 'export const find = (id: string) => `select * from users where id = ${id}`;\n');
    writeFileSync(path.join(root, '.mm3', 'config.yaml'), 'budget:\n  usd: 0.00002\n');
    let liveCalls = 0;
    const run = (args: string[], input?: string) => {
      if (args[0] === 'class') {
        liveCalls += 1;
        if (liveCalls > 3) throw new Error('the dollar-cap live test would send more than its budget of live requests');
      }
      const r = spawnSync('node', [CLI, ...args], { cwd: root, input, encoding: 'utf8', env: { ...process.env, MM3_HOME: root, MM3_PROVIDER: 'typesafe', TYPESAFE_API_KEY: key, MM3_ACTOR: 'live-test' } });
      return { status: r.status, text: `${r.stdout}${r.stderr}` };
    };
    expect(run(['config', '--load']).text).toContain('budget.usd');
    const first = run(['class', '-'], REQUEST('The query builder is safe to ship'));
    expect(first.status).toBe(0);
    expect(first.text).toMatch(/id: MM3-\d+/u);
    const second = run(['class', '-'], REQUEST('The user lookup does not leak another caller\'s record'));
    expect(second.status).toBe(3);
    expect(second.text).toContain('✖ budget: cap reached');
    expect(second.text).toContain('raise budget.usd in .mm3/config.yaml, then run mm3 config --load');
    writeFileSync(path.join(root, '.mm3', 'config.yaml'), 'budget:\n  usd: 0.5\n');
    expect(run(['config', '--load']).text).toContain('budget.usd');
    const third = run(['class', '-'], REQUEST('The user lookup does not leak another caller\'s record'));
    expect(third.status).toBe(0);
    expect(third.text).toMatch(/id: MM3-\d+/u);
  }, 180_000);
});

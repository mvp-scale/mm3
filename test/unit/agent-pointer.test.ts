// item B (round 4 fix batch G) [C-197]: a request/evidence stop already ends with "→ see: mm3 agent <verb>"
// (C-153, via verbs/request.ts's stopText, shared by class/scan/drill/loop/replay/view). This file checks the
// remaining stops — a verb or tool's OWN validation logic, outside that shared path — land the same pointer,
// naming the right target. Structured as a flat table of {label, target, text} so a captain-owned cli.ts row
// (UsageStop, NO_PROJECT, outcome/budget argument checks) or a crew-3-owned template.ts row can be appended
// later without restructuring; the async drill cases sit alongside it since a table entry can't await.
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { checkBudget, loadBudget, recordSpend } from '../../src/budget/budget.ts';
import { writeConfigOverride } from '../../src/config/write.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { appendOutcome, appendRun } from '../../src/ledger/log.ts';
import { runCli, type CliCtx } from '../../src/cli.ts';
import { agentTopicFor, endWithAgentPointer } from '../../src/help/agent.ts';
import { handleMessage } from '../../src/mcp/protocol.ts';
import { runDrill } from '../../src/verbs/drill.ts';
import { runLoop } from '../../src/verbs/loop.ts';
import { runReport } from '../../src/verbs/report.ts';
import { runTemplate } from '../../src/verbs/template.ts';
import { runView } from '../../src/verbs/view.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleRun } from '../helpers/runs.ts';
import { stubProvider } from '../helpers/stub-provider.ts';

const env = { MM3_ACTOR: 'r' };

function fakeCliCtx(overrides: Partial<CliCtx> = {}): CliCtx {
  return {
    env: {},
    cwd: process.cwd(),
    platform: process.platform,
    runner: () => ({ status: 1, stdout: '', stderr: '' }),
    packageDir: process.cwd(),
    pkg: { name: '@mvpscale/mm3', version: '9.9.9-test' },
    homeDir: '/nonexistent-home',
    nodeVersion: process.version,
    stdin: () => Buffer.from(''),
    io: { input: new PassThrough(), output: new PassThrough() },
    ...overrides,
  };
}

/** Every stop text checked here ends "\n→ see: mm3 agent <target>" — no trailing content after it, beyond
 *  the one trailing newline `runCli`'s own `finish()` adds to every text that doesn't already end with one
 *  (real dispatch output, unlike a verb called directly). */
function expectPointer(text: string, target: string): void {
  expect(text, `expected a "mm3 agent ${target}" pointer in: ${JSON.stringify(text)}`).toMatch(new RegExp(`\\n→ see: mm3 agent ${target}\\n?$`));
}

describe('every non-request-validation stop still points at its own "mm3 agent <target>" (item B)', () => {
  const cases: ReadonlyArray<{ label: string; target: string; text: string }> = (() => {
    const { paths: viewPaths } = tempProject({});
    const { paths: reportPaths } = tempProject({});
    const { paths: budgetPaths } = tempProject({});
    writeConfigOverride(budgetPaths, { budget: { runs: 1 } });
    recordSpend(budgetPaths, 0);
    const corruptPaths = tempProject({}).paths;
    mkdirSync(corruptPaths.dir, { recursive: true });
    writeFileSync(corruptPaths.budget, '{ nope');
    const { paths: outcomePaths } = tempProject({});
    appendRun(outcomePaths, sampleRun({ actor: 'someone' })); // MM3-0001

    const hasText = (v: unknown): v is { text: string } => !!v && typeof v === 'object' && typeof (v as { text?: unknown }).text === 'string';
    const textOf = (fn: () => unknown): string => {
      try {
        const r = fn();
        if (hasText(r)) return r.text;
        throw new Error(`expected a {text} result, got ${JSON.stringify(r)}`);
      } catch (e) {
        return (e as Error).message;
      }
    };

    return [
      { label: 'view: unknown run id', target: 'view', text: textOf(() => runView('MM3-9999', 1, { paths: viewPaths, env: {} })) },
      { label: 'view: control characters in the target', target: 'view', text: textOf(() => runView('a\u0000b', 1, { paths: viewPaths, env: {} })) },
      { label: 'view: a path outside the project', target: 'view', text: textOf(() => runView('../../etc', 1, { paths: viewPaths, env: {} })) },
      { label: 'report: not a recognized view', target: 'report', text: textOf(() => runReport('nonsense', { paths: reportPaths })) },
      {
        label: 'budget: cap already reached',
        target: 'budget',
        text: textOf(() => {
          const gate = checkBudget(loadBudget(budgetPaths).state);
          if (gate.ok) throw new Error('expected the cap to already be reached');
          return { text: gate.message };
        }),
      },
      { label: 'outcome: an unknown run id', target: 'outcome', text: textOf(() => appendOutcome(outcomePaths, 'MM3-9999', 'held', 'anyone')) },
      { label: 'outcome: the asking actor can\'t self-certify "held"', target: 'outcome', text: textOf(() => appendOutcome(outcomePaths, 'MM3-0001', 'held', 'someone')) },
    ];
  })();

  it.each(cases)('$label', ({ target, text }) => expectPointer(text, target));

  // drill has several of its OWN stops beyond the evidence/parent-lookup ones stopText already covers — each
  // needs its own async setup (a real parent run), so these sit outside the sync table above.
  it('drill: an unknown parent', async () => {
    const { paths } = tempProject({});
    const r = await runDrill('mak:\n  goal: check this\n  parent: MM3-0042\n  from: x\n  ask:\n    a:\n      pass: yes\n      1: is it true?\n', {
      paths,
      provider: stubProvider(),
      env,
    });
    expectPointer(r.text, 'drill');
  });

  it('drill: mak.over given when the parent was not a sweep', async () => {
    const { paths } = tempProject({ 'src/a.ts': 'export function f(x) { return x; }\n' });
    const classReq =
      'mak:\n  goal: check this code\n  depth: quick\n  where: [src/a.ts]\n  ask:\n    injection:\n      pass: no\n' +
      Array.from({ length: 10 }, (_, i) => `      ${i + 1}: is question ${i + 1} true?\n`).join('');
    const { runClass } = await import('../../src/verbs/class.ts');
    await runClass(classReq, { paths, provider: stubProvider({ yes: () => 0.9 }), env }); // MM3-0001
    const bad =
      'mak:\n  goal: find the bug\n  parent: MM3-0001\n  from: injection\n  over:\n    call: each\n  ask:\n    call:\n      x:\n        pass: no\n        1: is it unsafe?\n';
    const r = await runDrill(bad, { paths, provider: stubProvider(), env });
    expectPointer(r.text, 'drill');
  });

  // loop is already fully routed through stopText/loadRequest (like class/scan) — one smoke case confirms it,
  // rather than re-asserting C-153's own coverage.
  it('loop: an invalid request (no ask:) still points at "mm3 agent loop"', async () => {
    const { paths } = tempProject({});
    const r = await runLoop('mak:\n  goal: x\n', { paths, provider: stubProvider(), env });
    expectPointer(r.text, 'loop');
  });

  // template.ts's own stop messages (crew 3's file, item E's --from MM3-#### plus the pre-existing ones) — added
  // by the captain after crew 3 finished, using the same stopText reuse as view/drill/report.
  it.each([
    { label: 'template: not a verb', fn: () => runTemplate('nope') },
    { label: 'template: --parent only applies to drill', fn: () => runTemplate('class', { parent: 'MM3-0001' }) },
    { label: 'template: --where/--goal need --from', fn: () => runTemplate('class', { goal: 'x' }) },
    { label: 'template: --from MM3-#### with no project reachable', fn: () => runTemplate('class', { from: 'MM3-0001' }, undefined) },
  ])('$label', ({ fn }) => expectPointer(fn().text, 'template'));

  // The cli.ts-level gaps stopText never reaches: a bare usage mistake, a missing project, and a request file
  // cli.ts itself couldn't even read — all captain-owned (src/cli.ts), verified here through the real dispatch.
  describe('cli.ts-level stops', () => {
    it('a bad flag value (UsageStop) points at the command\'s own agent card', async () => {
      const r = await runCli(['view', 'x', '--level', '9'], fakeCliCtx());
      expectPointer(r.text, 'view');
    });

    it('no project reachable (NO_PROJECT) points at the command actually run', async () => {
      const r = await runCli(['budget'], fakeCliCtx({ cwd: '/tmp' }));
      expectPointer(r.text, 'budget');
    });

    it('a request file cli.ts itself could not read points at the verb run', async () => {
      const { root } = tempProject({});
      mkdirSync(`${root}/.mm3`, { recursive: true });
      const r = await runCli(['class', '/no/such/file.yaml'], fakeCliCtx({ cwd: root }));
      expectPointer(r.text, 'class');
    });

    // doctor now has its own agent card (`mm3 agent doctor`), so a usage mistake points at it
    // like every other pointable command — this used to be the one exception.
    it('doctor is now pointable too: a bad flag points at "mm3 agent doctor"', async () => {
      const r = await runCli(['doctor', '--bogus'], fakeCliCtx());
      expectPointer(r.text, 'doctor');
    });
  });
});

// The one exit [C-197]: whatever branch produced a non-zero answer, it ends with exactly one pointer, at the
// command's own card when `mm3 agent` has one and at the overview otherwise.
describe('the pointer at the exit', () => {
  it('names the command\'s own card, or the overview when it has none', () => {
    expect(agentTopicFor('class')).toBe('class');
    expect(agentTopicFor('config')).toBe('config');
    expect(agentTopicFor('init')).toBeUndefined();
    expect(agentTopicFor(undefined)).toBeUndefined();
    expect(endWithAgentPointer('✖ x: y → z', 'budget')).toBe('✖ x: y → z\n→ see: mm3 agent budget');
    expect(endWithAgentPointer('✖ x: y → z\n', 'frob')).toBe('✖ x: y → z\n→ see: mm3 agent\n');
  });

  it('never doubles a pointer a stop already ends with', () => {
    for (const text of ['✖ a: b → c\n→ see: mm3 agent class', '✖ a: b → c\n→ see: mm3 agent class\n', '✖ a: b → c\n→ see: mm3 agent\n']) {
      expect(endWithAgentPointer(text, 'view')).toBe(text);
    }
  });

  it.each([
    { argv: ['frob'], target: '' },
    { argv: ['help', 'frob'], target: '' },
    { argv: ['agent', 'frob'], target: '' },
    { argv: ['init', '--global', '--user'], target: '' },
    { argv: ['config', '--bogus'], target: ' config' },
    { argv: ['uninstall', '--nope'], target: '' },
    { argv: ['class', '--bogus', '-'], target: ' class' },
  ])('mm3 $argv: one pointer, last line', async ({ argv, target }) => {
    const r = await runCli(argv, fakeCliCtx());
    expect(r.exit).not.toBe(0);
    expect(r.text.endsWith(`\n→ see: mm3 agent${target}\n`), JSON.stringify(r.text)).toBe(true);
    expect(r.text.match(/→ see: mm3 agent/g)).toHaveLength(1);
  });

  it('a success is left alone', async () => {
    const r = await runCli(['--version'], fakeCliCtx());
    expect(r.exit).toBe(0);
    expect(r.text).not.toContain('→ see:');
  });

  it('the MCP tool\'s own stops end with the pointer too: bad args, unknown tool, unknown method, a thrown call', async () => {
    const run = async (params: unknown, method = 'tools/call', runOne = async () => ({ exit: 0, text: 'ok' })) =>
      handleMessage({ jsonrpc: '2.0', id: 1, method, params }, { runOne, serverVersion: '0.0.0-test' });
    const text = (r: Awaited<ReturnType<typeof run>>): string => (r?.result as { content: Array<{ text: string }> }).content[0]!.text;
    expect(text(await run({ name: 'mm3', arguments: { args: 'class -' } }))).toMatch(/\n→ see: mm3 agent$/);
    expect(text(await run({ name: 'mm3', arguments: { args: ['view', 'x'] } }, 'tools/call', async () => { throw new Error('boom'); }))).toMatch(/^✖ mm3: boom → .*\n→ see: mm3 agent view$/);
    expect((await run({ name: 'x' }))?.error?.message).toMatch(/^✖ mcp: Unknown tool "x" → .*\n→ see: mm3 agent$/);
    expect((await run({}, 'nope/method'))?.error?.message).toMatch(/^✖ mcp: Method not found: nope\/method → .*\n→ see: mm3 agent$/);
    expect(text(await run({ name: 'mm3', arguments: { args: ['agent'] } }))).toBe('ok'); // success untouched
  });
});

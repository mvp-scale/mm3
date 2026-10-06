// Spawns the built binary (dist/cli.js) in a throwaway project with the fake provider: no network, no key.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mm3, snapshot } from '../../helpers/cli.ts';
import { tempProject } from '../../helpers/project.ts';

const CLASS_YAML = readFileSync('test/fixtures/requests/valid/class.yaml', 'utf8');
const LOOP_YAML = readFileSync('test/fixtures/requests/valid/loop.yaml', 'utf8');
// A view draft whose only question is CLASS_YAML's own question 1, word for word: exactReuse (ledger/reuse.ts)
// needs every one of a draft's own keys (evidence + question text) to appear in a candidate run's key map, so
// this has to quote the class fixture's probe exactly, not the (deliberately different, "a partial draft is
// fine") view.yaml fixture's own wording.
const VIEW_TEXT = 'mak:\n  goal: This login handler is safe to merge\n  depth: quick\n  where: [src/user.ts:1-3]\n  ask:\n    concerns:\n      injection:\n        pass: no\n        1: Is request text placed directly into the SQL query?\n';
// A distinct goal: the contract reuses per-question answers keyed on evidence + question text, so sending the
// exact same request twice makes the second one free (calls: 0) — a different goal keeps both runs paid.
const CLASS_YAML_2 = CLASS_YAML.replace('This login handler is safe to merge', 'This login handler is safe to merge, second look');
// over: {file: src/*.ts, function: each} matches the one function tempProject() ships (src/user.ts's findUser),
// so "src/user.ts/findUser" is a known, deterministic sweep item id — not a guess.
// function is the finest layer, depth: quick: 3 concerns categories x 3 probes + decisions.
const SCAN_YAML =
  'mak:\n  goal: Handlers trust nothing from the request\n  depth: quick\n  over:\n    file: src/*.ts\n    function: each\n  ask:\n    function:\n      concerns:\n        injection:\n          pass: no\n          1: Does {function} put request text straight into a query?\n          2: Is the query built by string concatenation?\n          3: Does {function} run the query with db.query on that string?\n        access:\n          pass: no\n          4: Does {function} return a record without checking its owner?\n          5: Is the caller id compared to the record owner id?\n          6: Could {function} be called without any permission check?\n        leaks:\n          pass: no\n          7: Does {function} send back a raw database error?\n          8: Does {function} log the full request body?\n          9: Does the response from {function} include fields nobody asked for?\n      decisions:\n        severity:\n          pass: [none, low]\n          10:\n            scale: How severe is the worst issue in {function}?\n            levels: [none, low, medium, high, critical]\n        route:\n          pass: [ship]\n          11:\n            choice: Where should {function} go?\n            options: [ship, fix, block]\n';

function project(): string {
  const { root } = tempProject();
  writeFileSync(path.join(root, 'req.yaml'), CLASS_YAML);
  return root;
}

describe('mm3 CLI (built): the six verbs, template, outcome, budget', () => {
  it('class → view → outcome → budget, end to end', () => {
    const root = project();
    const cls = mm3(root, ['class', 'req.yaml']);
    expect(cls.status).toBe(0);
    expect(cls.stdout).toMatch(/^mak:\n {2}id: MM3-0001\n {2}gate: (pass|fail|unsure)\n/);
    expect(cls.stdout).toContain('mdl: {recorded: [why, area]}');
    expect(cls.stdout).toMatch(/\nnotes: \[.*budget: .*\]\n$/);

    const fromStdin = mm3(root, ['class', '-'], { input: CLASS_YAML_2 });
    expect(fromStdin.status).toBe(0);
    expect(fromStdin.stdout).toMatch(/^mak:\n {2}id: MM3-0002\n {2}gate: (pass|fail|unsure)\n/);

    expect(mm3(root, ['view', 'src']).stdout).toContain('MM3-0001');
    expect(mm3(root, ['outcome', 'MM3-0001', 'held', '--by', 'e2e-agent']).status).toBe(1);
    expect(mm3(root, ['outcome', 'MM3-0001', 'held', '--by', 'owner']).stdout).toBe('mm3 outcome MM3-0001 held · by owner\n');
    expect(mm3(root, ['budget']).stdout).toBe('budget: $5.00 left of $5.00 · 498 of 500 runs left\n→ to change it: edit budget.usd / budget.runs in .mm3/config.yaml, then run mm3 config --load\n'); // [C-229]
  });

  it('loop, scan and drill run end to end (drill off the loop parent, sweep shape)', () => {
    const root = project();
    writeFileSync(path.join(root, 'loop.yaml'), LOOP_YAML);
    const looped = mm3(root, ['loop', 'loop.yaml']);
    expect(looped.status).toBe(0);
    expect(looped.stdout).toMatch(/^mak:\n {2}id: MM3-0001\n {2}gate: (pass|fail|unsure)\n/);

    writeFileSync(path.join(root, 'scan.yaml'), SCAN_YAML);
    const scanned = mm3(root, ['scan', 'scan.yaml']);
    expect(scanned.status).toBe(0);
    expect(scanned.stdout).toContain('scanned: {file:');

    const template = mm3(root, ['template', 'drill', '--parent', 'MM3-0002', '--from', 'src/user.ts/findUser']);
    expect(template.status).toBe(0);
    expect(template.stdout).toContain('parent: MM3-0002');
    writeFileSync(path.join(root, 'drill.yaml'), template.stdout);
    const drilled = mm3(root, ['drill', 'drill.yaml']);
    expect(drilled.status).toBe(0);
  });

  it('replay: the flag form and the file form both work; --dry-run spends nothing [C-066]', () => {
    const root = project();
    expect(mm3(root, ['class', 'req.yaml']).status).toBe(0);
    const dry = mm3(root, ['replay', '--parent', 'MM3-0001', '--compare', 'worktree..worktree', '--expect', 'injection', '--dry-run']);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toMatch(/^plan:\n {2}calls: \d+\n {2}questions: \d+\n {2}reused: \d+\n {2}route: \w+\nnotes: \["dry run: no call, no spend"\]\n$/);
    expect(mm3(root, ['budget']).stdout).toContain('499 of 500 runs left'); // only the class run counted; the dry run spent nothing
    const real = mm3(root, ['replay', '--parent', 'MM3-0001', '--compare', 'worktree..worktree', '--expect', 'injection']);
    expect(real.status).toBe(0);
    expect(real.stdout).toContain('mdl: {recorded: [parent]}');
    // [C-066] the flag form's goal is the parent's own goal (src/cli.ts), not the "The change works"
    // placeholder — read straight off the ledger, since the response itself never echoes the goal text.
    const lines = readFileSync(path.join(root, '.mm3', 'log.jsonl'), 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
    const replayRun = lines.find((l) => l.kind === 'run' && l.verb === 'replay');
    expect(replayRun.goal).toBe('This login handler is safe to merge');
  });

  it('view: request mode reuses a class run\'s answers by exact match; place mode still works', () => {
    const root = project();
    expect(mm3(root, ['class', 'req.yaml']).status).toBe(0); // MM3-0001, same evidence and goal/injection text as VIEW_TEXT
    writeFileSync(path.join(root, 'view.yaml'), VIEW_TEXT);

    const fromFile = mm3(root, ['view', 'view.yaml']);
    expect(fromFile.status).toBe(0);
    expect(fromFile.stdout).toContain('reuse: MM3-0001');

    const fromStdin = mm3(root, ['view', '-'], { input: VIEW_TEXT });
    expect(fromStdin.status).toBe(0);
    expect(fromStdin.stdout).toContain('reuse: MM3-0001');

    const place = mm3(root, ['view', 'src']);
    expect(place.status).toBe(0);
    expect(place.stdout).toContain('MM3-0001');
  });

  it('--dry-run: class, scan, loop and drill each print a plan and write nothing to .mm3/', () => {
    const root = project();

    const beforeClass = snapshot(root);
    const dryClass = mm3(root, ['class', 'req.yaml', '--dry-run']);
    expect(dryClass.status).toBe(0);
    expect(dryClass.stdout).toMatch(/^plan:\n {2}calls: \d+\n {2}questions: \d+\n/);
    expect(snapshot(root)).toEqual(beforeClass);

    writeFileSync(path.join(root, 'scan.yaml'), SCAN_YAML);
    const beforeScan = snapshot(root);
    const dryScan = mm3(root, ['scan', 'scan.yaml', '--dry-run']);
    expect(dryScan.status).toBe(0);
    expect(dryScan.stdout).toMatch(/^plan:\n {2}calls: \d+\n {2}questions: \d+\n/);
    expect(snapshot(root)).toEqual(beforeScan);

    writeFileSync(path.join(root, 'loop.yaml'), LOOP_YAML);
    const beforeLoop = snapshot(root);
    const dryLoop = mm3(root, ['loop', 'loop.yaml', '--dry-run']);
    expect(dryLoop.status).toBe(0);
    expect(dryLoop.stdout).toMatch(/^plan:\n {2}calls: \d+\n {2}questions: \d+\n/);
    expect(snapshot(root)).toEqual(beforeLoop);

    // drill needs a real parent: scan for real (src/user.ts/findUser is the known item id — see SCAN_YAML above).
    const scanned = mm3(root, ['scan', 'scan.yaml']);
    expect(scanned.status).toBe(0);
    const parentId = /id: (MM3-\d{4,})/.exec(scanned.stdout)?.[1]!;
    const template = mm3(root, ['template', 'drill', '--parent', parentId, '--from', 'src/user.ts/findUser']);
    expect(template.status).toBe(0);
    writeFileSync(path.join(root, 'drill.yaml'), template.stdout);
    const beforeDrill = snapshot(root);
    const dryDrill = mm3(root, ['drill', 'drill.yaml', '--dry-run']);
    expect(dryDrill.status).toBe(0);
    expect(dryDrill.stdout).toMatch(/^plan:\n {2}calls: \d+\n {2}questions: \d+\n/);
    expect(snapshot(root)).toEqual(beforeDrill);
  });

  it('an unknown command and a missing argument: one "✖ args:" line, exit 2', () => {
    const root = project();
    expect(mm3(root, ['judge'])).toMatchObject({
      status: 2,
      stdout: '',
      stderr: '✖ args: "judge" is not a command → use view, class, replay, scan, drill, loop, template, help, agent, report, outcome, budget, doctor, config, init, uninstall or mcp (mm3 --help)\n→ see: mm3 agent\n',
    });
    expect(mm3(root, ['view'])).toMatchObject({
      status: 2,
      stdout: '',
      stderr: '✖ args: missing arguments → mm3 view <folder | tag | MM3-#### | request-file | -> [--level 1|2|3] [--summary]\n→ see: mm3 agent view\n',
    });
    expect(mm3(root, ['class'])).toMatchObject({
      status: 2,
      stdout: '',
      stderr: '✖ args: missing arguments → mm3 class <request-file | -> [--dry-run]\n→ see: mm3 agent class\n',
    });
  });

  it(
    'a held lock exits 1 with one clean "✖ lock:" line, even for a config write',
    () => {
      const root = project();
      mkdirSync(path.join(root, '.mm3'), { recursive: true });
      writeFileSync(path.join(root, '.mm3', 'lock'), `${process.pid}\n`); // this test process: alive
      const r = mm3(root, ['outcome', 'MM3-0001', 'failed', '--by', 'owner']);
      expect(r.status).toBe(1);
      expect(r.stderr).toBe('✖ lock: .mm3/lock is locked → wait for the other run, or delete the lock file if no run is active\n→ see: mm3 agent outcome\n');
    },
    15_000,
  );

  it('bare mm3 prints full usage (exit 2); --help prints it on stdout (exit 0)', () => {
    const root = project();
    const bare = mm3(root, []);
    expect(bare.status).toBe(2);
    expect(bare.stderr).toMatch(/^Agents: run "mm3 agent" first\nnew here\? → mm3 init\n[^\n]+\n(- \w+: [^\n]+\n){6}usage:\n {2}mm3 view/);
    for (const flag of ['--help', '-h']) {
      const help = mm3(root, [flag]);
      expect(help).toMatchObject({ status: 0, stderr: '' });
      expect(help.stdout).toContain('mm3 template');
    }
  });

  it('mm3 agent [verb]: free, no project needed, terse — help\'s agent-facing twin [C-173]', () => {
    const overview = mm3('/', ['agent'], { home: false });
    expect(overview.status).toBe(0);
    expect(overview.stdout).toContain('verbs (pick by goal):');
    for (const verb of ['view', 'class', 'replay', 'scan', 'drill', 'loop']) expect(overview.stdout).toContain(`- ${verb}: `);

    const classCard = mm3('/', ['agent', 'class'], { home: false });
    expect(classCard.status).toBe(0);
    expect(classCard.stdout).toContain('verb: class');
    expect(classCard.stdout).toContain('patterns:');

    expect(mm3('/', ['agent', 'nope'], { home: false }).status).toBe(2);
  });

  it('template works with no project at all', () => {
    const bare = mm3('/', ['template', 'class'], { home: false });
    expect(bare.status).toBe(0);
    expect(bare.stdout).toContain('mak:');
  });

  it('the retired text format is now just an invalid request, not a special case', () => {
    const root = project();
    writeFileSync(path.join(root, 'old.txt'), 'mm3 class L1\nfocus: This handler is safe to merge\n\n 1  Is it safe?\n');
    const r = mm3(root, ['class', 'old.txt']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/^✖ /);
  });
});

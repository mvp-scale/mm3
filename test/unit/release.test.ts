// The release script's checks, against a fake GitHub, git, npm and ledger [C-277]: the two stages show every step as done, will-do or not done
// yet, read GitHub's Releases and Tags back before saying "RELEASED", and let main be built only from a tested, certified, clean copy.
import { describe, expect, it } from 'vitest';
import type { LedgerRecord } from '../../scripts/agentic/ledger.ts';
import { briefLines, cleanLines, deadLinks, featuresSince, parseManifest, rollupProblem, statusLines, survey, surveyMain, unreleasedNotes, verify, type Io, type Manifest } from '../../scripts/release.ts';

const HEAD = 'fe932dcabcdef0123456789abcdef0123456789a';
const NPM = '0.1.3-nightly.20261006.1827.gfe932dc';
const M: Manifest = { version: '0.1.3', title: 'Agents get a verdict more reliably', accept: [], include: ['README.md', 'AGENTS.md', 'package.json', 'src', 'docs'], tested: ['src'] };
const FILES: Record<string, string> = {
  'package.json': JSON.stringify({ version: '0.1.3' }),
  'CHANGELOG.md': '# What\'s new\n\n## Unreleased: 0.1.3, on the nightly build\n\n- a line\n\n## v0.1.2\n\n- old\n',
  'README.md': '<img src="https://img.shields.io/npm/v/@mvpscale/mm3/nightly"> [guide](docs/guide.md) [contrib](AGENTS.md)',
  'AGENTS.md': 'agents', 'src/a.ts': 'a', 'docs/guide.md': 'guide', 'test/t.ts': 't', 'scripts/s.ts': 's',
};

interface World {
  files?: Record<string, string>;
  refs?: Record<string, Record<string, string>>;
  tag?: string;
  latest?: string;
  releases?: Array<{ tagName: string; isLatest?: boolean }>;
  tagTarget?: string;
  ci?: unknown[];
  openPrs?: Array<{ number: number; title?: string; isDraft?: boolean; statusCheckRollup?: unknown[] }>;
  log?: string;
}
const blob = (c: string): string => `b${c.length}${[...c].reduce((a, ch) => a + ch.charCodeAt(0), 0)}`;
const treeOf = (files: Record<string, string>): string => Object.entries(files).map(([p, c]) => `100644 blob ${blob(c)}\t${p}`).join('\n');

function fakeIo(w: World = {}): Io {
  const files = (ref: string): Record<string, string> => w.refs?.[ref] ?? w.files ?? FILES;
  return {
    gh: (a) => {
      if (a[0] === 'release') return JSON.stringify(w.releases ?? [{ tagName: `v${w.tag ?? NPM}`, isLatest: true }]);
      if (a[0] === 'pr' && a[1] === 'list') return JSON.stringify((w.openPrs ?? []).map((p) => ({ title: 'a feature', isDraft: false, statusCheckRollup: [{ name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }], ...p })));
      if (a[0] === 'api' && a[1]!.includes('/git/ref/tags/')) {
        if (w.tagTarget === '') throw new Error('not found');
        return `${w.tagTarget ?? HEAD}\n`;
      }
      if (a[0] === 'api') return JSON.stringify(w.ci ?? [{ name: 'test', status: 'completed', conclusion: 'success' }]);
      return '';
    },
    git: (a) => {
      if (a[0] === 'show') {
        const [ref, file] = a[1]!.split(':');
        const c = files(ref!)[file!];
        if (c === undefined) throw new Error('no such file');
        return c;
      }
      if (a[0] === 'rev-parse') return `${a[1] === 'origin/main' ? 'aaaaaaa000000000000000000000000000000000' : HEAD}\n`;
      if (a[0] === 'ls-tree' && a.includes('--name-only')) {
        const all = Object.keys(files(a[a.indexOf('--name-only') + 1]!));
        const p = a.includes('--') ? a[a.indexOf('--') + 1]! : undefined;
        return (p === undefined ? all : all.filter((f) => f === p || f.startsWith(`${p}/`))).join('\n');
      }
      if (a[0] === 'ls-tree') return treeOf(files(a[2]!));
      if (a[0] === 'log') return w.log ?? '';
      return '';
    },
    npmTags: () => ({ latest: w.latest ?? '0.1.2', nightly: w.tag ?? NPM }),
    sleep: async () => {},
  };
}

const ceremony = (o: { passed?: boolean; version?: string; commit?: string } = {}): LedgerRecord[] => [
  { kind: 'ceremony', phase: 'started', id: 'CER-0001', formal: true, version: o.version ?? NPM, versionCommit: o.commit ?? 'fe932dc' } as unknown as LedgerRecord,
  { kind: 'ceremony', phase: 'finished', startedId: 'CER-0001', passed: o.passed ?? true } as unknown as LedgerRecord,
];
const trial = (fingerprint: string): LedgerRecord => ({ kind: 'trial', phase: 'started', id: 'TRL-0007', fingerprint } as unknown as LedgerRecord);
const states = (steps: Array<{ id: string; state: string }>, id: RegExp): string | undefined => steps.find((s) => id.test(s.id))?.state;

describe('the release manifest [C-277]', () => {
  it('[C-277] a good manifest parses, and each mistake stops with the field and the fix', () => {
    const good = { version: '0.1.3', title: 'T', include: ['src'], tested: ['src'] };
    expect(parseManifest(good).manifest).toEqual({ version: '0.1.3', title: 'T', accept: [], include: ['src'], tested: ['src'] });
    expect(parseManifest({ ...good, version: '1.3' }).stops[0]).toMatch(/^✖ version: .* → /u);
    expect(parseManifest({ ...good, title: '' }).stops[0]).toMatch(/^✖ title: .* → /u);
    expect(parseManifest({ ...good, include: [] }).stops[0]).toMatch(/^✖ include: .* → /u);
    expect(parseManifest({ ...good, tested: ['../x'] }).stops[0]).toMatch(/^✖ tested: .* → /u);
  });
  it('[C-277] release notes are the CHANGELOG Unreleased section and nothing after it', () => {
    expect(unreleasedNotes(FILES['CHANGELOG.md']!)).toBe('- a line');
  });
  it('[C-277] what goes into a nightly is read from the merge commits since the last nightly release', () => {
    const log = 'Merge pull request #33 from x/feat\x1f0.1.3 work\n\x1e\nMerge pull request #34 from x/chore\x1fshow the version\n\x1e';
    expect(featuresSince(fakeIo({ log }), 'v0.1.3-nightly.old')).toEqual(['#33 0.1.3 work', '#34 show the version']);
  });
});

describe('the nightly stage shows every step before it runs [C-277]', () => {
  it('[C-277] all done: nothing left to do, and the release for the build is named', () => {
    const { steps } = survey(M, fakeIo(), [trial('F'), ...ceremony()], 'F', undefined);
    expect(steps.filter((s) => s.state === 'todo')).toEqual([]);
    expect(states(steps, /GitHub release/u)).toBe('done');
  });
  it('[C-277] npm behind the head and no GitHub release are the two steps the stage will do', () => {
    const { steps } = survey(M, fakeIo({ tag: '0.1.3-nightly.20261006.1743.geb41121', releases: [] }), [], 'F', undefined);
    expect(steps.filter((s) => s.state === 'todo').map((s) => s.id)).toEqual(['npm nightly built from fe932dc', 'GitHub release for it (Releases and Tags)', 'formal ceremony on this build']);
  });
  it('[C-277] trials not done yet are shown as not done with the command; the ceremony is a step the stage will run last, and says how long it takes', () => {
    const { steps } = survey(M, fakeIo(), [], 'F', undefined);
    expect(states(steps, /agent trials/u)).toBe('missing');
    expect(steps.find((s) => /agent trials/u.test(s.id))!.detail).toContain('npm run agentic:feature');
    expect(states(steps, /formal ceremony/u)).toBe('todo');
    expect(steps.find((s) => /formal ceremony/u.test(s.id))!.detail).toContain('about half an hour');
  });
  it('[C-277] every open green PR into nightly is found and will be merged, oldest first; a draft is left alone; one running or failing stops the stage', () => {
    const two = survey(M, fakeIo({ openPrs: [{ number: 37 }, { number: 36 }, { number: 40, isDraft: true }] }), [], 'F', undefined);
    expect(two.open).toEqual([36, 37]);
    expect(states(two.steps, /PR #36/u)).toBe('todo');
    expect(states(two.steps, /PR #40/u)).toBe('done');
    const running = survey(M, fakeIo({ openPrs: [{ number: 36, statusCheckRollup: [{ name: 'CodeQL', status: 'IN_PROGRESS' }] }] }), [], 'F', undefined);
    expect(states(running.steps, /PR #36/u)).toBe('missing');
    expect(running.open).toEqual([]);
    expect(survey(M, fakeIo(), [], 'F', undefined).open).toEqual([]);
  });
  it('[C-277] while a PR is still to be merged, publishing and the GitHub release are will-do, even if npm holds a build of the old head', () => {
    const { steps } = survey(M, fakeIo({ openPrs: [{ number: 36 }] }), [], 'F', undefined);
    expect(states(steps, /npm nightly built/u)).toBe('todo');
    expect(states(steps, /GitHub release/u)).toBe('todo');
  });
  it('[C-277] an open PR that does not say the release version, in package.json, the CHANGELOG heading and the README badge, is not merged', () => {
    const old = { ...FILES, 'package.json': JSON.stringify({ version: '0.1.2' }) };
    expect(states(survey(M, fakeIo({ files: old, openPrs: [{ number: 36 }] }), [], 'F', undefined).steps, /PR #36/u)).toBe('missing');
    expect(states(survey(M, fakeIo({ files: { ...FILES, 'README.md': 'no badge' }, openPrs: [{ number: 36 }] }), [], 'F', undefined).steps, /PR #36/u)).toBe('missing');
  });
  it('[C-277] a version the page does not show, or an edited ledger, is not done', () => {
    expect(states(survey(M, fakeIo({ files: { ...FILES, 'CHANGELOG.md': '## Unreleased\n- a\n' } }), [], 'F', undefined).steps, /nightly says/u)).toBe('missing');
    expect(states(survey(M, fakeIo(), [], 'F', '✖ ledger: line 3 does not follow line 2').steps, /ledger chain/u)).toBe('missing');
  });
  it('[C-277] a ceremony on the current build that did not pass is shown as not done, with where the evidence is; a PR still to merge means no ceremony has seen the new build', () => {
    const failed = survey(M, fakeIo(), [trial('F'), ...ceremony({ passed: false })], 'F', undefined).steps;
    expect(states(failed, /formal ceremony/u)).toBe('missing');
    expect(failed.find((s) => /formal ceremony/u.test(s.id))!.detail).toContain('evidence prints under STATUS');
    expect(states(survey(M, fakeIo({ openPrs: [{ number: 37 }] }), [trial('F'), ...ceremony()], 'F', undefined).steps, /formal ceremony/u)).toBe('todo');
  });
  it('[C-277] checks still running, or failed, are named; skipped ones pass', () => {
    expect(rollupProblem([{ name: 'a', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'b', status: 'COMPLETED', conclusion: 'SKIPPED' }])).toBeUndefined();
    expect(rollupProblem([{ name: 'CodeQL', status: 'IN_PROGRESS' }])).toMatch(/still running: CodeQL/u);
    expect(rollupProblem([{ name: 'test (22)', status: 'COMPLETED', conclusion: 'FAILURE' }])).toMatch(/failed: test \(22\)/u);
    expect(rollupProblem([])).toMatch(/no checks reported/u);
  });
});

describe('every nightly run ends with the state in three lines [C-277]', () => {
  it('[C-277] released but never certified: the ceremony says NOT RUN and that nothing is running, and main is blocked', () => {
    expect(statusLines(M, [], NPM, true)).toEqual(['STATUS', `  nightly   RELEASED  v${NPM}`, '  ceremony  NOT RUN  (nothing is running)', '  main      BLOCKED  needs a passed ceremony on this build']);
  });
  it('[C-277] a passed ceremony on this build makes main READY; a failed one says so and what to do', () => {
    expect(statusLines(M, ceremony(), NPM, true).slice(2)).toEqual(['  ceremony  PASSED  CER-0001', '  main      READY  → npm run release -- main']);
    expect(statusLines(M, ceremony({ passed: false }), NPM, true)[3]).toContain('BLOCKED  the ceremony did not pass');
    expect(statusLines({ ...M, accept: ['CER-0001'] }, ceremony({ passed: false }), NPM, true).slice(2)).toEqual(['  ceremony  DID NOT PASS  CER-0001 (accepted in release.json)', '  main      READY  → npm run release -- main']);
  });
  it('[C-277] a ceremony on an older build does not count for this one', () => {
    expect(statusLines(M, ceremony({ version: '0.1.2-nightly.old' }), NPM, true)[2]).toContain('NOT RUN');
  });
});

describe('what a failed ceremony prints under STATUS [C-277] [C-278]', () => {
  it('[C-278] nothing for a build with no ceremony, or one on an older build; the brief for the build it ran on', () => {
    expect(briefLines([], NPM)).toEqual([]);
    expect(briefLines(ceremony({ version: '0.1.2-nightly.old' }), NPM)).toEqual([]);
    const full = ceremony().map((r) => ('startedId' in r ? { ...r, level3: [], decision: { verdict: 'SHIP', exceptions: [] } } : { ...r, fingerprint: 'F', environment: { claude: '2.1.292 (Claude Code)' }, definition: { hash: 'H', rules: { gateModel: 'sonnet', mustPassTrials: 2 }, scenarios: [] } })) as unknown as LedgerRecord[];
    expect(briefLines(full, NPM)[0]).toContain('CEREMONY CER-0001');
  });
});

describe('"RELEASED" is only said when GitHub and npm show it [C-277]', () => {
  it('[C-277] Releases, Tags, the branch version, npm and CI all agree', () => {
    expect(verify(M, fakeIo()).filter((c) => !c.ok)).toEqual([]);
  });
  it('[C-277] no release on GitHub, a tag off the head, npm one build behind, or red CI is each named', () => {
    const bad = (w: World) => verify(M, fakeIo(w)).filter((c) => !c.ok).map((c) => c.id);
    expect(bad({ releases: [] })).toEqual(['GitHub Releases lists it']);
    expect(bad({ tagTarget: 'deadbeef' })).toEqual(["GitHub Tags has it, on nightly's head"]);
    expect(bad({ tag: '0.1.3-nightly.20261006.1743.geb41121', releases: [{ tagName: 'v0.1.3-nightly.20261006.1743.geb41121' }], tagTarget: HEAD })).toEqual(['npm nightly is built from that head']);
    expect(bad({ ci: [{ name: 'test', status: 'completed', conclusion: 'failure' }] })).toEqual(['CI is green on that head']);
  });
});

describe('the main stage: tested, certified, then one clean copy [C-277]', () => {
  const ok = (w: World = {}, ledger: LedgerRecord[] = [trial('F'), ...ceremony()], m: Manifest = M) => surveyMain(m, fakeIo(w), ledger, 'F', undefined);
  it('[C-277] only the include paths are kept, and a README link to a file main would not have is named', () => {
    expect(cleanLines(fakeIo(), 'origin/nightly', M.include).map((l) => l.split(' ')[1]).sort()).toEqual(['AGENTS.md', 'README.md', 'docs/guide.md', 'package.json', 'src/a.ts']);
    expect(deadLinks(fakeIo(), 'origin/nightly', M.include)).toEqual([]);
    expect(deadLinks(fakeIo(), 'origin/nightly', ['README.md', 'src'])).toEqual(['README.md → docs/guide.md', 'README.md → AGENTS.md']);
  });
  it('[C-277] everything done but the clean copy: the stage will build it, and says what it contains', () => {
    const r = ok();
    expect(r.steps.filter((s) => s.state === 'missing')).toEqual([]);
    expect(r.todo).toBe(true);
    expect(r.steps.at(-1)!.detail).toContain('release/v0.1.3');
  });
  it('[C-277] no ceremony, a failed one, or none on this build stops main with the command to run', () => {
    expect(states(ok({}, [trial('F')]).steps, /formal ceremony/u)).toBe('missing');
    expect(states(ok({}, [trial('F'), ...ceremony({ passed: false })]).steps, /it passed/u)).toBe('missing');
    expect(states(ok({}, [trial('F'), ...ceremony({ version: '0.1.2-nightly.old' })]).steps, /formal ceremony/u)).toBe('missing');
  });
  it('[C-277] a failed ceremony the owner accepted in release.json passes the gate', () => {
    expect(states(ok({}, [trial('F'), ...ceremony({ passed: false })], { ...M, accept: ['CER-0001'] }).steps, /it passed/u)).toBe('done');
  });
  it('[C-277] a change to the tested code since the ceremony makes it stale; a docs-only change does not', () => {
    const base = { ...FILES };
    const refs = (changed: Record<string, string>) => ({ refs: { fe932dc: base, [HEAD]: { ...base, ...changed }, 'origin/main': {} } });
    expect(states(ok(refs({ 'src/a.ts': 'changed' })).steps, /agent-read text/u)).toBe('missing');
    expect(states(ok(refs({ 'docs/guide.md': 'new words' })).steps, /agent-read text/u)).toBe('done');
  });
  it('[C-277] without trials on the current guidance, or an unreleased nightly, main is not ready', () => {
    expect(states(ok({}, ceremony()).steps, /agent trials/u)).toBe('missing');
    expect(states(ok({ releases: [] }).steps, /nightly is released/u)).toBe('missing');
  });
  it('[C-277] when main already holds exactly the clean copy, there is nothing to build', () => {
    const clean = Object.fromEntries(Object.entries(FILES).filter(([p]) => ['README.md', 'AGENTS.md', 'package.json', 'src/a.ts', 'docs/guide.md'].includes(p)));
    expect(ok({ refs: { [HEAD]: FILES, fe932dc: FILES, 'origin/main': clean } }).todo).toBe(false);
  });
});

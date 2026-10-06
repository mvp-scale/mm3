// The release script's checks, against a fake GitHub, git and npm [C-277]: a release is one manifest, it is checked from GitHub and npm
// before anything is merged, and "out on nightly" is only said when the five things a person would look at all hold.
import { describe, expect, it } from 'vitest';
import { parseManifest, planText, preflight, rollupProblem, verify, type Io, type Manifest } from '../../scripts/release.ts';

const M: Manifest = { version: '0.1.3', title: 'Agents get a verdict more reliably', prs: [35], accept: [] };
const HEAD = 'fe932dcabcdef0123456789abcdef0123456789a';
const GOOD_FILES: Record<string, string> = {
  'package.json': JSON.stringify({ version: '0.1.3' }),
  'CHANGELOG.md': '# What\'s new\n\n## Unreleased: 0.1.3, on the nightly build\n\n- a line\n',
  'README.md': '<img src="https://img.shields.io/npm/v/@mvpscale/mm3/nightly?label=nightly">',
};

function fakeIo(o: { files?: Record<string, string>; rollup?: unknown[]; tag?: string; ci?: unknown[]; state?: string } = {}): Io {
  const files = o.files ?? GOOD_FILES;
  return {
    gh: (a) => {
      if (a[0] === 'pr') return JSON.stringify({ state: o.state ?? 'OPEN', baseRefName: 'nightly', headRefOid: 'abc', statusCheckRollup: o.rollup ?? [{ name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }] });
      if (a[0] === 'api') return JSON.stringify(o.ci ?? [{ name: 'test', status: 'completed', conclusion: 'success' }]);
      return '';
    },
    git: (a) => {
      if (a[0] === 'show') return files[a[1]!.split(':')[1]!] ?? (() => { throw new Error('no such file'); })();
      if (a[0] === 'rev-parse') return `${HEAD}\n`;
      return '';
    },
    npmTags: () => ({ latest: '0.1.2', nightly: o.tag ?? '0.1.3-nightly.20261006.1743.gfe932dc' }),
    sleep: async () => {},
  };
}

describe('the release manifest [C-277]', () => {
  it('[C-277] a good manifest parses, and each mistake stops with the field and the fix', () => {
    expect(parseManifest({ version: '0.1.3', title: 'T', prs: [35] }).manifest).toEqual({ version: '0.1.3', title: 'T', prs: [35], accept: [] });
    expect(parseManifest({ version: '1.3', title: 'T', prs: [35] }).stops[0]).toMatch(/^✖ version: .* → /u);
    expect(parseManifest({ version: '0.1.3', title: '', prs: [35] }).stops[0]).toMatch(/^✖ title: .* → /u);
    expect(parseManifest({ version: '0.1.3', title: 'T', prs: [] }).stops[0]).toMatch(/^✖ prs: .* → /u);
  });
  it('[C-277] a release is one PR: two are refused with the fix', () => {
    expect(parseManifest({ version: '0.1.3', title: 'T', prs: [32, 33] }).stops).toEqual(['✖ prs: a release is one PR → put the work in one branch; side fixes join it until it merges']);
  });
  it('[C-277] the plan says in plain words what the nightly stage will do, before it does it', () => {
    const text = planText('nightly', M).join('\n');
    expect(text).toContain('merge PR #35 into nightly');
    expect(text).toContain("npm's nightly tag = that head");
    expect(text).toContain('write a receipt');
  });
});

describe('the checks before anything is merged [C-277]', () => {
  it('[C-277] checks still running, or failed, are named; skipped ones pass', () => {
    expect(rollupProblem([{ name: 'a', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'b', status: 'COMPLETED', conclusion: 'SKIPPED' }])).toBeUndefined();
    expect(rollupProblem([{ name: 'CodeQL', status: 'IN_PROGRESS' }])).toMatch(/still running: CodeQL/u);
    expect(rollupProblem([{ name: 'test (22)', status: 'COMPLETED', conclusion: 'FAILURE' }])).toMatch(/failed: test \(22\)/u);
    expect(rollupProblem([])).toMatch(/no checks reported/u);
  });
  it('[C-277] a ready PR passes every check', () => {
    expect(preflight(M, fakeIo(), undefined).filter((c) => !c.ok)).toEqual([]);
  });
  it('[C-277] each thing a visitor would notice is its own check: version, CHANGELOG heading, README badge, CI, an edited ledger', () => {
    const bad = (files: Record<string, string>) => preflight(M, fakeIo({ files: { ...GOOD_FILES, ...files } }), undefined).filter((c) => !c.ok).map((c) => c.id);
    expect(bad({ 'package.json': JSON.stringify({ version: '0.1.2' }) })).toEqual(['PR #35 package.json says 0.1.3']);
    expect(bad({ 'CHANGELOG.md': '## Unreleased\n- a\n' })).toEqual(['PR #35 CHANGELOG heading names 0.1.3']);
    expect(bad({ 'README.md': 'no badge' })).toEqual(['PR #35 README shows the nightly badge']);
    expect(preflight(M, fakeIo({ rollup: [{ name: 'test', status: 'IN_PROGRESS' }] }), undefined).filter((c) => !c.ok).map((c) => c.id)).toEqual(['PR #35 checks are green']);
    expect(preflight(M, fakeIo({ state: 'MERGED' }), undefined).filter((c) => !c.ok).map((c) => c.id)).toEqual(['PR #35 is open and targets nightly']);
    expect(preflight(M, fakeIo(), '✖ ledger: line 3 does not follow line 2').filter((c) => !c.ok).map((c) => c.id)).toEqual(['ledger chain intact']);
  });
});

describe('"out on nightly" is only said when it is true [C-277]', () => {
  it('[C-277] all five hold: the head, the version, the page, the npm tag built from that head, green CI', () => {
    expect(verify(M, fakeIo()).filter((c) => !c.ok)).toEqual([]);
  });
  it("[C-277] npm's nightly tag one commit behind the branch head is named, not passed over", () => {
    expect(verify(M, fakeIo({ tag: '0.1.3-nightly.20261006.1743.geb41121' })).filter((c) => !c.ok).map((c) => c.id)).toEqual(["npm's nightly tag is built from that head"]);
  });
  it('[C-277] a version missing on the page, or a failing CI run on the head, fails the verification', () => {
    expect(verify(M, fakeIo({ files: { ...GOOD_FILES, 'CHANGELOG.md': '## Unreleased\n' } })).filter((c) => !c.ok).map((c) => c.id)).toEqual(['the page shows it (CHANGELOG heading, README badge)']);
    expect(verify(M, fakeIo({ ci: [{ name: 'test', status: 'completed', conclusion: 'failure' }] })).filter((c) => !c.ok).map((c) => c.id)).toEqual(['CI is green on that head']);
  });
});

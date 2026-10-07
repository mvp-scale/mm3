import { describe, expect, it } from 'vitest';
import { checkPackContents, parsePackJson, REQUIRED } from '../../scripts/check-pack.ts';

describe('checkPackContents', () => {
  it('a clean, minimal tarball (every REQUIRED path present, nothing outside the allow-list) has no problems', () => {
    expect(checkPackContents(REQUIRED.map((path) => ({ path, size: 10 })))).toEqual([]);
  });

  it('flags a leaked path outside dist/skills/.claude-plugin and the allowed root files', () => {
    const entries = [...REQUIRED.map((path) => ({ path, size: 10 })), { path: 'lab/BRIEF.md', size: 5 }, { path: 'test/unit/foo.test.ts', size: 5 }];
    const problems = checkPackContents(entries);
    expect(problems.some((p) => p.includes('lab/BRIEF.md'))).toBe(true);
    expect(problems.some((p) => p.includes('test/unit/foo.test.ts'))).toBe(true);
  });

  it('flags a missing required entry point', () => {
    const entries = REQUIRED.filter((p) => p !== 'dist/cli.js').map((path) => ({ path, size: 10 }));
    expect(checkPackContents(entries).some((p) => p.includes('dist/cli.js'))).toBe(true);
  });
});

describe('the plugin bundle', () => {
  it('requires bin/mm3.mjs, because the plugin manifest launches it from the package folder', () => {
    expect(REQUIRED).toContain('bin/mm3.mjs');
    const entries = REQUIRED.filter((p) => p !== 'bin/mm3.mjs').map((path) => ({ path, size: 10 }));
    expect(checkPackContents(entries).some((p) => p.includes('bin/mm3.mjs'))).toBe(true);
  });

  it('allows bin/mm3.mjs but nothing else under bin/', () => {
    const entries = [...REQUIRED.map((path) => ({ path, size: 10 })), { path: 'bin/other.mjs', size: 5 }];
    const problems = checkPackContents(entries);
    expect(problems.some((p) => p.includes('bin/other.mjs'))).toBe(true);
    expect(problems.some((p) => p.includes('"bin/mm3.mjs"'))).toBe(false);
  });
});

describe('parsePackJson', () => {
  it("reads npm pack --json's array-of-one shape", () => {
    const raw = JSON.stringify([{ files: [{ path: 'dist/cli.js', size: 1, mode: 420 }] }]);
    expect(parsePackJson(raw)).toEqual([{ path: 'dist/cli.js', size: 1, mode: 420 }]);
  });
});

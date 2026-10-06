// How the shipped skills are laid out, following Anthropic's skill guidance: Claude may only preview (about the first 100
// lines of) a file reached through a reference, so the rules that matter sit in the first 100 lines of SKILL.md, long
// material lives in files linked directly from SKILL.md (one level deep), and any markdown file over 100 lines opens with
// a contents list so a partial read still shows what exists. SKILL.md stays under 500 lines.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? walk(f) : [f];
  });
const MD = walk('skills').filter((f) => f.endsWith('.md'));
const lines = (f: string): string[] => readFileSync(f, 'utf8').split('\n');
const links = (f: string): string[] => [...readFileSync(f, 'utf8').matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)].map((m) => m[1]!).filter((l) => !/^https?:/u.test(l));

describe('skill files follow the progressive-disclosure rules', () => {
  it('[C-257] every SKILL.md is under 500 lines', () => {
    for (const f of MD.filter((x) => x.endsWith('SKILL.md'))) expect(lines(f).length, f).toBeLessThan(500);
  });

  it('[C-257] a markdown file over 100 lines opens with a contents list within its first 25 lines', () => {
    for (const f of MD.filter((x) => lines(x).length > 100)) {
      const head = lines(f).slice(0, 25).join('\n');
      expect(head, `${f} needs a "## Contents" list near the top`).toMatch(/^## Contents\n\n(?:- .*\n){3,}/mu);
    }
  });

  it('[C-257] references are one level deep: a reference file does not link to another file', () => {
    for (const f of MD.filter((x) => x.includes(`${path.sep}references${path.sep}`))) expect(links(f), f).toEqual([]);
  });

  it('[C-257] every file SKILL.md links to exists', () => {
    for (const f of MD.filter((x) => x.endsWith('SKILL.md'))) {
      for (const l of links(f)) expect(existsSync(path.join(path.dirname(f), l)), `${f} → ${l}`).toBe(true);
    }
  });
});

describe('the mm3-probe skill keeps its rules where a preview reaches them', () => {
  const f = 'skills/mm3-probe/SKILL.md';
  const head = lines(f).slice(0, 100).join('\n');

  it('[C-257] the rules that matter are in the first 100 lines', () => {
    for (const h of ['## What a probe is', '## A concern is one path', '## What makes a good probe', '## Bad probes, and why', '## Decisions']) expect(head).toContain(h);
  });

  it('[C-257] the long material is linked directly from SKILL.md', () => {
    expect(links(f)).toEqual(expect.arrayContaining(['references/mdl.md', 'references/recipes.md']));
    expect(head).toMatch(/\]\(references\/mdl\.md\)/u);
    expect(head).toMatch(/\]\(references\/recipes\.md\)/u);
  });
});

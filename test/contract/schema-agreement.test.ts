// The hand-written schema checks (src/contract/schema-check.ts) and the published JSON Schema
// (skills/mm3/references/request.schema.json, checked here by ajv) agree: on every request in the corpus,
// and on seeded mutations of it, checkSchema finds nothing exactly when the schema accepts.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { readRequestText } from '../../src/contract/read.ts';
import { checkSchema } from '../../src/contract/schema-check.ts';
import type { Verb } from '../../src/contract/types.ts';
import { validateRequest } from '../../src/contract/validate.ts';
import { seededRandom } from '../../src/util/prng.ts';

// [C-003] the public schema file (docs/contract.md's single named source) is the one checked here.
const schema = JSON.parse(readFileSync('skills/mm3/references/request.schema.json', 'utf8')) as object;
const ajvValid = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
const ROOT = 'test/fixtures/requests';

function corpus(): { file: string; value: Record<string, unknown> }[] {
  // readdirSync gives backslashes on Windows; the corpus names below are posix ("agents/…", "valid/…")
  const files = readdirSync(ROOT, { recursive: true, encoding: 'utf8' }).map((f) => f.split(path.sep).join('/')).filter((f) => f.endsWith('.yaml')).sort();
  return files.map((file) => {
    const r = readRequestText(readFileSync(path.join(ROOT, file), 'utf8'));
    if (!r.ok) throw new Error(`${file}: ${r.stops.join('; ')}`);
    return { file, value: r.value };
  });
}

const agree = (value: unknown): boolean => ajvValid(value) === (checkSchema(value).length === 0);
/** The verb a corpus file's own directory/name implies (agents/haiku/class-1.yaml → class, valid/class.yaml →
 *  class) — used only to word checkSchema's flat-ask fix text the way a real caller would see it. */
const verbOf = (file: string): Verb => path.basename(file).split(/[-.]/)[0] as Verb;

describe('schema agreement (TS checks ⇔ JSON Schema)', () => {
  const docs = corpus();

  it("the corpus holds the three agents' requests and the contract examples", () => {
    expect(docs.filter((d) => d.file.startsWith('agents/'))).toHaveLength(18);
    expect(docs.filter((d) => d.file.startsWith('valid/')).map((d) => path.basename(d.file)).sort()).toEqual(['class.yaml', 'drill.yaml', 'loop.yaml', 'replay.yaml', 'scan.yaml', 'view.yaml']);
  });

  // agents/** predates the ask sections (concerns:/decisions:) — real transcripts from an earlier round,
  // kept for the mutation fuzzer's realism corpus below (which only needs agreement, never acceptance), but no
  // longer expected to validate under the current contract. Only valid/** (this plan's own worked examples)
  // must still be accepted by both checkers; see "none of the agents' requests validate any more" below.
  it.each(docs.filter((d) => d.file.startsWith('valid/')).map((d) => [d.file, d.value] as const))('%s: both accept it', (_file, value) => {
    expect(ajvValid(value)).toBe(true);
    expect(checkSchema(value)).toEqual([]);
  });

  it('seeded mutations: both accept or both reject, every time', () => {
    const rnd = seededRandom('schema-agreement');
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
    const JUNK: unknown[] = [null, 0, 7, true, false, '', 'x', 'no', 'yes', 'Is it?', 'ab', `${'a'.repeat(170)}?`, 'line\nbreak?', [], ['a'], ['a', 'a'], ['a', 'b'], [1, 2], {}, { pass: 'no' }, { pass: 'no', 1: 'Is it?' }, { scale: 'How bad?', levels: ['a', 'b'] }, { choice: 'Which one?', options: ['a', 'b'] }, { scale: 'How bad?', levels: ['a'] }, 'MM3-0001', 'MM3-1', 'quick', 'each', 'src/*.ts', 'src/a b.ts', { before: 'a', after: 'b' }, { before: 'a' }, 'Bad Name', 'kebab-ok', 'x'.repeat(25), '0'];
    const KEYS = ['1', '0', '99', 'pass', 'need', 'tags', 'Bad', 'level', 'name', 'x-y', 'a'.repeat(21)];
    const paths = (o: unknown, p: string[] = [], out: string[][] = []): string[][] => {
      out.push(p);
      if (o && typeof o === 'object') for (const k of Object.keys(o)) paths((o as Record<string, unknown>)[k], [...p, k], out);
      return out;
    };
    const failures: string[] = [];
    for (let i = 0; i < 3000; i++) {
      const d = structuredClone(pick(docs).value) as Record<string, unknown>;
      const p = pick(paths(d).filter((x) => x.length));
      const parent = p.slice(0, -1).reduce<any>((o, k) => o[k], d);
      const key = p.at(-1)!;
      const op = rnd();
      if (op < 0.5) parent[key] = structuredClone(pick(JUNK));
      else if (op < 0.7) Array.isArray(parent) ? parent.splice(Number(key), 1) : delete parent[key];
      else if (!Array.isArray(parent)) parent[pick(KEYS)] = structuredClone(pick(JUNK));
      if (!agree(d)) failures.push(JSON.stringify(d).slice(0, 200));
    }
    expect(failures).toEqual([]);
  });

  // Plan 2b's ask sections (concerns:/decisions:) are a breaking shape change from the flat ask: these agents
  // wrote before it existed — none of them can validate any more (the whole point of "nothing is published on
  // this contract yet"). This replaces the old, narrower "all but one pass" assertion; a fresh corpus of
  // 2b-shaped agent transcripts is what the smoke round (lab/plans/2026-09-28-plan-2b-unified-contract.md) is for.
  it("none of the agents' requests validate any more (they predate ask's concerns:/decisions: sections)", () => {
    const results = docs.filter((d) => d.file.startsWith('agents/')).map((d) => validateRequest(d.value, verbOf(d.file)).ok);
    expect(results.every((ok) => ok === false)).toBe(true);
  });
});

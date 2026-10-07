// The place queries (ledger/index.ts PLACE_SQL) and the two readers built on them, `view <place>` and
// `mm3 report hits`. Guards three things: the query PLAN (every leg is an index search; none scans `places`,
// `runs` or `categories`, which is what made a place join cost a scan of every kind='where' row at 100k runs),
// the ANSWER (the set-based "newest run per place" and the counted view equal the per-place candidate walk and the
// linear engine, on a ledger mixing legacy runs, sweeps, directories, line ranges and case variants), and the
// vouching rule report hits relies on. No network, no build; a small seeded ledger.
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { PLACE_SQL, __testOnly, withIndex } from '../../src/ledger/index.ts';
import { appendContractRun } from '../../src/ledger/log.ts';
import { runReport } from '../../src/verbs/report.ts';
import { runView } from '../../src/verbs/view.ts';
import { generateLedgerRecords, toJsonl } from '../gen/synthetic-ledger.ts';
import { tempProject } from '../helpers/project.ts';
import { sampleContractRun } from '../helpers/runs.ts';

afterEach(() => {
  __testOnly.forceFallback = false;
});

const ENGINES = [false, true]; // real SQLite, then the linear fallback

/** A seeded mixed ledger: legacy and contract runs, sweeps with item paths, directories and `:a-b` line ranges as
 *  places, a tag equal to a place. `clean` makes every sweep carry `categories: {}`, as every real writer does. */
function mixedLedger(clean: boolean): ReturnType<typeof tempProject>['paths'] {
  const { paths } = tempProject({});
  const records = generateLedgerRecords({ seed: 'place-plan', runs: 400, legacyShare: 0.15, sweepShare: 0.25, parentShare: 0.2, outcomeRate: 0.3 }) as any[];
  let k = 0;
  for (const r of records) {
    if (r.kind !== 'run') continue;
    k += 1;
    if (r.v !== 2) continue;
    if (k % 11 === 0) r.where = ['src/auth'];
    if (k % 7 === 0) r.where = [`src/auth/file${k % 5}.ts:3-9`];
    if (k % 17 === 0) r.ask.layers.forEach((l: any) => l.categories.forEach((c: any) => c.tags.push('src/auth')));
    if (r.items) {
      if (clean) r.categories = {};
      let j = 0;
      for (const it of Object.values<any>(r.items)) it.unit = { path: `src/${['auth', 'api', 'ui'][j++ % 3]}/file${j}.ts` };
    }
  }
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.log, toJsonl(records));
  return paths;
}

describe('place queries: the plan', () => {
  it('every place query is an index search: no scan of places, runs or categories, no LIKE/OR over places', () => {
    const paths = mixedLedger(true);
    withIndex(paths, () => 0); // build index.db on disk
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(paths.index, { readOnly: true });
    try {
      const plan = (sql: string, ...params: (string | number)[]): string[] =>
        (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { detail: string }[]).map((r) => r.detail);
      const place = ['src/auth', 'src/auth/', 'src/auth0', 'src/auth'] as const;
      const plans = {
        candidates: plan(PLACE_SQL.candidates, ...place),
        newest: plan(PLACE_SQL.newest),
        breakdown: plan(PLACE_SQL.breakdown, ...place),
        spanNewest: plan(PLACE_SQL.spanNewest, ...place, 10),
      };
      for (const [name, lines] of Object.entries(plans)) {
        const text = lines.join('\n');
        expect(text, `${name} plan:\n${text}`).not.toMatch(/\bSCAN (p|r|o|c|places|runs|outcomes|categories)\b/u);
        expect(text, `${name} plan:\n${text}`).not.toMatch(/MULTI-INDEX OR/u);
      }
      // candidates / breakdown / spanNewest: exactly the three legs, each keyed on (kind, val): equality, prefix range, tag equality.
      for (const name of ['candidates', 'breakdown', 'spanNewest'] as const) {
        const legs = plans[name].filter((l) => /SEARCH (p|places) USING (COVERING )?INDEX/u.test(l));
        expect(legs.filter((l) => /kind=\? AND val>\? AND val<\?/u.test(l)), `${name} needs a range leg`).toHaveLength(1);
        expect(legs.filter((l) => /kind=\? AND val=\?/u.test(l)), `${name} needs the exact and tag legs`).toHaveLength(2);
      }
      // newest: the winner is picked from covering index entries and `runs` is reached by its primary key only.
      expect(plans.newest.some((l) => /SEARCH r USING INDEX sqlite_autoindex_runs_1 \(id=\?\)/u.test(l))).toBe(true);
      expect(plans.newest.some((l) => /SEARCH p USING INTEGER PRIMARY KEY \(rowid=\?\)/u.test(l))).toBe(true);
    } finally {
      db.close();
    }
  });
});

describe('place queries: the answer', () => {
  it('placeCandidates is exact: a descendant matches, a case variant or a look-alike (_ %) does not, on both engines', () => {
    const { paths } = tempProject({});
    appendContractRun(paths, sampleContractRun({ where: ['src/a/b.ts'] }), Date.now(), 'b'); // MM3-0001
    appendContractRun(paths, sampleContractRun({ where: ['SRC/a/x.ts'] }), Date.now(), 'b'); // 0002: only a LIKE would match 'src/a'
    appendContractRun(paths, sampleContractRun({ where: ['src/a_b/y.ts'] }), Date.now(), 'b'); // 0003
    appendContractRun(paths, sampleContractRun({ where: ['src/axb/z.ts'] }), Date.now(), 'b'); // 0004: not under 'src/a_b'
    appendContractRun(paths, sampleContractRun({ where: ['src/a/c.ts:3-9'] }), Date.now(), 'b'); // 0005
    appendContractRun(paths, sampleContractRun({ where: ['src/ab.ts'] }), Date.now(), 'b'); // 0006: 'src/a' is not a prefix of 'src/ab'
    for (const forceFallback of ENGINES) {
      __testOnly.forceFallback = forceFallback;
      const ids = (place: string): string[] => withIndex(paths, (h) => h.placeCandidates(place).map((c) => c.id), { readOnly: true });
      expect(ids('src/a')).toEqual(['MM3-0001', 'MM3-0005']);
      expect(ids('src/a_b')).toEqual(['MM3-0003']);
      expect(ids('src/a%')).toEqual([]);
      expect(ids('src/a/b.ts')).toEqual(['MM3-0001']);
    }
  });

  it('newestPerWherePlace equals placeCandidates(place).at(-1) for every place, on both engines', () => {
    const paths = mixedLedger(false);
    for (const forceFallback of ENGINES) {
      __testOnly.forceFallback = forceFallback;
      withIndex(paths, (h) => {
        const newest = h.newestPerWherePlace();
        const places = h.distinctPlaces().filter((p) => p.kind === 'where');
        expect(newest.map((n) => n.place).sort()).toEqual(places.map((p) => p.val).sort());
        for (const n of newest) {
          const last = h.placeCandidates(n.place).at(-1);
          expect({ id: n.id, offset: n.offset }, n.place).toEqual(last);
        }
      }, { readOnly: true });
    }
  });

  it('report hits gives the same text from the index (gates from the categories table) as from the records, vouched or not', () => {
    for (const clean of [true, false]) {
      const paths = mixedLedger(clean);
      __testOnly.forceFallback = false;
      withIndex(paths, () => 0); // on-disk index, so the SQLite path is the one under test
      const vouched = withIndex(paths, (h) => h.newestPerWherePlace().filter((n) => n.categories).length, { readOnly: true });
      if (clean) expect(vouched).toBeGreaterThan(0); // the index answers some places on its own
      const viaIndex = runReport('hits', { paths }).text;
      __testOnly.forceFallback = true; // the linear engine never vouches: every place is read from its record
      const viaRecords = runReport('hits', { paths }).text;
      expect(viaIndex).toBe(viaRecords);
      expect(viaIndex).toMatch(/^mm3 report hits · \d+ rows/u);
    }
  });

  it('view <place> and view . are the same counted from the index as on the linear engine, at every level', () => {
    const paths = mixedLedger(false);
    withIndex(paths, () => 0);
    for (const place of ['.', 'src', 'src/auth', 'src/auth/file1.ts', 'src/api', 'SRC/auth', 'nowhere', 'src/auth']) {
      for (const level of [1, 2, 3] as const) {
        __testOnly.forceFallback = false;
        const viaIndex = runView(place, level, { paths, env: {} });
        __testOnly.forceFallback = true;
        const viaScan = runView(place, level, { paths, env: {} });
        expect(viaIndex, `${place} L${level}`).toEqual(viaScan);
      }
    }
  });
});

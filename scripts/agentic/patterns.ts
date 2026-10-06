// `npm run agentic:patterns`: what keeps coming up across recorded runs. Every release report records its improvements, accepted
// or not; this counts them by id across runs, so a fix that recurs (or a gap bigger than one fix) is seen as a pattern, not a one-off.
import { readLedger, type FinishedRecord } from './ledger.ts';
import { THEMES, THEME_LIMIT } from './themes.ts';

if (process.argv.includes('--themes')) {
  console.log(`The fixed vocabulary for grouping improvements: ${Object.keys(THEMES).length} themes, never more than ${THEME_LIMIT}.`);
  for (const [k, t] of Object.entries(THEMES)) console.log(`  ${k.padEnd(24)} ${t.label}  →  ${t.where}`);
  process.exit(0);
}

const ends = readLedger().filter((r): r is FinishedRecord => r.phase === 'finished' && r.decision !== undefined);
const by = new Map<string, { runs: Set<string>; models: Set<string>; fix: string; saw: string[] }>();
for (const e of ends) {
  for (const i of e.decision?.improvements ?? []) {
    const x = by.get(i.id) ?? { runs: new Set<string>(), models: new Set<string>(), fix: i.fix, saw: [] };
    x.runs.add(e.startedId);
    i.models.forEach((m) => x.models.add(m));
    x.saw.push(i.saw);
    by.set(i.id, x);
  }
}
if (by.size === 0) console.log(`no improvements recorded yet across ${ends.length} run(s)`);
const themes = new Map<string, { runs: Set<string>; ids: Set<string> }>();
for (const e of ends) for (const i of e.decision?.improvements ?? []) for (const t of i.themes ?? ['other']) {
  const x = themes.get(t) ?? { runs: new Set<string>(), ids: new Set<string>() };
  x.runs.add(e.startedId);
  x.ids.add(i.id);
  themes.set(t, x);
}
if (themes.size) {
  console.log('BY THEME (how the improvements group; a tag groups, it never decides)');
  for (const [t, x] of [...themes].sort((a, b) => b[1].runs.size - a[1].runs.size || b[1].ids.size - a[1].ids.size)) console.log(`  ${t.padEnd(24)} ${THEMES[t]?.label ?? t}: ${x.ids.size} improvement(s), seen in ${x.runs.size} of ${ends.length} runs (${[...x.ids].join(', ')})`);
  if (themes.has('other')) console.log('  ↑ `other` is in use: add a theme to themes.ts or let those go.');
  console.log('');
}
for (const [id, x] of [...by].sort((a, b) => b[1].runs.size - a[1].runs.size)) {
  console.log(`${id}  seen in ${x.runs.size} of ${ends.length} runs (${[...x.runs].join(', ')}) · models ${[...x.models].join(', ')}\n    latest: ${x.saw[x.saw.length - 1]}\n    fix: ${x.fix}`);
}

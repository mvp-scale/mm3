// `npm run agentic:patterns`: what keeps coming up across recorded runs. Every release report records its improvements, accepted
// or not; this counts them by id across runs, so a fix that recurs (or a gap bigger than one fix) is seen as a pattern, not a one-off.
import { readLedger, type FinishedRecord } from './ledger.ts';

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
for (const [id, x] of [...by].sort((a, b) => b[1].runs.size - a[1].runs.size)) {
  console.log(`${id}  seen in ${x.runs.size} of ${ends.length} runs (${[...x.runs].join(', ')}) · models ${[...x.models].join(', ')}\n    latest: ${x.saw[x.saw.length - 1]}\n    fix: ${x.fix}`);
}

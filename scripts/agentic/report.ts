// `npm run agentic:report`: a read-only view of test/agentic/ledger.jsonl, one line per ceremony run. The ledger is the
// source of truth; nothing is written here, so there is no second file to keep in step.
import { incomplete, lastFormal, readLedger, type FinishedRecord } from './ledger.ts';

const records = readLedger();
if (records.length === 0) console.log('no ceremony runs recorded yet');
for (const s of records.filter((r) => r.phase === 'started')) {
  const f = records.find((r): r is FinishedRecord => r.phase !== 'started' && r.startedId === s.id);
  const gate = s.phase === 'started' && f ? `${f.phase === 'aborted' ? 'ABORTED' : f.passed ? 'PASS' : 'FAIL'}` : 'INCOMPLETE';
  const l3 = f?.level3 ? `${f.level3.filter((r) => r.pass && r.model === 'sonnet').length}/${f.level3.filter((r) => r.model === 'sonnet').length} gate-model trials` : '-';
  console.log(`${s.id} · ${s.ts.slice(0, 16)} · ${s.version} · ${s.formal ? 'formal' : 'not formal'}${s.backfilled ? ' (backfilled)' : ''} · ${gate} · level 3: ${l3} · first request ${f?.firstRequestAcceptedRate === undefined ? '-' : `${Math.round(f.firstRequestAcceptedRate * 100)}%`} · $${f?.notionalCostUsd ?? '-'}${s.formal ? '' : `\n      not formal because: ${s.formalReason}`}`);
}
const lf = lastFormal(records);
console.log(`\nrelease gate sees: ${lf ? `${lf.started.id} (${lf.started.version}, ${lf.finished.passed ? 'pass' : 'fail'})` : 'no formal run'}${incomplete(records).length ? ` · incomplete: ${incomplete(records).map((r) => r.id).join(', ')}` : ''}`);

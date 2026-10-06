// `npm run agentic:compare -- <CER-a> <CER-b>` (or no ids: the last two runs): what changed between two ceremony runs, in
// words: the code, the guidance, the definition of success, and the results. This is how a new run says "better than the last".
import { compareRuns, readLedger, type FinishedRecord, type StartedRecord } from './ledger.ts';

const records = readLedger();
const starts = records.filter((r): r is StartedRecord => r.phase === 'started');
const [ida, idb] = process.argv.slice(2);
const pick = (id: string | undefined, fallback: StartedRecord | undefined): { started: StartedRecord; finished?: FinishedRecord } => {
  const started = id ? starts.find((s) => s.id === id) : fallback;
  if (!started) throw new Error(id ? `no run ${id} in the ledger` : 'need two runs in the ledger to compare');
  const finished = records.find((r): r is FinishedRecord => (r.phase === 'finished' || r.phase === 'aborted') && r.startedId === started.id && r.phase === 'finished');
  return finished ? { started, finished } : { started };
};
console.log(compareRuns(pick(ida, starts[starts.length - 2]), pick(idb, starts[starts.length - 1])).join('\n'));

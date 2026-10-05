// `npm run check:agentic`: the release gate for the agentic stage. It reads test/agentic/ledger.jsonl and finds the newest
// FORMAL run (the checkout was the version's own commit, clean, the rules' full trial count). That run must have finished and
// passed, under the same guidance fingerprint and the same definition of success as today: if any text an agent reads has
// changed, or a scenario, checkpoint or rule has, the result is stale and the ceremony must be run again.
import { readFileSync } from 'node:fs';
import { collectSurfaces, manifestOf } from '../test/helpers/guidance-surfaces.ts';
import { definitionOf, lastFormal, readLedger, type FinishedRecord, type StartedRecord } from './agentic/ledger.ts';

export interface Current {
  fingerprint: string;
  definitionHash: string;
}

/** undefined when the newest formal run stands; otherwise the one line that says why not. */
export function agenticProblem(current: Current, last: { started: StartedRecord; finished: FinishedRecord } | undefined): string | undefined {
  if (last === undefined) return '✖ agentic: no formal ceremony run in test/agentic/ledger.jsonl → check out a published version\'s commit and run: npm run ceremony -- --version <it>';
  const { started, finished } = last;
  if (!finished.passed) return `✖ agentic: the last formal run ${started.id} (${started.version}, ${started.ts.slice(0, 10)}) did not pass → fix what it found and run the ceremony again`;
  if (started.fingerprint !== current.fingerprint) return `✖ agentic: guidance changed since ${started.id} passed (${started.fingerprint.slice(0, 12)} → ${current.fingerprint.slice(0, 12)}, tested ${started.version}) → run the ceremony again`;
  if (started.definition.hash !== current.definitionHash) return `✖ agentic: the definition of success changed since ${started.id} passed (a scenario, checkpoint or rule) → run the ceremony again`;
  return undefined;
}

if (process.argv[1]?.endsWith('check-agentic.ts')) {
  const spec = JSON.parse(readFileSync('test/agentic/scenarios/baseline.json', 'utf8')) as Parameters<typeof definitionOf>[0];
  const last = lastFormal(readLedger());
  const problem = agenticProblem({ fingerprint: manifestOf(collectSurfaces()).fingerprint, definitionHash: definitionOf(spec).hash }, last);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  console.log(`agentic OK: ${last!.started.id} passed ${last!.started.version} on ${last!.started.ts.slice(0, 10)} under the current guidance and definition of success`);
}

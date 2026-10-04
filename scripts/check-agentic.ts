// `npm run check:agentic`: the release gate for the agentic stage. The last agentic result (test/agentic/last-run.json)
// names the package version it tested and the guidance fingerprint it ran under. It must have passed, and the
// fingerprint must still be the current one: if any text an agent reads has changed since, the result is stale.
import { existsSync, readFileSync } from 'node:fs';
import { collectSurfaces, manifestOf } from '../test/helpers/guidance-surfaces.ts';

export interface AgenticRun {
  version: string;
  fingerprint: string;
  date: string;
  passed: boolean;
  firstAttempt?: number;
  summary?: string;
}

/** undefined when the result stands; otherwise the one line that says why not. */
export function agenticProblem(current: string, last: AgenticRun | undefined): string | undefined {
  if (last === undefined) return '✖ agentic: no result recorded → run the agentic stage and commit test/agentic/last-run.json';
  if (!last.passed) return `✖ agentic: the last run (${last.version}, ${last.date}) did not pass → fix what it found and re-run`;
  if (last.fingerprint !== current) return `✖ agentic: guidance changed since the last pass (${last.fingerprint.slice(0, 12)} → ${current.slice(0, 12)}, tested ${last.version}) → re-run the agentic stage`;
  return undefined;
}

if (process.argv[1]?.endsWith('check-agentic.ts')) {
  const file = 'test/agentic/last-run.json';
  const last = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as AgenticRun) : undefined;
  const problem = agenticProblem(manifestOf(collectSurfaces()).fingerprint, last);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  console.log(`agentic OK: ${last!.version} passed on ${last!.date} under the current guidance fingerprint`);
}

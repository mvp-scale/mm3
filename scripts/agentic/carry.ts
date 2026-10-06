// Whether a ceremony run may carry jobs forward from an earlier formal run instead of re-running them (`--only <jobs> --carry CER-####`).
// A pure function of the records and the current state, so the refusal is the same every time and is tested without a claude call.
// A carry is safe only when nothing an agent runs or reads could have changed the carried jobs' results: the same guidance, the same
// definition of success for each carried job, and no change under src/, skills/, hooks/, bin/ or the manifests since the source's commit.
import type { Definition, FinishedRecord, StartedRecord } from './ledger.ts';
import { level3Passes, type Rules } from './run.ts';

/** Paths that cannot change what an agent runs or reads (guidance text is checked on its own, through the fingerprint). */
// AGENTS.md is this repo's own contributor guide: the agents under test work in the pinned sample project, and a plugin root's instruction files are not loaded as context.
const HARMLESS = [/^scripts\//u, /^test\//u, /^docs\//u, /^\.github\//u, /^CHANGELOG\.md$/u, /^BACKLOG\.md$/u, /^AGENTS\.md$/u];

export interface CarryInput {
  id: string; // the source run asked for
  source: { started: StartedRecord; finished?: FinishedRecord } | undefined;
  invalid?: string; // why the source was disqualified, if it was
  only: string[]; // the jobs to run fresh
  fingerprint: string; // the guidance fingerprint now
  definition: Definition; // the definition of success now
  changed: string[] | undefined; // `git diff --name-only <source commit> HEAD`; undefined when git could not say
}

/** The jobs a carry takes from the source: every job that is not run fresh. */
export const carriedJobs = (definition: Pick<Definition, 'scenarios'>, only: string[]): string[] => definition.scenarios.map((s) => s.id).filter((id) => !only.includes(id));

/** undefined when the carry is allowed; otherwise the one line that says why not. */
export function carryProblem(i: CarryInput): string | undefined {
  const refuse = (problem: string, fix: string): string => `✖ carry: ${problem} → ${fix}`;
  const { started, finished } = i.source ?? {};
  if (!started) return refuse(`no run ${i.id} in the ledger`, 'npm run agentic:runs lists them');
  if (started.kind !== 'ceremony' || !started.formal) return refuse(`${i.id} is not a formal ceremony run (${started.formalReason})`, 'carry from a formal run');
  if (!finished || finished.phase !== 'finished') return refuse(`${i.id} never finished`, 'carry from a run that finished');
  if (i.invalid) return refuse(`${i.id} was disqualified (${i.invalid})`, 'carry from a run that counts');
  const jobs = carriedJobs(i.definition, i.only);
  const rules = started.definition.rules as Rules;
  for (const job of jobs) {
    if (!level3Passes((finished.level3 ?? []).filter((r) => r.id === job), rules)) return refuse(`${job} did not pass in ${i.id} (or has no rows there)`, `add it to --only ${[...i.only, job].join(',')}`);
  }
  if (started.fingerprint !== i.fingerprint) return refuse(`the guidance changed since ${i.id} (${started.fingerprint.slice(0, 12)} → ${i.fingerprint.slice(0, 12)})`, 'run every job fresh, without --carry');
  const was = new Map(started.definition.scenarios.map((s) => [s.id, JSON.stringify(s)]));
  for (const s of i.definition.scenarios) {
    if (jobs.includes(s.id) && was.get(s.id) !== JSON.stringify(s)) return refuse(`${s.id} is defined differently than in ${i.id}`, `add it to --only ${[...i.only, s.id].join(',')}`);
  }
  if (JSON.stringify(started.definition.rules) !== JSON.stringify(i.definition.rules) || JSON.stringify(started.definition.fixture) !== JSON.stringify(i.definition.fixture)) return refuse(`the rules or the pinned fixture differ from ${i.id}`, 'run every job fresh, without --carry');
  if (!i.changed) return refuse(`cannot list what changed since ${started.versionCommit ?? 'the source commit'}`, 'fetch that commit (git fetch) and try again');
  const bad = i.changed.filter((p) => !HARMLESS.some((re) => re.test(p)));
  if (bad.length) return refuse(`${bad.slice(0, 3).join(', ')}${bad.length > 3 ? ` and ${bad.length - 3} more` : ''} changed since ${i.id}'s commit ${started.versionCommit}, and an agent may run or read it`, 'run every job fresh, without --carry');
  return undefined;
}

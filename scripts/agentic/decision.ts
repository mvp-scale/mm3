// The decision a release report ends with: SHIP, SHIP WITH EXCEPTIONS or DO NOT SHIP, the reasons in plain words, and the
// targeted fix for each problem. A pure function of one recorded run, so the same record always gives the same decision. The
// improvements are captured whether or not anyone accepts them: they are written into the ledger, so a pattern that repeats
// across runs (or a gap that is bigger than any one fix) shows up in `npm run agentic:patterns`. Only the gate model's misses
// block a release; a smaller model's misses are a floor, recorded as patterns.
import { CHECKPOINTS } from './checkpoints.ts';
import type { FinishedRecord, StartedRecord } from './ledger.ts';
import { addRecovery, type Recovery } from './trace.ts';

export interface Improvement {
  id: string; // a checkpoint id, or a named pattern
  saw: string; // what was seen, in numbers
  fix: string; // the targeted fix to try
  models: string[]; // which models showed it
}

export interface Decision {
  verdict: 'SHIP' | 'SHIP WITH EXCEPTIONS' | 'DO NOT SHIP';
  formal: boolean;
  headline: string;
  blockers: string[]; // why not, when it is DO NOT SHIP
  exceptions: Improvement[]; // what is accepted for now, when it is SHIP WITH EXCEPTIONS
  improvements: Improvement[]; // everything worth trying, accepted or not
}

type Row = NonNullable<FinishedRecord['level3']>[number];

export function decide(started: StartedRecord, end: FinishedRecord | undefined, o: { chainOk: boolean; gaps: string[]; gateRecovery?: Recovery }): Decision {
  const rules = started.definition.rules as { gateModel?: string; floorModel?: string; firstAttemptTarget?: number };
  const target = rules.firstAttemptTarget ?? 0.8;
  const rows: Row[] = end?.level3 ?? [];
  const gate = rows.filter((r) => r.model === rules.gateModel);
  const floor = rows.filter((r) => r.model !== rules.gateModel);
  const title = (id: string): string => started.definition.scenarios.find((s) => s.id === id)?.title ?? id;

  const blockers: string[] = [];
  if (!end || end.phase !== 'finished') blockers.push('the run did not finish');
  for (const l of end?.level1 ?? []) if (!l.ok) blockers.push(`a free check failed: ${l.name}`);
  const missed = new Map<string, Set<string>>();
  for (const r of gate) for (const f of r.failed) if (CHECKPOINTS[f]?.severity !== 'exception') (missed.get(f) ?? missed.set(f, new Set()).get(f)!).add(title(r.id));
  for (const [f, jobs] of missed) blockers.push(`${rules.gateModel ?? 'the gate model'} missed "${CHECKPOINTS[f]?.label ?? f}" in: ${[...jobs].join(', ')}`);
  if (o.gaps.length && started.schema !== undefined) blockers.push(`the record is incomplete (${o.gaps.slice(0, 2).join('; ')})`);
  if (!o.chainOk) blockers.push('the ledger chain is broken');

  const improvements: Improvement[] = [];
  const failedBy = new Map<string, { trials: number; models: Set<string> }>();
  for (const r of rows) for (const f of r.failed) {
    const e = failedBy.get(f) ?? { trials: 0, models: new Set<string>() };
    e.trials += 1;
    e.models.add(r.model);
    failedBy.set(f, e);
  }
  for (const [f, e] of failedBy) if (!(f === 'stays-on-mm3' && o.gateRecovery)) improvements.push({ id: f, saw: `missed in ${e.trials} of ${rows.length} trials`, fix: CHECKPOINTS[f]?.fix ?? 'investigate', models: [...e.models] });

  const exceptions: Improvement[] = [];
  // Staying on MM3 after a stop is the test of a good error message. A miss is accepted as an exception, not a blocker, as long as
  // the job still ended in a verdict; it is judged from the recorded recovery, or from transcripts for runs recorded before it existed.
  const gateRecovery = o.gateRecovery ?? (gate.length && gate.every((r) => r.recovery) ? gate.reduce((a, r) => addRecovery(a, r.recovery!), { stops: 0, onTrack: 0, fixedNext: 0 }) : undefined);
  if (gateRecovery && gateRecovery.stops > 0 && gateRecovery.onTrack < gateRecovery.stops) {
    const imp: Improvement = { id: 'stays-on-mm3', saw: `after ${gateRecovery.stops} stop(s) ${rules.gateModel ?? 'the gate model'} stayed on MM3 ${gateRecovery.onTrack} time(s) and its next MM3 request fixed it ${gateRecovery.fixedNext} time(s)`, fix: CHECKPOINTS['stays-on-mm3']!.fix, models: [rules.gateModel ?? 'gate'] };
    improvements.push(imp);
    exceptions.push(imp);
  }
  const rate = end?.firstRequestAcceptedRate;
  if (rate !== undefined && rate < target) {
    const imp: Improvement = { id: 'first-request-rate', saw: `the first request was accepted ${Math.round(rate * 100)}% of the time, target ${Math.round(target * 100)}%`, fix: 'Say "start every request from `mm3 template <verb>`" in the main guidance and end request-shape stops with that command: agents write requests from memory and need a retry.', models: [rules.gateModel ?? 'gate'] };
    improvements.push(imp);
    exceptions.push(imp);
  }
  const floorMisses = floor.filter((r) => !r.pass);
  if (floorMisses.length) improvements.push({ id: 'lower-tier-models', saw: `${rules.floorModel ?? 'the smaller model'} met every criterion in ${floor.length - floorMisses.length} of ${floor.length} trials`, fix: 'A pattern, not a blocker: consider guidance tuned for smaller models (shorter, one command per stop). Accept it only if it repeats across runs.', models: [rules.floorModel ?? 'floor'] });

  const verdict: Decision['verdict'] = blockers.length ? 'DO NOT SHIP' : exceptions.length ? 'SHIP WITH EXCEPTIONS' : 'SHIP';
  const formal = started.formal;
  const headline = `${formal ? '' : 'REHEARSAL, for the record only: this would be '}${verdict}${formal ? '' : '; a formal run on the published commit has to confirm it'}`;
  return { verdict, formal, headline, blockers, exceptions, improvements };
}

// The ceremony's decision, laid out as evidence instead of a verdict word: the score, what blocked it and why, what each failing job tells you
// (did the agents finish the task and only one check fail, or did they not finish), which features it touches and which it does not, how wide it
// is, what is accepted for now, and the commands to read it, fix it or accept it. It reads only what the ledger already holds, so the release
// stages and the release report can print the same cascade for any ceremony, past or present.
import { CHECKPOINTS } from './checkpoints.ts';
import type { FinishedRecord, StartedRecord } from './ledger.ts';

type Row = NonNullable<FinishedRecord['level3']>[number];

interface Job {
  id: string;
  title: string;
  pass: number;
  total: number;
  failedRows: Row[];
}

const pct = (n: number, d: number): string => (d === 0 ? '-' : `${Math.round((n / d) * 100)}%`);

/** What differs between two ceremonies' own records: the first place to look when the newer one fails and the older one passed. */
export function changedSince(now: StartedRecord, then: StartedRecord): string[] {
  const out: string[] = [];
  const claude = (r: StartedRecord): string => (r.environment?.claude ?? '?').replace(' (Claude Code)', '');
  if (claude(now) !== claude(then)) out.push(`Claude Code ${claude(then)} → ${claude(now)}`);
  if (now.fingerprint !== then.fingerprint) out.push('the text agents read');
  if (now.definition.hash !== then.definition.hash) out.push('the definition of success (jobs, checkpoints, rules)');
  if (now.environment?.node !== then.environment?.node) out.push(`node ${then.environment?.node ?? '?'} → ${now.environment?.node ?? '?'}`);
  return out;
}

/** One line per fact. `previous` is the last ceremony that passed, so the brief can say what changed since. */
export function ceremonyBrief(started: StartedRecord, finished: FinishedRecord, previous?: StartedRecord): string[] {
  const rules = started.definition.rules as { gateModel?: string; mustPassTrials?: number };
  const gate = rules.gateModel ?? 'sonnet';
  const need = rules.mustPassTrials ?? 2;
  const rows = finished.level3 ?? [];
  const title = (id: string): string => started.definition.scenarios.find((s) => s.id === id)?.title ?? id;
  const jobs = new Map<string, Job>();
  for (const r of rows.filter((x) => x.model === gate)) {
    const j = jobs.get(r.id) ?? { id: r.id, title: title(r.id), pass: 0, total: 0, failedRows: [] };
    j.total += 1;
    if (r.pass) j.pass += 1;
    else j.failedRows.push(r);
    jobs.set(r.id, j);
  }
  const all = [...jobs.values()];
  const failing = all.filter((j) => j.pass < Math.min(need, j.total));
  const passing = all.filter((j) => !failing.includes(j));
  const trialsPass = all.reduce((a, j) => a + j.pass, 0);
  const trialsAll = all.reduce((a, j) => a + j.total, 0);
  const floor = rows.filter((x) => x.model !== gate);
  const out = [
    `CEREMONY ${started.id} · ${finished.decision?.verdict ?? (finished.passed ? 'PASSED' : 'DID NOT PASS')} · ${started.version}`,
    `  SCORE      ${gate} (the gate): ${passing.length} of ${all.length} jobs pass (need ${need} of 3 trials each) · ${trialsPass} of ${trialsAll} trials · first request accepted ${finished.firstRequestAcceptedRate === undefined ? '-' : pct(Math.round(finished.firstRequestAcceptedRate * 100), 100)} (target ${Math.round(((started.definition.rules as { firstAttemptTarget?: number }).firstAttemptTarget ?? 0.8) * 100)}%, reported, not blocking)`,
  ];
  if (failing.length === 0) return [...out, `  BLOCKED BY  nothing${floor.length ? ` · ${floor[0]!.model} (not gating): ${floor.filter((x) => x.pass).length} of ${floor.length} trials` : ''}`];
  out.push(`  BLOCKED BY ${failing.length} job${failing.length === 1 ? '' : 's'}`);
  failing.forEach((j, i) => {
    const counts = new Map<string, number>();
    for (const r of j.failedRows) for (const f of r.failed) counts.set(f, (counts.get(f) ?? 0) + 1);
    const sc = started.definition.scenarios.find((s) => s.id === j.id);
    const names = [...counts].sort((a, b) => b[1] - a[1]);
    const stillPassed = (sc?.checkpoints ?? []).map((c) => c.id).filter((id) => !counts.has(id));
    const sole = j.failedRows.every((r) => r.failed.length === 1);
    const finishedTask = j.failedRows.every((r) => r.attempts.length === 0 || r.attempts.every((a) => a > 0));
    out.push(`   ${i + 1}. ${title(j.id)} (${j.id}) · ${gate} ${j.pass}/${j.total}`);
    out.push(`      failed:  ${names.map(([id, n]) => `${id} (${n} of ${j.failedRows.length} failed trials)`).join(', ')}`);
    for (const [id] of names.slice(0, 2)) out.push(`      means:   ${CHECKPOINTS[id]?.means ?? id}`);
    out.push(`      held:    ${stillPassed.join(', ') || 'nothing'}`);
    out.push(`      reads as: ${sole && finishedTask ? 'an isolated check: the agents finished the task and only that one observation failed → open a transcript and check the test before changing the product' : 'the agents did not finish the task cleanly → a product or guidance problem: read a trial before anything else'}`);
    out.push(`      try:     ${CHECKPOINTS[names[0]![0]]?.fix ?? 'read the trial'}`);
    const first = j.failedRows[0]!;
    out.push(`      read:    npm run agentic:release-report -- ${started.id} --row ${first.id}/${first.route}/${first.model}/${first.trial}`);
  });
  if (previous) {
    const changed = changedSince(started, previous);
    out.push(`  CHANGED    since ${previous.id} (passed, ${previous.version}): ${changed.length ? changed.join(' · ') : 'nothing in the environment, the agent-read text or the definition'}`);
  }
  out.push(`  IMPACT     breaks: ${failing.map((j) => j.title).join('; ')} · holds: ${passing.map((j) => j.title).join('; ') || 'nothing'}`);
  out.push(`  BLAST      ${failing.length} of ${all.length} gate jobs · every other gate job passed ${passing.length ? Math.min(...passing.map((j) => j.pass)) : 0}+ of 3${floor.length ? ` · ${floor[0]!.model} (not gating): ${floor.filter((x) => x.pass).length} of ${floor.length} trials` : ''}`);
  const watch = (finished.decision?.exceptions ?? []).map((e) => e.saw);
  if (watch.length) out.push(`  WATCH      accepted for now: ${watch.join(' · ')}`);
  out.push(`  NEXT       fix, then: npm run ceremony -- --version ${started.version} --only ${failing.map((j) => j.id).join(',')} --carry ${started.id}   (re-runs only those jobs)`, `             or, to ship as it is: list "${started.id}" under "accept" in release.json`);
  return out;
}

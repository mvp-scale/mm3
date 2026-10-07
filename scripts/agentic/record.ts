// How a run's level 3 rows go into the ledger. One place, used by the ceremony and by the trial command, so both write the same shape.
import type { FinishedRecord } from './ledger.ts';
import type { FullRow } from './run.ts';

export function toLedgerRows(rows: FullRow[]): NonNullable<FinishedRecord['level3']> {
  return rows.map((r) => ({
    id: r.id, route: r.route, model: r.model, resolvedModel: r.resolvedModel, ...(r.build ? { build: r.build } : {}), trial: r.trial, pass: r.pass,
    failed: r.checks.filter((c) => !c.pass).map((c) => c.id), attempts: r.attempts, firstRequestAccepted: r.firstRequestAccepted, mm3Calls: r.mm3Calls,
    usage: { inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, cacheReadTokens: r.usage.cacheReadTokens, cacheCreationTokens: r.usage.cacheCreationTokens, turns: r.usage.turns },
    economics: r.economics, recovery: r.recovery, ...(r.adapters ? { adapters: r.adapters } : {}), transcript: r.transcript ?? '', ...(r.transcriptSha256 ? { transcriptSha256: r.transcriptSha256 } : {}),
  }));
}

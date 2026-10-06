/** What every verb receives and returns. Exit: 0 ok · 1 provider or ledger error · 2 invalid request · 3 budget blocked. */
import type { ClassifierPort } from '../classifier/port.ts';
import type { ResolveStored } from '../classifier/typesafe/client.ts';
import type { ContractRun, RunRecord } from '../ledger/log.ts';
import type { ResolvedConfig } from '../config/load.ts';
import type { Mm3Paths } from '../ledger/paths.ts';

export interface VerbContext {
  paths: Mm3Paths;
  provider: ClassifierPort;
  env: Record<string, string | undefined>;
  /** The effective config, resolved once at the request entry (cli.ts) and handed down. Omitted (every test that
   *  builds its own ctx, library callers) keeps today's behavior: each verb reads config.yaml itself. */
  config?: ResolvedConfig;
  /** Notes the request entry (cli.ts) wants in the run's notes: today only the one-time "config.yaml loaded
   *  automatically" notice. Omitted: none. */
  notes?: string[];
  now?: () => number;
  /** Validate, expand and count; print the plan; ask nothing and spend nothing. */
  dryRun?: boolean;
  /** A resolved OS-keychain/user-file key, beyond env — the same lookup `doctor`/`agent` use (cli.ts's real
   *  wiring passes `resolveStoredKey(ctx.runner, ctx.platform, ctx.env)`). Threaded through so `providerIdentity`
   *  (logged on the ledger run, shown in --dry-run) agrees with what `selectProvider` actually built: a key
   *  found only in the keychain/user file, with no env var, must show `adapter: typesafe`, not fall back to
   *  `fake` just because this was never given a way to see past env. Omitted (every test that builds its own
   *  ctx) keeps today's env-only behavior unchanged. */
  resolveStored?: ResolveStored;
}

export interface VerbResult {
  exit: 0 | 1 | 2 | 3;
  text: string;
  run?: RunRecord | ContractRun;
}

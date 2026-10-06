/**
 * The ONE code defaults table for `.mm3/config.yaml`: every setting MM3 can run with,
 * and the value it runs with when a project's config is silent on it. `config/load.ts` merges a project's
 * sparse overrides on top of this; `config/validate.ts` checks a raw override object shape-by-shape against
 * it. Nothing here reads a file or an env var — this module is pure data plus the types that describe it.
 */

/** Where an effective value actually came from — `mm3 config` shows this per key. */
export type ConfigSource = 'default' | 'config' | 'env';

export interface PricingRate {
  inputPerMTok?: number;
  outputPerMTok?: number;
  perSecond?: number;
  perCall?: number;
}

/** A project's per-field override of the built-in mdl catalog (src/contract/mdl-fields.ts). Renames go
 *  through `as` (an alias, never a redefinition of the C4 levels, which are never overridable). Not yet
 *  consumed by mdl-fields.ts/the mdl card/the template mdl blocks — this module only carries the shape
 *  through validation and the effective-config printer; wiring it into the card generation is a later piece. */
export interface MdlFieldOverride {
  values?: string[];
  note?: string;
  as?: string;
  pattern?: string;
  link?: string;
  literal?: boolean;
}

/** Probes (3 questions each) asked at quick, standard and thorough, in that order — one concern per probe set, so
 *  [3, 6, 9] is today's 9 / 18 / 27 questions. */
type DepthTiers = [quick: number, standard: number, thorough: number];

export interface Mm3Config {
  budget: {
    usd: number;
    runs: number;
    per: 'total' | 'day' | 'hour';
    since?: string;
    /** Share of a cap spent at which the budget line turns into a warning. */
    warnAt: number;
  };
  provider?: string;
  baseURL?: string;
  model?: string;
  /** Keyed by model id (e.g. `jev-1.13.0`) — the default seeds TypeSafe's own currently-published rate (moved
   *  here from `src/classifier/typesafe/answers.ts`'s `RATE_PER_INPUT_TOKEN`; that module still owns actually
   *  reading it for cost estimates —). */
  pricing: Record<string, PricingRate>;
  timeoutMs: number;
  retries: number;
  backoffMs: number;
  sweep: {
    /** Lower-only: a project may tighten this below whatever the code's own compiled-in ceiling is for a
     *  given depth, never raise it past that ceiling. undefined = no project-level cap beyond the code's own. */
    maxItems?: number;
    maxQuestionsPerCall: number;
    /** Items asked per layer at quick / standard / thorough (reused items are free and don't count). */
    itemsPerLayer: { quick: number; standard: number; thorough: number };
  };
  /** Concern counts per depth tier, per verb that has a depth. A request still says `depth: quick`; this says
   *  what quick means for that verb. */
  depth: { class: DepthTiers; scan: DepthTiers; loop: DepthTiers };
  /** How much evidence one call may carry. */
  evidence: { perItemChars: number; totalChars: number; maxFiles: number };
  /** Consensus thresholds over the yes/no slots (lens/consensus.ts). */
  lens: { concernAt: number; weakBelow: number; strongAt: number };
  requestMaxBytes: number;
  reuse: {
    /** undefined = off (no age-based re-ask) — the plan's documented default. */
    maxAgeDays?: number;
    /** undefined = off (no commit-count-based re-ask). */
    maxCommits?: number;
  };
  /** Per built-in mdl field key (why/area/stage/change/risk/problem/uses/blast/touches) → its override. */
  mdl: Record<string, MdlFieldOverride>;
}

/** Frozen all the way down: a resolved config shares its untouched branches with the defaults, so an accidental
 *  write must fail loudly rather than change every later read. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export const DEFAULT_CONFIG: Mm3Config = deepFreeze({
  budget: { usd: 5, runs: 500, per: 'total', warnAt: 0.8 },
  pricing: {
    'jev-1.13.0': { inputPerMTok: 42 / 1_000 }, // $42/Btok = $0.042/Mtok (docs.typesafe.ai/models.md) — see answers.ts
  },
  timeoutMs: 20_000,
  retries: 2,
  backoffMs: 1000,
  sweep: { maxQuestionsPerCall: 500, itemsPerLayer: { quick: 10, standard: 20, thorough: 30 } },
  requestMaxBytes: 1_048_576,
  reuse: {},
  mdl: {},
  depth: { class: [3, 6, 9], scan: [3, 6, 9], loop: [3, 6, 9] },
  evidence: { perItemChars: 20_000, totalChars: 60_000, maxFiles: 500 },
  lens: { concernAt: 0.5, weakBelow: 0.35, strongAt: 0.8 },
});

/** Settings whose default is "unset" (no key in DEFAULT_CONFIG), so load.ts can still label their source. */
export const UNSET_BY_DEFAULT = ['provider', 'baseURL', 'model', 'budget.since', 'sweep.maxItems', 'reuse.maxAgeDays', 'reuse.maxCommits'] as const;

/** Settings that are a map keyed by a user-chosen name (a model id, an mdl field): each entry is one atomic
 *  value that replaces the default entry whole, never merged field by field. */
export const KEYED_MAPS = ['pricing', 'mdl'] as const;

/** Top-level config keys, in the order `mm3 config` prints them. Used by validate.ts for the
 *  unknown-key/did-you-mean check and by load.ts for the printer. */
export const CONFIG_KEYS = ['budget', 'provider', 'baseURL', 'model', 'pricing', 'timeoutMs', 'retries', 'backoffMs', 'sweep', 'requestMaxBytes', 'reuse', 'depth', 'evidence', 'lens', 'mdl'] as const;

/** Request-contract concepts an agent might mistake for project settings B1's "not configurable
 *  (request contract) → set it per request" stop: mak: keys that never belong at the project level. (`depth` used
 *  to be the named example; it is now a project setting — what each tier means per verb — while a request still
 *  says which tier it wants.) */
export const CONTRACT_ONLY_KEYS = ['goal', 'where', 'ask', 'over', 'mdl.parent'] as const;

/** A key name that looks like it's meant to hold a secret, wherever it appears in the config tree
 *  B1's "keys go in env or the keychain" stop (AGENTS.md rule 6: secrets never in the project or config). */
export const SECRET_LIKE_KEYS = ['apikey', 'api_key', 'key', 'token', 'secret', 'password', 'credential', 'credentials'] as const;

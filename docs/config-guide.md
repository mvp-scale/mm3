# config.yaml guide

Status: describes the build on branch `feat/config-load`. Sections 1, 2 and 5 are implemented and tested. Section 3 was read from
the code by hand. The MM3 scan that looks for any remaining hard-coded values has not run yet.

## How config works

`.mm3/config.yaml` is a sparse override file. You write only the keys you want to change. Everything else keeps its built-in
default from `src/config/defaults.ts`. Precedence, highest first:

1. an environment variable (only `provider`, `baseURL`, `model` and `timeoutMs` have one)
2. `.mm3/config.yaml`
3. the built-in default

- `mm3 config` prints the effective config and where each value came from (`default`, `config` or `env`). It is free.
- `mm3 config --write` creates a commented starter `.mm3/config.yaml` when none exists.
- `mm3 config --load [file]` checks the file and records a receipt of it in the ledger (when, a hash, what changed since the last load).
- A wrong key stops with a fix: `✖ sweep.maxItem: "maxItem" is not a sweep field → did you mean maxItems?`
- Secrets never go in this file. Use env vars, the OS keychain, or a 0600 user file.

**The file is the config.** Every request reads `.mm3/config.yaml` itself, so an edit applies at once and deleting the file
means the defaults. `mm3 config --load` checks the file and records a receipt in the ledger; it doesn't change what runs.
`mm3 doctor` compares the file with the latest receipt: loaded, in effect but not recorded, gone, or has a problem.
Section 5 has the detail.

## 1. What exists today

Every key below works now. Each example is a valid file on its own.

### Budget: how much MM3 may spend

```yaml
budget:
  usd: 2          # default 5
  runs: 200       # default 500
  per: day        # total | day | hour. default total
  since: 2026-10-01T00:00:00Z   # only count runs after this time
```

**The happy path.** `mm3 budget` shows what is left and how to change it. To raise (or lower) a cap, edit `budget.usd` or `budget.runs` here, then run `mm3 config --load`. A load whose budget changed starts the count over from that moment, so the new cap is a fresh allowance; a load that changes other settings keeps the count. To start over with the same caps, set `budget.since` to now. If you write `since` yourself it decides the window and nothing is restarted. So by default the cap is a fresh allowance each time you change it, not a lifetime ceiling; to keep a ceiling on everything ever spent, pin `since` to the beginning. Runs in the same second as a load still count. The restart point is kept in the load's ledger receipt, never in your file. There is no `budget set` or `budget reset`: asking for one stops and points here.

### Classifier endpoint and model

```yaml
provider: typesafe              # also: MM3_PROVIDER
baseURL: https://api.typesafe.ai   # also: TYPESAFE_BASE_URL
model: jev-1.13.0               # also: JEV_MODEL
timeoutMs: 20000                # also: JEV_TIMEOUT_MS
retries: 2
backoffMs: 1000
```

### Pricing: what a call costs, per model

```yaml
pricing:
  jev-1.13.0:
    inputPerMTok: 0.042         # other fields: outputPerMTok, perSecond, perCall
```

### Sweeps and request size

```yaml
sweep:
  maxItems: 10                  # lower-only: tightens the per-layer cap, never raises it
  maxQuestionsPerCall: 500      # default 500
requestMaxBytes: 1048576        # default 1 MiB
```

### Reuse: when a stored answer counts as stale

```yaml
reuse:
  maxAgeDays: 30                # default off
  maxCommits: 20                # default off
```

### Your own mdl vocabulary

```yaml
mdl:
  risk: {values: [low, medium, high, critical]}
```

Fields per mdl key: `values`, `note`, `as`, `pattern`, `link`, `literal`. Known gap: these are validated and printed by
`mm3 config`, but not yet used when the mdl card and the templates are built (`src/config/defaults.ts`, `MdlFieldOverride`).

## 2. What used to be hard-coded (now settable)

These were compiled into the code. They are now settable in config.yaml, and every default is unchanged.

| Setting | Default | Where the default lives | Config key |
|---|---|---|---|
| Questions per depth | 9 / 18 / 27 | `src/contract/types.ts` `DEPTH_COUNT` | `depth.class`, `depth.scan`, `depth.loop`: three numbers each |
| Sweep items per layer | 10 / 20 / 30 | `src/contract/types.ts` `SWEEP_ITEM_CAP` | `sweep.itemsPerLayer.quick` and so on (today only the lower-only `sweep.maxItems`) |
| Budget-low warning | 0.8 of the cap | `src/budget/budget.ts` `BUDGET_LOW_FRACTION` | `budget.warnAt` |
| Evidence per item / in total | 20,000 / 60,000 chars | `src/contract/translate.ts` `ITEM_LIMITS` | `evidence.perItemChars`, `evidence.totalChars` |
| Files matched by one glob | 500 | `src/evidence/glob.ts` `MAX_FILES` | `evidence.maxFiles` |
| Consensus thresholds | 0.5 / 0.35 / 0.8 | `src/lens/consensus.ts` `THRESHOLDS` | `lens.concernAt`, `lens.weakBelow`, `lens.strongAt` |
| Closed mdl lists (`stage`, `area`, `change`, `risk`) | fixed lists | `src/contract/types.ts` | covered by `mdl.<field>.values` once that is wired |

### The same settings, laid out the way config.yaml would hold them

The nesting follows the sections that already exist (`budget`, `sweep`, `reuse`): one section per area,
camelCase keys, and every key optional. **Nothing here is required.** The values shown are today's defaults; leave a key out
and you get exactly that. Write only what you want to change.

```yaml
depth:                    # probes for quick, standard, thorough. A probe asks 3 questions, so 3 = 9 questions
  class: [3, 6, 9]
  scan:  [3, 6, 9]
  loop:  [3, 6, 9]
```

A probe always asks three questions from three angles. That never changes. Config only says how many probes each
tier asks for, per verb. The three numbers are `quick`, `standard` and `thorough`, in that order. A request still says
`depth: quick`; config says what `quick` means for that verb. Leave `depth` out and you get 3, 6, 9 everywhere. `drill`,
`replay` and `view` have no depth.

Example: bigger tiers for `class`, a lean `scan`, `loop` left alone:

```yaml
depth:
  class: [15, 30, 45]     # 45, 90 and 135 questions
  scan:  [1, 3, 6]
```

Rule: the three numbers go up (`quick` ≤ `standard` ≤ `thorough`), and each is a whole number of at least 1.

Rules for every new setting: the default is today's value, a bad value stops with a fix, and `mm3 config` shows the value
and where it came from. For `depth`, `mm3 config` also prints the question count beside each number
(`class: [15, 30, 45]  # 45, 90, 135 questions`). The 2 to 5 decisions per request are not part of depth. The total
questions in one call (3 per probe, plus decisions) must fit in `sweep.maxQuestionsPerCall`.

## 3. What stays fixed on purpose

These are what make an answer mean the same thing in every project. Changing them per project would make a `pass` in one
repo incomparable with a `pass` in another.

| Setting | Value | Where |
|---|---|---|
| Pass bar | yes clears at 0.70 or more, no clears at 0.30 or less | `src/contract/grade.ts` `BAR` |
| Questions per probe | exactly 3, each from a different angle | contract |
| Decisions per request | 2 to 5, at least one scale and one choice | `DECISIONS_MIN/MAX` |
| Question length | 160 characters, one line | `MAX_QUESTION_CHARS` |
| `where:` entries | at most 5 | contract |
| The verbs and the C4 levels | six verbs; person, system, container, component, code | `VERBS`, `CHAIN_LEVELS` |
| Secrets | env, keychain or 0600 file only | AGENTS.md rule 6 |

Open for the owner: the pass bar and the question length are the two worth arguing about.

## 4. Adding a setting (for contributors)

A new setting touches the same places every time, so a reviewer can check them as a list:

1. `src/config/defaults.ts`: add the field to `Mm3Config` and its default to `DEFAULT_CONFIG`, plus a key in `CONFIG_KEYS` if
   it is a new top-level section.
2. `src/config/validate.ts`: check its shape and range, and say what to change on a stop (`✖ field: problem → fix`).
3. `src/config/load.ts`: merge it and label its source. (After section 5 this step goes away: the merge is generic.)
4. `src/config/config.ts`: add an example in `EXAMPLES` if it has no default, so `mm3 config` and the starter file show it.
5. Replace the hard-coded read at the old site. Do not leave the constant behind as a second copy.
6. Update every place that repeats the number: the schema description, help text, templates, and `docs/contract.md`.
7. Tests: a unit test for validation and a golden or contract test for the changed output. A claim in `docs/contract.md`
   carries its `[C-###]` tag; run `npm run check:trace` before the PR.

If a developer wants a setting that is in section 3, open an issue first. Those are contract, not preference.

## 5. How loading works

The file is the config. Loading records it.

| Command | Does |
|---|---|
| `mm3 config --write` | writes a starter `.mm3/config.yaml` to edit |
| `mm3 config --load [file]` | checks the file is well formed and records a receipt in the ledger: `✔ valid · loaded · 2 changed from the defaults` |
| `mm3 config` | shows the effective config and where each value came from |
| `mm3 doctor` | compares the file with the latest receipt: loaded, in effect but not recorded, gone, or has a problem |

How it works:

1. **Requests read the file.** Every request reads and checks `.mm3/config.yaml` (about 0.4 ms) and passes the result down to every
   verb. There is no loaded copy and no second file, so there is no state to fall out of date. Delete the file and the defaults apply.
2. **Load = check + record.** `--load` runs the same checks as `mm3 doctor`. If they pass, it appends a `config` record to the
   ledger: the time, a hash of the file, the settings, and what changed since the previous receipt. If they fail, it stops with a
   fix and records nothing.
3. **A bad file stops paid runs.** `class`, `scan`, `drill`, `loop` and `replay` exit 2 with every problem and the fix, and spend
   nothing. The free reads still answer.
4. **Edited but not recorded:** `mm3 doctor` says `⚠ config.yaml is in effect but its latest change is not recorded → mm3 config --load`.
5. **One defaults table.** `DEFAULT_CONFIG` stays the single place a default lives. The old constants (`DEPTH_COUNT`,
   `SWEEP_ITEM_CAP`, `ITEM_LIMITS`, `MAX_FILES`, `THRESHOLDS`, `BUDGET_LOW_FRACTION`) move into it. `DEPTH_COUNT` and
   `SWEEP_ITEM_CAP` stay exported from `src/index.ts`, derived from the defaults.
6. **A generic merge.** `load.ts` stops merging field by field and merges the checked overrides over the defaults,
   labelling each value's source. A new setting then needs a default and a check, and nothing else.

Tests that prove it: with no config, `mm3 config` and the verbs give identical output before and after; a valid file loads
and leaves a receipt, and `mm3 config` shows its values; an edit applies at once and `mm3 doctor` flags it as not recorded;
an invalid file stops paid runs and records nothing; `depth.class: [15, 30, 45]` makes a quick `class` request expect 45 questions.

## 6. Does this break anything?

Goal: no change to core behavior. With no `config.yaml`, every verb gives the same output as today.

| Area | Changes? | Note |
|---|---|---|
| Defaults | No | Every new key defaults to today's value (9 / 18 / 27 questions, 10 / 20 / 30 items, 0.8, 20,000 / 60,000, 500, 0.5 / 0.35 / 0.8). |
| Existing `config.yaml` files | No | A file that works today still works, and edits stay live at once. `mm3 config --load` only records a receipt. |
| Requests and answers | No | `depth: quick`, the YAML contract, the pass bar (0.70 / 0.30) and the response format are untouched. No golden test for the answer format should change. |
| Ledger and reuse | No (to verify) | Reuse and `replay` work from recorded questions, so a changed `depth` should not invalidate old runs. Test it. |
| Library exports | Careful | `DEPTH_COUNT` and `SWEEP_ITEM_CAP` are re-exported from `src/index.ts`. Keep them as exports derived from the defaults, so code that imports them still works. |
| `depth` in config.yaml | Yes, loosened | Today it is on the contract-only list (`CONTRACT_ONLY_KEYS`) and stops with "set it per request". It gets removed from that list. Nobody can depend on the old stop. |
| `mm3 config` output | Yes, cosmetic | It gains the new keys. Tests that snapshot it need updating. |
| Static text | Check | The request schema's description and the templates say "9, 18 or 27". They stay correct for the defaults, but must not state the count as a rule once config can change it. |
| Older MM3 reading a newer config | Minor | An older version rejects the new keys as unknown, with a did-you-mean. Mention it in the release note. |

The behavior changes are that new settings exist and can be set, and that a config.yaml with a problem now stops paid runs with the fix.

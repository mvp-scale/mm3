# MM3 call contract (public)

This is the public, scrubbed copy of the internal spec, for anyone integrating MM3.
Every `[C-###]` tag marks a normative claim.
`scripts/trace.ts` (`npm run check:trace`) maps each claim to the test that proves it, and fails on any claim with none.
Where this contract and the shipped engine disagree, this file describes what actually ships, not the original plan.

**Format and schema**

- Agents send YAML in and get YAML back. JSON is accepted too, since JSON is valid YAML 1.2. [C-001]
- A malformed request is sent back as `✖ field: problem → fix` before any TypeSafe call or spend. [C-002]
- The schema is `skills/mm3/references/request.schema.json` (JSON Schema 2020-12). Editors, MCP tools and agents all read the same file. [C-003]

## 1. The idea in one screen

| Block | Holds | Required? | Sent to TypeSafe? |
|---|---|---|---|
| `mak:` | **make**: the request itself, one `goal`, then plumbing. `ask:` splits into **concerns** (yes/no, one path per category) and **decisions** (scale/choice) | yes | yes |
| `mdl:` | **model**: why you're here, the area, and the run this follows, so the ledger learns | optional | no (ledger only) |

**The two blocks**

- `mak:` is required. Its contents are what reaches TypeSafe. [C-004]
- `mdl:` is optional. It never reaches TypeSafe. It is ledger-only context. [C-005]

**One core, three moves**

- Every verb is the same core: `goal` + categories + `pass` + numbered questions. [C-006]
- What changes is what the core runs over.

| Move | How you ask for it | Verbs |
|---|---|---|
| **one subject** | `where:` (no `over`) | view, class, replay |
| **across** arrays (a sweep) | `over:` nested arrays = layers; `ask:` per layer with `{layer}` blanks | loop (ideas), scan (code) |
| **down** from one item | `from:` an item in a parent run's arrays | drill |

- **One subject:** asked with `where:` and no `over:`. That is view, class and replay. [C-007]
- **A sweep:** asked with `over:` (nested arrays as layers) and `ask:` per layer with `{layer}` blanks. That is loop (ideas) and scan (code). [C-008]
- **Down:** drill goes down from one item. The item is named by `from:`, in a parent run's own arrays. [C-009]

| Grid | Know | Judge | Prove |
|---|---|---|---|
| **MAK³**: use what is proven | [view](#view) | [class](#class) | [replay](#replay) |
| **MDL³**: learn what is missing | [scan](#scan) | [drill](#drill) | [loop](#loop) |

**MAK³ and MDL³ are modes, named in prose only.**

- MAK³ (make) and MDL³ (model) are modes of the six verbs.
- The request keys are always `mak:` and `mdl:`, on every verb.
- A key never selects a mode. The verb you run does.

---
## 2. The core (every verb)

### Fields

| Block | Field | Rule |
|---|---|---|
| mak | `goal` | one line, ≤ 160 chars; what you want to be true. Asked of TypeSafe outright |
| mak | `depth` | `quick` · `standard` · `thorough` = k = 1 · 2 · 3 by default. One subject's `concerns:` section: exactly 3k categories (9 · 18 · 27 yes/no questions). A sweep's finest layer: the same; every layer also caps at 10 · 20 · 30 items asked. A project's `config.yaml` can change these counts (see Config) |
| mak | `where` | 1–5 project paths, optional `:start-end`. We read and redact the code |
| mak | `ask` | `concerns:` (yes/no categories) + `decisions:` (scale/choice categories) for one subject. In a sweep: layer → `{concerns:, decisions:}` |
| mak | `over` | sweeps only: nested arrays |
| mak | `from` | drill only |
| mak | `compare` | replay only |
| mak | `parent` | required by drill and replay (what to build on); allowed on every verb otherwise, as lineage only |
| mak | `expect` | replay only, required: which of the parent's concerns this replay should turn to pass, or the word `none` (an empty list `[]` counts as `none`) to predict no flips at all |
| mdl | `why` | `validate` · `find` · `debug` |
| mdl | `area` | `data` · `api` · `ui` · `auth` · `hosting` · `build` · `tests` — single value, or a list of up to 2; omit for a whole-system question (`uses` carries the map) |
| mdl | `stage` | `design` · `build` · `review` · `pre-merge` · `post-fix` · `release` · `operate` (live production/incident) |
| mdl | `change` | `feature` · `fix` · `refactor` · `dependency` · `config` — only when a code change is involved |
| mdl | `risk` | `low` · `medium` · `high`: the stakes if this answer is wrong |
| mdl | `parent` | the run this follows (lineage only; an alias of `mak.parent` for verbs that don't require it structurally) |
| mdl | `problem` | one line: what you're solving right now |
| mdl | `uses` | up to 5 C4 chains: `level:name( -> level:name)*` (`level`: `person`/`system`/`container`/`component`/`code`); a single string is a 1-item list |
| mdl | `touches` | up to 5 short domain objects/fields the run touches (not language built-ins) |
| mdl | `blast` | `code` · `component` · `container` · `system` · `person` — the widest level one failure reaches (`person` = users' data or accounts) |
| mdl | *(any other key)* | a lower-kebab key ≤ 20 characters: one line ≤ 160, or a list of ≤ 5 such lines, recorded as-is |

Each rule ends with the claim id a test proves. The table above is the quick reference; this is the detail.

### Field rules: the request (`mak`)

**`goal`**

- One line, at most 160 characters.
- It is the question asked of TypeSafe outright. [C-010]

**`depth`** sets how many questions a request asks. `quick`, `standard` and `thorough` set k to 1, 2 and 3 by default. The numbers below are those defaults; a project's `depth:` and `sweep.itemsPerLayer` settings change them (see Config), and a request still just says `depth: quick`.

- **One subject:** `ask.concerns` holds exactly 3k categories, each with exactly 3 yes/no probes. By default that is 9, 18 or 27 questions in total. [C-011]
- **A sweep:** its finest layer follows the same rule. The finest layer is the last one in `over`'s own order, such as scan's `function` or loop's `story`. [C-011]
- **Item cap:** every layer of a sweep also caps at 10, 20 or 30 items asked by default. This cap kept its old numbers when the question counts changed. The two used to match and no longer do. [C-011]
- **Other sweep layers:** optional. When present, their counts are not enforced (you get a note if thin). Only their shape has to hold: well-formed `concerns:` and `decisions:`. [C-011]
- **Stop or note:** these section and count rules are stops in `class`, `drill`, `scan` and `loop`. In `view` they are notes ("class will stop on this"), because a partial draft is fine there. [C-011]

**`where`** is the code MM3 reads: 1 to 5 project paths, each with an optional `:start-end`. The code there is read and redacted. [C-012]

- **Per-file limit:** 20,000 characters, after redaction. Over it, the request stops instead of cutting silently. A whole file (no `:start-end`) gets its own line count and a request for a range. A range that is already that big is asked to narrow further. [C-169]
- **Total limit:** 60,000 characters across all `where:` entries. Cross it and the request stops the same way, naming the entry that doesn't fit. It is the same silent-cut problem, across entries instead of within one. [C-170]
- **The one exception:** evidence MM3 itself picked, never a `where:` you typed. Today that is only `drill` continuing flat from one coded sweep item with no further `over:` (its own whole-file, function or call range). That still truncates, with a note, because there is no `where:` for anyone to narrow. [C-171]

**`ask`** holds the questions. `concerns:` has the yes/no categories and `decisions:` has the scale or choice categories. A sweep nests them under each layer: layer → `{concerns:, decisions:}`. [C-013]

- **No flat `ask`:** nothing is published on a flat, unsectioned `ask` any more. A category with `pass:` straight under `ask:`, with no `concerns:` or `decisions:` wrapper, is refused outright: `✖ mak.ask: put categories under concerns: (yes/no) and decisions: (scale/choice) → mm3 template <verb>`. [C-013]

**`over`** is for sweeps only: nested arrays that define the layers. `concerns` and `decisions` are reserved words here too, because a layer with either name would collide with `ask`'s own sections. [C-014]

**`from`, `compare` and `parent`**

- `from` applies only to `drill`. `compare` applies only to `replay`. [C-015]
- `parent` is required by `drill` and `replay`: it is the run to build on. Every other verb accepts it too, purely as lineage, the same role `mdl.parent` already played. `mdl.parent` remains an accepted alias. [C-015]

### Field rules: why you're here (`mdl`)

None of the `mdl` fields reach the classifier. They only shape what the ledger learns.

**`mdl.why`** is one of `validate`, `find` or `debug`. [C-016]

**`mdl.area`** is one of `data`, `api`, `ui`, `auth`, `hosting`, `build` or `tests`: a single value, or a list of up to 2. Leave it out for a question about the whole system; `mdl.uses` carries the map instead. [C-017]

**`mdl.parent`** records the run this one follows, for lineage only. [C-018]

**`mdl.stage`** is one of `design`, `build`, `review`, `pre-merge`, `post-fix`, `release` or `operate`. `operate` means a live production or incident question. [C-108] [C-209]

**`mdl.change`** is one of `feature`, `fix`, `refactor`, `dependency` or `config`. Use it only when a code change is actually involved. A pure design or plan question, such as `loop`, usually leaves it out. [C-109]

**`mdl.risk`** is one of `low`, `medium` or `high`: the stakes if this answer turns out to be wrong. [C-110]

**The knowledge fields** are `mdl.problem`, `mdl.uses`, `mdl.touches` and `mdl.blast`: a one-line problem statement, up to 5 C4 dependency chains, up to 5 touched entities and a blast-radius level. All four are optional. Like every other `mdl` field, they never reach the classifier. [C-205]

- **`mdl.uses`** is a list of up to 5 C4 chains. A single string is accepted as a 1-item list. [C-205]
  - A chain is `level:name` pairs joined by ` -> `, for example `container:api -> component:contributions-dao -> container:db`.
  - `level` is one of `person`, `system`, `container`, `component` or `code`.
  - `name` is project-identifier-shaped, or `name/name` for containment, or ends in `?` for something guessed or not built yet.
  - It replaces the old single-string `mdl.nodes`. Nothing is published on `nodes` any more, though an old ledger record that still has one reads back as a 1-item `uses`.
- **`mdl.touches`** names the domain objects or fields the run is actually about, not language built-ins or vague concepts. [C-205]
- **`mdl.blast`** takes the widest level one failure reaches. `person` is the widest: the failure reaches users' own data or accounts. [C-205]

**`unknown`:** every closed `mdl` field (`why`, `area`, `stage`, `change`, `risk`, `blast`) also accepts the literal value `unknown`, for when the agent genuinely doesn't know yet. [C-206]

**Custom fields:** any other key under `mdl:` is accepted when it is a lower-kebab name of at most 20 characters. [C-207]

- The value is one line of at most 160 characters, or a list of up to 5 such lines. It is recorded as-is, with no further checking. [C-207]
- `mm3 agent mdl` still builds its card from the built-in table plus any project config. So a custom key is a real escape hatch, not a way to redefine a catalog field. [C-207]

**Size cap:** the whole `mdl:` block is capped at 25 YAML source lines, counted from the request's own text, not the parsed value. The 26th line stops with `✖ mdl: 26 lines → the mdl block is capped at 25 lines`. [C-208]

### Categories and questions

**A concerns category** is a lowercase name (one word or `kebab-case`, at most 20 characters), `pass: yes` or `pass: no`, an optional `need`, optional `tags` (at most 3), an optional `family`, and exactly 3 yes/no questions, each ending in `?`. [C-019]

**`family`** is optional, and only meaningful on a concerns category. It is one of `access`, `injection`, `secrets`, `input`, `output`, `availability`, `correctness`, `design`, `design-risk`, `done` or `other`.

- Left out, it defaults to the category's own name when that name is itself a family value. Otherwise it stays unset.
- Given explicitly, it always wins over the name default.
- It is ledger-only. It is never sent to the classifier and never part of an answer key or a pattern fingerprint, so retagging a category's family never changes whether its answer is reused.

**A decisions category** holds exactly one question: `scale:` with `levels:` (2 to 10 levels), or `choice:` with `options:` (2 to 8 options). A `pass:` names the passing levels or options. [C-022]

**The `decisions:` section** as a whole holds 2 to 5 categories, with at least one `scale:` and at least one `choice:`. This, not a flat per-request cap, is what replaced the older "at most 5 scale/choice questions" rule.

**Numbering:** questions are numbered 1…N, unique across every category (and, in a sweep, every layer), with no gaps. Every concerns question is numbered before every decisions question in the same `ask:` block. [C-020]

**A yes/no question** is text ending in `?`. [C-021]

**Stamped by the engine:** `id`, `ts`, `actor` and `task` are added by MM3 and never sent to the classifier. [C-023]

### Grading: a simple bar, checked per question

**The bar for one question**

- `pass: yes`: an answer clears the bar at P(yes) ≥ 0.70. [C-024]
- `pass: no`: an answer clears the bar at P(yes) ≤ 0.30. [C-025]
- Anything in between does not clear it. There is no averaging. [C-026]
- For a scale or choice, the bar applies to the total probability of the passing levels or options. [C-027]

**The bar for a category**

| `need:` | The category passes when |
|---|---|
| `all` (default) | every answer clears the bar |
| `most` | ≥ ⅔ clear it, and none land confidently the wrong way |
| `any` | at least one clears it |

- `need: all` (the default): the category passes only when every answer clears the bar. [C-028]
- `need: most`: the category passes when at least two-thirds of its answers clear the bar. None may land confidently the wrong way. [C-029]
- `need: any`: the category passes when at least one answer clears the bar. [C-030]

**The bar for the goal and the gate**

- The goal passes at ≥ 0.70. [C-031]
- The gate passes only when the goal and every category pass. [C-032]
- In a sweep, an item passes only when its own categories and all of its children pass. [C-032]
- A sweep's goal answer key includes every asked item's own evidence text (sorted and concatenated), not just the goal text. [C-214]
- So a code change anywhere in the sweep invalidates a cached goal answer, even though the goal question itself didn't change. [C-214]

**Consensus**

- Consensus is one of STRONG, SPLIT or WEAK. It says whether the yes/no answers agree with each other, separate from the grades. [C-033]
- Only `class`'s response, and `drill`'s response on a one-subject parent, show it. [C-033]
- A sweep response (scan, loop, or drill on a sweep parent) and `replay` don't compute it. [C-033]

**Escalate**

- `escalate` is `true` on non-STRONG consensus. [C-034]
- `escalate` is also `true` with `depth: thorough`. [C-034]
- `escalate` is also `true` when the goal reads as irreversible, meaning it matches `delete`, `deploy`, `drop`, `pay`/`payment`, `migrat*`, `secret` or `credential`. [C-034]
- Don't act on `escalate` alone. [C-034]
- It is shown wherever consensus is: class, and drill on a one-subject parent. [C-034]

### How it becomes TypeSafe calls

```
POST /v1/systemone   (model pinned by us)
one subject:  1 call.          state = {goal, code: {"<path>": <redacted>}}
              questions = {goal: noul, "1".."N": noul | score (criteria: levels) | choice (criteria: {option: option})}
a sweep:      1 call per layer. state = {goal, items: {"<item id>": <text or redacted code>}}
              questions = {"<item id>#<n>": {type, instructions: {item: "<item id>", question: "<filled-in text>"}}}
```

**One subject** makes one call. [C-035]

- The state is `state = {goal, code: {"<path>": <redacted>}}`. [C-035]
- The questions are `questions = {goal: noul, "1".."N": noul | score (criteria: levels) | choice (criteria: {option: option})}`. [C-035]

**A sweep** makes one call per layer. [C-036]

- The state is `state = {goal, items: {"<item id>": <text or redacted code>}}`. [C-036]
- The questions are `questions = {"<item id>#<n>": {type, instructions: {item, question}}}`. [C-036]

**What comes back**

- TypeSafe answers under the keys sent, so `"3"` and `"payments/refunds#3"` come back unchanged. [C-037]
- Categories, `pass`, `need`, `tags` and `mdl` never leave our side. [C-037]

### YAML traps we catch

| Agent writes | YAML reads it as | We send back |
|---|---|---|
| `4: Does it log: an email?` | a parse error | `✖ question 4 has ": " → put it in quotes` |
| `4: Is it # really safe?` | `Is it` (the rest is a comment) | `✖ question 4 doesn't end in "?" → put it in quotes` |
| a category or scale on one line in `{ }` whose question has a `?` | a parse error | `✖ use the indented form` |
| `4: no` | `false` | `✖ question 4 is not a question → write it as text` |
| `pass: no` / `pass: yes` | `false` / `true` in older parsers | accepted: false = no, true = yes |

**One trap, one message**

- `4: Does it log: an email?` is a YAML parse error. It is sent back as `✖ question 4 has ": " → put it in quotes`. [C-038]
- `4: Is it # really safe?` reads as `Is it`, because the rest becomes a comment. It is sent back as `✖ question 4 doesn't end in "?" → put it in quotes`. [C-039]
- A category or scale written on one line in `{ }` whose question has a `?` is a parse error. It is sent back as `✖ ... → use the indented form`. [C-040]
- `4: no` is read as the plain text `no`, not a question. The parser is the YAML 1.2 core schema, where `no`/`yes` stay text rather than becoming booleans. It is sent back as `✖ question 4 is not a question → write it as text`. [C-041]
- An unquoted `true`/`false`/`on`/`off` gets the same message as `4: no`. [C-041]
- `pass: no` / `pass: yes` written as `false` / `true` (an older parser's booleans) is accepted. False means no, true means yes. [C-042]

**The pre-parse scan**

- Before any of the above reaches YAML parsing, MM3 scans the raw request. [C-153]
- It flags every numbered question line that carries one of the two traps: an unquoted `": "`, or text starting with an unquoted `"{"`. [C-153]
- It also flags every line over the request's own character cap. Full-line comments are skipped, and a trailing `# comment` is stripped first. [C-153]
- All flagged lines are reported together, in one response. You do not get just the one the parser happens to choke on first. [C-153]
- The list is capped at the same "a few lines, then `N more`" shape every other stop list uses. [C-153]
- A blank filled in per sweep item (`{function}`) is never flagged. Only a question's own text actually starting with `{` is a trap. [C-153]
- When nothing trips this scan, parsing proceeds exactly as before. An already-passing request keeps its original wording untouched. [C-153]

**The pointer on every stop**

- Every stop a request can trigger ends with `→ see: mm3 agent <verb>`. That covers a parse error, a validation stop, or a bad `where`/git path. [C-153]
- The pointer names the verb that was actually run. It comes on top of whatever the stop already told you to fix. [C-153]
- A stop is read by the agent that sent the request, not a person at a terminal. So it points at the terse agent view, not `help`. [C-153]

**Where else the pointer closes a stop**

- The same pointer closes every other stop a person or agent can hit while running one of the six verbs or the four tools beyond them (`report`, `outcome`, `budget`, `template`). It is not limited to a request's own validation. [C-197]
- **`view`:** its own place/id checks. These are control characters, outside the project, and an unknown run id. [C-197]
- **`drill`:** its own parent/from/over checks that aren't evidence reads. These are an unknown or pre-contract `mak.parent`, and a `mak.from` naming no such item or category. They also include an item with no code, code that changed since scan, an idea item given a code-only layer, and `mak.over` on a non-sweep parent. [C-197]
- **`report`:** its own view-name checks. [C-197]
- **`budget`:** its own cap-reached, corrupt-file and bad-cap-value messages. [C-197]
- **`outcome`:** its own ledger-lookup checks. These are an unknown run id, and the asking actor trying to self-certify `held`. [C-197]
- **Bare CLI usage mistakes:** every one for a pointable command. These are an unknown or duplicated flag, a missing project, and a request file the CLI itself couldn't read. They also include `outcome`'s own id/value/`--by` checks and `budget`'s own cap parsing. [C-197]
- **How it is built:** `report`, `outcome`, `budget` and `template` are tools, not one of the six `Verb`s. So `verbs/request.ts`'s `stopText` widens to a small `AgentTarget` union (`Verb` plus the four tool names). The alternative was `verbs/` importing `help/agent.ts`'s `AGENT_TOOLS` just for a type. [C-197]
- `budget/budget.ts` and `ledger/log.ts` sit below `verbs/` in the dependency order. So their own stops append the identical `\n→ see: mm3 agent <tool>` line as a literal suffix instead. This avoids a layering inversion. [C-197]
- **The one exit:** whatever branch made a non-zero answer (and whatever the command), the CLI's single exit adds the pointer when the answer does not already end with one. It names the command's own card when `mm3 agent` has one (the six verbs, `report`, `outcome`, `budget`, `template`, `doctor`, `config`). A command with no card (`help`, `agent`, `init`, `uninstall`, `mcp`, an unknown command) points at the overview, `mm3 agent`. A stop that already ends with a pointer keeps it, and never gets a second one. `doctor` exits 0 even when it reports a problem, so its `✖` lines get the `doctor` pointer without an exit change. [C-197]
- **The plugin's own stops:** a tool call's own stops (`args` not an array, a thrown call) and the JSON-RPC errors (unknown tool, unknown method, a line that is not JSON, a message without `"jsonrpc":"2.0"`) say `✖ mcp: <what> → <fix>` and end with the same pointer. The numeric JSON-RPC code is unchanged. [C-197]

**Plain words where a system error would escape**

- A project folder that does not exist (`MM3_HOME`, or the plugin's `project` field) stops with `✖ project: "<folder>" is not a folder → give an existing project folder (MM3_HOME, or the plugin's project field)`. It no longer reports a missing `src/…` file or a lock it could not write. [C-197]
- A file-system error nothing closer translated (a ledger file that is a folder, a file MM3 may not read) comes back as one line, `✖ files: <what is wrong> → check .mm3/ (log.jsonl and budget.json are files, the folder is writable), then re-run`, with exit 1. It never carries the system's own words (`EISDIR`, `illegal operation on a directory`). [C-197]
- `mm3 template <verb> --from <file>` on a file that is not valid YAML (a tab for indentation, an unclosed quote) stops with `✖ template: --from "<file>" is not valid YAML → fix it (YAML indents with spaces, never tabs), or point at an MM3 request file`, exit 1. [C-197]
- Every `✖` line in a non-zero answer carries a fix after `→`. [C-197]

### Every response

```yaml
mak:                  # the result: gate first, then goal, then categories (or items in a sweep)
  id: MM3-####
  gate: pass | fail | unsure
  …
mdl: {recorded: [...]}    # or: none (this run teaches the ledger less)
next: <one follow-up command>
notes: [budget …, validation notes …]
```

**`mak:` and `mdl:`**

- The `mak:` block lists the gate first, then the goal (when asked), then the categories or items. [C-043]
- `mdl:` is always `{recorded: [...]}` naming what was recorded. It is `{recorded: none}` when nothing was. [C-044]

**`next:`** is one follow-up command.

- **A non-pass gate with something to blame:** it reads `mm3 template drill --parent <id> --from <category-or-item>`. [C-045]
- That is a filled-in drill template, never a bare `mm3 drill`. Drill always needs a request body to fill in. [C-045]
- **Only the goal missed:** every category (or item) passes, so there is nothing to drill into. `next:` says the goal missed though every part passed. [C-046]
- **Sweep, every item skipped:** all items were skipped past the depth cap. `next:` says so instead of naming one. [C-046]

**`notes:`**

- `notes:` always ends with the budget line. Any validation or evidence notes come first. [C-047]

**The budget line**

- It states headroom, not a percentage: `budget: $0.11 left of $0.12 · 27 of 30 runs left`. That is dollars left of the dollar cap, and runs left of the run cap. It is never below zero. [C-229]
- One formatter builds it for every run's `notes:` and for `mm3 budget`. [C-229]
- It gains a leading `⚠` only at 80% or more used, of either cap. [C-229]
- Then it says what to do and which cap is low: `⚠ budget: $0.02 left of $0.12 · 3 of 30 runs left → low: ask the owner to raise budget.usd in .mm3/config.yaml, then run mm3 config --load`. Only the low cap's key is named (`budget.usd`, `budget.runs`, or both). [C-229]
- A cap that concurrent runs overshot says how much was used, instead of reading as exactly at the cap: `0 of 3 runs left (5 used)`, `$0.00 left of $5.00 ($5.50 used)`. [C-229]
- Spend under a cent is never hidden. Dollars left gain just enough decimals to differ from the cap: `$4.998 left of $5.00`. [C-229]
- Below 80% there is no warning. So an agent reads a nearly-full budget as room to keep working. [C-229]

**Rehearsal adapters**

- A rehearsal adapter is `fake` or `chaos`. It is free, deterministic, offline and canned. [C-092]
- A run made with one adds `adapter <name> · not evidence` to `notes:`, right before the budget line. [C-092]
- This happens on every verb that calls the classifier: class, scan, drill, loop, replay. [C-092]
- So a rehearsal answer is never mistaken for real evidence. [C-092]

**Budget caps and defaults**

- Budget caps (`usd`, `runs`) live in `.mm3/config.yaml`'s `budget:` key. [C-093]
- Spend and run counts are derived from the ledger itself, never a separate counter. [C-093]
- A project with neither `config.yaml` nor a legacy `.mm3/budget.json` simply runs on the built-in defaults ($5.00, 500 runs), silently. [C-093]
- A legacy `budget.json` (from before this) is migrated into `config.yaml` at most once, the first time any of those verbs preflights a call. [C-093]
- That same run's `notes:` says so, once: `budget file created with defaults ($5.00 · 500 runs)`. Every later run finds `config.yaml` already holding its own `budget:` key. [C-093]

**Estimated cost on TypeSafe's direct route**

- The direct route reports no cost of its own. [C-132]
- A run whose answering model has a published rate is charged an estimate from its input tokens, instead of showing $0.00. Today the only such model is `jev-1.13.0`, at $42 per billion input tokens. Output tokens are free. [C-132]
- `notes:` then says `cost estimated from tokens (no live pricing reported)`. So it is never mistaken for a figure TypeSafe itself reported. [C-132]
- A model with no published rate keeps its cost unreported, never guessed at. [C-132]
- A cost the gateway route did report always wins over the estimate. [C-132]
- Every verb that calls the classifier (class, scan, drill, loop, replay) does this the same way. [C-132]

**Compat note (no new claim)**

- Run ids are `MM3-####`.
- The retired `SW-####` shape is still read wherever an id is accepted (`parent:`, `view <id>`, `outcome <id>`).
- An old ledger record written with `side:`/`wise:` keys loads as `mak`/`mdl`, the same way an old `mdl.nodes` loads as `uses`.
- Nothing writes the old shapes any more.

**What a response leaves out**

- Question text is never repeated in a response. The agent has it by number. [C-048]
- A sweep response lists category gates per item. It shows probabilities only for questions that didn't clear the bar. The full numbers are in the ledger. [C-049]

---
## view

**MAK³ × Know: what do we already know here?** Free: it reads the ledger and never calls TypeSafe. [C-050]

**When:** before any paid call, when entering an unfamiliar area, or when looking for proven questions. [C-051]

```yaml
mak:                              # the class request you're about to send — a partial draft is fine
  goal: This login handler is safe to merge
  depth: quick
  where: [src/user.ts:1-3]
  ask:
    concerns:
      injection:
        pass: no
        1: Is request text placed directly into the SQL query?
        2: Could a caller change what the query does?
mdl:
  why: validate
  area: data
```

```yaml
mak:
  view: src/user.ts:1-3
  reuse: MM3-0042                   # the same questions on unchanged code → use that answer: no call, no spend
  runs: 7
  categories:                      # the record here, per category
    injection: {runs: 5, pass: 1, fail: 4, last: MM3-0042}
    guards:    {runs: 5, pass: 4, fail: 1, last: MM3-0042}
    leaks:     {runs: 0}           # never asked here: a gap
mdl: {recorded: none}             # view reads only
next: mm3 view MM3-0042        # read the reused answer
notes: [free]
```

### Request mode

Send a request body, meaning a class-shaped draft, and view answers in request mode.

**What the response holds:**

- **`view`:** the `where`, echoed back. [C-052]
- **`reuse`:** set when the exact question set was asked before on unchanged code. [C-052]
- **`runs`:** how many runs have touched this place. [C-052]
- **`categories`:** per category, `{runs, pass, fail, last}`. A category never asked here shows `{runs: 0}`. [C-052]
- **No `best` field yet:** nothing ranks the question set with the best record here. That is true even for a category whose fix was later recorded `held`. [C-052]

**`next`:**

- With an exact reuse, `next` is `mm3 view <reuse>`, which reads that answer. [C-053]
- Without one, `next` is `mm3 class`, and your categories become the first pattern here. [C-053]

### View never spends and never teaches

- **Always `mdl: {recorded: none}`:** view never adds to what the ledger teaches. It records no run and no category. [C-054]
- **No call, no spend:** `notes: [free]`. [C-054]
- **One lookup line per view:** every successful view appends one free `kind: "lookup"` ledger line of its own. That covers a full draft check (`ask:` categories), a place or tag browse, and a run-id lookup. [C-054]
- **What the line holds:** `goal`, `where`, `hit` and `reused`. The ledger can then see what agents search for, even when nothing is asked outright. [C-054]
- **What the line is not:** it takes no `MM3-####` id, it is never counted as a run, and it never touches the budget (see "Setup, keys and the MCP tool" below). [C-054]
- **Draft check:** its `hit` and `reused` reflect a real exact-answer match. [C-054]
- **Place or tag browse, and run-id lookup:** these always log `hit: false, reused: null`, because a bare browse has no "exact question set". `goal` and `where` carry the place string or run id itself, so the record still says what was searched for. [C-054]
- **Failed lookup:** a run-id lookup with an id that is not in the ledger logs nothing. A failed draft check logs nothing either. [C-054]

### Place and id mode

- **The input:** a folder, a tag or a run id, instead of a request body. [C-055]
- **The output:** Plan 1's own text history, not the YAML `mak:` shape above. [C-055]
- **For a place:** a count line (held, overruled, failed and open, with rehearsal runs counted apart), then its newest runs, newest first. [C-055]
- **For a run id:** that run's lineage, up and down. [C-055]
- **Sweep runs:** a scan, loop or drill sweep run's own `where` is always empty, because its questions are asked per item, not per request. [C-120]
- **How a sweep run is found:** its real code locations and category tags are indexed from its items' own units and layers. So `view <folder>` and `view <tag>` find a sweep run the same way they find a class, replay or drill run. It is not found only by `view .`. [C-120]
- **Reading a path:** `view <path>` reads a named file's own bytes only to check whether it looks like a request (`mak:` or JSON). [C-121]
- **A source file that is not a request:** it is always shown as a place. It is never misread as "control characters" just because its code is hard to parse as YAML. [C-121]
- **A saved request file:** still read as a request, exactly as before. [C-121]
- **Nothing dropped silently:** the "… N older → raise the level to see more" line means what it says. No row is ever dropped without a count and a way to see it. [C-122]

### Options

**`--level`**

- `view <MM3-####> --level 2|3` adds answer detail about the run itself, on top of the lineage that `--level` already controlled. [C-123]
- Level 2 shows the run's own category gates. For a sweep, it shows how many of its items are failing. [C-123]
- Level 3 adds the run's notes and adapter/model. [C-123]
- Level 1 is unchanged. [C-123]
- A legacy (Plan 1) run has none of this stored. So any level above 1 is a documented no-op for it, never a stop. [C-123]

**`--summary`**

- `view <folder|tag|.> --summary` prints one line per distinct place. A place is a `where` path, or a sweep item's own code path. [C-124]
- Each line comes from the latest run that touched the place. The worst gate comes first. [C-124]
- It is the free onboarding briefing, without hand-assembling it from several `view` calls. [C-124]
- It is ignored for a run id or a request draft, where "one line per place" doesn't apply. [C-124]

**`--answers`**

- `view <MM3-####> --answers` adds one line per question that run actually asked. It sits on top of the lineage and any `--level` detail already shown. [C-215]
- **Each line holds:** the question's id and its text. [C-215]
- **Its checked answer:** `p <n>` for yes/no. For scale or choice, the winning level or option and its share. [C-215]
- **`reused <MM3-####>`:** shown when that question's answer came from a prior run. [C-215]
- **Its answer key:** `translate.ts`'s `answerKey`, which is what makes the answer reusable. [C-215]
- **A sweep's questions:** they are its items' own (`<item id>#<n>`, filled in), not the request's. `ask.categories` is always empty for a sweep (C-120). [C-215]
- **When it is ignored:** for a place, a tag or a request draft. This is the same restriction `--summary` has in reverse (C-124). [C-215]
- **A legacy (Plan 1) run:** it has none of this stored, so `--answers` is a silent no-op. `--level` above 1 works the same way (C-123). [C-215]

---
## class

**MAK³ × Judge: does the evidence support this one goal?** One call, one state. [C-056]

**When:** a decision on one subject, such as merge, choose, triage or check a fix. [C-057]

```yaml
mak:
  goal: This login handler is safe to merge
  depth: quick                     # k=1: exactly 3 concerns categories, 9 yes/no questions total
  where: [src/user.ts:1-3]
  ask:
    concerns:
      injection:                   # family defaults to "injection" (the name is itself one)
        pass: no
        1: Is request text placed directly into the SQL query?
        2: Is the query built with string concatenation instead of a bound parameter?
        3: Does the query run with db.query on that concatenated string?
      access:
        pass: no
        4: Is the id checked to be a number before use?
        5: Is the caller compared to the record owner?
        6: Could any caller read any record without a permission check?
      leaks:
        pass: no
        7: Does the error sent back reveal the query?
        8: Does the code log an email address?
        9: Does the response include fields the caller didn't ask for?
    decisions:
      severity:
        pass: [none, low]
        10:
          scale: How severe is the worst issue?
          levels: [none, low, medium, high, critical]
      route:
        pass: [ship]
        11:
          choice: Where should this go?
          options: [ship, fix, block]
mdl:
  why: validate
  area: data
```

```yaml
mak:
  id: MM3-0042
  gate: fail
  goal: {gate: fail, p: 0.08}
  injection: {gate: fail,   1: 0.94, 2: 0.91, 3: 0.90}
  access:    {gate: fail,   4: 0.86, 5: 0.84, 6: 0.79}
  leaks:     {gate: unsure, 7: 0.55, 8: 0.20, 9: 0.31}
  severity:  {gate: fail,   10: {top: high, p: 0.81}}
  route:     {gate: fail,   11: {top: block, p: 0.97}}
  consensus: STRONG
  escalate: false
mdl: {recorded: [why, area]}
next: mm3 template drill --parent MM3-0042 --from injection
notes: ["budget: $4.98 left of $5.00 · 497 of 500 runs left"]
```

### What `next:` says

**On `pass`:** `next:` points at Prove, not just at acting. [C-232]

- For `class`, it reads `act on it · then prove it with mm3 replay --parent <this run's id> --compare <before>..HEAD`. [C-232]
- For `loop`, it reads `build it, then class the code · after the commit, mm3 replay --parent <this run's id> --compare <before>..HEAD`. [C-232]
- `<before>` is left for the caller to fill in. [C-232]
- The text has no `": "`, so it stays a plain YAML scalar. [C-232]

**On `fail`:** `next:` drills into the first category whose own gate is `fail`, in written order. [C-058]

**On `unsure`:** `next:` drills into the first category whose own gate is `unsure`. [C-058]

### What the ledger learns

- It learns the pass/fail record per category, per place and per area. [C-059]
- These questions and categories become a candidate pattern for this place. [C-059]

### Reuse and stale notes

**Reused answers**

- When any question's answer was reused, whole or in part, from an earlier run, the response names which one. [C-130]
- The field is `reused: [MM3-####, ...]`, sorted and deduplicated, right after `escalate:`. [C-130]
- The field is left out entirely when nothing was reused. [C-130]

**Stale notes**

- This applies when a question is asked fresh (not reused), but an earlier run already answered the exact same question text at an overlapping place, on code that has since changed. [C-160]
- Then the response's `notes:` says so: `stale: MM3-#### answered "<question, clipped>" on older code (p <its P(yes)>)`. [C-160]
- There are up to 3 such notes, one per older run. [C-160]
- This is scoped to `class` only for now. [C-160]

---
## replay

**MAK³ × Prove: did the change work?** It replays a parent run's questions (the yardstick) on two states. [C-060]

**When:** after a fix, a refactor, a dependency bump, or to compare fix A with fix B. [C-061]

```yaml
mak:
  goal: The injection fix works
  parent: MM3-0042                  # replay this run's categories and questions
  compare: {before: main, after: HEAD}
  expect: [injection]              # required: which of the parent's concerns this replay should fix, or "none"
mdl:
  why: validate
  area: data
```

```yaml
mak:
  id: MM3-0051
  gate: fail                       # every category passes on "after", and nothing regressed
  goal: {gate: pass, p: 0.84}
  injection: {before: fail, after: pass, fixed: [1, 2, 3], probes: 3/3 fixed}
  access:    {before: fail, after: fail, still: [4, 5], probes: 0/2 fixed}
  leaks:     {before: unsure, after: pass, fixed: [7], probes: 1/1 fixed}
  expected: {fixed: [injection], still: [access]}
  regressed: []
mdl: {recorded: [why, area, parent]}
next: mm3 template drill --parent MM3-0051 --from access
notes: ["2 states · budget: $4.96 left of $5.00 · 495 of 500 runs left"]
```

### What replay takes

- **No `ask`:** `replay` never takes `ask`. It replays the parent's categories and questions. New questions go through `class`. [C-062]
- **A one-subject parent:** the parent may be a one-subject run (class, replay, or drill's one-subject form). This is the shape this section describes. [C-063]
- **A sweep parent:** the parent may instead be a sweep run (scan, loop, or drill's sweep form). That is replayed differently: see "A sweep parent" below. [C-063]
- **No request file:** called as `mm3 replay --parent MM3-#### --compare <before>..<after>`, the goal asked is the parent run's own goal, not a fixed placeholder. [C-066]

**`expect:`** is required. It is the agent's own prediction of which of the parent's concerns this replay should turn to pass.

- **What it holds:** either 1 to 9 concern names, or the literal word `none`. [C-210]
- **Names:** each is lowercase kebab-case, at most 20 characters, and unique. [C-210]
- **`none`:** predicts no flips at all. An empty list `[]` is read as `none`. [C-210]
- **Real concerns only:** each named concern must be a real concerns-section category of the parent. Naming a decisions category or an unknown name is a stop. [C-210]

### What comes back

```yaml
mak:
  id: MM3-0052
  gate: fail                       # access regressed even though it (and the goal) grade pass on their own
  goal: {gate: pass, p: 0.81}
  injection: {before: fail, after: pass, fixed: [1, 2, 3], probes: 3/3 fixed}
  access:    {before: pass, after: pass, probes: 0/2 fixed}
  leaks:     {before: unsure, after: pass, fixed: [7], probes: 1/1 fixed}
  expected: {fixed: [injection], still: []}
  unexpected: [leaks]              # leaks flipped too, but wasn't named in expect: [injection]
  regressed: [5]
mdl: {recorded: [why, area, parent]}
next: mm3 template drill --parent MM3-0052 --from access
notes: ["2 states · budget: $4.96 left of $5.00 · 495 of 500 runs left"]
```

**Each category** shows its own result.

- **Gates:** `before` and `after` show the gate on each state. [C-064]
- **`fixed`:** the questions that were failing or unsure before and pass after. [C-064]
- **`still`:** the ones that don't. [C-064]
- **`probes: <fixed>/<total> fixed`:** how many of the category's own questions cleared, out of how many it has. [C-064] [C-211]
- **`regressed`:** the run-wide list of questions that passed before and not after. It can alone fail the gate, even when every `after` category passes on its own. [C-064] [C-211]

**`expected:`** grades your `expect:` prediction against what actually happened, per named concern.

- **`fixed`:** the concern was missed or unsure before, and clears now. [C-210]
- **`still`:** the concern was missed or unsure before, and still doesn't clear. [C-210]
- **Already passing:** a concern that already passed before predicts nothing meaningful either way. It is left out of both lists. [C-210]

**`unexpected:`** lists what you did not predict.

- **What lands here:** any concerns-section category that flips (`before` != `after`) without being named in `expect:`. When `expect: none`, every flipped concern lands here. [C-210]
- **Why it exists:** it replaces having to name every affected concern up front just to avoid a false "prediction missed." [C-210]

**What to do with the result**

- **On `fixed`:** record `outcome held` on the parent. [C-065]
- **On `still`:** keep working. [C-065]
- **On anything in `regressed`:** revert, or drill into it. [C-065]

**`next:` after a regression**

- A non-empty `regressed` takes priority over the usual "which category matches the overall gate?" search. [C-091]
- `next:` names the category the first regressed question belongs to. [C-091]
- This holds even when every `after` category (and the goal) grades pass on its own. The example above is that case, where nothing but `regressed` explains the `fail`. [C-091]

### Git and reuse

- **Nested repos:** `replay` reads git in the repo that actually contains each compared file. It uses that file's own nearest `git rev-parse --show-toplevel`, not only the MM3 project root. So a file whose own repo is nested one level down (a monorepo package, a vendored project) is no longer invisible to it. [C-147]
- **Reuse is named:** like `class`, `replay` names which prior runs its answers came from (`reused: [ids]`) when anything was reused. [C-152]
- **Dry run:** `--dry-run` predicts that reuse the same way `class`'s does. [C-152]

### Not shipped yet

- **The plan:** whether the yardstick predicted correctly should feed a ranking. A category that said `fail` and was later `fixed` and proven would count as a hit. [C-067]
- **The gap:** there is no hit count anywhere in the ledger record, because `ContractRun` carries no field for it. Recording a fix's outcome as `held` changes nothing about what `view` shows for that category afterward. It is the same gap as `view`'s own missing `best` field (above). [C-067]

### A sweep parent

A sweep parent is scan, loop, or drill's own sweep form.

- **What it re-runs:** `replay` re-runs the parent's own sweep twice, once per ref. It uses `over:` and the `ask:` layers the parent recorded. [C-216]
- **Same two states:** it runs over the same two `compare:` states as a one-subject parent. [C-216]
- **Ref-aware reading:** a ref-aware resolver reads git (or the working tree, for `worktree`). It does not always read the current files. The resolver of scan and drill works the same way. [C-216]
- **Free reuse:** an unchanged unit's text is identical at both refs. So it reuses for free, exactly like an unchanged scan or drill item always does. [C-216]
- **Where reuse comes from:** often straight from the parent's own original run, not just between this replay's own two calls. [C-216]
- **The one refusal:** only a drill sweep continuation is refused. That is an `over:` whose first layer is the literal `each`, anchored on a root item stored only in the grandparent run. Replaying it would need to rebuild that root, which this run has no way to do. [C-216]
- **What replays fine:** a scan's or loop's own self-contained `over:`. [C-216]

```yaml
mak:
  id: MM3-0099
  gate: fail                        # src/a.ts regressed on question 3
  goal: {gate: fail, p: 0.05}
  items:
    src/a.ts: {before: fail, after: fail, fixed: [1], still: [2], probes: 1/2 fixed}
  passing: 1                        # src/b.ts (unchanged, always passing) says nothing new, so it's left out of items:
  expected: {fixed: [], still: [injection]}
  regressed: [src/a.ts#3]
mdl: {recorded: [parent]}
next: mm3 template drill --parent MM3-0099 --from src/a.ts
notes: ["reused: MM3-0042 (0d, 1 commit), 2 refs · 2 calls · 11 questions · budget: $4.96 left of $5.00 · 495 of 500 runs left"]
```

**The response is item-shaped, not category-shaped.**

- **`items:`** holds one entry per item whose own `before`/`after` wasn't a clean pass at both states. It is the same `{before, after, fixed, still, probes}` shape a one-subject category gets, keyed by item id. [C-217]
- **Left out:** an item that never changed and was already passing says nothing new. It is left out, the same way scan's own `failing:` only lists what needs attention. [C-217]
- **`regressed`:** it is `<item id>#<question number>`, not a bare number. Several items can share the same question numbers, so the item id says which one actually regressed. [C-217]
- **The gate:** a non-empty `regressed` fails the gate and wins `next:`'s own "which item is to blame?" search, exactly as it does for a one-subject parent. [C-217]
- **Concern names:** `expect:`, `expected:` and `unexpected:` name concern-section category names, the same as a one-subject parent. [C-217]
- **Graded in aggregate:** they are graded across every item that has that category, because a sweep's own layers can repeat the same category at several depths. [C-217]
- **`fixed`:** a concern counts as `fixed` only when every one of its not-passing-before occurrences is passing after. A partial fix anywhere still reads as `still`. [C-217]
- **`unexpected`:** it fires when any unnamed concern flips at all, on any item. [C-217]
- **Question ids:** every question id this run stores is item-qualified (`before:<item id>#<n>`, `before:goal`). A sweep's own item ids repeat the same question numbers per item. A one-subject parent's own ids are the bare `before:<n>`. [C-217]

---
## scan

**MDL³ × Know: where in this code should we look?** A sweep across code, read by us. [C-068]

**When:** a new codebase, a release check, a PR's changed files, or a vague bug with no location yet. [C-069]

```yaml
mak:
  goal: Handlers don't trust request input
  depth: quick                     # function is the finest layer: exactly 3 concerns categories, at most 10 items
  over:
    file: src/handlers/*.ts        # we expand the pattern and read each file
    function: each                 # we split each file into its functions
  ask:
    function:
      concerns:
        injection:
          pass: no
          1: Does {function} put request text straight into a query?
          2: Is the query built by string concatenation instead of a bound parameter?
          3: Does {function} run the query with db.query on that string?
        access:
          pass: no
          4: Does {function} return a record without checking its owner?
          5: Is the caller's id compared to the record's owner id?
          6: Could {function} be called without any permission check?
        output:
          pass: no
          7: Does {function} send back a raw database error message?
          8: Does {function} log the full request body?
          9: Does {function}'s response include fields the caller didn't ask for?
      decisions:
        severity:
          pass: [none, low]
          10:
            scale: How severe is the worst issue in {function}?
            levels: [none, low, medium, high, critical]
        route:
          pass: [ship]
          11:
            choice: Where should {function} go?
            options: [ship, fix, block]
mdl:
  why: find
  area: api
```

```yaml
mak:
  id: MM3-0060
  gate: fail
  goal: {gate: fail, p: 0.21}
  scanned: {file: 6, function: 23}
  failing:                         # worst first; only questions that didn't clear the bar
    src/handlers/user.ts/findUser:    {injection: fail, access: fail, 1: 0.93, 4: 0.88}
    src/handlers/order.ts/getOrder:   {access: fail, 4: 0.79}
    src/handlers/order.ts/listOrders: {access: unsure, 4: 0.52}
  passing: 20                      # counted, not listed
  reused: 14                       # unchanged functions answered from the ledger for free
mdl: {recorded: [why, area]}
next: mm3 template drill --parent MM3-0060 --from src/handlers/user.ts/findUser
notes: ["1 call (the function layer; files are read, not asked) · budget: $4.96 left of $5.00 · 495 of 500 runs left"]
```

### What scan reads

- **Named functions at any depth:** `function: each` (and, downstream, `call: each`) finds a named function or method at any nesting depth. Examples are a route handler registered from inside a setup function, or a helper closed over by an IIFE. It does not look only at top-level declarations. [C-141]
- **Anonymous functions:** an anonymous function or arrow passed inline with no name of its own is still not its own unit. [C-141]
- **Only what `over:` names:** a scan only ever reads what `over:` names. [C-146]
- **Missed entrypoints:** a scan adds a note, never a stop, naming any common entrypoint or config file that exists in the project but sits outside every `over:` pattern. [C-146]
- **Which files:** `server.js`, `app.js`, `index.js`, `main.js` and `config/**`. Never `.env*`, which would invite sending secrets to the classifier. [C-146]
- **At most 3 paths:** the note names at most 3 missed paths, then `… N more`. A `config/**` glob can match many files, and listing every one buries the point. [C-168]

### What comes back

- **Order:** `failing:` shows the worst first. That is most failing categories, then most unsure, then written order. [C-070]
- **Counts:** `passing:` and `reused:` are counts, never lists. The response also has `scanned: {layer: count, ...}`. [C-070]
- **Severity first:** `failing:` ranks by severity first when any failing item carries a `scale` question (its worst level × p). That comes ahead of the fail/unsure category counts and written order. [C-145]
- **Why severity:** a "high" answer at high confidence no longer outranks a "critical" one just by category-fail count. [C-145]
- **When it doesn't apply:** unchanged for a sweep with no scale question, and for `loop`. [C-145]
- **`next:` when items fail:** it drills into the worst item. [C-071]
- **`next:` when nothing failed:** it says the goal alone missed. [C-071]
- **`next:` when nothing was graded:** it says every item was skipped past the depth cap. [C-071]

### Reuse and cost

- **Unchanged code is free:** an unchanged function on a later scan is answered from the ledger for free. A second scan of unchanged code costs nothing. [C-072]
- **Reuse is per function:** reused answers are stored per function, not per file or per run. A later scan (or a drill down from it) pays only for what actually changed. [C-073]
- **No pattern query yet:** there is no separate folder- or category-level pattern query yet. A sweep run's own top-level `categories` stays empty. Only its per-item grading (read back by that item's own id) carries the record. [C-073]
- **Budget cap:** a fully-reused scan is never blocked by an already-reached budget cap (see the dry-run/reuse rules above). [C-150]

---
## drill

**MDL³ × Judge: why did this one thing fail?** It goes down from one item in a parent run. [C-074]

**When:** after a `fail` or `unsure` from class, scan, loop or replay. [C-075]

```yaml
mak:
  goal: Find exactly where request text reaches the query
  parent: MM3-0060
  from: src/handlers/user.ts/findUser    # an item id or a category from the parent run
  depth: quick                     # call is the finest (and only) layer here: exactly 3 concerns categories
  over:
    call: each                     # the next layer down: each call inside findUser
  ask:
    call:
      concerns:
        reach:
          pass: no
          1: Does {call} pass request text into SQL?
          2: Is {call}'s argument built by string concatenation?
          3: Is {call} reachable from an unauthenticated route?
        guard:
          pass: yes
          4: Is {call}'s argument parsed to a number before use?
          5: Is {call}'s argument bound as a parameter instead of concatenated?
          6: Is {call}'s argument validated against an allow-list?
        sink:
          pass: no
          7: Does {call} hit db.query directly?
          8: Does {call} run inside a transaction with no timeout?
          9: Does {call}'s result get returned to the caller unfiltered?
      decisions:
        severity:
          pass: [none, low]
          10:
            scale: How severe is {call}'s worst issue?
            levels: [none, low, medium, high, critical]
        route:
          pass: [ship]
          11:
            choice: What should happen to {call} next?
            options: [ship, fix, block]
mdl:
  why: debug
  area: data
```

```yaml
mak:
  id: MM3-0061
  gate: fail
  goal: {gate: pass, p: 0.77}
  failing:
    src/handlers/user.ts/findUser/db.query: {reach: fail, sink: fail, 1: 0.96, 2: 0.94, 7: 0.91}
  passing: 3
mdl: {recorded: [why, area]}
next: fix it, then run this drill again (unchanged items are reused, so it is nearly free)
notes: ["1 call · budget: $4.96 left of $5.00 · 495 of 500 runs left"]
```

### What `from` means

- **On a sweep parent** (scan, loop or an earlier sweep drill): `from:` names an item. [C-076]
- **Then `over:` is needed.** `drill` needs `over:` for the next layer down under that item. [C-076]
- **The response** is shaped like scan's, worst first. [C-076]
- **On a one-subject parent** (class, replay or an earlier one-subject drill): `from:` names a category instead. [C-077]
- **New questions:** narrower questions go under `ask:` inside that category. [C-077]
- **The response** has the same shape as class's, including consensus and escalate. [C-077]

### What `next:` says

- **Never "drill further":** drill's own `next:` never points at drilling further. [C-078]
- **On a one-subject parent:** it says to fix it, then `replay` against the parent. [C-078]
- **On a sweep parent:** it says to fix it and run this same drill again. Unchanged items are reused, so it is nearly free. [C-078]

### What the ledger learns

- **Drill pattern:** the ledger learns which narrower questions separate the real cause from the noise. [C-079]
- Those questions become the drill pattern for that category. [C-079]

### Templates

- **`mm3 template drill --parent <id> --from <x>`** picks the sample that matches that id's own shape, when the ledger has it. [C-090]
- A sweep parent's sample keeps `over:`. [C-090]
- A one-subject parent's sample has no `over:`, and `from:` names a category instead. [C-090]
- **No project, or an id the ledger doesn't have:** it prints the sweep sample, same as always. [C-090]

### Drilling one coded item

- **Flat proof:** `drill` on a sweep item that has code, given no `over:`, is a flat one-subject proof of just that one item. [C-144]
- Fresh `ask:` categories are answered against the item's own lines. The shape is the same as a one-subject parent's drill. [C-144]
- **Idea items still stop:** an idea item (loop's own kind, with no code) stops and names the fix. [C-144]
- **Reuse is named:** like `class`, it names which prior run its answers came from when anything was reused. [C-149]
- **`--dry-run`** predicts that reuse. [C-149]
- **Budget cap:** a fully reused drill is never blocked by an already-reached budget cap. [C-149]

---
## loop

**MDL³ × Prove: does this idea hold up?** A sweep across layers of ideas, written by the agent. [C-080]

**When:** a design, a plan or a feature request before any code; comparing two designs. [C-081]

```yaml
mak:
  goal: The checkout redesign is sound
  depth: quick                     # story is the finest layer: exactly 3 concerns categories there
  where: [src/checkout/]           # optional: the code the ideas are checked against
  over:                            # nested arrays = layers; an item's children are the next layer
    part:
      - name: gateway
        story: [guest checkout, saved cards]
      - name: payments
        story: [refunds, retries, partial capture]
      - ledger                     # an item with no children is just its name
  ask:                             # per layer; {part} and {story} are filled in per item
    part:                          # not the finest layer: thin and optional (a note, not a stop)
      concerns:
        boundaries:
          pass: yes
          1: Does {part} own one clear responsibility?
          2: Can {part} be deployed without the others?
    story:
      concerns:
        done:
          pass: yes
          3: Is "{story}" testable against {part} as written?
          4: Does "{story}" have a named owner?
          5: Is "{story}" small enough to ship on its own?
        risk:
          pass: no
          6: Does "{story}" need data {part} doesn't own?
          7: Does "{story}" depend on another part's release order?
          8: Could "{story}" fail silently in production?
        fit:
          pass: yes
          9: Does "{story}" match how {part} is meant to be used?
          10: Would "{story}" survive {part} being replaced later?
          11: Is "{story}" covered by an existing test today?
      decisions:
        risk-level:
          pass: [none, low]
          12:
            scale: How risky is "{story}"?
            levels: [none, low, medium, high, critical]
        route:
          pass: [build-now]
          13:
            choice: What should happen to "{story}" next?
            options: [build-now, rework, redesign]
mdl:
  why: validate
  area: api
```

**The expansion:**

- 3 parts plus 5 stories make 8 items.
- `part`'s 2 written questions become 4 asked. It is thin, because it is not the finest layer.
- `story`'s 13 become 39.
- The run takes 2 calls, one per layer.

```yaml
mak:
  id: MM3-0070
  gate: fail
  goal: {gate: pass, p: 0.74}
  failing:                         # an item fails if it or any child fails
    payments:                  {boundaries: fail, 2: 0.18}
    payments/refunds:          {done: fail, risk: fail, 3: 0.22, 6: 0.91}
    payments/partial capture:  {risk: unsure, 6: 0.48}
  passing: [gateway, gateway/guest checkout, gateway/saved cards, payments/retries, ledger]
mdl: {recorded: [why, area]}
next: mm3 template drill --parent MM3-0070 --from payments/refunds
notes: ["2 calls · 43 questions · budget: $4.96 left of $5.00 · 495 of 500 runs left"]
```

### Reading the response

- **Order:** `failing:` and `passing:` show items in the order the request was written (tree order). Scan's order is worst first, so this is different. [C-082]
- **`passing:`** is a list of item ids, not a count. [C-082]
- **A failing item:** an item fails if it or any of its children fails. [C-083]
- **Top-level `categories`:** like scan, a loop run's own top-level `categories` stays empty. [C-084]
- **Where the detail lives:** the full per-item grading is kept in the ledger, on that run. It shows which layer structures and questions turned up trouble. [C-084]
- **Not yet mined:** there is no dedicated query yet that mines this into a pattern across runs, the way class's per-category history does. [C-084]

### Budget

- **Reuse:** a fully reused loop is never blocked by an already-reached budget cap (see the dry-run and reuse rules above). [C-151]

---
## report

`mm3 report [hits|patterns|history|web|graph|problems|mdl|calls|fields]` is the one way knowledge leaves the ledger, besides a run's own response.

### What it is

- **Free and read-only:** it never calls a provider. [C-162]
- **Never writes to the ledger:** the one exception is `fields`'s own `--accept`, which writes only `.mm3/config.yaml`, never the ledger. [C-162]
- **Options:** it takes none beyond the view name (default `hits`) and `fields`'s own `--accept <field>`. [C-162]
- **Not a seventh verb:** it sits outside the Know/Judge/Prove grid. It reads across every place at once, rather than proving one thing. [C-162]
- **No index needed:** it works unchanged with no on-disk index present. It uses the same linear-fallback engine that `view` already falls back to. [C-162]

### Views that read the ledger

**`mm3 report hits`** (or no argument)

- Shows the newest run's own gate per place x category. [C-163]
- Worst gate first: `fail`, then `unsure`, then `pass`. Each row names the run it came from. [C-163]
- **`stale`:** a one-subject run's row is marked `stale` once the code at that place has changed since. [C-163]
- It is re-derived live, from the run's own recorded evidence key, on the bounded set of rows actually shown. It is never a full-ledger scan. [C-163]
- **Sweep rows:** a sweep item's row is never marked stale, because its evidence isn't reconstructed here. [C-163]

**`mm3 report patterns`**

- Groups every run by its own question-set fingerprint. The fingerprint is the categories' or layers' names, `pass`/`need` and question text. It never includes the evidence. [C-164]
- For each set it shows how often it has run, its pass/fail/unsure split, how many distinct places it has touched, and its outcomes so far. [C-164]

**`mm3 report history`**

- Merges two things, newest first. [C-165]
- **Replay results:** every `replay` run's own result against its parent, named `fixed` or `regressed`. [C-165]
- **Priority:** it is the same priority `replay`'s own gate uses. Any regression wins over any fix. A replay that moved nothing gets no row. [C-165]
- **Outcomes:** every recorded outcome. [C-165]
- **No new writes:** neither is a new ledger write. Both are derived on the read side, from records the commands already wrote. [C-165]

### Limits and errors

- **Row cap:** every view caps its rows. [C-166]
- It says plainly how many more exist (`… N more not shown`), rather than dropping them silently. This is the same idiom `view` already uses. [C-166]
- `report` takes no option to raise the cap. [C-166]
- **Unknown view:** an unrecognized view name is a clean stop. It names the four real ones. [C-167]

### The web viewer

**`mm3 report web`**

- Writes one self-contained, read-only viewer, `.mm3/viewer.html`. [C-204]
- **Consensus:** it holds the ledger's own place x concern consensus. [C-204]
  - STRONG when independent runs agree on a gate. [C-204]
  - CONFLICT when they don't. [C-204]
  - SINGLE for one run alone. [C-204]
  - A CONFLICT also gets a same-checklist flag, since a reused category name can carry a different question set across runs. [C-204]
- **Heat map:** it holds a files x concerns heat map. [C-204]
- **Session summary:** runs, paid calls, spend, distinct actors, the date range, fixes that held, regressions, the latest findings, and outcomes. [C-204]
- **Safe data:** every value reaches the page as JSON inside a `<script type="application/json">` block. It is escaped against `<`, `>`, `&`, U+2028 and U+2029. [C-204]
- **Safe writes:** every piece of that data is written to the page with `textContent`, `className` or `title`, never `innerHTML`. So a question or a goal containing `</script>` can't break out of it. [C-204]
- **No provider, no ledger writes:** it never calls a provider. It never writes to the ledger itself. It reads the whole log directly, never the id index. [C-204]
- **Opening it:** it tries to open the file in the user's browser, using `xdg-open`, `open` or `cmd /c start`, depending on the OS. It always prints the file's path, whether or not that succeeds. [C-204]

### Views from the graph tier

**`mm3 report graph <kind>:<label>`**

- Shows a small neighborhood (depth 2) around one graph-tier node. [C-219]
- Nodes and edges are shown as `kind:label --predicate--> kind:label` lines. [C-219]
- **No target:** it names how to give one (`mm3 report graph <kind>:<label>`, e.g. `category:injection`). It does not dump the whole graph. [C-219]
- **Unknown target:** a plain "not found", never an empty crash. [C-219]
- **Edge direction:** each edge line's predicate carries the run-to-category and category-to-place relationship the right way round. [C-224]
  - `run --checks--> category` means the run checked this category. [C-224]
  - `category --judged <gate> (p <score>)--> place` is that category's own verdict on that place. pass, fail and unsure are scored 1, 0 and 0.5. [C-224]
- **Provenance:** every edge shows its own provenance (`extracted`, `declared` or `inferred`) and the run or runs that witnessed it. [C-224]
- **Folding:** the same (subject, predicate, object, score) witnessed by more than one run folds into one line. It gets a `×N` count and the run list. Once there are more than a few runs, it gets a sorted first..last range instead. It is never one line per witnessing run. [C-224]

**`mm3 report problems`**

- Ranks every family x place pair by gate counts, worst first: fail, then unsure, then pass. [C-220]
- It is the ranked, agent-facing knowledge pull that an agent can act on directly. [C-220]
- It is capped and counted like every other view. [C-220]

**`mm3 report mdl`**

- Lists every run's own mdl fields (why/area/stage/change/risk/blast/problem), newest first. [C-221]

**`mm3 report calls`**

- Rolls up telemetry by day, verb, model and source: calls, tokens, cost, and the amount saved by reuse. [C-222]
- **Window:** its own default is the last 30 days, unless the graph tier is asked otherwise. [C-222]
- **Old ledgers:** a run with no recorded `telemetry` at all (a pre-plan-2c-B2 ledger line) still shows up. [C-222]
- It is taken from its own aggregate `calls`/`costUsd`/`adapter`/`model`, and marked `(none)` in place of a real source. [C-222]
- An old ledger's calls and cost are never silently dropped from this view. [C-222]

**Refresh and errors for `graph`, `problems`, `mdl` and `calls`**

- All four refresh the graph tier (ledger/graph.ts) before reading. Readers refresh. The paid path never does. [C-222]
- When the graph tier needs `node:sqlite` and it isn't available, they report a plain message naming `mm3 doctor`. They never show a stack trace. [C-222]

**`mm3 report fields`**

- Lists every `mdl.extras` key that no run's project has declared yet. That means it is not a base mdl field, and not already in `config.mdl`. [C-223]
- For each key it shows its sample values and a suggested type. [C-223]
  - `closed`: at most 8 distinct values across at least 5 runs. [C-223]
  - `pattern`: every value matches one fixed regex shape. [C-223]
  - `reference`: every value looks like a where/route path. [C-223]
  - "no suggestion yet": none of those fit. [C-223]
- **`--accept <field>`** re-runs the same discovery. [C-223]
- When that field has a suggestion, it writes it into `.mm3/config.yaml`'s `mdl:` block. It prints exactly what it wrote. [C-223]
- **Clean stops:** naming a field that isn't undeclared is a clean stop. So is naming one with no suggestion yet. It is never a silent no-op. [C-223]

### How the graph views read the index

- **Direct reads:** `graph`, `problems`, `mdl`, `calls` and `fields` read the hot tier's own on-disk tables (`runs`/`categories`/`places`, ledger/index.ts) directly. [C-225]
- **Not `IndexHandle`:** they do not go through the reuse-safe `IndexHandle` abstraction that `hits`, `patterns` and `history` use. [C-225]
- **Catch-up first:** each one first forces that tier to catch up or rebuild on disk. It is the same self-heal a paid write already gets, triggered from a read. Then it either reads the tier directly or refreshes the graph tier on top of it. [C-225]
- **Never wrong:** a missing `index.db`, or one that lags the ledger by any number of runs, is never a wrong or incomplete answer for any of these five views. At worst it costs one extra catch-up. [C-225]

---
## help and template

### `mm3 help`: what it prints

`mm3 help` is free and needs no project.

- **The card:** it prints a one-screen contract card. The card has the six verbs, the rules that cause most first-try rejects, and how to read a verdict. [C-113]
- **`mm3 help <verb>`:** `<verb>` is one of view, class, replay, scan, drill or loop. It prints that verb's purpose, when to use it, one annotated example, and its own sharp rules. [C-114]
- **`mm3 help <topic>`:** a topic is one of `authoring`, `verdict`, `mdl`, `reuse` or `probe`. Topics hold cross-cutting rules that don't belong to one verb. [C-116]
- **An unknown target:** an unknown `help` target is a clean stop. It names every real verb and topic. [C-118]

### The front door for agents

- **First line of `mm3 help <verb>`:** `Agents: mm3 agent <verb>`. It comes ahead of the verb's own `## <verb>` heading. [C-191]
- **Why:** this was the top finding of round-4 smoke testing. A cold CLI agent made zero `mm3` calls at all, because it never discovered that `mm3 agent` exists. [C-191]
- **The bare CLI usage text** carries the same front door. That is `mm3 --help`, a bare `mm3`, and `mm3 <command> --help`. [C-191]
- **What the front door says:** `help/card.ts` exports `agentFrontDoorLines()`. It returns these lines, in order. [C-191]
  - `Agents: run "mm3 agent" first`.
  - The existing `new here? → mm3 init` hint for a human.
  - This tool's own one-line pitch. It is `card()`'s own opening wording, factored out rather than retyped a second time.
  - One purpose bullet per verb. It comes from the same shared `VERB_LINE` text that `agent`'s overview and `help`'s own card already render.
- **No third copy:** `cli.ts` splices these lines ahead of its usage block. It does not hand-type a third copy. [C-191]

### The sharp rules `help` carries per verb

- **`drill`:** follow `next:` rather than hand-authoring parent or from. [C-115]
- **`replay`:** the files must be committed at the ref it names. [C-115]
- **`scan`:** a `scale` question ranks findings by severity, worst first. Scan by file when the file is the unit that matters. [C-115]
- **`loop`:** a sub-layer is a sibling key under `over:`. Names are at most 20 characters with no `/`. Every question under a layer is asked of every item at that layer. [C-115]

### Topics in detail

**`mm3 help mdl`** lists every catalog field. The fields are `why`, `area`, `stage`, `change`, `risk`, `problem`, `uses`, `touches` and `blast`. [C-117]

- For each field it gives the closed values, where it has any, and what the field is for. [C-117]
- It notes that every closed field also accepts `unknown`. [C-117]
- It notes that any other lower-kebab key, at most 20 characters, is recorded as-is. [C-117]
- It points at `mm3 agent mdl` for this project's exact allowed values and the full C4 legend. [C-117]

**`mm3 help probe`** is its own recognized topic. A valid probe is the shape of a well-formed MM3 question. [C-180]

- **Its rules:** [C-180]
  - One narrow judgment per question.
  - Self-contained wording. A question's number is a label for the response only.
  - Answerable from `where:`. Name the file in backticks when there is more than one.
  - One polarity per category.
  - Concrete scale levels.
  - A "none fits" choice option.
  - The goal phrased as the safe state, not as the vulnerability.
  - The visible-scope probe ("Can this be answered from the code shown?") as a recommended extra question.
- **Citations:** each rule is cited to its own TypeSafe documentation page. [C-180]
- **Not enforcement:** this is guidance labelled as best practice for a higher-quality answer. It is not new validator enforcement. Nothing here is checked by the schema or the cross-validator. [C-180]
- **`mm3 agent probe`:** it renders the same 8 rules bare, with no citations and no prose. [C-181]
- **One shared list:** `agent probe` and `help probe` render from the same list, so the two views can't drift apart. [C-181]
- **The pointer:** `mm3 agent` with no verb points explicitly at `mm3 agent probe`. [C-181]

**The 160-character cap** applies to a single question line or the goal line. [C-194]

- **Named constant:** it was a bare literal inside `schema-check.ts`'s `lineProblem`. It is now the named, exported constant `MAX_QUESTION_CHARS`. [C-194]
- **Where it is documented:** it is a shared `rules.ts` entry. It reaches these places. [C-194]
  - `mm3 help`'s one-screen card.
  - `help authoring`.
  - Every verb that accepts `ask:`: `class`, `scan`, `drill`, `loop` and `view`. They are checked against the schema envelope. `replay` never accepts `ask:` at all.
  - Both `help probe` and `agent probe`.
- **Why:** this closes a round-4 finding. A cold agent hit `✖ question 1: is longer than 160 characters` with zero prior warning in `agent view` or `agent probe`. [C-194]
- **Where it lives:** the cap is MM3's own hard validator rule. It is not TypeSafe's own published guidance. So it lives in `RULES` and `ruleLines`, not in `PROBE_RULES`. The cited-guidance contract of `PROBE_RULES` is unchanged. `probe()` and `probeCard()` simply splice `ruleLines('probe')` in alongside it. [C-194]

**`mm3 help outcome` and `mm3 help budget`** are recognized targets, the same way `mm3 help report` already was. [C-182]

- **Not `mak:` verbs:** neither takes `ask:` and neither calls the classifier. [C-182]
- **What each has:** its own purpose, example, sharp rules and a good/bad pair. The pair is grounded in a real stop. For `outcome` that is its self-held restriction and its lack of a `--note` flag. For `budget` it is a bare `set` with no flags. [C-182]
- **The agent cards:** `mm3 agent outcome`, `mm3 agent budget` and `mm3 agent report` are the same three targets' bare terse cards. They have no citations and no headings. They are hand-written and don't share a data structure with `help`'s prose, because an agent card is why-only and there is no rule prose to reuse. [C-182]
- **Before this:** `outcome` appeared in neither `help` nor `agent` at all. [C-182]
- **An unknown target:** an unknown `help` or `agent` target now names all three extras (`report`, `outcome`, `budget`) alongside every verb and topic. [C-182]

**`mm3 help report`** is its own recognized target. [C-161]

- It is not one of the six verbs, because `report` is outside the 2x3 Know/Judge/Prove grid. It is not a cross-cutting topic either. [C-161]
- It has a purpose, an example and its own sharp rules. That is the same shape as `help <verb>`. [C-161]

**`agent verdict` and `help verdict`** render the same response-vocabulary facts from one shared list, `rules.ts`'s `VERDICT_FACTS`. [C-196]

- `agent verdict` is a new card, with `tool: verdict`. `help verdict` was refactored to use the shared list. [C-196]
- **The facts in the list:** [C-196]
  - `need:`'s all, most or any bar.
  - The goal-and-every-category gate rule.
  - `consensus` (STRONG, SPLIT, WEAK) and which verbs compute it.
  - `escalate`'s triggers.
  - What it means when a probability near 0.50 lands in `unsure`.
  - `replay`'s per-category fixed, still or regressed grade.
  - What `reused: [MM3-####]` means.
  - `mm3 report hits`'s `stale` flag.
  - The three exit codes.
- **Shape:** `help verdict` keeps its own prose framing around the list. `agent verdict` renders the list bare. That matches every other agent card's why-only shape and key order. [C-196]
- **Overview pointer:** `agent`'s overview gains a third `run:` line, `mm3 agent verdict — before reading a response: how to read it`. It sits alongside its existing pointers at `<verb|tool>` and `probe`. [C-196]
- **Why:** this closes a round-4 finding. Response-side vocabulary was documented only in `help report`'s own prose, and only after a response had already used it once. [C-196]

**Good / bad sections**

- **`mm3 help class`, `mm3 help scan` and `mm3 help authoring`:** each carries a "Good / bad" section. It shows a bad snippet, a good snippet and one line of why. It covers the patterns that cause a first-try reject in practice. [C-172]
  - A whole file in `where:` instead of a range.
  - A question about code that isn't in `where:`.
  - Several `where:` entries with no file named in the question.
  - `scan` asking `{function}` about something outside it.
- **`mm3 help view`, `mm3 agent view`, `mm3 help loop` and `mm3 agent loop`:** each carries its own "Good / bad" section too. Before this, neither verb had one. [C-183]
  - `view` without `where:` has nothing to check reuse against. It rejects outright at the schema and cross validator.
  - `view` with `over:` present is rejected the same way, because it checks one subject, never a sweep.
  - `loop` with a code-glob `over.file` layer is rejected the same way. Loop sweeps written ideas, not files on disk. That is `scan`'s job.
- **The oversized-file pair:** its terse `why`, shown in `agent class`, reads "Big whole files refused — name the range". This matches the real behavior since e6b7d78. It is a stop, not a silent cut. [C-184]

**`help` and the validator stay in step.** Every fact the validator enforces that `help` also states is built from the same constants the schema check and the validator use. Those facts are the depth counts, the `where` limit, the pass bar and the `mdl` catalog lists. A test asserts each one appears verbatim in the `help` output it names. So the validator and `help` can't quietly drift apart. [C-119]

### `mm3 template`

`mm3 template` only prints. It never validates and never spends.

**`mm3 template <verb> --from <request.yaml>`**, with no `--parent`, names a request YAML file. It does not name a drill item or category. [C-111]

- Its `ask:` and `over:` (the frozen question set) are printed back unchanged. [C-111]
- `--where` and `--goal` overlay a new subject on top of it. [C-111]
- Neither the file's shape nor its content is validated. Template only prints, like every other path. [C-111]
- **Refused:** `--where` and `--goal` are refused unless paired with `--from`. They are also refused together with `--parent`. They overlay a checklist read from a file. They are not a drill item or category lookup. [C-112]

**`mm3 template <verb> --from MM3-####`** prints that run's own request straight from the ledger. [C-201]

- **Cost:** it is free, read-only and spends nothing. It has the same discipline as every other `template` path. It only prints, and nothing here is validated. [C-201]
- **Order of checks:** the `MM3-####` shape is checked before the file-path branch. That is unambiguous. A typo'd id would otherwise show a confusing "file not found" instead of "not in the ledger". [C-201]
- **Clean stops:** each of these names the problem and does not crash. [C-201]
  - An id that is not in the ledger.
  - An id that predates the YAML contract, which is a Plan 1 run with no `v: 2`.
  - No project reachable. A run-id lookup has nothing to search.
- **Overlay:** `--where` and `--goal` overlay on top of a ledger-fetched request the same way they already do for a file-based `--from`. [C-201]

**`--from MM3-####` for a `replay` run** is the one case that is not a direct copy. The rebuild is faithful to the run's own request for every other verb. [C-202]

- **What is stored:** a `replay` run's stored record also carries its parent's `where` and `ask.categories`. They are kept there only so it can grade before and after answers against the same categories. They are not there because the original replay request carried them. [C-202]
- **What `replay` forbids:** `replay`'s own `NEVER` list forbids `ask`, `over`, `from`, `where` and `depth` outright. [C-202]
- **What is reprinted:** `--from MM3-####` on a replay run reprints only `goal`, `parent` and `compare`, plus `verb`. It never reprints the borrowed `where` or `ask`. So the printed request stays a schema-valid `replay` request. [C-202]
- **Every other verb:** `class`, `scan`, `loop` and `drill` store exactly their own request's fields on their own run. The rebuild for those is a direct, unqualified copy. [C-202]

### The six verb templates

The templates are `skills/mm3/templates/{view,class,replay,scan,drill,loop}.yaml`.

- **Every field shown:** each template shows every `mak.*` field that verb's own schema and cross-validator allow it to carry. [C-174] [C-175]
  - Required fields have a live value.
  - Optional fields are either live or a commented-out example.
  - Each field is marked `# required` or `# optional` in a trailing comment.
- **The `mdl:` block:** it names every catalog key. The keys are `why`, `area`, `stage`, `change`, `risk`, `parent`, `problem`, `uses`, `touches` and `blast`. [C-174] [C-175]
- **Checked against the validator:** a test checks every template against the same rule the validator itself enforces. So template and schema can't quietly drift apart. [C-174] [C-175]
- **Shown once:** the category-level schema fields that don't vary by verb are demonstrated once, in `class.yaml`, rather than repeated in all six. Those fields are `need:` and `tags:`, alongside `pass:` and the three question kinds (yes/no, `scale`, `choice`). [C-174] [C-175]
- **The visible-scope probe:** `class.yaml` and `scan.yaml` show it ("Can this be answered from the code shown?") as a commented-out, optional recommended addition. That matches the templates' existing optional-field comment style. [C-185]
## agent

`mm3 agent [verb]` is `help`'s terse, agent-facing twin. It is free, needs no project, and never spends or writes. [C-173]

### What `mm3 agent` prints

- **For a verb:** the enforced rules for that verb. They are the same list `help <verb>` states. Then its "Good / bad" pairs. The text is why-only, in at most 8 words, with no prose and no headings beyond a bare label. [C-173]
- **With no verb:** the verb list, the universal rules, and a pointer to `mm3 agent probe`. [C-173]
- **Beyond the six verbs:** `agent` also recognizes `probe`, `outcome`, `budget` and `report`. Those are the same non-verb targets `help` recognizes. It also recognizes `template`, which `help` does not. Each is its own bare card, free and read-only. [C-173]
- **Where stops point:** every request-validation stop's pointer (`→ see: mm3 agent <verb>`, C-153) names `agent`, not `help`. A stop is read by the agent that sent the request. [C-173]

### The card shape

- **One fixed key order:** every card `agent` prints is assembled in this order. That covers the overview and each verb or tool. [C-187]
  - The identifier line or lines come first. `verb:` or `verbs:` for a verb. `tool:` or `tools:` for everything else, including `probe`.
  - Then `rules:`.
  - Then `patterns:`, only when that target has any.
  - Then `run:`, only when it points further.
- **One identifier style:** a non-verb card's identifier line now reads `tool: <name>`, not the former `target: <name>`. So it matches a verb card's own `verb: <name>` line for line. [C-187]
- **`mm3 agent template`:** a new bare card, the same shape as `outcome`, `budget` and `report`. [C-187]
- **The `tools:` section:** `mm3 agent` with no target also prints it, right after the verb list. It lists the other real commands a cold agent needs before writing a request. Setup-only commands (`init`, `uninstall`, `mcp`, `doctor`) are deliberately left off. [C-187]

**`mm3 agent mdl`** is the mdl catalog's own legend card. It has these parts.

- Every field, with its closed values and the always-legal `unknown`.
- The note that any other lower-kebab key is recorded as-is.
- The C4 model's five levels (person, system, container, component, code), each nested inside the one above.
- How to write a chain flat. Use `parent/child` for containment, ` -> ` for uses, and a trailing `?` for something guessed or not built yet.
- The chain grammar itself.
- One worked example.

It has its own shape and its own rule.

- **The one exception:** unlike every other `agent` card, it isn't shaped identifier, `rules:`, `patterns:`, `run:`. The field table and the architecture teaching don't fit that mold. So it is the one deliberate exception to `agent`'s otherwise-fixed card shape (C-187).
- **Can't disagree with the validator:** it is generated from the same built-in field table the schema check and cross-validator check against. So it can't state a value the request validator would then reject.

### Rules in the overview and in each card

**`where:` resolves against the project, not the session.** `mm3 agent`'s overview states this rule beyond the shared `RULES` list. [C-195]

- `where:` resolves against the MCP `project` argument or, in a terminal, the project folder (the nearest `.mm3` or `.git` above where `mm3` runs). A session cwd outside the project needs `project` (MCP) or `MM3_HOME` (CLI), set in the environment and never typed as a prefix on the command, so a plain `mm3 …` command stays one command. The rule names both surfaces. [C-195]
- **Why it is separate:** this is a runtime and environment fact, not a request-schema one. So it is hand-written once as `agent.ts`'s own constant. It is not forced into `rules.ts`, which is built only from `schema-check.ts` and `validate.ts` constants. [C-195]
- **Agent only:** it appears only in `agent`'s card, not `help`'s. An agent, not a human reading `help`, is the one that actually passes `project` or sets `MM3_HOME`. [C-195]
- **Why:** this was a round-4 finding. An agent had to fail once, with `✖ mak.where: cannot read "app/routes/contributions.js"`, to learn this the hard way. [C-195]

**Sharp rules in every verb card.** Every `agent <verb>` card's `rules:` list also carries that verb's own sharp-rule prose. [C-192] [C-193]

- **Source:** the prose is `help/verbs.ts`'s `SHARP`, the same bullets `help <verb>` already states. It is spliced in ahead of the shared `ruleLines(verb)` entries. [C-192] [C-193]
- **Why:** this closes a round-4 finding. `agent drill` and `agent replay` rendered an empty `rules:` section. Those are the two highest-stakes verbs, which isolate a finding and prove a fix. Neither `rules.ts`'s `RULES` nor `patterns.ts` had any entries tagged for either verb, even though `help drill` and `help replay` already had real prose. [C-192] [C-193]
- **All six verbs:** the splice applies to all six verbs, not just drill and replay. So a verb card can't fall back to empty again as sharp rules are added elsewhere. [C-192] [C-193]
- **New good/bad pairs:** `patterns.ts` also gained one good/bad pair each for `drill` and `replay`. [C-192] [C-193]
  - For `drill`: a bad request missing `from:`. It trips the cross-validator's NEEDS check.
  - For `replay`: a bad request that includes `ask:`. It trips the cross-validator's NEVER check, since `replay` only ever replays a parent run's own questions.
  - Both are genuinely catchable outright by the real cross-validator. They are not assumed.

**Release comparison.** The `mm3 agent` overview ties the release-comparison goal to `replay`. [C-230]

- **The `replay:` bullet** reads "re-check a run's questions across two git refs: after a fix, or what changed between releases or commits". [C-230]
- **A `rules:` line** says a question about what changed or drifted between releases or commits is answered by replaying a prior run with `compare: {before: <ref>, after: <ref>}`. With no prior run, run one `class` or `scan` at one ref first. It also says that `git diff` is not an mm3 check. [C-230]
- **The chain for an open goal** is given as one line. [C-230]
  - `view` (free reuse).
  - Then `scan` (find where).
  - Then `drill` (go deeper on a flagged item, following `next:`).
  - Then `loop` (check the design).
  - Then `replay` (after a change).

**Evidence discipline.** The universal rules also carry it. [C-231]

- Every number or claim an agent reports comes from an mm3 answer, cited by its id. Otherwise it is labelled the agent's own estimate. [C-231]
- A check done without mm3 (`git diff`, or reading code to answer a question) is a workaround. Say so. Never report it as "none". [C-231]
- The budget note is headroom, not a limit. Stop only at `⚠` or exit 3, then tell the owner. [C-231]

**Sending a request.** The universal rules also say how a request reaches MM3. [C-269]

- Start from `mm3 template <verb>`, save the request with the file-write tool, then run one plain `mm3 <verb> <file> --dry-run` and then `mm3 <verb> <file>`. Do not chain the write and the run into one shell command. [C-269]
- Through the MCP tool the YAML goes in `stdin`. [C-269]

### The no-target overview

`mm3 agent` with no target lists one atomic purpose line under each verb and tool, not just its name. [C-189]

**Guidance for agents:**

- The plugin carries one short guidance text (under 1,800 bytes, one `IMPORTANT` line, no build sequence): work top-down (`view`, then `scan` only when the location is unknown, then `drill` the flagged item, then `loop` to check a design; `class` for a known location), send a pilot before a batch, a sweep's `gate: fail` is normal, run `mm3 agent probe` before writing questions, get an MM3 verdict before a judgment call about code or a design (it costs a fraction of a cent and every run is recorded, so the next decision starts from evidence), cite run ids, and give helpers `mm3 agent delegate`. The MCP `initialize` reply sends it as `instructions`, so it reaches the lead agent only while the plugin is enabled. `mm3 init --agents` writes the same body behind "If the `mm3` tool is available…", and the `mm3` skill and the project guide carry it too (the skill within its first 100 lines). A test fails if any of them differs. [C-255]
- `mm3 agent delegate` prints a block to paste into every helper prompt: the same body, then to use only the `mm3` MCP tool (never the shell), never read `.mm3/log.jsonl`, report each run id with its gate and what was not run, and that the lead checks the ids against the ledger. `mm3 agent` points at it. [C-256]
- The shipped skills follow Anthropic's progressive-disclosure rules: every `SKILL.md` is under 500 lines, a markdown file over 100 lines opens with a `## Contents` list within its first 25 lines, reference files link to no other file (one level deep), and `mm3-probe` keeps its rules (what a probe is, the angles, what makes a good one, bad probes, decisions) in its first 100 lines, with the long material (`mdl`, the per-verb recipes, the per-family pairs) in files linked directly from it. A test fails otherwise. [C-257]
- Every text an agent reads (the MCP instructions, the AGENTS block, the skill files, every `mm3 agent` and `mm3 help` card, every template and the MCP tool definition) is pinned to a committed snapshot with one fingerprint. A change fails the golden test with a readable diff, and says whether a command, flag or number moved (likely substantive) or only the words (likely a refinement). `npm run guidance:accept` takes a change on purpose. [C-258]
- Each way an agent was seen to get a request wrong (no decisions, YAML that does not parse, no stdin, no `-`, an unknown command, the YAML under another field or `args` as a string over MCP) stops with one `✖ field: problem → fix` line, the same through the terminal and through MCP, and the corrected request is accepted on the next call. The exact stop texts are pinned in the same snapshot folder. [C-259]
- A YAML value that starts with a backtick or an `@` is told so and to be put in quotes, not given the generic "does not parse" stop, because the card says to name files in backticks and agents then wrote `goal: `file.ts` is safe`, which YAML cannot read. [C-272]
- A request with no `decisions:` section is told to copy that section from `mm3 template class` (2–5 categories, a scale and a choice), not only to "give 2–5". Read from the recorded decision paths: after the old text agents read the explanation cards and wrote decisions out of their own yes/no questions, and only the template had a working example. [C-270]
- The two lines an agent reads first no longer invite the two slips seen most in the decision paths. The `view` bullet says it needs a request (`mm3 view <request-file>`), because agents called a bare `view` first, hit the "missing arguments" stop and spent an attempt. The backtick advice says to keep a backtick inside the sentence and to quote a value that starts with one, because agents wrote `goal: `file.ts` is safe`, which YAML cannot read. [C-276]
- An eighth feature job, `F8-finds-mm3-unprompted`, asks a plain shipping question without naming MM3 and passes only when the agent still gets a recorded verdict and cites its run id, so a gap in what the plugin tells an agent at startup shows as a failure. It is proven passable by an ideal run, like the other feature jobs. [C-271]
- An agent in an agentic run has MM3 and nothing else. The run switches the logged-in account's claude.ai connectors (mail, drive, calendar, docs and the rest) off with `ENABLE_CLAUDEAI_MCP_SERVERS=false`, and a run whose server list shows anything besides the plugin under test is recorded as not a result, with the servers named. The scratch request folders an agent leaves in the temp folder (`mm3-req*`) are cleared before each trial, because a leftover file made the next agent's Write fail. Before this, a plugin run loaded those connectors some of the time and not others, so one trial's tools and startup instructions differed from the next. [C-273]
- Scoring counts an accepted `--dry-run` as free validation and not as an attempt: the request was fine, it only made no verdict. A rejected dry run still counts, so a promise of "a verdict within N requests" is not failed by an agent that checked its request first, as MM3's own cards advise. [C-274]
- A formal release is one number going up, `x.y.z`, on nightly and on main, with no date, commit or label (those belong to features); the release refuses a version with anything attached, on `release.json`, on npm's nightly tag and on `latest`, and names it. It is two commands, `npm run release -- nightly` and `npm run release -- main`, defined by `release.json` (version, title, the paths main keeps, the paths a ceremony tests; it holds no PR list). Each prints its pipeline first, every step marked done, will do, or not done yet and labelled with what it costs (free, or the ceremony's Claude subscription quota sized from the last run with $0 in TypeSafe, since the sample provider answers), plus one COST line before the prompt, with the command that does a missing one, asks once, runs only what is not done, and stops at the first problem. `nightly` takes everything merged since the last nightly release, finds every open, non-draft PR into nightly and merges the green ones itself, oldest first and only if their `package.json`, CHANGELOG heading and README badge name the release version, and publishes exactly that version to npm's `nightly` tag. npm takes a version once, so a version already on npm from another commit is a step that says to bump it, and there is no scheduled daily build, no GitHub Release and no tag for a nightly. It then reads the branch version, npm's nightly tag, the commit npm recorded for it and CI back, says "RELEASED to nightly" only when all hold, and the formal ceremony on that package is its last step. `main` refuses unless the ledger chain is intact, nightly holds that version and is green, trials ran on the current guidance, a formal ceremony on that version passed (or its id is accepted in `release.json`), the tested paths are unchanged since the ceremony, and the README and CHANGELOG have no link main would not have; it says "nothing new" and stops when main already holds that version on npm `latest` with its release. Otherwise it builds one commit from nightly holding only the "include" paths (the changelog heading becomes `## vX.Y.Z, <date>`), pushes `release/vX.Y.Z` and opens a PR into main for the owner to squash-merge; on the next run it promotes the same package to npm `latest` (`npm dist-tag add`), creates the one GitHub Release and tag `vX.Y.Z` on main's commit, reads npm, the tag and main back, and writes a `REL-####` receipt. Main holds no tests: only nightly runs CI. [C-277]
- When a ceremony ran on the build, every nightly run prints its decision as evidence under STATUS, built only from what the ledger holds: the score (gate jobs passing, trials passing, first-request rate against its target); for each blocking job, which checkpoints failed in how many trials, what each means, which held, whether it reads as an isolated check (the agents finished the task and one observation failed) or as agents not finishing, the engine's suggested fix and the command to read a trial; what changed since the last passing ceremony (Claude Code version, the text agents read, the definition of success, node); the impact (what breaks, what holds), the blast radius (blocking jobs of all gate jobs, with the non-gating model apart), what is accepted for now, and the two ways forward (re-run only those jobs with `--only … --carry`, or list the ceremony's id under `accept` in `release.json`). [C-278]
- A helper's run id counts as reported when the stream carries the helper's own report and cites it, or, when the stream gives only a short summary of a finished helper (Claude Code 2.1.292 and later), when the helper got a verdict and the lead's answer carries that id. A ceremony on 2.1.292 failed six correct delegation runs on the older rule alone. [C-279]
- Every recorded agent run keeps the agent's own words just before each call (its reason for the step), and the run report prints them under the call plus one `decision path` line (cards read, each stop and what it said, an accepted dry run, an edit, the verdict), so a failure can be read as the sequence of choices that led to it and not only as a miss. [C-275]
- Every agentic ceremony run is recorded in `test/agentic/ledger.jsonl`, append-only, free path or not: a `started` line is written before anything runs and carries the version, the commit, the guidance fingerprint, the environment (node, vitest, claude, OS), the tested artifact (the npm integrity hash and the plugin commit) and the definition of success in full (every prompt, model, route, checkpoint and rule, the Juice Shop pin, a plain-English summary and a hash that moves when any of it changes); a `finished` or `aborted` line closes it with every result, the model each agent actually used and a digest of each transcript, and a started line with no closing line shows as incomplete. A run counts toward the release gate (formal) only when the checkout is the clean commit the version was built from and the full trial count was used; any other run is recorded with the reason it does not count. Each level 3 row also records where the tokens went by kind of call (MM3, shell, files, delegation: the calls, about how many tokens the agent wrote and about how many came back into its context), the run's token totals and model turns, and `npm run agentic:trace` prints any transcript call by call, so a comparison can say whether a change added or saved tokens. [C-262] `npm run agentic:release-report` reads a recorded run back, plain words first: the question being tested and what is not covered, each job by its title with its story, what success means, how it went and why it matters, then what the result means for the release; after that the data: the free checks, the context test, a criteria matrix per job (one letter per criterion, a legend above it, a tick or a cross per trial) and, per trial, its attempts, tokens in and out, MM3 calls and a context path (bars of the context the lead carried at each turn); with `--row` it tells one trial call by call, from the tokens the model started with, marking every MM3 call as a sample-provider call (no live call, no spend), and it trusts a transcript only when its digest matches the ledger's. [C-263] Each run is checked for completeness (the definition, the environment, the tested artifact, the guidance coverage, and for every level 3 trial its tokens, tokens by kind of call, the model it used and its transcript digest); the agentic release report prints the result as its record check, and `check:agentic` fails when the newest formal run's record is incomplete. The agentic release report ends with a decision: SHIP, SHIP WITH EXCEPTIONS or DO NOT SHIP, with the reasons in plain words and a targeted fix for each problem. Only the gate model's misses of blocking criteria block a release; a first-request rate under the target, an agent leaving MM3 after a stop (measured from the calls: after each stop, whether the next call was MM3, or an edit to the request file followed by MM3, and whether the next MM3 request got a verdict) and a smaller model's misses are recorded as improvements and accepted as exceptions or patterns, never as blockers; a run that is not formal gives its decision for the record only. Every improvement carries one or two tags from a fixed vocabulary of at most 25 themes (where a fix would land: the guidance, an error message, the tool, a model tier, the test harness, and an `other` valve), used only to group improvements across runs and never to decide anything. [C-265] Every improvement is written into the ledger whether or not it is accepted, and `npm run agentic:patterns` counts them across runs so a pattern that repeats shows. [C-264] Besides the three jobs that show an agent can use MM3 at all, the scenario file has seven jobs for the features new since the last release (changing a setting and seeing it recorded, hitting the spend cap and carrying on, checking that an install is healthy, setting a project up for agents, recovering when the request goes in a field the tool ignores, passing the guidance to a helper, and asking the terminal and the plugin the same thing), each with the state it starts from written down and each checked from the files the agent left and the ledger, never from a verdict's content; an ideal command sequence run through the built CLI passes every checkpoint of every one of them, so no job is impossible. A job cannot force an agent to make a mistake, so the wrong-field job does not wait for one: it starts the agent at the real stop (the prompt quotes the plugin's reply to the YAML sent under `request`, and a test fails if that quote differs by a character from what the real plugin bundle returns) and judges whether the agent's very first MM3 call put the request in `stdin` and was accepted, so it tests whether the stop text is enough to fix the call in one go, not whether agents make the mistake unprompted. [C-266] `npm run agentic:feature -- <job>` runs a trial: the development check of one job, on a local build of the working tree (a packed copy for the CLI route, the tree itself as the plugin), with the model and trial count the developer chooses. It is recorded in the same ledger as a `TRL-####` run, with the definition of success written first and the same release report to read it back, and it is never formal and never counts toward the release gate. It is free by default (the sample provider, no key, no TypeSafe spend); `--paid` uses the live classifier only with an explicit dollar cap given as `--approve-usd`, MM3's own budget holds that cap in every trial project, the real spend is read back from the project ledger, and the run stops when the approved amount is spent. A paid trial is forced onto the live provider, so with no key MM3 stops instead of answering from the sample provider; the providers that answered are recorded for every run, and a run whose record contradicts itself (paid but answered by the sample provider, or free but answered by the live classifier) is INVALID: not a pass and not a fail, with nothing learned from it. A recorded run can be disqualified afterwards by an appended line giving the reason; it then never feeds the release gate and reports as INVALID. [C-267] `npm run ceremony -- --version <v> --only <jobId,jobId> --carry CER-#### [--note "<text>"]` re-runs just the named jobs (the free checks still run in full) and copies every other job's level 3 rows, and the context test, from that earlier run, each carried row tagged `carriedFrom`, with the carry (source, carried jobs, re-run jobs, note) written into the started line; the release gate and the report read a carried run like any other, and the report says in one line which jobs were carried from which run. A carry is refused with one line saying what to change, before anything is recorded or run, unless the source run is formal, finished and not disqualified, every carried job passed there, the guidance fingerprint, the rules, the fixture pin and each carried job's definition are unchanged, and only `scripts/`, `test/`, `docs/`, `.github/`, `CHANGELOG.md`, `BACKLOG.md` and `AGENTS.md` changed between the source run's commit and this one; `--only` without `--carry` runs the named jobs and is recorded as not formal. [C-267] Each line carries the hash of the line before it, so an edited or removed line is caught (`check:agentic` fails on a broken chain), and `npm run agentic:compare` says in words what changed between two runs: the code, the guidance, the definition of success and the results. `npm run check:agentic` fails when no formal run is recorded, when the newest one did not pass, or when the guidance fingerprint or the definition of success it ran under is no longer today's. [C-260]
- The agentic stage states its success before any run: the scenario file opens with the question being asked and what is not covered, in plain words; every scenario in `test/agentic/scenarios/baseline.json` has a title a person would use, its story, what success means, what a failure means for a release, and its checkpoints; each observable from the transcript and the ledger and none needing a key (the sample provider answers with canned verdicts, so no checkpoint grades whether a verdict is right). A run passes only when every checkpoint does, a failed checkpoint names where to look, and `npm run agentic:sheet` prints the same goal, prompt and checkpoints as a sheet for a person to run. The gate model must pass at least the configured number of its trials of every scenario on every route; the floor model is reported and never gates. [C-261]

- **The shape:** it is `verbs (pick by goal):` followed by one bullet per verb. A bullet looks like `- view: free; what's already known for a request you wrote (mm3 view <request-file>), before any paid call`. Then a `tools:` section shaped the same way. [C-189]
- **Why:** an agent holding a goal ("is this handler safe to merge?") rather than a verb name can map straight to the right one. [C-189]
- **The closing `run:` lines** say what each next step is for, not just its name. [C-189]
  - `mm3 agent <verb|tool> — before writing that request`.
  - `mm3 agent probe — before writing questions: how to phrase one`.
- **No second copy:** the purpose lines are never a hand-typed copy. The verbs' come from `help/verbs.ts`'s `VERB_LINE`. The four tools' come from `help/report.ts`'s `TOOL_LINE`. [C-189]
- **Shared with `help`:** `mm3 help`'s own one-screen card (`help/card.ts`) renders the same constants. That is its "Pick your verb" bullets and its "## Tools" section. So `help` and `agent` can't state a different purpose for the same command. [C-189]
- **Pass-bar rule:** the card's `rules:` section dropped the `P(yes)` notation from the pass-bar rule. It now reads `pass: yes clears at >= 0.70; pass: no clears at <= 0.30; in between is unsure`. The bars are 0.70 for `pass: yes` and 0.30 for `pass: no`. The same simplification applies to both `help` and `agent`, since it is one shared rule in `rules.ts`. [C-189]

### Where agents are sent first

The Claude Code skill's own "Run this first" guidance sends a cold agent to `mm3 agent`, with no verb, first. [C-188]

- **Where it lives:** it is in `skills/mm3/SKILL.md`. It is carried verbatim into `AGENTS.md`'s "Using MM3" section. Gemini CLI reads that too, via `.gemini/settings.json`. [C-188]
- **What `mm3 agent` names:** every command, including `report`, `outcome`, `budget` and `template`, in one card. [C-188]
- **The order:** first `mm3 agent`. Then `mm3 agent <command>` on whichever command it is about to use. Both come ahead of writing any request. [C-188]

---
## Setup, keys and the MCP tool

### Request basics

- `mak.verb` is optional. The tool name wins, and a mismatch is sent back. [C-085]
- `depth` counts `concerns:` categories only, exactly 3k of them (k from the project's tier for that verb; 1, 2, 3 by default). [C-086]
- `decisions:` questions never count toward `depth`. [C-086]
- Nested items use `- name: <item>` plus child layers beside it. This is what agents write naturally. [C-087]
- Different items may have different child layers. [C-087]

### What the ledger records

**On every run:**

- Each category's `section`, `family` and `familySource`.
- The git sha the run was at. It is `commit`, or `null` if it can't be found.
- `where`. A sweep takes it from its items' code paths.

**Which repo the sha comes from:**

- The repo that holds the run's own `where` files. That may not be the MM3 project root.
- If a verb records no `where` (a sweep like `loop`), it falls back to the root's repo.

**What `replay` adds:**

- `expect`, the agent's own prediction. It is an array, or `"none"`.
- `commits: {before, after}`, the resolved shas of the two refs.
- On a replay, `commit` is the `after` sha. A replay compares two states, not one.

**Reuse is untouched:**

- None of these fields change an answer key or a pattern fingerprint. [C-213]
- The same question on the same evidence still reuses for free. It does not matter which family tag or sha it was asked under. [C-213]

**`view` checks are logged too:**

- A `view` request-mode check is the free draft-against-the-ledger lookup shown above.
- It is a free record. It takes no run number and doesn't count toward the budget.

### Version and help flags

**`mm3 --version` and `mm3 -v`:**

- They print the installed package's version on one line and exit 0. [C-178]
- They are free, need no project and have no Node-version gate. The bare `--help` and `-h` have the same standing. [C-178]
- The Claude Code plugin pins no version, because Claude versions it by commit. So the plugin copy adds the commit it was installed from: `0.1.0 (plugin 2fbbc04a9a65)`. [C-178]

**`mm3 <command> --help` and `mm3 <command> -h`:**

- They work for every command and exit 0. [C-179]
- They never reach that command's own flag parser. Before, every command except the bare top level stopped on an unknown flag. For example, `mm3 doctor --help` used to fail. [C-179]
- For the six verbs, they print that verb's usage line plus `→ see: mm3 help <verb> · mm3 agent <verb>`. [C-179]
- Every other command prints just its usage line. None of them has a deeper per-command help page today. [C-179]
- They are free even on too old a Node, the same as the bare `--help` and `-h`. [C-179]

### Dry runs

**`--dry-run`** works on class, replay, scan, drill and loop.

- It reports the calls and the question count with no call and no spend. It prints `plan: {calls, questions, ...}` followed by `notes: ["dry run: no call, no spend"]`. [C-088]

**It resolves reuse first and predicts it:**

- `calls` and `questions` count only what would still need asking. [C-131]
- `plan.reused` is how many of the request's questions would come from the ledger for free. For a sweep it counts items instead of questions. [C-131]
- It is the same prediction every verb's real run would make. [C-131]

**Notes:**

- `dryRunText`'s notes always start with `"dry run: no call, no spend"`. [C-134]
- A verb may append further notes after it. It may never put one before it or in place of it. [C-134]
- Example: the request would still need to call the classifier and the cap is already reached. The notes then add `"would be blocked: the budget cap is already reached"`. The dry run itself does not fail and spends nothing. [C-134]

**Authoring warnings:**

- The notes also carry up to 3 `probe:`-prefixed warnings for mechanically checkable authoring issues in the request's own `ask:` questions. [C-198]
- They are never a new stop and never a new validator rule. [C-198]
- **Two questions in one:** a question with two `?` in one line, or with the literal `" and "` between clauses. [C-198]
- **A path not in `where:`:** a backticked file path named in a question that isn't in the request's own `where:`. This is skipped for a request with no `where:` at all, because `scan`, `drill` and `loop` legitimately have none. [C-198]
- **Not checked, mixed polarity:** a category that mixes yes/no polarity words. It can't be checked mechanically, so it is left to `mm3 agent probe`'s own prose rule. [C-198]
- **Not checked, long questions:** a question over 160 characters. The schema already stops that outright before a request can reach `--dry-run`. [C-198]
- **Overflow:** more than 3 warnings still shows only 3, plus one line naming how many more. This is the same overflow shape used for more than 5 request stops. [C-198]
- **`replay`:** it carries no `ask:` of its own, because it replays its parent's frozen questions. So it has nothing to check. [C-198]

**`replay --dry-run`:**

- It reads both git refs before answering. [C-148]
- A nonexistent or mistyped `before` or `after` ref stops `--dry-run` the same way it stops a real run. It does not wait to surface on the paid attempt. [C-148]

### Budget cap

- A run whose every answer is reused from prior runs is never blocked by an already-reached budget cap, on any verb. [C-136] [C-149] [C-150] [C-151] [C-152]
- The cap is checked only when the run would actually need to call the classifier. [C-136] [C-149] [C-150] [C-151] [C-152]
- Reuse skips only the spend gate. It never skips the ledger gate: the ledger must still read cleanly and accept the new line either way. [C-136] [C-149] [C-150] [C-151] [C-152]
- The cap-reached message gives the same fix as the low-budget warning: raise `budget.usd`, `budget.runs`, or both (whichever tripped) in `.mm3/config.yaml`, then run `mm3 config --load`. [C-133]
- `mm3 budget` only reads. It prints the budget line and, unless that line is already a warning (which carries its own fix), `→ to change it: edit budget.usd / budget.runs in .mm3/config.yaml, then run mm3 config --load`. [C-251]
- `mm3 budget set` and `mm3 budget reset` no longer exist. Each stops with exit 2, says where to go (the config, then `mm3 config --load`), and writes nothing. [C-252]
- `mm3 config --load` starts the budget count over only when the budget changed since the last load (`usd`, `runs` or `per`; not `warnAt`) and the file has no `budget.since` of its own. The start time is recorded in that load's ledger receipt, never in `config.yaml`, and the load prints `count restarted`. A later load that leaves the budget alone keeps the restarted count, the first load of a project never restarts what was already spent, and runs in the same second as the load still count, so the count errs toward counting a little more, never less. [C-253]

### Node version

**Node 22.13 or newer is a hard requirement, not a soft preference.** It is what the ledger's `node:sqlite`-backed lookup index runs on. [C-089]

- The CLI's whole dispatch checks this once, up front (see C-106). [C-089]
- A project's own ledger (`.mm3/log.jsonl`) stays the source of truth regardless. [C-089]
- The index is a disposable, self-healing cache. A missing or corrupt copy only costs a rebuild, never a wrong answer. [C-089]
- The slower, always-correct linear scan it rebuilds from is still what a corrupt or mid-write `index.db` falls back to (see C-107). [C-089]
- That fallback is no longer a normal, silent substitute for `node:sqlite` being genuinely missing. This is because of the Node-version guard. [C-089]

**Where the check runs:**

- It runs once at the top of the CLI's whole dispatch, before any command does anything real. [C-106]
- It runs again inside `mm3 mcp` for every `tools/call`. [C-106]

**On an older Node:**

- Every command exits 2 with exactly `✖ node: v<version> is too old → install Node 22.13 or newer (it powers the ledger index); https://nodejs.org`, then the pointer line (`→ see: mm3 agent <command>` from the CLI, `→ see: mm3 agent` from the plugin). [C-106]
- The exception is `doctor`. It still runs, free and with no call. It shows `node: v<version> ✖ too old → install Node 22.13+` and `index: none (needs Node 22.13+)` in its own output. Then it too exits 2 rather than 0. [C-106]
- `mm3 mcp` still answers `initialize` and `tools/list`, so a client's handshake never hangs. [C-106]
- Every `tools/call` comes back `isError: true` with that same line and the overview pointer, whatever command was actually asked for, `doctor` included. The guard runs before the requested command ever does. [C-106]

**The index fallback is a backstop only:**

- The linear, in-memory fallback in the id index (`ledger/index.ts`) is no longer a normal production mode. [C-107]
- It still runs, unchanged, when an actual SQLite call throws on a good Node. That is a corrupt or mid-write `index.db`, which is self-heal's own resilience and unrelated to Node version. [C-107]
- When `node:sqlite` is genuinely unavailable (a real Node below 22.13), the index throws a `LedgerError` naming the same Node requirement. It does not silently degrade. [C-107]
- This is a backstop independent of the CLI's own guard (C-106). A library consumer that reaches the ledger directly, without going through `mm3`'s dispatch, gets the same loud failure. It does not get a quietly slower, never-persisted index. [C-107]

### Config

**`mm3 config`:**

- It is a free, read-only display of the effective config. Plain `config` never writes. [C-226]
- It is not itself a valid file. Its last notes point to `mm3 config --write` when there is no `.mm3/config.yaml` yet, or name the file path when one exists. [C-226]

**`mm3 config --write`:**

- It writes `.mm3/config.yaml` only when that file is missing. It creates `.mm3/` and its `.gitignore`, which un-ignores `config.yaml`. [C-226]
- The file opens with commented front matter: what the file is, how to edit it, precedence env > file > defaults, and that it is safe to commit. [C-226]
- Then every setting is commented out under live section headers, with top-level keys at column 0. [C-226]
- It never overwrites. With a file present it prints a note naming the path and exits 0. [C-226]
- With no project it stops with `✖ config: ... → ...` at exit 2. [C-226]
- The starter is built from the same defaults table the display uses. It is valid as written, and stays valid when any single value line is uncommented. [C-226]

**`mm3 config --load [file]`, and the file as the config:**

- `mm3 config --load` checks `.mm3/config.yaml` with the same validation `mm3 config` and `mm3 doctor` use. If it is clean, it appends a receipt to the ledger (a `config` record: when, the sha256 of the file, the settings it held, and what changed since the previous receipt) and prints `✔ valid · loaded · N changed from the defaults` for the first load, or `… N changed since the last load` after that, then one line per change such as `depth.class: [3, 6, 9] → [15, 30, 45]`. A setting taken out of the file shows as going back to its default. An override equal to its default changes nothing and is not counted. Giving `--load` and `--write` together is a usage stop that says what to run. [C-242]
- A file with any problem prints every `✖ config.<path>: problem → fix`, exits 2, and records nothing. [C-243]
- `mm3 config --load <file>` checks that file first and only then copies it, byte for byte, to `.mm3/config.yaml` and loads it. A file that does not check out replaces nothing. Loading never rewrites your own `config.yaml`, so its comments stay. [C-244]
- `.mm3/config.yaml` is the config, and every request reads it itself: there is no loaded copy and no other file. An edit applies at once, loaded or not; deleting the file returns to the defaults at once. A load only checks the file and records it. MM3's own writes to the file (`report fields --accept`, the legacy-budget migration) keep your comments. [C-245]
- `mm3 doctor` and `mm3 config` compare the file with the ledger's latest receipt. No file and no receipt, or a starter that sets nothing: `✔ config: defaults`. The file is exactly what the latest receipt recorded: `✔ config: loaded <time>`. The file differs from the latest receipt, or has none: `⚠ config.yaml is in effect but its latest change is not recorded → mm3 config --load`. The file is gone after a load was recorded: `⚠ config.yaml is gone (last loaded <time>) → the defaults apply; run mm3 config --load to record the defaults, or restore the file`. [C-246]
- A `config.yaml` with problems shows every problem in `mm3 config` and `mm3 doctor`, with `✖ config.yaml has a problem → fix it: paid runs stop until you do`. `class`, `scan`, `drill`, `loop` and `replay` (dry runs too) then exit 2 with the problems and `✖ config: paid runs stop until .mm3/config.yaml is fixed → fix it, then run mm3 config --load`, and spend nothing. The free reads (`view`, `report`, `budget`, `config`, `doctor`) still answer, with the good keys and defaults for the rest. [C-247]
- There is no `mm3 config --reset`: it is an unknown flag. A project goes back to the defaults by deleting `.mm3/config.yaml` and running `mm3 config --load`. That exits 0, prints `✔ no config.yaml · the defaults apply · recorded` with what changed, and records a receipt of the defaults (flagged `absent`, restarting the budget count if the budget changed), so `mm3 doctor` reads `✔ config: defaults` again. With no `config.yaml` and no earlier load, or once the defaults are recorded, it exits 0 with `✔ no config.yaml · the defaults already apply · nothing to record → mm3 config --write for a starter` and records nothing. `mm3 agent config` says this. [C-248]
- A `config` record is never a run and never counts toward the budget or the run counter. A copy of MM3 that meets a record kind it does not know stops with `✖ ledger: line N of .mm3/log.jsonl has a "<kind>" record this MM3 does not know → update this copy of MM3 (mm3 doctor shows which)`, not "not a ledger record". [C-249]
- A leftover `config.active.json` from an older MM3 is never reported as a misnamed config: the `found .mm3/<name> — did you mean config.yaml? → rename it` note still flags `config.ymal`, `config.yml` and the like. [C-250]

**Settings that change the counts (depth, items, evidence, lens, warnAt):**

- `depth:` gives `class`, `scan` and `loop` each a list of three whole numbers: how many concerns (probes of 3 questions each) `quick`, `standard` and `thorough` ask. The default is `[3, 6, 9]` for each, which is 9, 18 and 27 questions. A request still says `depth: quick`; the config says what that means for that verb. A verb left out keeps the default. [C-235]
- A depth list must be three whole numbers of at least 1, ascending (`quick <= standard <= thorough`). `drill`, `replay` and `view` have no depth setting, and naming one stops with a fix. Three questions per probe, times the thorough number, plus the most decisions allowed (5), must fit in `sweep.maxQuestionsPerCall`. [C-236]
- With `depth.class: [15, 30, 45]` a `quick` class request expects exactly 15 concerns categories (45 questions), and a stop names that number. [C-237]
- `sweep.itemsPerLayer` sets the items asked per layer at `quick`, `standard` and `thorough` (default 10, 20, 30): whole numbers of at least 1, ascending. The lower-only `sweep.maxItems` still applies on top. [C-238]
- `budget.warnAt` (default 0.8) is the share of a cap at which the budget line starts to warn: above 0 and at most 1. [C-239]
- `evidence.perItemChars`, `evidence.totalChars` and `evidence.maxFiles` (default 20,000, 60,000 and 500) are whole numbers of at least 1, and `perItemChars` is no larger than `totalChars`. `lens.concernAt`, `lens.weakBelow` and `lens.strongAt` (default 0.5, 0.35, 0.8) lie between 0 and 1 and must satisfy `weakBelow < concernAt < strongAt`. A group that breaks its rule is dropped whole, with a stop saying what to change. [C-240]
- `mm3 config` and the `--write` starter list every one of these settings, with the question count beside each `depth` tier. With no `config.yaml` every value is the default and no verb's answer changes. [C-241]

**Empty sections:**

- A config section with every child commented out parses as null and means "no overrides". [C-227]
- That covers `sweep:`, `sweep.itemsPerLayer:`, `reuse:`, `depth:`, `evidence:`, `lens:`, `budget:`, `mdl:`, `pricing:`, and a `pricing` or `mdl` entry such as `jev-1.13.0:` with nothing under it. [C-227]
- It is never a `✖ config.<section>: is not a mapping` stop. [C-227]

**A misnamed config file:**

- A file in `.mm3/` named like the config but not `config.yaml` gets a note. Examples are `config.yml`, `config.ymal`, `config.yaml.txt` and `config.json`. [C-228]
- This applies only when there is no real `config.yaml` beside it. The note comes from `mm3 config` and `mm3 doctor`: `found .mm3/config.ymal — did you mean config.yaml? → rename it`. [C-228]
- It is never a stop. The misnamed file is never read. [C-228]

### TypeSafe connection

**`TYPESAFE_BASE_URL`** overrides the TypeSafe base URL for either route. Use it for a proxy, a self-hosted mirror or tests. [C-094]

- It must parse as a URL. [C-094]
- `https` is required. The one exception is `http` for `localhost`, `127.0.0.1` or `[::1]`. [C-094]
- Anything else is a stop, `✖ TYPESAFE_BASE_URL: ... → ...`, at exit 2. [C-094]

**Retries:**

- The TypeSafe client retries a 429, a 529, or another retryable status or timeout up to 2 more times. That is 3 attempts total. [C-096]
- It honours the server's own `Retry-After` when it sends one. Otherwise it uses exponential backoff with jitter, capped at 10s per wait. [C-096]
- 401, 422 and any other non-retryable status are never retried. The first failure is final. [C-096]

### Keys

**Resolution order.** A key is resolved in this order, and the first hit wins. [C-097]

1. `TYPESAFE_API_KEY` or `AI_GATEWAY_API_KEY` in env. [C-097]
2. The OS keychain: macOS `security`, Linux `secret-tool`. Windows always falls through. [C-097]
3. `~/.config/mm3/env`, or under `$XDG_CONFIG_HOME`. [C-097]

The key's source (`env`, `keychain` or `file`) is carried alongside it. [C-097]

**The user file:**

- It is a shell env file that `mm3 init` writes at mode 0600 in a 0700 directory. [C-097]
- It holds only lines of the exact shape `export NAME='value'` for an allowlisted name, plus `#` comments. [C-097]
- The allowlist is `TYPESAFE_API_KEY`, `AI_GATEWAY_API_KEY`, `TYPESAFE_BASE_URL`, `JEV_MODEL`, `JEV_GATEWAY_MODEL` and `MM3_PROVIDER`. [C-097]
- MM3 parses this file itself and never sources or evals it. [C-097]
- A line it doesn't recognise is left untouched. It is not an error. [C-097]

**The key never leaks:**

- The resolved value never appears in any output, error, ledger line or note. [C-097]
- The redaction list (`ledger/redact.ts`) also scrubs it as a literal, on top of its own secret-shaped patterns. [C-097]

**A stored key is honored everywhere:**

- A key resolved from the OS keychain or the user file (never env) is honored the same way everywhere a provider is chosen or identified. That is not just `mm3 doctor` and `mm3 agent`, which already looked past env. [C-203]
- Every `cli.ts` call to `selectProvider` passes the same `resolveStoredKey(runner, platform, env)` lookup. That covers class, scan, drill, loop and `replay`, and every call to `runView`. [C-203]
- The lookup travels through one shared `VerbContext` or `ViewContext` field (`resolveStored`). It reaches every verb's own `providerIdentity` call. That call gives the route and adapter shown in `--dry-run`'s `plan:` and recorded on the ledger run. [C-203]
- So a key found only in the keychain or `~/.config/mm3/env`, with no env var set, is never silently treated as "no key". It is never answered by the fake provider while `doctor` reports `key: yes`. [C-203]
- An env var still wins over a stored key, unchanged. [C-203]

**The secret-shaped-key redaction pattern** is `KEY_VALUE` in `ledger/redact.ts`. [C-200]

- It refuses to start its value match on `{` or `[`. [C-200]
- A real secret is never itself a literal YAML mapping or list. [C-200]
- Some MM3-chosen names contain a secret-ish word. Examples are a sweep item or category like `issue-token`, `verify-token` or `set-new-password`. The structured value right after such a name is no longer swallowed as if it were the secret. [C-200]
- Before, `issue-token: {depends: unsure, ...}` became `issue-token: [redacted] unsure, ...}`. That destroyed the category name. It was data loss, not a leak, because nothing there was ever a secret. [C-200]
- A genuinely secret-shaped value after the same kind of key (`api_key: sk-...`) is still redacted exactly as before. [C-200]

### `doctor`

**What `mm3 doctor` reports:**

- It is free: no classifier call, no budget touched, no ledger write. [C-095]
- The resolved provider, route and base URL. The route is `direct`, `gateway` or `custom`, or `fake` or `chaos`. [C-095]
- Whether `TYPESAFE_API_KEY` and `AI_GATEWAY_API_KEY` are set. It never shows their value. [C-095]
- The pinned model, plus the gateway wire model when relevant. [C-095]
- Whether a project and ledger are found. [C-095]
- The Node version, and whether `node:sqlite` is available. [C-095]

**Exit code:**

- Exit 0 when the config is usable. [C-095]
- Exit 2 with the same `✖` message a paid verb would give when it isn't. Examples are a floating model or a bad `TYPESAFE_BASE_URL`. [C-095]
- This includes too old a Node. `doctor` still runs and reports it rather than stopping outright (see C-106). [C-095]

**The `key:` line:**

- It names where a resolved key came from: `key: yes · from OS keychain (encrypted, per user)`, `from user file <path> (0600, not encrypted)`, or `from env TYPESAFE_API_KEY`. [C-098]
- It adds `(overrides stored)` when a stored key also exists but env won. [C-098]
- With no key it says `key: no → run "mm3 init" to add one`. [C-098]
- With no key configured, `mm3 agent`'s overview adds one extra `run:` line at the end, and only then. Both hints come from the same plugin-context check. [C-190]
- Inside the plugin's own bundled MCP server, the hint is `/plugin → MM3 → Configure → press Enter on "TypeSafe API key", paste, Enter, Save configuration`. [C-190]
- The plugin context is detected by `CLAUDE_PLUGIN_ROOT` set in the process environment. It is present there and nowhere else, per Claude Code's plugins-reference docs. [C-190]
- Outside it, in a bare terminal or another MCP client, the hint stays `mm3 init` to add one. [C-190]

**Other warnings and lines:**

- The env file gets its own warning line if its mode is looser than 0600 or it has a line mm3 ignored. [C-098]
- `doctor` names the CLI's own install: `cli: <path> · installed --<mode> ...`. [C-098]
- `doctor` names the Claude Code plugin's overall state: `plugin: mm3@mvp-scale · <scope> scope`, or `not installed → ...`. [C-098]

**The `versions:` line:**

- When Claude Code has the plugin installed, `doctor` compares this copy of MM3 with the plugin's own version, read from Claude's install record. It prints `versions: ✔ the plugin and this copy are both 0.1.2`, or `versions: ⚠ the plugin is 0.1.1 (f337f61) and this copy is 0.1.2 → update the older one: /plugin update in Claude Code, or npm install -g @mvpscale/mm3@latest`. The base versions must match; a nightly build (`x.y.z-nightly.<date>.g<sha>`) must also be at the plugin's commit, and its warning names `@nightly` in the npm command, not `@latest`, which is the older release. With no plugin installed there is no line. [C-254]

**The `plugin:` nudge:**

- Using MM3 is scoped per project. But Claude Code's own `/plugin install` UI defaults to `user` scope. By contrast, `mm3 init` already defaults to `project` scope. [C-177]
- So when the `plugin:` line finds the plugin installed at `user` scope only, it appends a nudge toward switching: `mm3@mvp-scale · user scope (every project) → for just this one, "mm3 init --scope project"`. [C-177]
- There is no nudge once `project` or `local` scope is present. [C-177]

**The `project:` line:**

- It names the project root. [C-102]
- It says whether the Claude Code plugin is enabled for that project. This is separate from the `plugin:` line's overall install state. [C-102]
- Using MM3 is always scoped to a project, so this is the answer that actually matters day to day. [C-102]
- It is true for a project-scope install. This is checked from wherever this process runs, which is how Claude Code's own project scope is itself resolved. [C-102]
- It is true for a user-scope install, because that covers every project, this one included. [C-102]
- It is true, best-effort, for a local-scope install too. `claude plugin list --json` carries no per-entry project path to check against. So local scope is treated the same permissive way as project scope, rather than guessed at further. [C-102]

**The `agents:` line:**

- In a project, `mm3 doctor` always prints an `agents:` line. It says `ok`, or gives the same fix text as the note in the init section below. [C-234]
- It is independent of the marker file and never writes it. [C-234]

### `init` and `uninstall`

**What `mm3 init` sets up per user, shared across every project:**

- **The CLI:** with `--global`, `--user` or `--local`. It offers `--user` instead of a sudo-needing global install. [C-099]
- **The key:** hidden input via `node:readline`, never argv. [C-099]
- Use `--key-stdin` for automation and `--no-key` to skip. [C-099]
- The key gets a sanity check on shape only. There is no live check against TypeSafe. [C-099]

**What it sets up per project:**

- The Claude Code plugin, with `--claude` or `--no-claude`. [C-099]
- `--scope user|project` picks its scope, defaulting to `project`. [C-099]
- The project's `.mm3/`. [C-099]

**Outside a git project:**

- It does only the two per-user steps. [C-099]
- Then it stops with one line pointing the user at cding into a project. [C-099]

**How it behaves:**

- It is idempotent. A re-run that finds a step already done says so and changes nothing. [C-099]
- It is interactive by default. `--yes` takes the default answer everywhere. [C-099]
- Every step prints exactly one line, glyph first: `✔ done`, `· already`, `– skipped (why)`, or `✖ problem → fix`. [C-099]

**The final `next:` line:**

- It points at `mm3 agent`. That is the minimum an agent needs before writing a first real request: its enforced rules and good/bad patterns. [C-176]
- It does not invite a real request straight off. [C-176]
- If any step above logged a `✖ problem` line, `next:` never claims the setup is usable. It points back at the fix and at re-running `mm3 init`. [C-176]
- A step that failed makes `init` exit 1, not 0 (a missing `npm`, an install that errors, a plugin step that errors, an unmatched marker in `init --agents`). The one exception is the `✖ cli:` advice that the install worked but its folder is not on `PATH` yet, which stays exit 0. [C-176]
- A command that is not installed is said in words (`npm install … failed (npm was not found on PATH) → install Node.js, which includes npm, then re-run "mm3 init"`), never as `spawnSync npm ENOENT`. [C-176]

**`mm3 init --agents`** is an opt-in step that runs on its own. [C-233]

- It has no install, key or plugin step. Combined with another init flag, it stops at exit 2. [C-233]
- It writes a short pointer (what MM3 is, run `mm3 agent` first, then `mm3 agent <verb>` before a request; no workflow) into the project's `AGENTS.md`, between `<!-- mm3:agents -->` and `<!-- /mm3:agents -->`. [C-233]
- The file is created when missing. [C-233]
- The block is appended when there are no markers. [C-233]
- Only what sits between the markers is replaced when there are markers. An unmatched marker stops with `✖ agents: ... → fix`. [C-233]
- It appends `@AGENTS.md` (`@../AGENTS.md` for `.claude/CLAUDE.md`) to a `CLAUDE.md` that exists and has no line importing AGENTS.md. [C-233]
- It first prints exactly the lines it would write and to which file. It writes only on `--yes` or a yes at the prompt. [C-233]
- A non-terminal input (the MCP path) is never prompted. It shows the lines, writes nothing and says `re-run with --yes`. [C-233]
- A second run changes nothing and says `· agents: already set up`. [C-233]

**The one-time `agents:` note:**

- It appears when a project's `AGENTS.md` has no mm3 block (`no-block`). [C-234]
- It also appears when `CLAUDE.md` or `.claude/CLAUDE.md` exists without a line importing AGENTS.md, or when neither exists (`claude-md-no-import`): Claude Code reads CLAUDE.md, never AGENTS.md. [C-234]
- The project gets ONE extra note on the first real run of `class`, `scan`, `drill`, `loop` or `replay`, just before the budget note. [C-234]
- For `no-block` it says `agents: no MM3 guidance in AGENTS.md → mm3 init --agents adds it (shows the lines first)`. [C-234]
- For `claude-md-no-import` it says `agents: Claude reads CLAUDE.md, not AGENTS.md → add the line @AGENTS.md to CLAUDE.md (or run mm3 init --agents)`. [C-234]
- It appears once per project, on the first real run: the ledger already knows that no run is recorded yet, so there is no marker file. [C-234]
- A `--dry-run` neither shows it nor writes the marker. [C-234]
- A project already `ok` never sees it. [C-234]

**`mm3 uninstall`** reverses init. [C-100]

- By default it acts only on the current project. [C-100]
- It removes the Claude Code plugin's project-scope install. [C-100]
- It asks about that project's `.mm3/`, and the default is **no**, because it is the user's run history. [C-100]
- The per-user parts are the stored key and the CLI itself. They are only touched with `--all`. [C-100]
- `--all` then also reaches every plugin scope found, plus the `mvp-scale` marketplace and the plugin cache dir it left behind. [C-100]
- The CLI step uses whichever install mode `mm3 init` recorded in `~/.config/mm3/install.json`, which holds no secrets. [C-100]
- When there is no record, it prints the exact commands to run by hand. [C-100]
- `--yes` takes the default answer everywhere. That is yes for removal steps that run, and no for `.mm3/`. [C-100]
- `--keep-key` and `--keep-data` skip their step outright, with no question asked. [C-100]

**`.mm3/`'s own `.gitignore`:**

- `.mm3/` carries its own `.gitignore` (`*`). [C-101]
- It is created the first time anything writes into `.mm3/`: the ledger, the budget file, the id index, or `mm3 init`'s own explicit project step. [C-101]
- So a project that never ran `init` is still covered on its very first run. It does not commit its run history by accident. [C-101]

### The Claude Code plugin and its MCP tool

**The bundled server:**

- The plugin bundles a stdio MCP server, `mm3 mcp`. It is hand-rolled, with no SDK dependency. [C-103]
- It has one tool, `mm3`, taking `{ args: string[], stdin?: string, project?: string }`. [C-103]
- It runs exactly what `mm3 <args…>` would run, in-process. It treats `stdin` as what real stdin would have supplied. [C-103]
- A call that carried a field the tool does not take (an agent's own name for the YAML, such as `request`) is checked before its request is read. When it reads stdin (`-`) and no `stdin` text came with it, it runs nothing and returns one block, `✖ arguments: ignored "request" → …the request YAML goes in "stdin"`, ending with the pointer; it never says `request: empty`. Any other failing call gets that line after its own stop and before the pointer. A passing call is untouched. [C-103]
- A `stdin` that is not text (an object, a list) stops with `✖ stdin: must be text, got object → send the request YAML as one string in stdin`, and runs nothing. [C-103]
- A call whose `args` is not an array (an agent folded the YAML into a string) stops with `✖ args: must be an array of strings, got string → args: ["class","-"] and the request YAML as the separate field stdin`, and runs nothing, instead of printing the generic help. [C-103]
- It returns the same text output the CLI would print. It returns the exit code as `isError`, which is true when the exit code isn't 0. [C-103]
- There is no second contract. [C-103]

**The tool description:**

- It opens with one short clause saying when to use the tool, for any caller (lead, helper or workflow): "Quick, citable evidence for judgment calls on code or a design (safe to merge? is it fixed? which option?)." [C-186]
- Straight after it comes a directive, not a description: "First call args: ["agent"] to learn the commands and rules, then args: ["agent", "<command>"] before writing a request." [C-186]
- That comes ahead of what the tool otherwise does, which is to run any CLI command in the project. [C-186]
- The description is the first, and sometimes only, text a cold agent reads before its first call. So it has to name `agent` itself rather than assume the agent already knows to ask for it. [C-186]

**The plugin's nudge hook:**

- The plugin ships one `PreToolUse` hook, declared in `hooks/hooks.json` (the documented plugin location, an event map under a top-level `"hooks"` key) and run by `node` from `${CLAUDE_PLUGIN_ROOT}/hooks/nudge.mjs`. Enabling the plugin turns it on and disabling it turns it off. [C-268]
- It fires before the `Agent` tool (and the older `Task` name), where a helper is about to be spawned, and before a `Bash` command that commits, merges, pushes or opens a PR (`git commit|merge|push`, `gh pr`). [C-268]
- It nudges and never blocks: it prints one JSON object whose `additionalContext` is one line of at most 200 characters naming the next step (the helper moment points at `mm3 agent delegate`; the decision moment says to get a verdict, `view` then `class`, and to cite the `MM3-####` id), and it always exits 0. [C-268]
- It speaks only when the project (the hook input's `cwd` or the project folder Claude Code names, or a folder above it) has `.mm3/`. It speaks once per agent per moment per session, kept by a marker file in a private folder (mode 0700, named for the user, checked to be a real folder the user owns) inside the temp folder. A marker that cannot be written, or a folder that is not safe to use, does not silence it. [C-268]
- Garbage or empty input, another tool, another event, a command that decides nothing, or no `.mm3/` prints nothing and exits 0. [C-268]

**Errors:**

- Every tool call runs through the same error normalization the real CLI entrypoint uses. [C-140]
- A thrown provider, budget, ledger or usage error comes back as one clean `✖ field: problem → fix` line in the tool result's `isError` text. [C-140]
- It is never a doubled `✖ mm3: ✖ field: ...` prefix. [C-140]

**The `project` argument:**

- When given, it runs that one call against `project` as `MM3_HOME`, instead of the server's own working directory. [C-142]
- It is for a nested project that the plugin's own cwd doesn't reach. [C-142]
- Omitted, behavior is unchanged. [C-142]

**Who the run is recorded as:**

- A run or outcome made through the plugin is recorded under `claude`, not the literal `agent`, when `MM3_ACTOR` isn't already set. [C-143]
- The MCP server never infers an identity from the project's git config. That would attribute the call to whoever's git identity is configured there, typically the human owner and not the agent making the call. [C-143]
- An explicit `MM3_ACTOR` always wins over this default. [C-143]
- `mm3 doctor` shows the actor that will actually be used. [C-143]

**The plugin's configuration:**

- The plugin's own configuration (`userConfig`) offers one masked, optional field: a TypeSafe API key. [C-104]
- Leaving it empty means the free fake provider, exactly as on the terminal path. [C-104]
- The AI Gateway route is env-only for the plugin. `AI_GATEWAY_API_KEY` stays a CLI-level environment variable (C-097). [C-104]
- The plugin's own config no longer exposes a field for it or maps it into the bundled MCP server's environment. [C-104]
- A plugin user who wants the gateway route sets `AI_GATEWAY_API_KEY` in their own environment instead. [C-104]

**An empty key:**

- Claude Code's own behaviour for a blank optional value is undocumented. It may substitute `""` or omit the variable entirely. [C-105]
- An empty string substituted for the key counts as no key everywhere key resolution happens. [C-105]
- Resolution still falls through to the OS keychain or the user credentials file. It does not treat the empty string as a real, empty key. [C-105]
- The same rule applies to `AI_GATEWAY_API_KEY` when a plugin user sets it directly in their own environment. That holds even though it no longer comes from the plugin's own `userConfig` substitution. [C-105]

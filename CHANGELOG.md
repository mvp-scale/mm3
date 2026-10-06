# What's new

Newest first. Each entry says what you can now do, and the number is the pull request that shipped it. Releases are tagged; the top section is what the `nightly` build on npm already has.

## Unreleased: 0.1.3, on the nightly build

**Agents get a verdict on the first real try more often, and every agent test now shows how the agent got there.**

- **A plain question gets a verdict far more reliably.** In agent tests the plain "is this file safe to ship?" job went from about half passing to 8 of 8 on the plugin and terminal routes together, and the smaller Haiku model went from 0 of 2 to 5 of 6. (#33)
- **Agents send a request as one plain command.** The `mm3 agent` card now says: start from `mm3 template <verb>`, save the request with your file tool, then run `mm3 <verb> <file> --dry-run` and `mm3 <verb> <file>`. A heredoc chained into the run is refused by an `mm3 *` permission rule and left agents asking a person for help. (#33)
- **No more `export MM3_HOME=…;` prefixes.** The card says to run `mm3` from inside the project, and to set `MM3_HOME` (or the MCP `project`) in the environment only when you started elsewhere. (#33)
- **`view` says what it needs.** The overview now reads `view … (mm3 view <request-file>)`. Agents were calling a bare `view` first, hitting "missing arguments" and spending an attempt. (#33)
- **A value that starts with a backtick no longer trips agents.** The card said to name files in backticks, so agents wrote `goal: \`routes/login.ts\` is safe`, which YAML cannot read. The advice now says to keep a backtick inside the sentence or quote the value, and the stop for it says so too. (#33)
- **A request with no `decisions:` section is sent to the template.** The stop says to copy that section from `mm3 template class`. Before, agents wrote decisions out of their own yes/no questions in 3 of 5 trials; with the new text that was 1 of 5, and none of the misses was that. (#33)
- **The dollar cap is proven on a live call.** A real request is allowed, the next new question stops at exit 3 before spending anything, and raising `budget.usd` in the file lets the next one through. (#33)
- **A new agent test: finds MM3 without being told.** The task never names MM3; the agent must reach for it from the plugin's own startup guidance and report its run id. 5 of 5 in the clean test room. (#33)
- **A release is one number going up.** Nightly and main both go from 0.1.2 to 0.1.3 with nothing attached, and the release refuses a version with a date, commit or label on it. `npm run release -- nightly` publishes exactly that number to npm, reads the branch, npm and CI back, and runs the formal ceremony, unless a passed one still stands because the code and agent-read text are unchanged since; `npm run release -- main` checks it was all tested and certified, says "nothing new" if main already has it, builds one clean copy of nightly for main without the development files, and promotes the same package to `latest` with one GitHub release. Every step is shown as done, will do or not done yet, with its cost. (#38)
- **A failed ceremony explains itself.** Under STATUS the release prints the score, which jobs blocked and which checks failed in them, whether it reads as one isolated check or agents not finishing, what changed since the last passing ceremony (Claude Code version, agent-read text), the impact and blast radius, and the exact commands to read it, re-run only those jobs, or accept it. (#37)
- **Fixed a false failure in the helper tests.** Claude Code 2.1.292 stopped reporting a helper's own message in its output, which made six correct delegation runs fail the "helpers cite run ids" check. The check now reads that each helper got a verdict and the lead's answer carries its id. (#37)
- **Agent tests are fairer and show their work.** Each test agent now has only MM3 (the account's mail, drive and calendar connectors were leaking in and changing what agents saw from one trial to the next); a request an agent checks first with `--dry-run` is not counted as a failed attempt, and one command that dry-runs and then runs for real counts as one good attempt; a stop followed by an edit to the request file counts as staying on MM3; leftover scratch files from one trial no longer break the next; and every run report prints the agent's own reason for each step and a one-line decision path. (#33)

## v0.1.2, 2026-10-06

**One file for your settings, a spend cap you can trust, and agents that pick MM3 up without being told.**

### Your settings, in one place
- **Everything you tune lives in `.mm3/config.yaml`.** How deep each check goes, how big a sweep is, when to warn about spend, which evidence and lens to use. Edit the file, run `mm3 config --load`, and a typo stops with the fix instead of a silent default. (#22, #23)
- **Every load leaves a receipt in the ledger:** when, a hash, the settings, and what changed since the last load. You can always say which settings produced which answer. Delete the file and load again, and the receipt says "back to defaults". (#23)
- **Spend cap in the same file.** `mm3 budget` now only reads; change the cap in `config.yaml` and the count restarts on load. (#22, #23)

### Agents find it and use it
- **One guidance text, every route an agent can take:** the plugin's startup instructions, the skill, the project guide, a block in `AGENTS.md` that goes quiet when the plugin is off, and `mm3 agent delegate`, which a lead agent hands to its helpers so they use MM3 the same way. (#23)
- **Fixed: a project with no `CLAUDE.md` never showed the guidance to any agent.** Claude Code reads `CLAUDE.md`, not `AGENTS.md`. We found it by running a lead agent with three helpers on a bare project. `mm3 init --agents` now creates the `CLAUDE.md` that imports it, and `doctor` flags a project that lacks one. (#24)
- **A failing MCP call now says what it ignored.** Agents sometimes sent the request under a field of their own, and got "request: empty". Now: `ignored "request" → the YAML goes in "stdin"`. (#24)
- **`doctor` tells you which copy to update**, the plugin or the terminal install, when their versions differ. (#23)
- **Every stop ends the same way: what it meant, the fix, and one pointer to the central card.** A stop from the key, ledger, config, setup or MCP layer used to end with no pointer, some showed raw system text, and a wrong-field MCP call showed two contradicting messages. Now all of them say the fix and end with `→ see: mm3 agent <topic>`, a failed `init` step exits non-zero, and a test keeps it true. (#28)
- **Agents are told when and why to ask MM3, and the plugin nudges once.** Before a judgment call (safe to merge? is it fixed? which option?) get a verdict: it costs a fraction of a cent and every run is recorded, so the next decision starts from evidence. The plugin adds a one-line reminder before a commit, merge, push or PR, and before handing work to a helper, only in projects that have `.mm3/`. Leads are also told how to check a helper's run id (`mm3 view MM3-####`). (#28)
- **All seven features have a recorded agent test.** The wrong-field recovery, helper guidance and terminal-and-plugin parity join the first four jobs, each proven passable by an ideal run first. (#28)
- **The release ceremony can re-run only the jobs a fix touched.** `--only <jobs> --carry CER-####` runs just those and carries the others forward from an earlier formal run, and refuses the carry if anything an agent runs or reads changed. Two scoring errors that wrongly failed correct agent runs (a command run through a shell variable, and an answer that said "no differences") are fixed. (#29)

### Every release candidate is tested by real agents
- **A release is now judged by what agents can actually do with it.** One command, `npm run ceremony`, runs a published build through the free checks, a context test and real agents doing real jobs (ask a plain question, hand work to helpers, recover from one mistake) on a pinned sample project. It ends with a decision: ship, ship with exceptions, or don't. (#25)
- **Every run leaves a record you can read.** The definition of success is written to an append-only, hash-chained ledger before anything runs; the release report puts the question, each job and what the result means for the release first, and the data after. Tokens are broken down by kind of call, and recovery after an error message is measured. (#25)
- **The features new in each release get their own jobs.** For 0.1.2 that is changing a setting and seeing the receipt, hitting the spend cap and carrying on, checking that an install is healthy, setting a project up so agents read the guidance, fixing a request sent in the wrong field from the stop text alone (the job starts the agent at the real stop, so it never depends on the agent making the mistake), passing the guidance to a helper, and getting the same answer from the terminal and the plugin. Each job is proven passable with an ideal run before any agent is asked to do it. (#26)
- **A feature can be tried by agents while it is being built.** `npm run agentic:feature -- <job>` runs one job against your working tree with the model you choose, free by default, and records it. It can spend real classifier dollars only when you give it a cap on the command line. The same job later goes into the release ceremony. (#27)
- **Guidance changes can't slip through.** Every text an agent reads is snapshotted; a changed word fails a test with a diff and says whether a command moved or only the wording. (#25)
- **Improvements are captured, not acted on in a hurry.** Each one is tagged from a fixed list of 25 themes, so a pattern across runs shows up as a count. (#25)

### Same answer, any way in
- **The terminal and the plugin are tested against each other.** The same command through both gives the same text and the same run id, and the plugin's startup instructions are checked against the source on every test run. Every command, flag and stop is also driven through the built CLI and through real MCP, on Node 22 and 24. (#23, #24)

### Known limit
- **Agents often need a retry on their first request.** In the release agent tests the first request was accepted about half the time (target 80%), and one of six "ask a plain question" runs needed four requests instead of three. Every stop said the fix and the run recovered, but starting each request from `mm3 template <verb>` is not yet said in the main guidance. It is the next improvement.

## v0.1.1, 2026-10-01

**MM3 stops over-explaining itself, and the toolchain is current.**

- **Agents are no longer told to run a three-step ritual for every question.** The "map, plan, replay" workflow was written for our own journey runs and was never tested as a default, yet it shipped to every user. The defaults are back to one clear `class` call when one call does the job. (#20)
- **Current toolchain, with a guard.** TypeScript 7, vitest 5 and Node 26 types, plus a check that nothing newer than the Node 22 floor sneaks into `src/`. (#19)

## v0.1.0, 2026-10-01 (first beta)

**Hand your agent a short yes/no checklist; get back a calibrated pass, fail or unsure it can cite, remembered for next time.**

### What you get
- **Six verbs in two families.** `view`, `class` and `replay` use what is already proven; `scan`, `drill` and `loop` learn what is missing. Requests are `mak:` (the goal) plus an optional `mdl:` (why you are asking, so the ledger learns). (#1, #2)
- **A ledger that learns.** `replay` proves a change flipped what you meant it to; graph views and telemetry show where agents go wrong. (#1)
- **A config file and a spend budget.** `mm3 config` for settings, and a cap with warnings so a run never surprises you. (#1, #12)
- **Agent guidance at each decision**, not just at the start: startup instructions, a nudge from a passing `class` toward `replay`, the skill, and `mm3 init --agents`. A real journey run showed agents skipping `scan` and never proving their change; this puts the hint where they decide. (#15)

### Bugs we found by using it, fixed
- **`mm3` did nothing after `npm install -g`.** npm installs it as a symlink and our entry check compared the wrong path, so it printed nothing and exited 0. Fixed in the CLI and the plugin bundle. (#10)
- **The budget line hid real spend.** A run costing a fraction of a cent still showed "$5.00 left of $5.00". It now shows enough decimals to differ from the cap. (#12)
- **A numeric commit hash in `compare:` gave a vague error.** YAML turns `6640985` into a number; the stop now says to quote it. (#13)
- **Plugin users couldn't tell which build they ran.** The plugin pinned a fixed version, so updates were skipped. It now versions by commit, so every update shows. (#14)
- **Re-running a nightly publish on the same commit collided.** Nightly versions now carry the time. (#6)

### Trust and housekeeping
- **Security policy:** private vulnerability reporting, supported versions, how keys are handled, pinned CI actions, `npm audit` in CI and weekly dependency updates. (#7)
- **The README claims only what is tested.** Install says "in a terminal" because that path is tested; no Codex or Gemini claim until they are. (#9)
- **A cleaner repo:** one agent guide, tooling and site data out of the root, and a 4 MB demo GIF gone. (#5)
- **A public face:** README with real runs, a BETA chip, an architecture diagram and the WordPress journey, start to finish. (#4, #11, #16, #18)
- **Renamed to MM3** from Sidewise, with `mak:` and `mdl:` requests. (#2)

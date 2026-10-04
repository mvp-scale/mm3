# What's new

Newest first. Each entry says what you can now do, and the number is the pull request that shipped it. Releases are tagged; the top section is what the `nightly` build on npm already has.

## Unreleased (nightly)

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

### Same answer, any way in
- **The terminal and the plugin are tested against each other.** The same command through both gives the same text and the same run id, and the plugin's startup instructions are checked against the source on every test run. Every command, flag and stop is also driven through the built CLI and through real MCP, on Node 22 and 24. (#23, #24)

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

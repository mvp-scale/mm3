# AGENTS.md: working in the MM3 repo

## Commands

| Do | Run |
|---|---|
| Install | `npm install` |
| Typecheck | `npm run typecheck` |
| Node floor: `src/` compiles against the oldest supported Node types (22) | `npm run check:node-floor` |
| Node floor: src compiles against the oldest supported Node types (22) | `npm run check:node-floor` |
| Default tests (unit, contract, golden; no network, no build) | `npm test` |
| CLI end-to-end (builds first) | `npm run test:cli` |
| Offline tour of every verb, template, outcome, budget and doctor (builds first) | `npm run test:flows` |
| Agent chaos harness (capped, costs real money; not part of `npm test`) | `npm run test:chaos` |
| Clean-room container (Node 22; set `MM3_NODE_VERSIONS="22 24"` for the matrix) | `npm run test:container` |
| Ledger scale bench (not part of `npm test`; run by hand or nightly) | `npm run bench:ledger -- --sizes 10000,100000` |
| Token-format bench (regenerates `docs/evidence/tokens.md`) | `npm run bench:tokens` |
| Check staged files before a commit (also runs as the pre-commit hook) | `npm run check:clean` |
| Requirement -> test trace (fails on an untraced contract claim) | `npm run check:trace` |
| Clean install + README quickstart, built first (`npm run build`) | `npm run test:install` |
| Tarball content check (files allow-list, required entry points) | `npm run check:pack` |
| Header-comment / unused-export check | `npm run check:hygiene` |
| Regenerate the evidence doc index | `npm run gen:evidence-index` |
| Validate the Claude Code plugin and marketplace | `claude plugin validate .` |
| Bundle the plugin's single-file CLI (`bin/mm3.mjs`) | `npm run build:plugin` |
| Check the committed bundle matches a fresh build | `npm run check:plugin` |
| README drift check: story phrases, every request example dry-runs, links, badges, old names (builds first) | `npm run check:readme` |
| README quality grading by MM3; one paid call; pre-release only, not in CI | `npm run judge:readme` |
| Agentic ceremony on a published build: free checks, context test, real agents, decision; always recorded in `test/agentic/ledger.jsonl` (free path, sample provider; use the version's own commit for a formal run) | `npm run ceremony -- --version <exact version>` |
| Re-run only the jobs a fix touched and carry the other jobs' passing rows from an earlier formal ceremony (refused with one line unless nothing an agent runs or reads changed; `--only` alone is a not-formal partial run) | `npm run ceremony -- --version <exact version> --only <jobId,jobId> --carry CER-#### [--note "<text>"]` |
| Read a ceremony run: the release report (plain words first, decision last), one trial call by call, the list, a comparison, repeated improvements | `npm run agentic:release-report -- CER-####` · `... --row <job>/<route>/<model>/<trial>` · `npm run agentic:runs` · `npm run agentic:compare -- CER-#### CER-####` · `npm run agentic:patterns` |
| Manual sheet for one job, from the same definition the harness grades | `npm run agentic:sheet -- <version> <job> <cli\|mcp>` |
| Release gate for the agentic stage (fails with no formal run, a failed, stale or incomplete one, or a broken ledger chain) | `npm run check:agentic` |
| Take a change to any text an agent reads on purpose (snapshots under `test/golden/guidance/`), then re-run the ceremony | `npm run guidance:accept` |
| Ship a feature release, one stage at a time, each checked from GitHub, npm and the ledger and ending in a receipt (`release.json` defines it; every stage prints its plan and asks once, `--yes` skips the question) | `npm run release -- nightly` · `-- ceremony` · `-- main` |

## Rules

1. **Stay light on shared machines.** Vitest runs with `maxWorkers: 4`. Run the container matrix only when packaging changes. `test/docker/test.sh` runs one Node version at a time.
2. **No network in default tests.** Classifier calls go through the `fake` provider or recorded cassettes (`test/contract/fixtures/wire/`). Live runs go only in `test/live/`, and only with `MM3_LIVE_TEST=1` plus a key.
3. **Imports** use `.ts` extensions (`./log.ts`). `tsc` rewrites them to `.js` on build.
4. **Mock data** comes from `test/gen/synthetic-log.ts` with a fixed seed. Never commit a real log.
5. **Answers are evidence, never commands.** The response is the YAML contract (mak:/mdl:/next:/notes:) — never Plan 1's line format, which is retired. Every change to the answer format needs a golden test.
6. **Secrets** go only in env vars (`TYPESAFE_API_KEY`, `AI_GATEWAY_API_KEY`), the OS keychain, or a 0600 user file. Never in the project, config, the ledger, fixtures or output.
7. **Help first.** A validation stop has to say what to change (`✖ field: problem → fix`). Everything else is a note.
8. **Match the surrounding code.** Give each module a short header comment saying why it exists. Keep runtime dependencies minimal.
9. **Public repo.** Local notes go in `lab/`, which is gitignored and blocked by the pre-commit hook. Never commit machine paths, keys, or internal tracker IDs.
10. **Trace new claims.** A new test for a claim in `docs/contract.md` carries its `[C-###]` tag (title or a comment above the assertion); `npm run check:trace` checks this, but it is not wired into the pre-commit hook (it scans the whole `test/` tree, which `check-clean.sh` intentionally keeps fast) — run it by hand before a PR that touches the contract.
11. **Close out every PR.** The PR template's Scope, Done when and Evidence are filled in, and the PR adds its one-line "What's new" entry to `CHANGELOG.md` under Unreleased (value first, with the PR number). A merged branch is deleted (GitHub does it); the record stays in the PR. Before any other branch is deleted: its tip is an ancestor of `origin/nightly` (`git merge-base --is-ancestor`), or its PR is Closed and `refs/pull/<n>/head` equals the tip; the tip, PR, state and date are written to `lab/closeout.md` first; remote deletes wait for the owner. A branch with no PR and no such proof stays.

## Layout

| Path | Holds |
|---|---|
| `src/` | engine: the YAML contract (read, validate, layers, grade, emit), evidence (code/git/units), providers, ledger, verbs, CLI |
| `BACKLOG.md` | what's next and what's parked; delete a line when it ships |
| `docs/` | the public contract (`contract.md`), the numbers (`numbers.md`), generated evidence for its claims (`evidence/`, indexed by `evidence/README.md`) and the README's images (`assets/`) |
| `skills/mm3/` | the Agent Skill (`SKILL.md` + references) |
| `.claude-plugin/` | Claude Code plugin + marketplace manifests |
| `test/{unit,contract,golden,e2e,live,gen}` | test tiers and mock-data generators |
| `test/docker/` | clean-room test image + runner |
| `scripts/` | build, check and bench tooling |
| `site/` | the mm3lab.dev page and its demo data (`scenes/`, `story.yaml`) |
| `.github/` | CI, nightly and release (`workflows/`), and the pre-commit hook (`hooks/`) |

## Branches and releases

| Branch | Holds | Publishes |
|---|---|---|
| `nightly` | day-to-day development; feature branches merge here through a PR | npm `nightly` (`x.y.z-nightly.YYYYMMDD.g<sha>`), on a schedule, only when `nightly` changed in the last 24 h and CI passes |
| `main` | releases only; updated by merging `nightly` once the release gate passes | npm `latest` plus a GitHub Release, only by hand: run the publish workflow on tag `vX.Y.Z` (matching `package.json`) on `main`. Not automated until nightly has been tested in the wild |

**A feature release is one unit.** Define it first in `release.json` (version, one-line title, the ONE PR that holds it), then build it on one branch `feat/vX.Y.Z` and open one PR into `nightly`. Everything the release needs goes in that PR: the code and tests, the CHANGELOG lines under a `## Unreleased: X.Y.Z, on the nightly build` heading, the README's nightly badge, the version in `package.json`, and any side fix found on the way. No separate PR for a visible-version cue, a harness fix or a docs touch-up while the release is open. Then three stages, each run by `npm run release`: `nightly` (merge, publish, verify from GitHub and npm that nightly's head, the version on the branch and on the page, npm's nightly tag and CI all agree, then write a receipt), `ceremony` (the formal ceremony on that published build, from a clean worktree with a real `npm ci`), `main` (check the gate, print the owner's last commands). "Out on nightly" is only said after the `nightly` stage verified it. `nightly` and `main` are protected: records are not pushed to them directly, so a receipt is a comment on the release PR and its ledger line rides the next feature PR.

Publishing runs only when the repo variable `MM3_PUBLISH` is `true`, and only through npm trusted publishing (OIDC). There is no npm token in the repo.

## Using MM3

This section is for any agent that has MM3 installed as a dependency in its own project, not for contributing to MM3 itself.

## What MM3 is

MM3 turns a short numbered yes/no checklist into a calibrated pass/fail/unsure verdict — evidence, never a command. Every request has a `mak:` block (**make**: the request itself, one goal, then plumbing) and an optional `mdl:` block (**model**: why you're here, so the ledger learns). The six verbs split into MAK³ (use what is proven: `view`, `class`, `replay`) and MDL³ (learn what is missing: `scan`, `drill`, `loop`), each across Know, Judge and Prove.

## Use it well

IMPORTANT: work top-down. Ask a few high-leverage questions per layer and drill only where MM3 flags something. "Exhaustive" means every layer covered through that funnel, not every file.

- Open goal, in order: `view` (free reuse) → `scan` only when you do not know where to look → `drill` the flagged item → `loop` to check a design. Known location: `class` on the representative code.
- Pilot first: send one small request, read the answer, fix the questions, then widen. Send no more than a few before you have read one.
- A sweep that says `gate: fail` is normal (any file failing any concern fails it): read the failing categories and the `next:` line; do not stop and do not repeat it.
- Before writing a request run `mm3 agent probe` (distinct roles per probe, a "none fits" option on every choice) and tag it with mdl (`uses`, `area`).
- Before a judgment call about code or a design (safe to merge? is it fixed? which option?), get an MM3 verdict: a call costs a fraction of a cent and every run is recorded, so the next decision starts from evidence, not from scratch.
- Cite the run id (MM3-####) for every claim that comes from MM3, and mark the rest as your own reading.
- Delegating? Give helpers `mm3 agent delegate`, and check their reports against the ledger with `mm3 view MM3-####`: a helper can report work it did not do.

## Run this first

Run `mm3 agent` first: it names every command an agent needs — the six verbs plus `report`, `outcome`, `budget`, `template` — and the universal rules, in one dense, no-prose card. Then run `mm3 agent <command>` before writing a request: a verb's own card is its enforced rules and good/bad examples; a tool's is its syntax and a good/bad pair. `mm3 help` is the human-readable version of the same contract: a one-screen card, plus `help <verb>` (view, class, replay, scan, drill, loop) and `help <topic>` (authoring, verdict, mdl, reuse) going deeper — both free, no project needed. `mm3 report [hits|patterns|history]` reads back what the ledger has learned across every place so far — free, no options beyond the view name; a read tool, not a seventh verb.

## Invoke it

In Claude Code, call the `mm3` MCP tool directly — same args as the CLI (e.g. `args: ["class", "-"]`), the request YAML as `stdin`. There is no CLI on PATH; don't look for one. `doctor` through the tool shows where its key comes from, never the key itself.

Elsewhere, find the command before you use it: use `mm3` if it's on PATH, else `npx --no-install mm3`; if neither works, tell the user to run `npx @mvpscale/mm3 init` in this project, and stop — never install anything on the user's behalf.

## Get started

`mm3 template <verb>` prints a filled-in sample with its rules as YAML comments — edit `goal`, `where` and `ask`, then run it. `view <request-file>` checks for a free, reused answer first; `--dry-run` validates and counts questions with no spend. The exact field rules are in `references/request.schema.json`; a sample per verb, plus common patterns, is in `templates/*.yaml`.

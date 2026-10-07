# Backlog

What's next and what's parked. It lives on `nightly`. When something ships, delete its line.

## v0.1.3 scope (branch `feat/v0.1.3`)

Nothing else ships in 0.1.3. New ideas go below the fence, in the sections after this one. Each row is proven by the agentic framework (free path unless marked paid). State: 0 Defined, 1 Baselined, 2 Built, 3 Tested (its job meets the bar on this branch's build), 4 Gated (formal ceremony on the published nightly).

| # | Enhancement | Job | Bar | State |
|---|---|---|---|---|
| E1 | Agents set a project up for agents (no new build). | F4 | 3 of 3 | 3 (TRL-0067, 3 of 3; 18 of 18 over six runs) |
| E2 | Agents find MM3 without being told: job F8 (C-271); no startup hook needed. | F8 | 2 of 3 per run | 3 (TRL-0065, 5 of 5, clean room) |
| E3 | Guard: no stop strands an agent. No-decisions stop now points at the template (C-270). | B3 | first fix works | 3 (TRL-0058 4 of 5, TRL-0066 2 of 3; was 2 of 5 twice) |
| E4 | Send a request as one plain command; no `export MM3_HOME`; `view` and backtick fixes (C-269, C-195, C-272, C-276). | B1 | 5 of 6 | 3 (TRL-0064, 8 of 8) |
| E5 | Haiku answers a plain question (stretch). | B1 haiku | 1 of 2 per run | 3 (TRL-0063, 5 of 6; was 0 of 2) |
| E6 | The dollar cap holds on a live call (`test/live/dollar-cap.live.test.ts`), plus F2 paid. | F2 paid, live test | stops at the dollar cap | 3 (live test passes; F2 3 of 3, TRL-0062) |
| E7 | Ceremony on the 0.1.3 nightly passes the gate. | ceremony | gate passes | 0 |

## Next: small and ready

- **Default branch to `main`.** The plugin install and the README links resolve against the default branch, which is still `nightly`. Repo settings, maintainer only.
- **Push `mm3-journeys`, then put the journey 2 plan link back in the README's journeys table** (it was taken out so the release had no dead link). One `class` call tops out at 27 yes/no questions, so arms above that mean several calls on one decision.
- **Open PR #8** (Dependabot): it is superseded, since typescript 7, vitest 5 and @types/node 26 are already on nightly. Close it, or let Dependabot.
- **Delete merged feature branches**, remote and local. Their commits are all in `nightly`.
- **Run `mm3 init --agents` in this repo**, so a contributor's agent gets the pointer to MM3's command cards.

## Journeys

A journey asks what one agent can do on a $1 cap that covers everything, using the same three beats (Know, Judge, Prove). The runs live in [mm3-journeys](https://github.com/mvp-scale/mm3-journeys).

- **Journey 2: turn one dial.** What changes when each `class` call asks more questions? Same brief, model and cap, only the questions per call differ. Two runs per arm.
- **A bigger-model baseline** on the same brief and cap, so the card can show what a cheaper agent plus MM3 learns against an expensive agent alone.
- **Reuse on a kept ledger.** A second pass on the same repo: how much is answered free from the ledger.
- **A journey skill** (kept out of the shipped skills): how to run and consolidate a journey, with the Know, Judge, Prove steps and map-first. Lives in `mm3-journeys`, so journey runs stay consistent without becoming MM3's default.
- **Record the agent's own tokens per run** in each journey's capture, tokens first and dollars as a dated note.

## Website

- `mm3lab.dev` isn't live yet. The site code (`site/`, `scripts/build-site.ts`, the demo) moves to its own repo. The README's image generators read `site/scenes/`, and `check-readme` reads `site/story.yaml`, so that move needs a small refactor first.
- Put the README's "step through the stories" link back once the site is up.

## Release

- Nightly publishes at 07:00 UTC when `nightly` changed. A release is by hand: tag `vX.Y.Z` on `main`, run the publish workflow. `nightly` is at 0.1.1; `0.1.0` is out.
- **Anthropic directory listing (optional).** Run `claude plugin validate --strict .`, work through Anthropic's pre-submission checklist, and confirm the local Node MCP server behaves outside Claude Code.

## Ideas, post-v1 (not committed)

- **`mm3 key set`:** store the TypeSafe key in the OS keychain through platform tools, with no new dependency. The CLI reads it when no env var is set.
- **`report stops`:** record each rejected request as the field and rule id only, never the request text. The most common mistakes then show which `help` pattern to improve first.
- **Templates show the full envelope:** every optional field present, marked optional or required, so an agent trims what it doesn't need.
- **Ledger index strategy:** decide which searches to index (reuse by answer key, run by id, outcome, place history, tags, patterns over time). Some rebuild tuning was measured earlier and not applied.
- **Free ledger views by place, not by exact question:** `view` only hits when the questions and code are identical, so a fresh question about a known file comes back "no runs yet". Ready-made views over the ledger answer "what do I know about this file / area / category?" for free, with indexes on place, category and run. An agent that was shown the database built that join by hand (places, runs, categories) to find what was not yet covered. Not started.
- **Knowledge layer:** consensus across every run tied to a commit, PR or release. Where answers agree across runs and agents they're strong signals; where they flip they're weak. `mm3 report graph` is the first piece.
- **A challenger pair of questions** (opposite polarity). The design is undecided.
- **Messages in more languages (internationalization):** every line MM3 prints (stops, notes, help cards, doctor, links) gets a stable anchor, and a language file maps each anchor to its text, so the tool can be used in many languages without touching the code. The first step is an inventory of where messages live and how they reach the person or the agent. `src/help/links.ts` is the first piece (all outward links in one file). Keep the machine-readable parts as they are (YAML keys, `gate:` values, the `✖` prefix, flags, exit codes); only the displayable words change.

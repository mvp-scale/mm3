# Backlog

What's next and what's parked. It lives on `nightly`. When something ships, delete its line.

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

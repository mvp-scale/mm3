---
name: mm3
description: Use when analyzing, mapping, auditing, reviewing or porting a codebase (architecture work); before merging or shipping a risky change; after a fix to prove it worked; when scanning for a pattern before you know where it lives; or when checking a design or plan before writing code. Turns a short numbered yes/no checklist into a calibrated pass/fail/unsure verdict, reuses answers for unchanged code, and logs every run so weak spots surface over time.
---

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
- Delegating? Give helpers `mm3 agent delegate`, and check their reports against the ledger: a helper can report work it did not do.

## Run this first

Run `mm3 agent` first: it names every command an agent needs — the six verbs plus `report`, `outcome`, `budget`, `template` — and the universal rules, in one dense, no-prose card. Then run `mm3 agent <command>` before writing a request: a verb's own card is its enforced rules and good/bad examples; a tool's is its syntax and a good/bad pair. `mm3 help` is the human-readable version of the same contract: a one-screen card, plus `help <verb>` (view, class, replay, scan, drill, loop) and `help <topic>` (authoring, verdict, mdl, reuse) going deeper — both free, no project needed. `mm3 report [hits|patterns|history]` reads back what the ledger has learned across every place so far — free, no options beyond the view name; a read tool, not a seventh verb.

## Invoke it

In Claude Code, call the `mm3` MCP tool directly — same args as the CLI (e.g. `args: ["class", "-"]`), the request YAML as `stdin`. There is no CLI on PATH; don't look for one. `doctor` through the tool shows where its key comes from, never the key itself.

Elsewhere, find the command before you use it: use `mm3` if it's on PATH, else `npx --no-install mm3`; if neither works, tell the user to run `npx @mvpscale/mm3 init` in this project, and stop — never install anything on the user's behalf.

## Get started

`mm3 template <verb>` prints a filled-in sample with its rules as YAML comments — edit `goal`, `where` and `ask`, then run it. `view <request-file>` checks for a free, reused answer first; `--dry-run` validates and counts questions with no spend. The exact field rules are in `references/request.schema.json`; a sample per verb, plus common patterns, is in `templates/*.yaml`.

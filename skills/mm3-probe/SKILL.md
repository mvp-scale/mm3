---
name: mm3-probe
description: Use before writing or editing any MM3 request — a probe, a category, or a template. Teaches which yes/no questions are worth asking (three angles per concern, one role table per family) and which are empty ("is this secure?"), plus the decisions/mdl fields that make a request worth reusing.
---

An MM3 request is only as good as its questions. The schema (`references/request.schema.json` in the `mm3` skill) enforces the *shape* — exact counts, one kind per category, numbered with no gaps. It cannot tell a sharp question from a vacuous one. This skill teaches the difference before you write either.

Read this before filling in `ask:` on a template — `mm3 template <verb>` gives you the plumbing; this gives you the questions.

## Contents

- What a probe is and how depth counts probes
- The contract in one screen
- A concern is one path; its three probes are three angles on it
- What makes a good probe and Bad probes, and why
- Decisions: severity, route, and the optional scope check
- [A good/bad pair per family](references/probe.md): worked examples for every family
- [mdl in about 70 tokens](references/mdl.md): what to tag a request with so the ledger learns
- [One recipe per verb](references/recipes.md): class, drill, scan, loop, replay, view

## What a probe is

**A probe is three well-formed questions that look at one problem from three angles.** TypeSafe defines what a good question is: one measurable fact, nothing stacked, nothing subjective. A single question can still push the answer the wrong way, so MM3 never relies on one. It asks three, from three angles chosen by the problem's **family** (for injection: reach, guard, sink). Agreement across the three makes the category's result more accurate and more consistent, and when they disagree you can see where it fails. The families and their angles are in the table below; `other` is for a problem that fits none, and you name its three angles yourself.

**Depth is how many probes you ask.** `quick`, `standard` and `thorough` mean 3, 6 or 9 probes by default (9, 18 or 27 questions). A project can change the numbers in `config.yaml`.

In the request YAML a probe is one `concerns:` category holding exactly 3 questions (the field name is part of the contract and stays as it is).

## The contract in one screen

`ask:` has two sections:

- **concerns** — one category per probe: 3, 6 or 9 of them for quick, standard or thorough by default (9, 18 or 27 questions; a project's config can change the counts), each with **exactly 3 yes/no questions**.
- **decisions** — 2–5 categories, scale or choice only, at least one of each kind. These don't count toward depth.

Why exactly 3 probes, never 1? A single yes/no like "is this handler secure?" can't disagree with itself — there's nothing for `need:` to weigh, and nothing tells you *where* it fails if it does. Three probes that each check a different point on the same path can disagree, and when they do, that disagreement is the finding: reach and sink both read unsafe while guard reads safe is a very different result from all three reading unsafe. One question gives you a verdict with no evidence behind it; three angles give you a verdict you can act on.

## A concern is one path; its three probes are three angles on it

Pick a **family** for the concern (an optional field, defaulting to the category name when that name is itself one of the eleven: `access · injection · secrets · input · output · availability · correctness · design · design-risk · done · other`). Each family has its own three roles — the three places along that concern's path where something can go wrong:

| family | role 1 | role 2 | role 3 |
|---|---|---|---|
| injection | reach — does untrusted input get here | guard — is it checked on the way | sink — does it hit a sink that runs or queries it |
| access | actor — whose identity is used | check — is ownership/role verified | resource — what's returned or changed |
| secrets | store — where it lives at rest | transport — how it moves | exposure — where it can surface |
| input | source — where the value comes from | validate — what's checked before use | reject — what happens when it fails |
| output | source — what data feeds the response | encode — is it escaped/encoded for its context | render — where and how it's emitted |
| availability | trigger — what can invoke the costly path | limit — is there a cap or throttle | recovery — what happens when it's exceeded or fails |
| correctness | input — what the function receives | rule — the specific rule it must satisfy | result — what it actually returns/does |
| design | responsibility — what this piece owns | dependency — what it relies on | testability — can it be verified in isolation |
| design-risk | abuse — how it could be misused | failure — how it degrades or breaks | data — what it stores or exposes it shouldn't |
| done | concrete — specific and scoped | testable — has a checkable definition | owned — has a named owner |
| other | — | — | — |

`other` has no fixed roles: it's the escape hatch for a concern that doesn't fit the ten above. Still write three distinct, observable probes — just name the three roles yourself instead of borrowing one of the rows.

A good category names one of these families explicitly (`family: injection`) whenever its own name doesn't already match one of the eleven — a category named `reach`/`guard`/`sink` (common in `drill`, where the parent's angles each become their own concern) still belongs to the `injection` family, it just isn't spelled that way in the category name.

[`references/probe.md`](references/probe.md) in this skill has a full good/bad pair for every family above.

## What makes a good probe

1. **It could flip the gate.** If the answer came back the other way, the category's verdict — and what you'd do next — changes. If nothing would change, cut it.
2. **It plays a role no sibling probe plays.** Two probes in the same role are a paraphrase of each other: cost with no added clarity.
3. **It's observable in the code you sent.** A reader can point at the line that answers it — not infer it from how the code behaves at runtime, and not offer an opinion about it.
4. **One judgment.** Don't chain two questions with "and" — that's two probes wearing one number.
5. **One polarity per category.** Every probe in a category answers the same direction for `pass:` — don't mix "is it unsafe" with "is it free of X" in one category.
6. **Names the element when more than one could be meant** — `` `id` `` or `` `req.query.id` ``, not "the value," when the code shown has several candidates.
7. **Asks about the property (invariant), not the fix mechanism.** Phrase a probe about the invariant a fix establishes — the thing that stays true no matter how the code is later written — not the specific mechanism or line that happens to make it true today. Name the function/variable/symbol involved (backtick it); never a line number.

## Invariants over mechanisms, and why

Two real cases broke probes written the other way round:

- **research.js, a reject-and-replace fix**: a `guard` probe was written against the specific check the first fix added ("does it call `isValidUrl` before the request?"). The next fix replaced that check with a different mechanism entirely (reject-and-replace instead of validate-and-allow) — same invariant (untrusted input can't reach the request), different code. The probe's premise was gone, so it re-scored low (0.19/0.15) on a fix that was actually correct, because it was really asking "does the old mechanism still exist?", not "does the property hold?".
- **Line-number-anchored probes** ("does the check at line 32 catch this?"): once the fix shifted surrounding lines, four probes anchored to line numbers kept reading `still` against code that had already moved past them — the lines they pointed at no longer held the logic they were written about.

Write the probe about the outcome instead: "Is the URL validated (by whatever mechanism) before the request is made?" survives a reject-and-replace rewrite; "Does `isValidUrl` gate the request?" doesn't. "Does `handleRequest` reject a malformed URL before dispatching it?" survives a line shift; "does line 32 reject it?" doesn't.

## Bad probes, and why

"Is this method secure?" and "Does this method have security features?" both fail rule 3 above: neither names a mechanism, a role, or a place to check. A "yes" to either proves nothing — there's no code line that makes it true or false, so the model is really just guessing at a vibe. The same failure shows up in a subtler form: "Would a standard security scanner flag this code?" sounds concrete, but it isn't observable in the code itself — it's a guess about a *different* tool's behavior, not a fact about this one.

The fix is to split by role. Instead of one opinion question about an injection concern:

- **reach**: "Is `id` taken from `req.query` and passed to `findUser` without validation?"
- **guard**: "Is `id` bound as a parameterized argument rather than concatenated into the query string?" (note the flipped polarity from reach/sink — say so in the category's `pass:`)
- **sink**: "Does `findUser` run the query with `db.query` on that string?"

Each one names a variable, a function, and a line a reader can actually check. None of them ask for an opinion.

## Decisions: severity, route, and the optional scope check

Every request's decisions section needs at least one **scale** and one **choice**. Two patterns cover almost every request:

- **severity** (scale): concrete levels a reader can place a finding at without comparing it to its neighbors — `none, low, medium, high, critical`, each meaning something specific on its own (e.g. "critical: exploitable with no auth"), not just "worse than the one before it."
- **route** (choice): what should happen next, always including the "nothing to do" option — `ship, fix, block` (`ship` *is* the none-needed answer; there's no separate "none" entry needed when one option already means that).

A third, optional pattern is worth adding to `class`/`scan` whenever the code you sent might not be the whole picture: a **scope** choice, `enough, partial, missing` — `partial`/`missing` are both a signal to widen `where:` and re-run, not to trust the verdict as-is.

## mdl and the recipes

Two short files hold the rest, linked directly from here:

- [mdl in about 70 tokens](references/mdl.md): the free context the ledger learns from (`why`, `area`, `uses` as C4 chains, `touches`, `blast`).
- [One recipe per verb](references/recipes.md): how each verb shapes its probes (class, drill, scan, loop, replay, view).

`mm3 agent probe` (and `mm3 help probe`) carry the enforced phrasing rules this skill builds on, cited to their TypeSafe source pages, plus this same role table and good/bad pair in a dense, no-prose form.

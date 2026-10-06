# One recipe per verb

- **class** — one subject, the full contract: `3k` concerns categories × 3 angles, plus decisions. Name the file and line range in `where:`; name the element in a probe whenever `where:` covers more than one file.
- **drill** — starts from one flagged concern or item, never cold. The parent's 3 angles each become their own new concern here, re-probed 3 ways of their own — going from "the injection concern failed" to "specifically the guard step failed, at this call."
- **scan** — one concerns/decisions block, written once with a `{blank}` for the finest layer (e.g. `{function}`), applied to every item that layer sweeps. Add a severity scale to rank findings worst-first.
- **loop** — the deepest layer (e.g. `story`) carries the full contract; `design`/`design-risk`/`done` fit an idea better than code-specific families like `injection`/`secrets`.
- **replay** — no new probes at all: it replays the parent's exact questions on two git states. The only new field is `expect:`, your own prediction of which parent concerns should flip to pass.
- **view** — a free, no-spend check of a draft's `ask:` against everything above, before you pay for a real run.

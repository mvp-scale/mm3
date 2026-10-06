<h1 align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/wordmark-dark.svg"><img src="docs/assets/wordmark-light.svg" width="280" alt="MM3"></picture></h1>

<p align="center"><b>Knows in ~20 ms. Learns in ~500 ms.</b></p>

<p align="center">The memory and decision layer for coding agents. Every answer is citable.</p>

<p align="center"><a href="https://github.com/mvp-scale/mm3/actions/workflows/ci.yml"><img src="https://github.com/mvp-scale/mm3/actions/workflows/ci.yml/badge.svg" alt="CI"></a> <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0 license"></a> <a href="#install"><img src="https://img.shields.io/badge/node-%E2%89%A5%2022.13-3c873a" alt="Node 22.13 or newer"></a></p>

<p align="center"><img src="docs/assets/how-it-works.svg" width="900" alt="How MM3 works. MM3: make and model. Six verbs in two bands and three columns. MAK³, make, use what is proven: view is a free lookup of the ledger, class gives one verdict for one subject, replay rechecks after a fix. MDL³, model, learn what is missing: scan sweeps to find where to look, drill digs into one weak spot, loop vets a design before code. The columns are Know, Judge and Prove. One ledger sits under all six and learns."></p>

## Install

In Claude Code, from your project:

```text
/plugin marketplace add mvp-scale/mm3
/plugin install mm3@mvp-scale
```

Pick **project** scope. Claude asks for a TypeSafe API key (masked, optional): press Enter on "TypeSafe API key", paste, Enter, then "Save configuration". Leave it empty to add one later with `mm3 init`.

The plugin carries its own copy of MM3 and gives Claude the `mm3` tool, so Claude can run every command (`mm3 config --load` included) without anything else installed. It is updated through Claude Code, like any plugin.

In your own terminal (optional, needs Node 22.13+). Run it without installing anything:

```bash
npx @mvpscale/mm3 config
```

or install the command once, pinned to the version you ran:

```bash
npm install -g @mvpscale/mm3
mm3 init
```

`mm3 doctor` says which `mm3` your terminal finds and warns when its version differs from the one running, with the fix (`mm3 init`). After you update the plugin, run `mm3 init` once to bring the terminal copy along. `mm3 init` never uses sudo and never edits your shell profile: it installs into your user folder (`~/.local`) and prints the one `export PATH=...` line if that folder is not on your PATH.

**Status: beta.** It works well and we use it ourselves; formal benchmarks are coming. The plugin and the npm package are both out.

### Try it locally

Bring a TypeSafe API key. MM3 wraps TypeSafe's API (Jev at `api.typesafe.ai`), and any TypeSafe endpoint works. Your key stays out of your project: Claude Code keeps it in its secure storage, `mm3 init` in your OS keychain (or a 0600 file). To switch endpoints:

```bash
mm3 config            # see the settings in effect, the endpoint included
mm3 config --write    # create .mm3/config.yaml, then uncomment baseURL: and set it
mm3 config --load     # check the file and record the load in the ledger
TYPESAFE_BASE_URL=https://api.example.com mm3 class review.yaml   # or for one run only
```

Then just ask your agent. The [MM3 skill](skills/mm3/SKILL.md) tells it when to reach for MM3, which verb fits and how to write the request; you read the verdict.

## See it run

**The challenge:** you host n8n yourself and want it to run faster. You ask your agent where to start. It narrows the question to one place, the node loader's cleanup in `directory-loader.ts`, and asks MM3 twelve questions about it in one call: nine yes/no, two decisions and the goal itself.

<br>

<p align="center"><img src="docs/assets/demo-strip-n8n.svg" width="900" alt="A real MM3 quick class run on n8n (MM3-0008). On the left, a coding agent is asked where n8n could be faster and runs one mm3 class request: 12 yes/no and decision questions, one call, 321 ms, about $0.00006, and a next move. On the right, the run's real YAML: the request opens folded (one claim, with concerns, decisions and an mdl block collapsed to fit) and a pointer unfolds each in turn; then the whole response (verdict, gates and odds per concern, consensus and the next command) and what the ledger now holds, where looking the same request up again is free."></p>

<br>

The request the agent wrote (45 lines):

<p align="center"><img src="docs/assets/example-request.svg" width="900" alt="The request the agent wrote for MM3-0008: one goal on one file, three concerns of three yes/no questions each, two decisions, and an mdl block saying why it asked."></p>

The response, **real output · jev-1.13.0 · api.typesafe.ai · 321 ms · ~$0.000063**:

<p align="center"><img src="docs/assets/example-response.svg" width="900" alt="The response to MM3-0008: the gate fails; a gate and odds per concern and decision, consensus SPLIT, escalate true, what the mdl block recorded, and the next command."></p>

- Every concern is written so that "no" is healthy: a `pass: no` answer clears the bar at 0.30 or below.
- **Goal: pass** (0.79). Yes, this cleanup could be faster.
- **Availability: fail.** At 0.88, the `realpathSync()` calls on line 606 block the event loop.
- **Design: fail** on all three: a rescan on every `unloadAll()` call (0.78), a try-catch that silently skips errors (0.90), and caching would help (0.84).
- **Design-risk: unsure.** None of 0.40, 0.46, 0.64 lands clearly either way.
- **Decisions:** measure first passes (0.89); severity is unsure (low, 0.56).
- **Next:** the concerns disagree, so consensus is SPLIT, `escalate` is true, and `next:` points at a drill into availability. The `mdl:` line lists what the ledger recorded about why the agent asked, so later runs on this code start from it.

## Why MM3

An agent can ask a fast classifier a yes/no about your code, but on its own that answer is untraceable and never reused. MM3 asks the same way every time, scores the answer and keeps it, so every check adds to what you know about your codebase.

**Three angles, three kinds of knowledge.** Every concern is asked three ways, so no decision rests on one look. Every request keeps what you asked, the scored verdict and the problem you were working on. Know what you know, judge fairly, prove it.

The name is **MAK³** (make) plus **MDL³** (model), each across Know, Judge and Prove. It started as Sidewise; we hope you like the new name.

**MAK³ uses what is proven.** Know what's been done here before you act, judge one claim, prove the change.

<p align="center"><img src="docs/assets/story-mak.svg" width="900" alt="MAK3 make. view: your codebase memory, every past check searchable in milliseconds, free. class: turns is this OK into a question set you can measure, reuse and cite. replay: tests for your judgments, rerun any past check on any two commits."></p>

**MDL³ learns what is missing.** In code you don't know yet: take a census, follow the flag, prove the design before anyone builds it.

<p align="center"><img src="docs/assets/story-mdl.svg" width="900" alt="MDL3 model. scan: a census of the present, same questions every file, comparable answers. drill: turns a flag into a fix target and hands it back to class and replay. loop: proves the design before a line of code exists."></p>

view knows the past, scan the present, loop the future. Any order; every run feeds the next.

**The ledger is our favorite part.** One append-only JSONL file. The runs you'd make anyway become a heat map at 10, a reference architecture at 20, a knowledge graph at 50. And `mdl:` is open: keep the stock fields, add your own, free, and your agent paints any of it back from the log or the SQLite index.

```yaml
mdl:
  # stock
  why: find                    # validate · find · debug
  area: [build, hosting]       # where in the stack
  stage: operate               # design … operate
  problem: n8n startup scans node_modules with sync FS calls     # one line, your words
  uses:                        # C4 chains
    - person:self-hoster -> system:n8n -> container:n8n-main
    - container:n8n-main -> component:core/nodes-loader -> code:unloadAll
  blast: container             # how far a failure reaches
  # yours: any key, any lens
  hypothesis: caching symlink roots cuts cold start by a third   # developer
  user-feels: first workflow after a restart is slow             # product
  cost-driver: every pod restart pays the full scan              # business
  pager-risk: none, slow not down                                # on-call
  tags: ["#perf", "#cold-start", "@platform-team"]               # common dev tags: #topic, @owner
  refs: [BUG-1042, "test:startup-bench failed"]                  # bugs, test results, anything to link
```

Once a field settles over a few runs, `mm3 report fields --accept tags` promotes it: every tag becomes a node in the knowledge graph, tied to the runs that carried it.

<p align="center"><img src="docs/assets/story-ledger.svg" width="900" alt="The MM3 ledger. One append-only JSONL file, filled by runs you were making anyway. The same 10 runs give you a layered heat map of your architecture; 20, a reference architecture with a heat map; 50, a knowledge graph of your whole system. The mdl block is yours: add any field to any request, such as standard or owner, for free. Your agent reads the log or the SQLite index in milliseconds and paints charts, maps and graphs. Where your agents are strong, and where they are not."></p>

Same questions on unchanged code come back from the ledger: no call, no cost. `mm3 report` shows where your agents keep going wrong, and a budget cap that only you raise stops runaway spend.

## Architecture

That's all of it: one engine on your machine, one folder in your project, one call out. Simple on purpose, built to grow.

<p align="center"><img src="docs/assets/architecture.svg" width="900" alt="MM3 architecture. Any coding agent calls MM3 through its MCP tool or the mm3 CLI. MM3 runs on your machine: it reuses answers it already has and pays only for new questions, sent to a TypeSafe-compatible classifier endpoint (typesafe.ai or self-hosted), its only outside call. In your project it reads code and git as evidence, appends every run to log.jsonl, the append-only ledger and the only source of truth, and keeps index.db, a read-only hot cache of the ledger that rebuilds itself and answers lookups in under a millisecond, tested to 100,000 runs. No server, no MM3 account, no telemetry. config.yaml sets the budget cap, endpoint and model, reuse rules and your own mdl fields, and is the one file in .mm3/ that git keeps. MM3's whole footprint in your project is the .mm3/ folder."></p>

## Journeys

Each journey asks one question: **can a smaller model, with MM3, learn more about a real codebase for less?** One agent, a $1 cap that covers everything, the same three beats (Know, Judge, Prove). Every run is on file in [mm3-journeys](https://github.com/mvp-scale/mm3-journeys), so you can rerun it and compare.

| | The hook | Status |
|---|---|---|
| 1 | [WordPress](#journey-1-wordpress): make every page render per reader, core untouched | done: 8 of 12 right, 28k tokens written, under $1 |
| 2 | Turn one dial: what changes when a decision gets more questions? | planned |

### Journey 1: WordPress

**The hook:** take WordPress 7.1.2 as it ships and teach it to render a page differently for each reader, as a plugin, core untouched.

<p align="center"><img src="docs/assets/journey-card.svg" width="900" alt="Journey 1, WordPress 7.1.2: make every page render per reader, as a plugin, core untouched. Agent Claude Sonnet 5.5; 28k tokens written and 2.6M read from cache; MM3 14 runs, 15 calls, about a tenth of a cent; about 15 minutes; 8 of 12 right against our answer key. Know: four runs map the boot layers, user meta and render chain (MM3-0001 to 0004). Judge: the plan and the definition of done each had gaps, a drill found four missing checks, and the fixed version passes them (MM3-0006 to 0011). Prove: nine behaviour checks met, a header-after-output risk found and fixed, a replay shows zero regressions (MM3-0012 to 0014). A gap is a requirement MM3 found: gap is fail, open is unsure, met is pass."></p>

**The recap:** one agent mapped WordPress, checked its plan before writing code, then committed a small plugin and proved what held. MM3 cost about a tenth of a cent. The agent cost about $0.98 at today's list prices, so the whole journey came in under the $1 cap.

**How to read it.** A gap is a requirement MM3 found, not a failure: gap is fail, open is unsure, met is pass. The agent's figures are counted from its session's token usage and priced at list; the score is against our own answer key. Every verdict came from reading code, not running WordPress. It missed WordPress's Block Bindings API, and `replay` can't yet compare against a file that didn't exist before (it's beta).

**What we prompted** (the goal, verbatim; the beats and budget follow in the [full brief](https://github.com/mvp-scale/mm3-journeys/tree/main/wordpress/run-3-each-beat/brief.md)):

> **Goal:** a page in WordPress renders differently depending on a simple persona of the current user, built from what WordPress can already see about them (what they read, what they like, what they adjusted). It only has to prove the page can change by persona; how accurate the persona is doesn't matter. Build it as a plugin under `src/wp-content/plugins/`; don't edit WordPress core or the bundled themes.

**All of it is public:** the brief, the notes for each beat, the diff, the score against our answer key and the full ledger for each of the three runs: [run 1, bare brief](https://github.com/mvp-scale/mm3-journeys/tree/main/wordpress/run-1-bare-brief), [run 2, plugin guidance](https://github.com/mvp-scale/mm3-journeys/tree/main/wordpress/run-2-plugin-guidance), [run 3, each beat spelled out](https://github.com/mvp-scale/mm3-journeys/tree/main/wordpress/run-3-each-beat).

> [!IMPORTANT]
> **Lessons learned.** The prompt decides whether your agent uses MM3 as a map or as a spot check: 2 runs on a bare brief, 14 when each beat was spelled out.
>
> **Corrective action.** If you want the map, spell the steps out in your agent's brief; the run 3 brief linked above is a starting point. MM3's own guidance stays short on purpose, because one `class` call is often the whole job. `mm3 init --agents` adds a pointer to MM3's command cards to `AGENTS.md` and points `CLAUDE.md` at it.

## Run it

Let your agent drive. `mm3 agent` prints every command and rule in one dense card built for agents, and `mm3 agent <verb>` gives one verb's rules with good and bad examples. Claude agents read it and run the commands just fine, down to Haiku: it drove both of our stories end to end.

For humans, `mm3 help` is the same contract in plain words, and `mm3 template <verb>` prints a filled-in request with its rules as comments. Four jobs to start with:

- **Check a change before you merge it.** One `class` call, three angles per concern, a verdict for each. Start with `mm3 template class`.
- **Prove a fix actually worked.** `replay` re-asks a past run's own questions across two commits, so you check the fix without re-checking everything. Start with `mm3 template replay`.
- **Find where a problem lives.** `scan` sweeps a folder and ranks the files that most need a look. Start with `mm3 template scan`.
- **Check a design before any code exists.** `loop` puts a plan through the same checklist before anyone writes it. Start with `mm3 template loop`.

<details>
<summary>Run it by hand</summary>

Every line below runs in order in a fresh project:

```bash
# mm3-quickstart
mm3 template class > review.yaml
mm3 class review.yaml
mm3 view src
mm3 report
mm3 outcome MM3-0001 held --by you
mm3 budget
```

Add `--dry-run` to any request to validate it and count its questions without a call. With no key set, MM3 falls back to a built-in sample provider so these lines still run; its answers are canned and labelled, never evidence.

</details>

## Limits and alternatives

- **Advice, not action: it gives the odds, you make the call.** Delete, deploy, drop and pay stay human.
- **A pass is a probability: a [calibrated](docs/numbers.md#what-calibrated-means) 0.9 is wrong one time in ten.** `unsure` is a real answer, and `mm3 outcome` shows which verdicts held.
- **Run linters, scanners and tests first: they're free and exact.** MM3 takes the questions they can't ask, like "does this handler check the caller?"
- **First principles still apply: map your architecture first.** A few cheap checks name the layers (tag requests with `mdl.uses`) and `mm3 report graph` draws them. Every later question then lands in a known place, and reading it back is free.
- **Use a full review for open questions.** A model that reads the whole codebase answers anything. MM3 answers yes/no.
- **Beta: works well in our own use and on an intentionally vulnerable app (OWASP NodeGoat).** Formal benchmarks are coming.

## Docs and contributing

- [The contract](docs/contract.md): every claim the answer format makes
- [Evidence for each claim](docs/evidence/README.md) and [where the numbers come from](docs/numbers.md)
- [The agent skill](skills/mm3/SKILL.md), and `mm3 agent` / `mm3 help` in your terminal
- Contributing: see [AGENTS.md](AGENTS.md) for commands, test tiers and rules. Open pull requests against the `nightly` branch.

## License

[Apache-2.0](LICENSE) · [Contributing](AGENTS.md) · [Issues](https://github.com/mvp-scale/mm3/issues)

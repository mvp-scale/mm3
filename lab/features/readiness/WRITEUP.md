# Readiness: install compliance across the supported agents

**What it is.** `npm run readiness` proves, per release-sized change, that each supported agent accepts MM3 through its own
commands, with and without the right Node, and that the standalone failover takes over when Node is missing or too old. Every
cell is recorded in `test/readiness/ledger.jsonl` (hash-chained like the ceremony ledger); `-- --report` prints the newest run.

**Levels.** L1: the marketplace/plugin install (or direct MCP registration) ran without error. L2: the agent's own list command
shows what it registered. Nothing past L2 is tested: no key, no sign-in, no model call. For agents whose list command starts the
server (Claude, OpenCode, Cursor, Gemini) L2 also means "connected"; for the others it means "registered".

**Method.** One throwaway container per cell: clean Ubuntu 24.04, six Node states (none, stock 18.19, 20.18, 22.12, 22.13, 24.21),
each route run twice: primary (the plugin folder as `npm pack` ships it, started with node) and failover (the same folder with the
launcher manifests, the built standalone served from 127.0.0.1 and checked against a pin written for the run). Linux only, on
purpose: an agent that takes the same commands here takes them elsewhere.

**First run (RDY-0001, MM3 0.1.4, 144 cells, 97 reached L1+L2).**
- Claude, Droid, Amp: plugin/MCP accepted on every Node state; where Claude's server cannot start (no Node) the failover connects.
- OpenCode (MCP route) and Cursor (MCP route): primary fails at L2 with no Node, failover connects after one verified download.
- Gemini: the CLI itself needs Node 20+ (crashes on stock 18, cannot run with none). Its extension route fails because MM3 ships no
  `gemini-extension.json`; its direct-MCP route works from Node 20 up and falls over to the standalone on 20 and 22.12.
- Codex, Copilot: the agent needs Node to start at all, so there is nothing for a failover to do on a machine without Node.
- OpenCode plugin route: not an OpenCode plugin ("No plugin targets found"). Goose: install ran, no list command to read it back.
- Aider: no plugin or MCP surface.
- The standalone was downloaded exactly in the failover cells with no Node or Node below 22.13, and in none of the 22.13+ cells.

**Harness finding worth keeping.** Cursor does not pass its own environment to an MCP server, so the test-only download address
had to be written into its config; before that, Cursor's failover looked broken and was not.

**Run it when** the Node floor, the standalone, the launcher, the plugin manifests or the supported agent list change.
Needs Docker, the network (the image installs the agents) and `npm run build:binary -- --target linux-x64`.

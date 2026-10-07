# Single-file binary: write-up

Status: research complete for the first route; nothing built into the repo yet. Items marked **tested** were run; **docs** come from Node's or another project's documentation; **secondary** are web write-ups not confirmed in the project's own docs; **unverified** means not checked.

## 1. The problem

MM3 needs Node 22.13 or newer, because the ledger index uses `node:sqlite` (`package.json` engines; `src/util/node-version.ts`). Earlier Node has no built-in SQLite, and a Node 20 host once ran with the index silently never built, so the floor was made a hard stop (contract claim C-107).

Three consequences:
- Anyone on Node 20 or older cannot run MM3.
- The Claude Code plugin launches `node bin/mm3.mjs mcp` (`.claude-plugin/plugin.json`), so it needs a suitable `node` on the user's PATH. A user who installed Claude Code without Node has nothing to launch (I believe Claude Code installs natively without Node; **unverified**).
- Node alone costs about 60 ms of start-up (**tested**: `help` 0.06 s, `report hits` 0.08 to 0.10 s on Node 22.23), most of a 100 ms budget.

Facts about the code (**tested** or read): 17,479 lines of TypeScript, one runtime dependency (`yaml`), Node built-ins only plus `node:sqlite`, and it shells out to `git`.

## 2. What was compared

| option | needs Node installed? | result |
|---|---|---|
| Relax the Node floor (run old Node without SQLite) | yes | **tested** on Node 20.20.2 and 18.20.8 with a patched scratch bundle: the six verbs, `view`, `report hits`, `patterns`, `history` and `outcome` work; the SQLite graph reports (`problems`, `graph`) degrade to a clean "needs node:sqlite" line; no index file is written. Reach without the SQLite-powered features. Not chosen on its own |
| **Node single-file executable** (Node's own feature, `postject` flow) | no | **tested**, works (section 4). **Chosen first** |
| Bun `--compile` | no | cross-compiles to eight targets (**docs**); a different runtime, so a SQLite adapter and a re-test would be needed; not tried |
| Go or Rust port | no | smallest and fastest endpoint, a full rewrite of about 17.5k lines; the contract, golden and CLI-level tests serve as the acceptance test. Gated on real numbers |
| SQLite as WebAssembly inside the JavaScript (`sql.js`) | yes (any Node) | **tested** on Node 20.20.2: SQLite 3.49.1, 658 KB, 26 ms start, JSON, window and recursive queries work, 100,000 rows insert in 200 ms, a JSON group-by over 100,000 rows in 133 ms, save and reopen works; **no full-text search (FTS5) in the stock build**; the official `@sqlite.org/sqlite-wasm` package did not load in Node. A possible fallback for the npm route |
| Native SQLite add-on | yes | not universal (per-platform prebuilds); not tested |

"Universal" correction: no single file runs on every operating system, in any language. Go and Rust also produce one file per OS and chip. What a single-file Node build gives is a program that carries its own runtime, so the user's Node version stops mattering.

## 3. Decided and proposed

**Decided by the owner:**
- Name: **standalone** (2026-10-07). "Single-file binary" is only the build method. What people see is one line: "One file. No Node, no npm. Download it and run it." The standalone is the product; npm (for people who already have Node) and the plugin (text only, pointing at the standalone) are other ways to get the same engine.
- Build the standalone as the next feature, run it through the existing tests.
- Distribution costs nothing: no paid certificates or accounts.
- Follow the ripgrep-style release practice, Windows included.
- Research stays out of main.

**Proposed, not yet decided:**
- Base the binary on Node 24 LTS (24.15 or later), where `node:sqlite` is a release candidate with no experimental warning (**secondary**); Node 22 still carries the earlier status.
- The plugin stays text-only; the binary is a separate, explicit install; `mm3 init` points the MCP server at a binary on PATH when Node is missing or too old.
- A Go or Rust port only if measured size or start-up justifies it.
- v1 targets: Linux x64, Windows x64, macOS arm64.

## 4. What was tested

Everything below used the offline sample provider (no key, no spend) in throwaway projects; the repo was not modified.

| build | checks | result |
|---|---|---|
| Linux x64, Node 22.23.3, run with an empty environment and no PATH | `help`, `doctor`, `class --dry-run`, a real `class`, `view`, `report hits`, `patterns`, `outcome`, `report problems`, `report graph`, `agent`, MCP `initialize` and `tools/list` | all work, 57 to 145 ms; `template` fails (see gaps) |
| Linux x64, Node 24.21.0, smoke script | the same set | 11 passed, 0 failed; `template` is a known gap |
| Windows x64 `.exe`, Node 24.21.0 (cross-built on Linux from the official `node.exe`), under Wine 9.0 | `help`, `doctor`, `class`, `view`, `report hits`, `report problems`, `report graph` | all ran. Wine is not Windows: it proves the file is a valid, runnable program, not a pass on a real machine |
| start-up and memory | `help`, three runs each | executable 0.05 to 0.10 s and 68.5 MB; Node bundle 0.08 to 0.09 s and 56 MB |

File sizes: Linux x64 127 MB (Node 24), Windows x64 94 MB.

**Gaps found:**
- `template` reads `skills/mm3/templates/*.yaml` from disk, which are not inside the executable. Fix (small, a guess): embed them with the executable's asset support, or generate a source file from them at build time. Other places that read package files need the same check.
- **Not tested:** a real Windows machine, macOS (build and signing), arm64, Alpine, `scan`, `drill`, `loop` and `replay`, the repo's own e2e and flows tiers against the binary (their harness launches the CLI as a process, so the swap is one setting), and a clean machine that has never had Node.
- The Windows build is unsigned; injecting invalidates the original Node signature, as expected.

## 5. The build method

One recipe, the same on every OS; only the base binary and the signing step change. Node has no `--target` flag, so each target's own official Node binary is the base (**docs**). The one-step `--build-sea` flag exists only from Node 25.5; on Node 22 and 24 (checked on 22.23 and 24.21) it is not available, so the `postject` flow is the method.

1. Pin an exact Node version and the SHA-256 of the official download, and the `postject` version.
2. Bundle with esbuild to one CommonJS file, mapping `import.meta.url` to the executable (inside the executable `process.argv[1]` is the executable path), and embed the template files.
3. Write the blob with code cache and snapshot off (required when build and target platforms differ).
4. Download and checksum the target's official Node; copy it.
5. macOS: remove the signature; Windows: remove it (optional); Linux: nothing.
6. Inject with `postject` and the fixed sentinel fuse (macOS adds the segment name `NODE_SEA`).
7. Sign: macOS ad hoc at minimum (arm64 requires a signature); Windows when a certificate exists; Linux none.
8. Run the smoke script on a machine that has never had Node.
9. Publish checksums, an SBOM and a build attestation.

One Linux machine built both the Linux and the Windows files here. Node's documentation recommends a native runner per platform mainly for signing (macOS `codesign` runs only on a Mac) and testing.

**Smoke script (same checks in shell and PowerShell):** `help`, `doctor`, a real `class` run, `view`, `report hits`, `patterns`, `outcome`, `report problems` and `report graph` (proves the embedded SQLite), `template`, an MCP handshake, and the repo's e2e and flows tiers against the binary. A target is done when it passes on a clean machine.

## 6. Release layout and signing (all free)

Modelled on ripgrep and similar tools (**secondary**):
- One archive per target (a `.zip` for Windows, tarballs elsewhere), a `.sha256` file beside each, an SBOM and a GitHub build attestation (`gh attestation verify`).
- The same binaries as npm platform packages (the esbuild and Biome pattern, which uses no install scripts), so `npx @mvpscale/mm3` keeps working; package-manager manifests (Homebrew, Scoop, winget) later.

Signing, free options only (**secondary**; check each program's current terms):
- Windows: ship unsigned at first. SignPath Foundation signs qualifying open-source projects for free; reported conditions include an OSI licence, a public repo, active maintenance, a project already released in the form to be signed, builds from public CI, and some verifiable reputation. An unsigned file can trigger SmartScreen, and Smart App Control on Windows 11 can block it with no per-app override; the npm route remains for those machines.
- macOS: ad-hoc signing is free and required on Apple Silicon. It does not satisfy Gatekeeper for browser downloads; `curl` and Homebrew downloads are not quarantined. Proper signing and notarization cost $99 a year and are not planned.
- Linux: no operating-system gate; trust comes from checksums, attestations and package managers.

## 7. How plugins install and run

**Docs** (Claude Code) and **secondary** (Gemini CLI):
- Claude Code copies a marketplace plugin into a cache folder; nothing runs on install. Hooks, MCP servers and background monitors run later; files in a plugin's `bin/` folder go on the shell tool's PATH. An MCP server's `command` may be a bare command on PATH or a path under the plugin root. How Windows resolves `.exe` or `.cmd`, per-platform variants, plugin signatures and size limits are **unconfirmed** in the documentation.
- The one documented route for fetching files after install is the automatic npm dependency install (registry only, https only, no install scripts, a 60-second timeout), which may not fit a 125 MB download.
- Gemini CLI clones the extension repository and launches each `mcpServers` command at startup; no sandbox for that command was found.

So a plugin installs files, not an executable as such, but its manifest can launch one. The recommended shape (proposed): keep the plugin text and JavaScript only, ship the binary as a separate install, and let `mm3 init` point the MCP server at it by name from PATH.

## 8. Work plan and done-when

Sizes are guesses (S about 1 day, M about 2).

| task | size |
|---|---|
| Build script with a `--target` argument (steps 1 to 7), one Linux machine | M |
| Embed the template files and check every other package-file read | S to M |
| Test harness takes an executable path; run e2e and flows against the binary | M |
| Smoke scripts for shell and PowerShell; run on clean Ubuntu and clean Windows machines | S |
| CI matrix, checksums, SBOM, attestation | M |
| Release channel (Releases, npm platform packages); `mm3 init` and plugin changes | M to L |

**Done when:** the build script produces the Linux x64 and Windows x64 binaries and a checksum file; `test:cli` and `test:flows` pass against the binary; `template` works; the smoke scripts pass on a clean Ubuntu and a clean Windows machine that have never had Node.

## 9. Open decisions

1. Node 24 LTS as the base (recommended) or Node 22.
2. Plugin text-only with a separate binary install, and `mm3 init` pointing at it.
3. macOS signing handling: a macOS CI runner for the ad-hoc signature, or a Linux-side tool (unverified).
4. Whether the Go or Rust gate gets defined now (for example a size or start-up threshold).
5. Windows: ship unsigned and apply to SignPath after release and CI builds exist.

## 10. Sources

[Node.js single executable applications](https://nodejs.org/api/single-executable-applications.html) · [same, v25.9 source](https://github.com/nodejs/node/blob/v25.9.0/doc/api/single-executable-applications.md) · [Bun executables](https://github.com/oven-sh/bun/blob/main/docs/bundler/executables.mdx) · [esbuild optionalDependencies change](https://github.com/evanw/esbuild/pull/1621) · [Sentry: publishing binaries on npm](https://sentry.engineering/blog/publishing-binaries-on-npm) · [Node 24.15.0 release](https://nodejs.org/en/blog/release/v24.15.0) · [sqlite release candidate PR](https://github.com/nodejs/node/pull/61262) · [ripgrep releases](https://github.com/burntsushi/ripgrep/releases) · [SignPath Foundation terms](https://signpath.org/terms.html)

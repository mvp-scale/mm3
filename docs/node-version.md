# Node version: MM3 needs Node 22.13 or newer

MM3 needs Node **22.13 or newer**. If yours is older, `mm3` stops with one line that points here, and `mm3 doctor` still runs and shows the same problem. You do not have to change your whole machine: pin the right Node for just this project (below).

## Why 22.13

MM3 keeps a small index of its ledger in `node:sqlite`, a part of Node itself. It became stable in Node 22.13, so older Node has nothing to build the index with. We chose to say so loudly rather than quietly run slower. Node 22.13 and newer covers most of the Node in use today, and Node 20 reached end-of-life on 2026-04-30.

## Check your version

```bash
node --version
```

You need `v22.13.0` or higher (`v24.x` is fine too). `mm3 doctor` shows the same in its `node:` line.

If `node` is not found, Node is not installed: use the official installer or a version manager below.

## The simple route: the official installer

Download the current LTS from <https://nodejs.org/en/download> and run it (macOS, Windows and Linux). It replaces the Node on your whole machine, which is fine if nothing else you run needs an older one. Then check `node --version` in a new terminal.

## The per-project route: pin Node for one project

A version manager installs several Node versions side by side and picks one per project from a small file in the project folder. Nothing else on your machine changes. Pick one tool; all three work. The file goes in the project root, the folder you run `mm3` and Claude Code from.

### nvm (macOS and Linux)

Install nvm with the script from its README (<https://github.com/nvm-sh/nvm>), then open a new terminal:

```bash
cd your-project
echo 22 > .nvmrc
nvm install      # reads .nvmrc, installs that Node and switches to it
nvm use          # in later terminals: switches to the version in .nvmrc
```

nvm does not switch by itself when you `cd`; run `nvm use` in the project (the nvm README shows an optional shell hook).

### fnm (macOS, Linux and Windows)

Install: `curl -fsSL https://fnm.vercel.app/install | bash` (macOS and Linux), or `winget install Schniz.fnm` / `scoop install fnm` (Windows). Turn on automatic switching once.

macOS and Linux, add to your shell profile:

```bash
eval "$(fnm env --use-on-cd)"
```

Windows PowerShell, add to your profile (`notepad $profile`; create it first with `if (-not (Test-Path $profile)) { New-Item $profile -Force }`):

```powershell
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
```

Then, in the project:

```bash
echo 22 > .node-version
fnm install      # no version given: reads .node-version
```

From then on, entering the folder switches to Node 22 by itself. fnm also reads `.nvmrc`.

### Volta (macOS, Linux and Windows)

Install from <https://volta.sh> (Windows: `winget install Volta.Volta`; macOS and Linux: the install command on that page). Then, in a project that has a `package.json`:

```bash
volta pin node@22
```

This writes the version into `package.json` (a `volta` section) and Volta uses it whenever you are in that folder, from any shell or program, with nothing to switch by hand. If the project has no `package.json`, `npm init -y` makes one first.

### nvm-windows

nvm-windows (<https://github.com/nvm-windows/nvm>) switches Node for the whole machine and does **not** read `.nvmrc`, so it is not a per-project tool. On Windows, use fnm or Volta above. If you already use nvm-windows, `nvm install 22` then `nvm use 22` works machine-wide.

## Run MM3 for just one project or agent

- **From your terminal:** pin the project as above, `cd` into it, check `node --version`, then run `mm3`.
- **From Claude Code:** the MM3 plugin starts MM3 with the `node` your shell finds, so start Claude Code from a terminal inside the pinned project. With fnm or Volta the right Node is already active there; with nvm run `nvm use` first. Volta also covers programs not started from a shell.
- **For another agent or CI job:** give it the same version file, or run `node --version` as its first step and stop if it is below 22.13.

## Claude Code without Node

Claude Code's own installer needs no Node. The MM3 plugin installed from npm or the marketplace still starts MM3 with the `node` your shell finds (unchanged), so on a machine without Node 22.13+ use the self-contained MM3 instead: one file per system, with its own Node inside (Linux, Windows and macOS, each on x64 and arm64; six files named `mm3-<version>-<os>-<cpu>` on this repository's GitHub Release, with SHA-256 sums). Its `init` installs it to `~/.local/bin/mm3` and registers a plugin that starts the file itself. The macOS files are signed ad hoc (Apple's free signature, no Apple Developer account), which Apple silicon needs to run them at all; per Apple's Gatekeeper behaviour as reported by other projects (not yet tested on a Mac by us), a file downloaded in a browser is quarantined and needs `xattr -d com.apple.quarantine <file>` first.

The plugin will also be able to do this by itself: a small launcher (`launcher/mm3-launch`) that, without Node 22.13+, downloads the build for your machine once, checks its sha256 against the value pinned in the plugin (`launcher/checksums.json`) and installs it. It ships in the package and is tested on every platform, but the plugin does not start through it yet; that switch is planned for the next release, and this page will say so when it happens. To undo the self-contained install, run `mm3 uninstall`, or delete `~/.local/bin/mm3`.

## Sources

Commands above were checked against current docs on 2026-10-07 (through Context7):

- nvm: <https://github.com/nvm-sh/nvm> (`.nvmrc`, `nvm install` and `nvm use` with no argument, install script).
- fnm: <https://github.com/Schniz/fnm> (install script, winget and scoop, `--use-on-cd`, PowerShell profile line, `fnm install` reading `.node-version`).
- Volta: <https://docs.volta.sh> (`volta pin node@…`, the `volta` section in `package.json`, `winget install Volta.Volta`).
- nvm-windows: <https://github.com/nvm-windows/nvm> (its Common Issues page says `.nvmrc` is not supported).
- Node: <https://nodejs.org/en/download> (official installer, `node -v`).

Not confirmed against those docs: the Volta install command for macOS and Linux (take it from volta.sh), the nvm-windows `nvm install 22` / `nvm use 22` commands (standard, but not shown in what we read), and that nvm needs a manual `nvm use` on `cd` (its optional hook exists; we did not re-read it).

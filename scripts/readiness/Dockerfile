# The readiness image (npm run readiness builds it): a clean Ubuntu 24.04 with its stock Node, the supported agent CLIs
# installed the way their own docs say, and a few official Node builds under /opt/node so a cell can pick its Node.
# Nothing here is MM3: the plugin, the tarball and the standalone are mounted per run.
FROM ubuntu:24.04
ARG NODE_VERSIONS="20.18.0 22.12.0 22.13.0 24.21.0"
RUN apt-get update -qq && apt-get install -y -qq nodejs npm git curl ca-certificates xz-utils python3-pip pipx >/dev/null 2>&1
RUN for p in @anthropic-ai/claude-code @openai/codex @github/copilot @google/gemini-cli @ampcode/cli @factory/cli opencode-ai; do npm install -g --no-fund --no-audit "$p" >/dev/null 2>&1 || echo "npm $p FAILED"; done
RUN PIPX_BIN_DIR=/usr/local/bin pipx install aider-chat >/dev/null 2>&1 || echo "aider FAILED"
RUN (curl -fsSL https://cursor.com/install | bash >/dev/null 2>&1) || echo "cursor FAILED"
RUN (curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | CONFIGURE=false bash >/dev/null 2>&1) || echo "goose FAILED"
RUN for v in $NODE_VERSIONS; do mkdir -p /opt/node/$v && curl -fsSL https://nodejs.org/dist/v$v/node-v$v-linux-x64.tar.xz | tar -xJ -C /opt/node/$v --strip-components=1; done

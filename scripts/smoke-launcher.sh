#!/bin/sh
# MM3 plugin launcher check on macOS (and Linux), real install. Usage: sh scripts/smoke-launcher.sh /path/to/mm3-<version>-<os>-<cpu>   (run from the repo root)
# Copies the repo's plugin into a scratch folder with a pin file written for the given built file, serves the file from 127.0.0.1 as the fake
# GitHub Release, and runs the launcher with NO Node on its PATH: the first start must download the file once, check its sha256, install it
# (~/.local/bin/mm3 under a scratch HOME) and answer an MCP initialize with the real server; a second start must download nothing.
# CI runs it on macos-14 (Apple silicon) and macos-15-intel (.github/workflows/standalone.yml, job macos-launcher). Plain POSIX tools only.
BIN="$1"; [ -f "$BIN" ] || { echo "usage: sh scripts/smoke-launcher.sh /path/to/mm3-<version>-<os>-<cpu> (from the repo root)"; exit 2; }
BIN=$(cd "$(dirname "$BIN")" && pwd)/$(basename "$BIN")
fail() { echo "✖ launcher smoke: $*"; echo "::error::launcher smoke: $*"; exit 1; }
version=$(sed -n 's/^  "version": "\([^"]*\)".*/\1/p' package.json | head -1)
asset=$(basename "$BIN")
key=${asset#mm3-$version-}; key=${key%.exe}
[ "$asset" != "$key" ] && [ -n "$version" ] || fail "$asset is not named mm3-$version-<os>-<cpu>"
sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
W=$(mktemp -d); mkdir -p "$W/rel" "$W/home" "$W/plugin"
for d in .claude-plugin hooks launcher skills bin; do cp -R "$d" "$W/plugin/$d"; done
cp "$BIN" "$W/rel/$asset"
port=$((8700 + $$ % 200))
printf '{\n  "version": "%s",\n  "base": "http://127.0.0.1:%s",\n  "assets": {\n    "%s": { "file": "%s", "sha256": "%s", "bytes": %s }\n  }\n}\n' \
  "$version" "$port" "$key" "$asset" "$(sha "$BIN")" "$(wc -c < "$BIN" | tr -d ' ')" > "$W/plugin/launcher/checksums.json"
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$W/rel" >"$W/server.log" 2>&1 & srv=$!
trap 'kill $srv 2>/dev/null; rm -rf "$W"' EXIT
# wait until the fake release answers (a fixed sleep was not enough on the Intel runner: the first connect then timed out instead of being refused,
# the system drops packets to a port nobody listens on yet); show the server's own log if it never comes up
up=0; n=0
while [ "$n" -lt 30 ]; do
  kill -0 "$srv" 2>/dev/null || break
  curl -s -o /dev/null --connect-timeout 1 --max-time 3 "http://127.0.0.1:$port/" 2>/dev/null && { up=1; break; }
  sleep 1; n=$((n + 1))
done
[ "$up" = 1 ] || { cat "$W/server.log" 2>/dev/null; fail "the local fake release did not start answering on 127.0.0.1:$port (python3: $(command -v python3))"; }
base=$(grep -c 'GET /' "$W/server.log" 2>/dev/null || true); base=${base:-0}    # the readiness request above is not a download
LPATH=${MM3_SMOKE_PATH:-/usr/bin:/bin}   # override only to run this by hand on a machine whose /usr/bin has node
env -i PATH="$LPATH" sh -c 'command -v node' >/dev/null 2>&1 && fail "node is on the launcher's PATH ($LPATH); the check needs a machine without Node"
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}'
start() { # start <n> : one launcher start, stdin open 2 s after the request, a 120 s watchdog; stdout to $W/out.$1, stderr to $W/err.$1
  ( printf '%s\n' "$INIT"; sleep 2 ) | env -i HOME="$W/home" PATH="$LPATH" CLAUDE_PLUGIN_DATA="$W/data" MM3_TEST_RELEASE_URL="http://127.0.0.1:$port" MM3_TEST_WAIT=100 \
    sh "$W/plugin/launcher/mm3-launch" mcp >"$W/out.$1" 2>"$W/err.$1" & p=$!
  ( sleep 120; kill $p 2>/dev/null ) & dog=$!
  wait $p; code=$?; kill $dog 2>/dev/null; return $code
}
gets() { c=$(grep -c 'GET /' "$W/server.log" 2>/dev/null || true); echo $((${c:-0} - base)); }
echo "launcher smoke: $key on $(uname -sm), file $asset ($(du -h "$BIN" | cut -f1))"
start 1 || { cat "$W/err.1"; fail "first start exited non-zero"; }
cat "$W/err.1"
grep -q '"serverInfo"' "$W/out.1" || fail "first start: no MCP initialize answer from the installed file"
[ "$(gets)" = 1 ] || fail "first start: expected 1 download, the fake release saw $(gets)"
grep -q 'checked: sha256 matches' "$W/err.1" || fail "first start: the launcher did not report the sha256 check"
[ -x "$W/home/.local/bin/mm3" ] || fail "first start: $W/home/.local/bin/mm3 was not installed"
v=$(env -i HOME="$W/home" PATH="$LPATH" "$W/home/.local/bin/mm3" --version 2>&1) || fail "the installed mm3 does not run: $v"
echo "installed mm3 --version: $v"
start 2 || { cat "$W/err.2"; fail "second start exited non-zero"; }
grep -q '"serverInfo"' "$W/out.2" || fail "second start: no MCP initialize answer"
[ "$(gets)" = 1 ] || fail "second start downloaded again ($(gets) requests)"
echo "OK launcher smoke ($key): one verified download, installed, answered MCP twice, the second start downloaded nothing"

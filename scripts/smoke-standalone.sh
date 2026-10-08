#!/bin/sh
# MM3 standalone smoke test (Linux x64/arm64, macOS Intel/Apple silicon; plain POSIX tools only: no GNU date %N, no timeout). Usage: sh scripts/smoke-standalone.sh /path/to/mm3-file
# Runs the one self-contained file in a throwaway folder with NO Node on PATH and the offline sample provider (no key,
# no spend): help, doctor, a dry run and a real run of `class`, view, report, outcome, the SQLite graph, template, and
# an MCP initialize over stdio. CI runs it on the built file (.github/workflows/standalone.yml); the owner can run it on a
# clean machine. Windows twin: scripts/smoke-standalone.ps1. Exit 0 only when every check passes.
BIN="$1"; [ -x "$BIN" ] || { echo "usage: sh scripts/smoke-standalone.sh /path/to/mm3-file (must be executable)"; exit 2; }
BIN=$(cd "$(dirname "$BIN")" && pwd)/$(basename "$BIN")
W=$(mktemp -d); cd "$W" || exit 2; mkdir -p src .mm3; printf 'export function f(a: string) {\n  return a.trim();\n}\n' > src/a.ts
cat > req.yaml <<'YAML'
mak:
  goal: This helper is safe to merge
  depth: quick
  where: [src/a.ts]
  ask:
    concerns:
      input:
        pass: no
        1: Does `f` read anything other than its argument?
        2: Could `f` throw on any string input?
        3: Does `f` return a value other than the trimmed string?
      effects:
        pass: no
        4: Does `f` write to a file or the network?
        5: Does `f` change its argument or a shared value?
        6: Does `f` log the argument?
      reach:
        pass: no
        7: Is `f` exported to callers outside this file?
        8: Does `f` depend on a global or environment variable?
        9: Does `f` call another function that can fail?
    decisions:
      severity:
        pass: [none, low]
        10:
          scale: How severe is the worst issue found?
          levels: [none, low, medium, high, critical]
      route:
        pass: [ship]
        11:
          choice: Where should this go?
          options: [ship, fix, block]
YAML
M="env -i HOME=$W PATH=/nonexistent $BIN"
pass=0; fail=0
check() { # name, expected-substring, command...
  name="$1"; want="$2"; shift 2; s=$(date +%s); out=$($M "$@" 2>&1); rc=$?; secs=$(( $(date +%s)-s ))
  if [ $rc -eq 0 ] && printf '%s' "$out" | grep -q -- "$want"; then echo "PASS  ${secs}s  $name"; pass=$((pass+1)); else echo "FAIL  $name (rc=$rc)"; printf '%s\n' "$out" | head -3 | sed 's/^/        /'; fail=$((fail+1)); fi; }
echo "file: $BIN  ($(du -h "$BIN" | cut -f1))   folder: $W   node on your normal PATH: $(command -v node || echo none) (the checks below strip PATH anyway)"
check "help prints"                       "MM3 turns"        help
check "doctor"                            "doctor:"          doctor
check "class dry run"                     "calls:"           class req.yaml --dry-run
check "class real run (sample provider)"  "MM3-0001"         class req.yaml
check "view a folder"                     "1 run"            view src
check "report hits"                       "report hits"      report hits
check "report patterns"                   "report patterns"  report patterns
check "outcome"                           "held"             outcome MM3-0001 held --by tester
check "report problems (SQLite graph)"    "row"              report problems
check "report graph (SQLite graph)"       "edges"            report graph place:src/a.ts
check "template class (embedded)"         "mak:"             template class
# MCP initialize: stdin stays open 1 s after the request, then closes (the server exits on EOF); a watchdog kills it after 15 s.
( printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}'; sleep 1 ) | $M mcp >"$W/mcp.out" 2>&1 & mcp=$!
( sleep 15; kill $mcp 2>/dev/null ) & dog=$!
wait $mcp; kill $dog 2>/dev/null
out=$(cat "$W/mcp.out")
if printf '%s' "$out" | grep -q '"serverInfo"'; then echo "PASS         MCP initialize over stdio"; pass=$((pass+1)); else echo "FAIL  MCP initialize"; fail=$((fail+1)); fi
echo; echo "result: $pass passed, $fail failed"; [ $fail -eq 0 ]

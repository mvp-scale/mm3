#!/bin/sh
# Public-repo guard. Fails if a file to be committed is local-only (lab/, .env) or contains a machine path,
# a secret-shaped string, or an internal tracker reference.
#   sh scripts/check-clean.sh          staged files (the pre-commit hook)
#   sh scripts/check-clean.sh --all    every tracked file (CI)
set -eu
cd "$(git rev-parse --show-toplevel)"

# System grep, never a PATH shim: a wrapper that mishandles -E would make this guard pass silently.
sgrep() { command -p grep "$@"; }

if [ "${1:-}" = "--all" ]; then
  files=$(git ls-files)
else
  files=$(git diff --cached --name-only --diff-filter=ACMR)
fi
[ -z "$files" ] && exit 0

fail=0
report() { echo "✖ check-clean: $1"; fail=1; }

for f in $files; do
  case "$f" in
    # lab/ is private unless .gitignore lists the path as published (one research folder under lab/research/);
    # --no-index asks the rules themselves, so a force-added private file is still caught.
    lab/*|lab) if git check-ignore -q --no-index -- "$f"; then report "$f is local-only (lab/) → git rm --cached -r lab"; fi ;;
    .superpowers/*|.superpowers) report "$f is local-only (.superpowers/) → git rm --cached -r .superpowers" ;;
    .env|.env.*) [ "$f" = ".env.example" ] || report "$f holds environment secrets → git rm --cached $f" ;;
    *.pem|*.key|*.p12) report "$f looks like a key file → remove it from the commit" ;;
    CLAUDE.local.md) report "$f is local-only → git rm --cached $f" ;;
  esac
done

SECRETS='gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
PATHS='/home/[a-z][a-z0-9_-]*/|/Users/[A-Za-z][A-Za-z0-9_-]*/'
INTERNAL='gauntlet|(task|issue|decision|note|run):[a-z][a-z0-9-]{2,}'

scan() {
  label=$1 pattern=$2
  shift 2
  hits=$(printf '%s\n' "$@" | sgrep -v -e '^scripts/check-clean.sh$' -e '^package-lock.json$' -e '^LICENSE$' \
    | while read -r f; do [ -f "$f" ] && sgrep -InE "$pattern" "$f" /dev/null || true; done)
  if [ -n "$hits" ]; then
    echo "$hits" | sed 's/^/  /'
    report "$label found (above) → remove it or move the file to lab/"
  fi
}

# shellcheck disable=SC2086
scan "secret-shaped string" "$SECRETS" $files
# shellcheck disable=SC2086
scan "machine path" "$PATHS" $files
# shellcheck disable=SC2086
scan "internal reference" "$INTERNAL" $files

[ "$fail" -eq 0 ] || exit 1

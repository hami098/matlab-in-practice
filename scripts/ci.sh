#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$#" -ne 0 ]; then
  echo "usage: scripts/ci.sh" >&2
  exit 2
fi

step() { printf '\n== %s\n' "$*"; }

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ci: $1 is not installed; $2" >&2
    exit 1
  fi
}

need git "install Git"
need xargs "run from Git Bash or a Unix shell"

step "no secrets and no data, refused by name"
blocked="$(git ls-files | sh .githooks/forbidden-files.sh)" || true
if [ -n "$blocked" ]; then
  echo "these never enter this repository:" >&2
  printf '%s\n' "$blocked" >&2
  exit 1
fi

step "no en or em dashes"
en_dash="$(printf '\342\200\223')"
em_dash="$(printf '\342\200\224')"
if git grep -n -I -F -e "$en_dash" -e "$em_dash"; then
  echo "en and em dashes are not used in this repository" >&2
  exit 1
fi

step "no file over 512 KB"
large="$(git ls-files -z | xargs -0 -I{} sh -c 'size=$(git cat-file -s ":{}"); [ "$size" -gt 524288 ] && echo "{} ($size bytes)"' || true)"
if [ -n "$large" ]; then
  echo "files over 512 KB are data, not repository content:" >&2
  printf '%s\n' "$large" >&2
  exit 1
fi

step "gitleaks"
gitleaks_bin="$(command -v gitleaks 2>/dev/null || true)"
if [ -z "$gitleaks_bin" ] && [ -n "${LOCALAPPDATA:-}" ] \
  && [ -x "$LOCALAPPDATA/Microsoft/WinGet/Links/gitleaks.exe" ]; then
  gitleaks_bin="$LOCALAPPDATA/Microsoft/WinGet/Links/gitleaks.exe"
fi
if [ -z "$gitleaks_bin" ]; then
  echo "ci: gitleaks is not installed; winget install Gitleaks.Gitleaks" >&2
  exit 1
fi
"$gitleaks_bin" git --log-opts=--all --redact --no-banner .

step "all checks passed"

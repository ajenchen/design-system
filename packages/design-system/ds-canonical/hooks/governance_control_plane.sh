#!/bin/bash
# Thin native-feedback adapter for generated control-plane artifacts. Policy stays in
# @qijenchen/governance; protected CI remains authoritative when native hooks are unavailable.
set -uo pipefail
fail_integrity() {
  printf 'GOVERNANCE_INTEGRITY: governance control plane %s\n' "$1" >&2
  exit 70
}
ROOT="${GOVERNANCE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
PROVIDER="${GOVERNANCE_PROVIDER:-generic}"
case "$PROVIDER" in *[!a-z0-9-]*|'') fail_integrity "provider id is invalid:$PROVIDER" ;; esac
ADAPTER="$ROOT/governance/generated/adapters/${PROVIDER}-hook.mjs"
[ -f "$ADAPTER" ] && [ ! -L "$ADAPTER" ] \
  || fail_integrity "generated adapter is missing or unsafe:$ADAPTER"
exec node "$ADAPTER"

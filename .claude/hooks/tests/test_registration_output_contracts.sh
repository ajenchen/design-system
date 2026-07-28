#!/bin/bash
# Registration-derived static output-contract audit.
#
# This test deliberately reads registrations.json and its schema instead of maintaining a second
# descriptor inventory. Targeted runtime branches live in each hook's focused behavior test.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
REGISTRY="$HOOK_ROOT/registrations.json"
SCHEMA="$HOOK_ROOT/registrations.schema.json"

command -v node >/dev/null 2>&1 || {
  echo "FATAL: node is required for registration output-contract tests"
  exit 1
}

node -- "$SCRIPT_DIR/registration-output-contracts.mjs" \
  "$REGISTRY" "$SCHEMA" "$HOOK_ROOT"

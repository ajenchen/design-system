#!/bin/bash
set -uo pipefail

PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
RAW_OUTPUT=$(mktemp "${TMPDIR:-/tmp}/governance-canonical-rules.XXXXXX") || exit 0
trap 'rm -f "$RAW_OUTPUT"' EXIT HUP INT TERM

node "$PROJECT_DIR/scripts/extract-canonical-rules.mjs" >"$RAW_OUTPUT" 2>&1
STATUS=$?
if [ "$STATUS" -ne 0 ]; then
  OUTPUT=$(head -8 "$RAW_OUTPUT")
  MESSAGE=$(printf 'Canonical-rule extraction Stop check execution failed (exit %s):\n%s' "$STATUS" "$OUTPUT")
else
  # 同上:通過就靜默,只有缺口才出聲。
  OUTPUT=$(grep -m 8 -E 'GAPS|keywords missing' "$RAW_OUTPUT" || true)
  [ -z "$OUTPUT" ] && exit 0
  MESSAGE=$(printf 'Canonical-rule extraction Stop check:\n%s' "$OUTPUT")
fi

ENCODED=$(printf '%s' "$MESSAGE" | jq -Rs .) || exit 0
printf '{"governanceContext":{"hookEventName":"Stop","message":%s}}\n' "$ENCODED"

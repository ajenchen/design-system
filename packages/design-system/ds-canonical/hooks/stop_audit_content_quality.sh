#!/bin/bash
set -uo pipefail

PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
RAW_OUTPUT=$(mktemp "${TMPDIR:-/tmp}/governance-content-quality.XXXXXX") || exit 0
trap 'rm -f "$RAW_OUTPUT"' EXIT HUP INT TERM

node "$PROJECT_DIR/scripts/audit-content-quality.mjs" --check >"$RAW_OUTPUT" 2>&1
STATUS=$?
if [ "$STATUS" -ne 0 ]; then
  OUTPUT=$(head -10 "$RAW_OUTPUT")
  MESSAGE=$(printf 'Content-quality Stop check execution failed (exit %s):\n%s' "$STATUS" "$OUTPUT")
else
  # 通過就靜默:綠燈沒有資訊量,印出來只會每一輪都在 user 眼前塞一行「Stop says: ✅ …」
  # (2026-09-05 user 回報:「每次都在最後呈現如圖一不知道是什麼鬼的東西」)。
  # 只有真的有問題(P0/P1/警告)才出聲。
  OUTPUT=$(grep -m 10 -E '\[P[01]\]|⚠️' "$RAW_OUTPUT" || true)
  [ -z "$OUTPUT" ] && exit 0
  MESSAGE=$(printf 'Content-quality Stop check:\n%s' "$OUTPUT")
fi

ENCODED=$(printf '%s' "$MESSAGE" | jq -Rs .) || exit 0
printf '{"governanceContext":{"hookEventName":"Stop","message":%s}}\n' "$ENCODED"

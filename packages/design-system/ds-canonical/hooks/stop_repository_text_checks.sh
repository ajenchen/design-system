#!/bin/bash
set -uo pipefail
# Stop: repository text checks → one provider-neutral governance-context message.
#
# 2026-11-17 /knowledge-prune:原 stop_audit_content_quality.sh 與 stop_extract_canonical_rules.sh 合併
# (兩支逐行同構、同一個 Stop 群組、outputMode 同為 governance-context、fork 分類同為 DROP、共用一份
# 測試)。兩個指令照原樣各跑一次,訊息分段合成一則;CI 另外還跑 test:content-quality。
#
# 通過就靜默:綠燈沒有資訊量,印出來只會每一輪都在 user 眼前塞一行「Stop says: ✅ …」
# (2026-09-05 user 回報:「每次都在最後呈現如圖一不知道是什麼鬼的東西」)。只有真的有問題
# (P0/P1/警告/規則關鍵字缺口)或指令本身跑失敗才出聲。

PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
RAW_OUTPUT=$(mktemp "${TMPDIR:-/tmp}/governance-repository-text.XXXXXX") || exit 0
trap 'rm -f "$RAW_OUTPUT"' EXIT HUP INT TERM

MESSAGES=""
add_message() {
  if [ -z "$MESSAGES" ]; then MESSAGES="$1"; else MESSAGES=$(printf '%s\n\n%s' "$MESSAGES" "$1"); fi
}

# 1) content quality(原 stop_audit_content_quality.sh)
node "$PROJECT_DIR/scripts/audit-content-quality.mjs" --check >"$RAW_OUTPUT" 2>&1
STATUS=$?
if [ "$STATUS" -ne 0 ]; then
  add_message "$(printf 'Content-quality Stop check execution failed (exit %s):\n%s' "$STATUS" "$(head -10 "$RAW_OUTPUT")")"
else
  OUTPUT=$(grep -m 10 -E '\[P[01]\]|⚠️' "$RAW_OUTPUT" || true)
  [ -n "$OUTPUT" ] && add_message "$(printf 'Content-quality Stop check:\n%s' "$OUTPUT")"
fi

# 2) canonical-rule extraction(原 stop_extract_canonical_rules.sh)
node "$PROJECT_DIR/scripts/extract-canonical-rules.mjs" >"$RAW_OUTPUT" 2>&1
STATUS=$?
if [ "$STATUS" -ne 0 ]; then
  add_message "$(printf 'Canonical-rule extraction Stop check execution failed (exit %s):\n%s' "$STATUS" "$(head -8 "$RAW_OUTPUT")")"
else
  OUTPUT=$(grep -m 8 -E 'GAPS|keywords missing' "$RAW_OUTPUT" || true)
  [ -n "$OUTPUT" ] && add_message "$(printf 'Canonical-rule extraction Stop check:\n%s' "$OUTPUT")"
fi

[ -z "$MESSAGES" ] && exit 0
ENCODED=$(printf '%s' "$MESSAGES" | jq -Rs .) || exit 0
printf '{"governanceContext":{"hookEventName":"Stop","message":%s}}\n' "$ENCODED"

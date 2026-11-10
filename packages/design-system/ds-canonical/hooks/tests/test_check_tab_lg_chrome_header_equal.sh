#!/bin/bash
# Proposed-state regression tests for header-canonical W3 token equality.
# 2026-11-11:兩顆的住處改由分類表 token-registry.json 決定(分頁高搬到 components/Tabs/tabs.css,
# 標頭高留在 tokens/uiSize/uiSize.css)。夾具照這個現況建;另有「兩顆同住一檔」的舊佈局與分類表本身被改的案例。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_HOOK="$SCRIPT_DIR/../lib/_tab_lg_chrome_header_equal.sh"
LOG_FIRE_SH="$SCRIPT_DIR/../_log-fire.sh"
TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT

PASS=0
FAIL=0
FAILED_TESTS=""

mkdir -p "$TMPROOT/.claude/hooks/lib"
cp "$SRC_HOOK" "$TMPROOT/.claude/hooks/lib/_tab_lg_chrome_header_equal.sh"
cp "$LOG_FIRE_SH" "$TMPROOT/.claude/hooks/_log-fire.sh" 2>/dev/null || true
chmod +x "$TMPROOT/.claude/hooks/lib/_tab_lg_chrome_header_equal.sh"

HOOK="$TMPROOT/.claude/hooks/lib/_tab_lg_chrome_header_equal.sh"
DS_REL="packages/design-system/src"
UISIZE_REL="$DS_REL/tokens/uiSize/uiSize.css"
TABS_REL="$DS_REL/components/Tabs/tabs.css"
REGISTRY_REL="$DS_REL/tokens/token-registry.json"
UISIZE_CSS="$TMPROOT/$UISIZE_REL"
TABS_CSS="$TMPROOT/$TABS_REL"
REGISTRY_JSON="$TMPROOT/$REGISTRY_REL"
GLOBALS_CSS="$TMPROOT/src/globals.css"

# 一顆 token 的三段(:root → 大密度 → 鎖回一般密度)
one_token() {
  local name="$1" root="$2" lg="$3" md="$4"
  printf '%s\n' \
    ':root {' \
    "  --$name: ${root}rem;" \
    '}' \
    '[data-ui-size="lg"],' \
    '[data-density="lg"] {' \
    "  --$name: ${lg}rem;" \
    '}' \
    '[data-ui-size="md"],' \
    '[data-density="md"] {' \
    "  --$name: ${md}rem;" \
    '}'
}
tab_content() { one_token tab-height-lg "$@"; }
chrome_content() { one_token chrome-header-height "$@"; }

# 舊佈局:兩顆同住一檔
both_content() {
  local tab_root="$1" tab_lg="$2" tab_md="$3"
  local chrome_root="$4" chrome_lg="$5" chrome_md="$6"
  printf '%s\n' \
    ':root {' \
    "  --tab-height-lg: ${tab_root}rem;" \
    "  --chrome-header-height: ${chrome_root}rem;" \
    '}' \
    '[data-ui-size="lg"],' \
    '[data-density="lg"] {' \
    "  --tab-height-lg: ${tab_lg}rem;" \
    "  --chrome-header-height: ${chrome_lg}rem;" \
    '}' \
    '[data-ui-size="md"],' \
    '[data-density="md"] {' \
    "  --tab-height-lg: ${tab_md}rem;" \
    "  --chrome-header-height: ${chrome_md}rem;" \
    '}'
}

registry_content() {
  local tab_home="$1" chrome_home="$2"
  jq -n --arg th "$tab_home" --arg ch "$chrome_home" '{rows: [
    {match: "--tab-height-", class: "component", owner: "Tabs", home: $th},
    {match: "--chrome-header-height", class: "shared", owner: "uiSize", home: $ch},
    {match: "--chrome-header-avatar-size", class: "component", owner: "header-canonical", home: "patterns/header-canonical/header-canonical.css"}
  ]}'
}
CURRENT_REGISTRY=$(registry_content components/Tabs/tabs.css tokens/uiSize/uiSize.css)
LEGACY_REGISTRY=$(registry_content tokens/uiSize/uiSize.css tokens/uiSize/uiSize.css)

write_disk() {
  local tab_root="$1" tab_lg="$2" tab_md="$3" chrome_root="$4" chrome_lg="$5" chrome_md="$6"
  mkdir -p "$(dirname "$UISIZE_CSS")" "$(dirname "$TABS_CSS")" "$TMPROOT/src"
  tab_content "$tab_root" "$tab_lg" "$tab_md" >"$TABS_CSS"
  chrome_content "$chrome_root" "$chrome_lg" "$chrome_md" >"$UISIZE_CSS"
  printf '%s\n' "$CURRENT_REGISTRY" >"$REGISTRY_JSON"
  printf '%s\n' '/* token aggregator trigger */' ':root {}' >"$GLOBALS_CSS"
}

run_hook() {
  local file_path="$1" tool="$2" project_root="$3" trust_mode="$4"
  local state_path="${5:-}" proposed_content="${6:-}" state_kind="${7:-text}"
  local payload
  case "$trust_mode" in
    yes)
      if [ "$state_kind" = "text" ]; then
        payload=$(jq -n \
          --arg fp "$file_path" --arg tool "$tool" --arg sp "$state_path" --arg content "$proposed_content" \
          '{tool_name:$tool,tool_input:{file_path:$fp,new_string:"raw-partial-must-not-win",governance_write_state:{schemaVersion:1,path:$sp,kind:"text",content:$content}}}')
      else
        payload=$(jq -n \
          --arg fp "$file_path" --arg tool "$tool" --arg sp "$state_path" --arg kind "$state_kind" \
          '{tool_name:$tool,tool_input:{file_path:$fp,governance_write_state:{schemaVersion:1,path:$sp,kind:$kind}}}')
      fi
      ;;
    missing)
      payload=$(jq -n --arg fp "$file_path" --arg tool "$tool" \
        '{tool_name:$tool,tool_input:{file_path:$fp}}')
      ;;
    malformed)
      payload=$(jq -n --arg fp "$file_path" --arg tool "$tool" \
        '{tool_name:$tool,tool_input:{file_path:$fp,governance_write_state:{schemaVersion:1,path:7,kind:"text",content:false}}}')
      ;;
    none)
      payload=$(jq -n --arg fp "$file_path" --arg tool "$tool" \
        '{tool_name:$tool,tool_input:{file_path:$fp}}')
      ;;
  esac

  STDOUT_FILE=$(mktemp)
  STDERR_FILE=$(mktemp)
  set +e
  if [ "$trust_mode" = "none" ]; then
    printf '%s' "$payload" \
      | env -u GOVERNANCE_WRITE_STATE_TRUST GOVERNANCE_PROJECT_DIR="$project_root" \
          bash "$HOOK" >"$STDOUT_FILE" 2>"$STDERR_FILE"
  else
    printf '%s' "$payload" \
      | GOVERNANCE_WRITE_STATE_TRUST=runner-v1 GOVERNANCE_PROJECT_DIR="$project_root" \
          bash "$HOOK" >"$STDOUT_FILE" 2>"$STDERR_FILE"
  fi
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT_FILE")
  STDERR_TEXT=$(cat "$STDERR_FILE")
  rm -f "$STDOUT_FILE" "$STDERR_FILE"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" -eq 0 ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
    PASS=$((PASS + 1)); echo "  PASS  $name"
  else
    FAIL=$((FAIL + 1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
    echo "  FAIL  $name (exit=$EXIT, stdout=${#STDOUT_TEXT}, stderr=${#STDERR_TEXT})"
    printf '%s\n' "$STDERR_TEXT" | sed 's/^/    /'
  fi
}

expect_block() {
  local name="$1" needle="$2"
  if [ "$EXIT" -eq 2 ] && [ -z "$STDOUT_TEXT" ] && [ -n "$STDERR_TEXT" ] \
    && printf '%s' "$STDERR_TEXT" | grep -qF "$needle"; then
    PASS=$((PASS + 1)); echo "  PASS  $name"
  else
    FAIL=$((FAIL + 1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
    echo "  FAIL  $name (expected stderr-only rc2 + '$needle'; got rc=$EXIT)"
    printf '%s\n' "$STDERR_TEXT" | sed 's/^/    /'
  fi
}

expect_integrity() {
  local name="$1" needle="$2"
  if [ "$EXIT" -eq 70 ] && [ -z "$STDOUT_TEXT" ] && [ -n "$STDERR_TEXT" ] \
    && printf '%s' "$STDERR_TEXT" | grep -qF "$needle"; then
    PASS=$((PASS + 1)); echo "  PASS  $name"
  else
    FAIL=$((FAIL + 1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
    echo "  FAIL  $name (expected stderr-only rc70 + '$needle'; got rc=$EXIT)"
    printf '%s\n' "$STDERR_TEXT" | sed 's/^/    /'
  fi
}

echo "=== check_tab_lg_chrome_header_equal proposed-state tests ==="

write_disk 3 3.5 3 3 3.5 3
CLEAN_CHROME=$(chrome_content 3 3.5 3)
CLEAN_TAB=$(tab_content 3 3.5 3)
run_hook "$UISIZE_CSS" Write "$TMPROOT" yes "$UISIZE_REL" "$CLEAN_CHROME"
expect_pass_silent "1. all root/lg/md-reset pairs equal → silent"

run_hook "$UISIZE_CSS" Write "$TMPROOT" yes "$UISIZE_REL" "$(chrome_content 2.75 3.5 3)"
expect_block "2. proposed Write root mismatch blocks before disk write" "root: --tab-height-lg=3 rem ≠ --chrome-header-height=2.75 rem"

run_hook "$UISIZE_CSS" Edit "$TMPROOT" yes "$UISIZE_REL" "$(chrome_content 3 4 3)"
expect_block "3. proposed Edit lg mismatch blocks" "lg: --tab-height-lg=3.5 rem ≠ --chrome-header-height=4 rem"

run_hook "$UISIZE_CSS" MultiEdit "$TMPROOT" yes "$UISIZE_REL" "$(chrome_content 3 3.5 2.5)"
expect_block "4. proposed MultiEdit md-reset mismatch blocks" "md-reset: --tab-height-lg=3 rem ≠ --chrome-header-height=2.5 rem"

write_disk 3 3.5 3 8 8 8
run_hook "$UISIZE_CSS" Edit "$TMPROOT" yes "$UISIZE_REL" "$CLEAN_CHROME"
expect_pass_silent "5. trusted full proposed state wins over stale drifting disk"

write_disk 3 3.5 3 3 3.5 3
run_hook "$GLOBALS_CSS" Edit "$TMPROOT" yes "src/globals.css" '/* proposed globals */'
expect_pass_silent "6. globals mutation safely reads unchanged canonical homes"

run_hook "$UISIZE_CSS" Write "$TMPROOT" missing
expect_integrity "7. runner trust marker without state is integrity failure" "trusted proposed write state 缺失或 malformed"

run_hook "$UISIZE_CSS" Write "$TMPROOT" malformed
expect_integrity "8. malformed trusted state is integrity failure" "trusted proposed write state 缺失或 malformed"

run_hook "$UISIZE_CSS" Write "$TMPROOT" yes "src/not-uiSize.css" "$CLEAN_CHROME"
expect_integrity "9. trusted state path mismatch is integrity failure" "與 hook target 不相符"

TOO_FEW="${CLEAN_TAB/  --tab-height-lg: 3.5rem;/}"
run_hook "$TABS_CSS" Write "$TMPROOT" yes "$TABS_REL" "$TOO_FEW"
expect_integrity "10. missing declaration is integrity failure" "extraction 不完整、重複或 scope/order"

TOO_MANY=$(printf '%s\n%s\n' "$CLEAN_TAB" ':root { --tab-height-lg: 3rem; }')
run_hook "$TABS_CSS" Write "$TMPROOT" yes "$TABS_REL" "$TOO_MANY"
expect_integrity "11. hidden inline duplicate declaration is integrity failure" "extraction 不完整、重複或 scope/order"

MALFORMED_DECIMAL="${CLEAN_TAB/  --tab-height-lg: 3rem;/  --tab-height-lg: .3rem;}"
run_hook "$TABS_CSS" Write "$TMPROOT" yes "$TABS_REL" "$MALFORMED_DECIMAL"
expect_integrity "12. non-strict decimal syntax is integrity failure" "scope、順序或 decimal rem syntax"

WRONG_ORDER=$(printf '%s\n' \
  '[data-ui-size="lg"],' \
  '[data-density="lg"] {' \
  '  --tab-height-lg: 3.5rem;' \
  '}' \
  ':root {' \
  '  --tab-height-lg: 3rem;' \
  '}' \
  '[data-ui-size="md"],' \
  '[data-density="md"] {' \
  '  --tab-height-lg: 3rem;' \
  '}')
run_hook "$TABS_CSS" Edit "$TMPROOT" yes "$TABS_REL" "$WRONG_ORDER"
expect_integrity "13. block order drift(大密度覆寫寫在預設前面)is integrity failure" "scope、順序或 decimal rem syntax"

COMMENTED_TOKENS=$'/*\n'"$CLEAN_TAB"$'\n*/'
run_hook "$TABS_CSS" Write "$TMPROOT" yes "$TABS_REL" "$COMMENTED_TOKENS"
expect_integrity "14. declarations hidden inside CSS comments are integrity failure" "extraction 不完整、重複或 scope/order"

run_hook "$TABS_CSS" Write "$TMPROOT" yes "$TABS_REL" "$(tab_content 3.0 3.50 3.000)"
expect_pass_silent "15. numerically equal strict decimals compare equal"

run_hook "$UISIZE_CSS" Edit "$TMPROOT" none
expect_pass_silent "16. direct canonical fallback safely reads regular non-symlink disk"

run_hook "$TMPROOT/random.tsx" Edit "$TMPROOT" missing
expect_pass_silent "17. out-of-scope path stays silent"

# ── 2026-11-11 住處由分類表決定 ──
run_hook "$TABS_CSS" Edit "$TMPROOT" yes "$TABS_REL" "$(tab_content 3 4 3)"
expect_block "18. 改分頁高的新住處 tabs.css 也會觸發、漂移就擋" "lg: --tab-height-lg=4 rem ≠ --chrome-header-height=3.5 rem"

run_hook "$TMPROOT/$DS_REL/components/Button/button.css" Edit "$TMPROOT" yes "$DS_REL/components/Button/button.css" '.x { color: red; }'
expect_pass_silent "19. 改不是兩顆住處的 DS 樣式檔 → 安靜"

run_hook "$REGISTRY_JSON" Edit "$TMPROOT" yes "$REGISTRY_REL" "$(registry_content components/Tabs/missing.css tokens/uiSize/uiSize.css)"
expect_integrity "20. 分類表把住處改到不存在的檔 → integrity failure(住處過期)" "canonical token source 缺失"

run_hook "$REGISTRY_JSON" Edit "$TMPROOT" yes "$REGISTRY_REL" "$(registry_content tokens/uiSize/uiSize.css tokens/uiSize/uiSize.css)"
expect_integrity "21. 分類表把分頁高住處改回 uiSize.css、但那裡沒有宣告 → integrity failure" "extraction 不完整、重複或 scope/order"

run_hook "$REGISTRY_JSON" Edit "$TMPROOT" yes "$REGISTRY_REL" '{"rows":[{"match":"--chrome-header-height","home":"tokens/uiSize/uiSize.css"}]}'
expect_integrity "22. 分類表沒有分頁高那一列 → integrity failure" "分類表讀不到 --tab-height-lg"

run_hook "$REGISTRY_JSON" Edit "$TMPROOT" yes "$REGISTRY_REL" '{"rows":[{"match":"--tab-height-","home":"components/Tabs/tabs.css"},{"match":"--tab-height-","home":"tokens/uiSize/uiSize.css"},{"match":"--chrome-header-height","home":"tokens/uiSize/uiSize.css"}]}'
expect_integrity "23. 分類表兩列一樣長都吻合 → integrity failure" "分類表讀不到 --tab-height-lg"

run_hook "$REGISTRY_JSON" Edit "$TMPROOT" yes "$REGISTRY_REL" "$(registry_content ../../../etc/tabs.css tokens/uiSize/uiSize.css)"
expect_integrity "24. 分類表 home 含 .. → integrity failure" "不得含 .. 或絕對路徑"

# 舊佈局(兩顆同住 uiSize.css,分類表也這樣登記):照常相等 → 安靜;漂移 → 擋
printf '%s\n' "$LEGACY_REGISTRY" >"$REGISTRY_JSON"
both_content 3 3.5 3 3 3.5 3 >"$UISIZE_CSS"
run_hook "$UISIZE_CSS" Write "$TMPROOT" yes "$UISIZE_REL" "$(both_content 3 3.5 3 3 3.5 3)"
expect_pass_silent "25. 兩顆同住一檔的舊佈局 → 安靜"
run_hook "$UISIZE_CSS" Write "$TMPROOT" yes "$UISIZE_REL" "$(both_content 3 3.5 3 3 3.5 2.5)"
expect_block "26. 兩顆同住一檔的舊佈局漂移 → 擋" "md-reset: --tab-height-lg=3 rem ≠ --chrome-header-height=2.5 rem"

echo
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf 'Failed:%b\n' "$FAILED_TESTS"
  exit 1
fi

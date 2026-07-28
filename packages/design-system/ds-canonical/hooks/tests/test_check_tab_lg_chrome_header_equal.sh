#!/bin/bash
# Proposed-state regression tests for header-canonical W3 token equality.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_HOOK="$SCRIPT_DIR/../lib/_tab_lg_chrome_header_equal.sh"
LOG_FIRE_SH="$SCRIPT_DIR/../_log-fire.sh"
TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT

PASS=0
FAIL=0
FAILED_TESTS=""

mkdir -p "$TMPROOT/.claude/hooks/lib" "$TMPROOT/packages/design-system/src/tokens/uiSize" "$TMPROOT/src"
cp "$SRC_HOOK" "$TMPROOT/.claude/hooks/lib/_tab_lg_chrome_header_equal.sh"
cp "$LOG_FIRE_SH" "$TMPROOT/.claude/hooks/_log-fire.sh" 2>/dev/null || true
chmod +x "$TMPROOT/.claude/hooks/lib/_tab_lg_chrome_header_equal.sh"

HOOK="$TMPROOT/.claude/hooks/lib/_tab_lg_chrome_header_equal.sh"
UISIZE_REL="packages/design-system/src/tokens/uiSize/uiSize.css"
UISIZE_CSS="$TMPROOT/$UISIZE_REL"
GLOBALS_CSS="$TMPROOT/src/globals.css"

token_content() {
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

write_tokens_at() {
  local root="$1"
  shift
  mkdir -p "$root/packages/design-system/src/tokens/uiSize" "$root/src"
  token_content "$@" >"$root/$UISIZE_REL"
  printf '%s\n' '/* token aggregator trigger */' ':root {}' >"$root/src/globals.css"
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

write_tokens_at "$TMPROOT" 3 3.5 3 3 3.5 3
CLEAN=$(token_content 3 3.5 3 3 3.5 3)
run_hook "$UISIZE_CSS" Write "$TMPROOT" yes "$UISIZE_REL" "$CLEAN"
expect_pass_silent "1. all root/lg/md-reset pairs equal → silent"

ROOT_DRIFT=$(token_content 3 3.5 3 2.75 3.5 3)
run_hook "$UISIZE_CSS" Write "$TMPROOT" yes "$UISIZE_REL" "$ROOT_DRIFT"
expect_block "2. proposed Write root mismatch blocks before disk write" "root: --tab-height-lg=3 rem ≠ --chrome-header-height=2.75 rem"

LG_DRIFT=$(token_content 3 3.5 3 3 4 3)
run_hook "$UISIZE_CSS" Edit "$TMPROOT" yes "$UISIZE_REL" "$LG_DRIFT"
expect_block "3. proposed Edit lg mismatch blocks" "lg: --tab-height-lg=3.5 rem ≠ --chrome-header-height=4 rem"

MD_DRIFT=$(token_content 3 3.5 3 3 3.5 2.5)
run_hook "$UISIZE_CSS" MultiEdit "$TMPROOT" yes "$UISIZE_REL" "$MD_DRIFT"
expect_block "4. proposed MultiEdit md-reset mismatch blocks" "md-reset: --tab-height-lg=3 rem ≠ --chrome-header-height=2.5 rem"

write_tokens_at "$TMPROOT" 9 9 9 8 8 8
run_hook "$UISIZE_CSS" Edit "$TMPROOT" yes "$UISIZE_REL" "$CLEAN"
expect_pass_silent "5. trusted full proposed state wins over stale drifting disk"

write_tokens_at "$TMPROOT" 3 3.5 3 3 3.5 3
run_hook "$GLOBALS_CSS" Edit "$TMPROOT" yes "src/globals.css" '/* proposed globals */'
expect_pass_silent "6. globals mutation safely reads unchanged canonical uiSize"

run_hook "$UISIZE_CSS" Write "$TMPROOT" missing
expect_integrity "7. runner trust marker without state is integrity failure" "trusted proposed write state 缺失或 malformed"

run_hook "$UISIZE_CSS" Write "$TMPROOT" malformed
expect_integrity "8. malformed trusted state is integrity failure" "trusted proposed write state 缺失或 malformed"

run_hook "$UISIZE_CSS" Write "$TMPROOT" yes "src/not-uiSize.css" "$CLEAN"
expect_integrity "9. trusted state path mismatch is integrity failure" "與 hook target 不相符"

TOO_FEW="${CLEAN/  --chrome-header-height: 3.5rem;/}"
run_hook "$UISIZE_CSS" Write "$TMPROOT" yes "$UISIZE_REL" "$TOO_FEW"
expect_integrity "10. missing declaration is integrity failure" "extraction 不完整、重複或 scope/order"

TOO_MANY=$(printf '%s\n%s\n' "$CLEAN" ':root { --tab-height-lg: 3rem; }')
run_hook "$UISIZE_CSS" Write "$TMPROOT" yes "$UISIZE_REL" "$TOO_MANY"
expect_integrity "11. hidden inline duplicate declaration is integrity failure" "extraction 不完整、重複或 scope/order"

MALFORMED_DECIMAL="${CLEAN/  --tab-height-lg: 3rem;/  --tab-height-lg: .3rem;}"
run_hook "$UISIZE_CSS" Write "$TMPROOT" yes "$UISIZE_REL" "$MALFORMED_DECIMAL"
expect_integrity "12. non-strict decimal syntax is integrity failure" "scope、順序或 decimal rem syntax"

WRONG_ORDER=$(printf '%s\n' \
  ':root {' \
  '  --chrome-header-height: 3rem;' \
  '  --tab-height-lg: 3rem;' \
  '}' \
  '[data-ui-size="lg"],' \
  '[data-density="lg"] {' \
  '  --tab-height-lg: 3.5rem;' \
  '  --chrome-header-height: 3.5rem;' \
  '}' \
  '[data-ui-size="md"],' \
  '[data-density="md"] {' \
  '  --tab-height-lg: 3rem;' \
  '  --chrome-header-height: 3rem;' \
  '}')
run_hook "$UISIZE_CSS" Edit "$TMPROOT" yes "$UISIZE_REL" "$WRONG_ORDER"
expect_integrity "13. declaration order drift is integrity failure" "scope、順序或 decimal rem syntax"

COMMENTED_TOKENS=$'/*\n'"$CLEAN"$'\n*/'
run_hook "$UISIZE_CSS" Write "$TMPROOT" yes "$UISIZE_REL" "$COMMENTED_TOKENS"
expect_integrity "14. declarations hidden inside CSS comments are integrity failure" "extraction 不完整、重複或 scope/order"

NUMERICALLY_EQUAL=$(token_content 3.0 3.50 3.00 3 3.5 3.000)
run_hook "$UISIZE_CSS" Write "$TMPROOT" yes "$UISIZE_REL" "$NUMERICALLY_EQUAL"
expect_pass_silent "15. numerically equal strict decimals compare equal"

run_hook "$UISIZE_CSS" Edit "$TMPROOT" none
expect_pass_silent "16. direct canonical fallback safely reads regular non-symlink disk"

run_hook "$TMPROOT/random.tsx" Edit "$TMPROOT" missing
expect_pass_silent "17. out-of-scope path stays silent"

echo
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf 'Failed:%b\n' "$FAILED_TESTS"
  exit 1
fi

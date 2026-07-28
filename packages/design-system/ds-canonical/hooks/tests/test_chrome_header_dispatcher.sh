#!/bin/bash
# Strict blocking-composite output contract tests.

set -uo pipefail

SOURCE="$(cd "$(dirname "$0")/.." && pwd)/chrome_header_dispatcher.sh"
FIXTURE=$(mktemp -d)
trap 'rm -rf "$FIXTURE"' EXIT
mkdir -p "$FIXTURE/lib"
cp "$SOURCE" "$FIXTURE/chrome_header_dispatcher.sh"

HELPERS=(
  _app_shell_primary_header_consistency.sh
  _header_with_tabs_border.sh
  _tab_lg_chrome_header_equal.sh
  _chrome_header_handcraft.sh
)
PASS=0
FAIL=0

write_helpers() {
  local selected="${1:-}" selected_rc="${2:-0}"
  local selected_stdout="${3:-}" selected_stderr="${4:-}"
  local helper rc stdout_text stderr_text
  for helper in "${HELPERS[@]}"; do
    rc=0
    stdout_text=""
    stderr_text=""
    if [ "$helper" = "$selected" ]; then
      rc="$selected_rc"
      stdout_text="$selected_stdout"
      stderr_text="$selected_stderr"
    fi
    printf '%s\n' \
      '#!/bin/bash' \
      'cat >/dev/null' \
      "printf '%s' '$stdout_text'" \
      "printf '%s' '$stderr_text' >&2" \
      "exit $rc" >"$FIXTURE/lib/$helper"
    chmod +x "$FIXTURE/lib/$helper"
  done
}

run_dispatcher() {
  local payload="${1:-{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"apps/demo/src/App.tsx\"}}}"
  set +e
  printf '%s' "$payload" \
    | GOVERNANCE_PROJECT_DIR="$FIXTURE" bash "$FIXTURE/chrome_header_dispatcher.sh" \
      >"$FIXTURE/stdout" 2>"$FIXTURE/stderr"
  ACTUAL_RC=$?
  set -e
}

expect_clean() {
  local name="$1"
  run_dispatcher "${2:-}"
  if [ "$ACTUAL_RC" -eq 0 ] && [ ! -s "$FIXTURE/stdout" ] && [ ! -s "$FIXTURE/stderr" ]; then
    PASS=$((PASS + 1)); echo "  PASS  $name"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL  $name (expected fully-silent rc0, got $ACTUAL_RC)"
    sed 's/^/    /' "$FIXTURE/stderr"
  fi
}

expect_result() {
  local name="$1" expected_rc="$2" needle="$3" payload="${4:-}"
  run_dispatcher "$payload"
  if [ "$ACTUAL_RC" -eq "$expected_rc" ] && [ ! -s "$FIXTURE/stdout" ] && [ -s "$FIXTURE/stderr" ] \
    && grep -qF "$needle" "$FIXTURE/stderr"; then
    PASS=$((PASS + 1)); echo "  PASS  $name"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL  $name (expected stderr-only rc$expected_rc + '$needle', got $ACTUAL_RC)"
    sed 's/^/    /' "$FIXTURE/stderr"
  fi
}

set -e
echo "=== chrome_header_dispatcher strict output-contract tests ==="

write_helpers
expect_clean "1. all rc0-silent helpers → fully-silent rc0"

write_helpers "_header_with_tabs_border.sh" 2 "" "policy blocker"
expect_result "2. rc2 stderr-only nonempty policy block propagates" 2 "policy blocker"

write_helpers "_chrome_header_handcraft.sh" 1 "" "unexpected"
expect_result "3. rc1 becomes non-policy integrity" 70 "回傳未定義 exit code 1"

write_helpers "_tab_lg_chrome_header_equal.sh" 0 "unexpected stdout" ""
expect_result "4. rc0 stdout becomes non-policy integrity" 70 "rc0 必須完全 silent"

write_helpers "_tab_lg_chrome_header_equal.sh" 0 "" "soft warning"
expect_result "5. rc0 stderr warning becomes non-policy integrity" 70 "rc0 必須完全 silent"

write_helpers "_tab_lg_chrome_header_equal.sh" 2 "" ""
expect_result "6. silent rc2 becomes non-policy integrity" 70 "rc2 必須是 stderr-only nonempty blocker"

write_helpers "_tab_lg_chrome_header_equal.sh" 2 "wrong stream" ""
expect_result "7. rc2 stdout-only becomes non-policy integrity" 70 "rc2 必須是 stderr-only nonempty blocker"

write_helpers "_tab_lg_chrome_header_equal.sh" 2 "wrong stream" "also stderr"
expect_result "8. rc2 mixed output becomes non-policy integrity" 70 "rc2 必須是 stderr-only nonempty blocker"

write_helpers "_tab_lg_chrome_header_equal.sh" 70 "" "trusted-state integrity"
expect_result "9. helper rc70 stderr-only propagates as non-policy integrity" 70 "trusted-state integrity"

write_helpers "_tab_lg_chrome_header_equal.sh" 2 "" "GOVERNANCE_INTEGRITY legacy helper marker"
expect_result "10. rc2 carrying integrity marker is upgraded to rc70" 70 "GOVERNANCE_INTEGRITY"

write_helpers
rm -f "$FIXTURE/lib/_chrome_header_handcraft.sh"
expect_result "11. missing helper is non-policy integrity" 70 "required helper 缺失或不是一般檔案"

write_helpers
rm -f "$FIXTURE/lib/_chrome_header_handcraft.sh"
ln -s "$FIXTURE/lib/_header_with_tabs_border.sh" "$FIXTURE/lib/_chrome_header_handcraft.sh"
expect_result "12. symlink helper is non-policy integrity" 70 "required helper 缺失或不是一般檔案"

write_helpers
expect_result "13. invalid JSON input is non-policy integrity" 70 "hook input 不是有效" "{not-json"

echo
echo "Passed: $PASS / $((PASS + FAIL))"
[ "$FAIL" -eq 0 ]

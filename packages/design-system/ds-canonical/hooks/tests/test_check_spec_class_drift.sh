#!/bin/bash
# Tests for check_spec_class_drift.sh(Audit Dim 53,2026-05-17 ship)
#
# Hook 規則:Edit/Write/MultiEdit 對 packages/design-system/src/components/*/[a-z-]*.spec.md
# 偵測 spec.md 寫「固定/寫死/硬寫 h-NN」但對應 tsx 已 migrate to var(--chrome-header-height)
# token → stdout neutral governanceContext(不 block;exit 0),由 provider adapter 轉譯。
#
# Allow escape:NEW_CONTENT 含 `@spec-class-drift-allow:` → silent。
# 非 spec.md / tsx 不存在 → silent。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_spec_class_drift.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# Build a fake DS component dir with spec.md + tsx pair in TMP_DIR
# so hook's `TSX_PATH="${FILE_PATH%.spec.md}.tsx"` resolves correctly。
build_pair() {
  local comp_name="$1"
  local tsx_content="$2"
  mkdir -p "$TMP_DIR/packages/design-system/src/components/$comp_name"
  printf '%s' "$tsx_content" > "$TMP_DIR/packages/design-system/src/components/$comp_name/${comp_name}.tsx"
  echo "$TMP_DIR/packages/design-system/src/components/$comp_name/${comp_name}.spec.md"
}

run_hook() {
  local tool="$1"
  local file_path="$2"
  local content="$3"
  local payload
  if [ "$tool" = "Edit" ]; then
    payload=$(jq -n --arg tn "$tool" --arg fp "$file_path" --arg c "$content" \
      '{tool_name: $tn, tool_input: {file_path: $fp, new_string: $c}}')
  else
    payload=$(jq -n --arg tn "$tool" --arg fp "$file_path" --arg c "$content" \
      '{tool_name: $tn, tool_input: {file_path: $fp, content: $c}}')
  fi
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent, exit=$EXIT, stderr=$([ -n "$STDERR_TEXT" ] && echo non-empty || echo empty))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_context() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] \
    && printf '%s' "$STDOUT_TEXT" | jq -e --arg needle "$needle" '
      (. | keys) == ["governanceContext"]
      and .governanceContext.hookEventName == "PreToolUse"
      and (.governanceContext.message | contains($needle))
    ' >/dev/null 2>&1; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected neutral context '$needle', exit=$EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_integrity() {
  local name="$1"
  if [ "$EXIT" = "70" ] && [ -z "$STDOUT_TEXT" ] \
    && echo "$STDERR_TEXT" | grep -qF "GOVERNANCE_INTEGRITY:"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected integrity exit 70, got exit=$EXIT)"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_spec_class_drift tests ==="

# 1. Non-spec file (tsx) → skip silent
run_hook "Edit" "$TMP_DIR/some.tsx" "any content"
expect_pass_silent "1. non-spec.md file → skip"

# 2. Non-DS path spec.md → skip silent
run_hook "Edit" "/some/random/path/foo.spec.md" "固定 h-14"
expect_pass_silent "2. spec.md outside DS components/ → skip"

# 3. DS spec.md but no sibling tsx → skip silent
SPEC_PATH="$TMP_DIR/packages/design-system/src/components/orphan/orphan.spec.md"
mkdir -p "$(dirname "$SPEC_PATH")"
run_hook "Edit" "$SPEC_PATH" "固定 h-14 寫死"
expect_pass_silent "3. spec.md without sibling tsx → skip"

# 4. spec 寫「固定 h-14」+ tsx 已消費 chrome-header-height token → P1 warn
SPEC_PATH=$(build_pair "drifty" "
export const Drifty = () => (
  <div className=\"h-[var(--chrome-header-height)]\">...</div>
);
")
run_hook "Edit" "$SPEC_PATH" "header 高度固定 h-14,不可改"
expect_context "4. spec '固定 h-14' + tsx token → neutral context" "SPEC-CODE REVERSE DRIFT"

# 5. spec 寫「寫死 h-12」+ tsx 不含 h-12 → P1 warn (phrase mismatch pattern 1)
SPEC_PATH=$(build_pair "noclass" "
export const NoClass = () => (
  <div className=\"h-[var(--chrome-header-height)]\">...</div>
);
")
run_hook "Edit" "$SPEC_PATH" "container 寫死 h-12 處理"
expect_context "5. spec '寫死 h-12' + tsx 不含 h-12 → neutral context" "SPEC-CODE REVERSE DRIFT"

# 6. spec 寫「固定 h-14」+ allow marker → silent
SPEC_PATH=$(build_pair "allowed" "
export const Allowed = () => (
  <div className=\"h-[var(--chrome-header-height)]\">...</div>
);
")
run_hook "Edit" "$SPEC_PATH" "// @spec-class-drift-allow: known legacy doc
header 高度固定 h-14"
expect_pass_silent "6. spec with @spec-class-drift-allow: marker → silent"

# 7. Wrong tool (Read) → skip
run_hook "Read" "$SPEC_PATH" "固定 h-14"
expect_pass_silent "7. tool=Read → skip"

# 8. Malformed canonical input is an integrity fault,never a silent diagnostic.
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
printf '%s' 'not-json' | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
EXIT=$?
set -e
STDOUT_TEXT=$(cat "$STDOUT"); STDERR_TEXT=$(cat "$STDERR")
rm -f "$STDOUT" "$STDERR"
expect_integrity "8. malformed input → integrity 70"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

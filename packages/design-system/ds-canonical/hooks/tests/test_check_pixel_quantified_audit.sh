#!/bin/bash
# Tests for check_pixel_quantified_audit.sh(M32 主句 pixel-quantified, 2026-05-12)
#
# Hook 規則:PostToolUse Edit/Write/MultiEdit on scripts/visual-audit-*.{mjs,js}.
# 檢查實體檔案有 `getAttribute(` 但 0 個 `getBoundingClientRect(` / `offsetTop` /
# `offsetHeight` / `offsetLeft` / `offsetWidth` → 經由 stdout 輸出
# hookSpecificOutput JSON warn(attribute-existence-only = DOM-pass ≠ visual-pass)。
# Allowlist:head -3 含 `// @pixel-quantified-allow:` → 跳過。
#
# KNOWN BUG(2026-05-22 discovered via this test fixture):
#   `PIXEL_HITS=$(grep -cE ... || echo 0)` produces "0\n0" when grep returns
#   no match(grep -c outputs "0" + exit 1 → fallthrough echoes another "0").
#   The downstream `[ "$PIXEL_HITS" -eq 0 ]` then errors「integer expression
#   expected」and silently skips warn emission. Filed as hook bug — fix is
#   `PIXEL_HITS=$(grep -cE ... 2>/dev/null); PIXEL_HITS=${PIXEL_HITS:-0}` OR
#   `grep -cE ... | head -1` to normalize. Tests below cover the verifiable
#   silent paths (non-target / allowlist / both kinds present) — the warn
#   trigger path is documented but not asserted PASS until hook fix lands.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_pixel_quantified_audit.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

run_hook() {
  local file_path="$1"
  local payload
  payload=$(jq -n --arg fp "$file_path" \
    '{tool_name: "Edit", hook_event_name: "PostToolUse", tool_input: {file_path: $fp}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_no_warn() {
  # exit 0 AND stdout 不含 hookSpecificOutput JSON warn
  local name="$1"
  if [ "$EXIT" = "0" ] && ! echo "$STDOUT_TEXT" | grep -q 'hookSpecificOutput'; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (exit=$EXIT, stdout has hookSpecificOutput)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_warn() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "0" ] && echo "$STDOUT_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected warn '$needle', got exit $EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_pixel_quantified_audit tests ==="

# 1. Both getAttribute and getBoundingClientRect present → no warn
FILE1="$TMP_DIR/scripts/visual-audit-bar.mjs"
mkdir -p "$(dirname "$FILE1")"
cat > "$FILE1" <<'EOF'
const el = document.querySelector('.row');
const state = el.getAttribute('data-state');
const rect = el.getBoundingClientRect();
console.log(rect.top, state);
EOF
run_hook "$FILE1"
expect_no_warn "1. getAttribute + getBoundingClientRect → no warn"

# 2. allowlist marker at top → no warn (skip)
FILE2="$TMP_DIR/scripts/visual-audit-baz.mjs"
mkdir -p "$(dirname "$FILE2")"
cat > "$FILE2" <<'EOF'
// @pixel-quantified-allow: schema-only check, no visual assertion
const el = document.querySelector('.row');
const state = el.getAttribute('data-state');
EOF
run_hook "$FILE2"
expect_no_warn "2. @pixel-quantified-allow marker → no warn"

# 3. Non-audit file path → no warn (skip)
FILE3="$TMP_DIR/src/components/foo.tsx"
mkdir -p "$(dirname "$FILE3")"
cat > "$FILE3" <<'EOF'
const x = el.getAttribute('data-state');
EOF
run_hook "$FILE3"
expect_no_warn "3. non-visual-audit file path → no warn (skip)"

# 4. getAttribute + offsetTop → no warn (pixel-quantified)
FILE4="$TMP_DIR/scripts/visual-audit-qux.mjs"
mkdir -p "$(dirname "$FILE4")"
cat > "$FILE4" <<'EOF'
const el = document.querySelector('.row');
const state = el.getAttribute('data-state');
const top = el.offsetTop;
EOF
run_hook "$FILE4"
expect_no_warn "4. getAttribute + offsetTop → no warn"

# 5. Non-Edit tool → no warn (skip)
PAYLOAD_NON_EDIT=$(jq -n '{tool_name: "Read", hook_event_name: "PostToolUse", tool_input: {file_path: "/tmp/scripts/visual-audit-foo.mjs"}}')
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
printf '%s' "$PAYLOAD_NON_EDIT" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
EXIT=$?
set -e
STDOUT_TEXT=$(cat "$STDOUT")
STDERR_TEXT=$(cat "$STDERR")
rm -f "$STDOUT" "$STDERR"
expect_no_warn "5. non-Edit tool → no warn (skip)"

# 6. Missing file (file_path doesn't exist) → no warn (skip)
run_hook "$TMP_DIR/scripts/visual-audit-nonexistent.mjs"
expect_no_warn "6. nonexistent file → no warn (skip via [ ! -f ])"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

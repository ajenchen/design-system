#!/bin/bash
# Tests for check_field_state_token_consume.sh(2026-05-05 v9 升級規則)
#
# v9 rule:naked **完全繼承 Field default state machine**(border-based)— 禁所有自寫
# outline-{border|primary} state ring + 禁 box-shadow inset。
#
# 7 scenarios:
#   1. SSOT host(field-wrapper.tsx)→ skip
#   2. SSOT host(textarea.tsx)→ skip
#   3. Story file → skip
#   4. 自寫 outline-border / outline-primary state ring → block(任何 .tsx 都不該寫)
#   5. 用 Field default border-based state(border-border-hover / border-primary)→ pass
#   6. box-shadow inset 舊寫法 → block(Match A)
#   7. allowlist comment → pass

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_field_state_token_consume.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

run_hook() {
  local file_path="$1"
  local content="$2"
  local tool="${3:-Write}"
  local payload
  payload=$(jq -n --arg tool "$tool" --arg fp "$file_path" --arg c "$content" \
    '{tool_name: $tool, tool_input: {file_path: $fp, content: $c}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT"); STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_pass() {
  local name="$1"
  if [ "$EXIT" = "0" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit 0, got $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_block() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit 2 + stderr '$needle', got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_field_state_token_consume tests ==="

# 1. SSOT host field-wrapper.tsx → skip
run_hook "/repo/src/design-system/components/Field/field-wrapper.tsx" '
const x = "hover:outline-border focus-within:outline-primary"
'
expect_pass "1. SSOT host field-wrapper → skip"

# 2. SSOT host textarea.tsx → skip
run_hook "/repo/src/design-system/components/Textarea/textarea.tsx" '
const x = "hover:outline-border data-[state=open]:outline-primary"
'
expect_pass "2. SSOT host textarea → skip"

# 3. Story file → skip
run_hook "/repo/src/design-system/components/Foo/foo.stories.tsx" '
const x = "hover:outline-border"
'
expect_pass "3. Story file → skip"

# 4. 自寫 outline-border state ring → block(v9 任何 .tsx 都禁)
run_hook "/repo/src/design-system/components/Bad/bad.tsx" '
function Foo() {
  return <div className="hover:outline-border focus-within:outline-primary" />
}
'
expect_block "4. self-coded outline state ring → block" "M19 BLOCKER"

# 5. Field default border-based state → pass(v9 期望走 Field native)
run_hook "/repo/src/design-system/components/Good/good.tsx" '
function Foo() {
  return <div className="border border-border hover:border-border-hover focus-within:border-primary" />
}
'
expect_pass "5. Field default border state machine → pass"

# 6. box-shadow inset 舊寫法 → block
run_hook "/repo/src/design-system/components/Old/old.tsx" '
function Foo() {
  return <div className="hover:shadow-[inset_0_0_0_2px_var(--border)]" />
}
'
expect_block "6. box-shadow inset → block" "M19 BLOCKER"

# 7. allowlist comment → pass
run_hook "/repo/src/design-system/components/Edge/edge.tsx" '
// @field-state-ring-allow: this is in popover content, not a cell
function Foo() {
  return <div className="hover:outline-border" />
}
'
expect_pass "7. allowlist → pass"

# 8. v13.5 NEW rule B: per-control `open && "border-primary"` → block
run_hook "/repo/src/design-system/components/Combobox/combobox.tsx" '
function Foo({ open, error }) {
  return <div className={cn(fieldWrapperStyles({mode:"edit"}), open && !error && "border-primary")} />
}
'
expect_block "8. per-control open && border-primary → block" "M19 BLOCKER(rule B"

# 9. v13.5 NEW rule B: per-control `data-[state=open]:border-primary` → block
run_hook "/repo/src/design-system/components/PeoplePicker/people-picker.tsx" '
function Foo() {
  return <div className="cursor-pointer data-[state=open]:border-primary" />
}
'
expect_block "9. per-control data-[state=open]:border-primary → block" "M19 BLOCKER(rule B"

# 10. v13.5 rule B should NOT block Field default state machine class
run_hook "/repo/src/design-system/components/Good/good.tsx" '
function Foo() {
  return <div className="border border-border hover:border-border-hover focus-within:!border-primary data-[state=open]:border-border-hover" />
}
'
expect_pass "10. Field default v13.3 state machine (focus-within !important) → pass"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

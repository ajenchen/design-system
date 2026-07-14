#!/bin/bash
# Tests for check_field_family_invariants.sh — merged sub-rules(A.1-A.4 + A.6)
#
# Coverage(每 sub-rule pass + block 各 1 case):
#   A.1 naked row-mode propagation:pass / block / allowlist
#   A.2 FieldControlGroup wrapper child:pass / block / allowlist
#   A.3 Field state ring SSOT:pass / 3 block(shadow inset / outline / per-control open)
#   A.4 disabled placeholder color:pass / 1 stderr-warn(exit 0)/ allowlist
#   A.6 空值顯示 SSOT(2026-07-08 半形 hyphen):非 owner import EMPTY_DISPLAY block /
#       owner skip / 全形 em dash block / 半形 pass / allowlist
#   non-target:non-tsx skip / SSOT host skip(field-wrapper.tsx)

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_field_family_invariants.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable: $HOOK"; exit 1; }

PASS=0; FAIL=0; FAILED_TESTS=""

run_hook() {
  local file_path="$1" content="$2" tool="${3:-Write}"
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

expect_exit() {
  local name="$1" expect="$2" needle="${3:-}"
  if [ "$EXIT" = "$expect" ] && { [ -z "$needle" ] || echo "$STDERR_TEXT" | grep -qF "$needle"; }; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit $expect${needle:+ + needle '$needle'}, got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== A.1 naked row-mode propagation ==="

# 1. naked + items-center + nakedCellRowModeAlign import → pass
run_hook "/r/packages/design-system/src/components/PeoplePicker/people-picker.tsx" '
import { nakedCellRowModeAlign } from "@/design-system/components/Field/field-wrapper"
function F() { return <div variant="naked" className="inline-flex items-center" /> }
'
expect_exit "A.1.1 naked + import → pass" 0

# 2. naked + items-center + no SSOT → BLOCK
run_hook "/r/packages/design-system/src/components/Bad/bad.tsx" '
function F() { return <span variant="naked" className="inline-flex items-center" /> }
'
expect_exit "A.1.2 naked + no SSOT → BLOCK" 2 "naked row-mode propagation"

# 2b. 2026-06-03 回歸防護(同 R8 bug class):naked + items-center 跨多行 className(真實 JSX 格式)
#     + no SSOT → BLOCK。修前 grep 逐行 → 多行 className 靜默漏 = P0 false-negative(對抗稽核抓到)。
run_hook "/r/packages/design-system/src/components/BadMulti/bad-multi.tsx" '
function F() { return <span variant="naked" className="inline-flex
  bg-white
  items-center" /> }
'
expect_exit "A.1.2b naked + 多行 className → BLOCK(回歸防護)" 2 "naked row-mode propagation"

# 3. allowlist → pass
run_hook "/r/packages/design-system/src/components/Edge/edge.tsx" '
// @naked-row-mode-allow: popover content
function F() { return <span variant="naked" className="inline-flex items-center" /> }
'
expect_exit "A.1.3 allowlist → pass" 0

# 4. SSOT host skip(field-wrapper.tsx)→ pass(自身 SSOT,不檢)
run_hook "/r/packages/design-system/src/components/Field/field-wrapper.tsx" '
function F() { return <span variant="naked" className="inline-flex items-center" /> }
'
expect_exit "A.1.4 SSOT host skip → pass" 0

echo ""
echo "=== A.2 FieldControlGroup wrapper direct child ==="

# 5. <FieldControlGroup> 內 <div wrapper> → WARN(exit 1)
run_hook "/r/packages/design-system/src/components/Filter/filter.tsx" '
function F() { return (
  <FieldControlGroup>
    <div className="flex-1 min-w-0">
      <FilterValuePicker />
    </div>
  </FieldControlGroup>
)}
'
expect_exit "A.2.1 FCG with div wrapper → WARN" 1 "FieldControlGroup wrapper"

# 6. <FieldControlGroup> 直接 child 沒 wrapper → pass
run_hook "/r/packages/design-system/src/components/Filter/filter.tsx" '
function F() { return (
  <FieldControlGroup>
    <FilterValuePicker className="flex-1 min-w-0" />
  </FieldControlGroup>
)}
'
expect_exit "A.2.2 FCG direct child → pass" 0

# 7. allowlist → pass
run_hook "/r/packages/design-system/src/components/Filter/filter.tsx" '
// @fcg-wrapper-allow: legacy migration
function F() { return (
  <FieldControlGroup>
    <div><FilterValuePicker /></div>
  </FieldControlGroup>
)}
'
expect_exit "A.2.3 FCG allowlist → pass" 0

echo ""
echo "=== A.3 Field state ring SSOT ==="

# 8. shadow-[inset → BLOCK
run_hook "/r/packages/design-system/src/components/Combobox/combobox.tsx" '
const cls = "hover:shadow-[inset_0_0_0_1px_var(--border)]"
'
expect_exit "A.3.1 shadow-[inset → BLOCK" 2 "shadow inset"

# 9. focus-within:outline-primary → BLOCK
run_hook "/r/packages/design-system/src/components/Select/select.tsx" '
const cls = "focus-within:outline-primary"
'
expect_exit "A.3.2 outline state ring → BLOCK" 2 "outline"

# 10. open && border-primary → BLOCK
run_hook "/r/packages/design-system/src/components/Select/select.tsx" "
const cls = open && 'border-primary'
"
expect_exit "A.3.3 per-control open=blue → BLOCK" 2 "open=blue"

# 11. SSOT host skip(textarea.tsx)→ pass
run_hook "/r/packages/design-system/src/components/Textarea/textarea.tsx" '
const cls = "hover:shadow-[inset_0_0_0_1px_red]"
'
expect_exit "A.3.4 textarea SSOT skip → pass" 0

echo ""
echo "=== A.4 disabled placeholder color ==="

# 12. placeholder:text-fg-muted no override → exit 0 with stderr warn
run_hook "/r/packages/design-system/src/components/Custom/custom.tsx" '
const cls = "placeholder:text-fg-muted"
'
# A.4 是 P1 stderr,exit 0 — verify stderr 有 warn 訊息但不 fail
if [ "$EXIT" = "0" ] && echo "$STDERR_TEXT" | grep -q "disabled placeholder color"; then
  echo "  PASS  A.4.1 placeholder:text-fg-muted no override → stderr warn, exit 0"
  PASS=$((PASS+1))
else
  echo "  FAIL  A.4.1 (expected exit 0 + stderr 'disabled placeholder color', got exit $EXIT)"
  echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - A.4.1"
fi

# 13. placeholder + disabled override → pass(stderr 不該 fire)
run_hook "/r/packages/design-system/src/components/Custom/custom.tsx" '
const cls = "placeholder:text-fg-muted disabled:placeholder:text-fg-disabled"
'
if [ "$EXIT" = "0" ] && ! echo "$STDERR_TEXT" | grep -q "disabled placeholder color"; then
  echo "  PASS  A.4.2 placeholder + disabled override → silent pass"
  PASS=$((PASS+1))
else
  echo "  FAIL  A.4.2 (expected silent exit 0, got stderr fire)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - A.4.2"
fi

# 14. allowlist → silent pass
run_hook "/r/packages/design-system/src/components/Custom/custom.tsx" '
// @disabled-color-allow: caption text intentionally muted across modes
const cls = "placeholder:text-fg-muted"
'
if [ "$EXIT" = "0" ] && ! echo "$STDERR_TEXT" | grep -q "disabled placeholder color"; then
  echo "  PASS  A.4.3 allowlist → silent pass"
  PASS=$((PASS+1))
else
  echo "  FAIL  A.4.3"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - A.4.3"
fi

echo ""
echo "=== A.6 空值顯示 SSOT(2026-07-08 半形 hyphen)==="

# 17. 非 owner import EMPTY_DISPLAY → BLOCK(應消費 useFieldEmptyDisplay hook 分流)
run_hook "/r/packages/design-system/src/components/Bad/bad.tsx" "import { EMPTY_DISPLAY } from '@/design-system/components/Field/field-wrapper'"
expect_exit "A.6.1 非 owner import EMPTY_DISPLAY → BLOCK" 2 "EMPTY_DISPLAY 直引"

# 18. owner field-context.ts import EMPTY_DISPLAY → pass(SSOT owner skip)
run_hook "/r/packages/design-system/src/components/Field/field-context.ts" "import { EMPTY_DISPLAY } from './field-wrapper'"
expect_exit "A.6.1 owner field-context.ts import → pass" 0

# 19. components tsx hardcode 全形 em dash '—' → BLOCK
run_hook "/r/packages/design-system/src/components/Bad/bad.tsx" "const cls = value ?? '—'"
expect_exit "A.6.2 hardcode 全形 em dash → BLOCK" 2 "全形 em dash"

# 20. 半形 hyphen '-' → pass(非全形,不觸發)
run_hook "/r/packages/design-system/src/components/Bad/bad.tsx" "const sep = '-'"
expect_exit "A.6.2 半形 hyphen → pass" 0

# 21. allowlist → pass
run_hook "/r/packages/design-system/src/components/Bad/bad.tsx" "const cls = value ?? '—' // @empty-display-allow: legacy N/A marker"
expect_exit "A.6 allowlist → pass" 0

echo ""
echo "=== Skip cases ==="

# 15. non-tsx → skip
run_hook "/r/packages/design-system/src/components/Foo.md" 'placeholder:text-fg-muted'
expect_exit "S.1 non-tsx → skip" 0

# 16. read tool → skip
run_hook "/r/packages/design-system/src/components/Foo.tsx" 'irrelevant' Read
expect_exit "S.2 non-edit tool → skip" 0

echo ""
echo "═══ Results: $PASS PASS, $FAIL FAIL ═══"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

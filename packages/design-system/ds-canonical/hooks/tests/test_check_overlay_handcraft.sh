#!/bin/bash
# Tests for check_overlay_handcraft.sh
# Focus: Check 6(2026-05-01)— overlay body 重新引入 stripped-padding boolean variant 攔阻
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../lib/_overlay_handcraft.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }
PASS=0; FAIL=0

setup() { TMP=$(mktemp -d); mkdir -p "$TMP/.claude/hooks"; echo 'log_hook_fire(){ :; }' > "$TMP/.claude/hooks/_log-fire.sh"; }
teardown() { rm -rf "$TMP"; }

run() {
  local fp="$1"
  STDOUT=$(echo "{\"tool_input\":{\"file_path\":\"$fp\"}}" | bash "$HOOK" 2>&1)
  EXIT=$?
}

# Test 1: out-of-scope file(non-overlay path)→ silent
echo "Test 1: out-of-scope path → silent for Check 6"
setup
mkdir -p "$TMP/packages/design-system/src/components/Button"
cat > "$TMP/packages/design-system/src/components/Button/button.tsx" <<'EOF'
interface ButtonProps { flush?: boolean }
EOF
run "$TMP/packages/design-system/src/components/Button/button.tsx"
echo "$STDOUT" | grep -q "stripped-padding boolean variant" && { echo "  FAIL: false positive on Button"; FAIL=$((FAIL+1)); } || { echo "  PASS"; PASS=$((PASS+1)); }
teardown

# Test 2: DialogBody re-introducing flush?: boolean → flagged
echo "Test 2: DialogBody flush?: boolean → flagged"
setup
mkdir -p "$TMP/packages/design-system/src/components/Dialog"
cat > "$TMP/packages/design-system/src/components/Dialog/dialog.tsx" <<'EOF'
interface DialogBodyProps {
  flush?: boolean
}
EOF
run "$TMP/packages/design-system/src/components/Dialog/dialog.tsx"
echo "$STDOUT" | grep -q "stripped-padding boolean variant" && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL: $STDOUT"; FAIL=$((FAIL+1)); }
teardown

# Test 3: SheetBody flush = false destructure default → flagged
echo "Test 3: SheetBody flush = false destructure → flagged"
setup
mkdir -p "$TMP/packages/design-system/src/components/Sheet"
cat > "$TMP/packages/design-system/src/components/Sheet/sheet.tsx" <<'EOF'
const SheetBody = ({ flush = false }) => null
interface X { flush?: boolean }
EOF
run "$TMP/packages/design-system/src/components/Sheet/sheet.tsx"
echo "$STDOUT" | grep -q "stripped-padding boolean variant" && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL: $STDOUT"; FAIL=$((FAIL+1)); }
teardown

# Test 4: PopoverBody naked?: boolean(equivalent rename)→ flagged
echo "Test 4: PopoverBody naked?: boolean → flagged"
setup
mkdir -p "$TMP/packages/design-system/src/components/Popover"
cat > "$TMP/packages/design-system/src/components/Popover/popover.tsx" <<'EOF'
interface PopoverBodyProps { naked?: boolean }
EOF
run "$TMP/packages/design-system/src/components/Popover/popover.tsx"
echo "$STDOUT" | grep -q "stripped-padding boolean variant" && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL: $STDOUT"; FAIL=$((FAIL+1)); }
teardown

# Test 5: bare?: boolean(equivalent rename)→ flagged
echo "Test 5: DialogBody bare?: boolean → flagged"
setup
mkdir -p "$TMP/packages/design-system/src/components/Dialog"
cat > "$TMP/packages/design-system/src/components/Dialog/dialog.tsx" <<'EOF'
interface Y { bare?: boolean }
EOF
run "$TMP/packages/design-system/src/components/Dialog/dialog.tsx"
echo "$STDOUT" | grep -q "stripped-padding boolean variant" && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL: $STDOUT"; FAIL=$((FAIL+1)); }
teardown

# Test 6: noPadding?: boolean(equivalent rename)→ flagged
echo "Test 6: SheetBody noPadding?: boolean → flagged"
setup
mkdir -p "$TMP/packages/design-system/src/components/Sheet"
cat > "$TMP/packages/design-system/src/components/Sheet/sheet.tsx" <<'EOF'
interface Z { noPadding?: boolean }
EOF
run "$TMP/packages/design-system/src/components/Sheet/sheet.tsx"
echo "$STDOUT" | grep -q "stripped-padding boolean variant" && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL: $STDOUT"; FAIL=$((FAIL+1)); }
teardown

# Test 7: stories.tsx 內出現 flush?: boolean → silent(stories scope skip)
echo "Test 7: stories.tsx flush?: boolean → skipped(out-of-scope)"
setup
mkdir -p "$TMP/packages/design-system/src/components/Dialog"
cat > "$TMP/packages/design-system/src/components/Dialog/dialog.stories.tsx" <<'EOF'
interface ExampleProps { flush?: boolean }
EOF
run "$TMP/packages/design-system/src/components/Dialog/dialog.stories.tsx"
echo "$STDOUT" | grep -q "stripped-padding boolean variant" && { echo "  FAIL: false positive on stories"; FAIL=$((FAIL+1)); } || { echo "  PASS"; PASS=$((PASS+1)); }
teardown

# Test 8: allowlist comment escape hatch → silent
echo "Test 8: allowlist escape hatch → silent"
setup
mkdir -p "$TMP/packages/design-system/src/components/Dialog"
cat > "$TMP/packages/design-system/src/components/Dialog/dialog.tsx" <<'EOF'
// overlay-body-stripped-variant-allow: 已對照 Polaris/Material/X 三家,multi-row 已驗證 hold
interface DialogBodyProps { flush?: boolean }
EOF
run "$TMP/packages/design-system/src/components/Dialog/dialog.tsx"
echo "$STDOUT" | grep -q "stripped-padding boolean variant" && { echo "  FAIL: allowlist not honored"; FAIL=$((FAIL+1)); } || { echo "  PASS"; PASS=$((PASS+1)); }
teardown

# Test 9: clean DialogBody(post-2026-05-01 canonical)→ silent
echo "Test 9: clean DialogBody(no flush variant)→ silent"
setup
mkdir -p "$TMP/packages/design-system/src/components/Dialog"
cat > "$TMP/packages/design-system/src/components/Dialog/dialog.tsx" <<'EOF'
const DialogBody = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof ScrollArea>>(
  ({ className, children, ...props }, ref) => null
)
EOF
run "$TMP/packages/design-system/src/components/Dialog/dialog.tsx"
echo "$STDOUT" | grep -q "stripped-padding boolean variant" && { echo "  FAIL: false positive on clean canonical"; FAIL=$((FAIL+1)); } || { echo "  PASS"; PASS=$((PASS+1)); }
teardown

# ── Check 2.5:自刻 row(MenuItem-like)—— 2026-09-25 滑過底色放寬,認任何 `-hover` 配對 token(含 var() 與 ! 寫法)──
# 放寬前 fixture 只有 hover:bg-neutral-hover;這裡先釘 baseline,再證明新配對也被認得、非配對 token 不誤攔、豁免有效。
row_case() {
  local className="$1" expect="$2"
  setup
  mkdir -p "$TMP/apps/demo/src"
  printf '<div className="%s">row</div>\n' "$className" > "$TMP/apps/demo/src/Rail.tsx"
  run "$TMP/apps/demo/src/Rail.tsx"
  if [ "$expect" = hit ]; then
    echo "$STDOUT" | grep -q "自刻 row" && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL: $STDOUT"; FAIL=$((FAIL+1)); }
  else
    echo "$STDOUT" | grep -q "自刻 row" && { echo "  FAIL: false positive: $STDOUT"; FAIL=$((FAIL+1)); } || { echo "  PASS"; PASS=$((PASS+1)); }
  fi
  teardown
}
echo "Test 10: Check 2.5 baseline hover:bg-neutral-hover row → flagged"
row_case "flex gap-2 px-[var(--layout-space-loose)] py-1.5 hover:bg-neutral-hover rounded-md" hit
echo "Test 11: Check 2.5 hover:bg-secondary-hover 也被認得 → flagged"
row_case "flex gap-2 px-[var(--layout-space-loose)] py-1.5 hover:bg-secondary-hover rounded-md" hit
echo "Test 12: Check 2.5 hover:!bg-[var(--surface-hover)] 寫法 → flagged"
row_case "flex gap-2 px-[var(--layout-space-loose)] py-1.5 hover:!bg-[var(--surface-hover)] rounded-md" hit
echo "Test 13: Check 2.5 非配對 token(hover:opacity-80)→ silent"
row_case "flex gap-2 px-[var(--layout-space-loose)] py-1.5 hover:opacity-80 rounded-md" silent
echo "Test 14: Check 2.5 menu-item-handcraft-allow 豁免 → silent"
setup
mkdir -p "$TMP/apps/demo/src"
printf '%s\n' '// menu-item-handcraft-allow: virtualized third-party row contract' \
  '<div className="flex gap-2 px-[var(--layout-space-loose)] py-1.5 hover:bg-secondary-hover rounded-md">row</div>' > "$TMP/apps/demo/src/Rail.tsx"
run "$TMP/apps/demo/src/Rail.tsx"
echo "$STDOUT" | grep -q "自刻 row" && { echo "  FAIL: allowlist not honored: $STDOUT"; FAIL=$((FAIL+1)); } || { echo "  PASS"; PASS=$((PASS+1)); }
teardown

echo ""
echo "Summary: $PASS passed / $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1

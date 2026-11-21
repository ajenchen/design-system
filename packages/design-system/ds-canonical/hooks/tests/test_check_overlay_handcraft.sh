#!/bin/bash
# Tests for lib/_overlay_handcraft.sh(post_edit_dispatcher.sh 的 helper)
# Test 1–14:Check 6 stripped-padding boolean variant / Check 2.5 自刻 row 的偵測面與豁免。
# Test 15–23(2026-11-18 D4-02 起會擋):留下的三條新增行 → exit 2、豁免沒理由照擋、逐行豁免不再整檔放行、
# 退場的三條不再判、既有違規只列不擋。
# Test 25–26:同一組判法吃正式入口 run-provider-hook.mjs 的輸入形狀(content + old_string,沒有 new_string)。
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../lib/_overlay_handcraft.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }
PASS=0; FAIL=0

setup() { TMP=$(mktemp -d); [ -n "${TMP:-}" ] && [ -d "$TMP" ] || { echo "❌ mktemp -d failed(TMP;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }; mkdir -p "$TMP/.claude/hooks"; echo 'log_hook_fire(){ :; }' > "$TMP/.claude/hooks/_log-fire.sh"; }
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

# ── 2026-11-18 D4-02:留下的三條會擋(exit 2)、另三條「同檔出現」代理退場 ──
expect_rc() { # <name> <expected exit>
  [ "$EXIT" = "$2" ] && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL: $1 expected exit $2, got $EXIT: $STDOUT"; FAIL=$((FAIL+1)); }
}
write_rail() { # <line>...
  setup
  mkdir -p "$TMP/apps/demo/src"
  printf '%s\n' "$@" > "$TMP/apps/demo/src/Rail.tsx"
  run "$TMP/apps/demo/src/Rail.tsx"
}

echo "Test 15: Check 1 自刻 overlay chrome(新增行)→ exit 2"
write_rail '<div className="px-[var(--layout-space-loose)] py-2 border-b border-divider">標題</div>'
expect_rc 'chrome block' 2
teardown

echo "Test 16: Check 1 同一行豁免(有理由)→ 放行"
write_rail '<div className="px-[var(--layout-space-loose)] border-b border-divider">x</div> // overlay-handcraft-allow: 非浮層 panel,只借 layout-space token'
expect_rc 'chrome same-line escape' 0
teardown

echo "Test 17: Check 1 豁免沒寫理由 → 照擋"
write_rail '// overlay-handcraft-allow:' '<div className="px-[var(--layout-space-loose)] border-t border-divider">x</div>'
expect_rc 'chrome escape without rationale' 2
teardown

echo "Test 18: Check 2.5 豁免改成逐行:檔頭那一行不再放行第三行的自刻列"
write_rail '// menu-item-handcraft-allow: virtualized third-party row contract' 'const spacer = 1' \
  '<div className="flex gap-2 px-[var(--layout-space-loose)] py-1.5 hover:bg-secondary-hover rounded-md">row</div>'
expect_rc 'row file-level escape no longer exempts a distant line' 2
teardown

echo "Test 19: Check 6 命中 → exit 2(不只出聲)"
setup
mkdir -p "$TMP/packages/design-system/src/components/Popover"
printf '%s\n' 'interface PopoverBodyProps { unpadded?: boolean }' > "$TMP/packages/design-system/src/components/Popover/popover.tsx"
run "$TMP/packages/design-system/src/components/Popover/popover.tsx"
expect_rc 'stripped variant block' 2
teardown

echo "Test 20: 退場的 Check 2 —— 同檔兩顆 raw <Checkbox> 不再判(DataTable cell renderer 型)"
write_rail 'return <Checkbox variant="naked" checked={value} />' '<Checkbox checked={row.getIsSelected()} />'
expect_rc 'retired checkbox count' 0
teardown

echo "Test 21: 退場的 Check 4 —— PopoverHeader + MenuItem 同檔不再判(overlay-surface.spec.md「Menu 移植到 Dialog body」)"
write_rail '<PopoverHeader><PopoverTitle>排序</PopoverTitle></PopoverHeader>' '<MenuItem className="px-[var(--layout-space-loose)]">名稱</MenuItem>'
expect_rc 'retired panel + MenuItem' 0
teardown

echo "Test 22: 退場的 Check 5 —— InlineAction 與 Button iconOnly 同檔不再判(同檔 ≠ 同一列)"
write_rail '<ItemInlineActionButton aria-label="刪除" />' '<Button iconOnly aria-label="重新整理" />'
expect_rc 'retired same-file mixing' 0
teardown

echo "Test 23: 既有違規(這次 Edit 只新增乾淨的行)→ exit 0 + 既有清單,不擋"
setup
mkdir -p "$TMP/apps/demo/src"
printf '%s\n' 'const title = 1' '<div className="px-[var(--layout-space-loose)] border-b border-divider">x</div>' > "$TMP/apps/demo/src/Rail.tsx"
STDOUT=$(jq -nc --arg p "$TMP/apps/demo/src/Rail.tsx" '{tool_name:"Edit",tool_input:{file_path:$p,old_string:"const title = 0",new_string:"const title = 1"}}' | bash "$HOOK" 2>&1)
EXIT=$?
if [ "$EXIT" = 0 ] && printf '%s' "$STDOUT" | jq -e '.governanceContext.message | contains("既有違規") and contains("自刻 overlay chrome")' >/dev/null 2>&1; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: existing chrome should be context, got exit $EXIT: $STDOUT"; FAIL=$((FAIL+1))
fi
teardown

echo "Test 24: 片段 Edit(只在既有列尾加上 border-b border-divider)讓那一行變成自刻 chrome → exit 2"
setup
mkdir -p "$TMP/apps/demo/src"
printf '%s\n' 'const title = 1' '<div className="px-[var(--layout-space-loose)] py-2 border-b border-divider">x</div>' > "$TMP/apps/demo/src/Rail.tsx"
STDOUT=$(jq -nc --arg p "$TMP/apps/demo/src/Rail.tsx" '{tool_name:"Edit",tool_input:{file_path:$p,old_string:"py-2\"",new_string:"py-2 border-b border-divider\""}}' | bash "$HOOK" 2>&1)
EXIT=$?
expect_rc 'partial-line edit creating chrome' 2
teardown

# Test 25–26(WP-15a 審查必修 1):正式入口 scripts/run-provider-hook.mjs 交給 hook 的形狀沒有 new_string,
# 只有 content(這次寫進去的文字)+ old_string。兩面對照:修正前 Test 25 是 exit 0 + 既有(正式路徑上從沒擋過);Test 26 修正前後都是既有。
echo "Test 25: 正式入口形狀(content + old_string)的片段 Edit 讓那一行變成自刻 chrome → exit 2"
setup
mkdir -p "$TMP/apps/demo/src"
printf '%s\n' 'const title = 1' '<div className="px-[var(--layout-space-loose)] py-2 border-b border-divider">x</div>' > "$TMP/apps/demo/src/Rail.tsx"
STDOUT=$(jq -nc --arg p "$TMP/apps/demo/src/Rail.tsx" '{tool_name:"Edit",tool_input:{file_path:$p,path:$p,old_string:"py-2\"",content:"py-2 border-b border-divider\""}}' | bash "$HOOK" 2>&1)
EXIT=$?
expect_rc 'runner-shape partial-line edit creating chrome' 2
teardown

echo "Test 26: 正式入口形狀、改的是別行 → 既有 chrome 只列不擋"
setup
mkdir -p "$TMP/apps/demo/src"
printf '%s\n' 'const title = 1' '<div className="px-[var(--layout-space-loose)] py-2 border-b border-divider">x</div>' > "$TMP/apps/demo/src/Rail.tsx"
STDOUT=$(jq -nc --arg p "$TMP/apps/demo/src/Rail.tsx" '{tool_name:"Edit",tool_input:{file_path:$p,path:$p,old_string:"title = 0",content:"title = 1"}}' | bash "$HOOK" 2>&1)
EXIT=$?
if [ "$EXIT" = 0 ] && printf '%s' "$STDOUT" | jq -e '.governanceContext.message | contains("既有違規") and contains("自刻 overlay chrome")' >/dev/null 2>&1; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: runner-shape edit on another line should leave chrome as existing, got exit $EXIT: $STDOUT"; FAIL=$((FAIL+1))
fi
teardown

echo ""
echo "Summary: $PASS passed / $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1

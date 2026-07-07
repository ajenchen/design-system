#!/bin/bash
# test_check_ssot_header_declaration.sh — 新建 production tsx 必帶「── 消費的 SSOT ──」段
# (2026-07-07 治理進化方向 3 洞 a;P0 exit 2;ratchet:只攔 Write 新檔)

HOOK="$(cd "$(dirname "$0")/.." && pwd)/check_ssot_header_declaration.sh"
if [ ! -f "$HOOK" ]; then echo "FATAL: hook not found: $HOOK"; exit 1; fi

PASS=0; FAIL=0; FAILED_TESTS=""

run_hook() {
  local file_path="$1"; local content="$2"; local tool="${3:-Write}"
  STDERR_TEXT=$(jq -n --arg t "$tool" --arg f "$file_path" --arg c "$content" \
    '{tool_name:$t, tool_input:{file_path:$f, content:$c}}' | bash "$HOOK" 2>&1 >/dev/null)
  EXIT=$?
}

expect_block() {
  local name="$1"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "消費的 SSOT"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit=2, got $EXIT)"; FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}
expect_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit=0, got $EXIT)"; FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_ssot_header_declaration tests ==="

# 1. 新元件 tsx 無宣告段 → BLOCK
run_hook "/repo/packages/design-system/src/components/NewThing/new-thing.tsx" 'import * as React from "react"
export const NewThing = () => <div className="flex border rounded-md px-2" />'
expect_block "1. 新元件 tsx 無 SSOT 段 → BLOCK"

# 2. 有宣告段 → pass
run_hook "/repo/packages/design-system/src/components/NewThing/new-thing.tsx" '// ── 消費的 SSOT ──
// - Button(pill layout)/ --layout-space-tight
import * as React from "react"'
expect_silent "2. 有「── 消費的 SSOT ──」段 → pass"

# 3. escape marker → pass
run_hook "/repo/packages/design-system/src/components/NewThing/util.tsx" '// @ssot-header-exempt: 純型別 utility,零視覺
export type X = string'
expect_silent "3. @ssot-header-exempt escape → pass"

# 4. stories 檔 → 豁免
run_hook "/repo/packages/design-system/src/components/NewThing/new-thing.stories.tsx" 'export default {}'
expect_silent "4. stories.tsx 豁免"

# 5. 非 DS production 路徑 → 豁免
run_hook "/repo/apps/template/src/App.tsx" 'export const App = () => <div className="flex border px-2" />'
expect_silent "5. apps/ 路徑豁免"

# 6. Edit 工具(存量檔)→ 豁免(ratchet)
run_hook "/repo/packages/design-system/src/components/Button/button.tsx" 'whatever' "Edit"
expect_silent "6. Edit(存量 ratchet)豁免"

# 7. patterns/ 新檔無宣告 → BLOCK
run_hook "/repo/packages/design-system/src/patterns/new-pattern/new-pattern.tsx" 'export const P = () => <div className="absolute shadow px-2" />'
expect_block "7. patterns/ 新檔無 SSOT 段 → BLOCK"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS+FAIL))"
if [ "$FAIL" -gt 0 ]; then printf "Failed:%b\n" "$FAILED_TESTS"; exit 1; fi
exit 0

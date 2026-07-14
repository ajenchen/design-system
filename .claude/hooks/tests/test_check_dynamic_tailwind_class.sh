#!/bin/bash
# test_check_dynamic_tailwind_class.sh — 動態 Tailwind class 哨測試
# (2026-07-10 補 hook-test-coverage debt;hook 2026-07-09 建,anchor = h-table-row-${size} row 塌)
set -uo pipefail
cd "$(dirname "$0")/../../.."
HOOK=".claude/hooks/check_dynamic_tailwind_class.sh"
PASS=0; FAIL=0; FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
export CLAUDE_PROJECT_DIR="$TMP_DIR"
mkdir -p "$TMP_DIR/.claude/logs"

PROD_TSX="/Users/x/proj/packages/design-system/src/components/DataTable/data-table.tsx"

run_hook() {
  local file_path="$1"; local content="$2"
  local payload
  payload=$(jq -n --arg fp "$file_path" --arg c "$content" \
    '{tool_name:"Edit", tool_input:{file_path:$fp, new_string:$c}}')
  STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >/dev/null 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null); rm -f "$STDERR"
}

expect_block() {
  local name="$1"
  if [ "$EXIT" = "2" ]; then echo "  PASS  $name"; PASS=$((PASS+1))
  else echo "  FAIL  $name (expected exit=2, got exit=$EXIT)"; FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"; fi
}
expect_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then echo "  PASS  $name"; PASS=$((PASS+1))
  else echo "  FAIL  $name (expected silent exit=0, got exit=$EXIT, stderr=${STDERR_TEXT:+non-empty})"; FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"; fi
}

# 1. POSITIVE:病根錨例 h-table-row-${size}(class 名含插值)→ BLOCK
run_hook "$PROD_TSX" 'const cls = `h-table-row-${size} flex`'
expect_block "1. h-table-row-\${size} → BLOCK"

# 2. POSITIVE:間距 utility gap-${g} → BLOCK
run_hook "$PROD_TSX" 'const cls = `flex gap-${g}`'
expect_block "2. gap-\${g} → BLOCK"

# 3. NEGATIVE:正解 literal map → silent
run_hook "$PROD_TSX" "const cls = { sm: 'h-table-row-sm', md: 'h-table-row-md', lg: 'h-table-row-lg' }[size]"
expect_silent "3. literal class 對照表 → silent"

# 4. NEGATIVE:arbitrary value 內插值(是值不是 class 名)→ silent
run_hook "$PROD_TSX" 'const cls = `h-[calc(100%_-_${offset}px)]`'
expect_silent "4. h-[calc(\${x})] arbitrary → silent"

# 5. NEGATIVE:var() 內插值 → silent
run_hook "$PROD_TSX" 'const cls = `w-[var(--col-${i})]`'
expect_silent "5. w-[var(--x-\${i})] → silent"

# 6. NEGATIVE:色彩 utility 不在 scope(hook 只鎖尺寸/間距)→ silent
run_hook "$PROD_TSX" 'const cls = `text-${color}`'
expect_silent "6. text-\${color}(非尺寸間距)→ silent"

# 7. NEGATIVE:escape 註解 → silent
run_hook "$PROD_TSX" 'const cls = `size-${px}` // @dynamic-tailwind-allow: 傳給 canvas 非 class'
expect_silent "7. @dynamic-tailwind-allow escape → silent"

# 8. NEGATIVE:非 production path(tests/)→ silent
run_hook "/Users/x/proj/scripts/gen-something.mjs" 'const cls = `h-${x}`'
expect_silent "8. 非 tsx production path → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then printf "Failed:%b\n" "$FAILED_TESTS"; exit 1; fi
exit 0

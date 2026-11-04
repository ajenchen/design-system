#!/bin/bash
# Tests for check_layout_space_canonical.sh
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../_layout_space_canonical.sh.retired-2026-11-04"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }
PASS=0; FAIL=0

setup() { TMP=$(mktemp -d); mkdir -p "$TMP/.claude/hooks"; echo 'log_hook_fire(){ :; }' > "$TMP/.claude/hooks/_log-fire.sh"; }
teardown() { rm -rf "$TMP"; }

run() {
  local fp="$1"
  STDOUT=$(echo "{\"tool_input\":{\"file_path\":\"$fp\"}}" | bash "$HOOK" 2>&1)
  EXIT=$?
}

# Test 1: out-of-scope file → silent
echo "Test 1: out-of-scope path → silent"
setup
echo "<div></div>" > "$TMP/random.tsx"
run "$TMP/random.tsx"
[ "$EXIT" = "0" ] && [ -z "$STDOUT" ] && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL: $STDOUT"; FAIL=$((FAIL+1)); }
teardown

# Test 2: stories.tsx with block + tight margin → flag
echo "Test 2: tight margin near DataTable → flagged"
setup
mkdir -p "$TMP/packages/design-system/src/components"
cat > "$TMP/test.stories.tsx" <<EOF
import { DataTable } from '@/design-system/components/DataTable/data-table'
export const X = { render: () => (
  <div>
    <DataTable />
    <div className="mt-[var(--layout-space-tight)]">Footer</div>
  </div>
)}
EOF
run "$TMP/test.stories.tsx"
echo "$STDOUT" | grep -q "tight margin near block" && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL: $STDOUT"; FAIL=$((FAIL+1)); }
teardown

# Test 3: gap-tight on flex-col → flag
echo "Test 3: flex-col gap-tight → flagged"
setup
cat > "$TMP/test.stories.tsx" <<EOF
export const Y = { render: () => (
  <div className="flex flex-col gap-[var(--layout-space-tight)]">
    <Input /><Button /><Select />
  </div>
)}
EOF
run "$TMP/test.stories.tsx"
echo "$STDOUT" | grep -q "flex-col gap-tight" && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL: $STDOUT"; FAIL=$((FAIL+1)); }
teardown

# Test 4: clean stories.tsx → silent
echo "Test 4: compliant stories.tsx → silent"
setup
cat > "$TMP/clean.stories.tsx" <<EOF
export const Z = { render: () => (
  <div className="flex flex-col gap-[var(--layout-space-loose)]">
    <Input /><Button />
  </div>
)}
EOF
run "$TMP/clean.stories.tsx"
[ "$EXIT" = "0" ] && [ -z "$STDOUT" ] && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL: $STDOUT"; FAIL=$((FAIL+1)); }
teardown

echo ""
echo "── Summary: $PASS / $((PASS+FAIL)) passed ──"
[ "$FAIL" -eq 0 ] && echo "✅ All passed" || exit 1

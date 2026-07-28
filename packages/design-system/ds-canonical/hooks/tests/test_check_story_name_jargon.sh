#!/bin/bash
# Tests for check_story_name_jargon.sh
set -u
export GOVERNANCE_PROVIDER=codex
export GOVERNANCE_READ_ONLY=1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Cluster A merge(2026-05-10):check_story_name_jargon.sh fold 進
# check_story_invariants.sh dispatcher R5(PostToolUse)。Test 走 dispatcher。
HOOK="$SCRIPT_DIR/../check_story_invariants.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }
PASS=0; FAIL=0

setup() { TMP=$(mktemp -d); mkdir -p "$TMP/.claude/hooks"; echo 'log_hook_fire(){ :; }' > "$TMP/.claude/hooks/_log-fire.sh"; }
teardown() { rm -rf "$TMP"; }

run() {
  local payload
  payload=$(jq -n --arg fp "$1" '{
    hook_event_name:"PostToolUse",
    tool_name:"Edit",
    tool_input:{file_path:$fp,new_string:""}
  }')
  STDOUT=$(printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$TMP" bash "$HOOK" 2>&1)
  EXIT=$?
}

# Test 1: non-stories file → silent
echo "Test 1: non-stories.tsx → silent"
setup
echo "export const x = {};" > "$TMP/foo.tsx"
run "$TMP/foo.tsx"
[ "$EXIT" = "0" ] && [ -z "$STDOUT" ] && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL"; FAIL=$((FAIL+1)); }
teardown

# Test 2: L<n> jargon → flag
echo "Test 2: 'L2 Selection' name → flagged"
setup
echo "export const X = { name: 'L2 Selection — foo' }" > "$TMP/test.stories.tsx"
run "$TMP/test.stories.tsx"
echo "$STDOUT" | grep -q "layer 代號" && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL: $STDOUT"; FAIL=$((FAIL+1)); }
teardown

# Test 3: 'canonical' in name → flag
echo "Test 3: 'canonical' name → flagged"
setup
echo "export const X = { name: '基本(canonical)' }" > "$TMP/test.stories.tsx"
run "$TMP/test.stories.tsx"
echo "$STDOUT" | grep -q "canonical" && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL"; FAIL=$((FAIL+1)); }
teardown

# Test 4: clean name → silent
echo "Test 4: 人話 name → silent"
setup
echo "export const X = { name: '基本' }" > "$TMP/test.stories.tsx"
run "$TMP/test.stories.tsx"
[ "$EXIT" = "0" ] && [ -z "$STDOUT" ] && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL: $STDOUT"; FAIL=$((FAIL+1)); }
teardown

# Test 5: quote-containing contained path is data, never Python source
echo "Test 5: quote-containing story path → safely scanned"
setup
QUOTED_PATH="$TMP/owner's-row.stories.tsx"
echo "export const X = { name: 'row 清單' }" > "$QUOTED_PATH"
run "$QUOTED_PATH"
if [ "$EXIT" = "0" ] && echo "$STDOUT" | grep -q "中英夾雜"; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: $STDOUT"; FAIL=$((FAIL+1))
fi
teardown

echo ""
echo "── Summary: $PASS / $((PASS+FAIL)) passed ──"
[ "$FAIL" -eq 0 ] && echo "✅ All passed" || exit 1

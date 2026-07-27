#!/bin/bash
# Tests for check_item_list_gap.sh(M16)

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_item_list_gap.sh"
[ ! -f "$HOOK" ] && { echo "FATAL"; exit 1; }
PASS=0; FAIL=0

run() {
  local fp="$1"; local content="$2"
  local payload=$(jq -n --arg fp "$fp" --arg c "$content" \
    '{hook_event_name:"PreToolUse",tool_name:"Write",tool_input:{file_path:$fp,content:$c}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  STDOUT_TEXT=$(cat "$STDOUT"); STDERR_TEXT=$(cat "$STDERR"); rm -f "$STDOUT" "$STDERR"
}

# Test 1:2+ FileItem 無 gap → warn
echo "Test 1: 2+ FileItem no gap → warn"
CONTENT='<div><FileItem /><FileItem /><FileItem /></div>'
run "/path/foo.tsx" "$CONTENT"
if [ -z "$STDERR_TEXT" ] && echo "$STDOUT_TEXT" | jq -e '.governanceContext.hookEventName == "PreToolUse" and (.governanceContext.message | contains("M16 Item-list gap"))' >/dev/null; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL: no model-visible context"; FAIL=$((FAIL+1)); fi

# Test 2:有 gap-2 parent → silent
echo "Test 2: with gap-2 parent → silent"
CONTENT='<div className="flex gap-2"><FileItem /><FileItem /></div>'
run "/path/foo.tsx" "$CONTENT"
if [ -z "$STDERR_TEXT" ] && [ -z "$STDOUT_TEXT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL"; FAIL=$((FAIL+1)); fi

# Test 3:single FileItem → silent
echo "Test 3: single FileItem → silent"
run "/path/foo.tsx" '<FileItem />'
if [ -z "$STDERR_TEXT" ] && [ -z "$STDOUT_TEXT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL"; FAIL=$((FAIL+1)); fi

# Test 4:stories.tsx skip
echo "Test 4: stories.tsx skip"
run "/path/foo.stories.tsx" '<FileItem /><FileItem />'
if [ -z "$STDERR_TEXT" ] && [ -z "$STDOUT_TEXT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL"; FAIL=$((FAIL+1)); fi

echo ""
echo "════ Results: $PASS PASS, $FAIL FAIL ════"
[ "$FAIL" -gt 0 ] && exit 1
exit 0

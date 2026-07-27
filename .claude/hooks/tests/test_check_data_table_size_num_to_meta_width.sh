#!/bin/bash
# 2026-06-11 repoint:check_data_table_size_num_to_meta_width.sh 已合併進 check_datatable_invariants.sh(prune merge;測試 payload 不變 = 行為等價驗證)
# Tests for check_datatable_invariants.sh(M23(c))

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_datatable_invariants.sh"
[ ! -f "$HOOK" ] && { echo "FATAL"; exit 1; }
PASS=0; FAIL=0

run() {
  local fp="$1"; local content="$2"
  local payload=$(jq -n --arg fp "$fp" --arg c "$content" \
    '{hook_event_name:"PreToolUse",tool_name:"Write",tool_input:{file_path:$fp,content:$c}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT"); STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

is_exact_context() {
  local needle="$1" compact
  compact=$(printf '%s' "$STDOUT_TEXT" | jq -c . 2>/dev/null) || return 1
  [ "$STDOUT_TEXT" = "$compact" ] || return 1
  printf '%s' "$STDOUT_TEXT" | jq -se --arg needle "$needle" '
    length == 1
    and (.[0] | type == "object" and (keys | sort) == ["governanceContext"])
    and (.[0].governanceContext |
      (keys | sort) == ["hookEventName", "message"]
      and .hookEventName == "PreToolUse"
      and (.message | type == "string" and length > 0 and contains($needle)))
  ' >/dev/null
}

# Test 1:ColumnDef + size:<number> 無 meta.width → warn
echo "Test 1: ColumnDef size:280 → warn"
CONTENT='const columns: ColumnDef[] = [{ accessorKey: "name", size: 280 }]'
run "/path/columns.tsx" "$CONTENT"
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] && is_exact_context "M23(c)"; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL: no exact context"; FAIL=$((FAIL+1)); fi

# Test 2:ColumnDef + meta.width → silent
echo "Test 2: ColumnDef meta.width → silent"
CONTENT='const columns: ColumnDef[] = [{ accessorKey: "name", meta: { width: "md" } }]'
run "/path/columns.tsx" "$CONTENT"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL"; FAIL=$((FAIL+1)); fi

# Test 3:mixed(size + meta.width) → silent(transition state allowed)
echo "Test 3: mixed size + meta.width → silent"
CONTENT='const columns: ColumnDef[] = [{ size: 280, meta: { width: "md" } }]'
run "/path/columns.tsx" "$CONTENT"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL"; FAIL=$((FAIL+1)); fi

# Test 4:non-DataTable context skip
echo "Test 4: non-DataTable context skip"
CONTENT='const x = { size: 280 }'
run "/path/unrelated.tsx" "$CONTENT"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL"; FAIL=$((FAIL+1)); fi

# Test 5:stories.tsx skip
echo "Test 5: stories.tsx skip"
CONTENT='const columns: ColumnDef[] = [{ size: 280 }]'
run "/path/foo.stories.tsx" "$CONTENT"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL"; FAIL=$((FAIL+1)); fi

echo ""
echo "════ Results: $PASS PASS, $FAIL FAIL ════"
[ "$FAIL" -gt 0 ] && exit 1
exit 0

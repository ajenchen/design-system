#!/bin/bash
# Tests for check_datatable_invariants.sh — merged 3 sub-rules
#
# 全 sub-rules 都是 P2 governance context(exit 0),不阻擋。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_datatable_invariants.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable: $HOOK"; exit 1; }

PASS=0; FAIL=0; FAILED_TESTS=""

run_hook() {
  local file_path="$1" content="$2"
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$content" \
    | jq -Rs --arg fp "$file_path" \
      '{hook_event_name:"PreToolUse", tool_name:"Write", tool_input:{file_path:$fp, content:.}}' \
    | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT"); STDERR_TEXT=$(cat "$STDERR"); rm -f "$STDOUT" "$STDERR"
}

run_raw() {
  local payload="$1"
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT"); STDERR_TEXT=$(cat "$STDERR"); rm -f "$STDOUT" "$STDERR"
}

is_exact_context() {
  local needle="$1" compact
  compact=$(printf '%s' "$STDOUT_TEXT" | jq -c . 2>/dev/null) || return 1
  [ "$STDOUT_TEXT" = "$compact" ] || return 1
  printf '%s' "$STDOUT_TEXT" | jq -se --arg needle "$needle" '
    length == 1
    and (.[0] | type == "object" and (keys | sort) == ["governanceContext"])
    and (.[0].governanceContext |
      type == "object"
      and (keys | sort) == ["hookEventName", "message"]
      and .hookEventName == "PreToolUse"
      and (.message | type == "string" and length > 0 and contains($needle)))
  ' >/dev/null
}

expect_context() {
  local name="$1" needle="$2"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] && is_exact_context "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exact PreToolUse context '$needle', exit $EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent exit 0, exit $EXIT, stderr: ${STDERR_TEXT:0:80})"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== B.1 row drag getRowId ==="

# 1. enableRowDrag without getRowId → warn
run_hook "/r/src/app/products.tsx" '
<DataTable enableRowDrag onReorder={fn} />
'
expect_context "B.1.1 enableRowDrag without getRowId → WARN" "row drag getRowId"

# 2. enableRowDrag + getRowId → silent
run_hook "/r/src/app/products.tsx" '
<DataTable enableRowDrag getRowId={(r) => r.id} onReorder={fn} />
'
expect_silent "B.1.2 enableRowDrag + getRowId → silent"

# 3. DataTable internal — skip
run_hook "/r/packages/design-system/src/components/DataTable/data-table.tsx" '
const x = "enableRowDrag"
'
expect_silent "B.1.3 DataTable internal skip → silent"

echo ""
echo "=== B.2 column size NUMBER → meta.width ==="

# 4. column with root size: NUMBER → warn
run_hook "/r/src/app/orders.tsx" '
const cols = [
  { accessorKey: "name", size: 240 },
]
'
expect_context "B.2.1 root size NUMBER → WARN" "column size NUMBER"

# 5. column with meta.width → silent
run_hook "/r/src/app/orders.tsx" '
const cols = [
  { accessorKey: "name", meta: { width: 240, type: "string" } },
]
'
expect_silent "B.2.2 meta.width → silent"

# 6. column with size 'md' (string density) → silent (not NUMBER)
run_hook "/r/src/app/orders.tsx" "
const cols = [
  { accessorKey: 'name', size: 'md' },
]
"
expect_silent "B.2.3 size 'md' string → silent"

# 7. cell-registry skip → silent
run_hook "/r/packages/design-system/src/components/DataTable/cell-registry.tsx" '
const cols = [{ accessorKey: "x", size: 240 }]
'
expect_silent "B.2.4 cell-registry skip → silent"

echo ""
echo "=== B.3 filter↔sort sibling sync ==="

# 8. edit filter panel → reminder
run_hook "/r/packages/design-system/src/components/DataTable/data-table-filter-panel.tsx" '
const x = 1
'
expect_context "B.3.1 edit filter → reminder" "data-table-sort-manager"

# 9. edit sort manager → reminder
run_hook "/r/packages/design-system/src/components/DataTable/data-table-sort-manager.tsx" '
const x = 1
'
expect_context "B.3.2 edit sort → reminder" "data-table-filter-panel"

# 10. unrelated tsx → silent
run_hook "/r/src/app/foo.tsx" 'const x = 1'
expect_silent "B.3.3 unrelated tsx → silent"

# Full-file replays can be hundreds of KiB. `producer | grep -q` makes the
# producer receive SIGPIPE after an early match and Bash emits a raw
# "write error: Broken pipe" on stderr, which correctly violates the neutral
# rc0 output contract. Keep the payload on stdin/here-strings instead.
LARGE_CONTENT=$(
  printf '%s\n' \
    'const columns = createColumnHelper<Row>()' \
    'const table = <DataTable enableRowDrag getRowId={(row) => row.id} />'
  awk 'BEGIN { for (i = 0; i < 24000; i += 1) print "// deterministic large replay filler 0123456789" }'
)
run_hook "/r/src/app/large-replay.tsx" "$LARGE_CONTENT"
expect_silent "large full-file replay has no broken-pipe stderr"
unset LARGE_CONTENT

# B.1 + B.2 warnings must be aggregated into one provider-neutral context.
run_hook "/r/src/app/products.tsx" '
const columns = [{ accessorKey: "name", size: 240 }]
const table = <DataTable enableRowDrag />
'
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] \
  && is_exact_context "row drag getRowId" \
  && printf '%s' "$STDOUT_TEXT" | jq -e \
    '.governanceContext.message | contains("column size NUMBER")' >/dev/null; then
  echo "  PASS  multiple DataTable warnings → one exact PreToolUse context"
  PASS=$((PASS+1))
else
  echo "  FAIL  DataTable warning aggregation contract"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - warning aggregation"
fi

# 11. Composite integrity:an undefined child status must not be rewritten as advisory success.
FAULT_DIR=$(mktemp -d)
trap 'rm -rf -- "$FAULT_DIR"' EXIT
awk '
  { print }
  $0 == "r1_datatable_invariants() {" { print "return 1" }
' "$HOOK" >"$FAULT_DIR/check_datatable_invariants.sh"
set +e
printf '%s' '{}' | bash "$FAULT_DIR/check_datatable_invariants.sh" \
  >"$FAULT_DIR/stdout" 2>"$FAULT_DIR/stderr"
FAULT_RC=$?
set -e
if [ "$FAULT_RC" -eq 70 ] \
  && [ ! -s "$FAULT_DIR/stdout" ] \
  && grep -qF 'GOVERNANCE_INTEGRITY:' "$FAULT_DIR/stderr" \
  && grep -qF 'exit code 1' "$FAULT_DIR/stderr"; then
  echo "  PASS  composite child exit 1 → dedicated integrity rc70"
  PASS=$((PASS+1))
else
  echo "  FAIL  composite child exit 1 was not failed closed (exit $FAULT_RC)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - composite undefined child rc"
fi

run_raw '{'
if [ "$EXIT" = "70" ] && [ -z "$STDOUT_TEXT" ] \
  && echo "$STDERR_TEXT" | grep -qF "GOVERNANCE_INTEGRITY:" \
  && echo "$STDERR_TEXT" | grep -qF "invalid input envelope"; then
  echo "  PASS  malformed input → stderr-only integrity rc70"
  PASS=$((PASS+1))
else
  echo "  FAIL  malformed input output contract"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - malformed input"
fi

# A well-formed child policy denial remains stderr-only rc2, never integrity rc70.
awk '
  { print }
  $0 == "r1_datatable_invariants() {" {
    print "printf '\''synthetic DataTable policy blocker\\n'\'' >&2"
    print "return 2"
  }
' "$HOOK" >"$FAULT_DIR/check_datatable_policy.sh"
set +e
printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"apps/demo/src/App.tsx","content":"x"}}' \
  | bash "$FAULT_DIR/check_datatable_policy.sh" >"$FAULT_DIR/policy.stdout" 2>"$FAULT_DIR/policy.stderr"
POLICY_RC=$?
set -e
if [ "$POLICY_RC" -eq 2 ] && [ ! -s "$FAULT_DIR/policy.stdout" ] \
  && grep -qF 'synthetic DataTable policy blocker' "$FAULT_DIR/policy.stderr" \
  && ! grep -qF 'GOVERNANCE_INTEGRITY:' "$FAULT_DIR/policy.stderr"; then
  echo "  PASS  genuine child policy denial → stderr-only rc2"
  PASS=$((PASS+1))
else
  echo "  FAIL  genuine child policy denial contract (exit $POLICY_RC)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - genuine policy rc2"
fi

# 12. 規則分派 SIGPIPE 同族回歸(69230cef,2026-09-25;寫法照抄 test_check_plugin_fork_health.sh):
#     r2 不讀 stdin 就退出時,不得被判成「未定義 exit code」rc70;而且要斷言 r2 **真的跑到** ——
#     只看 exit 0 會被「r1 的 exit 提早結束整支 hook、r2 根本沒跑」騙過(拿掉管線卻沒補子殼層的那一版正是這樣假綠)。
#     300KB 輸入超過管線緩衝區(64KiB),舊寫法 `printf | rule` 必定 SIGPIPE,不靠時序。
_BIG_INPUT="$FAULT_DIR/big-input.json"
{ printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"/r/src/app/large.tsx","content":"'; head -c 300000 /dev/zero | tr '\0' 'x'; printf '%s' '"}}'; } >"$_BIG_INPUT"
_R2_MARKER="$FAULT_DIR/r2-reached"
awk '
  { print }
  $0 == "r2_size_num_to_meta_width() {" { print ": >\"$R2_MARKER\"; exit 0" }
' "$HOOK" >"$FAULT_DIR/check_datatable_bigstdin.sh"
set +e
R2_MARKER="$_R2_MARKER" bash "$FAULT_DIR/check_datatable_bigstdin.sh" <"$_BIG_INPUT" \
  >"$FAULT_DIR/big.stdout" 2>"$FAULT_DIR/big.stderr"
BIG_RC=$?
set -e
if [ "$BIG_RC" -eq 0 ] && [ ! -s "$FAULT_DIR/big.stdout" ] && [ ! -s "$FAULT_DIR/big.stderr" ] && [ -f "$_R2_MARKER" ]; then
  echo "  PASS  large stdin + r2 不讀 stdin → 仍 rc0 silent 且 r2 真的跑到"
  PASS=$((PASS+1))
else
  echo "  FAIL  large stdin + r2 不讀 stdin → exit $BIG_RC, r2 reached=$([ -f "$_R2_MARKER" ] && echo yes || echo no) ($(head -c 200 "$FAULT_DIR/big.stderr"))"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - large stdin r2 marker"
fi

echo ""
echo "═══ Results: $PASS PASS, $FAIL FAIL ═══"
[ "$FAIL" -gt 0 ] && { printf "Failed:%b\n" "$FAILED_TESTS"; exit 1; }
exit 0

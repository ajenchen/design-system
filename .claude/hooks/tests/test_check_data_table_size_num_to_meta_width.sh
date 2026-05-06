#!/bin/bash
# Tests for check_data_table_size_num_to_meta_width.sh(2026-05-06 v14.3)
#
# Hook 規則:DataTable column def 寫 root `size: NUMBER` → soft warn 用 meta.width。
# 命中條件:含 `accessor` / `accessorKey` / `createColumnHelper` reference + `size: NUMBER`。
# 排除:DataTable internal source(data-table.tsx / cell-registry.tsx / column-types.ts)。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_data_table_size_num_to_meta_width.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

run_hook() {
  local file_path="$1"
  local content="$2"
  local tool="${3:-Write}"
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

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent pass, exit=$EXIT, stderr non-empty=$([ -n "$STDERR_TEXT" ] && echo yes))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_warn() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "0" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit 0 + stderr '$needle', got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_data_table_size_num_to_meta_width tests ==="

# 1. consumer story 寫 root size: NUMBER → warn
run_hook "/repo/src/design-system/components/DataTable/data-table.stories.tsx" '
col.accessor("name", { header: "Product", size: 240, meta: { type: "string" } })
'
expect_warn "1. consumer story root size: 240 → warn" "meta.width"

# 2. consumer 用 meta.width(canonical)→ silent
run_hook "/repo/src/design-system/components/DataTable/data-table.stories.tsx" '
col.accessor("name", { header: "Product", meta: { type: "string", width: 240 } })
'
expect_pass_silent "2. consumer meta.width: 240 → silent"

# 3. DataTable internal source(data-table.tsx)→ skip
run_hook "/repo/src/design-system/components/DataTable/data-table.tsx" '
col.accessor("internal", { size: 280 })
'
expect_pass_silent "3. data-table.tsx internal → skip"

# 4. cell-registry.tsx → skip
run_hook "/repo/src/design-system/components/DataTable/cell-registry.tsx" '
col.accessor("internal", { size: 280 })
'
expect_pass_silent "4. cell-registry.tsx internal → skip"

# 5. 不含 column def signature → skip(Field component using size for density)
run_hook "/repo/src/design-system/components/Field/field.tsx" '
const fieldVariants = { size: 280 }  // Field size prop config
'
expect_pass_silent "5. non-column-def file → skip"

# 6. consumer string size sm/md/lg density → silent(不該 trigger,因正則只 match 數字)
run_hook "/repo/src/design-system/components/SomeComponent/some.tsx" '
col.accessor("foo", { meta: { type: "string" } })
const buttonProps = { size: "md" }
'
expect_pass_silent "6. string size md density → silent (non-numeric)"

# 7. .ts 檔(非 tsx)→ skip
run_hook "/repo/src/design-system/components/DataTable/column-types.ts" '
col.accessor("foo", { size: 280 })
'
expect_pass_silent "7. .ts file → skip"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

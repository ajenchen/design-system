#!/bin/bash
# Tests for check_benchmark_citation.sh
#
# Hook(PreToolUse Edit/Write/MultiEdit):spec.md / .tsx in packages/design-system/src/
# 含 world-class benchmark claim(Ant / Material / Polaris ...)必附 inline citation
# (URL / GitHub #L / snapshots/ / @benchmark-unverified)。違 P0 BLOCKER(exit 2,2026-07-07 方向 2 升級;escape marker 既有)。
# 整檔 escape:前 5 行含 @benchmark-citation-allow: 或 @benchmark-unverified-blanket:。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_benchmark_citation.sh"

if [ ! -f "$HOOK" ]; then echo "FATAL: hook not found: $HOOK"; exit 1; fi

PASS=0
FAIL=0
FAILED_TESTS=""

# tool_input.content 用於 Write;tool_input.new_string 用於 Edit
run_hook_write() {
  local file_path="$1"; local content="$2"
  local payload
  payload=$(jq -n --arg fp "$file_path" --arg c "$content" \
    '{tool_name: "Write", tool_input: {file_path: $fp, content: $c}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent, exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_warn() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit=2 + needle '$needle', got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_benchmark_citation tests ==="

# 1. Non-DS path → skip
run_hook_write "/tmp/random.tsx" '對齊 Ant Design'
expect_pass_silent "1. non-DS path → skip"

# 2. DS path no benchmark claim → silent
run_hook_write "/repo/packages/design-system/src/components/Foo/foo.spec.md" '
# Foo spec
普通文字無 world-class claim
'
expect_pass_silent "2. no benchmark claim → silent"

# 3. DS path Ant Design claim WITH inline URL → silent
run_hook_write "/repo/packages/design-system/src/components/Foo/foo.spec.md" '
對齊 Ant Design 設計
參考 https://ant-design.com/components/foo
'
expect_pass_silent "3. claim + ant-design URL → silent"

# 4. DS path Material claim with GitHub #L cite → silent
run_hook_write "/repo/packages/design-system/src/components/Foo/foo.tsx" '
// 對齊 Material UI button(https://github.com/mui/material-ui/blob/master/Button.tsx#L42)
const x = 1
'
expect_pass_silent "4. claim + github #L cite → silent"

# 5. DS path Polaris claim WITHOUT citation → warn
run_hook_write "/repo/packages/design-system/src/components/Foo/foo.spec.md" '
# Foo spec

對齊 Polaris 設計派,確保視覺一致。
'
expect_warn "5. Polaris claim missing cite → warn" "check_benchmark_citation"

# 6. DS path Atlassian claim with @benchmark-unverified → silent (撤回 marker)
run_hook_write "/repo/packages/design-system/src/components/Foo/foo.spec.md" '
# Foo spec

對齊 Atlassian Design @benchmark-unverified 待補 source
'
expect_pass_silent "6. claim with @benchmark-unverified → silent"

# 7. File-level @benchmark-citation-allow escape → silent
run_hook_write "/repo/packages/design-system/src/components/Foo/foo.spec.md" '// @benchmark-citation-allow: legacy migration backlog
# Foo

對齊 Carbon Design 內部共識。
對齊 Polaris 派系。
'
expect_pass_silent "7. file-level @benchmark-citation-allow → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

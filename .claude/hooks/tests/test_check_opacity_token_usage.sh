#!/bin/bash
# Tests for check_opacity_token_usage.sh(2026-05-06 v14.5.2)
#
# Hook 規則:*.tsx 寫 raw `opacity-{N}`(N 是數字非 0/100)→ soft warn 用 DS opacity token。
# 允許白名單:opacity-0 / opacity-100 / opacity-disabled。
# 排除:.stories.tsx / .test.* / .spec.tsx / tokens/opacity/*。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_opacity_token_usage.sh"

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
    echo "  FAIL  $name (expected silent, exit=$EXIT, stderr non-empty=$([ -n "$STDERR_TEXT" ] && echo yes))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_warn() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "0" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected warn '$needle', got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_opacity_token_usage tests ==="

# 1. raw opacity-30 → warn
run_hook "/repo/src/design-system/components/Foo/foo.tsx" '
className="bg-surface opacity-30"
'
expect_warn "1. opacity-30 raw → warn" "M23 violation"

# 2. raw opacity-50 → warn
run_hook "/repo/src/design-system/components/Foo/foo.tsx" '
className="opacity-50"
'
expect_warn "2. opacity-50 raw → warn" "M23 violation"

# 3. opacity-disabled token utility → silent
run_hook "/repo/src/design-system/components/Foo/foo.tsx" '
className="opacity-disabled pointer-events-none"
'
expect_pass_silent "3. opacity-disabled token → silent"

# 4. opacity-0(visibility toggle)→ silent
run_hook "/repo/src/design-system/components/Foo/foo.tsx" '
className="opacity-0 group-hover:opacity-100"
'
expect_pass_silent "4. opacity-0 / opacity-100 visibility → silent"

# 5. story file → skip
run_hook "/repo/src/design-system/components/Foo/foo.stories.tsx" '
className="opacity-30 opacity-50"
'
expect_pass_silent "5. .stories.tsx → skip"

# 6. token spec internal → skip
run_hook "/repo/src/design-system/tokens/opacity/opacity.css" '
opacity: 0.30;
'
expect_pass_silent "6. tokens/opacity/* → skip"

# 7. multiple raw opacity values → warn(catch all)
run_hook "/repo/src/design-system/components/Foo/foo.tsx" '
const a = "opacity-25"
const b = "opacity-75"
'
expect_warn "7. multi opacity-N values → warn" "opacity-25"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

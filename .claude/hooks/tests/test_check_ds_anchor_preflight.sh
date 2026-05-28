#!/bin/bash
# Tests for check_ds_anchor_preflight.sh(M29 mechanical enforcement)
#
# Scope:
#   - packages/design-system/src/**.tsx (DS internal)
#   - apps/**.tsx (consumer fork-user)
#   - node_modules/@qijenchen/design-system/**.tsx (禁改)
# Excluded: *.stories.tsx / *.test.tsx / *.spec.md / *.spec.ts

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_ds_anchor_preflight.sh"

if [ ! -f "$HOOK" ]; then echo "FATAL: hook not found: $HOOK"; exit 1; fi

PASS=0
FAIL=0
FAILED_TESTS=""

# Create temp transcript file(empty by default = no canonical read trace)
TMP_TRANSCRIPT=$(mktemp)
TMP_TRANSCRIPT_WITH_READ=$(mktemp)
# Simulate canonical Grep tool_use in transcript
cat > "$TMP_TRANSCRIPT_WITH_READ" <<'EOF'
{"message":{"content":[{"type":"tool_use","name":"Grep","input":{"path":"packages/design-system/src/components/Sidebar/sidebar.stories.tsx"}}]}}
EOF

run_hook() {
  local file_path="$1"; local content="$2"; local transcript="$3"
  local payload
  payload=$(jq -n --arg fp "$file_path" --arg c "$content" --arg tp "$transcript" \
    '{hook_event_name: "PreToolUse", tool_name: "Write", tool_input: {file_path: $fp, content: $c}, transcript_path: $tp}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

# Test 1:apps/** tsx wrap <Sidebar> 無 canonical read → soft BLOCKER context
echo "Test 1: apps/** wrap <Sidebar> 無 canonical read → context inject"
CONTENT='import { Sidebar } from "@qijenchen/design-system"; export default () => <Sidebar collapsible="icon" />'
run_hook "/tmp/ds-product-template/apps/template/src/App.tsx" "$CONTENT" "$TMP_TRANSCRIPT"
if echo "$STDERR_TEXT" | grep -q "M29 DS Anchor Preflight"; then
  echo "  PASS  Test 1"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 1 (no inject;stderr=${STDERR_TEXT:0:200})"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 1"
fi

# Test 2:有 canonical Grep trace → silent
echo "Test 2: wrap <Sidebar> 有 Grep canonical → silent"
run_hook "/tmp/ds-product-template/apps/template/src/App.tsx" "$CONTENT" "$TMP_TRANSCRIPT_WITH_READ"
if [ -z "$STDERR_TEXT" ]; then
  echo "  PASS  Test 2"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 2 (unexpected inject;stderr=${STDERR_TEXT:0:200})"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 2"
fi

# Test 3:stories.tsx scope excluded
echo "Test 3: *.stories.tsx 排除"
run_hook "/some/path/sidebar.stories.tsx" "$CONTENT" "$TMP_TRANSCRIPT"
if [ -z "$STDERR_TEXT" ]; then
  echo "  PASS  Test 3"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 3 (should skip stories.tsx)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 3"
fi

# Test 4:non-DS-primitive code skip(no wrap pattern)
echo "Test 4: 不 wrap DS primitive 跳過"
run_hook "/some/apps/foo/src/utils.tsx" "export const helper = (x) => x * 2;" "$TMP_TRANSCRIPT"
if [ -z "$STDERR_TEXT" ]; then
  echo "  PASS  Test 4"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 4 (should skip non-primitive)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 4"
fi

# Test 5:@story-baseline marker present → silent
echo "Test 5: @story-baseline marker → silent"
CONTENT_WITH_MARKER='// @story-baseline: sidebar.stories.tsx#IconCollapse
import { Sidebar } from "@qijenchen/design-system";
export default () => <Sidebar collapsible="icon" />'
# Use TMP_TRANSCRIPT empty(no canonical read);marker should pass
echo '{"message":{"content":"@story-baseline: sidebar.stories.tsx#IconCollapse"}}' > "$TMP_TRANSCRIPT"
run_hook "/some/apps/_template/src/App.tsx" "$CONTENT_WITH_MARKER" "$TMP_TRANSCRIPT"
if [ -z "$STDERR_TEXT" ]; then
  echo "  PASS  Test 5"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 5 (marker should pass)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 5"
fi

rm -f "$TMP_TRANSCRIPT" "$TMP_TRANSCRIPT_WITH_READ"

echo ""
echo "════ Results: $PASS PASS, $FAIL FAIL ════"
if [ "$FAIL" -gt 0 ]; then printf "Failed:%b\n" "$FAILED_TESTS"; exit 1; fi
exit 0

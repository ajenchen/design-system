#!/bin/bash
# Proposed-state tests for header-canonical W1 withTabs enforcement.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../lib/_header_with_tabs_border.sh"
PASS=0
FAIL=0
FAILED_TESTS=""

run_hook() {
  local file_path="$1" content="$2" tool="${3:-Write}" state_mode="${4:-valid}"
  local repo_path="${file_path#*/repo/}"
  local payload
  case "$state_mode" in
    valid)
      payload=$(jq -n --arg fp "$file_path" --arg rp "$repo_path" --arg c "$content" --arg tool "$tool" \
        '{tool_name:$tool,tool_input:{file_path:$fp,content:"raw-native-content-must-not-win",governance_write_state:{schemaVersion:1,path:$rp,kind:"text",content:$c}}}')
      ;;
    deleted)
      payload=$(jq -n --arg fp "$file_path" --arg rp "$repo_path" --arg tool "$tool" \
        '{tool_name:$tool,tool_input:{file_path:$fp,governance_write_state:{schemaVersion:1,path:$rp,kind:"deleted"}}}')
      ;;
    missing)
      payload=$(jq -n --arg fp "$file_path" --arg tool "$tool" \
        '{tool_name:$tool,tool_input:{file_path:$fp}}')
      ;;
    malformed)
      payload=$(jq -n --arg fp "$file_path" --arg tool "$tool" \
        '{tool_name:$tool,tool_input:{file_path:$fp,governance_write_state:{schemaVersion:"1",path:false,kind:"text",content:null}}}')
      ;;
    mismatch)
      payload=$(jq -n --arg fp "$file_path" --arg c "$content" --arg tool "$tool" \
        '{tool_name:$tool,tool_input:{file_path:$fp,governance_write_state:{schemaVersion:1,path:"packages/design-system/src/other.tsx",kind:"text",content:$c}}}')
      ;;
  esac

  STDOUT_FILE=$(mktemp)
  STDERR_FILE=$(mktemp)
  set +e
  printf '%s' "$payload" \
    | GOVERNANCE_WRITE_STATE_TRUST=runner-v1 bash "$HOOK" >"$STDOUT_FILE" 2>"$STDERR_FILE"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT_FILE")
  STDERR_TEXT=$(cat "$STDERR_FILE")
  rm -f "$STDOUT_FILE" "$STDERR_FILE"
}

run_without_trust() {
  local file_path="$1"
  local payload
  payload=$(jq -n --arg fp "$file_path" '{tool_name:"Edit",tool_input:{file_path:$fp}}')
  STDOUT_FILE=$(mktemp)
  STDERR_FILE=$(mktemp)
  set +e
  printf '%s' "$payload" \
    | env -u GOVERNANCE_WRITE_STATE_TRUST bash "$HOOK" >"$STDOUT_FILE" 2>"$STDERR_FILE"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT_FILE")
  STDERR_TEXT=$(cat "$STDERR_FILE")
  rm -f "$STDOUT_FILE" "$STDERR_FILE"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" -eq 0 ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
    PASS=$((PASS + 1)); echo "  PASS  $name"
  else
    FAIL=$((FAIL + 1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
    echo "  FAIL  $name (exit=$EXIT stdout=${#STDOUT_TEXT} stderr=${#STDERR_TEXT})"
    printf '%s\n' "$STDERR_TEXT" | sed 's/^/    /'
  fi
}

expect_block() {
  local name="$1" needle="$2"
  if [ "$EXIT" -eq 2 ] && [ -z "$STDOUT_TEXT" ] && [ -n "$STDERR_TEXT" ] \
    && printf '%s' "$STDERR_TEXT" | grep -qF "$needle" \
    && ! printf '%s' "$STDERR_TEXT" | grep -Eq 'command not found|No such file or directory'; then
    PASS=$((PASS + 1)); echo "  PASS  $name"
  else
    FAIL=$((FAIL + 1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
    echo "  FAIL  $name (expected stderr-only rc2 + '$needle'; got rc=$EXIT)"
    printf '%s\n' "$STDERR_TEXT" | sed 's/^/    /'
  fi
}

expect_integrity() {
  local name="$1" needle="$2"
  if [ "$EXIT" -eq 70 ] && [ -z "$STDOUT_TEXT" ] && [ -n "$STDERR_TEXT" ] \
    && printf '%s' "$STDERR_TEXT" | grep -qF "$needle"; then
    PASS=$((PASS + 1)); echo "  PASS  $name"
  else
    FAIL=$((FAIL + 1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
    echo "  FAIL  $name (expected stderr-only rc70 + '$needle'; got rc=$EXIT)"
    printf '%s\n' "$STDERR_TEXT" | sed 's/^/    /'
  fi
}

echo "=== check_header_with_tabs_border proposed-state tests ==="

IN_SCOPE="/repo/packages/design-system/src/components/Foo/foo.tsx"

run_hook "/repo/src/foo.tsx" '<ChromeHeader><Tabs /></ChromeHeader>' Write missing
expect_pass_silent "1. out-of-scope path skips"

run_hook "/repo/packages/design-system/src/components/Foo/foo.stories.tsx" '<ChromeHeader><Tabs /></ChromeHeader>' Write missing
expect_pass_silent "2. story path skips"

run_hook "$IN_SCOPE" '<button />'
expect_pass_silent "3. proposed content without header skips"

run_hook "$IN_SCOPE" '<ChromeHeader />' Edit
expect_pass_silent "4. proposed Edit header without Tabs skips"

run_hook "$IN_SCOPE" '<ChromeHeader withTabs><TabsList /></ChromeHeader>' MultiEdit
expect_pass_silent "5. proposed MultiEdit compliant header+Tabs is silent"

run_hook "$IN_SCOPE" '<ChromeHeader><TabsList /></ChromeHeader>' Edit
expect_block "6. proposed Edit missing withTabs blocks" "HEADER + TABS WITHTABS BLOCKER"

run_hook "$IN_SCOPE" '// @header-withtabs-allow: special case
<ChromeHeader><TabsList /></ChromeHeader>'
expect_pass_silent "7. proposed escape marker is silent"

run_hook "$IN_SCOPE" '
<>
  <ChromeHeader withTabs><TabsList /></ChromeHeader>
  <SurfaceHeader><TabsList /></SurfaceHeader>
</>'
expect_block "8. compliant instance cannot hide a violating header instance" "1 個未宣告 true withTabs"

run_hook "$IN_SCOPE" '' Write deleted
expect_pass_silent "9. trusted deletion has no post-write violation"

run_hook "$IN_SCOPE" '<ChromeHeader withTabs><Tabs /></ChromeHeader>' Edit missing
expect_integrity "10. runner marker without state is integrity failure" "trusted proposed write state 缺失或 malformed"

run_hook "$IN_SCOPE" '<ChromeHeader withTabs><Tabs /></ChromeHeader>' Edit malformed
expect_integrity "11. malformed state is integrity failure" "trusted proposed write state 缺失或 malformed"

run_hook "$IN_SCOPE" '<ChromeHeader withTabs><Tabs /></ChromeHeader>' Edit mismatch
expect_integrity "12. state path mismatch is integrity failure" "與 hook target 不相符"

run_without_trust "$IN_SCOPE"
expect_integrity "13. governed mutation without runner trust is integrity failure" "缺少 runner-v1 proposed state"

run_hook "$IN_SCOPE" '
const withTabs = false
export const Example = () => <ChromeHeader><TabsList /></ChromeHeader>'
expect_block "14. variable-name withTabs decoy cannot bypass" "HEADER + TABS WITHTABS BLOCKER"

run_hook "$IN_SCOPE" '
// withTabs =
export const Example = () => <ChromeHeader><TabsList /></ChromeHeader>'
expect_block "15. comment withTabs decoy cannot bypass" "HEADER + TABS WITHTABS BLOCKER"

run_hook "$IN_SCOPE" '<ChromeHeader withTabs={false}><TabsList /></ChromeHeader>'
expect_block "16. explicit withTabs false blocks" "HEADER + TABS WITHTABS BLOCKER"

run_hook "$IN_SCOPE" '<ChromeHeader withTabs={true}><TabsList /></ChromeHeader>'
expect_pass_silent "17. explicit withTabs true is compliant"

run_hook "$IN_SCOPE" '
<>
  <ChromeHeader />
  <TabsList />
</>'
expect_pass_silent "18. unrelated sibling Header/Tabs ambiguity stays silent"

run_hook "$IN_SCOPE" '<ChromeHeader><TabsList />' Edit
expect_integrity "19. malformed proposed TSX is integrity failure" "parser unavailable or proposed content malformed"

run_hook "$IN_SCOPE" '// @header-withtabs-allow:
<ChromeHeader><TabsList /></ChromeHeader>'
expect_block "20. empty escape rationale cannot bypass" "HEADER + TABS WITHTABS BLOCKER"

run_hook "$IN_SCOPE" 'const ready = true
// @header-withtabs-allow: too late
export const Example = () => <ChromeHeader><TabsList /></ChromeHeader>'
expect_block "21. non-leading escape cannot bypass" "HEADER + TABS WITHTABS BLOCKER"

run_hook "$IN_SCOPE" 'const decoy = `// @header-withtabs-allow: template decoy`
export const Example = () => <ChromeHeader><TabsList /></ChromeHeader>'
expect_block "22. template escape decoy cannot bypass" "HEADER + TABS WITHTABS BLOCKER"

run_hook "$IN_SCOPE" '/* // @header-withtabs-allow: block decoy */
export const Example = () => <ChromeHeader><TabsList /></ChromeHeader>'
expect_block "23. block-comment escape decoy cannot bypass" "HEADER + TABS WITHTABS BLOCKER"

run_hook "$IN_SCOPE" '<Header><TabsList /></Header>'
expect_block "24. bare Header is governed" "HEADER + TABS WITHTABS BLOCKER"

run_hook "$IN_SCOPE" '<UI.Header><UI.TabsList /></UI.Header>'
expect_block "25. namespaced UI.Header is governed" "HEADER + TABS WITHTABS BLOCKER"

run_hook "$IN_SCOPE" '
<SurfaceHeader>
  <Header withTabs><TabsList /></Header>
</SurfaceHeader>'
expect_pass_silent "26. outer Header does not consume nested Header Tabs"

run_hook "$IN_SCOPE" '
<SurfaceHeader withTabs>
  <Header><TabsList /></Header>
</SurfaceHeader>'
expect_block "27. nested Header is independently enforced" "HEADER + TABS WITHTABS BLOCKER"

run_hook "$IN_SCOPE" '<ChromeHeader withTabs withTabs={false}><TabsList /></ChromeHeader>'
expect_block "28. duplicate conflicting withTabs props cannot bypass" "HEADER + TABS WITHTABS BLOCKER"

echo
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf 'Failed:%b\n' "$FAILED_TESTS"
  exit 1
fi

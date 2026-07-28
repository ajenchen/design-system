#!/bin/bash
# Proposed-state tests for AppShell primary-header consistency enforcement.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../lib/_app_shell_primary_header_consistency.sh"
TMPDIR_TEST=$(mktemp -d)
trap 'rm -rf "$TMPDIR_TEST"' EXIT

PASS=0
FAIL=0
FAILED_TESTS=""

run_hook() {
  local rel="$1" tool="$2" proposed="$3" disk_mode="${4:-clean}" state_mode="${5:-valid}"
  local fp="$TMPDIR_TEST/$rel"
  mkdir -p "$(dirname "$fp")"
  case "$disk_mode" in
    clean) printf '%s' '<AppShell layout="primary-sidebar" />' >"$fp" ;;
    violating) printf '%s' '<AppShell layout="primary-header" />' >"$fp" ;;
    absent) rm -f "$fp" ;;
  esac

  local payload
  case "$state_mode" in
    valid)
      payload=$(jq -n --arg fp "$fp" --arg rel "$rel" --arg tool "$tool" --arg content "$proposed" \
        '{tool_name:$tool,tool_input:{file_path:$fp,new_string:"raw-partial-must-not-win",governance_write_state:{schemaVersion:1,path:$rel,kind:"text",content:$content}}}')
      ;;
    deleted)
      payload=$(jq -n --arg fp "$fp" --arg rel "$rel" --arg tool "$tool" \
        '{tool_name:$tool,tool_input:{file_path:$fp,governance_write_state:{schemaVersion:1,path:$rel,kind:"deleted"}}}')
      ;;
    missing)
      payload=$(jq -n --arg fp "$fp" --arg tool "$tool" \
        '{tool_name:$tool,tool_input:{file_path:$fp}}')
      ;;
    malformed)
      payload=$(jq -n --arg fp "$fp" --arg tool "$tool" \
        '{tool_name:$tool,tool_input:{file_path:$fp,governance_write_state:{schemaVersion:1,path:null,kind:"text",content:3}}}')
      ;;
    mismatch)
      payload=$(jq -n --arg fp "$fp" --arg tool "$tool" --arg content "$proposed" \
        '{tool_name:$tool,tool_input:{file_path:$fp,governance_write_state:{schemaVersion:1,path:"src/other.tsx",kind:"text",content:$content}}}')
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
  local rel="$1"
  local fp="$TMPDIR_TEST/$rel"
  local payload
  payload=$(jq -n --arg fp "$fp" '{tool_name:"Edit",tool_input:{file_path:$fp}}')
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

echo "=== check_app_shell_primary_header_consistency proposed-state tests ==="

COMPLIANT='
<AppShell layout="primary-header" globalHeader={<GlobalHeader />}>
  <Sidebar />
</AppShell>
'
MISSING_GLOBAL='
<AppShell layout="primary-header">
  <Sidebar />
</AppShell>
'
DUPLICATE_HEADER='
<AppShell layout="primary-header" globalHeader={<GH />}>
  <Sidebar><SidebarHeader>brand</SidebarHeader></Sidebar>
</AppShell>
'
FOOTER='
<AppShell layout="primary-header" globalHeader={<GH />}>
  <Sidebar><SidebarFooter>account</SidebarFooter></Sidebar>
</AppShell>
'

run_hook "src/app.tsx" Write "$COMPLIANT"
expect_pass_silent "1. proposed Write compliant primary-header → silent"

run_hook "src/missing-gh.tsx" Edit "$MISSING_GLOBAL" clean
expect_block "2. proposed Edit violation blocks although disk is clean" "V1 缺 globalHeader prop"

run_hook "src/new-app.tsx" Write "$MISSING_GLOBAL" absent
expect_block "3. new-file proposed Write cannot bypass V1" "V1 缺 globalHeader prop"

run_hook "src/dup-header.tsx" MultiEdit "$DUPLICATE_HEADER"
expect_block "4. proposed MultiEdit duplicate SidebarHeader blocks" "V2 Sidebar 內含 SidebarHeader"

run_hook "src/footer.tsx" Write "$FOOTER"
expect_block "5. proposed SidebarFooter blocks" "V3 Sidebar 內含 SidebarFooter"

run_hook "src/escape.tsx" Edit '// @app-shell-primary-header-allow: migration
<AppShell layout="primary-header"><SidebarHeader /></AppShell>'
expect_pass_silent "6. proposed escape marker → silent"

run_hook "src/responsive.tsx" Edit '
export const Responsive = () => {
  const { isMobile } = useSidebar()
  return <AppShell layout="primary-header" globalHeader={<GH />}>
    {isMobile && <SidebarHeader>brand</SidebarHeader>}
  </AppShell>
}'
expect_pass_silent "7. proposed responsive mobile fork remains allowed"

run_hook "src/single-quote.tsx" Edit "
<AppShell layout={'primary-header'}><Sidebar /></AppShell>"
expect_block "8. single-quote JSX proposed content blocks V1" "V1 缺 globalHeader prop"

run_hook "src/disk-violates.tsx" Write "$COMPLIANT" violating
expect_pass_silent "9. trusted compliant proposed state wins over violating disk"

run_hook "src/deleted.tsx" Edit "" clean deleted
expect_pass_silent "10. trusted deletion has no post-write violation"

run_hook "src/missing-state.tsx" Edit "$COMPLIANT" clean missing
expect_integrity "11. runner marker without proposed state is integrity failure" "trusted proposed write state 缺失或 malformed"

run_hook "src/malformed-state.tsx" Edit "$COMPLIANT" clean malformed
expect_integrity "12. malformed proposed state is integrity failure" "trusted proposed write state 缺失或 malformed"

run_hook "src/mismatch.tsx" Edit "$COMPLIANT" clean mismatch
expect_integrity "13. proposed state path mismatch is integrity failure" "與 hook target 不相符"

run_without_trust "src/app.tsx"
expect_integrity "14. governed mutation without runner trust is integrity failure" "缺少 runner-v1 proposed state"

run_hook "README.md" Edit "$MISSING_GLOBAL" absent missing
expect_pass_silent "15. non-tsx path skips before proposed-state contract"

run_hook "src/read.tsx" Read "$MISSING_GLOBAL" absent missing
expect_pass_silent "16. non-write tool skips before proposed-state contract"

run_hook "src/prefix.tsx" Write '
<AppShell layout="primary-header" globalHeader={<GH />}>
  <SidebarFooterPanel>not SidebarFooter</SidebarFooterPanel>
</AppShell>'
expect_pass_silent "17. prefix-extended component remains non-match"

run_hook "src/whitespace.tsx" Edit '
<AppShell layout = "primary-header"><Sidebar /></AppShell>'
expect_block "18. JSX whitespace around layout equals cannot bypass V1" "V1 缺 globalHeader prop"

run_hook "src/multiline.tsx" Edit '
<AppShell
  layout = {
    "primary-header"
  }
>
  <Sidebar />
</AppShell>'
expect_block "19. multiline literal layout cannot bypass V1" "V1 缺 globalHeader prop"

run_hook "src/comment-decoy.tsx" Edit '
// globalHeader = <Fake />
<AppShell layout="primary-header"><Sidebar /></AppShell>'
expect_block "20. comment globalHeader decoy cannot satisfy V1" "V1 缺 globalHeader prop"

run_hook "src/instance-decoy.tsx" Edit '
<>
  <AppShell layout="primary-header"><Sidebar /></AppShell>
  <AppShell layout="primary-header" globalHeader={<GH />}><Sidebar /></AppShell>
</>'
expect_block "21. another compliant AppShell cannot hide violating instance" "V1 缺 globalHeader prop"

run_hook "src/mobile-decoy.tsx" Edit '
// isMobile
<AppShell layout="primary-header" globalHeader={<GH />}>
  <SidebarHeader>unguarded brand</SidebarHeader>
</AppShell>'
expect_block "22. isMobile comment cannot exempt unguarded SidebarHeader" "V2 Sidebar 內含 SidebarHeader"

run_hook "src/malformed-tsx.tsx" Edit '<AppShell layout="primary-header">' clean
expect_integrity "23. malformed proposed TSX is integrity failure" "parser unavailable or proposed content malformed"

run_hook "src/empty-escape.tsx" Edit '// @app-shell-primary-header-allow:
<AppShell layout="primary-header"><Sidebar /></AppShell>'
expect_block "24. empty escape rationale cannot bypass" "V1 缺 globalHeader prop"

run_hook "src/late-escape.tsx" Edit 'const ready = true
// @app-shell-primary-header-allow: too late
export const Example = () => <AppShell layout="primary-header"><Sidebar /></AppShell>'
expect_block "25. non-leading escape cannot bypass" "V1 缺 globalHeader prop"

run_hook "src/string-escape.tsx" Edit 'const decoy = `// @app-shell-primary-header-allow: template decoy`
export const Example = () => <AppShell layout="primary-header"><Sidebar /></AppShell>'
expect_block "26. template escape decoy cannot bypass" "V1 缺 globalHeader prop"

run_hook "src/block-escape.tsx" Edit '/* // @app-shell-primary-header-allow: block decoy */
<AppShell layout="primary-header"><Sidebar /></AppShell>'
expect_block "27. block-comment escape decoy cannot bypass" "V1 缺 globalHeader prop"

run_hook "src/mobile-ternary.tsx" Edit '
export const Responsive = () => {
  const { isMobile } = useSidebar()
  return <AppShell layout="primary-header" globalHeader={<GH />}>
    {isMobile ? <SidebarHeader>brand</SidebarHeader> : null}
  </AppShell>
}'
expect_pass_silent "28. positive isMobile ternary true branch is exempt"

run_hook "src/mobile-parentheses.tsx" Edit '
export const Responsive = () => {
  const { isMobile } = useSidebar()
  return <AppShell layout="primary-header" globalHeader={<GH />}>
    {((isMobile)) && <SidebarHeader>brand</SidebarHeader>}
  </AppShell>
}'
expect_pass_silent "29. safely parenthesized positive isMobile RHS is exempt"

run_hook "src/mobile-negated.tsx" Edit '
<AppShell layout="primary-header" globalHeader={<GH />}>
  {!isMobile && <SidebarHeader>desktop brand</SidebarHeader>}
</AppShell>'
expect_block "30. negated isMobile branch is not exempt" "V2 Sidebar 內含 SidebarHeader"

run_hook "src/mobile-false-branch.tsx" Edit '
<AppShell layout="primary-header" globalHeader={<GH />}>
  {isMobile ? null : <SidebarHeader>desktop brand</SidebarHeader>}
</AppShell>'
expect_block "31. isMobile false branch is not exempt" "V2 Sidebar 內含 SidebarHeader"

run_hook "src/mobile-or.tsx" Edit '
<AppShell layout="primary-header" globalHeader={<GH />}>
  {isMobile || <SidebarHeader>desktop brand</SidebarHeader>}
</AppShell>'
expect_block "32. OR expression is not a positive mobile guard" "V2 Sidebar 內含 SidebarHeader"

run_hook "src/nested-boundary.tsx" Edit '
<AppShell layout="primary-header" globalHeader={<GH />}>
  <AppShell layout="primary-sidebar">
    <SidebarHeader>nested primary-sidebar brand</SidebarHeader>
    <SidebarFooter>nested account</SidebarFooter>
  </AppShell>
</AppShell>'
expect_pass_silent "33. outer AppShell does not consume nested AppShell descendants"

run_hook "src/nested-own-violation.tsx" Edit '
<AppShell layout="primary-header" globalHeader={<GH />}>
  <AppShell layout="primary-header">
    <Sidebar />
  </AppShell>
</AppShell>'
expect_block "34. nested primary-header AppShell is inspected independently" "V1 缺 globalHeader prop"

run_hook "src/template-layout.tsx" Edit '
<AppShell layout={`primary-header`}><Sidebar /></AppShell>'
expect_block "35. no-substitution template layout is statically enforced" "V1 缺 globalHeader prop"

run_hook "src/concat-layout.tsx" Edit '
<AppShell layout={"primary-" + "header"}><Sidebar /></AppShell>'
expect_block "36. simple static string concat layout is enforced" "V1 缺 globalHeader prop"

run_hook "src/dynamic-layout.tsx" Edit '
<AppShell layout={mode}>
  <SidebarHeader>cannot infer layout</SidebarHeader>
</AppShell>'
expect_pass_silent "37. dynamic layout is not misclassified"

for missing_value in 'null' 'undefined' 'false' 'void 0'; do
  run_hook "src/global-missing-${missing_value// /-}.tsx" Edit "
<AppShell layout=\"primary-header\" globalHeader={$missing_value}><Sidebar /></AppShell>"
  expect_block "38. explicit globalHeader={$missing_value} counts as missing" "V1 缺 globalHeader prop"
done

run_hook "src/dynamic-global.tsx" Edit '
<AppShell layout="primary-header" globalHeader={resolvedHeader}><Sidebar /></AppShell>'
expect_pass_silent "39. dynamic non-obviously-empty globalHeader is not misclassified"

echo
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf 'Failed:%b\n' "$FAILED_TESTS"
  exit 1
fi

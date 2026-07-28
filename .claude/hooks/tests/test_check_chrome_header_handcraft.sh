#!/bin/bash
# Trusted full after-image tests for ChromeHeader handcraft enforcement.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../lib/_chrome_header_handcraft.sh"
TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT

PASS=0
FAIL=0
FAILED_TESTS=""

run_hook() {
  local rel="$1" tool="$2" proposed="$3" disk_mode="${4:-clean}" state_mode="${5:-valid}" raw="${6:-raw-decoy}"
  local fp="$TMPROOT/$rel"
  mkdir -p "$(dirname "$fp")"
  case "$disk_mode" in
    clean) printf '%s' 'export const Clean = () => <div />' >"$fp" ;;
    violating) printf '%s' '<div className="h-[var(--chrome-header-height)] border-b border-divider" />' >"$fp" ;;
    absent) rm -f "$fp" ;;
  esac

  local payload
  case "$state_mode" in
    valid)
      payload=$(jq -n \
        --arg fp "$fp" --arg rel "$rel" --arg tool "$tool" --arg proposed "$proposed" --arg raw "$raw" \
        '{tool_name:$tool,tool_input:{file_path:$fp,new_string:$raw,content:$raw,governance_write_state:{schemaVersion:1,path:$rel,kind:"text",content:$proposed}}}')
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
        '{tool_name:$tool,tool_input:{file_path:$fp,governance_write_state:{schemaVersion:1,path:4,kind:"text",content:false}}}')
      ;;
    mismatch)
      payload=$(jq -n --arg fp "$fp" --arg tool "$tool" --arg proposed "$proposed" \
        '{tool_name:$tool,tool_input:{file_path:$fp,governance_write_state:{schemaVersion:1,path:"packages/design-system/src/components/Other/other.tsx",kind:"text",content:$proposed}}}')
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
  local fp="$TMPROOT/$rel"
  local payload
  payload=$(jq -n --arg fp "$fp" '{tool_name:"Edit",tool_input:{file_path:$fp,new_string:"clean"}}')
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
    echo "  FAIL  $name (expected silent rc0, got rc=$EXIT)"
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
    echo "  FAIL  $name (expected stderr-only rc2 + '$needle', got rc=$EXIT)"
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
    echo "  FAIL  $name (expected stderr-only rc70 + '$needle', got rc=$EXIT)"
    printf '%s\n' "$STDERR_TEXT" | sed 's/^/    /'
  fi
}

echo "=== check_chrome_header_handcraft proposed-state tests ==="

REL="packages/design-system/src/components/Bar/bar.tsx"
VIOLATION='
export const Bar = () => (
  <div className="h-[var(--chrome-header-height)] px-loose border-b border-divider" />
)'
CLEAN='export const Bar = () => <ChromeHeader />'

run_hook "random.tsx" Write "$VIOLATION" absent missing
expect_pass_silent "1. non-DS path skips"

run_hook "packages/design-system/src/components/Foo/foo.stories.tsx" Write "$VIOLATION" absent missing
expect_pass_silent "2. stories path skips"

run_hook "packages/design-system/src/components/ChromeHeader/chrome-header.tsx" Write "$VIOLATION" absent missing
expect_pass_silent "3. primitive home skips"

run_hook "$REL" Write "$CLEAN"
expect_pass_silent "4. clean full proposed Write is silent"

run_hook "$REL" Write "$VIOLATION" absent
expect_block "5. new-file proposed Write violation blocks" "CHROME HEADER HANDCRAFT"

run_hook "$REL" Edit "$VIOLATION" clean
expect_block "6. first Edit proposed after-image blocks before disk mutation" "CHROME HEADER HANDCRAFT"

run_hook "$REL" MultiEdit "$VIOLATION" clean
expect_block "7. Codex-equivalent normalized proposed state blocks" "CHROME HEADER HANDCRAFT"

run_hook "$REL" Edit "$VIOLATION" clean valid '// @chrome-header-handcraft-allow: raw fragment decoy'
expect_block "8. raw native escape decoy cannot hide proposed violation" "CHROME HEADER HANDCRAFT"

run_hook "$REL" Edit "$CLEAN" violating valid '<div className="h-[var(--chrome-header-height)] border-b border-divider" />'
expect_pass_silent "9. raw native violation cannot override clean trusted after-image"

run_hook "$REL" Write '// @chrome-header-handcraft-allow: intentional primitive exception
<div className="h-[var(--chrome-header-height)] border-b border-divider" />'
expect_pass_silent "10. anchored escape in trusted full state is allowed"

run_hook "$REL" Edit "" clean deleted
expect_pass_silent "11. trusted deletion is clean"

run_hook "$REL" Edit "$CLEAN" clean missing
expect_integrity "12. runner marker without state is integrity failure" "trusted proposed write state 缺失或 malformed"

run_hook "$REL" Edit "$CLEAN" clean malformed
expect_integrity "13. malformed state is integrity failure" "trusted proposed write state 缺失或 malformed"

run_hook "$REL" Edit "$CLEAN" clean mismatch
expect_integrity "14. state path mismatch is integrity failure" "與 hook target 不相符"

run_without_trust "$REL"
expect_integrity "15. governed mutation without runner trust is integrity failure" "缺少 runner-v1 proposed state"

run_hook "$REL" Edit '
export const Bar = () => (
  <div className="border-divider px-loose h-[var(--chrome-header-height)] border-b" />
)'
expect_block "16. class token order is irrelevant" "CHROME HEADER HANDCRAFT"

run_hook "$REL" Edit '
export const Bar = () => (
  <div className={`border-b ${dense ? "px-tight" : "px-loose"} border-divider h-[var(--chrome-header-height)]`} />
)'
expect_block "17. template static fragments are enforced" "CHROME HEADER HANDCRAFT"

run_hook "$REL" Edit '
export const Bar = () => (
  <div className={cn("border-divider", active && "border-b", "h-[var(--chrome-header-height)]")} />
)'
expect_block "18. cn-style static fragments are enforced" "CHROME HEADER HANDCRAFT"

run_hook "$REL" Edit '
const chromeClasses = cn("border-b", "h-[var(--chrome-header-height)]", "border-divider")
export const Bar = () => <div className={chromeClasses} />'
expect_block "19. simple const className identifier is resolved" "CHROME HEADER HANDCRAFT"

run_hook "$REL" Edit '
// <div className="h-[var(--chrome-header-height)] border-b border-divider" />
export const Bar = () => <div />'
expect_pass_silent "20. comment signature is not a false positive"

run_hook "$REL" Edit '
const documentation = "h-[var(--chrome-header-height)] border-b border-divider"
export const Bar = () => <div title={documentation} />'
expect_pass_silent "21. ordinary non-className string is not a false positive"

run_hook "$REL" Edit '// @chrome-header-handcraft-allow:
<div className="h-[var(--chrome-header-height)] border-b border-divider" />'
expect_block "22. empty escape rationale cannot bypass" "CHROME HEADER HANDCRAFT"

run_hook "$REL" Edit 'const ready = true
// @chrome-header-handcraft-allow: too late
export const Bar = () => <div className="h-[var(--chrome-header-height)] border-b border-divider" />'
expect_block "23. non-leading escape cannot bypass" "CHROME HEADER HANDCRAFT"

run_hook "$REL" Edit 'const decoy = `// @chrome-header-handcraft-allow: template decoy`
export const Bar = () => <div className="h-[var(--chrome-header-height)] border-b border-divider" />'
expect_block "24. template escape decoy cannot bypass" "CHROME HEADER HANDCRAFT"

run_hook "$REL" Edit '/* // @chrome-header-handcraft-allow: block decoy */
export const Bar = () => <div className="h-[var(--chrome-header-height)] border-b border-divider" />'
expect_block "25. block-comment escape decoy cannot bypass" "CHROME HEADER HANDCRAFT"

run_hook "$REL" Edit '<div className="h-[var(--chrome-header-height)] border-b border-divider">'
expect_integrity "26. malformed proposed TSX is integrity failure" "parser unavailable or proposed content malformed"

run_hook "$REL" Edit '
const chrome = cva("h-[var(--chrome-header-height)]", {
  variants: {
    tone: {
      default: "border-divider border-b",
    },
  },
})
export const Bar = () => <div className={chrome()} />'
expect_block "27. cva-style const call static fragments are enforced" "CHROME HEADER HANDCRAFT"

echo
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf 'Failed:%b\n' "$FAILED_TESTS"
  exit 1
fi

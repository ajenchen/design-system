#!/bin/bash
# Tests for check_canonical_propagation.sh — merged 3 sub-rules

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_canonical_propagation.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }

PASS=0; FAIL=0; FAILED_TESTS=""

run_hook() {
  local file_path="$1" content="$2" tool="${3:-Write}"
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  jq -n --arg tool "$tool" --arg fp "$file_path" --arg c "$content" \
    '{hook_event_name:"PreToolUse", tool_name:$tool, tool_input:{file_path:$fp, content:$c}}' \
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

expect_exit() {
  local name="$1" expect="$2" needle="${3:-}"
  local ok=1
  if [ "$expect" = "0" ] && [ -n "$needle" ]; then
    [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] && is_exact_context "$needle" && ok=0
  elif [ "$expect" = "0" ]; then
    [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ] && ok=0
  elif [ "$expect" = "2" ]; then
    [ "$EXIT" = "2" ] && [ -z "$STDOUT_TEXT" ] \
      && { [ -z "$needle" ] || echo "$STDERR_TEXT" | grep -qF "$needle"; } && ok=0
  elif [ "$expect" = "70" ]; then
    [ "$EXIT" = "70" ] && [ -z "$STDOUT_TEXT" ] \
      && { [ -z "$needle" ] || echo "$STDERR_TEXT" | grep -qF "$needle"; } && ok=0
  fi
  if [ "$ok" = "0" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit $expect${needle:+ + needle '$needle'}, got exit $EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== E.1 principles canonical ==="

# 1. New principles file with 0 universal core → BLOCK
run_hook "/r/packages/design-system/src/components/Foo/foo.principles.stories.tsx" "
const meta = { title: 'Design System/Components/Foo/設計原則' }
export default meta
export const SomeStory = () => <div />
" Write
expect_exit "E.1.1 0 universal core → BLOCK" 2 "principles canonical"

# 2. New principles with WhenToUse + WhenNotToUse → silent
run_hook "/r/packages/design-system/src/components/Foo/foo.principles.stories.tsx" "
const meta = { title: 'Design System/Components/Foo/設計原則' }
export default meta
export const WhenToUse = () => <div />
export const WhenNotToUse = () => <div />
" Write
expect_exit "E.1.2 WhenToUse+WhenNotToUse → silent" 0 ""

# 3. UsageGuidance integrated single export → silent (counts as ≥2)
run_hook "/r/packages/design-system/src/components/Foo/foo.principles.stories.tsx" "
const meta = { title: 'Design System/Components/Foo/設計原則' }
export default meta
export const UsageGuidance = () => <div />
" Write
expect_exit "E.1.3 UsageGuidance integrated → silent" 0 ""

# 4. Deprecated naming Forbidden* on new file → BLOCK
run_hook "/r/packages/design-system/src/components/Foo/foo.principles.stories.tsx" "
const meta = { title: 'Design System/Components/Foo/設計原則' }
export default meta
export const ForbiddenPatterns = () => <div />
export const WhenToUse = () => <div />
" Write
expect_exit "E.1.4 deprecated Forbidden* on new → BLOCK" 2 "principles canonical"

# 5. Allowlist comment → silent
run_hook "/r/packages/design-system/src/components/Foo/foo.principles.stories.tsx" "
// @principles-rationale: legacy migration
const meta = { title: 'Design System/Components/Foo/設計原則' }
export default meta
" Write
expect_exit "E.1.5 allowlist → silent" 0 ""

echo ""
echo "=== E.2 L3 primitive import ==="

# 6. App code import L3 → BLOCK
run_hook "/r/src/app/page.tsx" "
import { ItemInlineAction } from '@/design-system/patterns/element-anatomy/item-anatomy'
" Write
expect_exit "E.2.1 app code L3 import → BLOCK" 2 "L3 primitive import"

# 7. DS internal can import L3 → silent
run_hook "/r/packages/design-system/src/components/MyHost/my-host.tsx" "
import { ItemInlineAction } from '@/design-system/patterns/element-anatomy/item-anatomy'
" Write
expect_exit "E.2.2 DS internal L3 → silent" 0 ""

# 8. App code with allowlist comment → silent
run_hook "/r/src/app/special.tsx" '// @l3-import-allow: spec.md L42 documented exception
import { ItemInlineAction } from "@/design-system/patterns/element-anatomy/item-anatomy"
' Write
expect_exit "E.2.3 app code allowlist → silent" 0 ""

# 9. App code without L3 import → silent
run_hook "/r/src/app/page.tsx" "
import { Button } from '@/design-system/components/Button/button'
" Write
expect_exit "E.2.4 no L3 import → silent" 0 ""

echo ""
echo "=== E.3 spec-impl default alignment ==="

# 10. spec.md with 「預設」keyword → governance context
run_hook "/r/packages/design-system/src/components/Foo/foo.spec.md" '
## Width
預設 = trigger-width(同 popover anchor 寬)
' Write
expect_exit "E.3.1 預設 keyword → governance context" 0 "spec-impl default"

# 11. spec.md without default keyword → silent
run_hook "/r/packages/design-system/src/components/Foo/foo.spec.md" '
## Behavior
按下 Esc 關閉。
' Write
expect_exit "E.3.2 no default keyword → silent" 0 ""

# 12. spec.md with file-level allowlist → silent
run_hook "/r/packages/design-system/src/components/Foo/foo.spec.md" '// @spec-impl-allow: spec values are intentionally aspirational
## Width
預設 = trigger-width
' Write
expect_exit "E.3.3 spec allowlist → silent" 0 ""

echo ""
echo "=== Output contract ==="

# Quotes/newlines in warning data must remain one safely encoded compact JSON document.
run_hook '/r/packages/design-system/src/components/Foo/"quoted".spec.md' '
## "Quoted default"
預設 = "trigger-width"
' Write
expect_exit "O.1 adversarial quotes/newlines → exact encoded context" 0 "spec-impl default"

run_raw '{'
expect_exit "O.2 malformed input → stderr-only integrity failure" 70 "GOVERNANCE_INTEGRITY:"

echo ""
echo "═══ Results: $PASS PASS, $FAIL FAIL ═══"
[ "$FAIL" -gt 0 ] && { printf "Failed:%b\n" "$FAILED_TESTS"; exit 1; }
exit 0

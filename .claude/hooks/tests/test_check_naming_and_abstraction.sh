#!/bin/bash
# Tests for check_naming_and_abstraction.sh — merged 3 sub-rules

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_naming_and_abstraction.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }

PASS=0; FAIL=0; FAILED_TESTS=""

run_hook() {
  local file_path="$1" content="$2" tool="${3:-Write}"
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  jq -n --arg tool "$tool" --arg fp "$file_path" --arg c "$content" \
    '{tool_name:$tool, tool_input:{file_path:$fp, content:$c}}' \
    | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR"); rm -f "$STDOUT" "$STDERR"
}

expect_context() {
  local name="$1" needle="$2"
  local context
  context=$(printf '%s' "$STDOUT_TEXT" | jq -er \
    'select(keys == ["governanceContext"]) | .governanceContext
     | select(.hookEventName == "PreToolUse") | .message' 2>/dev/null || true)
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] && printf '%s' "$context" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exact governance context containing '$needle', got exit $EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_exit() {
  local name="$1" expect="$2" needle="${3:-}"
  if [ "$EXIT" = "$expect" ] && { [ -z "$needle" ] || echo "$STDERR_TEXT" | grep -qF "$needle"; }; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit $expect${needle:+ + needle '$needle'}, got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== D.1 premature abstraction ==="

# Setup: temp components/ — create Button base so suffix matching can find it
TMP_DS=$(mktemp -d)
mkdir -p "$TMP_DS/packages/design-system/src/components/Button"
echo "// existing base" > "$TMP_DS/packages/design-system/src/components/Button/button.tsx"

# 1. New ButtonOutline without rationale → BLOCK (suffix=Outline, base=Button exists)
run_hook "$TMP_DS/packages/design-system/src/components/ButtonOutline/button-outline.tsx" '
import * as React from "react"
export const ButtonOutline = () => <div />
' Write
expect_exit "D.1.1 new ButtonOutline w/o rationale → BLOCK" 2 "premature abstraction"

# 2. New ButtonOutline with rationale comment → silent
run_hook "$TMP_DS/packages/design-system/src/components/ButtonOutline/button-outline.tsx" '// @separate-component-rationale: 3-test passed; cite Linear / Notion / Stripe — separate components
import * as React from "react"
' Write
expect_exit "D.1.2 with rationale → silent" 0 ""

# 3. New component name not matching any suffix → silent
run_hook "$TMP_DS/packages/design-system/src/components/Sparkline/sparkline.tsx" '
export const Sparkline = () => null
' Write
expect_exit "D.1.3 no suffix match → silent" 0 ""

# 4. Edit existing file (not Write) → silent
run_hook "$TMP_DS/packages/design-system/src/components/Button/button.tsx" 'edit' Edit
expect_exit "D.1.4 edit tool → silent" 0 ""

rm -rf "$TMP_DS"

echo ""
echo "=== D.2 internal namespace consistency ==="

# Setup: temp dir with conflicting sibling stories
TMP_NS=$(mktemp -d)
mkdir -p "$TMP_NS/SelectionControl"
cat >"$TMP_NS/SelectionControl/sibling.stories.tsx" <<'EOF'
const meta = { title: 'Design System/Internal/SelectionControl' }
export default meta
EOF

# 5. New stories file with Components ns + sibling has Internal → BLOCK
run_hook "$TMP_NS/SelectionControl/new.stories.tsx" "
const meta = { title: 'Design System/Components/SelectionControl/設計原則' }
export default meta
" Write
expect_exit "D.2.1 sibling ns mismatch → BLOCK" 2 "namespace BLOCKER"

# 6. New stories with consistent Internal ns → silent
run_hook "$TMP_NS/SelectionControl/aligned.stories.tsx" "
const meta = { title: 'Design System/Internal/SelectionControl/Foo' }
export default meta
" Write
expect_exit "D.2.2 consistent ns → silent" 0 ""

rm -rf "$TMP_NS"

# 7. Story without title → skip
run_hook "/r/packages/design-system/src/components/Foo/foo.stories.tsx" '
const meta = { title: "Other/Foo" }
' Write
expect_exit "D.2.3 no DS title → silent" 0 ""

echo ""
echo "=== D.3 primitive color var in tsx ==="

# 8. tsx with var(--color-neutral-5) → neutral governance context
run_hook "/r/packages/design-system/src/components/Foo/foo.tsx" '
const cls = "border-[var(--color-neutral-5)]"
' Write
expect_context "D.3.1 primitive var color → governance context" "primitive color var"

# 9. tsx with semantic alias → silent
run_hook "/r/packages/design-system/src/components/Foo/foo.tsx" '
const cls = "border-border"
' Write
expect_exit "D.3.2 semantic alias → silent" 0 ""

# 10. Tag scope skip → silent
run_hook "/r/packages/design-system/src/components/Tag/tag.tsx" '
const cls = "var(--color-blue-3)"
' Write
expect_exit "D.3.3 Tag scope skip → silent" 0 ""

# 11. allowlist (line-level) → silent
run_hook "/r/packages/design-system/src/components/Foo/foo.tsx" '
const cls = "border-[var(--color-neutral-5)] // @primitive-color-allow: legacy migration"
' Write
expect_exit "D.3.4 allowlist line → silent" 0 ""

# 12. blanket allowlist → silent
run_hook "/r/packages/design-system/src/components/Foo/foo.tsx" '// primitive-color-allow-blanket
const cls = "var(--color-neutral-5)"
' Write
expect_exit "D.3.5 blanket allowlist → silent" 0 ""

echo ""
echo "═══ Results: $PASS PASS, $FAIL FAIL ═══"
[ "$FAIL" -gt 0 ] && { printf "Failed:%b\n" "$FAILED_TESTS"; exit 1; }
exit 0

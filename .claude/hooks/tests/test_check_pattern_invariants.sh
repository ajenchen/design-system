#!/bin/bash
# Tests for check_pattern_invariants.sh — merged 4 sub-rules(C.1-C.4)

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_pattern_invariants.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }

PASS=0; FAIL=0; FAILED_TESTS=""

run_hook() {
  local file_path="$1" content="$2"
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  jq -n --arg fp "$file_path" --arg c "$content" \
    '{hook_event_name:"PreToolUse", tool_name:"Write", tool_input:{file_path:$fp, content:$c}}' \
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

echo "=== C.1 overlay panel scroll chain ==="

# 1. SurfaceBody + wrapper without flex flex-col h-full → governance context(exit 0)
run_hook "/r/src/app/foo.tsx" '
function Panel() {
  return (
    <div className="w-[640px]">
      <SurfaceHeader>x</SurfaceHeader>
      <SurfaceBody>y</SurfaceBody>
    </div>
  )
}
'
expect_exit "C.1.1 SurfaceBody w/o flex chain → governance context" 0 "overlay scroll chain"

# 2. SurfaceBody + correct flex chain → silent
run_hook "/r/src/app/foo.tsx" '
function Panel() {
  return (
    <div className="w-[640px] flex flex-col h-full min-h-0">
      <SurfaceBody>y</SurfaceBody>
    </div>
  )
}
'
expect_exit "C.1.2 SurfaceBody w/ flex chain → silent" 0 ""

# 3. allowlist → silent
run_hook "/r/src/app/foo.tsx" '
// @scroll-chain-allow: fixed widget no scroll
function Panel() { return <div className="w-[640px]"><SurfaceBody/></div> }
'
expect_exit "C.1.3 allowlist → silent" 0 ""

echo ""
echo "=== C.2 inline-action canonical gap ==="

# 4. components/ ItemInlineAction + gap-3 → governance context
run_hook "/r/packages/design-system/src/components/Foo/foo.tsx" '
<div className="flex gap-3"><ItemInlineAction /></div>
'
expect_exit "C.2.1 gap-3 inline-action → WARN" 0 "inline-action gap"

# 5. components/ ItemInlineAction + gap-2 → silent
run_hook "/r/packages/design-system/src/components/Foo/foo.tsx" '
<div className="flex gap-2"><ItemInlineAction /></div>
'
expect_exit "C.2.2 gap-2 inline-action → silent" 0 ""

# 6. SSOT host item-anatomy → skip
run_hook "/r/packages/design-system/src/patterns/element-anatomy/item-anatomy.tsx" '
<div className="flex gap-3"><ItemInlineAction /></div>
'
expect_exit "C.2.3 SSOT host skip → silent" 0 ""

echo ""
echo "=== C.3 primitive wrapper padding (BLOCK) ==="

# 7. <div p-2><DateGrid /></div> → BLOCK
run_hook "/r/src/app/foo.tsx" '
function Foo() {
  return <div className="p-2"><DateGrid /></div>
}
'
expect_exit "C.3.1 p-2 wrapping DateGrid → BLOCK" 2 "primitive wrapper padding"

# 8. <DateGrid /> direct → silent
run_hook "/r/src/app/foo.tsx" '
function Foo() { return <DateGrid /> }
'
expect_exit "C.3.2 DateGrid direct → silent" 0 ""

# 9. file-level allowlist (first 5 lines) → silent
run_hook "/r/src/app/foo.tsx" '// @primitive-padding-allow: legacy migration

function Foo() {
  return <div className="p-2"><DateGrid /></div>
}
'
expect_exit "C.3.3 file allowlist → silent" 0 ""

echo ""
echo "=== C.4 row slot handcraft (BLOCK) ==="

# 10. components/ self-coded h-[1lh] shrink-0 flex items-center → BLOCK
run_hook "/r/packages/design-system/src/components/Bad/bad.tsx" '
function F() { return <span className="h-[1lh] shrink-0 flex items-center"><Icon/></span> }
'
expect_exit "C.4.1 row slot handcraft → BLOCK" 2 "row slot handcraft"

# 11. SSOT host item-anatomy → skip
run_hook "/r/packages/design-system/src/patterns/element-anatomy/item-anatomy.tsx" '
const x = "h-[1lh] shrink-0 flex items-center"
'
expect_exit "C.4.2 item-anatomy SSOT skip → silent" 0 ""

# 12. Using ItemPrefix → silent
run_hook "/r/packages/design-system/src/components/Good/good.tsx" '
import { ItemPrefix } from "@/design-system/patterns/element-anatomy/item-anatomy"
function F() { return <ItemPrefix><Icon/></ItemPrefix> }
'
expect_exit "C.4.3 ItemPrefix consume → silent" 0 ""

# 13. allowlist → silent
run_hook "/r/packages/design-system/src/components/Edge/edge.tsx" '
// @row-slot-handcraft-allow: forced width
function F() { return <span className="h-[1lh] shrink-0 flex items-center"><Icon/></span> }
'
expect_exit "C.4.4 row slot allowlist → silent" 0 ""

echo ""
echo "=== Output contract ==="

# Multiple independent warnings must be aggregated into one exact envelope.
run_hook "/r/packages/design-system/src/components/Foo/foo.tsx" '
<div className="w-[640px] gap-3">
  <ItemInlineAction />
  <SurfaceBody>content</SurfaceBody>
</div>
'
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] \
  && is_exact_context "overlay scroll chain" \
  && printf '%s' "$STDOUT_TEXT" | jq -e \
    '.governanceContext.message | contains("inline-action gap")' >/dev/null; then
  echo "  PASS  O.1 two warnings → one exact PreToolUse context"
  PASS=$((PASS+1))
else
  echo "  FAIL  O.1 warning aggregation contract"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - O.1 warning aggregation"
fi

run_raw '{'
expect_exit "O.2 malformed input → stderr-only integrity failure" 70 "GOVERNANCE_INTEGRITY:"

echo ""
echo "═══ Results: $PASS PASS, $FAIL FAIL ═══"
[ "$FAIL" -gt 0 ] && { printf "Failed:%b\n" "$FAILED_TESTS"; exit 1; }
exit 0

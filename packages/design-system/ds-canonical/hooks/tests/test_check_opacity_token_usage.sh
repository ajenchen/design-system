#!/bin/bash
# Tests for check_opacity_token_usage.sh(2026-05-06 v14.5.2)
#
# Hook 規則:*.tsx 寫 raw `opacity-{N}`(N 是數字非 0/100)→ soft warn 用 DS opacity token。
# 允許白名單:opacity-0 / opacity-100 / opacity-disabled。
# 排除:.stories.tsx / .test.* / .spec.tsx / tokens/opacity/*。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_opacity_token_usage.sh"
PROJECT_ROOT=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)
REGISTRY="$PROJECT_ROOT/packages/design-system/src/tokens/utility-registry.json"

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
    '{hook_event_name:"PreToolUse", tool_name: "Write", tool_input: {file_path: $fp, content: $c}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$PROJECT_ROOT" \
    bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

run_raw() {
  local payload="$1"
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$PROJECT_ROOT" \
    bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
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

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected both channels silent, exit=$EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_warn() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && [ -z "$STDOUT_TEXT" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit=2 + needle '$needle', got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

# #71 soft WARN tier(micro_gap / fraction):exit 0 + exact governance context
expect_soft_flag() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] && is_exact_context "soft flag"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exact PreToolUse governance context containing 'soft flag', got exit=$EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_opacity_token_usage tests ==="

# 1. raw opacity-30 → warn
run_hook "/repo/packages/design-system/src/components/Foo/foo.tsx" '
className="bg-surface opacity-30"
'
expect_warn "1. opacity-30 raw → warn" "M23 / Dim 47 violation"

# 2. raw opacity-50 → warn
run_hook "/repo/packages/design-system/src/components/Foo/foo.tsx" '
className="opacity-50"
'
expect_warn "2. opacity-50 raw → warn" "M23 / Dim 47 violation"

# 3. opacity-disabled token utility → silent
run_hook "/repo/packages/design-system/src/components/Foo/foo.tsx" '
className="opacity-disabled pointer-events-none"
'
expect_pass_silent "3. opacity-disabled token → silent"

# 4. opacity-0(visibility toggle)→ silent
run_hook "/repo/packages/design-system/src/components/Foo/foo.tsx" '
className="opacity-0 group-hover:opacity-100"
'
expect_pass_silent "4. opacity-0 / opacity-100 visibility → silent"

# 5. story file → skip
run_hook "/repo/packages/design-system/src/components/Foo/foo.stories.tsx" '
className="opacity-30 opacity-50"
'
expect_pass_silent "5. .stories.tsx → skip"

# 6. token spec internal → skip
run_hook "/repo/packages/design-system/src/tokens/opacity/opacity.css" '
opacity: 0.30;
'
expect_pass_silent "6. tokens/opacity/* → skip"

# 7. multiple raw opacity values → warn(catch all)
run_hook "/repo/packages/design-system/src/components/Foo/foo.tsx" '
const a = "opacity-25"
const b = "opacity-75"
'
expect_warn "7. multi opacity-N values → warn" "opacity-25"

# ── #71 micro_gap / fraction soft WARN tier(2026-07-11 接線)──────────────────
FP71="/repo/packages/design-system/src/components/Calendar/calendar.tsx"

# 8. gap-0.5(micro gap)→ soft flag(exit 0,非 block)
run_hook "$FP71" 'const a = <div className="gap-0.5" />'
expect_soft_flag "8. gap-0.5 micro gap → soft WARN(非 block)"

# 9. w-1/3(registry fraction)→ soft flag(exit 0)
run_hook "$FP71" 'const a = <div className="w-1/3" />'
expect_soft_flag "9. w-1/3 registry fraction → soft WARN"

# 10. w-1/2(合法,不在 registry 14 條)→ silent(不誤殺)
run_hook "$FP71" 'const a = <div className="w-1/2" />'
expect_pass_silent "10. w-1/2(合法留白)→ silent 不誤殺"

# 11. gap-2(合法)→ silent
run_hook "$FP71" 'const a = <div className="gap-2" />'
expect_pass_silent "11. gap-2(合法)→ silent"

# 12. 硬 violation + gap-0.5 → exit 2(hard block 不被 soft tier 弱化)
run_hook "$FP71" 'const a = <div className="text-muted-foreground gap-0.5" />'
expect_warn "12. 硬 violation + gap-0.5 → exit 2 block" "shadcn alias"

# 13. gap-0.5 + @token-registry-ok escape → silent
run_hook "$FP71" 'const a = <div className="gap-0.5" /> // @token-registry-ok: skeleton bone'
expect_pass_silent "13. gap-0.5 + escape → silent"

# Multiple soft flags remain one compact envelope and retain both messages.
run_hook "$FP71" 'const a = <div className="gap-0.5 w-1/3" />'
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] \
  && is_exact_context "micro gap <4px" \
  && printf '%s' "$STDOUT_TEXT" | jq -e \
    '.governanceContext.message | contains("fraction width")' >/dev/null; then
  echo "  PASS  14. two soft flags → one exact PreToolUse context"
  PASS=$((PASS+1))
else
  echo "  FAIL  14. soft-flag aggregation contract"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 14. soft aggregation"
fi

# Every explicit registry token must be behaviorally consumed. This is deliberately data-driven:
# adding a value to any authenticated block/warn list extends the regression without editing a
# second token inventory in this test.
while IFS=$'\t' read -r RULE_ID TOKEN; do
  run_hook "$FP71" "const a = <div className=\"$TOKEN\" />"
  expect_warn "registry block closure: $RULE_ID → $TOKEN" "$TOKEN"
done < <(jq -r '
  . as $registry
  | .enforcement.block[]
  | select(.tokenListPointer)
  | .id as $id
  | .tokenListPointer
  | split("/")[1:] as $path
  | $registry | getpath($path)[]
  | [$id, .] | @tsv
' "$REGISTRY")

while IFS=$'\t' read -r RULE_ID TOKEN; do
  run_hook "$FP71" "const a = <div className=\"$TOKEN\" />"
  expect_soft_flag "registry warn closure: $RULE_ID → $TOKEN"
done < <(jq -r '
  . as $registry
  | .enforcement.warn[]
  | select(.tokenListPointer)
  | .id as $id
  | .tokenListPointer
  | split("/")[1:] as $path
  | $registry | getpath($path)[]
  | [$id, .] | @tsv
' "$REGISTRY")

while IFS=$'\t' read -r RULE_ID LABEL FIXTURE; do
  run_hook "$FP71" "$FIXTURE"
  expect_warn "registry pattern closure: $RULE_ID" "[$LABEL]"
done <<'EOF_PATTERN_FIXTURES'
typography-leading-numeric	leading numeric	const a = <div className="leading-7" />
typography-inline-style	typography inline style	const a = <div style={{ fontSize: 12 }} />
radius-arbitrary	radius arbitrary	const a = <div className="rounded-[7px]" />
radius-inline-style	radius inline style	const a = <div style={{ borderRadius: 7 }} />
opacity-numeric	opacity	const a = <div className="opacity-15" />
opacity-arbitrary	opacity arbitrary	const a = <div className="opacity-[0.42]" />
primitive-color-family	primitive color as utility	const a = <div className="bg-green-8" />
phantom-state-suffix	phantom state suffix(silent no-op)	const a = <div className="hover:bg-neutral-hovered" />
EOF_PATTERN_FIXTURES

run_hook "$FP71" 'const a = <div className="rounded-[inherit]" />'
expect_pass_silent "registry pattern exclusion: rounded-[inherit] remains allowed"

run_raw '{'
if [ "$EXIT" = "70" ] && [ -z "$STDOUT_TEXT" ] \
  && echo "$STDERR_TEXT" | grep -qF "GOVERNANCE_INTEGRITY:" \
  && echo "$STDERR_TEXT" | grep -qF "invalid input envelope"; then
  echo "  PASS  15. malformed input → stderr-only integrity failure"
  PASS=$((PASS+1))
else
  echo "  FAIL  15. malformed input output contract"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 15. malformed input"
fi

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

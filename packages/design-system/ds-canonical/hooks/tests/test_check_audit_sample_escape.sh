#!/bin/bash
# Tests for check_audit_sample_escape.sh
#
# Hook(PreToolUse Agent):dispatch prompt 含 sample escape clause → BLOCK(exit 2)。
# Only enforce on prompt containing audit-related keyword(audit / Dim N / DS-wide / sub-agent / sweep)。
# Escape:prompt 含 `@audit-sample-allow:` 整 prompt 豁免。
# 違規 stderr「🚨 AUDIT NO-SAMPLE ESCAPE CLAUSE BLOCKER」+ exit 2。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_audit_sample_escape.sh"

if [ ! -f "$HOOK" ]; then echo "FATAL: hook not found: $HOOK"; exit 1; fi

PASS=0
FAIL=0
FAILED_TESTS=""

run_hook() {
  local tool="$1"; local prompt="$2"
  local payload
  payload=$(jq -n --arg tn "$tool" --arg p "$prompt" \
    '{tool_name: $tn, tool_input: {prompt: $p}}')
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

expect_block() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit=2 + needle '$needle', got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_audit_sample_escape tests ==="

# 1. Non-Agent tool → skip
run_hook "Bash" "audit DS-wide sample top 5"
expect_pass_silent "1. non-Agent tool → skip"

# 2. Agent dispatch without audit keyword → skip
run_hook "Agent" "refactor this function please"
expect_pass_silent "2. non-audit prompt → skip"

# 3. Agent + audit keyword + NO sample keyword → silent
run_hook "Agent" "audit Dim 12 DS-wide full sweep all components"
expect_pass_silent "3. audit prompt without sample escape → silent"

# 4. Agent + audit + 'sample top 10' → BLOCK
run_hook "Agent" "audit Dim 24 DS-wide sample top 10 components"
expect_block "4. sample top N → block" "AUDIT NO-SAMPLE ESCAPE CLAUSE BLOCKER"

# 5. Agent + audit + 'sampled components' → BLOCK
run_hook "Agent" "Dim 40 DS-wide sub-agent dispatch, sampled components only"
expect_block "5. sampled components → block" "AUDIT NO-SAMPLE ESCAPE CLAUSE BLOCKER"

# 6. Agent + audit + 'heavy agent needed' → BLOCK
run_hook "Agent" "audit sweep all 53 dim, heavy agent needed for Dim 25"
expect_block "6. heavy agent needed → block" "AUDIT NO-SAMPLE ESCAPE CLAUSE BLOCKER"

# 7. Escape allowlist → silent
run_hook "Agent" "// @audit-sample-allow: rare integration test scope
audit Dim 99 sample top 3"
expect_pass_silent "7. @audit-sample-allow escape → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

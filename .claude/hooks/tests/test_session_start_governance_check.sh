#!/bin/bash
# Tests for session_start_governance_check.sh
#
# Scenarios:
#   1. healthy project — silent (no reminders)
#   2. CLAUDE.md > 800 (soft) — REMINDERS fire
#   3. CLAUDE.md > 1000 (hard) — BLOCKERS fire
#   4. corrections > 40 (hard) — BLOCKERS fire
#   5. fire-weighted gap (G7) — surfaces hot hook without test

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../session_start_governance_check.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }

PASS=0; FAIL=0; FAILED=""

setup_proj() {
  TMP_PROJ=$(mktemp -d)
  mkdir -p "$TMP_PROJ/.claude/logs" "$TMP_PROJ/.claude/hooks/tests"
  # NOTE: deliberately NOT creating benchmarks dir(absent dir = no warning,
  # creating an empty one = "never fetched" warning fires)
  echo 'log_hook_fire() { :; }' > "$TMP_PROJ/.claude/hooks/_log-fire.sh"
  # 5-line healthy CLAUDE.md
  printf '%s\n' a b c d e > "$TMP_PROJ/CLAUDE.md"
  # init git for last-prune check (no commits → -1)
  ( cd "$TMP_PROJ" && git init -q && git commit --allow-empty -m "init" -q ) 2>/dev/null
}

teardown_proj() { rm -rf "$TMP_PROJ"; }

run_hook() {
  STDOUT=$(mktemp)
  set +e; CLAUDE_PROJECT_DIR="$TMP_PROJ" bash "$HOOK" < /dev/null > "$STDOUT" 2>&1; EXIT=$?; set -e
  STDOUT_TEXT=$(cat "$STDOUT"); rm -f "$STDOUT"
}

# Test 1: healthy project → silent
echo "Test 1: healthy project silent"
setup_proj
run_hook
if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ]; then
  echo "  PASS  Test 1 healthy silent"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 1 (exit=$EXIT, output='$STDOUT_TEXT')"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 1"
fi
teardown_proj

# Test 2: CLAUDE.md > 600 (strong-warn) → REMINDERS only(2026-04-26 tightened)
echo "Test 2: CLAUDE.md strong-warn threshold (601)"
setup_proj
yes '.' | head -650 > "$TMP_PROJ/CLAUDE.md"
run_hook
if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ]; then
  echo "  PASS  Test 2 silent on soft (601 lines, noise reduction 2026-04-26)"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 2 (output: $STDOUT_TEXT)"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 2"
fi
teardown_proj

# Test 3: CLAUDE.md > 800 (transition cap breach) → BLOCKERS(2026-04-26 tightened)
echo "Test 3: CLAUDE.md transition cap breach (801)"
setup_proj
yes '.' | head -850 > "$TMP_PROJ/CLAUDE.md"
run_hook
if [ "$EXIT" = "0" ] && echo "$STDOUT_TEXT" | grep -q "BLOCKER" && echo "$STDOUT_TEXT" | grep -q "transition cap 800 breached"; then
  echo "  PASS  Test 3 transition-cap 800 BLOCKER"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 3 (output: $STDOUT_TEXT)"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 3"
fi
teardown_proj

# Test 4: corrections > 40 (hard) → BLOCKERS
echo "Test 4: corrections hard threshold"
setup_proj
yes '{}' | head -45 > "$TMP_PROJ/.claude/logs/user-corrections.jsonl"
run_hook
if [ "$EXIT" = "0" ] && echo "$STDOUT_TEXT" | grep -q "BLOCKER" && echo "$STDOUT_TEXT" | grep -q "HARD THRESHOLD 40"; then
  echo "  PASS  Test 4 corrections hard BLOCKER"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 4 (output: $STDOUT_TEXT)"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 4"
fi
teardown_proj

# Test 5: fire-weighted gap (G7)
echo "Test 5: fire-weighted gap"
setup_proj
# Generate 150 fire entries for hook 'foo'
for i in $(seq 1 150); do
  echo '{"hook":"foo.sh"}'
done > "$TMP_PROJ/.claude/logs/hook-fires-per-hook.jsonl"
# foo has no test (tests dir is empty)
run_hook
if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ]; then
  echo "  PASS  Test 5 silent on soft fire-weighted gap (noise reduction)"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 5 (output: $STDOUT_TEXT)"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 5"
fi
teardown_proj

echo ""
echo "════ Results: $PASS PASS, $FAIL FAIL ════"
[ "$FAIL" -gt 0 ] && { printf "Failed:%b\n" "$FAILED"; exit 1; }
exit 0

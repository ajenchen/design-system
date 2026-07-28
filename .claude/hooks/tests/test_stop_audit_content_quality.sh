#!/bin/bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../stop_audit_content_quality.sh"
ORIGINAL_PATH="$PATH"
TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM
mkdir -p "$TMP_ROOT/bin" "$TMP_ROOT/project/scripts"

FAKE_NODE="$TMP_ROOT/bin/node"
printf '%s\n' '#!/bin/bash' \
  'case "${FAKE_NODE_MODE:-silent}" in' \
  '  message) printf "noise\\n[P0] synthetic finding\\n✅ checked\\n" ;;' \
  '  silent) printf "ordinary output\\n" ;;' \
  '  failure) printf "synthetic command failure\\n" >&2; exit 17 ;;' \
  '  *) exit 19 ;;' \
  'esac' > "$FAKE_NODE"
chmod +x "$FAKE_NODE"

PASS=0
FAIL=0

run_hook() {
  local mode="$1"
  STDOUT_FILE=$(mktemp)
  STDERR_FILE=$(mktemp)
  set +e
  PATH="$TMP_ROOT/bin:$ORIGINAL_PATH" FAKE_NODE_MODE="$mode" GOVERNANCE_PROJECT_DIR="$TMP_ROOT/project" \
    bash "$HOOK" >"$STDOUT_FILE" 2>"$STDERR_FILE"
  EXIT_CODE=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT_FILE")
  STDERR_TEXT=$(cat "$STDERR_FILE")
  rm -f "$STDOUT_FILE" "$STDERR_FILE"
}

pass() { printf '  PASS  %s\n' "$1"; PASS=$((PASS+1)); }
fail() { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL+1)); }

if bash -n "$HOOK"; then pass 'syntax is valid'; else fail 'syntax is valid'; fi

run_hook message
if [ "$EXIT_CODE" = 0 ] && [ -z "$STDERR_TEXT" ] \
  && printf '%s' "$STDOUT_TEXT" | jq -e '.governanceContext.message | contains("Content-quality Stop check:") and contains("[P0] synthetic finding")' >/dev/null; then
  pass 'matching findings emit a human-readable message'
else
  fail "matching findings emit a human-readable message (exit=$EXIT_CODE stdout=$STDOUT_TEXT stderr=$STDERR_TEXT)"
fi

run_hook silent
if [ "$EXIT_CODE" = 0 ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
  pass 'non-matching successful output stays silent'
else
  fail "non-matching successful output stays silent (exit=$EXIT_CODE stdout=$STDOUT_TEXT stderr=$STDERR_TEXT)"
fi

run_hook message
if printf '%s' "$STDOUT_TEXT" | jq -e \
  'keys == ["governanceContext"] and (.governanceContext | keys == ["hookEventName", "message"]) and .governanceContext.hookEventName == "Stop" and (.governanceContext.message | type == "string")' >/dev/null; then
  pass 'output uses the exact provider-neutral JSON envelope'
else
  fail "output uses the exact provider-neutral JSON envelope ($STDOUT_TEXT)"
fi

run_hook failure
if [ "$EXIT_CODE" = 0 ] && [ -z "$STDERR_TEXT" ] \
  && printf '%s' "$STDOUT_TEXT" | jq -e '.governanceContext.message | contains("execution failed (exit 17)") and contains("synthetic command failure")' >/dev/null; then
  pass 'underlying command failure is visible without becoming a false blocker'
else
  fail "underlying command failure is visible (exit=$EXIT_CODE stdout=$STDOUT_TEXT stderr=$STDERR_TEXT)"
fi

printf '\nResults: %s PASS, %s FAIL\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

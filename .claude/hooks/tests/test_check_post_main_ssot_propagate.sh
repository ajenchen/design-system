#!/bin/bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_post_main_ssot_propagate.sh"
PROJECT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
PASS=0
FAIL=0

run_case() {
  local label="$1"
  local payload="$2"
  local before after output status
  before="$(git -C "$PROJECT_ROOT" status --porcelain=v1 -z --untracked-files=all | shasum -a 256)"
  output="$(printf '%s' "$payload" | bash "$HOOK" 2>&1)"
  status=$?
  after="$(git -C "$PROJECT_ROOT" status --porcelain=v1 -z --untracked-files=all | shasum -a 256)"
  if [ "$status" -eq 0 ] && [ -z "$output" ] && [ "$before" = "$after" ]; then
    echo "  PASS  $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label(status=$status output=$output)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== check_post_main_ssot_propagate Genesis tombstone tests ==="
run_case "valid legacy PostToolUse payload is a silent no-op" \
  '{"hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"git push origin main"}}'
run_case "malformed legacy payload remains a silent no-op" \
  'not-json; touch /tmp/must-not-run'
run_case "provider-specific environment cannot reactivate retired propagation" \
  '{"provider":"claude","command":"ssot-sync-dispatch"}'

echo "Results: $PASS PASS, $FAIL FAIL"
test "$FAIL" -eq 0

#!/bin/bash
set -u
HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../check_anatomy_section_numbering.sh"
[ -x "$HOOK" ] || { echo "FATAL"; exit 1; }
PASS=0; FAIL=0
run_hook() {
  local payload=$(jq -n --arg fp "$1" --arg ct "$2" '{tool_name:"Write", tool_input:{file_path:$fp, content:$ct}}')
  STDOUT=$(echo "$payload" | bash "$HOOK" 2>&1); EXIT=$?
}
echo "Test 1: non-anatomy file → silent skip"
run_hook "/tmp/foo.stories.tsx" "export const X = {}"
[ "$EXIT" = "0" ] && [ -z "$STDOUT" ] && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL ($STDOUT)"; FAIL=$((FAIL+1)); }
echo "Results: $PASS PASS, $FAIL FAIL"
[ "$FAIL" -eq 0 ] || exit 1

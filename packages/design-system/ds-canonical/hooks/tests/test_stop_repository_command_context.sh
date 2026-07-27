#!/bin/bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_HOOK="$SCRIPT_DIR/../stop_audit_content_quality.sh"
RULES_HOOK="$SCRIPT_DIR/../stop_extract_canonical_rules.sh"
FIXTURE=$(mktemp -d)
trap 'rm -rf "$FIXTURE"' EXIT
mkdir -p "$FIXTURE/scripts"

printf 'console.log("[P0] fixture content drift")\n' > "$FIXTURE/scripts/audit-content-quality.mjs"
printf 'console.log("GAPS fixture canonical keyword")\n' > "$FIXTURE/scripts/extract-canonical-rules.mjs"

PASS=0
FAIL=0
verify_context() {
  local name="$1" hook="$2" needle="$3"
  local stdout stderr status
  stdout=$(mktemp); stderr=$(mktemp)
  set +e
  printf '{"hook_event_name":"Stop","last_assistant_message":"fixture"}\n' \
    | GOVERNANCE_PROJECT_DIR="$FIXTURE" bash "$hook" >"$stdout" 2>"$stderr"
  status=$?
  set -e
  if [ "$status" = "0" ] && [ ! -s "$stderr" ] \
     && jq -e --arg needle "$needle" '.governanceContext.hookEventName == "Stop" and (.governanceContext.message | contains($needle))' "$stdout" >/dev/null; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name"; FAIL=$((FAIL+1))
  fi
  rm -f "$stdout" "$stderr"
}

verify_context "audit-content-quality repository command is JSON-wrapped" "$CONTENT_HOOK" "[P0] fixture content drift"
verify_context "extract-canonical-rules repository command is JSON-wrapped" "$RULES_HOOK" "GAPS fixture canonical keyword"

echo "════ Results: $PASS PASS, $FAIL FAIL ════"
[ "$FAIL" -eq 0 ]

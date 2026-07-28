#!/bin/bash
set -uo pipefail

HOOK="$(cd "$(dirname "$0")/.." && pwd)/check_story_determinism.sh"
FIXTURE=$(mktemp -d)
trap 'rm -rf "$FIXTURE"' EXIT
PASS=0
FAIL=0

run_case() {
  local name="$1" path="$2" content="$3" tool="$4" expect_warn="$5"
  local payload
  payload=$(jq -n --arg tool "$tool" --arg path "$path" --arg content "$content" \
    '{tool_name:$tool,tool_input:{file_path:$path,content:$content}}')
  set +e
  printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$FIXTURE" bash "$HOOK" \
    >"$FIXTURE/stdout" 2>"$FIXTURE/stderr"
  local rc=$?
  set -e
  local warned=0
  grep -q '非決定性時間/亂數' "$FIXTURE/stderr" && warned=1
  if [ "$rc" -eq 0 ] && [ "$warned" -eq "$expect_warn" ]; then
    PASS=$((PASS + 1)); echo "  PASS  $name"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL  $name(rc=$rc warn=$warned expected=$expect_warn)"
  fi
}

set -e
echo '=== check_story_determinism tests ==='
run_case 'bare new Date warns' 'apps/demo/src/demo.stories.tsx' 'const now = new Date()' Write 1
run_case 'Date.now in Edit warns' 'apps/demo/src/demo.stories.tsx' 'const now = Date.now()' Edit 1
run_case 'line rationale suppresses warning' 'apps/demo/src/demo.stories.tsx' 'const n = Math.random() // @nondeterministic-ok: realtime demo' Write 0
run_case 'fixed date remains deterministic' 'apps/demo/src/demo.stories.tsx' 'const day = new Date(2026, 6, 15)' Write 0
run_case 'production file is out of scope' 'apps/demo/src/App.tsx' 'const now = new Date()' Write 0
run_case 'read event is out of scope' 'apps/demo/src/demo.stories.tsx' 'const now = new Date()' Read 0

echo "Passed: $PASS / $((PASS + FAIL))"
[ "$FAIL" -eq 0 ]

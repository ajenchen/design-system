#!/bin/bash
set -uo pipefail

HOOK="$(cd "$(dirname "$0")/.." && pwd)/check_story_determinism.sh"
FIXTURE=$(mktemp -d)
[ -n "${FIXTURE:-}" ] && [ -d "$FIXTURE" ] || { echo "❌ mktemp -d failed(FIXTURE;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
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
# 2026-11-17 收窄:只有引號字串不警告;同一行若另有裸用法照樣警告(對照組)
run_case 'quoted docs string is not a call' 'apps/demo/src/demo.stories.tsx' "['defaultMonth', 'Date', 'new Date()', '初始可見月份']," Write 0
run_case 'quoted string plus bare call still warns' 'apps/demo/src/demo.stories.tsx' "const doc = 'new Date()'; const at = new Date()" Write 1
run_case 'Date.now in template literal still warns' 'apps/demo/src/demo.stories.tsx' 'const label = `updated ${Date.now()}`' Write 1
# id 寫法不是「只在事件處理裡」的證據(M37):初次渲染資料的 id、`rowid:`、事件處理的 id 一律照警告;
# 事件處理那種用行內標記放行
run_case 'initial-render data id still warns' 'apps/demo/src/demo.stories.tsx' 'const rows = [{ id: `ORD-${Date.now()}`, customer: "Acme" }]' Write 1
run_case 'args id via Math.random still warns' 'apps/demo/src/demo.stories.tsx' 'args: { items: [{ id: `${Math.random()}` }] }' Edit 1
run_case 'rowid template still warns' 'apps/demo/src/demo.stories.tsx' 'const r = { rowid: `r-${Math.random()}` }' Write 1
run_case 'handler id without rationale still warns' 'apps/demo/src/demo.stories.tsx' '...accepted.map((f, i) => ({ id: `photo-${Date.now()}-${i}`, name: f.name })),' Write 1
run_case 'handler id with rationale is silent' 'apps/demo/src/demo.stories.tsx' '...accepted.map((f, i) => ({ id: `photo-${Date.now()}-${i}` })), // @nondeterministic-ok: 上傳後才產生的 id,不進初次渲染' Write 0

echo "Passed: $PASS / $((PASS + FAIL))"
[ "$FAIL" -eq 0 ]

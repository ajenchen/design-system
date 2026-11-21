#!/bin/bash
# Tests for check_ds_anchor_preflight.sh(M29 mechanical enforcement)
#
# Scope:
#   - packages/design-system/src/**.tsx (DS internal)
#   - apps/**.tsx (consumer fork-user)
#   - node_modules/@qijenchen/design-system/**.tsx (禁改)
# Excluded: *.stories.tsx / *.test.tsx / *.spec.md / *.spec.ts

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_ds_anchor_preflight.sh"

if [ ! -f "$HOOK" ]; then echo "FATAL: hook not found: $HOOK"; exit 1; fi

PASS=0
FAIL=0
FAILED_TESTS=""

# Create temp transcript file(empty by default = no canonical read trace)
TMP_TRANSCRIPT=$(mktemp)
TMP_TRANSCRIPT_WITH_READ=$(mktemp)
# Simulate canonical Grep tool_use in transcript
cat > "$TMP_TRANSCRIPT_WITH_READ" <<'EOF'
{"message":{"content":[{"type":"tool_use","name":"Grep","input":{"path":"packages/design-system/src/components/Sidebar/sidebar.stories.tsx"}}]}}
EOF

run_hook() {
  local file_path="$1"; local content="$2"; local transcript="$3"; local static_replay="${4:-0}"
  local payload
  payload=$(jq -n --arg fp "$file_path" --arg c "$content" --arg tp "$transcript" \
    '{hook_event_name: "PreToolUse", tool_name: "Write", tool_input: {file_path: $fp, content: $c}, transcript_path: $tp}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | GOVERNANCE_STATIC_REPLAY="$static_replay" bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT" 2>/dev/null)
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

# Test 1:apps/** tsx wrap <Sidebar> 無 canonical read → soft BLOCKER context
echo "Test 1: apps/** wrap <Sidebar> 無 canonical read → context inject"
CONTENT='import { Sidebar } from "@qijenchen/design-system"; export default () => <Sidebar collapsible="icon" />'
run_hook "/tmp/ds-product-template/apps/template/src/App.tsx" "$CONTENT" "$TMP_TRANSCRIPT"
if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -q "M29 DS Anchor Preflight"; then
  echo "  PASS  Test 1"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 1 (no inject;stderr=${STDERR_TEXT:0:200})"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 1"
fi

# Test 2:有 canonical Grep trace → silent
echo "Test 2: wrap <Sidebar> 有 Grep canonical → silent"
run_hook "/tmp/ds-product-template/apps/template/src/App.tsx" "$CONTENT" "$TMP_TRANSCRIPT_WITH_READ"
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] && [ -z "$STDOUT_TEXT" ]; then
  echo "  PASS  Test 2"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 2 (unexpected inject;stderr=${STDERR_TEXT:0:200})"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 2"
fi

# Test 3:stories.tsx scope excluded
echo "Test 3: *.stories.tsx 排除"
run_hook "/some/path/sidebar.stories.tsx" "$CONTENT" "$TMP_TRANSCRIPT"
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] && [ -z "$STDOUT_TEXT" ]; then
  echo "  PASS  Test 3"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 3 (should skip stories.tsx)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 3"
fi

# Test 4:non-DS-primitive code skip(no wrap pattern)
echo "Test 4: 不 wrap DS primitive 跳過"
run_hook "/some/apps/foo/src/utils.tsx" "export const helper = (x) => x * 2;" "$TMP_TRANSCRIPT"
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] && [ -z "$STDOUT_TEXT" ]; then
  echo "  PASS  Test 4"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 4 (should skip non-primitive)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 4"
fi

# Test 5:@story-baseline marker present → silent
echo "Test 5: @story-baseline marker → silent"
CONTENT_WITH_MARKER='// @story-baseline: sidebar.stories.tsx#IconCollapse
import { Sidebar } from "@qijenchen/design-system";
export default () => <Sidebar collapsible="icon" />'
# Use TMP_TRANSCRIPT empty(no canonical read);marker should pass
echo '{"message":{"content":"@story-baseline: sidebar.stories.tsx#IconCollapse"}}' > "$TMP_TRANSCRIPT"
run_hook "/some/apps/_template/src/App.tsx" "$CONTENT_WITH_MARKER" "$TMP_TRANSCRIPT"
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] && [ -z "$STDOUT_TEXT" ]; then
  echo "  PASS  Test 5"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 5 (marker should pass)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 5"
fi

# Test 6:null transcript is a valid provider payload and must fail closed without committed evidence
echo "Test 6: null/missing transcript + no marker → block"
run_hook "/some/apps/product/src/App.tsx" "$CONTENT" ""
if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -q "deterministic evidence missing"; then
  echo "  PASS  Test 6"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 6 (null transcript false-green;exit=$EXIT)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 6"
fi

# Test 7:CI replay must not accept a provider transcript as its evidence boundary
echo "Test 7: static replay ignores transcript trace and requires committed marker"
run_hook "/some/apps/product/src/App.tsx" "$CONTENT" "$TMP_TRANSCRIPT_WITH_READ" 1
if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -q "deterministic evidence missing"; then
  echo "  PASS  Test 7"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 7 (static replay accepted ephemeral transcript;exit=$EXIT)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 7"
fi

# Test 8:the same static predicate accepts durable evidence in the source
echo "Test 8: static replay + committed marker → pass"
run_hook "/some/apps/product/src/App.tsx" "$CONTENT_WITH_MARKER" "" 1
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
  echo "  PASS  Test 8"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 8 (durable marker rejected;exit=$EXIT)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 8"
fi

# Test 9:soft handcraft warning must use the neutral model-visible context channel, never stderr.
echo "Test 9: handcraft soft warning → governanceContext JSON"
HANDCRAFT_CONTENT='<div className="flex border px-2">
  <div className="flex rounded py-2">A</div>
  <div className="absolute shadow gap-2">B</div>
</div>'
run_hook "/some/apps/product/src/Handcraft.tsx" "$HANDCRAFT_CONTENT" ""
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] \
   && echo "$STDOUT_TEXT" | jq -e '.governanceContext.hookEventName == "PreToolUse" and (.governanceContext.message | contains("純手刻嫌疑"))' >/dev/null; then
  echo "  PASS  Test 9"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 9 (warning was not model-visible JSON)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 9"
fi

# ── Test 10–13(WP-05):M29 bypass 的稽核紀錄是功能狀態,遙測沒開也要寫;唯讀 / 沒有 adapter 照舊不寫 ──
FIXTURE=$(mktemp -d)
[ -n "${FIXTURE:-}" ] && [ -d "$FIXTURE" ] || { echo "❌ mktemp -d failed(FIXTURE;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
FIXTURE="$(cd "$FIXTURE" && pwd -P)"
trap 'rm -rf "$FIXTURE"' EXIT
git -C "$FIXTURE" init -q
FIX_GIT_DIR="$(cd "$(git -C "$FIXTURE" rev-parse --absolute-git-dir)" && pwd -P)"
FIX_RUNTIME="$FIX_GIT_DIR/governance-runtime"
BYPASS_LOG="$FIX_RUNTIME/governance-bypass.jsonl"
# 沒有 canonical read、也沒有 marker 的 transcript → 不 bypass 就會被擋(Test 13 對照)。
BYPASS_TRANSCRIPT="$FIXTURE/transcript.jsonl"
: > "$BYPASS_TRANSCRIPT"

# usage: run_bypass_case <bypass 0|1> [env(1) edits...]
# 呼叫端的修改交給第二個 env:env(1) 的選項(-u)只能出現在變數指派之前,
# 寫在固定指派後面會被當成指令名(exit 127)。
run_bypass_case() {
  local bypass="$1"; shift
  local payload
  payload=$(jq -n --arg fp "/some/apps/product/src/App.tsx" --arg c "$CONTENT" --arg tp "$BYPASS_TRANSCRIPT" \
    '{hook_event_name: "PreToolUse", tool_name: "Write", tool_input: {file_path: $fp, content: $c}, transcript_path: $tp}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | env GOVERNANCE_PROJECT_DIR="$FIXTURE" GOVERNANCE_STATIC_REPLAY=0 \
    GOVERNANCE_TELEMETRY_OPT_IN=0 GOVERNANCE_READ_ONLY=0 \
    GOVERNANCE_RUNTIME_ROOT="$FIX_RUNTIME" GOVERNANCE_STATE_DIR="$FIX_RUNTIME" \
    GOVERNANCE_BYPASS_DS_ANCHOR="$bypass" env "$@" bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT" 2>/dev/null)
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}
bypass_lines() { if [ -f "$BYPASS_LOG" ]; then grep -c '"event":"ds-anchor-bypass"' "$BYPASS_LOG" || true; else echo 0; fi; }
# 每格只看「這一次」加了幾行,不看累計:一格紅不會連帶讓後面幾格跟著紅(看得出是哪一個條件壞了)。
bypass_case() {
  local before
  before=$(bypass_lines)
  run_bypass_case "$@"
  ADDED=$(( $(bypass_lines) - before ))
}

echo "Test 10: bypass + 遙測關 + adapter 環境 → 放行且寫進 governance-bypass.jsonl"
bypass_case 1
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] && [ -z "$STDOUT_TEXT" ] && [ "$ADDED" = "1" ] \
   && grep -qF '"file":"/some/apps/product/src/App.tsx"' "$BYPASS_LOG"; then
  echo "  PASS  Test 10"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 10 (bypass not audit-logged with telemetry off;exit=$EXIT added=$ADDED)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 10"
fi

echo "Test 11: bypass + READ_ONLY=1 → 放行,一個檔都不寫"
bypass_case 1 GOVERNANCE_READ_ONLY=1
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] && [ "$ADDED" = "0" ]; then
  echo "  PASS  Test 11"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 11 (read-only wrote or blocked;exit=$EXIT added=$ADDED)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 11"
fi

echo "Test 12: bypass + 直接跑(沒有 adapter 的 runtime root)→ 放行,不寫"
bypass_case 1 -u GOVERNANCE_RUNTIME_ROOT
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] && [ "$ADDED" = "0" ]; then
  echo "  PASS  Test 12"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 12 (direct probe wrote or blocked;exit=$EXIT added=$ADDED)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 12"
fi

echo "Test 13: 對照 —— 同一份內容不 bypass → 擋,而且不寫稽核紀錄"
bypass_case 0
if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -q "M29 DS Anchor Preflight" && [ "$ADDED" = "0" ]; then
  echo "  PASS  Test 13"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 13 (control did not block or wrote;exit=$EXIT added=$ADDED)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - Test 13"
fi

rm -rf "$FIXTURE"
rm -f "$TMP_TRANSCRIPT" "$TMP_TRANSCRIPT_WITH_READ"

echo ""
echo "════ Results: $PASS PASS, $FAIL FAIL ════"
if [ "$FAIL" -gt 0 ]; then printf "Failed:%b\n" "$FAILED_TESTS"; exit 1; fi
exit 0

#!/bin/bash
# Tests for check_story_determinism.sh(2026-11-21 knowledge-prune WP-16 起會擋)
#
# 期待值:命中 → exit 2、理由只在 stderr(PreToolUse 擋下,模型當工具錯誤讀到);放行 → exit 0、完全安靜;
# exit 0 時有任何輸出 → stdout 是 governanceContext envelope,stderr 空;讀不懂輸入 → GOVERNANCE_INTEGRITY exit 70。
# 改版前的期待值是「stderr 有字、exit 0」—— 那是模型看不到的通道(Claude never sees stderr from a hook that exits 0)。
# E 段走真實入口 scripts/run-provider-hook.mjs(依 registrations.json 的 outputMode 解讀),
# 兩面對照:把 outputMode 改回 diagnostic,E1「理由送到模型」那格必須紅。
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_story_determinism.sh"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
RUNNER="$REPO_ROOT/scripts/run-provider-hook.mjs"
FIXTURE=$(mktemp -d)
[ -n "${FIXTURE:-}" ] && [ -d "$FIXTURE" ] || { echo "❌ mktemp -d failed(FIXTURE;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
trap 'rm -rf "$FIXTURE"' EXIT
PASS=0
FAIL=0
NEEDLE='非決定性時間/亂數'

ok() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad() {
  FAIL=$((FAIL + 1)); echo "  FAIL  $1(rc=$RC)"
  sed 's/^/    stdout: /' "$FIXTURE/stdout"; sed 's/^/    stderr: /' "$FIXTURE/stderr"
}

run_payload() { # <payload json> [env assignments are inherited]
  set +e
  printf '%s' "$1" | GOVERNANCE_PROJECT_DIR="$FIXTURE" bash "$HOOK" >"$FIXTURE/stdout" 2>"$FIXTURE/stderr"
  RC=$?
  set -e
}
expect_block() { # 擋:exit 2、stdout 空、stderr 有理由、沒有 integrity 標記
  if [ "$RC" -eq 2 ] && [ ! -s "$FIXTURE/stdout" ] && grep -qF "$NEEDLE" "$FIXTURE/stderr" \
    && ! grep -qF 'GOVERNANCE_INTEGRITY:' "$FIXTURE/stderr"; then ok "$1"; else bad "$1"; fi
}
expect_pass() { # 放行:exit 0、兩個通道都空
  if [ "$RC" -eq 0 ] && [ ! -s "$FIXTURE/stdout" ] && [ ! -s "$FIXTURE/stderr" ]; then ok "$1"; else bad "$1"; fi
}

run_case() { # <name> <path> <content> <tool> <block|pass>
  run_payload "$(jq -nc --arg tool "$4" --arg path "$2" --arg content "$3" \
    '{hook_event_name:"PreToolUse",tool_name:$tool,tool_input:{file_path:$path,content:$content}}')"
  if [ "$5" = block ]; then expect_block "$1"; else expect_pass "$1"; fi
}

set -e
echo '=== check_story_determinism tests ==='
S='apps/demo/src/demo.stories.tsx'
run_case 'bare new Date blocks' "$S" 'const now = new Date()' Write block
run_case 'Date.now in Edit blocks' "$S" 'const now = Date.now()' Edit block
run_case 'line rationale lets it through' "$S" 'const n = Math.random() // @nondeterministic-ok: realtime demo' Write pass
run_case 'fixed date remains deterministic' "$S" 'const day = new Date(2026, 6, 15)' Write pass
run_case 'production file is out of scope' 'apps/demo/src/App.tsx' 'const now = new Date()' Write pass
run_case 'read event is out of scope' "$S" 'const now = new Date()' Read pass
# 2026-11-17 收窄:只有引號字串不擋;同一行若另有裸用法照樣擋(對照組)
run_case 'quoted docs string is not a call' "$S" "['defaultMonth', 'Date', 'new Date()', '初始可見月份']," Write pass
run_case 'quoted string plus bare call still blocks' "$S" "const doc = 'new Date()'; const at = new Date()" Write block
run_case 'Date.now in template literal still blocks' "$S" 'const label = `updated ${Date.now()}`' Write block
# id 寫法不是「只在事件處理裡」的證據(M37):初次渲染資料的 id、`rowid:`、事件處理的 id 一律照擋;
# 事件處理那種用行內標記放行
run_case 'initial-render data id still blocks' "$S" 'const rows = [{ id: `ORD-${Date.now()}`, customer: "Acme" }]' Write block
run_case 'args id via Math.random still blocks' "$S" 'args: { items: [{ id: `${Math.random()}` }] }' Edit block
run_case 'rowid template still blocks' "$S" 'const r = { rowid: `r-${Math.random()}` }' Write block

# 兩面(WP-16 規格第 6 項):同一行,違規 → 擋;加豁免 → 放行
HANDLER='...accepted.map((f, i) => ({ id: `photo-${Date.now()}-${i}`, name: f.name })),'
run_case 'two-sided: handler id without rationale blocks' "$S" "$HANDLER" Write block
run_case 'two-sided: same line with @nondeterministic-ok passes' "$S" "$HANDLER // @nondeterministic-ok: 上傳後才產生的 id,不進初次渲染" Write pass

# 輸入形狀:provider 原樣的 Edit new_string / MultiEdit edits[] 也要擋(只看這次寫進去的文字)
run_payload "$(jq -nc --arg p "$S" '{hook_event_name:"PreToolUse",tool_name:"Edit",tool_input:{file_path:$p,old_string:"x",new_string:"const at = Date.now()"}}')"
expect_block 'Edit new_string shape blocks'
run_payload "$(jq -nc --arg p "$S" '{hook_event_name:"PreToolUse",tool_name:"MultiEdit",tool_input:{file_path:$p,edits:[{old_string:"a",new_string:"const ok = 1"},{old_string:"b",new_string:"const r = Math.random()"}]}}')"
expect_block 'MultiEdit edits[] shape blocks the violating edit'
run_payload "$(jq -nc --arg p "$S" '{hook_event_name:"PreToolUse",tool_name:"MultiEdit",tool_input:{file_path:$p,edits:[{old_string:"a",new_string:"const day = new Date(2026, 6, 15)"}]}}')"
expect_pass 'MultiEdit with only deterministic text passes'

# 讀不懂輸入 → integrity(exit 70),不得當成「沒命中」放行;也不得混進 stdout
run_payload '{"tool_name":'
if [ "$RC" -eq 70 ] && [ ! -s "$FIXTURE/stdout" ] && grep -qF 'GOVERNANCE_INTEGRITY:' "$FIXTURE/stderr"; then
  ok 'malformed input fails closed with integrity exit 70'
else bad 'malformed input fails closed with integrity exit 70'; fi
run_payload "$(jq -nc --arg p "$S" '{hook_event_name:"PreToolUse",tool_name:"MultiEdit",tool_input:{file_path:$p,edits:["not-an-object"]}}')"
if [ "$RC" -eq 70 ] && [ ! -s "$FIXTURE/stdout" ] && grep -qF 'GOVERNANCE_INTEGRITY:' "$FIXTURE/stderr"; then
  ok 'unreadable edits[] fails closed instead of silently passing'
else bad 'unreadable edits[] fails closed instead of silently passing'; fi

# envelope:exit 0 時有任何輸出(這裡用一個會多吐一行 stderr 的 awk 替身製造)→ 包成 governanceContext 走 stdout,
# stderr 保持空(adapter 對 exit 0 的 stderr 判 integrity,模型也看不到)
REAL_AWK=$(command -v awk)
mkdir -p "$FIXTURE/bin"
printf '%s\n' '#!/bin/sh' \
  'printf "%s\n" "awk: fixture stray note" >&2' \
  'exec "$REAL_AWK" "$@"' > "$FIXTURE/bin/awk"
chmod +x "$FIXTURE/bin/awk"
set +e
jq -nc --arg p "$S" '{hook_event_name:"PreToolUse",tool_name:"Write",tool_input:{file_path:$p,content:"const day = 1"}}' \
  | REAL_AWK="$REAL_AWK" PATH="$FIXTURE/bin:$PATH" GOVERNANCE_PROJECT_DIR="$FIXTURE" \
    bash "$HOOK" >"$FIXTURE/stdout" 2>"$FIXTURE/stderr"
RC=$?
set -e
if [ "$RC" -eq 0 ] && [ ! -s "$FIXTURE/stderr" ] \
  && jq -e '(keys == ["governanceContext"])
    and .governanceContext.hookEventName == "PreToolUse"
    and (.governanceContext.message | contains("fixture stray note"))' "$FIXTURE/stdout" >/dev/null 2>&1; then
  ok 'exit-0 output is delivered as a governanceContext envelope, never raw stderr'
else bad 'exit-0 output is delivered as a governanceContext envelope, never raw stderr'; fi

# ── E 段:走真實入口(Claude Code → hooks.json → scripts/run-provider-hook.mjs → hook)──
# 直接跑 hook 看不到 outputMode;這兩格由 adapter 依 registrations.json 解讀 hook 的輸出,
# 所以 outputMode 改回 diagnostic 時 E1 必紅(adapter 會把 exit 2 判成 diagnostic hook 失敗,而不是把理由交給模型)。
echo '  ▶ 真實入口 run-provider-hook.mjs'
run_e2e() { # <payload json>
  printf '%s' "$1" > "$FIXTURE/e2e.json"
  set +e
  ( cd "$REPO_ROOT" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" node "$RUNNER" --provider claude --hook check_story_determinism.sh \
      <"$FIXTURE/e2e.json" >"$FIXTURE/stdout" 2>"$FIXTURE/stderr" )
  RC=$?
  set -e
}
if [ ! -f "$RUNNER" ]; then
  RC=-1; : > "$FIXTURE/stdout"; echo "missing $RUNNER" > "$FIXTURE/stderr"; bad 'E0 real provider entry exists'
else
  E2E_PATH="$REPO_ROOT/apps/template/src/DeterminismProbe.stories.tsx"
  run_e2e "$(jq -nc --arg p "$E2E_PATH" '{hook_event_name:"PreToolUse",session_id:"determinism-e2e",tool_name:"Write",tool_input:{file_path:$p,content:"export const Probe = { args: { now: Date.now() } }\n"}}')"
  if [ "$RC" -eq 2 ] && [ ! -s "$FIXTURE/stdout" ] && grep -qF "$NEEDLE" "$FIXTURE/stderr" \
    && ! grep -qE 'GOVERNANCE_INTEGRITY|GOVERNANCE_WARNING|provider hook adapter blocked|diagnostic hook failed' "$FIXTURE/stderr"; then
    ok 'E1 real entry: violation is blocked and the reason reaches the model'
  else bad 'E1 real entry: violation is blocked and the reason reaches the model'; fi
  run_e2e "$(jq -nc --arg p "$E2E_PATH" '{hook_event_name:"PreToolUse",session_id:"determinism-e2e",tool_name:"Write",tool_input:{file_path:$p,content:"export const Probe = { args: { now: Date.now() } } // @nondeterministic-ok: live clock demo, VR skips it\n"}}')"
  expect_pass 'E2 real entry: same line with @nondeterministic-ok passes silently'
fi

echo "Passed: $PASS / $((PASS + FAIL))"
[ "$FAIL" -eq 0 ]

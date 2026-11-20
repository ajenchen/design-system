#!/bin/bash
# Tests for check_codex_collab_5step.sh(M31 5-step canonical;2026-11-21 knowledge-prune WP-16 起本支被呼叫時會擋)
# 注意:目前 adapter 不會派本支(見第 13 格與 hook 檔頭「派送現況」),下面 1–12 格都是直接呼叫 hook 量的。
#
# Hook 規則:Bash + git commit + commit message 含 peer collab keyword(registry 解出的 peer 名 / Layer A own /
# Layer B <peer> / dual-track / 據理力爭 / cite battle)但缺 3 必備 marker
# (spec cite / verify run / verdict)→ exit 2,理由只在 stderr(PreToolUse 擋下 commit,模型讀得到)。
# Allow escape:`@peer-collab-allow: <reason>`。
# 改版前的期待值是「stderr 有字、exit 0」—— 那是模型看不到的通道(Claude never sees stderr from a hook that exits 0)。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_codex_collab_5step.sh"
REGISTRATIONS="$SCRIPT_DIR/../registrations.json"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""
TMP_DIR=$(mktemp -d)
[ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ] || { echo "❌ mktemp -d failed(TMP_DIR;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
trap 'rm -rf "$TMP_DIR"' EXIT
export GOVERNANCE_READ_ONLY=1
export GOVERNANCE_SELF_PROVIDER=claude
export GOVERNANCE_PEER_PROVIDER=codex
export GOVERNANCE_PEER_DISPLAY_NAME="Codex"

run_hook() {
  local tool="$1"
  local command="$2"
  local payload
  payload=$(jq -n --arg t "$tool" --arg c "$command" \
    '{hook_event_name: "PreToolUse", tool_name: $t, tool_input: {command: $c}}')
  printf '%s' "$payload" >"$TMP_DIR/payload.json"
  run_hook_payload_file "$TMP_DIR/payload.json"
}

run_hook_payload_file() {
  local payload_file="$1"
  set +e
  bash "$HOOK" <"$payload_file" >"$TMP_DIR/stdout" 2>"$TMP_DIR/stderr"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$TMP_DIR/stdout")
  STDERR_TEXT=$(cat "$TMP_DIR/stderr")
}

record_fail() {
  local name="$1" why="$2"
  echo "  FAIL  $name ($why, exit=$EXIT)"
  echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'
  echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    record_fail "$name" "expected silent"
  fi
}

# 擋:exit 2、stdout 空、stderr 有理由、沒有 integrity 標記
expect_block() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && [ -z "$STDOUT_TEXT" ] \
    && ! grep -qF 'GOVERNANCE_INTEGRITY:' <<<"$STDERR_TEXT" \
    && grep -qF "$needle" <<<"$STDERR_TEXT"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    record_fail "$name" "expected block '$needle'"
  fi
}

echo "=== check_codex_collab_5step tests ==="

# 1. Non-Bash tool → skip
run_hook "Edit" "irrelevant"
expect_pass_silent "1. non-Bash tool → skip"

# 2. Bash non-git-commit command → skip
run_hook "Bash" "ls -la"
expect_pass_silent "2. Bash non-git-commit → skip"

# 3. git commit without codex keyword → skip
run_hook "Bash" "git commit -m \"fix typo in spec\""
expect_pass_silent "3. git commit no codex keyword → skip"

# 4. git commit WITH codex keyword but NO marker → block
run_hook "Bash" "git commit -m \"codex propose accepted\""
expect_block "4. codex keyword, no markers → block" "M31 peer-collab 5-step canonical 違反"

# 5. git commit WITH codex keyword + allow escape → silent
run_hook "Bash" "git commit -m \"codex propose @peer-collab-allow: emergency hotfix\""
expect_pass_silent "5. codex keyword + @peer-collab-allow → silent"

# 6. git commit WITH codex + all 3 markers → silent
run_hook "Bash" "git commit -m \"codex collab agree synthesize: spec.md:L42 cite + tsc audit verify + verdict agree\""
expect_pass_silent "6. codex + spec cite + verify + verdict → silent"

# 7. git commit WITH cite battle keyword only(missing other 2 markers)→ block,點名缺的 marker
run_hook "Bash" "git commit -m \"cite battle vs codex on field-controls\""
expect_block "7. cite battle only, missing verify/verdict → block" "spec.md cite"

# 8. Exercise both full COMMAND and heredoc-derived MSG with an early escape match followed by
# >256 KiB. The payload is encoded from a file so this test never places the replay in argv.
LARGE_COMMAND="$TMP_DIR/large-collab-command.txt"
{
  printf "%s\n" "git commit -F - < <(cat <<'EOF'"
  printf '%s\n' '@peer-collab-allow: large full-command replay'
  awk 'BEGIN {
    for (i = 0; i < 12000; i++) {
      printf "large-collab-filler-%05d abcdefghijklmnopqrstuvwxyz0123456789\n", i
    }
  }'
  printf '%s\n' 'EOF' ')'
} >"$LARGE_COMMAND"
if [ "$(wc -c <"$LARGE_COMMAND" | tr -d ' ')" -le 262144 ]; then
  echo "  FAIL  8. large collab fixture is not larger than 256 KiB"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 8. fixture size"
else
  jq -Rs '{tool_name:"Bash",tool_input:{command:.}}' \
    <"$LARGE_COMMAND" >"$TMP_DIR/large-collab-command.json"
  run_hook_payload_file "$TMP_DIR/large-collab-command.json"
  expect_pass_silent "8. >256 KiB early git/allow match remains silent"
fi

# 9. 兩面(WP-16 規格第 6 項):同一則 HEREDOC 訊息,缺 marker → 擋;只多一行 @peer-collab-allow → 放行
HEREDOC_BODY="Layer B codex 的提案照收(dual-track)"
run_hook "Bash" "$(printf '%s\n' "git commit -F - <<'EOF'" "$HEREDOC_BODY" 'EOF')"
expect_block "9a. two-sided: heredoc collab commit missing markers → block" "verify run"
run_hook "Bash" "$(printf '%s\n' "git commit -F - <<'EOF'" "$HEREDOC_BODY" '@peer-collab-allow: 只是轉述 peer 名字,不是協作結論' 'EOF')"
expect_pass_silent "9b. two-sided: same message + @peer-collab-allow → silent"

# 10. registry 給的 self / peer 不合法 → integrity(exit 70),不得當成「沒事」放行,也不得寫 stdout
set +e
printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git commit -m \"codex x\""}}' \
  | GOVERNANCE_PEER_PROVIDER='' bash "$HOOK" >"$TMP_DIR/stdout" 2>"$TMP_DIR/stderr"
EXIT=$?
set -e
STDOUT_TEXT=$(cat "$TMP_DIR/stdout"); STDERR_TEXT=$(cat "$TMP_DIR/stderr")
if [ "$EXIT" = "70" ] && [ -z "$STDOUT_TEXT" ] && grep -qF 'GOVERNANCE_INTEGRITY:PEER_COLLAB_REGISTRY_CONTEXT_INVALID' <<<"$STDERR_TEXT"; then
  echo "  PASS  10. invalid peer registry context → integrity exit 70"; PASS=$((PASS+1))
else
  record_fail "10. invalid peer registry context → integrity exit 70" "expected integrity"
fi

# 11. 讀不懂輸入 → integrity(exit 70)
printf '%s' '{"tool_name":' >"$TMP_DIR/broken.json"
run_hook_payload_file "$TMP_DIR/broken.json"
if [ "$EXIT" = "70" ] && [ -z "$STDOUT_TEXT" ] && grep -qF 'GOVERNANCE_INTEGRITY:' <<<"$STDERR_TEXT"; then
  echo "  PASS  11. malformed input → integrity exit 70"; PASS=$((PASS+1))
else
  record_fail "11. malformed input → integrity exit 70" "expected integrity"
fi

# 12. envelope:exit 0 時有任何輸出(這裡用一個會多吐一行 stderr 的 grep 替身製造)→ 包成 governanceContext 走 stdout,
#     stderr 保持空(adapter 對 exit 0 的 stderr 判 integrity,模型也看不到)
REAL_GREP=$(command -v grep)
mkdir -p "$TMP_DIR/bin"
printf '%s\n' '#!/bin/sh' \
  'printf "%s\n" "grep: fixture stray note" >&2' \
  'exec "$REAL_GREP" "$@"' >"$TMP_DIR/bin/grep"
chmod +x "$TMP_DIR/bin/grep"
jq -n '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:"git commit -m \"codex collab agree synthesize: spec.md:L42 cite + tsc audit verify\""}}' \
  >"$TMP_DIR/envelope.json"
set +e
REAL_GREP="$REAL_GREP" PATH="$TMP_DIR/bin:$PATH" bash "$HOOK" <"$TMP_DIR/envelope.json" >"$TMP_DIR/stdout" 2>"$TMP_DIR/stderr"
EXIT=$?
set -e
STDOUT_TEXT=$(cat "$TMP_DIR/stdout"); STDERR_TEXT=$(cat "$TMP_DIR/stderr")
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] \
  && jq -e '(keys == ["governanceContext"])
    and .governanceContext.hookEventName == "PreToolUse"
    and (.governanceContext.message | contains("fixture stray note"))' <<<"$STDOUT_TEXT" >/dev/null 2>&1; then
  echo "  PASS  12. exit-0 output is a governanceContext envelope, never raw stderr"; PASS=$((PASS+1))
else
  record_fail "12. exit-0 output is a governanceContext envelope, never raw stderr" "expected envelope"
fi

# 13. 只是靜態核對登記檔,不是行為檢查:registrations.json 裡本支每一筆都登記 governance-context-or-block。
#     不像 test_check_story_determinism.sh 走真實入口,是因為目前根本沒有派送路徑:scripts/run-provider-hook.mjs
#     判資格時不帶 certified capability 選定,peer 恆為 null,本支在任何 session(M31 已啟動也一樣)都判成不合資格
#     (REVIEW_CAPABILITY_SELECTION_REQUIRED),走真實入口只會量到「沒派」。登記值要等將來接上派送路徑才有作用:
#     adapter 只在 blocking / governance-context-or-block 把 exit 2 當 policy-block 交給模型,
#     diagnostic 會把 exit 2 判成 hook 失敗(scripts/lib/provider-hook-output-transport.mjs 的 interpretProviderHookChildResult)。
#     兩面對照:outputMode 改回 diagnostic 這格必紅(改登記檔就紅,量不到執行時的行為)。
MODES=$(jq -r '[.hooks[][] | .hooks[] | select(.kind == "hook" and .hook == "check_codex_collab_5step.sh") | .outputMode] | unique | join(",")' "$REGISTRATIONS")
if [ "$MODES" = "governance-context-or-block" ]; then
  echo "  PASS  13. static registry check: every registration declares governance-context-or-block"; PASS=$((PASS+1))
else
  STDOUT_TEXT="$MODES"; STDERR_TEXT=""; EXIT="-"
  record_fail "13. static registry check: every registration declares governance-context-or-block" "registered outputMode=$MODES"
fi

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

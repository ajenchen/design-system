#!/bin/bash
# 2026-06-11 repoint:check_propose_plain_chinese.sh 已合併進 check_propose_discipline.sh(prune merge;測試 payload 不變 = 行為等價驗證)
# Tests for check_propose_discipline.sh(2026-05-15 → 2026-05-18 升 M34 broad detect)
#
# Hook 規則:Stop hook,tail transcript 取最後 assistant text。
# 若 reply 含「決策 prompt」pattern(回 A / → 選 A / 等你拍板 / 一字回 / etc)
# **且** Python jargon count ≥ 10 → provider-native stdout JSON 警告
# 「🟡 check_propose_plain_chinese WARN」(non-blocking,exit 0)。
#
# Decision pattern + low jargon → silent。
# No decision pattern → silent。
# No transcript file → silent。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_propose_discipline.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# Build a transcript JSONL file with one user msg then one assistant msg
build_transcript() {
  local path="$1"
  local assistant_text="$2"
  # Simulate Claude Code transcript schema: each line is a JSON record.
  # User line must have role:user grep target;
  # assistant line uses .message.role + .message.content[].text path.
  printf '%s\n' '{"role":"user","content":"propose options"}' > "$path"
  jq -n --arg t "$assistant_text" \
    '{message: {role: "assistant", content: [{type: "text", text: $t}]}}' >> "$path"
}

run_hook() {
  local transcript_path="$1"
  local payload
  payload=$(jq -n --arg tp "$transcript_path" '{transcript_path: $tp}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (exit=$EXIT, stdout non-empty=$([ -n "$STDOUT_TEXT" ] && echo yes), stderr non-empty=$([ -n "$STDERR_TEXT" ] && echo yes))"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_warn() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] && echo "$STDOUT_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected provider-native stdout warn '$needle', got exit $EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_propose_plain_chinese tests ==="

# 1. Decision prompt + high jargon count → warn
TS1="$TMP_DIR/ts1.jsonl"
build_transcript "$TS1" "我推 A 方案:hookSpecificOutput frontmatter stub canonical wrapper-vs-primitive compound-component Earn-existence Anchor preflight check_xxx feedback_audit_preflight nearest same-purpose canonical baseline registry。等你拍板回 A 或 B。"
run_hook "$TS1"
expect_warn "1. decision + jargon ≥ 10 → warn" "check_propose_plain_chinese WARN"

# 2. Decision prompt but low jargon (plain chinese) → silent
TS2="$TMP_DIR/ts2.jsonl"
build_transcript "$TS2" "我推 A 方案:改 button 顏色從藍到紅。影響 3 個畫面看起來更醒目。等你拍板回 A 或 B 就好。"
run_hook "$TS2"
expect_pass_silent "2. decision + low jargon → silent"

# 3. No decision prompt (just regular reply) → silent
TS3="$TMP_DIR/ts3.jsonl"
build_transcript "$TS3" "已完成 wrapper-vs-primitive Anchor preflight check_xxx hookSpecificOutput frontmatter stub canonical compound-component baseline registry。"
run_hook "$TS3"
expect_pass_silent "3. no decision pattern → silent (even high jargon)"

# 4. No transcript path → silent skip
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
printf '{}' | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
EXIT=$?
set -e
STDOUT_TEXT=$(cat "$STDOUT")
STDERR_TEXT=$(cat "$STDERR")
rm -f "$STDOUT" "$STDERR"
expect_pass_silent "4. empty transcript_path → silent"

# 5. Nonexistent transcript file → silent skip
run_hook "$TMP_DIR/does-not-exist.jsonl"
expect_pass_silent "5. nonexistent transcript file → silent"

# 6. Empty assistant text → silent
TS6="$TMP_DIR/ts6.jsonl"
printf '%s\n' '{"role":"user","content":"hi"}' > "$TS6"
jq -n '{message: {role: "assistant", content: [{type: "text", text: ""}]}}' >> "$TS6"
run_hook "$TS6"
expect_pass_silent "6. empty assistant text → silent"

# ── N15(2026-10-07):Sub-rule 1 管所有回覆;以英文為主、或拍板清單只列代號 → Stop 擋下(exit 2)──
run_hook_native() {
  local text="$1"
  local payload
  payload=$(jq -n --arg t "$text" '{hook_event_name:"Stop",last_assistant_message:$t}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}
expect_block() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && [ -z "$STDOUT_TEXT" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected Stop block exit 2 + '$needle', got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

run_hook_native "I have finished the refactor of the provider hook runner. The adapter now verifies that every declared tool resolves on the hook path before dispatching, and degraded hooks are surfaced to the model through the context channel. All tests pass and the governance check is green. Next I will regenerate the views and run the full suite of browser gates."
expect_block "7. N15 以英文為主的一般回覆(沒有拍板提問也管)→ 擋" "PLAIN-CHINESE BLOCKER"

run_hook_native "已修好:\`scripts/run-provider-hook.mjs\` 在派發 hook 前先確認 jq 找得到,找不到就把「治理沒有執行」告訴模型。
\`\`\`
node --test packages/governance/test/plugin-hook-runtime.test.mjs
ok 1 - N34 isolation works when one hook crashes and the others still deliver context
\`\`\`"
expect_pass_silent "8. N15 中文為主、英文只在程式碼區塊與反引號裡 → 放行"

run_hook_native "以下三項等你拍板:
- N4、N8、N27
回 A 或 B。"
expect_block "9. N15 拍板清單只列代號、沒有中文說明 → 擋" "只寫了內部代號"

run_hook_native "以下等你拍板:
- N4:對話框裡按 Esc 會整個關掉,建議改成一次只退一層
回 A 或 B。"
expect_pass_silent "10. N15 對照組:代號後面跟著中文白話說明 → 放行"

run_hook_native "Done."
expect_pass_silent "11. N15 對照組:極短英文(未達 30 個英文字)→ 不擋"

run_hook_native "<!-- @plain-chinese-skip: user 要英文原文對照 --> This is the original English paragraph that the user explicitly asked to see verbatim for comparison with the translation, so it stays in English here on purpose and is not a summary."
expect_pass_silent "12. N15 逃生口:寫明理由的 @plain-chinese-skip → 放行"

# 13–15. N15 複核(2026-10-07):改前這兩種寫法都被誤擋(exit 2)
run_hook_native "要你拍板兩件事:
1. **N4**
   現在按鈕之間的間距是 8,改成 12 會跟其他工具列一致,建議改。
2. **N8**
   目前沒有鍵盤捷徑,建議加上,理由是常用操作要能不碰滑鼠完成。
等你拍板"
expect_pass_silent "13. N15 代號自成一行、下一行才寫中文說明(同一項目)→ 放行"

run_hook_native "等你拍板:是否把雜湊改成新的演算法(建議採用,比較安全,也跟其他地方一致)。
\`\`\`
const h = SHA256(data)
\`\`\`"
expect_pass_silent "14. N15 拍板回覆裡的程式碼區塊含代號樣式字串 → 不算只寫代號,放行"

run_hook_native "以下等你拍板:
1. **N4**
2. **N8**
回 A 或 B。"
expect_block "15. N15 對照組:代號各自一行、下一行是新的項目(沒有說明)→ 仍擋" "只寫了內部代號"

# 16–17. N15 複核二(2026-10-07):代號後空一行接一句頂格的無關總結,改前被當成說明而放行
run_hook_native "等你拍板:
1. **N4**

以上是這次要決定的。"
expect_block "16. N15 代號後空一行、接頂格的無關總結 → 不算說明,擋" "只寫了內部代號"

run_hook_native "等你拍板:
1. **N4**

   現在按鈕之間的間距是 8,改成 12 會跟其他工具列一致,建議改。"
expect_pass_silent "17. N15 對照組:代號後空一行、接縮排的續段說明(markdown 清單續段)→ 放行"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

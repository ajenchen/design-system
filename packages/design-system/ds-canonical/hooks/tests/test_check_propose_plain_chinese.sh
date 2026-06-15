#!/bin/bash
# 2026-06-11 repoint:check_propose_plain_chinese.sh 已合併進 check_propose_discipline.sh(prune merge;測試 payload 不變 = 行為等價驗證)
# Tests for check_propose_discipline.sh(2026-05-15 → 2026-05-18 升 M34 broad detect)
#
# Hook 規則:Stop hook,tail transcript 取最後 assistant text。
# 若 reply 含「決策 prompt」pattern(回 A / → 選 A / 等你拍板 / 一字回 / etc)
# **且** Python jargon count ≥ 10 → stderr 警告
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
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (exit=$EXIT, stderr non-empty=$([ -n "$STDERR_TEXT" ] && echo yes))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_warn() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "0" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected stderr warn '$needle', got exit $EXIT)"
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

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

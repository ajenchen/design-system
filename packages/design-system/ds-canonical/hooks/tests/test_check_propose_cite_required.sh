#!/bin/bash
# 2026-06-11 repoint:check_propose_cite_required.sh 已合併進 check_propose_discipline.sh(prune merge;測試 payload 不變 = 行為等價驗證)
# Tests for check_propose_discipline.sh(2026-05-27 user verbatim codify;M22 cite invariant 延伸到對話層)
#
# Hook 規則(Stop / SubagentStop post-assistant turn):
#   - 只在 hook_event_name ∈ {Stop, SubagentStop} fire;其他 event → silent exit 0
#   - 讀 transcript_path 的 last assistant reply
#     (tail -200 | grep '"role":"assistant"|"type":"text"' | tail -50)
#   - 偵測 claim keyword:規定 / 必配 / 必須用 / 必須是 / 一定要 /
#       canonical 寫 / spec 寫 / 強制 / DS spec 規定 / 明文 / mandate
#   - 同 reply 無 file:line cite(`.spec.md:42` / `.css:42` / `.tsx:42` /
#       `.ts:42` / `.json:42` / `#L42` / `line 42` / `L42-43` / `L42`)
#     → BLOCKER exit 2 + stderr 'PROPOSE-WITHOUT-CITE BLOCKER'
#   - Reply 含 `propose-cite-skip` escape → silent
#   - 有 cite → silent;無 claim keyword → silent
#
# Negative coverage(M34 broad-vs-narrow symmetry):
#   - near-miss(claim keyword 但同 reply 有合法 cite)→ 不該 fire(guard over-broad)
#   - 真 violation(claim keyword + 無任何 cite)→ 必 fire(guard over-narrow)
#   - 非 Stop event 帶 claim+無 cite → 不該 fire(event scope guard)

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

# Override CLAUDE_PROJECT_DIR so _log-fire.sh writes its per-hook fire log into
# TMP_DIR(避免污染 repo .claude/logs/)。
export CLAUDE_PROJECT_DIR="$TMP_DIR"
mkdir -p "$TMP_DIR/.claude/logs"

# Build a transcript JSONL whose last assistant text line carries $reply.
# Hook greps for '"type":"text"' lines on a SINGLE line, so emit COMPACT JSON
# (jq -c) — real Claude Code transcripts are JSONL (1 compact obj per line);
# pretty-printed jq would split `"type": "text"` (note the space) onto its own
# line away from the text value and the grep would miss it.
build_transcript() {
  local path="$1"; local reply="$2"
  jq -nc --arg t "$reply" \
    '{type:"assistant", message:{role:"assistant", content:[{type:"text", text:$t}]}}' \
    > "$path"
}

# Run hook with a given event + transcript path.
run_hook() {
  local event="$1"; local transcript="$2"
  local payload
  payload=$(jq -n --arg e "$event" --arg tp "$transcript" \
    '{hook_event_name:$e, transcript_path:$tp}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

# Convenience: build transcript with $1 reply, run Stop event.
run_stop_with_reply() {
  local reply="$1"; local event="${2:-Stop}"
  local tx="$TMP_DIR/tx_$RANDOM.jsonl"
  build_transcript "$tx" "$reply"
  run_hook "$event" "$tx"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent, exit=$EXIT, stderr=$([ -n "$STDERR_TEXT" ] && echo non-empty || echo empty))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_block() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected BLOCK exit=2 + '$needle', got exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

NEEDLE="PROPOSE-WITHOUT-CITE BLOCKER"

echo "=== check_propose_cite_required tests ==="

# ─────────────────────────────────────────────────────────────────────────────
# POSITIVE cases — SHOULD trigger BLOCKER (exit 2)
# ─────────────────────────────────────────────────────────────────────────────

# P1. 真 violation:claim keyword「規定」+ 無任何 cite → BLOCK (guard over-narrow)
#     Anchor 場景:憑印象斷言「DS spec 規定 caption + muted 是標準組合」
run_stop_with_reply "DS spec 規定 caption 一律要配 muted token,所以這裡照規定改成 muted。"
expect_block "P1. claim「規定」無 cite → BLOCK" "$NEEDLE"

# P2. claim keyword「必配」無 cite → BLOCK
run_stop_with_reply "caption 必配 secondary,這是 design system 的標準做法。"
expect_block "P2. claim「必配」無 cite → BLOCK" "$NEEDLE"

# P3. claim keyword「必須用」無 cite → BLOCK
run_stop_with_reply "這個 token 必須用 fg-muted,不能用別的。"
expect_block "P3. claim「必須用」無 cite → BLOCK" "$NEEDLE"

# P4. claim keyword「canonical 寫」無 cite → BLOCK
run_stop_with_reply "canonical 寫得很清楚,所有 standalone card 一定要有 gap。"
expect_block "P4. claim「canonical 寫」+「一定要」無 cite → BLOCK" "$NEEDLE"

# P5. SubagentStop event 同樣 fire(event scope 包含 SubagentStop)
run_stop_with_reply "spec 寫明這裡強制使用 sm size。" "SubagentStop"
expect_block "P5. SubagentStop event claim「spec 寫」無 cite → BLOCK" "$NEEDLE"

# ─────────────────────────────────────────────────────────────────────────────
# NEGATIVE cases — should NOT trigger (silent exit 0)
# ─────────────────────────────────────────────────────────────────────────────

# N1. near-miss:claim keyword「規定」但同 reply 附合法 .spec.md:line cite
#     → 不該 fire (guard over-broad regex)
run_stop_with_reply "DS 規定 caption 配 muted,見 field-controls.spec.md:142 的 state 段落。"
expect_pass_silent "N1. claim + .spec.md:142 cite → silent (over-broad guard)"

# N2. near-miss:claim keyword「必須是」+ #L 形式 cite → silent
run_stop_with_reply "這裡必須是 fg-disabled,參考 semantic.css#L49 token 定義。"
expect_pass_silent "N2. claim + semantic.css#L49 cite → silent"

# N3. near-miss:claim keyword「mandate」+ `line 88` 形式 cite → silent
run_stop_with_reply "The spec mandate this — see button.spec.md line 88 for the rule."
expect_pass_silent "N3. claim「mandate」+ 'line 88' cite → silent"

# N4. 完全乾淨:無 claim keyword,純描述 → silent
run_stop_with_reply "我把 padding 從 8px 改成 12px,看起來對齊更好了,跑了一下 tsc 沒問題。"
expect_pass_silent "N4. 無 claim keyword innocuous reply → silent"

# N5. near-miss:含 cite-looking 字但無 claim keyword → silent (no claim, no fire)
run_stop_with_reply "建議可以試試 token.css:12 那個值,不過你決定就好。"
expect_pass_silent "N5. 有 cite-like 但無 claim keyword → silent"

# N6. escape clause:含「propose-cite-skip」即使 claim+無 cite → silent
run_stop_with_reply "DS 規定一定要用 muted。<!-- @propose-cite-skip: 口頭討論非正式 propose -->"
expect_pass_silent "N6. propose-cite-skip escape → silent (even with claim, no cite)"

# N7. event scope guard:非 Stop event(PreToolUse)帶 claim+無 cite → silent
run_stop_with_reply "DS spec 規定 caption 必配 muted。" "PreToolUse"
expect_pass_silent "N7. PreToolUse event(非 Stop)→ silent (event scope guard)"

# N8. transcript_path 缺失 / 不存在 → silent (defensive exit 0)
payload_no_tx=$(jq -n '{hook_event_name:"Stop", transcript_path:"/nonexistent/path/tx.jsonl"}')
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
printf '%s' "$payload_no_tx" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
EXIT=$?
set -e
STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
rm -f "$STDOUT" "$STDERR"
expect_pass_silent "N8. transcript_path 不存在 → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

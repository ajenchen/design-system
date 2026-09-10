#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# stop_self_audit.sh 的 M6(PushNotification gap)—— 偵測必須看「真的呼叫」而不是「字串出現」
# ═══════════════════════════════════════════════════════════════════════════
#
# 病根(2026-09-10 user:「為何推播又沒了?到底是什麼時侯才能永遠修好?」):
#   M6 原本用 `grep -ciE 'PushNotification|"name":"PushNotification"'` 掃本 turn 的 transcript 片段。
#   那會被三種東西騙過,而且三種在真實 session 裡天天發生:
#     (1) **本 hook 自己寫進 transcript 的警告文字**就含「PushNotification gap」→ 警告過一次之後,
#         往後每一 turn 都被自己的輸出遮蔽;
#     (2) `ToolSearch` 的回傳把整份工具 schema(含 "name": "PushNotification")貼進 transcript;
#     (3) 我自己在回覆裡提到「PushNotification」也算。
#   實測後果:2026-09-10 07:17(UTC)之後連續五小時的 substantive turn 零 call,gate 全程靜音。
#
# 修法:解析 transcript 的 content block,type=tool_use 且 name=PushNotification 才算呼叫過。
# 本測試四個情境,其中 c / d 就是舊寫法會靜音的那兩種。
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../stop_self_audit.sh"
WORK="$SCRIPT_DIR/fixtures/.push-gate-work"
rm -rf "$WORK"; mkdir -p "$WORK" || exit 1
trap 'rm -rf "$WORK"' EXIT

python3 - "$WORK" <<'PY'
import json, os, sys
work = sys.argv[1]
long_text = "已修好那個 bug 並 commit,測試 PASS。" + "這一段刻意夠長以觸發 substantive 判定,讓 M6 真的走進檢查分支。" * 4
def line(kind, content, ts):
    role = "user" if kind == "user" else "assistant"
    return json.dumps({"type": kind, "message": {"role": role, "content": content}, "timestamp": ts},
                      ensure_ascii=False, separators=(",", ":"))
user = line("user", [{"type": "text", "text": "請修好那個 bug"}], "2026-09-10T12:00:00.000Z")
schema = line("user", [{"type": "tool_result", "content": [{"type": "text",
    "text": '<functions><function>{"description":"送推播","name":"PushNotification","parameters":{}}</function></functions>'}]}],
    "2026-09-10T12:00:01.000Z")
call = line("assistant", [{"type": "tool_use", "id": "toolu_1", "name": "PushNotification", "input": {"message": "完成"}}],
    "2026-09-10T12:00:02.000Z")
prose = line("assistant", [{"type": "text", "text": "我等一下會用 PushNotification 通知你。"}], "2026-09-10T12:00:02.500Z")
final = line("assistant", [{"type": "text", "text": long_text}], "2026-09-10T12:00:03.000Z")
cases = {"a": [user, call, final], "b": [user, final], "c": [user, schema, final], "d": [user, prose, final]}
for name, lines in cases.items():
    with open(os.path.join(work, name + ".jsonl"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
PY

run_case() {
  GOVERNANCE_PUSH_NOTIFICATION_AVAILABLE=1 \
  GOVERNANCE_SELF_PROVIDER=claude \
  GOVERNANCE_STATE_DIR="$WORK/state-$1" \
  CLAUDE_PROJECT_DIR="$(cd "$SCRIPT_DIR/../../../../.." && pwd)" \
  bash "$HOOK" <<< "{\"transcript_path\":\"$WORK/$1.jsonl\",\"hook_event_name\":\"Stop\"}" 2>&1 \
    | grep -c "PUSH-NOTIFICATION BLOCKER"
}

FAIL=0
check() { # $1=case $2=期望次數 $3=說明
  local got; got=$(run_case "$1")
  if [ "$got" = "$2" ]; then echo "  ✓ $3(BLOCKER $got)"; else echo "  ✗ $3:期望 $2、實得 $got"; FAIL=$((FAIL+1)); fi
}
echo "▶ M6 PushNotification gap:偵測「真的呼叫」而不是「字串出現」"
check a 0 "本 turn 真的呼叫過 → 安靜"
check b 1 "本 turn 沒呼叫 → 擋下"
check c 1 "只有工具 schema 提到字串(ToolSearch 回傳)→ 仍要擋(舊寫法會靜音)"
check d 1 "只有我自己在文字裡提到 → 仍要擋(舊寫法會靜音)"
[ "$FAIL" -eq 0 ] && echo "✅ test_stop_self_audit_push_gate: 4/4" || { echo "❌ test_stop_self_audit_push_gate: $FAIL 項未過"; exit 1; }

#!/bin/bash
# check_propose_without_benchmark.sh — M26 mechanical enforcement(2026-05-26 backfill per
# user verbatim「該程式化的都沒程式化」)。
#
# Purpose:UserPromptSubmit — 偵測 AI 在 next reply 將 propose visual/behavior decision
# (出現「建議」「方案 A/B」「propose」「應該改成」keyword)but 過去 ~20 turns 無 WebFetch / WebSearch
# tool call trace → inject soft BLOCKER 要求先 fetch ≥ 3 source 才 propose。
#
# 對齊 meta-patterns.md M26「Behavior/visual canonical decision 前必跑 WebFetch + WebSearch 取 ≥3
# source,不可憑印象 propose」+ propose-options/SKILL.md。
#
# 注意:本 hook 走 UserPromptSubmit(在 AI reply 前 inject context),
# ⚠️ fail-closed 設計約束(2026-07-07 治理進化方向 2 稽核結論):UserPromptSubmit 的 exit 2
# 擋的是 user 輸入本身 = 錯誤工具語義,本 hook **不可**升 exit 2。propose 家族的 fail-closed
# 端 = check_propose_pre_grep_verify.sh(M18 Q0 配對)+ stop_self_audit claim-verify 閘;
# 本 hook 職責 = 事前 P0 措辭 directive 注入(非 soft 建議)。
# 跟 check_propose_pre_grep_verify.sh(走 PostToolUse 偵測 propose 已成型後再警示)互補。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""' 2>/dev/null)

[ "$EVENT" != "UserPromptSubmit" ] && exit 0
[ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ] && exit 0

# Heuristic:user prompt 含 specific visual / behavior decision trigger keyword(2026-05-26 tighten — 拿掉「應該/是否/改成/design/behavior/互動」太籠統的 false-positive triggers)
PROPOSE_TRIGGER_RE='(propose me|give me options|列.{0,5}option|建議.{0,5}方案|建議.{0,5}做法|哪個比較|對齊哪家|比稿|要怎麼設計|該用哪個|design tradeoff|recommend|world-class.{0,10}(對照|比較))'
if ! echo "$PROMPT" | grep -qE "$PROPOSE_TRIGGER_RE"; then
  exit 0
fi

# Scan past ~20 turns(~400 lines)看是否有 WebFetch / WebSearch tool_use
RECENT=$(tail -400 "$TRANSCRIPT_PATH" 2>/dev/null)
HAS_FETCH=$(echo "$RECENT" | \
  jq -r 'select(.message.content != null) |
    .message.content // empty |
    if type == "array" then
      (.[]? | select(.type == "tool_use") | select(.name == "WebFetch" or .name == "WebSearch") | .name)
    else empty end' 2>/dev/null | wc -l)
HAS_FETCH=${HAS_FETCH:-0}

if [ "$HAS_FETCH" -ge 2 ]; then
  exit 0
fi

# P0-directive inject(exit 0 by design — 見檔頭 fail-closed 設計約束)
cat <<EOF
🚨 M26 Propose-without-benchmark gate(P0 directive — 未 fetch 就 propose = M26 違規,非建議)

→ User prompt 含 propose / visual / behavior decision trigger keyword,但過去 ~20 turns
  Web fetch / WebSearch tool_use count = $HAS_FETCH(< 2)。

M26 要求:visual / behavior canonical decision 前必跑 WebFetch + WebSearch 取 ≥ 3 source
  (Atlassian / Material / Polaris / Ant / Carbon / Apple HIG / shadcn / Radix),不可憑印象。

Pipeline(propose 前 inline 跑):
  1. WebFetch 3 家世界級 source
  2. 全 403 → WebSearch fallback 用 snippet,明示「search-only confidence」
  3. WebFetch + WebSearch 都失敗 → STOP propose,告知 user「無法 verify,要看 screenshot / 實機」

對應:meta-patterns.md M26 / propose-options/SKILL.md Step B-3。
EOF
exit 0

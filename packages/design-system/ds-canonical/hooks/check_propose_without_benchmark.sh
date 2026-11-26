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
# 擋的是 user 輸入本身 = 錯誤工具語義,本 hook **不可**升 exit 2。propose 家族會擋的一端在 Stop:
# check_propose_discipline.sh 的 r3_planning_doc_cite(M18 Q0 配對;2026-11-18 knowledge-prune H-M4 由原 PreToolUse 只警告、
# 永遠 exit 0 的那支併入並改成擋)—— 本輪寫進 planning / report / handoff 開頭目錄的 .md 有請 user 拍板的字眼卻沒有出處
# → exit 2,模型讀到後補出處或拿掉提案;同一支的 r2 管回覆裡「規定 / 必配」類斷言沒附出處。
# 本 hook 職責 = 事前 P0 措辭 directive 注入(非 soft 建議),與 r3 事後擋互補。
#
# ── 第二件事:問句 → 「先回一句,再開始查」(2026-11-21 PROC-H;process-audit 根因 8「處理悶頭查的問題」)──
# user 問了問題,模型先連跑一串工具才回第一句(11-18 14:35:05「確定所有時間都花得有意義?」問完 6 分半、10 次工具才回)。
# 這則 prompt 是問句 → 注入一行「先回一句,再開始查」。放在既有的 UserPromptSubmit hook 上,不另開一支、不另寫問句判斷:
# 判準是 scripts/lib/release-consent-language.mjs 的 isQuestionText(questionMarkers ∪ aNotAQuestions,release-workflow.json),
# 經命令列 `--question` 呼叫。不另外加 PreToolUse 提示(那會是第二份,process-audit 第 552 行)。
# 判準跑不起來(檔不在、node 失敗、輸出不是 question / statement)→ 照樣經 context 告訴模型「這次沒判斷」,不靜默。
# 已知看不到:沒有問句記號的問句(「大概還要多久」)。
# 事後那一半在 Stop 端:平台 silent_turn_reminder 之後下一筆若先跑工具,stop_self_audit.sh Mechanism 14 記一筆、下一回合注入。
#
# ── 第三件事:提到額度 → 交接常備與額度用法(2026-11-25;user「這個上一次就講過了…為何還要我一直講?」)──
# 正本 = governance/memory/feedback_orchestration_verify_before_scale.md「交接常備與額度」;這裡只注入一行指向它,不另寫規則。
# 判準(quota_prompt_hit):先以 QUOTA_SENTENCE_RE(。！？；!?;)與換行切句,句內再以 QUOTA_CLAUSE_RE(，,)切子句;
# 帶 QUOTA_EXCLUDE_RE 的子句(第三方免費額度,例「netlify 免費額度 1,000,000 次」不是 agent 的額度)整個不算,
# 同一句的其餘子句裡有 QUOTA_TOPIC_RE、也有 QUOTA_SIGNAL_RE(可以在不同子句,例「我的額度，還剩 21%」)才算。
# 逗號只拿來隔開排除詞,不拿來隔開額度字與訊號詞 —— 否則「我的額度，還剩 21%」會漏(2026-11-25 規格核對必修)。
# LC_ALL=C 逐位元組比字面(BSD / GNU awk 結果相同);多位元組字只放在 | 交替裡,ASCII 標點才放進 [] 字元集。
# 用 here-string 餵 awk,不用 printf | awk:pipefail 下大 prompt 若被提早讀完會吃 SIGPIPE 變成假陰性。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
EVENT=$(jq -r '.hook_event_name // ""' <<<"$INPUT" 2>/dev/null)
TRANSCRIPT_PATH=$(jq -r '.transcript_path // ""' <<<"$INPUT" 2>/dev/null)
PROMPT=$(jq -r '.prompt // ""' <<<"$INPUT" 2>/dev/null)

[ "$EVENT" != "UserPromptSubmit" ] && exit 0
CONTEXTS=""
add_context() { CONTEXTS="${CONTEXTS:+$CONTEXTS

}$1"; }

# ── 問句 → 先回一句 ─────────────────────────────────────────────────────────
# 路徑先解成實體路徑:CLI 用「argv[1] == 本檔」判斷要不要當命令列跑,路徑帶 .. 或 symlink 會讓它安靜不輸出。
QUESTION_LIB_DIR=$(cd "$(dirname "$0")/../../../../scripts/lib" 2>/dev/null && pwd -P)
QUESTION_CLI="${QUESTION_LIB_DIR:-/nonexistent}/release-consent-language.mjs"
if [ -n "$PROMPT" ]; then
  QUESTION_VERDICT=""
  if [ -f "$QUESTION_CLI" ]; then
    QUESTION_VERDICT=$(printf '%s' "$PROMPT" | node -- "$QUESTION_CLI" --question 2>/dev/null)
  fi
  case "$QUESTION_VERDICT" in
    question) add_context "這則 user 訊息是問句:先回一句,再開始查 —— 第一個動作是用一兩句話回應(答案、或要怎麼查),然後才呼叫工具。" ;;
    statement) ;;
    *) add_context "⚠️ 問句判斷這次沒有跑成(scripts/lib/release-consent-language.mjs --question 回「${QUESTION_VERDICT:-空}」);這則若是問句,一樣先回一句再開始查。" ;;
  esac
fi

# ── 額度 → 交接常備與額度用法(判準見檔頭「第三件事」)────────────────────────
QUOTA_TOPIC_RE='額度|quota'
QUOTA_SIGNAL_RE='[0-9] ?(%|％)|百分之|重置|reset|用完|用光|快沒|剩'
QUOTA_EXCLUDE_RE='netlify|vercel|github actions|免費'
QUOTA_SENTENCE_RE='。|！|？|；|[!?;]'
QUOTA_CLAUSE_RE='，|,'
quota_prompt_hit() {
  LC_ALL=C awk -v topic="$QUOTA_TOPIC_RE" -v signal="$QUOTA_SIGNAL_RE" -v exclude="$QUOTA_EXCLUDE_RE" \
    -v sentence_re="$QUOTA_SENTENCE_RE" -v clause_re="$QUOTA_CLAUSE_RE" '
    {
      gsub(sentence_re, "\n")
      ns = split($0, sentences, "\n")
      for (s = 1; s <= ns; s++) {
        gsub(clause_re, "\n", sentences[s])
        nc = split(sentences[s], parts, "\n")
        has_topic = 0; has_signal = 0
        for (i = 1; i <= nc; i++) {
          c = tolower(parts[i])
          if (c ~ exclude) continue
          if (c ~ topic) has_topic = 1
          if (c ~ signal) has_signal = 1
        }
        if (has_topic && has_signal) hit = 1
      }
    }
    END { exit (hit ? 0 : 1) }' <<<"$1"
}
if [ -n "$PROMPT" ] && quota_prompt_hit "$PROMPT"; then
  add_context "提到額度:照 governance/memory/feedback_orchestration_verify_before_scale.md「交接常備與額度」—— ① 交接常備:每包 / 合回點 / 長等待前更新任務總表與 NEXT-SESSION 交接(放 repo 的 tmp/ 與已推分支,不放 /tmp);② 照優先序把額度用到約剩 1–3%,不提早停、不囤,快重置還有剩就用完;③ 派工先寫預算,照 AGENTS.md「分診與預算」與 rules/work-process.md。"
fi

# ── M26:propose 前要先 fetch ────────────────────────────────────────────────
m26_context() {
if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  return 0
fi

# Heuristic:user prompt 含 specific visual / behavior decision trigger keyword(2026-05-26 tighten — 拿掉「應該/是否/改成/design/behavior/互動」太籠統的 false-positive triggers)
PROPOSE_TRIGGER_RE='(propose me|give me options|列.{0,5}option|建議.{0,5}方案|建議.{0,5}做法|哪個比較|對齊哪家|比稿|要怎麼設計|該用哪個|design tradeoff|recommend|world-class.{0,10}(對照|比較))'
if ! grep -qE "$PROPOSE_TRIGGER_RE" <<<"$PROMPT"; then
  return 0
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
  return 0
fi

# P0-directive inject(exit 0 by design — 見檔頭 fail-closed 設計約束)
MSG=$(cat <<EOF
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
)
add_context "$MSG"
}
m26_context

[ -n "$CONTEXTS" ] || exit 0
jq -n --arg ctx "$CONTEXTS" '{governanceContext:{hookEventName:"UserPromptSubmit",message:$ctx}}'
exit 0

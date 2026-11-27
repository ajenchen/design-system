#!/bin/bash
# Audit NO-SAMPLE strict enforcement(2026-05-17 P0 user-mandated):
#   /design-system-audit --deep dispatch sub-agent prompt 禁含 sample escape clause。
#   違 = BLOCKER 不允 dispatch。
#
# 背景:audit Dim 24/25/40-43/45/46/48 sub-agent 多次 sampled 不全掃 → user 抓「你他媽是不是又再搞抽樣」。
# 加 mechanical hook 攔截 dispatch prompt 含 sample escape keyword。
#
# PreToolUse(Agent)hook:讀 tool_input.prompt,grep escape keyword 命中 → exit 2 BLOCKER。
#
# Allow escape:dispatch prompt 加 `// @audit-sample-allow: <rationale>` 整 prompt 豁免(極罕見場景)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""')

# 2026-06-11 coverage expand(prune D2 抓盲區;expand never replace):Workflow 派發的 agents
# 原本完全繞過本防線(tool 名 ≠ Agent);Task 為舊名 alias 一併納入。
case "${TOOL:-}" in
  Agent|Task|Workflow) ;;
  *) exit 0 ;;
esac

# 2026-05-23 P0 升級 per user verbatim「幹你娘就叫你他媽所有稽核都要完整執行不要再抽樣,到底要講幾次?...把全部要稽核的東西都給我避免抽樣」:
# - PreToolUse:scan tool_input.prompt(dispatch prompt)阻 escape clause
# - PostToolUse:scan tool_response.content(sub-agent OUTPUT)阻 sub-agent 自報「I sampled / spot-check / representative」admission
case "${EVENT:-}" in
  PostToolUse)
    # Sub-agent OUTPUT scan — catch post-fact admission
    OUTPUT=$(echo "$INPUT" | jq -r '.tool_response.content // .tool_response // ""' 2>/dev/null)
    # Only fire on audit-related agent runs(by output keyword)
    if ! grep -qiE 'audit|Dim [0-9]+|D[0-9]+ CLEAN|DS-wide|sub-agent' <<<"$OUTPUT"; then exit 0; fi
    PROMPT="$OUTPUT" # reuse PROMPT var for downstream grep
    ;;
  *)
    # PreToolUse(default existing logic):scan dispatch prompt;
    # Workflow 的 agent prompts 在 .tool_input.script 內(2026-06-11 expand)
    PROMPT=$(echo "$INPUT" | jq -r '(.tool_input.prompt // "") + "\n" + (.tool_input.script // "")')
    ;;
esac

# ── 派工預算(2026-11-27;user 2026-11-26 問「這個其實是ds本來就有規範的工作流程吧？」)──────────────
# 規則正本 AGENTS.md「分診與預算」:「派工先寫預算(代理數/花費/牆鐘),用滿就停派、交付已完成的並回報。」
# 過去只有散文、零機械面(meta-patterns「同一條規則重犯 → 補機械強制面」)。這裡只做**非阻擋提醒**,不另建流程工具
#(work-process.md 第 7 點):同一 session 第一次派工時,runtime 狀態裡沒有「預算已寫」記號 → 提醒一次;
# 記號寫法 = 在派工 prompt 放一行「派工預算:代理 <N> 個、花費 <上限>、牆鐘 <分鐘>」(同一行要有 代理 / 花費 / 牆鐘 三項),
# 本 hook 看到就替這個 session 落記號(Git-owned runtime 狀態 dispatch-budget.jsonl,照 check_solo_workflow 的做法),之後靜默。
# 不同 session 各自記;沒有 adapter 給的 runtime root(直接探測)時寫不了記號 —— 照樣看本次 prompt 有沒有那一行。
# 提醒帶「品質前提」一句(2026-11-27;AGENTS.md「# 自主執行 canonical」第一段「品質是前提,其下才求快求省」,
# user 原話在 governance/memory/feedback_orchestration_verify_before_scale.md):預算是省重工的上限,不是砍規格與驗證的理由。
BUDGET_QUALITY_CLAUSE='預算用完就停派、交付已完成的,但規格項與驗證不得因省而略(品質是前提,其下才求快求省)。'
BUDGET_REMINDER=''
if [ "${EVENT:-}" != "PostToolUse" ]; then
  BUDGET_SESSION=$(jq -r '.session_id // empty' <<<"$INPUT" 2>/dev/null)
  BUDGET_FILE=''
  if command -v governance_enforcement_state_dir >/dev/null 2>&1; then
    BUDGET_DIR="$(governance_enforcement_state_dir 2>/dev/null)" || BUDGET_DIR=''
    [ -n "$BUDGET_DIR" ] && BUDGET_FILE="$(governance_runtime_file_path dispatch-budget.jsonl "$BUDGET_DIR" 2>/dev/null)" || true
  fi
  if grep -qE '派工預算.*代理.*花費.*牆鐘' <<<"$PROMPT"; then
    if [ -n "$BUDGET_SESSION" ] && command -v governance_append_enforcement_record >/dev/null 2>&1; then
      governance_append_enforcement_record dispatch-budget.jsonl \
        "$(jq -cn --arg s "$BUDGET_SESSION" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{session_id:$s,recorded_at:$t}')" || true
    fi
  elif [ -n "$BUDGET_SESSION" ] && [ -n "$BUDGET_FILE" ] && [ -f "$BUDGET_FILE" ] \
    && jq -e --arg s "$BUDGET_SESSION" 'select(.session_id == $s)' "$BUDGET_FILE" >/dev/null 2>&1; then
    :
  else
    # 規格是「同 session 第一次」才提醒(2026-11-27 規格核對必修 3:以前沒記號時每次派工都提醒)→ 提醒**真的送出**時
    # (allow_exit)替這個 session 落一筆 kind=reminded,之後同 session 靜默。算出提醒但這次被抽樣條款擋下(exit 2、
    # stdout 不送)不落記號,下一次派工照樣提醒(再驗 nonMust:以前在這裡就寫,第一次被擋 → 整個 session 再也看不到)。
    BUDGET_REMINDER='派工預算還沒寫(這個 session 第一次派工)。AGENTS.md「分診與預算」原文:「派工先寫預算(代理數/花費/牆鐘),用滿就停派、交付已完成的並回報。」要寫的三項:代理數、花費、牆鐘。寫法:在這一次或下一次派工的 prompt 放一行「派工預算:代理 <N> 個、花費 <上限>、牆鐘 <分鐘>」—— hook 看到這一行就替這個 session 落記號,之後不再提醒。'"$BUDGET_QUALITY_CLAUSE"'(非阻擋提醒,本次派工照常進行)'
  fi
fi
# 放行出口:有提醒就以 governance context 送出(stdout 只有這個 envelope;擋下時不送)
allow_exit() {
  if [ -n "$BUDGET_REMINDER" ]; then
    jq -cn --arg message "$BUDGET_REMINDER" '{governanceContext:{hookEventName:"PreToolUse",message:$message}}' \
      || { printf 'GOVERNANCE_INTEGRITY: dispatch budget reminder envelope encoding failed\n' >&2; exit 70; }
    # 提醒已送出 → 才落「已提醒」記號(功能狀態,與預算記號同一份 dispatch-budget.jsonl,不需遙測)。
    # 沒有 session_id 或寫不了 runtime 狀態時記不住 → 照舊每次提醒(寧可多提醒,不默默漏掉第一次)。
    if [ -n "${BUDGET_SESSION:-}" ] && command -v governance_append_enforcement_record >/dev/null 2>&1; then
      governance_append_enforcement_record dispatch-budget.jsonl \
        "$(jq -cn --arg s "$BUDGET_SESSION" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{session_id:$s,recorded_at:$t,kind:"reminded"}')" || true
    fi
  fi
  exit 0
}

# Allow escape(極罕見)
if grep -qE '@audit-sample-allow:' <<<"$PROMPT"; then
  allow_exit
fi

# Only enforce on audit-related dispatch(detect by prompt keyword)
if ! grep -qE 'audit|Dim [0-9]+|DS-wide|sub-agent|sweep' <<<"$PROMPT"; then
  allow_exit
fi

# Detect sample escape clause keyword
# 2026-05-23 M34 fix per user verbatim「抽樣幾百次了到底要怎樣才能百分百避免」+「我要你他媽所有稽核都不能抽樣」:
# 原 regex 太窄(narrow) 漏抓 my own dispatch keyword「Sample-based scan OK」+「cover 20+ random samples」+「too many components for exhaustive」。
# 升 grep -i case-insensitive + 廣 pattern coverage(spec wording「NO-SAMPLE」是 broad category)。
ESCAPE_HITS=$(echo "$PROMPT" | grep -oiE 'sample[ -]?based|sample-N|sample-only|sample evidence|sample top [0-9]+|sample[s]?[[:space:]]+(scan|OK|allowed|fine|enough|sufficient|recommended|sub|covering)|covering[[:space:]]+[0-9]+\+?[[:space:]]*sample|covers[[:space:]]+[0-9]+\+?[[:space:]]*sample|cover[[:space:]]+[0-9]+\+?[[:space:]]*(random[[:space:]]+)?sample|pick top [0-9]+|top hot|sampled[[:space:]]*(components|elements|files|Button|button|story|stories)|sample-?based|sampling[[:space:]]+(scan|approach|method)|heavy agent needed|full sweep deferred|defer.*heavy|cite.*heavy agent|exhaustive[[:space:]]+too[[:space:]]+(many|much)|too[[:space:]]+many[[:space:]]+for[[:space:]]+exhaustive|random[[:space:]]+sample|skip[[:space:]]+rest|skip[[:space:]]+remaining|spot[[:space:]]*[-]?[[:space:]]*check(ed|ing)?|spot[[:space:]]*sample|representative[[:space:]]+(sample|subset)|i[[:space:]]+sampled|only[[:space:]]+sampled|sampled[[:space:]]+only|sample[[:space:]]+sized?|sub-agent[[:space:]]+self-judg|self-judgment[[:space:]]+per[[:space:]]+Dim|AI[[:space:]]+judgment[[:space:]]+per[[:space:]]+Dim|sample-based[[:space:]]+AI[[:space:]]+judgment|sampled[[:space:]]+(Button|button|first|few|several)' | sort -u)

if [ -n "$ESCAPE_HITS" ]; then
  printf '🚨 AUDIT NO-SAMPLE ESCAPE CLAUSE BLOCKER(audit canonical 2026-05-17 user-mandated):\n' >&2
  printf '   Dispatch prompt 含 sample escape clause:\n' >&2
  echo "$ESCAPE_HITS" | while IFS= read -r hit; do
    printf '   • "%s"\n' "$hit" >&2
  done
  printf '\n  Per AGENTS.md `# 稽核 canonical` + canonical design-system-audit/SKILL.md Phase 1 NO-SAMPLE invariant:\n' >&2
  printf '  禁含「sample / top N / heavy agent needed / full sweep deferred」escape clause。\n' >&2
  printf '  每 dim 必 DS-wide ALL components 全掃,context 不夠拆 stage 分批,**不 sample**。\n' >&2
  printf '\n  修方向:從 prompt 移除 escape clause,改寫「拆 N-stage(每 stage 10-15 元件)所有 stages 必跑完」。\n' >&2
  printf '  Escape(極罕見): prompt 加 // @audit-sample-allow: <rationale>\n' >&2
  exit 2
fi

allow_exit

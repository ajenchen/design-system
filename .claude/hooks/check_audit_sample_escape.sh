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
    if ! echo "$OUTPUT" | grep -qiE 'audit|Dim [0-9]+|D[0-9]+ CLEAN|DS-wide|sub-agent'; then exit 0; fi
    PROMPT="$OUTPUT" # reuse PROMPT var for downstream grep
    ;;
  *)
    # PreToolUse(default existing logic):scan dispatch prompt;
    # Workflow 的 agent prompts 在 .tool_input.script 內(2026-06-11 expand)
    PROMPT=$(echo "$INPUT" | jq -r '(.tool_input.prompt // "") + "\n" + (.tool_input.script // "")')
    ;;
esac

# Allow escape(極罕見)
if echo "$PROMPT" | grep -qE '@audit-sample-allow:'; then
  exit 0
fi

# Only enforce on audit-related dispatch(detect by prompt keyword)
if ! echo "$PROMPT" | grep -qE 'audit|Dim [0-9]+|DS-wide|sub-agent|sweep'; then
  exit 0
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
  printf '\n  Per CLAUDE.md `# 稽核 canonical` + design-system-audit/SKILL.md Phase 1 NO-SAMPLE invariant:\n' >&2
  printf '  禁含「sample / top N / heavy agent needed / full sweep deferred」escape clause。\n' >&2
  printf '  每 dim 必 DS-wide ALL components 全掃,context 不夠拆 stage 分批,**不 sample**。\n' >&2
  printf '\n  修方向:從 prompt 移除 escape clause,改寫「拆 N-stage(每 stage 10-15 元件)所有 stages 必跑完」。\n' >&2
  printf '  Escape(極罕見): prompt 加 // @audit-sample-allow: <rationale>\n' >&2
  exit 2
fi

exit 0

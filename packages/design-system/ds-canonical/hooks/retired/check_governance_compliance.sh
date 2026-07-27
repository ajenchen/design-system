#!/bin/bash
# PreToolUse Write: 任何治理檔(新 skill / hook / CLAUDE.md 章節)寫入前,
# 強制 AI 跑 governance compliance self-check — 防 M7 violation 再次發生。
#
# 根源:AI 設計新 skill/hook/rule 時常忘 cross-check 既有 meta-pattern
# + 2-home canonical(spec/tsx)+ Rule-of-3 + audit-vs-execute 分權,
# 導致後續需要 refactor(見 2026-04-24 `/knowledge-prune` 錯搬 canonical 事件)。
#
# 本 hook 在 Write 時注入強制 self-check prompt,AI 必逐條答。
# 非 blocking(只注入 context),但 AI 必在 response 裡提出 audit 結果。

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only fire for new governance files
[ -z "$FILE_PATH" ] && exit 0
[ "$TOOL_NAME" != "Write" ] && exit 0

# File path scope
case "$FILE_PATH" in
  */CLAUDE.md)                          SCOPE="CLAUDE.md section/rule" ;;
  */.claude/skills/*/SKILL.md)          SCOPE="new skill" ;;
  */.claude/skills/*/references/*.md)   SCOPE="skill reference doc" ;;
  */.claude/hooks/*.sh|*/.claude/hooks/*.py)  SCOPE="new hook" ;;
  */governance/planning/*.md)              SCOPE="planning doc" ;;
  *) exit 0 ;;
esac

# Only fire for NEW files(Write 新檔;既存 edit 不注入,減噪音)
[ -f "$FILE_PATH" ] && exit 0

MSG=$(cat <<EOF
🛡️ Governance compliance self-check(${SCOPE})— 寫入前必回答以下 7 題,答不過停下重設計:

1. M7 cross-check:本規則 / skill / hook 跟既有 Meta-Pattern M1-M17 有牴觸 / 漏用嗎?特別 M10(proactive exhaustive scan)/ M14(AUTO integrate pipeline)/ M17(SSOT 必可傳播)— 有受影響嗎?

2. 2-Home canonical(spec.md = 不可程式化 judgment / tsx = 可程式化):本規則會把 canonical judgment 推到 references/ 嗎?若是違反 2-home,該留 spec/tsx。

3. Rule-of-3:本規則概念已在 ≥ 3 處出現?若是,選 SSOT 其他 pointer only。

4. Audit-vs-execute 分權:動到 canonical substantive meaning 嗎?若是,走 STOP 提議不 AUTO。

5. 既有 SSOT 整合(對齊 CLAUDE.md SSOT 消費 canonical):本規則該 cross-link 到哪個現有 spec / hook / skill?

6. hook / skill 重複偵測:.claude/hooks/ 跟 .claude/skills/ 有既存類似功能嗎?若是擴充既有,而非新建。

7. Phase F Self-improvement capture:本 skill 若是 audit 類,Phase F 有無 Self-improvement capture step?

規則:在 response 明確列出 7 題答案(可簡短)。有任一題 fail → 停下重設計不寫入。通過才寫。
EOF
)

ESCAPED=$(printf '%s' "$MSG" | jq -Rs .)
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":%s}}\n' "$ESCAPED"
exit 0

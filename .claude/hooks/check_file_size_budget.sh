#!/bin/bash
set -uo pipefail
# PreToolUse Edit/Write: enforce per-file line budgets for governance files.
#
# Budgets (from CLAUDE.md # 資訊治理 canonical):
#   CLAUDE.md        ≤ 400 lines  (loaded every turn — must stay tight)
#   spec.md          ≤ 300 lines  (per-component / per-pattern)
#   SKILL.md         ≤ 250 lines  (references/ can extend — keep SKILL tight)
#   memory file      ≤ 100 lines  (cross-session memory — keep tight)
#
# Transition period (2026-04-24 → 2026-07-24): CLAUDE.md soft cap 800 (not hard block)
# while /knowledge-prune reduces from current 1225.
#
# Non-blocking: injects warning via hookSpecificOutput additionalContext; Claude
# decides whether to split or ack. Hard block would paralyse edits to legitimately
# large canonical specs (e.g. item-anatomy ~900 lines) — require explicit override.

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[ -z "$FILE_PATH" ] && exit 0
[ -f "$FILE_PATH" ] || exit 0

# Only check governance files
# CLAUDE.md L34 SSOT: target ≤ 200(Anthropic best-practice)/ transition ≤ 400 / hard cap 800
# 本 hook 在 transition 觸發 P1 warning,hard cap 觸發 P0 block
case "$FILE_PATH" in
  */CLAUDE.md)                          BUDGET=400;  TRANSITION=800; LABEL="CLAUDE.md" ;;  # warn at transition (400), block at hard cap (800); target 200
  */memory/*.md)                        BUDGET=100;  TRANSITION=100; LABEL="memory file" ;;
  # Super-foundational SSOT spec(item-anatomy = Family 1+2 跨 10+ 消費者 SSOT,唯一例外)
  */item-anatomy.spec.md)
    BUDGET=800;  TRANSITION=1200; LABEL="super-foundational SSOT spec.md(item-anatomy 例外)" ;;
  # Foundational SSOT specs(2026-04-24 升 cap 800 — spec 內部有 rationale section)
  */color.spec.md|*/sidebar.spec.md|*/tree-view.spec.md)
    BUDGET=500;  TRANSITION=800; LABEL="foundational SSOT spec.md" ;;
  *.spec.md)                            BUDGET=300;  TRANSITION=500; LABEL="spec.md" ;;
  *.claude/skills/*/SKILL.md)           BUDGET=250;  TRANSITION=400; LABEL="SKILL.md" ;;
  *) exit 0 ;;
esac

LINES=$(wc -l < "$FILE_PATH" | tr -d ' ')
[ "$LINES" -le "$BUDGET" ] && exit 0

# Over budget — warn. Hard-block only if also over transition cap.
if [ "$LINES" -gt "$TRANSITION" ]; then
  MSG="⛔ ${LABEL} at ${FILE_PATH} is ${LINES} lines (hard cap ${TRANSITION}). Must reduce before adding. Run /knowledge-prune or identify which section to remove."
else
  MSG="⚠️ ${LABEL} at ${FILE_PATH} is ${LINES} lines (budget ${BUDGET}, transition cap ${TRANSITION}). Prefer consolidating over appending. What can you remove/merge to make room?"
fi

ESCAPED=$(printf '%s' "$MSG" | jq -Rs .)
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":%s}}\n' "$ESCAPED"
exit 0

#!/bin/bash
set -uo pipefail
# PreToolUse Edit/Write: enforce per-file line budgets for governance files.
#
# Budgets — SSOT 是 shared instruction entry `# 治理 canonical` 「行數預算」段。
# Provider/instruction/skill 路徑由 canonical registry 解析,不以任一 generated home 當 authority。
#
# Non-blocking: emits a provider-neutral governance context warning; the adapter
# transports it to the active model. Hard block would paralyse edits to legitimately
# large canonical specs (e.g. item-anatomy ~900 lines) — require explicit override.

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_provider_paths.sh" 2>/dev/null || {
  printf 'file-size hook blocked: canonical provider resolver unavailable\n' >&2
  exit 2
}

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[ -z "$FILE_PATH" ] && exit 0
[ -f "$FILE_PATH" ] || exit 0
REL_PATH="$(governance_project_relative_path "$FILE_PATH" 2>/dev/null)" || exit 0
INSTRUCTION_ENTRY="$(governance_provider_string_field instructionEntry 2>/dev/null)" || exit 2
SHARED_INSTRUCTION_ENTRY="$(governance_provider_string_field sharedInstructionEntry 2>/dev/null)" || exit 2
CANONICAL_SKILL_ROOT="$(governance_canonical_relative_root skills 2>/dev/null)" || exit 2
PROVIDER_SKILL_ROOT="$(governance_provider_string_field skillDirectory 2>/dev/null)" || exit 2
SKILL_ENTRY_FILE="$(governance_provider_skill_entry_file 2>/dev/null || true)"

# Only check governance files
# Shared bootstrap SSOT: target ≤ 250 / transition ≤ 400 / hard cap 800
# 本 hook 在 transition 觸發 P1 warning,hard cap 觸發 P0 block
case "$REL_PATH" in
  "$INSTRUCTION_ENTRY"|"$SHARED_INSTRUCTION_ENTRY") BUDGET=400; TRANSITION=800; LABEL="instruction entry" ;;
  governance/memory/*.md)               BUDGET=100;  TRANSITION=100; LABEL="memory file" ;;
  # Super-foundational SSOT spec(item-anatomy = Family 1+2 跨 10+ 消費者 SSOT,唯一例外)
  */item-anatomy.spec.md)
    BUDGET=800;  TRANSITION=1200; LABEL="super-foundational SSOT spec.md(item-anatomy 例外)" ;;
  # Foundational SSOT specs(2026-04-24 升 cap 800 — spec 內部有 rationale section)
  # 2026-05-18 加 data-table:DS 最複雜 composite + 跨家族 anchor(L1-L4 完整 grid taxonomy,
  # 行對齊 item-anatomy / 浮層對齊 overlay-surface / state 對齊 field-controls)。
  # frontmatter 已標 `foundational_ssot: true`。
  # 2026-05-22 prune:color.spec.md 升 tier 2 cap 1000(per shared bootstrap「foundational ≤ 800-1200」+ /knowledge-prune Lens 1+2 verdict — 218-line semantic 不可拆 + nested theme + Atlassian rationale 集中一處)。
  */color.spec.md)
    BUDGET=800;  TRANSITION=1000; LABEL="foundational SSOT spec.md(color tier 2 cap 1000)" ;;
  */sidebar.spec.md|*/tree-view.spec.md|*/data-table.spec.md)
    BUDGET=500;  TRANSITION=800; LABEL="foundational SSOT spec.md" ;;
  *.spec.md)                            BUDGET=300;  TRANSITION=500; LABEL="spec.md" ;;
  *)
    if governance_path_is_under "$REL_PATH" "$CANONICAL_SKILL_ROOT" \
      && [ "${REL_PATH##*/}" = "SKILL.md" ]; then
      BUDGET=250; TRANSITION=400; LABEL="canonical SKILL.md"
    elif [ -n "$SKILL_ENTRY_FILE" ] \
      && governance_path_is_under "$REL_PATH" "$PROVIDER_SKILL_ROOT" \
      && [ "${REL_PATH##*/}" = "$SKILL_ENTRY_FILE" ]; then
      BUDGET=250; TRANSITION=400; LABEL="provider skill entry($SKILL_ENTRY_FILE)"
    else
      exit 0
    fi
    ;;
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
printf '{"governanceContext":{"hookEventName":"PreToolUse","message":%s}}\n' "$ESCAPED"
exit 0

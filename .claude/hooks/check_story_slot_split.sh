#!/bin/bash
# PreToolUse hook for Edit/Write *.stories.tsx —
# Block 反 pattern slot split 違規(同 slot rule 不該拆兩 story)。
#
# 對齊 CLAUDE.md「Manual story 拆分原則」(Polaris / Carbon / Storybook 官方):
#   - 同 slot rule 用 Controls 切,不另開 story(WithStartIcon + WithEndIcon → WithIcon)
#   - 不同 affordance 必分(IconOnly / FullWidth)
#   - Compound 有 new constraint 才分(overlayBadge 必 iconOnly)
#
# 只擋顯著反 pattern。Allowlist 為 // @story-split-rationale: <reason> 在檔首。

# Per-hook fire logging
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

# Only on stories.tsx(skip anatomy / principles)
case "$FILE_PATH" in
  *.stories.tsx)
    case "$FILE_PATH" in
      *anatomy.stories.tsx|*principles.stories.tsx) exit 0 ;;
    esac
    ;;
  *) exit 0 ;;
esac

# Get content — strategy:
# - Write:tool_input.content = 整個 new file → 直接 check
# - Edit:tool_input.new_string = 引入的新字串。若 new_string 不含 violation,認為 edit 不引入新違規(可能是 fix)
# - MultiEdit:concat all edits.new_string
# 不 concat on-disk(避免 fix 移除既有 violation 時 hook 假陽性 block)
NEW_CONTENT=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")

FULL="$NEW_CONTENT"

# Allowlist:檔首 // @story-split-rationale: <reason> 豁免(check on-disk + incoming)
FIRST_LINES=$(printf '%s\n' "$FULL" | sed -n '1,5p')
if [ -f "$FILE_PATH" ]; then
  DISK_FIRST=$(sed -n '1,5p' "$FILE_PATH" 2>/dev/null || true)
  if echo "$DISK_FIRST" | grep -qE '//[[:space:]]*@story-split-rationale:'; then
    exit 0
  fi
fi
if echo "$FIRST_LINES" | grep -qE '//[[:space:]]*@story-split-rationale:'; then
  exit 0
fi

VIOLATIONS=""

# Anti-pattern 1: WithStartIcon + WithEndIcon 同檔(同 slot rule,該合 WithIcon)
HAS_START=$(echo "$FULL" | grep -cE 'export const WithStartIcon\b' || true)
HAS_END=$(echo "$FULL" | grep -cE 'export const WithEndIcon\b' || true)
if [ "$HAS_START" -gt 0 ] && [ "$HAS_END" -gt 0 ]; then
  VIOLATIONS="${VIOLATIONS}
[反 pattern] WithStartIcon + WithEndIcon 拆兩 story
  Slot rule 同源(都是 LucideIcon prop slot)→ 合併為 WithIcon(start/end 對照 grid)
  對齊 Polaris pattern:用單一 \`icon\` prop + Controls 切換,不另開 story
  豁免:檔首加 // @story-split-rationale: <理由>"
fi

# Anti-pattern 2: 同 stories file 出現 Default + AllVariants 兩個對照 grid(冗餘)
HAS_DEFAULT=$(echo "$FULL" | grep -cE 'export const Default\b' || true)
HAS_ALL_VAR=$(echo "$FULL" | grep -cE 'export const AllVariants\b' || true)
if [ "$HAS_DEFAULT" -gt 0 ] && [ "$HAS_ALL_VAR" -gt 0 ]; then
  VIOLATIONS="${VIOLATIONS}
[反 pattern] Default + AllVariants 同檔
  AllVariants 對照 grid 已含 default — 第二個 Default story 重複
  保留 AllVariants(對照更高密度),刪 Default
  豁免:檔首加 // @story-split-rationale: <理由>"
fi

# Anti-pattern 3: 同 stories file 出現 ≥2 個 Variants 拆細(分開的 variant 各一 story)
# e.g. Primary / Secondary / Tertiary 三 stories vs 一個 AllVariants
PRIM=$(echo "$FULL" | grep -cE 'export const (Primary|Secondary|Tertiary)\b' || true)
if [ "$PRIM" -ge 2 ]; then
  VIOLATIONS="${VIOLATIONS}
[反 pattern] 多個 variant stories 拆細(Primary / Secondary / Tertiary 各一)
  對齊 Polaris / Carbon:variants 用 AllVariants 對照 grid,Controls 切換
  合併為 AllVariants
  豁免:檔首加 // @story-split-rationale: <理由>"
fi

# Emit block on violations
if [ -n "$VIOLATIONS" ]; then
  {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════"
    echo "║ check_story_slot_split — Manual story 拆分原則違規"
    echo "╚════════════════════════════════════════════════════════════════"
    printf '%s\n' "$VIOLATIONS"
    echo ""
    echo "────────────────────────────────"
    echo "SSOT canonical: CLAUDE.md「Manual story 拆分原則」"
    echo "Workflow: /story-writing skill Phase 0/1(rule-mapping)"
  } >&2
  exit 2
fi

exit 0

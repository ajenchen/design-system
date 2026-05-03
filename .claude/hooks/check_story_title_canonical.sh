#!/bin/bash
# PreToolUse hook:阻止 stories 加 non-canonical English-only `name:` 字段。
#
# Bug 史(2026-05-03):
#   我加 OpenSnapshot:Range popover / HoverState:Range middle hover ring 等英文 subtitle
#   違反 DS canonical(展示 stories 應為 純中文 OR Prefix:中文)。User 截圖抓到。
#
# 機械化規則:
#   `.stories.tsx` 內 `name:` 字段值 包含 colon 且 colon-after 完全沒中文字 → flag(P1)
#   純英文無 colon 也 flag,除非屬常見白名單(Default / Display 等)
#
# 允許 escape:
#   檔頭加 `// @story-name-canonical-allow: <reason>` 整檔豁免

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

case "$FILE_PATH" in
  *.stories.tsx) ;;
  *) exit 0 ;;
esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")

[ -z "${NEW_CONTENT//[[:space:]]/}" ] && exit 0

# Allowlist
FIRST_LINES=$(printf '%s\n' "$NEW_CONTENT" | sed -n '1,5p')
if echo "$FIRST_LINES" | grep -q '@story-name-canonical-allow:'; then
  exit 0
fi
if [ -f "$FILE_PATH" ]; then
  ON_DISK_FIRST=$(sed -n '1,5p' "$FILE_PATH" 2>/dev/null || true)
  if echo "$ON_DISK_FIRST" | grep -q '@story-name-canonical-allow:'; then
    exit 0
  fi
fi

# Common English whitelist(stories framework canonical or pre-existing names)
WHITELIST_REGEX='^(Default|Display|Anatomy|Overview|Inspector|ColorMatrix|SizeMatrix|StateBehavior|Accessibility|All[A-Z][a-z]+|Loading|Empty|Disabled|Error|Hover|Focus|Active|Pressed|FocusVisible)$'

# Extract added/changed `name:` values, check for English-only subtitle
VIOLATIONS=$(printf '%s' "$NEW_CONTENT" | grep -oE "name:[[:space:]]*['\"][^'\"]*['\"]" | sed -E "s/name:[[:space:]]*['\"]([^'\"]*)['\"]/\1/" | while IFS= read -r name; do
  [ -z "$name" ] && continue
  # If contains Chinese char anywhere → OK
  if echo "$name" | LC_ALL=C grep -qE '[^\x00-\x7F]'; then
    continue
  fi
  # No Chinese: check whitelist
  if echo "$name" | grep -qE "$WHITELIST_REGEX"; then
    continue
  fi
  # Non-whitelist English-only → flag
  echo "  - \"$name\""
done)

if [ -n "$VIOLATIONS" ]; then
  cat >&2 <<EOF

┄┄┄┄ check_story_title_canonical — non-canonical English story name ┄┄┄┄

[P1 WARN] ${FILE_PATH}
偵測到 \`name:\` 字段 純英文無中文(且非白名單):
${VIOLATIONS}
DS canonical(2026-05-03 user audit):展示 stories \`name\` 字段應為:
  - 純中文(基本用法 / 三種模式 / 可清除 / 尺寸 / 錯誤狀態)
  - OR Prefix:中文(Range:訂房 / showTime:會議排程 / showTime Range:活動時段)
  - **禁止**純英文(OpenSnapshot:Range popover / HoverState:Range middle hover ring)

合理白名單(framework / canonical):
  Default / Display / Overview / Inspector / ColorMatrix / SizeMatrix /
  StateBehavior / Accessibility / All\${Variants/Sizes/Modes} / Loading / Empty / Disabled / Error / Hover / Focus / Active / Pressed / FocusVisible

整檔豁免:檔頭加 \`// @story-name-canonical-allow: <reason>\`
EOF
  exit 1
fi

exit 0

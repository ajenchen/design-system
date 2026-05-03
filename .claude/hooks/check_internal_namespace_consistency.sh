#!/bin/bash
# PreToolUse hook:阻止 sibling stories 檔的 title namespace(Components/ XOR Internal/)不一致。
#
# Bug 史(2026-05-02):
#   SelectionControl 的 selection-item.principles.stories.tsx 標 `Design System/Components/`,
#   但 sibling .stories.tsx + .anatomy.stories.tsx 標 `Design System/Internal/`。
#   結果 Storybook 側欄出現「孤兒 Components/SelectionControl/設計原則」,user audit 才抓到。
#
# 機械化規則:
#   同 component 資料夾下的 3 個 stories 檔(showcase / anatomy / principles)
#   `title:` namespace(Components 或 Internal)必須一致。
#
# 對應 CLAUDE.md「Internal vs Components 3-test」:
#   1. 元件單獨 render 有預設視覺 context?
#   2. 直接寫 `<X>` 有視覺?
#   3. 所有消費者都包 wrapper?
#   傾向 Internal → 全 3 個 stories 改 `Internal/`(這是 lint,不替你決定方向)。

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

# Aggregate new content (Write content / Edit new_string / MultiEdit edits[].new_string)
NEW_CONTENT=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")

# Extract NEW namespace from edited content
NEW_NS=$(printf '%s' "$NEW_CONTENT" | grep -oE "title:[[:space:]]*['\"]Design System/(Components|Internal)/" | head -1 | grep -oE "(Components|Internal)" || true)

# If edit doesn't set title (e.g., changing a story unrelated to title), use on-disk title as truth
if [ -z "$NEW_NS" ] && [ -f "$FILE_PATH" ]; then
  NEW_NS=$(grep -oE "title:[[:space:]]*['\"]Design System/(Components|Internal)/" "$FILE_PATH" 2>/dev/null | head -1 | grep -oE "(Components|Internal)" || true)
fi

# If still no NS detected, skip(file might not be top-level component story)
[ -z "$NEW_NS" ] && exit 0

# Find sibling stories in same folder
DIR=$(dirname "$FILE_PATH")
INCONSISTENT=""
while IFS= read -r SIB; do
  [ "$SIB" = "$FILE_PATH" ] && continue
  [ -f "$SIB" ] || continue
  SIB_NS=$(grep -oE "title:[[:space:]]*['\"]Design System/(Components|Internal)/" "$SIB" 2>/dev/null | head -1 | grep -oE "(Components|Internal)" || true)
  if [ -n "$SIB_NS" ] && [ "$SIB_NS" != "$NEW_NS" ]; then
    INCONSISTENT="${INCONSISTENT}  - ${SIB} → ${SIB_NS}"$'\n'
  fi
done < <(find "$DIR" -maxdepth 1 -name '*.stories.tsx' 2>/dev/null)

if [ -n "$INCONSISTENT" ]; then
  cat >&2 <<EOF

┄┄┄┄ check_internal_namespace_consistency — sibling stories namespace 不一致 ┄┄┄┄

[P0 BLOCK] ${FILE_PATH} → ${NEW_NS}
Sibling stories 不一致:
${INCONSISTENT}
3 stories 檔(展示 / 設計規格 / 設計原則)的 title namespace 必須**全 Components/ 或全 Internal/**。

歷史 bug:SelectionControl 2026-05-02 → principles 在 Components/,其他在 Internal/ →
Storybook 側欄孤兒 entry,user audit 才抓到。

決策:
  - 跑 CLAUDE.md「Internal vs Components 3-test」(預設視覺 / 直接 render / consumer wrapper)
  - 傾向 Internal → 把全 3 檔改 Internal/
  - 傾向 Components → 全改 Components/
EOF
  exit 2
fi

exit 0

#!/bin/bash
set -uo pipefail
# PreToolUse hook: 阻止 app-code import L3 internal primitives from
# `@/design-system/patterns/element-anatomy/item-anatomy`.
#
# Motivation (CLAUDE.md `# Primitive Exposure Layer`):
#   L3 primitives(ItemContent / ItemInlineAction / RowSizeProvider /
#   ItemInlineActionButton / ItemPrefix / ItemSuffix / ItemAvatar / ItemIcon /
#   ItemLabel / itemPrefixAlignVariants / ICON_SIZE / AVATAR_SIZE /
#   ROW_PADDING_BY_SIZE / useRowSize)是「給建新 host 的 DS 作者用的 internal
#   building blocks」,不是給 app code / consumer 用的。
#
#   App code 想要 inline action 視覺一致性 → 走 host slot API:
#     (a) `<Input endAction={...} />` / `<TreeItem inlineActions={...} />`(90% case)
#     (b) `<Input endSlot={...} />` / `<TreeItem inlineActionsSlot={...} />`(10% escape hatch)
#     (c) `<Button iconOnly variant="text" />`
#
# 允許 path:
#   src/design-system/components/**, src/design-system/patterns/** — DS 內部 host 自由用 L3
#
# 阻止 path:
#   src/app/**, src/features/**, src/pages/**, src/explorations/** — app/feature/exploration
#   code 一律走 host slot API。
#
# Allowlist:
#   //  @l3-import-allow: <reason>(整檔豁免,需 spec rationale)
#
# Exit codes:
#   exit 2 — 阻止(P0 block,canonical 違反)
#   exit 0 — pass

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

# 只檢查 .ts / .tsx
case "$FILE_PATH" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# Skip:DS 內部檔案(L3 home / host primitives 自由 import)
case "$FILE_PATH" in
  */src/design-system/components/*|*/src/design-system/patterns/*) exit 0 ;;
esac

# Skip:DS root layer(tokens / hooks / lib utility)— 不需 row primitive
case "$FILE_PATH" in
  */src/design-system/tokens/*|*/src/design-system/hooks/*) exit 0 ;;
esac

# Skip:vite / config / story 全域(extremely rare,本次先全 block 再個別放行)
# (no skip — keep strict)

NEW_CONTENT=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")

if [ -z "${NEW_CONTENT//[[:space:]]/}" ]; then
  exit 0
fi

# File-level allowlist(`@l3-import-allow:` in first 5 lines of new content OR existing file)
FIRST_LINES=$(printf '%s\n' "$NEW_CONTENT" | sed -n '1,5p')
if echo "$FIRST_LINES" | grep -qE '//[[:space:]]*@l3-import-allow:'; then
  exit 0
fi
if [ -f "$FILE_PATH" ]; then
  ON_DISK_FIRST=$(sed -n '1,5p' "$FILE_PATH" 2>/dev/null || true)
  if echo "$ON_DISK_FIRST" | grep -qE '//[[:space:]]*@l3-import-allow:'; then
    exit 0
  fi
fi

# 偵測 L3 primitive import
# Pattern:from '...patterns/element-anatomy/item-anatomy' (任意 quote / 任意 path prefix)
L3_IMPORT_PATTERN='from\s+["'"'"'][^"'"'"']*patterns/element-anatomy/item-anatomy["'"'"']'

if printf '%s\n' "$NEW_CONTENT" | grep -qE "$L3_IMPORT_PATTERN"; then
  MATCHED_LINE=$(printf '%s\n' "$NEW_CONTENT" | grep -nE "$L3_IMPORT_PATTERN" | head -1)
  cat >&2 <<EOF

┄┄┄┄ check_l3_primitive_import — L3 internal primitive 不可 app-code import ┄┄┄┄

[P0 BLOCK] ${FILE_PATH}
  > ${MATCHED_LINE}

L3 internal primitives(\`ItemInlineAction\` / \`ItemContent\` / \`RowSizeProvider\` 等)
是「給建新 host 元件的 DS 作者」用的 building block,不是 app code / consumer 用的。

修法(擇一):
  (a) 90% case 走 host config API:
      <Input endAction={{ icon: X, label: '清除', onClick: ... }} />
      <TreeItem inlineActions={[{ icon: ..., label: '...', onClick: ... }]} />
  (b) 10% case 走 host slot escape hatch:
      <Input endSlot={<MyCustomTrigger />} />
      <TreeItem inlineActionsSlot={<MyActionGroup />} />
  (c) 獨立 button(非 inline):
      <Button iconOnly variant="text" startIcon={X} />

刻意 import L3(極罕見、需 spec rationale):
  在檔首加 // @l3-import-allow: <reason + spec.md anchor>

SSOT: CLAUDE.md \`# Primitive Exposure Layer\` 三層分類
      patterns/element-anatomy/inline-action.spec.md「Escape hatch」節
EOF
  exit 2
fi

exit 0

#!/bin/bash
set -uo pipefail
# PreToolUse Edit/Write: Select All ordering SSOT drift guard(2026-05-16 user verbatim
# 「以後遇到此類設計都有相同邏輯不會偏移」)
#
# 攔截 packages/design-system/src/** edit 時,如果新內容含「Select All」 / 「checkAll」 / 「全選」 等 bulk-select
# 動作 + 自寫 ordering logic(`onValueChange?.(options.map(...))` / `[...prev, ...]` 等),
# 要求消費 `@/design-system/lib/multi-select-ordering` SSOT primitive 而非自刻。
#
# 規則 SSOT:`packages/design-system/src/lib/multi-select-ordering.ts`(applySelectAll / clearSelection)。
# 對應 Ant Transfer + Table rowSelection canonical(Layer A + Codex M31 Round 4 共識)。
#
# Soft warn(stderr,non-blocking)— 給開發者警示但不擋 ship。Edge case 真需自刻 → 在
# new content 加 `// @select-all-canonical-allow: <reason>` allowlist escape。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // empty')

[ -z "$FILE_PATH" ] && exit 0
[[ "$TOOL" != "Edit" && "$TOOL" != "Write" ]] && exit 0
[[ "$FILE_PATH" != *packages/design-system/src/* ]] && exit 0
# 本 SSOT primitive 檔自己不查
[[ "$FILE_PATH" == *multi-select-ordering.ts ]] && exit 0
# Allowlist
grep -q "@select-all-canonical-allow" <<<"$NEW_CONTENT" && exit 0

# Detect Select-All-like pattern:
#   - function name contains SelectAll / CheckAll
#   - `[...prev`-style append with `options.map`-style source values
#   - 顯式「全部」 button click → onValueChange
HAS_SELECTALL_HANDLER=$(echo "$NEW_CONTENT" | grep -cE "(handleSelectAll|onSelectAll|onCheckAll|handleCheckAll|全選|checkAll\s*=|selectAll\s*=)" || true)

if [ "$HAS_SELECTALL_HANDLER" -gt 0 ]; then
  USES_SSOT=$(echo "$NEW_CONTENT" | grep -cE "(applySelectAll|multi-select-ordering)" || true)
  if [ "$USES_SSOT" -eq 0 ]; then
    cat >&2 <<EOF
⚠️  Select All ordering SSOT drift warning
File: $FILE_PATH

偵測「Select All」/「checkAll」/「全選」 handler 但無 import \`applySelectAll\` from
\`@/design-system/lib/multi-select-ordering\`。

SSOT canonical(per Ant Transfer + Table rowSelection,Layer A + Codex M31 Round 4 共識):
  preserve existing user click order + append unselected options in source order(dedup)
  → \`applySelectAll(selectedValues, allOptionValues)\`

若刻意自刻 → 加 \`// @select-all-canonical-allow: <reason>\` 在 new content 中。
EOF
  fi
fi

exit 0

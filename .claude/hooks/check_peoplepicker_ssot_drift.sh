#!/bin/bash
set -uo pipefail
# PostToolUse Edit/Write: PeoplePicker SSOT drift guard(2026-05-15 user verbatim「避免下次再度偏移」)
#
# 攔截:`people-picker.tsx` / `person-display.tsx` / `combobox.tsx` 動以下 PeoplePicker SSOT-bearing
# code 路徑時,要求 commit message / new content 包含 cite 對應 spec.md SSOT table row 的 marker。
#
# 規則 SSOT:`packages/design-system/src/components/PeoplePicker/people-picker.spec.md` §A-§F canonical table
# (Trigger display SSOT canonical table)。
#
# 警告(non-blocking):新內容含「動 SSOT-bearing API」但無 spec 引用 → stderr 警告,要求自查對應 row。
# Hard block 場景不適用(spec 偏移由 user 決定走 RFC 或直接修)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // empty')

[ -z "$FILE_PATH" ] && exit 0

# Only check Edit/Write on PeoplePicker SSOT-bearing files
case "$FILE_PATH" in
  */PeoplePicker/people-picker.tsx|*/PeoplePicker/person-display.tsx|*/Combobox/combobox.tsx) ;;
  *) exit 0 ;;
esac

# Patterns that touch SSOT-bearing render logic
SSOT_KEYWORDS='tagRenderer|overflowShape|tagWrapperClassName|selectedItemRenderer|MultiPersonDisplay|PersonAvatarTag|PersonDisplay|searchIn|searchPlaceholder|placeholder=\\{'

if grep -qE "$SSOT_KEYWORDS" <<<"$NEW_CONTENT"; then
  # Check if new content cites spec.md SSOT table
  if ! grep -qE "(spec\\.md.*(§[A-F]|canonical table|Trigger display SSOT)|people-picker\\.spec\\.md.*L9[0-9])" <<<"$NEW_CONTENT"; then
    MSG="⚠️ PeoplePicker SSOT-bearing edit detected at ${FILE_PATH}

動到 (tagRenderer / overflowShape / tagWrapperClassName / placeholder logic / MultiPersonDisplay 等) — 這些是 PeoplePicker SSOT-bearing API,不是 Combobox / Select 純繼承。

必先 cite \`people-picker.spec.md\` §A-§F canonical table 對應 row,確認改動跟 SSOT 一致。違反 = 元件視覺漂移(2026-05-15 user verbatim「為什麼辯論之後會完全被 codex 帶走」+ 「避免下次再度偏移」)。

對應 SSOT row 速查:
  §A 元件本質繼承表 - 動繼承關係 / 視覺自定義 → 此處
  §B 單人 trigger 5 state - 動 single mode render → 此處
  §C 多人 length=1 trigger 3 state - 動 length=1 降階單人視覺 → 此處
  §D 多人 length≥2 trigger 4 state - 動 stack overlap / +N 圓形 / inline-search cursor → 此處
  §E 共享 SSOT - 動 avatar inset 12px / PersonDisplay / placeholder ellipsis → 此處
  §F Cell-edit ↔ Field-edit 一致性 - 動 cell-registry MultiPersonCell / form PeoplePicker → 此處"

    ESCAPED=$(printf '%s' "$MSG" | jq -Rs .)
    printf '{"governanceContext":{"hookEventName":"PostToolUse","message":%s}}\n' "$ESCAPED"
  fi
fi

exit 0

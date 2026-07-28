#!/bin/bash
# check_item_list_gap.sh — M16 mechanical enforcement(2026-05-26 backfill).
#
# Purpose:PreToolUse Edit/Write — 偵測 production tsx 含 standalone card/pill 渲染
# pattern(`<FileItem>` / `<MenuItem rich>` / 卡片型 standalone)without gap-N or space-y-N
# parent → soft warn requires explicit gap canonical per item-anatomy.spec.md。
#
# 3 條公式(per M16):
#   - 同類 standalone 卡片 → 必 gap
#   - 同類 permanent flush(連續貼齊)→ 0 gap OK,但必 codify in spec
#   - 混合語言 → 必取最保守 gap

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)
NEW=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""' 2>/dev/null)

[ "$EVENT" != "PreToolUse" ] && exit 0
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
case "$FILE_PATH" in *.tsx) ;; *) exit 0 ;; esac
case "$FILE_PATH" in *.stories.tsx|*.test.tsx) exit 0 ;; esac

# Heuristic:multiple <FileItem> / <MenuItem variant="rich"> / standalone card pattern + parent 無 gap-N
# 2026-05-26 fix:grep -c 計行數不計次,用 -o count 真實 occurrence
STANDALONE_RE='<(FileItem|MenuItem[^>]+variant=["'\'']rich["'\''])'
COUNT=$(echo "$NEW" | grep -oE "$STANDALONE_RE" 2>/dev/null | wc -l | tr -d ' ')
COUNT=${COUNT:-0}

[ "$COUNT" -lt 2 ] && exit 0

# Has gap-N or space-y-N near the standalone pattern?
if grep -qE '(gap-[0-9]|space-y-[0-9])' <<<"$NEW"; then
  exit 0
fi

MESSAGE=$(cat <<EOF
⚠️ M16 Item-list gap canonical

→ 偵測到 $COUNT 個 standalone item(FileItem / MenuItem rich)未見 gap-N / space-y-N parent class。

M16 要求(per item-anatomy.spec.md):
  - 同類 standalone → 必 gap(常見 gap-2 / gap-3)
  - 同類 permanent flush(連續貼齊)→ 0 gap OK,但必 spec codify
  - 混合語言 → 必取最保守 gap

修法:parent container 加 \`gap-2\` / \`space-y-2\` 或 codify 連續貼齊 in 元件 spec。
對應 canonical:meta-patterns.md M16 + patterns/element-anatomy/item-anatomy.spec.md。
EOF
)
printf '{"governanceContext":{"hookEventName":"PreToolUse","message":%s}}\n' "$(printf '%s' "$MESSAGE" | jq -Rs .)"

exit 0

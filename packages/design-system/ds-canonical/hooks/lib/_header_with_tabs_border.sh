#!/bin/bash
# Header canonical W1 Border ownership enforcement(per header-canonical.spec.md「tabsSlot 連動」W1):
#   Header 帶 Tabs 只有一條路 = 該 header 自己的 `tabsSlot` prop(給了就撤自身 border-b,線由 TabsList 畫)。
#   `<Tabs>` / `<TabsList>` / `<TabsTrigger>` 出現在 header 的 tabsSlot 以外(JSX children、`children=` 或其他屬性)
#   → header 照樣自畫 border-b + TabsList 自己的 border-b = 雙線 → 擋,修法「改用 tabsSlot」。
#   (2026-11-16 起;之前是「含 Tabs 必標 withTabs 布林」,withTabs 已移除 —— props-naming.md「相容政策」。)
#
# PreToolUse(Edit / Write/MultiEdit)hook 使用 runner 驗證的完整 after-image，
# 以 TypeScript AST 做 per-instance + nested Header boundary 判斷:每個 Header / XxxHeader / UI.Header
# 各自判;只認**那個 header 自己** opening 上的 tabsSlot 屬性,別的元素上叫 tabsSlot 的屬性、變數名、註解都不算。
#
# Allow escape:檔頭 leading line comment
# `// @header-tabs-slot-allow: <nonempty rationale>` 整檔豁免。

source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

fail_integrity() {
  printf '🚨 GOVERNANCE_INTEGRITY: HEADER + TABS TABSSLOT ENFORCEMENT FAILURE: %s\n' "$1" >&2
  exit 70
}

INPUT=$(cat) || fail_integrity '無法讀取 hook input'
if ! printf '%s' "$INPUT" | jq -e '
  type == "object"
  and (.tool_name | type == "string")
  and (.tool_input | type == "object")
  and (.tool_input.file_path | type == "string")
' >/dev/null 2>&1; then
  fail_integrity 'hook input 不是有效的 provider-neutral event'
fi

TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name')
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path')

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

case "${FILE_PATH:-}" in
  packages/design-system/src/*.tsx|packages/design-system/src/**/*.tsx|*/packages/design-system/src/*.tsx|*/packages/design-system/src/**/*.tsx) ;;
  *) exit 0 ;;
esac

# Skip stories
case "${FILE_PATH:-}" in
  *.stories.tsx|*.anatomy.stories.tsx|*.principles.stories.tsx) exit 0 ;;
esac

if [ "${GOVERNANCE_WRITE_STATE_TRUST:-}" != 'runner-v1' ]; then
  fail_integrity '受管轄的 Header mutation 缺少 runner-v1 proposed state'
fi
if ! printf '%s' "$INPUT" | jq -e '
  .tool_input.governance_write_state as $state
  | ($state | type == "object")
    and ($state.schemaVersion == 1)
    and ($state.path | type == "string" and length > 0)
    and (
      ($state.kind == "text" and ($state.content | type == "string"))
      or ($state.kind == "deleted" and ($state | has("content") | not))
    )
' >/dev/null 2>&1; then
  fail_integrity 'trusted proposed write state 缺失或 malformed'
fi

STATE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.governance_write_state.path')
STATE_KIND=$(printf '%s' "$INPUT" | jq -r '.tool_input.governance_write_state.kind')
if [[ "$FILE_PATH" != "$STATE_PATH" && "$FILE_PATH" != */"$STATE_PATH" ]]; then
  fail_integrity 'trusted proposed write state 與 hook target 不相符'
fi
[ "$STATE_KIND" = 'deleted' ] && exit 0
FULL_CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input.governance_write_state.content')

# TypeScript AST per-instance enforcement：每個含 Tabs descendant 的 Header,Tabs 只准出現在
# 它自己 opening 的 `tabsSlot={…}` 裡。comments、變數名稱、別的元素上的 tabsSlot 屬性、
# 已移除的 withTabs 布林與另一個合規 instance 都不可當 decoy。
NODE_PROJECT_ROOT="${GOVERNANCE_PROJECT_DIR:-}"
if [ -z "$NODE_PROJECT_ROOT" ]; then
  NODE_PROJECT_ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null) \
    || fail_integrity '無法定位 TypeScript parser project root'
fi
if ! JSX_COUNTS=$(
  cd "$NODE_PROJECT_ROOT" \
    && printf '%s' "$FULL_CONTENT" \
      | node -- "$(dirname "$0")/tsx-governance-analysis.mjs" \
          header-with-tabs-border 2>/dev/null
); then
  fail_integrity 'TypeScript TSX parser unavailable or proposed content malformed'
fi

if [ "$JSX_COUNTS" = 'ESCAPE' ]; then exit 0; fi
IFS='|' read -r APPLICABLE_HEADERS VIOLATING_HEADERS <<<"$JSX_COUNTS"
case "$APPLICABLE_HEADERS|$VIOLATING_HEADERS" in
  *[!0-9\|]*|'') fail_integrity 'TypeScript TSX analyzer output malformed' ;;
esac

if [ "$VIOLATING_HEADERS" -gt 0 ]; then
  printf '🚨 HEADER + TABS TABSSLOT BLOCKER(header-canonical.spec.md「tabsSlot 連動」W1):\n' >&2
  printf '   File: %s\n' "$FILE_PATH" >&2
  printf '   %s 個含 Tabs 的 header instance 中有 %s 個把 Tabs 放在 tabsSlot 以外(children 等)。\n' "$APPLICABLE_HEADERS" "$VIOLATING_HEADERS" >&2
  printf '   Header 自己的 `border-b` + TabsList 的 `border-b border-divider` 會雙線。\n' >&2
  printf '\n  SSOT: patterns/header-canonical/header-canonical.spec.md「tabsSlot 連動」W1\n' >&2
  printf '  修方向: 改用 tabsSlot —— <ChromeHeader tabsSlot={<TabsList>…</TabsList>}> 或 <DialogHeader tabsSlot={…}>(TabsContent 放 header 外)\n' >&2
  printf '  Escape: 檔頭加 // @header-tabs-slot-allow: <rationale>\n' >&2
  exit 2
fi

exit 0

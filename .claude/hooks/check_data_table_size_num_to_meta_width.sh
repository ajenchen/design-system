#!/bin/bash
set -uo pipefail
# DataTable column width API M19 程式化 hook(2026-05-06 v14.3):
#   偵測 DataTable column def 寫 root `size: NUMBER`(TanStack 慣例,跟 DS `size: 'sm'|'md'|'lg'`
#   density 命名衝突)→ 提醒改 `meta: { width: NUMBER }`(DS canonical)。
#
#   詳見 data-table.spec.md「六之二、Column 寬度 API」。Back-compat 保留 root size,所以是
#   soft warning(non-blocking)而非 hard block。
#
# 觸發條件:
#   - 編 *.tsx file(consumer + DataTable stories)
#   - 內含 `accessor` / `accessorKey` 或 `createColumnHelper` reference(DataTable column def)
#   - 同檔行內含 `size: NUMBER`(注意非 'sm'/'md'/'lg')

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

case "$FILE_PATH" in
  *.tsx) ;;
  *) exit 0 ;;
esac
# Skip DataTable internal source(本身用 ColumnDef API)
case "$FILE_PATH" in
  */data-table.tsx|*/cell-registry.tsx|*/column-types.ts) exit 0 ;;
esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""')

# 必含 column def signature
if ! echo "$NEW_CONTENT" | grep -qE "accessor[Key]?|createColumnHelper"; then
  exit 0
fi

# 偵測 root size: NUMBER pattern(排除 'sm'/'md'/'lg' 跟 'xs')
# Pattern: `size: <number>` 不在 quote 內
HITS=$(echo "$NEW_CONTENT" | grep -nE "size:\s*[0-9]+" | grep -v "size:\s*['\"]" || true)

if [ -n "$HITS" ]; then
  cat >&2 <<EOF

⚠️  DataTable column def 用 root \`size: NUMBER\`(TanStack 慣例)。

   DS canonical 走 \`meta.width\`(2026-05-06 v14.3)避開跟 \`size: 'sm'|'md'|'lg'\`
   density 命名衝突(M23 violation 修)。

   修法:
     before: { accessorKey: 'name', size: 240, meta: { type: 'string' } }
     after:  { accessorKey: 'name', meta: { type: 'string', width: 240 } }

   Back-compat:root \`size\` 仍 work(internal pre-process),但新 code 一律走 meta.width。

   命中 lines(file: $FILE_PATH):
$(echo "$HITS" | sed 's/^/     /')

   詳 data-table.spec.md「六之二、Column 寬度 API」。
EOF
fi

exit 0

#!/bin/bash
# check_data_table_size_num_to_meta_width.sh — M23(c) mechanical enforcement(2026-05-26 backfill).
#
# Purpose:PreToolUse Edit/Write — 偵測 DataTable column 定義使用 TanStack `size: <number>`
# (px width)而非 DS canonical `meta: { width: 'sm'|'md'|'lg' }` density-aware token。
# 違反 M23(c) framework prop name namespace conflict(TanStack `size` 是 px 數字,
# DS `size` 是 density variant)→ soft warn 要求 wrap-and-rename。
#
# 對齊 meta-patterns.md M23(c) + data-table.spec.md L?「Column width canonical」段。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)
NEW=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""' 2>/dev/null)

[ "$EVENT" != "PreToolUse" ] && exit 0
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
case "$FILE_PATH" in *.tsx|*.ts) ;; *) exit 0 ;; esac
case "$FILE_PATH" in *.stories.tsx|*.test.*) exit 0 ;; esac

# DataTable 上下文:column 定義 OR DataTable import OR ColumnDef 型別
HAS_DATATABLE_CTX=0
if echo "$NEW" | grep -qE '(ColumnDef|columns:|DataTable|@tanstack/react-table)'; then
  HAS_DATATABLE_CTX=1
fi

[ "$HAS_DATATABLE_CTX" = "0" ] && exit 0

# Detect raw size: <number> in column def(TanStack 用法)
RAW_SIZE_HITS=$(echo "$NEW" | grep -cE '\bsize:\s*[0-9]+' 2>/dev/null)
RAW_SIZE_HITS=${RAW_SIZE_HITS:-0}

[ "$RAW_SIZE_HITS" -eq 0 ] && exit 0

# 若同時用 meta: { width 也 OK(混用允許 transition)
if echo "$NEW" | grep -qE 'meta:\s*\{[^}]*width'; then
  # mixed — let it pass(transition state)
  exit 0
fi

REL=${FILE_PATH#*/my-project/}

cat >&2 <<EOF
⚠️ M23(c) framework prop namespace conflict — DataTable column \`size: <number>\`

📁 File: $REL
🔍 偵測:$RAW_SIZE_HITS 個 \`size: <number>\` (TanStack px API)在 ColumnDef 上下文,但無 \`meta: { width: 'sm'|'md'|'lg' }\` DS density-aware variant。

M23(c)要求:
  - TanStack \`size\` prop = px 數字(framework spec)
  - DS \`size\` prop = density variant 'sm'|'md'|'lg'(DS spec)
  - 同名不同義 → wrap-and-rename:DataTable column 用 \`meta.width: 'sm'|'md'|'lg'\`,DS internal 再 map 成 TanStack \`size\` px

修法:
  // ❌ Avoid
  { accessorKey: 'name', size: 280 }

  // ✅ Use DS density-aware
  { accessorKey: 'name', meta: { width: 'md' } }

對應 canonical:meta-patterns.md M23(c) + components/DataTable/data-table.spec.md「Column width SSOT」。
EOF

exit 0

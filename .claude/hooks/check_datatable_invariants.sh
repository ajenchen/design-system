#!/bin/bash
# check_datatable_invariants.sh — DataTable invariants multi-rule
#
# 2026-06-11 prune merge:r2 = 原 check_data_table_size_num_to_meta_width.sh
# (TanStack size:number → meta.width wrap,M23(c) anchor;規則逐字搬入)。
# 原檔 → .claude/hooks/retired/2026-06-11-prune-merge/

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")

r1_datatable_invariants() {
set -uo pipefail

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

NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""')

# ── B.1 row drag getRowId(P2 stderr)─────────────────────────────────────────
# Skip DataTable internal source(本身 implement enableRowDrag)
case "$FILE_PATH" in
  */data-table.tsx|*/data-table.spec.md) ;; # skip B.1 + B.2 internal
  *)
    if echo "$NEW_CONTENT" | grep -q "enableRowDrag"; then
      EXISTING=""
      [ -f "$FILE_PATH" ] && EXISTING=$(cat "$FILE_PATH" 2>/dev/null || echo "")
      COMBINED="$EXISTING
$NEW_CONTENT"
      if ! echo "$COMBINED" | grep -q "getRowId"; then
        cat >&2 <<EOF

┄┄┄ B.1 check_datatable_invariants — row drag getRowId WARN ┄┄┄

[P2] ${FILE_PATH}
使用 enableRowDrag 但 file 內無 getRowId — dnd 會退化用 row.index 導致 reorder 錯位。
詳 data-table.spec.md「L4 Row drag 必填 getRowId」段。

EOF
      fi
    fi
    ;;
esac

# ── B.2 column size NUMBER → meta.width(P2 stderr)────────────────────────────
case "$FILE_PATH" in
  */data-table.tsx|*/cell-registry.tsx|*/column-types.ts) ;; # skip DS internal
  *)
    if echo "$NEW_CONTENT" | grep -qE "accessor[Key]?|createColumnHelper"; then
      HITS=$(echo "$NEW_CONTENT" | grep -nE "size:\s*[0-9]+" | grep -v "size:\s*['\"]" || true)
      if [ -n "$HITS" ]; then
        cat >&2 <<EOF

┄┄┄ B.2 check_datatable_invariants — column size NUMBER WARN ┄┄┄

[P2] ${FILE_PATH}
DataTable column def 用 root \`size: NUMBER\`(TanStack 慣例)。
DS canonical 走 \`meta.width\`(2026-05-06 v14.3,M23 命名衝突修)。

修法:
  before: { accessorKey: 'name', size: 240, meta: { type: 'string' } }
  after:  { accessorKey: 'name', meta: { type: 'string', width: 240 } }

命中 lines:
$(echo "$HITS" | sed 's/^/  /')

詳 data-table.spec.md「六之二、Column 寬度 API」。

EOF
      fi
    fi
    ;;
esac

# ── B.3 filter↔sort sibling sync reminder(P2 reminder)────────────────────────
case "$FILE_PATH" in
  *data-table-filter-panel.tsx)
    cat >&2 <<EOF

┄┄┄ B.3 check_datatable_invariants — sibling sync reminder ┄┄┄

[P2] 動到 filter panel → 是否需要對應修 data-table-sort-manager.tsx?
Self-check:row gap / row layout / row meta button / chrome corner action /
empty state 行為 / CTA button variant — sort row 是否同步?

EOF
    ;;
  *data-table-sort-manager.tsx)
    cat >&2 <<EOF

┄┄┄ B.3 check_datatable_invariants — sibling sync reminder ┄┄┄

[P2] 動到 sort manager → 是否需要對應修 data-table-filter-panel.tsx?
Self-check:row gap / row layout / row meta button / chrome corner action /
empty state 行為 / CTA button variant — filter row 是否同步?

EOF
    ;;
esac

exit 0
}

r2_size_num_to_meta_width() {
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
}

for _rule in r1_datatable_invariants r2_size_num_to_meta_width; do
  echo "$INPUT" | "$_rule"
  _rc=$?
  if [ "$_rc" -eq 2 ]; then exit 2; fi
done
exit 0

#!/bin/bash
# check_datatable_invariants.sh — DataTable invariants multi-rule
#
# 2026-06-11 prune merge:r2 = 原 check_data_table_size_num_to_meta_width.sh
# (TanStack size:number → meta.width wrap,M23(c) anchor;規則逐字搬入)。
# 原檔 → packages/design-system/ds-canonical/hooks/retired/2026-06-11-prune-merge/

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

_HOOK_CONTEXT_EVENT="PreToolUse"
_HOOK_CAPTURE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/check-datatable-invariants.XXXXXX") || {
  printf '🚨 GOVERNANCE_INTEGRITY: DATATABLE INVARIANTS FAILURE: output capture unavailable\n' >&2
  exit 70
}
_HOOK_STDOUT_CAPTURE="$_HOOK_CAPTURE_DIR/stdout"
_HOOK_STDERR_CAPTURE="$_HOOK_CAPTURE_DIR/stderr"
exec 3>&1 4>&2
exec >"$_HOOK_STDOUT_CAPTURE" 2>"$_HOOK_STDERR_CAPTURE"

_finalize_hook_output() {
  _hook_rc=$?
  trap - EXIT
  exec 1>&3 2>&4
  _hook_stdout=$(cat "$_HOOK_STDOUT_CAPTURE" 2>/dev/null || true)
  _hook_stderr=$(cat "$_HOOK_STDERR_CAPTURE" 2>/dev/null || true)
  rm -rf -- "$_HOOK_CAPTURE_DIR" 2>/dev/null || true

  case "$_hook_rc" in
    0)
      if [ -n "$_hook_stderr" ]; then
        printf '🚨 GOVERNANCE_INTEGRITY: DATATABLE INVARIANTS FAILURE: rc0 child output included raw stderr\n' >&2
        exit 70
      fi
      [ -z "$_hook_stdout" ] && exit 0
      _encoded_warning=$(jq -cn \
        --arg event "$_HOOK_CONTEXT_EVENT" \
        --arg message "$_hook_stdout" \
        '{governanceContext:{hookEventName:$event,message:$message}}') || {
        printf '🚨 GOVERNANCE_INTEGRITY: DATATABLE INVARIANTS FAILURE: warning envelope encoding failed\n' >&2
        exit 70
      }
      printf '%s\n' "$_encoded_warning"
      exit 0
      ;;
    2)
      if [ -z "$_hook_stdout" ] && [ -n "$_hook_stderr" ] \
        && ! grep -qF 'GOVERNANCE_INTEGRITY:' <<<"$_hook_stderr"; then
        printf '%s\n' "$_hook_stderr" >&2
        exit 2
      fi
      printf '🚨 GOVERNANCE_INTEGRITY: DATATABLE INVARIANTS FAILURE: rc2 必須是 stderr-only nonempty policy blocker\n' >&2
      exit 70
      ;;
    70)
      if [ -z "$_hook_stdout" ] && [ -n "$_hook_stderr" ] \
        && grep -qF 'GOVERNANCE_INTEGRITY:' <<<"$_hook_stderr"; then
        printf '%s\n' "$_hook_stderr" >&2
      else
        printf '🚨 GOVERNANCE_INTEGRITY: DATATABLE INVARIANTS FAILURE: rc70 必須是 stderr-only marker\n' >&2
      fi
      exit 70
      ;;
    *)
      printf '🚨 GOVERNANCE_INTEGRITY: DATATABLE INVARIANTS FAILURE: undefined exit code %s\n' "$_hook_rc" >&2
      exit 70
      ;;
  esac
}
trap _finalize_hook_output EXIT

INPUT=$(cat 2>/dev/null) || {
  printf '🚨 GOVERNANCE_INTEGRITY: DATATABLE INVARIANTS FAILURE: 無法讀取 canonical input\n' >&2
  exit 70
}
if ! printf '%s' "$INPUT" | jq -e 'type == "object"' >/dev/null 2>&1; then
  printf '🚨 GOVERNANCE_INTEGRITY: DATATABLE INVARIANTS FAILURE: invalid input envelope\n' >&2
  exit 70
fi

r1_datatable_invariants() {
set -uo pipefail

INPUT=$(cat)
TOOL=$(jq -r '.tool_name // ""' <<<"$INPUT")
FILE_PATH=$(jq -r '.tool_input.file_path // ""' <<<"$INPUT")

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

case "$FILE_PATH" in
  *.tsx) ;;
  *) exit 0 ;;
esac

NEW_CONTENT=$(jq -r '.tool_input.content // .tool_input.new_string // ""' <<<"$INPUT")

# ── B.1 row drag getRowId(P2 context)────────────────────────────────────────
# Skip DataTable internal source(本身 implement enableRowDrag)
case "$FILE_PATH" in
  */data-table.tsx|*/data-table.spec.md) ;; # skip B.1 + B.2 internal
  *)
    if grep -q "enableRowDrag" <<<"$NEW_CONTENT"; then
      EXISTING=""
      [ -f "$FILE_PATH" ] && EXISTING=$(cat "$FILE_PATH" 2>/dev/null || echo "")
      COMBINED="$EXISTING
$NEW_CONTENT"
      if ! grep -q "getRowId" <<<"$COMBINED"; then
        cat <<EOF

┄┄┄ B.1 check_datatable_invariants — row drag getRowId WARN ┄┄┄

[P2] ${FILE_PATH}
使用 enableRowDrag 但 file 內無 getRowId — dnd 會退化用 row.index 導致 reorder 錯位。
詳 data-table.spec.md「L4 Row drag 必填 getRowId」段。

EOF
      fi
    fi
    ;;
esac

# ── B.2 column size NUMBER → meta.width(P2 context)───────────────────────────
case "$FILE_PATH" in
  */data-table.tsx|*/cell-registry.tsx|*/column-types.ts) ;; # skip DS internal
  *)
    if grep -qE "accessor[Key]?|createColumnHelper" <<<"$NEW_CONTENT"; then
      HITS=$(grep -nE "size:\s*[0-9]+" <<<"$NEW_CONTENT" | grep -v "size:\s*['\"]" || true)
      if [ -n "$HITS" ]; then
        cat <<EOF

┄┄┄ B.2 check_datatable_invariants — column size NUMBER WARN ┄┄┄

[P2] ${FILE_PATH}
DataTable column def 用 root \`size: NUMBER\`(TanStack 慣例)。
DS canonical 走 \`meta.width\`(2026-05-06 v14.3,M23 命名衝突修)。

修法:
  before: { accessorKey: 'name', size: 240, meta: { type: 'string' } }
  after:  { accessorKey: 'name', meta: { type: 'string', width: 240 } }

命中 lines:
$(printf '%s\n' "$HITS" | sed 's/^/  /')

詳 data-table.spec.md「六之二、Column 寬度 API」。

EOF
      fi
    fi
    ;;
esac

# ── B.3 filter↔sort sibling sync reminder(P2 reminder)────────────────────────
# 2026-07-14 拆檔對齊:filter row/group renderer 移居 data-table-filter-group.tsx(@internal),
# row-layout 類 sync 關注點跟著搬 → 兩檔皆觸發 filter 側 reminder(M7 hook regex 對齊 file layout)。
case "$FILE_PATH" in
  *data-table-filter-panel.tsx|*data-table-filter-group.tsx)
    cat <<EOF

┄┄┄ B.3 check_datatable_invariants — sibling sync reminder ┄┄┄

[P2] 動到 filter panel(或其 row/group renderer)→ 是否需要對應修 data-table-sort-manager.tsx?
Self-check:row gap / row layout / row meta button / chrome corner action /
empty state 行為 / CTA button variant — sort row 是否同步?

EOF
    ;;
  *data-table-sort-manager.tsx)
    cat <<EOF

┄┄┄ B.3 check_datatable_invariants — sibling sync reminder ┄┄┄

[P2] 動到 sort manager → 是否需要對應修 data-table-filter-panel.tsx(row renderer 在
data-table-filter-group.tsx)?
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
TOOL=$(jq -r '.tool_name // ""' <<<"$INPUT" 2>/dev/null)
FILE_PATH=$(jq -r '.tool_input.file_path // ""' <<<"$INPUT" 2>/dev/null)
EVENT=$(jq -r '.hook_event_name // ""' <<<"$INPUT" 2>/dev/null)
NEW=$(jq -r '.tool_input.content // .tool_input.new_string // ""' <<<"$INPUT" 2>/dev/null)

[ "$EVENT" != "PreToolUse" ] && exit 0
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
case "$FILE_PATH" in *.tsx|*.ts) ;; *) exit 0 ;; esac
case "$FILE_PATH" in *.stories.tsx|*.test.*) exit 0 ;; esac

# DataTable 上下文:column 定義 OR DataTable import OR ColumnDef 型別
HAS_DATATABLE_CTX=0
if grep -qE '(ColumnDef|columns:|DataTable|@tanstack/react-table)' <<<"$NEW"; then
  HAS_DATATABLE_CTX=1
fi

[ "$HAS_DATATABLE_CTX" = "0" ] && exit 0

# Detect raw size: <number> in column def(TanStack 用法)
RAW_SIZE_HITS=$(grep -cE '\bsize:\s*[0-9]+' <<<"$NEW" 2>/dev/null)
RAW_SIZE_HITS=${RAW_SIZE_HITS:-0}

[ "$RAW_SIZE_HITS" -eq 0 ] && exit 0

# 若同時用 meta: { width 也 OK(混用允許 transition)
if grep -qE 'meta:\s*\{[^}]*width' <<<"$NEW"; then
  # mixed — let it pass(transition state)
  exit 0
fi

REL=${FILE_PATH#*/my-project/}

cat <<EOF
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
  printf '%s' "$INPUT" | "$_rule"
  _rc=$?
  case "$_rc" in
    0) ;;
    2) exit 2 ;;
    70) exit 70 ;;
    *)
      printf '🚨 GOVERNANCE_INTEGRITY: DATATABLE INVARIANTS FAILURE: rule %s 回傳未定義 exit code %s\n' \
        "$_rule" "$_rc" >&2
      exit 70
      ;;
  esac
done
exit 0

#!/bin/bash
# 執法等級:擋(只看這次新增的行)+ 逐行豁免 —— 規則寫在 SSOT primitive 檔頭、用 regex 判得出來;全樹既有命中 > 0,所以只判新增行(WP-14,2026-11-21)。
#
# post_edit_contract_dispatcher.sh 的子規則(原 check_select_all_canonical.sh,只提醒、outputMode diagnostic)。
# 規則住處:packages/design-system/src/lib/multi-select-ordering.ts —— 「全部選取」之後值的順序只有一個住所
#   `applySelectAll(既有選取, 全部可選值)`(既有選取保留原順序、其餘依來源順序接在後面、去重)與 `clearSelection()`;
#   之後任何「全部選取」都要用它,不各自重寫排序。
# 判定(新增行的定義只有一份:lib/_added_lines.sh;本檔不自己取新增行):
#   範圍 = packages/design-system/src 底下的程式檔(.ts / .tsx / .js / .jsx / .mjs),multi-select-ordering.ts 自己除外。
#   命中 = 寫完的檔裡、不是整行註解的程式行有
#     (1) 全選 handler 的名字:handleSelectAll / onSelectAll / onCheckAll / handleCheckAll / `checkAll =` / `selectAll =`,或
#     (2) 同一行同時有「全選」二字與事件屬性 `on…={`(例:`<button onClick={() => setSelected(all)}>全選</button>`)。
#   寫完的檔的程式行有呼叫 `applySelectAll(` → 這支檔的全選走 SSOT,不算命中。
#   命中落在這次新增的行 → 擋(exit 2);落在既有的行 → 不擋,只列成既有(governanceContext),交 /design-system-audit Dim 17 / 32。
# 豁免:命中那一行或上一行寫 `// @select-all-canonical-allow: <理由>`(冒號後要有理由;原 hook 的豁免字樣,改成逐行)。
#
# 搬進來時判定改了三處(收窄 = 少擋;對照格見 tests/test_post_edit_contract_dispatcher.sh 的 S-* 格):
#   - 範圍從 src 底下任何檔改成只看程式檔;「全選」二字從「出現在任何地方」改成「跟事件屬性同一行、且不在整行註解裡」。
#     2026-11-21 全樹唯讀重播(每支檔當成整檔寫入,a05da20a)舊判定命中 43 支檔,幾乎全是規格 / 註解 / 說明文字提到「全選」
#     (例:input.anatomy.stories.tsx「一般文字編輯鍵(方向鍵 / Backspace / Delete / 全選)由瀏覽器原生提供」),
#     照舊判定升為擋,這些文字每改一行就被擋 —— 判定不準就換成確定性的判法,不是降回提醒(Decision tree 第 2、3 題)。
#   - `checkAll =` / `selectAll =` 不再吃到 `==` / `===` / `=>`(比較與箭頭不是在指定 handler)。
#   - 「有沒有用 SSOT」從「這次寫入的文字裡有沒有出現 applySelectAll」改成「寫完的檔有沒有呼叫 applySelectAll(」:
#     否則改 select-menu.tsx 的 `handleSelectAll` 那一行(它的呼叫在下幾行)也會被擋,擋到的是 SSOT 唯一的消費端自己。
#   已知不會中的寫法:「全選」標籤與事件屬性分寫在不同行、handler 又不叫上面那幾個名字
#   (例:DataTable 表頭 `aria-label="全選可見列"`;它走 DataTable 自己的選取模型,不是值陣列的排序)。這類交給稽核全掃。

source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: select-all helper integrity library unavailable\n' >&2
  exit 70
}
source "$(dirname "$0")/_added_lines.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: select-all added-lines helper unavailable\n' >&2
  exit 70
}

set -uo pipefail

governance_hook_load_input
governance_hook_require_commands awk sed sort python3 git
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""') \
  || governance_hook_integrity_fail 'select-all path extraction failed'
case "$FILE_PATH" in /*) MATCH_PATH="$FILE_PATH" ;; *) MATCH_PATH="/$FILE_PATH" ;; esac

case "$MATCH_PATH" in
  */packages/design-system/src/*) ;;
  *) exit 0 ;;
esac
case "$MATCH_PATH" in
  */multi-select-ordering.ts) exit 0 ;;
  *.ts|*.tsx|*.js|*.jsx|*.mjs) ;;
  *) exit 0 ;;
esac

case "$FILE_PATH" in /*) ABS_PATH="$FILE_PATH" ;; *) ABS_PATH="${GOVERNANCE_PROJECT_DIR:-$PWD}/$FILE_PATH" ;; esac
[ -e "$ABS_PATH" ] || exit 0
[ -f "$ABS_PATH" ] && [ -r "$ABS_PATH" ] \
  || governance_hook_integrity_fail "select-all after-image is not a readable regular file: $FILE_PATH"
CONTENT=$(cat "$ABS_PATH") || governance_hook_integrity_fail "select-all after-image read failed: $FILE_PATH"

# 程式行 = 不是整行註解的行(保留檔案行號)
governance_hook_grep_capture CODE_LINES 'select-all comment filter failed' "$CONTENT" \
  -nvE '^[[:space:]]*(//|\*|/\*|\{/\*)'
[ -n "$CODE_LINES" ] || exit 0

if governance_hook_grep_q 'select-all SSOT matcher failed' "$CODE_LINES" -qE 'applySelectAll[[:space:]]*\('; then
  exit 0
fi

governance_hook_grep_capture HANDLER_HITS 'select-all handler matcher failed' "$CODE_LINES" \
  -E '(handleSelectAll|onSelectAll|onCheckAll|handleCheckAll|(checkAll|selectAll)[[:space:]]*=([^=>]|$))'
governance_hook_grep_capture LABEL_LINES 'select-all label matcher failed' "$CODE_LINES" -F '全選'
LABEL_HITS=""
if [ -n "$LABEL_LINES" ]; then
  governance_hook_grep_capture LABEL_HITS 'select-all label-handler matcher failed' "$LABEL_LINES" -E 'on[A-Z][A-Za-z]*=\{'
fi
[ -n "$HANDLER_HITS" ] || [ -n "$LABEL_HITS" ] || exit 0

HITS=$(printf '%s\n%s\n' "$HANDLER_HITS" "$LABEL_HITS" | sed '/^$/d' | sort -t: -k1,1n -u) \
  || governance_hook_integrity_fail 'select-all hit aggregation failed'
HITS=$(governance_drop_escaped_hits "$HITS" "$ABS_PATH" '@select-all-canonical-allow:[ \t]*[^ \t]' same-or-prev) \
  || governance_hook_integrity_fail 'select-all escape filter failed'
[ -n "$HITS" ] || exit 0

WORK=$(mktemp -d "${TMPDIR:-/tmp}/select-all-canonical.XXXXXX") || WORK=""
[ -n "$WORK" ] && [ -d "$WORK" ] || governance_hook_integrity_fail 'select-all work dir unavailable'
trap 'rm -rf -- "$WORK"' EXIT
governance_added_line_numbers "$INPUT" "$ABS_PATH" "$WORK/numbers" \
  || governance_hook_integrity_fail 'select-all added-lines measurement failed'
governance_split_hits "$HITS" "$WORK/numbers" "$WORK/added" "$WORK/existing" \
  || governance_hook_integrity_fail 'select-all hit split failed'

BLOCK=""
EXISTING=""
if [ -s "$WORK/added" ]; then
  BLOCK="🚨 [P0 BLOCKER] Select All ordering SSOT drift:${FILE_PATH}

這次新增的行裡有「全部選取」動作(行號 = 寫完的檔,最多列 10 行):
$(awk 'NR <= 10' "$WORK/added" | sed 's/^/    /')
這支檔卻沒有呼叫 \`applySelectAll\`(\`@/design-system/lib/multi-select-ordering\`)。

SSOT:全部選取之後的順序 = 既有選取保留原順序、其餘依來源順序接在後面、去重
  → onValueChange?.(applySelectAll(selectedValues, allOptionValues))
  取消全選 → clearSelection()

刻意自寫(例:值不是陣列、沒有順序問題)→ 在那一行或上一行加 \`// @select-all-canonical-allow: <理由>\`。"
fi
if [ -s "$WORK/existing" ]; then
  EXISTING="Select All ordering 既有命中(不是這次新增的行,不擋;清單由 /design-system-audit Dim 17 / 32 收):${FILE_PATH}
$(awk 'NR <= 10' "$WORK/existing" | sed 's/^/    /')"
fi
governance_emit_verdict "$BLOCK" "$EXISTING"

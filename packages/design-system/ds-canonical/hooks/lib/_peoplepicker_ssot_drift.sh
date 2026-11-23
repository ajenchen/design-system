#!/bin/bash
# 執法等級:擋(只看這次新增的行)+ 逐行豁免 —— 規則是規格明文「動這些 API 前先 cite 對應 row」,引用標記判得出來(WP-14,2026-11-21)。
#
# post_edit_contract_dispatcher.sh 的子規則(原 check_peoplepicker_ssot_drift.sh,只提醒、outputMode governance-context)。
# 規則住處:packages/design-system/src/components/PeoplePicker/people-picker.spec.md「Trigger display SSOT canonical table」§A–§F,
#   §F 之後那一句:「改 PeoplePicker 視覺前必查本表,動 trigger render / placeholder / overflowShape / tagWrapperClassName 前先 cite 對應 row。」
# 判定(新增行的定義只有一份:lib/_added_lines.sh;本檔不自己取新增行):
#   範圍 = PeoplePicker/people-picker.tsx、PeoplePicker/person-display.tsx、Combobox/combobox.tsx。
#   命中 = 這次新增的行動到 SSOT-bearing 名稱(tagRenderer / overflowShape / tagWrapperClassName / selectedItemRenderer /
#     MultiPersonDisplay / PersonAvatarTag / PersonDisplay / searchIn / searchPlaceholder / `placeholder={`)。
#   引用 = `…spec.md … §A`–`§F`、`spec.md … canonical table`、`spec.md … Trigger display SSOT`。
#   這次新增的行裡有引用(原 hook 的「這次寫入的文字附了引用」)→ 放行;
#   否則命中那一行或上一行(寫完的檔)有引用 → 那一行放行(逐行:既有的引用註解留在原處,改那一行不必每次重寫一行引用);
#   其餘命中 → 擋(exit 2)。檔案裡早就在、這次沒動的行不判(那些行動的時候才需要引用),所以不列既有清單。
# 修法 = 先讀表、確認改動跟那一列一致,再在那一行或上一行寫引用註解,例 `// people-picker.spec.md §E(Avatar-presence → placeholder)`。
#
# 搬進來時修的兩處(對照格見 tests/test_post_edit_contract_dispatcher.sh 的 P-* 格):
#   (1) 舊版關鍵字寫在單引號裡的 `placeholder=\\{`,grep 收到的是「反斜線 + {」,只配得到字面的 `placeholder=\{`,
#       程式裡的 `placeholder={` 從來沒被抓過(規格那句明列 placeholder)。改成 `placeholder=\{`。
#   (2) 舊版另收 `people-picker.spec.md … L9x` 這種行號引用;那張表早已不在 9x 行(2026-11-21 量:表頭在 130 多行),
#       L9x 指不到任何一列,拿掉 —— 引用寫 §A–§F,不寫行號。
# 2026-11-21 全樹唯讀重播(三支檔各當成整檔寫入,a05da20a):舊判定 0 支命中 —— 三支檔都已帶 §-引用;規則本來就綁在「這次寫的那幾行」,
#   既有的行不是違規。

source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: peoplepicker-ssot helper integrity library unavailable\n' >&2
  exit 70
}
source "$(dirname "$0")/_added_lines.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: peoplepicker-ssot added-lines helper unavailable\n' >&2
  exit 70
}

set -uo pipefail

governance_hook_load_input
governance_hook_require_commands awk sed python3 git
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""') \
  || governance_hook_integrity_fail 'peoplepicker-ssot path extraction failed'
case "$FILE_PATH" in /*) MATCH_PATH="$FILE_PATH" ;; *) MATCH_PATH="/$FILE_PATH" ;; esac

case "$MATCH_PATH" in
  */PeoplePicker/people-picker.tsx|*/PeoplePicker/person-display.tsx|*/Combobox/combobox.tsx) ;;
  *) exit 0 ;;
esac

case "$FILE_PATH" in /*) ABS_PATH="$FILE_PATH" ;; *) ABS_PATH="${GOVERNANCE_PROJECT_DIR:-$PWD}/$FILE_PATH" ;; esac
[ -e "$ABS_PATH" ] || exit 0
[ -f "$ABS_PATH" ] && [ -r "$ABS_PATH" ] \
  || governance_hook_integrity_fail "peoplepicker-ssot after-image is not a readable regular file: $FILE_PATH"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/peoplepicker-ssot.XXXXXX") || WORK=""
[ -n "$WORK" ] && [ -d "$WORK" ] || governance_hook_integrity_fail 'peoplepicker-ssot work dir unavailable'
trap 'rm -rf -- "$WORK"' EXIT
governance_added_line_numbers "$INPUT" "$ABS_PATH" "$WORK/numbers" \
  || governance_hook_integrity_fail 'peoplepicker-ssot added-lines measurement failed'
[ -s "$WORK/numbers" ] || exit 0

# 這次新增的行(「行號:內容」,行號 = 寫完的檔)
ADDED=$(awk -v numfile="$WORK/numbers" '
  BEGIN { while ((getline n < numfile) > 0) want[n] = 1 }
  (FNR in want) { print FNR ":" $0 }
' "$ABS_PATH" 2>/dev/null) || governance_hook_integrity_fail 'peoplepicker-ssot added-line extraction failed'
[ -n "$ADDED" ] || exit 0

SSOT_KEYWORDS='tagRenderer|overflowShape|tagWrapperClassName|selectedItemRenderer|MultiPersonDisplay|PersonAvatarTag|PersonDisplay|searchIn|searchPlaceholder|placeholder=\{'
# 用 [.] 不用 \.:同一個 regex 也交給 awk -v(-v 會先吃掉反斜線)
SPEC_CITE='spec[.]md.*(§[A-F]|canonical table|Trigger display SSOT)'

governance_hook_grep_capture HITS 'peoplepicker-ssot keyword matcher failed' "$ADDED" -E "$SSOT_KEYWORDS"
[ -n "$HITS" ] || exit 0
if governance_hook_grep_q 'peoplepicker-ssot citation matcher failed' "$ADDED" -qE "$SPEC_CITE"; then
  exit 0
fi
HITS=$(governance_drop_escaped_hits "$HITS" "$ABS_PATH" "$SPEC_CITE" same-or-prev) \
  || governance_hook_integrity_fail 'peoplepicker-ssot per-line citation filter failed'
[ -n "$HITS" ] || exit 0

BLOCK="🚨 [P0 BLOCKER] PeoplePicker SSOT-bearing 寫入沒有引用規格那一列:${FILE_PATH}

這次新增的行動到這些名稱(行號 = 寫完的檔,最多列 10 行):
$(printf '%s\n' "$HITS" | awk 'NR <= 10' | sed 's/^/    /')

這些是 PeoplePicker 自己那一層 SSOT 的 API(不是 Combobox / Select 的純繼承)。
規則:people-picker.spec.md「Trigger display SSOT canonical table」§F 之後那一句 ——
  「改 PeoplePicker 視覺前必查本表,動 trigger render / placeholder / overflowShape / tagWrapperClassName 前先 cite 對應 row。」

修法:先讀表、確認改動跟那一列一致,再在那一行或上一行(或這次寫入的任一行)加引用註解,例如
  // people-picker.spec.md §E(Avatar-presence → placeholder)
對應列速查:
  §A 元件本質繼承表 —— 動繼承關係 / 視覺自定義
  §B 單人完整 trigger —— 動 single mode render
  §C 多人 length=1 —— 動降階單人視覺
  §D 多人 length≥2 —— 動頭像堆疊 / +N 圓形 / 欄位內搜尋插入點
  §E 共享 SSOT —— 動頭像 12px 內縮 / PersonDisplay / placeholder 省略
  §F Cell-edit ↔ Field-edit 一致性 —— 動 cell-registry MultiPersonCell / 表單 PeoplePicker"
governance_emit_verdict "$BLOCK" ""

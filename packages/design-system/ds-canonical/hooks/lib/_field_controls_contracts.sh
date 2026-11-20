#!/bin/bash
# 執法等級:擋(看寫完的整支檔)+ 各 contract 自己的檔首豁免 —— 四條都寫在規格、用 regex 判得出來;全樹既有命中 0,看整檔不會讓舊帳卡住編輯(WP-14,2026-11-21)。
#
# post_edit_contract_dispatcher.sh 的子規則(原 check_field_controls_contracts.sh,只提醒、outputMode governance-context)。
# 規則住處:packages/design-system/src/components/Field/field-controls.spec.md「共享 contract」(a)(b)(c)
#   + tokens/uiSize/uiSize.css `--field-px`(contract (d) field-px token)。
# 判定(看寫入之後磁碟上的整支檔;四條各自獨立,中幾條就列幾條,有任一條 → 擋 exit 2):
#   (b) 所有 packages/design-system/src/components/**/*.tsx:程式行(註解行除外)出現已移除的舊名 `emptyPlaceholder`。
#       豁免:檔案前 3 行內 `// @placeholder-vocabulary-allow: <理由>`。
#   (a) Combobox / Select / PeoplePicker 的 .tsx:props 定義了 `tagRenderer?: (` / `selectedItemRenderer?: (`、
#       edit 分支有呼叫,但每個 display 分支(`mode === 'display'` / `resolvedMode === 'display'` 起算 60 行內)都沒用到 →
#       rich-display renderer 只在 edit 生效。豁免:前 3 行 `// @renderer-symmetry-allow: <理由>`。
#   (c) Combobox / Select / PeoplePicker 的 .tsx:`tagAreaPaddingLeftPx={數字}`,或條件式裡帶數字卻沒看 surface。
#       豁免:前 3 行 `// @cell-metric-escape-allow: <理由>`。
#   (d) Select / Combobox / Input / NumberInput / Textarea / DatePicker / TimePicker / LinkInput / PeoplePicker / Field / Menu
#       的 .tsx(*.stories.tsx 除外):程式行出現 `0.75rem` 或裸 `px-3` / `pr-3`(已 token 化的 `px-[var(--field-px)]` 不算)。
#       豁免:前 3 行 `// @field-px-escape-allow: <理由>`。
# 為什麼看整支檔、不是只看新增行:2026-11-21 全樹唯讀重播(a05da20a;components 底下 291 支 .tsx 各當成整檔寫入)
#   原 hook 四條既有命中都是 0(現有三個檔首豁免:combobox.tsx / select.tsx 的 renderer-symmetry、people-picker.tsx 的 cell-metric)。
#   全樹乾淨時看整檔 = 任何新違反在寫入當下就被擋,不會有「舊帳卡住正常編輯」;對照組見 tests/test_post_edit_contract_dispatcher.sh F-* 格。
# 規則內容(四條 regex、範圍、豁免寫法)從原 hook 搬入,只改三處:「印提示、exit 0」→「寫 stderr、exit 2」;
#   grep 自身失敗(exit ≥ 2)→ GOVERNANCE_INTEGRITY exit 70(原本 2>/dev/null 吞掉,讀成沒違反);`\s` 換成 `[[:space:]]`(`\s` 不是 POSIX ERE)。
# 寫入後檔案不在(例如被刪)= 沒有內容可違反,安靜放行。

source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: field-controls helper integrity library unavailable\n' >&2
  exit 70
}

set -uo pipefail

governance_hook_load_input
governance_hook_require_commands sed awk cut
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""') \
  || governance_hook_integrity_fail 'field-controls path extraction failed'
case "$FILE_PATH" in /*) MATCH_PATH="$FILE_PATH" ;; *) MATCH_PATH="/$FILE_PATH" ;; esac

case "$MATCH_PATH" in
  */packages/design-system/src/components/*.tsx) ;;
  *) exit 0 ;;
esac

case "$FILE_PATH" in /*) ABS_PATH="$FILE_PATH" ;; *) ABS_PATH="${GOVERNANCE_PROJECT_DIR:-$PWD}/$FILE_PATH" ;; esac
[ -e "$ABS_PATH" ] || exit 0
[ -f "$ABS_PATH" ] && [ -r "$ABS_PATH" ] \
  || governance_hook_integrity_fail "field-controls after-image is not a readable regular file: $FILE_PATH"
CONTENT=$(cat "$ABS_PATH") || governance_hook_integrity_fail "field-controls after-image read failed: $FILE_PATH"
HEAD3=$(printf '%s\n' "$CONTENT" | sed -n '1,3p') || governance_hook_integrity_fail 'field-controls head extraction failed'

head_allows() {
  governance_hook_grep_q "field-controls $1 escape matcher failed" "$HEAD3" -qE "//[[:space:]]*@$1:"
}

VIOLATIONS=""

# ── Contract (b) Placeholder vocabulary(所有 components/**/*.tsx)──────────────────────────
# 2026-11-15:Combobox 的舊名 `emptyPlaceholder` 已移除(0.x 不留舊名,props-naming.md「相容政策」)。
#   程式行(註解除外)出現 `emptyPlaceholder` 這個名字就是寫回已移除的 API。
if ! head_allows placeholder-vocabulary-allow; then
  governance_hook_grep_capture B_RAW 'field-controls contract (b) matcher failed' "$CONTENT" \
    -nE '(^|[^A-Za-z0-9_])emptyPlaceholder([^A-Za-z0-9_]|$)'
  B_HITS=""
  [ -n "$B_RAW" ] && governance_hook_grep_capture B_HITS 'field-controls contract (b) comment filter failed' "$B_RAW" \
    -vE '^[0-9]+:[[:space:]]*(//|\*|/\*|\{/\*)'
  if [ -n "$B_HITS" ]; then
    VIOLATIONS="${VIOLATIONS}
[contract (b) placeholder vocabulary]:
${B_HITS}
  → 違反 field-controls.spec.md「共享 contract (b)」:\`emptyPlaceholder\` 已移除(2026-11-15),trigger empty 只叫 \`placeholder\`;不可把 emptyText(search-empty)接到 trigger-empty。
  Fix:用 \`placeholder\` prop(trigger empty SSOT)+ \`emptyText\` 僅傳 SelectMenu noResultsText。
  Allow:檔首加 \`// @placeholder-vocabulary-allow: <reason>\`。"
  fi
fi

# ── Contract (a) Selected value renderer symmetry(Combobox / Select / PeoplePicker)──────────
case "$MATCH_PATH" in
  */packages/design-system/src/components/Combobox/*.tsx|*/packages/design-system/src/components/Select/*.tsx|*/packages/design-system/src/components/PeoplePicker/*.tsx)
    if ! head_allows renderer-symmetry-allow; then
      governance_hook_grep_capture A_DEFINES 'field-controls contract (a) definition matcher failed' "$CONTENT" \
        -nE '(tagRenderer|selectedItemRenderer)\?:[[:space:]]*\('
      if [ -n "$A_DEFINES" ]; then
        governance_hook_grep_capture A_EDIT 'field-controls contract (a) edit-branch matcher failed' "$CONTENT" \
          -nE 'tagRenderer\(.*\)|selectedItemRenderer\(.*\)'
        governance_hook_grep_capture A_DISPLAY_RAW 'field-controls contract (a) display-branch matcher failed' "$CONTENT" \
          -nE "mode[[:space:]]*=*[[:space:]]*'display'|resolvedMode[[:space:]]*==*[[:space:]]*'display'"
        if [ -n "$A_EDIT" ] && [ -n "$A_DISPLAY_RAW" ]; then
          A_DISPLAY_LINES=$(printf '%s\n' "$A_DISPLAY_RAW" | cut -d: -f1) \
            || governance_hook_integrity_fail 'field-controls contract (a) line-number extraction failed'
          HAS_RENDERER_IN_DISPLAY=0
          for LN in $A_DISPLAY_LINES; do
            END=$((LN + 60))
            DISPLAY_WINDOW=$(printf '%s\n' "$CONTENT" | awk -v s="$LN" -v e="$END" 'NR>=s && NR<=e') \
              || governance_hook_integrity_fail 'field-controls contract (a) window extraction failed'
            if governance_hook_grep_q 'field-controls contract (a) window matcher failed' "$DISPLAY_WINDOW" \
              -qE 'tagRenderer|selectedItemRenderer'; then
              HAS_RENDERER_IN_DISPLAY=1
              break
            fi
          done
          if [ "$HAS_RENDERER_IN_DISPLAY" -eq 0 ]; then
            VIOLATIONS="${VIOLATIONS}
[contract (a) renderer symmetry]:
${FILE_PATH}
  → tagRenderer/selectedItemRenderer 定義於 props 但 display branch 沒消費 → edit-only。
  違反 field-controls.spec.md「共享 contract (a)」:rich-display renderer 必被 display/readonly/disabled/edit 4 mode 共享。
  Allow:檔首加 \`// @renderer-symmetry-allow: <reason>\`。"
          fi
        fi
      fi
    fi
    ;;
esac

# ── Contract (c) Cell metric escape hatches(Combobox / Select / PeoplePicker)───────────────
case "$MATCH_PATH" in
  */packages/design-system/src/components/Combobox/*.tsx|*/packages/design-system/src/components/PeoplePicker/*.tsx|*/packages/design-system/src/components/Select/*.tsx)
    if ! head_allows cell-metric-escape-allow; then
      governance_hook_grep_capture C_HARDCODE 'field-controls contract (c) hardcode matcher failed' "$CONTENT" \
        -nE 'tagAreaPaddingLeftPx=\{[0-9]+\}'
      governance_hook_grep_capture C_COND_RAW 'field-controls contract (c) conditional matcher failed' "$CONTENT" \
        -nE 'tagAreaPaddingLeftPx=\{[^}]*\?[^}]*[0-9]+[^}]*\}'
      C_COND=""
      [ -n "$C_COND_RAW" ] && governance_hook_grep_capture C_COND 'field-controls contract (c) surface filter failed' "$C_COND_RAW" \
        -v 'surface'
      C_WARN=""
      [ -n "$C_HARDCODE" ] && C_WARN="${C_WARN}
[hardcode numeric without surface guard]:
${C_HARDCODE}"
      [ -n "$C_COND" ] && C_WARN="${C_WARN}
[conditional without surface check]:
${C_COND}"
      if [ -n "$C_WARN" ]; then
        VIOLATIONS="${VIOLATIONS}
[contract (c) cell metric escape hatch]:
${FILE_PATH}${C_WARN}
  → 違反 field-controls.spec.md「共享 contract (c)」:cell 內禁 hardcode padding magic,改 \`useFieldSurface()\` + \`--table-cell-px\` 推導。
  Fix pattern: tagAreaPaddingLeftPx={(!isEmpty && surface === 'form') ? 8 : undefined}
  Allow:檔首加 \`// @cell-metric-escape-allow: <reason>\`。"
      fi
    fi
    ;;
esac

# ── Contract (d) field-px token(消費 --field-px 的 field controls;*.stories.tsx 除外)──────────
# 12px 已 tokenize → production code 禁 hardcode `0.75rem`(inline override)或裸 `px-3` / `pr-3`
#   (uiSize.css `--field-px` 那段註解「取代散落的 px-3 / inline 0.75rem」)。
# 不算:*.stories.tsx(示範容器 px-3 是版面不是欄位內距)、註解行(遷移註解可以提舊寫法)、已 tokenize 的 `px-[var(--field-px)]`。
case "$MATCH_PATH" in
  *.stories.tsx) ;;
  */packages/design-system/src/components/Select/*.tsx|*/packages/design-system/src/components/Combobox/*.tsx|*/packages/design-system/src/components/Input/*.tsx|*/packages/design-system/src/components/NumberInput/*.tsx|*/packages/design-system/src/components/Textarea/*.tsx|*/packages/design-system/src/components/DatePicker/*.tsx|*/packages/design-system/src/components/TimePicker/*.tsx|*/packages/design-system/src/components/LinkInput/*.tsx|*/packages/design-system/src/components/PeoplePicker/*.tsx|*/packages/design-system/src/components/Field/*.tsx|*/packages/design-system/src/components/Menu/*.tsx)
    if ! head_allows field-px-escape-allow; then
      governance_hook_grep_capture D_RAW 'field-controls contract (d) matcher failed' "$CONTENT" \
        -nE '0\.75rem|(^|[^a-zA-Z0-9-])!?(px|pr)-3([^0-9.]|$)'
      D_CODE=""
      [ -n "$D_RAW" ] && governance_hook_grep_capture D_CODE 'field-controls contract (d) comment filter failed' "$D_RAW" \
        -vE '^[0-9]+:[[:space:]]*(//|\*|/\*)'
      D_HITS=""
      [ -n "$D_CODE" ] && governance_hook_grep_capture D_HITS 'field-controls contract (d) token filter failed' "$D_CODE" \
        -vE 'px-\[var'
      if [ -n "$D_HITS" ]; then
        VIOLATIONS="${VIOLATIONS}
[contract (d) field-px]:
${D_HITS}
  → field 水平內距 12px 已 tokenize 為 --field-px(field-controls.spec.md「右側元素」canonical + tokens/uiSize/uiSize.css)。production 禁 hardcode 0.75rem / 裸 px-3,改 \`paddingRight: 'var(--field-px)'\` / \`px-[var(--field-px)]\`。
  Allow:檔首加 \`// @field-px-escape-allow: <reason>\`。"
      fi
    fi
    ;;
esac

[ -n "$VIOLATIONS" ] || exit 0

printf '🚨 [P0 BLOCKER] Field controls shared contracts violation(%s):%s\n' "$FILE_PATH" "$VIOLATIONS" >&2
exit 2

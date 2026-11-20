#!/bin/bash
# 執法等級:擋(看寫完的整支檔)+ 檔首豁免 —— M32 主句是確定性規則;全樹既有命中 0,看整檔不會讓舊帳卡住編輯(WP-14,2026-11-21)。
#
# post_edit_contract_dispatcher.sh 的子規則(原 check_pixel_quantified_audit.sh,只提醒、outputMode governance-context)。
# 規則住處:packages/design-system/ds-canonical/rules/meta-patterns.md M32 主句 —— audit 必驗 `rect.top / .left / .height`
#   這類數字像素位置,不可只驗 `getAttribute('data-state')` 之類的屬性存在(DOM 對 ≠ 畫面對)。
# 判定(看寫入之後磁碟上的整支檔):
#   檔案 = scripts/visual-audit*.mjs 或 scripts/visual-audit*.js(現役只有 scripts/visual-audit.mjs;
#   舊的 visual-audit-<target>.mjs 家族 2026-05-30 a2360e99 整批退役),
#   檔內有 `getAttribute(` / `.hasAttribute(`,卻一個 `getBoundingClientRect(` / `.offsetTop` / `.offsetHeight` /
#   `.offsetLeft` / `.offsetWidth` 都沒有 → 擋(exit 2)。
# 豁免:檔案前 3 行內寫 `// @pixel-quantified-allow: <理由>`(只驗結構的腳本,例如 schema 檢查;原 hook 的豁免,照搬)。
# 為什麼看整支檔、不是只看新增行:「整支檔一個像素量測都沒有」本來就是整檔的性質,只看新增行判不出來;
#   2026-11-21 全樹唯讀重播(a05da20a)scripts/visual-audit.mjs 不命中(有像素量測),既有命中 0。
# 寫入後檔案不在(例如被刪)= 沒有內容可違反,安靜放行。
# 搬進來時改三處:「印提示、exit 0」→「寫 stderr、exit 2」;grep 自身失敗(exit ≥ 2)→ GOVERNANCE_INTEGRITY exit 70
#   (原本 2>/dev/null 吞掉,讀成沒違反);`.offsetTop\b` 的 `\b` 換成明寫的字界 `([^A-Za-z0-9_$]|$)`(`\b` 不是 POSIX ERE)。

source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: pixel-quantified helper integrity library unavailable\n' >&2
  exit 70
}

set -uo pipefail

governance_hook_load_input
governance_hook_require_commands sed awk
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""') \
  || governance_hook_integrity_fail 'pixel-quantified path extraction failed'
case "$FILE_PATH" in /*) MATCH_PATH="$FILE_PATH" ;; *) MATCH_PATH="/$FILE_PATH" ;; esac

case "$MATCH_PATH" in
  */scripts/visual-audit*.mjs|*/scripts/visual-audit*.js) ;;
  *) exit 0 ;;
esac

case "$FILE_PATH" in /*) ABS_PATH="$FILE_PATH" ;; *) ABS_PATH="${GOVERNANCE_PROJECT_DIR:-$PWD}/$FILE_PATH" ;; esac
[ -e "$ABS_PATH" ] || exit 0
[ -f "$ABS_PATH" ] && [ -r "$ABS_PATH" ] \
  || governance_hook_integrity_fail "pixel-quantified after-image is not a readable regular file: $FILE_PATH"
CONTENT=$(cat "$ABS_PATH") || governance_hook_integrity_fail "pixel-quantified after-image read failed: $FILE_PATH"

HEAD3=$(printf '%s\n' "$CONTENT" | sed -n '1,3p') || governance_hook_integrity_fail 'pixel-quantified head extraction failed'
if governance_hook_grep_q 'pixel-quantified escape matcher failed' "$HEAD3" -qE '//[[:space:]]*@pixel-quantified-allow:'; then
  exit 0
fi

governance_hook_grep_capture ATTR_LINES 'pixel-quantified attribute matcher failed' "$CONTENT" \
  -nE 'getAttribute\(|\.hasAttribute\('
[ -n "$ATTR_LINES" ] || exit 0
if governance_hook_grep_q 'pixel-quantified measurement matcher failed' "$CONTENT" \
  -qE 'getBoundingClientRect\(|\.(offsetTop|offsetHeight|offsetLeft|offsetWidth)([^A-Za-z0-9_$]|$)'; then
  exit 0
fi

{
  printf '🚨 [P0 BLOCKER] M32 pixel-quantified verify gap:%s\n' "$FILE_PATH"
  printf '  驗了屬性(getAttribute / hasAttribute,最多列 10 行):\n'
  printf '%s\n' "$ATTR_LINES" | awk 'NR <= 10' | sed 's/^/    /'
  cat <<'EOF'
  卻沒有任何像素量測(getBoundingClientRect / offsetTop / offsetHeight / offsetLeft / offsetWidth)。
  → 只驗屬性 = M32 違反(DOM 對 ≠ 畫面對)。加上數字像素量測(rect.top / .left / .height)真的去量畫面;
    若這支腳本本來就只驗結構(例如 schema 檢查),在檔案前 3 行寫 // @pixel-quantified-allow: <理由>。
EOF
} >&2
exit 2

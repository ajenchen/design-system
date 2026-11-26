#!/bin/bash
# 執法等級:擋(只看這次新增的行)+ 逐行豁免 —— 留下的三條都寫在規格裡、用一行 regex 判得出來;另三條是「同檔出現」代理,退場(D4-02 審計 2026-11-18 起,見下方)。
#
# PostToolUse helper(由 post_edit_dispatcher.sh 依序呼叫):自刻 overlay / menu 結構(違 mindset #2)。
#
# 會擋的三條(只對這次新增的行;新增行的定義見 lib/_added_lines.sh;豁免 = 同一行或上一行,冒號後寫理由):
#   1  自刻 overlay chrome:<div className="…px-[var(--layout-space-loose)]…border-(b|t) border-divider…">
#      規格:patterns/overlay-surface/overlay-surface.spec.md「Consumer rule:必消費 primitive 不自刻 chrome」
#      豁免:`// overlay-handcraft-allow: <理由>`
#   2.5 自刻 MenuItem 型的列:<div className="…flex…gap-[12]…px-[var(--layout-space-loose)]…hover:bg-…-hover…rounded…">
#      規格:overlay-surface.spec.md「Menu 移植到 Dialog body」(用 MenuItem primitive,不自刻)
#      豁免:`// menu-item-handcraft-allow: <理由>`(2026-11-18 前是「檔案裡任何一處寫了就整檔放行」,改成逐行)
#   6  Overlay body 重新引入 stripped-padding boolean variant(components/(Dialog|Sheet|Popover)/*.tsx 的
#      `flush?: boolean` / `naked` / `bare` / `noPadding` …)
#      規格:overlay-surface.spec.md「List-as-region in overlay body」+ design-system-audit dim 31
#      豁免:`// overlay-body-stripped-variant-allow: <理由>`(同上,原為整檔)
#   2026-11-20 全樹唯讀掃描(81df56e4)三條都是 0 處;既有命中若出現,只列成「既有」不擋,交 /design-system-audit dim 31。
#
# 退場的三條(判的是「同一個檔案裡同時出現」,不是規格說的那件事 —— M37 代理;改由規格 + 稽核把關):
#   2  多個 raw <Checkbox> 沒包 <CheckboxGroup>(整檔數 ≥ 2):同檔兩顆 ≠ 同一組選項 —— 2026-11-20 全樹唯一命中
#      DataTable/cell-registry.tsx 是兩個不同儲存格的 renderer。確定性的判法在 scripts/checkbox-group-handcraft-invariant.mjs
#      (容器內 ≥ 2 顆帶可見 label 的 Checkbox;規格 checkbox.spec.md「群組模式(CheckboxGroup)」)。
#   4  Popover panel(<PopoverHeader>)+ <MenuItem> 同檔:與現行規格相反 —— overlay-surface.spec.md「Menu 移植到 Dialog body」
#      明文寫浮層 body 裡用 MenuItem、className 覆寫成 px-loose。
#   5  同檔混用 <ItemInlineActionButton> + <Button iconOnly>:同檔 ≠ 同一列 —— 全樹 3 個 same-row-mixed-allow 豁免
#      (DataTable 的 data-table-filter-panel.tsx、data-table-sort-manager.tsx、data-table.stories.tsx,都在檔頭)理由都是「不在同 row」。
#      規格:patterns/element-anatomy/inline-action.spec.md「Same-row consistency rule」(稽核時逐列判)。

# Per-hook fire logging
source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/_added_lines.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: overlay handcraft added-lines helper unavailable\n' >&2
  exit 70
}

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Scope: tsx files (stories, components, patterns, app, explorations)
if ! grep -qE '\.tsx$' <<<"$FILE_PATH"; then
  exit 0
fi
# Skip anatomy / principles stories(教學頁刻意示範對照組)
if grep -qE '(\.anatomy\.stories\.tsx$|\.principles\.stories\.tsx$)' <<<"$FILE_PATH"; then
  exit 0
fi
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

integrity() {
  printf 'GOVERNANCE_INTEGRITY: overlay handcraft %s\n' "$1" >&2
  exit 70
}

WORK=$(mktemp -d "${TMPDIR:-/tmp}/overlay-handcraft.XXXXXX") || integrity 'work dir unavailable'
trap 'rm -rf -- "$WORK"' EXIT
governance_added_line_numbers "$INPUT" "$FILE_PATH" "$WORK/numbers" || integrity 'added-lines measurement failed'

BLOCK=""
EXISTING=""

# 同一條規則:去掉豁免行 → 依行號分成新增 / 既有 → 組訊息(每份最多列 5 行,只是顯示上限)
classify() {
  local name="$1" hits="$2" marker="$3" title="$4" fix="$5"
  hits=$(governance_drop_escaped_hits "$hits" "$FILE_PATH" "$marker" same-or-prev) || integrity "escape filter failed:${name}"
  governance_split_hits "$hits" "$WORK/numbers" "$WORK/$name.added" "$WORK/$name.existing" || integrity "hit split failed:${name}"
  if [ -s "$WORK/$name.added" ]; then
    BLOCK="${BLOCK}"$'\n'"⛔ ${title}(這次新增的行):"$'\n'"$(awk 'NR <= 5' "$WORK/$name.added")"$'\n'"${fix}"
  fi
  if [ -s "$WORK/$name.existing" ]; then
    EXISTING="${EXISTING}"$'\n'"• ${title}(既有 $(grep -c . "$WORK/$name.existing") 處):"$'\n'"$(awk 'NR <= 5' "$WORK/$name.existing")"
  fi
}

# ── Check 1: 自刻 overlay chrome ──
# 頁面內不可關閉的有框區塊,標頭由消費者自組(header-canonical.spec.md「何時不用」;user 2026-11-26 E6),可能也寫成
# px-loose + border-divider。先用 tsx-governance-analysis.mjs page-block-header-mask(與 story 閘 R9 同一份判法)把
# 「正向認得出、不在浮層裡」的區塊標頭遮掉(只換字、不動行號)再跑簽名;解析不了 → 用原檔 = 照擋。
CHROME_SCAN=$(cat "$FILE_PATH") || integrity 'target read failed'
if grep -qF 'border-divider' "$FILE_PATH" && grep -qF 'px-[var(--layout-space-loose)]' "$FILE_PATH"; then
  CHROME_ANALYZER="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)/tsx-governance-analysis.mjs"
  for CHROME_ROOT in "${GOVERNANCE_PROJECT_DIR:-$(pwd)}" "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null)"; do
    [ -n "$CHROME_ROOT" ] && [ -d "$CHROME_ROOT" ] && [ -f "$CHROME_ANALYZER" ] || continue
    if CHROME_MASKED=$( (cd "$CHROME_ROOT" && node -- "$CHROME_ANALYZER" page-block-header-mask 2>/dev/null) < "$FILE_PATH"); then
      CHROME_SCAN="$CHROME_MASKED"
      break
    fi
  done
fi
classify chrome \
  "$(printf '%s\n' "$CHROME_SCAN" | grep -nE '<div className="[^"]*px-\[var\(--layout-space-loose\)\][^"]*border-(b|t) border-divider' 2>/dev/null)" \
  'overlay-handcraft-allow:[ \t]*[^ \t]' \
  '自刻 overlay chrome(違 mindset #2)' \
  "  → 改用 primitive:
    Popover content → PopoverHeader / PopoverBody / PopoverFooter / PopoverTitle
    Dialog content → DialogHeader / DialogBody / DialogFooter / DialogTitle
    Generic overlay panel → SurfaceHeader / SurfaceBody / SurfaceFooter (overlay-surface)
  Why:canonical 自帶 padding token + border + close X(Popover)+ autofocus + title typography。
  豁免:同一行或上一行 \`// overlay-handcraft-allow: <理由>\`。"

# ── Check 2.5: 自刻 MenuItem 型的列 ──
# 滑過底色認任何 `-hover` 配對 token(color.spec.md「Hover 換色配對總則」;2026-09-25 起含 bg-[var(--x-hover)] 與 ! 寫法)。
classify row \
  "$(grep -nE '<div className="[^"]*flex[^"]*gap-[12][^"]*px-\[var\(--layout-space-loose\)\][^"]*hover:!?bg-(\[var\(--)?[a-z0-9-]+-hover[^"]*rounded' "$FILE_PATH" 2>/dev/null)" \
  'menu-item-handcraft-allow:[ \t]*[^ \t]' \
  '自刻 row(MenuItem-like)違反 mindset #2' \
  "  → 改用 <MenuItem startIcon={...} endContent={...} disabled={...}>label</MenuItem>
  Why:MenuItem 自帶 SelectionItem py 公式 + size canonical + a11y(role=option, aria-disabled, aria-selected)+ cursor-not-allowed disabled。
  豁免:同一行或上一行 \`// menu-item-handcraft-allow: <理由>\`。"

# ── Check 6: Overlay body 重新引入 flush / 等價 boolean variant(2026-05-01 移除)──
if grep -qE 'components/(Dialog|Sheet|Popover)/[^/]+\.tsx$' <<<"$FILE_PATH" && ! grep -qE '\.stories\.tsx$' <<<"$FILE_PATH"; then
  classify stripped \
    "$(grep -nE '(flush|naked|bare|stripped|unpadded|noPadding|paddingless)\??:\s*boolean' "$FILE_PATH" 2>/dev/null)" \
    'overlay-body-stripped-variant-allow:[ \t]*[^ \t]' \
    'Overlay body 重新引入 stripped-padding boolean variant(2026-05-01 已移除)' \
    "  → list-as-region in overlay body canonical = consumer 用 className override:
    <DialogBody className=\"!px-0 !pt-0 !pb-0\"><div className=\"py-2\">{items}</div></DialogBody>
  Why removed:Material / Atlassian / Mantine / shadcn 主流不做 universal LayoutBody flush;
  variant 不解決底層脆弱(加 1 row search/banner 就破功)+ 把 1 surface decision 拆兩 API。
  詳 overlay-surface.spec.md「List-as-region in overlay body」。
  豁免:同一行或上一行 \`// overlay-body-stripped-variant-allow: <理由>\`(必含 ≥3 家世界級對照 + multi-row hold 保證)。"
fi

[ -n "$BLOCK" ] && BLOCK="Primitive consumption:這次編輯新增了自刻結構。${BLOCK}"
[ -n "$EXISTING" ] && EXISTING="Primitive consumption 既有違規(不是這次新增的行,不擋;清單由 /design-system-audit dim 31 收):${EXISTING}"
governance_emit_verdict "$BLOCK" "$EXISTING"

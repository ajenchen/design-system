#!/bin/bash
# PostToolUse hook: detect hand-crafted overlay chrome violating mindset #2.
#
# Catches: <div className="...px-[var(--layout-space-loose)]...border-(b|t) border-divider">
# in stories.tsx / DataTable helper.tsx / app code — pattern means consumer self-rendered
# overlay header/footer chrome instead of consuming SurfaceHeader / SurfaceBody / SurfaceFooter
# (or PopoverHeader / DialogHeader / SheetHeader).
#
# Why block: canonical primitives bundle padding + border + close X (Popover) + autofocus +
# typography (PopoverTitle text-body font-medium). Self-rendering bypasses these = mindset #2
# violation + silently breaks alignment / close X 一致性。
#
# 對齊 patterns/overlay-surface/overlay-surface.spec.md「Consumer rule」+
# components/Popover/popover.tsx:72「所有 PopoverHeader 一律附右上 X」canonical。
#
# Escape hatch:add `// overlay-handcraft-allow: <reason>` on prev/same line for intentional cases
# (e.g. non-overlay panel that just borrows the layout-space token).
#
# WARN-style (additionalContext) — AI reads + fixes next iteration.

# Per-hook fire logging
source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire

FILE_PATH=$(jq -r '.tool_input.file_path // empty')

# Scope: tsx files (stories, components, patterns, app, explorations)
if ! echo "$FILE_PATH" | grep -qE '\.tsx$'; then
  exit 0
fi
# Skip spec.md / anatomy stories (different context)
if echo "$FILE_PATH" | grep -qE '(\.spec\.md$|\.anatomy\.stories\.tsx$|\.principles\.stories\.tsx$)'; then
  exit 0
fi
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Pattern: <div className="...px-[var(--layout-space-loose)]...border-(b|t) border-divider...">
PATTERN='<div className="[^"]*px-\[var\(--layout-space-loose\)\][^"]*border-(b|t) border-divider'
HITS=$(grep -nE "$PATTERN" "$FILE_PATH" 2>/dev/null | head -5)

if [ -n "$HITS" ]; then
  # filter out lines with allowlist comment
  FILTERED=""
  while IFS= read -r line; do
    line_num=$(echo "$line" | cut -d: -f1)
    [ -z "$line_num" ] && continue
    # check current line + previous line for allowlist
    prev_line=$(sed -n "$((line_num-1))p" "$FILE_PATH" 2>/dev/null)
    cur_line=$(sed -n "${line_num}p" "$FILE_PATH" 2>/dev/null)
    if echo "$prev_line $cur_line" | grep -q 'overlay-handcraft-allow:'; then
      continue
    fi
    FILTERED="${FILTERED}${line}\n"
  done <<< "$HITS"

  if [ -n "$FILTERED" ]; then
    VIOLATIONS="${VIOLATIONS}\n⚠️ Hand-crafted overlay chrome detected(自刻 overlay 結構違 mindset #2):\n${FILTERED}\n  → 改用 primitive:\n    Popover content → PopoverHeader / PopoverBody / PopoverFooter / PopoverTitle\n    Dialog content → DialogHeader / DialogBody / DialogFooter / DialogTitle\n    Generic overlay panel → SurfaceHeader / SurfaceBody / SurfaceFooter (overlay-surface)\n  Why:canonical 自帶 padding token + border + close X(Popover)+ autofocus + title typography。\n  Escape hatch:加 \`// overlay-handcraft-allow: <reason>\` 在同/前行。"
  fi
fi

# ── Check 2.5: Raw row handcraft (px-loose + py + rounded-md + hover:bg-neutral-hover) ──
# Pattern:`<div className="...flex...gap-2 px-loose py-1.5 rounded-md hover:bg-neutral-hover">`
# = 自刻 MenuItem-like row 違反 mindset #2(MenuItem primitive 自帶這些 + size canonical + a11y)
ROW_PATTERN='<div className="[^"]*flex[^"]*gap-[12][^"]*px-\[var\(--layout-space-loose\)\][^"]*hover:bg-neutral-hover[^"]*rounded'
ROW_HITS=$(grep -nE "$ROW_PATTERN" "$FILE_PATH" 2>/dev/null | head -3)
if [ -n "$ROW_HITS" ] && ! grep -qE 'menu-item-handcraft-allow:' "$FILE_PATH" 2>/dev/null; then
  VIOLATIONS="${VIOLATIONS}\n⚠️ 自刻 row(MenuItem-like)違反 mindset #2:\n${ROW_HITS}\n  → 改用 <MenuItem startIcon={...} endContent={...} disabled={...}>label</MenuItem>\n  Why:MenuItem 自帶 SelectionItem py 公式 + size canonical + a11y(role=option, aria-disabled, aria-selected) + cursor-not-allowed disabled。\n  Escape hatch:加 \`// menu-item-handcraft-allow: <reason>\` 在檔頭。"
fi

# ── Check 2: Raw <Checkbox> count > 1 not in <CheckboxGroup> ──
# 同 root cause(自刻 SelectionItem 包 Checkbox 而非消費 CheckboxGroup primitive)。
# 對齊 checkbox.spec.md「群組模式(CheckboxGroup)」canonical line 225:
#   多選 Checkbox 必包 <CheckboxGroup>(zero-gap canonical + Context 隔離 + a11y group)。
# 2026-06-11 R2 held-item #11 context-narrow:檔案級 count 對下列合法 context 永久 FP(8 檔噪音實測):
#   - DataTable / TreeView:row-selection canonical(selection column / tree 多選 = row anatomy,非 form 群組)
#   - Checkbox / SelectionControl:selection primitive 自家 stories 示範 raw usage(同 Check 4 menu-primitive skip idiom)
#   - Field:單顆 Checkbox 包 <Field> = field-controls Family 4 canonical(field.stories.tsx 每顆獨立非群組)
#   - patterns/element-anatomy:row anatomy SSOT reference 本身
# 消費者 / 其他 DS 元件自刻多選 list 仍照抓(原 bug class 保護不變)。
# 2026-06-11 R2 Phase B(codex b3 抓縫):原 DataTable/TreeView 整目錄 skip 會放走目錄內
# 其他檔(如 filter-panel)的真違規 — 縮到 row-selection canonical 真實檔名 + 自家 primitive。
IS_CB_LEGIT_CONTEXT=$(echo "$FILE_PATH" | grep -cE '(components/DataTable/data-table\.tsx|components/TreeView/tree-view\.tsx|components/(Checkbox|SelectionControl|Field)/|patterns/element-anatomy/)' | head -1)
IS_CB_LEGIT_CONTEXT=${IS_CB_LEGIT_CONTEXT:-0}
CB_COUNT=$(grep -c '<Checkbox\b' "$FILE_PATH" 2>/dev/null | head -1 || echo 0)
CBG_COUNT=$(grep -c '<CheckboxGroup\b' "$FILE_PATH" 2>/dev/null | head -1 || echo 0)
CB_COUNT=${CB_COUNT:-0}
CBG_COUNT=${CBG_COUNT:-0}
if [ "$CB_COUNT" -ge 2 ] && [ "$CBG_COUNT" -eq 0 ] && [ "$IS_CB_LEGIT_CONTEXT" -eq 0 ]; then
  CB_HITS=$(grep -nE '<Checkbox\b' "$FILE_PATH" 2>/dev/null | head -3)
  # allowlist: same-line or prev-line has // checkbox-group-allow:
  if ! grep -qE 'checkbox-group-allow:' "$FILE_PATH" 2>/dev/null; then
    VIOLATIONS="${VIOLATIONS}\n⚠️ 多個 raw <Checkbox> 未包 <CheckboxGroup>(${CB_COUNT} hits)— 違反 checkbox.spec.md 群組 canonical:\n${CB_HITS}\n  → 改用 <CheckboxGroup><Checkbox label=\"...\" />...</CheckboxGroup>\n  Why:CheckboxGroup 自帶 zero-gap canonical(SelectionItem py 公式)+ Context 隔離 fieldCtx + a11y group;raw 自刻 wrapper 違 mindset #2。\n  Escape hatch:加 \`// checkbox-group-allow: <reason>\` 在檔頭。"
  fi
fi

# ── Check 5: Same-row consistency 違反(同 row 混 ItemInlineActionButton + Button iconOnly)──
# 對齊 inline-action.spec.md L152「Same-row consistency rule:同 action row 所有 icon action 必同一類」。
# Pattern:同檔出現 <ItemInlineActionButton 與 <Button.*iconOnly,且非 menu primitive impl(menu 內 Button 為合法 chrome)。
# 2026-06-11 R2 held-item #11 context-narrow(檔案級 co-occurrence 對合法 chrome-vs-row 永久 FP):
#   (1) strip 純註解行再 count(對齊 check_story_invariants.sh R9 idiom;file-viewer.tsx 註解 cite
#       `<Button iconOnly dismiss />` 字樣誤觸;不 strip 行內 // 避免 mutilate https:// URL)
#   (2) 排除 dismiss Button:chrome corner close X = dismiss canonical(inline-action.spec.md
#       「Dismiss canonical — X close only」+ button.spec.md「Dismiss 視覺類」),跟 row inline action
#       永遠不同 row → 非 same-row mixing(把 hook 自述 escape note「chrome corner 跟 row 不同 row 可分開」codify 進 detection)
#   (3) patterns/element-anatomy/ skip:anatomy SSOT 本身示範兩類對照(含刻意 ❌ mixed 教學例)
# 真 same-row mixing(非 dismiss 的 iconOnly Button 與 InlineAction 同檔)仍照抓,保護不削弱。
IS_ANATOMY_SSOT=$(echo "$FILE_PATH" | grep -c 'patterns/element-anatomy/' | head -1)
IS_ANATOMY_SSOT=${IS_ANATOMY_SSOT:-0}
OH5_SRC=$(grep -vE '^[[:space:]]*(//|\*|/\*|\{/\*)' "$FILE_PATH" 2>/dev/null)
HAS_INLINE=$(printf '%s\n' "$OH5_SRC" | grep -c '<ItemInlineActionButton' 2>/dev/null | head -1)
HAS_BTN_ICON=$(printf '%s\n' "$OH5_SRC" | grep -E '<Button[^>]*iconOnly' 2>/dev/null | grep -cv 'dismiss' | head -1)
HAS_INLINE=${HAS_INLINE:-0}
HAS_BTN_ICON=${HAS_BTN_ICON:-0}
IS_MENU_PRIMITIVE2=$(echo "$FILE_PATH" | grep -cE '(DropdownMenu|SelectMenu|Combobox|Menu)/.*\.tsx$' | head -1)
IS_MENU_PRIMITIVE2=${IS_MENU_PRIMITIVE2:-0}
if [ "$HAS_INLINE" -ge 1 ] && [ "$HAS_BTN_ICON" -ge 1 ] && [ "$IS_MENU_PRIMITIVE2" -eq 0 ] && [ "$IS_ANATOMY_SSOT" -eq 0 ]; then
  if ! grep -qE 'same-row-mixed-allow:' "$FILE_PATH" 2>/dev/null; then
    VIOLATIONS="${VIOLATIONS}\n⚠️ 同檔混用 <ItemInlineActionButton>(${HAS_INLINE}) + <Button.*iconOnly>(${HAS_BTN_ICON}):\n  → 違反 inline-action.spec.md L152 Same-row consistency rule(同 row icon action 必同一類)。\n  → Box size 不一致(InlineAction 16+18 vs Button text sm 28)會 gap 斷裂。\n  → 修法:row 內 icon action 全 ItemInlineActionButton(對齊 size=md / 16+18 hover bg)。\n  Escape hatch:加 \`// same-row-mixed-allow: <reason>\` 在檔頭(若 chrome corner action group 跟 row 不同 row,可分開)。"
  fi
fi

# ── Check 4: Panel-style Popover + MenuItem co-occur(2026-04-29) ──
# Pattern:同檔出現 <PopoverHeader> 且 <MenuItem>(不是 DropdownMenu / SelectMenu primitive 自身)
# → panel-style popover 不該硬塞 menu specialization。MenuItem 預設 `px-3` 不對齊 panel chrome
# `loose`,且 startIcon 色彩無 override → 該用視覺 primitive(ItemPrefix/ItemLabel/ItemSuffix)自組。
HAS_POP_HEADER=$(grep -c '<PopoverHeader' "$FILE_PATH" 2>/dev/null | head -1)
HAS_MENU_ITEM=$(grep -c '<MenuItem\b' "$FILE_PATH" 2>/dev/null | head -1)
HAS_POP_HEADER=${HAS_POP_HEADER:-0}
HAS_MENU_ITEM=${HAS_MENU_ITEM:-0}
# Skip:DropdownMenu/SelectMenu primitive impl 本身(他們 import MenuItem 是合法 menu-style)
IS_MENU_PRIMITIVE=$(echo "$FILE_PATH" | grep -cE '(DropdownMenu|SelectMenu|Combobox)/.*\.tsx$' | head -1)
IS_MENU_PRIMITIVE=${IS_MENU_PRIMITIVE:-0}
if [ "$HAS_POP_HEADER" -ge 1 ] && [ "$HAS_MENU_ITEM" -ge 1 ] && [ "$IS_MENU_PRIMITIVE" -eq 0 ]; then
  if ! grep -qE 'panel-menuitem-allow:' "$FILE_PATH" 2>/dev/null; then
    VIOLATIONS="${VIOLATIONS}\n⚠️ Panel-style Popover(<PopoverHeader>)+ <MenuItem> 同檔(${HAS_MENU_ITEM} hits):\n  → MenuItem 是 menu specialization(px-3 menu-style + icon 色繼承),不適 panel chrome loose。\n  → 改用視覺 primitive 自組:ItemPrefix + ItemLabel + ItemSuffix(item-anatomy.tsx)+ ROW_PADDING_BY_SIZE.md\n  Why:panel-style 需對齊 chrome \`loose\` + utility chrome icon color(neutral-7 / fg-muted),MenuItem 兩處 workaround = 錯 layer。\n  Escape hatch:加 \`// panel-menuitem-allow: <reason>\` 在檔頭。"
  fi
fi

# ── Check 6: Overlay body 重新引入 flush / 等價 boolean variant(2026-05-01)──
# 對齊 patterns/overlay-surface/overlay-surface.spec.md「List-as-region in overlay body」。
# 2026-05-01 移除 flush(rationale:Material/Atlassian/Mantine/shadcn 主流不做 universal LayoutBody flush;
# variant 不解決底層脆弱 — 加 1 row search/banner 就破功)。
# 防止未來 silent re-introduction:DialogBody / SheetBody / PopoverBody tsx 內出現
# `flush?: boolean` / `flush = false` / `naked?: boolean` / `bare?: boolean` / `noPadding?: boolean` 同類 boolean 變體。
# Scope:`components/(Dialog|Sheet|Popover)/*.tsx`(非 stories)。
IS_OVERLAY_BODY_TSX=$(echo "$FILE_PATH" | grep -cE 'components/(Dialog|Sheet|Popover)/[^/]+\.tsx$' | head -1)
IS_OVERLAY_BODY_TSX=${IS_OVERLAY_BODY_TSX:-0}
if [ "$IS_OVERLAY_BODY_TSX" -ge 1 ] && ! echo "$FILE_PATH" | grep -qE '\.stories\.tsx$'; then
  STRIPPED_PROPS_PATTERN='(flush|naked|bare|stripped|unpadded|noPadding|paddingless)\??:\s*boolean'
  STRIPPED_HITS=$(grep -nE "$STRIPPED_PROPS_PATTERN" "$FILE_PATH" 2>/dev/null | head -3)
  if [ -n "$STRIPPED_HITS" ] && ! grep -qE 'overlay-body-stripped-variant-allow:' "$FILE_PATH" 2>/dev/null; then
    VIOLATIONS="${VIOLATIONS}\n⚠️ Overlay body 重新引入 stripped-padding boolean variant(2026-05-01 已移除):\n${STRIPPED_HITS}\n  → list-as-region in overlay body canonical = consumer 用 className override:\n    <DialogBody className=\"!px-0 !pt-0 !pb-0\"><div className=\"py-2\">{items}</div></DialogBody>\n  Why removed:Material/Atlassian/Mantine/shadcn 主流不做 universal LayoutBody flush;\n  variant 不解決底層脆弱(加 1 row search/banner 就破功)+ 把 1 surface decision 拆兩 API。\n  詳 overlay-surface.spec.md「List-as-region in overlay body」+ memory feedback_layout_v6_canonical.md\n  Escape hatch:加 \`// overlay-body-stripped-variant-allow: <reason>\` 在檔頭(必含 ≥3 家世界級對照 + multi-row hold 保證)。"
  fi
fi

if [ -n "$VIOLATIONS" ]; then
  ESCAPED=$(printf "%b" "$VIOLATIONS" | jq -Rs .)
  cat <<EOJSON
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Primitive consumption 檢查發現違規:${ESCAPED}"}}
EOJSON
fi

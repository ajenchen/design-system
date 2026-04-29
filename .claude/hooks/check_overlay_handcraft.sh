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
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

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
CB_COUNT=$(grep -c '<Checkbox\b' "$FILE_PATH" 2>/dev/null | head -1 || echo 0)
CBG_COUNT=$(grep -c '<CheckboxGroup\b' "$FILE_PATH" 2>/dev/null | head -1 || echo 0)
CB_COUNT=${CB_COUNT:-0}
CBG_COUNT=${CBG_COUNT:-0}
if [ "$CB_COUNT" -ge 2 ] && [ "$CBG_COUNT" -eq 0 ]; then
  CB_HITS=$(grep -nE '<Checkbox\b' "$FILE_PATH" 2>/dev/null | head -3)
  # allowlist: same-line or prev-line has // checkbox-group-allow:
  if ! grep -qE 'checkbox-group-allow:' "$FILE_PATH" 2>/dev/null; then
    VIOLATIONS="${VIOLATIONS}\n⚠️ 多個 raw <Checkbox> 未包 <CheckboxGroup>(${CB_COUNT} hits)— 違反 checkbox.spec.md 群組 canonical:\n${CB_HITS}\n  → 改用 <CheckboxGroup><Checkbox label=\"...\" />...</CheckboxGroup>\n  Why:CheckboxGroup 自帶 zero-gap canonical(SelectionItem py 公式)+ Context 隔離 fieldCtx + a11y group;raw 自刻 wrapper 違 mindset #2。\n  Escape hatch:加 \`// checkbox-group-allow: <reason>\` 在檔頭。"
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

if [ -n "$VIOLATIONS" ]; then
  ESCAPED=$(printf "%b" "$VIOLATIONS" | jq -Rs .)
  cat <<EOJSON
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Primitive consumption 檢查發現違規:${ESCAPED}"}}
EOJSON
fi

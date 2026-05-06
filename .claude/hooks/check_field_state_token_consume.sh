#!/bin/bash
set -uo pipefail
# M19 PreToolUse hook(2026-05-06 v13):Field state ring SSOT enforcement。
#
# Rules(v13 SSOT「focus dominates everything」):
# - **A**:naked variant 不寫平行 outline state ring(`outline-{border|primary}` /
#   `shadow-[inset` 等)— 用 Field default state machine 繼承
# - **B**(v13 NEW):per-control 不寫 `open && 'border-primary'` / `data-[state=open]:border-primary`
#   — Field default 統一處理 open=灰深(無 focus 時)/ focus=藍(focus-within !important 勝)
#
# 對齊 user spec(2026-05-06):
#   「sigle 控件 cell 視覺一致 / focus dominates everything / Material+Polaris+Ant 共識」
#
# 偵測 Edit/Write 動 components/*.tsx added line:
#   A1:`(hover|focus-within|focus-visible|data-\[state=open\]):shadow-\[inset` 舊 inset
#   A2:`(hover|focus-within|focus-visible|data-\[state=open\]):outline-(border|primary)` 自寫 outline
#   B :`(open|isOpen) && .{0,40}'border-primary'` 或 `data-\[state=open\]:border-primary` per-control 自寫 open=blue
#   → BLOCKER(改 Field default `field-wrapper.tsx` SSOT)
#
# Allowlist:行尾 `// @field-state-ring-allow: <reason>`。
# Skip:SSOT host(field-wrapper.tsx / textarea.tsx)+ stories / tests。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

case "$FILE_PATH" in
  *components/*.tsx) ;;
  *) exit 0 ;;
esac

# Skip SSOT hosts + non-prod files
case "$FILE_PATH" in
  */field-wrapper.tsx|*/textarea.tsx) exit 0 ;;
  *.stories.tsx|*.test.*|*.spec.tsx) exit 0 ;;
esac

NEW_STRING=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")

[ -z "${NEW_STRING//[[:space:]]/}" ] && exit 0

# Allowlist
if echo "$NEW_STRING" | grep -q '@field-state-ring-allow'; then
  exit 0
fi

# Match A: 舊 box-shadow inset 寫法
if echo "$NEW_STRING" | grep -E "(hover|focus-within|data-\[state=open\]):shadow-\[inset" >/dev/null; then
  cat >&2 <<'EOF'

┄┄┄ check_field_state_token_consume — M19 BLOCKER ┄┄┄

[P0] 偵測到 naked variant state ring 用 `box-shadow inset` 寫法。

⚠️  M19 canonical(2026-05-05 v9 architectural rewrite):naked **完全繼承 Field default
    state machine**(border-based)— hover:border-border-hover / focus-within:border-primary
    / data-[state=open]:border-border-hover。**不寫平行 outline / shadow ring**。

修法:讓 Field default state machine 自動繼承(naked compoundVariant 已正確設定);
若是 cell wrapper editable display hover affordance,用 `nakedCellEditableDisplayHover`
const(field-wrapper.tsx export)。

允: 行尾 `// @field-state-ring-allow: <reason>` 豁免。
EOF
  exit 2
fi

# Match A2: 自寫 outline state ring(naked context)
if echo "$NEW_STRING" | grep -E "(hover|focus-within|focus-visible|data-\[state=open\]):outline-(border|primary)" >/dev/null; then
  cat >&2 <<'EOF'

┄┄┄ check_field_state_token_consume — M19 BLOCKER(rule A2)┄┄┄

[P0] 偵測到自寫 outline state ring(`hover:outline-border` / `focus-within:outline-primary` 等)。

⚠️  v13 canonical:naked variant **不寫 outline state ring**,完全繼承 Field default
    state machine(border-based)。前 v4-v8 outline-2 平行系統已 retire。

修法:讓 Field default 自動繼承 / cell wrapper editable display hover 信號用
`nakedCellEditableDisplayHover` const。

允:行尾 `// @field-state-ring-allow: <reason>` 豁免。
EOF
  exit 2
fi

# Match B(v13.5 NEW): per-control 自寫 open=blue override
if echo "$NEW_STRING" | grep -E "(open|isOpen) +&& +.{0,40}('border-primary'|\"border-primary\")" >/dev/null \
   || echo "$NEW_STRING" | grep -E "data-\[state=open\]:border-primary" >/dev/null; then
  cat >&2 <<'EOF'

┄┄┄ check_field_state_token_consume — M19 BLOCKER(rule B v13.5)┄┄┄

[P0] 偵測到 per-control 自寫 `open && 'border-primary'` 或 `data-[state=open]:border-primary`
state override(Combobox/Select/PeoplePicker 等之前各自加,造成 specificity 不可預測 + 跨控件不一致)。

⚠️  v13.3 canonical「focus dominates everything」:state machine SSOT 在 `field-wrapper.tsx`
    Field default compoundVariant 統一 — open(無 focus)= 灰深 `data-[state=open]:border-border-hover`,
    focus(cursor in input)= 藍 `focus-within:!border-primary`(!important 勝過 data-state)。

    Per-control 不要自己 override open 顏色 — 改 Field default 一處全 control + cell + 各 variant 跟動。

修法:刪掉這行 `open && 'border-primary'`。Radix Popover open 時 trigger 通常 focused →
focus-within fires → 藍(自然達成 Ant 風視覺)。需特殊行為 → 跟 user 討論改 Field default SSOT。

允:行尾 `// @field-state-ring-allow: <reason>` 豁免(極罕,需 spec.md 補 rationale)。
EOF
  exit 2
fi

exit 0

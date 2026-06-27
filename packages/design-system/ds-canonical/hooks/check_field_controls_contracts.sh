#!/bin/bash
# check_field_controls_contracts.sh — Stream C shared contracts(a)(b)(c)(d) consolidated guardrail
#
# 2026-05-13 prune consolidation(per knowledge-prune Phase 2 P1):3 hook 合 1:
#   - 原 check_field_placeholder_vocabulary.sh — contract (b)
#   - 原 check_selected_renderer_symmetry.sh — contract (a)
#   - 原 check_cell_metric_escape_hatches.sh — contract (c)
# 同 PostToolUse Edit/Write target(Field family packages/design-system/src/components/*.tsx),
# 合 1 hook 減少 hook count 從 27 → 25 回 soft cap 內,單一 entry settings.json。
# 對齊 field-controls.spec.md 共享 contract (a) Selected value renderer / (b) Placeholder vocabulary /
# (c) Cell surface metrics 3 段 canonical。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)

case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
[ "$EVENT" != "PostToolUse" ] && exit 0
[ ! -f "$FILE_PATH" ] && exit 0

VIOLATIONS=""

# ── Contract (b) Placeholder vocabulary ───────────────────────────────────────
# Scope: 所有 packages/design-system/src/components/*.tsx
case "$FILE_PATH" in
  */packages/design-system/src/components/*.tsx)
    if ! head -3 "$FILE_PATH" | grep -qE '//[[:space:]]*@placeholder-vocabulary-allow:'; then
      HITS=$(grep -nE 'emptyPlaceholder=\{(emptyText|searchEmpty|noResults|notFound)' "$FILE_PATH" 2>/dev/null)
      if [ -n "$HITS" ]; then
        VIOLATIONS="${VIOLATIONS}
[contract (b) placeholder vocabulary]:
${HITS}
  → 違反 field-controls.spec.md「共享 contract (b)」:不可 silent 把 emptyText forward 成 emptyPlaceholder(trigger-empty)。
  Fix:wrapper 加 \`placeholder\` prop(trigger empty SSOT)+ \`emptyText\` 僅傳 SelectMenu noResultsText。
  Allow:檔首加 \`// @placeholder-vocabulary-allow: <reason>\`。"
      fi
    fi
    ;;
esac

# ── Contract (a) Selected value renderer symmetry ─────────────────────────────
# Scope:Combobox / Select / PeoplePicker only
case "$FILE_PATH" in
  */packages/design-system/src/components/Combobox/*.tsx|*/packages/design-system/src/components/Select/*.tsx|*/packages/design-system/src/components/PeoplePicker/*.tsx)
    if ! head -3 "$FILE_PATH" | grep -qE '//[[:space:]]*@renderer-symmetry-allow:'; then
      DEFINES_RENDERER=$(grep -cE '(tagRenderer|selectedItemRenderer)\?:\s*\(' "$FILE_PATH" 2>/dev/null | head -1)
      DEFINES_RENDERER=${DEFINES_RENDERER:-0}
      if [ "$DEFINES_RENDERER" -gt 0 ]; then
        EDIT_HITS=$(grep -cE 'tagRenderer\(.*\)|selectedItemRenderer\(.*\)' "$FILE_PATH" 2>/dev/null | head -1)
        EDIT_HITS=${EDIT_HITS:-0}
        DISPLAY_LINES=$(grep -nE "mode\s*=*\s*'display'|resolvedMode\s*==*\s*'display'" "$FILE_PATH" 2>/dev/null | cut -d: -f1)
        if [ "$EDIT_HITS" -gt 0 ] && [ -n "$DISPLAY_LINES" ]; then
          HAS_RENDERER_IN_DISPLAY=0
          for LN in $DISPLAY_LINES; do
            END=$((LN + 60))
            if awk -v s="$LN" -v e="$END" 'NR>=s && NR<=e' "$FILE_PATH" | grep -qE 'tagRenderer|selectedItemRenderer'; then
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

# ── Contract (c) Cell metric escape hatches ───────────────────────────────────
# Scope:Combobox / Select / PeoplePicker only
case "$FILE_PATH" in
  */packages/design-system/src/components/Combobox/*.tsx|*/packages/design-system/src/components/PeoplePicker/*.tsx|*/packages/design-system/src/components/Select/*.tsx)
    if ! head -3 "$FILE_PATH" | grep -qE '//[[:space:]]*@cell-metric-escape-allow:'; then
      HARDCODE_HITS=$(grep -nE 'tagAreaPaddingLeftPx=\{[0-9]+\}' "$FILE_PATH" 2>/dev/null)
      COND_NO_SURFACE=$(grep -nE 'tagAreaPaddingLeftPx=\{[^}]*\?[^}]*[0-9]+[^}]*\}' "$FILE_PATH" 2>/dev/null | grep -v "surface")
      WARN=""
      [ -n "$HARDCODE_HITS" ] && WARN="${WARN}
[hardcode numeric without surface guard]:
${HARDCODE_HITS}"
      [ -n "$COND_NO_SURFACE" ] && WARN="${WARN}
[conditional without surface check]:
${COND_NO_SURFACE}"
      if [ -n "$WARN" ]; then
        VIOLATIONS="${VIOLATIONS}
[contract (c) cell metric escape hatch]:
${FILE_PATH}${WARN}
  → 違反 field-controls.spec.md「共享 contract (c)」:cell 內禁 hardcode padding magic,改 \`useFieldSurface()\` + \`--table-cell-px\` 推導。
  Fix pattern: tagAreaPaddingLeftPx={(!isEmpty && surface === 'form') ? 8 : undefined}
  Allow:檔首加 \`// @cell-metric-escape-allow: <reason>\`。"
      fi
    fi
    ;;
esac

# ── Contract (d) field-px token(2026-06-27;round-2 對抗驗證 2026-06-27 補洞)──────
# Scope:消費 --field-px 的 field controls(form 水平內距 SSOT)。12px 已 tokenize → production
#       code 禁 hardcode `0.75rem`(inline override)或裸 `px-3`/`pr-3`(uiSize.css:29
#       「取代散落的 px-3 / inline 0.75rem」canonical;M34 hook 廣度對齊 spec wording)。
#       PeoplePicker 補進 scope(round-1 漏:其 form-context inject `!px-[var(--field-px)]`)。
# 豁免(避免 false-positive):
#   - `*.stories.tsx`(anatomy/principles 內含合法 token 對照標註 + demo 容器 px-3 layout,非 padding hardcode)
#   - comment 行(`//` `*` `/*` 開頭 — migration 註解可合法 reference 舊 px-3/0.75rem 形式)
#   - 已 tokenize 的 `px-[var(--field-px)]`
case "$FILE_PATH" in
  *.stories.tsx) ;;
  */packages/design-system/src/components/Select/*.tsx|*/packages/design-system/src/components/Combobox/*.tsx|*/packages/design-system/src/components/Input/*.tsx|*/packages/design-system/src/components/NumberInput/*.tsx|*/packages/design-system/src/components/Textarea/*.tsx|*/packages/design-system/src/components/DatePicker/*.tsx|*/packages/design-system/src/components/TimePicker/*.tsx|*/packages/design-system/src/components/LinkInput/*.tsx|*/packages/design-system/src/components/PeoplePicker/*.tsx|*/packages/design-system/src/components/Field/*.tsx)
    if ! head -3 "$FILE_PATH" | grep -qE '//[[:space:]]*@field-px-escape-allow:'; then
      FIELDPX_HITS=$(grep -nE "0\.75rem|(^|[^a-zA-Z0-9-])!?(px|pr)-3([^0-9.]|$)" "$FILE_PATH" 2>/dev/null \
        | grep -vE '^[0-9]+:[[:space:]]*(//|\*|/\*)' \
        | grep -vE 'px-\[var')
      if [ -n "$FIELDPX_HITS" ]; then
        VIOLATIONS="${VIOLATIONS}
[contract (d) field-px]:
${FIELDPX_HITS}
  → field 水平內距 12px 已 tokenize 為 --field-px(field-controls.spec.md「右側元素」canonical + tokens/uiSize/uiSize.css)。production 禁 hardcode 0.75rem / 裸 px-3,改 \`paddingRight: 'var(--field-px)'\` / \`px-[var(--field-px)]\`。
  Allow:檔首加 \`// @field-px-escape-allow: <reason>\`。"
      fi
    fi
    ;;
esac

if [ -n "$VIOLATIONS" ]; then
  CTX="⚠️ Field controls shared contracts violation(consolidated check):${VIOLATIONS}"
  jq -n --arg ctx "$CTX" '{
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: $ctx }
  }'
fi

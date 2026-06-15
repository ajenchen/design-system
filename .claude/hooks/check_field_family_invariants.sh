#!/bin/bash
# Field family unified invariant hook(2026-05-08 cluster A consolidation)
#
# Merges PreToolUse hooks(原各檔已 retire,合併入此)— 共 5 條 sub-rules:
#   A.1 naked row-mode propagation(原 check_naked_row_mode_propagation,P0 BLOCKER)
#   A.2 FieldControlGroup wrapper direct child(原 check_field_control_group_direct_child,P1 WARN)
#   A.3 Field state ring SSOT(原 check_field_state_token_consume 3 sub-rules,P0 BLOCKER)
#   A.4 disabled placeholder color(原 check_disabled_placeholder_color,P1 stderr only)
#   A.5 _Group child fieldCtx.id 隔離(2026-05-31 折入,M4 AR34 regression detector,P0 BLOCKER)
#
# Why merge:皆 Field 家族 invariant,共用 INPUT parsing + Edit/Write filter pattern,
#   分散在 4 個 hook 是「散裝 SSOT」(M17 + Anthropic ≤ 15 hook best practice 違反)。
#
# Exit code precedence:BLOCK(2)> WARN(1)> INFO(0)。每 rule 可獨立觸發,worst 勝。
#
# Per-rule allowlist(各自獨立):
#   A.1: `// @naked-row-mode-allow: <reason>`
#   A.2: `// @fcg-wrapper-allow: <reason>` 或檔頭
#   A.3: `// @field-state-ring-allow: <reason>`
#   A.4: `// @disabled-color-allow: <reason>`
#   A.5: `// @group-fieldctx-allow: <reason>`

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

# Tool filter — 只 Edit/Write/MultiEdit 跑
case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

# 不是 .tsx / .ts 直接過(各 rule 內部還會再 narrow)
case "$FILE_PATH" in
  *.tsx|*.ts) ;;
  *) exit 0 ;;
esac

# 讀 merged content(舊檔 + 新 edit 拼起)— A.1 / A.3 需要整檔判 naked variant 存在性
FILE_CONTENT=""
if [ -f "$FILE_PATH" ]; then
  FILE_CONTENT=$(cat "$FILE_PATH")
fi
NEW_CONTENT=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")

# A.2 / A.4 只看 NEW_CONTENT(diff-level signal),A.1 / A.3 看 MERGED
MERGED_CONTENT="${FILE_CONTENT}
${NEW_CONTENT}"

[ -z "${MERGED_CONTENT//[[:space:]]/}" ] && exit 0

WORST=0
record_worst() { local lvl=$1; [ "$lvl" -gt "$WORST" ] && WORST=$lvl; }

# ── A.1 naked row-mode propagation(P0 BLOCKER)─────────────────────────────────
case "$FILE_PATH" in
  *components/*.tsx)
    case "$FILE_PATH" in
      */field-wrapper.tsx|*/textarea.tsx) ;; # SSOT host skip
      *)
        if ! echo "$MERGED_CONTENT" | grep -q '@naked-row-mode-allow' \
           && echo "$MERGED_CONTENT" | grep -E "variant:\s*['\"]naked['\"]|variant=\{?['\"]naked['\"]" >/dev/null \
           && echo "$MERGED_CONTENT" | tr '\n' ' ' | grep -E "(inline-flex|flex)[^\"'\`]*items-center" >/dev/null \
           && ! echo "$MERGED_CONTENT" | grep -q "nakedCellRowModeAlign"; then
          cat >&2 <<EOF

┄┄┄ A.1 check_field_family_invariants — naked row-mode propagation BLOCKER ┄┄┄

[P0] ${FILE_PATH}
偵測到此檔消費 \`variant="naked"\` + 內部 wrapper hardcode \`items-center\`,
但**未** import / apply \`nakedCellRowModeAlign\` SSOT。

⚠️  M19 canonical:naked variant 元件所有內部 wrapper 必 propagate host cell
    \`data-row-mode\`(autoRow→items-start / fixed→items-center)。

修法:
  1. import { nakedCellRowModeAlign } from '@/design-system/components/Field/field-wrapper'
  2. wrapper className 加上 SSOT(eg \`cn('flex-1 min-w-0 inline-flex items-center', nakedCellRowModeAlign)\`)
  3. 例外:行尾 \`// @naked-row-mode-allow: <reason>\`

EOF
          record_worst 2
        fi
        ;;
    esac
    ;;
esac

# ── A.2 FieldControlGroup wrapper direct child(P1 WARN)────────────────────────
case "$FILE_PATH" in
  *.tsx)
    if echo "$NEW_CONTENT" | grep -q '<FieldControlGroup' \
       && ! echo "$NEW_CONTENT" | grep -q '@fcg-wrapper-allow'; then
      SUSPECT=$(printf '%s' "$NEW_CONTENT" | awk '
        /<FieldControlGroup/ { inFCG=1; next }
        /<\/FieldControlGroup>/ { inFCG=0; next }
        inFCG && /^[[:space:]]*<(div|span)[[:space:]>]/ {
          if ($0 !~ /display:[[:space:]]*contents/ && $0 !~ /@fcg-wrapper-allow/) print NR ":" $0
        }
      ')
      if [ -n "$SUSPECT" ]; then
        cat >&2 <<EOF

┄┄┄ A.2 check_field_family_invariants — FieldControlGroup wrapper WARN ┄┄┄

[P1] ${FILE_PATH}
偵測到 FieldControlGroup 內有 \`<div>\` / \`<span>\` wrapper(可能破壞 CSS \`[&>*]\` variants):
${SUSPECT}

修法 3 擇 1:
  1. 移除 wrapper,Field control 直接是 FieldControlGroup direct child
  2. 透過 prop forward className(eg \`<FilterValuePicker className="flex-1 min-w-0">\`)
  3. wrapper 用 \`display:contents\` / 加 \`// @fcg-wrapper-allow: <reason>\`

EOF
        record_worst 1
      fi
    fi
    ;;
esac

# ── A.3 Field state ring SSOT(P0 BLOCKER,3 sub-rules)─────────────────────────
case "$FILE_PATH" in
  *components/*.tsx)
    case "$FILE_PATH" in
      */field-wrapper.tsx|*/textarea.tsx|*.stories.tsx|*.test.*|*.spec.tsx) ;; # SSOT/test skip
      *)
        if ! echo "$NEW_CONTENT" | grep -q '@field-state-ring-allow'; then
          # A.3.1 舊 box-shadow inset
          if echo "$NEW_CONTENT" | grep -E "(hover|focus-within|data-\[state=open\]):shadow-\[inset" >/dev/null; then
            cat >&2 <<'EOF'

┄┄┄ A.3.1 check_field_family_invariants — Field state ring shadow inset BLOCKER ┄┄┄

[P0] naked variant state ring 用 `box-shadow inset` — v9 retire pattern。
修法:讓 Field default state machine 自動繼承(border-based);cell hover 用 `nakedCellEditableDisplayHover` const。

EOF
            record_worst 2
          fi
          # A.3.2 自寫 outline state ring
          if echo "$NEW_CONTENT" | grep -E "(hover|focus-within|focus-visible|data-\[state=open\]):outline-(border|primary)" >/dev/null; then
            cat >&2 <<'EOF'

┄┄┄ A.3.2 check_field_family_invariants — Field state ring outline BLOCKER ┄┄┄

[P0] 自寫 `hover:outline-border` / `focus-within:outline-primary` — v13 canonical 禁。
修法:Field default 自動繼承 / cell 用 `nakedCellEditableDisplayHover` const。

EOF
            record_worst 2
          fi
          # A.3.3 per-control open=blue override(v13.5)
          # 2026-06-11 deep-audit R2(n=38)精準化(M7 broad-vs-narrow 3-column):
          #   Spec wording:v13.3 禁「open 時 per-control 把 border 轉 primary(藍)」。
          #   Hook regex(舊):substring 無 boundary + 不分註解行。
          #   Gap:誤命中 (a) `data-[state=open]:border-primary-hover` canonical(button.tsx:99,109
          #     overlay trigger 維持 hover 樣式,-hover/-active 是合法 token 後綴);(b) v13.3 retire
          #     註解內引用舊 pattern 文字(combobox.tsx:725 / select.tsx:594)。
          #   修:純註解行剝離 + border-primary 加字尾 boundary([^-a-zA-Z]|$)。
          #   DS-wide counter-example scan 2026-06-11:新 regex 全 components/ 0 hit(真違規 shape
          #   `open && 'border-primary'` / `data-[state=open]:border-primary` 結尾 仍 BLOCK,fixture 驗證)。
          A33_CONTENT=$(echo "$NEW_CONTENT" | grep -vE '^[[:space:]]*(//|\*|/\*)')
          if echo "$A33_CONTENT" | grep -E "(open|isOpen) +&& +.{0,40}('border-primary'|\"border-primary\")" >/dev/null \
             || echo "$A33_CONTENT" | grep -E "data-\[state=open\]:border-primary([^-a-zA-Z]|$)" >/dev/null; then
            cat >&2 <<'EOF'

┄┄┄ A.3.3 check_field_family_invariants — per-control open=blue BLOCKER ┄┄┄

[P0] per-control `open && 'border-primary'` / `data-[state=open]:border-primary` — v13.3 canonical「focus dominates everything」禁。
修法:刪 override。Radix Popover open 時 trigger 通常 focused → focus-within fires → 藍(自然 Ant 風)。改 Field default SSOT 須 spec 補 rationale。

EOF
            record_worst 2
          fi
        fi
        ;;
    esac
    ;;
esac

# ── A.4 disabled placeholder color(P1 stderr,exit 0 不 block)──────────────────
if ! echo "$NEW_CONTENT" | grep -q '@disabled-color-allow'; then
  SUSPECT_DP=""
  if echo "$NEW_CONTENT" | grep -E "placeholder:text-fg-muted" >/dev/null \
     && ! echo "$NEW_CONTENT" | grep -E "(disabled:placeholder:text-fg-disabled|group-data-\[field-mode=disabled\].*placeholder:text-fg-disabled|resolvedMode\s*===\s*'disabled'.*text-fg-disabled)" >/dev/null; then
    SUSPECT_DP="$SUSPECT_DP [placeholder:text-fg-muted 無 disabled override]"
  fi
  if echo "$NEW_CONTENT" | tr '\n' ' ' | grep -E '<span[^>]*"text-fg-muted"[^>]*>[[:space:]]*\{[^}]*placeholder' >/dev/null 2>&1 \
     && ! echo "$NEW_CONTENT" | grep -E "resolvedMode\s*===\s*'disabled'" >/dev/null; then
    SUSPECT_DP="$SUSPECT_DP [<span text-fg-muted>{placeholder} 不分 mode]"
  fi
  if [ -n "$SUSPECT_DP" ]; then
    cat >&2 <<EOF

┄┄┄ A.4 check_field_family_invariants — disabled placeholder color WARN ┄┄┄

[P1] ${FILE_PATH}
${SUSPECT_DP}
修法:disabled:placeholder:text-fg-disabled / group-data-[field-mode=disabled]/field:placeholder:text-fg-disabled / JSX 條件
詳:tokens/color/color.spec.md「Disabled state precedence canonical」/ M24
例外:行尾 \`// @disabled-color-allow: <reason>\`

EOF
    # A.4 原 hook exit 0(stderr only),保持向後兼容不升 WORST
  fi
fi

# ── A.5 _Group child fieldCtx.id 隔離(P0 BLOCKER,2026-05-31 折入,M4 AR34 regression detector)──
# M4:_Group 元件(CheckboxGroup/RadioGroup/SwitchGroup)的 child item 不可共用 fieldCtx.id —— 否則
# group 內所有 label 被抑制 + 點 label 只 toggle 第一個(AR34 root bug)。正解:item 在 group 內走自己
# 的 generatedId,不 fall back 到共用 fieldCtx.id。偵測 AR34 regression shape(MERGED 整檔,3-signal AND):
#   (1) 消費 *GroupContext  (2) bare `idProp ?? fieldCtx?.id ?? generatedId` fallback
#   (3) 缺 `insideGroup ? generatedId` / `inGroup ? generatedId` group guard
case "$FILE_PATH" in
  *components/*.tsx)
    if ! echo "$MERGED_CONTENT" | grep -q '@group-fieldctx-allow' \
       && echo "$MERGED_CONTENT" | grep -qE 'useContext\([A-Za-z_]*GroupContext\)' \
       && echo "$MERGED_CONTENT" | grep -qE 'idProp[[:space:]]*\?\?[[:space:]]*fieldCtx\?\.id[[:space:]]*\?\?[[:space:]]*generatedId' \
       && ! echo "$MERGED_CONTENT" | grep -qE '(insideGroup|inGroup)[[:space:]]*\?[[:space:]]*generatedId'; then
      cat >&2 <<EOF

┄┄┄ A.5 check_field_family_invariants — _Group child fieldCtx.id 隔離 BLOCKER ┄┄┄

[P0] ${FILE_PATH}
偵測到 _Group child item 消費 GroupContext + bare \`idProp ?? fieldCtx?.id ?? generatedId\` fallback,
但**缺** group guard(\`insideGroup ? generatedId\`)= M4 AR34 regression shape。

⚠️  M4 canonical:Group 內 item 不可共用 fieldCtx.id(否則所有 label 被抑制 + 點 label 只 toggle 第一個)。

修法:
  inputId = idProp ?? (insideGroup ? generatedId : (fieldCtx?.id ?? generatedId))
  即 group 內走自己的 generatedId,不 fall back 共用 fieldCtx.id。
  例外:行尾 \`// @group-fieldctx-allow: <reason>\`

EOF
      record_worst 2
    fi
    ;;
esac

exit $WORST

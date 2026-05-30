#!/bin/bash
# Pattern invariants unified hook(2026-05-08 cluster C consolidation)
#
# Merges 4 PreToolUse hooks(原各檔已 retire,合併入此):
#   C.1 overlay panel scroll chain(原 check_overlay_panel_scroll_chain,P1 WARN stderr)
#   C.2 inline-action canonical gap(原 check_inline_action_canonical_gap,P1 WARN stderr)
#   C.3 primitive wrapper padding(原 check_primitive_wrapper_padding,P0 BLOCK exit 2)
#   C.4 row slot handcraft(原 check_row_slot_handcraft,P0 BLOCK exit 2)
#
# Why merge:皆 element-anatomy / overlay-surface SSOT 消費紀律 invariant,共用 INPUT
# parsing + tsx filter,散裝是 M17 + Anthropic ≤ 15 hook best-practice 偏離。
#
# Exit precedence:BLOCK(2)> WARN-stderr(0)。每 rule 獨立 fire,worst 勝。
#
# Per-rule allowlist:
#   C.1: `// @scroll-chain-allow: <reason>`(any line)
#   C.2: `// @inline-action-gap-allow: <reason>`(any line)
#   C.3: `// @primitive-padding-allow: <reason>`(檔案前 5 行)
#   C.4: `// @row-slot-handcraft-allow: <reason>`(any line)

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

case "$FILE_PATH" in
  *.tsx) ;;
  *) exit 0 ;;
esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")

[ -z "${NEW_CONTENT//[[:space:]]/}" ] && exit 0

WORST=0
record_worst() { local lvl=$1; [ "$lvl" -gt "$WORST" ] && WORST=$lvl; }

# ── C.1 overlay panel scroll chain(P1 WARN stderr only)──────────────────────
if ! echo "$NEW_CONTENT" | grep -q '@scroll-chain-allow' \
   && echo "$NEW_CONTENT" | grep -q '<SurfaceBody'; then
  SUSPECT_C1=$(printf '%s' "$NEW_CONTENT" | awk '
    /^[[:space:]]*<div[[:space:]]/ {
      line = $0
      while (index(line, ">") == 0 && (getline next_line) > 0) line = line " " next_line
      if (line ~ /w-\[/ && (line !~ /flex[^"]*flex-col/ || line !~ /h-full/ || line !~ /min-h-0/)) {
        for (k = 0; k < 30 && (getline next_line) > 0; k++) {
          if (next_line ~ /<SurfaceBody/) {
            print "[panel root w-[...] 缺 flex flex-col h-full min-h-0]: " substr(line, 1, 100)
            break
          }
          if (next_line ~ /<\/div>/) break
        }
      }
    }
  ')
  if [ -n "$SUSPECT_C1" ]; then
    cat >&2 <<EOF

┄┄┄ C.1 check_pattern_invariants — overlay scroll chain WARN ┄┄┄

[P1] ${FILE_PATH}
${SUSPECT_C1}

⚠️  M25 canonical:Popover/HoverCard/Dialog/Sheet viewport-aware scroll 要求 root → SurfaceBody
    所有中間 wrapper forward \`flex flex-col h-full\`。斷鏈 → SurfaceBody flex-1 失效。

修法:wrapper className 加 \`flex flex-col h-full\`(最小組合 \`flex flex-col h-full min-h-0\`)
詳 patterns/overlay-surface/overlay-surface.spec.md「Viewport-aware scroll chain invariant」/ M25
例外:行尾 \`// @scroll-chain-allow: <reason>\`

EOF
  fi
fi

# ── C.2 inline-action canonical gap(P1 WARN stderr only)─────────────────────
case "$FILE_PATH" in
  *components/*.tsx|*patterns/*.tsx)
    case "$FILE_PATH" in
      */item-anatomy.tsx|*.stories.tsx|*.test.*) ;; # SSOT/test skip
      *)
        if ! echo "$NEW_CONTENT" | grep -q '@inline-action-gap-allow' \
           && echo "$NEW_CONTENT" | grep -qE '<ItemInlineAction(Button)?\b|DropdownMenuTrigger.*ItemInlineAction'; then
          WRONG_GAP=$(echo "$NEW_CONTENT" | grep -nE 'className=.*\bgap-(1|3|4|5|6|8|10|12)\b' | head -3 || true)
          if [ -n "$WRONG_GAP" ]; then
            cat >&2 <<EOF

┄┄┄ C.2 check_pattern_invariants — inline-action gap WARN ┄┄┄

[P1] ${FILE_PATH}
ItemInlineAction* consumer 用非 \`gap-2\` 的 gap class:
${WRONG_GAP}

⚠️  inline-action.spec.md:80:inline-action 跟 sibling gap 必 \`gap-2\`(8px)。
    12px = --table-cell-px(cell L/R padding,不是 inline-action gap)。

修法:className gap → gap-2 / 加 \`// @inline-action-gap-allow: <reason>\` 行尾豁免

EOF
          fi
        fi
        ;;
    esac
    ;;
esac

# ── C.3 primitive wrapper padding(P0 BLOCK exit 2)───────────────────────────
# File-level allowlist:檔頭前 5 行
ALLOW_C3=0
FIRST_LINES_NEW=$(printf '%s\n' "$NEW_CONTENT" | sed -n '1,5p')
echo "$FIRST_LINES_NEW" | grep -qE '//[[:space:]]*@primitive-padding-allow:' && ALLOW_C3=1
if [ -f "$FILE_PATH" ] && [ "$ALLOW_C3" = "0" ]; then
  ON_DISK_FIRST=$(sed -n '1,5p' "$FILE_PATH" 2>/dev/null || true)
  echo "$ON_DISK_FIRST" | grep -qE '//[[:space:]]*@primitive-padding-allow:' && ALLOW_C3=1
fi
if [ "$ALLOW_C3" = "0" ]; then
  PRIMITIVES_REGEX='DateGrid|Calendar|Surface|SurfaceHeader|SurfaceBody|SurfaceFooter'
  VIOLATIONS_C3=$(printf '%s' "$NEW_CONTENT" | perl -0777 -ne '
    while (/<div\b[^>]*className\s*=\s*["\x27`][^"\x27`]*\bp-\d+[^"\x27`]*["\x27`][^>]*>(?:[^<]*<(?!\/div\b)){0,8}\s*<('"$PRIMITIVES_REGEX"')\b/gs) {
      my $primitive = $1;
      my $offset = $-[0];
      my $before = substr($_, 0, $offset);
      my $line = ($before =~ tr/\n//) + 1;
      print "line $line: <div className=\"...p-X...\"> wrapping <$primitive>\n";
    }
  ')
  if [ -n "$VIOLATIONS_C3" ]; then
    cat >&2 <<EOF

┄┄┄ C.3 check_pattern_invariants — primitive wrapper padding BLOCKER ┄┄┄

[P0] ${FILE_PATH}
${VIOLATIONS_C3}

SSOT primitive 自帶 outer padding,**consumer 不得另加 padding wrapper**:
  - DateGrid / Calendar:root 自帶 p-3
  - Surface{Header,Body,Footer}:各 segment 自帶 padding

修法:直接放 primitive,不包 padding div。
  ❌ <div className="p-2"><DateGrid /></div>
  ✅ <DateGrid />

整檔豁免:檔頭前 5 行加 \`// @primitive-padding-allow: <reason>\`(需 spec rationale)。
詳 mindset #2 + M1 SSOT 消費。

EOF
    record_worst 2
  fi
fi

# ── C.4 row slot handcraft(P0 BLOCK exit 2)──────────────────────────────────
case "$FILE_PATH" in
  *components/*.tsx|*patterns/*.tsx)
    case "$FILE_PATH" in
      */item-anatomy.tsx|*/field-wrapper.tsx|*.stories.tsx|*.test.*|*.spec.tsx) ;; # SSOT/test skip
      *)
        # 2026-05-30(dim 39 M7/M34 fix):order-INDEPENDENT — extract className attrs,require ALL 4 tokens
        # present(natural Tailwind 序 `flex items-center gap-2 shrink-0 h-[1lh]` 之前漏抓)。BSD/GNU grep 通用。
        if ! echo "$NEW_CONTENT" | grep -q '@row-slot-handcraft-allow' \
           && echo "$NEW_CONTENT" | grep -oE 'class(Name)?="[^"]*"' | grep -F 'h-[1lh]' | grep -F 'shrink-0' | grep -F 'flex' | grep -F 'items-center' >/dev/null 2>&1; then
          cat >&2 <<EOF

┄┄┄ C.4 check_pattern_invariants — row slot handcraft BLOCKER ┄┄┄

[P0] ${FILE_PATH}
偵測自刻 row-layout slot:\`<span class="h-[1lh] shrink-0 flex items-center...">\`
M1+M17 違反 — 該消費 L1 primitive。

⚠️  M19 canonical(2026-05-05 v8):row prefix/suffix slot 必走 patterns/element-anatomy:
  import { ItemPrefix, ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'
  <ItemPrefix><StartIcon /></ItemPrefix>
  <ItemSuffix>{chevron}</ItemSuffix>

\`<ItemPrefix>\` / \`<ItemSuffix>\` 永遠 \`h-[1lh] shrink-0 flex items-center\`(item-anatomy.spec.md:175+190)。
例外:行尾 \`// @row-slot-handcraft-allow: <reason>\`

EOF
          record_worst 2
        fi
        ;;
    esac
    ;;
esac

exit $WORST

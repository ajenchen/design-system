#!/bin/bash
# PreToolUse hook: detect consumer 自建的 visual container(bg/border/shadow)缺 inner padding。
#
# Motivation(CLAUDE.md + element-anatomy.spec.md「視覺容器 breathing invariant」· 2026-04-22):
#   任何有視覺邊界(permanent bg-* / border / shadow-*)的容器必有 inner padding,
#   不讓內容物觸容器邊。責任在父容器。
#
# 世界級一致:Material / Polaris / Atlassian / Ant / Apple HIG / Carbon 6 家 chrome 都 own 內 padding。
#
# 反例(本 session 2026-04-22 糾正):
#   <div className="bg-surface-raised rounded-lg">{rich FileItem map}</div>
#   → rich card w-full 貼父 div 邊,兩層 rounded 視覺卡在一起
#
# 檢查 pattern(保守:只 warn,不 block — 靜態 grep 無法完美判斷):
#   P1 WARN  `<div className="...bg-* | border | shadow-*...">` 且同 className 無 p*- / px-* / py-*
#            → warn consumer 可能漏 padding
#
# Scope: *.tsx(component + story + exploration)
#
# Allowlist:
#   // @breathing-exempt: <reason>(整檔豁免)
#   // @breathing-exempt-next(下一行豁免)
#
# Exit codes:
#   exit 0 — pass(P1 warn 也走 0,不 block;重要改 chrome primitive 可升級為 block)
#
# 不攔截的情境(AI 判斷,非 hook 責任):
#   - 子元件自己的 class(如 Button `bg-primary px-3` 已有 padding)
#   - p-0 刻意覆寫(如 SheetBody variant="list" `py-2`)
#   - 無 bg 的 flex container 只用 border separator

set -euo pipefail

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

if [ -z "${NEW_CONTENT//[[:space:]]/}" ]; then
  exit 0
fi

# ── File-level allowlist ──
FIRST_LINES=$(printf '%s\n' "$NEW_CONTENT" | sed -n '1,3p')
if echo "$FIRST_LINES" | grep -qE '//[[:space:]]*@breathing-exempt:'; then
  exit 0
fi
if [ -f "$FILE_PATH" ]; then
  ON_DISK_FIRST=$(sed -n '1,3p' "$FILE_PATH" 2>/dev/null || true)
  if echo "$ON_DISK_FIRST" | grep -qE '//[[:space:]]*@breathing-exempt:'; then
    exit 0
  fi
fi

WARN_VIOLATIONS=""

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
printf '%s\n' "$NEW_CONTENT" > "$TMP"

ROW=0
SKIP_NEXT=0
while IFS= read -r LINE || [ -n "$LINE" ]; do
  ROW=$((ROW+1))

  if [ "$SKIP_NEXT" = "1" ]; then
    SKIP_NEXT=0
    continue
  fi
  if echo "$LINE" | grep -qE '//[[:space:]]*@breathing-exempt-next|\{/\*[[:space:]]*@breathing-exempt-next'; then
    SKIP_NEXT=1
    continue
  fi

  # P1 WARN: `<div className="..."` contains visual-boundary class(bg-*/border/shadow-*)且 same className 無 padding
  #
  # heuristic:只查 div / section 等 structural element,不查 children 元件(Button / Input 等自帶 padding)
  # 視覺邊界 class:
  #   bg-surface* / bg-neutral-* / bg-primary* / bg-error* / bg-* (有色的,不含 bg-transparent)
  #   border / border-* (但 border-0 / border-transparent 不算)
  #   shadow-[var(--elevation-* (不含 shadow-none)
  # Padding class:
  #   p-[0-9]+ / px-[0-9]+ / py-[0-9]+ / p-\[var(--layout-space-* / px-\[var / py-\[var / p-calc / p-0(刻意移除也算宣告)
  if echo "$LINE" | grep -qE '<(div|section|aside|header|footer|main|nav)[^>]*className="[^"]*"'; then
    # Extract className content(best-effort for single-line):
    CLASSNAMES=$(echo "$LINE" | grep -oE 'className="[^"]+"' | head -1)
    # Has visual boundary?
    HAS_BG=$(echo "$CLASSNAMES" | grep -qE '\bbg-(surface|neutral|primary|error|warning|success|info|inverse|overlay)[a-z0-9-]*|\bbg-\[' && echo 1 || echo 0)
    HAS_BORDER=$(echo "$CLASSNAMES" | grep -qE '\bborder(-[a-z0-9]+)?\b' && ! echo "$CLASSNAMES" | grep -qE '\bborder-0\b|\bborder-transparent\b' && echo 1 || echo 0)
    HAS_SHADOW=$(echo "$CLASSNAMES" | grep -qE '\bshadow-\[var\(--elevation|\bshadow-\[' && ! echo "$CLASSNAMES" | grep -qE '\bshadow-none\b' && echo 1 || echo 0)

    if [ "$HAS_BG" = "1" ] || [ "$HAS_BORDER" = "1" ] || [ "$HAS_SHADOW" = "1" ]; then
      # Has padding?
      HAS_PADDING=$(echo "$CLASSNAMES" | grep -qE '\bp-[0-9]+\b|\bpx-[0-9]+\b|\bpy-[0-9]+\b|\bpt-[0-9]+\b|\bpb-[0-9]+\b|\bpl-[0-9]+\b|\bpr-[0-9]+\b|\bp-\[|\bpx-\[|\bpy-\[|\bpt-\[|\bpb-\[' && echo 1 || echo 0)
      if [ "$HAS_PADDING" = "0" ]; then
        REASONS=""
        [ "$HAS_BG" = "1" ] && REASONS="${REASONS} bg"
        [ "$HAS_BORDER" = "1" ] && REASONS="${REASONS} border"
        [ "$HAS_SHADOW" = "1" ] && REASONS="${REASONS} shadow"
        WARN_VIOLATIONS="${WARN_VIOLATIONS}
────────────────────────────────
[P1 visual container 缺 inner padding(warn)] ${FILE_PATH}:${ROW}
  視覺邊界:${REASONS# }
  > $(echo "$LINE" | sed 's/^[[:space:]]*//' | cut -c1-120)
  判斷: 視覺容器(bg/border/shadow)必有 inner padding,不讓內容物貼容器邊。
        建議:chrome 層用 p-[var(--layout-space-loose/tight)] / px-3 等。
        若是 (a) chrome primitive override 刻意 p-0,(b) 父容器另外提供 padding,
        (c) 子元件自帶足夠 padding → 加 // @breathing-exempt-next 到此行上一行。
        SSOT: patterns/element-anatomy/element-anatomy.spec.md「視覺容器 breathing invariant」"
      fi
    fi
  fi

done < "$TMP"

if [ -n "$WARN_VIOLATIONS" ]; then
  {
    echo ""
    echo "┄┄┄┄ check_container_breathing — P1 warn(視覺容器缺 inner padding) ┄┄┄┄"
    printf '%s\n' "$WARN_VIOLATIONS"
  } >&2
fi

exit 0

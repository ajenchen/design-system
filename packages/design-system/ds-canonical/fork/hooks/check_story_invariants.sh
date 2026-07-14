#!/bin/bash
# check_story_invariants.sh — SHIP_REWRITTEN fork override(consumer 版,2026-07-08 WM 戰役 R4)
#
# WHY REWRITE(非 SHIP_AS_IS / 非 DROP):
#   DS-author 原版 10 條 rule 多數 scope 在 DS src stories(anatomy 6-canonical / trait category /
#   title canonical 等 DS-author 撰寫紀律),fork 消費端不適用;但 preamble M23(d) 明文承諾
#   「Registry SSOT story-baseline-registry.json + hook check_story_invariants.sh R8 + R9 機械強制」
#   — 原版整支 DROP = doc-vs-corpus drift(對 fork 承諾了防線、corpus 卻沒 ship,紙老虎)。
#   本 override 只 ship fork 真需要的兩條(WM 2026-07-08 實證 drift class):
#     R8 story_archetype_registry — 讀 corpus 內 registry antiPatterns,攔 simplified-mock
#        (wrap Sidebar/DataTable/ChromeHeader 卻手刻 span/div 取代 primitive 結構)
#     R9 hand_craft_overlay_header — 手刻浮層 / chrome header 簽名(px-loose + border-b
#        border-divider 同 className;零誤判簽名,DS-wide 量測 anchor 2026-06-04 upload-manager)
#   Scope 擴到 apps/**/*.tsx:fork 手刻 drift 主戰場在產品 code,非只 stories(WM detail modal 實證)。
#   Escape 與 DS-author 版同源:@story-baseline-allow: <reason>(檔頭 10 行內或本次片段)。
#
# Registry 路徑:corpus 相對路徑優先($0 = ds-canonical/fork/hooks/ → ../../references/),
# 再 fallback $CLAUDE_PROJECT_DIR/node_modules(anchor 2026-06-03:cwd-相對路徑曾靜默失效)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)

case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
[ "$EVENT" = "PostToolUse" ] && exit 0

# Scope:fork 產品 code(apps/**/*.tsx)+ 任何 stories.tsx;DS 內部 / node_modules 不管
case "$FILE_PATH" in
  *node_modules/*|*packages/design-system/*) exit 0 ;;
  *.stories.tsx) ;;
  */apps/*.tsx) ;;
  *) exit 0 ;;
esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")
[ -z "${NEW_CONTENT//[[:space:]]/}" ] && exit 0

# Escape(檔頭 10 行 — 本次片段 or 磁碟上既有檔頭)
if echo "$NEW_CONTENT" | head -10 | grep -qE '@story-baseline-allow:'; then exit 0; fi
if [ -f "$FILE_PATH" ] && head -10 "$FILE_PATH" 2>/dev/null | grep -qE '@story-baseline-allow:'; then exit 0; fi

WORST=0

# ── Registry 定位(corpus 相對優先) ──
REGISTRY="$(dirname "$0")/../../references/story-baseline-registry.json"
if [ ! -f "$REGISTRY" ]; then
  REGISTRY="${CLAUDE_PROJECT_DIR:-.}/node_modules/@qijenchen/design-system/ds-canonical/references/story-baseline-registry.json"
fi

# 多行 JSX flatten(registry regex 用 [[:space:]]* / .* 跨原換行;grep 是 line-oriented)
CONTENT_FLAT=$(echo "$NEW_CONTENT" | tr '\n' ' ')

# ─────────────────────────────────────────────────────────────────────────────
# R8 — story_archetype_registry(registry antiPatterns 攔 simplified-mock)
# ─────────────────────────────────────────────────────────────────────────────
if [ -f "$REGISTRY" ]; then
  for COMP in Sidebar DataTable ChromeHeader; do
    echo "$NEW_CONTENT" | grep -qE "<${COMP}\\b" || continue
    # 每條三行一組:severity / regex / unlessRegex(jq -r 原始輸出零跳脫;禁 @tsv/插值 —
    # @tsv 反斜線雙跳脫、插值踩 jq lexer,DS-author 版 2026-07-04 smoke 連抓兩雷)
    PATTERNS=$(jq -r --arg c "$COMP" '.components[$c].antiPatterns[]? | .severity, .regex, (.unlessRegex // "")' "$REGISTRY" 2>/dev/null)
    [ -z "$PATTERNS" ] && continue
    while read -r SEV && read -r PATTERN && { read -r UNLESS || true; }; do
      [ -z "$PATTERN" ] && continue
      # regex self-test(invalid ERE → grep exit 2 靜默永不 fire;fail-loud)
      echo x | grep -qE "$PATTERN" 2>/dev/null
      if [ $? -eq 2 ]; then
        echo "⚠️  R8 registry regex 不可執行(ERE invalid,此條防線失效):$PATTERN" >&2
        continue
      fi
      if echo "$CONTENT_FLAT" | grep -qE "$PATTERN"; then
        if [ -n "$UNLESS" ] && echo "$CONTENT_FLAT" | grep -qE "$UNLESS" 2>/dev/null; then continue; fi
        {
          echo "⚠️  R8 story_archetype_registry violation(severity: $SEV):"
          echo "   $FILE_PATH wrap <$COMP> matches anti-pattern:"
          echo "   regex: $PATTERN"
          echo ""
          echo "   修法:Read DS baseline story + helpers,抄 production archetype 結構,"
          echo "   不憑印象手刻 simplified mock(<SidebarHeader><span> / 手刻 filter Button 等)。"
          echo "   Baseline registry:node_modules/@qijenchen/design-system/ds-canonical/references/story-baseline-registry.json"
          echo "   Canonical:preamble M23(d) nearest same-purpose canonical wins。"
          echo "   豁免:檔頭加 // @story-baseline-allow: <reason>(audit-logged)。"
        } >&2
        [ "$SEV" = "block" ] && [ "$WORST" -lt 2 ] && WORST=2
      fi
    done <<< "$PATTERNS"
  done
fi

# ─────────────────────────────────────────────────────────────────────────────
# R9 — hand_craft_overlay_header(零誤判簽名:px-loose + border-b border-divider 同 className)
# ─────────────────────────────────────────────────────────────────────────────
# drop 純註解行再 flatten(避免 commented-out JSX 誤判;不 strip 行內 // 保 https:// URL)
FLAT9=$(echo "$NEW_CONTENT" | grep -vE '^[[:space:]]*(//|\*|/\*|\{/\*)' | tr '\n' ' ')
if echo "$FLAT9" | grep -qE '<div[^>]*px-\[var\(--layout-space-loose\)\][^">]*border-b[[:space:]]+border-divider|<div[^>]*border-b[[:space:]]+border-divider[^">]*px-\[var\(--layout-space-loose\)\]'; then
  {
    echo "❌ R9 hand-craft overlay / chrome header:${FILE_PATH}"
    echo "   偵測到 <div ... px-[var(--layout-space-loose)] ... border-b border-divider> = 手刻浮層 / chrome header。"
    echo "   必消費 DS primitive:<SurfaceHeader>(patterns/overlay-surface)/ <PopoverHeader> / <DialogHeader>;"
    echo "   面板殼用 Popover 同款 chrome token(rounded-lg border-border bg-surface-raised elevation-200)。"
    echo "   理由:px-loose + divider border 的 header chrome 是 overlay-surface SSOT;手刻 = drift"
    echo "   (anchor 2026-06-04 upload-manager 手刻面板 py-2≠py-tight / 殼 token 全偏,user 抓)。"
    echo "   Spec:node_modules/@qijenchen/design-system/src/patterns/overlay-surface/overlay-surface.spec.md"
    echo "   豁免:檔頭加 // @story-baseline-allow: <reason>。"
  } >&2
  WORST=2
fi

[ "$WORST" -ge 2 ] && exit 2
exit 0

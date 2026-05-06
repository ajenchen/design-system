#!/bin/bash
set -uo pipefail
# Opacity token enforcement hook(2026-05-06 v14.5.2):
#   偵測 *.tsx 寫 `opacity-{N}`(N 是 0-99 數字)非 token utility → soft warn 用 DS opacity token。
#
# DS opacity 慣例(`tokens/opacity/opacity.css` + drag-visual.ts):
#   - `opacity-0` / `opacity-100` — visibility toggle(允許,純 show/hide 不算 dim)
#   - `opacity-disabled`(0.45)— 元件 disabled 狀態 + drag source 半透殘影 reuse
#                                 (對齊 Atlassian Pragmatic 用 opacity.disabled token)
#   - DragOverlay ghost — 不 dim(opacity:1)+ `shadow-[var(--elevation-200)]` 表 lifted
#                         (對齊 dnd-kit / Atlassian / Material canonical)
#
# 任何其他 `opacity-{N}` Tailwind utility = M23 violation,自開 opacity tier。
# 修法:reuse `opacity-disabled` 或加 alpha 色階(`--white-aN` / `--black-aN`)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

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
# Skip stories / tests / token css(token spec 自家)
case "$FILE_PATH" in
  *.stories.tsx|*.test.*|*.spec.tsx|*tokens/opacity/*) exit 0 ;;
esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""')

# 偵測 opacity-{N} 但排除允許的:opacity-0, opacity-100, opacity-disabled
# 注意 lookahead/lookbehind 在 grep -E 不一定支援,改用 grep -oE 配 grep -v 過濾
HITS=$(echo "$NEW_CONTENT" | grep -oE "opacity-[0-9]+" | grep -vE "^opacity-(0|100)$" | sort -u || true)

if [ -n "$HITS" ]; then
  HITS_FMT=$(echo "$HITS" | sed 's/^/     /')
  cat >&2 <<'EOF_HEAD'

⚠️  M23 violation:DS 內 opacity 必走 semantic token,不可用 Tailwind 純數字 utility。

   命中 utilities:
EOF_HEAD
  echo "$HITS_FMT" >&2
  cat >&2 <<'EOF_BODY'

   DS opacity 慣例:
     opacity-0 / opacity-100  ← visibility toggle(允許)
     opacity-disabled(0.45)   ← 元件 disabled 狀態 + drag source dim reuse
     ghost / overlay          ← 不 dim,用 shadow-[var(--elevation-*)] 表 lifted

   修法:reuse `opacity-disabled` 或用 alpha 色階(--white-aN / --black-aN)。
   詳 tokens/opacity/opacity.spec.md + M23 「DS 內既有 canonical 優先」。
EOF_BODY
fi

exit 0

#!/bin/bash
set -uo pipefail
# Header canonical W3 Token alignment enforcement(per header-canonical.spec.md W3):
#   --tab-height-lg(uiSize.css)與 --chrome-header-height(globals.css)必像素相等。
#   兩 token scope 不同(uiSize 是 component-size reset / chrome-header-height 是 app-density)
#   不該 CSS alias(綁死兩個不同 scope)— 改用 assert: parse 兩檔 md/lg 值對等。
#
# PreToolUse(Edit / Write)hook —— 編輯 `packages/design-system/src/tokens/uiSize/uiSize.css` 或
# `src/globals.css` 時 assert 兩值仍相等。動一方未同步 = BLOCKER。
#
# 對齊 M31 codex 比稿 Step 5「保留 duplicated literals + audit hook assert equality」decision。

source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

case "$FILE_PATH" in
  */packages/design-system/src/tokens/uiSize/uiSize.css|*/src/globals.css) ;;
  *) exit 0 ;;
esac

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UISIZE_CSS="$PROJECT_ROOT/packages/design-system/src/tokens/uiSize/uiSize.css"
GLOBALS_CSS="$PROJECT_ROOT/src/globals.css"

# Extract value of --tab-height-lg in md context(default :root block)
TAB_LG_MD=$(grep -oE '\--tab-height-lg:[[:space:]]*[0-9.]+rem' "$UISIZE_CSS" | head -1 | grep -oE '[0-9.]+')
# Extract --tab-height-lg in lg density override(2nd occurrence)
TAB_LG_LG=$(grep -oE '\--tab-height-lg:[[:space:]]*[0-9.]+rem' "$UISIZE_CSS" | sed -n '2p' | grep -oE '[0-9.]+')

# Extract --chrome-header-height md(1st occurrence)
CH_MD=$(grep -oE '\--chrome-header-height:[[:space:]]*[0-9.]+rem' "$GLOBALS_CSS" | head -1 | grep -oE '[0-9.]+')
# Extract --chrome-header-height lg(2nd occurrence in lg override)
CH_LG=$(grep -oE '\--chrome-header-height:[[:space:]]*[0-9.]+rem' "$GLOBALS_CSS" | sed -n '2p' | grep -oE '[0-9.]+')

ERRORS=()

if [ "$TAB_LG_MD" != "$CH_MD" ]; then
  ERRORS+=("md: --tab-height-lg=$TAB_LG_MD rem ≠ --chrome-header-height=$CH_MD rem")
fi

if [ "$TAB_LG_LG" != "$CH_LG" ]; then
  ERRORS+=("lg: --tab-height-lg=$TAB_LG_LG rem ≠ --chrome-header-height=$CH_LG rem")
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
  printf '🚨 TAB_LG vs CHROME_HEADER_HEIGHT EQUAL BLOCKER(header-canonical.spec.md W3):\n' >&2
  for E in "${ERRORS[@]}"; do
    printf '   • %s\n' "$E" >&2
  done
  printf '\n  動一方必同步另一方(兩 token 像素相等是「lg tabs 取代 chrome header」SSOT linkage 鐵證)\n' >&2
  printf '  SSOT: packages/design-system/src/patterns/header-canonical/header-canonical.spec.md W3\n' >&2
  printf '  修方向: 改 uiSize.css 的 --tab-height-lg OR globals.css 的 --chrome-header-height 讓兩邊相等\n' >&2
  exit 2
fi

exit 0

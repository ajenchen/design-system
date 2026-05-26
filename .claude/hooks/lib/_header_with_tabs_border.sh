#!/bin/bash
# Header canonical W1 Border ownership enforcement(per header-canonical.spec.md W1):
#   Header 含 Tabs(`<Tabs>` / `<TabsList>` child)→ 必標 `withTabs` prop 讓 border auto-suppress。
#
# PreToolUse(Edit / Write)hook:
#   讀 post-edit 完整 content(disk + new_string merge)→ count(header) ≥ 1 + count(tabs) ≥ 1
#   時要求 count(withTabs) ≥ count(header)。違反 = BLOCKER。
#
# 2026-05-17 Round 3:用 simple grep counting(per-instance awk 在 macOS bash 環境不穩定)。
# 在「同 file 一 header 一 withTabs」常規 case 抓得到;edge case(混用 instance)需 audit dim 52
# batch verify 補。
#
# Allow escape:檔頭 `// @header-withtabs-allow:` 整檔豁免。

source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

case "${FILE_PATH:-}" in
  */packages/design-system/src/**/*.tsx) ;;
  *) exit 0 ;;
esac

# Skip stories
case "${FILE_PATH:-}" in
  *.stories.tsx|*.anatomy.stories.tsx|*.principles.stories.tsx) exit 0 ;;
esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '
  if .tool_input.new_string then .tool_input.new_string
  elif .tool_input.content then .tool_input.content
  else "" end
')

DISK_CONTENT=""
if [ -f "$FILE_PATH" ]; then
  DISK_CONTENT=$(cat "$FILE_PATH")
fi

FULL_CONTENT=$(printf '%s\n%s' "${DISK_CONTENT:-}" "${NEW_CONTENT:-}")

if echo "${FULL_CONTENT:-}" | grep -qE '@header-withtabs-allow:'; then
  exit 0
fi

# GAP 2 fix(2026-05-18 M34 codify):broaden hardcoded 6-name allowlist 到 generic [A-Z]*Header pattern。
# 對齊 header-canonical.spec.md「任何 header 含 Tabs」+「未來 Drawer / Card / Table header」前瞻
HEADERS=$(echo "$FULL_CONTENT" | grep -cE '<[A-Z][a-zA-Z]*Header[[:space:]>]' 2>/dev/null)
HEADERS=$(echo "${HEADERS:-0}" | head -1)
TABS=$(echo "$FULL_CONTENT" | grep -cE '<(Tabs|TabsList|TabsTrigger)[[:space:]>]' 2>/dev/null)
TABS=$(echo "${TABS:-0}" | head -1)
WITHTABS=$(echo "$FULL_CONTENT" | grep -cE 'withTabs([[:space:]]*=|[[:space:]]*[}>]|[[:space:]]*$)' 2>/dev/null)
WITHTABS=$(echo "${WITHTABS:-0}" | head -1)

# 若無 header 或無 tabs → 不適用
if [ "${HEADERS:-0}" -lt 1 ] 2>/dev/null || [ "${TABS:-0}" -lt 1 ] 2>/dev/null; then
  exit 0
fi

# 要求 withTabs 出現 ≥ 1 次(寬鬆檢查;per-instance precise 留 Dim 52 batch verify)
if [ "${WITHTABS:-0}" -lt 1 ] 2>/dev/null; then
  printf '🚨 HEADER + TABS WITHTABS BLOCKER(header-canonical.spec.md W1):\n' >&2
  printf '   File: %s\n' "$FILE_PATH" >&2
  printf '   檔含 %s 個 header JSX + %s 個 Tabs JSX,但 withTabs prop 出現 0 次。\n' "$HEADERS" "$TABS" >&2
  printf '   Header `border-b` + TabsList `border-b border-border` 會雙線。\n' >&2
  printf '\n  SSOT: patterns/header-canonical/header-canonical.spec.md W1\n' >&2
  printf '  修方向: <ChromeHeader withTabs> 或 <SurfaceHeader withTabs>\n' >&2
  printf '  Escape: 檔頭加 // @header-withtabs-allow: <rationale>\n' >&2
  exit 2
fi

# 警告(per-instance 精度不夠 — 若 header > withTabs,某 instance 可能漏):
if [ "${WITHTABS:-0}" -lt "${HEADERS:-0}" ] 2>/dev/null; then
  printf '⚠️ HEADER WITHTABS COUNT MISMATCH(W1 soft warn):\n' >&2
  printf '   File: %s\n' "$FILE_PATH" >&2
  printf '   header instance %s 個 / withTabs prop %s 個 — 可能有 instance 漏 prop\n' "$HEADERS" "$WITHTABS" >&2
  printf '   ⚠️ 寬鬆模式 exit 0(不 block);Dim 52 batch verify 補 per-instance 精度\n' >&2
fi

exit 0

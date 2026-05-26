#!/usr/bin/env bash
# check_app_shell_primary_header_consistency.sh — PreToolUse Edit/Write
#
# 2026-05-21 ship per user directive「該程式化的就程式化」+「確認當有 global header 時,
# sidebar 內的 header 應該要拿掉」+ world-class GitHub/Gmail/Figma 共識。
#
# Detects 2 violations in AppShell consumer code:
#   V1) `layout="primary-header"` without `globalHeader=...` prop
#       → 缺 globalHeader 而 layout=primary-header 是邏輯矛盾(per app-shell.spec.md
#         「primary-header = primary-sidebar + 一條 global header」)
#
#   V2) `layout="primary-header"` + 任何 `<SidebarHeader>...</SidebarHeader>` 在同 file
#       → WorkspaceBrand 已該在 globalHeader,sidebar 內不該再有 SidebarHeader
#         (per app-shell.spec.md「WorkspaceBrand 放置 SSOT」+ world-class GitHub/Gmail/Figma 一致)
#
# 對齊 .claude/rules/self-verify.md「Pre-edit」階段 + check_chrome_header_handcraft.sh /
# check_overlay_handcraft.sh 等既有 SSOT-enforcement hook idiom。
# Exception escape:`// @app-shell-primary-header-allow: <reason>` 檔頭。

set -uo pipefail
source "$(dirname "$0")/../_log-fire.sh"

# 只看 Edit / Write tool
TOOL_NAME=$(echo "${CLAUDE_TOOL_INPUT:-}" | python3 -c "import sys,json; d=json.load(sys.stdin) if sys.stdin.isatty()==False else {}; print(d.get('tool_name',''))" 2>/dev/null || echo "")
if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" ]]; then exit 0; fi

TARGET=$(echo "${CLAUDE_TOOL_INPUT:-}" | python3 -c "import sys,json; d=json.load(sys.stdin) if sys.stdin.isatty()==False else {}; print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null || echo "")
# 只查 .tsx / .stories.tsx consumer file
if [[ ! "$TARGET" =~ \.(tsx)$ ]]; then exit 0; fi
if [[ ! -f "$TARGET" ]]; then exit 0; fi

# 排除 spec / test / SSOT 檔
case "$TARGET" in
  *.spec.md|*test*|*/AppShell/app-shell.tsx) exit 0 ;;
esac

# Escape allowlist
if grep -q "@app-shell-primary-header-allow:" "$TARGET"; then exit 0; fi

# 偵測 layout="primary-header"
if ! grep -q 'layout="primary-header"\|layout={["\047]primary-header["\047]}' "$TARGET"; then exit 0; fi

VIOLATIONS=()

# V1:layout="primary-header" 但無 globalHeader=
if ! grep -q 'globalHeader\s*=' "$TARGET"; then
  VIOLATIONS+=("V1 缺 globalHeader prop:layout=\"primary-header\" 必傳 globalHeader 否則邏輯矛盾(per app-shell.spec.md「primary-header = primary-sidebar + 一條 global header」)")
fi

# V2:layout="primary-header" + <SidebarHeader> 同 file → WorkspaceBrand 該在 globalHeader 不重複
if grep -q '<SidebarHeader' "$TARGET"; then
  VIOLATIONS+=("V2 Sidebar 內含 SidebarHeader:primary-header mode WorkspaceBrand 該在 globalHeader,sidebar 內不該重複(per spec.md「WorkspaceBrand 放置 SSOT」+ world-class GitHub/Gmail/Figma 共識)。若 sidebar header 是其他內容(非 brand),加 escape allowlist `// @app-shell-primary-header-allow:` 並說明 reason")
fi

if [[ ${#VIOLATIONS[@]} -gt 0 ]]; then
  echo "🚨 AppShell primary-header consistency violation" >&2
  echo "Target: $TARGET" >&2
  for v in "${VIOLATIONS[@]}"; do echo "  • $v" >&2; done
  echo "" >&2
  echo "修法:" >&2
  echo "  (a) 傳 globalHeader prop / 撤掉 SidebarHeader" >&2
  echo "  (b) 改 layout=\"primary-sidebar\"(若不需要 global header)" >&2
  echo "  (c) Escape 允許:檔首加 \`// @app-shell-primary-header-allow: <rationale>\`" >&2
  log_fire "check_app_shell_primary_header_consistency"
  exit 2
fi

exit 0

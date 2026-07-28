#!/bin/bash
# check_sidebar_menu_button_implicit_wrap.sh — PreToolUse Edit/Write 攔 SidebarMenuButton 沒 asChild + children 含 ItemAvatar/Avatar/Icon 致隱式 wrap 垂直 stack(2026-05-27)
#
# Per user 2026-05-27 抓 UserFooter Avatar 垂直 stack drift:
#   SidebarMenuButton(sidebar.tsx L1036-1043)在沒 asChild 時把所有 children 塞進 <ItemLabel> 單一 span,
#   Avatar + text-span 都在同 span 內 → 強迫垂直堆疊。
#
# Canonical:含 Avatar/ItemAvatar/icon prefix 的 SidebarMenuButton 必用 asChild + <div> wrap,
#   per sidebar.tsx:1025-1027 docblock:「asChild 的 consumer 自行放 icon + label」+ DS canonical
#   sidebar.stories.tsx#UserFooter 範例 L76-104。
#
# Detection:
#   `<SidebarMenuButton ...>` (no asChild) ... `<ItemAvatar` or `<Avatar` inside → BLOCKER
#   ALLOW:`<SidebarMenuButton startIcon={X}>label</SidebarMenuButton>`(用 startIcon prop 不 wrap)
#   ALLOW:`<SidebarMenuButton asChild>...</SidebarMenuButton>`(consumer 自管 layout)

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: hook integrity helper unavailable\n' >&2
  exit 70
}

set -uo pipefail
governance_hook_load_input
governance_hook_require_commands python3
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'sidebar-wrap tool extraction failed'
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'sidebar-wrap path extraction failed'
EVENT=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'sidebar-wrap event extraction failed'
NEW=$(printf '%s' "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'sidebar-wrap content extraction failed'

[ "$EVENT" != "PreToolUse" ] && exit 0
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
case "$FILE_PATH" in *.tsx) ;; *) exit 0 ;; esac
case "$FILE_PATH" in *.test.tsx) exit 0 ;; esac

# Python multiline regex:`<SidebarMenuButton` 不含 `asChild` 的 block + 內含 Avatar/ItemAvatar prefix
HAS_DRIFT=$(printf '%s' "$NEW" | python3 -c '
import sys, re
content = sys.stdin.read()
# Find SidebarMenuButton blocks(opening tag → closing tag,non-greedy multiline)
# match opening `<SidebarMenuButton ...>` capture full open tag
for m in re.finditer(r"<SidebarMenuButton\b([^>]*)>(.*?)</SidebarMenuButton>", content, re.DOTALL):
    open_tag, body = m.group(1), m.group(2)
    # Skip if asChild present
    if re.search(r"\basChild\b", open_tag):
        continue
    # Drift = body 含 <ItemAvatar 或 <Avatar(both = avatar prefix)
    if re.search(r"<(ItemAvatar|Avatar)\b", body):
        print("DRIFT")
        sys.exit(0)
' 2>/dev/null) || governance_hook_integrity_fail 'sidebar-wrap parser failed'

[ "$HAS_DRIFT" != "DRIFT" ] && exit 0

# Override env(audit-logged)
if [ "${GOVERNANCE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP:-0}" = "1" ]; then
  if STATE_DIR="$(governance_runtime_state_dir 2>/dev/null)"; then
    mkdir -p "$STATE_DIR" 2>/dev/null
    jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg file "$FILE_PATH" \
      '{ts:$ts,event:"sidebar-menu-button-wrap-bypass",file:$file}' >> "$STATE_DIR/governance-bypass.jsonl" 2>/dev/null || true
  fi
  exit 0
fi

REL=${FILE_PATH#"$GOVERNANCE_PROJECT_DIR"/}

cat >&2 <<'EOF'
🚨 SidebarMenuButton implicit-wrap canonical violation(per user 2026-05-27 UserFooter 垂直 stack 事件):

🔍 偵測:SidebarMenuButton 內含 ItemAvatar 或 Avatar 但 **無 asChild**

⚠️ 後果(per sidebar.tsx:1036-1043 source code):
  SidebarMenuButton 沒 asChild → children 全塞進 ItemLabel(單 span)
  → Avatar + text 在同 span 內 → 強迫垂直堆疊(user 抓的 bug)

修法(per DS canonical sidebar.stories.tsx#UserFooter):

  ❌ SidebarMenuButton id="..." 直接放 ItemAvatar + span 為 children

  ✅ SidebarMenuButton asChild 包 div role="group" 內含 ItemAvatar + span data-sidebar="menu-label" min-w-0 flex-1 truncate

Or use startIcon prop(自動 layout,不 wrap):
  ✅ SidebarMenuButton startIcon={SomeLucideIcon} 直接 children 為純文字

Bypass(極罕見):GOVERNANCE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP=1 env var(audit-logged)。

Citation:
  - packages/design-system/src/components/Sidebar/sidebar.tsx:1025-1043(asChild docblock)
  - packages/design-system/src/components/Sidebar/sidebar.stories.tsx UserFooter L76-104(canonical)
EOF
# 2026-05-31:exit 0 → exit 2(folded-hook-audit:原宣稱 BLOCKER 但 exit 0 = 假 enforcement;
# SidebarMenuButton implicit-wrap 是 SSOT canonical,verified clean on 現有 sidebar code + 有 env escape)。
exit 2

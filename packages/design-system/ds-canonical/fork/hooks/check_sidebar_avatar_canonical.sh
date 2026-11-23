#!/bin/bash
# check_sidebar_avatar_canonical.sh — PreToolUse Edit/Write 攔 Sidebar 裡頭像的兩種擺錯(P0 BLOCKER ×2)
#
# 2026-11-18 prune merge(knowledge-prune H-M3;hook 58→57):兩支姐妹 hook 合成一支,仍然出貨給 consumer
#   (fork 分類 SHIP_AS_IS —— 不併進 chrome_header_dispatcher.sh,那支是 DROP,併進去 consumer 就沒人擋)。
#   r1_chrome_header_avatar = 原 check_chrome_header_avatar_canonical.sh(規則、escape、exit 2、訊息逐字搬入)
#   r2_menu_button_wrap     = 原 check_sidebar_menu_button_implicit_wrap.sh(規則、escape、exit 2、訊息逐字搬入)
#   兩條共用同一份事件 / matcher / *.tsx 篩選(原兩支本來就相同);各自的 bypass 只放行自己那條。
#   兩條都中 → 兩則訊息都印、exit 2;任一條的 parser 失敗 → GOVERNANCE_INTEGRITY exit 70(與原兩支相同)。
#
# ── r1:SidebarHeader 內禁 ItemAvatar(2026-05-27)──
# Per user 2026-05-27 抓 UserFooter vertical stack drift + codex collab Step 4 cite battle:
#   header-canonical.spec.md:57-72 + sidebar.spec.md:237-243 + item-anatomy.spec.md:512-536 明文:
#   「Chrome header 不是 row context → 必 raw <Avatar size={24}>,禁 <ItemAvatar>(會誤啟動 row anatomy lookup)」
# Detection:`<SidebarHeader>` block 內含 `<ItemAvatar`(允許 SidebarFooter 內 ItemAvatar — footer 是 SidebarMenu row context)
# 2026-06-11 R2 held-item #9:strip 註解再 match — `9935caf9:apps/template/src/App.tsx:57`(當時位置)canonical citation
# 註解({/* ... 禁用 <ItemAvatar> ... */})在 SidebarHeader block 內被當真 JSX 誤發 P0(code 實際正確
# 用 raw <Avatar size={24}>)。Strip 順序:JSX comment {/* */} → block comment /* */ → 行首 // 整行
# (不 strip 行內 //,避免 mutilate https:// URL — 對齊 check_story_invariants.sh R9 idiom)。
#
# ── r2:SidebarMenuButton 沒 asChild 卻包著 Avatar(2026-05-27)──
# Per user 2026-05-27 抓 UserFooter Avatar 垂直 stack drift:
#   SidebarMenuButton(sidebar.tsx L1036-1043)在沒 asChild 時把所有 children 塞進 <ItemLabel> 單一 span,
#   Avatar + text-span 都在同 span 內 → 強迫垂直堆疊。
# Canonical:含 Avatar/ItemAvatar/icon prefix 的 SidebarMenuButton 必用 asChild + 單一 wrapper
#   (互動觸發行 <button type="button">,如 UserFooter 帳號選單;純展示 row <div role="group">),
#   per sidebar.tsx#SidebarMenuButton docblock:「asChild 的 consumer 自行放 icon + label」+ DS canonical
#   sidebar.stories.tsx#UserFooter 範例。
# Detection:`<SidebarMenuButton ...>` (no asChild) ... `<ItemAvatar` or `<Avatar` inside → BLOCKER
#   ALLOW:`<SidebarMenuButton startIcon={X}>label</SidebarMenuButton>`(用 startIcon prop 不 wrap)
#   ALLOW:`<SidebarMenuButton asChild>...</SidebarMenuButton>`(consumer 自管 layout)
#   (r2 原本就不 strip 註解,逐字保留;是否補 strip 不在本次合併範圍)
#
# Scope:
#   - packages/design-system/src/components/Sidebar/**.tsx + **.stories.tsx
#   - apps/**.tsx (consumer)
#   - node_modules/@qijenchen/design-system/**(禁改 — block_prototype_imports 已攔)

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: hook integrity helper unavailable\n' >&2
  exit 70
}

set -uo pipefail
governance_hook_load_input
governance_hook_require_commands python3
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'sidebar-avatar tool extraction failed'
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'sidebar-avatar path extraction failed'
EVENT=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'sidebar-avatar event extraction failed'
NEW=$(printf '%s' "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'sidebar-avatar content extraction failed'

[ "$EVENT" != "PreToolUse" ] && exit 0
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
case "$FILE_PATH" in *.tsx) ;; *) exit 0 ;; esac
case "$FILE_PATH" in *.test.tsx|*.spec.md) exit 0 ;; esac

REL=${FILE_PATH#"$GOVERNANCE_PROJECT_DIR"/}

# 記一筆 bypass(audit-logged;與原兩支同格式、同 event 名)
log_bypass() {
  if STATE_DIR="$(governance_runtime_state_dir 2>/dev/null)"; then
    mkdir -p "$STATE_DIR" 2>/dev/null
    jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg file "$FILE_PATH" --arg event "$1" \
      '{ts:$ts,event:$event,file:$file}' >> "$STATE_DIR/governance-bypass.jsonl" 2>/dev/null || true
  fi
}

BLOCKED=0

# ── r1_chrome_header_avatar ──
r1_chrome_header_avatar() {
  local has_drift
  has_drift=$(printf '%s' "$NEW" | python3 -c '
import sys, re
content = sys.stdin.read()
# Strip comments(citation 註解含 <ItemAvatar> 字樣不是 drift)
content = re.sub(r"\{/\*.*?\*/\}", "", content, flags=re.DOTALL)
content = re.sub(r"/\*.*?\*/", "", content, flags=re.DOTALL)
content = re.sub(r"(?m)^[ \t]*//.*$", "", content)
# Find SidebarHeader blocks(opening tag → closing tag,non-greedy)
blocks = re.findall(r"<SidebarHeader[^>]*>.*?</SidebarHeader>", content, re.DOTALL)
for block in blocks:
    if re.search(r"<ItemAvatar\b", block):
        print("DRIFT")
        sys.exit(0)
' 2>/dev/null) || governance_hook_integrity_fail 'chrome-header parser failed'

  [ "$has_drift" != "DRIFT" ] && return 0

  # Override env var
  if [ "${GOVERNANCE_BYPASS_CHROME_HEADER_AVATAR:-0}" = "1" ]; then
    log_bypass chrome-header-avatar-bypass
    return 0
  fi

  cat >&2 <<EOF
🚨 Chrome header avatar canonical violation(per user 2026-05-27 抓 + codex collab cite battle):

📁 File: $REL
🔍 偵測:<SidebarHeader> block 內含 <ItemAvatar>(禁用)

Canonical citation:
  - header-canonical.spec.md:57-72:「Chrome header 不是 row context → 必用 raw <Avatar size={24}>,禁用 <ItemAvatar>(會誤啟動 row anatomy lookup)」
  - sidebar.spec.md:237-243:「consumer 用 raw <Avatar size={24}>(chrome header 不是 row context → 不該用 <ItemAvatar>)」
  - item-anatomy.spec.md:512-536:「ItemAvatar scope = row context only;Chrome header 有自己的 canonical = raw <Avatar size={24}>」

修法(per DS canonical):
  ❌ <SidebarHeader>
       <ItemAvatar alt="..." shape="square" color="..." solid />
       <span>brand</span>
     </SidebarHeader>

  ✅ <SidebarHeader>
       <Avatar size={24} shape="square" color="..." solid alt="..." />
       <span className="text-body-lg font-medium truncate">brand</span>
     </SidebarHeader>

注意:SidebarFooter 內 ItemAvatar OK(footer 是 SidebarMenu row context)。本 hook 只攔 SidebarHeader。

Bypass(極罕見):GOVERNANCE_BYPASS_CHROME_HEADER_AVATAR=1 env var(audit-logged)。
EOF
  # 2026-05-31:exit 0 → exit 2(folded-hook-audit:原宣稱 BLOCKER 但 exit 0 = 假 enforcement;
  # chrome-header avatar 是 SSOT canonical [feedback_ssot_mechanical_p0_not_p1 = 必 P0 BLOCK],
  # verified clean on 現有 canonical sidebar code + 有 env escape 兜 false-positive)。
  BLOCKED=1
}

# ── r2_menu_button_wrap ──
r2_menu_button_wrap() {
  local has_drift
  # Python multiline regex:`<SidebarMenuButton` 不含 `asChild` 的 block + 內含 Avatar/ItemAvatar prefix
  has_drift=$(printf '%s' "$NEW" | python3 -c '
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

  [ "$has_drift" != "DRIFT" ] && return 0

  # Override env(audit-logged)
  if [ "${GOVERNANCE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP:-0}" = "1" ]; then
    log_bypass sidebar-menu-button-wrap-bypass
    return 0
  fi

  cat >&2 <<'EOF'
🚨 SidebarMenuButton implicit-wrap canonical violation(per user 2026-05-27 UserFooter 垂直 stack 事件):

🔍 偵測:SidebarMenuButton 內含 ItemAvatar 或 Avatar 但 **無 asChild**

⚠️ 後果(per sidebar.tsx#SidebarMenuButton source code):
  SidebarMenuButton 沒 asChild → children 全塞進 ItemLabel(單 span)
  → Avatar + text 在同 span 內 → 強迫垂直堆疊(user 抓的 bug)

修法(per DS canonical sidebar.stories.tsx#UserFooter):

  ❌ SidebarMenuButton id="..." 直接放 ItemAvatar + span 為 children

  ✅ SidebarMenuButton asChild 包單一 wrapper 內含 ItemAvatar + span data-sidebar="menu-label" min-w-0 flex-1 truncate
     (wrapper:互動觸發行用 <button type="button">,如 UserFooter 帳號選單;純展示 row 用 <div role="group">)

Or use startIcon prop(自動 layout,不 wrap):
  ✅ SidebarMenuButton startIcon={SomeLucideIcon} 直接 children 為純文字

Bypass(極罕見):GOVERNANCE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP=1 env var(audit-logged)。

Citation:
  - packages/design-system/src/components/Sidebar/sidebar.tsx#SidebarMenuButton(asChild docblock)
  - packages/design-system/src/components/Sidebar/sidebar.stories.tsx UserFooter(canonical;帳號選單觸發行)
EOF
  # 2026-05-31:exit 0 → exit 2(folded-hook-audit:原宣稱 BLOCKER 但 exit 0 = 假 enforcement;
  # SidebarMenuButton implicit-wrap 是 SSOT canonical,verified clean on 現有 sidebar code + 有 env escape)。
  BLOCKED=1
}

r1_chrome_header_avatar
r2_menu_button_wrap

[ "$BLOCKED" = "1" ] && exit 2
exit 0

#!/bin/bash
# check_chrome_header_avatar_canonical.sh — PreToolUse Edit/Write 攔 chrome header descendant 用 ItemAvatar(2026-05-27)
#
# Per user 2026-05-27 抓 UserFooter vertical stack drift + codex collab Step 4 cite battle:
#   header-canonical.spec.md:57-72 + sidebar.spec.md:241-247 + item-anatomy.spec.md:513-537 明文:
#   「Chrome header 不是 row context → 必 raw <Avatar size={24}>,禁 <ItemAvatar>(會誤啟動 row anatomy lookup)」
#
# Detection:
#   PreToolUse Edit/Write content 偵測 `<SidebarHeader>` block 內含 `<ItemAvatar` → soft BLOCKER inject
#   (允許 SidebarFooter 內 ItemAvatar — footer 是 SidebarMenu row context)
#
# Scope:
#   - packages/design-system/src/components/Sidebar/**.tsx + **.stories.tsx
#   - apps/**.tsx (consumer)
#   - node_modules/@qijenchen/design-system/**(禁改 — block_prototype_imports 已攔)
#
# 對應 audit dim 預留 — TBD 升 audit dim 65

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)
NEW=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""' 2>/dev/null)

[ "$EVENT" != "PreToolUse" ] && exit 0
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
case "$FILE_PATH" in *.tsx) ;; *) exit 0 ;; esac
case "$FILE_PATH" in *.test.tsx|*.spec.md) exit 0 ;; esac

# Multi-line detection:`<SidebarHeader>...<ItemAvatar...>...</SidebarHeader>` block
# Use python for proper multiline match
# 2026-06-11 R2 held-item #9:strip 註解再 match — apps/template/src/App.tsx:57 canonical citation
# 註解({/* ... 禁用 <ItemAvatar> ... */})在 SidebarHeader block 內被當真 JSX 誤發 P0(code 實際正確
# 用 raw <Avatar size={24}>)。Strip 順序:JSX comment {/* */} → block comment /* */ → 行首 // 整行
# (不 strip 行內 //,避免 mutilate https:// URL — 對齊 check_story_invariants.sh R9 idiom)。
HAS_DRIFT=$(printf '%s' "$NEW" | python3 -c '
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
' 2>/dev/null)

[ "$HAS_DRIFT" != "DRIFT" ] && exit 0

# Override env var
if [ "${CLAUDE_BYPASS_CHROME_HEADER_AVATAR:-0}" = "1" ]; then
  mkdir -p "$(dirname "$0")/../logs" 2>/dev/null
  printf '{"ts":"%s","event":"chrome-header-avatar-bypass","file":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$FILE_PATH" >> "$(dirname "$0")/../logs/governance-bypass.jsonl" 2>/dev/null
  exit 0
fi

REL=${FILE_PATH#*/my-project/}

cat >&2 <<EOF
🚨 Chrome header avatar canonical violation(per user 2026-05-27 抓 + codex collab cite battle):

📁 File: $REL
🔍 偵測:<SidebarHeader> block 內含 <ItemAvatar>(禁用)

Canonical citation:
  - header-canonical.spec.md:57-72:「Chrome header 不是 row context → 必用 raw <Avatar size={24}>,禁用 <ItemAvatar>(會誤啟動 row anatomy lookup)」
  - sidebar.spec.md:241-247:「consumer 用 raw <Avatar size={24}>(chrome header 不是 row context → 不該用 <ItemAvatar>)」
  - item-anatomy.spec.md:513-537:「ItemAvatar scope = row context only;Chrome header 有自己的 canonical = raw <Avatar size={24}>」

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

Bypass(極罕見):CLAUDE_BYPASS_CHROME_HEADER_AVATAR=1 env var(audit-logged)。
EOF
# 2026-05-31:exit 0 → exit 2(folded-hook-audit:原宣稱 BLOCKER 但 exit 0 = 假 enforcement;
# chrome-header avatar 是 SSOT canonical [feedback_ssot_mechanical_p0_not_p1 = 必 P0 BLOCK],
# verified clean on 現有 canonical sidebar code + 有 env escape 兜 false-positive)。
exit 2

#!/bin/bash
# Tests for check_sidebar_menu_button_implicit_wrap.sh
# (per user 2026-05-27 UserFooter Avatar 垂直 stack drift)
#
# Hook 規則(PreToolUse,Edit/Write/MultiEdit on *.tsx,非 *.test.tsx):
#   讀 tool_input.content // tool_input.new_string。
#   DRIFT(emit stderr 訊息 + exit 2 BLOCK,2026-05-31 folded-hook-audit 升 0→2):
#     `<SidebarMenuButton ...>...</SidebarMenuButton>` block 開標籤無 `asChild`
#     且 body 含 `<ItemAvatar` 或 `<Avatar`(word-boundary)。
#   ALLOW(silent,exit 0,stderr empty):
#     - asChild 在開標籤 → consumer 自管 layout
#     - startIcon prop + 無 Avatar children → prop layout 不 wrap
#     - <AvatarGroup>(word-boundary 排除,非 <Avatar)
#     - Avatar 在 block 外 / 無 SidebarMenuButton
#   Gate skip(silent):非 PreToolUse / 非 Edit|Write|MultiEdit / 非 *.tsx / *.test.tsx
#   Override:GOVERNANCE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP=1 → silent(audit-logged)
#
# NOTE:此 hook 2026-05-31 升 P0 BLOCKER(stderr 訊息 + exit 2)— SSOT canonical per
#       feedback_ssot_mechanical_p0_not_p1;verified clean on canonical sidebar + env escape 兜 false-positive。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_sidebar_menu_button_implicit_wrap.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
export GOVERNANCE_PROJECT_DIR="$TMP_DIR"

# Needle present in the hook's DRIFT stderr block
NEEDLE="SidebarMenuButton implicit-wrap canonical violation"

# run_hook <file_path> <content> [field=content|new_string] [tool] [event] [bypass=0|1]
run_hook() {
  local file_path="$1"; local content="$2"
  local field="${3:-content}"; local tool="${4:-Write}"
  local event="${5:-PreToolUse}"; local bypass="${6:-0}"
  local payload
  if [ "$field" = "new_string" ]; then
    payload=$(jq -n --arg fp "$file_path" --arg c "$content" --arg t "$tool" --arg e "$event" \
      '{hook_event_name:$e, tool_name:$t, tool_input:{file_path:$fp, new_string:$c}}')
  else
    payload=$(jq -n --arg fp "$file_path" --arg c "$content" --arg t "$tool" --arg e "$event" \
      '{hook_event_name:$e, tool_name:$t, tool_input:{file_path:$fp, content:$c}}')
  fi
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  if [ "$bypass" = "1" ]; then
    printf '%s' "$payload" | GOVERNANCE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP=1 bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  else
    printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  fi
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

# POSITIVE: DRIFT detected → stderr 訊息 + exit 2 BLOCK(2026-05-31 folded-hook-audit 升 0→2)
expect_block() {
  local name="$1"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$NEEDLE"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected BLOCK: exit=2 + needle, got exit=$EXIT, needle=$(echo "$STDERR_TEXT" | grep -qF "$NEEDLE" && echo found || echo MISSING))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

# NEGATIVE: clean / out-of-scope → silent + exit 0
expect_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent, exit=$EXIT, stderr=$([ -n "$STDERR_TEXT" ] && echo non-empty || echo empty))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_sidebar_menu_button_implicit_wrap tests ==="

# ── Realistic fixtures(UserFooter scenario)───────────────────────────────────

# DRIFT: SidebarMenuButton 無 asChild,body 含 <Avatar(user 抓的垂直 stack bug)
DRIFT_AVATAR='import { SidebarMenuButton, Avatar } from "@qijenchen/design-system";
export function UserFooter() {
  return (
    <SidebarMenuButton tooltip="Jane Cooper">
      <Avatar src="/jane.png" alt="Jane Cooper" size="sm" />
      <span className="truncate">Jane Cooper</span>
    </SidebarMenuButton>
  );
}'

# DRIFT: 同樣無 asChild,body 含 <ItemAvatar(另一 avatar prefix)
DRIFT_ITEMAVATAR='export function UserFooter() {
  return (
    <SidebarMenuButton id="user-footer">
      <ItemAvatar name="Jane Cooper" />
      <span>Jane Cooper</span>
    </SidebarMenuButton>
  );
}'

# CLEAN: asChild + consumer 自管 div role="group" layout(canonical 修法)
CLEAN_ASCHILD='export function UserFooter() {
  return (
    <SidebarMenuButton asChild>
      <div role="group" className="flex items-center gap-2">
        <Avatar src="/jane.png" alt="Jane Cooper" size="sm" />
        <span data-sidebar="menu-label" className="min-w-0 flex-1 truncate">Jane Cooper</span>
      </div>
    </SidebarMenuButton>
  );
}'

# CLEAN: startIcon prop + 純文字 children(prop layout,不 wrap Avatar)
CLEAN_STARTICON='import { Settings } from "lucide-react";
export function NavItem() {
  return <SidebarMenuButton startIcon={Settings}>Settings</SidebarMenuButton>;
}'

# CLEAN (near-miss over-broad guard): <AvatarGroup 非 <Avatar(word-boundary 必須排除)
CLEAN_AVATARGROUP='export function TeamFooter() {
  return (
    <SidebarMenuButton id="team">
      <AvatarGroup users={members} max={3} />
    </SidebarMenuButton>
  );
}'

# CLEAN (near-miss over-broad guard): Avatar 在 block 外,SidebarMenuButton 用 startIcon
CLEAN_AVATAR_OUTSIDE='export function Footer() {
  return (
    <>
      <SidebarMenuButton startIcon={Home}>Home</SidebarMenuButton>
      <Avatar src="/x.png" alt="x" />
    </>
  );
}'

# CLEAN: 完全無 SidebarMenuButton(但有 Avatar)
CLEAN_NO_SMB='export function Card() {
  return <div className="card"><Avatar src="/x.png" alt="x" /></div>;
}'

# ── POSITIVE cases(should block)────────────────────────────────────────────────

# 1. 真 violation:<Avatar inside non-asChild SidebarMenuButton(guards over-narrow regex)
run_hook "/repo/apps/template/src/UserFooter.tsx" "$DRIFT_AVATAR"
expect_block "1. SidebarMenuButton no-asChild + <Avatar → block"

# 2. 真 violation 變體:<ItemAvatar prefix(同 detection branch)
run_hook "/repo/apps/template/src/UserFooter.tsx" "$DRIFT_ITEMAVATAR"
expect_block "2. SidebarMenuButton no-asChild + <ItemAvatar → block"

# 3. 同 violation 但走 Edit new_string field(覆蓋 content // new_string 雙路徑)
run_hook "/repo/apps/template/src/UserFooter.tsx" "$DRIFT_AVATAR" "new_string" "Edit"
expect_block "3. Edit new_string path + drift → block"

# ── NEGATIVE cases — clean input(should be SILENT)─────────────────────────────

# 4. asChild canonical 修法 → silent
run_hook "/repo/apps/template/src/UserFooter.tsx" "$CLEAN_ASCHILD"
expect_silent "4. asChild + div role=group → silent"

# 5. startIcon prop + 純文字 → silent(guards over-broad: 不該 fire 在合法 SidebarMenuButton)
run_hook "/repo/apps/template/src/NavItem.tsx" "$CLEAN_STARTICON"
expect_silent "5. startIcon prop, no Avatar → silent"

# 6. NEAR-MISS over-broad guard: <AvatarGroup 非 <Avatar(word-boundary)→ silent
run_hook "/repo/apps/template/src/TeamFooter.tsx" "$CLEAN_AVATARGROUP"
expect_silent "6. <AvatarGroup (word-boundary) → silent"

# 7. NEAR-MISS over-broad guard: Avatar 在 block 外 → silent
run_hook "/repo/apps/template/src/Footer.tsx" "$CLEAN_AVATAR_OUTSIDE"
expect_silent "7. Avatar outside SidebarMenuButton block → silent"

# 8. 無 SidebarMenuButton(只 Avatar)→ silent
run_hook "/repo/apps/template/src/Card.tsx" "$CLEAN_NO_SMB"
expect_silent "8. no SidebarMenuButton → silent"

# ── NEGATIVE cases — out-of-scope gating(should be SILENT)─────────────────────

# 9. 非 PreToolUse(PostToolUse)→ silent(即使 content 有 drift)
run_hook "/repo/apps/template/src/UserFooter.tsx" "$DRIFT_AVATAR" "content" "Write" "PostToolUse"
expect_silent "9. event=PostToolUse → skip (silent)"

# 10. 非 *.tsx(.ts)→ silent
run_hook "/repo/apps/template/src/UserFooter.ts" "$DRIFT_AVATAR"
expect_silent "10. non-.tsx file → skip (silent)"

# 11. *.test.tsx 排除 → silent
run_hook "/repo/apps/template/src/UserFooter.test.tsx" "$DRIFT_AVATAR"
expect_silent "11. *.test.tsx excluded → silent"

# 12. 非 Edit/Write/MultiEdit tool(Read)→ silent
run_hook "/repo/apps/template/src/UserFooter.tsx" "$DRIFT_AVATAR" "content" "Read"
expect_silent "12. tool=Read → skip (silent)"

# 13. GOVERNANCE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP=1 override → silent(即使 drift)
run_hook "/repo/apps/template/src/UserFooter.tsx" "$DRIFT_AVATAR" "content" "Write" "PreToolUse" "1"
expect_silent "13. GOVERNANCE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP=1 → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

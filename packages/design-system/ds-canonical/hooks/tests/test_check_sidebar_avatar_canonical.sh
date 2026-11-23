#!/bin/bash
# Tests for check_sidebar_avatar_canonical.sh(2026-11-18 knowledge-prune H-M3 合併)
#
# 兩份原測試逐格搬入,兩面對照各自保留:
#   r1(原 test_check_chrome_header_avatar_canonical.sh,16 格)—— <SidebarHeader> 內 <ItemAvatar> → exit 2
#   r2(原 test_check_sidebar_menu_button_implicit_wrap.sh,13 格)—— 無 asChild 的 <SidebarMenuButton> 包 <Avatar>/<ItemAvatar> → exit 2
# 每一格另外斷言「另一條規則的訊息沒有出現」:合併後同一支跑兩條,不得互相誤報。
# 合併後新增(C 系列):兩條同時中、各自的 bypass 只放行自己那條、bypass 紀錄用各自的 event 名、
#   沒開遙測不寫紀錄、parser 失敗 fail closed(exit 70,不是放行)。
#
# Hook contract(read from hook source 2026-11-18):
#   Event:  PreToolUse only(其他 event → exit 0 silent)
#   Tools:  Edit | Write | MultiEdit(其他 tool → exit 0 silent)
#   Scope:  *.tsx only;排除 *.test.tsx + *.spec.md
#   Field:  .tool_input.content // .tool_input.new_string
#   Bypass: GOVERNANCE_BYPASS_CHROME_HEADER_AVATAR=1 只放行 r1;GOVERNANCE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP=1 只放行 r2
#
# M34 broad-vs-narrow symmetry:
#   - over-narrow guard(positive):real violation(多種 tool/field)必 fire
#   - over-broad guard(negative):near-miss(Footer / ItemAvatarGroup / AvatarGroup / raw Avatar / asChild / startIcon)必 NOT fire

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_sidebar_avatar_canonical.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
# mktemp 失敗會回空字串;空字串拿去 cd / git init 就落回目前目錄(run-all.sh 已經切到測試語料)。先驗再用。
if [ -z "${TMP_DIR:-}" ] || [ ! -d "$TMP_DIR" ]; then
  echo "❌ mktemp -d failed(TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2
  exit 1
fi
TMP_DIR="$(cd "$TMP_DIR" && pwd -P)"
trap 'rm -rf "$TMP_DIR"' EXIT
# 任何 bypass 紀錄都落在這裡,不落在 repo
export GOVERNANCE_PROJECT_DIR="$TMP_DIR"

R1_NEEDLE="Chrome header avatar canonical violation"
R2_NEEDLE="SidebarMenuButton implicit-wrap canonical violation"
INTEGRITY_NEEDLE="GOVERNANCE_INTEGRITY:"

# run_hook <file_path> <content> [field=content|new_string] [tool=Write] [event=PreToolUse] [ENV=VALUE ...]
run_hook() {
  local file_path="$1" content="$2" field="${3:-content}" tool="${4:-Write}" event="${5:-PreToolUse}"
  local -a extra_env=()
  if [ "$#" -gt 5 ]; then extra_env=("${@:6}"); fi
  local payload
  payload=$(jq -n --arg fp "$file_path" --arg c "$content" --arg t "$tool" --arg e "$event" --arg f "$field" \
    '{hook_event_name:$e, tool_name:$t, tool_input:({file_path:$fp} + {($f):$c})}')
  printf '%s' "$payload" | env ${extra_env[@]+"${extra_env[@]}"} bash "$HOOK" >"$TMP_DIR/stdout" 2>"$TMP_DIR/stderr"
  EXIT=$?
  STDERR_TEXT=$(cat "$TMP_DIR/stderr")
}

record_fail() {
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $1"
  echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
}

has_needle() { printf '%s' "$STDERR_TEXT" | grep -qF "$1"; }

# expect_block <name> <needle that must appear> [needle that must NOT appear]
expect_block() {
  local name="$1" present="$2" absent="${3:-}"
  if [ "$EXIT" = "2" ] && has_needle "$present" && { [ -z "$absent" ] || ! has_needle "$absent"; }; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit=2 + '$present'${absent:+ without '$absent'}, got exit=$EXIT)"
    record_fail "$name"
  fi
}

# expect_block_both <name>:兩條規則的訊息都要出現
expect_block_both() {
  local name="$1"
  if [ "$EXIT" = "2" ] && has_needle "$R1_NEEDLE" && has_needle "$R2_NEEDLE"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit=2 + both rule messages, got exit=$EXIT)"
    record_fail "$name"
  fi
}

# expect_silent <name>:exit 0 + stderr 全空
expect_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent, exit=$EXIT, stderr=$([ -n "$STDERR_TEXT" ] && echo non-empty || echo empty))"
    record_fail "$name"
  fi
}

# expect_integrity <name>:exit 70 + GOVERNANCE_INTEGRITY marker(fail closed,不是放行)
expect_integrity() {
  local name="$1"
  if [ "$EXIT" = "70" ] && has_needle "$INTEGRITY_NEEDLE"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit=70 + '$INTEGRITY_NEEDLE', got exit=$EXIT)"
    record_fail "$name"
  fi
}

APP_FILE="/repo/my-project/apps/template/src/AppShell.tsx"

echo "=== check_sidebar_avatar_canonical tests ==="

# ════════════════════════════════════════════════════════════════════════════
# r1 —— 原 test_check_chrome_header_avatar_canonical.sh(編號 R1-1…R1-16 對應原 1…16)
# ════════════════════════════════════════════════════════════════════════════
echo "--- r1 chrome header avatar ---"

# ── POSITIVE(should block — guards over-narrow regex)──
HEADER_DRIFT=$'<SidebarHeader>\n  <ItemAvatar alt="Acme" shape="square" color="blue" solid />\n  <span>Acme Corp</span>\n</SidebarHeader>'
run_hook "$APP_FILE" "$HEADER_DRIFT"
expect_block "R1-1. SidebarHeader + ItemAvatar (Write/content) → block" "$R1_NEEDLE" "$R2_NEEDLE"

run_hook "$APP_FILE" "$HEADER_DRIFT" "new_string" "Edit"
expect_block "R1-2. SidebarHeader + ItemAvatar (Edit/new_string) → block" "$R1_NEEDLE" "$R2_NEEDLE"

run_hook "$APP_FILE" "$HEADER_DRIFT" "new_string" "MultiEdit"
expect_block "R1-3. SidebarHeader + ItemAvatar (MultiEdit/new_string) → block" "$R1_NEEDLE" "$R2_NEEDLE"

run_hook "/repo/my-project/packages/design-system/src/components/Sidebar/sidebar.stories.tsx" "$HEADER_DRIFT"
expect_block "R1-4. DS Sidebar stories.tsx scope → block" "$R1_NEEDLE" "$R2_NEEDLE"

HEADER_DRIFT_MULTILINE=$'<SidebarHeader className="px-3">\n  <div className="flex items-center gap-2">\n    <ItemAvatar\n      alt="Brand"\n      shape="square"\n    />\n    <span>Brand</span>\n  </div>\n</SidebarHeader>'
run_hook "$APP_FILE" "$HEADER_DRIFT_MULTILINE"
expect_block "R1-5. nested ItemAvatar in header (multiline DOTALL) → block" "$R1_NEEDLE" "$R2_NEEDLE"

# ── NEGATIVE(should be silent — guards over-broad regex)──
FOOTER_OK=$'<SidebarFooter>\n  <ItemAvatar alt="Jane Doe" shape="circle" />\n  <span>Jane Doe</span>\n</SidebarFooter>'
run_hook "$APP_FILE" "$FOOTER_OK"
expect_silent "R1-6. SidebarFooter + ItemAvatar (row context, allowed) → silent"

HEADER_GROUP=$'<SidebarHeader>\n  <ItemAvatarGroup>\n    <span>A</span>\n  </ItemAvatarGroup>\n</SidebarHeader>'
run_hook "$APP_FILE" "$HEADER_GROUP"
expect_silent "R1-7. SidebarHeader + ItemAvatarGroup (word-boundary, not banned) → silent"

HEADER_RAW=$'<SidebarHeader>\n  <Avatar size={24} shape="square" color="blue" solid alt="Acme" />\n  <span className="text-body-lg font-medium truncate">Acme</span>\n</SidebarHeader>'
run_hook "$APP_FILE" "$HEADER_RAW"
expect_silent "R1-8. SidebarHeader + raw Avatar size=24 (canonical) → silent"

MIXED=$'<SidebarHeader>\n  <Avatar size={24} alt="Acme" />\n</SidebarHeader>\n<SidebarFooter>\n  <ItemAvatar alt="Jane" />\n</SidebarFooter>'
run_hook "$APP_FILE" "$MIXED"
expect_silent "R1-9. raw-Avatar header + ItemAvatar footer → silent"

run_hook "/repo/my-project/packages/design-system/src/components/Sidebar/sidebar.spec.md" "$HEADER_DRIFT"
expect_silent "R1-10. *.spec.md scope excluded → silent"

run_hook "/repo/my-project/apps/template/src/AppShell.test.tsx" "$HEADER_DRIFT"
expect_silent "R1-11. *.test.tsx scope excluded → silent"

run_hook "/repo/my-project/apps/template/src/AppShell.ts" "$HEADER_DRIFT"
expect_silent "R1-12. non-tsx (.ts) file → silent"

run_hook "$APP_FILE" "$HEADER_DRIFT" "content" "Read"
expect_silent "R1-13. tool=Read (non-edit) → silent"

run_hook "$APP_FILE" "$HEADER_DRIFT" "content" "Write" "PostToolUse"
expect_silent "R1-14. event=PostToolUse → silent"

run_hook "$APP_FILE" $'export default function App() {\n  return <div className="p-4">Hello</div>;\n}'
expect_silent "R1-15. innocuous tsx (no SidebarHeader) → silent"

run_hook "$APP_FILE" "$HEADER_DRIFT" "content" "Write" "PreToolUse" GOVERNANCE_BYPASS_CHROME_HEADER_AVATAR=1
expect_silent "R1-16. GOVERNANCE_BYPASS_CHROME_HEADER_AVATAR=1 → silent"

# ════════════════════════════════════════════════════════════════════════════
# r2 —— 原 test_check_sidebar_menu_button_implicit_wrap.sh(編號 R2-1…R2-13 對應原 1…13)
# ════════════════════════════════════════════════════════════════════════════
echo "--- r2 SidebarMenuButton implicit wrap ---"

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

USER_FOOTER="/repo/apps/template/src/UserFooter.tsx"

# ── POSITIVE(should block)──
run_hook "$USER_FOOTER" "$DRIFT_AVATAR"
expect_block "R2-1. SidebarMenuButton no-asChild + <Avatar → block" "$R2_NEEDLE" "$R1_NEEDLE"

run_hook "$USER_FOOTER" "$DRIFT_ITEMAVATAR"
expect_block "R2-2. SidebarMenuButton no-asChild + <ItemAvatar → block" "$R2_NEEDLE" "$R1_NEEDLE"

run_hook "$USER_FOOTER" "$DRIFT_AVATAR" "new_string" "Edit"
expect_block "R2-3. Edit new_string path + drift → block" "$R2_NEEDLE" "$R1_NEEDLE"

# ── NEGATIVE — clean input(should be SILENT)──
run_hook "$USER_FOOTER" "$CLEAN_ASCHILD"
expect_silent "R2-4. asChild + div role=group → silent"

run_hook "/repo/apps/template/src/NavItem.tsx" "$CLEAN_STARTICON"
expect_silent "R2-5. startIcon prop, no Avatar → silent"

run_hook "/repo/apps/template/src/TeamFooter.tsx" "$CLEAN_AVATARGROUP"
expect_silent "R2-6. <AvatarGroup (word-boundary) → silent"

run_hook "/repo/apps/template/src/Footer.tsx" "$CLEAN_AVATAR_OUTSIDE"
expect_silent "R2-7. Avatar outside SidebarMenuButton block → silent"

run_hook "/repo/apps/template/src/Card.tsx" "$CLEAN_NO_SMB"
expect_silent "R2-8. no SidebarMenuButton → silent"

# ── NEGATIVE — out-of-scope gating(should be SILENT)──
run_hook "$USER_FOOTER" "$DRIFT_AVATAR" "content" "Write" "PostToolUse"
expect_silent "R2-9. event=PostToolUse → skip (silent)"

run_hook "/repo/apps/template/src/UserFooter.ts" "$DRIFT_AVATAR"
expect_silent "R2-10. non-.tsx file → skip (silent)"

run_hook "/repo/apps/template/src/UserFooter.test.tsx" "$DRIFT_AVATAR"
expect_silent "R2-11. *.test.tsx excluded → silent"

run_hook "$USER_FOOTER" "$DRIFT_AVATAR" "content" "Read"
expect_silent "R2-12. tool=Read → skip (silent)"

run_hook "$USER_FOOTER" "$DRIFT_AVATAR" "content" "Write" "PreToolUse" GOVERNANCE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP=1
expect_silent "R2-13. GOVERNANCE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP=1 → silent"

# ════════════════════════════════════════════════════════════════════════════
# C —— 合併後才有的情境:兩條同一支跑,不得互相吞掉、bypass 不得跨規則
# ════════════════════════════════════════════════════════════════════════════
echo "--- C combined ---"

# 同一份 Sidebar:標頭用 ItemAvatar(r1)+ 帳號列沒 asChild 包 Avatar(r2)
BOTH_DRIFT='export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <ItemAvatar alt="Acme" shape="square" color="blue" solid />
        <span>Acme Corp</span>
      </SidebarHeader>
      <SidebarFooter>
        <SidebarMenuButton tooltip="Jane Cooper">
          <Avatar src="/jane.png" alt="Jane Cooper" size="sm" />
          <span className="truncate">Jane Cooper</span>
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}'

run_hook "$APP_FILE" "$BOTH_DRIFT"
expect_block_both "C-1. 兩條同時中 → exit 2,兩則訊息都印(不因第一條中就停)"

run_hook "$APP_FILE" "$BOTH_DRIFT" "content" "Write" "PreToolUse" GOVERNANCE_BYPASS_CHROME_HEADER_AVATAR=1
expect_block "C-2. 只 bypass r1 → r2 照擋(r1 的 bypass 不放行 r2)" "$R2_NEEDLE" "$R1_NEEDLE"

run_hook "$APP_FILE" "$BOTH_DRIFT" "content" "Write" "PreToolUse" GOVERNANCE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP=1
expect_block "C-3. 只 bypass r2 → r1 照擋(r2 的 bypass 不放行 r1)" "$R1_NEEDLE" "$R2_NEEDLE"

run_hook "$APP_FILE" "$BOTH_DRIFT" "content" "Write" "PreToolUse" \
  GOVERNANCE_BYPASS_CHROME_HEADER_AVATAR=1 GOVERNANCE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP=1
expect_silent "C-4. 兩條都 bypass → silent"

# C-5 / C-6:bypass 紀錄。紀錄只寫進 Git 擁有的 runtime 目錄,所以在 TMP_DIR 底下建一個 repo 當 project。
LOG_REPO="$TMP_DIR/bypass-log-repo"
mkdir -p "$LOG_REPO"
git -C "$LOG_REPO" init -q
LOG_FILE="$(cd "$(git -C "$LOG_REPO" rev-parse --absolute-git-dir)" && pwd -P)/governance-runtime/governance-bypass.jsonl"

run_hook "$APP_FILE" "$BOTH_DRIFT" "content" "Write" "PreToolUse" \
  GOVERNANCE_PROJECT_DIR="$LOG_REPO" GOVERNANCE_TELEMETRY_OPT_IN=1 GOVERNANCE_READ_ONLY=0 \
  GOVERNANCE_BYPASS_CHROME_HEADER_AVATAR=1 GOVERNANCE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP=1
EVENTS=""
[ -f "$LOG_FILE" ] && EVENTS=$(jq -r '"\(.event)|\(.file)"' "$LOG_FILE" 2>/dev/null)
EXPECTED_EVENTS="chrome-header-avatar-bypass|$APP_FILE
sidebar-menu-button-wrap-bypass|$APP_FILE"
if [ "$EXIT" = "0" ] && [ "$EVENTS" = "$EXPECTED_EVENTS" ]; then
  echo "  PASS  C-5. 開遙測時 bypass 各記一筆,event 名沿用原兩支(chrome-header-avatar-bypass / sidebar-menu-button-wrap-bypass)"
  PASS=$((PASS+1))
else
  echo "  FAIL  C-5. bypass 紀錄不對(exit=$EXIT)"
  echo "    expected:"; printf '%s\n' "$EXPECTED_EVENTS" | sed 's/^/      /'
  echo "    actual:";   printf '%s\n' "$EVENTS" | sed 's/^/      /'
  record_fail "C-5. bypass 紀錄"
fi

rm -f "$LOG_FILE"
run_hook "$APP_FILE" "$BOTH_DRIFT" "content" "Write" "PreToolUse" \
  GOVERNANCE_PROJECT_DIR="$LOG_REPO" GOVERNANCE_TELEMETRY_OPT_IN=0 GOVERNANCE_READ_ONLY=0 \
  GOVERNANCE_BYPASS_CHROME_HEADER_AVATAR=1 GOVERNANCE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP=1
if [ "$EXIT" = "0" ] && [ ! -e "$LOG_FILE" ]; then
  echo "  PASS  C-6. 沒開遙測時 bypass 不寫任何紀錄(byte-for-byte read-only)"
  PASS=$((PASS+1))
else
  echo "  FAIL  C-6. 沒開遙測卻寫了紀錄或沒放行(exit=$EXIT, log=$([ -e "$LOG_FILE" ] && echo present || echo absent))"
  record_fail "C-6. 沒開遙測不寫紀錄"
fi

# C-7:python 壞掉 → fail closed(exit 70),不得當成「沒偵測到」而放行
POISON_BIN="$TMP_DIR/poison-bin"
mkdir -p "$POISON_BIN"
printf '#!/bin/sh\nexit 1\n' > "$POISON_BIN/python3"
chmod +x "$POISON_BIN/python3"
run_hook "$APP_FILE" "$BOTH_DRIFT" "content" "Write" "PreToolUse" PATH="$POISON_BIN:$PATH"
expect_integrity "C-7. parser 失敗 → GOVERNANCE_INTEGRITY exit 70(fail closed)"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

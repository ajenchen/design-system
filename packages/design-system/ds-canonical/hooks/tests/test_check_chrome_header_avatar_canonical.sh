#!/bin/bash
# Tests for check_chrome_header_avatar_canonical.sh(2026-05-27 codified,per user UserFooter drift + codex cite battle)
#
# Hook contract(read from hook source 2026-05-30):
#   Event:  PreToolUse only(其他 event → exit 0 silent)
#   Tools:  Edit | Write | MultiEdit(其他 tool → exit 0 silent)
#   Scope:  *.tsx only;排除 *.test.tsx + *.spec.md
#   Field:  .tool_input.content // .tool_input.new_string
#   Detect: Python multiline regex — `<SidebarHeader...>...</SidebarHeader>` block
#           內含 `<ItemAvatar\b` → BLOCKER(exit 2,2026-05-31 folded-hook-audit 升 0→2)
#   IMPORTANT: 偵測到 drift = **exit 2**(真 block;SSOT canonical per feedback_ssot_mechanical_p0_not_p1)。
#              positive case 斷言 = stderr needle + exit 2(env escape GOVERNANCE_BYPASS_CHROME_HEADER_AVATAR 兜)。
#   Allow:  SidebarFooter 內 ItemAvatar(footer 是 row context)→ silent
#           raw <Avatar size={24}> in header → silent
#           <ItemAvatarGroup>(word-boundary near-miss,非 banned ItemAvatar)→ silent
#   Bypass: GOVERNANCE_BYPASS_CHROME_HEADER_AVATAR=1 → silent(audit-logged)
#
# M34 broad-vs-narrow symmetry:
#   - over-narrow guard(positive):real violation(Header+ItemAvatar,多種 tool/field)必 fire
#   - over-broad guard(negative):near-miss(Footer / ItemAvatarGroup / raw Avatar)必 NOT fire

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_chrome_header_avatar_canonical.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

# TMP_DIR override so any bypass-log write lands here, not in repo .claude/logs/
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
export GOVERNANCE_PROJECT_DIR="$TMP_DIR"
mkdir -p "$TMP_DIR/.claude/logs"

# run_hook <content> [file_path] [tool_name] [field] [bypass]
#   field: "content"(default) | "new_string"
#   bypass: "1" to set GOVERNANCE_BYPASS_CHROME_HEADER_AVATAR=1
run_hook() {
  local content="$1"
  local file_path="${2:-/repo/my-project/apps/template/src/AppShell.tsx}"
  local tool="${3:-Write}"
  local field="${4:-content}"
  local bypass="${5:-0}"
  local payload
  if [ "$field" = "new_string" ]; then
    payload=$(jq -n --arg c "$content" --arg fp "$file_path" --arg tn "$tool" \
      '{hook_event_name:"PreToolUse", tool_name:$tn, tool_input:{file_path:$fp, new_string:$c}}')
  else
    payload=$(jq -n --arg c "$content" --arg fp "$file_path" --arg tn "$tool" \
      '{hook_event_name:"PreToolUse", tool_name:$tn, tool_input:{file_path:$fp, content:$c}}')
  fi
  local stdout stderr
  stdout=$(mktemp); stderr=$(mktemp)
  set +e
  if [ "$bypass" = "1" ]; then
    printf '%s' "$payload" | GOVERNANCE_BYPASS_CHROME_HEADER_AVATAR=1 bash "$HOOK" >"$stdout" 2>"$stderr"
  else
    printf '%s' "$payload" | bash "$HOOK" >"$stdout" 2>"$stderr"
  fi
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$stderr")
  rm -f "$stdout" "$stderr"
}

# run_hook_raw <full_json_payload>  — for non-standard event/tool shapes
run_hook_raw() {
  local payload="$1"
  local stdout stderr
  stdout=$(mktemp); stderr=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$stdout" 2>"$stderr"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$stderr")
  rm -f "$stdout" "$stderr"
}

# positive: hook BLOCKS(exit 2 + stderr needle)— 2026-05-31 folded-hook-audit 升 exit 0→2
# (chrome-header avatar 是 SSOT canonical,per feedback_ssot_mechanical_p0_not_p1 必 P0 BLOCK;有 env escape)
expect_block() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit=2 + stderr '$needle', got exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

# negative: silent(exit 0 + empty stderr)
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

echo "=== check_chrome_header_avatar_canonical tests ==="

NEEDLE="Chrome header avatar canonical violation"

# ── POSITIVE(should inject — guards over-narrow regex)──────────────────────

# 1. Real violation: SidebarHeader block 內含 ItemAvatar(Write/content)
HEADER_DRIFT=$'<SidebarHeader>\n  <ItemAvatar alt="Acme" shape="square" color="blue" solid />\n  <span>Acme Corp</span>\n</SidebarHeader>'
run_hook "$HEADER_DRIFT"
expect_block "1. SidebarHeader + ItemAvatar (Write/content) → block" "$NEEDLE"

# 2. Same violation via Edit tool + new_string field
run_hook "$HEADER_DRIFT" "/repo/my-project/apps/template/src/AppShell.tsx" "Edit" "new_string"
expect_block "2. SidebarHeader + ItemAvatar (Edit/new_string) → block" "$NEEDLE"

# 3. Same violation via MultiEdit tool
run_hook "$HEADER_DRIFT" "/repo/my-project/apps/template/src/AppShell.tsx" "MultiEdit" "new_string"
expect_block "3. SidebarHeader + ItemAvatar (MultiEdit/new_string) → block" "$NEEDLE"

# 4. DS-internal Sidebar component file scope also covered
run_hook "$HEADER_DRIFT" "/repo/my-project/packages/design-system/src/components/Sidebar/sidebar.stories.tsx"
expect_block "4. DS Sidebar stories.tsx scope → block" "$NEEDLE"

# 5. ItemAvatar with attributes spanning the header block(multiline DOTALL match)
HEADER_DRIFT_MULTILINE=$'<SidebarHeader className="px-3">\n  <div className="flex items-center gap-2">\n    <ItemAvatar\n      alt="Brand"\n      shape="square"\n    />\n    <span>Brand</span>\n  </div>\n</SidebarHeader>'
run_hook "$HEADER_DRIFT_MULTILINE"
expect_block "5. nested ItemAvatar in header (multiline DOTALL) → block" "$NEEDLE"

# ── NEGATIVE(should be silent — guards over-broad regex)────────────────────

# 6. Near-miss A: SidebarFooter + ItemAvatar(footer IS row context → allowed)
FOOTER_OK=$'<SidebarFooter>\n  <ItemAvatar alt="Jane Doe" shape="circle" />\n  <span>Jane Doe</span>\n</SidebarFooter>'
run_hook "$FOOTER_OK"
expect_silent "6. SidebarFooter + ItemAvatar (row context, allowed) → silent"

# 7. Near-miss B: word-boundary — <ItemAvatarGroup> in header is NOT banned <ItemAvatar>
HEADER_GROUP=$'<SidebarHeader>\n  <ItemAvatarGroup>\n    <span>A</span>\n  </ItemAvatarGroup>\n</SidebarHeader>'
run_hook "$HEADER_GROUP"
expect_silent "7. SidebarHeader + ItemAvatarGroup (word-boundary, not banned) → silent"

# 8. Correct canonical: raw <Avatar size={24}> in header → silent
HEADER_RAW=$'<SidebarHeader>\n  <Avatar size={24} shape="square" color="blue" solid alt="Acme" />\n  <span className="text-body-lg font-medium truncate">Acme</span>\n</SidebarHeader>'
run_hook "$HEADER_RAW"
expect_silent "8. SidebarHeader + raw Avatar size=24 (canonical) → silent"

# 9. Header(raw Avatar) + separate Footer(ItemAvatar) — only footer uses ItemAvatar → silent
MIXED=$'<SidebarHeader>\n  <Avatar size={24} alt="Acme" />\n</SidebarHeader>\n<SidebarFooter>\n  <ItemAvatar alt="Jane" />\n</SidebarFooter>'
run_hook "$MIXED"
expect_silent "9. raw-Avatar header + ItemAvatar footer → silent"

# 10. Scope: *.spec.md excluded even with drift present → silent
run_hook "$HEADER_DRIFT" "/repo/my-project/packages/design-system/src/components/Sidebar/sidebar.spec.md"
expect_silent "10. *.spec.md scope excluded → silent"

# 11. Scope: *.test.tsx excluded even with drift → silent
run_hook "$HEADER_DRIFT" "/repo/my-project/apps/template/src/AppShell.test.tsx"
expect_silent "11. *.test.tsx scope excluded → silent"

# 12. Scope: non-tsx (.ts) → silent
run_hook "$HEADER_DRIFT" "/repo/my-project/apps/template/src/AppShell.ts"
expect_silent "12. non-tsx (.ts) file → silent"

# 13. Wrong tool: Read with drift content → silent
run_hook "$HEADER_DRIFT" "/repo/my-project/apps/template/src/AppShell.tsx" "Read"
expect_silent "13. tool=Read (non-edit) → silent"

# 14. Wrong event: PostToolUse with full drift payload → silent
POST_PAYLOAD=$(jq -n --arg c "$HEADER_DRIFT" \
  '{hook_event_name:"PostToolUse", tool_name:"Write", tool_input:{file_path:"/repo/my-project/apps/template/src/AppShell.tsx", content:$c}}')
run_hook_raw "$POST_PAYLOAD"
expect_silent "14. event=PostToolUse → silent"

# 15. Innocuous tsx (no Sidebar at all) → silent
run_hook $'export default function App() {\n  return <div className="p-4">Hello</div>;\n}'
expect_silent "15. innocuous tsx (no SidebarHeader) → silent"

# 16. Bypass env var → silent even on real violation
run_hook "$HEADER_DRIFT" "/repo/my-project/apps/template/src/AppShell.tsx" "Write" "content" "1"
expect_silent "16. GOVERNANCE_BYPASS_CHROME_HEADER_AVATAR=1 → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

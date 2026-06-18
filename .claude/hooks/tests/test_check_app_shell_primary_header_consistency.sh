#!/bin/bash
# Tests for check_app_shell_primary_header_consistency.sh
#
# Hook(PreToolUse Edit/Write):偵測 AppShell consumer 3 violations:
#   V1 layout="primary-header" 缺 globalHeader prop
#   V2 layout="primary-header" + 同 file 含 <SidebarHeader>(useSidebar/isMobile 豁免)
#   V3 layout="primary-header" + 同 file 含 <SidebarFooter>(帳號家在 header 右,非 footer;無 isMobile 豁免)
#
# Hook 透過 stdin 讀 tool_input(INPUT=$(cat) + jq;2026-05-31 改 env→stdin 對齊 sibling helper + 讓 dispatcher 能呼叫)
# 且需 TARGET file 真實存在於 disk(`[[ ! -f "$TARGET" ]] && exit 0`)。
# 排除:.spec.md / *test* / app-shell.tsx 自身 / `@app-shell-primary-header-allow:` escape。
# Violation 時 stderr「🚨 AppShell primary-header consistency violation」+ exit 2。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../lib/_app_shell_primary_header_consistency.sh"
TMPDIR_TEST=$(mktemp -d)
trap 'rm -rf "$TMPDIR_TEST"' EXIT

if [ ! -x "$HOOK" ]; then chmod +x "$HOOK" 2>/dev/null || true; fi
if [ ! -f "$HOOK" ]; then echo "FATAL: hook not found: $HOOK"; exit 1; fi

PASS=0
FAIL=0
FAILED_TESTS=""

# Helper: write file to test temp dir, run hook with that path
run_hook_on_file() {
  local rel="$1"; local content="$2"
  local fp="$TMPDIR_TEST/$rel"
  mkdir -p "$(dirname "$fp")"
  printf '%s' "$content" > "$fp"
  local payload
  payload=$(jq -n --arg fp "$fp" --arg tn "Edit" \
    '{tool_name: $tn, tool_input: {file_path: $fp, new_string: ""}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

# Helper: run with arbitrary path (non-existent) for skip tests
run_hook_no_file() {
  local fp="$1"; local tool="${2:-Edit}"
  local payload
  payload=$(jq -n --arg fp "$fp" --arg tn "$tool" \
    '{tool_name: $tn, tool_input: {file_path: $fp, new_string: ""}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent, exit=$EXIT, stderr non-empty=$([ -n "$STDERR_TEXT" ] && echo yes))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_block() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit=2 + needle '$needle', got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_app_shell_primary_header_consistency tests ==="

# 1. Non-tsx file → skip
run_hook_no_file "$TMPDIR_TEST/foo.md" "Edit"
expect_pass_silent "1. non-tsx file → skip"

# 2. Non-Edit/Write tool → skip
run_hook_no_file "$TMPDIR_TEST/foo.tsx" "Read"
expect_pass_silent "2. Read tool → skip"

# 3. layout="primary-header" with globalHeader + no SidebarHeader → silent (compliant)
run_hook_on_file "src/app.tsx" '
<AppShell layout="primary-header" globalHeader={<GlobalHeader />}>
  <Sidebar />
</AppShell>
'
expect_pass_silent "3. primary-header + globalHeader + no SidebarHeader → silent"

# 4. layout="primary-header" missing globalHeader → block (V1)
run_hook_on_file "src/missing-gh.tsx" '
<AppShell layout="primary-header">
  <Sidebar />
</AppShell>
'
expect_block "4. V1 missing globalHeader → block" "V1 缺 globalHeader prop"

# 5. layout="primary-header" + <SidebarHeader> with globalHeader → V2 only block
run_hook_on_file "src/dup-header.tsx" '
<AppShell layout="primary-header" globalHeader={<GH />}>
  <Sidebar>
    <SidebarHeader>brand</SidebarHeader>
  </Sidebar>
</AppShell>
'
expect_block "5. V2 SidebarHeader duplicate → block" "V2 Sidebar 內含 SidebarHeader"

# 6. Escape allowlist → silent
run_hook_on_file "src/escape.tsx" '// @app-shell-primary-header-allow: legacy migration in progress
<AppShell layout="primary-header">
  <SidebarHeader>brand</SidebarHeader>
</AppShell>
'
expect_pass_silent "6. escape allowlist → silent"

# 7. No primary-header layout at all → skip
run_hook_on_file "src/other.tsx" '
<AppShell layout="primary-sidebar">
  <Sidebar />
</AppShell>
'
expect_pass_silent "7. layout != primary-header → skip"

# 8. responsive mobile-aware fork(useSidebar/isMobile + SidebarHeader + globalHeader)→ silent
#    (2026-06-18 精修豁免:mobile-only 補品牌不是 desktop 重複)
run_hook_on_file "src/responsive.tsx" '
const { isMobile } = useSidebar()
<AppShell layout="primary-header" globalHeader={<GH />}>
  <Sidebar>
    {isMobile && <SidebarHeader>brand</SidebarHeader>}
  </Sidebar>
</AppShell>
'
expect_pass_silent "8. responsive isMobile + SidebarHeader → silent(mobile-only 補品牌豁免)"

# 9. layout="primary-header" + <SidebarFooter> → block (V3)
#    (2026-06-18 beta.74:primary-header 帳號家在 header 右,sidebar footer 是 primary-sidebar 慣例;無 isMobile 豁免)
run_hook_on_file "src/ph-footer.tsx" '
<AppShell layout="primary-header" globalHeader={<GH />}>
  <Sidebar>
    <SidebarFooter>account</SidebarFooter>
  </Sidebar>
</AppShell>
'
expect_block "9. V3 primary-header + SidebarFooter → block" "V3 Sidebar 內含 SidebarFooter"

# 10. layout="primary-header" + mobile header-right account(SidebarHeader 補品牌+帳號,無 SidebarFooter)→ silent
#     (2026-06-18:帳號鏡像 globalHeader 到 Sheet header 右,無 footer = 合規;V2 isMobile 豁免 + V3 無 footer)
run_hook_on_file "src/ph-header-account.tsx" '
const { isMobile } = useSidebar()
<AppShell layout="primary-header" globalHeader={<GH />}>
  <Sidebar>
    {isMobile && <SidebarHeader><WorkspaceBrand /><AccountMenu /></SidebarHeader>}
  </Sidebar>
</AppShell>
'
expect_pass_silent "10. primary-header + header-right account, no footer → silent"

# 11. single-quote JSX layout={'primary-header'} missing globalHeader → block (V1)
#     (2026-06-18 beta.74 regression:octal \047 gate bug → 單引號 JSX 整個 hook 靜默 skip;fix 後三種引號形式皆偵測)
run_hook_on_file "src/single-quote.tsx" "
<AppShell layout={'primary-header'}>
  <Sidebar />
</AppShell>
"
expect_block "11. single-quote layout JSX gate (octal fix regression) → V1 block" "V1 缺 globalHeader prop"

# 12. prefix-extended component name <SidebarFooterPanel> with primary-header → silent (tag-boundary guard, V3 no false-positive)
#     (2026-06-18 beta.74 audit P2#4:`<SidebarFooter` 不該 match `<SidebarFooterPanel`)
run_hook_on_file "src/prefix-extended.tsx" '
<AppShell layout="primary-header" globalHeader={<GH />}>
  <Sidebar>
    <SidebarFooterPanel>not the DS SidebarFooter</SidebarFooterPanel>
  </Sidebar>
</AppShell>
'
expect_pass_silent "12. prefix-extended <SidebarFooterPanel> → silent(V3 tag-boundary 不誤觸)"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

#!/bin/bash
# test_check_tabs_content_chrome_body_double_gap.sh — overlay-body layout-space 哨測試
# (2026-07-10 補 hook-test-coverage debt;hook 2026-07-01 建,anchor = 專案設定 Dialog 雙 tight)
# 注意:本 hook 是 PostToolUse「讀完整檔」型(防 partial-edit 盲區)→ 測試必寫真實 temp 檔,
# 且路徑必須匹配 scope regex(packages/design-system/src/ 或 /apps/)。
set -uo pipefail
cd "$(dirname "$0")/../../.."
HOOK=".claude/hooks/check_tabs_content_chrome_body_double_gap.sh"
PASS=0; FAIL=0; FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
export CLAUDE_PROJECT_DIR="$TMP_DIR"
mkdir -p "$TMP_DIR/.claude/logs"

# scope 內的真實 temp 檔路徑(hook 讀 disk)
DS_DIR="$TMP_DIR/packages/design-system/src/components/Dialog"
mkdir -p "$DS_DIR"

run_hook_file() {
  local file_path="$1"; local content="$2"
  mkdir -p "$(dirname "$file_path")"
  printf '%s' "$content" > "$file_path"
  local payload
  payload=$(jq -n --arg fp "$file_path" --arg c "$content" \
    '{tool_name:"Edit", tool_input:{file_path:$fp, new_string:$c}}')
  STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >/dev/null 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null); rm -f "$STDERR"
  rm -f "$file_path"
}

expect_block() {
  local name="$1"
  if [ "$EXIT" = "2" ]; then echo "  PASS  $name"; PASS=$((PASS+1))
  else echo "  FAIL  $name (expected exit=2, got exit=$EXIT)"; FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"; fi
}
expect_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then echo "  PASS  $name"; PASS=$((PASS+1))
  else echo "  FAIL  $name (expected silent exit=0, got exit=$EXIT, stderr=${STDERR_TEXT:+non-empty})"; FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"; fi
}

# 1. POSITIVE(Check 1 錨例):chrome body 內 TabsContent 無 mt-0 → 雙重 gap → BLOCK
run_hook_file "$DS_DIR/case1.stories.tsx" '<DialogBody><Tabs value={t}><TabsContent value="a"><p>內容</p></TabsContent></Tabs></DialogBody>'
expect_block "1. DialogBody 內 TabsContent 無 mt-0 → BLOCK"

# 2. NEGATIVE:TabsContent 帶 mt-0(ownership 轉移給 body)→ silent
run_hook_file "$DS_DIR/case2.stories.tsx" '<DialogBody><Tabs value={t}><TabsContent value="a" className="mt-0"><p>內容</p></TabsContent></Tabs></DialogBody>'
expect_silent "2. TabsContent className=mt-0 → silent"

# 3. NEGATIVE:TabsContent 不在 chrome body 內(頁面級 Tabs)→ silent
run_hook_file "$DS_DIR/case3.stories.tsx" '<Tabs value={t}><TabsList>…</TabsList><TabsContent value="a"><p>內容</p></TabsContent></Tabs>'
expect_silent "3. 頁面級 Tabs(無 chrome body)→ silent"

# 4. POSITIVE(Check 3 root 簽名):TabsList 手塞 DialogBody 同檔且無 tabsSlot → BLOCK
run_hook_file "$DS_DIR/case4.stories.tsx" '<DialogBody><TabsList size="sm"><TabsTrigger value="a">A</TabsTrigger></TabsList><TabsContent value="a" className="mt-0">x</TabsContent></DialogBody>'
expect_block "4. TabsList 手塞 chrome body 無 tabsSlot → BLOCK(root)"

# 5. NEGATIVE:escape 註解 → silent
run_hook_file "$DS_DIR/case5.stories.tsx" '{/* @tabs-content-gap-ok: 內容層分頁非 dialog chrome */}
<DialogBody><Tabs value={t}><TabsContent value="a">x</TabsContent></Tabs></DialogBody>'
expect_silent "5. @tabs-content-gap-ok escape → silent"

# 6. NEGATIVE:scope 外路徑(非 DS-src / apps)→ silent
run_hook_file "$TMP_DIR/docs/example.tsx" '<DialogBody><TabsContent value="a">x</TabsContent></DialogBody>'
expect_silent "6. scope 外路徑 → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then printf "Failed:%b\n" "$FAILED_TESTS"; exit 1; fi
exit 0

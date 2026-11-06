#!/bin/bash
# Tests for check_benchmark_citation.sh
#
# Hook(PreToolUse Edit/Write/MultiEdit):spec.md / .tsx in packages/design-system/src/
# 含 world-class benchmark claim(Ant / Material / Polaris ...)必附 inline citation
# (URL / GitHub #L / snapshots/ / @benchmark-unverified)。違 P0 BLOCKER(exit 2,2026-07-07 方向 2 升級)。
# Component specs 是 zero-debt scope,禁止逐句與檔級 escape；其他 scope 保留既有 escape。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_benchmark_citation.sh"

if [ ! -f "$HOOK" ]; then echo "FATAL: hook not found: $HOOK"; exit 1; fi

PASS=0
FAIL=0
FAILED_TESTS=""

# tool_input.content 用於 Write;tool_input.new_string 用於 Edit
run_hook_write() {
  local file_path="$1"; local content="$2"
  local payload
  payload=$(jq -n --arg fp "$file_path" --arg c "$content" \
    '{tool_name: "Write", tool_input: {file_path: $fp, content: $c}}')
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
    echo "  FAIL  $name (expected silent, exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_warn() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit=2 + needle '$needle', got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_benchmark_citation tests ==="

# 1. Non-DS path → skip
run_hook_write "/tmp/random.tsx" '對齊 Ant Design'
expect_pass_silent "1. non-DS path → skip"

# 2. DS path no benchmark claim → silent
run_hook_write "/repo/packages/design-system/src/components/Foo/foo.spec.md" '
# Foo spec
普通文字無 world-class claim
'
expect_pass_silent "2. no benchmark claim → silent"

# 3. DS path Ant Design claim WITH inline URL → silent
run_hook_write "/repo/packages/design-system/src/components/Foo/foo.spec.md" '
對齊 Ant Design 設計
參考 https://ant-design.com/components/foo
'
expect_pass_silent "3. claim + ant-design URL → silent"

# 4. DS path Material claim with GitHub #L cite → silent
run_hook_write "/repo/packages/design-system/src/components/Foo/foo.tsx" '
// 對齊 Material UI button(https://github.com/mui/material-ui/blob/master/Button.tsx#L42)
const x = 1
'
expect_pass_silent "4. claim + github #L cite → silent"

# 5. DS path Polaris claim WITHOUT citation → warn
run_hook_write "/repo/packages/design-system/src/components/Foo/foo.spec.md" '
# Foo spec

對齊 Polaris 設計派,確保視覺一致。
'
expect_warn "5. Polaris claim missing cite → warn" "check_benchmark_citation"

# 6. Non-component spec can still use the legacy per-claim retraction
run_hook_write "/repo/packages/design-system/src/patterns/Foo/foo.spec.md" '
# Foo spec

對齊 Atlassian Design @benchmark-unverified 待補 source
'
expect_pass_silent "6. non-component claim with @benchmark-unverified → silent"

# 7. Non-component file-level @benchmark-citation-allow escape → silent
run_hook_write "/repo/packages/design-system/src/patterns/Foo/foo.spec.md" '// @benchmark-citation-allow: legacy migration backlog
# Foo

對齊 Carbon Design 內部共識。
對齊 Polaris 派系。
'
expect_pass_silent "7. non-component file-level @benchmark-citation-allow → silent"

# 8. Component per-claim retraction cannot recreate evidence debt
run_hook_write "/repo/packages/design-system/src/components/Foo/foo.spec.md" '
# Foo spec

對齊 Atlassian Design @benchmark-unverified 待補 source
'
expect_warn "8. component @benchmark-unverified → BLOCK" "component spec benchmark evidence debt"

# 9. Component blanket retraction cannot bypass the zero-debt rule
run_hook_write "/repo/packages/design-system/src/components/Foo/foo.spec.md" '<!-- @benchmark-unverified-blanket: legacy backlog -->
# Foo

對齊 Carbon Design 內部共識。
'
expect_warn "9. component @benchmark-unverified-blanket → BLOCK" "zero-debt scope"

# 10. Component file-level citation allow cannot bypass the zero-debt rule
run_hook_write "/repo/packages/design-system/src/components/Foo/foo.spec.md" '<!-- @benchmark-citation-allow: legacy backlog -->
# Foo

對齊 Polaris 派系。
'
expect_warn "10. component @benchmark-citation-allow → BLOCK" "zero-debt scope"

# 11. Verified component claim remains valid
run_hook_write "/repo/packages/design-system/src/components/Foo/foo.spec.md" '
# Foo

對齊 Ant Design，來源 https://ant-design.com/components/button
'
expect_pass_silent "11. component claim + direct citation → silent"

# ── K8(2026-11-05):關鍵字 / 來源網域擴充 + tsx 只看註解與 note= + md 不看程式碼框 ──
SPEC="/repo/packages/design-system/src/components/Foo/foo.spec.md"
TSX="/repo/packages/design-system/src/components/Foo/foo.stories.tsx"

# 12. 擴充的名稱(MUI)沒來源 → 擋
run_hook_write "$SPEC" $'# Foo\n\nMUI Autocomplete 開清單時把第一項設為 active。'
expect_warn "12. K8 名稱 MUI 無來源 → BLOCK" "缺 inline citation"

# 13. 擴充的網域(mui.com)算來源
run_hook_write "$SPEC" $'# Foo\n\nMUI Autocomplete 開清單時把第一項設為 active(https://mui.com/material-ui/react-autocomplete/)。'
expect_pass_silent "13. K8 網域 mui.com → silent"

# 14. 不寫 https:// 的 github.com/…#L 路徑算來源
run_hook_write "$SPEC" $'# Foo\n\nrc-select 擋 mousedown(github.com/react-component/select/blob/59dd/src/OptionList.tsx#L79),Ant Design 也是。'
expect_pass_silent "14. github.com/… 無 scheme → silent"

# 15. registry.npmjs.org 算來源
run_hook_write "$SPEC" $'# Foo\n\n對照 AG Grid v33.3.2(npm registry:https://registry.npmjs.org/ag-grid-community)。'
expect_pass_silent "15. registry.npmjs.org → silent"

# 16. 原 hook 的內插 bug:「-unverified」字樣不再被當成撤回標記
run_hook_write "/repo/packages/design-system/src/patterns/Foo/foo.spec.md" $'# Foo\n\nPolaris 也這樣(non-unverified 備註)。'
expect_warn "16. 只有 -unverified 字樣 → BLOCK(修掉 @ 內插)" "缺 inline citation"

# 17. tsx 範例資料裡的產品名不是宣稱
run_hook_write "$TSX" $'const OPTIONS = [\n  { value: \x27slack\x27, label: \x27Slack #general\x27 },\n  { value: \x27notion\x27, label: \x27Notion 公告頁\x27 },\n]'
expect_pass_silent "17. tsx 範例資料 → silent"

# 18. tsx 註解裡的對照宣稱照擋
run_hook_write "$TSX" $'// 對齊 Polaris Banner 的關閉鈕規則\nexport const A = 1'
expect_warn "18. tsx 註解宣稱無來源 → BLOCK" "缺 inline citation"

# 19. tsx note= 說明文字照擋
run_hook_write "$TSX" $'<Example note="Material 3 的 chip 也是這樣排" />'
expect_warn "19. tsx note= 宣稱無來源 → BLOCK" "缺 inline citation"

# 20. md 程式碼框裡的產品名(範例圖)不是宣稱
run_hook_write "$SPEC" $'# Foo\n\n```\n[checkbox] [avatar] [name]   ← Notion sharing modal\n```'
expect_pass_silent "20. md 程式碼框 → silent"

# 21. 術語撞名:「Linear vs Non-linear」「Gestalt proximity」不是產品
run_hook_write "$SPEC" $'# Foo\n\n## Linear vs Non-linear\n\n相同距離代表 heading 擁有下方 items(Gestalt proximity)。'
expect_pass_silent "21. Linear vs Non-linear / Gestalt proximity → silent"

# 22. 產品 Linear 本身照擋
run_hook_write "$SPEC" $'# Foo\n\nLinear 的 sidebar 也這樣收合。'
expect_warn "22. 產品 Linear 無來源 → BLOCK" "缺 inline citation"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

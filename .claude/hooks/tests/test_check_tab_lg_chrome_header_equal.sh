#!/bin/bash
# Tests for check_tab_lg_chrome_header_equal.sh
#
# Hook (PreToolUse Edit/Write/MultiEdit):編輯
#   packages/design-system/src/tokens/uiSize/uiSize.css OR src/globals.css
# 時 assert `--tab-height-lg`(uiSize)與 `--chrome-header-height`(globals)兩 token
# md/lg 兩 context 都像素相等(rem 值字串等)。
# 不等 → exit 2 + stderr「🚨 TAB_LG vs CHROME_HEADER_HEIGHT EQUAL BLOCKER」。
# Out-of-scope file / 非 Edit|Write|MultiEdit tool → silent exit 0。
#
# Hook 從自身路徑 cd ../.. 算 PROJECT_ROOT 再 grep 兩 CSS 檔。
# 測試策略:sandbox temp dir 復刻 .claude/hooks + token css 結構,把 hook 複製進去
# 跑 — 控制 md/lg 兩值即可造 PASS / FAIL case。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_HOOK="$SCRIPT_DIR/../lib/_tab_lg_chrome_header_equal.sh"
LOG_FIRE_SH="$SCRIPT_DIR/../_log-fire.sh"

if [ ! -f "$SRC_HOOK" ]; then echo "FATAL: hook not found: $SRC_HOOK"; exit 1; fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT

# Setup sandbox: hook 放 .claude/hooks/lib/(對齊 production)。2026-06-01 #18 把 hook 改成
# `cd $0/../../..` 算 PROJECT_ROOT(因它在 lib/、被 dispatcher 以 $0=lib 路徑呼叫,需 3 層上溯)。
# test sandbox 必同放 lib/ 深度,否則 `../../..` 多上溯一層 → grep 找不到 CSS → 假 fail(2026-06-02 修)。
mkdir -p "$TMPROOT/.claude/hooks/lib"
mkdir -p "$TMPROOT/packages/design-system/src/tokens/uiSize"
mkdir -p "$TMPROOT/src"
cp "$SRC_HOOK" "$TMPROOT/.claude/hooks/lib/_tab_lg_chrome_header_equal.sh"
chmod +x "$TMPROOT/.claude/hooks/lib/_tab_lg_chrome_header_equal.sh"
# _log-fire.sh shim(hook source `$(dirname $0)/../_log-fire.sh` = .claude/hooks/_log-fire.sh)
cp "$LOG_FIRE_SH" "$TMPROOT/.claude/hooks/_log-fire.sh" 2>/dev/null || true

SANDBOX_HOOK="$TMPROOT/.claude/hooks/lib/_tab_lg_chrome_header_equal.sh"
UISIZE_CSS="$TMPROOT/packages/design-system/src/tokens/uiSize/uiSize.css"
GLOBALS_CSS="$TMPROOT/src/globals.css"

write_tokens() {
  # args: tab_lg_md tab_lg_lg ch_md ch_lg
  # 2026-06-02 修:both token 寫進 uiSize.css —— #18 後 hook 從 uiSize.css 讀 chrome-header
  # (globals.css 是 22 行 aggregator,token 已搬走,deep-audit Decision 1)。原 test 把
  # chrome-header 寫 globals.css → hook grep uiSize.css 空值 → set -e 下 exit 1 假 fail。
  cat > "$UISIZE_CSS" <<EOF
:root {
  --tab-height-lg: ${1}rem;
  --chrome-header-height: ${3}rem;
}
[data-density="lg"] {
  --tab-height-lg: ${2}rem;
  --chrome-header-height: ${4}rem;
}
EOF
  cat > "$GLOBALS_CSS" <<EOF
/* aggregator — chrome-header-height 已搬至 uiSize.css(deep-audit Decision 1);此檔僅為 hook trigger-path 測試用 */
:root {}
EOF
}

run_hook() {
  local file_path="$1"
  local tool="${2:-Edit}"
  local payload
  payload=$(jq -n --arg fp "$file_path" --arg tn "$tool" \
    '{tool_name: $tn, tool_input: {file_path: $fp, new_string: ""}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$SANDBOX_HOOK" >"$STDOUT" 2>"$STDERR"
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
    echo "  FAIL  $name (expected exit 2 with '$needle', got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_tab_lg_chrome_header_equal tests ==="

# 1. md + lg both equal → silent pass
write_tokens "3" "3.5" "3" "3.5"
run_hook "$UISIZE_CSS" "Edit"
expect_pass_silent "1. md=3rem lg=3.5rem both equal → silent"

# 2. md mismatch (uiSize 3rem vs globals 2.75rem) → BLOCK
write_tokens "3" "3.5" "2.75" "3.5"
run_hook "$UISIZE_CSS" "Edit"
expect_block "2. md mismatch (3 vs 2.75) → BLOCK" "TAB_LG vs CHROME_HEADER_HEIGHT EQUAL BLOCKER"

# 3. lg mismatch (uiSize 3.5rem vs globals 4rem) → BLOCK
write_tokens "3" "3.5" "3" "4"
run_hook "$GLOBALS_CSS" "Write"
expect_block "3. lg mismatch (3.5 vs 4) → BLOCK" "lg: --tab-height-lg=3.5 rem ≠ --chrome-header-height=4 rem"

# 4. out-of-scope file → silent pass (even if tokens drift)
write_tokens "3" "3.5" "9" "9"
run_hook "$TMPROOT/some/random/file.tsx" "Edit"
expect_pass_silent "4. out-of-scope file → silent"

# 5. non-Edit tool (Read) → silent pass
write_tokens "3" "3.5" "9" "9"
run_hook "$UISIZE_CSS" "Read"
expect_pass_silent "5. non-Edit tool → silent"

# 6. MultiEdit on globals.css with matched values → silent pass
write_tokens "3" "3.5" "3" "3.5"
run_hook "$GLOBALS_CSS" "MultiEdit"
expect_pass_silent "6. MultiEdit on globals.css matched → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

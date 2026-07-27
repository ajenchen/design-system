#!/bin/bash
# Tests for check_propose_pre_grep_verify.sh(M18 Q0, 2026-05-18)
#
# Hook 規則:PreToolUse Edit/Write/MultiEdit on */planning/*.md / */reports/*.md
# / */handoff/*.md。檢查 NEW_CONTENT 含 propose keyword(請拍板 / 等你拍板 /
# 待你拍板 / 決策 N / 我推 A / 選項: 等)但無 file:line cite 證據
# (backtick + .tsx/.ts/.css/.md path)→ stderr 警告
# 「PRE-ASK SELF-VERIFY GAP」(non-blocking,exit 0)。
# 檔頭 `<!-- @propose-pre-verified -->` → 跳過。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_propose_pre_grep_verify.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

run_hook() {
  local file_path="$1"
  local content="$2"
  local payload
  payload=$(jq -n --arg fp "$file_path" --arg c "$content" \
    '{tool_name: "Write", tool_input: {file_path: $fp, content: $c}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (exit=$EXIT, stderr non-empty=$([ -n "$STDERR_TEXT" ] && echo yes))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_warn() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "0" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected stderr warn '$needle', got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_propose_pre_grep_verify tests ==="

# 1. Planning doc with propose keyword + no cite → warn
run_hook "/repo/governance/planning/refactor-X.md" '# Plan
我推 A:改 5 個元件加 SurfaceBody。請拍板回 A/B/C。
'
expect_warn "1. planning propose no cite → warn" "PRE-ASK SELF-VERIFY GAP"

# 2. Planning doc with propose + cite (file path in backticks) → silent
run_hook "/repo/governance/planning/refactor-Y.md" '# Plan
基於 `packages/design-system/src/components/Sheet/sheet.tsx` 已 work fine,
我推 A:不動 Sheet。等你拍板回 A 或 B。
'
expect_pass_silent "2. planning propose with file path cite → silent"

# 3. Planning doc with propose + file:line cite → silent
run_hook "/repo/governance/planning/refactor-Z.md" '# Plan
依 `combobox.tsx:42` 既有 pattern,等你拍板回 A 或 B。
'
expect_pass_silent "3. planning propose with file:line cite → silent"

# 4. @propose-pre-verified marker in head → silent skip
run_hook "/repo/governance/planning/refactor-W.md" '<!-- @propose-pre-verified -->
# Plan
我推 A,請拍板回 A/B/C。Already verified DS-wide.
'
expect_pass_silent "4. @propose-pre-verified head marker → silent"

# 5. Non-planning path → silent skip
run_hook "/repo/src/components/foo.tsx" '
const x = "請拍板";
'
expect_pass_silent "5. non-planning file path → silent skip"

# 6. Planning doc without propose keyword → silent
run_hook "/repo/governance/planning/notes.md" '# Notes
今天的 task list:
- 寫 hook test
- 跑 audit
'
expect_pass_silent "6. planning doc no propose keyword → silent"

# 7. Reports doc with propose + no cite → warn
run_hook "/repo/.claude/reports/audit-2026-05-22.md" '# Audit
偵測到 5 個元件缺 SurfaceBody。決策 1:全部 migrate。請拍板。
'
expect_warn "7. reports propose no cite → warn" "PRE-ASK SELF-VERIFY GAP"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

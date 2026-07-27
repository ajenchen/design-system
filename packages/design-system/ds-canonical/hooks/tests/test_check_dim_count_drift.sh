#!/bin/bash
# Tests for check_dim_count_drift.sh(audit dim count SSOT drift P1 soft warn)
#
# Hook 規則:Edit/Write/MultiEdit + 目標 file 是 chain skill / meta-patterns / AGENTS.md /
# provider import shell /
# skill SKILL.md / skill references → 偵測 `\b[1-9][0-9]+[ -]?(dim|audit dim|audit dimension)`
# 形 hardcode → stderr soft warn (exit 0)。
# Skip:design-system-audit/SKILL.md(SSOT)/ design-system-audit/references/* / out-of-scope path /
# 同行含「SSOT / 禁 / forbidden / example / anti-pattern / invariant / hardcode」allowed context。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_dim_count_drift.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

run_hook() {
  local tool="$1"
  local file_path="$2"
  local content="$3"
  local payload
  payload=$(jq -n --arg t "$tool" --arg fp "$file_path" --arg c "$content" \
    '{tool_name: $t, tool_input: {file_path: $fp, content: $c}}')
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
  if [ "$EXIT" = "0" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected warn '$needle', got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_dim_count_drift tests ==="

# 1. non Edit/Write tool → skip
run_hook "Read" "/repo/packages/design-system/ds-canonical/rules/meta-patterns.md" "53 dim hardcode"
expect_pass_silent "1. non Edit/Write → skip"

# 2. SSOT itself (design-system-audit/SKILL.md) → skip
run_hook "Edit" "/repo/packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md" "53 audit dimensions covers all"
expect_pass_silent "2. SSOT file path → skip"

# 3. Out-of-scope file (random tsx) → skip
run_hook "Edit" "/repo/packages/design-system/src/foo.tsx" "53 dim hardcode"
expect_pass_silent "3. out-of-scope path → skip"

# 4. Shared AGENTS.md with hardcoded `53 dim` → warn
run_hook "Edit" "/repo/AGENTS.md" "現有 53 dim 覆蓋全部"
expect_warn "4. AGENTS.md + 53 dim hardcode → warn" "AUDIT DIM COUNT DRIFT"

# 4b. Provider import shell remains covered too.
run_hook "Edit" "/repo/CLAUDE.md" "現有 53 dim 覆蓋全部"
expect_warn "4b. provider import shell + 53 dim hardcode → warn" "AUDIT DIM COUNT DRIFT"

# 5. meta-patterns.md with `46 audit dimensions` → warn
run_hook "Write" "/repo/packages/design-system/ds-canonical/rules/meta-patterns.md" "鏈到 46 audit dimensions"
expect_warn "5. meta-patterns + 46 audit dimensions → warn" "AUDIT DIM COUNT DRIFT"

# 6. Allowed context (line contains 'SSOT') → silent
run_hook "Edit" "/repo/packages/design-system/ds-canonical/skills/foo/SKILL.md" "53 dim SSOT 在 design-system-audit"
expect_pass_silent "6. line contains SSOT → allowed silent"

# 7. Allowed context (line contains '禁') → silent
run_hook "Edit" "/repo/packages/design-system/ds-canonical/skills/foo/SKILL.md" "禁 hardcode 53 dim 形式的數字"
expect_pass_silent "7. line contains 禁 → allowed silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

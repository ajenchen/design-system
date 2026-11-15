#!/bin/bash
# Tests for check_field_controls_contracts.sh(Stream C 3-contract consolidated guardrail)
#
# Hook 規則:PostToolUse Edit/Write/MultiEdit + file 存在 disk → 檢 3 contracts:
#   (a) Selected value renderer symmetry — Combobox/Select/PeoplePicker
#   (b) Placeholder vocabulary — 所有 components/*.tsx
#   (c) Cell metric escape hatches — Combobox/Select/PeoplePicker
# 違反 → 印 JSON `{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: "..."}}` to stdout (exit 0)。
# Allow:檔首 3 行內加 `// @placeholder-vocabulary-allow:` / `@renderer-symmetry-allow:` / `@cell-metric-escape-allow:`。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_field_controls_contracts.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT

PASS=0
FAIL=0
FAILED_TESTS=""

# Build a real fixture file under fake DS root
make_fixture() {
  local rel_path="$1"; local content="$2"
  local full="$TMP_ROOT/$rel_path"
  mkdir -p "$(dirname "$full")"
  printf '%s' "$content" >"$full"
  echo "$full"
}

run_hook() {
  local file_path="$1"
  local payload
  payload=$(jq -n --arg fp "$file_path" \
    '{tool_name: "Edit", hook_event_name: "PostToolUse", tool_input: {file_path: $fp, new_string: "n/a"}}')
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
  if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent, exit=$EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_violation() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "0" ] && echo "$STDOUT_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected JSON ctx containing '$needle', got exit $EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_field_controls_contracts tests ==="

# 1. PreToolUse event (not PostToolUse) → skip
F1=$(make_fixture "packages/design-system/src/components/Foo/foo.tsx" 'emptyPlaceholder={emptyText}')
payload=$(jq -n --arg fp "$F1" '{tool_name: "Edit", hook_event_name: "PreToolUse", tool_input: {file_path: $fp, new_string: ""}}')
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
EXIT=$?
set -e
STDOUT_TEXT=$(cat "$STDOUT"); STDERR_TEXT=$(cat "$STDERR")
rm -f "$STDOUT" "$STDERR"
expect_pass_silent "1. PreToolUse event → skip"

# 2. File doesn't exist → skip
run_hook "/nonexistent/path/foo.tsx"
expect_pass_silent "2. nonexistent file → skip"

# 3. Out-of-scope tsx (no contract trigger) → silent
F3=$(make_fixture "packages/design-system/src/components/Button/button.tsx" '
const Button = () => <button>OK</button>;
')
run_hook "$F3"
expect_pass_silent "3. components/Button button.tsx no violations → silent"

# 4. Contract (b) violation:emptyPlaceholder={emptyText} → violation
F4=$(make_fixture "packages/design-system/src/components/Bar/bar.tsx" 'export const Bar = () => <X emptyPlaceholder={emptyText} />;')
run_hook "$F4"
expect_violation "4. contract (b) emptyPlaceholder={emptyText} → violation" "contract (b) placeholder vocabulary"

# 5. Contract (b) with allow escape → silent
F5=$(make_fixture "packages/design-system/src/components/Baz/baz.tsx" '// @placeholder-vocabulary-allow: legacy migration
export const Baz = () => <X emptyPlaceholder={searchEmpty} />;')
run_hook "$F5"
expect_pass_silent "5. contract (b) with @placeholder-vocabulary-allow → silent"

# 6. Contract (c) hardcoded tagAreaPaddingLeftPx={8} in Combobox → violation
F6=$(make_fixture "packages/design-system/src/components/Combobox/combobox.tsx" 'export const Combobox = () => <Tags tagAreaPaddingLeftPx={8} />;')
run_hook "$F6"
expect_violation "6. contract (c) Combobox hardcoded tagAreaPaddingLeftPx → violation" "contract (c) cell metric escape hatch"

# 7. Contract (b) noResults variant → violation
F7=$(make_fixture "packages/design-system/src/components/Qux/qux.tsx" 'export const Qux = () => <X emptyPlaceholder={noResults} />;')
run_hook "$F7"
expect_violation "7. contract (b) emptyPlaceholder={noResults} → violation" "contract (b) placeholder vocabulary"

# 8. Contract (b) 2026-11-15:已移除的舊名寫回 props 型別 → violation(不論接的是什麼值)
F8=$(make_fixture "packages/design-system/src/components/Combobox/combobox.tsx" 'export interface ComboboxProps {
  placeholder?: string
  emptyPlaceholder?: string
}')
run_hook "$F8"
expect_violation "8. contract (b) 舊名 emptyPlaceholder?: string 寫回 → violation" "contract (b) placeholder vocabulary"

# 9. Contract (b) 對照:註解裡提到舊名(改名紀錄)→ silent;placeholder 本身 → silent
F9=$(make_fixture "packages/design-system/src/components/Combobox/combobox.tsx" '/** 無值時的提示文字(2026-11-15 前另有舊名 `emptyPlaceholder`,已移除) */
// 舊名 emptyPlaceholder 已移除
export const Combobox = ({ placeholder = "選擇…" }) => <span>{placeholder}</span>;')
run_hook "$F9"
expect_pass_silent "9. contract (b) 註解提到舊名 + placeholder → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

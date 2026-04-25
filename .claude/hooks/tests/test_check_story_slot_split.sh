#!/bin/bash
# Tests for check_story_slot_split.sh
#
# Drives PreToolUse Edit/Write payloads on stdin and verifies block vs pass
# for Manual story 拆分原則(CLAUDE.md `# Story` Polaris/Carbon idiom)。
#
# Usage: bash test_check_story_slot_split.sh

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_story_slot_split.sh"

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
  payload=$(jq -n \
    --arg fp "$file_path" \
    --arg c  "$content" \
    '{tool_name: "Write", tool_input: {file_path: $fp, content: $c}}')

  STDOUT=$(mktemp)
  STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_pass() {
  local name="$1"
  if [ "$EXIT" = "0" ]; then
    echo "  PASS  $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit 0, got $EXIT)"
    echo "$STDERR_TEXT" | sed 's/^/    /'
    FAIL=$((FAIL+1))
    FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_block() {
  local name="$1"
  local needle="$2"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit 2 + '$needle')"
    echo "$STDERR_TEXT" | sed 's/^/    /'
    FAIL=$((FAIL+1))
    FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

# ── Test 1: WithStartIcon + WithEndIcon 拆兩 → block ─────────────────────────
echo "Test 1: WithStartIcon + WithEndIcon 同檔 → block"
read -r -d '' T1 <<'EOF' || true
export const WithStartIcon: Story = { args: { startIcon: Plus } }
export const WithEndIcon: Story = { args: { endIcon: ChevronDown } }
EOF
run_hook "/fake/chip.stories.tsx" "$T1"
expect_block "Test 1 WithStartIcon + WithEndIcon blocked" "WithStartIcon + WithEndIcon"

# ── Test 2: 只 WithIcon → pass ─────────────────────────────────────────────────
echo ""
echo "Test 2: 只 WithIcon → pass"
read -r -d '' T2 <<'EOF' || true
export const WithIcon: Story = { args: { startIcon: Plus, endIcon: ChevronDown } }
EOF
run_hook "/fake/chip.stories.tsx" "$T2"
expect_pass "Test 2 WithIcon alone passes"

# ── Test 3: Default + AllVariants → block ─────────────────────────────────────
echo ""
echo "Test 3: Default + AllVariants 同檔 → block"
read -r -d '' T3 <<'EOF' || true
export const Default: Story = { args: { variant: 'primary' } }
export const AllVariants: Story = { render: () => (<>...</>) }
EOF
run_hook "/fake/button.stories.tsx" "$T3"
expect_block "Test 3 Default + AllVariants blocked" "Default + AllVariants"

# ── Test 4: 只 AllVariants → pass ──────────────────────────────────────────────
echo ""
echo "Test 4: 只 AllVariants → pass"
read -r -d '' T4 <<'EOF' || true
export const AllVariants: Story = { render: () => (<>...</>) }
EOF
run_hook "/fake/button.stories.tsx" "$T4"
expect_pass "Test 4 AllVariants alone passes"

# ── Test 5: Primary + Secondary + Tertiary 拆三 → block ───────────────────────
echo ""
echo "Test 5: Primary + Secondary + Tertiary 拆細 → block"
read -r -d '' T5 <<'EOF' || true
export const Primary: Story = { args: { variant: 'primary' } }
export const Secondary: Story = { args: { variant: 'secondary' } }
export const Tertiary: Story = { args: { variant: 'tertiary' } }
EOF
run_hook "/fake/button.stories.tsx" "$T5"
expect_block "Test 5 Primary/Secondary/Tertiary split blocked" "拆細"

# ── Test 6: anatomy.stories.tsx 不在 scope → pass even with violation ─────────
echo ""
echo "Test 6: anatomy.stories.tsx out of scope → pass"
read -r -d '' T6 <<'EOF' || true
export const WithStartIcon: Story = { args: { startIcon: Plus } }
export const WithEndIcon: Story = { args: { endIcon: ChevronDown } }
EOF
run_hook "/fake/chip.anatomy.stories.tsx" "$T6"
expect_pass "Test 6 anatomy.stories.tsx out of scope"

# ── Test 7: allowlist // @story-split-rationale: → bypass ─────────────────────
echo ""
echo "Test 7: allowlist marker → bypass"
read -r -d '' T7 <<'EOF' || true
// @story-split-rationale: startIcon vs endIcon 教不同 visual rules due to specific composition
export const WithStartIcon: Story = { args: { startIcon: Plus } }
export const WithEndIcon: Story = { args: { endIcon: ChevronDown } }
EOF
run_hook "/fake/special.stories.tsx" "$T7"
expect_pass "Test 7 allowlist bypasses"

# ── Test 8: 非 stories.tsx 不在 scope → pass ──────────────────────────────────
echo ""
echo "Test 8: .tsx (non-stories) → pass"
run_hook "/fake/Button.tsx" "export const WithStartIcon = ... export const WithEndIcon = ..."
expect_pass "Test 8 non-stories out of scope"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "  Results: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed tests:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

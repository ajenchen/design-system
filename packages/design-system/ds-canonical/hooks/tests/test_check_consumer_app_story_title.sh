#!/bin/bash
# 2026-06-11 repoint:check_consumer_app_story_title.sh 已合併進 check_consumer_app_invariants.sh(prune merge;測試 payload 不變 = 行為等價驗證)
# Tests for check_consumer_app_invariants.sh(P0 BLOCKER,2026-05-28 codified)
#
# Hook 規則(PreToolUse,Edit|Write|MultiEdit):
#   Scope: file_path matches `/apps/<name>/**.stories.(tsx|ts|mdx)` (consumer apps only)
#   Content: tool_input.new_string // tool_input.content
#   APP_NAME derived from path `.../apps/<name>/...`
#   Extract `title:` field(single/double/backtick quote)。
#   BLOCK exit 2 if title prefix ≠ `Apps/<APP_NAME>/`。
#   Skip(exit 0): non-edit tool / out-of-scope path / empty content /
#     `@app-story-title-skip:` escape / no `title:` field。
# SSOT: .claude/rules/story-rules.md「Title 命名 2-namespace canonical」

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_consumer_app_invariants.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

# Isolate any state-file writes (hook sources _log-fire.sh which may log)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
export CLAUDE_PROJECT_DIR="$TMP_DIR"
mkdir -p "$TMP_DIR/.claude/logs"

# run_hook <tool_name> <file_path> <content> [content_field]
#   content_field defaults to "content"; pass "new_string" to test Edit shape.
run_hook() {
  local tool="$1"; local fp="$2"; local content="$3"; local field="${4:-content}"
  local payload
  payload=$(jq -n \
    --arg t "$tool" --arg fp "$fp" --arg c "$content" --arg f "$field" \
    '{hook_event_name:"PreToolUse", tool_name:$t, tool_input:({file_path:$fp} + {($f):$c})}')
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
    echo "  FAIL  $name (expected silent, exit=$EXIT, stderr=$([ -n "$STDERR_TEXT" ] && echo non-empty || echo empty))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_block() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected BLOCK exit=2 + '$needle', got exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_consumer_app_story_title tests ==="

APP_STORY="/repo/apps/order-dashboard/src/App.stories.tsx"
BLOCK_NEEDLE="CONSUMER APP STORY TITLE BLOCKER"

# ─────────────────────────────────────────────────────────────
# POSITIVE cases — SHOULD trigger BLOCKER (exit 2)
# ─────────────────────────────────────────────────────────────

# P1. Wrong namespace ('Design System/...') in consumer app story → BLOCK
#     (guards over-narrow: real violation must fire)
run_hook "Write" "$APP_STORY" "export default { title: 'Design System/Button' };"
expect_block "P1 DS-namespace title in app story → BLOCK" "$BLOCK_NEEDLE"

# P2. Title for a DIFFERENT app name → BLOCK
#     (app=order-dashboard but title says Apps/other-app/ → collision risk)
run_hook "Write" "$APP_STORY" "export default { title: 'Apps/other-app/Dashboard' };"
expect_block "P2 wrong app name in title → BLOCK" "$BLOCK_NEEDLE"

# P3. Lowercase 'apps/' prefix near-miss → BLOCK (must be capitalized 'Apps/')
run_hook "Write" "$APP_STORY" "export default { title: 'apps/order-dashboard/Dashboard' };"
expect_block "P3 lowercase apps/ prefix → BLOCK" "$BLOCK_NEEDLE"

# P4. No namespace at all (bare title) → BLOCK
run_hook "Edit" "$APP_STORY" "export default { title: 'Dashboard' };" "new_string"
expect_block "P4 bare title, no Apps/ prefix → BLOCK (Edit new_string)" "$BLOCK_NEEDLE"

# P5. MultiEdit tool with wrong title → BLOCK (tool coverage)
run_hook "MultiEdit" "$APP_STORY" "export default { title: 'Pages/Dashboard' };"
expect_block "P5 MultiEdit wrong title → BLOCK" "$BLOCK_NEEDLE"

# ─────────────────────────────────────────────────────────────
# NEGATIVE cases — should NOT trigger (silent exit 0)
# ─────────────────────────────────────────────────────────────

# N1. Correct prefix 'Apps/order-dashboard/...' → silent
run_hook "Write" "$APP_STORY" "export default { title: 'Apps/order-dashboard/Dashboard' };"
expect_pass_silent "N1 correct Apps/<app>/ prefix → silent"

# N2. Correct prefix with backtick quote → silent
#     (guards over-narrow on quote style)
run_hook "Write" "$APP_STORY" 'export default { title: `Apps/order-dashboard/Settings` };'
expect_pass_silent "N2 correct prefix backtick quote → silent"

# N3. Correct prefix with double quote → silent
run_hook "Write" "$APP_STORY" 'export default { title: "Apps/order-dashboard/Reports" };'
expect_pass_silent "N3 correct prefix double quote → silent"

# N4. Story file with NO title: field → silent (no-op stories OK)
run_hook "Write" "$APP_STORY" "export const Default = { render: () => null };"
expect_pass_silent "N4 no title field → silent"

# N5. Wrong title but @app-story-title-skip escape present → silent
run_hook "Write" "$APP_STORY" \
  "// @app-story-title-skip: shared cross-app fixture
export default { title: 'Shared/Fixtures' };"
expect_pass_silent "N5 escape comment present → silent"

# N6. Out-of-scope path: DS-internal story (packages/) → silent
#     (DS internal uses 'Design System/...' namespace, not this hook's concern)
run_hook "Write" "/repo/packages/design-system/src/components/Button/button.stories.tsx" \
  "export default { title: 'Design System/Button' };"
expect_pass_silent "N6 DS-internal stories.tsx out of scope → silent"

# N7. Out-of-scope path: non-story file in apps/ → silent
#     (near-miss: same dir, plain .tsx not .stories.tsx)
run_hook "Write" "/repo/apps/order-dashboard/src/App.tsx" \
  "export default { title: 'Whatever' };"
expect_pass_silent "N7 apps/ non-story .tsx out of scope → silent"

# N8. Non-edit tool (Read) → silent
run_hook "Read" "$APP_STORY" "export default { title: 'Design System/Button' };"
expect_pass_silent "N8 tool=Read → silent"

# N9. Empty content → silent
run_hook "Write" "$APP_STORY" ""
expect_pass_silent "N9 empty content → silent"

# N10. .stories.ts (not tsx) in scope, correct prefix → silent (extension coverage)
run_hook "Write" "/repo/apps/order-dashboard/src/App.stories.ts" \
  "export default { title: 'Apps/order-dashboard/Overview' };"
expect_pass_silent "N10 .stories.ts correct prefix → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

#!/bin/bash
# Tests for check_tailwind_wildcard_in_docs.sh(P0 BLOCKER,2026-05-28 beta.27 anchor)
#
# Hook 規則(PreToolUse,Edit | Write | MultiEdit):
#   - tool_input.file_path 必匹配 \.(md|spec\.md|sh|ts|tsx|css|json)$ 才檢查(其餘 silent)
#   - content 取自 tool_input.new_string // tool_input.content
#   - content 含 `@tailwind-wildcard-allow:` escape comment → silent
#   - 偵測 anti-pattern:CSS var() 名含 `*` / `/` enumeration placeholder
#     regex: var\(--[a-z][a-z0-9-]*[\*/]+[a-z0-9-]*\)
#     命中 → exit 2 + stderr cite「TAILWIND v4 WILDCARD-IN-DOCS BLOCKER」
#   - 非 Edit/Write/MultiEdit tool → silent
#   - 空 content → silent
#
# 此 hook 不寫 state file(除 _log-fire.sh fire log);仍 override GOVERNANCE_PROJECT_DIR
# 指向 TMP_DIR 以免污染 repo .claude/logs/。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_tailwind_wildcard_in_docs.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# isolate any fire-log writes into TMP_DIR(不污染 repo logs)
export GOVERNANCE_PROJECT_DIR="$TMP_DIR"
mkdir -p "$TMP_DIR/.claude/logs"

# run_hook <tool_name> <file_path> <content>
# 預設用 tool_input.content;Edit-shape(new_string)由 run_hook_edit 處理
run_hook() {
  local tool="$1"; local file_path="$2"; local content="$3"
  local payload
  payload=$(jq -n \
    --arg t "$tool" --arg fp "$file_path" --arg c "$content" \
    '{hook_event_name:"PreToolUse", tool_name:$t, tool_input:{file_path:$fp, content:$c}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

# run_hook_edit <file_path> <new_string> — Edit-shape payload(tool_input.new_string)
run_hook_edit() {
  local file_path="$1"; local new_string="$2"
  local payload
  payload=$(jq -n \
    --arg fp "$file_path" --arg ns "$new_string" \
    '{hook_event_name:"PreToolUse", tool_name:"Edit", tool_input:{file_path:$fp, new_string:$ns}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

expect_block() {
  local name="$1"; local needle="${2:-TAILWIND v4 WILDCARD-IN-DOCS BLOCKER}"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected BLOCK exit=2 + '$needle', got exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent exit=0, got exit=$EXIT, stderr=$([ -n "$STDERR_TEXT" ] && echo non-empty || echo empty))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_tailwind_wildcard_in_docs tests ==="

# ──────────────────────────────────────────────────────────────
# POSITIVE cases — SHOULD BLOCK(real violation,guards over-narrow regex / M34)
# ──────────────────────────────────────────────────────────────

# P1. var(--X-*) wildcard placeholder in a .md doc → BLOCK
run_hook "Write" "/repo/packages/design-system/src/tokens/elevation.spec.md" \
  'Use \`shadow-[var(--elevation-*)]\` for any elevation level.'
expect_block "P1. var(--elevation-*) in .spec.md → BLOCK"

# P2. var(--field-height-*) in a .ts file → BLOCK
run_hook "Write" "/repo/src/foo.ts" \
  'const note = "var(--field-height-*) maps to sm/md/lg";'
expect_block "P2. var(--field-height-*) in .ts → BLOCK"

# P3. var(--layout-space-*) in a .tsx comment → BLOCK
run_hook "Write" "/repo/src/Foo.tsx" \
  '// height token: var(--layout-space-*)'
expect_block "P3. var(--layout-space-*) in .tsx → BLOCK"

# P4. Edit-shape payload (tool_input.new_string) → BLOCK
run_hook_edit "/repo/notes.md" 'docs: var(--elevation-*) shorthand'
expect_block "P4. Edit new_string var(--elevation-*) → BLOCK"

# P5. MultiEdit tool also in scope → BLOCK
run_hook "MultiEdit" "/repo/a.css" '.x { box-shadow: var(--elevation-*); }'
expect_block "P5. MultiEdit var(--elevation-*) in .css → BLOCK"

# P6. single-slash enumeration var(--a/b) → BLOCK (regex covers single slash)
run_hook "Write" "/repo/b.md" 'token var(--elevation-100/200) shorthand'
expect_block "P6. var(--elevation-100/200) single-slash → BLOCK"

# P7. TWO-slash enumeration var(--elevation-100/200/300) → SHOULD BLOCK
#     Hook header L7/L51/L57 explicitly cites this exact form as a target
#     anti-pattern("var(--elevation-100/200/300) → var(--elevation-N)").
#     This asserts the hook's DOCUMENTED intent. If the regex misses it,
#     this case (correctly) fails and surfaces an over-narrow-regex bug.
run_hook "Write" "/repo/c.spec.md" 'elevation enum: var(--elevation-100/200/300)'
expect_block "P7. var(--elevation-100/200/300) two-slash enum → BLOCK (documented intent)"

# ──────────────────────────────────────────────────────────────
# NEGATIVE cases — SHOULD NOT BLOCK(clean/near-miss,guards over-broad regex / M34)
# ──────────────────────────────────────────────────────────────

# N1. legit concrete token var(--elevation-100) — no wildcard → silent
run_hook "Write" "/repo/ok.css" '.card { box-shadow: var(--elevation-100); }'
expect_silent "N1. concrete var(--elevation-100) → silent"

# N2. math-notation replacement (the prescribed fix) → silent
run_hook "Write" "/repo/ok.spec.md" 'use var(--elevation-N) N∈{100,200}'
expect_silent "N2. var(--elevation-N) math notation → silent"

# N3. near-miss: Tailwind fraction utility w-1/2 (slash NOT inside var()) → silent
run_hook "Write" "/repo/ok.tsx" '<div className="w-1/2 h-full" />'
expect_silent "N3. w-1/2 fraction utility (slash outside var) → silent"

# N4. near-miss: calc with division (slash NOT inside a var name) → silent
run_hook "Write" "/repo/ok.css" '.x { width: calc(100% / 3); padding: var(--space-2); }'
expect_silent "N4. calc(100% / 3) division → silent"

# N5. near-miss: aspect-ratio 16/9 (bare slash, no var) → silent
run_hook "Write" "/repo/ok.css" '.media { aspect-ratio: 16/9; }'
expect_silent "N5. aspect-ratio 16/9 → silent"

# N6. escape clause present → silent even with real wildcard
run_hook "Write" "/repo/escaped.md" \
  'token var(--elevation-*) here // @tailwind-wildcard-allow: documenting raw token form'
expect_silent "N6. @tailwind-wildcard-allow escape → silent"

# N7. out-of-scope file extension (.txt) → silent even with wildcard
run_hook "Write" "/repo/raw.txt" 'var(--elevation-*) shorthand'
expect_silent "N7. .txt out-of-scope extension → silent"

# N8. non-Edit/Write tool (Read) → silent
run_hook "Read" "/repo/x.md" 'var(--elevation-*)'
expect_silent "N8. tool=Read out-of-event → silent"

# N9. empty content → silent
run_hook "Write" "/repo/empty.md" ''
expect_silent "N9. empty content → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

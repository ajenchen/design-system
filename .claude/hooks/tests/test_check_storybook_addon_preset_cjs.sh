#!/bin/bash
# 2026-06-11 repoint:check_storybook_addon_preset_cjs.sh 已合併進 check_storybook_addon_packaging.sh(prune merge;測試 payload 不變 = 行為等價驗證)
# Tests for check_storybook_addon_packaging.sh(P0,2026-05-28 beta.27-.31 5 連敗 anchor)
#
# Hook 規則(PreToolUse,Edit|Write|MultiEdit):
#   Scope:  tool_input.file_path 匹配 `/addons/<name>/preset.ts$`(storybook-config OR .storybook)
#           其他 file / 其他 tool → exit 0 silent
#   Content:tool_input.new_string // tool_input.content;empty → exit 0
#   Strip:  grep 前先剝 line-level + inline /* */ + trailing // 註解(M7/M34 broad-vs-narrow
#           fix — 正確 preset.ts 會在 comment 內「文件化」anti-pattern,raw grep 會假 BLOCK)
#   BLOCK(exit 2):code-stripped content 含 `createRequire` / `require.resolve`
#                 OR `fileURLToPath\s*\(\s*import\.meta\.url`
#   Escape: content 含 `@preset-cjs-skip:` → exit 0
#   Needle: stderr 含 "STORYBOOK ADDON PRESET CJS BLOCKER"
#
# M34 broad-vs-narrow symmetry probes:
#   - over-broad guard:keyword 只在 comment 內 → 必 NOT block(test 6,7,8)
#   - over-narrow guard:keyword 在真 code → 必 block,且 fileURLToPath 需配 import.meta.url(test 9,10)

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_storybook_addon_packaging.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
# Override CLAUDE_PROJECT_DIR so _log-fire.sh state lands in TMP_DIR(不污染 repo .claude/logs/)
export CLAUDE_PROJECT_DIR="$TMP_DIR"
mkdir -p "$TMP_DIR/.claude/logs"

# run_hook tool file_path content_field content_value
#   content_field = "content" | "new_string"
run_hook() {
  local tool="$1"; local file_path="$2"; local field="$3"; local content="$4"
  local payload
  payload=$(jq -n \
    --arg tn "$tool" --arg fp "$file_path" --arg cf "$field" --arg c "$content" \
    '{tool_name:$tn, tool_input:({file_path:$fp} + {($cf):$c})}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

# run_hook_read — non-Edit/Write tool(no content)
run_hook_read() {
  local file_path="$1"
  local payload
  payload=$(jq -n --arg fp "$file_path" \
    '{tool_name:"Read", tool_input:{file_path:$fp}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent exit=0, got exit=$EXIT, stderr=$([ -n "$STDERR_TEXT" ] && echo non-empty || echo empty))"
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

NEEDLE="STORYBOOK ADDON PRESET CJS BLOCKER"
PRESET="/repo/packages/storybook-config/addons/theme-toolbar/preset.ts"

echo "=== check_storybook_addon_preset_cjs tests ==="

# ───────────────────────── POSITIVE(should BLOCK)─────────────────────────

# 1. createRequire in real preset.ts code → BLOCK
run_hook "Write" "$PRESET" "content" \
'import { createRequire } from "module"
const require = createRequire(import.meta.url)
export const managerEntries = (e = []) => [...e, require.resolve("./manager")]'
expect_block "1. createRequire in real code → BLOCK" "$NEEDLE"

# 2. require.resolve in real code(no createRequire)→ BLOCK
run_hook "Write" "$PRESET" "content" \
'export const previewAnnotations = (e = []) => [...e, require.resolve("./preview")]'
expect_block "2. require.resolve in real code → BLOCK" "$NEEDLE"

# 3. fileURLToPath(import.meta.url) in real code → BLOCK(over-narrow guard: real violation must fire)
run_hook "Write" "$PRESET" "content" \
'import { fileURLToPath } from "url"
const __dirname = path.dirname(fileURLToPath(import.meta.url))'
expect_block "3. fileURLToPath(import.meta.url) real code → BLOCK" "$NEEDLE"

# 4. Edit tool via new_string field → BLOCK(contract: new_string takes precedence over content)
run_hook "Edit" "/x/.storybook/addons/density/preset.ts" "new_string" \
'const r = createRequire(import.meta.url)'
expect_block "4. Edit new_string createRequire → BLOCK" "$NEEDLE"

# 5. require.resolve with trailing inline // comment, code still present → BLOCK
#    (guard: strip 只剝 comment portion,不可吃掉同行真 code)
run_hook "Write" "$PRESET" "content" \
'const m = require.resolve("./manager") // resolve the manager entry
export const x = 1'
expect_block "5. real require.resolve + trailing comment → BLOCK" "$NEEDLE"

# ───────────────────────── NEGATIVE(should NOT block)─────────────────────

# 6. createRequire ONLY in a // full-line comment(M34 over-broad guard)→ silent
run_hook "Write" "$PRESET" "content" \
'// WHY .cjs: createRequire / require.resolve 被 Node ESM scope 攔,故不用此檔
const path = require("path")
module.exports = {}'
expect_pass_silent "6. createRequire only in // comment → silent"

# 7. require.resolve ONLY in a trailing // comment(M34 over-broad guard)→ silent
run_hook "Write" "$PRESET" "content" \
'export const e = (x = []) => [...x, path.join(__dirname, "manager.tsx")] // avoid require.resolve'
expect_pass_silent "7. require.resolve only in trailing comment → silent"

# 8. createRequire ONLY in inline /* ... */ block comment → silent
run_hook "Write" "$PRESET" "content" \
'const path = require("path") /* not createRequire — pure CJS */
export const x = 1'
expect_pass_silent "8. createRequire only in inline block comment → silent"

# 9. fileURLToPath called on a NON-import.meta.url arg → silent(over-narrow boundary: regex requires import.meta.url)
run_hook "Write" "$PRESET" "content" \
'const p = fileURLToPath(someConfiguredUrl)
export const x = 1'
expect_pass_silent "9. fileURLToPath(otherVar) ≠ import.meta.url → silent"

# 10. Clean canonical preset.ts(path.join(__dirname))→ silent
run_hook "Write" "$PRESET" "content" \
'import path from "path"
export const managerEntries = (e = []) => [...e, path.join(__dirname, "manager.tsx")]
export const previewAnnotations = (e = []) => [...e, path.join(__dirname, "preview.ts")]'
expect_pass_silent "10. clean path.join(__dirname) preset.ts → silent"

# 11. Escape clause @preset-cjs-skip: present despite createRequire → silent
run_hook "Write" "$PRESET" "content" \
'// @preset-cjs-skip: legacy bundler migration, owner-approved
const r = createRequire(import.meta.url)'
expect_pass_silent "11. @preset-cjs-skip: escape → silent"

# 12. Out of scope — preset.cjs(not preset.ts)→ silent
run_hook "Write" "/x/addons/foo/preset.cjs" "content" \
'const r = createRequire(import.meta.url)'
expect_pass_silent "12. preset.cjs (not .ts) out of scope → silent"

# 13. Out of scope — manager.tsx in addons/ dir → silent
run_hook "Write" "/x/addons/foo/manager.tsx" "content" \
'const r = createRequire(import.meta.url)'
expect_pass_silent "13. addons/manager.tsx out of scope → silent"

# 14. Out of scope — preset.ts NOT under an addons/<name>/ dir → silent
run_hook "Write" "/x/src/preset.ts" "content" \
'const r = createRequire(import.meta.url)'
expect_pass_silent "14. preset.ts outside addons/<name>/ → silent"

# 15. Wrong tool(Read)on a preset.ts → silent
run_hook_read "$PRESET"
expect_pass_silent "15. tool=Read → skip"

# 16. Empty content → silent(early exit)
run_hook "Write" "$PRESET" "content" ""
expect_pass_silent "16. empty content → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

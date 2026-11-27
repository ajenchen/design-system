#!/bin/bash
# 2026-06-11 repoint:check_storybook_addon_preset_cjs.sh 已合併進 check_storybook_addon_packaging.sh(prune merge;測試 payload 不變 = 行為等價驗證)
# Tests for check_storybook_addon_packaging.sh(P0,2026-05-28 beta.27-.31 5 連敗 anchor)
#
# Hook 規則(PreToolUse,Edit|Write|MultiEdit)—— 2026-11-25 Storybook 10 翻轉(preset 必為合法 ESM):
#   Scope:  tool_input.file_path 匹配 `/addons/<name>/preset.(ts|js|mjs|cjs)$`(storybook-config OR .storybook)
#           其他 file / 其他 tool → exit 0 silent
#   Content:tool_input.new_string // tool_input.content;empty → exit 0
#   Strip:  grep 前先剝 line-level + inline /* */ + 空白後的 // 註解(M7/M34 broad-vs-narrow
#           fix — 正確 preset 會在 comment 內「文件化」anti-pattern,raw grep 會假 BLOCK)
#   BLOCK(exit 2):preset.cjs(CJS preset 10.x 不支援)
#                 OR code 用 require( / require.resolve( 而沒有 createRequire(
#                 OR code 用 __dirname / __filename 而沒有自行宣告
#                 OR code 用 module.exports / exports.x =
#   ALLOW:  官方 ESM 寫法 import.meta.resolve、createRequire(import.meta.url)、fileURLToPath(import.meta.url)
#   Escape: content 含 `@preset-cjs-skip:` → exit 0
#   Needle: stderr 含 "STORYBOOK ADDON PRESET CJS BLOCKER"
#
# M34 broad-vs-narrow symmetry probes:
#   - over-broad guard:keyword 只在 comment 內、或已自行定義 → 必 NOT block(test 1,3,4,6,7,8)
#   - over-narrow guard:keyword 在真 code 且未定義 → 必 block(test 2,5,10b,10c,10d,12)

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
[ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ] || { echo "❌ mktemp -d failed(TMP_DIR;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
trap 'rm -rf "$TMP_DIR"' EXIT
# Override GOVERNANCE_PROJECT_DIR so _log-fire.sh state lands in TMP_DIR(不污染 repo .claude/logs/)
export GOVERNANCE_PROJECT_DIR="$TMP_DIR"
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

# 2. require.resolve in real code(no createRequire)→ BLOCK
run_hook "Write" "$PRESET" "content" \
'export const previewAnnotations = (e = []) => [...e, require.resolve("./preview")]'
expect_block "2. require.resolve without createRequire → BLOCK" "$NEEDLE"

# 5. require.resolve with trailing inline // comment, code still present → BLOCK
#    (guard: strip 只剝 comment portion,不可吃掉同行真 code)
run_hook "Write" "$PRESET" "content" \
'const m = require.resolve("./manager") // resolve the manager entry
export const x = 1'
expect_block "5. real require.resolve + trailing comment → BLOCK" "$NEEDLE"

# 10b. 8.x 的 canonical(path.join(__dirname))在 10.x ESM preset 裡 __dirname 不存在 → BLOCK
run_hook "Write" "$PRESET" "content" \
'import path from "path"
export const managerEntries = (e = []) => [...e, path.join(__dirname, "manager.tsx")]'
expect_block "10b. bare __dirname in ESM preset → BLOCK" "$NEEDLE"

# 10c. module.exports(CommonJS 匯出)→ BLOCK
run_hook "Write" "$PRESET" "content" \
'module.exports = { managerEntries: (e = []) => e }'
expect_block "10c. module.exports in preset.ts → BLOCK" "$NEEDLE"

# 10d. Edit new_string 用 __filename 沒宣告 → BLOCK(contract: new_string takes precedence over content)
run_hook "Edit" "/x/.storybook/addons/density/preset.ts" "new_string" \
'const here = __filename'
expect_block "10d. Edit new_string bare __filename → BLOCK" "$NEEDLE"

# 12. preset.cjs(8.x 時代寫法)→ BLOCK(10.x 不支援 CJS preset)
run_hook "Write" "/x/addons/foo/preset.cjs" "content" \
'const path = require("path")
module.exports = {}'
expect_block "12. preset.cjs → BLOCK" "$NEEDLE"

# ───────────────────────── NEGATIVE(should NOT block)─────────────────────

# 1. 官方寫法:createRequire(import.meta.url) 之後 require.resolve → silent
run_hook "Write" "$PRESET" "content" \
'import { createRequire } from "module"
const require = createRequire(import.meta.url)
export const managerEntries = (e = []) => [...e, require.resolve("./manager.js")]'
expect_pass_silent "1. createRequire + require.resolve(官方 ESM 寫法)→ silent"

# 3. 官方寫法:自行宣告 __dirname = dirname(fileURLToPath(import.meta.url))→ silent
run_hook "Write" "$PRESET" "content" \
'import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
const __dirname = dirname(fileURLToPath(import.meta.url))
export const managerEntries = (e = []) => [...e, join(__dirname, "manager.js")]'
expect_pass_silent "3. fileURLToPath(import.meta.url) + 宣告 __dirname → silent"

# 4. Edit new_string 只有 createRequire → silent
run_hook "Edit" "/x/.storybook/addons/density/preset.ts" "new_string" \
'const r = createRequire(import.meta.url)'
expect_pass_silent "4. Edit new_string createRequire → silent"

# 6. require.resolve / module.exports ONLY in a // full-line comment(M34 over-broad guard)→ silent
run_hook "Write" "$PRESET" "content" \
'// 8.x 時代:require.resolve / module.exports 寫在 preset.cjs;10.x 改 ESM
import { fileURLToPath } from "node:url"
export const managerEntries = (e = []) => [...e, fileURLToPath(import.meta.resolve("./manager.js"))]'
expect_pass_silent "6. CJS keywords only in // comment → silent"

# 7. __dirname ONLY in a trailing // comment(M34 over-broad guard)→ silent
run_hook "Write" "$PRESET" "content" \
'export const e = (x = []) => [...x, fileURLToPath(import.meta.resolve("./manager.js"))] // not path.join(__dirname)'
expect_pass_silent "7. __dirname only in trailing comment → silent"

# 8. require ONLY in inline /* ... */ block comment → silent
run_hook "Write" "$PRESET" "content" \
'import { fileURLToPath } from "node:url" /* not require("path") */
export const x = 1'
expect_pass_silent "8. require only in inline block comment → silent"

# 9. fileURLToPath called on a NON-import.meta.url arg → silent
run_hook "Write" "$PRESET" "content" \
'const p = fileURLToPath(someConfiguredUrl)
export const x = 1'
expect_pass_silent "9. fileURLToPath(otherVar) → silent"

# 10. Clean canonical ESM preset(本 repo ds-devmode/preset.ts 同款)→ silent
run_hook "Write" "$PRESET" "content" \
'import { fileURLToPath } from "node:url"
export const managerEntries = (entry = []) => [...entry, fileURLToPath(import.meta.resolve("./manager.js"))]
export const previewAnnotations = (entry = []) => [...entry, fileURLToPath(import.meta.resolve("./preview.js"))]'
expect_pass_silent "10. clean ESM import.meta.resolve preset → silent"

# 11. Escape clause @preset-cjs-skip: present despite createRequire → silent
run_hook "Write" "$PRESET" "content" \
'// @preset-cjs-skip: legacy bundler migration, owner-approved
const r = createRequire(import.meta.url)'
expect_pass_silent "11. @preset-cjs-skip: escape → silent"

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

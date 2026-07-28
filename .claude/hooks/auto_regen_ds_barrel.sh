#!/bin/bash
# auto_regen_ds_barrel.sh — PostToolUse 自動 regen barrel + per-component index
#
# 2026-05-25 SSOT auto-sync invariant(user 永久 directive 2026-05-23):
# DS infra 增刪改 → package 該同步的都該自動,不需耳提面命。
# 解決 gap:新增 / 刪除 packages/design-system/src/{components,patterns}/<Dir>/ 後
# barrel `src/index.ts` 沒 auto-regen → consumer subpath import 壞 / new component 漏 export。
#
# Fire condition(PostToolUse Write|Edit|MultiEdit):
#   - Write/Edit 創建新 `packages/design-system/src/components/<Dir>/<kebab>.tsx`
#     OR 改動 component primary tsx(可能 export 名 change)
#   - Write/Edit 創建 / 改動 `index.ts` in components/<Dir>/ or patterns/<dir>/
#   - 新增 / 移除 hooks/*.ts or lib/*.ts(barrel 也 include 這些)
#
# Action:silent fire `node scripts/gen-component-indexes.mjs` + `node scripts/gen-design-system-barrel.mjs`
# 不 BLOCKER — auto fix-up,不打斷 workflow。emit message 告訴 AI「已 auto regen barrel」
# 對齊 sync-version-to-all-manifests.mjs pattern(post-action auto fix-up)

HOOK_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)" || {
  printf 'GOVERNANCE_INTEGRITY: DS barrel hook directory is unavailable\n' >&2
  exit 70
}
source "$HOOK_DIR/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: canonical hook integrity helper is unavailable\n' >&2
  exit 70
}
source "$HOOK_DIR/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

governance_hook_load_input
governance_hook_require_commands node grep tr cut
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""') \
  || governance_hook_integrity_fail 'DS barrel file path could not be decoded'

if [ -z "$FILE_PATH" ]; then exit 0; fi

# Scope filter:必 packages/design-system/src/{components,patterns,hooks,lib}/**
if ! grep -qE 'packages/design-system/src/(components|patterns|hooks|lib)/' <<<"$FILE_PATH"; then
  exit 0
fi

# Skip stories / spec / test files(not barrel-included)
if grep -qE '\.(stories|anatomy\.stories|principles\.stories|spec|test|spec\.md)\.(tsx?|md)$' <<<"$FILE_PATH"; then
  exit 0
fi

PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null \
  || governance_hook_integrity_fail "DS barrel project root is unavailable:$PROJECT_DIR"

# Generator failure is an infrastructure fault,not a no-op. Never claim the SSOT is synchronized
# after one generator failed or an attacker substituted a symlink for a canonical generator.
for GENERATOR in scripts/gen-component-indexes.mjs scripts/gen-design-system-barrel.mjs; do
  [ -f "$GENERATOR" ] && [ ! -L "$GENERATOR" ] \
    || governance_hook_integrity_fail "DS barrel generator is missing or unsafe:$GENERATOR"
done

summarize_generator_failure() {
  printf '%s' "$1" | tr '\r\n' '  ' | cut -c1-500
}

INDEX_OUT=$(node scripts/gen-component-indexes.mjs 2>&1)
INDEX_RC=$?
if [ "$INDEX_RC" -ne 0 ]; then
  governance_hook_integrity_fail \
    "component-index generator failed(exit=$INDEX_RC):$(summarize_generator_failure "$INDEX_OUT")"
fi

BARREL_OUT=$(node scripts/gen-design-system-barrel.mjs 2>&1)
BARREL_RC=$?
if [ "$BARREL_RC" -ne 0 ]; then
  governance_hook_integrity_fail \
    "design-system barrel generator failed(exit=$BARREL_RC):$(summarize_generator_failure "$BARREL_OUT")"
fi

# Only emit governance context if barrel content changed(detected by checking if grep finds count delta)
# Simple proxy:grep "generated" in output means script ran successfully
if grep -qE 'generated|with [0-9]+ components' <<<"$BARREL_OUT"; then
  MESSAGE="🔄 auto-regen DS barrel(SSOT auto-sync per 2026-05-23 user directive)— $FILE_PATH 改動觸發 \`gen-component-indexes.mjs\` + \`gen-design-system-barrel.mjs\` re-run。Barrel src/index.ts + per-component index.ts 已對齊。若 commit 此 turn 改動,記得 stage barrel 變化。"
  CONTEXT=$(jq -nc --arg message "$MESSAGE" '{
    governanceContext: {
      hookEventName: "PostToolUse",
      message: $message
    }
  }') || governance_hook_integrity_fail 'DS barrel governance context could not be encoded'
  printf '%s\n' "$CONTEXT"
fi

exit 0

#!/bin/bash
# check_storybook_addon_preset_cjs.sh — P0 BLOCKER
#
# 2026-05-28 beta.27-.31 5 連敗 anchor:storybook-config addon preset.ts 用
# `createRequire` / `fileURLToPath` 在 `"type":"module"` package 內,被 Node ESM
# scope 攔(`require is not defined`)。Root cause = ESM/esbuild-register CJS-interop
# 衝突。Fix = hand-written `preset.cjs`(`.cjs` override package type field 強制 CJS)。
#
# SSOT:memory/feedback_storybook_addon_preset_must_be_cjs.md
#
# Mechanical 強制 PreToolUse Edit/Write 對 storybook-addon preset files:
# - `preset.ts` 含 `require.resolve` / `createRequire` / `fileURLToPath` → BLOCK
# - 提示用 `.cjs` extension 替代 + path.join(__dirname, ...) canonical pattern
#
# Scope:**/addons/**/preset.ts(in monorepo packages/* OR .storybook/addons/*)
# Escape:`@preset-cjs-skip:` comment(極罕見,需 rationale)

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
# Scope:addons/<name>/preset.ts(stored anywhere — storybook-config or .storybook)
if ! echo "$FILE" | grep -qE '/addons/[^/]+/preset\.ts$'; then exit 0; fi

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

# Escape clause
if echo "$CONTENT" | grep -qE '@preset-cjs-skip:'; then exit 0; fi

# Detect ESM/CJS interop antipatterns
# 2026-05-30(dim 81 M7/M34 broad-vs-narrow fix + codex Phase B P3 inline-block edge):strip line-level 註解
# BEFORE keyword grep — 正確的 preset.ts 會在 comment 內「文件化」這些 anti-pattern(教學),raw-content
# grep 會假 BLOCK 合法 edit(ship 給 fork)。Strip 範圍:(1) 整行 //|/*|*/|* 開頭 (2) 同行 inline /* … */ block
# (3) 行尾 // 註解。多行 block 的中間行以 * 開頭已被 (1) 覆蓋。極罕見「同行開 /* + keyword 未閉合」→ @preset-cjs-skip: escape。
CONTENT_CODE=$(echo "$CONTENT" | grep -vE '^[[:space:]]*(//|\*|/\*|\*/)' | sed -E 's@/\*.*\*/@@g; s@//.*@@')
ANTIPATTERN=""
if echo "$CONTENT_CODE" | grep -qE 'createRequire|require\.resolve'; then
  ANTIPATTERN="${ANTIPATTERN}  - createRequire / require.resolve(被 Node ESM scope 攔)\n"
fi
if echo "$CONTENT_CODE" | grep -qE 'fileURLToPath\s*\(\s*import\.meta\.url'; then
  ANTIPATTERN="${ANTIPATTERN}  - fileURLToPath(import.meta.url)(同被 esbuild-register/ESM 衝突攔)\n"
fi

if [ -n "$ANTIPATTERN" ]; then
  cat >&2 << EOF
🚨 STORYBOOK ADDON PRESET CJS BLOCKER(P0,2026-05-28 beta.27-.31 5 連敗 anchor)

  File: $FILE
  偵測到 ESM/CJS interop 反 pattern:
$(printf '%b' "$ANTIPATTERN")
  Why blocked:
    Storybook preset loader 走 esbuild-register CJS path,但 package.json
    \`"type":"module"\` 強制 Node 把 .js 當 ESM。dynamic resolution(require.resolve /
    fileURLToPath)被 ESM scope 攔 → ReferenceError: require not defined。

  Fix:用 hand-written \`preset.cjs\`(\`.cjs\` override package type → 強制 CJS):

    // preset.cjs
    const path = require('path')
    module.exports = {
      managerEntries: (entry = []) => [...entry, path.join(__dirname, 'manager.tsx')],
      previewAnnotations: (entry = []) => [...entry, path.join(__dirname, 'preview.ts')],
    }

  + package.json:
    "exports": { "./preset": "./preset.cjs" }
    "files": [..., "addons/<name>/preset.cjs"]

  SSOT:memory/feedback_storybook_addon_preset_must_be_cjs.md
  Anchor:2026-05-28 beta.27/.28/.29/.30/.31 5 連敗(本 hook codify 防再犯)

  Escape(極罕見):add \`// @preset-cjs-skip: <rationale>\` to content
EOF
  exit 2
fi

exit 0

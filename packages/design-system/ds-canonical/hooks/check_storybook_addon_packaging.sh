#!/bin/bash
# check_storybook_addon_packaging.sh — P0 BLOCKER ×2 — storybook-config addon 打包事故家族(beta.27-.31 5 連敗錨)
#
# 2026-06-11 prune merge(user 拍板「照你建議做」;59→51 headroom):
# #   r1_addon_subdir_ship = 原 check_addon_subdir_ship.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
#   r2_preset_cjs = 原 check_storybook_addon_preset_cjs.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
# 原檔 → .claude/hooks/retired/2026-06-11-prune-merge/
# 各規則跑在 pipeline 子 shell:規則內 exit 不中斷其他規則;任一 exit 2 → 整體 exit 2。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")

r1_addon_subdir_ship() {
set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
# Only check addon main files
if ! echo "$FILE" | grep -qE '/(\.storybook|storybook-config)/addons/[^/]+/[a-zA-Z]+\.(ts|tsx)$'; then exit 0; fi

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

# Escape clause
if echo "$CONTENT" | grep -qE '@addon-subdir-skip:'; then exit 0; fi

# Find relative subdir imports `./<dir>/*`
RELATIVE_IMPORTS=$(echo "$CONTENT" | grep -oE "from[[:space:]]+['\"]\\./[a-zA-Z][a-zA-Z0-9_-]+/[a-zA-Z][a-zA-Z0-9_./-]*['\"]" | sed -E "s|^from[[:space:]]+['\"]\./([^/]+)/.*['\"]\$|\\1|" | sort -u)

[ -z "$RELATIVE_IMPORTS" ] && exit 0

ADDON_DIR=$(dirname "$FILE")
MISSING=""
for subdir in $RELATIVE_IMPORTS; do
  if [ ! -d "$ADDON_DIR/$subdir" ]; then
    MISSING="${MISSING}    - ./${subdir}/ (referenced but dir absent)\n"
  fi
done

if [ -n "$MISSING" ]; then
  cat >&2 << EOF
🚨 ADDON SUBDIR SHIP BLOCKER(P0,2026-05-28 beta.27 anchor)

  File: $FILE
  Imports from subdirectories that don't exist alongside this file:
$(printf '%b' "$MISSING")

  Why blocked:
    Addon main 檔 import 子資料夾 helper,但子 dir 沒一起 ship → npm build /
    Rollup「Could not resolve」→ Storybook build 死。本 anchor:beta.27 第 7 次 CI
    才抓到 ds-devmode 搬家漏帶 utils/ 6 files(燒 6 prior iterations debug)。

  修方向:
    1. Copy 缺漏 dir 過來:`cp -r <source>/<dir> $ADDON_DIR/<dir>`
    2. 跑 npm run build-storybook local 過再 commit
    3. 或:改 import 路徑 to existing location

  Escape(極罕見): add \`// @addon-subdir-skip: <rationale>\` to file content
EOF
  exit 2
fi

exit 0
}

r2_preset_cjs() {
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
}

for _rule in r1_addon_subdir_ship r2_preset_cjs; do
  echo "$INPUT" | "$_rule"
  _rc=$?
  if [ "$_rc" -eq 2 ]; then exit 2; fi
done
exit 0

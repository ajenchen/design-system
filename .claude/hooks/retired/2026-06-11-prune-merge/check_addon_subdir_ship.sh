#!/bin/bash
# check_addon_subdir_ship.sh — P0 BLOCKER
#
# Per 2026-05-28 beta.27 release fail anchor:
# ds-devmode addon 2026-05-27 從 .storybook/addons/ 搬到 packages/storybook-config/
# addons/ 時主檔(constants/manager/Panel/preset/preview)有搬,但 preview.ts 依
# 賴的 utils/ 子資料夾(6 files:dom-geometry/computed-style/token-reverse-lookup/
# overlay/geometry-diagnostic/token-drift-detector)沒搬 → npm package build 時
# Rollup「Could not resolve "./utils/dom-geometry"」→ CSF parse error cascade。
#
# 機械強制 PreToolUse Edit/Write 對 addon 主檔(preview.ts / manager.tsx 等):
# 偵測 import 從 `./utils/*` / `./components/*` 等 relative subdir,但對應 dir 不
# 存在於 file_path 同層 → BLOCK + cite missing files。
#
# Scope:packages/storybook-config/addons/ + .storybook/addons/ 內主檔。
# Escape:`@addon-subdir-skip:` comment。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

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

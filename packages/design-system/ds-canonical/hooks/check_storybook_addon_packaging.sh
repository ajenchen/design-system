#!/bin/bash
# check_storybook_addon_packaging.sh — P0 BLOCKER ×2 — storybook-config addon 打包事故家族(beta.27-.31 5 連敗錨)
#
# 2026-06-11 prune merge(user 拍板「照你建議做」;59→51 headroom):
# #   r1_addon_subdir_ship = 原 check_addon_subdir_ship.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
#   r2_preset_cjs = 原 check_storybook_addon_preset_cjs.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
#   2026-11-25 Storybook 10.6.9 升級:r2 判準翻轉 —— 8.x 擋 ESM 動態解析、要求 .cjs;10.x 官方只支援 ESM preset,
#   改擋 .cjs preset 與 ESM 裡未定義的 CJS 全域(函式名 / 訊息標題 / escape 標記沿用,證據見 feedback_storybook_addon_preset_esm.md)
# 原檔 → packages/design-system/ds-canonical/hooks/retired/2026-06-11-prune-merge/
# 各規則跑在 pipeline 子 shell:規則內 exit 不中斷其他規則;任一 exit 2 → 整體 exit 2。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null) || {
  printf '🚨 GOVERNANCE_INTEGRITY: STORYBOOK ADDON PACKAGING FAILURE: 無法讀取 canonical input\n' >&2
  exit 70
}
if ! printf '%s' "$INPUT" | jq -e 'type == "object"' >/dev/null 2>&1; then
  printf '🚨 GOVERNANCE_INTEGRITY: STORYBOOK ADDON PACKAGING FAILURE: invalid input envelope\n' >&2
  exit 70
fi

r1_addon_subdir_ship() {
set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(jq -r '.tool_name // ""' <<<"$INPUT" 2>/dev/null)

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(jq -r '.tool_input.file_path // ""' <<<"$INPUT" 2>/dev/null)
# Only check addon main files
if ! grep -qE '/(\.storybook|storybook-config)/addons/[^/]+/[a-zA-Z]+\.(ts|tsx)$' <<<"$FILE"; then exit 0; fi

CONTENT=$(jq -r '.tool_input.new_string // .tool_input.content // ""' <<<"$INPUT" 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

# Escape clause
if grep -qE '@addon-subdir-skip:' <<<"$CONTENT"; then exit 0; fi

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
TOOL=$(jq -r '.tool_name // ""' <<<"$INPUT" 2>/dev/null)

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(jq -r '.tool_input.file_path // ""' <<<"$INPUT" 2>/dev/null)
# Scope:addons/<name>/preset.{ts,js,mjs,cjs}(stored anywhere — storybook-config or .storybook)
# 2026-11-25 Storybook 10 改寫:preset 一律以 ESM 載入(MIGRATION.md「The `.storybook/main.*` file and other presets must be
# valid ESM」),8.x 的「必用 .cjs」翻轉成「不准 .cjs、ESM 裡不准用沒定義的 CJS 全域」。SSOT 見訊息內的 memory 路徑。
if ! grep -qE '/addons/[^/]+/preset\.(ts|js|mjs|cjs)$' <<<"$FILE"; then exit 0; fi

CONTENT=$(jq -r '.tool_input.new_string // .tool_input.content // ""' <<<"$INPUT" 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

# Escape clause
if grep -qE '@preset-cjs-skip:' <<<"$CONTENT"; then exit 0; fi

# 2026-05-30(dim 81 M7/M34 broad-vs-narrow fix + codex Phase B P3 inline-block edge):strip line-level 註解
# BEFORE keyword grep — 正確的 preset 會在 comment 內「文件化」這些 anti-pattern(教學),raw-content
# grep 會假 BLOCK 合法 edit(ship 給 fork)。Strip 範圍:(1) 整行 //|/*|*/|* 開頭 (2) 同行 inline /* … */ block
# (3) 行尾 // 註解。多行 block 的中間行以 * 開頭已被 (1) 覆蓋。極罕見「同行開 /* + keyword 未閉合」→ @preset-cjs-skip: escape。
# 注意 (3) 只剝「空白後的 //」,不碰字串裡的 `://`(例:'node:url')。
CONTENT_CODE=$(echo "$CONTENT" | grep -vE '^[[:space:]]*(//|\*|/\*|\*/)' | sed -E 's@/\*.*\*/@@g; s@(^|[[:space:]])//.*@\1@')
ANTIPATTERN=""
case "$FILE" in
  *.cjs) ANTIPATTERN="${ANTIPATTERN}  - preset.cjs(CommonJS preset;Storybook 10 只以 ESM 載入 preset,官方不再支援 CJS preset)\n" ;;
esac
# ESM 裡沒有 require / __dirname / __filename / module.exports;自行定義(官方寫法)的不擋
if grep -qE '(^|[^[:alnum:]_$.])require[[:space:]]*(\.[[:space:]]*resolve[[:space:]]*)?\(' <<<"$CONTENT_CODE" \
  && ! grep -qE 'createRequire[[:space:]]*\(' <<<"$CONTENT_CODE"; then
  ANTIPATTERN="${ANTIPATTERN}  - require(...) / require.resolve(...) 沒有先 createRequire(import.meta.url)(ESM 裡 require 不存在)\n"
fi
for _cjs_global in __dirname __filename; do
  if grep -qE "(^|[^[:alnum:]_\$.])${_cjs_global}([^[:alnum:]_\$]|\$)" <<<"$CONTENT_CODE" \
    && ! grep -qE "(const|let|var)[[:space:]]+${_cjs_global}([^[:alnum:]_\$]|\$)" <<<"$CONTENT_CODE"; then
    ANTIPATTERN="${ANTIPATTERN}  - ${_cjs_global} 沒有自行宣告(ESM 裡不存在;用 fileURLToPath(import.meta.url) 或 import.meta.resolve)\n"
  fi
done
if grep -qE '(^|[^[:alnum:]_$.])(module\.exports|exports\.[[:alnum:]_$]+[[:space:]]*=)' <<<"$CONTENT_CODE"; then
  ANTIPATTERN="${ANTIPATTERN}  - module.exports / exports.x =(CommonJS 匯出;preset 要用 ESM export)\n"
fi

if [ -n "$ANTIPATTERN" ]; then
  cat >&2 << EOF2
🚨 STORYBOOK ADDON PRESET CJS BLOCKER(P0;Storybook 10 preset 必為合法 ESM)

  File: $FILE
  偵測到 CommonJS preset / ESM 裡未定義的 CJS 全域:
$(printf '%b' "$ANTIPATTERN")
  Why blocked:
    Storybook 10 以 ESM 載入所有 preset(storybookjs/storybook MIGRATION.md「From version 9.x to 10.0.0」:
    "The .storybook/main.* file and other presets must be valid ESM";"A main.ts file that's CJS is no longer
    supported. The same applies to any custom preset files.")。require / __dirname / __filename 在 ESM 裡不存在。

  Fix(官方寫法;本 repo 實作 = packages/storybook-config/addons/ds-devmode/preset.ts → tsc → dist/…/preset.js):

    import { fileURLToPath } from 'node:url'
    export const managerEntries = (entry = []) => [...entry, fileURLToPath(import.meta.resolve('./manager.js'))]
    export const previewAnnotations = (entry = []) => [...entry, fileURLToPath(import.meta.resolve('./preview.js'))]

  + package.json exports["./addons/<name>/preset"] 指向編譯後的 dist/addons/<name>/preset.js

  SSOT:governance/memory/feedback_storybook_addon_preset_esm.md(含 2026-11-25 .cjs / ESM 兩面實測;8.x 的 .cjs 五連敗是歷史)

  Escape(極罕見):add \`// @preset-cjs-skip: <rationale>\` to content
EOF2
  exit 2
fi

exit 0
}

_CAPTURE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/check-storybook-addon-packaging.XXXXXX") || {
  printf '🚨 GOVERNANCE_INTEGRITY: STORYBOOK ADDON PACKAGING FAILURE: output capture unavailable\n' >&2
  exit 70
}
trap 'rm -rf -- "$_CAPTURE_DIR"' EXIT
# 輸入先落檔再餵給每條規則,不用 `printf | rule`(2026-09-25):規則若沒讀 stdin 就先退出
# (例如非 Claude provider 時 r2 直接 exit 0),寫端 printf 會收到 SIGPIPE,pipefail 讓整條管線回 141,
# 被誤判成「規則回傳未定義 exit code」—— 時序決定紅不紅,CI Linux 偶發紅過(21ca94e2)。
# 規則一定要跑在子殼層 `( "$_rule" )`:規則裡的 `exit` 只能結束它自己;原本是管線替它開了子殼層,
# 拿掉管線卻不補子殼層,r1 的 `exit 0` 會直接結束整支 hook,後面的規則全部沒跑(本次改法第一版就犯了)。
_INPUT_FILE="$_CAPTURE_DIR/input"
printf '%s' "$INPUT" >"$_INPUT_FILE"
_RULE_INDEX=0

for _rule in r1_addon_subdir_ship r2_preset_cjs; do
  _RULE_INDEX=$((_RULE_INDEX + 1))
  _stdout="$_CAPTURE_DIR/$_RULE_INDEX.stdout"
  _stderr="$_CAPTURE_DIR/$_RULE_INDEX.stderr"
  ( "$_rule" ) <"$_INPUT_FILE" >"$_stdout" 2>"$_stderr"
  _rc=$?
  case "$_rc" in
    0)
      if [ -s "$_stdout" ] || [ -s "$_stderr" ]; then
        printf '🚨 GOVERNANCE_INTEGRITY: STORYBOOK ADDON PACKAGING FAILURE: rule %s rc0 必須完全 silent\n' \
          "$_rule" >&2
        exit 70
      fi
      ;;
    2)
      if [ ! -s "$_stdout" ] && [ -s "$_stderr" ] \
        && ! grep -qF 'GOVERNANCE_INTEGRITY:' "$_stderr"; then
        cat "$_stderr" >&2
        exit 2
      fi
      printf '🚨 GOVERNANCE_INTEGRITY: STORYBOOK ADDON PACKAGING FAILURE: rule %s rc2 必須是 stderr-only nonempty policy blocker\n' \
        "$_rule" >&2
      exit 70
      ;;
    70)
      if [ ! -s "$_stdout" ] && [ -s "$_stderr" ] \
        && grep -qF 'GOVERNANCE_INTEGRITY:' "$_stderr"; then
        cat "$_stderr" >&2
      else
        printf '🚨 GOVERNANCE_INTEGRITY: STORYBOOK ADDON PACKAGING FAILURE: rule %s rc70 必須是 stderr-only marker\n' \
          "$_rule" >&2
      fi
      exit 70
      ;;
    *)
      printf '🚨 GOVERNANCE_INTEGRITY: STORYBOOK ADDON PACKAGING FAILURE: rule %s 回傳未定義 exit code %s\n' \
        "$_rule" "$_rc" >&2
      exit 70
      ;;
  esac
done
exit 0

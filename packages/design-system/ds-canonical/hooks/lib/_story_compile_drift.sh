#!/bin/bash
# 執法等級:擋 —— tsx componentMeta ↔ spec.md frontmatter 由 scripts/compile-stories.mjs --check 確定性比對(generator 輸出差異),這次編輯的元件有 drift → exit 2(D4-02 審計 2026-11-18 起)。
#
# PostToolUse helper(由 post_edit_dispatcher.sh 依序呼叫)。對齊 Story Auto-Compile Phase 4:stories canonical 從
# spec + tsx 機械產,key 不齊 = canonical drift(design-system-audit Group I)。
#
# 2026-11-18 修(M37④:閘存在 ≠ 有在跑):
#   - 原 scope 是 case `*/design-system/components/*.tsx`,DS 搬到 packages/design-system/src/components/ 之後中間多了
#     `src/`,再也比不到任何真實路徑 —— 從搬家起一次都沒觸發過。
#   - 原本跑單一元件模式 `compile-stories.mjs <Comp> --check`:那個元件漂移時腳本只印「0 component(s) compiled; 0 skipped」
#     (scripts/compile-stories.mjs 的 ok.length === 0 分支),原本 grep 的「spec/tsx canonical drift」字樣比不到;
#     再加上 `|| true` 吞掉結束碼 —— 就算路徑對了也不會報。改跑 `--all --check`(約 0.4 秒),從明細裡取這個元件。
#
# 判定:
#   - 範圍:GOVERNANCE_PROJECT_DIR(沒給就是目前目錄)底下 packages/design-system/src/components/<元件>/ 的
#     `*.spec.md`,以及含 `export const <名>Meta =` 的 tsx(compile-stories 只讀這兩種)。其餘一律不跑。
#   - `--all --check` 綠 → 不出聲。
#   - 紅而且明細列了這個元件 → 擋(exit 2),印該元件的漂移明細。
#   - 紅但只列了別的元件 → 不是這次編輯造成的,列成「既有」不擋(交 design-system-audit Group I)。
#   - 其他結果(腳本不在、node 不在、印不出明細的紅、當掉)= 量具失效 → GOVERNANCE_INTEGRITY exit 70,不讀成「沒有 drift」。
#   - 2026-11-20 全樹唯讀(81df56e4):`node scripts/compile-stories.mjs --all --check` → 64 個元件對齊、2 個未遷移(skipped),0 drift。
#   - 沒有逐行豁免:比的是同一個元件的兩份 SSOT(tsx componentMeta 與 spec frontmatter)有沒有對齊,不存在「合理的不對齊」——
#     修法只有改其中一份。還沒遷移的元件(沒有 frontmatter / 沒有 componentMeta)compile-stories 自己會 skip,不會被擋。

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/_added_lines.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: story compile drift verdict helper unavailable\n' >&2
  exit 70
}

set -uo pipefail

integrity() {
  printf 'GOVERNANCE_INTEGRITY: story compile drift %s\n' "$1" >&2
  exit 70
}

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -n "$FILE_PATH" ] || exit 0
[ -f "$FILE_PATH" ] || exit 0

PROJECT_DIR=$(cd "${GOVERNANCE_PROJECT_DIR:-$(pwd)}" 2>/dev/null && pwd -P) || exit 0
FILE_DIR=$(cd "$(dirname "$FILE_PATH")" 2>/dev/null && pwd -P) || exit 0
case "$FILE_DIR/" in
  "$PROJECT_DIR"/packages/design-system/src/components/*/) ;;
  *) exit 0 ;;
esac
COMP_NAME=${FILE_DIR#"$PROJECT_DIR"/packages/design-system/src/components/}
case "$COMP_NAME" in
  ''|*/*) exit 0 ;;   # 只認元件資料夾第一層(compile-stories 只讀那裡的 spec / tsx)
esac
case "$FILE_PATH" in
  *.stories.tsx) exit 0 ;;
  *.spec.md) ;;
  *.tsx) grep -qE '^export const [A-Za-z0-9_]+Meta = ' "$FILE_PATH" 2>/dev/null || exit 0 ;;
  *) exit 0 ;;
esac

COMPILE_SCRIPT="$PROJECT_DIR/scripts/compile-stories.mjs"
if [ -L "$COMPILE_SCRIPT" ] || [ ! -f "$COMPILE_SCRIPT" ]; then
  integrity "verifier unavailable:${COMPILE_SCRIPT}"
fi
command -v node >/dev/null 2>&1 || integrity 'node unavailable'

OUTPUT=$(cd "$PROJECT_DIR" && node scripts/compile-stories.mjs --all --check 2>&1)
RC=$?
[ "$RC" -eq 0 ] && exit 0
if [ "$RC" -ne 1 ] || ! grep -qF 'component(s) with spec/tsx canonical drift:' <<<"$OUTPUT"; then
  integrity "verifier failed without a drift report(exit ${RC}):$(printf '%s' "$OUTPUT" | head -c 600)"
fi

# 明細格式(compile-stories.mjs):兩格縮排的「  <元件>:」接四格縮排的「    - <錯誤>」
OWN=$(awk -v comp="  ${COMP_NAME}:" '
  $0 == comp { inside = 1; next }
  /^  [^ ]/ { inside = 0 }
  inside && /^    - / { print }
' <<<"$OUTPUT")
OTHERS=$(awk -v comp="  ${COMP_NAME}:" '/^  [^ ].*:$/ && $0 != comp { sub(/^  /, ""); sub(/:$/, ""); print }' <<<"$OUTPUT" | paste -sd ',' -)

BLOCK=""
EXISTING=""
if [ -n "$OWN" ]; then
  BLOCK="📐 Story canonical drift:${COMP_NAME} 的 tsx componentMeta 與 spec frontmatter 的 key 不齊(scripts/compile-stories.mjs --check):
${OWN}

修法:讓 tsx componentMeta export 與 spec frontmatter 的 variants / sizes / traits 對齊(skills/story-auto-compile-migrate/SKILL.md)。"
fi
if [ -n "$OTHERS" ]; then
  EXISTING="Story canonical drift 既有(不是這次編輯的元件,不擋;交 /design-system-audit Group I):${OTHERS}"
fi
governance_emit_verdict "$BLOCK" "$EXISTING"

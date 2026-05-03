#!/bin/bash
# PreToolUse hook:阻止建立「應該是 prop variant 而非新元件」的元件。
#
# Bug 史(2026-05-02 user audit):
#   1. DateTimePicker 從 DatePicker 拆出 → 應為 `<DatePicker showTime>`(Ant idiom)
#   2. DataTableFilterPanel 配 5-file 結構獨立 → 應 sub-file 收進 DataTable
#   3. Pattern:看到名稱「<Existing>+suffix」就拆,沒先過 prop variant test
#
# 機械化 3-test(對齊 M21):
#   檢測 file path 後綴 / 元件名 suffix matches existing component → 強制過 rationale
#
# 攔截 anti-pattern 名稱模式(後綴):
#   Time / Range / Color / Light / Dark / Filled / Outline / Compact / Rich / Variant
#
# 允許 escape:
#   檔頭加 `// @separate-component-rationale: <world-class refs + 3-test 通過理由>`

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

# Only check Write(new file)
case "$TOOL" in
  Write) ;;
  *) exit 0 ;;
esac

# 只查 components/<NewName>/<name>.tsx 主檔 + spec.md
case "$FILE_PATH" in
  */src/design-system/components/*/[^.]*.tsx) ;;
  */src/design-system/components/*/*.spec.md) ;;
  *) exit 0 ;;
esac

# Skip if file already exists(not new)
[ -f "$FILE_PATH" ] && exit 0

# Extract component dir name(e.g., DateTimePicker)
COMPONENT_DIR=$(echo "$FILE_PATH" | sed -E 's|.*/components/([^/]+)/.*|\1|')

# Match suffix patterns
SUFFIX=""
for SFX in Time Range Color Light Dark Filled Outline Compact Rich Variant; do
  if [[ "$COMPONENT_DIR" =~ ${SFX}$ ]] && [ "$COMPONENT_DIR" != "$SFX" ]; then
    BASE=$(echo "$COMPONENT_DIR" | sed -E "s/${SFX}$//")
    [ -z "$BASE" ] && continue
    # Check if base component dir exists
    COMPONENTS_ROOT=$(echo "$FILE_PATH" | sed -E 's|(.*/components)/.*|\1|')
    if [ -d "$COMPONENTS_ROOT/$BASE" ]; then
      SUFFIX="$SFX"
      BASE_NAME="$BASE"
      break
    fi
  fi
done

[ -z "$SUFFIX" ] && exit 0

# Check escape rationale in new content
NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // ""')
if echo "$NEW_CONTENT" | head -10 | grep -qE '//\s*@separate-component-rationale:|^\s*#?\s*@separate-component-rationale:'; then
  exit 0
fi

cat >&2 <<EOF

┄┄┄┄ check_premature_abstraction — 新元件可能該是 prop variant ┄┄┄┄

[P0 BLOCK] 新元件 \`${COMPONENT_DIR}\`(後綴 \`${SUFFIX}\`)
基底元件 \`${BASE_NAME}\` 已存在。

新元件名 = \`${BASE_NAME}\` + \`${SUFFIX}\` → 強烈 signal **應為 prop variant on \`${BASE_NAME}\`**,
不是新元件。對齊 Ant / Material X / Polaris 共識:show${SUFFIX,,} / variant 等都是 prop。

歷史教訓(2026-05-02):
  - DateTimePicker 從 DatePicker 拆 → 撤回,合併為 \`<DatePicker showTime>\`(M21)
  - DataTableFilterPanel 配 5-file → 撤回,sub-file pattern

3-test 過了才能分(對齊 M21):
  1. \`${BASE_NAME}\` 加 prop 無法達成同 DOM/behavior?
  2. ≥3 家 world-class DS 用分離元件而非 prop?(必 cite source)
  3. value 結構或 contract 真的不同(如 Range = [start, end])?

通過 → 在 spec.md 加「為何不用 prop on ${BASE_NAME}」rationale + 檔頭加:
  // @separate-component-rationale: <world-class refs + 3-test 通過理由>

EOF
exit 2

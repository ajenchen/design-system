#!/bin/bash
set -uo pipefail
# M30 機械強制:wrapper-vs-primitive schema unify invariant。
#
# PreToolUse(Edit / Write)hook —— 編輯 `packages/design-system/src/components/**/*.tsx` 時掃:
#   (a) 檢查同 file 是否 declare `export interface XxxOption` 同名於其他 file
#   (b) 若同名且未 `extends XxxOption from primitive`/`extends YyyOption` → BLOCKER
#   (c) 若 wrapper 用 `SelectMenuOption`(import from SelectMenu)、又手寫 SelectMenuOption 的物件字面值
#       而沒經 `toSelectMenuOption`(select-menu.tsx 鍵表 + 型別斷言)→ WARN(2026-11-26 擴,workspace F 組 F4-2:
#       原本只看 `menuOptions` 往下 5 行、avatar / description / disabled 有一個就放行 —— 抓不到 `toMenuOption` 函式,
#       也抓不到漏轉 iconClassName;Select / Combobox 兩份手寫轉換都漏它。規則寬、閘窄 = M7 / M34 的落差)。
#       主防線是型別鍵表(`npm run build:lib`,CI 必跑);本 hook 只是寫入當下的提醒。
#
# Bug 史(2026-05-10):
#   `Select.SelectOption` Issue 4 補 avatar / description / disabled,但 `Combobox.SelectOption`
#   是同名 weak schema `{ value, label }`。TypeScript 不抓(不同 file 同名各 export);consumer
#   import 哪個版本看 import path 決定 → drift。PeoplePicker multi-mode dropdown 漏 avatar。
#
# Allow escape:
#   檔頭 `// @wrapper-schema-allow: <reason>` 整檔豁免(legacy migration 過渡期)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

case "$FILE_PATH" in
  */packages/design-system/src/components/**/*.tsx) ;;
  *) exit 0 ;;
esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '
  if .tool_input.new_string then .tool_input.new_string
  elif .tool_input.content then .tool_input.content
  else "" end
')

# Allow escape
if grep -qE '@wrapper-schema-allow:' <<<"$NEW_CONTENT"; then
  exit 0
fi

# Check 1: new file declares `export interface XxxOption {` ?
# (2026-11-26:沒有宣告時不再整支提早結束 —— Check 2 不需要宣告也要跑;沒宣告時 Check 1 的迴圈讀空字串、什麼都不做)
DECLARES=$(grep -oE 'export interface [A-Z][a-zA-Z]*Option\b[^{]*\{' <<<"$NEW_CONTENT" || true)

# For each declared OptionLike interface, check if same name declared elsewhere
PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
DS_COMPONENTS_DIR="$PROJECT_DIR/packages/design-system/src/components"

# normalize FILE_PATH relative to project for self-skip
SELF_BASENAME="$(basename "$FILE_PATH")"

WARNINGS=()
BLOCKERS=()

while IFS= read -r decl; do
  # `|| true`:沒宣告時 decl 是空字串、grep 回 1,set -e 下會整支提早退出(2026-11-26 前靠上方提早 exit 0 遮住)
  IFACE_NAME=$(grep -m 1 -oE '[A-Z][a-zA-Z]*Option' <<<"$decl" || true)
  [ -z "$IFACE_NAME" ] && continue
  # Skip if extends another OptionLike interface(M30 compliant)
  if grep -qE "interface $IFACE_NAME\b.*extends [A-Z][a-zA-Z]*Option" <<<"$NEW_CONTENT"; then
    continue
  fi
  # Find other files declaring same name(skip self by basename — imperfect but Edit context is single-file)
  OTHER_DECLS=$(grep -rlE "export interface $IFACE_NAME\b" "$DS_COMPONENTS_DIR" 2>/dev/null | grep -v "/$SELF_BASENAME$" || true)
  if [ -n "$OTHER_DECLS" ]; then
    BLOCKERS+=("M30 schema drift: \`$IFACE_NAME\` declared in this file (no extends) + also in: $(sed -n '1,3p' <<<"$OTHER_DECLS" | xargs -n1 basename | tr '\n' ',' | sed 's/,$//')")
  fi
done <<< "$DECLARES"

# Check 2(2026-11-26 擴):匯入 SelectMenuOption、又手寫它的物件字面值、沒經 toSelectMenuOption → WARN。
# 「匯入」看這次寫入的內容;Edit 只帶片段時改看磁碟上的原檔(PreToolUse:磁碟上是改前的檔,import 行通常不在片段裡)。
# 「手寫物件字面值」= 提到 SelectMenuOption 的那一行起 3 行內出現 `({` 或 `= {`(`(opt): SelectMenuOption => ({`、
# `const x: SelectMenuOption = {`、`SelectMenuOption[] = options.map((o) => ({`)。逐欄手抄必然隨底層加欄位而漏轉。
SMO_IMPORT_RE='import[^;]*[^A-Za-z]SelectMenuOption[^A-Za-z][^;]*from[^;]*SelectMenu'
IMPORTS_SMO=0
if grep -qE "$SMO_IMPORT_RE" <<<"$NEW_CONTENT"; then
  IMPORTS_SMO=1
elif [ "$TOOL" != "Write" ] && [ -f "$FILE_PATH" ] && grep -qE "$SMO_IMPORT_RE" "$FILE_PATH" 2>/dev/null; then
  IMPORTS_SMO=1
fi
if [ "$IMPORTS_SMO" = "1" ] && ! grep -q 'toSelectMenuOption' <<<"$NEW_CONTENT"; then
  LITERAL=$( (grep -A3 -E 'SelectMenuOption' <<<"$NEW_CONTENT" || true) | (grep -E '\(\{|=[[:space:]]*\{' || true) )
  if [ -n "$LITERAL" ]; then
    WARNINGS+=("M30 schema partial-forward: 手寫 SelectMenuOption 物件字面值、沒經 \`toSelectMenuOption\` —— 逐欄手抄會在底層加欄位時漏轉(2026-11-26 前 Select / Combobox 的轉換都漏 iconClassName)。改呼叫 select-menu.tsx 的 \`toSelectMenuOption\`(鍵表 + 型別斷言,漏轉 build:lib 紅),或標 \`// @wrapper-schema-allow: <reason>\`.")
  fi
fi

# Output
if [ ${#BLOCKERS[@]} -gt 0 ]; then
  echo "🚨 M30 wrapper-vs-primitive schema drift BLOCKER:" >&2
  for b in "${BLOCKERS[@]}"; do echo "  • $b" >&2; done
  echo "" >&2
  echo "Fix: declare \`interface $IFACE_NAME extends <PrimitiveSSoT>\` (e.g. \`extends SelectMenuOption\`)" >&2
  echo "  詳 packages/design-system/ds-canonical/rules/meta-patterns.md M30 + Polaris ChoiceList / Material Autocomplete idiom" >&2
  exit 2
fi

if [ ${#WARNINGS[@]} -gt 0 ]; then
  CONTEXT="⚠️  M30 wrapper schema forward warning:"
  for w in "${WARNINGS[@]}"; do CONTEXT="${CONTEXT}"$'\n'"  • $w"; done
  jq -nc --arg ctx "$CONTEXT" \
    '{governanceContext:{hookEventName:"PreToolUse",message:$ctx}}'
fi

exit 0

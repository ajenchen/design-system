#!/bin/bash
set -uo pipefail
# M30 機械強制:wrapper-vs-primitive schema unify invariant。
#
# PreToolUse(Edit / Write)hook —— 編輯 `packages/design-system/src/components/**/*.tsx` 時掃:
#   (a) 檢查同 file 是否 declare `export interface XxxOption` 同名於其他 file
#   (b) 若同名且未 `extends XxxOption from primitive`/`extends YyyOption` → BLOCKER
#   (c) 若 wrapper 用 `SelectMenuOption`(import from SelectMenu)但內部 `menuOptions` mapping
#       未 forward `avatar` / `description` / `disabled`(只 forward value+label)→ WARN
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
DECLARES=$(grep -oE 'export interface [A-Z][a-zA-Z]*Option\b[^{]*\{' <<<"$NEW_CONTENT" || true)
if [ -z "$DECLARES" ]; then
  exit 0
fi

# For each declared OptionLike interface, check if same name declared elsewhere
PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
DS_COMPONENTS_DIR="$PROJECT_DIR/packages/design-system/src/components"

# normalize FILE_PATH relative to project for self-skip
SELF_BASENAME="$(basename "$FILE_PATH")"

WARNINGS=()
BLOCKERS=()

while IFS= read -r decl; do
  IFACE_NAME=$(grep -m 1 -oE '[A-Z][a-zA-Z]*Option' <<<"$decl")
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

# Check 2: imports SelectMenuOption but menuOptions mapping drops fields(WARN)
if grep -qE 'import.*SelectMenuOption.*from.*SelectMenu' <<<"$NEW_CONTENT"; then
  # Look for `menuOptions: SelectMenuOption[]` mapping that misses fields
  MAP_BLOCK=$(grep -A5 -E 'menuOptions.*SelectMenuOption\[\]' <<<"$NEW_CONTENT" | awk 'NR <= 30')
  if [ -n "$MAP_BLOCK" ]; then
    # Heuristic: should forward at least `avatar` OR `description` OR `disabled` field
    if ! grep -qE '(avatar|description|disabled)' <<<"$MAP_BLOCK"; then
      WARNINGS+=("M30 schema partial-forward: \`menuOptions\` mapping seems to drop avatar/description/disabled. Forward 全 SelectMenuOption surface or annotate \`// @wrapper-schema-allow: <reason>\`.")
    fi
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

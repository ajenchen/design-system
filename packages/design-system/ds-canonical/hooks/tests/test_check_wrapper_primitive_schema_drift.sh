#!/bin/bash
# Tests for check_wrapper_primitive_schema_drift.sh (M30 機械強制)
#
# Hook (PreToolUse Edit/Write/MultiEdit) on packages/design-system/src/components/**/*.tsx:
#   (a) NEW content declares `export interface XxxOption { ... }` + same name declared
#       in OTHER component file + no `extends <Other>Option` → exit 2 BLOCKER
#   (b) imports SelectMenuOption + has `menuOptions: SelectMenuOption[]` mapping that
#       drops avatar/description/disabled → neutral governance context(exit 0)
#   Allow escape:檔頭 `// @wrapper-schema-allow: <reason>` 整檔豁免
#   Out-of-scope file / 非 Edit|Write|MultiEdit → silent exit 0
#
# 測試策略:sandbox temp dir 復刻 .claude/hooks + packages/design-system/src/components 結構,
# 把 hook 複製進去跑 — 預埋既有元件含同名 interface,讓 hook 抓 drift。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_HOOK="$SCRIPT_DIR/../check_wrapper_primitive_schema_drift.sh"
LOG_FIRE_SH="$SCRIPT_DIR/../_log-fire.sh"

if [ ! -f "$SRC_HOOK" ]; then echo "FATAL: hook not found: $SRC_HOOK"; exit 1; fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMPROOT=$(mktemp -d)
[ -n "${TMPROOT:-}" ] && [ -d "$TMPROOT" ] || { echo "❌ mktemp -d failed(TMPROOT;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
trap 'rm -rf "$TMPROOT"' EXIT

mkdir -p "$TMPROOT/.claude/hooks"
mkdir -p "$TMPROOT/packages/design-system/src/components/SelectMenu"
mkdir -p "$TMPROOT/packages/design-system/src/components/Combobox"
mkdir -p "$TMPROOT/packages/design-system/src/components/Select"
cp "$SRC_HOOK" "$TMPROOT/.claude/hooks/check_wrapper_primitive_schema_drift.sh"
chmod +x "$TMPROOT/.claude/hooks/check_wrapper_primitive_schema_drift.sh"
cp "$LOG_FIRE_SH" "$TMPROOT/.claude/hooks/_log-fire.sh" 2>/dev/null || true

SANDBOX_HOOK="$TMPROOT/.claude/hooks/check_wrapper_primitive_schema_drift.sh"
COMPONENTS_DIR="$TMPROOT/packages/design-system/src/components"

# Pre-seed: primitive SSOT in SelectMenu (this is the canonical owner)
cat > "$COMPONENTS_DIR/SelectMenu/select-menu.tsx" <<'EOF'
export interface SelectMenuOption {
  value: string;
  label: string;
  avatar?: string;
  description?: string;
  disabled?: boolean;
}
EOF

run_hook() {
  # args: file_path tool content
  local file_path="$1"; local tool="$2"; local content="$3"
  local payload key
  if [ "$tool" = "Write" ]; then key="content"; else key="new_string"; fi
  payload=$(jq -n --arg fp "$file_path" --arg tn "$tool" --arg k "$key" --arg v "$content" \
    '{tool_name: $tn, tool_input: ({file_path: $fp} + {($k): $v})}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$TMPROOT" bash "$SANDBOX_HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent, exit=$EXIT, stderr non-empty=$([ -n "$STDERR_TEXT" ] && echo yes))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_block() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit 2 with '$needle', got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_warn_exit0() {
  local name="$1"; local needle="$2"
  local context
  context=$(printf '%s' "$STDOUT_TEXT" | jq -er \
    'select(keys == ["governanceContext"]) | .governanceContext
     | select(.hookEventName == "PreToolUse") | .message' 2>/dev/null || true)
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] && printf '%s' "$context" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exact governance context with '$needle', got exit $EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_wrapper_primitive_schema_drift tests ==="

# 1. Declare SelectMenuOption in Combobox file (same name as SSOT primitive, no extends) → BLOCK
COMBOBOX_TSX="$COMPONENTS_DIR/Combobox/combobox.tsx"
WEAK_SCHEMA='export interface SelectMenuOption {
  value: string;
  label: string;
}
export const Combobox = () => null;'
run_hook "$COMBOBOX_TSX" "Write" "$WEAK_SCHEMA"
expect_block "1. weak schema same name no extends → BLOCK" "M30 schema drift"

# 2. Declare with `extends <Other>Option` → silent pass
# Note: avoid `import .*SelectMenuOption.*from.*SelectMenu` in NEW_CONTENT because that
# triggers hook Check 2 path which under `set -euo pipefail` returns non-zero when
# menuOptions mapping is absent (pre-existing hook quirk — orthogonal to test).
EXTEND_SCHEMA='import type { BaseOption } from "../Base/base";
export interface ComboOption extends BaseOption {
  extraField?: string;
}
export const Combobox = () => null;'
run_hook "$COMBOBOX_TSX" "Write" "$EXTEND_SCHEMA"
expect_pass_silent "2. extends another Option (no SelectMenu import) → silent"

# 3. @wrapper-schema-allow escape → silent pass
ALLOW_ESCAPE='// @wrapper-schema-allow: legacy migration WIP
export interface SelectMenuOption {
  value: string;
  label: string;
}'
run_hook "$COMBOBOX_TSX" "Write" "$ALLOW_ESCAPE"
expect_pass_silent "3. @wrapper-schema-allow escape → silent"

# 4. No Option interface declared at all → silent pass
PLAIN_TSX='export const Foo = () => null;'
run_hook "$COMBOBOX_TSX" "Write" "$PLAIN_TSX"
expect_pass_silent "4. no Option interface → silent"

# 5. Out-of-scope file (not in components/) → silent pass
run_hook "$TMPROOT/some/other/file.tsx" "Write" "$WEAK_SCHEMA"
expect_pass_silent "5. out-of-scope file → silent"

# 6. menuOptions mapping drops avatar/description/disabled → neutral context
# Hook reaches Check 2 only when an Option interface IS declared (DECLARES non-empty)
# AND no BLOCKER. We declare PickerOption + extends BaseOption (compliant), then import
# SelectMenuOption + menuOptions mapping that drops fields → WARN trigger.
MAP_DROPS_FIELDS='import type { BaseOption } from "../Base/base";
import { SelectMenuOption } from "../SelectMenu/select-menu";
export interface PickerOption extends BaseOption {
  id: string;
}
export const PeoplePicker = ({ options }: { options: any[] }) => {
  const menuOptions: SelectMenuOption[] = options.map((o) => ({
    value: o.id,
    label: o.name,
  }));
  return null;
};'
mkdir -p "$COMPONENTS_DIR/PeoplePicker"
run_hook "$COMPONENTS_DIR/PeoplePicker/people-picker.tsx" "Write" "$MAP_DROPS_FIELDS"
expect_warn_exit0 "6. menuOptions mapping drops fields → governance context" "M30 schema partial-forward"

# 7.(2026-11-26 紅案,workspace F 組 F4-2)toMenuOption 漏 iconClassName:轉發了 avatar / description / disabled
# (舊 Check 2「三欄有一欄就放行」會放過),也沒宣告任何 Option interface(舊版在 Check 1 前就提早 exit 0)→ 必須提醒
TOMENU_DROPS_ICONCLASS='import { SelectMenu, type SelectMenuOption } from "@/design-system/components/SelectMenu/select-menu"
const toMenuOption = (opt: ComboboxOption): SelectMenuOption => ({
  value: opt.value,
  label: opt.label,
  icon: opt.icon,
  avatar: opt.avatar,
  description: opt.description,
  disabled: opt.disabled,
  group: opt.group,
})'
run_hook "$COMBOBOX_TSX" "Write" "$TOMENU_DROPS_ICONCLASS"
expect_warn_exit0 "7. hand-written toMenuOption (drops iconClassName) → governance context" "toSelectMenuOption"

# 8. 經共用 toSelectMenuOption → 不提醒
TOMENU_SHARED='import { SelectMenu, toSelectMenuOption, type SelectMenuOption } from "@/design-system/components/SelectMenu/select-menu"
const toMenuOption = (opt: ComboboxOption): SelectMenuOption => toSelectMenuOption(opt)'
run_hook "$COMBOBOX_TSX" "Write" "$TOMENU_SHARED"
expect_pass_silent "8. toSelectMenuOption used → silent"
if [ -n "$STDOUT_TEXT" ]; then echo "  FAIL  8b. toSelectMenuOption used → no governance context"; FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 8b"; else echo "  PASS  8b. no governance context"; PASS=$((PASS+1)); fi

# 9. Edit 只帶片段(import 不在片段裡):看磁碟上的原檔有匯入 → 片段裡的手寫字面值照樣提醒
printf '%s\n' 'import { SelectMenu, type SelectMenuOption } from "@/design-system/components/SelectMenu/select-menu"' 'export const X = 1' > "$COMPONENTS_DIR/Select/select.tsx"
EDIT_SNIPPET='    const toMenuOption = React.useCallback((opt: SelectOption): SelectMenuOption => ({
      value: opt.value,
      label: opt.label,
    }), [])'
run_hook "$COMPONENTS_DIR/Select/select.tsx" "Edit" "$EDIT_SNIPPET"
expect_warn_exit0 "9. Edit snippet + on-disk import → governance context" "toSelectMenuOption"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

#!/bin/bash
# Tests for check_field_family_invariants.sh — merged sub-rules(A.1-A.4 + A.6)
#
# Coverage(每 sub-rule pass + block 各 1 case):
#   A.1 naked row-mode propagation:pass / block / allowlist
#   A.2 FieldControlGroup wrapper child:pass / block / allowlist
#   A.3.1 / A.3.2 Field state ring:shadow inset block / outline block(含 data-[field-open] 變體)/ textarea SSOT skip
#   A.3.3 欄位開著的框只有一個住所(2026-11-13 改寫)兩面對照:
#       該擋 7 = 元件自己 open && 'border-primary'(含 !)/ field-wrapper.tsx 改回 data-[state=open] 的兩條原文 /
#                Field 家族元件 data-[state=open]:(!)border-*(含中間夾變體)/ 住所以外 data-[field-open]:border-*
#       該放 7 = field-wrapper.tsx 現在的寫法 / Button 與 inline action 的 data-[state=open] /
#                非欄位元件 data-[state=open]:border-border-hover / FieldControlGroup 讀記號排 z-index / 純註解行 / escape
#   A.3.4 data-field-open 記號手寫(2026-11-13 新增)兩面對照:
#       該擋 4 = JSX 屬性 / 物件 key / 裸屬性 / setAttribute
#       該放 6 = fieldOpenProps / 唯一寫入者自己 / 說明文字裡的字面 / 讀選擇器 / story skip / escape
#       + A.3.3 與 A.3.4 同時踩 → 一次 exit 2、兩段訊息都在
#   A.4 disabled placeholder color:pass / 1 stderr-warn(exit 0)/ allowlist
#   A.6 空值顯示 SSOT(2026-07-08 半形 hyphen):非 owner import EMPTY_DISPLAY block /
#       owner skip / 全形 em dash block / 半形 pass / allowlist
#   non-target:non-tsx skip / SSOT host skip(field-wrapper.tsx)

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_field_family_invariants.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable: $HOOK"; exit 1; }

PASS=0; FAIL=0; FAILED_TESTS=""

run_hook() {
  local file_path="$1" content="$2" tool="${3:-Write}"
  local payload
  payload=$(jq -n --arg tool "$tool" --arg fp "$file_path" --arg c "$content" \
    '{hook_event_name:"PreToolUse", tool_name: $tool, tool_input: {file_path: $fp, content: $c}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT"); STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

run_raw() {
  local payload="$1"
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT"); STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

is_exact_context() {
  local needle="$1" compact
  compact=$(printf '%s' "$STDOUT_TEXT" | jq -c . 2>/dev/null) || return 1
  [ "$STDOUT_TEXT" = "$compact" ] || return 1
  printf '%s' "$STDOUT_TEXT" | jq -se --arg needle "$needle" '
    length == 1
    and (.[0] | type == "object" and (keys | sort) == ["governanceContext"])
    and (.[0].governanceContext |
      type == "object"
      and (keys | sort) == ["hookEventName", "message"]
      and .hookEventName == "PreToolUse"
      and (.message | type == "string" and length > 0 and contains($needle)))
  ' >/dev/null
}

expect_exit() {
  local name="$1" expect="$2" needle="${3:-}"
  local ok=1
  if [ "$expect" = "0" ] && [ -n "$needle" ]; then
    [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] && is_exact_context "$needle" && ok=0
  elif [ "$expect" = "0" ]; then
    [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ] && ok=0
  elif [ "$expect" = "2" ]; then
    [ "$EXIT" = "2" ] && [ -z "$STDOUT_TEXT" ] \
      && { [ -z "$needle" ] || echo "$STDERR_TEXT" | grep -qF "$needle"; } && ok=0
  elif [ "$expect" = "70" ]; then
    [ "$EXIT" = "70" ] && [ -z "$STDOUT_TEXT" ] \
      && { [ -z "$needle" ] || echo "$STDERR_TEXT" | grep -qF "$needle"; } && ok=0
  fi
  if [ "$ok" = "0" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit $expect${needle:+ + needle '$needle'}, got exit $EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== A.1 naked row-mode propagation ==="

# 1. naked + items-center + nakedCellRowModeAlign import → pass
run_hook "/r/packages/design-system/src/components/PeoplePicker/people-picker.tsx" '
import { nakedCellRowModeAlign } from "@/design-system/components/Field/field-wrapper"
function F() { return <div variant="naked" className="inline-flex items-center" /> }
'
expect_exit "A.1.1 naked + import → pass" 0

# 2. naked + items-center + no SSOT → BLOCK
run_hook "/r/packages/design-system/src/components/Bad/bad.tsx" '
function F() { return <span variant="naked" className="inline-flex items-center" /> }
'
expect_exit "A.1.2 naked + no SSOT → BLOCK" 2 "naked row-mode propagation"

# 2b. 2026-06-03 回歸防護(同 R8 bug class):naked + items-center 跨多行 className(真實 JSX 格式)
#     + no SSOT → BLOCK。修前 grep 逐行 → 多行 className 靜默漏 = P0 false-negative(對抗稽核抓到)。
run_hook "/r/packages/design-system/src/components/BadMulti/bad-multi.tsx" '
function F() { return <span variant="naked" className="inline-flex
  bg-white
  items-center" /> }
'
expect_exit "A.1.2b naked + 多行 className → BLOCK(回歸防護)" 2 "naked row-mode propagation"

# 3. allowlist → pass
run_hook "/r/packages/design-system/src/components/Edge/edge.tsx" '
// @naked-row-mode-allow: popover content
function F() { return <span variant="naked" className="inline-flex items-center" /> }
'
expect_exit "A.1.3 allowlist → pass" 0

# 4. SSOT host skip(field-wrapper.tsx)→ pass(自身 SSOT,不檢)
run_hook "/r/packages/design-system/src/components/Field/field-wrapper.tsx" '
function F() { return <span variant="naked" className="inline-flex items-center" /> }
'
expect_exit "A.1.4 SSOT host skip → pass" 0

echo ""
echo "=== A.2 FieldControlGroup wrapper direct child ==="

# 5. <FieldControlGroup> 內 <div wrapper> → governance context(exit 0)
run_hook "/r/packages/design-system/src/components/Filter/filter.tsx" '
function F() { return (
  <FieldControlGroup>
    <div className="flex-1 min-w-0">
      <FilterValuePicker />
    </div>
  </FieldControlGroup>
)}
'
expect_exit "A.2.1 FCG with div wrapper → governance context" 0 "FieldControlGroup wrapper"

# 6. <FieldControlGroup> 直接 child 沒 wrapper → pass
run_hook "/r/packages/design-system/src/components/Filter/filter.tsx" '
function F() { return (
  <FieldControlGroup>
    <FilterValuePicker className="flex-1 min-w-0" />
  </FieldControlGroup>
)}
'
expect_exit "A.2.2 FCG direct child → pass" 0

# 7. allowlist → pass
run_hook "/r/packages/design-system/src/components/Filter/filter.tsx" '
// @fcg-wrapper-allow: legacy migration
function F() { return (
  <FieldControlGroup>
    <div><FilterValuePicker /></div>
  </FieldControlGroup>
)}
'
expect_exit "A.2.3 FCG allowlist → pass" 0

echo ""
echo "=== A.3 Field state ring SSOT ==="

# 8. shadow-[inset → BLOCK
run_hook "/r/packages/design-system/src/components/Combobox/combobox.tsx" '
const cls = "hover:shadow-[inset_0_0_0_1px_var(--border)]"
'
expect_exit "A.3.1 shadow-[inset → BLOCK" 2 "shadow inset"

# 9. focus-within:outline-primary → BLOCK
run_hook "/r/packages/design-system/src/components/Select/select.tsx" '
const cls = "focus-within:outline-primary"
'
expect_exit "A.3.2 outline state ring → BLOCK" 2 "outline"

# 9b. 同一條,把變體換成欄位「自己的浮層開著」的記號(2026-11-13 起與 hover / focus-within 同列)→ BLOCK
run_hook "/r/packages/design-system/src/components/Select/select.tsx" '
const cls = "data-[field-open]:outline-primary"
'
expect_exit "A.3.2b data-[field-open] 的 outline ring → BLOCK" 2 "outline"

# 10. SSOT host skip(textarea.tsx;A.3.1 / A.3.2)→ pass
run_hook "/r/packages/design-system/src/components/Textarea/textarea.tsx" '
const cls = "hover:shadow-[inset_0_0_0_1px_red]"
'
expect_exit "A.3.1 textarea SSOT skip → pass" 0

echo ""
echo "=== A.3.3 欄位開著的框只有一個住所(2026-11-13 改寫)==="
# 規則:欄位自己的浮層開著 = 外框維持聚焦的框;樣式只住 field-wrapper.tsx、只認欄位自己寫的 data-[field-open]。
# 兩面對照 —— 該擋:改回舊寫法的各種形狀;該放:現在的寫法、按鈕類觸發(開著 = 自己的 hover)、讀記號做外框以外的事。
A33="欄位開著的框只有一個住所"

# 該擋 1. 元件自己用 open 狀態換框色(改寫前就有的擋法)
run_hook "/r/packages/design-system/src/components/Select/select.tsx" "
const cls = open && 'border-primary'
"
expect_exit "A.3.3 該擋:元件自己 open && 'border-primary'" 2 "元件自己用 open 狀態換框色"

# 該擋 2. 同一件事帶 !(新規則的框色是 !border-primary,改回各元件自己寫時最可能的形狀)
run_hook "/r/packages/design-system/src/components/Combobox/combobox.tsx" "
const cls = cn(base, isOpen && '!border-primary')
"
expect_exit "A.3.3 該擋:元件自己 isOpen && '!border-primary'" 2 "元件自己用 open 狀態換框色"

# 該擋 3. 改回舊寫法 —— field-wrapper.tsx 一般欄位那一條(c55c3786 的原文:開著 = hover 框)
run_hook "/r/packages/design-system/src/components/Field/field-wrapper.tsx" "
    { mode: 'edit' as const, variant: 'default' as const, error: false as const, className: wrapper ? 'data-[state=open]:border-border-hover focus-within:!border-primary focus-within:hover:!border-primary focus-visible:outline-none' : 'focus-within:!border-primary focus-within:hover:!border-primary' },
"
expect_exit "A.3.3 該擋:field-wrapper.tsx 改回 data-[state=open]:border-border-hover" 2 "用 Radix 通用的"

# 該擋 4. 改回舊寫法 —— field-wrapper.tsx 錯誤欄位那一條(c55c3786 的原文:開著 = error-hover 框)
run_hook "/r/packages/design-system/src/components/Field/field-wrapper.tsx" "
    { mode: 'edit' as const, error: true as const, className: wrapper ? 'border-error hover:border-error-hover data-[state=open]:border-error-hover focus-within:!border-error focus-within:hover:!border-error focus-visible:outline-none' : 'border-error hover:border-error-hover focus-within:!border-error focus-within:hover:!border-error' },
"
expect_exit "A.3.3 該擋:field-wrapper.tsx 改回 data-[state=open]:border-error-hover" 2 "用 Radix 通用的"

# 該擋 5. 畫欄位外框的元件自己用通用 data-state 換成聚焦的框(顏色對、訊號錯:外面的浮層也會寫到 data-state)
run_hook "/r/packages/design-system/src/components/Select/select.tsx" "
import { fieldWrapperStyles } from '@/design-system/components/Field/field-wrapper'
const cls = cn(fieldWrapperStyles({ mode: 'edit', size, error }), 'data-[state=open]:!border-primary')
"
expect_exit "A.3.3 該擋:Field 家族元件 data-[state=open]:!border-primary" 2 "用 Radix 通用的"

# 該擋 6. 同上,中間再夾一個變體
run_hook "/r/packages/design-system/src/components/TimePicker/time-picker.tsx" "
import { fieldWrapperStyles } from '@/design-system/components/Field/field-wrapper'
const cls = cn(fieldWrapperStyles({ mode: 'edit', size, error }), 'data-[state=open]:hover:border-border-hover')
"
expect_exit "A.3.3 該擋:Field 家族元件 data-[state=open]:hover:border-*" 2 "用 Radix 通用的"

# 該擋 7. 認對了記號,但樣式寫在住所以外
run_hook "/r/packages/design-system/src/components/Select/select.tsx" "
const cls = 'data-[field-open]:!border-primary'
"
expect_exit "A.3.3 該擋:field-wrapper.tsx 以外 data-[field-open]:!border-primary" 2 "在 field-wrapper.tsx 以外用"

# 該放 1. field-wrapper.tsx 現在的寫法(一般 / 錯誤 / 無框款三條原文)
run_hook "/r/packages/design-system/src/components/Field/field-wrapper.tsx" "
    { mode: 'edit' as const, variant: 'default' as const, error: false as const, className: wrapper ? 'data-[field-open]:!border-primary focus-within:!border-primary focus-within:hover:!border-primary focus-visible:outline-none' : 'focus-within:!border-primary focus-within:hover:!border-primary' },
    { mode: 'edit' as const, error: true as const, className: wrapper ? 'border-error hover:border-error-hover data-[field-open]:!border-error focus-within:!border-error focus-within:hover:!border-error focus-visible:outline-none' : 'border-error hover:border-error-hover focus-within:!border-error focus-within:hover:!border-error' },
      { mode: 'edit', variant: 'naked', error: false, className: 'data-[field-open]:!border-primary focus-within:!border-primary focus-within:hover:!border-primary focus-visible:outline-none' },
"
expect_exit "A.3.3 該放:field-wrapper.tsx 現在的 data-[field-open] 寫法" 0

# 該放 2. 按鈕類觸發:開著 = 自己的 hover(button.tsx 原文三行;不是欄位外框)
run_hook "/r/packages/design-system/src/components/Button/button.tsx" "
          'data-[state=open]:text-primary-hover data-[state=open]:border-primary-hover',
          'data-[state=open]:text-error-hover data-[state=open]:border-error-hover',
          'aria-pressed:data-[state=open]:bg-primary-subtle aria-pressed:data-[state=open]:border-transparent aria-pressed:data-[state=open]:text-primary-hover',
"
expect_exit "A.3.3 該放:Button 的 data-[state=open]:border-*(開著 = 自己的 hover)" 0

# 該放 3. inline action 開著(item-anatomy.tsx 原文)
run_hook "/r/packages/design-system/src/patterns/element-anatomy/item-anatomy.tsx" '
        overlayTrigger && "data-[state=open]:text-fg-secondary",
'
expect_exit "A.3.3 該放:inline action 的 data-[state=open]" 0

# 該放 4. 不畫欄位外框的按鈕類元件,自己的 hover 剛好是 border-border-hover(token 名字相同不代表它是欄位)
run_hook "/r/packages/design-system/src/components/Chip/chip.tsx" "
const chip = cva(['border border-border', 'hover:border-border-hover data-[state=open]:border-border-hover'])
"
expect_exit "A.3.3 該放:非欄位元件 data-[state=open]:border-border-hover" 0

# 該放 5. 讀記號做外框以外的事(field-control-group.tsx 原文:聚焦 / 開著的成員浮到鄰居上面,而且壓過鄰居的滑過)
run_hook "/r/packages/design-system/src/components/FieldControlGroup/field-control-group.tsx" "
      '[&>*:hover]:z-[3] [&>*:focus-within]:z-[4] [&>*[data-field-open]]:z-[4]',
      '[&>*:focus-within:hover]:z-[4] [&>*[data-field-open]:hover]:z-[4]',
"
expect_exit "A.3.3 該放:FieldControlGroup 讀記號排 z-index" 0

# 該放 6. 純註解行引用舊 pattern(retire 註解;2026-06-11 deep-audit R2 的回歸防護)
run_hook "/r/packages/design-system/src/components/Select/select.tsx" "
          // 2026-05-06 v13.3 SSOT retire:per-control \`open && 'border-primary'\` / \`data-[state=open]:border-border-hover\` 移除
"
expect_exit "A.3.3 該放:純註解行引用舊 pattern" 0

# 該放 7. escape
run_hook "/r/packages/design-system/src/components/Select/select.tsx" "
const cls = open && 'border-primary' // @field-state-ring-allow: 遷移中的相容層,下一版移除
"
expect_exit "A.3.3 該放:@field-state-ring-allow" 0

echo ""
echo "=== A.3.4 data-field-open 記號只有 lib/composite-field-focus.ts 會寫(2026-11-13)==="
A34="data-field-open 記號手寫"

# 該擋 1. 元件手寫 JSX 屬性(日期區間外框把 fieldOpenProps 換回手寫)
run_hook "/r/packages/design-system/src/components/DatePicker/date-picker.tsx" "
            {...props}
            data-field-open={open ? '' : undefined}
"
expect_exit "A.3.4 該擋:元件手寫 data-field-open={…}" 2 "$A34"

# 該擋 2. 手寫成物件 key 再展開
run_hook "/r/packages/design-system/src/components/Select/select.tsx" "
const triggerProps = { 'data-field-open': open ? '' : undefined }
"
expect_exit "A.3.4 該擋:手寫物件 key 'data-field-open'" 2 "$A34"

# 該擋 3. 產品程式用裸屬性把 DS 欄位的框釘成開著的樣子
run_hook "/r/apps/crm/src/components/DealFilterField.tsx" '
  return <div className={frame} data-field-open>
'
expect_exit "A.3.4 該擋:裸屬性 data-field-open" 2 "$A34"

# 該擋 4. 命令式寫入(不在 components/ 底下也擋:記號的寫入者只有一個)
run_hook "/r/packages/design-system/src/patterns/filter-bar/filter-bar.tsx" "
  frameRef.current?.setAttribute('data-field-open', '')
"
expect_exit "A.3.4 該擋:setAttribute('data-field-open')" 2 "$A34"

# 該放 1. 經 fieldOpenProps(date-picker.tsx 日期區間外框現在的寫法)
run_hook "/r/packages/design-system/src/components/DatePicker/date-picker.tsx" "
            {...props}
            {...fieldOpenProps(open)}
"
expect_exit "A.3.4 該放:{...fieldOpenProps(open)}" 0

# 該放 2. 唯一寫入者自己(lib/composite-field-focus.ts 原文)
run_hook "/r/packages/design-system/src/lib/composite-field-focus.ts" "
export const FIELD_OPEN_ATTR = 'data-field-open'
export function fieldOpenProps(open: boolean | undefined): { 'data-field-open': '' | undefined } {
  return { [FIELD_OPEN_ATTR]: open ? '' : undefined } as { 'data-field-open': '' | undefined }
}
"
expect_exit "A.3.4 該放:lib/composite-field-focus.ts(唯一寫入者)" 0

# 該放 3. 說明文字裡的字面(date-picker.tsx JSX 註解續行原文 —— 不是純註解行,不會被剝離)
run_hook "/r/packages/design-system/src/components/DatePicker/date-picker.tsx" '
            (外框「開著 = 聚焦的框」不靠 data-state,認欄位自己的 `data-field-open`,見 fieldFocus.trigger。) */}
'
expect_exit "A.3.4 該放:說明文字裡的字面" 0

# 該放 4. 讀記號(選擇器)
run_hook "/r/packages/design-system/src/components/DataTable/data-table.tsx" "
  const openField = cell.querySelector('[data-field-open]')
"
expect_exit "A.3.4 該放:讀 [data-field-open]" 0

# 該放 5. story 把靜態狀態釘出來(story / test 不在 A.3 範圍)
run_hook "/r/packages/design-system/src/components/Select/select.principles.stories.tsx" '
  <div className={frame} data-field-open="" />
'
expect_exit "A.3.4 該放:story skip" 0

# 該放 6. escape
run_hook "/r/packages/design-system/src/components/Select/select.tsx" "
const triggerProps = { 'data-field-open': '' } // @field-state-ring-allow: 視覺回歸 fixture
"
expect_exit "A.3.4 該放:@field-state-ring-allow" 0

# 同一次寫入同時踩 A.3.3 與 A.3.4 → 一次 exit 2,兩段訊息都在
run_hook "/r/packages/design-system/src/components/Field/field-wrapper.tsx" "
const cls = 'data-[state=open]:border-border-hover'
const frame = <div className={cls} data-field-open={open ? '' : undefined} />
"
if [ "$EXIT" = "2" ] && [ -z "$STDOUT_TEXT" ] \
  && echo "$STDERR_TEXT" | grep -qF "$A33" && echo "$STDERR_TEXT" | grep -qF "$A34"; then
  echo "  PASS  A.3.3 + A.3.4 同時踩 → 兩段訊息都在"
  PASS=$((PASS+1))
else
  echo "  FAIL  A.3.3 + A.3.4 同時踩 (expected exit 2 + 兩段訊息, got exit $EXIT)"
  echo "$STDERR_TEXT" | sed 's/^/    /'
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - A.3.3 + A.3.4 同時踩"
fi

echo ""
echo "=== A.4 disabled placeholder color ==="

# 12. placeholder:text-fg-muted no override → exit 0 governance context
run_hook "/r/packages/design-system/src/components/Custom/custom.tsx" '
const cls = "placeholder:text-fg-muted"
'
expect_exit "A.4.1 placeholder:text-fg-muted no override → governance context" 0 "disabled placeholder color"

# 13. placeholder + disabled override → pass(stderr 不該 fire)
run_hook "/r/packages/design-system/src/components/Custom/custom.tsx" '
const cls = "placeholder:text-fg-muted disabled:placeholder:text-fg-disabled"
'
if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
  echo "  PASS  A.4.2 placeholder + disabled override → silent pass"
  PASS=$((PASS+1))
else
  echo "  FAIL  A.4.2 (expected silent exit 0, got stderr fire)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - A.4.2"
fi

# 14. allowlist → silent pass
run_hook "/r/packages/design-system/src/components/Custom/custom.tsx" '
// @disabled-color-allow: caption text intentionally muted across modes
const cls = "placeholder:text-fg-muted"
'
if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
  echo "  PASS  A.4.3 allowlist → silent pass"
  PASS=$((PASS+1))
else
  echo "  FAIL  A.4.3"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - A.4.3"
fi

echo ""
echo "=== A.6 空值顯示 SSOT(2026-07-08 半形 hyphen)==="

# 17. 非 owner import EMPTY_DISPLAY → BLOCK(應消費 useFieldEmptyDisplay hook 分流)
run_hook "/r/packages/design-system/src/components/Bad/bad.tsx" "import { EMPTY_DISPLAY } from '@/design-system/components/Field/field-wrapper'"
expect_exit "A.6.1 非 owner import EMPTY_DISPLAY → BLOCK" 2 "EMPTY_DISPLAY 直引"

# 18. owner field-context.ts import EMPTY_DISPLAY → pass(SSOT owner skip)
run_hook "/r/packages/design-system/src/components/Field/field-context.ts" "import { EMPTY_DISPLAY } from './field-wrapper'"
expect_exit "A.6.1 owner field-context.ts import → pass" 0

# 19. components tsx hardcode 全形 em dash '—' → BLOCK
run_hook "/r/packages/design-system/src/components/Bad/bad.tsx" "const cls = value ?? '—'"
expect_exit "A.6.2 hardcode 全形 em dash → BLOCK" 2 "全形 em dash"

# 20. 半形 hyphen '-' → pass(非全形,不觸發)
run_hook "/r/packages/design-system/src/components/Bad/bad.tsx" "const sep = '-'"
expect_exit "A.6.2 半形 hyphen → pass" 0

# 21. allowlist → pass
run_hook "/r/packages/design-system/src/components/Bad/bad.tsx" "const cls = value ?? '—' // @empty-display-allow: legacy N/A marker"
expect_exit "A.6 allowlist → pass" 0

echo ""
echo "=== Skip cases ==="

# 15. non-tsx → skip
run_hook "/r/packages/design-system/src/components/Foo.md" 'placeholder:text-fg-muted'
expect_exit "S.1 non-tsx → skip" 0

# 16. read tool → skip
run_hook "/r/packages/design-system/src/components/Foo.tsx" 'irrelevant' Read
expect_exit "S.2 non-edit tool → skip" 0

echo ""
echo "=== Output contract ==="

run_hook "/r/packages/design-system/src/components/Filter/filter.tsx" '
const cls = "placeholder:text-fg-muted"
function F() { return (
  <FieldControlGroup>
    <div><FilterValuePicker /></div>
  </FieldControlGroup>
)}
'
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] \
  && is_exact_context "FieldControlGroup wrapper" \
  && printf '%s' "$STDOUT_TEXT" | jq -e \
    '.governanceContext.message | contains("disabled placeholder color")' >/dev/null; then
  echo "  PASS  O.1 A.2+A.4 warnings → one exact PreToolUse context"
  PASS=$((PASS+1))
else
  echo "  FAIL  O.1 warning aggregation contract"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - O.1 warning aggregation"
fi

run_raw '{'
expect_exit "O.2 malformed input → stderr-only integrity failure" 70 "GOVERNANCE_INTEGRITY:"

echo ""
echo "═══ Results: $PASS PASS, $FAIL FAIL ═══"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

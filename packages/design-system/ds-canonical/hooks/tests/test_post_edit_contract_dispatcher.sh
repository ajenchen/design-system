#!/bin/bash
# Tests for post_edit_contract_dispatcher.sh 與它的 4 支 lib helper(WP-14,2026-11-21)。
#
# 合併自原 4 份測試(原格逐格搬入,「提醒」改成「擋」;每條規則兩面都在:違反 → 擋、加豁免 → 放行)。原格 → 新格:
#   test_check_peoplepicker_ssot_drift.sh  原 1–6 → P-1…P-6
#   test_check_pixel_quantified_audit.sh   原 1 → X-1、2 → X-2、3 → X-3、4 → X-4、5「非 Edit 工具」→ D-20(改由 dispatcher 判)、6 → X-6
#   test_check_field_controls_contracts.sh 原 1「PreToolUse 事件」→ D-19(改由 dispatcher 判)、2「檔案不存在」→ F-1a、3 → F-1、
#     4 → F-2、5 → F-3、6 → F-4、7「emptyPlaceholder={noResults}」→ F-2a、8 → F-7、9「註解提到舊名」→ F-8 + F-8a(JSDoc 那一行)
#   test_check_select_all_canonical.sh     原 1–7 → S-1…S-7
# 分段:
#   D-*  dispatcher 輸出契約(helper 換成假的):擋 / 既有清單 / 合併;helper 缺失、symlink、未定義 exit、輸出管道錯 → fail closed 70
#   P/X/F/S-*  四條規則經真的 dispatcher 跑;新增格(-a、-b…)= 搬進來時改的判法與「拿掉豁免 → 擋」的對照
#   X-L* / F-L*  pixel 與 field_controls 的逐行豁免(規格 step 1「擋 + 逐行豁免」):加了逐行豁免 → 放行、同一段拿掉 → 擋
#   I-*  真 helper 的量具壞掉(共用新增行判法不見、寫入後不是一般檔)→ 70,不讀成通過

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DISPATCHER="$HOOK_DIR/post_edit_contract_dispatcher.sh"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
HELPERS="_peoplepicker_ssot_drift.sh _pixel_quantified_audit.sh _field_controls_contracts.sh _select_all_canonical.sh"

if [ ! -f "$DISPATCHER" ]; then
  echo "FATAL: hook missing: $DISPATCHER"
  exit 1
fi

TMP_ROOT=$(mktemp -d)
[ -n "${TMP_ROOT:-}" ] && [ -d "$TMP_ROOT" ] || { echo "❌ mktemp -d failed(TMP_ROOT;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
trap 'rm -rf -- "$TMP_ROOT"' EXIT

export GOVERNANCE_TELEMETRY_OPT_IN=0
PASS=0
FAIL=0
FAILED_TESTS=""
OUT_FILE="$TMP_ROOT/stdout"
ERR_FILE="$TMP_ROOT/stderr"
RC=0

record_pass() { echo "  PASS  $1"; PASS=$((PASS + 1)); }
record_fail() {
  echo "  FAIL  $1 ($2)"
  echo "  --- stdout ---"; sed 's/^/    /' "$OUT_FILE"; echo "  --- stderr ---"; sed 's/^/    /' "$ERR_FILE"; echo "  --- end ---"
  FAIL=$((FAIL + 1)); FAILED_TESTS="${FAILED_TESTS}\n  - $1"
}

# run <hook path> <payload>
run() {
  printf '%s' "$2" | bash "$1" >"$OUT_FILE" 2>"$ERR_FILE"
  RC=$?
}

expect_clean() {
  if [ "$RC" -eq 0 ] && [ ! -s "$OUT_FILE" ] && [ ! -s "$ERR_FILE" ]; then record_pass "$1"
  else record_fail "$1" "expected fully-silent rc0, got rc$RC"; fi
}

# expect_block <name> <needle> [needle...]:exit 2、stdout 空、stderr 含每個 needle、不帶 integrity 標記
expect_block() {
  local name="$1" needle
  shift
  if [ "$RC" -ne 2 ] || [ -s "$OUT_FILE" ] || [ ! -s "$ERR_FILE" ] || grep -qF 'GOVERNANCE_INTEGRITY' "$ERR_FILE"; then
    record_fail "$name" "expected stderr-only policy rc2, got rc$RC"
    return
  fi
  for needle in "$@"; do
    if ! grep -qF -- "$needle" "$ERR_FILE"; then
      record_fail "$name" "stderr missing '$needle'"
      return
    fi
  done
  record_pass "$name"
}

# expect_context <name> <needle> [needle...]:exit 0、stderr 空、stdout 恰好一個 PostToolUse governanceContext 含每個 needle
expect_context() {
  local name="$1" needle message
  shift
  if [ "$RC" -ne 0 ] || [ -s "$ERR_FILE" ] || ! jq -e -s '
    length == 1 and (.[0] | keys == ["governanceContext"]
      and .governanceContext.hookEventName == "PostToolUse"
      and (.governanceContext.message | type == "string" and length > 0))
  ' "$OUT_FILE" >/dev/null 2>&1; then
    record_fail "$name" "expected rc0 with one PostToolUse governanceContext, got rc$RC"
    return
  fi
  message=$(jq -r '.governanceContext.message' "$OUT_FILE")
  for needle in "$@"; do
    if ! grep -qF -- "$needle" <<<"$message"; then
      record_fail "$name" "context missing '$needle'"
      return
    fi
  done
  record_pass "$name"
}

expect_integrity() {
  if [ "$RC" -eq 70 ] && [ ! -s "$OUT_FILE" ] && grep -qF 'GOVERNANCE_INTEGRITY' "$ERR_FILE" \
    && grep -qF -- "$2" "$ERR_FILE"; then record_pass "$1"
  else record_fail "$1" "expected rc70 GOVERNANCE_INTEGRITY + '$2', got rc$RC"; fi
}

expect_not_in_stderr() {
  if grep -qF -- "$2" "$ERR_FILE"; then record_fail "$1" "stderr unexpectedly contains '$2'"
  else record_pass "$1"; fi
}

write_payload() {
  jq -nc --arg fp "$1" --arg c "$2" \
    '{hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:$fp,content:$c}}'
}
edit_payload() { # <path> <old_string> <new_string>
  jq -nc --arg fp "$1" --arg o "$2" --arg n "$3" \
    '{hook_event_name:"PostToolUse",tool_name:"Edit",tool_input:{file_path:$fp,old_string:$o,new_string:$n}}'
}
# 正式入口 scripts/run-provider-hook.mjs 交來的 event-v1 形狀:沒有 new_string / edits[],只有 content + old_string
runner_edit_payload() { # <path> <old_string> <content>
  jq -nc --arg fp "$1" --arg o "$2" --arg c "$3" '{
    hook_event_name:"PostToolUse", event:"PostToolUse", tool_name:"Edit", tool:"Edit", operation:"write",
    tool_input:{file_path:$fp, path:$fp, old_string:$o, content:$c}, changed_paths:[$fp]
  }'
}

# fixture 檔(寫入後的樣子)放在不在 git 裡的暫存樹:Write = 每一行都是新增;Edit 以 old_string → new_string 配對判新增行
FIX="$TMP_ROOT/workspace"
make_fixture() { # <rel> <content> → 印出絕對路徑
  mkdir -p "$(dirname "$FIX/$1")"
  printf '%s\n' "$2" >"$FIX/$1"
  printf '%s' "$FIX/$1"
}
run_write() { # <rel> <content>:寫 fixture,再以 Write 事件跑真 dispatcher
  local path
  path=$(make_fixture "$1" "$2")
  run "$DISPATCHER" "$(write_payload "$path" "$2")"
}

echo "=== post_edit_contract_dispatcher tests ==="

# ─────────────────────────────────────────────────────────────────────────────
echo "--- D: dispatcher 輸出契約(helper 換成假的)---"
STUB="$TMP_ROOT/stub"
mkdir -p "$STUB/lib"
cp "$DISPATCHER" "$STUB/post_edit_contract_dispatcher.sh"
cp "$HOOK_DIR/_log-fire.sh" "$STUB/_log-fire.sh"

stub_helper() { # <helper> <mode>
  local file="$STUB/lib/$1"
  rm -f "$file"
  case "$2" in
    clean) printf '%s\n' '#!/bin/bash' 'cat >/dev/null' 'exit 0' >"$file" ;;
    context-*) printf '%s\n' '#!/bin/bash' 'cat >/dev/null' \
      "printf '%s\\n' '{\"governanceContext\":{\"hookEventName\":\"PostToolUse\",\"message\":\"$2\"}}'" 'exit 0' >"$file" ;;
    rc1) printf '%s\n' '#!/bin/bash' 'cat >/dev/null' 'exit 1' >"$file" ;;
    raw-stderr) printf '%s\n' '#!/bin/bash' 'cat >/dev/null' "printf 'soft warning\\n' >&2" 'exit 0' >"$file" ;;
    malformed) printf '%s\n' '#!/bin/bash' 'cat >/dev/null' "printf 'not-json\\n'" 'exit 0' >"$file" ;;
    wrong-event) printf '%s\n' '#!/bin/bash' 'cat >/dev/null' \
      "printf '%s\\n' '{\"governanceContext\":{\"hookEventName\":\"PreToolUse\",\"message\":\"x\"}}'" 'exit 0' >"$file" ;;
    block-empty) printf '%s\n' '#!/bin/bash' 'cat >/dev/null' 'exit 2' >"$file" ;;
    block-stdout) printf '%s\n' '#!/bin/bash' 'cat >/dev/null' "printf 'wrong stream\\n'" "printf 'reason\\n' >&2" 'exit 2' >"$file" ;;
    block-marker) printf '%s\n' '#!/bin/bash' 'cat >/dev/null' "printf 'GOVERNANCE_INTEGRITY: legacy marker\\n' >&2" 'exit 2' >"$file" ;;
    rc70) printf '%s\n' '#!/bin/bash' 'cat >/dev/null' "printf 'GOVERNANCE_INTEGRITY: helper verifier unavailable\\n' >&2" 'exit 70' >"$file" ;;
    block-*) printf '%s\n' '#!/bin/bash' 'cat >/dev/null' "printf '%s\\n' '$2' >&2" 'exit 2' >"$file" ;;
    *) echo "unknown stub mode $2" >&2; exit 1 ;;
  esac
}
reset_stubs() { local h; for h in $HELPERS; do stub_helper "$h" clean; done; }
STUB_PAYLOAD=$(write_payload "$FIX/packages/design-system/src/components/Foo/foo.tsx" "export const Foo = 1")
run_stub() { run "$STUB/post_edit_contract_dispatcher.sh" "${1:-$STUB_PAYLOAD}"; }

reset_stubs; run_stub; expect_clean "D-1. 四支 helper 都安靜 → dispatcher 完全安靜 rc0"

reset_stubs; stub_helper _field_controls_contracts.sh block-field
run_stub; expect_block "D-2. 一支擋(rc2 stderr-only)→ 原因照印、rc2" "block-field"

reset_stubs; stub_helper _peoplepicker_ssot_drift.sh block-people; stub_helper _select_all_canonical.sh block-select
run_stub; expect_block "D-3. 第一支與最後一支都擋 → 兩則原因都印(擋了之後其餘照樣跑)" "block-people" "block-select"

reset_stubs; stub_helper _select_all_canonical.sh context-existing
run_stub; expect_context "D-4. 只有既有清單 → rc0 + 一個 PostToolUse governanceContext" "context-existing"

reset_stubs; stub_helper _pixel_quantified_audit.sh context-one; stub_helper _select_all_canonical.sh context-two
run_stub; expect_context "D-5. 兩支的既有清單合成一個 context" "context-one" "context-two"

reset_stubs; stub_helper _peoplepicker_ssot_drift.sh block-people; stub_helper _select_all_canonical.sh context-existing
run_stub; expect_block "D-6. 擋 + 別支的既有清單 → rc2,stderr 兩者都有、stdout 空" "block-people" "context-existing"

reset_stubs; stub_helper _pixel_quantified_audit.sh rc1
run_stub; expect_integrity "D-7. 未定義 exit code 1 → 70" "回傳非預期 exit code 1"

reset_stubs; stub_helper _pixel_quantified_audit.sh raw-stderr
run_stub; expect_integrity "D-8. rc0 卻寫 stderr(只提醒的舊寫法)→ 70" "exit 0 卻寫 stderr"

reset_stubs; stub_helper _field_controls_contracts.sh malformed
run_stub; expect_integrity "D-9. rc0 的 stdout 不是 JSON → 70" "不是單一 PostToolUse governanceContext"

reset_stubs; stub_helper _field_controls_contracts.sh wrong-event
run_stub; expect_integrity "D-10. rc0 的 context 事件名不是 PostToolUse → 70" "不是單一 PostToolUse governanceContext"

reset_stubs; stub_helper _select_all_canonical.sh block-empty
run_stub; expect_integrity "D-11. rc2 卻沒寫原因 → 70" "exit 2 必須是 stderr-only"

reset_stubs; stub_helper _select_all_canonical.sh block-stdout
run_stub; expect_integrity "D-12. rc2 還寫了 stdout → 70" "exit 2 必須是 stderr-only"

reset_stubs; stub_helper _field_controls_contracts.sh block-marker
run_stub; expect_integrity "D-13. rc2 帶 integrity 標記 → 70(量具壞,不是政策擋)" "GOVERNANCE_INTEGRITY: legacy marker"

reset_stubs; stub_helper _field_controls_contracts.sh rc70
run_stub; expect_integrity "D-14. helper rc70 → 診斷照印、70" "helper verifier unavailable"

reset_stubs; stub_helper _peoplepicker_ssot_drift.sh block-people; stub_helper _pixel_quantified_audit.sh rc70
run_stub; expect_integrity "D-15. 一支擋、一支量具壞 → 70(不讀成單純擋)" "helper verifier unavailable"
if grep -qF 'block-people' "$ERR_FILE"; then record_pass "D-15b. 同一輪收到的擋照樣列出"
else record_fail "D-15b. 同一輪收到的擋照樣列出" "block reason dropped"; fi

reset_stubs; rm -f "$STUB/lib/_select_all_canonical.sh"
run_stub; expect_integrity "D-16. helper 缺失 → 70" "required helper 缺失、symlink 或不是一般檔案: _select_all_canonical.sh"

# 每支 helper 各換成 symlink 一次(指向一支安靜的假 helper —— 換掉之後「看起來全綠」,dispatcher 必須不認)
printf '%s\n' '#!/bin/bash' 'cat >/dev/null' 'exit 0' >"$STUB/silent-target.sh"
for helper in $HELPERS; do
  reset_stubs
  rm -f "$STUB/lib/$helper"
  ln -s "$STUB/silent-target.sh" "$STUB/lib/$helper"
  run_stub; expect_integrity "D-17. $helper 換成 symlink → fail closed 70" "required helper 缺失、symlink 或不是一般檔案: $helper"
done

reset_stubs
run_stub '{'; expect_integrity "D-18. 壞 JSON → 70" "不是有效的 PostToolUse"
run_stub "$(jq -nc '{hook_event_name:"PreToolUse",tool_name:"Edit",tool_input:{file_path:"a.tsx",new_string:"x"}}')"
expect_integrity "D-19. PreToolUse 事件(原 field_controls 格 1)→ 70(只註冊在 PostToolUse)" "不是有效的 PostToolUse"
run_stub "$(jq -nc '{hook_event_name:"PostToolUse",tool_name:"Read",tool_input:{file_path:"scripts/visual-audit.mjs"}}')"
expect_integrity "D-20. 非寫入工具(原 pixel 格 5)→ 70(matcher 只有 Write|Edit|MultiEdit)" "不是有效的 PostToolUse"
run_stub "$(jq -nc '{hook_event_name:"PostToolUse",tool_name:"Edit",tool_input:{file_path:"",new_string:"x"}}')"
expect_integrity "D-21. file_path 空字串 → 70" "不是有效的 PostToolUse"

# ─────────────────────────────────────────────────────────────────────────────
echo "--- P: PeoplePicker SSOT drift(lib/_peoplepicker_ssot_drift.sh)---"
PP=packages/design-system/src/components/PeoplePicker/people-picker.tsx

run_write "$PP" 'const customTagRenderer = (item) => <PersonAvatarTag {...item} />;'
expect_block "P-1. tagRenderer 沒引用規格 → 擋" "PeoplePicker SSOT-bearing 寫入沒有引用規格那一列" "customTagRenderer"

run_write "$PP" 'overflowShape="round"'
expect_block "P-2. overflowShape 沒引用 → 擋" "people-picker.spec.md"

run_write "$PP" '// per people-picker.spec.md §A 元件本質繼承表
const tagRenderer = (item) => <PersonAvatarTag {...item} />;'
expect_clean "P-3. 附 §A 引用 → 放行"

run_write packages/design-system/src/components/Button/button.tsx 'const tagRenderer = (item) => <Tag {...item} />;'
expect_clean "P-4. 非 PeoplePicker 範圍的檔 → 放行"

run_write packages/design-system/src/components/Combobox/combobox.tsx 'selectedItemRenderer={renderPerson}'
expect_block "P-5. combobox.tsx 動 selectedItemRenderer 沒引用 → 擋" "PeoplePicker SSOT-bearing"

run_write packages/design-system/src/components/PeoplePicker/person-display.tsx 'const helperVar = "noop";'
expect_clean "P-6. person-display.tsx 沒動 SSOT 名稱 → 放行"

run_write "$PP" '<Combobox placeholder={triggerPlaceholder} />'
expect_block "P-6a. \`placeholder={\` 會被抓(舊版 regex 寫成字面 \\{,從沒抓過)" "placeholder={triggerPlaceholder}"

run_write "$PP" '// people-picker.spec.md L95
overflowShape="round"'
expect_block "P-6b. 行號引用 L9x 不算引用(那張表不在 9x 行)" "PeoplePicker SSOT-bearing"

# 逐行:引用註解留在上一行,這次只改那一行 → 放行;拿掉那行引用 → 擋
PP_CITED=$(make_fixture "$PP" '// people-picker.spec.md §E(Avatar-presence → placeholder)
const emptyHint = placeholder ?? "選擇人員"
<Combobox placeholder={emptyHint} searchIn="trigger" />')
run "$DISPATCHER" "$(edit_payload "$PP_CITED" 'const emptyHint = placeholder' 'const emptyHint = placeholder')"
expect_clean "P-6c. 沒有新增行(整段重播)→ 不判"
run "$DISPATCHER" "$(edit_payload "$PP_CITED" 'searchIn="menu"' 'searchIn="trigger"')"
expect_block "P-6d. 改的那行上一行不是引用、這次也沒寫引用 → 擋" 'searchIn="trigger"'
PP_CITED=$(make_fixture "$PP" '// people-picker.spec.md §E(Avatar-presence → placeholder)
<Combobox placeholder={emptyHint} searchIn="trigger" />')
run "$DISPATCHER" "$(edit_payload "$PP_CITED" 'searchIn="menu"' 'searchIn="trigger"')"
expect_clean "P-6e. 上一行就是引用註解 → 逐行放行"
PP_CITED=$(make_fixture "$PP" '// 頭像與提示字
<Combobox placeholder={emptyHint} searchIn="trigger" />')
run "$DISPATCHER" "$(edit_payload "$PP_CITED" 'searchIn="menu"' 'searchIn="trigger"')"
expect_block "P-6f. 同一格拿掉引用(上一行改成一般註解)→ 擋" 'searchIn="trigger"'
run "$DISPATCHER" "$(runner_edit_payload "$PP_CITED" 'searchIn="menu"' 'searchIn="trigger"')"
expect_block "P-6g. 正式入口形狀(content + old_string,沒有 new_string)一樣擋" 'searchIn="trigger"'

# ─────────────────────────────────────────────────────────────────────────────
echo "--- X: M32 pixel-quantified(lib/_pixel_quantified_audit.sh)---"
VA=scripts/visual-audit-fixture.mjs

run_write "$VA" "const s = el.getAttribute('data-state');
const r = el.getBoundingClientRect();"
expect_clean "X-1. getAttribute + getBoundingClientRect → 放行"

run_write "$VA" "// @pixel-quantified-allow: schema-only check
const s = el.getAttribute('data-state');"
expect_clean "X-2. 檔首 @pixel-quantified-allow → 放行"

run_write "$VA" "// schema-only check
const s = el.getAttribute('data-state');"
expect_block "X-2a. 同一支拿掉豁免 → 擋" "M32 pixel-quantified verify gap" "getAttribute('data-state')"

# 逐行豁免:標記放在第 4 行以後(檔首 3 行的寫法另由 X-2 管),只豁免命中那一行
VA_HEAD="import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
"
run_write "$VA" "${VA_HEAD}// @pixel-quantified-allow: schema-only check of the menu's data-state contract
const s = await page.getAttribute('[role=menu]', 'data-state');"
expect_clean "X-L1. 命中那一行的上一行寫逐行豁免(不在檔首)→ 放行"

run_write "$VA" "${VA_HEAD}// schema-only check of the menu's data-state contract
const s = await page.getAttribute('[role=menu]', 'data-state');"
expect_block "X-L2. 同一段拿掉逐行豁免 → 擋" "M32 pixel-quantified verify gap" "5:const s = await page.getAttribute"

run_write "$VA" "${VA_HEAD}const s = await page.getAttribute('[role=menu]', 'data-state'); // @pixel-quantified-allow: schema-only"
expect_clean "X-L3. 同一行寫逐行豁免 → 放行"

run_write "$VA" "${VA_HEAD}// @pixel-quantified-allow: schema-only check of the menu's data-state contract
const s = await page.getAttribute('[role=menu]', 'data-state');
const open = await page.locator('[role=menu]').evaluate((el) => el.hasAttribute('open'));"
expect_block "X-L4. 兩行屬性只豁免一行 → 擋,列出沒豁免的那一行" "M32 pixel-quantified verify gap" "6:const open"
expect_not_in_stderr "X-L4b. 已豁免的那一行不列" "5:const s"

run_write "$VA" "${VA_HEAD}// @pixel-quantified-allow:
const s = await page.getAttribute('[role=menu]', 'data-state');"
expect_block "X-L5. 標記冒號後沒寫理由 → 不算豁免、擋" "M32 pixel-quantified verify gap"

run_write scripts/other-script.mjs "const s = el.getAttribute('data-state');"
expect_clean "X-3. 不是 visual-audit 腳本 → 放行"

run_write "$VA" "const s = el.hasAttribute('open');
const t = el.offsetTop;"
expect_clean "X-4. hasAttribute + offsetTop → 放行"

run_write "$VA" "const s = el.hasAttribute('open');
const t = el.offsetTopology;"
expect_block "X-4a. offsetTopology 不是像素量測(字界)→ 擋" "M32 pixel-quantified verify gap"

run "$DISPATCHER" "$(write_payload "$FIX/scripts/visual-audit-nonexistent.mjs" "x")"
expect_clean "X-6. 寫入後檔案不在 → 放行"

# ─────────────────────────────────────────────────────────────────────────────
echo "--- F: Field controls shared contracts(lib/_field_controls_contracts.sh)---"
run_write packages/design-system/src/components/Button/button.tsx 'export function Button() { return <button className="h-9" /> }'
expect_clean "F-1. 沒有違反 → 放行"

# 原 field_controls 格 2:寫入後檔案不在 → 放行(路徑落在 components/*.tsx 範圍內,走到 field helper 的「檔案不在」那一支)
run "$DISPATCHER" "$(write_payload "$FIX/packages/design-system/src/components/Foo/foo-nonexistent.tsx" 'emptyPlaceholder={emptyText}')"
expect_clean "F-1a. 寫入後檔案不在(原 field_controls 格 2)→ 放行"

run_write packages/design-system/src/components/Select/select.tsx 'export const Select = ({ emptyText }) => <Combobox emptyPlaceholder={emptyText} />'
expect_block "F-2. (b) emptyPlaceholder={emptyText} → 擋" "contract (b) placeholder vocabulary"

run_write packages/design-system/src/components/Qux/qux.tsx 'export const Qux = () => <X emptyPlaceholder={noResults} />;'
expect_block "F-2a. (b) emptyPlaceholder={noResults}(原 field_controls 格 7)→ 擋" "contract (b) placeholder vocabulary" "emptyPlaceholder={noResults}"

run_write packages/design-system/src/components/Select/select.tsx '// @placeholder-vocabulary-allow: migration shim
export const Select = ({ emptyText }) => <Combobox emptyPlaceholder={emptyText} />'
expect_clean "F-3. (b) 檔首豁免 → 放行"

run_write packages/design-system/src/components/Combobox/combobox-fixture.tsx 'export const C = () => <TagArea tagAreaPaddingLeftPx={8} />'
expect_block "F-4. (c) tagAreaPaddingLeftPx={8} → 擋" "contract (c) cell metric escape hatch"

run_write packages/design-system/src/components/Combobox/combobox-fixture.tsx '// @cell-metric-escape-allow: documented magic
export const C = () => <TagArea tagAreaPaddingLeftPx={8} />'
expect_clean "F-5. (c) 檔首豁免 → 放行"

run_write packages/design-system/src/components/Combobox/combobox-fixture.tsx 'export const C = () => <TagArea tagAreaPaddingLeftPx={isEmpty ? undefined : 8} />'
expect_block "F-6. (c) 條件式帶數字卻沒看 surface → 擋" "conditional without surface check"

run_write packages/design-system/src/components/Combobox/combobox-fixture.tsx 'interface P {
  emptyPlaceholder?: string
}'
expect_block "F-7. (b) 舊名 emptyPlaceholder?: string 寫回 → 擋" "contract (b) placeholder vocabulary"

run_write packages/design-system/src/components/Combobox/combobox-fixture.tsx '// 舊名 emptyPlaceholder 已移除,改用 placeholder
export const C = ({ placeholder }) => <Trigger placeholder={placeholder} />'
expect_clean "F-8. (b) 只在註解提到舊名 → 放行"

run_write packages/design-system/src/components/Combobox/combobox-fixture.tsx '/** 無值時的提示文字(2026-11-15 前另有舊名 `emptyPlaceholder`,已移除) */
// 舊名 emptyPlaceholder 已移除
export const Combobox = ({ placeholder = "選擇…" }) => <span>{placeholder}</span>;'
expect_clean "F-8a. (b) JSDoc 與 // 註解都提到舊名(原 field_controls 格 9 原文)→ 放行"

FC_A='interface P {
  tagRenderer?: (item: Item) => React.ReactNode
}
export function C({ tagRenderer, mode }: P) {
  const edit = items.map((i) => tagRenderer(i))
  if (mode === '"'"'display'"'"') {
    return <span>{label}</span>
  }
  return <div>{edit}</div>
}'
run_write packages/design-system/src/components/Select/select-fixture.tsx "$FC_A"
expect_block "F-9. (a) renderer 只在 edit 分支用 → 擋" "contract (a) renderer symmetry"
run_write packages/design-system/src/components/Select/select-fixture.tsx "// @renderer-symmetry-allow: display path tracked separately
$FC_A"
expect_clean "F-9a. (a) 檔首豁免 → 放行"

run_write packages/design-system/src/components/Input/input-fixture.tsx 'export const I = () => <input className="px-3 h-9" />'
expect_block "F-9b. (d) 裸 px-3 → 擋" "contract (d) field-px"
run_write packages/design-system/src/components/Input/input-fixture.tsx '// @field-px-escape-allow: native control demo
export const I = () => <input className="px-3 h-9" />'
expect_clean "F-9c. (d) 檔首豁免 → 放行"
run_write packages/design-system/src/components/Input/input-fixture.tsx 'export const I = () => <input className="px-[var(--field-px)] h-9" />'
expect_clean "F-9d. (d) 已 token 化的 px-[var(--field-px)] → 放行"
run_write packages/design-system/src/components/Input/input.stories.tsx 'export const Demo = () => <div className="px-3" />'
expect_clean "F-9e. (d) *.stories.tsx 不在範圍 → 放行"

# 逐行豁免(每條 contract 一對):標記放在第 4 行以後(檔首 3 行的寫法另由 F-3 / F-5 / F-9a / F-9c 管),只豁免命中那一行
FC_HEAD="import * as React from 'react'
import { cn } from '@/design-system/lib/utils'
"
FC_B_BODY='export const Select = ({ emptyText }) => (
  <Combobox
    MARK
    emptyPlaceholder={emptyText}
  />
)'
run_write packages/design-system/src/components/Select/select-fixture.tsx \
  "${FC_HEAD}${FC_B_BODY/MARK/// @placeholder-vocabulary-allow: migration shim, removed with the next minor}"
expect_clean "F-L1. (b) 命中那一行的上一行寫逐行豁免(不在檔首)→ 放行"
run_write packages/design-system/src/components/Select/select-fixture.tsx \
  "${FC_HEAD}${FC_B_BODY/MARK/// migration shim, removed with the next minor}"
expect_block "F-L2. (b) 同一段拿掉逐行豁免 → 擋" "contract (b) placeholder vocabulary" "6:    emptyPlaceholder={emptyText}"

FC_A_BODY='interface P {
  MARK
  tagRenderer?: (item: Item) => React.ReactNode
}
export function C({ tagRenderer, mode }: P) {
  const edit = items.map((i) => tagRenderer(i))
  if (mode === '"'"'display'"'"') {
    return <span>{label}</span>
  }
  return <div>{edit}</div>
}'
run_write packages/design-system/src/components/Select/select-fixture.tsx \
  "${FC_HEAD}${FC_A_BODY/MARK/// @renderer-symmetry-allow: display path tracked separately in Stream C}"
expect_clean "F-L3. (a) props 定義那一行的上一行寫逐行豁免 → 放行"
run_write packages/design-system/src/components/Select/select-fixture.tsx \
  "${FC_HEAD}${FC_A_BODY/MARK/// rich renderer for the selected value}"
expect_block "F-L4. (a) 同一段拿掉逐行豁免 → 擋,列出 props 定義那一行" "contract (a) renderer symmetry" "5:  tagRenderer?: (item: Item)"

FC_C_BODY='export const C = () => (
  MARK
  <TagArea tagAreaPaddingLeftPx={8} />
)'
run_write packages/design-system/src/components/Combobox/combobox-fixture.tsx \
  "${FC_HEAD}${FC_C_BODY/MARK/// @cell-metric-escape-allow: documented 8px for the legacy toolbar slot}"
expect_clean "F-L5. (c) 命中那一行的上一行寫逐行豁免 → 放行"
run_write packages/design-system/src/components/Combobox/combobox-fixture.tsx \
  "${FC_HEAD}${FC_C_BODY/MARK/// documented 8px for the legacy toolbar slot}"
expect_block "F-L6. (c) 同一段拿掉逐行豁免 → 擋" "contract (c) cell metric escape hatch" "5:  <TagArea tagAreaPaddingLeftPx={8} />"
run_write packages/design-system/src/components/Combobox/combobox-fixture.tsx \
  "${FC_HEAD}export const C = () => <TagArea tagAreaPaddingLeftPx={isEmpty ? undefined : 8} /> {/* @cell-metric-escape-allow: legacy toolbar slot */}"
expect_clean "F-L6a. (c) 條件式那一行同一行寫 JSX 註解豁免 → 放行(F-6 = 同一行沒有豁免 → 擋)"

FC_D_BODY='export const I = () => (
  MARK
  <input className="px-3 h-9" />
)'
run_write packages/design-system/src/components/Input/input-fixture.tsx \
  "${FC_HEAD}${FC_D_BODY/MARK/// @field-px-escape-allow: native control demo keeps the browser padding}"
expect_clean "F-L7. (d) 命中那一行的上一行寫逐行豁免 → 放行"
run_write packages/design-system/src/components/Input/input-fixture.tsx \
  "${FC_HEAD}${FC_D_BODY/MARK/// native control demo keeps the browser padding}"
expect_block "F-L8. (d) 同一段拿掉逐行豁免 → 擋" "contract (d) field-px" '5:  <input className="px-3 h-9" />'

run_write packages/design-system/src/components/Input/input-fixture.tsx "${FC_HEAD}export const I = () => (
  <div>
    {/* @field-px-escape-allow: native control demo keeps the browser padding */}
    <input className=\"px-3 h-9\" />
    <input style={{ paddingRight: '0.75rem' }} />
  </div>
)"
expect_block "F-L9. (d) 兩行只豁免一行 → 擋,列出沒豁免的那一行" "contract (d) field-px" "7:    <input style={{ paddingRight: '0.75rem' }} />"
expect_not_in_stderr "F-L9b. 已豁免的那一行不列" '6:    <input className="px-3 h-9" />'

run_write packages/design-system/src/components/Select/select-fixture.tsx \
  "${FC_HEAD}${FC_B_BODY/MARK/// @placeholder-vocabulary-allow:}"
expect_block "F-L10. (b) 標記冒號後沒寫理由 → 不算豁免、擋" "contract (b) placeholder vocabulary"

# 對照組:真的 combobox.tsx(帶著它的檔首豁免)原樣寫入必須放行;尾端加一行違反,(b)(d) 兩條都必須點名該行
REAL_COMBOBOX="$REPO_ROOT/packages/design-system/src/components/Combobox/combobox.tsx"
if [ -f "$REAL_COMBOBOX" ]; then
  run_write packages/design-system/src/components/Combobox/combobox.tsx "$(cat "$REAL_COMBOBOX")"
  if [ "$RC" -eq 0 ] && [ ! -s "$ERR_FILE" ]; then record_pass "F-9f. 真 combobox.tsx 原樣寫入 → 不擋(全樹既有命中 0 的抽樣)"
  else record_fail "F-9f. 真 combobox.tsx 原樣寫入 → 不擋" "got rc$RC"; fi
  run_write packages/design-system/src/components/Combobox/combobox.tsx "$(cat "$REAL_COMBOBOX")
export const Broken = () => <X emptyPlaceholder={x} className=\"px-3\" />"
  expect_block "F-9g. 同一支尾端加一行違反 → (b)(d) 都點名" "contract (b) placeholder vocabulary" "contract (d) field-px" "emptyPlaceholder={x}"
else
  record_fail "F-9f. 真 combobox.tsx 對照組" "missing $REAL_COMBOBOX"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo "--- S: Select All ordering(lib/_select_all_canonical.sh)---"
DT=packages/design-system/src/components/DataTable/data-table-fixture.tsx

run_write "$DT" 'const handleSelectAll = () => {
  setSelected([...selected, ...options.map(o => o.value)]);
};'
expect_block "S-1. handleSelectAll 沒用 applySelectAll → 擋" "Select All ordering SSOT drift" "handleSelectAll"

run_write "$DT" 'import { applySelectAll } from "@/design-system/lib/multi-select-ordering";
const handleSelectAll = () => {
  setSelected(applySelectAll(selected, allValues));
};'
expect_clean "S-2. handleSelectAll 用 applySelectAll → 放行"

run_write "$DT" '// @select-all-canonical-allow: cascading multi-tree case, custom ordering needed
const handleSelectAll = () => {
  setSelected([...selected, ...options.map(o => o.value)]);
};'
expect_clean "S-3. 上一行 @select-all-canonical-allow → 放行(S-1 = 同一段拿掉豁免)"

run_write src/explorations/foo.tsx 'const handleSelectAll = () => setSelected(allValues);'
expect_clean "S-4. design-system 以外 → 放行"

run_write packages/design-system/src/lib/multi-select-ordering.ts 'export const applySelectAll = (selected, all) => [...selected];
const handleSelectAll = () => 1;'
expect_clean "S-5. multi-select-ordering.ts 自己 → 放行"

run_write packages/design-system/src/components/Sidebar/sidebar-fixture.tsx '<button onClick={() => setSelected(all)}>全選</button>'
expect_block "S-6. 「全選」+ 事件屬性同一行 → 擋" "Select All ordering SSOT drift"

run_write packages/design-system/src/components/Filter/filter-fixture.tsx '<Checkbox onCheckAll={handler} />'
expect_block "S-7. onCheckAll → 擋" "Select All ordering SSOT drift"

# 搬進來時收窄的判法(對照:S-6 / S-1 是同一類寫法的擋面)
run_write packages/design-system/src/components/Input/input-fixture.anatomy.stories.tsx '<li>一般文字編輯鍵(方向鍵 / Backspace / 全選)由瀏覽器原生提供</li>'
expect_clean "S-7a. 說明文字裡的「全選」(沒有事件屬性)→ 放行"
run_write packages/design-system/src/components/SelectMenu/select-menu-fixture.tsx '// 多選 footer:<button onClick={toggle}>全選</button>
const label = "全選"'
expect_clean "S-7b. 整行註解裡的「全選」→ 放行"
run_write packages/design-system/src/components/SelectMenu/select-menu.spec.md 'footer 的 `handleSelectAll` 呼叫 applySelectAll'
expect_clean "S-7c. 規格 .md 不在範圍 → 放行"
run_write "$DT" 'if (selectAll === true) return null
const isAll = checkAll => checkAll'
expect_clean "S-7d. selectAll === / checkAll => 不是指定 handler → 放行"

# 只判新增行:既有命中不擋、列成 context;改到命中那一行才擋
DT_EXISTING=$(make_fixture "$DT" 'const toggleAll = () => setSelected(all)
<Button onClick={toggleAll}>全選</Button>
const footerLabel = "x"')
run "$DISPATCHER" "$(edit_payload "$DT_EXISTING" 'const footerLabel = "y"' 'const footerLabel = "x"')"
expect_context "S-8. 改別行 → 不擋,既有命中列成 context" "Select All ordering 既有命中" "2:"
run "$DISPATCHER" "$(edit_payload "$DT_EXISTING" '<Button onClick={toggleAll}>' '<Button onClick={toggleAll}>全選</Button>')"
expect_block "S-8a. 改到命中那一行 → 擋" "Select All ordering SSOT drift" "2:"
run "$DISPATCHER" "$(runner_edit_payload "$DT_EXISTING" '<Button onClick={toggleAll}>' '<Button onClick={toggleAll}>全選</Button>')"
expect_block "S-8b. 正式入口形狀(content + old_string)一樣擋" "Select All ordering SSOT drift"
DT_EXISTING=$(make_fixture "$DT" 'const toggleAll = () => setSelected(all)
// @select-all-canonical-allow: demo of the footer slot, values are not an ordered array
<Button onClick={toggleAll}>全選</Button>')
run "$DISPATCHER" "$(edit_payload "$DT_EXISTING" '<Button onClick={toggleAll}>' '<Button onClick={toggleAll}>全選</Button>')"
expect_clean "S-8c. 同一行上一行加豁免 → 放行、既有清單也不列"

# 檔案有呼叫 applySelectAll(SSOT 唯一消費端)→ 改它的 handleSelectAll 那一行不擋
SM=$(make_fixture packages/design-system/src/components/SelectMenu/select-menu-fixture.tsx 'const handleSelectAll = React.useCallback(() => {
  onValueChange?.(applySelectAll(existing, all))
}, [existing, all])')
run "$DISPATCHER" "$(edit_payload "$SM" 'React.useCallback(() => {' 'const handleSelectAll = React.useCallback(() => {')"
expect_clean "S-9. 檔案已呼叫 applySelectAll → 改 handler 宣告那行放行"

# ─────────────────────────────────────────────────────────────────────────────
echo "--- I: 真 helper 的量具壞掉 → 70 ---"
LIBLESS="$TMP_ROOT/libless"
mkdir -p "$LIBLESS/lib"
cp "$DISPATCHER" "$LIBLESS/post_edit_contract_dispatcher.sh"
cp "$HOOK_DIR/_log-fire.sh" "$LIBLESS/_log-fire.sh"
for helper in $HELPERS _hook_integrity.sh; do
  cp "$HOOK_DIR/lib/$helper" "$LIBLESS/lib/$helper"
done
LIBLESS_FILE=$(make_fixture "$DT" 'const handleSelectAll = () => setSelected(all)')
run "$LIBLESS/post_edit_contract_dispatcher.sh" "$(write_payload "$LIBLESS_FILE" 'const handleSelectAll = () => setSelected(all)')"
expect_integrity "I-1. 共用新增行判法(_added_lines.sh)不見 → 70,不讀成沒有新增行" "added-lines helper unavailable"

mkdir -p "$FIX/scripts/visual-audit-dir.mjs"
run "$DISPATCHER" "$(write_payload "$FIX/scripts/visual-audit-dir.mjs" "x")"
expect_integrity "I-2. 寫入後的路徑不是一般檔 → 70" "after-image is not a readable regular file"
expect_not_in_stderr "I-2b. 量具壞不冒充政策擋" "[P0 BLOCKER]"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf 'Failed:%b\n' "$FAILED_TESTS"
  exit 1
fi
exit 0

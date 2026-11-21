#!/bin/bash
# Tests for check_item_list_gap.sh —— FileItem 清單外層的 gap / 外框(file-item.spec.md「List wrapper canonical」)。
# 每條規則兩面:違規 → exit 2 + stderr 點名;合規 / 有理由的豁免 → exit 0 且完全靜默。
# 另有對照組:量具壞了(proposed state 壞、parser 讀不了)→ exit 70,不是「沒違規」。

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_item_list_gap.sh"
[ -f "$HOOK" ] || { echo "FATAL: hook not found"; exit 1; }
# TypeScript 從被管的專案解析;run-all.sh 已設成 repo 根,直接跑本檔時補上。
export GOVERNANCE_PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)}"

FIXTURE="$(mktemp -d)"
[ -n "$FIXTURE" ] && [ -d "$FIXTURE" ] || { echo "FATAL: mktemp -d failed"; exit 1; }
trap 'rm -rf "$FIXTURE"' EXIT

PASS=0
FAIL=0

# run <file_path> <tool> <content-or-new_string> [old_string]
run() {
  local fp="$1" tool="$2" body="$3" old="${4:-}" payload
  case "$tool" in
    Write) payload=$(jq -n --arg fp "$fp" --arg c "$body" \
      '{hook_event_name:"PreToolUse",tool_name:"Write",tool_input:{file_path:$fp,content:$c}}') ;;
    Edit) payload=$(jq -n --arg fp "$fp" --arg o "$old" --arg n "$body" \
      '{hook_event_name:"PreToolUse",tool_name:"Edit",tool_input:{file_path:$fp,old_string:$o,new_string:$n}}') ;;
  esac
  run_payload "$payload"
}

run_payload() {
  local out err
  out=$(mktemp); err=$(mktemp)
  printf '%s' "$1" | env -u GOVERNANCE_WRITE_STATE_TRUST bash "$HOOK" >"$out" 2>"$err"
  EXIT=$?
  STDOUT_TEXT=$(cat "$out"); STDERR_TEXT=$(cat "$err"); rm -f "$out" "$err"
}

# runner-v1:proposed-text-v1 交來的 after-image(raw content 不得勝出)
run_trusted() {
  local fp="$1" state_json="$2" payload out err
  payload=$(jq -n --arg fp "$fp" --argjson st "$state_json" \
    '{hook_event_name:"PreToolUse",tool_name:"Edit",tool_input:{file_path:$fp,content:"raw-native-content-must-not-win",governance_write_state:$st}}')
  out=$(mktemp); err=$(mktemp)
  printf '%s' "$payload" | GOVERNANCE_WRITE_STATE_TRUST=runner-v1 bash "$HOOK" >"$out" 2>"$err"
  EXIT=$?
  STDOUT_TEXT=$(cat "$out"); STDERR_TEXT=$(cat "$err"); rm -f "$out" "$err"
}

expect_block() {
  local name="$1" needle="$2"
  if [ "$EXIT" -eq 2 ] && [ -z "$STDOUT_TEXT" ] && printf '%s' "$STDERR_TEXT" | grep -qF -- "$needle"; then
    PASS=$((PASS+1)); echo "  PASS  $name"
  else
    FAIL=$((FAIL+1)); echo "  FAIL  $name (exit=$EXIT, want 2 + stderr 含「${needle}」)"
    printf '%s\n%s\n' "$STDOUT_TEXT" "$STDERR_TEXT" | sed 's/^/    /'
  fi
}

expect_pass() {
  local name="$1"
  if [ "$EXIT" -eq 0 ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
    PASS=$((PASS+1)); echo "  PASS  $name"
  else
    FAIL=$((FAIL+1)); echo "  FAIL  $name (exit=$EXIT, want 0 + silent)"
    printf '%s\n%s\n' "$STDOUT_TEXT" "$STDERR_TEXT" | sed 's/^/    /'
  fi
}

expect_integrity() {
  local name="$1"
  if [ "$EXIT" -eq 70 ] && printf '%s' "$STDERR_TEXT" | grep -q 'GOVERNANCE_INTEGRITY'; then
    PASS=$((PASS+1)); echo "  PASS  $name"
  else
    FAIL=$((FAIL+1)); echo "  FAIL  $name (exit=$EXIT, want 70 GOVERNANCE_INTEGRITY)"
    printf '%s\n%s\n' "$STDOUT_TEXT" "$STDERR_TEXT" | sed 's/^/    /'
  fi
}

P="$FIXTURE/apps/demo/src/Attachments.tsx"
mkdir -p "$(dirname "$P")"

list() { # list <wrapper className> <FileItem props>
  printf 'export const Attachments = ({ files }) => (\n  <div className="%s">\n    {files.map((f) => <FileItem key={f.id} %s name={f.name} />)}\n  </div>\n)\n' "$1" "$2"
}

echo "── rich + surface=form → gap-2"
run "$P" Write "$(list 'flex flex-col' 'mode="rich"')"
expect_block "rich 沒有 gap → 擋" 'gap-2(8px)'
run "$P" Write "$(list 'flex flex-col gap-1' 'mode="rich"')"
expect_block "rich 給 gap-1 → 擋(卡片要 8)" '現在 4px'
run "$P" Write "$(list 'flex flex-col gap-2' 'mode="rich"')"
expect_pass "rich gap-2 → 放行"
run "$P" Write "$(list 'space-y-2' 'mode="rich"')"
expect_pass "rich space-y-2(同為 8px)→ 放行"

echo "── compact(預設 mode)+ surface=form → gap-1"
run "$P" Write "$(list 'flex flex-col' '')"
expect_block "compact 沒有 gap → 擋" 'gap-1(4px)'
run "$P" Write "$(list 'flex flex-col gap-2' 'mode="compact"')"
expect_block "compact 給 gap-2 → 擋(file-item.spec.md compact 一律 gap-1)" '現在 8px'
run "$P" Write "$(list 'flex flex-col gap-1' '')"
expect_pass "compact gap-1 → 放行"

echo "── surface=upload-manager → gap-0"
run "$P" Write "$(list 'flex flex-col gap-2' 'surface="upload-manager" mode="rich"')"
expect_block "upload-manager 給 gap-2 → 擋" 'upload-manager 列間要 gap-0'
run "$P" Write "$(list 'flex flex-col gap-0 !px-0' 'surface="upload-manager" mode="rich"')"
expect_pass "upload-manager gap-0 → 放行"

echo "── 外層不加外框"
run "$P" Write "$(list 'flex flex-col gap-2 border rounded-lg overflow-hidden' 'mode="rich"')"
expect_block "外層 border rounded overflow-hidden → 擋" '外層加了外框 border rounded-lg overflow-hidden'
run "$P" Write "$(list 'flex flex-col gap-2 border-0 rounded-none' 'mode="rich"')"
expect_pass "border-0 / rounded-none 不是外框 → 放行"

echo "── 讀不出 mode / 混用"
run "$P" Write 'export const L = ({ files, mode }) => (
  <div className={cn("flex flex-col", mode === "rich" ? "gap-2" : "gap-1")}>
    {files.map((f) => <FileItem key={f.id} mode={mode} name={f.name} />)}
  </div>
)'
expect_pass "mode 讀不出 + 條件式 gap-2 / gap-1(file-upload.tsx 的寫法)→ 放行"
run "$P" Write 'export const L = ({ files, mode }) => (
  <div className="flex flex-col gap-3">
    {files.map((f) => <FileItem key={f.id} mode={mode} name={f.name} />)}
  </div>
)'
expect_block "mode 讀不出 + gap-3 → 擋(8 或 4 都不是)" '現在 12px'
run "$P" Write 'export const L = () => (
  <div className="flex flex-col gap-1">
    <FileItem mode="rich" name="a.pdf" />
    <FileItem mode="compact" name="b.pdf" />
  </div>
)'
expect_block "rich + compact 混在一起 → 取最保守 gap-2" 'gap-2(8px)'

echo "── 不判的形狀"
run "$P" Write 'export const L = () => <div className="flex flex-col"><FileItem name="a.pdf" /></div>'
expect_pass "只有一筆 → 不是清單"
run "$P" Write 'export const L = () => (
  <Stack>
    <FileItem name="a.pdf" />
    <FileItem name="b.pdf" />
  </Stack>
)'
expect_pass "外層是元件又沒給 className → 讀不到版面,不判"
run "$P" Write 'export const M = () => (
  <div className="flex flex-col">
    <MenuItem variant="rich" label="a" />
    <MenuItem variant="rich" label="b" />
  </div>
)'
expect_pass "MenuItem 不判(item-anatomy.spec.md:permanent transparent → 0 gap 合法)"
run "$FIXTURE/apps/demo/src/Attachments.test.tsx" Write "$(list 'flex flex-col' 'mode="rich"')"
expect_pass "*.test.tsx 跳過"
run "$FIXTURE/apps/demo/src/notes.md" Write "$(list 'flex flex-col' 'mode="rich"')"
expect_pass "非 .tsx 跳過"

echo "── stories 也判(M16 錨例就在 story)"
run "$FIXTURE/apps/demo/src/attachments.stories.tsx" Write "$(list 'flex flex-col border rounded-lg overflow-hidden' 'mode="rich"')"
expect_block "story 的 rich 清單外框 → 擋" '外層加了外框'

echo "── 豁免"
run "$P" Write 'export const L = ({ files }) => (
  <section>
    {/* @item-list-gap-allow: 原則頁示範「錯誤寫法」,畫面上標了 ❌ */}
    <div className="flex flex-col">
      {files.map((f) => <FileItem key={f.id} mode="rich" name={f.name} />)}
    </div>
  </section>
)'
expect_pass "上一行有理由的逐外層豁免 → 放行"
run "$P" Write 'export const L = ({ files }) => (
  <section>
    {/* @item-list-gap-allow: */}
    <div className="flex flex-col">
      {files.map((f) => <FileItem key={f.id} mode="rich" name={f.name} />)}
    </div>
  </section>
)'
expect_block "豁免沒寫理由 → 照擋" 'gap-2(8px)'
run "$P" Write 'export const L = ({ a, b }) => (
  <section>
    {/* @item-list-gap-allow: 只放行下一個外層 */}
    <div className="flex flex-col">
      {a.map((f) => <FileItem key={f.id} mode="rich" name={f.name} />)}
    </div>
    <div className="flex flex-col">
      {b.map((f) => <FileItem key={f.id} mode="rich" name={f.name} />)}
    </div>
  </section>
)'
expect_block "逐外層豁免不連帶放行另一個外層" '第 7 行'
run "$P" Write '// @item-list-gap-allow: 整檔都是錯誤示範
export const L = ({ files }) => (
  <div className="flex flex-col">
    {files.map((f) => <FileItem key={f.id} mode="rich" name={f.name} />)}
  </div>
)'
expect_pass "檔頭整檔豁免 → 放行"

echo "── 只擋這次新增的違規(既有的不卡編輯)"
list 'flex flex-col' 'mode="rich"' > "$P"
run "$P" Edit 'export const Attachments = ({ files, title }) => (' 'export const Attachments = ({ files }) => ('
expect_pass "檔裡既有違規、這次只改別處 → 放行"
run "$P" Edit '  <div className="flex flex-col border">' '  <div className="flex flex-col">'
expect_block "這次把既有外層改成另一種違規 → 擋" '外層加了外框 border'
run "$P" Edit 'x' 'string-that-is-not-in-the-file'
expect_pass "old_string 不在檔裡(這筆編輯本身寫不進去)→ 不判"
list 'flex flex-col gap-2' 'mode="rich"' > "$P"
run "$P" Edit '  <div className="flex flex-col">' '  <div className="flex flex-col gap-2">'
expect_block "Edit 把合規外層的 gap 拿掉 → 擋" 'gap-2(8px)'

echo "── runner-v1(proposed-text-v1)"
REL="apps/demo/src/Attachments.tsx"
BAD=$(list 'flex flex-col' 'mode="rich"')
GOOD=$(list 'flex flex-col gap-2' 'mode="rich"')
printf '%s\n' "$GOOD" > "$P"
run_trusted "$P" "$(jq -n --arg p "$REL" --arg c "$BAD" '{schemaVersion:1,path:$p,kind:"text",content:$c}')"
expect_block "runner 交來的 after-image 違規 → 擋" 'gap-2(8px)'
run_trusted "$P" "$(jq -n --arg p "$REL" --arg c "$GOOD" '{schemaVersion:1,path:$p,kind:"text",content:$c}')"
expect_pass "runner 交來的 after-image 合規 → 放行"
run_trusted "$P" "$(jq -n --arg p "$REL" '{schemaVersion:1,path:$p,kind:"deleted"}')"
expect_pass "刪檔 → 不判"

echo "── 對照組:量具壞了 ≠ 沒違規"
run_trusted "$P" '{"schemaVersion":"1","path":false,"kind":"text","content":null}'
expect_integrity "proposed state 壞了 → 70"
run_trusted "$P" "$(jq -n --arg c "$BAD" '{schemaVersion:1,path:"apps/demo/src/Other.tsx",kind:"text",content:$c}')"
expect_integrity "proposed state 路徑對不上 → 70"
run "$P" Write 'export const L = () => <div className="flex flex-col"><FileItem name="a" /><FileItem name="b" /'
expect_integrity "寫完的檔 parser 讀不了 → 70"
out=$(mktemp); err=$(mktemp)
printf '%s' "$(jq -n --arg fp "$P" --arg c "$BAD" '{hook_event_name:"PreToolUse",tool_name:"Write",tool_input:{file_path:$fp,content:$c}}')" \
  | env -u GOVERNANCE_WRITE_STATE_TRUST GOVERNANCE_PROJECT_DIR="$FIXTURE" bash "$HOOK" >"$out" 2>"$err"
EXIT=$?; STDOUT_TEXT=$(cat "$out"); STDERR_TEXT=$(cat "$err"); rm -f "$out" "$err"
expect_integrity "專案裡沒有 typescript → 70(不默默放行)"
out=$(mktemp); err=$(mktemp)
printf '%s' "$(jq -n --arg fp "$P" '{hook_event_name:"PreToolUse",tool_name:"Write",tool_input:{file_path:$fp,content:"export const X = () => <div>x</div>"}}')" \
  | env -u GOVERNANCE_WRITE_STATE_TRUST GOVERNANCE_PROJECT_DIR="$FIXTURE" bash "$HOOK" >"$out" 2>"$err"
EXIT=$?; STDOUT_TEXT=$(cat "$out"); STDERR_TEXT=$(cat "$err"); rm -f "$out" "$err"
expect_pass "沒有 FileItem 的檔不需要 parser(fork 乾淨樣本)→ 放行"
run_payload "$(jq -n --arg fp "$P" --arg c "$BAD" '{hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:$fp,content:$c}}')"
expect_pass "PostToolUse 不判(只註冊在 PreToolUse)"

echo ""
echo "════ Results: $PASS PASS, $FAIL FAIL ════"
[ "$FAIL" -gt 0 ] && exit 1
exit 0

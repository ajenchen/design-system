#!/bin/bash
# check_item_list_gap.sh — FileItem 清單外層的間距與外框(PreToolUse Edit/Write/MultiEdit,會擋)
#
# 規則(SSOT,本檔不另訂值):
#   - components/FileItem/file-item.spec.md「List wrapper canonical」gap 表:
#       rich + surface=form(卡片)→ gap-2(8px);compact + surface=form → gap-1(4px);surface=upload-manager → gap-0
#     與「List wrapper 本身不加視覺」:外層不加 border / rounded-* / overflow-hidden(user 2026-04-22 直指)。
#   - 原理:patterns/element-anatomy/item-anatomy.spec.md「連續 item 貼邊合法性」(同類 standalone card/pill → 必 gap;
#     混合 → 取最保守);本 hook 是 meta-patterns M16 的寫入當下機械面。
#   - 卡片列要不要有間距、多少:tokens/layoutSpace/layoutSpace.spec.md 規則 3「標題區 → 內容」第 3 題(2026-11-17 r12,
#     user 採納 AI 寫的卡片三種分法)—— 元件裡的一串小卡由元件自己定,FileItem 的值就是上面那張表。
#
# 量法(2026-11-22 WP-USER 起;之前是「寫入內容裡有 2 個以上 <FileItem 而且整段沒有任何 gap-N」就只提醒):
#   - 量「這次寫完的樣子」:正式入口(scripts/run-provider-hook.mjs)以 inputContract proposed-text-v1 交來
#     runner 算好的完整檔(GOVERNANCE_WRITE_STATE_TRUST=runner-v1);直接呼叫時 Write 用 content、
#     Edit / MultiEdit 把 old_string → new_string 套在磁碟原檔上(套不上 = 這筆編輯本身寫不進去 → 不判)。
#   - 用 TypeScript AST(lib/tsx-governance-analysis.mjs item-list-gap)找每個 FileItem 清單的外層:
#     FileItem 往上第一個 JSX 元素,中間只穿過 `{…}`、條件式、`&&`、Fragment、`.map` callback;
#     外層底下 2 筆以上(`.map` 算多筆)才算清單。FileItem 寫在別的函式裡再被呼叫(例 file-upload.tsx 的
#     renderFileRow)→ 認不出外層、不判(量不到,不是合規)。
#   - 每個外層照它的 FileItem 判:className 讀得出的 gap 值要含規定值(mode 讀不出 → 8 或 4 都接受;
#     surface 讀不出 → 只判外框);外層 className 讀不出、或是元件又沒給 className → 不判。
#   - 只擋「這次寫入新增的違規」:寫完的檔與磁碟現況各量一次,寫完多出來的才擋(同族 PreToolUse 只看
#     這次寫進去的東西,不因既有程式卡住編輯)。2026-11-22 全樹重放:27 支含 FileItem 字樣的 .tsx(含 stories)
#     認出 17 個清單外層、0 筆違規。
#   - 範圍:所有 .tsx(含 *.stories.tsx —— M16 的錨例 file-upload.stories.tsx 就在 story 裡;只跳 *.test.tsx)。
#     2026-11-22 前跳過 stories,而且 production 的清單都是 `.map` 只寫一次 <FileItem,所以實際上從沒出聲。
#   - MenuItem 不判:item-anatomy.spec.md 對照表 MenuItem 是 permanent transparent → 0 gap 合法;
#     舊版 regex 的 `<MenuItem variant="rich">` 全 DS 不存在。
#
# 豁免:外層開頭那一行或緊接上一行的註解 `@item-list-gap-allow: <理由>`(只放行那一個外層);
#       檔頭 leading line comment `// @item-list-gap-allow: <理由>` = 整檔。冒號後要有理由。
#
# Exit:0 放行;2 擋(stderr 說明);70 量具本身壞了(parser / proposed state / 輸入)—— 不等於「沒違規」。
# 依據:governance/memory/feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md(SSOT 必擋 + 逐行豁免;
#       偵測不準就換確定性的量法)—— D4-02。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: item-list-gap hook integrity helper unavailable\n' >&2
  exit 70
}
source "$(dirname "$0")/lib/_provider_paths.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: item-list-gap project resolver unavailable\n' >&2
  exit 70
}

set -uo pipefail

governance_hook_load_input
governance_hook_require_commands jq python3 node

TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""') \
  || governance_hook_integrity_fail 'item-list-gap tool extraction failed'
EVENT=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // ""') \
  || governance_hook_integrity_fail 'item-list-gap event extraction failed'
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""') \
  || governance_hook_integrity_fail 'item-list-gap file path extraction failed'

[ -n "$EVENT" ] && [ "$EVENT" != "PreToolUse" ] && exit 0
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
case "$FILE_PATH" in *.tsx) ;; *) exit 0 ;; esac
case "$FILE_PATH" in *.test.tsx) exit 0 ;; esac

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/check-item-list-gap.XXXXXX") \
  || governance_hook_integrity_fail 'item-list-gap scratch directory unavailable'
[ -n "$WORK_DIR" ] && [ -d "$WORK_DIR" ] \
  || governance_hook_integrity_fail 'item-list-gap scratch directory unavailable'
trap 'rm -rf "$WORK_DIR"' EXIT
AFTER_FILE="$WORK_DIR/after.tsx"

# 寫完的樣子(after-image)。印 text / deleted / unknown;exit 3 = runner-v1 的 proposed state 壞了、4 = 路徑對不上。
_ITEM_LIST_GAP_AFTER_IMAGE_PY='
import json, os, sys

disk, out, trust = sys.argv[1], sys.argv[2], sys.argv[3]
event = json.loads(sys.stdin.buffer.read())
tool = event.get("tool_name") or ""
tool_input = event.get("tool_input") or {}

def emit(text):
    with open(out, "wb") as handle:
        handle.write(text.encode("utf-8", "surrogatepass"))
    print("text")
    sys.exit(0)

if trust == "runner-v1":
    state = tool_input.get("governance_write_state")
    if not isinstance(state, dict) or state.get("schemaVersion") != 1:
        sys.exit(3)
    path = state.get("path")
    if not isinstance(path, str) or not path:
        sys.exit(3)
    if not (disk == path or disk.endswith("/" + path)):
        sys.exit(4)
    if state.get("kind") == "deleted" and "content" not in state:
        print("deleted")
        sys.exit(0)
    if state.get("kind") == "text" and isinstance(state.get("content"), str):
        emit(state["content"])
    sys.exit(3)

if tool == "Write" and isinstance(tool_input.get("content"), str):
    emit(tool_input["content"])

pairs = None
if tool == "MultiEdit" and isinstance(tool_input.get("edits"), list) and tool_input["edits"]:
    pairs = [(edit.get("old_string"), edit.get("new_string"), bool(edit.get("replace_all")))
             for edit in tool_input["edits"] if isinstance(edit, dict)]
elif tool == "Edit":
    pairs = [(tool_input.get("old_string"), tool_input.get("new_string"), bool(tool_input.get("replace_all")))]
if not pairs:
    print("unknown")
    sys.exit(0)

text = None
if os.path.isfile(disk):
    with open(disk, "rb") as handle:
        text = handle.read().decode("utf-8", "replace")
for old, new, replace_all in pairs:
    if not isinstance(old, str) or not isinstance(new, str):
        print("unknown")
        sys.exit(0)
    if text is None:
        if old == "":
            text = new
            continue
        print("unknown")
        sys.exit(0)
    if old == "" or old not in text:
        print("unknown")
        sys.exit(0)
    text = text.replace(old, new) if replace_all else text.replace(old, new, 1)
if text is None:
    print("unknown")
    sys.exit(0)
emit(text)
'

AFTER_KIND=$(printf '%s' "$INPUT" \
  | python3 -I -c "$_ITEM_LIST_GAP_AFTER_IMAGE_PY" "$FILE_PATH" "$AFTER_FILE" "${GOVERNANCE_WRITE_STATE_TRUST:-}")
RC=$?
case "$RC" in
  0) ;;
  4) governance_hook_integrity_fail 'item-list-gap: trusted proposed write state 與 hook target 不相符' ;;
  *) governance_hook_integrity_fail 'item-list-gap: trusted proposed write state 缺失或 malformed' ;;
esac
case "$AFTER_KIND" in
  text) ;;
  deleted|unknown) exit 0 ;;
  *) governance_hook_integrity_fail 'item-list-gap: after-image reader output malformed' ;;
esac

# 寫完的檔沒有 FileItem → 沒有可判的清單(也不需要 parser)
grep -q 'FileItem' "$AFTER_FILE" || exit 0

NODE_PROJECT_ROOT=$(governance_project_root) \
  || governance_hook_integrity_fail 'item-list-gap: 無法定位 TypeScript parser 的 project root'
HOOK_DIR=$(cd "$(dirname "$0")" 2>/dev/null && pwd -P) \
  || governance_hook_integrity_fail 'item-list-gap: hook 目錄讀不到'
ANALYZER="$HOOK_DIR/lib/tsx-governance-analysis.mjs"
[ -f "$ANALYZER" ] || governance_hook_integrity_fail 'item-list-gap: lib/tsx-governance-analysis.mjs 不存在'

# TypeScript 從被管的專案解析(consumer 用自己鎖的版本);輸入檔在 cd 之前就接上 stdin,相對路徑照樣讀得到。
analyze() {
  (cd "$NODE_PROJECT_ROOT" && node -- "$ANALYZER" item-list-gap 2>/dev/null) < "$1"
}

AFTER_OUT=$(analyze "$AFTER_FILE") \
  || governance_hook_integrity_fail 'item-list-gap: TypeScript TSX parser unavailable or proposed content malformed'
[ "$AFTER_OUT" = 'ESCAPE' ] && exit 0
AFTER_V=$(printf '%s\n' "$AFTER_OUT" | grep '^V	' || true)
[ -z "$AFTER_V" ] && exit 0

# 磁碟現況(寫入前)量一次:這次寫入之前就在的違規不算這次的(既有違規 → 碰到那個外層時才會變成新的)。
BEFORE_V=''
if [ -f "$FILE_PATH" ] && grep -q 'FileItem' "$FILE_PATH"; then
  if BEFORE_OUT=$(analyze "$FILE_PATH"); then
    [ "$BEFORE_OUT" != 'ESCAPE' ] && BEFORE_V=$(printf '%s\n' "$BEFORE_OUT" | grep '^V	' || true)
  fi
fi
printf '%s\n' "$AFTER_V" > "$WORK_DIR/after.v"
printf '%s\n' "$BEFORE_V" > "$WORK_DIR/before.v"

NEW_V=$(python3 -I -c '
import sys
from collections import Counter
def keyed(path):
    rows = [line.rstrip("\n") for line in open(path, encoding="utf-8") if line.startswith("V\t")]
    return rows, Counter(row.split("\t", 5)[-1] for row in rows)
after, _ = keyed(sys.argv[1])
_, before = keyed(sys.argv[2])
for row in after:
    key = row.split("\t", 5)[-1]
    if before[key] > 0:
        before[key] -= 1
        continue
    print(row)
' "$WORK_DIR/after.v" "$WORK_DIR/before.v") \
  || governance_hook_integrity_fail 'item-list-gap: violation diff failed'
[ -z "$NEW_V" ] && exit 0

{
  printf '🚨 FileItem 清單外層違規(item-list-gap;file-item.spec.md「List wrapper canonical」):\n'
  printf '   File: %s\n' "$FILE_PATH"
  printf '%s\n' "$NEW_V" | while IFS='	' read -r _ line tag kind detail _key; do
    case "$kind" in
      frame) printf '   第 %s 行 <%s>:外層加了外框 %s —— 外層只負責排列 + gap,不加 border / rounded / overflow-hidden(rich 自帶卡片,再加一層 = 雙重卡片、邊框相黏)\n' "$line" "$tag" "$detail" ;;
      gap) printf '   第 %s 行 <%s>:列間距 %s\n' "$line" "$tag" "$detail" ;;
      *) printf '   第 %s 行 <%s>:%s %s\n' "$line" "$tag" "$kind" "$detail" ;;
    esac
  done
  printf '\n  規定(SSOT 只住 file-item.spec.md「List wrapper canonical」):rich + surface=form → gap-2;compact + surface=form → gap-1;surface=upload-manager → gap-0。\n'
  printf '  原理:item-anatomy.spec.md「連續 item 貼邊合法性」(同類 standalone card/pill → 必 gap;混合 → 取最保守)。\n'
  printf '  真的例外:外層開頭那一行或上一行加 `@item-list-gap-allow: <理由>` 註解。\n'
} >&2
exit 2

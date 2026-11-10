#!/bin/bash
set -uo pipefail
# Header canonical W3 Token alignment enforcement(per header-canonical.spec.md W3):
#   --tab-height-lg(分頁的值)與 --chrome-header-height(共用刻度)三個段落(:root / 大密度 / 鎖回一般密度)必像素相等。
#   兩 token scope 不同,不該 CSS alias(綁死兩個不同 scope)— 改用 assert: parse 兩邊住處的 md/lg 值對等。
#
# 兩顆各住哪個檔 = 分類表 packages/design-system/src/tokens/token-registry.json 的 home(最長吻合的那一列),
# 本檔不寫死任何住處(2026-11-11 token 遷移第二階段第一批:分頁高從 tokens/uiSize/uiSize.css 搬到
# components/Tabs/tabs.css,標頭高留在 uiSize.css —— 寫死單一檔的舊版在搬家後既讀不到值、改 tabs.css 也不會觸發)。
#
# PreToolUse(Edit / Write)hook —— 編輯「任一顆的住處」、分類表本身,或 `src/globals.css` 時 assert 兩值仍相等。
# 動一方未同步 = BLOCKER(exit 2);讀不到 / 住處不明 / 宣告不完整 = GOVERNANCE_INTEGRITY(exit 70,fail closed)。
#
# 對齊 M31 codex 比稿 Step 5「保留 duplicated literals + audit hook assert equality」decision。

source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

fail_integrity() {
  printf '🚨 GOVERNANCE_INTEGRITY: TAB_LG vs CHROME_HEADER_HEIGHT ENFORCEMENT FAILURE: %s\n' "$1" >&2
  exit 70
}

INPUT=$(cat) || fail_integrity '無法讀取 hook input'
if ! printf '%s' "$INPUT" | jq -e '
  type == "object"
  and (.tool_name | type == "string")
  and (.tool_input | type == "object")
  and (.tool_input.file_path | type == "string")
' >/dev/null 2>&1; then
  fail_integrity 'hook input 不是有效的 provider-neutral event'
fi

TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name')
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

# 只對設計系統原始碼裡的 .css、分類表本身與舊入口 src/globals.css 起作用(住處一定是 DS 的樣式檔);
# 其餘路徑在讀分類表之前就安靜退出 —— 不增加每次編輯的成本,也不把觸發面擴到 DS 以外的樣式檔。
case "$FILE_PATH" in
  packages/design-system/src/*.css|*/packages/design-system/src/*.css) ;;
  packages/design-system/src/tokens/token-registry.json|*/packages/design-system/src/tokens/token-registry.json) ;;
  src/globals.css|*/src/globals.css) ;;
  *) exit 0 ;;
esac

# Provider-neutral runner 會供應已驗證的 GOVERNANCE_PROJECT_DIR。直接執行 canonical
# source 時以 Git root 回退；只有無 Git metadata 的獨立測試沙箱才使用 legacy 投影深度。
# 不可只從 $0 固定上溯：同一 SSOT 在 ds-canonical 與 provider projection 的深度不同。
if [ -n "${GOVERNANCE_PROJECT_DIR:-}" ]; then
  PROJECT_ROOT="$(cd "$GOVERNANCE_PROJECT_DIR" 2>/dev/null && pwd -P)" || {
    fail_integrity 'GOVERNANCE_PROJECT_DIR 無法解析'
  }
elif PROJECT_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null)" \
  && [ -n "$PROJECT_ROOT" ]; then
  PROJECT_ROOT="$(cd "$PROJECT_ROOT" 2>/dev/null && pwd -P)" || {
    fail_integrity 'Git root 無法解析'
  }
else
  PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." 2>/dev/null && pwd -P)" || {
    fail_integrity 'project root 無法解析'
  }
fi

DS_SRC_REL='packages/design-system/src'
REGISTRY_REL="$DS_SRC_REL/tokens/token-registry.json"

path_matches() {
  local actual="$1"
  local expected="$2"
  [[ "$actual" == "$expected" || "$actual" == */"$expected" ]]
}

read_regular_file() {
  local rel="$1"
  local abs="$PROJECT_ROOT/$rel"
  if [ ! -f "$abs" ] || [ -L "$abs" ] || [ ! -r "$abs" ]; then
    fail_integrity "canonical token source 缺失、不可讀或不是一般非 symlink 檔案: $rel"
  fi
  cat -- "$abs" || fail_integrity "canonical token source 讀取失敗: $rel"
}

# runner-v1 是唯一可把 in-memory proposed state 標成可信的 transport。被改的那個檔絕不可讀 pre-edit disk;
# 其他檔沒被這次 mutation 改動,安全讀 disk。
STATE_PATH=''
STATE_CONTENT=''
if [ "${GOVERNANCE_WRITE_STATE_TRUST:-}" = 'runner-v1' ]; then
  if ! printf '%s' "$INPUT" | jq -e '
    .tool_input.governance_write_state as $state
    | ($state | type == "object")
      and ($state.schemaVersion == 1)
      and ($state.path | type == "string" and length > 0)
      and (
        ($state.kind == "text" and ($state.content | type == "string"))
        or ($state.kind == "deleted" and ($state | has("content") | not))
      )
  ' >/dev/null 2>&1; then
    fail_integrity 'trusted proposed write state 缺失或 malformed'
  fi
  STATE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.governance_write_state.path')
  STATE_KIND=$(printf '%s' "$INPUT" | jq -r '.tool_input.governance_write_state.kind')
  if ! path_matches "$FILE_PATH" "$STATE_PATH"; then
    fail_integrity 'trusted proposed write state 與 hook target 不相符'
  fi
  if [ "$STATE_KIND" = 'text' ]; then
    STATE_CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input.governance_write_state.content')
  else
    STATE_CONTENT='__DELETED__'
  fi
fi

# 取某個 repo 相對路徑「這次編輯之後」的內容:正在被改的檔讀 proposed state,其餘讀 disk。
content_of() {
  local rel="$1"
  if [ -n "$STATE_PATH" ] && path_matches "$STATE_PATH" "$rel"; then
    [ "$STATE_CONTENT" != '__DELETED__' ] \
      || fail_integrity "canonical token source 不可由 proposed mutation 刪除: $rel"
    printf '%s' "$STATE_CONTENT"
  else
    read_regular_file "$rel"
  fi
}

REGISTRY_CONTENT=$(content_of "$REGISTRY_REL") || exit $?

# 分類表最長吻合:match 以 - 或 _ 結尾是「名字開頭」,其餘是完整名字(token-registry.json $comment)。
home_of() {
  local name="$1"
  printf '%s' "$REGISTRY_CONTENT" | jq -er --arg n "$name" '
    [ .rows[]
      | select(type == "object" and (.match | type == "string"))
      | . as $r
      | select(
          ($r.match == $n)
          or (($r.match | test("[-_]$")) and ($n | startswith($r.match)))
        )
    ]
    | sort_by(.match | length)
    | if length == 0 then error("no row")
      else (last as $best
        | if ([.[] | select((.match | length) == ($best.match | length))] | length) != 1 then error("tie")
          elif ($best.home | type) != "string" then error("home not a single path")
          else $best.home end)
      end
  ' 2>/dev/null
}

TAB_HOME=$(home_of '--tab-height-lg') \
  || fail_integrity '分類表讀不到 --tab-height-lg 的單一住處(沒有對到的列、兩列一樣長,或 home 不是單一路徑)'
CHROME_HOME=$(home_of '--chrome-header-height') \
  || fail_integrity '分類表讀不到 --chrome-header-height 的單一住處(沒有對到的列、兩列一樣長,或 home 不是單一路徑)'
case "$TAB_HOME$CHROME_HOME" in
  *..*|/*) fail_integrity '分類表的 home 不得含 .. 或絕對路徑' ;;
esac
TAB_REL="$DS_SRC_REL/$TAB_HOME"
CHROME_REL="$DS_SRC_REL/$CHROME_HOME"

# 觸發條件:這次改的是兩顆的住處之一、分類表,或 src/globals.css(舊入口,只是 trigger,不讀)。
if ! path_matches "$FILE_PATH" "$TAB_REL" \
  && ! path_matches "$FILE_PATH" "$CHROME_REL" \
  && ! path_matches "$FILE_PATH" "$REGISTRY_REL" \
  && ! path_matches "$FILE_PATH" 'src/globals.css'; then
  exit 0
fi

# CSS comments 不具 runtime declarations；parser 必先移除完整 block comments，且
# unclosed comment 要 fail closed。否則把全部 token blocks 包進 `/* ... */` 仍會
# 被純 regex 誤算為有效。
strip_comments() {
  awk '
    BEGIN { in_comment = 0 }
    {
      rest = $0
      output = ""
      while (length(rest) > 0) {
        if (in_comment) {
          comment_end = index(rest, "*/")
          if (comment_end == 0) {
            rest = ""
          } else {
            rest = substr(rest, comment_end + 2)
            in_comment = 0
          }
        } else {
          comment_start = index(rest, "/*")
          if (comment_start == 0) {
            output = output rest
            rest = ""
          } else {
            output = output substr(rest, 1, comment_start - 1)
            rest = substr(rest, comment_start + 2)
            in_comment = 1
          }
        }
      }
      print output
    }
    END {
      if (in_comment) exit 2
    }
  '
}

# 只接受三個既定 scope，且 declaration 必依 root → lg override → md-reset
# 順序各出現一次。這同時拒絕寬鬆 `[0-9.]+` 曾接受的 `.5`、`1..2` 等值。
# 先做全文 occurrence guard，避免把同一行 inline declaration 或額外 override
# 藏在 canonical line parser 看不到的位置。
# 輸出三行 value(root / lg / md-reset 順序);任何不合格 → fail_integrity。
extract_values() {
  local code="$1" token="$2"
  local count records
  count=$(
    printf '%s\n' "$code" | awk -v t="$token" '
      {
        rest = $0
        pat = "--" t "[[:space:]]*:"
        while (match(rest, pat)) {
          count += 1
          rest = substr(rest, RSTART + RLENGTH)
        }
      }
      END { print count + 0 }
    '
  ) || fail_integrity "無法計數 --$token declarations"
  [ "$count" = '3' ] || fail_integrity 'canonical token extraction 不完整、重複或 scope/order 非預期'
  records=$(
    printf '%s\n' "$code" | awk -v t="$token" '
      BEGIN { context = ""; pending = "" }
      /^[[:space:]]*:root[[:space:]]*\{/ { context = "root"; next }
      /^[[:space:]]*\[data-ui-size="lg"\][[:space:]]*,[[:space:]]*$/ { pending = "lg"; next }
      pending == "lg" && /^[[:space:]]*\[data-density="lg"\][[:space:]]*\{/ { context = "lg"; pending = ""; next }
      /^[[:space:]]*\[data-ui-size="md"\][[:space:]]*,[[:space:]]*$/ { pending = "md-reset"; next }
      pending == "md-reset" && /^[[:space:]]*\[data-density="md"\][[:space:]]*\{/ { context = "md-reset"; pending = ""; next }
      /^[[:space:]]*}/ { context = ""; pending = ""; next }
      {
        line = $0
        if (line !~ ("^[[:space:]]*--" t "[[:space:]]*:")) next
        if (context == "" || line !~ ("^[[:space:]]*--" t ":[[:space:]]*(0|[1-9][0-9]*)(\\.[0-9]+)?rem[[:space:]]*;[[:space:]]*$")) {
          print "INVALID"
          next
        }
        value = line
        sub(/^[^:]*:[[:space:]]*/, "", value)
        sub(/rem[[:space:]]*;.*/, "", value)
        print context "|" value
      }
    '
  )
  local expected=('root' 'lg' 'md-reset') i=0 record
  local lines=()
  while IFS= read -r record; do
    [ -n "$record" ] && lines+=("$record")
  done <<<"$records"
  [ "${#lines[@]}" -eq 3 ] || fail_integrity 'canonical token extraction 不完整、重複或 scope/order 非預期'
  for i in 0 1 2; do
    record="${lines[$i]}"
    if [ "$record" = 'INVALID' ] || [ "${record%%|*}" != "${expected[$i]}" ]; then
      fail_integrity 'canonical token declaration 的 scope、順序或 decimal rem syntax 非預期'
    fi
    printf '%s\n' "${record#*|}"
  done
}

code_of() {
  local rel="$1" raw code
  raw=$(content_of "$rel") || exit $?
  if ! code=$(printf '%s\n' "$raw" | strip_comments); then
    fail_integrity "canonical token source 含未閉合 CSS block comment: $rel"
  fi
  printf '%s' "$code"
}

# 每一步都在 command substitution 子行程裡跑:失敗時子行程已把 GOVERNANCE_INTEGRITY 印到 stderr,
# 這裡用 `|| exit $?` 把它的 exit code 原樣傳出(bash 3.2 的子行程不繼承 errexit,不能只靠 set -e)。
TAB_CODE=$(code_of "$TAB_REL") || exit $?
CHROME_CODE=$(code_of "$CHROME_REL") || exit $?
TAB_OUT=$(extract_values "$TAB_CODE" 'tab-height-lg') || exit $?
CHROME_OUT=$(extract_values "$CHROME_CODE" 'chrome-header-height') || exit $?
# 值只會是嚴格的十進位數字(上面已驗),以換行切開安全
TAB_VALUES=($TAB_OUT)
CHROME_VALUES=($CHROME_OUT)
if [ "${#TAB_VALUES[@]}" -ne 3 ] || [ "${#CHROME_VALUES[@]}" -ne 3 ]; then
  fail_integrity 'canonical token extraction 不完整、重複或 scope/order 非預期'
fi

ERRORS=()
CONTEXTS=('root' 'lg' 'md-reset')
normalize_decimal() {
  local value="$1"
  if [[ "$value" == *.* ]]; then
    while [[ "$value" == *0 ]]; do value="${value%0}"; done
    value="${value%.}"
  fi
  printf '%s' "$value"
}
for i in 0 1 2; do
  tab_value="${TAB_VALUES[$i]}"
  chrome_value="${CHROME_VALUES[$i]}"
  if [ "$(normalize_decimal "$tab_value")" != "$(normalize_decimal "$chrome_value")" ]; then
    ERRORS+=("${CONTEXTS[$i]}: --tab-height-lg=$tab_value rem ≠ --chrome-header-height=$chrome_value rem")
  fi
done

if [ ${#ERRORS[@]} -gt 0 ]; then
  printf '🚨 TAB_LG vs CHROME_HEADER_HEIGHT EQUAL BLOCKER(header-canonical.spec.md W3):\n' >&2
  for E in "${ERRORS[@]}"; do
    printf '   • %s\n' "$E" >&2
  done
  printf '\n  動一方必同步另一方(三個 scope 的兩 token 像素相等是 SSOT linkage 鐵證)\n' >&2
  printf '  SSOT: packages/design-system/src/patterns/header-canonical/header-canonical.spec.md W3\n' >&2
  printf '  住處(分類表 token-registry.json):--tab-height-lg → %s / --chrome-header-height → %s\n' "$TAB_REL" "$CHROME_REL" >&2
  exit 2
fi

exit 0

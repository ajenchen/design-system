#!/bin/bash
set -uo pipefail
# Header canonical W3 Token alignment enforcement(per header-canonical.spec.md W3):
#   --tab-height-lg 與 --chrome-header-height(uiSize.css)必像素相等。
#   兩 token scope 不同(uiSize 是 component-size reset / chrome-header-height 是 app-density)
#   不該 CSS alias(綁死兩個不同 scope)— 改用 assert: parse 兩檔 md/lg 值對等。
#
# PreToolUse(Edit / Write)hook —— 編輯 `packages/design-system/src/tokens/uiSize/uiSize.css` 或
# `src/globals.css` 時 assert 兩值仍相等。動一方未同步 = BLOCKER。
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

case "$FILE_PATH" in
  packages/design-system/src/tokens/uiSize/uiSize.css|*/packages/design-system/src/tokens/uiSize/uiSize.css|src/globals.css|*/src/globals.css) ;;
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

UISIZE_REL='packages/design-system/src/tokens/uiSize/uiSize.css'
UISIZE_CSS="$PROJECT_ROOT/$UISIZE_REL"
TOKEN_CONTENT=''

path_matches() {
  local actual="$1"
  local expected="$2"
  [[ "$actual" == "$expected" || "$actual" == */"$expected" ]]
}

read_canonical_tokens() {
  if [ ! -f "$UISIZE_CSS" ] || [ -L "$UISIZE_CSS" ] || [ ! -r "$UISIZE_CSS" ]; then
    fail_integrity 'canonical token source 缺失、不可讀或不是一般非 symlink 檔案'
  fi
  TOKEN_CONTENT=$(cat -- "$UISIZE_CSS") \
    || fail_integrity 'canonical token source 讀取失敗'
}

# runner-v1 是唯一可把 in-memory proposed state 標成可信的 transport。uiSize
# 自身被改時絕不可讀 pre-edit disk；globals.css 只是 trigger path，token SSOT 沒被
# 這次 mutation 改動，故仍安全讀 canonical uiSize.css。
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
  if path_matches "$STATE_PATH" "$UISIZE_REL"; then
    [ "$STATE_KIND" = 'text' ] \
      || fail_integrity 'canonical token source 不可由 proposed mutation 刪除'
    TOKEN_CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input.governance_write_state.content')
  else
    read_canonical_tokens
  fi
else
  read_canonical_tokens
fi

# CSS comments 不具 runtime declarations；parser 必先移除完整 block comments，且
# unclosed comment 要 fail closed。否則把全部 token blocks 包進 `/* ... */` 仍會
# 被純 regex 誤算為有效。
if ! TOKEN_CODE=$(
  printf '%s\n' "$TOKEN_CONTENT" | awk '
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
); then
  fail_integrity 'canonical token source 含未閉合 CSS block comment'
fi

# 只接受三個既定 scope，且 declaration 必依 root → lg override → md-reset
# 順序各出現一次。這同時拒絕寬鬆 `[0-9.]+` 曾接受的 `.5`、`1..2` 等值。
# 先做全文 occurrence guard，避免把同一行 inline declaration 或額外 override
# 藏在 canonical line parser 看不到的位置。
TAB_DECLARATION_COUNT=$(
  printf '%s\n' "$TOKEN_CODE" \
    | awk '
        {
          rest = $0
          while (match(rest, /--tab-height-lg[[:space:]]*:/)) {
            count += 1
            rest = substr(rest, RSTART + RLENGTH)
          }
        }
        END { print count + 0 }
      '
) || fail_integrity '無法計數 --tab-height-lg declarations'
CHROME_DECLARATION_COUNT=$(
  printf '%s\n' "$TOKEN_CODE" \
    | awk '
        {
          rest = $0
          while (match(rest, /--chrome-header-height[[:space:]]*:/)) {
            count += 1
            rest = substr(rest, RSTART + RLENGTH)
          }
        }
        END { print count + 0 }
      '
) || fail_integrity '無法計數 --chrome-header-height declarations'
if [ "$TAB_DECLARATION_COUNT" != '3' ] || [ "$CHROME_DECLARATION_COUNT" != '3' ]; then
  fail_integrity 'canonical token extraction 不完整、重複或 scope/order 非預期'
fi

RECORDS=()
while IFS= read -r record; do
  [ -n "$record" ] && RECORDS+=("$record")
done < <(
  printf '%s\n' "$TOKEN_CODE" | awk '
    BEGIN { context = ""; pending = "" }
    /^[[:space:]]*:root[[:space:]]*\{/ {
      context = "root"
      next
    }
    /^[[:space:]]*\[data-ui-size="lg"\][[:space:]]*,[[:space:]]*$/ {
      pending = "lg"
      next
    }
    pending == "lg" && /^[[:space:]]*\[data-density="lg"\][[:space:]]*\{/ {
      context = "lg"
      pending = ""
      next
    }
    /^[[:space:]]*\[data-ui-size="md"\][[:space:]]*,[[:space:]]*$/ {
      pending = "md-reset"
      next
    }
    pending == "md-reset" && /^[[:space:]]*\[data-density="md"\][[:space:]]*\{/ {
      context = "md-reset"
      pending = ""
      next
    }
    /^[[:space:]]*}/ {
      context = ""
      pending = ""
      next
    }
    /^[[:space:]]*--(tab-height-lg|chrome-header-height)[[:space:]]*:/ {
      line = $0
      if (context == "" || line !~ /^[[:space:]]*--(tab-height-lg|chrome-header-height):[[:space:]]*(0|[1-9][0-9]*)(\.[0-9]+)?rem[[:space:]]*;[[:space:]]*$/) {
        print "INVALID"
        next
      }
      name = line
      sub(/^[[:space:]]*--/, "", name)
      sub(/:.*/, "", name)
      value = line
      sub(/^[^:]*:[[:space:]]*/, "", value)
      sub(/rem[[:space:]]*;.*/, "", value)
      print context "|" name "|" value
    }
  '
)

EXPECTED_RECORDS=(
  'root|tab-height-lg'
  'root|chrome-header-height'
  'lg|tab-height-lg'
  'lg|chrome-header-height'
  'md-reset|tab-height-lg'
  'md-reset|chrome-header-height'
)

if [ "${#RECORDS[@]}" -ne "${#EXPECTED_RECORDS[@]}" ]; then
  fail_integrity 'canonical token extraction 不完整、重複或 scope/order 非預期'
fi

VALUES=()
for index in "${!EXPECTED_RECORDS[@]}"; do
  record="${RECORDS[$index]}"
  expected="${EXPECTED_RECORDS[$index]}"
  if [ "$record" = 'INVALID' ] || [ "${record%|*}" != "$expected" ]; then
    fail_integrity 'canonical token declaration 的 scope、順序或 decimal rem syntax 非預期'
  fi
  VALUES+=("${record##*|}")
done

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
for pair_index in 0 1 2; do
  value_index=$((pair_index * 2))
  tab_value="${VALUES[$value_index]}"
  chrome_value="${VALUES[$((value_index + 1))]}"
  if [ "$(normalize_decimal "$tab_value")" != "$(normalize_decimal "$chrome_value")" ]; then
    ERRORS+=("${CONTEXTS[$pair_index]}: --tab-height-lg=$tab_value rem ≠ --chrome-header-height=$chrome_value rem")
  fi
done

if [ ${#ERRORS[@]} -gt 0 ]; then
  printf '🚨 TAB_LG vs CHROME_HEADER_HEIGHT EQUAL BLOCKER(header-canonical.spec.md W3):\n' >&2
  for E in "${ERRORS[@]}"; do
    printf '   • %s\n' "$E" >&2
  done
  printf '\n  動一方必同步另一方(三個 scope 的兩 token 像素相等是 SSOT linkage 鐵證)\n' >&2
  printf '  SSOT: packages/design-system/src/patterns/header-canonical/header-canonical.spec.md W3\n' >&2
  printf '  修方向:在 uiSize.css 同步 --tab-height-lg 與 --chrome-header-height\n' >&2
  exit 2
fi

exit 0

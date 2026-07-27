#!/bin/bash
# Header canonical W1 Border ownership enforcement(per header-canonical.spec.md W1):
#   Header 含 Tabs(`<Tabs>` / `<TabsList>` child)→ 必標 `withTabs` prop 讓 border auto-suppress。
#
# PreToolUse(Edit / Write/MultiEdit)hook 使用 runner 驗證的完整 after-image，
# 以 TypeScript AST 做 per-instance + nested Header boundary 判斷。含 Tabs descendant
# 的任何 Header / XxxHeader / UI.Header opening 必須有唯一且明確為 true 的 withTabs。
#
# Allow escape:檔頭 leading line comment
# `// @header-withtabs-allow: <nonempty rationale>` 整檔豁免。

source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

fail_integrity() {
  printf '🚨 GOVERNANCE_INTEGRITY: HEADER + TABS WITHTABS ENFORCEMENT FAILURE: %s\n' "$1" >&2
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

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

case "${FILE_PATH:-}" in
  packages/design-system/src/*.tsx|packages/design-system/src/**/*.tsx|*/packages/design-system/src/*.tsx|*/packages/design-system/src/**/*.tsx) ;;
  *) exit 0 ;;
esac

# Skip stories
case "${FILE_PATH:-}" in
  *.stories.tsx|*.anatomy.stories.tsx|*.principles.stories.tsx) exit 0 ;;
esac

if [ "${GOVERNANCE_WRITE_STATE_TRUST:-}" != 'runner-v1' ]; then
  fail_integrity '受管轄的 Header mutation 缺少 runner-v1 proposed state'
fi
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
if [[ "$FILE_PATH" != "$STATE_PATH" && "$FILE_PATH" != */"$STATE_PATH" ]]; then
  fail_integrity 'trusted proposed write state 與 hook target 不相符'
fi
[ "$STATE_KIND" = 'deleted' ] && exit 0
FULL_CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input.governance_write_state.content')

# TypeScript AST per-instance enforcement：只有含 Tabs descendant 的 Header opening
# 自身具 bare `withTabs` 或 `withTabs={true}` 才合規。comments、變數名稱、
# `withTabs={false}` 與另一個合規 instance 都不可當 decoy。
NODE_PROJECT_ROOT="${GOVERNANCE_PROJECT_DIR:-}"
if [ -z "$NODE_PROJECT_ROOT" ]; then
  NODE_PROJECT_ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null) \
    || fail_integrity '無法定位 TypeScript parser project root'
fi
if ! JSX_COUNTS=$(
  cd "$NODE_PROJECT_ROOT" \
    && printf '%s' "$FULL_CONTENT" \
      | node -- "$(dirname "$0")/tsx-governance-analysis.mjs" \
          header-with-tabs-border 2>/dev/null
); then
  fail_integrity 'TypeScript TSX parser unavailable or proposed content malformed'
fi

if [ "$JSX_COUNTS" = 'ESCAPE' ]; then exit 0; fi
IFS='|' read -r APPLICABLE_HEADERS VIOLATING_HEADERS <<<"$JSX_COUNTS"
case "$APPLICABLE_HEADERS|$VIOLATING_HEADERS" in
  *[!0-9\|]*|'') fail_integrity 'TypeScript TSX analyzer output malformed' ;;
esac

if [ "$VIOLATING_HEADERS" -gt 0 ]; then
  printf '🚨 HEADER + TABS WITHTABS BLOCKER(header-canonical.spec.md W1):\n' >&2
  printf '   File: %s\n' "$FILE_PATH" >&2
  printf '   %s 個含 Tabs 的 header instance 中有 %s 個未宣告 true withTabs prop。\n' "$APPLICABLE_HEADERS" "$VIOLATING_HEADERS" >&2
  printf '   Header `border-b` + TabsList `border-b border-border` 會雙線。\n' >&2
  printf '\n  SSOT: patterns/header-canonical/header-canonical.spec.md W1\n' >&2
  printf '  修方向: <ChromeHeader withTabs> 或 <SurfaceHeader withTabs>\n' >&2
  printf '  Escape: 檔頭加 // @header-withtabs-allow: <rationale>\n' >&2
  exit 2
fi

exit 0

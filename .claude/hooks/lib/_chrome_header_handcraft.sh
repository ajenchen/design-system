#!/bin/bash
set -uo pipefail
# Header canonical Layer 3 ChromeHeader consumption enforcement(per header-canonical.spec.md Layer 3):
#   Production chrome header 必消費 `<ChromeHeader>` primitive,
#   不可自寫 `h-[var(--chrome-header-height)] border-b border-divider px-loose` 那一套 className。
#
# PreToolUse(Edit / Write / MultiEdit)hook —— 對 runner materialized 完整 after-image 掃描
# `packages/design-system/src/components/**/*.tsx`(非 stories):
#   檔內若有完整手刻 chrome header className signature → **P0 BLOCKER(exit 2)**。
#   2026-06-06 升 P0:migration 完成(header-canonical.spec.md L245「grep 全 repo 已無此手刻 signature
#   除 primitive 本身」)+ 0 殘留手刻 verified → 跟 item-anatomy C.4 row-handcraft P0 對稱。Escape 仍在。
#
# 當前期(2026-05-17 land Phase 2):Sidebar / FileViewer 已 migrate 完,其他元件若新加 chrome
# header 自刻 = drift,本 hook 攔。
#
# Allow escape:檔頭 leading true line comment
# `// @chrome-header-handcraft-allow: <nonempty rationale>` 豁免(Tabs cva-on-pattern 等
# 不適合用 primitive 的 case);本 hook 本身與 ChromeHeader / SurfaceHeader / SidebarHeader.tsx
# 不攔(那些是 primitive 自己)。

source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

fail_integrity() {
  printf '🚨 GOVERNANCE_INTEGRITY: CHROME HEADER HANDCRAFT ENFORCEMENT FAILURE: %s\n' "$1" >&2
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
  packages/design-system/src/components/*.tsx|packages/design-system/src/components/**/*.tsx|*/packages/design-system/src/components/*.tsx|*/packages/design-system/src/components/**/*.tsx) ;;
  *) exit 0 ;;
esac

# Skip stories
case "$FILE_PATH" in
  *.stories.tsx|*.anatomy.stories.tsx|*.principles.stories.tsx) exit 0 ;;
esac

# Skip primitive home(SidebarHeader 內部消費 ChromeHeader,但仍有 className signature 引用)
case "$FILE_PATH" in
  */ChromeHeader/*|*/header-canonical/*|*/overlay-surface/*) exit 0 ;;
esac

if [ "${GOVERNANCE_WRITE_STATE_TRUST:-}" != 'runner-v1' ]; then
  fail_integrity '受管轄的 ChromeHeader mutation 缺少 runner-v1 proposed state'
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

# TypeScript AST 從 JSX className after-image 收集靜態 class fragments。支援字串、
# template、字串 concat、cn/clsx 類 call/array/object/conditional 片段與簡單 const
# identifier；token 順序不影響。普通字串、comments 與非 className expression 不計。
NODE_PROJECT_ROOT="${GOVERNANCE_PROJECT_DIR:-}"
if [ -z "$NODE_PROJECT_ROOT" ]; then
  NODE_PROJECT_ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null) \
    || fail_integrity '無法定位 TypeScript parser project root'
fi
if ! HANDCRAFT_RESULT=$(
  cd "$NODE_PROJECT_ROOT" \
    && printf '%s' "$FULL_CONTENT" \
      | node -- "$(dirname "$0")/tsx-governance-analysis.mjs" \
          chrome-header-handcraft 2>/dev/null
); then
  fail_integrity 'TypeScript TSX parser unavailable or proposed content malformed'
fi

case "$HANDCRAFT_RESULT" in
  ESCAPE|CLEAN) exit 0 ;;
  HIT) ;;
  *) fail_integrity 'TypeScript TSX analyzer output malformed' ;;
esac

if [ "$HANDCRAFT_RESULT" = 'HIT' ]; then
  printf '❌ CHROME HEADER HANDCRAFT(P0 BLOCKER):\n' >&2
  printf '   File: %s\n' "$FILE_PATH" >&2
  printf '   偵測到自刻 `h-[var(--chrome-header-height)] ... border-b border-divider`\n' >&2
  printf '\n  SSOT: patterns/header-canonical/header-canonical.spec.md Layer 3\n' >&2
  printf '  修方向: import { ChromeHeader } from "@/design-system/patterns/header-canonical/chrome-header"\n' >&2
  printf '          替換 <div className="..."> → <ChromeHeader withTabs? leadingRail? lockDensity?>\n' >&2
  printf '  Escape: 檔頭加 // @chrome-header-handcraft-allow: <rationale>\n' >&2
  exit 2
fi

exit 0

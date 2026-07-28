#!/bin/bash
set -uo pipefail
# PreToolUse Edit/Write: enforce M18 Q0「Pre-ASK self-verify problem 真存在」.
#
# 2026-05-18 user-mandated codify after Sheet/inline-action/SurfaceBody 三題誤判事件:
# Claude propose 給 user 拍板前必先 grep DS-wide + Read 相關 spec.md 確認 problem 真存在,
# 沒 grep 就斷言「N 元件缺 X / 該 migrate」= 撤回 propose。
#
# Detection:Edit/Write content 含「propose / 請拍板 / 等你拍板 / 待你拍板 /
# 決策 N / 我推 A/B/C / 選項」keywords,**但 content 內無 file:line cite 證據**
# → P1 warn(stderr exit 0,Claude 自決撤回 OR 在 reply 補 cite)。
#
# SSOT: `packages/design-system/ds-canonical/skills/propose-options/SKILL.md` Q0 段 +
# `packages/design-system/ds-canonical/rules/meta-patterns.md` M18。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

# Only fires on planning docs / commit-style summaries / reply-style markdown
# (避 false positive on production code / 一般 spec edit)
case "$FILE_PATH" in
  */planning/*.md|*/reports/*.md|*/handoff/*.md) ;;
  *) exit 0 ;;
esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")

grep -q '[^[:space:]]' <<<"$NEW_CONTENT" || exit 0

# Detect propose keywords
HAS_PROPOSE=$(echo "$NEW_CONTENT" | grep -cE '(請拍板|等你拍板|待你拍板|決策 [0-9N]|我推 [ABC]|選項[::]|propose for user|你決定|讓我判斷決策)' || true)

[ "$HAS_PROPOSE" = "0" ] && exit 0

# Allowed escape:檔頭 `<!-- @propose-pre-verified -->` 例外
FIRST_THREE=$(sed -n '1,3p' <<<"$NEW_CONTENT")
if grep -qE '@propose-pre-verified' <<<"$FIRST_THREE"; then
  exit 0
fi

# Check for file:line cite evidence
HAS_CITE=$(echo "$NEW_CONTENT" | grep -cE '`[a-z][a-z0-9/-]+\.(tsx|ts|css|md):[0-9]+`|`[a-z][a-z0-9/-]+\.(tsx|ts|css|md)`|`packages/design-system/src/' || true)

if [ "$HAS_CITE" = "0" ]; then
  printf '⚠️ PRE-ASK SELF-VERIFY GAP(M18 Q0,P1 soft):\n' >&2
  printf '   File: %s\n' "$FILE_PATH" >&2
  printf '   偵測到 propose 給 user 拍板 keyword,但 content 無 file:line cite 證據。\n' >&2
  printf '\n  M18 Q0 強制檢查:\n' >&2
  printf '   1. grep 既有 code DS-wide 確認 problem 真存在 (file:line)\n' >&2
  printf '   2. Read 相關 spec.md 找 canonical cite\n' >&2
  printf '   3. Read consumer usage 確認該 pattern 已在 N 處 work fine\n' >&2
  printf '   4. propose 給 user 前列具體 file:line 證據\n' >&2
  printf '\n  錨例:2026-05-18 Sheet/inline-action/SurfaceBody 三題誤判 propose 浪費 user 時間\n' >&2
  printf '  SSOT: packages/design-system/ds-canonical/skills/propose-options/SKILL.md Q0 段\n' >&2
  printf '  Escape: 檔頭加 <!-- @propose-pre-verified --> 若已 verify(rationale 必明示)\n' >&2
fi

exit 0

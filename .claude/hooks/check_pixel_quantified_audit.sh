#!/bin/bash
# check_pixel_quantified_audit.sh — M32(a) pixel-quantified verify mechanical guardrail
#
# Per M32(2026-05-12 user 抓「audit ALL PASS 但 user 看視覺仍 broken」連環事件 4 RC absorbed):
#   audit script 必驗 `rect.top / .left / .height` numeric pixel position,**不**可只驗
#   `getAttribute('data-state')` / `class.includes('items-start')` attribute-existence
#   = false-positive trap(DOM-structure-pass ≠ visual-pass)。
#
# Mechanical rule:scripts/visual-audit*.mjs(or *.js;含 canonical scripts/visual-audit.mjs,
# 舊 visual-audit-<target>.mjs 家族已於 2026-05-30 a2360e99 整批 retire)若有 `getAttribute(` 但沒 paired
# `getBoundingClientRect(` 或 `offsetTop/.offsetHeight` 量化 measurement → warn。
#
# 對齊 Material X-DataGrid visual regression / AG Grid playwright pixel snapshot canonical。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)

case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
case "$FILE_PATH" in
  */scripts/visual-audit*.mjs|*/scripts/visual-audit*.js) ;;
  *) exit 0 ;;
esac
[ "$EVENT" != "PostToolUse" ] && exit 0
[ ! -f "$FILE_PATH" ] && exit 0

# Allowlist
head -3 "$FILE_PATH" | grep -qE '//[[:space:]]*@pixel-quantified-allow:' && exit 0

# Count getAttribute calls vs getBoundingClientRect / offsetTop / offsetHeight calls
# 2026-05-23 bug fix:`grep -c ... 2>/dev/null || echo 0` 當 zero match 時 grep exit 1 + fallback echo,
# 產生 multi-line "0\n0" string,下游 [ "$X" -eq 0 ] arithmetic 報「integer expression expected」silent skip。
# 修法:grep 不用 fallback,直接保證輸出 numeric(strip 非數字)+ default 0。
ATTR_HITS=$(grep -cE 'getAttribute\(|\.hasAttribute\(' "$FILE_PATH" 2>/dev/null)
ATTR_HITS="${ATTR_HITS//[^0-9]/}"; ATTR_HITS=${ATTR_HITS:-0}
PIXEL_HITS=$(grep -cE 'getBoundingClientRect\(|\.offsetTop\b|\.offsetHeight\b|\.offsetLeft\b|\.offsetWidth\b' "$FILE_PATH" 2>/dev/null)
PIXEL_HITS="${PIXEL_HITS//[^0-9]/}"; PIXEL_HITS=${PIXEL_HITS:-0}

if [ "$ATTR_HITS" -gt 0 ] && [ "$PIXEL_HITS" -eq 0 ]; then
  CTX="⚠️ M32(a) pixel-quantified verify gap:
${FILE_PATH}:
  - getAttribute / hasAttribute calls: ${ATTR_HITS}
  - getBoundingClientRect / offsetTop calls: 0
  → audit 驗 attribute 但沒驗 pixel position = M32 違反(DOM-pass ≠ visual-pass)。
    加 numeric pixel measurement(rect.top / .left / .height)真實 verify 視覺,
    或檔首加 // @pixel-quantified-allow: <reason>(structural-only audit 例如 schema check)。"
  jq -n --arg ctx "$CTX" '{
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: $ctx }
  }'
fi

#!/bin/bash
set -uo pipefail
# PreToolUse Edit/Write: enforce audit dim count SSOT integrity.
#
# SSOT: `.claude/skills/design-system-audit/SKILL.md` `## The N audit dimensions` 段。
# 任何 chain it 的 skill / spec / rule / hook 禁 hardcode 具體 dim 數字
# (e.g. `46 dim` / `53 dim` / `53-dim` / `53 audit dimensions`)— 用「全 dim」/
# 「Group A-P」/「per design-system-audit SSOT」表達。
#
# Why: 2026-05-18 user-mandated SSOT integrity after `deep-audit-cross-codex` skill
# hardcode `53 dim` 9 處 → 若 design-system-audit 升 54 dim,chain skill 漂移。
#
# P1 soft warn (stderr exit 0) — Claude decides revert or escape with rationale.
# SSOT file itself (design-system-audit/SKILL.md) is allowed to write the count.

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

# Skip the SSOT itself
case "$FILE_PATH" in
  */design-system-audit/SKILL.md) exit 0 ;;
  */design-system-audit/references/*) exit 0 ;;
esac

# Only check files that potentially chain audit dim list
case "$FILE_PATH" in
  */deep-audit-cross-codex/*|*/rules/meta-patterns.md|*/CLAUDE.md|*/skills/*/SKILL.md|*/skills/*/references/*) ;;
  *) exit 0 ;;
esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")

[ -z "${NEW_CONTENT//[[:space:]]/}" ] && exit 0

# Detect hardcoded numeric dim count
# Patterns: "53 dim" / "53-dim" / "53 audit dim" / "53 audit dimensions" / "46 dim" / "46-dim"
# Exclude legitimate uses: "N dim" / "全 dim" / "<N>" placeholder / "1 dim" thru "9 dim" (could be reasonable refs)
HARDCODE_HITS=$(echo "$NEW_CONTENT" | grep -oE '\b[1-9][0-9]+[ -]?(dim|audit dim|audit dimension)|[0-9]+ ?維 ?(audit|sweep|dim)|[0-9]+ ?維度' | sort -u || true)

# Allow if line contains "SSOT" / "禁" / "forbidden" / "example" / "anti-pattern" — these are invariant doc references
ALLOWED_LINES=$(echo "$NEW_CONTENT" | grep -nE '\b[1-9][0-9]+[ -]?(dim|audit dim|audit dimension)|[0-9]+ ?維 ?(audit|sweep|dim)|[0-9]+ ?維度' 2>/dev/null | grep -E '(SSOT|禁|forbidden|example|anti-pattern|invariant|hardcode)' || true)

if [ -n "$HARDCODE_HITS" ]; then
  # Filter out allowed lines (invariant doc context)
  VIOLATION_LINES=$(echo "$NEW_CONTENT" | grep -nE '\b[1-9][0-9]+[ -]?(dim|audit dim|audit dimension)|[0-9]+ ?維 ?(audit|sweep|dim)|[0-9]+ ?維度' 2>/dev/null | grep -vE '(SSOT|禁|forbidden|example|anti-pattern|invariant|hardcode)' || true)

  if [ -n "$VIOLATION_LINES" ]; then
    printf '⚠️ AUDIT DIM COUNT DRIFT(P1 soft):\n' >&2
    printf '   File: %s\n' "$FILE_PATH" >&2
    printf '   偵測到 hardcoded audit dim count:\n%s\n' "$VIOLATION_LINES" >&2
    printf '\n  SSOT: `.claude/skills/design-system-audit/SKILL.md` `## The N audit dimensions`\n' >&2
    printf '  修法: 改用「全 dim」/「Group A-P」/「per design-system-audit SSOT」表達\n' >&2
    printf '       而非寫死「53 dim / 46 dim」等具體數字。\n' >&2
    printf '  Why: chain skill 自動繼承 SSOT 變動,避免 design-system-audit 升 54 dim 時下游漂移。\n' >&2
  fi
fi

exit 0

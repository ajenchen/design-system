#!/bin/bash
set -uo pipefail
# Pre-write hook: enforce principles.stories.tsx canonical structure
# (per `.claude/skills/story-writing/references/category-templates.md` Principles canonical 節)。
#
# Rules:
#   • Universal core ≥ 2 of {WhenToUse, WhenNotToUse, Vs*Rule, ContentGuidelines}
#   • Anti-pattern naming canonical:Forbidden* / Donts / Pitfalls / Prohibitions / NonGoals / VisualDonts
#     全 deprecated → 用 WhenNotToUse(P0 block on new files;P1 warn on existing)
#
# Allowlist:`// @principles-rationale: <reason>` escape
#
# Why:user mandate「ensure storybook 永遠都是這樣沒例外」(2026-04-26 M19)— principles
# 是第三層,既有 hooks 沒覆蓋。本 hook + Audit Dim 30 + scaffold 5-layer 落地。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -u

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // {}' 2>/dev/null)

FILE_PATH=$(echo "$TOOL_INPUT" | jq -r '.file_path // ""' 2>/dev/null)
[[ "$FILE_PATH" =~ \.principles\.stories\.tsx$ ]] || exit 0

NEW_CONTENT=""
case "$TOOL_NAME" in
  Write)
    NEW_CONTENT=$(echo "$TOOL_INPUT" | jq -r '.content // ""' 2>/dev/null)
    ;;
  Edit)
    NEW_CONTENT=$(echo "$TOOL_INPUT" | jq -r '.new_string // ""' 2>/dev/null)
    ;;
  MultiEdit)
    NEW_CONTENT=$(echo "$TOOL_INPUT" | jq -r '[.edits[]?.new_string] | join("\n")' 2>/dev/null)
    ;;
  *) exit 0 ;;
esac

[ -z "$NEW_CONTENT" ] && exit 0

# Allowlist escape
if echo "$NEW_CONTENT" | grep -q "@principles-rationale:"; then
  exit 0
fi

# Combine on-disk + new content for full picture
EXISTING_CONTENT=""
[ -f "$FILE_PATH" ] && EXISTING_CONTENT=$(cat "$FILE_PATH" 2>/dev/null || echo "")
FULL_CONTENT="${EXISTING_CONTENT}
${NEW_CONTENT}"

# Extract export const story names
STORY_EXPORTS=$(echo "$FULL_CONTENT" | grep -oE "^export const [A-Z][a-zA-Z]+" | awk '{print $3}' | sort -u)

VIOLATIONS=""
WARNINGS=""

# ── Anti-pattern naming drift detection ─────────────────────────────────────
DEPRECATED_NAMES=("Forbidden" "Donts" "Pitfalls" "Prohibitions" "NonGoals" "VisualDonts")
for deprecated in "${DEPRECATED_NAMES[@]}"; do
  if echo "$STORY_EXPORTS" | grep -qE "^${deprecated}"; then
    # On NEW file (no existing on-disk content) → block; existing file → warn
    if [ -z "$EXISTING_CONTENT" ]; then
      VIOLATIONS="${VIOLATIONS}\n  • [P0] Deprecated naming '${deprecated}*' detected — rename to 'WhenNotToUse'"
    else
      WARNINGS="${WARNINGS}\n  • [P1 warn] Deprecated naming '${deprecated}*' — migrate to 'WhenNotToUse' on next edit"
    fi
  fi
done

# ── Universal core: ≥ 2 of {WhenToUse, WhenNotToUse, Vs*Rule, ContentGuidelines} ──
HAS_WHEN_TO_USE=0
HAS_WHEN_NOT_TO_USE=0
HAS_VS_RULE=0
HAS_CONTENT_GUIDELINES=0

echo "$STORY_EXPORTS" | grep -qE "^WhenToUse$" && HAS_WHEN_TO_USE=1
echo "$STORY_EXPORTS" | grep -qE "^WhenNotToUse$" && HAS_WHEN_NOT_TO_USE=1
echo "$STORY_EXPORTS" | grep -qE "^Vs[A-Z].*Rule$|^.+Vs.+Rule$" && HAS_VS_RULE=1
echo "$STORY_EXPORTS" | grep -qE "^ContentGuidelines$" && HAS_CONTENT_GUIDELINES=1

# Legacy alias acceptance (count as core if present, but warn to migrate)
echo "$STORY_EXPORTS" | grep -qE "^(UsageScenarioRule|WhatItIs)$" && HAS_WHEN_TO_USE=1
for deprecated in "${DEPRECATED_NAMES[@]}"; do
  echo "$STORY_EXPORTS" | grep -qE "^${deprecated}" && HAS_WHEN_NOT_TO_USE=1
done

# v3 integrated canonical (2026-04-26):UsageGuidance 單一 export 即合 Polaris/Material/Ant 共識
# 整合「何時用 + 何時不用 + vs 近親」為 ONE story,等同 ≥ 2 universal core
HAS_USAGE_GUIDANCE=0
echo "$STORY_EXPORTS" | grep -qE "^UsageGuidance$" && HAS_USAGE_GUIDANCE=1

CORE_COUNT=$((HAS_WHEN_TO_USE + HAS_WHEN_NOT_TO_USE + HAS_VS_RULE + HAS_CONTENT_GUIDELINES))
# UsageGuidance 視為 ≥ 2 core(整合 WhenToUse + WhenNotToUse + Vs*)
[ "$HAS_USAGE_GUIDANCE" -eq 1 ] && CORE_COUNT=2

if [ "$CORE_COUNT" -lt 2 ]; then
  if [ -z "$EXISTING_CONTENT" ]; then
    # New file — block
    VIOLATIONS="${VIOLATIONS}\n  • [P0] Universal core ≥ 2 required: have ${CORE_COUNT} of {WhenToUse, WhenNotToUse, Vs*Rule, ContentGuidelines}"
  else
    # Existing file edit — warn(don't block legacy file mid-edit)
    WARNINGS="${WARNINGS}\n  • [P1 warn] Universal core only ${CORE_COUNT}/2 — add WhenToUse / WhenNotToUse / Vs*Rule / ContentGuidelines"
  fi
fi

# Has violations → block(P0)
if [ -n "$VIOLATIONS" ]; then
  cat >&2 <<EOF
❌ Principles canonical violation(check_principles_canonical.sh):

  File: $FILE_PATH

Violations:$(echo -e "$VIOLATIONS")

Per .claude/skills/story-writing/references/category-templates.md「Principles canonical」節:
  ‣ Universal core ≥ 2 of {WhenToUse, WhenNotToUse, Vs*Rule, ContentGuidelines}
  ‣ Anti-pattern naming → WhenNotToUse(canonical;Forbidden* / Donts / Pitfalls / Prohibitions / NonGoals / VisualDonts deprecated)
  ‣ Or add \`// @principles-rationale: <reason>\` escape

M19 ensure-canonical pipeline(2026-04-26)— enforced not optional unless typology
itself changed via /ensure-canonical.
EOF
  exit 2
fi

# P1 warnings → non-blocking
[ -n "$WARNINGS" ] && echo "⚠️  Principles canonical warning:$(echo -e "$WARNINGS")" >&2
exit 0

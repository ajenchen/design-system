#!/bin/bash
# check_escape_marker_abuse.sh — P0 BLOCKER (codify warning)
#
# 偵測 consumer code(.tsx/.stories.tsx)濫用 escape markers 跳 SSOT enforcement.
# Per user 2026-05-27 verbatim「不亂加 escape markers — 加就跳 enforcement」.
#
# Escape markers exist for真 exceptions(per-line documented rationale)。但 fork
# user 若大量加 escape markers (eg. ≥3 同一 file) = 違反 escape philosophy → BLOCK.
#
# Detected markers:
#   - @ds-misuse-allow:    (check_consumer_ds_primitive_misuse.sh escape)
#   - @story-baseline-allow:(check_consumer_story_baseline.sh escape)
#   - @consumer-catalog-allow:(check_consumer_no_ds_catalog.sh escape)
#   - @overlay-open-skip:  (check_overlay_open_focus_escape_probe.sh escape)
#   - @template-customized (template canonical sync opt-out)
#   - @layout-space-magic-ok:(check_layout_space_magic_numbers.sh escape)
#   - @story-trait-allow:  (story-baseline / catalog escape)
#   - @propose-cite-skip:  (check_propose_cite_required.sh escape)
#   - @anatomy-exempt:     (story-rules escape)
#   - @benchmark-unverified: (M22 cite)
#
# Threshold:≥3 distinct markers OR ≥5 total occurrences in same file → BLOCK
# Forces fork user to either (a) fix root cause OR (b) refactor properly OR
# (c) explicitly cite reason in commit message via env override.

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
# Only check consumer apps tsx (not DS source — DS has legitimate exceptions per spec)
if ! echo "$FILE" | grep -qE '/(apps|consumer)/.*\.(tsx|ts)$'; then exit 0; fi
if echo "$FILE" | grep -qE 'packages/design-system/src/'; then exit 0; fi

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

# Global escape — meta-skip(env override OR explicit comment)
if [ "${CLAUDE_BYPASS_ESCAPE_MARKER_AUDIT:-0}" = "1" ]; then exit 0; fi

# Count distinct markers + total occurrences
MARKERS_FOUND=$(echo "$CONTENT" | grep -oE '@(ds-misuse-allow|story-baseline-allow|consumer-catalog-allow|overlay-open-skip|template-customized|layout-space-magic-ok|story-trait-allow|propose-cite-skip|anatomy-exempt|benchmark-unverified)' | sort -u)
DISTINCT_COUNT=$(echo "$MARKERS_FOUND" | grep -c . || echo 0)
TOTAL_COUNT=$(echo "$CONTENT" | grep -oE '@(ds-misuse-allow|story-baseline-allow|consumer-catalog-allow|overlay-open-skip|template-customized|layout-space-magic-ok|story-trait-allow|propose-cite-skip|anatomy-exempt|benchmark-unverified)' | wc -l | tr -d ' ')

# Threshold: ≥3 distinct types OR ≥5 total
if [ "$DISTINCT_COUNT" -ge 3 ] || [ "$TOTAL_COUNT" -ge 5 ]; then
  cat >&2 << EOF
🚨 ESCAPE-MARKER-ABUSE BLOCKER(P0,user 2026-05-27 verbatim「不亂加 escape markers — 加就跳 enforcement」)

  File $FILE:
    Distinct escape markers: $DISTINCT_COUNT(threshold ≥3)
    Total occurrences: $TOTAL_COUNT(threshold ≥5)

  Markers detected:
$(echo "$MARKERS_FOUND" | sed 's/^/    /')

  Escape markers 設計為「rare per-line documented exception」,不該 routine 加。
  Fork user file 大量加 marker = 違反 SSOT 哲學 — 應該:

  修法 3 選 1:
    (a) **重構 code** 走 DS canonical pattern(消除根因,不繞)
    (b) **拆 file**:1 個 escape 對應 1 個 specific case,分散到不同 file
    (c) **Override env**(極罕見,documented in commit msg):
        CLAUDE_BYPASS_ESCAPE_MARKER_AUDIT=1 git commit -m "<rationale>"

  per check_consumer_*.sh hooks SSOT — escape 是 emergency exit,不是 daily tool.
EOF
  exit 2
fi

exit 0

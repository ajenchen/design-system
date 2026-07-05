#!/bin/bash
# check_full_story_visual_interaction_sweep.sh — P0 BLOCKER
#
# Codex M31 P0 finding 2026-05-27: ds-story-manifest.json 是 story 總數 SSOT(動態,
# 禁 hardcode 數字 — 真值以 manifest.totalStories 為準;2026-07-04 dim 73 修 stale 916),
# 但無 hook 攔 audit reports 漏 manifest story IDs / screenshots / metrics / probe.
# User 2026-05-27 verbatim「不准抽樣 全 visual + interaction 全跑」.
#
# Triggers when audit report JSON is edited/written:
#   - /tmp/codex-*-sweep/audit-report.json
#   - /tmp/claude-*-sweep/audit-report.json
#   - .claude/snapshots/*audit-report.json
# Verifies storyResults.length === manifest.totalStories(動態讀 manifest)— block if sample.
#
# Escape: report frontmatter `"_sampling_allowed": "<rationale>"`(極罕見).

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

case "${TOOL:-}" in
  Write|Edit|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
if ! echo "$FILE" | grep -qE '(sweep|audit-report)\.json$'; then exit 0; fi

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

# Check escape
if echo "$CONTENT" | grep -q '_sampling_allowed'; then exit 0; fi

# Parse story count vs manifest (multi-field fallback)
STORY_COUNT=$(echo "$CONTENT" | jq -r '.storyResults // .results // [] | length' 2>/dev/null)
if [ -z "$STORY_COUNT" ] || [ "$STORY_COUNT" = "0" ] || [ "$STORY_COUNT" = "null" ]; then
  STORY_COUNT=$(echo "$CONTENT" | jq -r '.storySummary.total // .summary.total // .total // 0' 2>/dev/null)
fi
STORY_COUNT=${STORY_COUNT:-0}

MANIFEST_PATH="${CLAUDE_PROJECT_DIR:-.}/packages/design-system/ds-story-manifest.json"
if [ ! -f "$MANIFEST_PATH" ]; then exit 0; fi
MANIFEST_TOTAL=$(jq -r '.totalStories // 0' "$MANIFEST_PATH" 2>/dev/null)
[ -z "$MANIFEST_TOTAL" ] || [ "$MANIFEST_TOTAL" = "0" ] && exit 0
[ "$STORY_COUNT" = "0" ] && exit 0
# numeric compare
if ! [[ "$STORY_COUNT" =~ ^[0-9]+$ ]]; then exit 0; fi

if [ "$STORY_COUNT" -lt "$MANIFEST_TOTAL" ]; then
  cat >&2 << EOF
🚨 FULL-STORY-SWEEP BLOCKER(P0,codex M31 finding 2026-05-27 + user「不准抽樣」)

  Audit report $FILE:
    storyResults: $STORY_COUNT
    manifest.totalStories: $MANIFEST_TOTAL
    缺失: $((MANIFEST_TOTAL - STORY_COUNT)) stories

  per ds-story-manifest.json SSOT(scripts/gen-ds-story-manifest.mjs:59)+ user 2026-05-27
  「請你不要給我抽樣,因為你一抽樣就是會有東西壞掉,務必要全部檢查」directive.

  修法 2 選 1:
    (a) Re-run sweep covering all $MANIFEST_TOTAL stories
    (b) Escape:report 含 \`"_sampling_allowed": "<rationale>"\`(極罕見)
EOF
  exit 2
fi

exit 0

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
#   - provider-neutral governance runtime evidence/*audit-report.json
# Verifies storyResults.length === manifest.totalStories(動態讀 manifest)— block if sample.
#
# Escape: report frontmatter `"_sampling_allowed": "<rationale>"`(極罕見).

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_provider_paths.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: full-story sweep provider resolver unavailable\n' >&2
  exit 70
}
source "$(dirname "$0")/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: hook integrity helper unavailable\n' >&2
  exit 70
}

set -uo pipefail

governance_hook_load_input
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'full-story sweep tool extraction failed'

case "${TOOL:-}" in
  Write|Edit|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'full-story sweep path extraction failed'
case "$FILE" in *sweep.json|*audit-report.json) ;; *) exit 0 ;; esac

CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'full-story sweep report extraction failed'

# The report is enforcement evidence. Invalid JSON/schema is an integrity fault; a valid report
# with no coverage is a genuine policy failure and is handled by the comparison below.
if ! printf '%s' "$CONTENT" | jq -e '
  type == "object"
  and (._sampling_allowed? == null or (._sampling_allowed | type == "string"))
  and (.storyResults? == null or (.storyResults | type == "array"))
  and (.results? == null or (.results | type == "array"))
  and (.storySummary? == null or (.storySummary | type == "object"))
  and (.summary? == null or (.summary | type == "object"))
  and (
    [.storySummary.total?, .summary.total?, .total?]
    | all(. == null or (type == "number" and floor == . and . >= 0))
  )
' >/dev/null 2>&1; then
  governance_hook_integrity_fail 'full-story sweep report is malformed or invalid'
fi

# Check the explicit, schema-valid escape only after the report itself has been validated.
SAMPLING_ESCAPE=$(printf '%s' "$CONTENT" | jq -r '._sampling_allowed // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'full-story sweep escape extraction failed'
if [ -n "$SAMPLING_ESCAPE" ]; then
  exit 0
fi

# Parse story count vs manifest (multi-field fallback).
STORY_COUNT=$(printf '%s' "$CONTENT" | jq -r '
  ((.storyResults // .results // []) | length) as $arrayCount
  | if $arrayCount > 0 then $arrayCount
    else (.storySummary.total // .summary.total // .total // 0)
    end
' 2>/dev/null) || governance_hook_integrity_fail 'full-story sweep count extraction failed'

PROJECT_ROOT=$(governance_project_root 2>/dev/null) \
  || governance_hook_integrity_fail 'full-story sweep project root could not be resolved'
MANIFEST_PATH="$PROJECT_ROOT/packages/design-system/ds-story-manifest.json"
if [ -L "$MANIFEST_PATH" ] || [ ! -f "$MANIFEST_PATH" ] || [ ! -r "$MANIFEST_PATH" ]; then
  governance_hook_integrity_fail "full-story sweep manifest is unavailable or unsafe:${MANIFEST_PATH}"
fi
if ! jq -e '
  type == "object"
  and (.totalStories | type == "number" and floor == . and . > 0)
' "$MANIFEST_PATH" >/dev/null 2>&1; then
  governance_hook_integrity_fail "full-story sweep manifest is invalid:${MANIFEST_PATH}"
fi
MANIFEST_TOTAL=$(jq -r '.totalStories' "$MANIFEST_PATH" 2>/dev/null) \
  || governance_hook_integrity_fail 'full-story sweep manifest count extraction failed'

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

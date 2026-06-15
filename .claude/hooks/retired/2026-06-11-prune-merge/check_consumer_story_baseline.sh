#!/bin/bash
# check_consumer_story_baseline.sh — P0 BLOCKER
#
# Consumer storybook files wrapping high-risk DS primitives MUST declare
# `// @story-baseline: <DS-story-path>#<exportName>` marker
# (per M31 codex synthesis 2026-05-27).
#
# Anchor 2026-05-27 codex M31 v1:「Consumer 若 wrap 高風險 DS primitive,
# 檔頭必須有 @story-baseline:,並由 CI 對 DS canonical story 做 visual diff」.
#
# High-risk DS primitives(per codex list):
#   DataTable / Dialog / Sheet / Popover / DropdownMenu / Tooltip / HoverCard /
#   LinkInput / RadioGroup / CircularProgress / AppShell / Sidebar
#
# Triggers on consumer apps/**/*.stories.tsx edit. Blocks if file uses any of
# these primitives but lacks @story-baseline: marker.
#
# Escape:`// @story-baseline-allow: <rationale>` for legitimate exceptions
# (eg. behavior-only test stories, exception per ds-story-manifest.json).

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
# Only check consumer storybook files
if ! echo "$FILE" | grep -qE '/(apps|consumer)/.*\.stories\.tsx$'; then exit 0; fi
if echo "$FILE" | grep -qE 'packages/design-system/src/'; then exit 0; fi

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

# Escape clauses
if echo "$CONTENT" | grep -qE '@story-baseline-allow:|@consumer-catalog-allow:'; then exit 0; fi

# High-risk DS primitives requiring baseline marker
HIGH_RISK_PRIMITIVES='DataTable|Dialog|Sheet|Popover|DropdownMenu|Tooltip|HoverCard|LinkInput|RadioGroup|CircularProgress|AppShell|Sidebar'

# Detect usage
USED=$(echo "$CONTENT" | grep -oE "<DS\.($HIGH_RISK_PRIMITIVES)\\b" | sort -u | head -10)

if [ -z "$USED" ]; then exit 0; fi

# Check for @story-baseline: marker
if echo "$CONTENT" | grep -qE '@story-baseline:[[:space:]]*\S'; then exit 0; fi

cat >&2 << EOF
🚨 CONSUMER-STORY-BASELINE BLOCKER(P0,2026-05-27 M31 codex synthesis)

  Consumer file $FILE 用高風險 DS primitive 但無 \`// @story-baseline:\` marker:
$(echo "$USED" | sed 's/^/    /')

  per M31 codex synthesis SSOT:「Consumer wrap 高風險 DS primitive 必 @story-baseline:
  marker,由 CI 對 DS canonical story 做 visual diff」.

  High-risk list:DataTable / Dialog / Sheet / Popover / DropdownMenu / Tooltip /
  HoverCard / LinkInput / RadioGroup / CircularProgress / AppShell / Sidebar.

  修法 2 選 1:
    (a) 加 marker(檔頭或 story body):
        // @story-baseline: @qijenchen/design-system/components/<Name>/<name>.stories.tsx#<ExportName>
        例:// @story-baseline: @qijenchen/design-system/components/Sidebar/sidebar.stories.tsx#IconCollapse
    (b) Escape:\`// @story-baseline-allow: <rationale>\` 顯式 documented exception
        (eg. pure behavior test / per ds-story-manifest.json exception list)

  完整 mapping → packages/design-system/ds-story-manifest.json(DS package ship)
EOF
exit 2

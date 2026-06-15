#!/bin/bash
# check_consumer_app_story_title.sh — P0 BLOCKER
#
# 2026-05-28 codify per template create-app duplicate-id bug anchor:
# Consumer apps(template / fork repos)裡 `apps/<name>/**/*.stories.tsx` 的
# `title:` 必開頭 `Apps/<kebab-app-name>/...` — 否則 Storybook glob 撈到後撞 id。
#
# SSOT:.claude/rules/story-rules.md「Title 命名 2-namespace canonical」
#
# Mechanical 強制 PreToolUse Edit/Write 對 `apps/<name>/**/*.stories.tsx`:
# - 偵測 `title:` field
# - 若 title 開頭非 `Apps/<dir-name>/...` → BLOCK
# - 自動推導 dir-name 從 file path(`apps/order-dashboard/src/App.stories.tsx`
#   → expected prefix `Apps/order-dashboard/`)
#
# Scope:`/apps/<name>/**/*.stories.@(tsx|ts|mdx)`(consumer repos only)。
# DS-internal stories(`packages/design-system/**`)走另條 canonical(`Design System/...`),
# 不在本 hook scope。
#
# Escape:`@app-story-title-skip:` comment(極罕見)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
# Scope:apps/<name>/**/*.stories.(tsx|ts|mdx)
if ! echo "$FILE" | grep -qE '/apps/[^/]+/.+\.stories\.(tsx|ts|mdx)$'; then exit 0; fi

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

# Escape clause
if echo "$CONTENT" | grep -qE '@app-story-title-skip:'; then exit 0; fi

# Extract expected app name from file path
APP_NAME=$(echo "$FILE" | sed -E 's|.*/apps/([^/]+)/.*|\1|')
[ -z "$APP_NAME" ] && exit 0

# Find title field(支援 single/double/backtick quote)
TITLE_LINE=$(echo "$CONTENT" | grep -oE "title:\s*['\"\`][^'\"\`]+['\"\`]" | head -1)

# 若無 title field,skip(no-op stories OK)
[ -z "$TITLE_LINE" ] && exit 0

EXPECTED_PREFIX="Apps/${APP_NAME}/"

# Check title 是否開頭 `Apps/<app-name>/`
if ! echo "$TITLE_LINE" | grep -qE "title:\s*['\"\`]Apps/${APP_NAME}/"; then
  cat >&2 << EOF
🚨 CONSUMER APP STORY TITLE BLOCKER(P0,2026-05-28 codify per create-app duplicate-id anchor)

  File: $FILE
  Detected title: $TITLE_LINE
  Expected prefix: \`title: 'Apps/${APP_NAME}/...'\`

  Why blocked:
    Consumer apps 內 stories 必用 \`Apps/<app-name>/<page-purpose>\` 開頭 namespace
    (per .claude/rules/story-rules.md「Title 命名 2-namespace canonical」)。
    錯 prefix → Storybook glob 撈到後與 template/其他 app 撞 id → build duplicate
    warning + 只顯第一個 → 新 app 在 sidebar 不可見。

  Anchor:2026-05-28 npm run create-app 不改 story title 導致 e2e 抓 4 個 collisions。

  Fix:
    title: 'Apps/${APP_NAME}/<Your Page Purpose>'  // ex: 'Apps/${APP_NAME}/Dashboard'

  Escape(極罕見):add \`// @app-story-title-skip: <rationale>\`
EOF
  exit 2
fi

exit 0

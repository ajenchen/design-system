#!/bin/bash
# check_post_main_ssot_propagate.sh — PostToolUse Bash: 偵測 `git push origin main` 後
# diff HEAD~..HEAD 含 SSOT-affecting paths → inject context 提議 npm version bump 啟動 cross-repo sync chain。
#
# Per user verbatim 2026-05-26:「Ds repo 在 deep audit cross codex 後或是 knowledge prune deep 後,
# 並把所有增刪改都 push main 之後,所有 repo 是否也都能獲得更新?不是只要一 knowledge audit deep 之後
# 就要,是等我 push main 後才要」
#
# Architecture canonical:
#   - **Trigger = push to main**(NOT skill completion)— 因為 SSOT-affecting changes 可能來自任何 source
#     (/knowledge-prune deep / /deep-audit-cross-codex Phase C / 一般 bug fix / 新元件 ship / governance edit)
#   - 統一在 push main 後 detect SSOT diff → 觸發 cross-repo sync chain
#   - 對應 CLAUDE.md `# Git solo-work canonical` Step 5.5 SSOT propagation
#
# SSOT-affecting paths(改這些 = consumer 需要 bump npm dep 才能拿到):
#   - packages/design-system/src/**         (DS production code → npm package)
#   - packages/storybook-config/{addons,addons-preset.ts,preview.tsx,package.json}  (storybook addon config → npm;無 src/ dir,真 regex 見 L56)
#   - .claude/{rules,hooks,skills,commands,references}/** (governance plugin → ships via ds-canonical/)
#   - .claude-plugin/{plugin,marketplace}.json (plugin metadata)
#   - hooks/hooks.json                        (plugin hook registration)
#   - CLAUDE.md                               (governance instructions ship via npm package files)
#
# Non-SSOT paths(改這些 don't trigger):
#   - scripts/**                              (DS internal tooling)
#   - .claude/{logs,memory,planning}/**       (session-specific / not shipped)
#   - .github/**                              (DS internal CI)
#   - *.test.* / docs / README                (non-functional changes)
#
# 對齊:CLAUDE.md `# Git solo-work canonical` Step 5.5 +
#       .claude/skills/{knowledge-prune,deep-audit-cross-codex}/SKILL.md(now point to canonical 不重複)

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)

[ "$EVENT" != "PostToolUse" ] && exit 0
[ "$TOOL" != "Bash" ] && exit 0

# Match: git push origin main(NOT push to working branch, NOT push --delete)
if ! echo "$CMD" | grep -qE '\bgit\s+push\s+(-u\s+)?origin\s+main\b'; then
  exit 0
fi
if echo "$CMD" | grep -qE 'push\s+origin\s+--delete'; then
  exit 0
fi

# Only fire when in DS repo(packages/design-system/src/ exists);non-DS repo silent skip
CWD=$(pwd)
[ ! -d "$CWD/packages/design-system/src" ] && exit 0

# Detect SSOT-affecting diff between HEAD~1 and HEAD
SSOT_DIFF=$(git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -E '^(packages/design-system/src/|packages/storybook-config/(addons/|addons-preset\.ts|preview\.tsx|package\.json)|\.claude/(rules|hooks|skills|commands|references)/|\.claude-plugin/(plugin|marketplace)\.json|hooks/hooks\.json|CLAUDE\.md)' || true)

[ -z "$SSOT_DIFF" ] && exit 0

# Count touched files
SSOT_COUNT=$(echo "$SSOT_DIFF" | wc -l | tr -d ' ')

# Read current package version
PKG_VERSION=$(jq -r '.version' "$CWD/packages/design-system/package.json" 2>/dev/null || echo "unknown")

cat <<EOF
🔄 SSOT propagation gate(post push origin main):

📊 偵測:HEAD~1..HEAD 含 $SSOT_COUNT 個 SSOT-affecting file changes
📦 目前 npm version:$PKG_VERSION
🎯 Propose:bump 下一個 beta → tag → Release workflow → npm publish → Dependabot daily auto-PR
   → 24h 內 product-workspace + 所有 fork repo 自動拿最新

Touched(top 5):
$(echo "$SSOT_DIFF" | head -5 | sed 's/^/  - /')

Next action(per Git solo-work canonical Step 5.5):
  1. 在 packages/design-system/package.json + packages/storybook-config/package.json + .claude-plugin/{plugin,marketplace}.json bump version → 0.1.0-beta.<N+1>
  2. git tag v0.1.0-beta.<N+1>
  3. git push origin main --tags
  4. Release workflow auto-fire → npm publish + Dependabot 開始日常 cross-repo sweep

對應 canonical:
  - CLAUDE.md \`# Git solo-work canonical\` Step 5.5
  - .claude/skills/knowledge-prune/SKILL.md「Phase Z」reference
  - .claude/skills/deep-audit-cross-codex/SKILL.md「Phase C」reference
EOF
exit 0

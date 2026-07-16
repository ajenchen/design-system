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
# 2026-07-16 dim 73/hooks 硬化(照 sibling inject_deploy_url_after_push.sh:43-46 已硬化 pattern 抄):
# 原 `\bgit\s+push\s+(-u\s+)?origin\s+main\b` 漏 —
#   - `git -C <dir> push origin main`(-C 變體)
#   - `git push --force-with-lease origin main`(任意 flag 在 origin 前)
#   - `git push origin HEAD:main` / `HEAD:refs/heads/main`(refspec 變體)
#   - `ENV=x git push origin main`(env-prefix)
# → 漏 fire = SSOT propagation gate 靜默失守。
_ENVP='([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*'
_GITPRE='git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+|-[A-Za-z][^[:space:]]*[[:space:]]+)*push'
_PUSHFLAGS='([[:space:]]+-{1,2}[A-Za-z][^[:space:]]*)*'
if ! echo "$CMD" | grep -qE "(^|[;&|(])[[:space:]]*${_ENVP}${_GITPRE}${_PUSHFLAGS}[[:space:]]+origin[[:space:]]+((HEAD|[^[:space:]:]+):)?(refs/heads/)?main([[:space:]]|$|[;&|)])"; then
  exit 0
fi
if echo "$CMD" | grep -qE 'push\s+origin\s+--delete'; then
  exit 0
fi

# Only fire when in DS repo(packages/design-system/src/ exists);non-DS repo silent skip
CWD=$(pwd)
[ ! -d "$CWD/packages/design-system/src" ] && exit 0

# Detect SSOT-affecting diff in the pushed commit range
# 2026-07-16 硬化:原 HEAD~1..HEAD 只看最後 1 commit — push 多 commit(fast-forward 累積 /
# bump+fix 連發)時漏偵測前面 commits 的 SSOT paths。理想是 @{u}..HEAD,但 PostToolUse 跑在
# push 成功「之後」,remote-tracking ref 已更新到 HEAD → @{u}..HEAD 恆空,不可用。
# 保守改 HEAD~5..HEAD(單次 push >5 commits 在 squash-merge solo workflow 極罕見;
# 淺 history(<5 commits)fallback root commit,不炸)。
RANGE_BASE=$(git rev-parse --verify --quiet HEAD~5 2>/dev/null || git rev-list --max-parents=0 HEAD 2>/dev/null | head -1)
[ -z "$RANGE_BASE" ] && RANGE_BASE="HEAD~1"
SSOT_DIFF=$(git diff --name-only "$RANGE_BASE" HEAD 2>/dev/null | grep -E '^(packages/design-system/src/|packages/storybook-config/(addons/|addons-preset\.ts|preview\.tsx|package\.json)|\.claude/(rules|hooks|skills|commands|references)/|\.claude-plugin/(plugin|marketplace)\.json|hooks/hooks\.json|CLAUDE\.md)' || true)

[ -z "$SSOT_DIFF" ] && exit 0

# Count touched files
SSOT_COUNT=$(echo "$SSOT_DIFF" | wc -l | tr -d ' ')

# Read current package version
PKG_VERSION=$(jq -r '.version' "$CWD/packages/design-system/package.json" 2>/dev/null || echo "unknown")

# 2026-07-11 #79 修:PostToolUse 純 stdout **不注入 AI context**(只進 transcript)→ 原 heredoc 的
# 「AI 必全自動執行」提議到不了 AI = 假 inject。對齊 inject_deploy_url_after_push.sh:236 root-cause fix,
# 收進 MSG 後用 jq hookSpecificOutput.additionalContext 真注入。
MSG=$(cat <<EOF
🔄 SSOT propagation gate(post push origin main):

📊 偵測:${RANGE_BASE:0:12}..HEAD(push range,保守 ≤5 commits)含 $SSOT_COUNT 個 SSOT-affecting file changes
📦 目前 npm version:$PKG_VERSION
🎯 AI 必「全自動執行」(不需 user 再問 / 再確認 — per Step 5.5 2026-06-02 user directive Option A):
   bump → release:preflight → tag → push tag → Release workflow → npm publish → npm view 驗證
   → 24h 內 product-workspace + 所有 fork repo 自動拿最新

Touched(top 5):
$(echo "$SSOT_DIFF" | head -5 | sed 's/^/  - /')

AI 全自動執行步驟(user 已給 merge trigger → 以下不需再問;user 隨時可喊停):
  1. bump packages/design-system/package.json → node scripts/sync-version-to-all-manifests.mjs(同步全 5 manifest)
  2. npm run release:preflight(全過才寫 HEAD-bound pass-marker;R4 hook 認它才放行 tag)
  3. git tag v0.1.0-beta.<N+1> + git push origin main + git push origin v0.1.0-beta.<N+1>
  4. Release workflow auto-fire → npm publish + Dependabot 日常 cross-repo sweep
  5. npm view <pkg> version 驗證真上架(非看 CI 綠燈)

對應 canonical:
  - CLAUDE.md \`# Git solo-work canonical\` Step 5.5
  - .claude/skills/knowledge-prune/SKILL.md「Phase Z」reference
  - .claude/skills/deep-audit-cross-codex/SKILL.md「Phase C」reference
EOF
)
jq -n --arg ctx "$MSG" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$ctx}}'
exit 0

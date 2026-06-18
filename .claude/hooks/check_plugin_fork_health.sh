#!/bin/bash
# check_plugin_fork_health.sh — SessionStart ×2 — fork-user repo plugin 健康(DS repo 內 by-design 早退)
#
# 2026-06-11 prune merge(user 拍板「照你建議做」;59→51 headroom):
# #   r1_plugin_install = 原 check_fork_user_plugin_install.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
#   r2_plugin_freshness = 原 check_plugin_freshness.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
# 原檔 → .claude/hooks/retired/2026-06-11-prune-merge/
# 各規則跑在 pipeline 子 shell:規則內 exit 不中斷其他規則;任一 exit 2 → 整體 exit 2。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")

r1_plugin_install() {
set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)

[ "$EVENT" != "SessionStart" ] && exit 0

CWD=$(pwd)

# (a) 不是 DS repo:無 packages/design-system/src
[ -d "$CWD/packages/design-system/src" ] && exit 0

# (b) package.json 含 DS dep?
[ ! -f "$CWD/package.json" ] && exit 0
if ! grep -q '"@qijenchen/design-system"' "$CWD/package.json" 2>/dev/null; then
  exit 0
fi

# (c) Plugin 已安裝?Anthropic plugin install 可能使用 <plugin> 或
# <plugin>@<marketplace> directory name;accept both.
PLUGIN_INSTALLED=0
# 2026-05-31 fix(infra-audit P1):真實 Claude Code layout = ~/.claude/plugins/marketplaces/<name>/
# + known_marketplaces.json(keyed by marketplace name)。原查 plugins/design-system + 錯的
# .claude/marketplaces(漏 plugins/)= 裝了仍誤判未裝。marketplace name = qijenchen-ds。
MARKETPLACE="qijenchen-ds"
KM="$HOME/.claude/plugins/known_marketplaces.json"
[ -d "$HOME/.claude/plugins/marketplaces/$MARKETPLACE" ] && PLUGIN_INSTALLED=1
[ -d "$CWD/.claude/plugins/marketplaces/$MARKETPLACE" ] && PLUGIN_INSTALLED=1
{ [ -f "$KM" ] && grep -q "\"$MARKETPLACE\"" "$KM"; } && PLUGIN_INSTALLED=1
# legacy / 舊 layout fallback
[ -d "$HOME/.claude/plugins/design-system" ] && PLUGIN_INSTALLED=1
[ -d "$CWD/.claude/plugins/design-system" ] && PLUGIN_INSTALLED=1

if [ "$PLUGIN_INSTALLED" = "1" ]; then
  exit 0
fi

# All YES → fork-user 沒裝 plugin → context inject(SessionStart additional context)
cat <<EOF
🚨 Fork-user plugin not installed — DS governance hooks 不會 fire,憑記憶寫 mock 不會被攔。

偵測:
  cwd = $CWD
  package.json 含 @qijenchen/design-system dep ✅
  ~/.claude/plugins/design-system@qijenchen-ds/ 或 .claude/plugins/design-system@qijenchen-ds/ 不存在 ❌

→ 後果(2026-05-26 anchor event):憑記憶寫 App.tsx mock(漏 SidebarTrigger / collapsible / startIcon /
  tooltip / SidebarFooter)= production-grade fork-user 跑版 anti-pattern。

修法:**session 開始第一件事必跑**
  1. \`/plugin marketplace add github:ajenchen/design-system\`
  2. \`/plugin install design-system@qijenchen-ds\`(or 對應 plugin name per marketplace.json)

跑完 plugin install 後:
  - 59 個 DS governance hooks 自動 fire(M29 anchor preflight / approval-preflight / story_invariants / inject_deploy_url_after_push 等;count snapshot 2026-05-29)
  - DS canonical / rules / skills 從 ~/.claude/plugins/ 可 cross-load
  - Fork-user 寫 App.tsx 時憑記憶寫 mock 會被 mechanical BLOCKER 攔

對應 canonical:
  - product-workspace CLAUDE.md「Fork-and-go onboarding」step 2-3
  - .claude-plugin/marketplace.json
EOF
exit 0
}

r2_plugin_freshness() {
set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)

case "${EVENT:-}" in
  SessionStart) ;;
  *) exit 0 ;;
esac

# Find local plugin.json (DS plugin install path)
PLUGIN_JSON=""
for candidate in \
  "$HOME/.claude/plugins/design-system@qijenchen-ds/plugin.json" \
  "$HOME/.claude/plugins/cache/design-system/plugin.json" \
  "${CLAUDE_PROJECT_DIR:-.}/.claude-plugin/plugin.json"
do
  if [ -f "$candidate" ]; then PLUGIN_JSON="$candidate"; break; fi
done

if [ -z "$PLUGIN_JSON" ]; then exit 0; fi

LOCAL_VERSION=$(jq -r '.version // ""' "$PLUGIN_JSON" 2>/dev/null)
if [ -z "$LOCAL_VERSION" ]; then exit 0; fi

# Fetch latest marketplace.json from GitHub raw (5s timeout, fail silently if offline)
REMOTE_VERSION=$(curl -sS --max-time 5 \
  "https://raw.githubusercontent.com/ajenchen/design-system/main/.claude-plugin/marketplace.json" \
  2>/dev/null | jq -r '.metadata.version // ""' 2>/dev/null)

if [ -z "$REMOTE_VERSION" ] || [ "$REMOTE_VERSION" = "null" ]; then exit 0; fi

if [ "$LOCAL_VERSION" != "$REMOTE_VERSION" ]; then
  cat << EOF

📦 DS governance update available:
   Local installed: $LOCAL_VERSION
   Latest published: $REMOTE_VERSION

Run in terminal (1 command):
  npm run sync-all  # npm install @beta(治理本體)+ 刷新接線骨架(committed launchers + settings + skills);npm-only,免 plugin


(Per user 2026-05-27 directive「DS 增刪改自動同步」— this hook detects staleness on session start.)

EOF
fi

exit 0
}

for _rule in r1_plugin_install r2_plugin_freshness; do
  echo "$INPUT" | "$_rule"
  _rc=$?
  if [ "$_rc" -eq 2 ]; then exit 2; fi
done
exit 0

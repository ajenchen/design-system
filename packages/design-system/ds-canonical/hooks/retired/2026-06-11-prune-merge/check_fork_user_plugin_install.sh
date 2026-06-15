#!/bin/bash
# check_fork_user_plugin_install.sh — SessionStart enforce plugin install on fork-user repos.
#
# 2026-05-26 backfill per user verbatim「我們做那麼多 plugin 不就是要避免這件事?結果還避不了?」
#
# Purpose:當 session 跑在「consumer fork-user repo」(non-DS repo,但 package.json
# 含 @qijenchen/design-system dep)+ 偵測未安裝 design-system plugin → context inject
# 強制提示用 `/plugin marketplace add github:ajenchen/design-system → /plugin install`。
#
# Detection logic:
#   (a) cwd 不是 DS repo(無 packages/design-system/ folder)
#   (b) package.json 含 `"@qijenchen/design-system"` dep
#   (c) `.claude/plugins/design-system@qijenchen-ds/` OR plugin marketplace symlink 不存在
#   → 三題全 YES = consumer fork-user 沒裝 plugin → 強制提示

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

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

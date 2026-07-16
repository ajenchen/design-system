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

# (c) C-prime committed 治理鏈健康?(2026-07-04 dim 58 對齊:主路徑 = committed-config + npm,
# 免 plugin — 2026-06-17 C-prime 改版,plugin 路線不可靠 per memory reference_cloud_governance_loading)
# dispatcher(committed 啟動器)+ manifest(npm ship 治理本體)都在 → 官方 fork hooks 會 fire → 健康。
DISPATCHER="$CWD/.claude/hooks/fork-governance-dispatcher.sh"
MANIFEST="$CWD/node_modules/@qijenchen/design-system/ds-canonical/fork/manifest.json"
if [ -f "$DISPATCHER" ] && [ -f "$MANIFEST" ]; then
  exit 0
fi

# (d) Legacy plugin 路線仍裝著 → 治理可 cross-load,不 nag(marketplaces layout per 2026-05-31 fix)。
MARKETPLACE="qijenchen-ds"
KM="$HOME/.claude/plugins/known_marketplaces.json"
PLUGIN_INSTALLED=0
[ -d "$HOME/.claude/plugins/marketplaces/$MARKETPLACE" ] && PLUGIN_INSTALLED=1
[ -d "$CWD/.claude/plugins/marketplaces/$MARKETPLACE" ] && PLUGIN_INSTALLED=1
{ [ -f "$KM" ] && grep -q "\"$MARKETPLACE\"" "$KM"; } && PLUGIN_INSTALLED=1
[ -d "$HOME/.claude/plugins/design-system" ] && PLUGIN_INSTALLED=1
[ -d "$CWD/.claude/plugins/design-system" ] && PLUGIN_INSTALLED=1
[ "$PLUGIN_INSTALLED" = "1" ] && exit 0

# 治理鏈缺失 → context inject(SessionStart additional context),修法 = npm(免 plugin)
if [ -f "$DISPATCHER" ]; then
  MISSING_DESC="接線骨架(dispatcher)已 commit ✅,但治理本體 manifest 不在 node_modules ❌(還沒 npm install)"
  FIX_CMD="npm install   # 治理本體隨 @qijenchen/design-system ship,裝完 dispatcher 自動跑官方 fork hooks"
else
  MISSING_DESC="C-prime 接線骨架(.claude/hooks/fork-governance-dispatcher.sh)不存在 ❌(fork 尚未 adopt C-prime)"
  FIX_CMD="npm run sync-all   # 從 npm 刷新 committed 啟動器 + settings + skills 骨架;首次啟用只需 npm install"
fi

cat <<EOF
🚨 Fork-user DS 治理鏈未就位 — 官方 fork governance hooks 不會 fire,憑記憶寫 mock 不會被攔。

偵測:
  cwd = $CWD
  package.json 含 @qijenchen/design-system dep ✅
  $MISSING_DESC

→ 後果(2026-05-26 anchor event):憑記憶寫 App.tsx mock(漏 SidebarTrigger / collapsible / startIcon /
  tooltip / SidebarFooter)= production-grade fork-user 跑版 anti-pattern。

修法(**session 開始第一件事,終端跑 1 條;免 /plugin install**):
  $FIX_CMD

就位後:
  - fork-governance-dispatcher.sh 每 event 讀 node_modules 官方 manifest 跑全部 fork 治理 hooks(BLOCKER 會轉發攔截)
  - DS canonical / rules / skills 從 node_modules/@qijenchen/design-system/ds-canonical/ cross-load
  - 憑記憶寫 mock 會被 mechanical BLOCKER 攔

對應 canonical:
  - template CLAUDE.md「🚀 Onboarding(C-prime)」段
  - ds-canonical/fork/manifest.json(build-fork-governance.mjs 生成)
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

# 2026-07-16 dim 75 修:DS repo 本身 early-exit(對齊 r1 guard (a))。原本無此 guard →
# candidate 3(.claude-plugin/plugin.json 在 DS repo 存在)讓 r2 在 DS repo fire,
# 印 `npm run sync-all` 但 DS root package.json 無此 script(sync-all 是 fork/template 的
# consumer script,見 template/ds-product-template/package.json)= 指引斷鏈;
# 且 DS repo 是 SSOT 源頭,local 版本領先 published 是開發常態,不該 nag。
[ -d "$(pwd)/packages/design-system/src" ] && exit 0

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
  # 2026-07-16 dim 75:指令按「指引在哪個 repo 語境印」推導,不 hardcode `npm run sync-all`
  # (template-based fork 有此 script;老 fork / 部分裝態可能只有 scripts/sync-all.mjs 或都沒有)。
  if jq -e '.scripts["sync-all"]' package.json >/dev/null 2>&1; then
    SYNC_CMD="npm run sync-all"
  elif [ -f scripts/sync-all.mjs ]; then
    SYNC_CMD="node scripts/sync-all.mjs"
  else
    SYNC_CMD="npm install @qijenchen/design-system@beta @qijenchen/storybook-config@beta --legacy-peer-deps"
  fi
  cat << EOF

📦 DS governance update available:
   Local installed: $LOCAL_VERSION
   Latest published: $REMOTE_VERSION

Run in terminal (1 command):
  $SYNC_CMD  # npm install @beta(治理本體)+ 刷新接線骨架(committed launchers + settings + skills);npm-only,免 plugin


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

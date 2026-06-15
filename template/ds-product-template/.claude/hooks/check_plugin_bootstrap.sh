#!/bin/bash
# check_plugin_bootstrap.sh — Fork-committed SessionStart 提醒(2026-05-30 per user「盡可能確保使用者按規範流程做合規產品」)
#
# Why committed in fork(非靠 plugin):DS governance plugin 的硬性 hook 隨 plugin 一起裝 → 沒裝前無任何
# mechanical 防線(chicken-egg)。本 hook + block_production_edit_without_plugin.sh 是 fork 自帶、不依賴 plugin
# 的 bootstrap 層,補 first-time gap。對應 CLAUDE.md「🛑 第 −1 步:Plugin install BLOCKER」。
#
# fail-open:純提醒,任何情況 exit 0,絕不擋 session。plugin 裝了 → silent。
set -uo pipefail

HOME_DIR="${HOME:-$(echo ~)}"
CWD="$(pwd)"
# 2026-05-31 fix(infra-audit P1):真實 Claude Code layout = marketplaces/<name>/ + known_marketplaces.json
# (原查 plugins/design-system 路徑從不存在 → 裝了仍每 session 誤提醒)。marketplace name = qijenchen-ds。
MARKETPLACE="qijenchen-ds"
KM="$HOME_DIR/.claude/plugins/known_marketplaces.json"
if [ -d "$HOME_DIR/.claude/plugins/marketplaces/$MARKETPLACE" ] \
   || [ -d "$CWD/.claude/plugins/marketplaces/$MARKETPLACE" ] \
   || { [ -f "$KM" ] && grep -q "\"$MARKETPLACE\"" "$KM"; } \
   || [ -d "$HOME_DIR/.claude/plugins/design-system" ]; then
  exit 0   # 已裝 → silent
fi

cat <<'EOF'
🛑 DS governance plugin 尚未安裝 — 用 Claude 做產品前必先裝(否則沒有設計原則 / SSOT 的機械防線,
   AI 會憑記憶寫出跑版 mock,2026-05-26 anchor)。

   1. /plugin marketplace add github:ajenchen/design-system
   2. /plugin install design-system@qijenchen-ds
   3. 裝完 restart session(plugin/addon 需 restart 才 apply)

   裝好後拿到:22 skills + 52 hooks + 31 M-rules + 88 audit dims 全套 governance。
   詳 CLAUDE.md「🛑 第 −1 步」。本提醒由 fork 自帶 bootstrap hook 觸發(不依賴 plugin)。
EOF
exit 0

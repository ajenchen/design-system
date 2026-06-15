#!/bin/bash
# block_production_edit_without_plugin.sh — Fork-committed PreToolUse 硬攔(2026-05-30 per user「盡可能確保使用者按規範流程」)
#
# 沒裝 DS plugin 時,硬攔對 production product code(apps/**)的 Edit/Write。把 CLAUDE.md「沒裝 plugin 不准動
# production code」的軟指示變成真 mechanical first-time gate。committed in fork,不依賴 plugin(補 chicken-egg)。
# 對應 CLAUDE.md「🛑 第 −1 步」+ design-system-audit Dim 58(fork-user plugin install enforcement)。
#
# scope:只攔 apps/** 的 .tsx/.ts/.css(產品 code);讀檔 / config / docs 不攔。
# fail-open on parse error;escape: CLAUDE_BYPASS_PLUGIN_BOOTSTRAP=1(極罕見,如純 prototype)。
set -uo pipefail

INPUT=$(cat 2>/dev/null || echo '{}')

# 可攜 JSON parse(fork 必有 node)
FILE=$(printf '%s' "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log((j.tool_input&&j.tool_input.file_path)||'')}catch{console.log('')}})" 2>/dev/null || echo "")

# 只 gate production product code
case "$FILE" in
  */apps/*.tsx|*/apps/*.ts|*/apps/*.css|apps/*.tsx|apps/*.ts|apps/*.css) ;;
  *) exit 0 ;;
esac

# escape
[ "${CLAUDE_BYPASS_PLUGIN_BOOTSTRAP:-0}" = "1" ] && exit 0

HOME_DIR="${HOME:-$(echo ~)}"
CWD="$(pwd)"
# 2026-05-31 fix(infra-audit P1):原查 ~/.claude/plugins/design-system = Claude Code 從不建的路徑,
# fork user 正確裝 plugin 後仍永久誤擋。真實 layout:marketplace cloned 到 ~/.claude/plugins/marketplaces/<name>/
# + 記在 known_marketplaces.json(keyed by marketplace name)。我們 marketplace name = qijenchen-ds。
MARKETPLACE="qijenchen-ds"
KM="$HOME_DIR/.claude/plugins/known_marketplaces.json"
if [ -d "$HOME_DIR/.claude/plugins/marketplaces/$MARKETPLACE" ] \
   || [ -d "$CWD/.claude/plugins/marketplaces/$MARKETPLACE" ] \
   || { [ -f "$KM" ] && grep -q "\"$MARKETPLACE\"" "$KM"; } \
   || [ -d "$HOME_DIR/.claude/plugins/design-system" ]; then
  exit 0   # 已裝 → 放行(plugin 自己的 hook 接手)
fi

# 沒裝 + 改 production code → BLOCK
cat >&2 <<'EOF'
🚨 BLOCKER:DS governance plugin 未安裝,不准改 production code(apps/**)。

  沒裝 plugin = 沒有 22 skills + 52 hooks 的設計原則 / SSOT 機械防線
  → AI 會寫出不合規 mock(漏 SidebarTrigger / startIcon / 視覺跑版,2026-05-26 anchor)。

  先裝(Claude session 內):
    1. /plugin marketplace add github:ajenchen/design-system
    2. /plugin install design-system@qijenchen-ds
    3. restart session

  詳 CLAUDE.md「🛑 第 −1 步:Plugin install BLOCKER」。
  Escape(極罕見,純 prototype 才用): 設環境變數 CLAUDE_BYPASS_PLUGIN_BOOTSTRAP=1
EOF
exit 2

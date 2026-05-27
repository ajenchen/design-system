#!/bin/bash
# check_plugin_freshness.sh — SessionStart soft notice
#
# Detect if installed DS plugin version is behind latest marketplace.json on GitHub
# → notify fork user to run `/plugin marketplace update + /plugin install latest`.
#
# Per user 2026-05-27 verbatim「DS push main 一律自動同步 PW」directive.
# Claude Code SDK 沒 auto-poll marketplace mechanism — workaround: session_start
# 偵測 staleness → prompt user 手動 update。
#
# Mechanism:
#   1. Read local plugin.json version
#   2. Fetch latest DS marketplace.json from GitHub raw (no auth needed for public repo)
#   3. Compare versions → if behind → emit notice to stdout (visible in session start)
#
# Soft notice only (exit 0) — doesn't block. Fork user decides when to update.

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

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

📦 DS plugin update available:
   Local installed: $LOCAL_VERSION
   Latest published: $REMOTE_VERSION

Run in terminal (1 command):
  npm run sync-all  # npm + plugin marketplace + plugin install + restart prompt


(Per user 2026-05-27 directive「DS 增刪改自動同步」— this hook detects staleness on session start.)

EOF
fi

exit 0

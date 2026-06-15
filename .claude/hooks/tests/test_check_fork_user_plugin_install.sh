#!/bin/bash
# 2026-06-11 repoint:check_fork_user_plugin_install.sh 已合併進 check_plugin_fork_health.sh(prune merge;測試 payload 不變 = 行為等價驗證)
# Tests for check_plugin_fork_health.sh — SessionStart enforce fork-user repo install plugin.

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_plugin_fork_health.sh"
[ ! -f "$HOOK" ] && { echo "FATAL: hook not found"; exit 1; }
PASS=0; FAIL=0; FAILED=""

# Test 1:DS repo(有 packages/design-system/src)→ silent
echo "Test 1: DS repo skip"
TMP=$(mktemp -d); mkdir -p "$TMP/packages/design-system/src"
echo '{"@qijenchen/design-system":"^1"}' > "$TMP/package.json"
STDOUT=$(cd "$TMP" && echo '{"hook_event_name":"SessionStart"}' | bash "$HOOK")
if [ -z "$STDOUT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL: unexpected output"; FAIL=$((FAIL+1)); fi
rm -rf "$TMP"

# Test 2:non-DS repo + 無 DS dep → silent
echo "Test 2: non-DS repo without DS dep"
TMP=$(mktemp -d); echo '{"react":"^18"}' > "$TMP/package.json"
STDOUT=$(cd "$TMP" && echo '{"hook_event_name":"SessionStart"}' | bash "$HOOK")
if [ -z "$STDOUT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL: unexpected output"; FAIL=$((FAIL+1)); fi
rm -rf "$TMP"

# Test 3:non-DS + 含 DS dep + plugin 未裝 → context inject
echo "Test 3: fork-user without plugin → inject"
TMP=$(mktemp -d); echo '{"dependencies":{"@qijenchen/design-system":"^1"}}' > "$TMP/package.json"
# Override HOME/CWD so plugin install detect 一定 fail
STDOUT=$(cd "$TMP" && HOME=/tmp/no-plugin echo '{"hook_event_name":"SessionStart"}' | bash "$HOOK")
if echo "$STDOUT" | grep -q "Fork-user plugin not installed"; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: no inject (output: ${STDOUT:0:200})"; FAIL=$((FAIL+1))
fi
rm -rf "$TMP"

# Test 4:non-SessionStart event → silent
echo "Test 4: non-SessionStart event skip"
STDOUT=$(echo '{"hook_event_name":"PreToolUse"}' | bash "$HOOK")
if [ -z "$STDOUT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL"; FAIL=$((FAIL+1)); fi

echo ""
echo "════ Results: $PASS PASS, $FAIL FAIL ════"
[ "$FAIL" -gt 0 ] && exit 1
exit 0

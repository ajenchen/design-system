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
STDOUT=$(cd "$TMP" && echo '{"hook_event_name":"SessionStart"}' | GOVERNANCE_PROJECT_DIR="$TMP" GOVERNANCE_PROVIDER=claude bash "$HOOK")
if [ -z "$STDOUT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL: unexpected output"; FAIL=$((FAIL+1)); fi
rm -rf "$TMP"

# Test 2:non-DS repo + 無 DS dep → silent
echo "Test 2: non-DS repo without DS dep"
TMP=$(mktemp -d); echo '{"react":"^18"}' > "$TMP/package.json"
STDOUT=$(cd "$TMP" && echo '{"hook_event_name":"SessionStart"}' | GOVERNANCE_PROJECT_DIR="$TMP" GOVERNANCE_PROVIDER=claude bash "$HOOK")
if [ -z "$STDOUT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL: unexpected output"; FAIL=$((FAIL+1)); fi
rm -rf "$TMP"

# Test 3:non-DS + 含 DS dep + plugin 未裝 → context inject
echo "Test 3: fork-user without plugin → inject"
TMP=$(mktemp -d); echo '{"dependencies":{"@qijenchen/design-system":"^1"}}' > "$TMP/package.json"
# Override HOME/CWD so plugin install detect 一定 fail
STDOUT=$(cd "$TMP" && echo '{"hook_event_name":"SessionStart"}' | HOME="$TMP/empty-home" GOVERNANCE_PROJECT_DIR="$TMP" GOVERNANCE_PROVIDER=claude bash "$HOOK")
# 2026-07-07 修 stale needle:hook 訊息 2026-06 演進為「Fork-user DS 治理鏈未就位」,
# 舊 needle「Fork-user plugin not installed」永 FAIL(main 既存紅;hook 行為本身正確)。
if echo "$STDOUT" | grep -q "Fork-user DS 治理鏈未就位"; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: no inject (output: ${STDOUT:0:200})"; FAIL=$((FAIL+1))
fi
rm -rf "$TMP"

# Test 4:non-SessionStart event → silent
echo "Test 4: non-SessionStart event skip"
STDOUT=$(echo '{"hook_event_name":"PreToolUse"}' | GOVERNANCE_PROVIDER=claude bash "$HOOK")
if [ -z "$STDOUT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL"; FAIL=$((FAIL+1)); fi

# Test 5:Codex 不讀 Claude HOME;poisoned ~/.claude 不得讓缺 runtime 的 consumer 誤判健康。
echo "Test 5: Codex outcome is invariant to poisoned Claude HOME"
TMP=$(mktemp -d)
mkdir -p "$TMP/home"
echo '{"dependencies":{"@qijenchen/design-system":"^1"}}' > "$TMP/package.json"
BASELINE=$(cd "$TMP" && echo '{"hook_event_name":"SessionStart"}' | \
  HOME="$TMP/home" GOVERNANCE_PROJECT_DIR="$TMP" GOVERNANCE_PROVIDER=codex bash "$HOOK")
mkdir -p \
  "$TMP/home/.claude/plugins/marketplaces/qijenchen-ds" \
  "$TMP/home/.claude/plugins/design-system" \
  "$TMP/home/.claude/plugins/design-system@qijenchen-ds" \
  "$TMP/home/.claude/plugins/cache/design-system" \
  "$TMP/.claude/plugins/design-system" \
  "$TMP/bin"
printf '{"qijenchen-ds":{}}\n' > "$TMP/home/.claude/plugins/known_marketplaces.json"
printf '{"version":"0.0.0-poison"}\n' > "$TMP/home/.claude/plugins/design-system@qijenchen-ds/plugin.json"
printf '{"version":"0.0.0-poison"}\n' > "$TMP/home/.claude/plugins/cache/design-system/plugin.json"
printf '#!/bin/sh\n: > "$CURL_MARKER"\n' > "$TMP/bin/curl"
chmod +x "$TMP/bin/curl"
CURL_MARKER="$TMP/curl-called"
POISONED=$(cd "$TMP" && echo '{"hook_event_name":"SessionStart"}' | \
  HOME="$TMP/home" PATH="$TMP/bin:$PATH" CURL_MARKER="$CURL_MARKER" \
  GOVERNANCE_PROJECT_DIR="$TMP" GOVERNANCE_PROVIDER=codex bash "$HOOK")
CODEX_CALLED_CLAUDE_PROBE=0
[ -e "$CURL_MARKER" ] && CODEX_CALLED_CLAUDE_PROBE=1
CLAUDE_COMPAT=$(cd "$TMP" && echo '{"hook_event_name":"SessionStart"}' | \
  HOME="$TMP/home" PATH="$TMP/bin:$PATH" CURL_MARKER="$CURL_MARKER" \
  GOVERNANCE_PROJECT_DIR="$TMP" GOVERNANCE_PROVIDER=claude bash "$HOOK")
if [ "$BASELINE" = "$POISONED" ] && echo "$POISONED" | grep -q "Fork-user DS 治理鏈未就位" \
  && [ "$CODEX_CALLED_CLAUDE_PROBE" = "0" ] \
  && echo "$CLAUDE_COMPAT" | grep -q "Fork-user DS 治理鏈未就位" \
  && [ -e "$CURL_MARKER" ]; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: Codex read Claude-only compatibility state"; FAIL=$((FAIL+1))
fi
rm -rf "$TMP"

# Test 6:A future provider is admitted by registry data and follows the neutral npm path.
echo "Test 6: future provider is registry-driven and ignores Claude plugin state"
TMP=$(mktemp -d)
mkdir -p "$TMP/home/.claude/plugins/design-system" "$TMP/corpus"
echo '{"dependencies":{"@qijenchen/design-system":"^1"}}' > "$TMP/package.json"
cat > "$TMP/corpus/providers.json" <<'EOF'
{"providers":[{"id":"orion","instructionEntry":"ORION.md"}]}
EOF
STDOUT=$(cd "$TMP" && echo '{"hook_event_name":"SessionStart"}' | HOME="$TMP/home" \
  GOVERNANCE_PROJECT_DIR="$TMP" GOVERNANCE_CORPUS_ROOT="$TMP/corpus" GOVERNANCE_PROVIDER_REGISTRY=providers.json \
  GOVERNANCE_PROVIDER=orion bash "$HOOK")
if echo "$STDOUT" | grep -q "Fork-user DS 治理鏈未就位"; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: future provider was coupled to Claude plugin state"; FAIL=$((FAIL+1))
fi
rm -rf "$TMP"

# Test 7:The normalized project root, not the shell's incidental cwd, owns consumer detection.
echo "Test 7: project-root semantics are invariant to cwd"
TMP=$(mktemp -d)
mkdir -p "$TMP/project" "$TMP/incidental-cwd" "$TMP/home"
echo '{"dependencies":{"@qijenchen/design-system":"^1"}}' > "$TMP/project/package.json"
PROJECT_REAL=$(cd "$TMP/project" && pwd -P)
STDOUT=$(cd "$TMP/incidental-cwd" && echo '{"hook_event_name":"SessionStart"}' | \
  HOME="$TMP/home" GOVERNANCE_PROJECT_DIR="$TMP/project" GOVERNANCE_PROVIDER=codex bash "$HOOK")
if echo "$STDOUT" | grep -q "Fork-user DS 治理鏈未就位" \
  && echo "$STDOUT" | grep -Fq "cwd = $PROJECT_REAL"; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: hook mixed cwd with canonical project root"; FAIL=$((FAIL+1))
fi
rm -rf "$TMP"

echo "Test 8: exact-version setup guidance never falls back to a mutable tag"
TMP=$(mktemp -d)
mkdir -p "$TMP/governance/bin" "$TMP/home"
printf '%s\n' '{"dependencies":{"@qijenchen/design-system":"1.2.3"},"scripts":{"setup:all":"node scripts/setup-workspace.mjs","setup:governance":"node scripts/setup-governance.mjs"}}' > "$TMP/package.json"
: > "$TMP/governance/bin/fork-governance-dispatcher.sh"
STDOUT=$(cd "$TMP" && echo '{"hook_event_name":"SessionStart"}' | \
  HOME="$TMP/home" GOVERNANCE_PROJECT_DIR="$TMP" GOVERNANCE_PROVIDER=claude bash "$HOOK")
if echo "$STDOUT" | grep -q "npm run setup:all" \
  && ! echo "$STDOUT" | grep -Eq '@beta|npm install @qijenchen/.+@' \
  && ! grep -Eq '@beta|npm install @qijenchen/.+@' "$HOOK"; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: guidance was not exact-version setup only"; FAIL=$((FAIL+1))
fi
rm -rf "$TMP"

echo "Test 9: pre-setup:all consumers retain an exact legacy fallback"
TMP=$(mktemp -d)
mkdir -p "$TMP/governance/bin" "$TMP/home"
printf '%s\n' '{"dependencies":{"@qijenchen/design-system":"1.2.3"},"scripts":{"setup:governance":"node scripts/setup-governance.mjs"}}' > "$TMP/package.json"
: > "$TMP/governance/bin/fork-governance-dispatcher.sh"
STDOUT=$(cd "$TMP" && echo '{"hook_event_name":"SessionStart"}' | \
  HOME="$TMP/home" GOVERNANCE_PROJECT_DIR="$TMP" GOVERNANCE_PROVIDER=claude bash "$HOOK")
if echo "$STDOUT" | grep -q "npm run setup:governance" \
  && echo "$STDOUT" | grep -q "legacy consumer fallback"; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: legacy exact-version setup fallback disappeared"; FAIL=$((FAIL+1))
fi
rm -rf "$TMP"

echo ""
echo "════ Results: $PASS PASS, $FAIL FAIL ════"
[ "$FAIL" -gt 0 ] && exit 1
exit 0

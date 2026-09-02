#!/bin/bash
# test_record_release_consent.sh — 發版同意 receipt hook:同意詞落地、問句不落地、否定撤回、main 不落地
set -u
HOOK="$(cd "$(dirname "$0")/.." && pwd)/record_release_consent.sh"
TMP=$(mktemp -d)
PASS=0; FAIL=0
cd "$TMP" && git init -q . && git config user.email t@t && git config user.name t && git commit -q --allow-empty -m init && git switch -q -c claude/feature
HEAD=$(git rev-parse HEAD)
run() { printf '{"prompt":%s}' "$(printf '%s' "$1" | jq -Rs .)" | bash "$HOOK"; }
check() { if [ "$2" = "yes" ] && [ -f ".git/governance-runtime/release-consent/$HEAD.json" ]; then echo "  PASS  $1"; PASS=$((PASS+1)); elif [ "$2" = "no" ] && [ ! -f ".git/governance-runtime/release-consent/$HEAD.json" ]; then echo "  PASS  $1"; PASS=$((PASS+1)); else echo "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }
run "要不要發版?" >/dev/null; check "1. 問句「要不要發版?」→ 不落地" no
run "可以發版了" >/dev/null; check "2. 「可以發版了」→ 落地" yes
grep -q '"source": "user-prompt-hook"' ".git/governance-runtime/release-consent/$HEAD.json" && { echo "  PASS  3. receipt 含 source"; PASS=$((PASS+1)); } || { echo "  FAIL  3. receipt 含 source"; FAIL=$((FAIL+1)); }
run "先不要發版,我再看看" >/dev/null; check "4. 否定「先不要發版」→ 撤回" no
run "發版" >/dev/null; check "5. 單字「發版」→ 落地" yes
git switch -q main 2>/dev/null || git switch -q master; rm -f ".git/governance-runtime/release-consent/$HEAD.json"; run "發版" >/dev/null; check "6. 在 main 上說「發版」→ 不落地" no
echo "Passed: $PASS / $((PASS+FAIL))"
rm -rf "$TMP"
[ "$FAIL" -eq 0 ]

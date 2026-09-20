#!/bin/bash
# test_record_release_consent.sh — 發版同意 receipt hook
#
# 2026-09-20:receipt 由綁 commit 改為綁**分支**(= 該 PR)。原本檔名是 <headSha>.json,而發版
# 必然產生新 commit(版號 bump 是必要步驟、CI 紅了修一次又一版),於是 user 為同一份工作被迫
# 一再重講「發版」。本測試除了原本六格,另加兩格釘死改動的重點:
#   7. 同一分支上再 commit → receipt 仍在(這格就是 user 不必重講的保證)
#   8. 換到另一條分支 → 那條分支沒有 receipt(換一份工作仍要重新同意;2026-09-02 事故就是這格)
set -u
HOOK="$(cd "$(dirname "$0")/.." && pwd)/record_release_consent.sh"
TMP=$(mktemp -d)
PASS=0; FAIL=0
cd "$TMP" && git init -q . && git config user.email t@t && git config user.name t && git commit -q --allow-empty -m init && git switch -q -c claude/feature
DIR=".git/governance-runtime/release-consent"
FILE="$DIR/branch__claude_feature.json"
run() { printf '{"prompt":%s}' "$(printf '%s' "$1" | jq -Rs .)" | bash "$HOOK"; }
check() { if [ "$2" = "yes" ] && [ -f "$3" ]; then echo "  PASS  $1"; PASS=$((PASS+1)); elif [ "$2" = "no" ] && [ ! -f "$3" ]; then echo "  PASS  $1"; PASS=$((PASS+1)); else echo "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }
assert() { if [ "$2" = "0" ]; then echo "  PASS  $1"; PASS=$((PASS+1)); else echo "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

run "要不要發版?" >/dev/null; check "1. 問句「要不要發版?」→ 不落地" no "$FILE"
run "可以發版了" >/dev/null; check "2. 「可以發版了」→ 落地" yes "$FILE"
grep -q '"source": "user-prompt-hook"' "$FILE" 2>/dev/null; assert "3. receipt 含 source" $?
run "先不要發版,我再看看" >/dev/null; check "4. 否定「先不要發版」→ 撤回" no "$FILE"
run "發版" >/dev/null; check "5. 單字「發版」→ 落地" yes "$FILE"

# 6. receipt 必須綁分支且帶同意當下的 head(供 orchestrator 判斷「同意之後預覽有沒有變」)
grep -q '"schemaVersion": 2' "$FILE" 2>/dev/null && grep -q '"branch": "claude/feature"' "$FILE" 2>/dev/null && grep -q '"consentedHeadSha"' "$FILE" 2>/dev/null
assert "6. receipt 綁分支(schemaVersion 2 + branch + consentedHeadSha)" $?

# 7. **改動重點**:同一分支上又出現新 commit(版號 bump / CI 修正)→ receipt 仍在,user 不必重講
git commit -q --allow-empty -m "release: bump version"
check "7. 同分支新 commit 後 receipt 仍在(user 不必重講)" yes "$FILE"

# 8. **防線仍在**:換一條分支 = 換一份工作 → 那條分支沒有 receipt
git switch -q -c claude/other
check "8. 換分支後該分支無 receipt(仍需重新同意)" no "$DIR/branch__claude_other.json"
git switch -q claude/feature

# 9. main 上永不落地
git switch -q main 2>/dev/null || git switch -q -c main
rm -f "$FILE"; run "發版" >/dev/null; check "9. 在 main 上說「發版」→ 不落地" no "$DIR/branch__main.json"

echo "Passed: $PASS / $((PASS+FAIL))"
rm -rf "$TMP"
[ "$FAIL" -eq 0 ]

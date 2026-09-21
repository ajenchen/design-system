#!/bin/bash
# test_record_release_consent.sh — 發版同意 receipt hook
#
# 2026-09-20 第二次改寫。綁定對象的演進與理由見 hook 檔頭;本測試只釘住**行為**:
#   · 判準與 agent 手動落地共用同一份(infra/governance/release-workflow.json)
#   · 同意綁「預覽內容」,不綁 commit 也不綁分支 → 換分支、加 commit 都不必重講
#   · 問句不記錄**也不撤回**,而且必須出聲(靜默丟棄是 user 連續暴怒的直接原因)
#   · 否定詞要帶發版受詞:「不要發生問題」不得被當成撤回
#   · A-不-A 問句「要不要發版」字面內嵌「不要發版」,不得被當成撤回
#
# **隔離**:先前版本 `TMP=$(mktemp -d)` 沒有守衛,沙箱裡 mktemp 失敗回空 → `cd ""` 留在真 repo
# → 測試把 user 真正的同意收據覆寫/刪除(2026-09-20 實際發生三次)。現在兩道:
#   1. mktemp 結果必須非空且是目錄,否則整支測試 fail(不是靜默繼續)
#   2. GOVERNANCE_RELEASE_CONSENT_DIR 導向沙箱,並在最後**驗證真 repo 的收據沒被動過**
set -u
HOOK="$(cd "$(dirname "$0")/.." && pwd)/record_release_consent.sh"
REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
REAL_CONSENT="$REPO_ROOT/.git/governance-runtime/release-consent"
PASS=0; FAIL=0

# 帶明確樣板:macOS 的 mktemp 在無樣板時走 confstr 暫存目錄(不吃 TMPDIR),沙箱下會 EPERM
# 而回空字串 —— 那正是先前 `cd ""` 留在真 repo 的原因(失敗索引有記)。
TMP=$(mktemp -d "${TMPDIR:-/tmp}/consent-hook-test.XXXXXX" 2>/dev/null || echo "")
if [ -z "$TMP" ] || [ ! -d "$TMP" ]; then
  echo "  FAIL  mktemp -d 沒有給出可用目錄 —— 沒有隔離就不准往下跑(會動到真 repo 的同意收據)"
  exit 1
fi
export GOVERNANCE_RELEASE_CONSENT_DIR="$TMP/consent"
FILE="$GOVERNANCE_RELEASE_CONSENT_DIR/current.json"

# 真 repo 收據的事前指紋(最後要驗它沒被動過)
real_fingerprint() { ls -1 "$REAL_CONSENT" 2>/dev/null | sort | shasum -a 256 | cut -d' ' -f1; }
REAL_BEFORE=$(real_fingerprint)

cd "$TMP" && git init -q . && git config user.email t@t && git config user.name t \
  && git commit -q --allow-empty -m init && git switch -q -c claude/feature

run() { printf '{"prompt":%s}' "$(printf '%s' "$1" | jq -Rs .)" | bash "$HOOK"; }
check() { if [ "$2" = "yes" ] && [ -f "$3" ]; then echo "  PASS  $1"; PASS=$((PASS+1));
          elif [ "$2" = "no" ] && [ ! -f "$3" ]; then echo "  PASS  $1"; PASS=$((PASS+1));
          else echo "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }
assert() { if [ "$2" = "0" ]; then echo "  PASS  $1"; PASS=$((PASS+1)); else echo "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

# 1. A-不-A 問句:不記錄
run "要不要發版?" >/dev/null; check "1. 「要不要發版?」→ 不落地" no "$FILE"
# 2. 而且必須**出聲**(靜默丟棄 = user 以為自己授權了)
run "要不要發版?" 2>/dev/null | grep -q "未記錄為同意"; assert "2. 問句必須印出「未記錄為同意」" $?
# 3. 明確同意 → 落地
run "可以發版了" >/dev/null; check "3. 「可以發版了」→ 落地" yes "$FILE"
# 4. 綁的是預覽內容,不是 commit / 分支
grep -q '"schemaVersion": 3' "$FILE" 2>/dev/null && grep -q '"productDigest"' "$FILE" 2>/dev/null
assert "4. receipt 綁預覽內容指紋(schemaVersion 3 + productDigest)" $?
# 5. 否定 → 撤回
run "先不要發版,我再看看" >/dev/null; check "5. 「先不要發版」→ 撤回" no "$FILE"
# 6. 否定詞必須帶發版受詞:「不要發生問題」不是撤回
run "發版吧,但不要發生問題" >/dev/null; check "6. 「不要發生問題」不得被當成撤回" yes "$FILE"
# 7. A-不-A 問句不得撤回既有同意(字面內嵌「不要發版」)
run "要不要發版?" >/dev/null; check "7. 「要不要發版?」不得撤回既有同意" yes "$FILE"
# 8. 換一條分支:同一份預覽內容 → 同意仍然成立(**user 不必重講**)
git switch -q -c claude/another-branch
run "隨便講點別的" >/dev/null; check "8. 換分支後同意仍在(綁內容不綁分支)" yes "$FILE"
# 9. 主張早就同意過(帶問號)→ 仍算同意
rm -f "$FILE"
run "我他媽到底要講幾次發版?" >/dev/null; check "9. 「到底要講幾次發版?」→ 算同意" yes "$FILE"
# 9b. **detached HEAD**(GitHub Actions 的常態)—— 本機永遠在有名字的分支上,所以這一面
#     在本機永遠測不到。2026-09-20 就是這樣:本機 12/12 綠,hooks-linux 六格紅。
rm -f "$FILE"
git switch -q --detach HEAD
run "發版" >/dev/null; check "9b. detached HEAD 仍能落地(branch 只是出處紀錄)" yes "$FILE"
git switch -q claude/another-branch

# 9c. **條件 / 延後**的說法不得落地,而且必須出聲(2026-09-21 對抗稽核:
#     先前這類會被判成「現在就發版」並寫出有效收據 —— 連 SSOT 自己存的 userVerbatim 都會)
rm -f "$FILE"
run "等我看完預覽再發版" >/dev/null; check "9c. 「等我看完預覽再發版」→ 不落地" no "$FILE"
run "等我看完預覽再發版" 2>/dev/null | grep -q "條件或延後"; assert "9d. 條件句必須印出「條件或延後」" $?
# 9e. 純問句那條路(先前沒覆蓋,把 SSOT 的問句判準停用它照樣全綠)
run "現在可以發版嗎?" >/dev/null; check "9e. 「現在可以發版嗎?」→ 不落地" no "$FILE"
run "發版" >/dev/null; check "9f. 「發版」→ 落地" yes "$FILE"

# 10. 判準來自 SSOT,不是 hook 自己寫的 regex
grep -q "release-consent-language.mjs" "$HOOK"; assert "10. hook 消費共用判準(不自己寫 regex)" $?
grep -qE "grep -qE '\(發版\|" "$HOOK"; [ $? -ne 0 ]; assert "11. hook 內不得殘留自己的同意詞 regex" $?

# 11b. hook 落地的收據必須自報出處 —— 不得跟 agent 手動落地混為一談(2026-09-21)。
# 兩條路的判準相同,但可信度不同:前者是 user 當場打進對話的字,後者是 agent **宣稱** user 說過。
grep -q -- "--source hook-user-prompt" "$HOOK"; assert "11b. hook 落地自報出處(--source hook-user-prompt)" $?

# 12. **隔離對照**:整支測試跑完,真 repo 的同意收據必須完全沒被動過
REAL_AFTER=$(real_fingerprint)
[ "$REAL_BEFORE" = "$REAL_AFTER" ]; assert "12. 測試全程沒有動到真 repo 的同意收據" $?

cd / && rm -rf "$TMP"
echo "  ── $PASS passed / $FAIL failed"
[ "$FAIL" -eq 0 ]

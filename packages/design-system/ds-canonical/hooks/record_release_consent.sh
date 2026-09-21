#!/bin/bash
# record_release_consent.sh — UserPromptSubmit:user 在對話說「發版」→ 落地發版同意 receipt
#
# Why(2026-09-02 user verbatim):「按照我們規定的工作流程應該是你要先把我們討論的東西部署到 netlify,
# 等我確認後認為都沒問題,主動說要發版,你才會 push 到 GitHub main 同時更新 GitHub 上的 storybook 並發版到 NPM」
#
# ── 綁定對象的兩次修正(別再改錯方向)──────────────────────────────────────
# v1 綁 commit:發版必然產生新 commit(版號 bump、CI 修正),user 為同一份工作被迫一再重講。
# v2 綁分支:改完之後立刻開了新分支,又要一次同意 —— **問題只是換地方發作**。
# v3 綁 **user 看過並認可的預覽內容**(2026-09-20):commit 與分支都是 agent 切工作的單位,
#    不是 user 授權的單位。內容沒變 → 跨 commit、跨分支都算數;內容變了 → 必須重新確認。
#
# ── 判準只有一份 ───────────────────────────────────────────────────────────
# 同意詞／問句／否定／「早就說過了」的判定全部住在 infra/governance/release-workflow.json,
# 由 scripts/lib/release-consent-language.mjs 唯一實作,**hook 與 agent 手動落地共用同一支**。
# 本檔不再自己寫 regex —— 2026-09-20 稽核實證:三方各寫一套的結果是
# 「問句／否定不算同意」只在 hook 這條路存在,agent 走手動路徑完全繞過(14 筆收據 10 筆如此)。
#
# ── 不得靜默 ───────────────────────────────────────────────────────────────
# 偵測到發版意圖卻不受理時**必須印出來**。靜默丟棄比擋下來更糟:user 以為講過了,
# agent 以為沒講,於是 user 再講一次、再一次 —— 那正是他連續兩天暴怒的原因。
set -u
INPUT=$(cat 2>/dev/null || echo '{}')
PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // ""' 2>/dev/null || echo "")
[ -z "$PROMPT" ] && exit 0
# 腳本位置由**本檔自己的位置**推出(hooks 在 packages/design-system/ds-canonical/hooks/),
# 不從 cwd 的 git toplevel 推 —— 測試會在 fixture repo 裡跑,那裡沒有這些腳本。
# 收據要寫去哪則由 GOVERNANCE_RELEASE_CONSENT_DIR 決定(測試導向自己的沙箱)。
SELF_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SELF_DIR/../../../.." && pwd)
LANG_CLI="$REPO_ROOT/scripts/lib/release-consent-language.mjs"
ORCH="$REPO_ROOT/scripts/release-orchestrator.mjs"
[ -f "$LANG_CLI" ] || exit 0
[ -f "$ORCH" ] || exit 0
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0

VERDICT=$(printf '%s' "$PROMPT" | node "$LANG_CLI" 2>/dev/null | head -1)
KIND=${VERDICT%%	*}
REASON=${VERDICT#*	}
[ -z "$KIND" ] && exit 0
[ "$KIND" = "none" ] && exit 0

BRANCH=$(git -C "$ROOT" branch --show-current 2>/dev/null || echo "")

case "$KIND" in
  withdraw)
    OUT=$(cd "$REPO_ROOT" && node "$ORCH" withdraw 2>/dev/null || echo "")
    if printf '%s' "$OUT" | grep -q RELEASE_CONSENT_WITHDRAWN; then
      echo "🛑 已撤回發版同意(${REASON});release:auto 會停在預覽階段。"
    else
      echo "🛑 偵測到「不要發版」但本來就沒有有效同意,無需撤回。"
    fi
    ;;
  deferred)
    # 條件/延後的說法(等我看完再發版 / 確認完才發)。不記錄也不撤回,但一定要出聲 ——
    # 這道閘存在的理由就是「user 看過預覽、確認過,才發」,把條件句當成現在就發等於自廢。
    echo "⏸ 偵測到發版字眼,但判為**條件或延後**的說法(${REASON}),**未記錄為同意**。等你確認完再說一次「發版」即可。"
    ;;
  question)
    # 保守側:不記錄也不撤回。但一定要說出來,否則 user 會以為自己已經授權了。
    echo "❓ 偵測到發版相關字眼,但判為問句(${REASON}),**未記錄為同意**。若這是要我發版,直接說「發版」即可。"
    ;;
  consent)
    if [ "$BRANCH" = "main" ]; then
      echo "⚠️ 目前在 main,發版同意只在工作分支上記錄;請先切到工作分支。"
      exit 0
    fi
    OUT=$(cd "$REPO_ROOT" && node "$ORCH" consent --quote "$PROMPT" --branch "$BRANCH" 2>&1 || echo "")
    if printf '%s' "$OUT" | grep -q RELEASE_CONSENT_RECORDED; then
      echo "✅ 已記錄發版同意(綁「你看過的預覽內容」,不綁 commit 也不綁分支)。版號 bump、CI 修正、換分支都不需要再講一次;只有預覽看得見的內容變了才需要重新確認。"
    else
      echo "⚠️ 判為同意但落地失敗,未記錄 —— 請看:$(printf '%s' "$OUT" | tail -1)"
    fi
    ;;
esac
exit 0

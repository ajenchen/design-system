#!/bin/bash
# record_release_consent.sh — UserPromptSubmit:user 在對話說「發版」→ 落地發版同意 receipt(綁**當前分支**)
#
# Why(2026-09-02 user verbatim):「按照我們規定的工作流程應該是你要先把我們討論的東西部署到 netlify,
# 等我確認後認為都沒問題,主動說要發版,你才會 push 到 GitHub main 同時更新 GitHub 上的 storybook 並發版到 NPM」
# 機制:release-orchestrator 在 merge 前讀 .git/governance-runtime/release-consent/branch__<分支>.json;
# 2026-09-20:receipt 由綁 commit 改為綁**分支**(= 該 PR)。原本以 <headSha>.json 命名,而發版必然
# 產生新 commit(版號 bump 是必要步驟、CI 紅了修一次又一版),於是 user 為同一份工作被迫一再重講。
# user 原話:「我他媽已經說發版一百次了,你他媽到底是要我說幾次?」——那不是沒授權,是機制設計錯了。
# 綁分支對得上 user 實際看的東西:預覽連結 deploy-preview-<PR> 本來就是每個 PR 一條(canonical:
# 1 chat = 1 branch = 1 PR)。防線不減反增:換分支照樣要重新同意;同意後若**預覽看得見的內容**
# (packages/<pkg>/src 的 ts/tsx/js/jsx/css)又變了,orchestrator 判定失效、要求重新確認。
# 本 hook 是 Claude 的寫入端(provider adapter);Codex 等由同一 canonical 生成同款 hook。
# 判定:含同意詞(發版/發佈/發布/可以合併/推到 main/release it/ship it/publish it)且不是問句、不是否定。
# 否定(不要發版/先不要/暫停發版)→ 刪除當前 HEAD 的 receipt(撤回)。
set -u
INPUT=$(cat 2>/dev/null || echo '{}')
PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // ""' 2>/dev/null || echo "")
[ -z "$PROMPT" ] && exit 0
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
BRANCH=$(git -C "$ROOT" branch --show-current 2>/dev/null || echo "")
HEAD_SHA=$(git -C "$ROOT" rev-parse 'HEAD^{commit}' 2>/dev/null || echo "")
[ -z "$HEAD_SHA" ] && exit 0
DIR="$ROOT/.git/governance-runtime/release-consent"
# 檔名取自分支(非法字元換成底線),與 release-orchestrator 的 consentFileName() 同一套規則。
BRANCH_KEY=$(printf '%s' "$BRANCH" | sed 's/[^A-Za-z0-9._-]/_/g')
FILE="$DIR/branch__$BRANCH_KEY.json"

# 否定優先:撤回
if printf '%s' "$PROMPT" | grep -qE '(不要發版|先不要發|不要發|還不要|暫停發版|先別發|不用發版|don.?t release|do not release|hold the release)'; then
  if [ -f "$FILE" ]; then rm -f "$FILE"; echo "🛑 已撤回發版同意 receipt(分支 ${BRANCH});release:auto 會停在預覽階段。"; fi
  exit 0
fi
# 同意詞
printf '%s' "$PROMPT" | grep -qE '(發版|發佈|發布|可以合併|推到 ?main|push to main|release it|ship it|publish it)' || exit 0
# 問句 ≠ 同意(M36)
if printf '%s' "$PROMPT" | grep -qE '(\?|？|是否|要不要|可以嗎|該不該|嗎[。!！]?$|嗎[,，])'; then exit 0; fi
[ "$BRANCH" = "main" ] && exit 0
mkdir -p "$DIR" 2>/dev/null || exit 0
QUOTE_SHA=$(printf '%s' "$PROMPT" | shasum -a 256 | cut -d' ' -f1)
jq -n --arg head "$HEAD_SHA" --arg branch "$BRANCH" --arg quote "$PROMPT" --arg qsha "$QUOTE_SHA" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{schemaVersion:2, branch:$branch, consentedHeadSha:$head, quote:$quote, quoteSha256:$qsha, source:"user-prompt-hook", recordedAt:$at}' > "$FILE" 2>/dev/null || exit 0
echo "✅ 已記錄發版同意 receipt(分支 ${BRANCH});release:auto 現在可合併並發布。版號 bump 與 CI 修正不需要再講一次;只有預覽看得見的內容又變了才需要。"
exit 0

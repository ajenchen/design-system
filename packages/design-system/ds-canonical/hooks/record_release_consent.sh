#!/bin/bash
# record_release_consent.sh — UserPromptSubmit:user 在對話說「發版」→ 落地發版同意 receipt(綁當前 HEAD)
#
# Why(2026-09-02 user verbatim):「按照我們規定的工作流程應該是你要先把我們討論的東西部署到 netlify,
# 等我確認後認為都沒問題,主動說要發版,你才會 push 到 GitHub main 同時更新 GitHub 上的 storybook 並發版到 NPM」
# 機制:release-orchestrator 在 merge 前讀 .git/governance-runtime/release-consent/<headSha>.json;
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
FILE="$DIR/$HEAD_SHA.json"

# 否定優先:撤回
if printf '%s' "$PROMPT" | grep -qE '(不要發版|先不要發|不要發|還不要|暫停發版|先別發|不用發版|don.?t release|do not release|hold the release)'; then
  if [ -f "$FILE" ]; then rm -f "$FILE"; echo "🛑 已撤回發版同意 receipt(HEAD ${HEAD_SHA:0:10});release:auto 會停在預覽階段。"; fi
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
  '{schemaVersion:1, headSha:$head, branch:$branch, quote:$quote, quoteSha256:$qsha, source:"user-prompt-hook", recordedAt:$at}' > "$FILE" 2>/dev/null || exit 0
echo "✅ 已記錄發版同意 receipt(HEAD ${HEAD_SHA:0:10},分支 ${BRANCH});release:auto 現在可合併並發布。若 HEAD 之後又改動,需要再說一次「發版」。"
exit 0

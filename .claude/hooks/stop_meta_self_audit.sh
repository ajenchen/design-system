#!/bin/bash
set -uo pipefail
# Stop hook: META-LEVEL self-audit — auto-question「現在還是 best-practice 嗎?」
# 取代 user 必須親問。User mandate「我希望我可以再也不用問你這個問題,你可以
# 自己問自己並自我自動改善」(2026-04-26)。
#
# Mechanism:
#   1. Run scripts/score-infra-best-practice.mjs(8 dimensions, 0-100)
#   2. Compare current score to last logged baseline
#   3. If REGRESSION(score dropped)OR ANY DIM < 80 → inject MAXIMUM-strength
#      self-improve prompt to next-turn additionalContext
#   4. AI 看到 inject 自動採取 corrective action,不靠 user 提醒
#
# Frequency: every Stop event(low cost ~200ms — 主要是 tsc check)
#
# 為什麼必要:M14/M19 markdown 規則 + stop_self_audit specific check 都不抓
# meta 「整個 infra 還是 best-practice 嗎」這層。本 hook 補位。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0

LOG_FILE=".claude/logs/infra-best-practice-score.jsonl"

# Run scoring(production mode silent stdout, only update log)
SCORE_OUTPUT=$(node scripts/score-infra-best-practice.mjs --json 2>/dev/null)
[ -z "$SCORE_OUTPUT" ] && exit 0

CURRENT_SCORE=$(echo "$SCORE_OUTPUT" | jq -r '.finalScore // 0' 2>/dev/null || echo 0)
[ "$CURRENT_SCORE" = "0" ] && exit 0  # script error, skip

# Compare to PREVIOUS score(2nd-to-last entry — last is current run)
PREV_SCORE=0
if [ -f "$LOG_FILE" ]; then
  # Get 2nd-to-last entry's finalScore
  PREV_SCORE=$(tail -2 "$LOG_FILE" | head -1 | jq -r '.finalScore // 0' 2>/dev/null || echo 0)
fi

WARNINGS=""

# Trigger 1: Regression(score dropped ≥ 5)
if [ "$PREV_SCORE" -gt 0 ] && [ "$CURRENT_SCORE" -lt "$PREV_SCORE" ]; then
  DROP=$((PREV_SCORE - CURRENT_SCORE))
  if [ "$DROP" -ge 5 ]; then
    WARNINGS="${WARNINGS}\n  🚨 SCORE REGRESSION: ${PREV_SCORE} → ${CURRENT_SCORE}(drop ${DROP})"
  fi
fi

# Trigger 2: Any dim < 80
LOW_DIMS=$(echo "$SCORE_OUTPUT" | jq -r '.dimensions[] | select(.score < 80) | "\(.dim): \(.score)/100 (\(.value))"' 2>/dev/null)
if [ -n "$LOW_DIMS" ]; then
  WARNINGS="${WARNINGS}\n  ⚠️  Sub-threshold dimensions:\n$(echo "$LOW_DIMS" | sed 's/^/    • /')"
fi

# Trigger 3: Below 80 overall
if [ "$CURRENT_SCORE" -lt 80 ]; then
  WARNINGS="${WARNINGS}\n  ❌ Overall score ${CURRENT_SCORE}/100 below threshold 80"
fi

# Silent if all green
[ -z "$WARNINGS" ] && exit 0

# Stop hooks 的 JSON schema 不接受 hookSpecificOutput.additionalContext
# (only SessionStart/PostToolUse/UserPromptSubmit do)。改 silent log-to-file
# + exit 0 — score regression 寫 .claude/logs/score-history.jsonl,user 不被打擾。
mkdir -p "$PROJECT_DIR/.claude/logs" 2>/dev/null
printf '{"ts":"%s","score":%s,"prev":%s,"warnings":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$CURRENT_SCORE" "$PREV_SCORE" \
  "$(printf '%b' "$WARNINGS" | jq -Rs .)" \
  >> "$PROJECT_DIR/.claude/logs/score-history.jsonl" 2>/dev/null || true

exit 0

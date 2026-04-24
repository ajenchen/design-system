#!/bin/bash
# Stop hook: scan session transcript for user correction signals; append to
# .claude/logs/user-corrections.jsonl for future /knowledge-prune Phase 0.5.
#
# Purpose: M14 AUTO integrate — every user correction should land somewhere.
# Without harvest, corrections die in transcripts. Log them for post-hoc
# codification (memory / CLAUDE.md / skill reference).
#
# Signals detected in user turns:
#   「不是」「不對」「錯了」「應該」「為什麼」「糾正」「先不管」「之後再」
#
# Non-blocking; silent on success. Self-rotates at 1 MB.

set -euo pipefail

INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
[ -z "$TRANSCRIPT_PATH" ] && exit 0
[ -f "$TRANSCRIPT_PATH" ] || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_DIR="$PROJECT_DIR/.claude/logs"
LOG_FILE="$LOG_DIR/user-corrections.jsonl"
mkdir -p "$LOG_DIR"

# Rotate if > 1 MB
if [ -f "$LOG_FILE" ]; then
  SIZE=$(wc -c < "$LOG_FILE" | tr -d ' ')
  if [ "$SIZE" -gt 1048576 ]; then
    mv "$LOG_FILE" "${LOG_FILE}.$(date +%Y%m)"
  fi
fi

# Extract user turns from last 500 lines of transcript, grep for correction signals
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')

# jq walks transcript, gets user message text, greps for correction keywords
CORRECTIONS=$(tail -500 "$TRANSCRIPT_PATH" 2>/dev/null \
  | jq -r 'select(.type=="user") | .message.content? // empty | if type=="string" then . else (.[]? | select(.type=="text") | .text) end' 2>/dev/null \
  | grep -E '不是|不對|錯了|應該|糾正|為什麼沒|先不管|之後再|別再|不要' \
  | head -5 || true)

[ -z "$CORRECTIONS" ] && exit 0

# Dedup by session:only log latest per session(avoid re-harvest same session 爆炸 log)
# 2026-04-24 dogfood 發現:同 session Stop event 每次重掃同 transcript,
# 產生 N 筆相同 sample。改 dedup:grep 本 session 既有 line 刪除再 append latest。
if [ -f "$LOG_FILE" ]; then
  grep -v "\"session\":\"$SESSION_ID\"" "$LOG_FILE" > "$LOG_FILE.tmp" 2>/dev/null && mv "$LOG_FILE.tmp" "$LOG_FILE" || true
fi

# Append summary line(latest per session)
COUNT=$(echo "$CORRECTIONS" | wc -l | tr -d ' ')
ESCAPED_SAMPLE=$(echo "$CORRECTIONS" | head -2 | jq -Rs .)
printf '{"ts":"%s","session":"%s","count":%s,"sample":%s}\n' \
  "$TIMESTAMP" "$SESSION_ID" "$COUNT" "$ESCAPED_SAMPLE" >> "$LOG_FILE"

# Remind Claude to codify if any corrections detected
MSG="📝 Session harvested ${COUNT} user correction signal(s) → .claude/logs/user-corrections.jsonl. Before ending, verify: is there a pattern worth codifying now(memory / CLAUDE.md / skill)? Don't leave for future to rediscover."
ESCAPED=$(printf '%s' "$MSG" | jq -Rs .)
printf '{"hookSpecificOutput":{"hookEventName":"Stop","additionalContext":%s}}\n' "$ESCAPED"
exit 0

#!/bin/bash
set -uo pipefail
# PostToolUse Skill: log each skill invocation to .claude/logs/skill-invokes.jsonl
#
# 對齊 Meta-Pattern M14(AUTO integrate pipeline instrumentation)+ M10(proactive scan)。
# /governance-health Phase 1 消費本 log 偵測 dead skill(3 mo 0 invoke = retire 候選)
# + hot skill(high invoke = 值得優化 workflow)。
#
# 無本 hook,skill-invokes.jsonl 永遠空,governance-health 無法做 skill-level 決策。
# Dogfood 時發現這個 gap。

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
[ "$TOOL_NAME" != "Skill" ] && exit 0

SKILL_NAME=$(echo "$INPUT" | jq -r '.tool_input.skill // empty')
[ -z "$SKILL_NAME" ] && exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_DIR="$PROJECT_DIR/.claude/logs"
LOG_FILE="$LOG_DIR/skill-invokes.jsonl"
mkdir -p "$LOG_DIR"

# Rotate if > 1 MB(對齊其他 log rotation 策略)
if [ -f "$LOG_FILE" ]; then
  SIZE=$(wc -c < "$LOG_FILE" | tr -d ' ')
  if [ "$SIZE" -gt 1048576 ]; then
    mv "$LOG_FILE" "${LOG_FILE}.$(date +%Y%m)"
  fi
fi

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ARGS=$(echo "$INPUT" | jq -r '.tool_input.args // empty' | head -c 200)
printf '{"ts":"%s","skill":"%s","args":"%s"}\n' "$TIMESTAMP" "$SKILL_NAME" "${ARGS//\"/\\\"}" >> "$LOG_FILE"

exit 0

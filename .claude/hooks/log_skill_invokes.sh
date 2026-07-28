#!/bin/bash
set -uo pipefail
# PostToolUse Skill: log each skill invocation to the opt-in provider-neutral runtime state.
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
TOOL_NAME=$(jq -r '.tool_name // empty' <<<"$INPUT")
[ "$TOOL_NAME" != "Skill" ] && exit 0

SKILL_NAME=$(jq -r '.tool_input.skill // empty' <<<"$INPUT")
[ -z "$SKILL_NAME" ] && exit 0

PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
LOG_DIR="$(governance_runtime_state_dir 2>/dev/null)" || exit 0
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
ARGS=$(jq -r '(.tool_input.args // empty) | tostring | .[0:200]' <<<"$INPUT")
jq -nc --arg ts "$TIMESTAMP" --arg skill "$SKILL_NAME" --arg args "$ARGS" \
  '{ts:$ts,skill:$skill,args:$args}' >> "$LOG_FILE"

exit 0

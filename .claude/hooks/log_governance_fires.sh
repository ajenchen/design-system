#!/bin/bash
set -uo pipefail
# PostToolUse: log governance-relevant file writes to .claude/logs/hook-fires.jsonl
#
# Why: Meta-Pattern M18 — governance must be instrumented, not hoped for.
# Fire-log lets /knowledge-prune identify:
#   - dead hooks (never appear in log over 6 months → retire candidate)
#   - hot files (edited constantly → candidate for refactor / split)
#   - governance file edit cadence (CLAUDE.md edited 10x/week → churn signal)
#
# Size cap: if log > 1 MB, rotate to .jsonl.YYYYMM (keeps inspection file tight).
# Non-blocking; silent on success.

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[ -z "$FILE_PATH" ] && exit 0

# Only log governance files
case "$FILE_PATH" in
  */CLAUDE.md|*/memory/*.md|*.spec.md|*.claude/skills/*|*.claude/hooks/*|*.claude/settings.json) ;;
  *) exit 0 ;;
esac

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_DIR="$PROJECT_DIR/.claude/logs"
LOG_FILE="$LOG_DIR/hook-fires.jsonl"

mkdir -p "$LOG_DIR"

# Rotate if > 1 MB
if [ -f "$LOG_FILE" ]; then
  SIZE=$(wc -c < "$LOG_FILE" | tr -d ' ')
  if [ "$SIZE" -gt 1048576 ]; then
    mv "$LOG_FILE" "${LOG_FILE}.$(date +%Y%m)"
  fi
fi

# Append single-line JSON
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
REL_PATH=${FILE_PATH#$PROJECT_DIR/}
printf '{"ts":"%s","tool":"%s","path":"%s"}\n' "$TIMESTAMP" "$TOOL_NAME" "$REL_PATH" >> "$LOG_FILE"

exit 0

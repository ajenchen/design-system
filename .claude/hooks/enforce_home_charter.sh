#!/bin/bash
# PreToolUse Write hook: gate new files in classification dirs.
# 確保新檔放對 home(8-home flowchart canonical)。
#
# Silent on pass(2026-04-26 noise reduction):only fire if charter README
# missing OR file-name pattern violates dir convention(no charter inject).

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
[ "$TOOL" = "Write" ] || exit 0

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
[ -n "$FILE_PATH" ] && [ ! -e "$FILE_PATH" ] || exit 0  # only NEW files

# Classification dirs requiring charter
DIRS=(.claude/hooks .claude/skills .claude/agents .claude/commands .claude/rules src/design-system/components src/design-system/patterns src/design-system/tokens)

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
REL=$(echo "$FILE_PATH" | sed "s|$PROJECT_DIR/||")

for d in "${DIRS[@]}"; do
  case "$REL" in
    "$d"/*)
      CHARTER="$PROJECT_DIR/$d/README.md"
      if [ ! -f "$CHARTER" ]; then
        # P0:charter missing → block via stderr + exit 2
        echo "❌ Charter missing for $d/. Create $CHARTER first per # 治理 canonical 8-home flowchart." >&2
        exit 2
      fi
      # Charter exists → silent pass(content placement is AI's responsibility,
      # audit Dim 19 periodic verify;no per-write nag)
      exit 0
      ;;
  esac
done

exit 0

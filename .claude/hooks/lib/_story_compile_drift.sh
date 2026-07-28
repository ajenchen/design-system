#!/bin/bash
# PreToolUse Edit/Write: 改過 tsx componentMeta / spec frontmatter 時,
# 自動跑 compile-stories --check 偵測 drift。
#
# 對齊 Story Auto-Compile Phase 4 — stories canonical 從 spec+tsx 機械產,
# key 不齊 = canonical drift,該修。本 hook 是 write-time early warning
# (git commit 前),讓 AI / user 立刻看到 drift 而非 audit 時才發現。

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(jq -r '.tool_input.file_path // empty' <<<"$INPUT")

[ -z "$FILE_PATH" ] && exit 0

# Only trigger on component tsx / spec.md writes
case "$FILE_PATH" in
  */design-system/components/*.tsx) ;;
  */design-system/components/*.spec.md) ;;
  *) exit 0 ;;
esac

# Extract component name from path
COMP_NAME=$(grep -m 1 -oE 'components/[^/]+/' <<<"$FILE_PATH" | sed -n '1p' | sed 's|components/||' | sed 's|/||')
[ -z "$COMP_NAME" ] && exit 0

PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
COMPILE_SCRIPT="$PROJECT_DIR/scripts/compile-stories.mjs"

# Skip if compile script not yet built(graceful for pre-Phase-4 state)
[ ! -f "$COMPILE_SCRIPT" ] && exit 0

# Run drift check(quiet mode)
cd "$PROJECT_DIR" || exit 0
OUTPUT=$(node "$COMPILE_SCRIPT" "$COMP_NAME" --check 2>&1 || true)

# Check if drift detected(exit 1 or has 「spec/tsx canonical drift」 in output)
if grep -qE "spec/tsx canonical drift|spec-only|tsx-only" <<<"$OUTPUT"; then
  MSG="📐 Story canonical drift detected in ${COMP_NAME}:\n\n${OUTPUT}\n\nFix tsx componentMeta export 或 spec frontmatter 讓 keys 對齊。"
  ESCAPED=$(printf '%s' "$MSG" | jq -Rs .)
  printf '{"governanceContext":{"hookEventName":"PostToolUse","message":%s}}\n' "$ESCAPED"
fi

# Skip graceful(migration 未做的元件)不報
exit 0

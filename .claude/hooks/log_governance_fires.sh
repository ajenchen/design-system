#!/bin/bash
set -uo pipefail
# PostToolUse: log governance-relevant file writes to provider-neutral runtime state.
#
# Why: Meta-Pattern M18 — governance must be instrumented, not hoped for.
# Fire-log lets /knowledge-prune identify:
#   - dead hooks (never appear in log over 6 months → retire candidate)
#   - hot files (edited constantly → candidate for refactor / split)
#   - governance instruction edit cadence(shared/provider entry edited 10x/week → churn signal)
#
# Size cap: if log > 1 MB, rotate to .jsonl.YYYYMM (keeps inspection file tight).
# Non-blocking; silent on success.

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_provider_paths.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY:GOVERNANCE_FIRE_PROVIDER_RESOLVER_UNAVAILABLE\n' >&2
  exit 70
}

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[ -z "$FILE_PATH" ] && exit 0
PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
REL_PATH="$(governance_project_relative_path "$FILE_PATH" 2>/dev/null)" || exit 0
INSTRUCTION_ENTRY="$(governance_provider_string_field instructionEntry 2>/dev/null)" || {
  printf 'GOVERNANCE_INTEGRITY:GOVERNANCE_FIRE_INSTRUCTION_ENTRY_UNAVAILABLE\n' >&2
  exit 70
}
SHARED_INSTRUCTION_ENTRY="$(governance_provider_string_field sharedInstructionEntry 2>/dev/null)" || {
  printf 'GOVERNANCE_INTEGRITY:GOVERNANCE_FIRE_SHARED_INSTRUCTION_ENTRY_UNAVAILABLE\n' >&2
  exit 70
}

# Only log canonical/provider-declared governance files. Generated homes belonging to another
# provider are deliberately irrelevant(e.g. Codex outcome cannot depend on a poisoned .claude).
GOVERNANCE_PATH=0
case "$REL_PATH" in
  "$INSTRUCTION_ENTRY"|"$SHARED_INSTRUCTION_ENTRY"|governance/memory/*.md|*.spec.md) GOVERNANCE_PATH=1 ;;
esac

for key in hooks skills contextForkAgents commands rules references; do
  root="$(governance_canonical_relative_root "$key" 2>/dev/null)" || {
    printf 'GOVERNANCE_INTEGRITY:GOVERNANCE_FIRE_CANONICAL_ROOT_UNAVAILABLE:%s\n' "$key" >&2
    exit 70
  }
  governance_path_is_under "$REL_PATH" "$root" && GOVERNANCE_PATH=1
done
MANAGED_ROOTS="$(governance_provider_managed_roots 2>/dev/null)" || {
  printf 'GOVERNANCE_INTEGRITY:GOVERNANCE_FIRE_MANAGED_ROOTS_UNAVAILABLE\n' >&2
  exit 70
}
while IFS= read -r root; do
  [ -n "$root" ] || continue
  governance_path_is_under "$REL_PATH" "$root" && GOVERNANCE_PATH=1
done <<< "$MANAGED_ROOTS"
HOOK_CONFIG="$(governance_provider_string_field hookConfig 2>/dev/null || true)"
[ -n "$HOOK_CONFIG" ] && [ "$REL_PATH" = "$HOOK_CONFIG" ] && GOVERNANCE_PATH=1
[ "$GOVERNANCE_PATH" = "1" ] || exit 0

LOG_DIR="$(governance_prepare_runtime_state_dir 2>/dev/null)" || exit 0
LOG_FILE="$(governance_runtime_file_path hook-fires.jsonl "$LOG_DIR" 2>/dev/null)" || exit 0

# Rotate if > 1 MB
if [ -f "$LOG_FILE" ]; then
  SIZE=$(wc -c < "$LOG_FILE" | tr -d ' ')
  if [ "$SIZE" -gt 1048576 ]; then
    ARCHIVE_FILE="$(governance_runtime_file_path "hook-fires.jsonl.$(date +%Y%m)" "$LOG_DIR" 2>/dev/null)" || exit 0
    mv "$LOG_FILE" "$ARCHIVE_FILE"
  fi
fi

# Append single-line JSON
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq -nc --arg ts "$TIMESTAMP" --arg tool "$TOOL_NAME" --arg path "$REL_PATH" \
  '{ts:$ts,tool:$tool,path:$path}' >> "$LOG_FILE"

exit 0

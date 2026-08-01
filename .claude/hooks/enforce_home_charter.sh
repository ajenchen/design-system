#!/bin/bash
# PreToolUse Write hook: gate new files in classification dirs.
# 確保新檔放對 home(Level 1–9 rule-placement taxonomy canonical)。
#
# Silent on pass(2026-04-26 noise reduction):only fire if charter README
# missing OR file-name pattern violates dir convention(no charter inject).

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_provider_paths.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY:HOME_CHARTER_PROVIDER_RESOLVER_UNAVAILABLE\n' >&2
  exit 70
}

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
[ "$TOOL" = "Write" ] || exit 0

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
[ -n "$FILE_PATH" ] && [ ! -e "$FILE_PATH" ] || exit 0  # only NEW files

PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
REL="$(governance_project_relative_path "$FILE_PATH" 2>/dev/null)" || exit 0
governance_provider_string_field instructionEntry >/dev/null 2>&1 || {
  printf 'GOVERNANCE_INTEGRITY:HOME_CHARTER_ACTIVE_PROVIDER_UNREGISTERED\n' >&2
  exit 70
}

# Classification homes come from the canonical/provider registry. Adding a concrete future
# provider therefore requires only registry data + generated surfaces,not a new shell branch.
DIRS=(packages/design-system/src/components packages/design-system/src/patterns packages/design-system/src/tokens)
for key in hooks skills contextForkAgents commands rules references; do
  root="$(governance_canonical_relative_root "$key" 2>/dev/null)" || {
    printf 'GOVERNANCE_INTEGRITY:HOME_CHARTER_CANONICAL_ROOT_UNAVAILABLE:%s\n' "$key" >&2
    exit 70
  }
  DIRS+=("$root")
done
MANAGED_ROOTS="$(governance_provider_managed_roots 2>/dev/null)" || {
  printf 'GOVERNANCE_INTEGRITY:HOME_CHARTER_MANAGED_ROOTS_UNAVAILABLE\n' >&2
  exit 70
}
while IFS= read -r root; do
  [ -n "$root" ] && DIRS+=("$root")
done <<< "$MANAGED_ROOTS"

for d in "${DIRS[@]}"; do
  if governance_path_is_under "$REL" "$d"; then
      # Charter README itself escape(2026-05-17 chicken-and-egg fix):
      # 不能擋 README 本身建立(否則 charter 永遠無法被 init)
      case "$REL" in "$d"/README.md) exit 0 ;; esac
      CHARTER="$PROJECT_DIR/$d/README.md"
      if [ ! -f "$CHARTER" ]; then
        # P0:charter missing → block via stderr + exit 2
        echo "❌ Charter missing for $d/. Create $CHARTER first per the Level 1–9 rule-placement taxonomy." >&2
        exit 2
      fi
      # Charter exists → silent pass(content placement is AI's responsibility,
      # audit Dim 19 periodic verify;no per-write nag)
      exit 0
  fi
done

exit 0

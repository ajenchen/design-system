#!/bin/bash
# post_edit_dispatcher.sh — orchestrate 9 lib helper rules (PostToolUse Write|Edit|MultiEdit)
#
# 2026-05-13 /knowledge-prune consolidation:
#   Per AGENTS.md governance hook count budget (canonical soft/hard threshold;Anthropic ~15 guideline)
#   Pre-consolidation: 32 hooks → BLOCKER 30 cap breached
#   This dispatcher folds 9 lib/_*.sh helpers into one hook registration
#   Lib helpers remain as standalone testable files (renamed `_*` per Unix internal-helper convention)
#   Current registration impact: 9 helper rules behind 1 registered dispatcher.
#
# Pattern: read stdin INPUT once,pipe to each required helper sequentially,collect their JSON outputs
# Each helper:
#   - Reads file_path from stdin via jq
#   - Filters by scope (skips if out-of-scope)
#   - Emits {governanceContext: {message: "..."}} OR exits 0 silent
# Dispatcher: concatenate non-empty context blocks into ONE neutral JSON output.
# Because these are advisory helpers, their only valid process result is exit 0 plus either silence
# or one exact PostToolUse governanceContext envelope. Missing/tampered helpers, raw stderr,
# malformed output, or any non-zero status are enforcement-integrity failures and fail closed.

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null) || {
  printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: 無法讀取 canonical event envelope\n' >&2
  exit 70
}
HOOKS_DIR="$(dirname "$0")"
LIB_DIR="$HOOKS_DIR/lib"

# A registered PostToolUse dispatcher must never reinterpret malformed or misrouted input as a
# clean result. Provider adapters normalize aliases before invoking this canonical hook.
if ! printf '%s' "$INPUT" | jq -e '
  type == "object"
  and .hook_event_name == "PostToolUse"
  and (.tool_name == "Write" or .tool_name == "Edit" or .tool_name == "MultiEdit")
  and (.tool_input | type == "object")
  and (.tool_input.file_path | type == "string" and length > 0)
' >/dev/null 2>&1; then
  printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: malformed or wrong-event canonical envelope\n' >&2
  exit 70
fi

CAPTURE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/post-edit-dispatcher.XXXXXX") || {
  printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: 無法建立 helper output capture\n' >&2
  exit 70
}
trap 'rm -rf -- "$CAPTURE_DIR"' EXIT HUP INT TERM

# Aggregate governance context fragments from each helper
COMBINED=""

run_helper() {
  local helper="$1"
  local helper_name
  helper_name="$(basename "$helper")"
  if [ ! -f "$helper" ] || [ -L "$helper" ]; then
    printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: required helper 缺失、symlink 或不是一般檔案: %s\n' \
      "$helper_name" >&2
    return 70
  fi

  local stdout_file="$CAPTURE_DIR/stdout"
  local stderr_file="$CAPTURE_DIR/stderr"
  : >"$stdout_file"
  : >"$stderr_file"

  printf '%s' "$INPUT" | bash "$helper" >"$stdout_file" 2>"$stderr_file"
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: advisory helper %s 回傳非零 exit code %s\n' \
      "$helper_name" "$rc" >&2
    return 70
  fi
  if [ -s "$stderr_file" ]; then
    printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: advisory helper %s 產生 raw stderr\n' \
      "$helper_name" >&2
    return 70
  fi
  [ -s "$stdout_file" ] || return 0

  # One helper may emit exactly one provider-neutral context object. Reject native envelopes,
  # multiple JSON values, extra fields, empty messages, and an event name other than PostToolUse.
  if ! jq -e -s '
    length == 1
    and (.[0] |
      type == "object"
      and keys == ["governanceContext"]
      and (.governanceContext |
        type == "object"
        and (keys | sort) == ["hookEventName", "message"]
        and .hookEventName == "PostToolUse"
        and (.message | type == "string" and length > 0)
      )
    )
  ' "$stdout_file" >/dev/null 2>&1; then
    printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: helper %s 輸出 malformed or wrong-event envelope\n' \
      "$helper_name" >&2
    return 70
  fi

  local ctx
  ctx=$(jq -er '.governanceContext.message' "$stdout_file") || {
    printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: helper %s context 無法解碼\n' \
      "$helper_name" >&2
    return 70
  }
  if [ -z "$COMBINED" ]; then
    COMBINED="$ctx"
  else
    COMBINED="${COMBINED}"$'\n\n────────\n\n'"$ctx"
  fi
}

# Run 9 helpers sequentially (all silent-fail / exit 0 / additive warnings)
for helper in \
  "$LIB_DIR/_token_hygiene.sh" \
  "$LIB_DIR/_hardcoded_strings.sh" \
  "$LIB_DIR/_code_quality.sh" \
  "$LIB_DIR/_layout_space_canonical.sh" \
  "$LIB_DIR/_person_data_richness.sh" \
  "$LIB_DIR/_overlay_handcraft.sh" \
  "$LIB_DIR/_cva_default_sync.sh" \
  "$LIB_DIR/_story_compile_drift.sh" \
  "$LIB_DIR/_governance_coverage_check.sh"; do
  run_helper "$helper"
  helper_rc=$?
  [ "$helper_rc" -eq 0 ] || exit 70
done

if [ -n "$COMBINED" ]; then
  ESCAPED=$(printf '%s' "$COMBINED" | jq -Rs .) || {
    printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: combined context 無法編碼\n' >&2
    exit 70
  }
  printf '{"governanceContext":{"hookEventName":"PostToolUse","message":%s}}\n' "$ESCAPED"
fi

exit 0

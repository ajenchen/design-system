#!/bin/bash
# Shared fail-closed input/tooling boundary for canonical hooks.
# Policy violations remain hook-owned exit 2. Infrastructure, parser, and transport failures use
# the reserved integrity marker and exit 70 so provider adapters cannot misreport them as policy.

governance_hook_integrity_fail() {
  printf 'GOVERNANCE_INTEGRITY: %s\n' "$1" >&2
  exit 70
}

governance_hook_require_commands() {
  local command_name
  for command_name in "$@"; do
    command -v "$command_name" >/dev/null 2>&1 \
      || governance_hook_integrity_fail "required hook command is unavailable:${command_name}"
  done
}

governance_hook_load_input() {
  governance_hook_require_commands cat jq
  if ! INPUT=$(cat); then
    governance_hook_integrity_fail 'hook input could not be read'
  fi
  if ! printf '%s' "$INPUT" | jq -s -e '
    length == 1
    and (
    .[0]
    | type == "object"
    and ([.. | strings | select(contains("\u0000"))] | length == 0)
    and ((.tool_name? // "") | type == "string")
    and ((.tool? // "") | type == "string")
    and ((.hook_event_name? // "") | type == "string")
    and ((.event? // "") | type == "string")
    and ((.transcript_path? // "") | type == "string")
    and ((.file_path? // "") | type == "string")
    and ((.path? // "") | type == "string")
    and (
      .changed_paths? == null
      or (.changed_paths | type == "array" and all(.[]; type == "string"))
    )
    and ((.tool_input? // {}) | type == "object")
    and (
      (.tool_input? // {}) as $tool
      | [
          $tool.file_path?,
          $tool.path?,
          $tool.notebook_path?,
          $tool.content?,
          $tool.new_string?,
          $tool.old_string?,
          $tool.command?,
          $tool.prompt?,
          $tool.script?,
          $tool.skill?,
          $tool.args?
        ]
      | all(. == null or type == "string")
    )
    and (
      (.tool_input.changed_paths? == null)
      or (.tool_input.changed_paths | type == "array" and all(.[]; type == "string"))
    )
    and (
      (.tool_input.edits? == null)
      or (
        .tool_input.edits
        | type == "array"
        and all(.[];
          type == "object"
          and ([.file_path?, .path?, .content?, .new_string?]
            | all(. == null or type == "string"))
        )
      )
    )
    )
  ' >/dev/null 2>&1; then
    governance_hook_integrity_fail 'invalid input envelope'
  fi
}

governance_hook_project_file_path() {
  governance_hook_require_commands python3
  local raw_path="$1"
  local project_root="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
  python3 - "$project_root" "$raw_path" <<'PY'
import os
import sys

root_input = os.path.abspath(sys.argv[1])
raw = sys.argv[2]
if not os.path.isdir(root_input):
    raise SystemExit(2)
root = os.path.realpath(root_input)
target = os.path.abspath(raw if os.path.isabs(raw) else os.path.join(root, raw))
real_target = os.path.realpath(target)
try:
    if os.path.commonpath([root, real_target]) != root:
        raise ValueError("outside project")
except ValueError:
    raise SystemExit(2)

# Preserve the caller's spelling when it is lexically below the configured root. This permits
# macOS's /var -> /private/var system alias above the project while still detecting every symlink
# at or below the project root. A physically equivalent alternate spelling falls back to real paths.
relative = os.path.relpath(target, root_input)
if relative == os.pardir or relative.startswith(os.pardir + os.sep):
    traversal_root = root
    relative = os.path.relpath(real_target, root)
else:
    traversal_root = root_input

cursor = traversal_root
if os.path.islink(cursor):
    raise SystemExit(2)
if relative != ".":
    for segment in relative.split(os.sep):
        cursor = os.path.join(cursor, segment)
        if not os.path.lexists(cursor):
            break
        if os.path.islink(cursor):
            raise SystemExit(2)
print(target)
PY
}

governance_hook_grep_q() {
  local failure_message="$1"
  local text="$2"
  shift 2
  local grep_rc
  if grep "$@" <<< "$text" >/dev/null 2>&1; then
    grep_rc=0
  else
    grep_rc=$?
  fi
  case "$grep_rc" in
    0|1) return "$grep_rc" ;;
    *) governance_hook_integrity_fail "$failure_message" ;;
  esac
}

governance_hook_grep_capture() {
  local output_name="$1"
  local failure_message="$2"
  local text="$3"
  shift 3
  local grep_output grep_rc
  if grep_output=$(grep "$@" <<< "$text" 2>/dev/null); then
    grep_rc=0
  else
    grep_rc=$?
  fi
  case "$grep_rc" in
    0|1) ;;
    *) governance_hook_integrity_fail "$failure_message" ;;
  esac
  printf -v "$output_name" '%s' "$grep_output"
}

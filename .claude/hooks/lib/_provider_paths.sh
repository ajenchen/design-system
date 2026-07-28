#!/bin/bash
# Provider/canonical path resolver for canonical hooks.
#
# This file is sourced. Keep provider facts in packages/governance/canonical/providers.json;
# hooks consume those facts through these functions instead of naming .claude/.codex homes.

governance_corpus_root() {
  local root="${GOVERNANCE_CORPUS_ROOT:-}"
  if [ -z "$root" ]; then
    local helper_dir
    helper_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd -P)" || return 1
    root="$(git -C "$helper_dir" rev-parse --show-toplevel 2>/dev/null || true)"
  fi
  [ -n "$root" ] && [ -d "$root" ] || return 1
  (cd "$root" 2>/dev/null && pwd -P)
}

governance_provider_registry_file() {
  local corpus registry
  corpus="$(governance_corpus_root)" || return 1
  registry="${GOVERNANCE_PROVIDER_REGISTRY:-$corpus/packages/governance/canonical/providers.json}"
  registry="$(python3 - "$corpus" "$registry" <<'PY'
import os
import sys

root = os.path.abspath(sys.argv[1])
raw = sys.argv[2]
target = os.path.abspath(raw if os.path.isabs(raw) else os.path.join(root, raw))
try:
    if os.path.commonpath([root, target]) != root:
        raise ValueError('outside corpus')
except ValueError:
    raise SystemExit(2)
cursor = root
for segment in os.path.relpath(target, root).split(os.sep):
    if segment == '.':
        continue
    cursor = os.path.join(cursor, segment)
    if not os.path.lexists(cursor):
        break
    if os.path.islink(cursor):
        raise SystemExit(2)
print(target)
PY
)" || return 1
  [ -f "$registry" ] && [ ! -L "$registry" ] || return 1
  printf '%s\n' "$registry"
}

governance_registry_repository_path() {
  local value="$1"
  [ -n "$value" ] || return 1
  case "$value" in
    /*|*\\*|*//*|*$'\n'*|*$'\r'*) return 1 ;;
  esac
  case "/$value/" in
    */../*|*/./*) return 1 ;;
  esac
  printf '%s\n' "${value#./}"
}

governance_canonical_relative_root() {
  local key="$1" registry value
  registry="$(governance_provider_registry_file)" || return 1
  value=$(jq -er --arg key "$key" '.canonical.roots[$key] | select(type == "string" and length > 0)' "$registry" 2>/dev/null) || return 1
  governance_registry_repository_path "$value"
}

governance_canonical_root() {
  local corpus relative
  corpus="$(governance_corpus_root)" || return 1
  relative="$(governance_canonical_relative_root "$1")" || return 1
  printf '%s\n' "$corpus/$relative"
}

governance_provider_string_field() {
  local field="$1" registry provider value
  provider="${GOVERNANCE_PROVIDER:-${GOVERNANCE_SELF_PROVIDER:-}}"
  printf '%s' "$provider" | grep -qE '^[a-z][a-z0-9-]*$' || return 1
  registry="$(governance_provider_registry_file)" || return 1
  case "$field" in
    instructionEntry|sharedInstructionEntry|skillDirectory|hookConfig) ;;
    *) return 1 ;;
  esac
  value=$(jq -er --arg id "$provider" --arg field "$field" '
    first(.providers[] | select(.id == $id) | .[$field])
    | select(type == "string" and length > 0)
  ' "$registry" 2>/dev/null) || return 1
  governance_registry_repository_path "$value"
}

governance_provider_managed_roots() {
  local registry provider values value count index=0
  provider="${GOVERNANCE_PROVIDER:-${GOVERNANCE_SELF_PROVIDER:-}}"
  printf '%s' "$provider" | grep -qE '^[a-z][a-z0-9-]*$' || return 1
  registry="$(governance_provider_registry_file)" || return 1
  values=$(jq -cer --arg id "$provider" '
    first(.providers[] | select(.id == $id)) as $provider
    | select($provider != null)
    | [
        $provider.skillDirectory,
        ($provider.adapter.repositoryManagedTrees // {} | to_entries[]?.value)
      ]
    | map(select(type == "string" and length > 0))
    | unique
  ' "$registry" 2>/dev/null) || return 1
  count=$(printf '%s' "$values" | jq -er 'length' 2>/dev/null) || return 1
  while [ "$index" -lt "$count" ]; do
    value=$(printf '%s' "$values" | jq -er --argjson index "$index" '.[$index]' 2>/dev/null) || return 1
    governance_registry_repository_path "$value" || return 1
    index=$((index + 1))
  done
}

governance_provider_skill_entry_file() {
  local registry provider
  provider="${GOVERNANCE_PROVIDER:-${GOVERNANCE_SELF_PROVIDER:-}}"
  printf '%s' "$provider" | grep -qE '^[a-z][a-z0-9-]*$' || return 1
  registry="$(governance_provider_registry_file)" || return 1
  jq -er --arg id "$provider" '
    first(.providers[] | select(.id == $id)) as $provider
    | $provider.adapter.skillView.materializerId as $materializer
    | select($materializer | type == "string")
    | .canonical.materializers.skillViews[$materializer].entryFile
    | select(type == "string" and test("^[A-Z][A-Z0-9_-]*\\.md$"))
  ' "$registry" 2>/dev/null
}

governance_project_root() {
  local project="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
  [ -n "$project" ] && [ -d "$project" ] || return 1
  (cd "$project" 2>/dev/null && pwd -P)
}

governance_project_relative_path() {
  local project target="$1"
  project="$(governance_project_root)" || return 1
  python3 - "$project" "$target" <<'PY'
import os
import sys

root = os.path.realpath(os.path.abspath(sys.argv[1]))
raw = sys.argv[2]
target = os.path.realpath(os.path.abspath(raw if os.path.isabs(raw) else os.path.join(root, raw)))
try:
    if os.path.commonpath([root, target]) != root:
        raise ValueError('outside project')
except ValueError:
    raise SystemExit(2)
print(os.path.relpath(target, root).replace(os.sep, '/'))
PY
}

governance_path_is_under() {
  local candidate="${1#./}" root="${2#./}"
  root="${root%/}"
  [ -n "$root" ] || return 1
  case "$candidate" in
    "$root"|"$root"/*) return 0 ;;
    *) return 1 ;;
  esac
}

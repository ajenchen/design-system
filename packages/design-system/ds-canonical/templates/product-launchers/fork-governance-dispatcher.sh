#!/bin/bash
# fork-governance-dispatcher.sh — C-prime 治理派發器(committed in fork,極穩定、幾乎永不改)
#
# 這是 fork repo 唯一 commit 的「啟動器」:讀 npm 套件 ship 的 fork 治理 manifest,跑當下這個
# event 的所有官方 fork hook。DS 未來治理增刪改 → immutable release 重生 manifest → consumer
# 經 reviewed exact-version PR 升級後，本派發器才切到新 snapshot(committed 設定不用逐 rule 改)。
#
# 設計鐵則:
#   - 本體在 exact-version node_modules payload(由 lockfile + upgrade PR 控管)
#   - manifest 缺 → exit 0 不 brick；provider-neutral hard gate 會 fail-closed 報 degraded
#   - descriptor-declared policy hook exit 2(BLOCKER)→ 派發器 exit 2(轉發攔截)
#   - rc70、undefined exit、malformed/mixed output → integrity exit 70，絕不偽裝 policy 或 clean
#   - proposed-text-v1 只收 canonical normalizer 由 provider mutation materialize 的完整 after-image

set -uo pipefail

# Generated provider argv removes the fixed pre-launch injection set before this
# Bash process starts. Repeat the complete pattern here with Bash builtins so an
# older adapter, a direct invocation, or a future provider cannot pass startup
# injection to Git, jq, Python, Node, or a nested hook. The provider process and
# any command shell it starts *before* the generated argv are necessarily part
# of the native-host trust boundary; protected hooks-off CI remains authoritative.
while IFS= read -r runtime_environment_name; do
  case "$runtime_environment_name" in
    PATH|GIT_*|BASH_ENV|ENV|SHELLOPTS|BASHOPTS|CDPATH|GLOBIGNORE|NODE_OPTIONS|NODE_PATH|PYTHONHOME|PYTHONPATH|PYTHONSTARTUP|PYTHONINSPECT|PERL5OPT|RUBYOPT|LD_*|DYLD_*)
      builtin unset "$runtime_environment_name" 2>/dev/null || true
      ;;
  esac
done < <(builtin compgen -e)
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
while IFS= read -r inherited_function_name; do
  builtin unset -f "$inherited_function_name" 2>/dev/null || true
done < <(builtin compgen -A function)

integrity_failure() {
  printf 'GOVERNANCE_INTEGRITY:%s\n' "$1" >&2
  exit 70
}

# Provider payloads are unbounded and belong exclusively on stdin. Scrub the canonical name and
# every provider-neutral alias convention before the first external process is launched; compgen,
# case, and unset are Bash builtins and therefore cannot hit the exec environment-size limit.
while IFS= read -r payload_environment_name; do
  case "$payload_environment_name" in
    GOVERNANCE_TOOL_INPUT|*_TOOL_INPUT) builtin unset "$payload_environment_name" ;;
  esac
done < <(builtin compgen -e)

# Bootstrap the neutral root before the installed manifest is reachable. The launcher's own Git
# checkout is the trust anchor; inherited provider variables may identify it but may never redirect
# this process into a different checkout.
PROVIDER="${1:-${GOVERNANCE_PROVIDER:-claude}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_HINT="${GOVERNANCE_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$PWD}}"
PROJECT_DIR="$(/usr/bin/git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
HINT_ROOT="$(/usr/bin/git -C "$PROJECT_HINT" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$PROJECT_DIR" ] || [ -z "$HINT_ROOT" ]; then
  integrity_failure "PROJECT_ROOT_UNVERIFIED"
fi
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd -P)"
HINT_ROOT="$(cd "$HINT_ROOT" && pwd -P)"
if [ "$PROJECT_DIR" != "$HINT_ROOT" ]; then
  integrity_failure "PROJECT_ROOT_MISMATCH"
fi
export GOVERNANCE_PROVIDER="$PROVIDER"
export GOVERNANCE_PROJECT_DIR="$PROJECT_DIR"

DS_FORK="$GOVERNANCE_PROJECT_DIR/node_modules/@qijenchen/design-system/ds-canonical/fork"
MANIFEST="$DS_FORK/manifest.json"

# 治理 payload 未就位 → native hook 不 brick；governance check/CI 負責 fail-closed
[ -f "$MANIFEST" ] || exit 0

if ! /usr/bin/jq -e --arg provider "$PROVIDER" '.providerAdapters[$provider] | type == "object"' "$MANIFEST" >/dev/null 2>&1; then
  integrity_failure "ADAPTER_UNKNOWN:${PROVIDER}"
fi

# The registry-generated manifest is the only owner of provider-specific environment aliases.
# This keeps future adapters data-only: declare a map in providers.json, rebuild, and dispatch.
while IFS=$'\t' read -r canonical provider_name; do
  [[ "$canonical" =~ ^[A-Z][A-Z0-9_]*$ ]] || integrity_failure "ADAPTER_ENVIRONMENT_CANONICAL_NAME_INVALID"
  [[ "$provider_name" =~ ^[A-Z][A-Z0-9_]*$ ]] || integrity_failure "ADAPTER_ENVIRONMENT_NATIVE_NAME_INVALID"
  if [ "$canonical" = "GOVERNANCE_TOOL_INPUT" ]; then
    [[ "$provider_name" =~ ^[A-Z][A-Z0-9_]*_TOOL_INPUT$ ]] \
      || integrity_failure "ADAPTER_TOOL_INPUT_ALIAS_INVALID"
    unset "$canonical" "$provider_name"
    continue
  fi
  [ -n "$(printenv "$canonical" 2>/dev/null || true)" ] && continue
  provider_value="$(printenv "$provider_name" 2>/dev/null || true)"
  [ -n "$provider_value" ] && export "$canonical=$provider_value"
done < <(/usr/bin/jq -r --arg provider "$PROVIDER" '.providerAdapters[$provider].environmentMap // {} | to_entries[] | [.key, .value] | @tsv' "$MANIFEST" 2>/dev/null)

# Print a lexical absolute path only when every existing component from the trusted root is a
# real file-system entry. Never use realpath on the candidate: that would silently follow and
# bless a pre-positioned governance-runtime symlink.
safe_runtime_path() {
  /usr/bin/python3 - "$1" "$2" <<'PY'
import os
import sys

root = os.path.abspath(sys.argv[1])
target = os.path.abspath(sys.argv[2])
try:
    if os.path.commonpath([root, target]) != root:
        raise ValueError('escape')
except ValueError:
    raise SystemExit(2)

cursor = root
if os.path.lexists(cursor) and os.path.islink(cursor):
    raise SystemExit(2)
relative = os.path.relpath(target, root)
if relative != '.':
    for segment in relative.split(os.sep):
        cursor = os.path.join(cursor, segment)
        if not os.path.lexists(cursor):
            break
        if os.path.islink(cursor):
            raise SystemExit(2)
print(target)
PY
}

GIT_DIR="$(/usr/bin/git -C "$PROJECT_DIR" rev-parse --absolute-git-dir 2>/dev/null || true)"
[ -n "$GIT_DIR" ] || integrity_failure "RUNTIME_ROOT_UNAVAILABLE"
GIT_DIR="$(cd "$GIT_DIR" 2>/dev/null && pwd -P)"
[ -n "$GIT_DIR" ] || integrity_failure "RUNTIME_ROOT_UNAVAILABLE"
RUNTIME_ROOT="$(safe_runtime_path "$GIT_DIR" "$GIT_DIR/governance-runtime" 2>/dev/null)"
[ -n "$RUNTIME_ROOT" ] || integrity_failure "RUNTIME_PATH_SYMLINK_OR_ESCAPE"
TELEMETRY_OPT_IN=0
if [ "${GOVERNANCE_TELEMETRY_OPT_IN:-0}" = "1" ] && [ "${GOVERNANCE_READ_ONLY:-0}" != "1" ]; then
  TELEMETRY_OPT_IN=1
fi
STATE_DIR="$RUNTIME_ROOT"
if [ "$TELEMETRY_OPT_IN" = "1" ] && [ -n "${GOVERNANCE_STATE_DIR:-}" ]; then
  STATE_CANDIDATE="$(/usr/bin/python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$GOVERNANCE_STATE_DIR" 2>/dev/null)"
  case "$STATE_CANDIDATE" in
    "$RUNTIME_ROOT"|"$RUNTIME_ROOT"/*) ;;
    *) integrity_failure "STATE_DIR_OUTSIDE_RUNTIME_ROOT" ;;
  esac
  STATE_DIR="$(safe_runtime_path "$RUNTIME_ROOT" "$STATE_CANDIDATE" 2>/dev/null)"
  [ -n "$STATE_DIR" ] || integrity_failure "STATE_DIR_SYMLINK_OR_ESCAPE"
fi
export GOVERNANCE_RUNTIME_ROOT="$RUNTIME_ROOT"
export GOVERNANCE_STATE_DIR="$STATE_DIR"
export GOVERNANCE_TELEMETRY_OPT_IN="$TELEMETRY_OPT_IN"
export GOVERNANCE_TRANSCRIPT_PATH=""
export GOVERNANCE_TRANSCRIPT_TRUST="unavailable"
export GOVERNANCE_WRITE_STATE_TRUST="unavailable"

RUNTIME="$SCRIPT_DIR/product-hook-dispatch-runtime.mjs"
[ -f "$RUNTIME" ] && [ ! -L "$RUNTIME" ] || integrity_failure "PRODUCT_HOOK_RUNTIME_UNAVAILABLE_OR_UNSAFE"
exec node "$RUNTIME" "$PROVIDER" "$MANIFEST" "$DS_FORK"

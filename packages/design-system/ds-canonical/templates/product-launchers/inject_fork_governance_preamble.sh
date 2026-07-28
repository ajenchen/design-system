#!/bin/bash
# SessionStart verification adapter — committed bootstrap first, zero workspace mutation.
#
# Governance instructions and provider adapters MUST already exist in the Git snapshot.
# This hook never installs packages, changes lockfiles, refreshes skills, or queries a
# mutable dist-tag. It only reports a degraded local install; CI/governance-check is the
# fail-closed authority.

set -uo pipefail

# The generated hook command supplies an absolute env-clean prefix. Keep this
# builtin-only scrub as defense in depth for direct/legacy launchers before the
# first jq/Node/Git child. A provider-owned shell that executes before this file
# is outside repository code's control and is covered by the hooks-off hard gate.
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

# SessionStart does not consume provider payload data. Remove every canonical/native payload alias
# before jq or any other external runtime is launched so stale large inputs cannot trip ARG_MAX.
while IFS= read -r payload_environment_name; do
  case "$payload_environment_name" in
    GOVERNANCE_TOOL_INPUT|*_TOOL_INPUT) builtin unset "$payload_environment_name" ;;
  esac
done < <(builtin compgen -e)

# Shared launcher consumers set the neutral root; Claude's native variable remains an edge fallback.
PD="${GOVERNANCE_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-.}}"
export GOVERNANCE_PROJECT_DIR="$PD"
LOCK_FILE="$PD/governance/lock.json"
DS_PACKAGE="$PD/node_modules/@qijenchen/design-system/package.json"
MANIFEST="$PD/node_modules/@qijenchen/design-system/ds-canonical/fork/manifest.json"
PROVIDER="${1:-${GOVERNANCE_PROVIDER:-claude}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
FORMATTER="$SCRIPT_DIR/format-provider-hook-output.mjs"

if [ ! -f "$DS_PACKAGE" ] || [ ! -f "$MANIFEST" ]; then
  echo "⚠️ GOVERNANCE-COMMON-INSTRUCTION-UNAVAILABLE:installed exact dependencies/manifest 尚不可用；無法認證共用指令目的地。請在 repo root 執行 npm run setup:all；SessionStart 不會代替你修改工作樹。" >&2
  exit 0
fi

if [ ! -f "$FORMATTER" ]; then
  echo "GOVERNANCE-OUTPUT-TRANSPORT-UNAVAILABLE" >&2
  exit 2
fi

if [ ! -x /usr/bin/jq ]; then
  echo "⚠️ GOVERNANCE-COMMON-INSTRUCTION-UNAVAILABLE:jq runtime 不可用；無法安全讀取 installed manifest。" >&2
  exit 0
fi

COMMON_REL=$(/usr/bin/jq -er '.consumer.commonInstruction.destination | select(type == "string" and length > 0)' "$MANIFEST" 2>/dev/null) || {
  echo "⚠️ GOVERNANCE-COMMON-INSTRUCTION-UNAVAILABLE:installed manifest 缺少 consumer.commonInstruction.destination。" >&2
  exit 0
}
safe_relative=true
case "$COMMON_REL" in
  /*|*\\*|*$'\n'*|*$'\r'*) safe_relative=false ;;
esac
IFS='/' read -r -a common_segments <<< "$COMMON_REL"
for segment in "${common_segments[@]}"; do
  if [ -z "$segment" ] || [ "$segment" = "." ] || [ "$segment" = ".." ]; then safe_relative=false; fi
done
if [ "${common_segments[0]:-}" = ".git" ]; then safe_relative=false; fi
if [ "$safe_relative" != true ]; then
  echo "⚠️ GOVERNANCE-COMMON-INSTRUCTION-UNAVAILABLE:installed manifest 的 common instruction destination 不是安全的 repo-relative path。" >&2
  exit 0
fi
COMMON_FILE="$PD/$COMMON_REL"
if [ ! -f "$COMMON_FILE" ]; then
  echo "⚠️ GOVERNANCE-BOOTSTRAP-MISSING:$COMMON_REL 不存在；本 session 不具可認證的共用治理。請從 canonical template/upgrade PR 修復。" >&2
  exit 0
fi

if [ ! -f "$LOCK_FILE" ]; then
  echo "⚠️ GOVERNANCE-LOCK-MISSING:governance/lock.json 不存在；可讀 ${COMMON_REL}，但版本與生成物完整性尚未認證。" >&2
fi

# The manifest-declared common instruction should already be loaded by provider bootstrap. Inject
# only a short status; never duplicate the full rules into provider-native context transport.
CONTEXT="治理來源：committed ${COMMON_REL} + governance/lock.json；SessionStart 為唯讀驗證，不會安裝或同步。最終 hard gate = provider-neutral governance check + CI。"
TRANSPORT=""
TRANSPORT=$(/usr/bin/jq -r --arg provider "$PROVIDER" '.providerAdapters[$provider].contextOutputTransport // empty' "$MANIFEST" 2>/dev/null)
case "$TRANSPORT" in
  claude-hook-specific) printf '%s' "$CONTEXT" | node "$FORMATTER" --kind context --transport claude-hook-specific --event SessionStart || exit 2 ;;
  system-message) printf '%s' "$CONTEXT" | node "$FORMATTER" --kind context --transport system-message --event SessionStart || exit 2 ;;
  stderr|"") printf '%s\n' "$CONTEXT" >&2 ;;
  *) printf 'GOVERNANCE-CONTEXT-TRANSPORT-UNAVAILABLE:%s\n' "$PROVIDER" >&2; exit 2 ;;
esac

exit 0

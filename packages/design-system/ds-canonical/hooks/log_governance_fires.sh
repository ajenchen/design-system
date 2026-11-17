#!/bin/bash
set -uo pipefail
# PostToolUse Write|Edit|MultiEdit|Skill: opt-in provider-neutral governance telemetry logger.
#
# Why: Meta-Pattern M18 — governance must be instrumented, not hoped for.
#   - Write / Edit / MultiEdit → hook-fires.jsonl(governance file 編輯軌跡):
#       hot files(edited constantly → candidate for refactor / split)
#       governance instruction edit cadence(shared/provider entry edited 10x/week → churn signal)
#   - Skill → skill-invokes.jsonl(每次 Skill tool 呼叫一筆;/knowledge-prune D7 與
#       /governance-health 讀它判 unused / hot skill)。只捕 Skill tool —— user 打 /name 的 slash
#       呼叫走 user prompt,不被捕(known limitation)。
#
# 2026-11-17 /knowledge-prune:原 log_skill_invokes.sh 併入本檔(工程治理 AUTO,AGENTS.md「# 自主執行 canonical」)。
#   兩支同為 PostToolUse diagnostic logger、fork 分類同為 DROP、同吃 GOVERNANCE_TELEMETRY_OPT_IN;
#   scripts/lib/provider-runtime-contract.mjs validateHookRegistrationSemantics 要求同一事件同一支
#   hook 只註冊一次,故 matcher 合成 Write|Edit|MultiEdit|Skill。合併時兩條路徑都改走
#   governance_prepare_runtime_state_dir + governance_runtime_file_path(拒 symlink / hard link)。
#   遙測沒開(預設)時在讀完 input 後立即結束,不再先跑 provider resolver。
#
# Size cap: if a log > 1 MB, rotate to <name>.YYYYMM (keeps inspection file tight).
# Non-blocking; silent on success.

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

INPUT=$(cat)

# Telemetry is never implicit(_log-fire.sh):沒 opt-in / read-only / 沒有 Git owner → 一個 byte 都不寫。
governance_runtime_state_dir >/dev/null 2>&1 || exit 0

set -euo pipefail

TOOL_NAME=$(jq -r '.tool_name // empty' <<<"$INPUT")

append_with_rotation() {
  local name="$1" line="$2" log_dir log_file archive_file size
  log_dir="$(governance_prepare_runtime_state_dir 2>/dev/null)" || return 0
  log_file="$(governance_runtime_file_path "$name" "$log_dir" 2>/dev/null)" || return 0
  if [ -f "$log_file" ]; then
    size=$(wc -c < "$log_file" | tr -d ' ')
    if [ "$size" -gt 1048576 ]; then
      archive_file="$(governance_runtime_file_path "$name.$(date +%Y%m)" "$log_dir" 2>/dev/null)" || return 0
      mv "$log_file" "$archive_file"
    fi
  fi
  printf '%s\n' "$line" >> "$log_file"
}

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [ "$TOOL_NAME" = "Skill" ]; then
  SKILL_NAME=$(jq -r '.tool_input.skill // empty' <<<"$INPUT")
  [ -z "$SKILL_NAME" ] && exit 0
  ARGS=$(jq -r '(.tool_input.args // empty) | tostring | .[0:200]' <<<"$INPUT")
  append_with_rotation skill-invokes.jsonl \
    "$(jq -nc --arg ts "$TIMESTAMP" --arg skill "$SKILL_NAME" --arg args "$ARGS" '{ts:$ts,skill:$skill,args:$args}')"
  exit 0
fi

source "$(dirname "$0")/lib/_provider_paths.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY:GOVERNANCE_FIRE_PROVIDER_RESOLVER_UNAVAILABLE\n' >&2
  exit 70
}

FILE_PATH=$(jq -r '.tool_input.file_path // empty' <<<"$INPUT")

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

append_with_rotation hook-fires.jsonl \
  "$(jq -nc --arg ts "$TIMESTAMP" --arg tool "$TOOL_NAME" --arg path "$REL_PATH" '{ts:$ts,tool:$tool,path:$path}')"

exit 0

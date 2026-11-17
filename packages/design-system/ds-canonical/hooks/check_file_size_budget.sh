#!/bin/bash
set -uo pipefail
# PreToolUse Edit/Write: enforce per-file line budgets for governance files.
#
# 上限表 —— 各檔(instruction entry / memory / spec / SKILL)上限的唯一住處 = lib/_size_budget.sh 的
# governance_size_budget,量法也在同一檔;本 hook 只負責「讀表、量、出聲」。外部文件寫「check_file_size_budget.sh
# 的 case 表」指的就是那張表。開場檔總行數、hook 數、memory 筆數門檻在 session_start_governance_check.sh
#(檔頭 + Check 7 / 8)。AGENTS.md `# 治理 canonical`「行數預算」只是指向這兩處的索引,不寫數值。
# Provider/instruction/skill 路徑由 canonical registry 解析,不以任一 generated home 當 authority。
#
# Non-blocking: emits a provider-neutral governance context warning; the adapter
# transports it to the active model. Hard block would paralyse edits to legitimately
# large canonical specs (e.g. item-anatomy ~900 lines) — require explicit override.
# 超過 BUDGET 印 ⚠️、超過 TRANSITION(hard cap)印 ⛔,兩者都 exit 0。
# 量具本身壞了(registry / contract / 量法讀不到)不等於「沒超標」:exit 2 並說明,不默默放行(M37)。

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_provider_paths.sh" 2>/dev/null || {
  printf 'file-size hook blocked: canonical provider resolver unavailable\n' >&2
  exit 2
}
source "$(dirname "$0")/lib/_size_budget.sh" 2>/dev/null || {
  printf 'file-size hook blocked: size budget table (lib/_size_budget.sh) unavailable\n' >&2
  exit 2
}

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[ -z "$FILE_PATH" ] && exit 0
[ -f "$FILE_PATH" ] || exit 0
REL_PATH="$(governance_project_relative_path "$FILE_PATH" 2>/dev/null)" || exit 0

if BUDGET_ROW="$(governance_size_budget "$REL_PATH")"; then
  :
else
  rc=$?
  [ "$rc" -eq 1 ] && exit 0
  printf 'file-size hook blocked: budget lookup for %s failed (registry or governance/memory/contract.json unreadable)\n' "$REL_PATH" >&2
  exit 2
fi
IFS=$'\t' read -r BUDGET TRANSITION UNIT LABEL <<< "$BUDGET_ROW"

MEASURED="$(governance_size_measure "$FILE_PATH" "$UNIT")" || {
  printf 'file-size hook blocked: could not measure %s in %s\n' "$FILE_PATH" "$UNIT" >&2
  exit 2
}
IFS=$'\t' read -r AMOUNT AUTO_AMOUNT <<< "$MEASURED"

MESSAGES=()

if [ "$AMOUNT" -gt "$BUDGET" ]; then
  AUTO_NOTE=""
  [ "$AUTO_AMOUNT" -gt 0 ] && AUTO_NOTE=" (excluding ${AUTO_AMOUNT} auto-maintained 被引用 ${UNIT})"
  if [ "$AMOUNT" -gt "$TRANSITION" ]; then
    MESSAGES+=("⛔ ${LABEL} at ${FILE_PATH} is ${AMOUNT} ${UNIT}${AUTO_NOTE} (hard cap ${TRANSITION}). Must reduce before adding. Run /knowledge-prune or identify which section to remove.")
  else
    MESSAGES+=("⚠️ ${LABEL} at ${FILE_PATH} is ${AMOUNT} ${UNIT}${AUTO_NOTE} (budget ${BUDGET}, transition cap ${TRANSITION}). Prefer consolidating over appending. What can you remove/merge to make room?")
  fi
fi

[ "${#MESSAGES[@]}" -eq 0 ] && exit 0
MSG="$(printf '%s\n' "${MESSAGES[@]}")"
ESCAPED=$(printf '%s' "$MSG" | jq -Rs .)
printf '{"governanceContext":{"hookEventName":"PreToolUse","message":%s}}\n' "$ESCAPED"
exit 0

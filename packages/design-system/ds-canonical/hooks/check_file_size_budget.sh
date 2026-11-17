#!/bin/bash
set -uo pipefail
# PreToolUse Edit/Write: per-file line budgets for governance files(只提醒,見下方 Non-blocking)。
#
# 上限表 —— 各檔(instruction entry / memory / spec / SKILL)上限的唯一住處 = lib/_size_budget.sh 的
# governance_size_budget,量法也在同一檔;本 hook 只負責「讀表、量、出聲」。外部文件寫「check_file_size_budget.sh
# 的 case 表」指的就是那張表。開場檔總行數、hook 數、memory 筆數門檻在 session_start_governance_check.sh
#(檔頭 + Check 7 / 8)。AGENTS.md `# 治理 canonical`「行數預算」只是指向這兩處的索引,不寫數值。
# Provider/instruction/skill 路徑由 canonical registry 解析,不以任一 generated home 當 authority。
#
# Non-blocking —— 超過 BUDGET 印 ⚠️、超過 TRANSITION 印 ⛔,一律 exit 0;經 governanceContext 由 adapter 送給模型。
# 為什麼不擋(D4-02 審計對本 hook 的結論:維持不擋):
#   - 預算是反膨脹指標,不是 SSOT 內容規則:它只報「這個檔多長」,不判定任何一句對錯,也不宣稱在執法。
#     governance/memory/feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md 要求 P0 的是「DS 寫進 spec.md /
#     canonical / SSOT 的東西」(該檔 Rule 段);它禁的「hook 偵測 → emit 警告但 exit 0 = 假裝 enforcement」
#     前提是有違規可判,長度本身沒有對錯。
#   - 硬擋會逼人為了湊數刪掉真規則、或把不同條目硬併 —— 正是 knowledge-prune SKILL.md「🔒 核心前提」
#     ③「每條真實 invariant / 機械防線必完整保留」與 ④「distinct 條目強合成大條目會降 recall 精度」禁止的事。
#   - 但也不能拿掉:沒有寫入當下的訊號,檔案只會一直堆 —— e017c41c 之前 meta-patterns.md 長到 55,456 bytes,
#     因為規則檔不在本表,一次都沒出聲。
#   - 真正會讓 CI 紅的上限另有正本:memory = governance/memory/contract.json(scripts/validate-memory-contract.mjs)。
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

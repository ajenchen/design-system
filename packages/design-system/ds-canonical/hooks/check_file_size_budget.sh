#!/bin/bash
set -uo pipefail
# PreToolUse Edit/Write: per-file size budgets for governance files(行數或字數;只提醒,見下方「只提醒、不擋」)。
#
# 上限表 —— 各檔(instruction entry / memory / rules / spec / SKILL)上限的唯一住處 = lib/_size_budget.sh 的
# governance_size_budget,量法也在同一檔;本 hook 只負責「讀表、量、出聲」。外部文件寫「check_file_size_budget.sh
# 的 case 表」指的就是那張表。開場檔總行數、hook 數、memory 筆數門檻在 session_start_governance_check.sh
#(檔頭 + Check 7 / 8)。AGENTS.md `# 治理 canonical`「行數預算」只是指向這兩處的索引,不寫數值。
# Provider/instruction/skill 路徑由 canonical registry 解析,不以任一 generated home 當 authority。
#
# 只提醒、不擋 —— 超過 BUDGET 或 TRANSITION 都印 ⚠️、一律 exit 0;經 governanceContext 由 adapter 送給模型。
#   訊息照實講只提醒(每則都帶「advisory — size overruns never block the edit」),不用「hard cap」「Must reduce」
#   這類像在執法的字:超標不擋,就不能說得像會擋(Test 25 守著)。不寫成「this hook never blocks」,
#   因為下一行的量具壞掉時它真的會 exit 2 擋下。
# 量具本身壞了(registry / provider / contract / 量法讀不到)不等於「沒超標」:exit 2 並說明,不默默放行(M37)。
# 真正會讓 CI 紅的上限另有正本:memory = governance/memory/contract.json(scripts/validate-memory-contract.mjs:56)。
#
# 「只提醒」和 user 2026-05-27 永久指令那份 memory 的做法不一致,照實記
#(D4-02 審計;是否接受這個偏離,目前沒有 user 原話):
#   governance/memory/feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md —— :12 是 user 原話;
#   下面四行是同檔據此寫下的做法(逐字):
#     :29「- 折衷:hook 偵測 → emit 警告但 exit 0 = 假裝 enforcement = 反 pattern」
#     :33「1. **是 SSOT canonical 嗎?**(寫進 spec.md / 既定 token / structural rule)」
#     :34「   - YES → P0 BLOCKER + per-line escape comment 機制」
#     :35「   - NO → 不該寫 hook,純 memory / spec.md 即可」
#   照這棵樹只有「擋」或「不寫 hook」兩種結果;本 hook 兩邊都不是。而且這張表在根目錄 AGENTS.md
#  「# 治理 canonical」的「行數預算」段與本檔第 5 行都被稱為上限的 SSOT／唯一住處 —— 照字面讀,
#   它就落在 :33 的「SSOT canonical」裡。
# 【AI 推導,不是 user 原話】D4-02 審計仍維持只提醒的理由:
#   - 長度預算只報「這個檔多長」,不判定任何一句對錯;AI 把它讀成不屬於 :33 括號裡列的那三類 ——
#     這和上一段的字面讀法相反,沒有 user 確認。
#   - 硬擋會逼人為了湊數刪掉真規則、或把不同條目硬併 —— knowledge-prune SKILL.md:10「🔒 核心前提」
#     ③「每條真實 invariant / 機械防線必完整保留」與 ④「distinct 條目強合成大條目會降 recall 精度 = 反 pattern」
#     (兩段原文講的是 prune;拿來推「所以預算不該擋」是 AI 的推論)。
#   - 拿掉 hook 也不行:沒有寫入當下的訊號,檔案只會一直堆 —— e017c41c 之前 meta-patterns.md 長到 55,456 bytes,
#     因為規則檔不在本表,一次都沒出聲。
#   要改成「超過 TRANSITION 就擋」或拿掉本 hook,只動本檔(呼叫端);上限表 lib/_size_budget.sh 不用改。

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
ADVISORY="advisory — size overruns never block the edit"

if [ "$AMOUNT" -gt "$BUDGET" ]; then
  AUTO_NOTE=""
  [ "$AUTO_AMOUNT" -gt 0 ] && AUTO_NOTE=" (excluding ${AUTO_AMOUNT} auto-maintained 被引用 ${UNIT})"
  if [ "$AMOUNT" -gt "$TRANSITION" ]; then
    MESSAGES+=("⚠️ ${LABEL} at ${FILE_PATH} is ${AMOUNT} ${UNIT}${AUTO_NOTE}, over the transition cap ${TRANSITION} (budget ${BUDGET}; ${ADVISORY}). Prefer removing or merging before appending: run /knowledge-prune or identify which section to remove.")
  else
    MESSAGES+=("⚠️ ${LABEL} at ${FILE_PATH} is ${AMOUNT} ${UNIT}${AUTO_NOTE} (budget ${BUDGET}, transition cap ${TRANSITION}; ${ADVISORY}). Prefer consolidating over appending. What can you remove/merge to make room?")
  fi
fi

# 表格單格上限(目前只有 meta-patterns 的 M-rule 第 2 欄):跟整檔預算分開量,整檔沒超也照樣看。
if CELL_ROW="$(governance_size_cell_budget "$REL_PATH")"; then
  IFS=$'\t' read -r CELL_LIMIT CELL_LABEL <<< "$CELL_ROW"
  OVERSIZED="$(governance_size_oversized_cells "$FILE_PATH" "$CELL_LIMIT")" || {
    printf 'file-size hook blocked: could not measure table cells in %s\n' "$FILE_PATH" >&2
    exit 2
  }
  if [ -n "$OVERSIZED" ]; then
    CELL_LIST="$(printf '%s\n' "$OVERSIZED" | awk -F '\t' '{ printf "%s%s %s chars", (NR > 1 ? ", " : ""), $1, $2 }')"
    MESSAGES+=("⚠️ ${CELL_LABEL} over ${CELL_LIMIT} chars (${ADVISORY}): ${CELL_LIST}. Keep the rule sentence in the cell; move incident narrative to skills/design-system-audit/references/historical-bugs.md and leave a one-line index.")
  fi
fi

[ "${#MESSAGES[@]}" -eq 0 ] && exit 0
MSG="$(printf '%s\n' "${MESSAGES[@]}")"
ESCAPED=$(printf '%s' "$MSG" | jq -Rs .)
printf '{"governanceContext":{"hookEventName":"PreToolUse","message":%s}}\n' "$ESCAPED"
exit 0

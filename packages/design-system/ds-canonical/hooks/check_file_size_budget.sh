#!/bin/bash
set -uo pipefail
# PreToolUse Edit/Write/MultiEdit: per-file size budgets for governance files(行數或字數)。
#
# 上限表 —— 各檔(instruction entry / memory / rules / spec / SKILL)上限的唯一住處 = lib/_size_budget.sh 的
# governance_size_budget,量法也在同一檔;本 hook 只負責「讀表、量、判擋不擋、出聲」。外部文件寫「check_file_size_budget.sh
# 的 case 表」指的就是那張表。開場檔總行數、hook 數、memory 筆數門檻在 session_start_governance_check.sh
#(檔頭 + Check 7 / 8)。AGENTS.md `# 治理 canonical`「行數預算」只是指向這兩處的索引,不寫數值。
# Provider/instruction/skill 路徑由 canonical registry 解析,不以任一 generated home 當 authority。
#
# 擋 / 不擋(2026-11-21 起,WP-15b;J-4b490b9929):
#   量的是「這次寫完的樣子」(after-image),跟磁碟上現在的樣子比:
#   - 寫完超過 TRANSITION(表上的過渡上限 = 硬上限),而且這次寫入讓它變長 → exit 2 擋(stderr 說明)。
#     例外:寫完的檔在檔頭(第一個 `## ` 標題之前)有檔案層級豁免標記 `@size-budget-allow: <reason>`
#     (markdown 寫成 `<!-- @size-budget-allow: … -->`,冒號後要有理由)→ 不擋,照樣出聲提醒。
#   - 超過 TRANSITION 但這次沒有讓它變長(刪減、原地改寫)→ 不擋,出聲提醒 —— 不然超標的檔連瘦身都改不了(M36(b) 自鎖)。
#   - 超過 BUDGET、沒超過 TRANSITION → 只提醒(governanceContext);表格單格上限(meta-patterns 第 2 欄)也只提醒。
#   每則提醒都帶「this write is not blocked」,不寫「hard cap」「Must reduce」這類像在執法的字(Test 25 守著)。
#   依據:governance/memory/feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md —— :12 是 user 2026-05-27 原話,
#     同檔 :29、:33–35 的決策樹只有「P0 擋」或「不寫 hook」兩種結果;根目錄 AGENTS.md「# 治理 canonical」的「行數預算」段
#     把這張表稱為上限的 SSOT。長度能確定性量出來(決策樹第 3 題),所以超過硬上限就擋,另給檔案層級豁免。
#   2026-11-21 前整支只提醒(38649f5a 起檔頭寫著 Non-blocking;D4-02 審計留下「長度預算不屬於那條指令的 SSOT」的 AI 判斷,
#     沒有 user 原話支持)。WP-15b 排程判定不交 user(hook / 治理工程,AGENTS.md「# 自主執行 canonical」AUTO 那一列),
#     照上面的決策樹改成擋;不沿用缺 user 原話的「只提醒」例外。
#
# after-image 從哪來:
#   - 正式入口(scripts/run-provider-hook.mjs)以 inputContract proposed-text-v1 交來 runner 算好的寫完內容
#     (GOVERNANCE_WRITE_STATE_TRUST=runner-v1 + tool_input.governance_write_state;registrations.json)。
#     Edit / MultiEdit / Codex apply_patch 都是 runner 算好的完整檔,不必在這裡重做 old_string → new_string。
#   - 直接呼叫(測試、手動):Write 的 content 就是寫完的整份檔;Edit / MultiEdit 照 old_string → new_string 套在磁碟原檔上。
#     套不上(old_string 不在檔裡)時那筆編輯本身也寫不進去 → 只量磁碟現況出聲,不擋。
#   - 刪檔 → 不量。
# 量具本身壞了(registry / provider / contract / 量法 / after-image 讀不到)不等於「沒超標」:exit 2 並說明,不默默放行(M37)。
# 真正會讓 CI 紅的上限另有正本:memory = governance/memory/contract.json(scripts/validate-memory-contract.mjs:56)。

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
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty') || {
  printf 'file-size hook blocked: hook input is not valid JSON\n' >&2
  exit 2
}

[ -z "$FILE_PATH" ] && exit 0
[ -d "$FILE_PATH" ] && exit 0
REL_PATH="$(governance_project_relative_path "$FILE_PATH" 2>/dev/null)" || exit 0

if BUDGET_ROW="$(governance_size_budget "$REL_PATH")"; then
  :
else
  rc=$?
  [ "$rc" -eq 1 ] && exit 0
  printf 'file-size hook blocked: budget lookup for %s failed (provider registry, active provider id, or governance/memory/contract.json unreadable)\n' "$REL_PATH" >&2
  exit 2
fi
IFS=$'\t' read -r BUDGET TRANSITION UNIT LABEL <<< "$BUDGET_ROW"

# ── 寫完的樣子(after-image)→ 暫存檔 ──
AFTER_FILE=$(mktemp "${TMPDIR:-/tmp}/check-file-size-budget.XXXXXX") || {
  printf 'file-size hook blocked: could not create a scratch file for the after-image\n' >&2
  exit 2
}
trap 'rm -f "$AFTER_FILE"' EXIT

_FILE_SIZE_AFTER_IMAGE_PY='
import json, os, sys

disk, out, trust = sys.argv[1], sys.argv[2], sys.argv[3]
event = json.loads(sys.stdin.buffer.read())
tool = event.get("tool_name") or ""
tool_input = event.get("tool_input") or {}

def emit(text):
    with open(out, "wb") as handle:
        handle.write(text.encode("utf-8", "surrogatepass"))
    print("text")
    sys.exit(0)

def unknown():
    print("unknown")
    sys.exit(0)

if trust == "runner-v1":
    state = tool_input.get("governance_write_state")
    if not isinstance(state, dict) or state.get("schemaVersion") != 1:
        sys.exit(3)
    path = state.get("path")
    if not isinstance(path, str) or not path:
        sys.exit(3)
    if not (disk == path or disk.endswith("/" + path)):
        sys.exit(4)
    if state.get("kind") == "deleted" and "content" not in state:
        print("deleted")
        sys.exit(0)
    if state.get("kind") == "text" and isinstance(state.get("content"), str):
        emit(state["content"])
    sys.exit(3)

if tool == "Write" and isinstance(tool_input.get("content"), str):
    emit(tool_input["content"])

pairs = None
if tool == "MultiEdit" and isinstance(tool_input.get("edits"), list) and tool_input["edits"]:
    pairs = [(edit.get("old_string"), edit.get("new_string"), bool(edit.get("replace_all")))
             for edit in tool_input["edits"] if isinstance(edit, dict)]
elif tool == "Edit":
    new = tool_input.get("new_string")
    if not isinstance(new, str):
        new = tool_input.get("content")
    pairs = [(tool_input.get("old_string"), new, bool(tool_input.get("replace_all")))]
if not pairs:
    unknown()

text = None
if os.path.isfile(disk):
    with open(disk, "rb") as handle:
        text = handle.read().decode("utf-8", "replace")
for old, new, replace_all in pairs:
    if not isinstance(old, str) or not isinstance(new, str):
        unknown()
    if text is None:
        if old == "":
            text = new
            continue
        unknown()
    if old == "" or old not in text:
        unknown()
    text = text.replace(old, new) if replace_all else text.replace(old, new, 1)
if text is None:
    unknown()
emit(text)
'

case "${GOVERNANCE_WRITE_STATE_TRUST:-}" in
  runner-v1|""|unavailable) ;;
  *)
    printf 'file-size hook blocked: unsupported proposed write state trust marker\n' >&2
    exit 2
    ;;
esac
AFTER_KIND=$(printf '%s' "$INPUT" | python3 -I -c "$_FILE_SIZE_AFTER_IMAGE_PY" "$FILE_PATH" "$AFTER_FILE" "${GOVERNANCE_WRITE_STATE_TRUST:-}" 2>/dev/null) || {
  printf 'file-size hook blocked: the after-image of %s could not be read (trusted proposed write state missing, malformed, or for another path)\n' "$REL_PATH" >&2
  exit 2
}
[ "$AFTER_KIND" = "deleted" ] && exit 0

# ── 量:磁碟現況(before)與寫完的樣子(after)──
BEFORE_AMOUNT=0
if [ -f "$FILE_PATH" ]; then
  BEFORE_MEASURED="$(governance_size_measure "$FILE_PATH" "$UNIT")" || {
    printf 'file-size hook blocked: could not measure %s in %s\n' "$FILE_PATH" "$UNIT" >&2
    exit 2
  }
  IFS=$'\t' read -r BEFORE_AMOUNT BEFORE_AUTO <<< "$BEFORE_MEASURED"
fi
CAN_BLOCK=0
MEASURE_FILE="$FILE_PATH"
if [ "$AFTER_KIND" = "text" ]; then
  CAN_BLOCK=1
  MEASURE_FILE="$AFTER_FILE"
elif [ ! -f "$FILE_PATH" ]; then
  exit 0 # 新檔、又算不出寫完的樣子:沒有東西可量
fi
MEASURED="$(governance_size_measure "$MEASURE_FILE" "$UNIT")" || {
  printf 'file-size hook blocked: could not measure %s in %s\n' "$FILE_PATH" "$UNIT" >&2
  exit 2
}
IFS=$'\t' read -r AMOUNT AUTO_AMOUNT <<< "$MEASURED"

AUTO_NOTE=""
[ "$AUTO_AMOUNT" -gt 0 ] && AUTO_NOTE=" (excluding ${AUTO_AMOUNT} auto-maintained 被引用 ${UNIT})"

# 檔案層級豁免:寫完的檔在檔頭(第一個 `## ` 標題之前)有 `@size-budget-allow: <reason>`
EXEMPT=0
if [ "$CAN_BLOCK" = 1 ] && awk '
    /^## / { body = 1 }
    !body && /@size-budget-allow:[ \t]*[^ \t>*-]/ { found = 1 }
    END { exit(found ? 0 : 1) }
  ' "$AFTER_FILE"; then
  EXEMPT=1
fi

if [ "$CAN_BLOCK" = 1 ] && [ "$AMOUNT" -gt "$TRANSITION" ] && [ "$AMOUNT" -gt "$BEFORE_AMOUNT" ] && [ "$EXEMPT" = 0 ]; then
  GROWTH=$((AMOUNT - BEFORE_AMOUNT))
  cat >&2 <<EOF
🚨 FILE-SIZE TRANSITION CAP BLOCKER(P0)
  ${LABEL} at ${FILE_PATH} would be ${AMOUNT} ${UNIT}${AUTO_NOTE} after this write — over the transition cap ${TRANSITION} (budget ${BUDGET}); this write adds ${GROWTH} ${UNIT}.
  上限表:hooks/lib/_size_budget.sh(governance_size_budget)。
  修法:先刪減或合併再加(/knowledge-prune;把事件經過搬到 historical-bugs.md、留一行索引),讓寫完的檔回到 ${TRANSITION} 以內,
        或這次寫入不讓它變長(超標的檔照樣可以刪減、原地改寫)。
  例外(檔案層級,要寫得出審查者能查的理由):檔頭(第一個 \`## \` 標題之前)加 \`<!-- @size-budget-allow: <reason> -->\`。
EOF
  exit 2
fi

MESSAGES=()
NOT_BLOCKED="this write is not blocked"
if [ "$AMOUNT" -gt "$TRANSITION" ]; then
  if [ "$EXEMPT" = 1 ]; then
    WHY="the file header declares @size-budget-allow"
  elif [ "$CAN_BLOCK" = 1 ]; then
    WHY="it does not grow the file; a write that grows it past the cap is blocked"
  else
    WHY="the after-image could not be computed from this payload, so the current file was measured"
  fi
  MESSAGES+=("⚠️ ${LABEL} at ${FILE_PATH} is ${AMOUNT} ${UNIT}${AUTO_NOTE}, over the transition cap ${TRANSITION} (budget ${BUDGET}; ${NOT_BLOCKED}: ${WHY}). Prefer removing or merging before appending: run /knowledge-prune or identify which section to remove.")
elif [ "$AMOUNT" -gt "$BUDGET" ]; then
  MESSAGES+=("⚠️ ${LABEL} at ${FILE_PATH} is ${AMOUNT} ${UNIT}${AUTO_NOTE} (budget ${BUDGET}, transition cap ${TRANSITION}; ${NOT_BLOCKED} below the transition cap). Prefer consolidating over appending. What can you remove/merge to make room?")
fi

# 表格單格上限(目前只有 meta-patterns 的 M-rule 第 2 欄):跟整檔預算分開量,整檔沒超也照樣看;只提醒。
if CELL_ROW="$(governance_size_cell_budget "$REL_PATH")"; then
  IFS=$'\t' read -r CELL_LIMIT CELL_LABEL <<< "$CELL_ROW"
  OVERSIZED="$(governance_size_oversized_cells "$MEASURE_FILE" "$CELL_LIMIT")" || {
    printf 'file-size hook blocked: could not measure table cells in %s\n' "$FILE_PATH" >&2
    exit 2
  }
  if [ -n "$OVERSIZED" ]; then
    CELL_LIST="$(printf '%s\n' "$OVERSIZED" | awk -F '\t' '{ printf "%s%s %s chars", (NR > 1 ? ", " : ""), $1, $2 }')"
    MESSAGES+=("⚠️ ${CELL_LABEL} over ${CELL_LIMIT} chars (${NOT_BLOCKED}: the table-cell budget is a reminder): ${CELL_LIST}. Keep the rule sentence in the cell; move incident narrative to skills/design-system-audit/references/historical-bugs.md and leave a one-line index.")
  fi
fi

[ "${#MESSAGES[@]}" -eq 0 ] && exit 0
MSG="$(printf '%s\n' "${MESSAGES[@]}")"
ESCAPED=$(printf '%s' "$MSG" | jq -Rs .)
printf '{"governanceContext":{"hookEventName":"PreToolUse","message":%s}}\n' "$ESCAPED"
exit 0

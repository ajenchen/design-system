#!/bin/bash
# check_bash_command_shape.sh —— PreToolUse(Bash):指令的「動作」與「寫法」兩件事,一支 hook 看完。
#
# 出處:交接 logs/process-audit-2026-11-18.md 根因 6「[排進 PROC]」兩條(第 429、434 行),工作包 PROC-H。
#
# (1) deny 照動作意思比對(會擋,exit 2)
#   Claude Code 的 permissions.deny 只比字面:`git -C <dir> checkout -- f`、函式 / 變數包裝、sh -c、eval
#   都換個拼法就過(11-18 實測:加了 -C 連丟改動也放行;沒加 -C 連開分支也擋)。本 hook 把指令展開、還原成
#   一般寫法後,拿**同一份** deny 清單(adapters/claude-settings-base.json 的 permissions.deny,不另抄)再比一次。
#   展開與比對的唯一實作:hooks/lib/_deny_norm.py 的 `hook` 子指令;判定表:tests/fixtures/deny-norm/cases.json。
#   _deny_norm.py 讀不懂事件 / 讀不到 deny 檔(結束碼 3)= 儀器失效:照 fail-open 放行,但一定經 context 通道
#   告訴模型「這次沒比對」(M37:沒觀察到 ≠ 沒發生;stderr 在 exit 0 時模型看不到)。
#
# (2) 提示 emulate sh(不擋,只走 governance-context —— 模型看得到的管道)
#   只用一個條件(process-audit 第 430 行):指令裡出現 `$`、`*`,或有以 `=` 開頭的字,而第一行不是 `emulate sh`。
#   不判斷變數內容(那會大量誤擋)。zsh 當 sh 寫的三種形狀見 AGENTS.md「失敗記憶索引」工具靜默陷阱那列。
#
# 已知範圍:deny 清單本身只能表達 glob;`git checkout README.md`(不帶 `--`)跟切分支同形,兩邊都分不出 → 放行
#(判定表 P16 照實列)。不收 Read / Edit 等其他工具(deny 的 Read(...) 規則由 provider 自己比)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
INPUT=$(cat 2>/dev/null || echo '{}')
TOOL_NAME=$(jq -r '.tool_name // empty' <<<"$INPUT" 2>/dev/null)
[ "$TOOL_NAME" = "Bash" ] || exit 0
COMMAND=$(jq -r '.tool_input.command // empty' <<<"$INPUT" 2>/dev/null)
[ -n "$COMMAND" ] || exit 0

NOTICES=""

# ── (1) deny 照動作意思 ──────────────────────────────────────────────────────
# deny 檔:先找 hook 語料根(密封模式是私有快照,run-provider-hook.mjs 的 hookCorpusAuthorityPaths 有列這個檔),
# 再退回本檔所在的 repo。兩處都沒有 = 儀器失效,交給 _deny_norm.py 回 3。
DENY_REL="packages/design-system/ds-canonical/adapters/claude-settings-base.json"
DENY_FILE="${GOVERNANCE_CORPUS_ROOT:+$GOVERNANCE_CORPUS_ROOT/$DENY_REL}"
if [ -z "$DENY_FILE" ] || [ ! -f "$DENY_FILE" ]; then
  DENY_FILE="$SELF_DIR/../adapters/claude-settings-base.json"
fi
DENY_NORM="$SELF_DIR/lib/_deny_norm.py"
DECISION=$(printf '%s' "$INPUT" | python3 -I "$DENY_NORM" hook --deny-file "$DENY_FILE" 2>/dev/null)
DENY_RC=$?
case "$DENY_RC" in
  0) ;;
  2)
    RULES=$(jq -r '(.rules // []) | join("、")' <<<"$DECISION" 2>/dev/null)
    SHOWN=$(jq -r '[(.literal // [])[], (.normalized // [])[]] | map(select(. != null)) | unique | .[:4] | map("  → " + .) | join("\n")' <<<"$DECISION" 2>/dev/null)
    cat >&2 <<EOF

┄┄┄ check_bash_command_shape — deny 照動作意思比對 ┄┄┄

這則指令展開、還原成一般寫法(git -C / -c、env 前綴、函式 / 變數包裝、sh -c、eval、絕對路徑)之後,
命中 deny 清單(${DENY_REL}):
  規則:${RULES:-?}
${SHOWN}

換寫法不會改變動作本身:這是會丟改動 / 不可逆的動作,不要做,也不要換別的寫法再試。
開分支(checkout -b / -B、switch -c)、切到既有分支不受影響。真的需要時停下,寫明要做什麼、為什麼,交上層決定。
EOF
    exit 2
    ;;
  *)
    WHY=$(jq -r '.why // empty' <<<"$DECISION" 2>/dev/null)
    WHY="${WHY:0:200}"
    NOTICES="⚠️ deny 照動作意思的比對這次沒有跑成(hooks/lib/_deny_norm.py 結束碼 ${DENY_RC}${WHY:+:$WHY}),本次照一般模式放行 —— 這則指令等於沒經過換寫法比對,不能當成「檢查通過」。"
    ;;
esac

# ── (2) emulate sh 提示 ─────────────────────────────────────────────────────
SHAPE=0
case "$COMMAND" in *'$'*|*'*'*) SHAPE=1 ;; esac
if [ "$SHAPE" = 0 ] && [[ "$COMMAND" =~ (^|[[:space:]])= ]]; then SHAPE=1; fi
FIRST_LINE="${COMMAND%%$'\n'*}"
EMULATED=0
if [[ "$FIRST_LINE" =~ ^[[:space:]]*emulate[[:space:]]+sh([[:space:]]*$|[[:space:]]*\;|[[:space:]]*\&\&) ]]; then EMULATED=1; fi
if [ "$SHAPE" = 1 ] && [ "$EMULATED" = 0 ]; then
  HINT="提示(emulate sh):這則 Bash 指令有 \`\$\`、\`*\` 或以 \`=\` 開頭的字,第一行卻不是 \`emulate sh\`。Bash 工具底下是 zsh:\`\$V\` 不拆字、萬用字元沒匹配整行不跑、\`=字\` 會被當成指令路徑展開(\`[ a == b ]\` 直接報錯)。第一行加 \`emulate sh\` 就照 sh 的規則跑。"
  NOTICES="${NOTICES:+$NOTICES

}$HINT"
fi

[ -n "$NOTICES" ] || exit 0
jq -n --arg msg "$NOTICES" '{governanceContext:{hookEventName:"PreToolUse",message:$msg}}'
exit 0

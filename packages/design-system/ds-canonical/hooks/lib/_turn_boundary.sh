#!/bin/bash
# 「本回合從 transcript 哪一行開始」的唯一判斷(2026-11-21,工作包 E7;交接 process-audit 根因 8 修法)。
#
# 為什麼抽出來:stop_self_audit.sh 原本有兩份判斷 —— 檔頭的 LAST_USER_LINE(role=user 且不是 tool_result 就算新回合)
# 與 Mechanism 10 的 self_lock_genuine_prompt_lines(只認 user 本人的話)。前者把 Stop hook 回饋(isMeta、role=user 的字串)
# 也當成新回合:推播之後被別的 hook 擋一次,補正回覆就看不到前面那次推播,Mechanism 6 誤擋;分類器擋下之後來一則背景通知,
# Mechanism 10b 就看不到那筆擋下(PROBE-6)。check_propose_discipline.sh 的 r1 / r3 又各自用 python 寫了一份。
# 同一件事只准在這裡判一次;各 Mechanism 只挑「從哪一種紀錄算起」,挑法寫在下面的表。
#
# governance_turn_marks <transcript>
#   對 transcript 裡每一筆 role=user、不是 tool_result 的紀錄印一行「行號 種類」(行號 = 實體行號,空白分隔):
#     human     user 本人說的話(開新回合)。
#     wake      不是 user 說的話,但會在沒人看著的情況下叫醒 AI 回一則:背景工作通知(origin.kind = task-notification
#               或內文有 <task-notification> / [SYSTEM NOTIFICATION)、別的代理傳來的訊息(origin.kind = peer)。
#     feedback  Stop hook 回饋(內文以「Stop hook feedback」開頭):hook 擋下 turn 之後塞回來的理由,一律不算新回合。
#     meta      其餘注入:isMeta、掛在工具上的(sourceToolUseID)、system-reminder、`!` 指令的輸入輸出、斜線指令、
#               本機指令輸出、對話接續摘要、中斷標記、空字串,以及 origin.kind 不是 human 的其他來源。
#   type 不是 user 的紀錄(例:api-request-blob,API 請求的重放副本,會夾帶更早的訊息)不印。
#   判斷順序:wake(看 origin 與通知字樣)→ feedback → meta → human;沒有 origin 欄位的舊紀錄照內文判。
#
# 各 Mechanism 從哪一種紀錄算起(唯一的選擇表;改這裡要一起改對應測試):
#   最後一個 human                    = 回合起點(LAST_USER_LINE):M1 驗證證據、M4 / M5 / M7 的本回合紀錄、M8b / M9 的 user 原話、
#                                       M10 的「上一則 / 本則 user 提問」、M10b 的擋下紀錄與回報文字、M12 的推播 / 提問 / 回覆與 user 原話、
#                                       check_propose_discipline r2(本回合全部回覆)與 r3(本回合寫入)。背景通知、hook 回饋都不切回合。
#   最後一個 human 或 wake            = Mechanism 6 推播的起點:背景通知叫醒的回覆沒人在看,要自己推播;hook 回饋不切,
#                                       所以「推播 → 被別的 hook 擋 → 補正回覆」不必再推一次。
#   最後一筆(任何種類)              = 「這一則回覆」的起點:M1 拿來取代 LAST_ASSISTANT 的回覆文字、M10 的交辦管道、
#                                       check_propose_discipline r1 的中途文字。說出口的話收不回來,被擋之後只看補正那一則,
#                                       否則被擋的那句永遠留在範圍裡,turn 結束不了。
governance_turn_marks() {
  local transcript="${1:-}"
  [ -n "$transcript" ] && [ -f "$transcript" ] || return 0
  # grep 先篩(transcript 可達數百 MB);jq 逐行判。grep 找不到時回 1,不是錯誤。
  { grep -n '"role":"user"' "$transcript" 2>/dev/null || true; } | { grep -v '"type":"tool_result"' || true; } \
    | jq -R -r '
      (capture("^(?<n>[0-9]+):(?<j>.*)$")?) as $m
      | ($m.j | fromjson?) as $r
      | select(($r | type) == "object" and ($r.type == null or $r.type == "user"))
      | select((($r.message? | type) == "object" and $r.message.role == "user") or $r.role? == "user")
      | ((($r.message? // {}) | .content?) // $r.content?) as $c
      | ($c | if type == "string" then .
          elif type == "array" then ([.[]? | select(type == "object" and .type == "text") | (.text? | strings)] | join("\n"))
          else "" end) as $t
      | (($r.origin? | if type == "object" then .kind else null end)) as $origin
      | (if $origin == "task-notification" or $origin == "peer"
            or ($t | test("<task-notification>")) or ($t | test("^\\s*\\[SYSTEM NOTIFICATION\\b")) then "wake"
         elif ($t | test("^\\s*Stop hook feedback")) then "feedback"
         elif $r.isMeta == true or ($r.sourceToolUseID? | type) == "string" then "meta"
         elif $origin != null and $origin != "human" then "meta"
         elif ($t | test("^\\s*(<system-reminder>|<bash-(input|stdout|stderr)>|<local-command-|<command-(name|message|args)>|This session is being continued|\\[Request interrupted)")) then "meta"
         elif ($t | test("^\\s*$")) then "meta"
         else "human" end) as $kind
      | "\($m.n) \($kind)"'
}

# governance_turn_last <marks> <種類…>:印出 marks 裡最後一筆屬於這些種類的行號;沒有就印 0。
governance_turn_last() {
  local marks="$1"; shift
  printf '%s\n' "$marks" | awk -v kinds=" $* " 'index(kinds, " " $2 " ") > 0 { n = $1 } END { print n + 0 }'
}

# governance_turn_lines <marks> <種類…>:依序印出 marks 裡屬於這些種類的每個行號(一行一個)。
governance_turn_lines() {
  local marks="$1"; shift
  printf '%s\n' "$marks" | awk -v kinds=" $* " 'index(kinds, " " $2 " ") > 0 { print $1 }'
}

# governance_assistant_text_after <transcript> <行號>:印出該行之後所有 assistant 紀錄的 text 區塊(依序,換行分隔)。
# 只認 type 為 assistant(或沒有 type 欄位的舊紀錄);api-request-blob 副本不算,不然同一句會被算兩次、或把更早的回覆帶進來。
governance_assistant_text_after() {
  local transcript="${1:-}" from="${2:-0}"
  [ -n "$transcript" ] && [ -f "$transcript" ] || return 0
  case "$from" in (''|*[!0-9]*) from=0 ;; esac
  # 逐行 fromjson?:壞掉的一行只跳過那一行,不讓 jq 在那裡停下、把後面的回覆全丟掉。
  tail -n +$((from + 1)) "$transcript" 2>/dev/null | jq -R -r '
    fromjson? | select(type == "object" and (.type == null or .type == "assistant") and .message.role? == "assistant")
    | .message.content? | if type == "string" then .
      elif type == "array" then (.[]? | select(type == "object" and .type == "text") | (.text? | strings))
      else empty end' 2>/dev/null
}

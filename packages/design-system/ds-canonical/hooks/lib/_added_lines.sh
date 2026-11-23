#!/bin/bash
# _added_lines.sh —「這次編輯新增了哪幾行」與「這次讓檔案變長幾行」的唯一判法(共用 helper,只被 source,不是規則、不寫 fire 紀錄)。
#
# 給 post_edit_dispatcher.sh 底下會擋的 helper 用(D4-02 審計,2026-11-18):規則只對**這次新增的行**擋;
# 檔案裡早就在的違規不是這次編輯造成的,不擋,只列成「既有」交給 /design-system-audit 對應維度收。
#
# 先認輸入的形狀,取出「這次寫進去的文字」(old_string → new_string 配對):
#   (a) provider 原樣 —— Edit:tool_input.new_string(配 old_string);MultiEdit:tool_input.edits[] 每一筆。
#       直接呼叫 dispatcher、deep-audit 整檔重播(scripts/produce-hook-enforced-evidence.mjs)是這個形狀。
#   (b) 正式入口 scripts/run-provider-hook.mjs 交給 hook 的 event-v1 形狀 —— 沒有 new_string、也沒有 edits[]
#       (寫入類不帶原始 tool_input,逐檔 payload 只放 path / content / old_string,edits 會被刪掉),
#       只剩 tool_input.content(這次寫進去的文字)與 tool_input.old_string。repo 慣例同
#       check_datatable_invariants.sh / check_ds_anchor_preflight.sh 的 `.tool_input.content // .tool_input.new_string`:
#       Edit → content 就是那一筆的 new_string,配 old_string,逐筆精確,判法同 (a);
#       MultiEdit(Codex apply_patch 等別名也正規化成 MultiEdit)→ content 是每一筆 new_string 用換行接起來、
#       old_string 只有第一筆的,配對不準 → 照 (a) 的判法找一次之外,一律再加上寬判(見下),寧可多判。
#   (c) 兩者都沒有(正式入口的 Edit 在 new_string 是空字串 = 純刪除時不帶 content;或其他缺欄位)→
#       拿不到可比對的文字,不得讀成「沒有新增行」—— 退回 git HEAD 比對(同 Write)。
#   2026-11-20 前只認 (a):正式入口的 Edit / MultiEdit 一律被讀成「沒有新增行」,三支逐行 helper 與 file-size
#   「這次變長」在正式路徑上從沒擋過(WP-15a 審查必修 1、2;對照組:各 helper 測試與 test_post_edit_dispatcher.sh 的「runner 形狀」格)。
#
# 新增行的定義(逐字;行號一律指寫完的那個檔,與 grep -n / awk FNR 同一套數法:以 \n 分行):
#   對每一對 old_string → new_string:
#     在寫完的檔裡找 new_string 出現的每一處,取它跨到的完整行(含頭尾被它切到一半的那兩行)當「改過的範圍」;
#     把範圍裡的 new_string 換回 old_string 得到「改之前的範圍」;改過的範圍裡,文字不在改之前範圍裡的行 = 新增行。
#     所以只改一行中間幾個字(old_string / new_string 只是片段)時,那一整行算新增 —— 2026-11-20 前的判法是
#     「new_string 的行扣掉 old_string 的行,再拿整行文字去檔案裡比」,片段永遠比不到整行,
#     `old_string: p-2"` → `new_string: p-2 shadow-md"` 這種編輯整個漏掉(M37:片段文字 ≠ 被改的那一行)。
#     new_string == old_string(deep-audit 整檔重播)或 new_string 空(純刪除)→ 這一筆沒有新增行。
#     new_string 在寫完的檔裡找不到(同一個 MultiEdit 後面的 edit 又改掉了它),或配對不準((b) 的 MultiEdit)→ 寬判:
#     檔案裡含有 new_string 任一非空行(且那行不是 old_string 原有的行)的每一行都算新增(寧可多判,不可漏判)。
#     new_string 在檔案裡出現不只一處時每一處都算 —— 檔案裡另一處一字不差的既有片段也會一起報,那一處本身也違規,報了不冤。
#   Write / 其他 / 缺 tool_name / (c) —— 寫完的檔逐行扣掉 git HEAD 版本裡出現過的行(整檔比整檔,沒有片段問題;
#     搬動位置的既有行不算新增);檔案不在 HEAD(新檔、或根本不在 git 裡)→ 每一行都算新增。
#
# 淨增行數(_code_quality.sh 的 file-size「這次變長」用):
#   逐筆配對精確((a)、(b) 的 Edit)→ Σ(new_string 的換行數 − old_string 的換行數),依據 = edit;
#   其餘((b) 的 MultiEdit、(c)、Write / 其他)→ 寫完的行數 − git HEAD 版本行數,依據 = head;不在 HEAD → 整檔行數,依據 = new。
#
# 量具壞了(python3 / git 以外的失敗、輸入不是 JSON、輸出寫不進去)回非 0,呼叫端必須以 GOVERNANCE_INTEGRITY 名義 exit 70,
# 不得讀成「沒有新增行」(M37:沒觀察到 ≠ 沒發生)。

_GOVERNANCE_ADDED_LINES_PY='
import json, os, subprocess, sys

def lines_of(data):
    parts = data.split(b"\n")
    if parts and parts[-1] == b"":
        parts.pop()
    return parts

def line_no(data, offset):
    return data.count(b"\n", 0, offset) + 1

def encoded(value):
    return (value or "").encode("utf-8", "surrogatepass")

def edit_pairs(event):
    # 回 (配對清單, 逐筆精確);拿不到可比對的文字 → (None, False)。形狀 (a) / (b) / (c) 見檔頭。
    tool = event.get("tool_name") or ""
    tool_input = event.get("tool_input") or {}
    if tool not in ("Edit", "MultiEdit"):
        return None, False
    if tool == "MultiEdit" and tool_input.get("edits"):
        return [(encoded(edit.get("old_string")), encoded(edit.get("new_string"))) for edit in tool_input["edits"]], True
    if tool == "Edit" and isinstance(tool_input.get("new_string"), str):
        return [(encoded(tool_input.get("old_string")), encoded(tool_input["new_string"]))], True
    content = tool_input.get("content")
    if isinstance(content, str) and content:
        return [(encoded(tool_input.get("old_string")), encoded(content))], tool == "Edit"
    return None, False

def head_version(path):
    # git HEAD 版本的內容;不在 HEAD(新檔)或不在 git 裡 → None
    try:
        done = subprocess.run(
            ["git", "-C", os.path.dirname(path) or ".", "show", "HEAD:./" + os.path.basename(path)],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        )
    except OSError:
        return None
    return done.stdout if done.returncode == 0 else None

mode, path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
if mode not in ("added", "growth"):
    sys.exit(2)
event = json.loads(sys.stdin.buffer.read())
with open(path, "rb") as handle:
    post = handle.read()
pairs, exact = edit_pairs(event)

if mode == "growth":
    if exact:
        result = "%d edit" % sum(new.count(b"\n") - old.count(b"\n") for old, new in pairs)
    else:
        base = head_version(path)
        if base is None:
            result = "%d new" % len(lines_of(post))
        else:
            result = "%d head" % (len(lines_of(post)) - len(lines_of(base)))
    with open(out_path, "w") as handle:
        handle.write(result + "\n")
    sys.exit(0)

added = set()
if pairs is None:
    base = head_version(path)
    if base is None:
        added.update(range(1, len(lines_of(post)) + 1))
    else:
        seen = set(lines_of(base))
        for number, text in enumerate(lines_of(post), 1):
            if text not in seen:
                added.add(number)
else:
    for old, new in pairs:
        if new == old or new == b"":
            continue
        found = False
        start = 0
        while True:
            at = post.find(new, start)
            if at < 0:
                break
            found = True
            end = at + len(new)
            window_start = post.rfind(b"\n", 0, at) + 1
            window_end = post.find(b"\n", max(end - 1, at))
            if window_end < 0:
                window_end = len(post)
            window_post = post[window_start:window_end].split(b"\n")
            window_pre = set((post[window_start:at] + old + post[end:window_end]).split(b"\n"))
            first = line_no(post, window_start)
            for index, text in enumerate(window_post):
                if text not in window_pre:
                    added.add(first + index)
            start = end
        if not found or not exact:
            old_lines = set(old.split(b"\n"))
            fragments = [part for part in new.split(b"\n") if part.strip() and part not in old_lines]
            for number, text in enumerate(lines_of(post), 1):
                if any(fragment in text for fragment in fragments):
                    added.add(number)
with open(out_path, "w") as handle:
    for number in sorted(added):
        handle.write(f"{number}\n")
'

# governance_added_line_numbers <canonical event JSON> <寫完的檔案路徑> <輸出檔>
#   把這次編輯新增的行號(每行一個,由小到大)寫進輸出檔。成功 0;量具失效非 0。
governance_added_line_numbers() {
  local input="$1" file="$2" out="$3"
  [ -f "$file" ] || return 1
  printf '%s' "$input" | python3 -I -c "$_GOVERNANCE_ADDED_LINES_PY" added "$file" "$out" 2>/dev/null
}

# governance_line_growth <canonical event JSON> <寫完的檔案路徑> <輸出檔>
#   把「淨增行數 依據」寫成一行進輸出檔(例 `1 edit`、`-2 head`、`986 new`;依據的意思見檔頭)。成功 0;量具失效非 0。
governance_line_growth() {
  local input="$1" file="$2" out="$3"
  [ -f "$file" ] || return 1
  printf '%s' "$input" | python3 -I -c "$_GOVERNANCE_ADDED_LINES_PY" growth "$file" "$out" 2>/dev/null
}

# governance_drop_escaped_hits <「行號:內容」命中清單> <檔案> <豁免標記 ERE> [same|same-or-prev]
#   拿掉「該行(same-or-prev 時含上一行)寫了豁免標記」的命中,其餘照原樣印出。
#   標記 ERE 由呼叫端給,一律要求冒號後有理由(例 `@native-overflow-ok:[ \t]*[^ \t]`);
#   只用 [ \t] 不用 [[:space:]],Linux CI 的 mawk 與 macOS awk 都認得。
governance_drop_escaped_hits() {
  local hits="$1" file="$2" marker="$3" scope="${4:-same}"
  [ -n "$hits" ] || return 0
  printf '%s\n' "$hits" | awk -v f="$file" -v re="$marker" -v scope="$scope" '
    BEGIN { n = 0; while ((getline l < f) > 0) { n++; L[n] = l } }
    /^[0-9]+:/ {
      split($0, p, ":"); k = p[1] + 0
      if (L[k] ~ re) next
      if (scope == "same-or-prev" && k > 1 && L[k - 1] ~ re) next
      print
    }
  ' 2>/dev/null
}

# governance_emit_verdict <擋的訊息> <既有違規訊息>
#   擋的訊息非空 → 只寫 stderr(擋的訊息,後面附既有違規)並 exit 2;
#   只有既有違規 → stdout 印一個 PostToolUse governanceContext 並 exit 0;兩者皆空 → exit 0 不出聲。
#   (adapter 契約:exit 2 不得寫 stdout、exit 0 不得寫 stderr —— scripts/lib/provider-hook-output-transport.mjs)
governance_emit_verdict() {
  local block="$1" existing="$2"
  if [ -n "$block" ]; then
    if [ -n "$existing" ]; then
      printf '%s\n\n%s\n' "$block" "$existing" >&2
    else
      printf '%s\n' "$block" >&2
    fi
    exit 2
  fi
  if [ -n "$existing" ]; then
    jq -n --arg ctx "$existing" '{governanceContext:{hookEventName:"PostToolUse",message:$ctx}}' 2>/dev/null || {
      printf 'GOVERNANCE_INTEGRITY: post-edit helper 無法編碼既有違規清單\n' >&2
      exit 70
    }
  fi
  exit 0
}

# governance_split_hits <「行號:內容」命中清單> <新增行號清單檔> <新增命中輸出檔> <既有命中輸出檔>
#   依行號把命中分成「這次新增的行」與「既有的行」兩份。
governance_split_hits() {
  local hits="$1" numbers_file="$2" added_out="$3" existing_out="$4"
  : >"$added_out" || return 1
  : >"$existing_out" || return 1
  [ -n "$hits" ] || return 0
  printf '%s\n' "$hits" | awk -v numfile="$numbers_file" -v addedout="$added_out" -v existingout="$existing_out" '
    BEGIN { while ((getline n < numfile) > 0) added[n] = 1 }
    /^[0-9]+:/ {
      split($0, parts, ":")
      if (parts[1] in added) print > addedout
      else print > existingout
    }
  ' 2>/dev/null
}

#!/bin/bash
# test_check_propose_discipline.sh — 聚合測試(2026-06-11 prune merge 同名 coverage)
# check_propose_discipline.sh 為 multi-rule 合併檔;各規則的完整 positive/negative 案例在下列既有
# per-rule 測試(已 repoint 至合併檔)。本檔 = name-matched coverage gate 入口,零重複。
set -uo pipefail
DIR="$(dirname "$0")"
fail=0
bash "$DIR/test_check_propose_plain_chinese.sh" < /dev/null || { echo "SUB-FAIL: test_check_propose_plain_chinese.sh"; fail=1; }
bash "$DIR/test_check_propose_cite_required.sh" < /dev/null || { echo "SUB-FAIL: test_check_propose_cite_required.sh"; fail=1; }

FAULT_DIR=$(mktemp -d)
[ -n "${FAULT_DIR:-}" ] && [ -d "$FAULT_DIR" ] || { echo "❌ mktemp -d failed(FAULT_DIR;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
trap 'rm -rf -- "$FAULT_DIR"' EXIT
# 下面幾格把 hook 複製到 FAULT_DIR 再注入故障;hook 會 source 同層 lib/_turn_boundary.sh(回合判斷的唯一住處,2026-11-21),
# 一起帶過去,否則每一格都只會量到「helper 不在 → rc70」。
mkdir -p "$FAULT_DIR/lib" && cp "$DIR/../lib/_turn_boundary.sh" "$FAULT_DIR/lib/_turn_boundary.sh" \
  || { echo "❌ cannot stage turn-boundary helper into FAULT_DIR" >&2; exit 1; }
awk '
  { print }
  $0 == "r1_plain_chinese() {" { print "return 1" }
' "$DIR/../check_propose_discipline.sh" >"$FAULT_DIR/check_propose_discipline.sh"
set +e
printf '%s' '{}' | bash "$FAULT_DIR/check_propose_discipline.sh" \
  >"$FAULT_DIR/stdout" 2>"$FAULT_DIR/stderr"
rc=$?
set -e
if [ "$rc" -eq 70 ] \
  && [ ! -s "$FAULT_DIR/stdout" ] \
  && grep -qF 'GOVERNANCE_INTEGRITY:' "$FAULT_DIR/stderr" \
  && grep -qF 'exit code 1' "$FAULT_DIR/stderr"; then
  echo "PASS: unexpected propose child exit 1 uses integrity rc70"
else
  echo "SUB-FAIL: unexpected propose child exit 1 was not failed closed (exit $rc)"
  fail=1
fi

set +e
printf '%s' '{"hook_event_name":"Stop","last_assistant_message":"這是規定，沒有引用。"}' \
  | bash "$DIR/../check_propose_discipline.sh" \
      >"$FAULT_DIR/policy.stdout" 2>"$FAULT_DIR/policy.stderr"
rc=$?
set -e
if [ "$rc" -eq 2 ] && [ ! -s "$FAULT_DIR/policy.stdout" ] \
  && grep -qF 'PROPOSE-WITHOUT-CITE BLOCKER' "$FAULT_DIR/policy.stderr" \
  && ! grep -qF 'GOVERNANCE_INTEGRITY:' "$FAULT_DIR/policy.stderr"; then
  echo "PASS: real propose policy blocker remains stderr-only rc2"
else
  echo "SUB-FAIL: real propose policy blocker contract changed (exit $rc)"
  fail=1
fi

# A native provider reply can be much larger than a pipe buffer. Put both the
# claim and its valid cite at the first byte so any producer→grep -q regression
# deterministically surfaces as raw stderr / rc70 under the strict aggregator.
{
  printf '這是規定，packages/design-system/src/demo.spec.md:42\n'
  awk 'BEGIN { for (i = 0; i < 300000; i++) printf "x" }'
} | jq -Rs '{hook_event_name:"Stop",last_assistant_message:.}' \
  >"$FAULT_DIR/large-native-input.json"
set +e
bash "$DIR/../check_propose_discipline.sh" \
  <"$FAULT_DIR/large-native-input.json" \
  >"$FAULT_DIR/large-native.stdout" 2>"$FAULT_DIR/large-native.stderr"
rc=$?
set -e
if [ "$rc" -eq 0 ] \
  && [ ! -s "$FAULT_DIR/large-native.stdout" ] \
  && [ ! -s "$FAULT_DIR/large-native.stderr" ]; then
  echo "PASS: >256KiB early-match native reply remains clean"
else
  echo "SUB-FAIL: >256KiB early-match native reply changed contract (exit $rc)"
  fail=1
fi

# 規則分派 SIGPIPE 同族回歸(69230cef,2026-09-25;寫法同 test_check_consumer_app_invariants.sh 的同名一格):
# 上一格只看 exit 與輸出,證明不了後面的規則有跑。把 r2 與最後一條 r3 注入成「不讀 stdin、留標記、exit 0」,
# 用同一份 >256 KiB 輸入跑:不讀 stdin 就退出不得被判成 rc70(舊寫法 `printf | rule` 會 SIGPIPE → 141),
# 而且兩個標記都必須存在(派工真的走到最後一條)。
_R2_MARKER="$FAULT_DIR/r2-reached"
_R3_MARKER="$FAULT_DIR/r3-reached"
awk '
  { print }
  $0 == "r2_cite_required() {" { print ": >\"$R2_MARKER\"; exit 0" }
  $0 == "r3_planning_doc_cite() {" { print ": >\"$R3_MARKER\"; exit 0" }
' "$DIR/../check_propose_discipline.sh" >"$FAULT_DIR/check_propose_bigstdin.sh"
set +e
R2_MARKER="$_R2_MARKER" R3_MARKER="$_R3_MARKER" bash "$FAULT_DIR/check_propose_bigstdin.sh" \
  <"$FAULT_DIR/large-native-input.json" \
  >"$FAULT_DIR/big.stdout" 2>"$FAULT_DIR/big.stderr"
rc=$?
set -e
if [ "$rc" -eq 0 ] && [ ! -s "$FAULT_DIR/big.stdout" ] && [ ! -s "$FAULT_DIR/big.stderr" ] \
  && [ -f "$_R2_MARKER" ] && [ -f "$_R3_MARKER" ]; then
  echo "PASS: >256KiB input + r2/r3 exit without reading stdin → rc0 and both were reached"
else
  echo "SUB-FAIL: large stdin + non-reading r2/r3 → exit $rc, r2 reached=$([ -f "$_R2_MARKER" ] && echo yes || echo no), r3 reached=$([ -f "$_R3_MARKER" ] && echo yes || echo no) ($(head -c 200 "$FAULT_DIR/big.stderr"))"
  fail=1
fi

# ── r3_planning_doc_cite(2026-11-18 H-M4,原 check_propose_pre_grep_verify.sh 併入)──
# transcript 用真實形狀:一行一筆 {type, message:{role, content}},同 fixtures/transcripts/claude-transcript-jsonl-v2.jsonl;
# Write / Edit / MultiEdit 的 input 欄位照 Claude Code 工具;每筆 tool_use 有自己的 id,後面接對應的 tool_result
# (r3 只算 tool_result 不是 is_error 的寫入)。磁碟上的文件另外寫一份(r3 也看檔案現在還有沒有提案 / 出處)。
R3_DIR="$FAULT_DIR/r3"
mkdir -p "$R3_DIR"
R3_CASE=0
R3_TOOL=0
r3_new() { # 開一份新 transcript,第一筆是使用者訊息;回傳路徑放在 R3_T
  R3_CASE=$((R3_CASE + 1))
  R3_T="$R3_DIR/t$R3_CASE.jsonl"
  jq -nc --arg t "${1:-幫我整理這次的規劃}" '{type:"user",message:{role:"user",content:[{type:"text",text:$t}]}}' >"$R3_T"
}
r3_tool() { # $1 工具名 $2 input(JSON)$3 結果:ok(預設)/ error(is_error true)/ none(沒有 tool_result)$4 結果文字
  R3_TOOL=$((R3_TOOL + 1))
  jq -nc --arg n "$1" --argjson i "$2" --arg id "toolu_r3_$R3_TOOL" \
    '{type:"assistant",message:{role:"assistant",content:[{type:"tool_use",id:$id,name:$n,input:$i}]}}' >>"$R3_T"
  case "${3:-ok}" in
    ok) jq -nc --arg id "toolu_r3_$R3_TOOL" --arg c "${4:-ok}" \
          '{type:"user",message:{role:"user",content:[{type:"tool_result",tool_use_id:$id,content:$c}]}}' >>"$R3_T" ;;
    error) jq -nc --arg id "toolu_r3_$R3_TOOL" --arg c "${4:-error}" \
          '{type:"user",message:{role:"user",content:[{type:"tool_result",tool_use_id:$id,content:$c,is_error:true}]}}' >>"$R3_T" ;;
    none) ;;
  esac
}
r3_write() { # $1 路徑 $2 內容;transcript 記一筆成功的 Write,磁碟寫同樣內容(第 3 參數 = nodisk 時不寫磁碟)
  mkdir -p "$(dirname "$1")"
  r3_tool Write "$(jq -nc --arg p "$1" --arg c "$2" '{file_path:$p,content:$c}')"
  [ "${3:-}" = "nodisk" ] || printf '%s' "$2" >"$1"
}
r3_edit() { # $1 路徑 $2 old_string $3 new_string $4 結果(同 r3_tool);只記 transcript,磁碟由呼叫端改
  r3_tool Edit "$(jq -nc --arg p "$1" --arg o "$2" --arg n "$3" '{file_path:$p,old_string:$o,new_string:$n}')" "${4:-ok}" "${5:-}"
}
r3_raw() { printf '%s\n' "$1" >>"$R3_T"; }
r3_run() { # $1 = event(預設 Stop);transcript 用 R3_T(R3_T 為空字串 = 不帶 transcript)
  jq -nc --arg e "${1:-Stop}" --arg t "$R3_T" --arg c "$R3_DIR" \
    '{hook_event_name:$e,cwd:$c,last_assistant_message:"文件已更新。"} + (if $t == "" then {} else {transcript_path:$t} end)' \
    >"$R3_DIR/in.json"
  set +e
  bash "$DIR/../check_propose_discipline.sh" <"$R3_DIR/in.json" >"$R3_DIR/out" 2>"$R3_DIR/err"
  R3_RC=$?
  set -e
}
r3_expect_block() { # $1 名稱 $2 必須被點名的路徑
  if [ "$R3_RC" -eq 2 ] && [ ! -s "$R3_DIR/out" ] && grep -qF 'PROPOSE-PRE-VERIFY BLOCKER' "$R3_DIR/err" \
    && grep -qF "$2" "$R3_DIR/err" && ! grep -qF 'GOVERNANCE_INTEGRITY:' "$R3_DIR/err"; then
    echo "PASS: $1"
  else
    echo "SUB-FAIL: $1(預期擋 rc2,得到 rc $R3_RC;$(head -c 300 "$R3_DIR/err"))"
    fail=1
  fi
}
r3_expect_pass() {
  if [ "$R3_RC" -eq 0 ] && [ ! -s "$R3_DIR/out" ] && [ ! -s "$R3_DIR/err" ]; then
    echo "PASS: $1"
  else
    echo "SUB-FAIL: $1(預期放行 rc0 且無輸出,得到 rc $R3_RC;$(head -c 300 "$R3_DIR/err"))"
    fail=1
  fi
}
R3_NO_CITE='# 重構計畫
5 個元件缺 SurfaceBody。我推 A:全部改用。請拍板回 A 或 B。'

# R3-1/2 兩面:規劃目錄裡有提案字眼、沒有出處 → 擋;同一份加上「檔名:行號」→ 放行
r3_new; r3_write "$R3_DIR/governance/planning/refactor-x.md" "$R3_NO_CITE"; r3_run
r3_expect_block "R3-1 planning/ 有提案沒出處 → 擋" "governance/planning/refactor-x.md"
r3_new
# @cite-fixture:下一行的 sheet.tsx 行號是合成輸入
r3_write "$R3_DIR/governance/planning/refactor-y.md" "$R3_NO_CITE
依據:\`sheet.tsx:12\` 已經消費 SurfaceBody。"
r3_run
r3_expect_pass "R3-2 同一份加上檔名:行號 → 放行"

# R3-3 原支只認字面 */handoff/*.md,看不到 handoff-2026-11-12/;r3 看得到(本包放寬的範圍)
r3_new; r3_write "$R3_DIR/tmp/batch/handoff-2026-11-12/logs/summary.md" "$R3_NO_CITE"; r3_run
r3_expect_block "R3-3 handoff-2026-11-12/ 底下 → 擋" "handoff-2026-11-12/logs/summary.md"
r3_new; r3_write "$R3_DIR/.claude/reports/audit.md" "偵測到 5 個元件缺 X。決策 1:全部 migrate。"; r3_run
r3_expect_block "R3-4 reports/ 底下(原支就涵蓋)→ 擋" ".claude/reports/audit.md"

# R3-5 範圍外照舊放行:不是那三種目錄、或只有檔名以 planning 開頭、或不是 .md
r3_new
r3_write "$R3_DIR/packages/notes/decision.md" "$R3_NO_CITE"
r3_write "$R3_DIR/docs/planning-notes.md" "$R3_NO_CITE"
r3_write "$R3_DIR/governance/planning/options.json" "{\"x\":\"請拍板\"}"
r3_run
r3_expect_pass "R3-5 範圍外(一般目錄 / 檔名以 planning 開頭 / 非 .md)→ 放行"

# R3-6/7 出處判準兩面:原支的寫法(反引號路徑,不帶行號)照樣放行;r2 判準(.mjs 行號、官方網址)現在也放行 ——
# 對照組 R3-8:同樣的句子只寫裸檔名(沒反引號、沒行號),仍要擋(放寬出處判準不能放掉真的沒出處的)
r3_new; r3_write "$R3_DIR/governance/planning/a.md" "$R3_NO_CITE
基於 \`packages/design-system/src/components/Sheet/sheet.tsx\` 已經可用。"; r3_run
r3_expect_pass "R3-6 原支寫法:反引號路徑不帶行號 → 放行"
r3_new
# @cite-fixture:下一行的 .mjs 行號是合成輸入
r3_write "$R3_DIR/governance/planning/b.md" "$R3_NO_CITE
依據 scripts/run-provider-hook.mjs:2600 與 https://code.claude.com/docs/en/hooks 。"
r3_run
r3_expect_pass "R3-7 r2 判準:.mjs 行號 / 官方文件網址 → 放行(原支會誤判沒出處)"
r3_new; r3_write "$R3_DIR/governance/planning/c.md" "$R3_NO_CITE
參考 sheet.tsx 的寫法。"; r3_run
r3_expect_block "R3-8 對照組:只寫裸檔名(沒反引號、沒行號)→ 仍擋" "governance/planning/c.md"

# R3-9/10 escape:檔案前 3 行、冒號後有理由 → 放行;沒寫理由(原支會放行)→ 擋;寫在第 4 行以後 → 擋
r3_new; r3_write "$R3_DIR/governance/planning/d.md" "<!-- @propose-pre-verified: 已逐一 grep 五個元件,結果在 PR 說明 -->
$R3_NO_CITE"; r3_run
r3_expect_pass "R3-9 檔頭 escape 帶理由 → 放行"
r3_new; r3_write "$R3_DIR/governance/planning/e.md" "<!-- @propose-pre-verified -->
$R3_NO_CITE"; r3_run
r3_expect_block "R3-10 檔頭 escape 沒寫理由 → 擋" "governance/planning/e.md"
r3_new; r3_write "$R3_DIR/governance/planning/f.md" "$R3_NO_CITE
第三行

<!-- @propose-pre-verified: 寫在檔尾不算 -->"; r3_run
r3_expect_block "R3-10b escape 不在前 3 行 → 擋" "governance/planning/f.md"

# R3-11 被擋之後的兩種修法都要放行:補一個 Edit 加出處 / 把提案改掉;
# 而且「Stop hook feedback」(isMeta 的 user 紀錄)不能把本輪切斷 —— 沒修就再擋一次
R3_FIX="$R3_DIR/governance/planning/fix.md"
r3_new; r3_write "$R3_FIX" "$R3_NO_CITE"
r3_raw '{"type":"user","isMeta":true,"message":{"role":"user","content":"Stop hook feedback:\n🚨 PROPOSE-PRE-VERIFY BLOCKER"}}'
r3_run
r3_expect_block "R3-11a 擋過一次、沒修 → 再擋(feedback 不算使用者訊息)" "governance/planning/fix.md"
# @cite-fixture:下一行與再下一行的 sheet.tsx 行號是合成輸入
r3_edit "$R3_FIX" "請拍板回 A 或 B。" "請拍板回 A 或 B。依據 \`sheet.tsx:12\`。"
printf '%s\n依據 `sheet.tsx:12`。' "$R3_NO_CITE" >"$R3_FIX"
r3_run
r3_expect_pass "R3-11b 補 Edit 加出處 → 放行"
R3_DROP="$R3_DIR/governance/planning/drop.md"
r3_new; r3_write "$R3_DROP" "$R3_NO_CITE"
printf '# 重構計畫\n查過後不是問題,不動。' >"$R3_DROP"
r3_run
r3_expect_pass "R3-11c 把提案改掉(檔案現在沒有提案字眼)→ 放行"

# R3-12 上一輪寫的不算本輪:Write 在最後一則使用者訊息之前 → 放行
r3_new; r3_write "$R3_DIR/governance/planning/old.md" "$R3_NO_CITE"
r3_raw "$(jq -nc '{type:"user",message:{role:"user",content:[{type:"text",text:"好,下一題"}]}}')"
r3_run
r3_expect_pass "R3-12 上一輪的寫入 → 放行"

# R3-13 本輪中間出現的「不是使用者」紀錄不得切斷本輪:api-request-blob 副本(role user,真實 transcript 每則訊息都有一份)
# 與背景通知(type user、內容是 task-notification)
r3_new; r3_write "$R3_DIR/governance/planning/blob.md" "$R3_NO_CITE"
r3_raw '{"type":"api-request-blob","message":{"role":"user","content":[{"type":"text","text":"<system-reminder>\n背景工作完成</system-reminder>"}]}}'
r3_raw '{"type":"user","message":{"role":"user","content":"<task-notification>\n<task-id>b1</task-id>\n</task-notification>"}}'
r3_run
r3_expect_block "R3-13 api-request-blob / 背景通知不切斷本輪 → 擋" "governance/planning/blob.md"

# R3-14 Edit / MultiEdit 也看;檔案不在磁碟(已搬走)→ 改判本輪寫入的內容。提案字眼另收全形冒號「選項：」
r3_new
r3_tool MultiEdit "$(jq -nc --arg p "$R3_DIR/governance/planning/moved.md" '{file_path:$p,edits:[{old_string:"a",new_string:"選項：甲 全部改、乙 不動"},{old_string:"b",new_string:"其他"}]}')"
r3_run
r3_expect_block "R3-14 MultiEdit + 檔案不在 + 全形冒號 → 擋" "governance/planning/moved.md"

# R3-15 看不到就不判:沒有 transcript、或不是 Stop 事件 → 放行(同一份違規 transcript)
r3_new; r3_write "$R3_DIR/governance/planning/g.md" "$R3_NO_CITE"
r3_run UserPromptSubmit
r3_expect_pass "R3-15a 非 Stop 事件 → 不判"
R3_T=""; r3_run
r3_expect_pass "R3-15b 沒有 transcript → 不判"

# R3-16 contract 夾具 v1 / v2 原樣(沒有寫入文件)→ 整支放行;夾具接一筆違規 Write → 擋(證明 r3 解析的就是該形狀)
for _v in v1 v2; do
  _fixture="$DIR/fixtures/transcripts/claude-transcript-jsonl-$_v.jsonl"
  R3_CASE=$((R3_CASE + 1)); R3_T="$R3_DIR/fixture-$_v.jsonl"; cp "$_fixture" "$R3_T"
  r3_run
  r3_expect_pass "R3-16 夾具 $_v 原樣 → 放行"
  r3_write "$R3_DIR/governance/planning/fixture-$_v.md" "$R3_NO_CITE"
  r3_run
  r3_expect_block "R3-16 夾具 $_v 接一筆違規 Write → 擋" "governance/planning/fixture-$_v.md"
done

# R3-18 出處與 escape 要在本輪寫進去的內容裡(WP-13 審查必修 1):既有文件別處早有出處 / 檔頭早有 escape,
# 本輪 Edit 加一段沒出處的提案 → 仍擋;被擋後補 Edit 加出處 / 更新 escape → 放行;本輪寫的出處後來又刪掉 → 擋
R3_OLD="$R3_DIR/governance/planning/existing.md"
# @cite-fixture:下一行的 sheet.tsx 行號是合成輸入
printf '# 規劃\n先前的分析見 `sheet.tsx:12`。\n' >"$R3_OLD"
R3_ADD='5 個元件缺 SurfaceBody。我推 A:全部改用。請拍板回 A 或 B。'
r3_new; r3_edit "$R3_OLD" "先前的分析見" "$R3_ADD
先前的分析見"
# @cite-fixture:下一行的 sheet.tsx 行號是合成輸入
printf '# 規劃\n%s\n先前的分析見 `sheet.tsx:12`。\n' "$R3_ADD" >"$R3_OLD"
r3_run
r3_expect_block "R3-18a 既有文件別處已有出處,本輪 Edit 加沒出處的提案 → 擋" "governance/planning/existing.md"
# @cite-fixture:下一行與再下一行的 kebab.tsx 行號是合成輸入
r3_edit "$R3_OLD" "請拍板回 A 或 B。" "請拍板回 A 或 B。依據 \`kebab.tsx:30\`。"
printf '# 規劃\n%s依據 `kebab.tsx:30`。\n先前的分析見 `sheet.tsx:12`。\n' "$R3_ADD" >"$R3_OLD"
r3_run
r3_expect_pass "R3-18b 被擋後補 Edit 加出處 → 放行"
R3_ESC="$R3_DIR/governance/planning/escaped.md"
printf '<!-- @propose-pre-verified: 上一輪逐一 grep 過 -->\n# 規劃\n' >"$R3_ESC"
r3_new; r3_edit "$R3_ESC" "# 規劃" "# 規劃
$R3_ADD"
printf '<!-- @propose-pre-verified: 上一輪逐一 grep 過 -->\n# 規劃\n%s\n' "$R3_ADD" >"$R3_ESC"
r3_run
r3_expect_block "R3-18c 檔頭早有 escape,本輪 Edit 加沒出處的提案 → 擋" "governance/planning/escaped.md"
r3_edit "$R3_ESC" "<!-- @propose-pre-verified: 上一輪逐一 grep 過 -->" "<!-- @propose-pre-verified: 本輪也 grep 過五個元件,結果在 PR 說明 -->"
printf '<!-- @propose-pre-verified: 本輪也 grep 過五個元件,結果在 PR 說明 -->\n# 規劃\n%s\n' "$R3_ADD" >"$R3_ESC"
r3_run
r3_expect_pass "R3-18d 被擋後本輪更新 escape 理由 → 放行"
R3_GONE="$R3_DIR/governance/planning/cite-removed.md"
# @cite-fixture:下面三行的 sheet.tsx 行號是合成輸入
r3_new; r3_write "$R3_GONE" "$R3_NO_CITE
依據 \`sheet.tsx:12\`。"
r3_edit "$R3_GONE" "依據 \`sheet.tsx:12\`。" ""
printf '%s\n' "$R3_NO_CITE" >"$R3_GONE"
r3_run
r3_expect_block "R3-18e 本輪寫的出處後來又刪掉(檔案現在沒出處)→ 擋" "governance/planning/cite-removed.md"

# R3-19 只算寫成功的(WP-13 審查必修 2):tool_result 是 is_error(被拒絕 / 失敗)= 沒寫進檔案 → 不判,
# 接一筆 Stop 回饋再跑也不判(以前會一直擋、只能去建 user 拒絕的檔);對照:同一筆 Write 寫成功(檔案不在)→ 擋
R3_REJ="$R3_DIR/governance/planning/rejected.md"
r3_new; r3_tool Write "$(jq -nc --arg p "$R3_REJ" --arg c "$R3_NO_CITE" '{file_path:$p,content:$c}')" error \
  "The user doesn't want to proceed with this tool use. The tool use was rejected"
r3_run
r3_expect_pass "R3-19a Write 被拒絕(is_error)→ 不判"
r3_raw '{"type":"user","isMeta":true,"message":{"role":"user","content":"Stop hook feedback:\n🚨 PROPOSE-PRE-VERIFY BLOCKER"}}'
r3_run
r3_expect_pass "R3-19b 被拒絕之後再一次 Stop → 仍不判"
r3_new; r3_tool Write "$(jq -nc --arg p "$R3_REJ" --arg c "$R3_NO_CITE" '{file_path:$p,content:$c}')"
r3_run
r3_expect_block "R3-19c 對照:同一筆 Write 寫成功 → 擋" "governance/planning/rejected.md"
# R3-19d 既有文件(上一輪留下、沒出處的提案)上本輪 Edit 失敗:檔案沒變、本輪什麼都沒寫進去 → 不判(以前會把舊內容算到本輪頭上)
R3_FAILED="$R3_DIR/governance/planning/edit-failed.md"
printf '%s\n' "$R3_NO_CITE" >"$R3_FAILED"
r3_new; r3_edit "$R3_FAILED" "不存在的字串" "$R3_ADD" error "String to replace not found in file."
r3_run
r3_expect_pass "R3-19d Edit 失敗(is_error,檔案沒變)→ 不判"
r3_new; r3_tool Write "$(jq -nc --arg p "$R3_REJ" --arg c "$R3_NO_CITE" '{file_path:$p,content:$c}')" none
r3_run
r3_expect_pass "R3-19e 找不到對應 tool_result(看不到有沒有寫成)→ 不判"

# R3-17 解析失敗不得讀成合格:r3 的 python 換成必失敗 → GOVERNANCE_INTEGRITY rc70
awk '
  { print }
  $0 == "r3_planning_doc_cite() {" { print "python3() { return 1; }" }
' "$DIR/../check_propose_discipline.sh" >"$FAULT_DIR/check_propose_r3_broken.sh"
r3_new; r3_write "$R3_DIR/governance/planning/h.md" "$R3_NO_CITE"
jq -nc --arg t "$R3_T" --arg c "$R3_DIR" '{hook_event_name:"Stop",transcript_path:$t,cwd:$c,last_assistant_message:"文件已更新。"}' >"$R3_DIR/in.json"
set +e
bash "$FAULT_DIR/check_propose_r3_broken.sh" <"$R3_DIR/in.json" >"$R3_DIR/out" 2>"$R3_DIR/err"
rc=$?
set -e
if [ "$rc" -eq 70 ] && [ ! -s "$R3_DIR/out" ] && grep -qF 'GOVERNANCE_INTEGRITY:' "$R3_DIR/err" \
  && grep -qF 'planning-doc cite analysis failed' "$R3_DIR/err"; then
  echo "PASS: R3-17 r3 解析失敗 → integrity rc70"
else
  echo "SUB-FAIL: R3-17 r3 解析失敗沒有 fail closed(exit $rc;$(head -c 200 "$R3_DIR/err"))"
  fail=1
fi

# ── r2 讀「同一個真 user 回合」的全部回覆(2026-11-21,工作包 E7;交接 process-audit 根因 8)──
# 錨:11-18 17:27:10 補正回覆寫「上一則『照規定』的出處已經補上」,出處在同一回合稍早那則,只看最後一則就被自己的引述擋。
# 回合起點 = lib/_turn_boundary.sh 的 user 本人訊息;Stop hook 回饋不切回合。
R2_DIR="$FAULT_DIR/r2"
mkdir -p "$R2_DIR"
r2_run() { # $1 transcript 路徑;$2 last_assistant_message
  jq -nc --arg t "$1" --arg m "$2" '{hook_event_name:"Stop",transcript_path:$t,last_assistant_message:$m}' >"$R2_DIR/in.json"
  set +e
  bash "$DIR/../check_propose_discipline.sh" <"$R2_DIR/in.json" >"$R2_DIR/out" 2>"$R2_DIR/err"
  R2_RC=$?
  set -e
}
r2_user() { jq -nc --arg t "$1" '{type:"user",message:{role:"user",content:[{type:"text",text:$t}]}}'; }
r2_text() { jq -nc --arg t "$1" '{type:"assistant",message:{role:"assistant",content:[{type:"text",text:$t}]}}'; }
r2_feedback() { jq -nc --arg t "$1" '{type:"user",isMeta:true,message:{role:"user",content:("Stop hook feedback:\n" + $t)}}'; }
R2_FIX='上一則「照規定」的出處已經補上。'
# @cite-fixture:下一行的 spec.md 行號是合成輸入
R2_CITED='照規定 caption 配 muted,見 field-controls.spec.md:138 的 state 段落。'
printf '%s\n' "$(r2_user '照規格改')" "$(r2_text "$R2_CITED")" \
  "$(r2_feedback '🚨 PUSH-NOTIFICATION BLOCKER(M6)')" "$(r2_text "$R2_FIX")" >"$R2_DIR/t1.jsonl"
r2_run "$R2_DIR/t1.jsonl" "$R2_FIX"
if [ "$R2_RC" -eq 0 ] && [ ! -s "$R2_DIR/err" ]; then
  echo "PASS: R2-T1 出處在同一回合稍早那則、補正回覆再寫一次「規定」→ 放行"
else
  echo "SUB-FAIL: R2-T1 同一回合有出處卻被擋(rc $R2_RC;$(head -c 200 "$R2_DIR/err"))"; fail=1
fi
printf '%s\n' "$(r2_user '照規格改')" "$(r2_text '照規定 caption 配 muted。')" \
  "$(r2_feedback '🚨 PUSH-NOTIFICATION BLOCKER(M6)')" "$(r2_text "$R2_FIX")" >"$R2_DIR/t2.jsonl"
r2_run "$R2_DIR/t2.jsonl" "$R2_FIX"
if [ "$R2_RC" -eq 2 ] && grep -qF 'PROPOSE-WITHOUT-CITE BLOCKER' "$R2_DIR/err"; then
  echo "PASS: R2-T2 整個回合都沒有出處 → 擋"
else
  echo "SUB-FAIL: R2-T2 整個回合沒有出處卻放行(rc $R2_RC)"; fail=1
fi
printf '%s\n' "$(r2_user '照規格改')" "$(r2_text '照規定 caption 配 muted。')" \
  "$(r2_feedback '🚨 PROPOSE-WITHOUT-CITE BLOCKER')" "$(r2_text '撤回 claim:此條無 SSOT 依據。')" >"$R2_DIR/t3.jsonl"
r2_run "$R2_DIR/t3.jsonl" '撤回 claim:此條無 SSOT 依據。'
if [ "$R2_RC" -eq 0 ] && [ ! -s "$R2_DIR/err" ]; then
  echo "PASS: R2-T3 被擋之後照擋下訊息的修法 (b) 撤回 claim → 放行(被擋那句仍在回合裡,不會死鎖)"
else
  echo "SUB-FAIL: R2-T3 撤回 claim 之後仍擋(rc $R2_RC;$(head -c 200 "$R2_DIR/err"))"; fail=1
fi
printf '%s\n' "$(r2_user '上一題')" "$(r2_text "$R2_CITED")" "$(r2_user '下一題')" "$(r2_text "$R2_FIX")" >"$R2_DIR/t4.jsonl"
r2_run "$R2_DIR/t4.jsonl" "$R2_FIX"
if [ "$R2_RC" -eq 2 ] && grep -qF 'PROPOSE-WITHOUT-CITE BLOCKER' "$R2_DIR/err"; then
  echo "PASS: R2-T4 出處在上一個 user 回合(範圍不跨回合)→ 擋"
else
  echo "SUB-FAIL: R2-T4 上一回合的出處被算進這一回合(rc $R2_RC)"; fail=1
fi
exit $fail

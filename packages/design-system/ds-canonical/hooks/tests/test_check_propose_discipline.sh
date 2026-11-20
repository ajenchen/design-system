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
# Write / Edit / MultiEdit 的 input 欄位照 Claude Code 工具。磁碟上的文件另外寫一份(r3 以檔案現在的內容判合不合格)。
R3_DIR="$FAULT_DIR/r3"
mkdir -p "$R3_DIR"
R3_CASE=0
r3_new() { # 開一份新 transcript,第一筆是使用者訊息;回傳路徑放在 R3_T
  R3_CASE=$((R3_CASE + 1))
  R3_T="$R3_DIR/t$R3_CASE.jsonl"
  jq -nc --arg t "${1:-幫我整理這次的規劃}" '{type:"user",message:{role:"user",content:[{type:"text",text:$t}]}}' >"$R3_T"
}
r3_write() { # $1 路徑 $2 內容;transcript 記一筆 Write,磁碟寫同樣內容(第 3 參數 = nodisk 時不寫磁碟)
  mkdir -p "$(dirname "$1")"
  jq -nc --arg p "$1" --arg c "$2" \
    '{type:"assistant",message:{role:"assistant",content:[{type:"tool_use",id:"toolu_w",name:"Write",input:{file_path:$p,content:$c}}]}}' >>"$R3_T"
  jq -nc '{type:"user",message:{role:"user",content:[{type:"tool_result",tool_use_id:"toolu_w",content:"ok"}]}}' >>"$R3_T"
  [ "${3:-}" = "nodisk" ] || printf '%s' "$2" >"$1"
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
r3_raw "$(jq -nc --arg p "$R3_FIX" '{type:"assistant",message:{role:"assistant",content:[{type:"tool_use",id:"toolu_e",name:"Edit",input:{file_path:$p,old_string:"請拍板回 A 或 B。",new_string:"請拍板回 A 或 B。依據 `sheet.tsx:12`。"}}]}}')"
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
r3_raw "$(jq -nc --arg p "$R3_DIR/governance/planning/moved.md" '{type:"assistant",message:{role:"assistant",content:[{type:"tool_use",id:"toolu_m",name:"MultiEdit",input:{file_path:$p,edits:[{old_string:"a",new_string:"選項：甲 全部改、乙 不動"},{old_string:"b",new_string:"其他"}]}}]}}')"
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
exit $fail

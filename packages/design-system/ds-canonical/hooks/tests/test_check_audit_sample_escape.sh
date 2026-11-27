#!/bin/bash
# Tests for check_audit_sample_escape.sh
#
# Hook(PreToolUse Agent):dispatch prompt 含 sample escape clause → BLOCK(exit 2)。
# Only enforce on prompt containing audit-related keyword(audit / Dim N / DS-wide / sub-agent / sweep)。
# Escape:prompt 含 `@audit-sample-allow:` 整 prompt 豁免。
# 違規 stderr「🚨 AUDIT NO-SAMPLE ESCAPE CLAUSE BLOCKER」+ exit 2。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_audit_sample_escape.sh"

if [ ! -f "$HOOK" ]; then echo "FATAL: hook not found: $HOOK"; exit 1; fi

PASS=0
FAIL=0
FAILED_TESTS=""

run_hook() {
  local tool="$1"; local prompt="$2"
  local payload
  payload=$(jq -n --arg tn "$tool" --arg p "$prompt" \
    '{tool_name: $tn, tool_input: {prompt: $p}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent, exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_block() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit=2 + needle '$needle', got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_audit_sample_escape tests ==="

# 1. Non-Agent tool → skip
run_hook "Bash" "audit DS-wide sample top 5"
expect_pass_silent "1. non-Agent tool → skip"

# 2. Agent dispatch without audit keyword → skip
run_hook "Agent" "refactor this function please"
expect_pass_silent "2. non-audit prompt → skip"

# 3. Agent + audit keyword + NO sample keyword → silent
run_hook "Agent" "audit Dim 12 DS-wide full sweep all components"
expect_pass_silent "3. audit prompt without sample escape → silent"

# 4. Agent + audit + 'sample top 10' → BLOCK
run_hook "Agent" "audit Dim 24 DS-wide sample top 10 components"
expect_block "4. sample top N → block" "AUDIT NO-SAMPLE ESCAPE CLAUSE BLOCKER"

# 5. Agent + audit + 'sampled components' → BLOCK
run_hook "Agent" "Dim 40 DS-wide sub-agent dispatch, sampled components only"
expect_block "5. sampled components → block" "AUDIT NO-SAMPLE ESCAPE CLAUSE BLOCKER"

# 6. Agent + audit + 'heavy agent needed' → BLOCK
run_hook "Agent" "audit sweep all 53 dim, heavy agent needed for Dim 25"
expect_block "6. heavy agent needed → block" "AUDIT NO-SAMPLE ESCAPE CLAUSE BLOCKER"

# 7. Escape allowlist → silent
run_hook "Agent" "// @audit-sample-allow: rare integration test scope
audit Dim 99 sample top 3"
expect_pass_silent "7. @audit-sample-allow escape → silent"

# ── 派工預算提醒(2026-11-27;AGENTS.md「分診與預算」「派工先寫預算(代理數/花費/牆鐘)」)──
# 模擬 adapter 啟動的 session:Git-owned runtime root(照 test_check_solo_workflow.sh 的做法)
# GOVERNANCE_READ_ONLY=0 要明寫(2026-11-27 CI 紅的根因):run-all.sh(hooks:test、CI hooks-linux)export
# GOVERNANCE_READ_ONLY=1,功能狀態一律唯讀 → 記號落不了地。直接跑本檔時沒有這個變數,所以本機綠、經 run-all 紅
#(與 Linux / macOS 無關,本機 `bash tests/run-all.sh test_check_audit_sample_escape.sh` 一樣紅)。
# test_check_solo_workflow.sh 開頭 export GOVERNANCE_READ_ONLY=0 是同一個理由;唯讀那一面由下面 B7 單獨鎖。
BUDGET_TMP=$(mktemp -d)
[ -n "${BUDGET_TMP:-}" ] && [ -d "$BUDGET_TMP" ] || { echo "❌ mktemp -d failed(BUDGET_TMP;TMPDIR=${TMPDIR:-unset})" >&2; exit 1; }
BUDGET_TMP="$(cd "$BUDGET_TMP" && pwd -P)"
trap 'rm -rf "$BUDGET_TMP"' EXIT
git -C "$BUDGET_TMP" init -q
BUDGET_GIT_DIR="$(cd "$(git -C "$BUDGET_TMP" rev-parse --absolute-git-dir)" && pwd -P)"
run_budget() { # run_budget <session> <prompt> [READ_ONLY 值,預設 0 = adapter 啟動的一般 session]:同時收 stdout
  local payload
  payload=$(jq -n --arg s "$1" --arg p "$2" '{hook_event_name:"PreToolUse", session_id:$s, tool_name:"Agent", tool_input:{prompt:$p}}')
  set +e
  BUDGET_OUT=$(printf '%s' "$payload" | GOVERNANCE_READ_ONLY="${3:-0}" GOVERNANCE_PROJECT_DIR="$BUDGET_TMP" GOVERNANCE_RUNTIME_ROOT="$BUDGET_GIT_DIR/governance-runtime" \
    GOVERNANCE_STATE_DIR="$BUDGET_GIT_DIR/governance-runtime" GOVERNANCE_TELEMETRY_OPT_IN=0 bash "$HOOK" 2>"$BUDGET_TMP/stderr")
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$BUDGET_TMP/stderr")
}
expect_budget() { # expect_budget <name> reminder|silent
  local name="$1" want="$2" got=silent
  if [ -n "$BUDGET_OUT" ]; then
    if printf '%s' "$BUDGET_OUT" | jq -e '.governanceContext.hookEventName == "PreToolUse" and (.governanceContext.message | contains("派工先寫預算(代理數/花費/牆鐘)"))' >/dev/null 2>&1; then got=reminder; else got=malformed; fi
  fi
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] && [ "$got" = "$want" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (want $want, got $got, exit=$EXIT, stdout=$BUDGET_OUT, stderr=$STDERR_TEXT)"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}
run_budget "sess-A" "幫我把 Button 的 spec 讀一遍"
expect_budget "B1. session 第一次派工、沒寫預算 → 非阻擋提醒(引 AGENTS.md 原文)" reminder
run_budget "sess-A" "派工預算:代理 2 個、花費 1 包額度、牆鐘 30 分鐘
幫我把 Button 的 spec 讀一遍"
expect_budget "B2. prompt 寫了派工預算那一行 → 落記號、silent" silent
if grep -qF '"session_id":"sess-A"' "$BUDGET_GIT_DIR/governance-runtime/dispatch-budget.jsonl" 2>/dev/null; then
  echo "  PASS  B2b. 記號落在 Git-owned runtime 的 dispatch-budget.jsonl"; PASS=$((PASS+1))
else
  echo "  FAIL  B2b. 記號沒落地"; FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - B2b"
fi
run_budget "sess-A" "再派一個:讀 Tag 的 spec"
expect_budget "B3. 同 session 已有記號 → silent" silent
run_budget "sess-B" "讀 Tag 的 spec"
expect_budget "B4. 另一個 session 沒有記號 → 提醒(互不影響)" reminder
# B4b.(2026-11-27 規格核對必修 3)同 session 第二次、prompt 仍沒寫預算 → 靜默(提醒只在第一次;第一次提醒時已落 kind=reminded)
run_budget "sess-B" "再讀一次 Tag 的 spec"
expect_budget "B4b. 同 session 第二次、無記號 → silent(只提醒第一次)" silent
if jq -e 'select(.session_id == "sess-B" and .kind == "reminded")' "$BUDGET_GIT_DIR/governance-runtime/dispatch-budget.jsonl" >/dev/null 2>&1; then
  echo "  PASS  B4c. 第一次提醒時落了 kind=reminded 記號"; PASS=$((PASS+1))
else
  echo "  FAIL  B4c. 提醒記號沒落地"; FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - B4c"
fi
run_budget "sess-B" "audit Dim 99 sample top 3 components"
if [ "$EXIT" = "2" ] && [ -z "$BUDGET_OUT" ] && grep -qF 'AUDIT NO-SAMPLE ESCAPE CLAUSE BLOCKER' <<<"$STDERR_TEXT"; then
  echo "  PASS  B5. 抽樣條款照擋(擋下時 stdout 不帶提醒)"; PASS=$((PASS+1))
else
  echo "  FAIL  B5. block contract changed (exit=$EXIT stdout=$BUDGET_OUT)"; FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - B5"
fi
# B6.(2026-11-27 再驗 nonMust)新 session 第一次派工就被抽樣條款擋下 → 提醒沒送出 → 不落「已提醒」記號;
#     第二次正常派工照樣提醒,第三次才靜默(以前算出提醒就落記號 → 第二次 0B,整個 session 再也看不到)
run_budget "sess-Q" "audit Dim 3 sample top 3 components"
if [ "$EXIT" = "2" ] && [ -z "$BUDGET_OUT" ]; then
  echo "  PASS  B6a. sess-Q 第一次被抽樣條款擋下(exit 2、stdout 不送)"; PASS=$((PASS+1))
else
  echo "  FAIL  B6a. 預期被擋(exit=$EXIT stdout=$BUDGET_OUT)"; FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - B6a"
fi
run_budget "sess-Q" "讀 Tag 的 spec"
expect_budget "B6b. 第一次被擋、提醒沒送出 → 第二次仍提醒" reminder
run_budget "sess-Q" "再讀 Badge 的 spec"
expect_budget "B6c. 提醒送出之後 → 同 session 靜默" silent
# B7. READ_ONLY=1(CI replay / hooks:test 的 run-all.sh):功能狀態唯讀 → 一筆都不寫;記不住 → 同 session 每次都提醒
#     (hook 檔頭「寫不了 runtime 狀態時記不住 → 照舊每次提醒」)
BUDGET_LINES_BEFORE=$(wc -l < "$BUDGET_GIT_DIR/governance-runtime/dispatch-budget.jsonl" 2>/dev/null | tr -d ' ')
run_budget "sess-RO" "讀 Tag 的 spec" 1
expect_budget "B7a. READ_ONLY=1 第一次 → 提醒" reminder
run_budget "sess-RO" "再讀 Badge 的 spec" 1
expect_budget "B7b. READ_ONLY=1 記不住 → 第二次照樣提醒" reminder
BUDGET_LINES_AFTER=$(wc -l < "$BUDGET_GIT_DIR/governance-runtime/dispatch-budget.jsonl" 2>/dev/null | tr -d ' ')
if [ -n "$BUDGET_LINES_BEFORE" ] && [ "$BUDGET_LINES_BEFORE" = "$BUDGET_LINES_AFTER" ] \
  && ! grep -qF '"sess-RO"' "$BUDGET_GIT_DIR/governance-runtime/dispatch-budget.jsonl"; then
  echo "  PASS  B7c. READ_ONLY=1 一筆都沒寫(${BUDGET_LINES_BEFORE} 行 → ${BUDGET_LINES_AFTER} 行)"; PASS=$((PASS+1))
else
  echo "  FAIL  B7c. READ_ONLY=1 仍寫入(${BUDGET_LINES_BEFORE:-?} → ${BUDGET_LINES_AFTER:-?})"; FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - B7c"
fi

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

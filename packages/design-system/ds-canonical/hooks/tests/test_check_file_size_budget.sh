#!/bin/bash
# Smoke test for check_file_size_budget.sh
#
# 2026-11-21(WP-15b;J-4b490b9929)起:寫完超過 transition cap 而且這次讓檔變長 → exit 2 擋;
# 沒變長、檔頭有 `@size-budget-allow: <reason>`、或只超 budget → 只提醒(exit 0 + governanceContext)。
# run_hook "" <檔> = 把磁碟上的檔原樣再寫一次(Write,內容不變 = 沒變長):Tests 1–28 量的是「這個大小該不該出聲」;
# 擋 / 不擋的兩面對照在 Tests 29 起。

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_file_size_budget.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }

PASS=0; FAIL=0
PROJECT_ROOT=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)
TMP_PROJECT=$(mktemp -d)
[ -n "${TMP_PROJECT:-}" ] && [ -d "$TMP_PROJECT" ] || { echo "❌ mktemp -d failed(TMP_PROJECT;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
trap 'rm -rf "$TMP_PROJECT"' EXIT

run_hook() {
  local content="$1"
  local file_path="$2"
  local payload
  if [ -z "$content" ] && [ -f "$file_path" ]; then
    # 原樣再寫一次:--rawfile 保留結尾換行,行數才跟磁碟上的檔一致
    payload=$(jq -n --arg fp "$file_path" --rawfile ct "$file_path" \
      '{tool_name:"Write", tool_input:{file_path:$fp, content:$ct}}')
  else
    payload=$(jq -n --arg fp "$file_path" --arg ct "$content" \
      '{tool_name:"Write", tool_input:{file_path:$fp, content:$ct}}')
  fi
  run_payload "$payload"
}

run_payload() {
  local payload="$1"
  STDOUT=$(printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$TMP_PROJECT" \
    GOVERNANCE_CORPUS_ROOT="${TEST_CORPUS:-$PROJECT_ROOT}" \
    GOVERNANCE_PROVIDER_REGISTRY="${TEST_REGISTRY:-packages/governance/canonical/providers.json}" \
    GOVERNANCE_PROVIDER="${TEST_PROVIDER:-codex}" GOVERNANCE_READ_ONLY=1 bash "$HOOK" 2>&1)
  EXIT=$?
}

# Test 1: small file → silent
echo "Test 1: small registry-declared instruction entry → silent pass"
yes 'x' | head -100 > "$TMP_PROJECT/AGENTS.md"
run_hook "" "$TMP_PROJECT/AGENTS.md"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

# Test 2: irrelevant file → silent
echo "Test 2: non-governance file → silent skip"
yes 'x' | head -2000 > "$TMP_PROJECT/test.tsx"
run_hook "" "$TMP_PROJECT/test.tsx"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

# Test 3:Codex provider skill entry is matched from registry.
echo "Test 3: registry-declared Codex skill path → warning"
mkdir -p "$TMP_PROJECT/.agents/skills/demo"
yes 'x' | head -300 > "$TMP_PROJECT/.agents/skills/demo/SKILL.md"
run_hook "" "$TMP_PROJECT/.agents/skills/demo/SKILL.md"
if [ "$EXIT" = "0" ] && echo "$STDOUT" | grep -q 'provider skill entry'; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

# Test 4:poisoned Claude generated home must not affect Codex matcher.
echo "Test 4: poisoned .claude skill path is irrelevant to Codex"
mkdir -p "$TMP_PROJECT/.claude/skills/poison"
yes 'x' | head -500 > "$TMP_PROJECT/.claude/skills/poison/SKILL.md"
run_hook "" "$TMP_PROJECT/.claude/skills/poison/SKILL.md"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

# Test 5:a future provider with WORKFLOW.md is accepted by fixture data only.
echo "Test 5: future-provider skill entry filename comes from materializer registry"
FIXTURE_CORPUS="$TMP_PROJECT/corpus"
mkdir -p "$FIXTURE_CORPUS" "$TMP_PROJECT/.orion/workflows/demo"
cat > "$FIXTURE_CORPUS/providers.json" <<'EOF'
{
  "canonical": {
    "roots":{"skills":"canonical/skills"},
    "materializers":{"skillViews":{"markdown-workflows-directory-v1":{"entryFile":"WORKFLOW.md"}}}
  },
  "providers":[{
    "id":"orion","instructionEntry":"ORION.md","sharedInstructionEntry":"AGENTS.md",
    "skillDirectory":".orion/workflows",
    "adapter":{"skillView":{"materializerId":"markdown-workflows-directory-v1"}}
  }]
}
EOF
yes 'x' | head -300 > "$TMP_PROJECT/.orion/workflows/demo/WORKFLOW.md"
TEST_CORPUS="$FIXTURE_CORPUS" TEST_REGISTRY=providers.json TEST_PROVIDER=orion \
  run_hook "" "$TMP_PROJECT/.orion/workflows/demo/WORKFLOW.md"
if [ "$EXIT" = "0" ] && echo "$STDOUT" | grep -q 'WORKFLOW.md'; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

# Test 6:a provider without a skill materializer still receives instruction budgets.
echo "Test 6: optional provider capability does not disable shared instruction enforcement"
NOSKILL_CORPUS="$TMP_PROJECT/no-skill-corpus"
mkdir -p "$NOSKILL_CORPUS"
cat > "$NOSKILL_CORPUS/providers.json" <<'EOF'
{
  "canonical":{"roots":{"skills":"canonical/skills"}},
  "providers":[{
    "id":"orion","instructionEntry":"ORION.md","sharedInstructionEntry":"AGENTS.md",
    "skillDirectory":".orion/workflows","adapter":{}
  }]
}
EOF
yes 'x' | head -500 > "$TMP_PROJECT/ORION.md"
TEST_CORPUS="$NOSKILL_CORPUS" TEST_REGISTRY=providers.json TEST_PROVIDER=orion \
  run_hook "" "$TMP_PROJECT/ORION.md"
if [ "$EXIT" = "0" ] && echo "$STDOUT" | grep -q 'instruction entry'; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

# Tests 7–10:預算量手寫內容,不量自動維護的「## 被引用」段(兩面 + 對照組)。
# 一般 spec.md budget = 300。
RECIP_HEADER='## 被引用(auto-maintained,Dim 3 reciprocal audit)'
mkdir -p "$TMP_PROJECT/specs"

echo "Test 7: handwritten 290 + auto-maintained 60 (total > 300) → silent"
{ yes 'x' | head -290; echo "$RECIP_HEADER"; yes 'x' | sed 's/^x$/- `other.spec.md`/' | head -59; } > "$TMP_PROJECT/specs/short.spec.md"
run_hook "" "$TMP_PROJECT/specs/short.spec.md"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

echo "Test 8 (control for 7): same 350 lines without the auto-maintained header → warning"
{ yes 'x' | head -290; echo "## 手寫章節"; yes 'x' | sed 's/^x$/- `other.spec.md`/' | head -59; } > "$TMP_PROJECT/specs/control.spec.md"
run_hook "" "$TMP_PROJECT/specs/control.spec.md"
if [ "$EXIT" = "0" ] && echo "$STDOUT" | grep -q '350 lines (budget 300'; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

echo "Test 9: handwritten 310 + auto-maintained 5 → still warns on handwritten count"
{ yes 'x' | head -310; echo "$RECIP_HEADER"; yes 'x' | sed 's/^x$/- `other.spec.md`/' | head -4; } > "$TMP_PROJECT/specs/long.spec.md"
run_hook "" "$TMP_PROJECT/specs/long.spec.md"
if [ "$EXIT" = "0" ] && echo "$STDOUT" | grep -q '310 lines (excluding 5 auto-maintained'; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

echo "Test 10: handwritten section after the auto-maintained block still counts"
{ yes 'x' | head -250; echo "$RECIP_HEADER"; yes 'x' | sed 's/^x$/- `other.spec.md`/' | head -19; echo "## 附錄"; yes 'y' | head -79; } > "$TMP_PROJECT/specs/tail.spec.md"
run_hook "" "$TMP_PROJECT/specs/tail.spec.md"
if [ "$EXIT" = "0" ] && echo "$STDOUT" | grep -q '330 lines (excluding 20 auto-maintained'; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

# Tests 11 起:上限表抽到 lib/_size_budget.sh 之後新增 / 改變的類別 —— 每一類都是「超標出聲 / 未超標靜默」兩面,
# 路徑都放在 canonical root 底下的真實相對位置。
pass_if() { if "$@"; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi; }
silent() { [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; }
says() { [ "$EXIT" = "0" ] && printf '%s' "$STDOUT" | grep -qF -- "$1"; }
mkdir -p "$TMP_PROJECT/governance/memory"

echo "Test 11: memory file 101 lines → over the cap read from governance/memory/contract.json"
yes 'x' | head -101 > "$TMP_PROJECT/governance/memory/feedback_demo.md"
run_hook "" "$TMP_PROJECT/governance/memory/feedback_demo.md"
pass_if says '101 lines, over the transition cap 100'

echo "Test 12 (control for 11): memory file 100 lines → silent"
yes 'x' | head -100 > "$TMP_PROJECT/governance/memory/feedback_demo.md"
run_hook "" "$TMP_PROJECT/governance/memory/feedback_demo.md"
pass_if silent

# memory 的數字只住在 contract:換一份 maxLinesPerMemory = 5 的 contract,同一個 100 行的檔就要出聲。
CONTRACT_CORPUS="$TMP_PROJECT/contract-corpus"
mkdir -p "$CONTRACT_CORPUS/governance/memory"
cp "$PROJECT_ROOT/packages/governance/canonical/providers.json" "$CONTRACT_CORPUS/providers.json"
printf '{"maxLinesPerMemory": 5}\n' > "$CONTRACT_CORPUS/governance/memory/contract.json"
echo "Test 13: the memory cap is read from the contract(fixture contract = 5)"
TEST_CORPUS="$CONTRACT_CORPUS" TEST_REGISTRY=providers.json run_hook "" "$TMP_PROJECT/governance/memory/feedback_demo.md"
pass_if says '100 lines, over the transition cap 5'

echo "Test 14: contract missing → exit 2(an unreadable instrument is not a pass)"
rm "$CONTRACT_CORPUS/governance/memory/contract.json"
TEST_CORPUS="$CONTRACT_CORPUS" TEST_REGISTRY=providers.json run_hook "" "$TMP_PROJECT/governance/memory/feedback_demo.md"
if [ "$EXIT" = "2" ] && printf '%s' "$STDOUT" | grep -q 'contract.json'; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

# N 個中文字 + 換行 = N+1 個字元、3N+1 個 byte:用來證明量的是字元不是 byte。
cjk_line() { python3 -c 'import sys; sys.stdout.write("字" * int(sys.argv[1]) + "\n")' "$1"; }
cjk_file() { cjk_line "$1" > "$2"; }
RULES_DIR="$TMP_PROJECT/packages/design-system/ds-canonical/rules"
mkdir -p "$RULES_DIR"

echo "Test 15: always-loaded rule file 32,001 chars → warning in chars"
cjk_file 32000 "$RULES_DIR/meta-patterns.md"
run_hook "" "$RULES_DIR/meta-patterns.md"
pass_if says '32001 chars (budget 32000, transition cap 35200;'

echo "Test 16 (control for 15): 31,001 chars = 93,001 bytes → silent(counts characters, not bytes)"
cjk_file 31000 "$RULES_DIR/meta-patterns.md"
run_hook "" "$RULES_DIR/meta-patterns.md"
pass_if silent

echo "Test 17: path-scoped rule file 15,001 chars → warning"
cjk_file 15000 "$RULES_DIR/story-rules.md"
run_hook "" "$RULES_DIR/story-rules.md"
pass_if says '15001 chars (budget 15000, transition cap 16500;'

echo "Test 18 (control for 17): path-scoped rule file 14,001 chars → silent"
cjk_file 14000 "$RULES_DIR/story-rules.md"
run_hook "" "$RULES_DIR/story-rules.md"
pass_if silent

# 單格:第 2 欄中間夾一個 GFM 跳脫的 `\|`;若被當成切格,第 2 欄只剩 802 字,Test 19 就會變靜默而紅。
meta_row() { python3 -c 'import sys; n = int(sys.argv[1]); print("| **M99** | " + "a" * 800 + " \\| " + "b" * (n - 804) + " | 錨例 |")' "$1"; }
echo "Test 19: meta-patterns M-rule column 2 of 1,401 chars(with an escaped pipe inside)→ names the row"
{ echo '| # | Meta-Principle | 能吸收的 bug 類型 |'; echo '|---|---|---|'; meta_row 1401; } > "$RULES_DIR/meta-patterns.md"
run_hook "" "$RULES_DIR/meta-patterns.md"
pass_if says 'M99 1401 chars'

echo "Test 20 (control for 19): column 2 of exactly 1,400 chars → silent"
{ echo '| # | Meta-Principle | 能吸收的 bug 類型 |'; echo '|---|---|---|'; meta_row 1400; } > "$RULES_DIR/meta-patterns.md"
run_hook "" "$RULES_DIR/meta-patterns.md"
pass_if silent

echo "Test 21: whole-file and cell budgets fire together in one message"
{ cjk_line 32000; echo '| # | Meta-Principle | 能吸收的 bug 類型 |'; echo '|---|---|---|'; meta_row 1401; } > "$RULES_DIR/meta-patterns.md"
run_hook "" "$RULES_DIR/meta-patterns.md"
pass_if says 'M99 1401 chars'
pass_if says 'always-loaded rule file'

SKILLS_DIR="$TMP_PROJECT/packages/design-system/ds-canonical/skills"
mkdir -p "$SKILLS_DIR/design-system-audit" "$SKILLS_DIR/release-notes"

echo "Test 22: design-system-audit SKILL.md(dim registry)430 lines → silent"
yes 'x' | head -430 > "$SKILLS_DIR/design-system-audit/SKILL.md"
run_hook "" "$SKILLS_DIR/design-system-audit/SKILL.md"
pass_if silent

echo "Test 23 (same 430 lines, any other canonical SKILL.md): the exception does not leak → over-transition-cap warning"
yes 'x' | head -430 > "$SKILLS_DIR/release-notes/SKILL.md"
run_hook "" "$SKILLS_DIR/release-notes/SKILL.md"
pass_if says '430 lines, over the transition cap 400'

echo "Test 24: design-system-audit SKILL.md 591 lines → its own transition cap"
yes 'x' | head -591 > "$SKILLS_DIR/design-system-audit/SKILL.md"
run_hook "" "$SKILLS_DIR/design-system-audit/SKILL.md"
pass_if says '591 lines, over the transition cap 590'

# Test 25:沒擋(exit 0)的提醒,訊息就不准說得像會擋。三種訊息(超 budget / 超 transition cap 但沒變長 / 單格)
# 每一則都要自己講明這次沒擋,任何一則出現「hard cap」「Must reduce」就紅(反駁 #1:舊訊息印「hard cap N. Must reduce
# before adding」卻 exit 0)。逐則看:取出 governanceContext.message,一行一則。
ADVISORY_TEXT='this write is not blocked'
advisory_only() {
  local msg
  [ "$EXIT" = "0" ] || return 1
  msg="$(printf '%s' "$STDOUT" | jq -r '.governanceContext.message' 2>/dev/null)" || return 1
  [ -n "$msg" ] && [ "$msg" != "null" ] || return 1
  printf '%s\n' "$msg" | grep -qvF -- "$ADVISORY_TEXT" && return 1
  printf '%s\n' "$msg" | grep -qiE 'hard cap|must reduce' && return 1
  return 0
}
echo "Test 25a: over the transition cap but not growing(canonical SKILL.md 430 lines rewritten as-is)→ advisory wording only"
run_hook "" "$SKILLS_DIR/release-notes/SKILL.md"
pass_if advisory_only
echo "Test 25b: over budget only(spec.md 350 lines)→ advisory wording only"
run_hook "" "$TMP_PROJECT/specs/control.spec.md"
pass_if advisory_only
echo "Test 25c: whole-file + table-cell messages together(meta-patterns)→ every line advisory"
run_hook "" "$RULES_DIR/meta-patterns.md"
pass_if advisory_only
echo "Test 25d: memory over the contract cap → advisory, and the label says CI is what fails"
yes 'x' | head -101 > "$TMP_PROJECT/governance/memory/feedback_demo.md"
run_hook "" "$TMP_PROJECT/governance/memory/feedback_demo.md"
pass_if advisory_only
pass_if says 'CI fails above this cap: scripts/validate-memory-contract.mjs'

# Tests 26–28:provider 解析不到時的兩面(反駁 #2)。上限表抽成 lib 之後,provider 改成「用到才解析」——
# 這是一次判定收窄:以前任何檔只要 provider 壞了就 exit 2,現在只有要靠 provider 才判得出的路徑還會。
# 26 / 27 = 同樣壞掉的 provider 放在「需要 provider」的違規情境,必須仍 exit 2(把 lib 第 4 段的
# `|| return 2` 改成 `|| return 1` 會讓這兩格變紅);28 = 收窄只放掉不需要 provider 的路徑,照樣量、照樣出聲。
echo "Test 26: unknown provider + over-budget instruction entry(AGENTS.md 450 lines)→ exit 2, not a silent pass"
yes 'x' | head -450 > "$TMP_PROJECT/AGENTS.md"
TEST_PROVIDER=nonexistent run_hook "" "$TMP_PROJECT/AGENTS.md"
if [ "$EXIT" = "2" ] && printf '%s' "$STDOUT" | grep -qF 'budget lookup for AGENTS.md failed' \
  && printf '%s' "$STDOUT" | grep -qF 'active provider id'; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

echo "Test 27: unknown provider + provider skill view(.agents/skills/demo/SKILL.md 300 lines)→ exit 2"
TEST_PROVIDER=nonexistent run_hook "" "$TMP_PROJECT/.agents/skills/demo/SKILL.md"
if [ "$EXIT" = "2" ] && printf '%s' "$STDOUT" | grep -qF 'budget lookup for .agents/skills/demo/SKILL.md failed'; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

echo "Test 28 (control for 26/27): same unknown provider + spec.md 350 lines → still measured and warned"
TEST_PROVIDER=nonexistent run_hook "" "$TMP_PROJECT/specs/control.spec.md"
pass_if says '350 lines (budget 300'

# Tests 29 起:擋 / 不擋的兩面對照(2026-11-21 WP-15b)。一般 spec.md:budget 300 / transition cap 500。
blocked() { [ "$EXIT" = "2" ] && printf '%s' "$STDOUT" | grep -qF -- "$1"; }
BLOCKER='FILE-SIZE TRANSITION CAP BLOCKER'
SPEC_DIR="$TMP_PROJECT/specs"
spec_lines() { { echo '# Demo'; echo; echo '## 規格'; yes 'x' | head -$(( $1 - 3 )); }; }
# 寫入內容先落成檔、再用 --rawfile 帶進 payload:`$(…)` 會吃掉結尾換行,行數就差一行
WRITE_SRC="$TMP_PROJECT/write-src.md"
run_write_from_src() {
  run_payload "$(jq -n --arg fp "$1" --rawfile ct "$WRITE_SRC" '{tool_name:"Write", tool_input:{file_path:$fp, content:$ct}}')"
}

echo "Test 29: Write grows a 480-line spec.md to 520 lines → blocked, says how much it adds"
spec_lines 480 > "$SPEC_DIR/grow.spec.md"
spec_lines 520 > "$WRITE_SRC"
run_write_from_src "$SPEC_DIR/grow.spec.md"
pass_if blocked "$BLOCKER"
pass_if blocked 'would be 520 lines after this write'
pass_if blocked 'this write adds 40 lines'

echo "Test 30 (control for 29): same 520-line content, file already 530 lines on disk(shrinks)→ not blocked, advisory"
spec_lines 530 > "$SPEC_DIR/grow.spec.md"
run_write_from_src "$SPEC_DIR/grow.spec.md"
pass_if says 'it does not grow the file'

echo "Test 31 (control for 29): growing write + file-level exemption in the header → not blocked, says why"
spec_lines 480 > "$SPEC_DIR/grow.spec.md"
{ echo '# Demo'; echo '<!-- @size-budget-allow: 這份 spec 收兩個元件的分界拍板紀錄,拆檔會斷掉 3 處錨點 -->'; spec_lines 520 | tail -n +2; } > "$WRITE_SRC"
run_write_from_src "$SPEC_DIR/grow.spec.md"
pass_if says 'the file header declares @size-budget-allow'

echo "Test 32: exemption without a reason → still blocked"
{ echo '# Demo'; echo '<!-- @size-budget-allow: -->'; spec_lines 520 | tail -n +2; } > "$WRITE_SRC"
run_write_from_src "$SPEC_DIR/grow.spec.md"
pass_if blocked "$BLOCKER"

echo "Test 33: exemption written in the body(after the first ## heading)→ still blocked"
{ spec_lines 520; echo '<!-- @size-budget-allow: 寫在正文的不算 -->'; } > "$WRITE_SRC"
run_write_from_src "$SPEC_DIR/grow.spec.md"
pass_if blocked "$BLOCKER"

echo "Test 34: brand-new spec.md written at 520 lines(nothing on disk)→ blocked"
rm -f "$SPEC_DIR/new.spec.md"
spec_lines 520 > "$WRITE_SRC"
run_write_from_src "$SPEC_DIR/new.spec.md"
pass_if blocked "$BLOCKER"

# Edit / MultiEdit(直接呼叫):照 old_string → new_string 套在磁碟原檔上量寫完的樣子
edit_payload() {
  jq -n --arg fp "$1" --arg old "$2" --arg new "$3" \
    '{tool_name:"Edit", tool_input:{file_path:$fp, old_string:$old, new_string:$new}}'
}
echo "Test 35: Edit adds 30 lines to a 490-line spec.md → blocked"
spec_lines 490 > "$SPEC_DIR/edit.spec.md"
run_payload "$(edit_payload "$SPEC_DIR/edit.spec.md" '## 規格' "## 規格
$(yes 'y' | head -30)")"
pass_if blocked "$BLOCKER"

echo "Test 36 (control for 35): Edit rewrites one line in a 530-line spec.md(no growth)→ not blocked"
spec_lines 530 > "$SPEC_DIR/edit.spec.md"
run_payload "$(edit_payload "$SPEC_DIR/edit.spec.md" '## 規格' '## 規格(改名)')"
pass_if says 'it does not grow the file'

echo "Test 37: MultiEdit — net growth across edits past the cap → blocked;net shrink → not blocked"
spec_lines 495 > "$SPEC_DIR/multi.spec.md"
run_payload "$(jq -n --arg fp "$SPEC_DIR/multi.spec.md" --arg grow "## 規格
$(yes 'z' | head -10)" '{tool_name:"MultiEdit", tool_input:{file_path:$fp, edits:[{old_string:"# Demo", new_string:"# Demo 2"}, {old_string:"## 規格", new_string:$grow}]}}')"
pass_if blocked "$BLOCKER"
spec_lines 530 > "$SPEC_DIR/multi.spec.md"
run_payload "$(jq -n --arg fp "$SPEC_DIR/multi.spec.md" '{tool_name:"MultiEdit", tool_input:{file_path:$fp, edits:[{old_string:"# Demo\n\n", new_string:"# Demo\n"}, {old_string:"## 規格", new_string:"## 規格(改名)"}]}}')"
pass_if says 'it does not grow the file'

echo "Test 38: Edit whose old_string is not in the file(the edit cannot apply)→ measures the current file, not blocked"
spec_lines 530 > "$SPEC_DIR/edit.spec.md"
run_payload "$(edit_payload "$SPEC_DIR/edit.spec.md" '不存在的句子' "$(yes 'y' | head -30)")"
pass_if says 'the current file was measured'

# 正式入口:runner 以 proposed-text-v1 交來寫完的內容(GOVERNANCE_WRITE_STATE_TRUST=runner-v1)
trusted_payload() {
  jq -n --arg fp "$1" --arg rel "$2" --rawfile content "$WRITE_SRC" \
    '{tool_name:"Edit", tool_input:{file_path:$fp, governance_write_state:{schemaVersion:1, path:$rel, kind:"text", content:$content}}}'
}
run_trusted() {
  STDOUT=$(printf '%s' "$1" | GOVERNANCE_WRITE_STATE_TRUST=runner-v1 GOVERNANCE_PROJECT_DIR="$TMP_PROJECT" \
    GOVERNANCE_CORPUS_ROOT="$PROJECT_ROOT" GOVERNANCE_PROVIDER_REGISTRY=packages/governance/canonical/providers.json \
    GOVERNANCE_PROVIDER=codex GOVERNANCE_READ_ONLY=1 bash "$HOOK" 2>&1)
  EXIT=$?
}
echo "Test 39: trusted after-image(runner-v1)grows a 490-line spec.md to 520 → blocked"
spec_lines 490 > "$SPEC_DIR/trusted.spec.md"
spec_lines 520 > "$WRITE_SRC"
run_trusted "$(trusted_payload "$SPEC_DIR/trusted.spec.md" specs/trusted.spec.md)"
pass_if blocked "$BLOCKER"
pass_if blocked 'this write adds 30 lines'

echo "Test 40 (control for 39): trusted after-image shrinks it → not blocked"
spec_lines 530 > "$SPEC_DIR/trusted.spec.md"
run_trusted "$(trusted_payload "$SPEC_DIR/trusted.spec.md" specs/trusted.spec.md)"
pass_if says 'it does not grow the file'

echo "Test 41: trust marker set but the write state is missing / for another path → exit 2(not a silent pass)"
run_trusted "$(jq -n --arg fp "$SPEC_DIR/trusted.spec.md" '{tool_name:"Edit", tool_input:{file_path:$fp}}')"
pass_if blocked 'after-image of specs/trusted.spec.md could not be read'
run_trusted "$(trusted_payload "$SPEC_DIR/trusted.spec.md" specs/other.spec.md)"
pass_if blocked 'after-image of specs/trusted.spec.md could not be read'

echo "Test 42: trusted delete → silent"
run_trusted "$(jq -n --arg fp "$SPEC_DIR/trusted.spec.md" '{tool_name:"Edit", tool_input:{file_path:$fp, governance_write_state:{schemaVersion:1, path:"specs/trusted.spec.md", kind:"deleted"}}}')"
pass_if silent

echo "Results: $PASS PASS, $FAIL FAIL"
[ "$FAIL" -eq 0 ] || exit 1

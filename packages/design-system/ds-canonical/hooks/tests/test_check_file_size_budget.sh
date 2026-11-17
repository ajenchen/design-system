#!/bin/bash
# Smoke test for check_file_size_budget.sh

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_file_size_budget.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }

PASS=0; FAIL=0
PROJECT_ROOT=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)
TMP_PROJECT=$(mktemp -d)
trap 'rm -rf "$TMP_PROJECT"' EXIT

run_hook() {
  local content="$1"
  local file_path="$2"
  local payload
  payload=$(jq -n --arg fp "$file_path" --arg ct "$content" \
    '{tool_name:"Write", tool_input:{file_path:$fp, content:$ct}}')
  STDOUT=$(echo "$payload" | GOVERNANCE_PROJECT_DIR="$TMP_PROJECT" \
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
{ yes 'x' | head -290; echo "$RECIP_HEADER"; yes '- `other.spec.md`' | head -59; } > "$TMP_PROJECT/specs/short.spec.md"
run_hook "" "$TMP_PROJECT/specs/short.spec.md"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

echo "Test 8 (control for 7): same 350 lines without the auto-maintained header → warning"
{ yes 'x' | head -290; echo "## 手寫章節"; yes '- `other.spec.md`' | head -59; } > "$TMP_PROJECT/specs/control.spec.md"
run_hook "" "$TMP_PROJECT/specs/control.spec.md"
if [ "$EXIT" = "0" ] && echo "$STDOUT" | grep -q '350 lines (budget 300'; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

echo "Test 9: handwritten 310 + auto-maintained 5 → still warns on handwritten count"
{ yes 'x' | head -310; echo "$RECIP_HEADER"; yes '- `other.spec.md`' | head -4; } > "$TMP_PROJECT/specs/long.spec.md"
run_hook "" "$TMP_PROJECT/specs/long.spec.md"
if [ "$EXIT" = "0" ] && echo "$STDOUT" | grep -q '310 lines (excluding 5 auto-maintained'; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

echo "Test 10: handwritten section after the auto-maintained block still counts"
{ yes 'x' | head -250; echo "$RECIP_HEADER"; yes '- `other.spec.md`' | head -19; echo "## 附錄"; yes 'y' | head -79; } > "$TMP_PROJECT/specs/tail.spec.md"
run_hook "" "$TMP_PROJECT/specs/tail.spec.md"
if [ "$EXIT" = "0" ] && echo "$STDOUT" | grep -q '330 lines (excluding 20 auto-maintained'; then echo "  PASS"; PASS=$((PASS+1)); else echo "  FAIL ($EXIT, $STDOUT)"; FAIL=$((FAIL+1)); fi

echo "Results: $PASS PASS, $FAIL FAIL"
[ "$FAIL" -eq 0 ] || exit 1

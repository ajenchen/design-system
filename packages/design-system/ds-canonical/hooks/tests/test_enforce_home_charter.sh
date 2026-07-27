#!/bin/bash
# Tests for enforce_home_charter.sh
#
# Hook gate:Write 新檔到 8-home classification dirs(.claude/hooks /
# skills / agents / commands / rules + packages/design-system/src/{components,
# patterns, tokens})時,verify charter README 存在 + file-name pattern
# 對齊 dir convention。
#
# Scenarios:
#   1. Non-Write tool → silent pass
#   2. Write to existing file → silent pass(only NEW files gate)
#   3. Write outside classification dirs → silent pass
#   4. Write new file inside classification dir → pass(charter exists)

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../enforce_home_charter.sh"

[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }

PASS=0; FAIL=0; FAILED=""

run_hook() {
  local payload="$1"
  STDOUT=$(echo "$payload" | bash "$HOOK" 2>&1); EXIT=$?
}

# Test 1: Read tool(non-Write)→ silent pass
echo "Test 1: non-Write tool → silent pass"
run_hook '{"tool_name":"Read","tool_input":{"file_path":"/tmp/x"}}'
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then
  echo "  PASS  Test 1 silent pass on Read"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 1 (exit=$EXIT, output=$STDOUT)"; FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 1"
fi

# Test 2: Write to existing file → silent pass(only NEW files gate)
echo "Test 2: Write to existing file → silent pass"
TMP=$(mktemp)
run_hook "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMP\"}}"
if [ "$EXIT" = "0" ]; then
  echo "  PASS  Test 2 silent pass on existing file"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 2 (exit=$EXIT, output=$STDOUT)"; FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 2"
fi
rm -f "$TMP"

# Test 3: Write new file outside classification dirs → silent pass
echo "Test 3: Write new file outside classification dirs → silent pass"
run_hook '{"tool_name":"Write","tool_input":{"file_path":"/tmp/random/new-file.tsx"}}'
if [ "$EXIT" = "0" ]; then
  echo "  PASS  Test 3 silent pass on non-classified path"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 3 (exit=$EXIT, output=$STDOUT)"; FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 3"
fi

# Test 4: Write new file inside classification dir(charter exists)→ pass
echo "Test 4: Write new file in classified dir(charter exists)→ pass"
TMP_PROJ=$(mktemp -d)
mkdir -p "$TMP_PROJ/.agents/skills"
echo "# Skills charter" > "$TMP_PROJ/.agents/skills/README.md"
GOVERNANCE_PROJECT_DIR="$TMP_PROJ" GOVERNANCE_PROVIDER=codex run_hook "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMP_PROJ/.agents/skills/new-skill/SKILL.md\"}}"
if [ "$EXIT" = "0" ]; then
  echo "  PASS  Test 4 pass on charter-present dir"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 4 (exit=$EXIT, output=$STDOUT)"; FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 4"
fi
rm -rf "$TMP_PROJ"

# Test 5:unknown concrete provider is onboarded by registry fixture data only.
echo "Test 5: unknown provider managed home comes from registry data"
TMP_PROJ=$(mktemp -d)
mkdir -p "$TMP_PROJ/corpus" "$TMP_PROJ/.orion/workflows"
echo "# Orion workflow charter" > "$TMP_PROJ/.orion/workflows/README.md"
cat > "$TMP_PROJ/corpus/providers.json" <<'EOF'
{
  "canonical": {"roots": {
    "hooks":"canonical/hooks", "skills":"canonical/skills", "contextForkAgents":"canonical/agents",
    "commands":"canonical/commands", "rules":"canonical/rules", "references":"canonical/references"
  }},
  "providers": [{
    "id":"orion", "instructionEntry":"ORION.md", "sharedInstructionEntry":"AGENTS.md",
    "skillDirectory":".orion/workflows",
    "adapter":{"repositoryManagedTrees":{"rules":".orion/rules"}}
  }]
}
EOF
GOVERNANCE_PROJECT_DIR="$TMP_PROJ" GOVERNANCE_CORPUS_ROOT="$TMP_PROJ/corpus" \
  GOVERNANCE_PROVIDER_REGISTRY=providers.json GOVERNANCE_PROVIDER=orion \
  run_hook "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMP_PROJ/.orion/workflows/new/WORKFLOW.md\"}}"
if [ "$EXIT" = "0" ]; then
  echo "  PASS  Test 5 registry-only future provider home recognized"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 5 (exit=$EXIT, output=$STDOUT)"; FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 5"
fi
rm -rf "$TMP_PROJ"

# Test 6:unsafe registry path fails closed before it can widen a managed home.
echo "Test 6: unsafe provider root fails closed"
TMP_PROJ=$(mktemp -d)
mkdir -p "$TMP_PROJ/corpus"
cat > "$TMP_PROJ/corpus/providers.json" <<'EOF'
{
  "canonical":{"roots":{
    "hooks":"canonical/hooks","skills":"canonical/skills","contextForkAgents":"canonical/agents",
    "commands":"canonical/commands","rules":"canonical/rules","references":"canonical/references"
  }},
  "providers":[{
    "id":"orion","instructionEntry":"ORION.md","sharedInstructionEntry":"AGENTS.md",
    "skillDirectory":"../escape","adapter":{"repositoryManagedTrees":{}}
  }]
}
EOF
GOVERNANCE_PROJECT_DIR="$TMP_PROJ" GOVERNANCE_CORPUS_ROOT="$TMP_PROJ/corpus" \
  GOVERNANCE_PROVIDER_REGISTRY=providers.json GOVERNANCE_PROVIDER=orion \
  run_hook "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMP_PROJ/new-file.md\"}}"
if [ "$EXIT" = "70" ] && echo "$STDOUT" | grep -q 'GOVERNANCE_INTEGRITY:HOME_CHARTER_MANAGED_ROOTS_UNAVAILABLE'; then
  echo "  PASS  Test 6 traversal path rejected"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 6 (exit=$EXIT, output=$STDOUT)"; FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 6"
fi
rm -rf "$TMP_PROJ"

echo ""
echo "════ Results: $PASS PASS, $FAIL FAIL ════"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:"
  printf "%b\n" "$FAILED"
  exit 1
fi
exit 0

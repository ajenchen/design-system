#!/bin/bash
# Smoke test for log_governance_fires.sh
set -u

# This suite explicitly exercises isolated opt-in telemetry writes. Do not
# inherit the aggregate runner's read-only replay flag.
export GOVERNANCE_READ_ONLY=0

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../log_governance_fires.sh"
[ -x "$HOOK" ] || { echo "FATAL"; exit 1; }
PASS=0
FAIL=0
echo "Test 1: empty payload → no crash"
STDOUT=$(echo '{}' | bash "$HOOK" 2>&1); EXIT=$?
[ "$EXIT" -le 1 ] && { echo "  PASS exit=$EXIT"; PASS=1; } || { echo "  FAIL exit=$EXIT"; exit 1; }

echo "Test 2: Codex matcher ignores poisoned .claude but logs its registry-declared skill home"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
(cd "$TMP" && git init -q)
payload=$(jq -nc --arg path "$TMP/.agents/skills/demo/SKILL.md" '{tool_name:"Write",tool_input:{file_path:$path}}')
printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$TMP" GOVERNANCE_PROVIDER=codex GOVERNANCE_TELEMETRY_OPT_IN=1 bash "$HOOK" >/dev/null 2>&1
LOG_FILE="$TMP/.git/governance-runtime/hook-fires.jsonl"
before=$([ -f "$LOG_FILE" ] && wc -l < "$LOG_FILE" | tr -d ' ' || echo 0)
payload=$(jq -nc --arg path "$TMP/.claude/skills/poison/SKILL.md" '{tool_name:"Write",tool_input:{file_path:$path}}')
printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$TMP" GOVERNANCE_PROVIDER=codex GOVERNANCE_TELEMETRY_OPT_IN=1 bash "$HOOK" >/dev/null 2>&1
after=$([ -f "$LOG_FILE" ] && wc -l < "$LOG_FILE" | tr -d ' ' || echo 0)
if [ "$before" = "1" ] && [ "$after" = "$before" ]; then
  echo "  PASS registry matcher logged .agents and ignored .claude"; PASS=$((PASS+1))
else
  echo "  FAIL before=$before after=$after"; FAIL=$((FAIL+1))
fi

echo "Test 3: unknown provider managed roots are registry-only data"
FUTURE_PROJECT="$TMP/future-project"
FUTURE_CORPUS="$TMP/future-corpus"
mkdir -p "$FUTURE_PROJECT/.orion/policies" "$FUTURE_CORPUS"
(cd "$FUTURE_PROJECT" && git init -q)
cat > "$FUTURE_CORPUS/providers.json" <<'EOF'
{
  "canonical":{"roots":{
    "hooks":"canonical/hooks","skills":"canonical/skills","contextForkAgents":"canonical/agents",
    "commands":"canonical/commands","rules":"canonical/rules","references":"canonical/references"
  }},
  "providers":[{
    "id":"orion","instructionEntry":"ORION.md","sharedInstructionEntry":"AGENTS.md",
    "skillDirectory":".orion/workflows","hookConfig":".orion/hooks.json",
    "adapter":{"repositoryManagedTrees":{"rules":".orion/policies"}}
  }]
}
EOF
payload=$(jq -nc --arg path "$FUTURE_PROJECT/.orion/policies/rule.md" '{tool_name:"Write",tool_input:{file_path:$path}}')
printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$FUTURE_PROJECT" \
  GOVERNANCE_CORPUS_ROOT="$FUTURE_CORPUS" GOVERNANCE_PROVIDER_REGISTRY=providers.json \
  GOVERNANCE_PROVIDER=orion GOVERNANCE_TELEMETRY_OPT_IN=1 bash "$HOOK" >/dev/null 2>&1
FUTURE_LOG="$FUTURE_PROJECT/.git/governance-runtime/hook-fires.jsonl"
if [ -f "$FUTURE_LOG" ] && [ "$(tail -1 "$FUTURE_LOG" | jq -r '.path')" = ".orion/policies/rule.md" ]; then
  echo "  PASS future provider root matched without a shell-code branch"; PASS=$((PASS+1))
else
  echo "  FAIL future provider registry matcher did not log"; FAIL=$((FAIL+1))
fi

echo "Test 4: no opt-in leaves Git runtime absent"
READ_ONLY_PROJECT="$TMP/read-only-project"
mkdir -p "$READ_ONLY_PROJECT/.agents/skills/demo"
(cd "$READ_ONLY_PROJECT" && git init -q)
payload=$(jq -nc --arg path "$READ_ONLY_PROJECT/.agents/skills/demo/SKILL.md" '{tool_name:"Write",tool_input:{file_path:$path}}')
printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$READ_ONLY_PROJECT" GOVERNANCE_PROVIDER=codex \
  bash "$HOOK" >/dev/null 2>&1
if [ ! -e "$READ_ONLY_PROJECT/.git/governance-runtime" ]; then
  echo "  PASS default execution wrote no telemetry"; PASS=$((PASS+1))
else
  echo "  FAIL default execution created runtime bytes"; FAIL=$((FAIL+1))
fi

echo "Test 5: outside state redirect is rejected"
OUTSIDE_PROJECT="$TMP/outside-project"
OUTSIDE_STATE="$OUTSIDE_PROJECT/outside-state"
mkdir -p "$OUTSIDE_PROJECT/.agents/skills/demo" "$OUTSIDE_STATE"
(cd "$OUTSIDE_PROJECT" && git init -q)
printf 'sentinel\n' > "$OUTSIDE_STATE/sentinel.txt"
payload=$(jq -nc --arg path "$OUTSIDE_PROJECT/.agents/skills/demo/SKILL.md" '{tool_name:"Write",tool_input:{file_path:$path}}')
printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$OUTSIDE_PROJECT" GOVERNANCE_STATE_DIR="$OUTSIDE_STATE" \
  GOVERNANCE_PROVIDER=codex GOVERNANCE_TELEMETRY_OPT_IN=1 bash "$HOOK" >/dev/null 2>&1
if [ ! -e "$OUTSIDE_STATE/hook-fires.jsonl" ] && [ "$(cat "$OUTSIDE_STATE/sentinel.txt")" = "sentinel" ]; then
  echo "  PASS outside state remained untouched"; PASS=$((PASS+1))
else
  echo "  FAIL outside state was accepted or mutated"; FAIL=$((FAIL+1))
fi

echo "Test 6: nested runtime symlink is rejected"
SYMLINK_PROJECT="$TMP/symlink-project"
SYMLINK_TARGET="$SYMLINK_PROJECT/symlink-target"
RUNTIME_ROOT="$SYMLINK_PROJECT/.git/governance-runtime"
mkdir -p "$SYMLINK_PROJECT/.agents/skills/demo" "$SYMLINK_TARGET"
(cd "$SYMLINK_PROJECT" && git init -q)
mkdir -p "$RUNTIME_ROOT"
ln -s "$SYMLINK_TARGET" "$RUNTIME_ROOT/poison-state"
printf 'sentinel\n' > "$SYMLINK_TARGET/sentinel.txt"
payload=$(jq -nc --arg path "$SYMLINK_PROJECT/.agents/skills/demo/SKILL.md" '{tool_name:"Write",tool_input:{file_path:$path}}')
printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$SYMLINK_PROJECT" \
  GOVERNANCE_STATE_DIR="$RUNTIME_ROOT/poison-state" GOVERNANCE_PROVIDER=codex \
  GOVERNANCE_TELEMETRY_OPT_IN=1 bash "$HOOK" >/dev/null 2>&1
if [ ! -e "$SYMLINK_TARGET/hook-fires.jsonl" ] \
  && [ ! -e "$SYMLINK_TARGET/hook-fires-per-hook.jsonl" ] \
  && [ "$(cat "$SYMLINK_TARGET/sentinel.txt")" = "sentinel" ]; then
  echo "  PASS symlink target remained untouched"; PASS=$((PASS+1))
else
  echo "  FAIL nested symlink state was accepted or mutated"; FAIL=$((FAIL+1))
fi

echo "Test 7: opt-in without a Git owner remains read-only"
NO_GIT_PROJECT="$TMP/no-git-project"
NO_GIT_STATE="$NO_GIT_PROJECT/governance-runtime"
mkdir -p "$NO_GIT_PROJECT/.agents/skills/demo"
payload=$(jq -nc --arg path "$NO_GIT_PROJECT/.agents/skills/demo/SKILL.md" '{tool_name:"Write",tool_input:{file_path:$path}}')
printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$NO_GIT_PROJECT" GOVERNANCE_STATE_DIR="$NO_GIT_STATE" \
  GOVERNANCE_PROVIDER=codex GOVERNANCE_TELEMETRY_OPT_IN=1 bash "$HOOK" >/dev/null 2>&1
if [ ! -e "$NO_GIT_STATE" ]; then
  echo "  PASS no-Git caller could not create telemetry"; PASS=$((PASS+1))
else
  echo "  FAIL no-Git caller created non-authoritative telemetry"; FAIL=$((FAIL+1))
fi

# ── Skill 路徑(2026-11-17 /knowledge-prune:原 test_log_skill_invokes.sh 搬入,兩面都留)──

echo "Test 8: incomplete Skill payload → silent rc0, opt-in or not, no skill log"
SKILL_PROJECT="$TMP/skill-project"
mkdir -p "$SKILL_PROJECT"
(cd "$SKILL_PROJECT" && git init -q)
SKILL_STATE="$(git -C "$SKILL_PROJECT" rev-parse --absolute-git-dir)/governance-runtime"
for OPT in 0 1; do
  printf '%s' '{"tool_name":"Skill"}' | GOVERNANCE_PROJECT_DIR="$SKILL_PROJECT" GOVERNANCE_STATE_DIR="$SKILL_STATE" \
    GOVERNANCE_TELEMETRY_OPT_IN=$OPT bash "$HOOK" >"$TMP/skill-empty-$OPT.stdout" 2>"$TMP/skill-empty-$OPT.stderr"
  EXIT=$?
  if [ "$EXIT" -eq 0 ] && [ ! -s "$TMP/skill-empty-$OPT.stdout" ] && [ ! -s "$TMP/skill-empty-$OPT.stderr" ] \
    && [ ! -e "$SKILL_STATE/skill-invokes.jsonl" ]; then
    echo "  PASS opt-in=$OPT"; PASS=$((PASS+1))
  else
    echo "  FAIL opt-in=$OPT: expected silent rc0 and no skill log, got exit=$EXIT"; FAIL=$((FAIL+1))
  fi
done

echo "Test 9: >256 KiB Skill args → silent rc0 + exact 200-character log slice(opt-in)"
{
  printf '%s' 'match-at-start:'
  awk 'BEGIN {
    for (i = 0; i < 12000; i++) {
      printf "large-skill-args-%05d-abcdefghijklmnopqrstuvwxyz0123456789", i
    }
  }'
  printf '\n'
} >"$TMP/large-args.txt"
if [ "$(wc -c <"$TMP/large-args.txt" | tr -d ' ')" -le 262144 ]; then
  echo "  FAIL: large args fixture is not larger than 256 KiB"; FAIL=$((FAIL+1))
else
  jq -Rs '{hook_event_name:"PostToolUse",tool_name:"Skill",tool_input:{skill:"large-replay-skill",args:.}}' \
    <"$TMP/large-args.txt" >"$TMP/large-payload.json"
  GOVERNANCE_PROJECT_DIR="$SKILL_PROJECT" GOVERNANCE_STATE_DIR="$SKILL_STATE" GOVERNANCE_TELEMETRY_OPT_IN=1 \
    bash "$HOOK" <"$TMP/large-payload.json" >"$TMP/large.stdout" 2>"$TMP/large.stderr"
  EXIT=$?
  if [ "$EXIT" -eq 0 ] && [ ! -s "$TMP/large.stdout" ] && [ ! -s "$TMP/large.stderr" ] \
    && [ -f "$SKILL_STATE/skill-invokes.jsonl" ] \
    && jq -e -s 'length == 1 and .[0].skill == "large-replay-skill" and (.[0].args | length) == 200
      and (.[0].args | startswith("match-at-start:"))' "$SKILL_STATE/skill-invokes.jsonl" >/dev/null 2>&1; then
    echo "  PASS"; PASS=$((PASS+1))
  else
    echo "  FAIL: expected silent rc0 and one valid truncated log (exit=$EXIT)"; FAIL=$((FAIL+1))
  fi
fi

echo "Test 10: Skill payload without opt-in leaves Git runtime absent(Test 9 的對照組)"
SKILL_OFF_PROJECT="$TMP/skill-off-project"
mkdir -p "$SKILL_OFF_PROJECT"
(cd "$SKILL_OFF_PROJECT" && git init -q)
GOVERNANCE_PROJECT_DIR="$SKILL_OFF_PROJECT" bash "$HOOK" <"$TMP/large-payload.json" >/dev/null 2>&1
if [ ! -e "$SKILL_OFF_PROJECT/.git/governance-runtime" ]; then
  echo "  PASS default execution wrote no skill telemetry"; PASS=$((PASS+1))
else
  echo "  FAIL default execution created runtime bytes"; FAIL=$((FAIL+1))
fi

echo "Results: $PASS PASS, $FAIL FAIL"
[ "$FAIL" = "0" ]

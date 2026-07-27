#!/bin/bash
# Tests for stop_passive_logging.sh — Stop hook orchestrator(5 internal rules:tsc_sanity / harvest_corrections / capture_metrics / governance_drift / infra_best_practice_score)
#
# Orchestrator smoke test only — all 5 internal rules are passive(silent log to Git-owned governance runtime state,no stderr / no exit non-zero)。
# Detailed rule tests are within their original lib hooks(now folded into this dispatcher,unit tests at lib level historically)。
#
# 2026-05-23 ship per Phase D4 sub-threshold cleanup(15+1 hook tests batch)。

set -u

# This suite explicitly exercises isolated opt-in telemetry writes. Do not
# inherit the aggregate runner's read-only replay flag.
export GOVERNANCE_READ_ONLY=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../stop_passive_logging.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

run_hook() {
  local payload="$1"
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (exit=$EXIT, stdout='$STDOUT_TEXT', stderr='$STDERR_TEXT')"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_exit_0() {
  local name="$1"
  if [ "$EXIT" = "0" ]; then
    echo "  PASS  $name (exit 0)"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit 0, got $EXIT)"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== stop_passive_logging tests(orchestrator smoke)==="

# 1. bash -n syntax check
bash -n "$HOOK"
if [ $? = 0 ]; then echo "  PASS  1. syntax OK"; PASS=$((PASS+1)); else echo "  FAIL  1. syntax broke"; FAIL=$((FAIL+1)); fi

# 2. empty JSON input → exit 0 silent
run_hook '{}'
expect_exit_0 "2. empty JSON input → exit 0"

# 3. session_id only → exit 0
run_hook '{"session_id":"test-session-abc"}'
expect_exit_0 "3. session_id input → exit 0"

# 4. transcript_path nonexistent → exit 0(graceful)
run_hook '{"transcript_path":"/tmp/nonexistent-test-transcript.jsonl","session_id":"test"}'
expect_exit_0 "4. nonexistent transcript → exit 0 graceful"

# 5. invalid JSON → exit 0(jq fail handled)
run_hook 'not-valid-json'
expect_exit_0 "5. malformed JSON input → exit 0"

# 6. valid empty transcript → exit 0
TMP_TRANSCRIPT=$(mktemp)
echo '' > "$TMP_TRANSCRIPT"
run_hook "{\"transcript_path\":\"$TMP_TRANSCRIPT\",\"session_id\":\"test\"}"
rm -f "$TMP_TRANSCRIPT"
expect_exit_0 "6. empty transcript file → exit 0"

# 7. realistic Stop event payload → exit 0(R3 capture_metrics may write log file,but exit 0 invariant)
TMP_TRANSCRIPT=$(mktemp)
cat > "$TMP_TRANSCRIPT" << 'EOF'
{"type":"user","message":{"role":"user","content":"test"}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"reply"}]}}
EOF
run_hook "{\"transcript_path\":\"$TMP_TRANSCRIPT\",\"session_id\":\"test-smoke\"}"
rm -f "$TMP_TRANSCRIPT"
expect_exit_0 "7. realistic Stop event payload → exit 0"

# 8. Provider-neutral metrics must consume registry-declared instruction/skill paths only.
TMP_PROJECT=$(mktemp -d)
mkdir -p "$TMP_PROJECT/.agents/skills/demo" "$TMP_PROJECT/.claude/skills"
yes 'shared governance line' | head -601 > "$TMP_PROJECT/AGENTS.md"
printf '# skill\n' > "$TMP_PROJECT/.agents/skills/demo/SKILL.md"
for i in 1 2 3 4 5; do mkdir -p "$TMP_PROJECT/.claude/skills/poison-$i"; printf '# poison\n' > "$TMP_PROJECT/.claude/skills/poison-$i/SKILL.md"; done
(cd "$TMP_PROJECT" && git init -q && git add AGENTS.md .claude/skills/poison-1/SKILL.md && GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t git commit -q -m init)
printf '# tracked poison changed\n' >> "$TMP_PROJECT/.claude/skills/poison-1/SKILL.md"
GOVERNANCE_PROJECT_DIR="$TMP_PROJECT" GOVERNANCE_PROVIDER=codex GOVERNANCE_TELEMETRY_OPT_IN=1 \
  run_hook '{"session_id":"provider-paths"}'
METRIC="$TMP_PROJECT/.git/governance-runtime/metric-snapshots.jsonl"
if [ "$EXIT" = "0" ] && [ -f "$METRIC" ] \
  && [ "$(tail -1 "$METRIC" | jq -r '.instruction_lines')" = "601" ] \
  && [ "$(tail -1 "$METRIC" | jq -r '.skills_total')" = "1" ] \
  && [ ! -f "$TMP_PROJECT/.git/governance-runtime/governance-drift.jsonl" ]; then
  echo "  PASS  8. Codex metrics and drift matcher ignore poisoned .claude paths"; PASS=$((PASS+1))
else
  echo "  FAIL  8. provider-neutral metric paths (exit=$EXIT metric=$(tail -1 "$METRIC" 2>/dev/null))"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 8. provider-neutral metric paths"
fi
rm -rf "$TMP_PROJECT"

# 9. A new concrete provider needs registry fixture data,not a hook-code branch.
TMP_PROJECT=$(mktemp -d)
FIXTURE_CORPUS="$TMP_PROJECT/corpus"
mkdir -p "$FIXTURE_CORPUS" "$TMP_PROJECT/.orion/workflows/demo"
printf '# Orion\nrule\n' > "$TMP_PROJECT/ORION.md"
printf '# shared\n' > "$TMP_PROJECT/AGENTS.md"
printf '# workflow\n' > "$TMP_PROJECT/.orion/workflows/demo/WORKFLOW.md"
cat > "$FIXTURE_CORPUS/providers.json" <<'EOF'
{
  "canonical":{
    "roots":{
      "hooks":"canonical/hooks","skills":"canonical/skills","contextForkAgents":"canonical/agents",
      "commands":"canonical/commands","rules":"canonical/rules","references":"canonical/references"
    },
    "materializers":{"skillViews":{"markdown-workflows-directory-v1":{"entryFile":"WORKFLOW.md"}}}
  },
  "providers":[{
    "id":"orion","instructionEntry":"ORION.md","sharedInstructionEntry":"AGENTS.md",
    "skillDirectory":".orion/workflows",
    "adapter":{"repositoryManagedTrees":{},"skillView":{"materializerId":"markdown-workflows-directory-v1"}}
  }]
}
EOF
(cd "$TMP_PROJECT" && git init -q && git add ORION.md AGENTS.md && GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t git commit -q -m init)
GOVERNANCE_PROJECT_DIR="$TMP_PROJECT" GOVERNANCE_CORPUS_ROOT="$FIXTURE_CORPUS" \
  GOVERNANCE_PROVIDER_REGISTRY=providers.json GOVERNANCE_PROVIDER=orion GOVERNANCE_TELEMETRY_OPT_IN=1 \
  run_hook '{"session_id":"future-provider-paths"}'
METRIC="$TMP_PROJECT/.git/governance-runtime/metric-snapshots.jsonl"
if [ "$EXIT" = "0" ] && [ -f "$METRIC" ] \
  && [ "$(tail -1 "$METRIC" | jq -r '.instruction_lines')" = "3" ] \
  && [ "$(tail -1 "$METRIC" | jq -r '.skills_total')" = "1" ]; then
  echo "  PASS  9. future-provider passive metrics are registry-driven"; PASS=$((PASS+1))
else
  echo "  FAIL  9. future-provider passive metrics (exit=$EXIT metric=$(tail -1 "$METRIC" 2>/dev/null))"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 9. future-provider passive metrics"
fi
rm -rf "$TMP_PROJECT"

# 10. Default provider execution is read-only unless a trusted caller opts in.
TMP_PROJECT=$(mktemp -d)
mkdir -p "$TMP_PROJECT/.agents/skills/demo"
printf '# shared\n' > "$TMP_PROJECT/AGENTS.md"
(cd "$TMP_PROJECT" && git init -q)
GOVERNANCE_PROJECT_DIR="$TMP_PROJECT" GOVERNANCE_PROVIDER=codex \
  run_hook '{"session_id":"read-only-default"}'
if [ "$EXIT" = "0" ] && [ ! -e "$TMP_PROJECT/.git/governance-runtime" ]; then
  echo "  PASS  10. no opt-in creates no runtime bytes"; PASS=$((PASS+1))
else
  echo "  FAIL  10. default execution created runtime bytes"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 10. telemetry default"
fi
rm -rf "$TMP_PROJECT"

# 11. A nested symlink cannot redirect any passive log outside Git runtime.
TMP_PROJECT=$(mktemp -d)
mkdir -p "$TMP_PROJECT/.agents/skills/demo" "$TMP_PROJECT/symlink-target"
printf '# shared\n' > "$TMP_PROJECT/AGENTS.md"
(cd "$TMP_PROJECT" && git init -q)
RUNTIME_ROOT="$TMP_PROJECT/.git/governance-runtime"
mkdir -p "$RUNTIME_ROOT"
ln -s "$TMP_PROJECT/symlink-target" "$RUNTIME_ROOT/poison-state"
printf 'sentinel\n' > "$TMP_PROJECT/symlink-target/sentinel.txt"
GOVERNANCE_PROJECT_DIR="$TMP_PROJECT" GOVERNANCE_STATE_DIR="$RUNTIME_ROOT/poison-state" \
  GOVERNANCE_PROVIDER=codex GOVERNANCE_TELEMETRY_OPT_IN=1 \
  run_hook '{"session_id":"symlink-poison"}'
if [ "$EXIT" = "0" ] \
  && [ "$(find "$TMP_PROJECT/symlink-target" -type f | wc -l | tr -d ' ')" = "1" ] \
  && [ "$(cat "$TMP_PROJECT/symlink-target/sentinel.txt")" = "sentinel" ]; then
  echo "  PASS  11. nested symlink target remained untouched"; PASS=$((PASS+1))
else
  echo "  FAIL  11. nested symlink state was accepted or mutated"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 11. symlink poison"
fi
rm -rf "$TMP_PROJECT"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS+FAIL))"
if [ $FAIL -gt 0 ]; then
  echo -e "Failed:$FAILED_TESTS"
  exit 1
fi

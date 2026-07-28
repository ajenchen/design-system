#!/bin/bash
# Tests for stop_capture_metrics.sh
#
# Scenarios cover the provider registry, opt-in-only writes, 24h dedup, and
# containment/symlink rejection for Git-owned runtime state.

set -u

# This suite intentionally verifies isolated runtime-state writes. Do not inherit
# the read-only replay flag from the aggregate runner.
export GOVERNANCE_READ_ONLY=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Cluster B merge(2026-05-10):stop_capture_metrics.sh fold 進
# stop_passive_logging.sh dispatcher R3。Test 走 dispatcher。
HOOK="$SCRIPT_DIR/../stop_passive_logging.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }

PASS=0; FAIL=0; FAILED=""

# Use isolated temp project dir per test to avoid touching real metric file
setup_temp_proj() {
  TMP_PROJ=$(mktemp -d)
  git -C "$TMP_PROJ" init -q
  RUNTIME_ROOT="$TMP_PROJ/.git/governance-runtime"
  STATE_DIR="$RUNTIME_ROOT"
  mkdir -p "$TMP_PROJ/.agents/skills/baz"
  # Codex provider fixture: instruction and skill paths come from providers.json.
  printf '%s\n' line1 line2 line3 > "$TMP_PROJ/AGENTS.md"
}

teardown_temp_proj() {
  rm -rf "$TMP_PROJ"
}

# Test 1: fresh project → writes entry
echo "Test 1: fresh project(no prior snapshot)"
setup_temp_proj
GOVERNANCE_PROJECT_DIR="$TMP_PROJ" GOVERNANCE_STATE_DIR="$STATE_DIR" \
  GOVERNANCE_PROVIDER=codex GOVERNANCE_TELEMETRY_OPT_IN=1 bash "$HOOK"
EXIT=$?
LINES=$(wc -l < "$STATE_DIR/metric-snapshots.jsonl" 2>/dev/null | tr -d ' ' || echo 0)
if [ "$EXIT" = "0" ] && [ "$LINES" = "1" ]; then
  echo "  PASS  Test 1 fresh project writes entry"
  PASS=$((PASS+1))
else
  echo "  FAIL  Test 1 (exit=$EXIT, lines=$LINES, expected exit=0, lines=1)"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 1"
fi
teardown_temp_proj

# Test 4: HOME-private caches never affect committed-SSOT memory metrics.
echo "Test 4: two HOME caches produce the same repo-SSOT memory metric"
setup_temp_proj
mkdir -p "$TMP_PROJ/governance/memory" "$TMP_PROJ/home-a/.claude/projects/private/memory" "$TMP_PROJ/home-b/.claude/projects/private/memory" \
  "$RUNTIME_ROOT/state-a" "$RUNTIME_ROOT/state-b"
touch "$TMP_PROJ/governance/memory/one.md"
for i in $(seq 1 7); do touch "$TMP_PROJ/home-a/.claude/projects/private/memory/private-$i.md"; done
HOME="$TMP_PROJ/home-a" GOVERNANCE_PROJECT_DIR="$TMP_PROJ" GOVERNANCE_STATE_DIR="$RUNTIME_ROOT/state-a" \
  GOVERNANCE_PROVIDER=codex GOVERNANCE_TELEMETRY_OPT_IN=1 bash "$HOOK"
HOME="$TMP_PROJ/home-b" GOVERNANCE_PROJECT_DIR="$TMP_PROJ" GOVERNANCE_STATE_DIR="$RUNTIME_ROOT/state-b" \
  GOVERNANCE_PROVIDER=codex GOVERNANCE_TELEMETRY_OPT_IN=1 bash "$HOOK"
MEM_A=$(jq -r '.memory_entries' "$RUNTIME_ROOT/state-a/metric-snapshots.jsonl")
MEM_B=$(jq -r '.memory_entries' "$RUNTIME_ROOT/state-b/metric-snapshots.jsonl")
if [ "$MEM_A" = "1" ] && [ "$MEM_B" = "1" ]; then
  echo "  PASS  Test 4 HOME-independent memory metric"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 4 (home-a=$MEM_A,home-b=$MEM_B,expected both 1)"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 4"
fi
teardown_temp_proj

# Test 2: recent snapshot(< 24h)→ skip
echo "Test 2: recent snapshot skip"
setup_temp_proj
NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mkdir -p "$STATE_DIR"
echo "{\"ts\":\"$NOW_ISO\",\"tag\":\"prior\",\"claude_md_lines\":1}" > "$STATE_DIR/metric-snapshots.jsonl"
GOVERNANCE_PROJECT_DIR="$TMP_PROJ" GOVERNANCE_STATE_DIR="$STATE_DIR" \
  GOVERNANCE_PROVIDER=codex GOVERNANCE_TELEMETRY_OPT_IN=1 bash "$HOOK"
EXIT=$?
LINES=$(wc -l < "$STATE_DIR/metric-snapshots.jsonl" | tr -d ' ')
if [ "$EXIT" = "0" ] && [ "$LINES" = "1" ]; then
  echo "  PASS  Test 2 recent snapshot dedup skip"
  PASS=$((PASS+1))
else
  echo "  FAIL  Test 2 (exit=$EXIT, lines=$LINES, expected dedup keep 1 line)"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 2"
fi
teardown_temp_proj

# Test 3: old snapshot(> 24h)→ append
echo "Test 3: old snapshot triggers new entry"
setup_temp_proj
mkdir -p "$STATE_DIR"
echo '{"ts":"2026-04-20T00:00:00Z","tag":"prior","claude_md_lines":1}' > "$STATE_DIR/metric-snapshots.jsonl"
GOVERNANCE_PROJECT_DIR="$TMP_PROJ" GOVERNANCE_STATE_DIR="$STATE_DIR" \
  GOVERNANCE_PROVIDER=codex GOVERNANCE_TELEMETRY_OPT_IN=1 bash "$HOOK"
EXIT=$?
LINES=$(wc -l < "$STATE_DIR/metric-snapshots.jsonl" | tr -d ' ')
if [ "$EXIT" = "0" ] && [ "$LINES" = "2" ]; then
  # Verify new entry has expected fields
  LATEST=$(tail -1 "$STATE_DIR/metric-snapshots.jsonl")
  if echo "$LATEST" | jq -e '.untested_hooks != null and .corrections_pending != null and .instruction_lines == 3' > /dev/null 2>&1; then
    echo "  PASS  Test 3 old snapshot triggers new(schema correct)"
    PASS=$((PASS+1))
  else
    echo "  FAIL  Test 3 schema check (latest=$LATEST)"
    FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 3 schema"
  fi
else
  echo "  FAIL  Test 3 (exit=$EXIT, lines=$LINES, expected exit=0, lines=2)"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 3"
fi
teardown_temp_proj

# Test 5: ordinary sessions are byte-for-byte read-only without explicit opt-in.
echo "Test 5: telemetry defaults to read-only"
setup_temp_proj
GOVERNANCE_PROJECT_DIR="$TMP_PROJ" GOVERNANCE_STATE_DIR="$STATE_DIR" \
  GOVERNANCE_PROVIDER=codex bash "$HOOK"
EXIT=$?
if [ "$EXIT" = "0" ] && [ ! -e "$RUNTIME_ROOT" ]; then
  echo "  PASS  Test 5 no opt-in creates no runtime bytes"
  PASS=$((PASS+1))
else
  echo "  FAIL  Test 5 (exit=$EXIT, runtime_exists=$([ -e "$RUNTIME_ROOT" ] && echo yes || echo no))"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 5"
fi
teardown_temp_proj

# Test 6: an opt-in caller cannot redirect state outside the Git-owned root.
echo "Test 6: outside runtime state is rejected"
setup_temp_proj
OUTSIDE_STATE="$TMP_PROJ/outside-state"
mkdir -p "$OUTSIDE_STATE"
printf 'sentinel\n' > "$OUTSIDE_STATE/sentinel.txt"
GOVERNANCE_PROJECT_DIR="$TMP_PROJ" GOVERNANCE_STATE_DIR="$OUTSIDE_STATE" \
  GOVERNANCE_PROVIDER=codex GOVERNANCE_TELEMETRY_OPT_IN=1 bash "$HOOK"
EXIT=$?
if [ "$EXIT" = "0" ] && [ ! -e "$OUTSIDE_STATE/metric-snapshots.jsonl" ] \
  && [ "$(cat "$OUTSIDE_STATE/sentinel.txt")" = "sentinel" ]; then
  echo "  PASS  Test 6 outside state remained untouched"
  PASS=$((PASS+1))
else
  echo "  FAIL  Test 6 outside state accepted or mutated"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 6"
fi
teardown_temp_proj

# Test 7: even an in-root symlink is not an acceptable runtime state directory.
echo "Test 7: nested runtime symlink is rejected"
setup_temp_proj
mkdir -p "$RUNTIME_ROOT" "$TMP_PROJ/symlink-target"
ln -s "$TMP_PROJ/symlink-target" "$RUNTIME_ROOT/poison-state"
printf 'sentinel\n' > "$TMP_PROJ/symlink-target/sentinel.txt"
GOVERNANCE_PROJECT_DIR="$TMP_PROJ" GOVERNANCE_STATE_DIR="$RUNTIME_ROOT/poison-state" \
  GOVERNANCE_PROVIDER=codex GOVERNANCE_TELEMETRY_OPT_IN=1 bash "$HOOK"
EXIT=$?
if [ "$EXIT" = "0" ] && [ ! -e "$TMP_PROJ/symlink-target/metric-snapshots.jsonl" ] \
  && [ "$(cat "$TMP_PROJ/symlink-target/sentinel.txt")" = "sentinel" ]; then
  echo "  PASS  Test 7 symlink target remained untouched"
  PASS=$((PASS+1))
else
  echo "  FAIL  Test 7 symlink state accepted or mutated"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 7"
fi
teardown_temp_proj

echo ""
echo "════ Results: $PASS PASS, $FAIL FAIL ════"
[ "$FAIL" -gt 0 ] && { printf "Failed:%b\n" "$FAILED"; exit 1; }
exit 0

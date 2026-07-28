#!/bin/bash
# Tests for stop_governance_drift_check.sh
#
# Verifies:
#   1. Silent exit when no commits / no governance edits
#   2. Inject warning when CLAUDE.md over thresholds
#   3. Inject warning when foundational SSOT spec over cap
#   4. Update last-head pointer

set -u

ORIGINAL_PATH="$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Cluster B merge(2026-05-10):stop_governance_drift_check.sh fold 進 stop_passive_logging.sh dispatcher R4。
HOOK="$SCRIPT_DIR/../stop_passive_logging.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED=""

# Each test in own temp project to avoid cross-contamination
setup_proj() {
  TMP_PROJ=$(mktemp -d)
  cd "$TMP_PROJ" || exit 1
  git init --quiet
  git config user.email "test@test"
  git config user.name "Test"
  git config commit.gpgsign false
  echo "x" > a.txt
  git add a.txt
  git commit -q -m "init"
  mkdir -p .git/governance-runtime test-bin src/design-system/tokens/color
  cat > test-bin/npx <<'EOF'
#!/bin/sh
exit 0
EOF
  chmod +x test-bin/npx
  export PATH="$TMP_PROJ/test-bin:$ORIGINAL_PATH"
  export GOVERNANCE_PROVIDER=claude
  export GOVERNANCE_TELEMETRY_OPT_IN=1
  export GOVERNANCE_READ_ONLY=0
  export GOVERNANCE_PROJECT_DIR="$TMP_PROJ"
}
teardown_proj() { cd /; export PATH="$ORIGINAL_PATH"; rm -rf "$TMP_PROJ"; }

run_hook() {
  STDOUT=$(bash "$HOOK" 2>&1)
  EXIT=$?
}

# ── Test 1: no commits, no edits → silent exit 0 ─────────────────────────────
echo "Test 1: no changes → silent"
setup_proj
echo "$(git rev-parse HEAD)" > .git/governance-runtime/.stop-drift-last-head
run_hook
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then
  echo "  PASS  Test 1 silent on no changes"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 1 (exit=$EXIT, output=${STDOUT:0:100})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 1"
fi
teardown_proj

# ── Test 2: CLAUDE.md > 800 + new commit → BLOCKER warning ────────────────────
echo ""
echo "Test 2: CLAUDE.md > 800 with commit → warning injected"
setup_proj
PRE_HEAD=$(git rev-parse HEAD)
echo "$PRE_HEAD" > .git/governance-runtime/.stop-drift-last-head
yes '.' | head -850 > CLAUDE.md
git add CLAUDE.md
git commit -q -m "huge"
run_hook
LOG="$TMP_PROJ/.git/governance-runtime/governance-drift.jsonl"
if [ "$EXIT" = "0" ] && [ -f "$LOG" ] && grep -q "over 800 cap" "$LOG"; then
  echo "  PASS  Test 2 transition-cap warn injected"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 2 (exit=$EXIT, output=${STDOUT:0:200})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 2"
fi
teardown_proj

# ── Test 3: CLAUDE.md > 600 strong-warn ──────────────────────────────────────
echo ""
echo "Test 3: CLAUDE.md > 600 strong-warn"
setup_proj
PRE_HEAD=$(git rev-parse HEAD)
echo "$PRE_HEAD" > .git/governance-runtime/.stop-drift-last-head
yes '.' | head -650 > CLAUDE.md
git add CLAUDE.md
git commit -q -m "warn"
run_hook
LOG="$TMP_PROJ/.git/governance-runtime/governance-drift.jsonl"
if [ "$EXIT" = "0" ] && [ -f "$LOG" ] && grep -q "strong-warn" "$LOG"; then
  echo "  PASS  Test 3 strong-warn injected"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 3 (exit=$EXIT, output=${STDOUT:0:200})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 3"
fi
teardown_proj

# ── Test 4: governance edit detected via diff(no commit yet)→ warning ──────
echo ""
echo "Test 4: unstaged CLAUDE.md edit > 600 → warning"
setup_proj
echo "init" > CLAUDE.md
git add CLAUDE.md
git commit -q -m "init claude.md"
echo "$(git rev-parse HEAD)" > .git/governance-runtime/.stop-drift-last-head
yes '.' | head -650 > CLAUDE.md
run_hook
LOG="$TMP_PROJ/.git/governance-runtime/governance-drift.jsonl"
if [ "$EXIT" = "0" ] && [ -f "$LOG" ] && grep -q "strong-warn" "$LOG"; then
  echo "  PASS  Test 4 unstaged edit warning"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 4 (exit=$EXIT, output=${STDOUT:0:200})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 4"
fi
teardown_proj

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "  Results: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED"; exit 1
fi
exit 0

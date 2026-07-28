#!/bin/bash
# Runner: executes all test_*.sh in this directory, aggregates results.
#
# Usage: bash packages/design-system/ds-canonical/hooks/tests/run-all.sh
#        npm run hooks:test(via package.json wrapper)
#
# Exit: 0 if all pass, 1 if any test suite fails.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Hook tests are behavioral verification, never a telemetry-producing native session. Use the real
# git root for path semantics and make the entire replay byte-for-byte read-only.
export GOVERNANCE_PROJECT_DIR="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
export GOVERNANCE_READ_ONLY=1
# A test suite owns its fixture Git runtime and transcript/replay mode. Never
# let a caller session's bindings shadow the temporary repositories or the
# explicit runtime mode selected by an individual behavioral test below.
unset GOVERNANCE_RUNTIME_ROOT GOVERNANCE_STATE_DIR \
  GOVERNANCE_STATIC_REPLAY GOVERNANCE_TRANSCRIPT_PATH \
  GOVERNANCE_TRANSCRIPT_CONTRACT TRANSCRIPT_PATH \
  GOVERNANCE_PROVIDER GOVERNANCE_SELF_PROVIDER \
  GOVERNANCE_WRITE_STATE_TRUST GOVERNANCE_PROVIDER_ADAPTER_JSON
export GOVERNANCE_TELEMETRY_OPT_IN=0
cd "$SCRIPT_DIR" || exit 1

# Every suite builds its fixtures with `mktemp -d`. When TMPDIR is unwritable mktemp
# returns empty, and the classic `VAR="$(cd "$VAR" && pwd -P)"` normalization then
# resolves to this directory — turning a cleanup trap into corpus deletion. Prove the
# temporary directory works once, here, instead of discovering it 60 tests later.
TMPDIR_PROBE="$(mktemp -d 2>/dev/null || true)"
if [ -z "$TMPDIR_PROBE" ] || [ ! -d "$TMPDIR_PROBE" ]; then
  echo "❌ mktemp -d is unusable(TMPDIR=${TMPDIR:-unset});hook tests cannot build fixtures" >&2
  exit 1
fi
rm -rf "$TMPDIR_PROBE"

TOTAL_SUITES=0
PASSED_SUITES=0
FAILED_SUITES=""

echo "════════════════════════════════════════"
echo "  Hook test runner"
echo "════════════════════════════════════════"

for test_file in test_*.sh; do
  [ -f "$test_file" ] || continue
  TOTAL_SUITES=$((TOTAL_SUITES+1))
  echo ""
  echo "▶ Running: $test_file"
  echo "────────────────────────────────────────"
  if bash "$test_file"; then
    PASSED_SUITES=$((PASSED_SUITES+1))
  else
    FAILED_SUITES="${FAILED_SUITES}\n  - $test_file"
  fi
  # Name the destroyer immediately. Without this a suite that deletes shared sources
  # stays silent and the failure surfaces much later as an unrelated ENOENT, blaming
  # whichever consumer reads the corpus next.
  if [ ! -f "$SCRIPT_DIR/run-all.sh" ]; then
    echo "" >&2
    echo "❌ FATAL: $test_file destroyed the canonical hook test corpus at $SCRIPT_DIR" >&2
    exit 1
  fi
done

echo ""
echo "════════════════════════════════════════"
echo "  Suites: $PASSED_SUITES / $TOTAL_SUITES passed"
echo "════════════════════════════════════════"

# Coverage report:hooks with / without tests
HOOKS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ALL_HOOKS=$(find "$HOOKS_DIR" -maxdepth 1 -type f \( -name '*.sh' -o -name '*.py' \) \
  | grep -vE '(_log-fire\.sh|log_.*\.sh)' \
  | xargs -n1 basename \
  | sed 's/\.sh$//;s/\.py$//' \
  | sort -u)
TESTED_HOOKS=$(find "$SCRIPT_DIR" -maxdepth 1 -type f -name 'test_*.sh' \
  | xargs -n1 basename \
  | sed 's/^test_//;s/\.sh$//' \
  | sort -u)
UNTESTED=$(comm -23 <(printf '%s\n' "$ALL_HOOKS") <(printf '%s\n' "$TESTED_HOOKS"))
TOTAL_COUNT=$(printf '%s\n' "$ALL_HOOKS" | grep -c . 2>/dev/null || true)
TESTED_COUNT=$(printf '%s\n' "$TESTED_HOOKS" | grep -c . 2>/dev/null || true)
UNTESTED_COUNT=$(printf '%s\n' "$UNTESTED" | grep -c . 2>/dev/null || true)
TOTAL_COUNT="${TOTAL_COUNT:-0}"
TESTED_COUNT="${TESTED_COUNT:-0}"
UNTESTED_COUNT="${UNTESTED_COUNT:-0}"

echo ""
echo "📊 Coverage:"
echo "  Total hooks:  ${TOTAL_COUNT}"
echo "  With tests:   ${TESTED_COUNT}"
echo "  Without:      ${UNTESTED_COUNT}"
if [ "${UNTESTED_COUNT}" -gt 0 ] 2>/dev/null; then
  echo "  (active hook 無 behavioral test — fail closed)"
  printf '%s\n' "$UNTESTED" | sed 's/^/    - /' | head -20
  FAILED_SUITES="${FAILED_SUITES}\n  - active-hook-test-closure(${UNTESTED_COUNT} untested)"
fi

if [ -n "$FAILED_SUITES" ]; then
  printf "\nFailed suites:%b\n" "$FAILED_SUITES"
  exit 1
fi
exit 0

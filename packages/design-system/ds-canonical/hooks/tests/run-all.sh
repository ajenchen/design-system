#!/bin/bash
# Runner: executes the test_*.sh suites in this directory, aggregates results.
#
# Usage: bash packages/design-system/ds-canonical/hooks/tests/run-all.sh [test_x.sh ...]
#        npm run hooks:test                        every suite —— the canonical full run(gates / CI / harness)
#        npm run hooks:test -- test_x.sh [...]     only the named suites(file names, or paths that resolve
#                                                  into this directory; relative to where this was started)
#
# A subset run keeps every guard of the full run —— the static mktemp gate, the TMPDIR probe, the
# repository-write detector after each suite and the hook coverage closure —— but it is not the full
# run: the summary says SUBSET and how many suites did not run, so a green subset is never read as
# "hook tests passed". A name that is not a suite here stops the run before any suite starts(a typo
# must not turn into a zero-suite green, M37).
#
# Every suite runs with stdin from /dev/null. Hooks read their payload with `INPUT=$(cat)`, so a
# test that calls a hook without feeding one inherits this runner's stdin and waits for as long as
# the caller keeps that stdin open —— a background agent shell keeps it open forever(2026-11-18:
# test_stop_capture_metrics.sh hung a measurement for 40+ minutes).
#
# Exit: 0 if all pass, 1 if any test suite fails.

set -u

# Relative suite paths on the command line are relative to where the runner was started(the repo
# root under `npm run`), so remember it before the cd below.
CALLER_PWD="$PWD"
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
if [ -z "$GOVERNANCE_PROJECT_DIR" ]; then
  echo "❌ hook tests must run inside a Git worktree(the repository-write detector below reads git status)" >&2
  exit 1
fi

# Which suites run. No argument = every test_*.sh here(the canonical full suite). Every name is
# checked before anything runs; the guards below run the same way for a subset as for the full run.
ALL_SUITES=()
for test_file in test_*.sh; do
  [ -f "$test_file" ] && ALL_SUITES+=("$test_file")
done
SUITES=()
SUBSET=0
if [ "$#" -gt 0 ]; then
  SUBSET=1
  SUITE_DIR_REAL="$(pwd -P)"
  for arg in "$@"; do
    name="${arg##*/}"
    if [ "$name" != "$arg" ]; then
      case "$arg" in /*) candidate="$arg" ;; *) candidate="$CALLER_PWD/$arg" ;; esac
      parent="${candidate%/*}"
      [ -n "$parent" ] || parent=/
      parent="$(cd "$parent" 2>/dev/null && pwd -P)" || parent=""
      if [ "$parent" != "$SUITE_DIR_REAL" ]; then
        echo "❌ hooks:test:$arg is not in $SCRIPT_DIR(name a suite file there, e.g. test_check_x.sh)" >&2
        exit 1
      fi
    fi
    case "$name" in
      test_*.sh) ;;
      *) echo "❌ hooks:test:$arg is not a suite name(test_*.sh)" >&2; exit 1 ;;
    esac
    if [ ! -f "$name" ]; then
      echo "❌ hooks:test:no suite named $name in $SCRIPT_DIR" >&2
      exit 1
    fi
    duplicate=0
    for picked in ${SUITES[@]+"${SUITES[@]}"}; do
      [ "$picked" = "$name" ] && duplicate=1
    done
    [ "$duplicate" = 1 ] || SUITES+=("$name")
  done
else
  SUITES=(${ALL_SUITES[@]+"${ALL_SUITES[@]}"})
fi
if [ "${#SUITES[@]}" -eq 0 ]; then
  echo "❌ hooks:test:no test_*.sh suite found in $SCRIPT_DIR" >&2
  exit 1
fi

# Static gate first: every `mktemp -d` in these suites must be followed immediately by a
# non-empty + is-directory check that exits the suite. One unguarded site is enough to turn a
# broken TMPDIR into `git init` / `rm -rf` inside this corpus(2026-11-17 and 11-18), so refuse
# the whole run up front instead of finding out after a suite has already written.
if ! node "$GOVERNANCE_PROJECT_DIR/scripts/hook-test-fixture-guard-invariant.mjs"; then
  echo "❌ hook tests refused:fix the unguarded mktemp -d listed above first" >&2
  exit 1
fi

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

# Repository-write detector. The static gate above checks one known cause; this measures the
# property itself —— "running a suite wrote into the repository" —— whatever the cause: an
# unguarded mktemp, a guard the gate cannot parse, or a shape nobody has seen yet. Compared
# after every suite so the writer is named, not whichever suite trips over the leftovers later.
#   (1) any new `.git` anywhere in the repository(the 11-17 / 11-18 shape: `git init` in cwd)
#   (2) Git's view of the hook tree, ignored and untracked files listed one by one
# (2) stays scoped to the hook tree on purpose: this runner takes minutes, and a whole-repo
# status would blame an innocent suite whenever someone edits an unrelated file meanwhile.
HOOK_TREE="$(cd "$SCRIPT_DIR/.." && pwd)"
repository_write_fingerprint() {
  find "$GOVERNANCE_PROJECT_DIR" -name node_modules -prune -o -path "$GOVERNANCE_PROJECT_DIR/.git" -prune \
    -o -name .git -print 2>/dev/null | LC_ALL=C sort
  # Keep git last: its exit status is the function's status, which every caller checks below.
  git -C "$GOVERNANCE_PROJECT_DIR" --no-optional-locks status --porcelain --ignored --untracked-files=all \
    -- "$HOOK_TREE" 2>&1
}
# A failing git status prints the same error before and after every suite, so the comparison
# stays equal and half of the detector goes blind without a sound. "Saw no write" only counts
# when the instrument could see one: when it cannot, refuse the run as an instrument failure
# instead of letting the suites pass unwatched(M37).
write_detector_unavailable() {
  echo "❌ repository-write detector unavailable(git status failed $1);refusing to run hook tests:" >&2
  printf '%s\n' "$2" | sed 's/^/    /' >&2
  exit 1
}
# Lines only in $2 (+) / only in $1 (-). Pure shell on purpose: `diff <(...)` needs /dev/fd
# (denied in the macOS sandbox) and here-strings need a writable TMPDIR —— the very thing that
# is broken when this detector matters most.
fingerprint_delta() {
  local line saved_ifs="$IFS"
  set -f
  IFS=$'\n'
  for line in $2; do
    case $'\n'"$1"$'\n' in *$'\n'"$line"$'\n'*) ;; *) printf '    + %s\n' "$line" ;; esac
  done
  for line in $1; do
    case $'\n'"$2"$'\n' in *$'\n'"$line"$'\n'*) ;; *) printf '    - %s\n' "$line" ;; esac
  done
  IFS="$saved_ifs"
  set +f
}
WRITE_FINGERPRINT_BEFORE="$(repository_write_fingerprint)" \
  || write_detector_unavailable "before any suite" "$WRITE_FINGERPRINT_BEFORE"

TOTAL_SUITES=0
PASSED_SUITES=0
FAILED_SUITES=""

echo "════════════════════════════════════════"
echo "  Hook test runner"
echo "════════════════════════════════════════"

for test_file in "${SUITES[@]}"; do
  TOTAL_SUITES=$((TOTAL_SUITES+1))
  echo ""
  echo "▶ Running: $test_file"
  echo "────────────────────────────────────────"
  # stdin from /dev/null(see the header): a suite must never wait on the caller's stdin.
  if bash "$test_file" < /dev/null; then
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
  WRITE_FINGERPRINT_AFTER="$(repository_write_fingerprint)" \
    || write_detector_unavailable "after $test_file" "$WRITE_FINGERPRINT_AFTER"
  if [ "$WRITE_FINGERPRINT_AFTER" != "$WRITE_FINGERPRINT_BEFORE" ]; then
    echo "" >&2
    echo "❌ FATAL: $test_file wrote into the repository(new nested .git or changed files under $HOOK_TREE):" >&2
    fingerprint_delta "$WRITE_FINGERPRINT_BEFORE" "$WRITE_FINGERPRINT_AFTER" >&2
    exit 1
  fi
done

echo ""
echo "════════════════════════════════════════"
echo "  Suites: $PASSED_SUITES / $TOTAL_SUITES passed"
if [ "$SUBSET" = 1 ]; then
  echo "  SUBSET:$TOTAL_SUITES of ${#ALL_SUITES[@]} suites(named on the command line);$(( ${#ALL_SUITES[@]} - TOTAL_SUITES )) did not run —— not the full hook suite"
fi
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

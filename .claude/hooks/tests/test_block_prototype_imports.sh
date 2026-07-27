#!/bin/bash
# Tests for block_prototype_imports.py
#
# This hook is PostToolUse — reads files from disk via os.path.exists, so we
# create real temp files inside src/ tree to drive each scenario.
#
# Usage: bash test_block_prototype_imports.sh

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../block_prototype_imports.py"
PROJECT_ROOT=$(mktemp -d)
OUTSIDE_RUNTIME=$(mktemp -d)
export GOVERNANCE_PROJECT_DIR="$PROJECT_ROOT"
export GOVERNANCE_READ_ONLY=1
export GOVERNANCE_TELEMETRY_OPT_IN=0

if [ ! -f "$HOOK" ]; then
  echo "FATAL: hook not found: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

# Sandbox dir for temp files inside src/ (so should_check passes prefix gate)
SANDBOX="$PROJECT_ROOT/src/.test-block-prototype-imports-$$"
APP_ROOT="$PROJECT_ROOT/apps/test-block-prototype-imports-$$"
APP_SANDBOX="$APP_ROOT/src"
mkdir -p "$SANDBOX"
mkdir -p "$APP_SANDBOX"
git init -q "$PROJECT_ROOT"
TEST_GIT_DIR=$(git -C "$PROJECT_ROOT" rev-parse --absolute-git-dir)
TEST_GIT_DIR=$(cd "$TEST_GIT_DIR" && pwd -P)
TEST_RUNTIME_ROOT="$TEST_GIT_DIR/governance-runtime"
trap 'rm -rf "$PROJECT_ROOT" "$OUTSIDE_RUNTIME"' EXIT

run_hook() {
  local file_path="$1"
  local payload
  payload=$(jq -n --arg fp "$file_path" \
    '{tool_name: "Write", tool_input: {file_path: $fp}}')

  STDOUT=$(mktemp)
  STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | python3 "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_pass() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent exit 0, got $EXIT)"
    echo "$STDOUT_TEXT" | sed 's/^/    /'
    echo "$STDERR_TEXT" | sed 's/^/    /'
    FAIL=$((FAIL+1))
    FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_block() {
  local name="$1"
  local needle="$2"
  if [ "$EXIT" = "2" ]; then
    if [ -z "$STDOUT_TEXT" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
      echo "  PASS  $name"
      PASS=$((PASS+1))
    else
      echo "  FAIL  $name (exit 2 OK but expected empty stdout and stderr containing '$needle')"
      echo "$STDOUT_TEXT" | sed 's/^/    /'
      echo "$STDERR_TEXT" | sed 's/^/    /'
      FAIL=$((FAIL+1))
      FAILED_TESTS="${FAILED_TESTS}\n  - $name"
    fi
  else
    echo "  FAIL  $name (expected exit 2, got $EXIT)"
    echo "$STDOUT_TEXT" | sed 's/^/    /'
    echo "$STDERR_TEXT" | sed 's/^/    /'
    FAIL=$((FAIL+1))
    FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_integrity() {
  local name="$1"
  local needle="${2:-GOVERNANCE_INTEGRITY:}"
  if [ "$EXIT" = "70" ] && [ -z "$STDOUT_TEXT" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit 70 + '$needle', got $EXIT)"
    echo "$STDOUT_TEXT" | sed 's/^/    /'
    echo "$STDERR_TEXT" | sed 's/^/    /'
    FAIL=$((FAIL+1))
    FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

cd "$PROJECT_ROOT"

# ── Test 1: clean import → pass ──────────────────────────────────────────────
echo "Test 1: clean tsx with non-explorations import → pass"
F1="$SANDBOX/clean.tsx"
cat >"$F1" <<'EOF'
import { Button } from '@/design-system/components/Button/button'
export const X = () => <Button>OK</Button>
EOF
run_hook "${F1#$PROJECT_ROOT/}"
expect_pass "Test 1 clean import"

# ── Test 2: import from src/explorations → block ─────────────────────────────
echo ""
echo "Test 2: tsx imports from src/explorations/ → block"
F2="$SANDBOX/violation.tsx"
cat >"$F2" <<'EOF'
import { ProtoX } from '@/explorations/foo/bar'
import { Button } from '@/design-system/components/Button/button'
export const X = () => <ProtoX />
EOF
run_hook "${F2#$PROJECT_ROOT/}"
expect_block "Test 2 explorations import blocked" "Blocked"

# ── Test 3: file inside src/explorations/ itself → exempt (pass) ──────────────
echo ""
echo "Test 3: file IN src/explorations/ importing from explorations → pass (allowed)"
EXPL_DIR="$PROJECT_ROOT/src/explorations/.test-block-prototype-imports-$$"
mkdir -p "$EXPL_DIR"
F3="$EXPL_DIR/proto.tsx"
cat >"$F3" <<'EOF'
import { Other } from '@/explorations/other'
export const Y = () => <Other />
EOF
run_hook "${F3#$PROJECT_ROOT/}"
EXIT_CAPTURED=$EXIT
rm -rf "$EXPL_DIR"
EXIT=$EXIT_CAPTURED
expect_pass "Test 3 explorations file is exempt"

# ── Test 4: non-tsx file (md) → pass ─────────────────────────────────────────
echo ""
echo "Test 4: .md file (out of scope) → pass"
F4="$SANDBOX/note.md"
echo "import from src/explorations/foo (just text)" >"$F4"
run_hook "${F4#$PROJECT_ROOT/}"
expect_pass "Test 4 non-tsx out of scope"

# ── Test 5: a PostToolUse target that vanished cannot be inspected ────────────
echo ""
echo "Test 5: nonexistent scoped target → integrity failure"
run_hook "src/does-not-exist-$$.tsx"
expect_integrity "Test 5 nonexistent path" "prototype import target is missing"

# ── Test 6: ABSOLUTE path with explorations import → block ───────────────────
# Real Edit/Write events carry absolute file_path(2026-07-10 wiring-hunt:hook
# 原本只比對相對路徑 prefix → 對真實 edits 形同虛設)。
echo ""
echo "Test 6: absolute path tsx imports from src/explorations/ → block"
F6="$SANDBOX/violation-abs.tsx"
cat >"$F6" <<'EOF'
import { ProtoX } from '@/explorations/foo/bar'
export const X = () => <ProtoX />
EOF
run_hook "$F6"
expect_block "Test 6 absolute path explorations import blocked" "Blocked"

# ── Test 7: ABSOLUTE path clean import → pass ────────────────────────────────
echo ""
echo "Test 7: absolute path tsx with clean import → pass"
F7="$SANDBOX/clean-abs.tsx"
cat >"$F7" <<'EOF'
import { Button } from '@/design-system/components/Button/button'
export const X = () => <Button>OK</Button>
EOF
run_hook "$F7"
expect_pass "Test 7 absolute path clean import"

# ── Test 8: real consumer layout apps/<app>/src/** → block ──────────────────
echo ""
echo "Test 8: apps/<app>/src production file imports explorations → block"
F8="$APP_SANDBOX/violation.tsx"
cat >"$F8" <<'EOF'
import { ProtoX } from './explorations/prototype'
export const X = () => <ProtoX />
EOF
run_hook "${F8#$PROJECT_ROOT/}"
expect_block "Test 8 consumer app production import blocked" "Blocked"

# ── Test 9: apps/<app>/src/explorations/** remains an allowed sandbox ───────
echo ""
echo "Test 9: apps/<app>/src/explorations file is exempt"
mkdir -p "$APP_SANDBOX/explorations"
F9="$APP_SANDBOX/explorations/prototype.tsx"
cat >"$F9" <<'EOF'
import { Other } from '../explorations/other'
export const X = () => <Other />
EOF
run_hook "${F9#$PROJECT_ROOT/}"
expect_pass "Test 9 consumer app exploration file exempt"

# ── Test 10: telemetry is off by default and never recreates .claude/ ────────
echo ""
echo "Test 10: default telemetry is read-only and provider-neutral"
export GOVERNANCE_READ_ONLY=0
export GOVERNANCE_TELEMETRY_OPT_IN=0
rm -rf "$PROJECT_ROOT/.claude" "$TEST_RUNTIME_ROOT"
run_hook "${F1#$PROJECT_ROOT/}"
if [ "$EXIT" = "0" ] && [ ! -e "$PROJECT_ROOT/.claude" ] && [ ! -e "$TEST_RUNTIME_ROOT" ]; then
  echo "  PASS  Test 10 no implicit telemetry or .claude state"
  PASS=$((PASS+1))
else
  echo "  FAIL  Test 10 implicit telemetry state was created"
  FAIL=$((FAIL+1))
  FAILED_TESTS="${FAILED_TESTS}\n  - Test 10 no implicit telemetry or .claude state"
fi

# ── Test 11: explicit telemetry writes only below governance-runtime ──────
echo ""
echo "Test 11: opt-in telemetry uses provider-neutral runtime state"
export GOVERNANCE_TELEMETRY_OPT_IN=1
export GOVERNANCE_STATE_DIR="$TEST_RUNTIME_ROOT/hook-state"
run_hook "${F1#$PROJECT_ROOT/}"
TELEMETRY_LOG="$GOVERNANCE_STATE_DIR/hook-fires-per-hook.jsonl"
if [ "$EXIT" = "0" ] && [ -f "$TELEMETRY_LOG" ] && grep -qF 'block_prototype_imports.py' "$TELEMETRY_LOG" && [ ! -e "$PROJECT_ROOT/.claude" ]; then
  echo "  PASS  Test 11 opted-in telemetry is provider-neutral"
  PASS=$((PASS+1))
else
  echo "  FAIL  Test 11 provider-neutral telemetry log missing or .claude created"
  FAIL=$((FAIL+1))
  FAILED_TESTS="${FAILED_TESTS}\n  - Test 11 opted-in telemetry is provider-neutral"
fi

# ── Test 12: an escaped state directory fails closed without side effects ──────
echo ""
echo "Test 12: out-of-root telemetry destination is rejected"
OUTSIDE_STATE="$PROJECT_ROOT/outside-state"
export GOVERNANCE_STATE_DIR="$OUTSIDE_STATE"
run_hook "${F1#$PROJECT_ROOT/}"
if [ "$EXIT" = "0" ] && [ ! -e "$OUTSIDE_STATE" ] && [ ! -e "$PROJECT_ROOT/.claude" ]; then
  echo "  PASS  Test 12 escaped telemetry state rejected"
  PASS=$((PASS+1))
else
  echo "  FAIL  Test 12 escaped telemetry state was created"
  FAIL=$((FAIL+1))
  FAILED_TESTS="${FAILED_TESTS}\n  - Test 12 escaped telemetry state rejected"
fi
unset GOVERNANCE_STATE_DIR
export GOVERNANCE_READ_ONLY=1
export GOVERNANCE_TELEMETRY_OPT_IN=0

# ── Test 13: a symlink at the default runtime root is never followed ───────
echo ""
echo "Test 13: default runtime symlink is rejected without external writes"
export GOVERNANCE_READ_ONLY=0
export GOVERNANCE_TELEMETRY_OPT_IN=1
RUNTIME_ROOT="$TEST_RUNTIME_ROOT"
rm -rf "$RUNTIME_ROOT"
ln -s "$OUTSIDE_RUNTIME" "$RUNTIME_ROOT"
run_hook "${F1#$PROJECT_ROOT/}"
if [ "$EXIT" = "0" ] && [ ! -e "$OUTSIDE_RUNTIME/hook-fires-per-hook.jsonl" ]; then
  echo "  PASS  Test 13 default runtime symlink not followed"
  PASS=$((PASS+1))
else
  echo "  FAIL  Test 13 external telemetry was written through a symlink"
  FAIL=$((FAIL+1))
  FAILED_TESTS="${FAILED_TESTS}\n  - Test 13 default runtime symlink not followed"
fi

# ── Test 14: a nested state symlink is never followed ───────────────────
echo ""
echo "Test 14: nested state symlink is rejected without external writes"
rm -f "$RUNTIME_ROOT"
mkdir -p "$RUNTIME_ROOT"
ln -s "$OUTSIDE_RUNTIME" "$RUNTIME_ROOT/nested"
export GOVERNANCE_STATE_DIR="$RUNTIME_ROOT/nested"
run_hook "${F1#$PROJECT_ROOT/}"
if [ "$EXIT" = "0" ] && [ ! -e "$OUTSIDE_RUNTIME/hook-fires-per-hook.jsonl" ]; then
  echo "  PASS  Test 14 nested state symlink not followed"
  PASS=$((PASS+1))
else
  echo "  FAIL  Test 14 external telemetry was written through a nested symlink"
  FAIL=$((FAIL+1))
  FAILED_TESTS="${FAILED_TESTS}\n  - Test 14 nested state symlink not followed"
fi
unset GOVERNANCE_STATE_DIR
export GOVERNANCE_READ_ONLY=1
export GOVERNANCE_TELEMETRY_OPT_IN=0

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "  Results: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed tests:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

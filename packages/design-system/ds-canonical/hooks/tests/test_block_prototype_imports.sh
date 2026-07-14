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
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [ ! -f "$HOOK" ]; then
  echo "FATAL: hook not found: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

# Sandbox dir for temp files inside src/ (so should_check passes prefix gate)
SANDBOX="$PROJECT_ROOT/src/.test-block-prototype-imports-$$"
mkdir -p "$SANDBOX"
trap 'rm -rf "$SANDBOX"' EXIT

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
  if [ "$EXIT" = "0" ]; then
    echo "  PASS  $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit 0, got $EXIT)"
    echo "$STDOUT_TEXT" | sed 's/^/    /'
    FAIL=$((FAIL+1))
    FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_block() {
  local name="$1"
  local needle="$2"
  if [ "$EXIT" = "2" ]; then
    if echo "$STDOUT_TEXT" | grep -qF "$needle"; then
      echo "  PASS  $name"
      PASS=$((PASS+1))
    else
      echo "  FAIL  $name (exit 2 OK but stdout missing '$needle')"
      echo "$STDOUT_TEXT" | sed 's/^/    /'
      FAIL=$((FAIL+1))
      FAILED_TESTS="${FAILED_TESTS}\n  - $name"
    fi
  else
    echo "  FAIL  $name (expected exit 2, got $EXIT)"
    echo "$STDOUT_TEXT" | sed 's/^/    /'
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

# ── Test 5: nonexistent path → pass (silently skip) ──────────────────────────
echo ""
echo "Test 5: nonexistent path → pass (silently skip)"
run_hook "src/does-not-exist-$$.tsx"
expect_pass "Test 5 nonexistent path"

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

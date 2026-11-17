#!/bin/bash
# Tests for check_person_data_richness.sh
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../lib/_person_data_richness.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }
PASS=0; FAIL=0

setup() { TMP=$(mktemp -d); [ -n "${TMP:-}" ] && [ -d "$TMP" ] || { echo "❌ mktemp -d failed(TMP;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }; mkdir -p "$TMP/.claude/hooks"; echo 'log_hook_fire(){ :; }' > "$TMP/.claude/hooks/_log-fire.sh"; }
teardown() { rm -rf "$TMP"; }

run() {
  STDOUT=$(echo "{\"tool_input\":{\"file_path\":\"$1\"}}" | bash "$HOOK" 2>&1)
  EXIT=$?
}

# Test 1: non-tsx file → silent
echo "Test 1: non-tsx → silent"
setup
echo "data" > "$TMP/foo.txt"
run "$TMP/foo.txt"
[ "$EXIT" = "0" ] && [ -z "$STDOUT" ] && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL"; FAIL=$((FAIL+1)); }
teardown

# Test 2: sparse PersonData → flag
echo "Test 2: sparse {name,avatarUrl} → flagged"
setup
cat > "$TMP/test.tsx" <<EOF
const p = { name: 'Alice', avatarUrl: 'http://x' }
EOF
run "$TMP/test.tsx"
echo "$STDOUT" | grep -q "Sparse PersonData" && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL: $STDOUT"; FAIL=$((FAIL+1)); }
teardown

# Test 3: rich PersonData → silent
echo "Test 3: rich PersonData → silent"
setup
cat > "$TMP/test.tsx" <<EOF
const p: PersonData = { name: 'Alice', avatarUrl: 'http://x', description: 'Eng', status: 'online', statusMessage: 'OK', fields: [] }
EOF
run "$TMP/test.tsx"
[ "$EXIT" = "0" ] && [ -z "$STDOUT" ] && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL: $STDOUT"; FAIL=$((FAIL+1)); }
teardown

# Test 4: NameCard / Avatar self files skipped(real DS path pattern)
echo "Test 4: src/.../NameCard/name-card.stories.tsx → skip"
setup
mkdir -p "$TMP/packages/design-system/src/components/NameCard"
cat > "$TMP/packages/design-system/src/components/NameCard/name-card.stories.tsx" <<EOF
const p = { name: 'A', avatarUrl: 'x' }
EOF
run "$TMP/packages/design-system/src/components/NameCard/name-card.stories.tsx"
[ "$EXIT" = "0" ] && [ -z "$STDOUT" ] && { echo "  PASS"; PASS=$((PASS+1)); } || { echo "  FAIL: $STDOUT"; FAIL=$((FAIL+1)); }
teardown

echo ""
echo "── Summary: $PASS / $((PASS+FAIL)) passed ──"
[ "$FAIL" -eq 0 ] && echo "✅ All passed" || exit 1

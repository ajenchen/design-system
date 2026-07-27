#!/bin/bash
set -uo pipefail

HOOK="$(cd "$(dirname "$0")/.." && pwd)/governance_control_plane.sh"
FIXTURE=$(mktemp -d)
trap 'rm -rf "$FIXTURE"' EXIT
mkdir -p "$FIXTURE/governance/generated/adapters"

PASS=0
FAIL=0
expect_rc() {
  local name="$1" expected="$2" provider="$3"
  shift 3
  set +e
  printf '%s' '{"event":"before_write","path":"governance/generated/control-plane.json"}' \
    | GOVERNANCE_PROJECT_DIR="$FIXTURE" GOVERNANCE_PROVIDER="$provider" bash "$HOOK" "$@" \
      >"$FIXTURE/stdout" 2>"$FIXTURE/stderr"
  local actual=$?
  set -e
  local output_ok=1
  if [ "$expected" -eq 0 ]; then
    [ ! -s "$FIXTURE/stdout" ] && [ ! -s "$FIXTURE/stderr" ] && output_ok=0
  elif [ "$expected" -eq 2 ]; then
    [ ! -s "$FIXTURE/stdout" ] && [ -s "$FIXTURE/stderr" ] \
      && ! grep -q 'GOVERNANCE_INTEGRITY:' "$FIXTURE/stderr" && output_ok=0
  elif [ "$expected" -eq 70 ]; then
    [ ! -s "$FIXTURE/stdout" ] \
      && grep -q 'GOVERNANCE_INTEGRITY:' "$FIXTURE/stderr" && output_ok=0
  fi
  if [ "$actual" -eq "$expected" ] && [ "$output_ok" -eq 0 ]; then
    PASS=$((PASS + 1)); echo "  PASS  $name"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL  $name(expected contract $expected, got $actual)"
  fi
}

set -e
cat > "$FIXTURE/governance/generated/adapters/claude-hook.mjs" <<'EOF'
process.stdin.resume()
process.stdin.on('end', () => process.exit(0))
EOF
cat > "$FIXTURE/governance/generated/adapters/codex-hook.mjs" <<'EOF'
process.stdin.resume()
process.stdin.on('end', () => {
  process.stderr.write('fixture policy denial\n')
  process.exit(2)
})
EOF
cat > "$FIXTURE/governance/generated/adapters/generic-hook.mjs" <<'EOF'
process.stdin.resume()
process.stdin.on('end', () => process.exit(0))
EOF

echo '=== governance_control_plane adapter tests ==='
expect_rc 'Claude adapter pass is propagated' 0 claude
expect_rc 'Codex adapter block is propagated' 2 codex
expect_rc 'Generic adapter is routable for future providers' 0 generic
expect_rc 'Unknown provider fails as integrity, not policy' 70 unregistered
rm "$FIXTURE/governance/generated/adapters/generic-hook.mjs"
expect_rc 'Missing generated adapter fails as integrity, not policy' 70 generic
ln -s "$FIXTURE/governance/generated/adapters/claude-hook.mjs" \
  "$FIXTURE/governance/generated/adapters/generic-hook.mjs"
expect_rc 'Symlinked generated adapter fails as integrity' 70 generic

echo "Passed: $PASS / $((PASS + FAIL))"
[ "$FAIL" -eq 0 ]

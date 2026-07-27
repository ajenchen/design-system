#!/bin/bash
# Tests for check_codex_collab_5step.sh(M31 5-step canonical soft warn)
#
# Hook 規則:Bash + git commit + commit message 含 codex collab keyword(codex / Layer A own /
# Layer B codex / dual-track / 據理力爭 / cite battle)但缺 3 必備 marker
# (spec cite / verify run / verdict)→ stderr soft warn (exit 0)。
# Allow escape:`@codex-collab-allow: <reason>`。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_codex_collab_5step.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
export GOVERNANCE_READ_ONLY=1
export GOVERNANCE_SELF_PROVIDER=claude
export GOVERNANCE_PEER_PROVIDER=codex
export GOVERNANCE_PEER_DISPLAY_NAME="Codex"

run_hook() {
  local tool="$1"
  local command="$2"
  local payload
  payload=$(jq -n --arg t "$tool" --arg c "$command" \
    '{tool_name: $t, tool_input: {command: $c}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

run_hook_payload_file() {
  local payload_file="$1"
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  bash "$HOOK" <"$payload_file" >"$STDOUT" 2>"$STDERR"
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
    echo "  FAIL  $name (expected silent, exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_warn() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] \
    && ! grep -qF 'GOVERNANCE_INTEGRITY:' <<<"$STDERR_TEXT" \
    && grep -qF "$needle" <<<"$STDERR_TEXT"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected warn '$needle', got exit $EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_codex_collab_5step tests ==="

# 1. Non-Bash tool → skip
run_hook "Edit" "irrelevant"
expect_pass_silent "1. non-Bash tool → skip"

# 2. Bash non-git-commit command → skip
run_hook "Bash" "ls -la"
expect_pass_silent "2. Bash non-git-commit → skip"

# 3. git commit without codex keyword → skip
run_hook "Bash" "git commit -m \"fix typo in spec\""
expect_pass_silent "3. git commit no codex keyword → skip"

# 4. git commit WITH codex keyword but NO marker → warn
run_hook "Bash" "git commit -m \"codex propose accepted\""
expect_warn "4. codex keyword, no markers → warn" "M31 peer-collab 5-step canonical 違反"

# 5. git commit WITH codex keyword + allow escape → silent
run_hook "Bash" "git commit -m \"codex propose @peer-collab-allow: emergency hotfix\""
expect_pass_silent "5. codex keyword + @peer-collab-allow → silent"

# 6. git commit WITH codex + all 3 markers → silent
run_hook "Bash" "git commit -m \"codex collab agree synthesize: spec.md:L42 cite + tsc audit verify + verdict agree\""
expect_pass_silent "6. codex + spec cite + verify + verdict → silent"

# 7. git commit WITH cite battle keyword only(missing other 2 markers)→ warn
run_hook "Bash" "git commit -m \"cite battle vs codex on field-controls\""
expect_warn "7. cite battle only, missing verify/verdict → warn" "spec.md cite"

# 8. Exercise both full COMMAND and heredoc-derived MSG with an early escape match followed by
# >256 KiB. The payload is encoded from a file so this test never places the replay in argv.
LARGE_COMMAND="$TMP_DIR/large-collab-command.txt"
{
  printf "%s\n" "git commit -F - < <(cat <<'EOF'"
  printf '%s\n' '@peer-collab-allow: large full-command replay'
  awk 'BEGIN {
    for (i = 0; i < 12000; i++) {
      printf "large-collab-filler-%05d abcdefghijklmnopqrstuvwxyz0123456789\n", i
    }
  }'
  printf '%s\n' 'EOF' ')'
} >"$LARGE_COMMAND"
if [ "$(wc -c <"$LARGE_COMMAND" | tr -d ' ')" -le 262144 ]; then
  echo "  FAIL  8. large collab fixture is not larger than 256 KiB"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 8. fixture size"
else
  jq -Rs '{tool_name:"Bash",tool_input:{command:.}}' \
    <"$LARGE_COMMAND" >"$TMP_DIR/large-collab-command.json"
  run_hook_payload_file "$TMP_DIR/large-collab-command.json"
  expect_pass_silent "8. >256 KiB early git/allow match remains silent"
fi

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

#!/bin/bash
set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../log_skill_invokes.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }

PASS=0
FAIL=0
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Test 1: incomplete Skill payload → silent rc0"
set +e
printf '%s' '{"tool_name":"Skill"}' | bash "$HOOK" \
  >"$TMP_DIR/empty.stdout" 2>"$TMP_DIR/empty.stderr"
EXIT=$?
set -e
if [ "$EXIT" -eq 0 ] \
  && [ ! -s "$TMP_DIR/empty.stdout" ] \
  && [ ! -s "$TMP_DIR/empty.stderr" ]; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: expected silent rc0, got exit=$EXIT"; FAIL=$((FAIL+1))
fi

echo "Test 2: >256 KiB args → silent rc0 + exact 200-character log slice"
git -C "$TMP_DIR" init -q
GIT_DIR=$(git -C "$TMP_DIR" rev-parse --absolute-git-dir)
STATE_DIR="$GIT_DIR/governance-runtime"
{
  printf '%s' 'match-at-start:'
  awk 'BEGIN {
    for (i = 0; i < 12000; i++) {
      printf "large-skill-args-%05d-abcdefghijklmnopqrstuvwxyz0123456789", i
    }
  }'
  printf '\n'
} >"$TMP_DIR/large-args.txt"
if [ "$(wc -c <"$TMP_DIR/large-args.txt" | tr -d ' ')" -le 262144 ]; then
  echo "  FAIL: large args fixture is not larger than 256 KiB"
  FAIL=$((FAIL+1))
else
  jq -Rs '{
    hook_event_name:"PostToolUse",
    tool_name:"Skill",
    tool_input:{skill:"large-replay-skill",args:.}
  }' <"$TMP_DIR/large-args.txt" >"$TMP_DIR/large-payload.json"
  set +e
  GOVERNANCE_PROJECT_DIR="$TMP_DIR" \
  GOVERNANCE_STATE_DIR="$STATE_DIR" \
  GOVERNANCE_TELEMETRY_OPT_IN=1 \
  GOVERNANCE_READ_ONLY=0 \
    bash "$HOOK" <"$TMP_DIR/large-payload.json" \
      >"$TMP_DIR/large.stdout" 2>"$TMP_DIR/large.stderr"
  EXIT=$?
  set -e
  LOG_FILE="$STATE_DIR/skill-invokes.jsonl"
  if [ "$EXIT" -eq 0 ] \
    && [ ! -s "$TMP_DIR/large.stdout" ] \
    && [ ! -s "$TMP_DIR/large.stderr" ] \
    && [ -f "$LOG_FILE" ] \
    && jq -e -s '
      length == 1
      and .[0].skill == "large-replay-skill"
      and (.[0].args | length) == 200
      and (.[0].args | startswith("match-at-start:"))
    ' "$LOG_FILE" >/dev/null 2>&1; then
    echo "  PASS"; PASS=$((PASS+1))
  else
    echo "  FAIL: expected silent rc0 and one valid truncated log (exit=$EXIT)"
    FAIL=$((FAIL+1))
  fi
fi

echo "Results: $PASS PASS, $FAIL FAIL"
[ "$FAIL" -eq 0 ]

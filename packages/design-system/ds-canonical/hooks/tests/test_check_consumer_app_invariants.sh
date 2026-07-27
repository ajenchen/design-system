#!/bin/bash
# test_check_consumer_app_invariants.sh — 聚合測試(2026-06-11 prune merge 同名 coverage)
# check_consumer_app_invariants.sh 為 multi-rule 合併檔;各規則的完整 positive/negative 案例在下列既有
# per-rule 測試(已 repoint 至合併檔)。本檔 = name-matched coverage gate 入口,零重複。
set -uo pipefail
DIR="$(dirname "$0")"
fail=0
bash "$DIR/test_check_consumer_no_ds_catalog.sh" < /dev/null || { echo "SUB-FAIL: test_check_consumer_no_ds_catalog.sh"; fail=1; }
bash "$DIR/test_check_consumer_story_baseline.sh" < /dev/null || { echo "SUB-FAIL: test_check_consumer_story_baseline.sh"; fail=1; }
bash "$DIR/test_check_consumer_ds_primitive_misuse.sh" < /dev/null || { echo "SUB-FAIL: test_check_consumer_ds_primitive_misuse.sh"; fail=1; }
bash "$DIR/test_check_consumer_app_story_title.sh" < /dev/null || { echo "SUB-FAIL: test_check_consumer_app_story_title.sh"; fail=1; }

FAULT_DIR=$(mktemp -d)
trap 'rm -rf -- "$FAULT_DIR"' EXIT
awk '
  { print }
  $0 == "r1_no_ds_catalog() {" { print "return 1" }
' "$DIR/../check_consumer_app_invariants.sh" >"$FAULT_DIR/check_consumer_app_invariants.sh"
set +e
printf '%s' '{}' | bash "$FAULT_DIR/check_consumer_app_invariants.sh" \
  >"$FAULT_DIR/stdout" 2>"$FAULT_DIR/stderr"
rc=$?
set -e
if [ "$rc" -eq 70 ] \
  && [ ! -s "$FAULT_DIR/stdout" ] \
  && grep -qF 'GOVERNANCE_INTEGRITY:' "$FAULT_DIR/stderr" \
  && grep -qF 'exit code 1' "$FAULT_DIR/stderr"; then
  echo "PASS: unexpected consumer child exit 1 uses integrity rc70"
else
  echo "SUB-FAIL: unexpected consumer child exit 1 was not failed closed (exit $rc)"
  fail=1
fi

set +e
printf '%s' '{"tool_name":"Write","tool_input":{"file_path":"apps/demo/src/App.tsx","content":"<CircularProgress size={24} />"}}' \
  | bash "$DIR/../check_consumer_app_invariants.sh" \
      >"$FAULT_DIR/policy.stdout" 2>"$FAULT_DIR/policy.stderr"
rc=$?
set -e
if [ "$rc" -eq 2 ] && [ ! -s "$FAULT_DIR/policy.stdout" ] \
  && grep -qF 'CONSUMER-DS-PRIMITIVE-MISUSE BLOCKER' "$FAULT_DIR/policy.stderr" \
  && ! grep -qF 'GOVERNANCE_INTEGRITY:' "$FAULT_DIR/policy.stderr"; then
  echo "PASS: real consumer policy blocker remains stderr-only rc2"
else
  echo "SUB-FAIL: real consumer policy blocker contract changed (exit $rc)"
  fail=1
fi

# Full-file provider replays can be much larger than a pipe buffer.  Keep the
# first match at byte zero so a producer | grep -q implementation reliably
# exercises the SIGPIPE/raw-stderr failure class this regression guards.
awk 'BEGIN {
  for (i = 0; i < 12000; i++) {
    printf "// large-payload-filler-%05d abcdefghijklmnopqrstuvwxyz0123456789\n", i
  }
}' >"$FAULT_DIR/large-filler.txt"
if [ "$(wc -c <"$FAULT_DIR/large-filler.txt" | tr -d ' ')" -le 262144 ]; then
  echo "SUB-FAIL: large consumer payload fixture is not larger than 256 KiB"
  fail=1
fi

{
  printf '%s\n' '// @ds-misuse-allow: large full-file replay regression'
  cat "$FAULT_DIR/large-filler.txt"
} | jq -Rs '{
  hook_event_name: "PreToolUse",
  tool_name: "Write",
  tool_input: {
    file_path: "apps/demo/src/App.tsx",
    content: .
  }
}' >"$FAULT_DIR/large-early-allow.json"
set +e
bash "$DIR/../check_consumer_app_invariants.sh" \
  <"$FAULT_DIR/large-early-allow.json" \
  >"$FAULT_DIR/large-early-allow.stdout" \
  2>"$FAULT_DIR/large-early-allow.stderr"
rc=$?
set -e
if [ "$rc" -eq 0 ] \
  && [ ! -s "$FAULT_DIR/large-early-allow.stdout" ] \
  && [ ! -s "$FAULT_DIR/large-early-allow.stderr" ]; then
  echo "PASS: >256 KiB early allow match remains silent rc0"
else
  echo "SUB-FAIL: >256 KiB early allow match violated output contract (exit $rc)"
  fail=1
fi

{
  printf '%s\n' '<select aria-label="large replay"></select>'
  cat "$FAULT_DIR/large-filler.txt"
} | jq -Rs '{
  hook_event_name: "PreToolUse",
  tool_name: "Write",
  tool_input: {
    file_path: "apps/demo/src/App.tsx",
    content: .
  }
}' >"$FAULT_DIR/large-early-block.json"
set +e
bash "$DIR/../check_consumer_app_invariants.sh" \
  <"$FAULT_DIR/large-early-block.json" \
  >"$FAULT_DIR/large-early-block.stdout" \
  2>"$FAULT_DIR/large-early-block.stderr"
rc=$?
set -e
if [ "$rc" -eq 2 ] \
  && [ ! -s "$FAULT_DIR/large-early-block.stdout" ] \
  && grep -qF 'CONSUMER-DS-PRIMITIVE-MISUSE BLOCKER' "$FAULT_DIR/large-early-block.stderr" \
  && ! grep -qF 'GOVERNANCE_INTEGRITY:' "$FAULT_DIR/large-early-block.stderr"; then
  echo "PASS: >256 KiB early policy match remains stderr-only rc2"
else
  echo "SUB-FAIL: >256 KiB early policy match violated output contract (exit $rc)"
  fail=1
fi

cat "$FAULT_DIR/large-filler.txt" | jq -Rs '{
  hook_event_name: "PreToolUse",
  tool_name: "Write",
  tool_input: {
    file_path: "apps/demo/src/App.tsx",
    content: .
  }
}' >"$FAULT_DIR/large-no-match.json"
set +e
bash "$DIR/../check_consumer_app_invariants.sh" \
  <"$FAULT_DIR/large-no-match.json" \
  >"$FAULT_DIR/large-no-match.stdout" \
  2>"$FAULT_DIR/large-no-match.stderr"
rc=$?
set -e
if [ "$rc" -eq 0 ] \
  && [ ! -s "$FAULT_DIR/large-no-match.stdout" ] \
  && [ ! -s "$FAULT_DIR/large-no-match.stderr" ]; then
  echo "PASS: >256 KiB no-match replay remains silent rc0"
else
  echo "SUB-FAIL: >256 KiB no-match replay violated output contract (exit $rc)"
  fail=1
fi
exit $fail

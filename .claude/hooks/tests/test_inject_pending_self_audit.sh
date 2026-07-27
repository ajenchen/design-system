#!/bin/bash
# Tests for inject_pending_self_audit.sh

set -u

# This suite intentionally verifies isolated runtime-state writes. Do not inherit
# the read-only replay flag from the aggregate runner.
export GOVERNANCE_READ_ONLY=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../inject_pending_self_audit.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }

PASS=0; FAIL=0; FAILED=""

setup_proj() {
  TMP_PROJ=$(mktemp -d)
  git -C "$TMP_PROJ" init -q
  STATE_DIR="$TMP_PROJ/.git/governance-runtime"
  mkdir -p "$TMP_PROJ/.claude/hooks" "$STATE_DIR"
  echo 'log_hook_fire() { :; }' > "$TMP_PROJ/.claude/hooks/_log-fire.sh"
  export GOVERNANCE_PROJECT_DIR="$TMP_PROJ"
  export GOVERNANCE_STATE_DIR="$STATE_DIR"
  export GOVERNANCE_TELEMETRY_OPT_IN=1
}
teardown_proj() {
  rm -rf "$TMP_PROJ"
  unset GOVERNANCE_PROJECT_DIR
  unset GOVERNANCE_STATE_DIR GOVERNANCE_TELEMETRY_OPT_IN
}

run_hook() {
  STDOUT=$(echo '{}' | bash "$HOOK" 2>&1)
  EXIT=$?
}

# ── Test 1: 無 log file → silent ──
echo "Test 1: no log files → silent exit 0"
setup_proj
run_hook
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then
  echo "  PASS  Test 1"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 1 (exit=$EXIT, output=${STDOUT:0:200})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 1"
fi
teardown_proj

# ── Test 2: 有 warnings → inject additionalContext ──
echo "Test 2: warning log present → inject"
setup_proj
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{"ts":"%s","warnings":"\\n  • Test warning A\\n  • Test warning B"}\n' "$NOW" \
  > "$STATE_DIR/self-audit-warnings.jsonl"
run_hook
if [ "$EXIT" = "0" ] && echo "$STDOUT" | grep -q "Test warning A" && echo "$STDOUT" | grep -q "governanceContext"; then
  echo "  PASS  Test 2"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 2 (exit=$EXIT)"
  echo "         output=${STDOUT:0:200}"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 2"
fi
teardown_proj

# ── Test 3: dedup 同 warning → 顯示 [×N] ──
echo "Test 3: duplicate warnings → dedup count"
setup_proj
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
for i in 1 2 3; do
  printf '{"ts":"%s","warnings":"\\n  • Same warning"}\n' "$NOW" \
    >> "$STATE_DIR/self-audit-warnings.jsonl"
done
run_hook
if echo "$STDOUT" | grep -q '\[×3\]'; then
  echo "  PASS  Test 3"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 3 — dedup [×3] missing"
  echo "         output=${STDOUT:0:300}"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 3"
fi
teardown_proj

# ── Test 4: LAST_TS 過濾舊條目 ──
echo "Test 4: LAST_TS filter — old entry skipped"
setup_proj
OLD=$(date -u -v-48H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '48 hours ago' +%Y-%m-%dT%H:%M:%SZ)
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RECENT=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)
echo "$NOW" > "$STATE_DIR/last-inject-ts.txt"
printf '{"ts":"%s","warnings":"\\n  • Old warning(should skip)"}\n' "$OLD" \
  > "$STATE_DIR/self-audit-warnings.jsonl"
printf '{"ts":"%s","warnings":"\\n  • Recent warning(also skip,因 < NOW)"}\n' "$RECENT" \
  >> "$STATE_DIR/self-audit-warnings.jsonl"
run_hook
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then
  echo "  PASS  Test 4"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 4 — should be silent (LAST_TS=NOW)"
  echo "         output=${STDOUT:0:200}"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 4"
fi
teardown_proj

# ── Test 5: size cap — 超過 3KB truncate ──
echo "Test 5: large input → truncate ≤ 3.5KB"
setup_proj
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# 產 50 條不同 warning
for i in $(seq 1 50); do
  printf '{"ts":"%s","warnings":"\\n  • Warning number %d with some padding text to fill space and exceed cap eventually"}\n' "$NOW" "$i" \
    >> "$STATE_DIR/self-audit-warnings.jsonl"
done
run_hook
LEN=${#STDOUT}
if [ "$LEN" -lt 3800 ] && echo "$STDOUT" | grep -q "governanceContext"; then
  echo "  PASS  Test 5 (size=$LEN bytes,有 truncate 提示)"
  PASS=$((PASS+1))
else
  echo "  FAIL  Test 5 — size=$LEN bytes(預期 < 3800)"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 5"
fi
teardown_proj

# ── Test 6: 未明示 opt-in → 不讀、不 inject、不寫 cursor ──
echo "Test 6: telemetry defaults to byte-for-byte read-only"
setup_proj
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{"ts":"%s","warnings":"\\n  • Must stay unread"}\n' "$NOW" \
  > "$STATE_DIR/self-audit-warnings.jsonl"
unset GOVERNANCE_TELEMETRY_OPT_IN
BEFORE=$(shasum -a 256 "$STATE_DIR/self-audit-warnings.jsonl" | awk '{print $1}')
run_hook
AFTER=$(shasum -a 256 "$STATE_DIR/self-audit-warnings.jsonl" | awk '{print $1}')
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ] && [ "$BEFORE" = "$AFTER" ] \
  && [ ! -e "$STATE_DIR/last-inject-ts.txt" ]; then
  echo "  PASS  Test 6 no opt-in left runtime bytes unchanged"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 6 default path read or wrote telemetry"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 6"
fi
teardown_proj

# ── Test 7: Git runtime 外部 state redirect → fail closed ──
echo "Test 7: outside state redirect is rejected"
setup_proj
OUTSIDE_STATE="$TMP_PROJ/outside-state"
mkdir -p "$OUTSIDE_STATE"
printf '{"ts":"2026-07-21T00:00:00Z","warnings":"outside"}\n' \
  > "$OUTSIDE_STATE/self-audit-warnings.jsonl"
export GOVERNANCE_STATE_DIR="$OUTSIDE_STATE"
run_hook
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ] \
  && [ ! -e "$OUTSIDE_STATE/last-inject-ts.txt" ]; then
  echo "  PASS  Test 7 outside state remained untouched"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 7 outside state was accepted"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 7"
fi
teardown_proj

# ── Test 8: runtime root 內 nested symlink → 即使 target 在 project 內也拒絕 ──
echo "Test 8: nested runtime symlink is rejected"
setup_proj
SYMLINK_TARGET="$TMP_PROJ/symlink-target"
mkdir -p "$SYMLINK_TARGET"
ln -s "$SYMLINK_TARGET" "$STATE_DIR/poison-state"
printf '{"ts":"2026-07-21T00:00:00Z","warnings":"symlink"}\n' \
  > "$SYMLINK_TARGET/self-audit-warnings.jsonl"
export GOVERNANCE_STATE_DIR="$STATE_DIR/poison-state"
run_hook
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ] \
  && [ ! -e "$SYMLINK_TARGET/last-inject-ts.txt" ]; then
  echo "  PASS  Test 8 symlink target remained untouched"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 8 symlink state was accepted"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 8"
fi
teardown_proj

# ── Test 9: >256 KiB last-user replay + byte-zero acknowledge → silent ──
echo "Test 9: large last-user acknowledge remains silent"
setup_proj
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{"ts":"%s","warnings":"\\n  • Must be suppressed by acknowledge"}\n' "$NOW" \
  > "$STATE_DIR/self-audit-warnings.jsonl"
{
  printf '%s' '收到 '
  awk 'BEGIN {
    for (i = 0; i < 12000; i++) {
      printf "large-ack-filler-%05d-abcdefghijklmnopqrstuvwxyz0123456789", i
    }
  }'
  printf '\n'
} >"$TMP_PROJ/large-last-user.txt"
if [ "$(wc -c <"$TMP_PROJ/large-last-user.txt" | tr -d ' ')" -le 262144 ]; then
  echo "  FAIL  Test 9 fixture is not larger than 256 KiB"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 9 fixture"
else
  jq -Rsc '{type:"user",message:{role:"user",content:.}}' \
    <"$TMP_PROJ/large-last-user.txt" >"$TMP_PROJ/large-transcript.jsonl"
  jq -n --arg tp "$TMP_PROJ/large-transcript.jsonl" \
    '{hook_event_name:"UserPromptSubmit",transcript_path:$tp}' \
    >"$TMP_PROJ/large-payload.json"
  set +e
  bash "$HOOK" <"$TMP_PROJ/large-payload.json" \
    >"$TMP_PROJ/large.stdout" 2>"$TMP_PROJ/large.stderr"
  EXIT=$?
  set -e
  if [ "$EXIT" = "0" ] \
    && [ ! -s "$TMP_PROJ/large.stdout" ] \
    && [ ! -s "$TMP_PROJ/large.stderr" ]; then
    echo "  PASS  Test 9"; PASS=$((PASS+1))
  else
    echo "  FAIL  Test 9 (exit=$EXIT, expected empty stdout/stderr)"
    FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 9"
  fi
fi
teardown_proj

# ── Summary ──
echo ""
echo "── Summary ──"
echo "PASS: $PASS / $(($PASS+$FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: $FAIL"
  printf "$FAILED\n"
  exit 1
fi
echo "✅ All passed"
exit 0

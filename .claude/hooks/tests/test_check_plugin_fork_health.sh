#!/bin/bash
# test_check_plugin_fork_health.sh — 聚合測試(2026-06-11 prune merge 同名 coverage)
# check_plugin_fork_health.sh 為 multi-rule 合併檔;各規則的完整 positive/negative 案例在下列既有
# per-rule 測試(已 repoint 至合併檔)。本檔 = name-matched coverage gate 入口,零重複。
set -uo pipefail
DIR="$(dirname "$0")"
REPO_ROOT="$(git -C "$DIR" rev-parse --show-toplevel)"
fail=0
bash "$DIR/test_check_fork_user_plugin_install.sh" < /dev/null || { echo "SUB-FAIL: test_check_fork_user_plugin_install.sh"; fail=1; }

FAULT_DIR=$(mktemp -d)
trap 'rm -rf -- "$FAULT_DIR"' EXIT
mkdir -p "$FAULT_DIR/lib"
cp "$DIR/../lib/_provider_paths.sh" "$FAULT_DIR/lib/_provider_paths.sh"
awk '
  { print }
  $0 == "r1_plugin_install() {" { print "return 1" }
' "$DIR/../check_plugin_fork_health.sh" >"$FAULT_DIR/check_plugin_fork_health.sh"
set +e
printf '%s' '{"hook_event_name":"SessionStart"}' \
  | GOVERNANCE_CORPUS_ROOT="$REPO_ROOT" \
    GOVERNANCE_PROJECT_DIR="$REPO_ROOT" \
    GOVERNANCE_PROVIDER=codex \
    bash "$FAULT_DIR/check_plugin_fork_health.sh" \
      >"$FAULT_DIR/stdout" 2>"$FAULT_DIR/stderr"
rc=$?
set -e
if [ "$rc" -eq 70 ] \
  && [ ! -s "$FAULT_DIR/stdout" ] \
  && grep -qF 'GOVERNANCE_INTEGRITY:' "$FAULT_DIR/stderr" \
  && grep -qF 'exit code 1' "$FAULT_DIR/stderr"; then
  echo "PASS: unexpected plugin/fork child exit 1 uses integrity rc70"
else
  echo "SUB-FAIL: unexpected plugin/fork child exit 1 was not failed closed (exit $rc)"
  fail=1
fi

awk '
  { print }
  $0 == "r1_plugin_install() {" {
    print "printf '\''synthetic plugin policy blocker\\n'\'' >&2"
    print "return 2"
  }
' "$DIR/../check_plugin_fork_health.sh" >"$FAULT_DIR/check_plugin_policy.sh"
set +e
printf '%s' '{"hook_event_name":"SessionStart"}' \
  | GOVERNANCE_CORPUS_ROOT="$REPO_ROOT" \
    GOVERNANCE_PROJECT_DIR="$REPO_ROOT" \
    GOVERNANCE_PROVIDER=codex \
    bash "$FAULT_DIR/check_plugin_policy.sh" \
      >"$FAULT_DIR/policy.stdout" 2>"$FAULT_DIR/policy.stderr"
rc=$?
set -e
if [ "$rc" -eq 2 ] && [ ! -s "$FAULT_DIR/policy.stdout" ] \
  && grep -qF 'synthetic plugin policy blocker' "$FAULT_DIR/policy.stderr" \
  && ! grep -qF 'GOVERNANCE_INTEGRITY:' "$FAULT_DIR/policy.stderr"; then
  echo "PASS: genuine plugin/fork child policy denial remains stderr-only rc2"
else
  echo "SUB-FAIL: plugin/fork child policy contract changed (exit $rc)"
  fail=1
fi
exit $fail

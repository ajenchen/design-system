#!/bin/bash
# test_check_propose_discipline.sh — 聚合測試(2026-06-11 prune merge 同名 coverage)
# check_propose_discipline.sh 為 multi-rule 合併檔;各規則的完整 positive/negative 案例在下列既有
# per-rule 測試(已 repoint 至合併檔)。本檔 = name-matched coverage gate 入口,零重複。
set -uo pipefail
DIR="$(dirname "$0")"
fail=0
bash "$DIR/test_check_propose_plain_chinese.sh" < /dev/null || { echo "SUB-FAIL: test_check_propose_plain_chinese.sh"; fail=1; }
bash "$DIR/test_check_propose_cite_required.sh" < /dev/null || { echo "SUB-FAIL: test_check_propose_cite_required.sh"; fail=1; }

FAULT_DIR=$(mktemp -d)
trap 'rm -rf -- "$FAULT_DIR"' EXIT
awk '
  { print }
  $0 == "r1_plain_chinese() {" { print "return 1" }
' "$DIR/../check_propose_discipline.sh" >"$FAULT_DIR/check_propose_discipline.sh"
set +e
printf '%s' '{}' | bash "$FAULT_DIR/check_propose_discipline.sh" \
  >"$FAULT_DIR/stdout" 2>"$FAULT_DIR/stderr"
rc=$?
set -e
if [ "$rc" -eq 70 ] \
  && [ ! -s "$FAULT_DIR/stdout" ] \
  && grep -qF 'GOVERNANCE_INTEGRITY:' "$FAULT_DIR/stderr" \
  && grep -qF 'exit code 1' "$FAULT_DIR/stderr"; then
  echo "PASS: unexpected propose child exit 1 uses integrity rc70"
else
  echo "SUB-FAIL: unexpected propose child exit 1 was not failed closed (exit $rc)"
  fail=1
fi

set +e
printf '%s' '{"hook_event_name":"Stop","last_assistant_message":"這是規定，沒有引用。"}' \
  | bash "$DIR/../check_propose_discipline.sh" \
      >"$FAULT_DIR/policy.stdout" 2>"$FAULT_DIR/policy.stderr"
rc=$?
set -e
if [ "$rc" -eq 2 ] && [ ! -s "$FAULT_DIR/policy.stdout" ] \
  && grep -qF 'PROPOSE-WITHOUT-CITE BLOCKER' "$FAULT_DIR/policy.stderr" \
  && ! grep -qF 'GOVERNANCE_INTEGRITY:' "$FAULT_DIR/policy.stderr"; then
  echo "PASS: real propose policy blocker remains stderr-only rc2"
else
  echo "SUB-FAIL: real propose policy blocker contract changed (exit $rc)"
  fail=1
fi

# A native provider reply can be much larger than a pipe buffer. Put both the
# claim and its valid cite at the first byte so any producer→grep -q regression
# deterministically surfaces as raw stderr / rc70 under the strict aggregator.
{
  printf '這是規定，packages/design-system/src/demo.spec.md:42\n'
  awk 'BEGIN { for (i = 0; i < 300000; i++) printf "x" }'
} | jq -Rs '{hook_event_name:"Stop",last_assistant_message:.}' \
  >"$FAULT_DIR/large-native-input.json"
set +e
bash "$DIR/../check_propose_discipline.sh" \
  <"$FAULT_DIR/large-native-input.json" \
  >"$FAULT_DIR/large-native.stdout" 2>"$FAULT_DIR/large-native.stderr"
rc=$?
set -e
if [ "$rc" -eq 0 ] \
  && [ ! -s "$FAULT_DIR/large-native.stdout" ] \
  && [ ! -s "$FAULT_DIR/large-native.stderr" ]; then
  echo "PASS: >256KiB early-match native reply remains clean"
else
  echo "SUB-FAIL: >256KiB early-match native reply changed contract (exit $rc)"
  fail=1
fi

# 規則分派 SIGPIPE 同族回歸(69230cef,2026-09-25;寫法照抄 test_check_plugin_fork_health.sh):
# 上一格只看 exit 與輸出,證明不了 r2 有跑。把 r2 注入成「不讀 stdin、留標記、exit 0」,用同一份 >256 KiB 輸入跑:
# 不讀 stdin 就退出不得被判成 rc70(舊寫法 `printf | rule` 會 SIGPIPE → 141),而且標記必須存在(r2 真的被派工到)。
_R2_MARKER="$FAULT_DIR/r2-reached"
awk '
  { print }
  $0 == "r2_cite_required() {" { print ": >\"$R2_MARKER\"; exit 0" }
' "$DIR/../check_propose_discipline.sh" >"$FAULT_DIR/check_propose_bigstdin.sh"
set +e
R2_MARKER="$_R2_MARKER" bash "$FAULT_DIR/check_propose_bigstdin.sh" \
  <"$FAULT_DIR/large-native-input.json" \
  >"$FAULT_DIR/big.stdout" 2>"$FAULT_DIR/big.stderr"
rc=$?
set -e
if [ "$rc" -eq 0 ] && [ ! -s "$FAULT_DIR/big.stdout" ] && [ ! -s "$FAULT_DIR/big.stderr" ] && [ -f "$_R2_MARKER" ]; then
  echo "PASS: >256KiB input + r2 exit without reading stdin → rc0 and r2 was reached"
else
  echo "SUB-FAIL: large stdin + non-reading r2 → exit $rc, r2 reached=$([ -f "$_R2_MARKER" ] && echo yes || echo no) ($(head -c 200 "$FAULT_DIR/big.stderr"))"
  fail=1
fi
exit $fail

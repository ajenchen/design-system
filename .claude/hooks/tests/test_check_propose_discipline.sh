#!/bin/bash
# test_check_propose_discipline.sh — 聚合測試(2026-06-11 prune merge 同名 coverage)
# check_propose_discipline.sh 為 multi-rule 合併檔;各規則的完整 positive/negative 案例在下列既有
# per-rule 測試(已 repoint 至合併檔)。本檔 = name-matched coverage gate 入口,零重複。
set -uo pipefail
DIR="$(dirname "$0")"
fail=0
bash "$DIR/test_check_propose_plain_chinese.sh" < /dev/null || { echo "SUB-FAIL: test_check_propose_plain_chinese.sh"; fail=1; }
bash "$DIR/test_check_propose_cite_required.sh" < /dev/null || { echo "SUB-FAIL: test_check_propose_cite_required.sh"; fail=1; }
exit $fail

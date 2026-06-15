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
exit $fail

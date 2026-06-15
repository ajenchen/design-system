#!/bin/bash
# test_check_plugin_fork_health.sh — 聚合測試(2026-06-11 prune merge 同名 coverage)
# check_plugin_fork_health.sh 為 multi-rule 合併檔;各規則的完整 positive/negative 案例在下列既有
# per-rule 測試(已 repoint 至合併檔)。本檔 = name-matched coverage gate 入口,零重複。
set -uo pipefail
DIR="$(dirname "$0")"
fail=0
bash "$DIR/test_check_fork_user_plugin_install.sh" < /dev/null || { echo "SUB-FAIL: test_check_fork_user_plugin_install.sh"; fail=1; }
exit $fail

#!/bin/bash
# test_check_storybook_addon_packaging.sh — 聚合測試(2026-06-11 prune merge 同名 coverage)
# check_storybook_addon_packaging.sh 為 multi-rule 合併檔;各規則的完整 positive/negative 案例在下列既有
# per-rule 測試(已 repoint 至合併檔)。本檔 = name-matched coverage gate 入口,零重複。
set -uo pipefail
DIR="$(dirname "$0")"
fail=0
bash "$DIR/test_check_addon_subdir_ship.sh" < /dev/null || { echo "SUB-FAIL: test_check_addon_subdir_ship.sh"; fail=1; }
bash "$DIR/test_check_storybook_addon_preset_cjs.sh" < /dev/null || { echo "SUB-FAIL: test_check_storybook_addon_preset_cjs.sh"; fail=1; }

FAULT_DIR=$(mktemp -d)
trap 'rm -rf -- "$FAULT_DIR"' EXIT
awk '
  { print }
  $0 == "r1_addon_subdir_ship() {" { print "return 1" }
' "$DIR/../check_storybook_addon_packaging.sh" >"$FAULT_DIR/check_storybook_addon_packaging.sh"
set +e
printf '%s' '{}' | bash "$FAULT_DIR/check_storybook_addon_packaging.sh" \
  >"$FAULT_DIR/stdout" 2>"$FAULT_DIR/stderr"
rc=$?
set -e
if [ "$rc" -eq 70 ] \
  && [ ! -s "$FAULT_DIR/stdout" ] \
  && grep -qF 'GOVERNANCE_INTEGRITY:' "$FAULT_DIR/stderr" \
  && grep -qF 'exit code 1' "$FAULT_DIR/stderr"; then
  echo "PASS: unexpected addon child exit 1 uses integrity rc70"
else
  echo "SUB-FAIL: unexpected addon child exit 1 was not failed closed (exit $rc)"
  fail=1
fi

set +e
printf '%s' '{"tool_name":"Write","tool_input":{"file_path":"/tmp/.storybook/addons/demo/preset.ts","content":"const x = require.resolve(\"demo\")"}}' \
  | bash "$DIR/../check_storybook_addon_packaging.sh" \
      >"$FAULT_DIR/policy.stdout" 2>"$FAULT_DIR/policy.stderr"
rc=$?
set -e
if [ "$rc" -eq 2 ] && [ ! -s "$FAULT_DIR/policy.stdout" ] \
  && grep -qF 'STORYBOOK ADDON PRESET CJS BLOCKER' "$FAULT_DIR/policy.stderr" \
  && ! grep -qF 'GOVERNANCE_INTEGRITY:' "$FAULT_DIR/policy.stderr"; then
  echo "PASS: real addon policy blocker remains stderr-only rc2"
else
  echo "SUB-FAIL: real addon policy blocker contract changed (exit $rc)"
  fail=1
fi

{
  printf '// @preset-cjs-skip: reviewed large fixture\n'
  awk 'BEGIN { for (i = 0; i < 300000; i++) printf "x" }'
} | jq -Rs --arg file '/tmp/.storybook/addons/demo/preset.ts' \
  '{tool_name:"Write",tool_input:{file_path:$file,content:.}}' \
  >"$FAULT_DIR/large-allow-input.json"
set +e
bash "$DIR/../check_storybook_addon_packaging.sh" \
  <"$FAULT_DIR/large-allow-input.json" \
  >"$FAULT_DIR/large-allow.stdout" 2>"$FAULT_DIR/large-allow.stderr"
rc=$?
set -e
if [ "$rc" -eq 0 ] \
  && [ ! -s "$FAULT_DIR/large-allow.stdout" ] \
  && [ ! -s "$FAULT_DIR/large-allow.stderr" ]; then
  echo "PASS: >256KiB early escape remains clean"
else
  echo "SUB-FAIL: >256KiB early escape changed contract (exit $rc)"
  fail=1
fi

{
  printf 'const x = require.resolve("demo")\n'
  awk 'BEGIN { for (i = 0; i < 300000; i++) printf "x" }'
} | jq -Rs --arg file '/tmp/.storybook/addons/demo/preset.ts' \
  '{tool_name:"Write",tool_input:{file_path:$file,content:.}}' \
  >"$FAULT_DIR/large-block-input.json"
set +e
bash "$DIR/../check_storybook_addon_packaging.sh" \
  <"$FAULT_DIR/large-block-input.json" \
  >"$FAULT_DIR/large-block.stdout" 2>"$FAULT_DIR/large-block.stderr"
rc=$?
set -e
if [ "$rc" -eq 2 ] \
  && [ ! -s "$FAULT_DIR/large-block.stdout" ] \
  && grep -qF 'STORYBOOK ADDON PRESET CJS BLOCKER' "$FAULT_DIR/large-block.stderr" \
  && ! grep -qF 'GOVERNANCE_INTEGRITY:' "$FAULT_DIR/large-block.stderr"; then
  echo "PASS: >256KiB early policy match remains stderr-only rc2"
else
  echo "SUB-FAIL: >256KiB early policy match changed contract (exit $rc)"
  fail=1
fi

# 規則分派 SIGPIPE 同族回歸(69230cef,2026-09-25;寫法照抄 test_check_plugin_fork_health.sh):
# 上兩格只看 exit 與輸出,證明不了 r2 有跑。把 r2 注入成「不讀 stdin、留標記、exit 0」,用 >256 KiB 的 allow 輸入跑:
# 不讀 stdin 就退出不得被判成 rc70(舊寫法 `printf | rule` 會 SIGPIPE → 141),而且標記必須存在(r2 真的被派工到)。
_R2_MARKER="$FAULT_DIR/r2-reached"
awk '
  { print }
  $0 == "r2_preset_cjs() {" { print ": >\"$R2_MARKER\"; exit 0" }
' "$DIR/../check_storybook_addon_packaging.sh" >"$FAULT_DIR/check_addon_bigstdin.sh"
set +e
R2_MARKER="$_R2_MARKER" bash "$FAULT_DIR/check_addon_bigstdin.sh" \
  <"$FAULT_DIR/large-allow-input.json" \
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

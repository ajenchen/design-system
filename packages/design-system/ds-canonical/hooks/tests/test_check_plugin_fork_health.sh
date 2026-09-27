#!/bin/bash
# test_check_plugin_fork_health.sh — 聚合測試(2026-06-11 prune merge 同名 coverage)
# check_plugin_fork_health.sh 為 multi-rule 合併檔;各規則的完整 positive/negative 案例在下列既有
# per-rule 測試(已 repoint 至合併檔)。本檔 = name-matched coverage gate 入口,零重複。
set -uo pipefail
DIR="$(dirname "$0")"
REPO_ROOT="$(git -C "$DIR" rev-parse --show-toplevel)"
fail=0
bash "$DIR/test_check_fork_user_plugin_install.sh" < /dev/null || { echo "SUB-FAIL: test_check_fork_user_plugin_install.sh"; fail=1; }

# 明指 TMPDIR 並驗非空:macOS 的裸 `mktemp -d` 不看 TMPDIR,沙箱內會失敗回空字串,之後所有路徑都變成
# 寫到根目錄(失敗記憶索引「mktemp -d 失敗回空」)。
FAULT_DIR=$(mktemp -d "${TMPDIR:-/tmp}/test-plugin-fork-health.XXXXXX") && [ -n "$FAULT_DIR" ] && [ -d "$FAULT_DIR" ] \
  || { echo "SUB-FAIL: mktemp -d failed — cannot build fixtures"; exit 1; }
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

# Regression for the aggregate hook runner: the Claude-only marketplace compatibility probe is
# intentionally non-authoritative. Transport failure, timeout, empty response, and malformed JSON
# must all be silent rc0 skips even when the caller exports aggregate-runner state.
TRANSPORT_DIR="$FAULT_DIR/transport"
mkdir -p \
  "$TRANSPORT_DIR/bin" \
  "$TRANSPORT_DIR/project/.claude-plugin" \
  "$TRANSPORT_DIR/project/governance/bin" \
  "$TRANSPORT_DIR/project/node_modules/@qijenchen/design-system/ds-canonical/fork" \
  "$TRANSPORT_DIR/home"
printf '%s\n' '{"dependencies":{"@qijenchen/design-system":"1.2.3"},"scripts":{"setup:all":"node scripts/setup-workspace.mjs"}}' \
  >"$TRANSPORT_DIR/project/package.json"
printf '%s\n' '{"version":"1.2.3"}' >"$TRANSPORT_DIR/project/.claude-plugin/plugin.json"
: >"$TRANSPORT_DIR/project/governance/bin/fork-governance-dispatcher.sh"
printf '%s\n' '{}' >"$TRANSPORT_DIR/project/node_modules/@qijenchen/design-system/ds-canonical/fork/manifest.json"
cat >"$TRANSPORT_DIR/bin/curl" <<'EOF'
#!/bin/sh
case "$CURL_FIXTURE_MODE" in
  failure) exit 7 ;;
  timeout) exit 28 ;;
  empty) exit 0 ;;
  malformed) printf '%s' '{"metadata":' ;;
  mismatch) printf '%s' '{"metadata":{"version":"9.9.9"}}' ;;
  *) exit 99 ;;
esac
EOF
chmod +x "$TRANSPORT_DIR/bin/curl"

for _mode in failure timeout empty malformed; do
  _stderr="$TRANSPORT_DIR/$_mode.stderr"
  if _stdout=$(printf '%s' '{"hook_event_name":"SessionStart"}' \
    | HOME="$TRANSPORT_DIR/home" \
      PATH="$TRANSPORT_DIR/bin:$PATH" \
      CURL_FIXTURE_MODE="$_mode" \
      GOVERNANCE_PROJECT_DIR="$TRANSPORT_DIR/project" \
      GOVERNANCE_PROVIDER=claude \
      bash "$DIR/../check_plugin_fork_health.sh" 2>"$_stderr"); then
    _rc=0
  else
    _rc=$?
  fi
  if [ "$_rc" -eq 0 ] && [ -z "$_stdout" ] && [ ! -s "$_stderr" ]; then
    echo "PASS: marketplace $_mode is a silent aggregate-safe rc0 skip"
  else
    echo "SUB-FAIL: marketplace $_mode escaped the compatibility skip contract (exit $_rc)"
    fail=1
  fi
done

_stderr="$TRANSPORT_DIR/mismatch.stderr"
if _stdout=$(printf '%s' '{"hook_event_name":"SessionStart"}' \
  | HOME="$TRANSPORT_DIR/home" \
    PATH="$TRANSPORT_DIR/bin:$PATH" \
    CURL_FIXTURE_MODE=mismatch \
    GOVERNANCE_PROJECT_DIR="$TRANSPORT_DIR/project" \
    GOVERNANCE_PROVIDER=claude \
    bash "$DIR/../check_plugin_fork_health.sh" 2>"$_stderr"); then
  _rc=0
else
  _rc=$?
fi
if [ "$_rc" -eq 0 ] && [ ! -s "$_stderr" ] \
  && printf '%s' "$_stdout" | grep -qF 'Legacy Claude plugin compatibility version differs' \
  && printf '%s' "$_stdout" | grep -qF 'npm run setup:all'; then
  echo "PASS: a genuine version mismatch still emits the non-authoritative compatibility notice"
else
  echo "SUB-FAIL: genuine marketplace mismatch no longer emits its compatibility notice (exit $_rc)"
  fail=1
fi

# 回歸(2026-09-25,CI Linux 21ca94e2 偶發紅):規則沒讀 stdin 就退出時,不得被判成「未定義 exit code」。
# 舊寫法 `printf "$INPUT" | rule` 在 pipefail 下,寫端收到 SIGPIPE → 管線回 141 → 誤判 rc70。
# 用超過管線緩衝區(64KiB)的輸入讓它**必定**發生,不靠時序。r2 被注入成「不讀 stdin、留下標記、exit 0」,
# 而且要斷言標記存在 —— 只看 exit 0 會被「r1 的 exit 把整支 hook 提早結束、r2 根本沒跑」騙過
# (本修法第一版拿掉管線卻沒補子殼層,正是這樣假綠)。
_BIG_INPUT="$FAULT_DIR/big-input.json"
{ printf '%s' '{"hook_event_name":"SessionStart","padding":"'; head -c 300000 /dev/zero | tr '\0' 'x'; printf '%s' '"}'; } >"$_BIG_INPUT"
_R2_MARKER="$FAULT_DIR/r2-reached"
awk '
  { print }
  $0 == "r2_plugin_freshness() {" { print ": >\"$R2_MARKER\"; exit 0" }
' "$DIR/../check_plugin_fork_health.sh" >"$FAULT_DIR/check_plugin_bigstdin.sh"
set +e
R2_MARKER="$_R2_MARKER" \
  GOVERNANCE_CORPUS_ROOT="$REPO_ROOT" \
  GOVERNANCE_PROJECT_DIR="$REPO_ROOT" \
  GOVERNANCE_PROVIDER=codex \
  bash "$FAULT_DIR/check_plugin_bigstdin.sh" <"$_BIG_INPUT" \
    >"$FAULT_DIR/big.stdout" 2>"$FAULT_DIR/big.stderr"
rc=$?
set -e
if [ "$rc" -eq 0 ] && [ ! -s "$FAULT_DIR/big.stderr" ] && [ -f "$_R2_MARKER" ]; then
  echo "PASS: a rule that exits without reading a large stdin is not misread as an undefined exit code"
else
  echo "SUB-FAIL: large stdin + rule that does not read it → exit $rc, r2 reached=$([ -f "$_R2_MARKER" ] && echo yes || echo no) ($(head -c 200 "$FAULT_DIR/big.stderr"))"
  fail=1
fi
exit $fail

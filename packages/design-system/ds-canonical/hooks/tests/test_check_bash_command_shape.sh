#!/bin/bash
# Tests for check_bash_command_shape.sh(PreToolUse Bash;PROC-H 2026-11-21)
#
#   1. 判定表(唯一一份 tests/fixtures/deny-norm/cases.json)經 _deny_norm.py selftest --via both 全綠
#   2. 對照組:判定表改壞一格 → selftest 紅(結束碼 1);deny 清單跟判定表的 denySha256 對不上 → 儀器失效(2)
#   3. hook 介面:換寫法的丟改動指令 → exit 2 且點名規則;開分支 / 切分支 / 唯讀 → 放行
#   4. deny 檔讀不到 → 放行但經 context 通道告訴模型「這次沒比對」(不能靜默)
#   5. emulate sh 提示:有 $ / * / =開頭的字且第一行不是 emulate sh → 提示;反之安靜
#   6. 不是 Bash → 安靜

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_bash_command_shape.sh"
DENY_NORM="$SCRIPT_DIR/../lib/_deny_norm.py"
TABLE="$SCRIPT_DIR/fixtures/deny-norm/cases.json"
DENY_FILE="$SCRIPT_DIR/../../adapters/claude-settings-base.json"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }

TMP_ROOT=$(mktemp -d)
[ -n "${TMP_ROOT:-}" ] && [ -d "$TMP_ROOT" ] || { echo "❌ mktemp -d failed(TMP_ROOT;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
trap 'rm -rf "$TMP_ROOT"' EXIT

PASS=0; FAIL=0; FAILED=""
ok() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
bad() { FAIL=$((FAIL + 1)); FAILED="$FAILED\n  - $1"; echo "  ❌ $1"; }

run_hook() {
  local cmd="$1" corpus="${2:-}"
  local payload
  payload=$(jq -nc --arg c "$cmd" '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$c}}')
  set +e
  if [ -n "$corpus" ]; then
    OUT=$(printf '%s' "$payload" | GOVERNANCE_CORPUS_ROOT="$corpus" bash "$HOOK" 2>"$TMP_ROOT/err")
  else
    OUT=$(printf '%s' "$payload" | env -u GOVERNANCE_CORPUS_ROOT bash "$HOOK" 2>"$TMP_ROOT/err")
  fi
  RC=$?
  ERR=$(cat "$TMP_ROOT/err")
}

echo "Test 1: 判定表 selftest(lib + hook 兩個介面)"
SELF=$(python3 -I "$DENY_NORM" selftest --cases "$TABLE" --deny-file "$DENY_FILE" --via both 2>&1); SRC=$?
if [ "$SRC" = 0 ] && grep -q 'DENY-NORM SELFTEST OK' <<<"$SELF"; then ok "selftest OK:$(tail -1 <<<"$SELF")"; else bad "selftest rc=$SRC:$SELF"; fi

echo "Test 2: 對照組(會紅才算數)"
python3 -I - "$TABLE" "$TMP_ROOT/broken.json" <<'PY'
import json, sys
t = json.load(open(sys.argv[1], encoding='utf-8'))
for c in t['cases']:
    if c['id'] == 'P02':
        c['norm'] = ['Bash(git checkout *-- *)']   # 開分支故意寫成「該擋」
json.dump(t, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
PY
python3 -I "$DENY_NORM" selftest --cases "$TMP_ROOT/broken.json" --deny-file "$DENY_FILE" --via lib >/dev/null 2>&1; BRC=$?
if [ "$BRC" = 1 ]; then ok "改壞一格 → selftest 紅(1)"; else bad "改壞一格卻回 $BRC"; fi
python3 -I - "$DENY_FILE" "$TMP_ROOT/deny-old.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
d['permissions']['deny'].append('Bash(git checkout *)')   # 回到整條擋的舊清單
json.dump(d, open(sys.argv[2], 'w', encoding='utf-8'))
PY
python3 -I "$DENY_NORM" selftest --cases "$TABLE" --deny-file "$TMP_ROOT/deny-old.json" --via lib >/dev/null 2>&1; DRC=$?
if [ "$DRC" = 2 ]; then ok "deny 清單與 denySha256 不符 → 儀器失效(2),不讀成通過"; else bad "deny 清單換了卻回 $DRC"; fi

echo "Test 3: hook 介面 —— 擋丟改動、放開分支"
for cmd in 'git -C /x/v checkout -- a.sh' \
           $'g() { git -C "$R" "$@"; }\ng checkout -q -- README.md' \
           'git -c alias.co=checkout co -- a.sh' \
           '$(command -v git) reset --hard' \
           "bash -c 'git restore --staged x'"; do
  run_hook "$cmd"
  if [ "$RC" = 2 ] && grep -q 'deny 照動作意思比對' <<<"$ERR" && grep -q '規則:Bash(' <<<"$ERR"; then
    ok "擋:$(head -1 <<<"$cmd")"
  else
    bad "應擋卻 rc=$RC:$cmd"
  fi
done
for cmd in 'git -C /x/w checkout -q -b feat/e7' 'cd /x/v && git checkout -q -B feat/x' 'git -C /x checkout main' \
           'git switch --create feat/y' 'git -C /x log --oneline -3'; do
  run_hook "$cmd"
  if [ "$RC" = 0 ] && ! grep -q 'deny' <<<"$OUT$ERR"; then ok "放行:$cmd"; else bad "應放行卻 rc=$RC out=$OUT err=$ERR:$cmd"; fi
done

echo "Test 4: deny 檔讀不到 → 放行但告訴模型"
mkdir -p "$TMP_ROOT/empty-corpus"
mkdir -p "$TMP_ROOT/hooks/lib"
cp "$HOOK" "$TMP_ROOT/hooks/check_bash_command_shape.sh"
cp "$DENY_NORM" "$TMP_ROOT/hooks/lib/_deny_norm.py"
HOOK_SAVED="$HOOK"; HOOK="$TMP_ROOT/hooks/check_bash_command_shape.sh"
run_hook 'git -C /x checkout -- a.sh' "$TMP_ROOT/empty-corpus"
HOOK="$HOOK_SAVED"
if [ "$RC" = 0 ] && jq -e '.governanceContext.hookEventName == "PreToolUse" and (.governanceContext.message | test("沒有跑成"))' <<<"$OUT" >/dev/null 2>&1; then
  ok "儀器失效 → exit 0 + context 通知"
else
  bad "儀器失效沒通知:rc=$RC out=$OUT"
fi

echo "Test 5: emulate sh 提示"
for cmd in 'ls $HOME' 'echo *.md' '[ a == b ] && echo x' $'cd /x\nls $HOME'; do
  run_hook "$cmd"
  if [ "$RC" = 0 ] && jq -e '.governanceContext.message | test("emulate sh")' <<<"$OUT" >/dev/null 2>&1; then ok "提示:$(head -1 <<<"$cmd")"; else bad "應提示卻沒有:rc=$RC out=$OUT:$cmd"; fi
done
for cmd in $'emulate sh\nls $HOME' 'emulate sh; echo *.md' 'ls -la /x' 'git -C /x status --short'; do
  run_hook "$cmd"
  if [ "$RC" = 0 ] && [ -z "$OUT" ]; then ok "安靜:$(head -1 <<<"$cmd")"; else bad "不該提示:rc=$RC out=$OUT:$cmd"; fi
done

echo "Test 6: 不是 Bash → 安靜"
set +e
OUT=$(printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"file_path":"/x/a.sh"}}' | bash "$HOOK" 2>/dev/null); RC=$?
if [ "$RC" = 0 ] && [ -z "$OUT" ]; then ok "Edit 不看"; else bad "Edit 卻 rc=$RC out=$OUT"; fi

echo ""
echo "PASS: $PASS  FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then printf "Failed:%b\n" "$FAILED"; exit 1; fi
exit 0

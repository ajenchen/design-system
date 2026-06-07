#!/bin/bash
# Tests for inject_deploy_url_after_push.sh
#
# 鎖住 2026-06-06 收斂的「只在真推送 + 真 branch 時 relay deploy URL」root invariant,
# 防 refspec / symbolic-ref / tag / 解析噪音 / 字串提及 等再吐 404 URL 進 context。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../inject_deploy_url_after_push.sh"
[ -f "$HOOK" ] || { echo "FATAL: hook not found"; exit 1; }

PASS=0; FAIL=0; FAILED=""

# 建一個臨時 git repo(branch=feature-test)+ netlify.toml,讓 Detection 2 可達;
# HOME 指向空 temp 確保無 USER_OVERRIDE(hermetic,不碰真實機 deploy-targets.json)。
setup() {
  TMP=$(mktemp -d)
  mkdir -p "$TMP/home"
  (
    cd "$TMP" || exit 1
    git init -q -b feature-test 2>/dev/null || { git init -q; git checkout -q -b feature-test; }
    : > netlify.toml
    git add -A 2>/dev/null
    GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t \
      git commit -q -m init 2>/dev/null
  )
}
teardown() { rm -rf "$TMP"; }

# run_hook <command> [event] [tool]
run_hook() {
  local cmd="$1" ev="${2:-PostToolUse}" tool="${3:-Bash}" json
  json=$(printf '{"hook_event_name":"%s","tool_name":"%s","tool_input":{"command":"%s"}}' "$ev" "$tool" "$cmd")
  STDOUT=$( cd "$TMP" && HOME="$TMP/home" CLAUDE_PROJECT_DIR="$TMP" bash "$HOOK" <<<"$json" 2>&1 )
  EXIT=$?
}

injected()      { echo "$STDOUT" | grep -q "Deploy URLs auto-detected"; }
head_leaked()   { echo "$STDOUT" | grep -qE 'HEAD(--|:|\))'; }
fn7() { echo "$STDOUT" | grep -q "feature-test" && ! head_leaked; }
fn8() { ! head_leaked; }
fn9() { echo "$STDOUT" | grep -q "feature-test"; }
has_feature() { echo "$STDOUT" | grep -q "feature-test"; }
no_quiet()    { ! echo "$STDOUT" | grep -q -- "--quiet"; }
fn10() { has_feature && no_quiet; }   # compound:fetch 段的 --quiet 不可被誤抓為 branch
fn11() { has_feature; }                # compound:pull 段的 main 不可被誤抓(否則 grep feature-test 失敗)
fn12() { has_feature; }                # bare push origin → fallback current branch
fn13() { has_feature; }                # flag-after-origin → 清空 → fallback current branch

check() {  # <name> <expect: skip|fire> [extra-assert-fn]
  local name="$1" expect="$2" extra="${3:-}"
  local ok=1
  if [ "$expect" = "skip" ]; then
    { [ "$EXIT" = "0" ] && ! injected; } || ok=0
  else # fire
    { [ "$EXIT" = "0" ] && injected; } || ok=0
  fi
  if [ -n "$extra" ] && ! "$extra"; then ok=0; fi
  if [ "$ok" = "1" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (exit=$EXIT, expect=$expect)"
    echo "         output=${STDOUT:0:240}"
    FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - $name"
  fi
}

setup

# 1. 非 PostToolUse event → skip
run_hook "git push origin feature-test" "UserPromptSubmit" "Bash"
check "1 non-PostToolUse event → skip" skip

# 2. 非 Bash tool → skip
run_hook "git push origin feature-test" "PostToolUse" "Edit"
check "2 non-Bash tool → skip" skip

# 3. tag push(v*)→ skip(原把 tag 名當 branch 推 404)
run_hook "git push origin v0.1.0-beta.56"
check "3 tag push → skip" skip

# 4. branch --delete(cleanup,非 deploy)→ skip
run_hook "git push origin --delete old-branch"
check "4 push --delete → skip" skip

# 5. 字串提及(賦值,非命令邊界)→ skip(command-boundary guard)
run_hook "P='git push origin'"
check "5 string-mention (assignment) → skip" skip

# 6. 解析噪音 / 非法 git ref 字元(~)→ skip(charset guard)
run_hook "git push origin foo~bar"
check "6 invalid-ref-charset branch → skip" skip

# 7. symbolic ref HEAD → fires + 解析成真 branch feature-test(非字面 HEAD)
run_hook "git push origin HEAD"
check "7 HEAD → fire + resolve to feature-test (no literal HEAD)" fire 'fn7'

# 8. refspec HEAD:main → 取 dst,不可洩漏字面 HEAD
run_hook "git push origin HEAD:main"
check "8 refspec HEAD:main → no HEAD leak" fire 'fn8'

# 9. positive control:真 branch push → fires(確保 skip 測試非因 hook 全壞而假過)
run_hook "git add -A && git push origin feature-test"
check "9 real branch push (positive control) → fire" fire 'fn9'

# 10. ROOT regression:compound 命令前段 `git fetch origin --quiet` 的 flag 不可被誤抓為 branch
#     (2026-06-07 anchor:merge 時 `git fetch origin --quiet && ... && git push origin main` 吐 `--quiet--site` 404)
run_hook "git fetch origin --quiet && git push origin feature-test"
check "10 compound w/ fetch flag → branch from push seg only (no --quiet leak)" fire 'fn10'

# 11. compound 前段 `git pull origin main` 的 main 不可被誤抓(branch 必來自 push 段)
run_hook "git pull origin main && git push origin feature-test"
check "11 compound w/ pull → branch from push seg (not pull's main)" fire 'fn11'

# 12. bare `git push origin`(無顯式 branch)→ fallback 當前 branch
run_hook "git push origin"
check "12 bare push origin → fallback current branch" fire 'fn12'

# 13. flag-after-origin `git push origin --force`(無顯式 branch)→ fallback 當前 branch
run_hook "git push origin --force"
check "13 flag-after-origin → fallback current branch (no flag-as-branch)" fire 'fn13'

teardown

echo ""
echo "── Summary ──"
echo "PASS: $PASS / $((PASS+FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: $FAIL"
  printf "$FAILED\n"
  exit 1
fi
echo "✅ All passed"
exit 0

#!/bin/bash
# Tests for inject_deploy_url_after_push.sh
#
# 鎖住 2026-06-06 收斂的「只在真推送 + 真 branch 時 relay deploy URL」root invariant,
# 防 refspec / symbolic-ref / tag / 解析噪音 / 字串提及 等再吐 404 URL 進 context。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../inject_deploy_url_after_push.sh"
[ -f "$HOOK" ] || { echo "FATAL: hook not found"; exit 1; }
PROJECT_ROOT=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)

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
  STDOUT=$( cd "$TMP" && HOME="$TMP/home" XDG_CONFIG_HOME="$TMP/home/.config" \
    GOVERNANCE_PROJECT_DIR="$TMP" GOVERNANCE_PROVIDER="${TEST_PROVIDER:-codex}" \
    GOVERNANCE_CORPUS_ROOT="${TEST_CORPUS:-$PROJECT_ROOT}" \
    GOVERNANCE_PROVIDER_REGISTRY="${TEST_REGISTRY:-packages/governance/canonical/providers.json}" \
    GOVERNANCE_READ_ONLY=1 bash "$HOOK" <<<"$json" 2>&1 )
  EXIT=$?
}

injected()      { echo "$STDOUT" | grep -q "Deploy URLs auto-detected"; }
head_leaked()   { echo "$STDOUT" | grep -qE 'HEAD(--|:|\))'; }
fn7() { echo "$STDOUT" | grep -q "feature-test" && ! head_leaked; }
fn8() { ! head_leaked; }
fn9() { echo "$STDOUT" | grep -q "feature-test"; }
has_feature()  { echo "$STDOUT" | grep -q "feature-test"; }
no_quiet()     { ! echo "$STDOUT" | grep -q -- "--quiet"; }
no_refsheads() { ! echo "$STDOUT" | grep -q "refs/heads"; }
# minimal git repo on branch $2 (+ optional netlify.toml if $3=netlify), at dir $1
mkrepo() {
  ( cd "$1" || exit 1
    git init -q -b "$2" 2>/dev/null || { git init -q; git checkout -q -b "$2"; }
    : > f; [ "${3:-}" = netlify ] && : > netlify.toml
    git add -A 2>/dev/null
    GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t git commit -q -m i 2>/dev/null )
}
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

# 14. cross-repo cd-parse:command `cd <other-repo> && git push` → hook 用 cd'd repo 作偵測根
#     (2026-06-07 anchor:syncing ds-product-template 時 hook 吐成 DS 站台 URL)。
#     TMP2 無 netlify.toml → 該 SKIP;若沒 cd-parse、誤用 $TMP〔有 netlify.toml〕→ 會 inject(=回歸)。
TMP2=$(mktemp -d)
(
  cd "$TMP2" || exit 1
  git init -q -b other-branch 2>/dev/null || { git init -q; git checkout -q -b other-branch; }
  : > somefile
  git add -A 2>/dev/null
  GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t git commit -q -m init 2>/dev/null
)
run_hook "cd $TMP2 && git push origin other-branch"
check "14 cross-repo cd-parse → uses cd'd repo (no deploy target there → skip, not \$TMP's URL)" skip
rm -rf "$TMP2"

# 15. flag-before-origin `--force-with-lease`(原 trigger 只認 -u → 漏 fire 真實 push)→ fire
run_hook "git push --force-with-lease origin feature-test"
check "15 flag-before-origin (--force-with-lease) → fire" fire 'has_feature'

# 16. env-prefix `GIT_SSH_COMMAND=… git push`(原被命令邊界擋掉)→ fire
run_hook "GIT_SSH_COMMAND=ssh git push origin feature-test"
check "16 env-prefixed git push → fire" fire 'has_feature'

# 17. --set-upstream(-u 的長形,原 trigger 漏)→ fire
run_hook "git push --set-upstream origin feature-test"
check "17 --set-upstream → fire" fire 'has_feature'

# 18. `git -C <other-repo> push` → 用 -C 的 repo 作偵測根(無 netlify → skip,不吐 \$TMP 的 URL)
TMP3=$(mktemp -d); mkrepo "$TMP3" ob
run_hook "git -C $TMP3 push origin ob"
check "18 git -C <repo> → uses that repo (no deploy target → skip)" skip
rm -rf "$TMP3"

# 19. detached HEAD `git push origin HEAD` → branch 解析空 → skip(不吐 https://--site malformed)
TMP4=$(mktemp -d); mkrepo "$TMP4" m netlify; ( cd "$TMP4" && git checkout -q --detach 2>/dev/null )
STDOUT=$( cd "$TMP4" && HOME="$TMP4/home" XDG_CONFIG_HOME="$TMP4/home/.config" GOVERNANCE_PROJECT_DIR="$TMP4" GOVERNANCE_PROVIDER=codex GOVERNANCE_READ_ONLY=1 bash "$HOOK" <<<'{"hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"git push origin HEAD"}}' 2>&1 ); EXIT=$?
if [ "$EXIT" = 0 ] && ! injected && ! echo "$STDOUT" | grep -qE -- '--site|\(\)'; then echo "  PASS  19 detached HEAD → skip (no malformed URL)"; PASS=$((PASS+1)); else echo "  FAIL  19 (exit=$EXIT out=${STDOUT:0:140})"; FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - 19"; fi
rm -rf "$TMP4"

# 20. cd-after-command `echo x && cd <other> && git push` → 用該 cd 的 repo(非 session/first)
TMP5=$(mktemp -d); mkrepo "$TMP5" ob
run_hook "echo hi && cd $TMP5 && git push origin ob"
check "20 cd-after-command → uses that cd's repo (no deploy → skip)" skip
rm -rf "$TMP5"

# 21. refspec full-ref `HEAD:refs/heads/main` → 取 main,不洩漏 refs/heads
run_hook "git push origin HEAD:refs/heads/main"
check "21 refspec refs/heads → no refs/heads leak" fire 'no_refsheads'

# 22. Poisoned Claude HOME must not affect Codex. Add a remote only for preference-key tests.
(cd "$TMP" && git remote add origin git@github.com:owner/repo.git)
mkdir -p "$TMP/home/.claude/local"
printf '{"owner/repo":"https://poison-claude-home.netlify.app"}\n' > "$TMP/home/.claude/local/deploy-targets.json"
TEST_PROVIDER=codex run_hook "git push origin feature-test"
if [ "$EXIT" = 0 ] && injected && ! echo "$STDOUT" | grep -q 'poison-claude-home' && echo "$STDOUT" | grep -q 'sitename 未知'; then
  echo "  PASS  22 Codex ignores poisoned ~/.claude deploy preference"; PASS=$((PASS+1))
else
  echo "  FAIL  22 Codex consumed Claude HOME (out=${STDOUT:0:180})"; FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - 22"
fi

# 23. Neutral XDG preference outranks provider-specific legacy compatibility input.
mkdir -p "$TMP/home/.config/qijenchen-governance"
printf '{"owner/repo":"https://neutral-site.netlify.app"}\n' > "$TMP/home/.config/qijenchen-governance/deploy-targets.json"
TEST_PROVIDER=codex run_hook "git push origin feature-test"
if [ "$EXIT" = 0 ] && injected && echo "$STDOUT" | grep -q 'neutral-site' && ! echo "$STDOUT" | grep -q 'poison-claude-home'; then
  echo "  PASS  23 neutral XDG deploy preference is provider-independent and preferred"; PASS=$((PASS+1))
else
  echo "  FAIL  23 neutral preference not used (out=${STDOUT:0:180})"; FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - 23"
fi

# 24. A future provider is registry data only and uses the same neutral preference layer.
mkdir -p "$TMP/future-corpus"
cat > "$TMP/future-corpus/providers.json" <<'EOF'
{"providers":[{"id":"orion","instructionEntry":"ORION.md"}]}
EOF
TEST_PROVIDER=orion TEST_CORPUS="$TMP/future-corpus" TEST_REGISTRY=providers.json \
  run_hook "git push origin feature-test"
if [ "$EXIT" = 0 ] && injected && echo "$STDOUT" | grep -q 'neutral-site' && ! echo "$STDOUT" | grep -q 'poison-claude-home'; then
  echo "  PASS  24 future provider uses registry + neutral deploy preference only"; PASS=$((PASS+1))
else
  echo "  FAIL  24 future provider deploy preferences (out=${STDOUT:0:180})"; FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - 24"
fi

# 25. A real push with an unregistered provider is an adapter/config integrity fault,not policy.
TEST_PROVIDER=absent TEST_CORPUS="$TMP/future-corpus" TEST_REGISTRY=providers.json \
  run_hook "git push origin feature-test"
if [ "$EXIT" = 70 ] && echo "$STDOUT" | grep -qF "GOVERNANCE_INTEGRITY:" && ! injected; then
  echo "  PASS  25 unregistered provider → integrity 70"; PASS=$((PASS+1))
else
  echo "  FAIL  25 expected provider integrity 70 (exit=$EXIT out=${STDOUT:0:180})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - 25"
fi

# 26. Content sniff must read a hallmark-first response larger than a pipe buffer without
# curl→grep -q early-close inversion. The fake HEAD request returns 200; the body starts with
# Storybook evidence and then exceeds 256 KiB.
(cd "$TMP" && git branch -m main)
mkdir -p "$TMP/fake-bin"
cat >"$TMP/fake-bin/curl" <<'EOF'
#!/bin/bash
case " $* " in
  *" -I "*) printf '200' ;;
  *)
    printf 'sb-manager\n'
    awk 'BEGIN { for (i = 0; i < 300000; i++) printf "x" }'
    ;;
esac
EOF
chmod +x "$TMP/fake-bin/curl"
OLD_PATH="$PATH"
PATH="$TMP/fake-bin:$PATH"
TEST_PROVIDER=codex
TEST_CORPUS="$PROJECT_ROOT"
TEST_REGISTRY=packages/governance/canonical/providers.json
run_hook "git push origin main"
PATH="$OLD_PATH"
if [ "$EXIT" = 0 ] \
  && injected \
  && echo "$STDOUT" | grep -qF 'verified 200 + Storybook content' \
  && ! echo "$STDOUT" | grep -qF '內容非 Storybook' \
  && ! echo "$STDOUT" | grep -qiE 'broken pipe|GOVERNANCE_INTEGRITY:'; then
  echo "  PASS  26 >256KiB hallmark-first deploy body remains Storybook-positive"; PASS=$((PASS+1))
else
  echo "  FAIL  26 large deploy body classification (exit=$EXIT out=${STDOUT:0:180})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - 26"
fi

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

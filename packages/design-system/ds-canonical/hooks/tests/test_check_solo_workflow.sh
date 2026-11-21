#!/bin/bash
# Contract tests for protected-main solo workflow(M28).

set -u

# This suite intentionally verifies isolated runtime-state writes. Do not inherit
# the read-only replay flag from the aggregate runner.
export GOVERNANCE_READ_ONLY=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_solo_workflow.sh"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)" || {
  echo "FATAL: canonical hook test is not inside a Git worktree"
  exit 1
}
REPO_ROOT="$(cd "$REPO_ROOT" && pwd -P)"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""
TMP_DIR=$(mktemp -d)
# A failed mktemp leaves TMP_DIR empty, and `cd "" && pwd -P` resolves to the CURRENT
# directory — which run-all.sh has already set to this test corpus. The EXIT trap below
# would then delete the corpus itself. Fail loudly before the value can be weaponized.
if [ -z "${TMP_DIR:-}" ] || [ ! -d "$TMP_DIR" ]; then
  echo "❌ mktemp -d failed(TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2
  exit 1
fi
TMP_DIR="$(cd "$TMP_DIR" && pwd -P)"
trap 'rm -rf "$TMP_DIR"' EXIT

export GOVERNANCE_PROJECT_DIR="$TMP_DIR"

git -C "$TMP_DIR" init -q
GIT_DIR="$(git -C "$TMP_DIR" rev-parse --absolute-git-dir)"
GIT_DIR="$(cd "$GIT_DIR" && pwd -P)"
export GOVERNANCE_STATE_DIR="$GIT_DIR/governance-runtime"
# 模擬 adapter 啟動的一般 session:scripts/run-provider-hook.mjs 一定設 GOVERNANCE_RUNTIME_ROOT,
# 遙測維持預設關。R1 是功能狀態,不能要開遙測才擋(WP-05;之前這裡強制 OPT_IN=1,
# 所以「預設不擋」從來沒被任何一格測到)。
export GOVERNANCE_RUNTIME_ROOT="$GIT_DIR/governance-runtime"
export GOVERNANCE_TELEMETRY_OPT_IN=0
TRACK_FILE="$GOVERNANCE_STATE_DIR/session-branch-track.jsonl"
BYPASS_LOG="$GOVERNANCE_STATE_DIR/solo-workflow-bypass.jsonl"
git -C "$TMP_DIR" config user.email governance-test@example.invalid
git -C "$TMP_DIR" config user.name governance-test
printf 'base\n' > "$TMP_DIR/fixture.txt"
git -C "$TMP_DIR" add fixture.txt
git -C "$TMP_DIR" commit -qm base

run_hook_bash() {
  local cmd="$1"; local session="${2:-sess-1}"
  local payload
  payload=$(jq -n --arg c "$cmd" --arg s "$session" '{tool_name:"Bash", session_id:$s, tool_input:{command:$c}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

# Same as run_hook_bash, plus per-call environment edits handed to env(1)
#(VAR=value to set, `-u VAR` to unset).
run_hook_bash_env() {
  local cmd="$1"; local session="$2"; shift 2
  local payload
  payload=$(jq -n --arg c "$cmd" --arg s "$session" '{tool_name:"Bash", session_id:$s, tool_input:{command:$c}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | env "$@" bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

# Every file under the fixture's runtime root, with content checksums — "nothing was written".
runtime_snapshot() {
  if [ -d "$GIT_DIR/governance-runtime" ]; then
    (cd "$GIT_DIR/governance-runtime" && find . \( -type f -o -type l \) -print | LC_ALL=C sort | while IFS= read -r f; do
      if [ -L "$f" ]; then printf 'L %s\n' "$f"; else printf 'F %s %s\n' "$f" "$(cksum < "$f")"; fi
    done)
  else
    echo "<no runtime root>"
  fi
}

expect_true() {
  local name="$1"; shift
  if "$@"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

track_has_session() { [ -f "$TRACK_FILE" ] && grep -qF "\"session_id\":\"$1\"" "$TRACK_FILE"; }

run_hook_mcp() {
  local tool="$1"
  local payload
  payload=$(jq -n --arg t "$tool" '{tool_name:$t, tool_input:{}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name(expected silent, exit=$EXIT)"
    echo "$STDERR_TEXT" | sed 's/^/    /'
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_block() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && [ -z "$STDOUT_TEXT" ] \
    && ! grep -qF 'GOVERNANCE_INTEGRITY:' <<<"$STDERR_TEXT" \
    && grep -qF "$needle" <<<"$STDERR_TEXT"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name(expected exit=2 + $needle, got $EXIT)"
    echo "$STDERR_TEXT" | sed 's/^/    /'
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_solo_workflow protected-main tests ==="

payload_other=$(jq -n '{tool_name:"Read", tool_input:{file_path:"/a"}}')
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
printf '%s' "$payload_other" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
EXIT=$?
set -e
STDOUT_TEXT=$(cat "$STDOUT")
STDERR_TEXT=$(cat "$STDERR")
rm -f "$STDOUT" "$STDERR"
expect_pass_silent "1. non-Bash tool skips"

run_hook_bash "ls -la"
expect_pass_silent "2. innocuous Bash passes"

rm -f "$TRACK_FILE"
run_hook_bash "git checkout -b claude/foo" "sess-A"
expect_pass_silent "3. first provider branch is recorded"
expect_true "3b. telemetry off: the record lands in the adapter's Git-owned runtime root" track_has_session "sess-A"

run_hook_bash "git switch -c codex/bar" "sess-A"
expect_block "4. second cross-provider branch is blocked(telemetry off, adapter env)" "R1 BLOCKER"

run_hook_bash "git checkout -b claude/foo" "sess-A"
expect_pass_silent "5. same branch recovery passes"

run_hook_bash "git switch -c codex/other" "sess-B"
expect_pass_silent "6. switch -c recognized for a new session"

run_hook_bash "gh pr create --title x --body y"
expect_pass_silent "7. PR creation is canonical"

run_hook_bash "gh api -X POST repos/foo/bar/pulls -f title=x"
expect_pass_silent "8. PR API creation is canonical"

run_hook_bash "git push origin main" "sess-C"
expect_block "9. direct main push blocked" "R2 BLOCKER"

run_hook_bash "git push origin HEAD:main" "sess-D"
expect_block "10. standing authorization cannot bypass protected main" "R2 BLOCKER"

run_hook_bash "gh pr merge 42 --squash" "sess-E"
expect_pass_silent "11. gh PR merge has no transcript approval gate"

run_hook_bash "gh api -X PUT repos/foo/bar/pulls/42/merge" "sess-E"
expect_pass_silent "12. API PR merge has no transcript approval gate"

run_hook_mcp "mcp__github__create_pull_request"
expect_pass_silent "13. MCP PR creation is canonical"

run_hook_mcp "mcp__github__merge_pull_request"
expect_pass_silent "14. MCP merge has no transcript approval gate"

run_hook_bash "git push origin v1.2.3"
expect_pass_silent "15. tag lifecycle is not blocked by retired local preflight R4"

run_hook_bash "echo 'git push origin v1.2.3'"
expect_pass_silent "16. quoted tag example remains inert"

payload_bypass=$(jq -n '{tool_name:"Bash", session_id:"sess-X", tool_input:{command:"git push origin main"}}')
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
printf '%s' "$payload_bypass" | GOVERNANCE_BYPASS_SOLO_WORKFLOW=1 bash "$HOOK" >"$STDOUT" 2>"$STDERR"
EXIT=$?
set -e
STDERR_TEXT=$(cat "$STDERR")
STDOUT_TEXT=$(cat "$STDOUT")
rm -f "$STDOUT" "$STDERR"
expect_pass_silent "17. audited recovery override passes local hook"
bypass_logged_x() { [ -f "$BYPASS_LOG" ] && grep -qF '"session":"sess-X"' "$BYPASS_LOG"; }
expect_true "17b. override is audit-logged with telemetry off" bypass_logged_x

run_hook_bash "GOVERNANCE_BYPASS_SOLO_WORKFLOW=1 git push origin main"
expect_block "18. command text cannot self-authorize recovery override" "R2 BLOCKER"

# ── WP-05:功能狀態的開關不是遙測,但唯讀與「沒有 adapter」照舊一個 byte 都不寫 ──

# 19. 開了遙測的人行為不變(同一個位置、同樣會擋)。
run_hook_bash_env "git checkout -b claude/opt" "sess-O" GOVERNANCE_TELEMETRY_OPT_IN=1
expect_pass_silent "19a. telemetry opt-in: first branch passes"
run_hook_bash_env "git switch -c claude/opt-2" "sess-O" GOVERNANCE_TELEMETRY_OPT_IN=1
expect_block "19b. telemetry opt-in: second branch still blocked" "R1 BLOCKER"

# 20. READ_ONLY=1(CI replay / hooks:test):不擋,而且 runtime root 裡一個檔都不變。
BEFORE=$(runtime_snapshot)
run_hook_bash_env "git checkout -b claude/ro" "sess-R" GOVERNANCE_READ_ONLY=1
expect_pass_silent "20a. read-only: first branch passes"
run_hook_bash_env "git switch -c claude/ro-2" "sess-R" GOVERNANCE_READ_ONLY=1
expect_pass_silent "20b. read-only: cannot record, so a second branch is not blocked"
run_hook_bash_env "git push origin main" "sess-R" GOVERNANCE_READ_ONLY=1 GOVERNANCE_BYPASS_SOLO_WORKFLOW=1
expect_pass_silent "20c. read-only: override still passes"
AFTER=$(runtime_snapshot)
same_snapshot() { [ "$BEFORE" = "$AFTER" ]; }
expect_true "20d. read-only wrote nothing(record, bypass log, telemetry)" same_snapshot

# 21. 直接跑 hook、沒有 adapter 給的 runtime root:照舊唯讀。
BEFORE=$(runtime_snapshot)
run_hook_bash_env "git checkout -b claude/direct" "sess-D" -u GOVERNANCE_RUNTIME_ROOT
expect_pass_silent "21a. direct probe: first branch passes"
run_hook_bash_env "git switch -c claude/direct-2" "sess-D" -u GOVERNANCE_RUNTIME_ROOT
expect_pass_silent "21b. direct probe: no record, no block"
AFTER=$(runtime_snapshot)
expect_true "21c. direct probe wrote nothing" same_snapshot

# 22. runtime root 不是本 repo Git 目錄下的 governance-runtime(managed host 的停用 root):不寫。
INERT_ROOT="$TMP_DIR/.managed-governance-runtime-disabled"
BEFORE=$(runtime_snapshot)
run_hook_bash_env "git checkout -b claude/inert" "sess-M" GOVERNANCE_RUNTIME_ROOT="$INERT_ROOT" GOVERNANCE_STATE_DIR="$INERT_ROOT"
expect_pass_silent "22a. non-Git-owned runtime root: passes"
AFTER=$(runtime_snapshot)
inert_untouched() { [ "$BEFORE" = "$AFTER" ] && [ ! -e "$INERT_ROOT" ]; }
expect_true "22b. non-Git-owned runtime root: nothing written anywhere" inert_untouched

# 23. 分支名帶雙引號:紀錄仍是合法 JSON,同 session 第二條照擋,其他 session 的紀錄也沒被弄壞。
#    (舊版 printf 直接塞字串 → 寫出壞行 → jq -s 整檔讀失敗 → 所有 session 的 R1 靜默放行)
run_hook_bash 'git checkout -b "feat/say-\"hi\""' "sess-Q"
expect_pass_silent "23a. quoted branch name: first branch passes"
run_hook_bash "git switch -c feat/other" "sess-Q"
expect_block "23b. quoted branch name: second branch still blocked" "R1 BLOCKER"
run_hook_bash "git switch -c codex/again" "sess-A"
expect_block "23c. quoted branch name did not corrupt other sessions' records" "R1 BLOCKER"

# 24. 紀錄檔被換成 symlink:不得透過它寫到外面(拒寫也拒讀 → 這一次照放行)。
OUTSIDE="$TMP_DIR/outside-sentinel.txt"
printf 'unchanged\n' > "$OUTSIDE"
mkdir -p "$GOVERNANCE_STATE_DIR"
# 前面幾格若紅(例如紀錄沒寫成),紀錄檔可能不存在;不讓這格因 mv 失敗而中斷整支測試。
if [ -e "$TRACK_FILE" ]; then mv "$TRACK_FILE" "$TRACK_FILE.saved"; fi
ln -s "$OUTSIDE" "$TRACK_FILE"
run_hook_bash "git checkout -b claude/link" "sess-L"
expect_pass_silent "24a. symlinked record: passes without following the link"
sentinel_unchanged() { [ "$(cat "$OUTSIDE")" = "unchanged" ]; }
expect_true "24b. symlinked record: outside file untouched" sentinel_unchanged
rm -f "$TRACK_FILE"
if [ -e "$TRACK_FILE.saved" ]; then mv "$TRACK_FILE.saved" "$TRACK_FILE"; fi

# 25. 開分支的其他寫法(2026-11-21 PROC-H,J-2931c7ba29 經真 adapter 實測放行的五種):
#     經 hooks/lib/_deny_norm.py 的同一份正規化後都要認得 —— 本 session 已有分支時一律擋。
run_hook_bash "git checkout -b feat/first" "sess-F"
expect_pass_silent "25a. first branch of sess-F is recorded"
run_hook_bash "git checkout -q -b feat/x1" "sess-F"
expect_block "25b. checkout -q -b is a second branch" "R1 BLOCKER"
run_hook_bash "git switch --create feat/x2" "sess-F"
expect_block "25c. switch --create is a second branch" "R1 BLOCKER"
run_hook_bash "git -C . checkout -b feat/x3" "sess-F"
expect_block "25d. git -C . checkout -b is a second branch" "R1 BLOCKER"
run_hook_bash "git branch feat/x4 && git switch feat/x4" "sess-F"
expect_block "25e. git branch <name> && git switch is a second branch" "R1 BLOCKER"
run_hook_bash "git worktree add -b feat/x5 ../wt" "sess-F"
expect_block "25f. worktree add -b is a second branch" "R1 BLOCKER"
# R 在同一則裡定義(R1 只算本專案 repo 的分支之後,-C 的目標要推得出來;本則沒定義的變數見 26o)
run_hook_bash $'R=.\ng() { git -C "$R" "$@"; }\ng checkout -b feat/x6' "sess-F"
expect_block "25g. function-wrapped checkout -b is a second branch" "R1 BLOCKER"
# 不是開分支的不能被誤認(對照組)
run_hook_bash "git branch --show-current && git branch -vv" "sess-F"
expect_pass_silent "25h. branch listing is not branch creation"
run_hook_bash "git worktree add ../wt2 feat/first" "sess-F"
expect_pass_silent "25i. worktree add of the existing branch passes"
run_hook_bash "echo 'git checkout -b feat/quoted'" "sess-F"
expect_pass_silent "25j. quoted example is not a command"
# R2 同一份正規化:-C 包裝的 push main 也擋
run_hook_bash "git -C . push origin main" "sess-G"
expect_block "25k. git -C . push origin main is a direct push" "R2 BLOCKER"

# 26. R1 只算開在本專案 repo 的分支(2026-11-21 PROC-H 審查必修:多包流程在各 scratch clone 開分支,
#     改前一個 session 從第二個 clone 起就被 R1 擋,第一個 clone 的分支還被記成本 session 的工作分支)。
#     clone 放在 fixture 底下(各自 git init,跟專案不是同一個 repo);linked worktree 與子目錄是同一個 repo。
CLONE_A="$TMP_DIR/scratch/PKG-A/clone"; CLONE_B="$TMP_DIR/scratch/PKG-B/clone"; CLONE_C="$TMP_DIR/scratch/PKG-C/clone"
for d in "$CLONE_A" "$CLONE_B" "$CLONE_C"; do mkdir -p "$d" && git -C "$d" init -q; done
PROJECT_WT="$TMP_DIR/scratch/project-wt"
git -C "$TMP_DIR" worktree add -q --detach "$PROJECT_WT" HEAD
mkdir -p "$TMP_DIR/sub"

run_hook_bash_cwd() {
  local cmd="$1"; local session="$2"; local cwd="$3"
  local payload
  payload=$(jq -n --arg c "$cmd" --arg s "$session" --arg w "$cwd" '{tool_name:"Bash", session_id:$s, cwd:$w, tool_input:{command:$c}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

# 審查探針的三個指令,同一個 session 依序跑:改前第 2、3 個 R1 BLOCKER,第 1 個把 pkg-a 記成本 session 的分支。
run_hook_bash "git -C $CLONE_A switch -q -c pkg-a" "sess-K"
expect_pass_silent "26a. git -C <clone A> switch -c passes"
run_hook_bash "git -C $CLONE_B switch -q -c pkg-b" "sess-K"
expect_pass_silent "26b. git -C <a different clone B> switch -c passes"
run_hook_bash "cd $CLONE_C && git checkout -q -B pkg-c" "sess-K"
expect_pass_silent "26c. cd <clone C> && git checkout -q -B passes"
no_record_k() { ! track_has_session "sess-K"; }
expect_true "26d. clone branches are not recorded as this session's working branch" no_record_k
# 專案 repo 照舊:第一條記下,第二條擋
run_hook_bash "git checkout -b feat/k-main" "sess-K"
expect_pass_silent "26e. first project branch after clone branches is recorded"
run_hook_bash "git -C . checkout -b feat/k-second" "sess-K"
expect_block "26f. git -C . checkout -b in the project is still a second branch" "R1 BLOCKER"
run_hook_bash "git -C $CLONE_A switch -q -c pkg-a2" "sess-K"
expect_pass_silent "26g. clone branch after the project branch still passes"
run_hook_bash "git -C $PROJECT_WT checkout -b feat/k-wt" "sess-K"
expect_block "26h. a linked worktree of the project is the same repo" "R1 BLOCKER"
run_hook_bash "cd $TMP_DIR/sub && git switch -c feat/k-sub" "sess-K"
expect_block "26i. cd into a project subdirectory is the same repo" "R1 BLOCKER"
run_hook_bash "cd $CLONE_A && cd $TMP_DIR && git checkout -b feat/k-back" "sess-K"
expect_block "26j. cd into a clone and back to the project counts the project" "R1 BLOCKER"
run_hook_bash "V=$CLONE_B; cd \"\$V\" && git checkout -q -B pkg-v" "sess-K"
expect_pass_silent "26k. clone path held in a variable defined in the same command passes"
# payload 的 cwd 是起點(provider 延續的工作目錄)
run_hook_bash_cwd "git checkout -b feat/k-cwd" "sess-K" "$CLONE_A"
expect_pass_silent "26l. session cwd inside a clone: plain checkout -b passes"
run_hook_bash_cwd "git checkout -b feat/k-cwd2" "sess-K" "$TMP_DIR"
expect_block "26m. session cwd in the project: plain checkout -b is a second branch" "R1 BLOCKER"
# 寫死的路徑還不存在(同一則才 clone 出來):不會是本專案 repo
run_hook_bash "git clone -q $TMP_DIR $TMP_DIR/scratch/new && cd $TMP_DIR/scratch/new && git checkout -b pkg-new" "sess-K"
expect_pass_silent "26n. clone-then-branch in one command passes"
# 推不出目錄 → 照改前的逐字比對(兩面:改前認不到的 -C 寫法放行、改前認得的 git checkout -b 照擋)
run_hook_bash $'g() { git -C "$R_NOT_DEFINED_IN_THIS_COMMAND" "$@"; }\ng checkout -b feat/k-u' "sess-K"
expect_pass_silent "26o. unknowable -C target falls back to the pre-change literal match(not recognized, as before)"
run_hook_bash 'cd "$(git rev-parse --show-toplevel)" && git checkout -b feat/k-u2' "sess-K"
expect_block "26p. unknowable cd target falls back to the pre-change literal match(git checkout -b still blocked)" "R1 BLOCKER"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo -e "Failed:$FAILED_TESTS"
  exit 1
fi

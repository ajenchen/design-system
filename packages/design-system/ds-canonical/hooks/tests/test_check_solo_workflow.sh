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

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo -e "Failed:$FAILED_TESTS"
  exit 1
fi

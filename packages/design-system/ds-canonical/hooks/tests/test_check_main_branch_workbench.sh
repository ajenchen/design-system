#!/bin/bash
# Tests for the protected-main editing feedback gate(M28).

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_main_branch_workbench.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable: $HOOK"; exit 1; }

TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT
REPO_MAIN="$TMP_ROOT/repo-main"
REPO_FEAT="$TMP_ROOT/repo-feature"

setup_repo() {
  local dir="$1" branch="$2"
  mkdir -p "$dir"
  git -C "$dir" init -q -b main 2>/dev/null || { git -C "$dir" init -q; git -C "$dir" checkout -q -b main; }
  git -C "$dir" config user.email test@example.invalid
  git -C "$dir" config user.name test
  printf 'seed\n' > "$dir/seed.txt"
  git -C "$dir" add seed.txt
  git -C "$dir" commit -qm seed
  [ "$branch" = main ] || git -C "$dir" checkout -q -b "$branch"
}
setup_repo "$REPO_MAIN" main
setup_repo "$REPO_FEAT" codex/feature

PASS=0
FAIL=0

run_hook() {
  local file_path="$1" project_dir="$2" tool="${3:-Edit}"
  local payload stdout_file stderr_file
  payload=$(jq -n --arg fp "$file_path" --arg tool "$tool" '{tool_name:$tool,tool_input:{file_path:$fp}}')
  stdout_file=$(mktemp); stderr_file=$(mktemp)
  set +e
  printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$project_dir" bash "$HOOK" >"$stdout_file" 2>"$stderr_file"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$stderr_file")
  rm -f "$stdout_file" "$stderr_file"
}

expect_pass() {
  local name="$1"
  if [ "$EXIT" = 0 ] && [ -z "$STDERR_TEXT" ]; then echo "  PASS  $name"; PASS=$((PASS+1));
  else echo "  FAIL  $name(exit=$EXIT)"; FAIL=$((FAIL+1)); fi
}
expect_block() {
  local name="$1"
  if [ "$EXIT" = 2 ] && echo "$STDERR_TEXT" | grep -qF 'PROTECTED-MAIN WORKBENCH BLOCKER'; then echo "  PASS  $name"; PASS=$((PASS+1));
  else echo "  FAIL  $name(exit=$EXIT)"; echo "$STDERR_TEXT"; FAIL=$((FAIL+1)); fi
}

echo "=== check_main_branch_workbench protected-main tests ==="
run_hook "$REPO_MAIN/README.md" "$REPO_MAIN" Read
expect_pass "1. read tool skips"

run_hook "$REPO_FEAT/README.md" "$REPO_FEAT"
expect_pass "2. edits on the task branch pass"

run_hook "$REPO_MAIN/packages/design-system/src/Foo.tsx" "$REPO_MAIN"
expect_block "3. production edit on main blocks"

run_hook "$REPO_MAIN/.claude/rules/meta-patterns.md" "$REPO_MAIN"
expect_block "4. governance/doc edit on main also blocks"

run_hook "$TMP_ROOT/outside.txt" "$REPO_MAIN"
expect_pass "5. file outside checkout skips"

payload=$(jq -n --arg fp "$REPO_MAIN/README.md" '{tool_name:"Edit",tool_input:{file_path:$fp}}')
stdout_file=$(mktemp); stderr_file=$(mktemp)
set +e
printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$REPO_MAIN" GOVERNANCE_BYPASS_MAIN_WORKBENCH=1 bash "$HOOK" >"$stdout_file" 2>"$stderr_file"
EXIT=$?
set -e
STDERR_TEXT=$(cat "$stderr_file")
rm -f "$stdout_file" "$stderr_file"
expect_pass "6. local recovery override passes"

# 2026-11-04(待辦 3i):gitignore 命中、沒被追蹤的工作區放行;其餘照擋(兩面對照)
printf 'tmp/\n*.log\n' > "$REPO_MAIN/.gitignore"
git -C "$REPO_MAIN" add .gitignore && git -C "$REPO_MAIN" commit -qm ignore
mkdir -p "$REPO_MAIN/tmp/wip" "$REPO_MAIN/src"
printf 'x\n' > "$REPO_MAIN/src/tracked.ts" && git -C "$REPO_MAIN" add src/tracked.ts
printf 'forced\n' > "$REPO_MAIN/tmp/forced.md" && git -C "$REPO_MAIN" add -f tmp/forced.md
git -C "$REPO_MAIN" commit -qm tracked
run_hook "$REPO_MAIN/tmp/wip/notes.md" "$REPO_MAIN" Write
expect_pass "7. main 上寫 gitignore 的 tmp/ 工作檔 → 放行"
run_hook "tmp/wip/notes.md" "$REPO_MAIN"
expect_pass "8. 相對路徑的 gitignore 工作檔 → 放行"
run_hook "$REPO_MAIN/src/tracked.ts" "$REPO_MAIN"
expect_block "9. 對照組:main 上改受追蹤檔 → 仍擋"
run_hook "$REPO_MAIN/tmp/forced.md" "$REPO_MAIN"
expect_block "10. 對照組:檔在 ignored 目錄、但被強制加進版本紀錄 → 仍擋"
run_hook "$REPO_MAIN/tmp/../src/tracked.ts" "$REPO_MAIN"
expect_block "11. 對照組:經 tmp/../ 繞回受追蹤檔 → 仍擋"
ln -s ../src "$REPO_MAIN/tmp/link"
run_hook "$REPO_MAIN/tmp/link/tracked.ts" "$REPO_MAIN"
expect_block "12. 對照組:ignored 目錄裡的連結指回受追蹤目錄 → 仍擋"
run_hook "$REPO_MAIN/src/new-file.ts" "$REPO_MAIN" Write
expect_block "13. 對照組:main 上新建沒被 ignore 的檔 → 仍擋"
NO_PY_BIN="$TMP_ROOT/no-python-bin"
mkdir -p "$NO_PY_BIN"
for tool in jq git cat dirname; do ln -s "$(command -v "$tool")" "$NO_PY_BIN/$tool"; done
payload=$(jq -n --arg fp "$REPO_MAIN/tmp/wip/notes.md" '{tool_name:"Write",tool_input:{file_path:$fp}}')
stdout_file=$(mktemp); stderr_file=$(mktemp)
set +e
printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$REPO_MAIN" PATH="$NO_PY_BIN" /bin/bash "$HOOK" >"$stdout_file" 2>"$stderr_file"
EXIT=$?
set -e
STDERR_TEXT=$(cat "$stderr_file")
rm -f "$stdout_file" "$stderr_file"
expect_block "14. 對照組:沒有 python3、算不出實體位置 → 不放行(fail closed)"

echo "Passed: $PASS / $((PASS + FAIL))"
[ "$FAIL" -eq 0 ]

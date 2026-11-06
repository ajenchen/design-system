#!/bin/bash
# PreToolUse feedback gate: never use protected main/master as an editing workbench.
# Remote GitHub rulesets are the hard authority; this local hook catches the mistake earlier.
# SSOT: AGENTS.md # Git / release canonical + governance/memory/feedback_solo_dev_workflow.md

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
set -uo pipefail

INPUT=$(cat 2>/dev/null || echo '{}')
TOOL=$(echo "$INPUT" | jq -r '.tool_name // .tool // ""' 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // .file_path // .path // ""' 2>/dev/null)
PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"

case "${TOOL:-}" in
  Edit|Write|MultiEdit|edit_file|write_file) ;;
  *) exit 0 ;;
esac

[ -n "${FILE_PATH:-}" ] || exit 0

# Do not police files outside this checkout. Relative paths are project-relative.
case "$FILE_PATH" in
  /*)
    case "$FILE_PATH" in "$PROJECT_DIR"/*) ;; *) exit 0 ;; esac
    ;;
esac

if [ "${GOVERNANCE_BYPASS_MAIN_WORKBENCH:-0}" = "1" ]; then
  exit 0
fi

CURRENT_BRANCH=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo "")
if [ "${CURRENT_BRANCH:-}" != "main" ] && [ "${CURRENT_BRANCH:-}" != "master" ]; then
  exit 0
fi

# .gitignore 命中、而且沒有被追蹤的路徑放行(2026-11-04,待辦 3i):main 保護的是「會進版本紀錄的檔」;
# tmp/ 這類 gitignore 的工作區本來就不會進任何 commit,擋它只會逼人改用別的方式寫檔(等於繞過)。
# 判法:先算路徑的實體位置(連結、.. 都解開)—— 實體位置要仍在 checkout 裡,再問 git check-ignore;
# check-ignore 對已追蹤的檔一律答「不是 ignored」,所以被強制加進版本紀錄的檔照樣擋。
# 算不出實體位置(沒有 python3、路徑跑出 checkout)或 git 失敗 = 照舊擋(fail closed)。
IGNORED_TARGET=$(python3 - "$PROJECT_DIR" "$FILE_PATH" <<'PY' 2>/dev/null
import os, sys
root = os.path.realpath(sys.argv[1])
target = sys.argv[2] if os.path.isabs(sys.argv[2]) else os.path.join(sys.argv[1], sys.argv[2])
real = os.path.realpath(target)
if real != root and not real.startswith(root + os.sep):
    sys.exit(1)
print(os.path.relpath(real, root))
PY
) || IGNORED_TARGET=""
if [ -n "$IGNORED_TARGET" ] && [ "$IGNORED_TARGET" != "." ] \
  && git -C "$PROJECT_DIR" check-ignore -q -- "$IGNORED_TARGET" 2>/dev/null; then
  exit 0
fi

cat >&2 <<EOF
🚨 PROTECTED-MAIN WORKBENCH BLOCKER(M28)
  target: ${FILE_PATH}
  branch: ${CURRENT_BRANCH}

main/master 只接受通過 required checks 的 PR merge；任何 repo 檔案都不得直接在主分支編輯。
User 說「開 branch」不是留在 main 編輯的豁免；必須先真的切到本任務唯一 working branch。

修法:
  git switch <existing-task-branch>
  # 若本任務尚無 branch，僅建立一條:
  git switch -c <provider>/<task>

Recovery only: GOVERNANCE_BYPASS_MAIN_WORKBENCH=1。此旗標不能繞過 GitHub ruleset。
EOF
exit 2

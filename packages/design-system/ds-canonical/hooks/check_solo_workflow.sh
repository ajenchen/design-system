#!/bin/bash
set -uo pipefail
# PreToolUse hook: enforce protected-main solo-work canonical (M28)
# SSOT: governance/memory/feedback_solo_dev_workflow.md + AGENTS.md # Git / release canonical
#
# Blocks 2 violations:
#   R1. A second working branch in the same session(checkout -b or switch -c).
#       The session→branch record is enforcement state, not telemetry(_log-fire.sh
#       governance_enforcement_state_dir):遙測開不開都一樣有作用。2026-11-18 之前它住在遙測目錄裡,
#       遙測預設關 → R1 預設從不擋(knowledge-prune D4-01)。
#       R1 記不到、也就擋不到的情況(照實列):GOVERNANCE_READ_ONLY=1(CI replay、hooks:test)、
#       不經 adapter 直接跑本檔(沒有 GOVERNANCE_RUNTIME_ROOT)、payload 沒有 session_id、
#       runtime root 不是本 repo Git 目錄下的 governance-runtime(例:managed host 刻意給的停用 root)、
#       紀錄檔被換成 symlink / hard link(拒寫也拒讀)。
#   R2. Any direct push to main. PR is the only merge path.
# Tag/release lifecycle belongs to `release:auto` + protected workflows; the retired
# local release-preflight R4 branch must not insert a sixth standard release gate.
#
# Managed recovery override: GOVERNANCE_BYPASS_SOLO_WORKFLOW=1 in the hook host
# environment (audit-logged to solo-workflow-bypass.jsonl in the same enforcement state
# as R1, under the same conditions — telemetry not required). Command text can never
# activate the override.
#
# 違反歷史:本 hook 2026-05-08 codified — 同 session AI 開 5 個 branch + 2 PR
# 後 user 第 3 次糾正才升 mechanical (markdown rule + memory file 都不夠)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

TRACK_NAME=session-branch-track.jsonl
BYPASS_NAME=solo-workflow-bypass.jsonl

# Enforcement state is resolved lazily — only on the R1 path. Resolving it costs python3 calls, and the
# vast majority of Bash calls are not git branch commands(see the early exit below; G4 複核二).
STATE_DIR=""
STATE_WRITES=0
TRACK_FILE=""
solo_enforcement_state_init() {
  STATE_DIR="$(governance_enforcement_state_dir 2>/dev/null)" || STATE_DIR=""
  [ -n "$STATE_DIR" ] || return 0
  # Same filename validation as telemetry(rejects symlink / hard link / non-regular file).
  TRACK_FILE="$(governance_runtime_file_path "$TRACK_NAME" "$STATE_DIR" 2>/dev/null)" || TRACK_FILE=""
  [ -n "$TRACK_FILE" ] && STATE_WRITES=1
  return 0
}

INPUT=$(cat 2>/dev/null || echo '{}')
TOOL_NAME=$(jq -r '.tool_name // .tool // empty' <<<"$INPUT" 2>/dev/null)
SESSION_ID=$(jq -r '.session_id // empty' <<<"$INPUT" 2>/dev/null)

# === Managed recovery override ===
# Only a value injected into the hook host environment before the provider starts
# is authoritative. Treating a token in tool_input.command as an override would
# let the command being inspected disable its own guard.
if [ "${GOVERNANCE_BYPASS_SOLO_WORKFLOW:-0}" = "1" ]; then
  governance_append_enforcement_record "$BYPASS_NAME" \
    "$(jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg tool "$TOOL_NAME" --arg session "$SESSION_ID" \
      '{ts:$ts,tool:$tool,session:$session}' 2>/dev/null)" 2>/dev/null || true
  exit 0
fi

# Helper: shell-aware working-branch creation detect(quoted-string-safe).
# Recognizes both legacy checkout -b and modern switch -c for every provider prefix.
detect_git_new_branch() {
  python3 -c "
import shlex, sys
try:
    tokens = shlex.split(sys.stdin.read(), comments=True)
except Exception:
    sys.exit(1)
for i in range(len(tokens) - 2):
    if tokens[i] != 'git':
        continue
    if i + 3 < len(tokens) and tokens[i+1] == 'checkout' and tokens[i+2] in ('-b', '-B'):
        print(tokens[i+3])
        sys.exit(0)
    if i + 3 < len(tokens) and tokens[i+1] == 'switch' and tokens[i+2] in ('-c', '-C'):
        print(tokens[i+3])
        sys.exit(0)
sys.exit(1)
" 2>/dev/null
}

# Helper: shell-aware push to main detect
detect_push_main() {
  python3 -c "
import shlex, sys
try:
    tokens = shlex.split(sys.stdin.read(), comments=True)
except Exception:
    sys.exit(1)
for i in range(len(tokens) - 2):
    # git push origin main / git push origin xxx:main / git push HEAD:main
    if tokens[i] == 'git' and tokens[i+1] == 'push':
        # Look for 'main' or 'X:main' as ref arg
        for j in range(i+2, min(i+6, len(tokens))):
            t = tokens[j]
            if t == 'main' or t.endswith(':main') or t.endswith(' main'):
                sys.exit(0)
sys.exit(1)
" 2>/dev/null
}

if [ "$TOOL_NAME" = "Bash" ]; then
  COMMAND=$(jq -r '.tool_input.command // empty' <<<"$INPUT" 2>/dev/null)
  # R1 / R2 都只看 git 指令。不含 git 的指令(絕大多數 Bash 呼叫)直接放行,不再每次叫兩次 python3 ——
  # 缺 python3 時也不會因此把 `ls`、`brew install python3` 一起卡住(G4 複核二,2026-10-07)。
  case "$COMMAND" in *git*) ;; *) exit 0 ;; esac

  # === Rule 1: 1 session = 1 working branch ===
  # Use shlex tokenizer(quoted-string-safe)— quoted examples are not treated as commands.
  NEW_BRANCH=$(echo "$COMMAND" | detect_git_new_branch)
  if [ -n "$NEW_BRANCH" ]; then
    solo_enforcement_state_init

    if [ "$STATE_WRITES" = "1" ] && [ -f "$TRACK_FILE" ] && [ -n "$SESSION_ID" ]; then
      EXISTING=$(jq -rs --arg s "$SESSION_ID" 'map(select(.session_id == $s))[0].branch // empty' "$TRACK_FILE" 2>/dev/null)
      if [ -n "$EXISTING" ] && [ "$EXISTING" != "null" ] && [ "$EXISTING" != "$NEW_BRANCH" ]; then
        cat >&2 <<EOF

┄┄┄ check_solo_workflow — R1 BLOCKER (M28) ┄┄┄

[P0 BLOCKER] create second branch: $NEW_BRANCH

本 session ($SESSION_ID) 已有 working branch:
  → $EXISTING

❌ 1 session = 1 working branch (SSOT: governance/memory/feedback_solo_dev_workflow.md)。
   即使既有 branch 已 merged + deleted,本 session 內**不再開新 branch**。

修法:
  1. 重用既有 branch:
       git switch $EXISTING
     (若 local 已刪除，從 origin 的同名 branch 恢復；不要改開第二條。)
  2. 例外 recovery override:GOVERNANCE_BYPASS_SOLO_WORKFLOW=1 (audit logged)

違反史:本 session 已開 5 branch + 2 PR,M13 trigger 升 hook 防線。
EOF
        exit 2
      fi
    fi

    # Record new session branch (first creation OK)
    # jq 組 JSON(舊版 printf 直接塞字串:分支名帶 `"` 就寫出一行壞 JSON,之後 jq -s 整檔讀失敗 →
    # 每個 session 的 R1 都靜默放行)。
    if [ "$STATE_WRITES" = "1" ] && [ -n "$SESSION_ID" ] && [ -n "$NEW_BRANCH" ]; then
      governance_append_enforcement_record "$TRACK_NAME" \
        "$(jq -nc --arg s "$SESSION_ID" --arg b "$NEW_BRANCH" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
          '{session_id:$s,branch:$b,created_at:$t}' 2>/dev/null)" 2>/dev/null || true
    fi
    exit 0
  fi

  # === Rule 2: direct push to main is never a supported path ===
  if echo "$COMMAND" | detect_push_main; then
    cat >&2 <<EOF

┄┄┄ check_solo_workflow — R2 BLOCKER (M28) ┄┄┄

[P0 BLOCKER] direct push to main

❌ protected main 只能透過單一 PR + required checks 合併。
	   Standing Authorization 也不是 direct-main bypass。

修法:
  1. push working branch
  2. create/update its single PR
		  3. required CI / conversations 全綠後用 PR merge；release 續作交給 release:auto
EOF
		    exit 2
		  fi
fi

exit 0

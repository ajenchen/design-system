#!/bin/bash
set -uo pipefail
# PreToolUse hook: enforce protected-main solo-work canonical (M28)
# SSOT: governance/memory/feedback_solo_dev_workflow.md + AGENTS.md # Git solo-work canonical
#
# Blocks 2 violations:
#   R1. A second working branch in the same session(checkout -b or switch -c).
#   R2. Any direct push to main. PR is the only merge path.
# Tag/release lifecycle belongs to `release:auto` + protected workflows; the retired
# local release-preflight R4 branch must not insert a sixth standard release gate.
#
# Managed recovery override: GOVERNANCE_BYPASS_SOLO_WORKFLOW=1 in the hook host
# environment (audit-logged to neutral runtime state when opted in). Command text
# can never activate the override.
#
# 違反歷史:本 hook 2026-05-08 codified — 同 session AI 開 5 個 branch + 2 PR
# 後 user 第 3 次糾正才升 mechanical (markdown rule + memory file 都不夠)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

STATE_DIR="$(governance_runtime_state_dir 2>/dev/null || true)"
STATE_WRITES=0
[ -n "$STATE_DIR" ] && STATE_WRITES=1
TRACK_FILE="$STATE_DIR/session-branch-track.jsonl"
BYPASS_LOG="$STATE_DIR/solo-workflow-bypass.jsonl"

INPUT=$(cat 2>/dev/null || echo '{}')
TOOL_NAME=$(jq -r '.tool_name // .tool // empty' <<<"$INPUT" 2>/dev/null)
SESSION_ID=$(jq -r '.session_id // empty' <<<"$INPUT" 2>/dev/null)

# === Managed recovery override ===
# Only a value injected into the hook host environment before the provider starts
# is authoritative. Treating a token in tool_input.command as an override would
# let the command being inspected disable its own guard.
if [ "${GOVERNANCE_BYPASS_SOLO_WORKFLOW:-0}" = "1" ]; then
  if [ "$STATE_WRITES" = "1" ]; then
    mkdir -p "$STATE_DIR"
    jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg tool "$TOOL_NAME" --arg session "$SESSION_ID" \
      '{ts:$ts,tool:$tool,session:$session}' >> "$BYPASS_LOG"
  fi
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

  # === Rule 1: 1 session = 1 working branch ===
  # Use shlex tokenizer(quoted-string-safe)— quoted examples are not treated as commands.
  NEW_BRANCH=$(echo "$COMMAND" | detect_git_new_branch)
  if [ -n "$NEW_BRANCH" ]; then

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
    if [ "$STATE_WRITES" = "1" ] && [ -n "$SESSION_ID" ] && [ -n "$NEW_BRANCH" ]; then
      mkdir -p "$STATE_DIR"
      printf '{"session_id":"%s","branch":"%s","created_at":"%s"}\n' \
        "$SESSION_ID" "$NEW_BRANCH" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$TRACK_FILE"
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

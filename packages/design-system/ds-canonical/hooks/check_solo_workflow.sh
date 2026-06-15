#!/bin/bash
set -uo pipefail
# PreToolUse hook: enforce solo-work canonical (M28)
# SSOT: .claude/memory/feedback_solo_dev_workflow.md + CLAUDE.md # Git solo-work canonical
#
# Blocks 3 violations:
#   R1. `git checkout -b claude/*` 第 2+ 次 in same session
#       (1 chat = 1 working branch — even after merge,reuse 同 branch name)
#   R2. PR creation (Bash gh / mcp__github__create_pull_request)
#       (solo work = no PR ceremony)
#   R3. Push to main / merge PR without recent user "push" trigger keyword
#       (AI 不自決 push main,等 user 「push / OK / 好 / 合 main」 trigger)
#
# Override: CLAUDE_BYPASS_SOLO_WORKFLOW=1 (audit-logged to .claude/logs/solo-workflow-bypass.jsonl)
#
# 違反歷史:本 hook 2026-05-08 codified — 同 session AI 開 5 個 branch + 2 PR
# 後 user 第 3 次糾正才升 mechanical (markdown rule + memory file 都不夠)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
# SSOT approval regex(M17 + M34 + GAP 6 codify 2026-05-18)
source "$(dirname "$0")/lib/_approval_re.sh"

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
TRACK_FILE="$PROJECT_DIR/.claude/logs/session-branch-track.jsonl"
BYPASS_LOG="$PROJECT_DIR/.claude/logs/solo-workflow-bypass.jsonl"

INPUT=$(cat 2>/dev/null || echo '{}')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)

# === Override flag ===
# 2026-06-11:documented override 從 Bash command 前綴無法進到 hook env(PreToolUse 隔離)—
# 對齊 check_substantive_edit_approval_preflight 行為,command 字串含 override token 也視為 set(audit-logged 不變)。
_OVR_CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
if echo "${_OVR_CMD:-}" | grep -q 'CLAUDE_BYPASS_SOLO_WORKFLOW=1' 2>/dev/null; then
  CLAUDE_BYPASS_SOLO_WORKFLOW=1
fi
if [ "${CLAUDE_BYPASS_SOLO_WORKFLOW:-0}" = "1" ]; then
  mkdir -p "$(dirname "$BYPASS_LOG")"
  printf '{"ts":"%s","tool":"%s","session":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$TOOL_NAME" "$SESSION_ID" >> "$BYPASS_LOG"
  exit 0
fi

# Helper: scan recent user messages for "push" trigger keywords
has_push_trigger() {
  [ -z "$TRANSCRIPT" ] || [ ! -f "$TRANSCRIPT" ] && return 1
  # Transcript JSONL schema:每 line 一 message。real user text msg = `type:"user"` AND
  # `message.role:"user"` AND `message.content` is STRING(tool_results 的 content 是 array)。
  # 2026-06-11 fix(false-negative 根因):task-notification / system-notification 也是 type:user
  # string content,會把真 user trigger 擠出 tail-10 窗(本日 beta.62 發版鏈 6 個背景通知把
  # 「就push」擠出窗 → R3 誤擋)。真 user 訊息掃描必排除系統通知。
  jq -r 'select(.type=="user" and .message.role=="user" and (.message.content | type == "string")) | (.message.content | gsub("\n"; " "))' \
    "$TRANSCRIPT" 2>/dev/null \
    | grep -v -e '<task-notification>' -e '\[SYSTEM NOTIFICATION' -e '<system-reminder>' \
    | tail -10 \
    | grep -qE "$APPROVAL_KEYWORD_RE"
}

# Helper: shell-aware token detect — git checkout -b claude/X(quoted-string-safe)
# 用 shlex 真 tokenize bash command,echo "git checkout -b claude/foo" 這類
# quoted text 內的「git checkout -b」是單一 token(arg)不會誤判為新 command。
detect_git_checkout_b_claude() {
  python3 -c "
import shlex, sys
try:
    tokens = shlex.split(sys.stdin.read(), comments=True)
except Exception:
    sys.exit(1)
for i in range(len(tokens) - 3):
    if tokens[i] == 'git' and tokens[i+1] == 'checkout' and tokens[i+2] == '-b' and tokens[i+3].startswith('claude/'):
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

# Helper: shell-aware push-tag detect(2026-06-02 — R4 改用 shlex,對齊 R1/R2/R3,修 plain-grep
# 對 echo/字串內字面 'git push origin v...' 的 false-positive,per M34 hook-regex 廣度對齊)。
# shlex.split(comments=True)讓 quoted echo 字串成單一 token → 不會把字串內的 git/push 當相鄰指令。
detect_push_tag() {
  python3 -c "
import shlex, sys, re
try:
    tokens = shlex.split(sys.stdin.read(), comments=True)
except Exception:
    sys.exit(1)
for i in range(len(tokens) - 1):
    if tokens[i] == 'git' and tokens[i+1] == 'push':
        for j in range(i+2, len(tokens)):
            t = tokens[j]
            # tag-ref: --tags / refs/tags/... / v<digit>... / X:refs/tags/...
            if t == '--tags' or 'refs/tags/' in t or re.match(r'^v[0-9]', t) or t.endswith(':v') or re.search(r':v[0-9]', t):
                sys.exit(0)
sys.exit(1)
" 2>/dev/null
}

# Helper: shell-aware gh pr create / gh api pulls **WRITE** detect
# 2026-05-09 fix(user-authorized):區分 read(default GET)vs write(POST/PATCH/PUT/DELETE)。
# `gh api repos/.../pulls/N/comments` 預設 GET = read,**不** block;
# `gh api -X POST repos/.../pulls`(or `-f`/`-F` field flags 暗示 POST)= 真 PR write 才 block。
# Why:read-only API(check codex reply / read PR meta)是合法 collab,不該被 R2 PR-create 規則攔。
detect_gh_pr_create() {
  python3 -c "
import shlex, sys
try:
    tokens = shlex.split(sys.stdin.read(), comments=True)
except Exception:
    sys.exit(1)
WRITE_METHODS = {'POST', 'PATCH', 'PUT', 'DELETE'}
for i in range(len(tokens) - 2):
    if tokens[i] == 'gh':
        # gh pr create — always block(create 本身是 write)
        if tokens[i+1] == 'pr' and tokens[i+2] == 'create':
            sys.exit(0)
        # gh api ... pulls ... — only block if write method OR form fields(-f/-F = POST default)
        if tokens[i+1] == 'api':
            cmd_tokens = tokens[i:]
            has_pulls = any('pulls' in t for t in cmd_tokens[:8])
            if not has_pulls:
                continue
            # Detect explicit write method
            for k in range(len(cmd_tokens)):
                t = cmd_tokens[k]
                if t in ('-X', '--method') and k + 1 < len(cmd_tokens):
                    if cmd_tokens[k+1].upper() in WRITE_METHODS:
                        sys.exit(0)
                if t.startswith('--method=') and t.split('=', 1)[1].upper() in WRITE_METHODS:
                    sys.exit(0)
                # -f / -F flags imply POST(form fields)
                if t in ('-f', '-F'):
                    sys.exit(0)
            # GET(default)= read,allow through
sys.exit(1)
" 2>/dev/null
}

if [ "$TOOL_NAME" = "Bash" ]; then
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

  # === Rule 1: git checkout -b claude/* — 1 session = 1 branch ===
  # Use shlex tokenizer (quoted-string-safe) — echo "git checkout -b ..." 不誤判
  NEW_BRANCH=$(echo "$COMMAND" | detect_git_checkout_b_claude)
  if [ -n "$NEW_BRANCH" ]; then

    if [ -f "$TRACK_FILE" ] && [ -n "$SESSION_ID" ]; then
      EXISTING=$(jq -r --arg s "$SESSION_ID" 'select(.session_id == $s) | .branch' "$TRACK_FILE" 2>/dev/null | head -1)
      if [ -n "$EXISTING" ] && [ "$EXISTING" != "null" ] && [ "$EXISTING" != "$NEW_BRANCH" ]; then
        cat >&2 <<EOF

┄┄┄ check_solo_workflow — R1 BLOCKER (M28) ┄┄┄

[P0 BLOCKER] git checkout -b $NEW_BRANCH

本 session ($SESSION_ID) 已有 working branch:
  → $EXISTING

❌ 1 session = 1 working branch (SSOT: .claude/memory/feedback_solo_dev_workflow.md)。
   即使既有 branch 已 merged + deleted,本 session 內**不再開新 branch**。

修法:
  1. 重用既有 branch:
       git checkout $EXISTING
     (若 local 已 -d 刪除,recreate from main:)
       git checkout main && git checkout -b $EXISTING
  2. 或 doc-only / governance-only 改 → commit 直接 main(無 Netlify preview 需求)
  3. 例外 override:CLAUDE_BYPASS_SOLO_WORKFLOW=1 (audit logged)

違反史:本 session 已開 5 branch + 2 PR,M13 trigger 升 hook 防線。
EOF
        exit 2
      fi
    fi

    # Record new session branch (first creation OK)
    if [ -n "$SESSION_ID" ] && [ -n "$NEW_BRANCH" ]; then
      mkdir -p "$(dirname "$TRACK_FILE")"
      printf '{"session_id":"%s","branch":"%s","created_at":"%s"}\n' \
        "$SESSION_ID" "$NEW_BRANCH" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$TRACK_FILE"
    fi
    exit 0
  fi

  # === Rule 2 (Bash gh): PR creation — shlex-aware ===
  if echo "$COMMAND" | detect_gh_pr_create; then
    cat >&2 <<EOF

┄┄┄ check_solo_workflow — R2 BLOCKER (M28) ┄┄┄

[P0 BLOCKER] PR creation via gh

❌ Solo work = NO PR (SSOT: .claude/memory/feedback_solo_dev_workflow.md)。

修法 — 直接 squash merge:
  git checkout main
  git merge --squash <working-branch>
  git commit -m "..."
  git push origin main

或 doc-only 改 → commit 直接 main。
EOF
    exit 2
  fi

  # === Rule 3 (Bash): push to main without user "push" trigger — shlex-aware ===
  if echo "$COMMAND" | detect_push_main; then
    if ! has_push_trigger; then
      cat >&2 <<EOF

┄┄┄ check_solo_workflow — R3 BLOCKER (M28) ┄┄┄

[P0 BLOCKER] git push origin main

❌ AI 不自決 push main (SSOT: .claude/memory/feedback_solo_dev_workflow.md)。
   近 10 條 user message 無「push / OK / 好 / 合 main / merge / 可以」 trigger keyword。

正確流程:
  1. AI 改 code → commit + push working branch (Netlify auto-preview)
  2. 告訴 user 主要改動 (or preview URL)
  3. 等 user 明確 trigger 「push」/「OK」 才 merge to main

例外 override:CLAUDE_BYPASS_SOLO_WORKFLOW=1 (audit logged)
EOF
      exit 2
    fi
  fi

  # === Rule 4 (Bash): push tag without release:preflight pass-marker (M28 release root-cause, 2026-06-02) ===
  # beta.43/45 連環 push 失敗根因 = 發版前靠手動記得逐道 sync/check → 必漏。已修成單一
  # `npm run release:preflight`(syncs + 全 gate + dogfood,全過寫 HEAD-bound marker)。
  # 此 R4 機械強制:任何 push tag(v*)前 marker 必存在且 .head == 當前 HEAD,否則 BLOCK。
  # 用 detect_push_tag(shlex,對齊 R1/R2/R3)而非 plain grep —— 修 echo/字串內字面誤觸發(M34)。
  if echo "$COMMAND" | detect_push_tag; then
    PF_MARKER="$PROJECT_DIR/.claude/logs/release-preflight-pass.json"
    PF_HEAD=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null)
    PF_MARKER_HEAD=$(jq -r '.head // empty' "$PF_MARKER" 2>/dev/null)
    if [ ! -f "$PF_MARKER" ] || [ "$PF_MARKER_HEAD" != "$PF_HEAD" ]; then
      cat >&2 <<EOF

┄┄┄ check_solo_workflow — R4 BLOCKER (M28 release preflight) ┄┄┄

[P0 BLOCKER] git push <tag> 但 release:preflight 未跑過(或跑後 HEAD 已變)。
   marker.head=${PF_MARKER_HEAD:0:12} vs 當前 HEAD=${PF_HEAD:0:12}

❌ 發版前必跑單一指令(自動 sync version 5-manifest + ds-canonical + 全 deterministic
   gate + build + dogfood,fail-fast,全過寫 HEAD-bound pass-marker):
     npm run release:preflight
   全過才准 push tag。根治 beta.43/45 連環 push 失敗(漏手動 sync 步驟)。

例外 override:CLAUDE_BYPASS_SOLO_WORKFLOW=1 (audit logged)
EOF
      exit 2
    fi
  fi
fi

# === Rule 2 (MCP): create_pull_request ===
if [ "$TOOL_NAME" = "mcp__github__create_pull_request" ]; then
  cat >&2 <<EOF

┄┄┄ check_solo_workflow — R2 BLOCKER (M28) ┄┄┄

[P0 BLOCKER] mcp__github__create_pull_request

❌ Solo work = NO PR (SSOT: .claude/memory/feedback_solo_dev_workflow.md)。

修法 — 直接 squash merge to main (per Git solo-work canonical 7 步):
  git checkout main && git merge --squash <branch> && git commit && git push origin main

或 doc-only 改 → commit 直接 main。
EOF
  exit 2
fi

# === Rule 3 (MCP): merge_pull_request without user trigger ===
if [ "$TOOL_NAME" = "mcp__github__merge_pull_request" ]; then
  if ! has_push_trigger; then
    cat >&2 <<EOF

┄┄┄ check_solo_workflow — R3 BLOCKER (M28) ┄┄┄

[P0 BLOCKER] mcp__github__merge_pull_request

❌ AI 不自決 merge PR (SSOT: .claude/memory/feedback_solo_dev_workflow.md)。
   近 10 條 user message 無「push / OK / 好 / 合 main / merge」 trigger。

等 user 明確 trigger 才 merge。Override:CLAUDE_BYPASS_SOLO_WORKFLOW=1
EOF
    exit 2
  fi
fi

exit 0

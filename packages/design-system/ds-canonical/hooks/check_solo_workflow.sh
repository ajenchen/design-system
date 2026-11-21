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
#       偵測寫法(2026-11-21 PROC-H,J-2931c7ba29):先經 hooks/lib/_deny_norm.py 的 canon_subs 拆子指令、
#       展開函式 / 變數包裝與 sh -c / eval、還原 git -C / -c / 別名 / 絕對路徑(deny 比對用的同一份正規化),
#       再認開分支的動作:checkout 的 -b / -B(前後可夾 -q 等旗標)、switch 的 -c / -C / --create / --force-create、
#       worktree add -b / -B、`git branch <名>`(不帶刪除 / 改名 / 列表類旗標)。改前只認 `git` 後面緊接
#       `checkout -b` / `switch -c`,`git checkout -q -b x`、`git switch --create x`、`git -C . checkout -b x`、
#       `git branch x && git switch x`、`git worktree add -b x ../wt` 五種都放行。
#       正規化載入失敗時退回改前的逐字比對(不因此放掉原本擋得到的寫法)。
#       仍認不到的(照實列):~/.gitconfig 的別名、函式回傳的指令名、`git branch -c / -C` 複製出來的分支。
#   R2. Any direct push to main. PR is the only merge path.(同一份正規化:`git -C . push origin main` 也算)
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

# 正規化的唯一實作(與 check_bash_command_shape.sh 的 deny 比對同一份)。python3 -B:不在 hooks/lib 留 __pycache__。
DENY_NORM_LIB="$(cd "$(dirname "$0")" && pwd)/lib/_deny_norm.py"

# Helper: R1 / R2 的偵測,一支 python 做完。stdin = 指令文字;argv[1] = r1 | r2;argv[2] = _deny_norm.py。
#   r1:印出新分支名(結束碼 0),沒有開分支 → 1。r2:直接推 main → 0,否則 1。
#   載入正規化失敗 → 退回改前的逐字比對(shlex,引號裡的字不當指令)。
detect_git_action() {
  python3 -I -B -c '
import importlib.util, shlex, sys
mode, lib = sys.argv[1], sys.argv[2]
cmd = sys.stdin.read()

def legacy_tokens():
    try:
        return [shlex.split(cmd, comments=True)]
    except Exception:
        return []

subs = None
try:
    spec = importlib.util.spec_from_file_location("_deny_norm", lib)
    dn = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(dn)
    subs = []
    for _raw, norm in dn.canon_subs(cmd):
        try:
            subs.append(shlex.split(norm))
        except Exception:
            continue
except Exception:
    subs = None
if subs is None:
    subs = legacy_tokens()

NON_CREATE_BRANCH = {"-d", "-D", "--delete", "-m", "-M", "--move", "-c", "-C", "--copy", "-a", "--all", "-r",
                     "--remotes", "-l", "--list", "-v", "-vv", "--verbose", "--show-current", "--contains",
                     "--no-contains", "--merged", "--no-merged", "-u", "--unset-upstream", "--edit-description",
                     "--points-at", "--sort", "--format", "--column", "--no-column", "-h", "--help"}

def new_branch(t):
    for i in range(len(t) - 2):
        if t[i] != "git":
            continue
        sub, rest = t[i + 1], t[i + 2:]
        if sub == "checkout":
            for j, x in enumerate(rest):
                if x in ("-b", "-B") and j + 1 < len(rest):
                    return rest[j + 1]
        elif sub == "switch":
            for j, x in enumerate(rest):
                if x in ("-c", "-C", "--create", "--force-create") and j + 1 < len(rest):
                    return rest[j + 1]
                for pre in ("--create=", "--force-create="):
                    if x.startswith(pre) and len(x) > len(pre):
                        return x[len(pre):]
        elif sub == "worktree" and rest[:1] == ["add"]:
            for j, x in enumerate(rest[1:], 1):
                if x in ("-b", "-B") and j + 1 < len(rest):
                    return rest[j + 1]
        elif sub == "branch" and rest:
            if any(x in NON_CREATE_BRANCH or x.startswith(("--set-upstream-to", "--sort=", "--format=", "--points-at=",
                                                           "--contains=", "--merged=", "--no-merged=")) for x in rest):
                continue
            names = [x for x in rest if not x.startswith("-")]
            if names:
                return names[0]
    return None

def push_main(t):
    for i in range(len(t) - 2):
        if t[i] == "git" and t[i + 1] == "push":
            for j in range(i + 2, min(i + 6, len(t))):
                x = t[j]
                if x == "main" or x.endswith(":main") or x.endswith(" main"):
                    return True
    return False

if mode == "r1":
    for t in subs:
        b = new_branch(t)
        if b:
            print(b)
            sys.exit(0)
    sys.exit(1)
sys.exit(0 if any(push_main(t) for t in subs) else 1)
' "$1" "$DENY_NORM_LIB" 2>/dev/null
}
detect_git_new_branch() { detect_git_action r1; }
detect_push_main() { detect_git_action r2; }

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

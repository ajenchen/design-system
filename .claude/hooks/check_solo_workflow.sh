#!/bin/bash
set -uo pipefail
# PreToolUse hook: enforce protected-main solo-work canonical (M28)
# SSOT: governance/memory/feedback_solo_dev_workflow.md + AGENTS.md # Git solo-work canonical
#
# Blocks 3 violations:
#   R1. A second working branch in the same session(checkout -b or switch -c).
#   R2. Any direct push to main. PR is the only merge path.
#   R4. Tag push without a matching release-preflight commit/tree attestation.
#
# Managed recovery override: GOVERNANCE_BYPASS_SOLO_WORKFLOW=1 in the hook host
# environment (audit-logged to neutral runtime state when opted in). Command text
# can never activate the override.
#
# 違反歷史:本 hook 2026-05-08 codified — 同 session AI 開 5 個 branch + 2 PR
# 後 user 第 3 次糾正才升 mechanical (markdown rule + memory file 都不夠)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
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

# Helper: shell-aware push-tag detect(2026-06-02 — R4 改用 shlex,對齊 R1/R2,修 plain-grep
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
	  3. required checks / conversations / preview / attestation / readback 全綠後用 PR merge
EOF
	    exit 2
	  fi

  # === Rule 4 (Bash): push tag without release:preflight pass-marker (M28 release root-cause, 2026-06-02) ===
  # beta.43/45 連環 push 失敗根因 = 發版前靠手動記得逐道 sync/check → 必漏。已修成單一
  # `npm run release:preflight`(syncs + 全 gate + dogfood,全過寫 commit/tree-bound marker)。
  # Squash merge 會改 commit ID，但若 merge tree 與已審 branch 完全相同仍可安全 tag；任何內容變動即 block。
	  # 用 detect_push_tag(shlex,對齊 R1/R2)而非 plain grep —— 修 echo/字串內字面誤觸發(M34)。
  if echo "$COMMAND" | detect_push_tag; then
    PF_RESOLVER="$PROJECT_DIR/scripts/lib/governance-runtime-evidence.mjs"
    PF_ARGS=(--repo-root "$PROJECT_DIR" --path release/release-preflight-pass.json)
    [ -n "${GOVERNANCE_EVIDENCE_ROOT:-}" ] && PF_ARGS+=(--root "$GOVERNANCE_EVIDENCE_ROOT")
    PF_MARKER=""
    [ -f "$PF_RESOLVER" ] && PF_MARKER=$(node "$PF_RESOLVER" "${PF_ARGS[@]}" 2>/dev/null || true)
    PF_HEAD=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null)
    PF_TREE=$(git -C "$PROJECT_DIR" rev-parse 'HEAD^{tree}' 2>/dev/null)
    PF_MARKER_HEAD=$(jq -r '.head // empty' "$PF_MARKER" 2>/dev/null)
    PF_MARKER_TREE=$(jq -r '.tree // empty' "$PF_MARKER" 2>/dev/null)
    PF_EXPECTED_REPO="${GOVERNANCE_RELEASE_REPOSITORY:-ajenchen/design-system}"
    # Recompute every governance input bound into the attestation. A syntactically
    # valid digest map is not authority: it must still describe the current SSOT
    # bytes, including squash-style commits whose tree identity is preserved.
    PF_AGENTS_DIGEST=$(shasum -a 256 "$PROJECT_DIR/AGENTS.md" 2>/dev/null | awk '{print $1}')
    PF_PROVIDER_DIGEST=$(shasum -a 256 "$PROJECT_DIR/packages/governance/canonical/providers.json" 2>/dev/null | awk '{print $1}')
    PF_COVERAGE_DIGEST=$(shasum -a 256 "$PROJECT_DIR/generated/governance/audit-coverage-matrix.json" 2>/dev/null | awk '{print $1}')
    PF_BASELINE_DIGEST=$(shasum -a 256 "$PROJECT_DIR/packages/design-system/ds-canonical/references/preflight-gate-baseline.json" 2>/dev/null | awk '{print $1}')
    PF_MIN_GATES=$(jq -r 'select(.gateCount | type == "number" and floor == . and . >= 0) | .gateCount' \
      "$PROJECT_DIR/packages/design-system/ds-canonical/references/preflight-gate-baseline.json" 2>/dev/null)
    PF_MARKER_VALID=0
    if [ -n "$PF_MARKER" ] && [ -f "$PF_MARKER" ] && [ ! -L "$PF_MARKER" ] && jq -e \
      --arg expectedRepo "$PF_EXPECTED_REPO" \
      --arg agentsDigest "$PF_AGENTS_DIGEST" \
      --arg providerDigest "$PF_PROVIDER_DIGEST" \
      --arg coverageDigest "$PF_COVERAGE_DIGEST" \
      --arg baselineDigest "$PF_BASELINE_DIGEST" \
      --argjson minGates "$PF_MIN_GATES" '
      type == "object"
      and .schemaVersion == 1
      and .evidenceKind == "release-preflight-attestation"
      and (.head | type == "string" and test("^[0-9a-f]{40}$"))
      and (.tree | type == "string" and test("^[0-9a-f]{40}$"))
      and (.version | type == "string" and test("^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?$"))
      and .repo == $expectedRepo
      and (.ts | type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T"))
      and (.gatesPassed | type == "number" and . >= $minGates and floor == .)
      and (.governanceDigest | type == "object"
        and (keys | sort) == ["agentsMd","coverageMatrix","preflightGateBaseline","providerRegistry"]
        and all(.[]; type == "string" and test("^[0-9a-f]{64}$"))
        and .agentsMd == $agentsDigest
        and .providerRegistry == $providerDigest
        and .coverageMatrix == $coverageDigest
        and .preflightGateBaseline == $baselineDigest)
      and (.surface | type == "string" and length > 0)
      and (.ruleIds | type == "string" and length > 0)
    ' "$PF_MARKER" >/dev/null 2>&1; then
      PF_MARKER_VALID=1
    fi
    if [ "$PF_MARKER_VALID" != "1" ] || { [ "$PF_MARKER_HEAD" != "$PF_HEAD" ] && [ "$PF_MARKER_TREE" != "$PF_TREE" ]; }; then
      cat >&2 <<EOF

┄┄┄ check_solo_workflow — R4 BLOCKER (M28 release preflight) ┄┄┄

[P0 BLOCKER] git push <tag> 但 release:preflight 未跑過，或目前 commit/tree 未受 attest。
   neutral marker=${PF_MARKER:-<unavailable>}
   marker.head=${PF_MARKER_HEAD:0:12} vs 當前 HEAD=${PF_HEAD:0:12}
   marker.tree=${PF_MARKER_TREE:0:12} vs 當前 tree=${PF_TREE:0:12}

❌ 發版前必跑單一指令(自動 sync version 5-manifest + ds-canonical + 全 deterministic
   gate + build + dogfood,fail-fast,全過寫 commit/tree-bound pass-marker):
     npm run release:preflight
   全過才准 push tag。根治 beta.43/45 連環 push 失敗(漏手動 sync 步驟)。

例外 override:GOVERNANCE_BYPASS_SOLO_WORKFLOW=1 (audit logged)
EOF
      exit 2
    fi
  fi
fi

exit 0

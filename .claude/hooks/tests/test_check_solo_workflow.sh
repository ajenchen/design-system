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
TMP_DIR="$(cd "$TMP_DIR" && pwd -P)"
trap 'rm -rf "$TMP_DIR"' EXIT

export GOVERNANCE_PROJECT_DIR="$TMP_DIR"
mkdir -p \
  "$TMP_DIR/.claude/logs" \
  "$TMP_DIR/scripts/lib" \
  "$TMP_DIR/packages/governance/canonical" \
  "$TMP_DIR/generated/governance" \
  "$TMP_DIR/packages/design-system/ds-canonical/references"
cp "$REPO_ROOT/scripts/lib/governance-runtime-evidence.mjs" "$TMP_DIR/scripts/lib/governance-runtime-evidence.mjs"
cp "$REPO_ROOT/packages/governance/src/closed-tool-execution.mjs" "$TMP_DIR/scripts/lib/closed-tool-execution.mjs"

for evidence_input in \
  AGENTS.md \
  packages/governance/canonical/providers.json \
  generated/governance/audit-coverage-matrix.json \
  packages/design-system/ds-canonical/references/preflight-gate-baseline.json; do
  printf '{"gateCount":2}\n' > "$TMP_DIR/$evidence_input"
done

git -C "$TMP_DIR" init -q
GIT_DIR="$(git -C "$TMP_DIR" rev-parse --absolute-git-dir)"
GIT_DIR="$(cd "$GIT_DIR" && pwd -P)"
export GOVERNANCE_STATE_DIR="$GIT_DIR/governance-runtime"
export GOVERNANCE_TELEMETRY_OPT_IN=1
TRACK_FILE="$GOVERNANCE_STATE_DIR/session-branch-track.jsonl"
git -C "$TMP_DIR" config user.email governance-test@example.invalid
git -C "$TMP_DIR" config user.name governance-test
printf 'base\n' > "$TMP_DIR/fixture.txt"
git -C "$TMP_DIR" add \
  fixture.txt \
  AGENTS.md \
  packages/governance/canonical/providers.json \
  generated/governance/audit-coverage-matrix.json \
  packages/design-system/ds-canonical/references/preflight-gate-baseline.json
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

run_hook_bash "git switch -c codex/bar" "sess-A"
expect_block "4. second cross-provider branch is blocked" "R1 BLOCKER"

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

NEUTRAL_MARKER="$GIT_DIR/governance-runtime/evidence/release/release-preflight-pass.json"
rm -f "$NEUTRAL_MARKER"
mkdir -p "$(dirname "$NEUTRAL_MARKER")"
MARKER_HEAD=$(git -C "$TMP_DIR" rev-parse HEAD)
MARKER_TREE=$(git -C "$TMP_DIR" rev-parse 'HEAD^{tree}')
MARKER_DIGEST=$(shasum -a 256 "$TMP_DIR/AGENTS.md" | awk '{print $1}')
# A matching legacy/provider-local file is poison,not release authority.
jq -n --arg head "$MARKER_HEAD" --arg tree "$MARKER_TREE" --arg digest "$MARKER_DIGEST" '{
  schemaVersion:1,evidenceKind:"release-preflight-attestation",head:$head,tree:$tree,
  version:"1.2.3",ts:"2026-07-21T00:00:00.000Z",repo:"ajenchen/design-system",gatesPassed:2,
  governanceDigest:{agentsMd:$digest,providerRegistry:$digest,coverageMatrix:$digest,preflightGateBaseline:$digest},
  surface:"test",ruleIds:"fixture"
}' > "$TMP_DIR/.claude/logs/release-preflight-pass.json"
run_hook_bash "git push origin v1.2.3"
expect_block "15. matching poison .claude marker cannot authorize tag" "R4 BLOCKER"

WORKSPACE_POISON="$TMP_DIR/infra/governance/runtime/release/release-preflight-pass.json"
mkdir -p "$(dirname "$WORKSPACE_POISON")"
cp "$TMP_DIR/.claude/logs/release-preflight-pass.json" "$WORKSPACE_POISON"
export GOVERNANCE_EVIDENCE_ROOT="$TMP_DIR/infra/governance/runtime"
run_hook_bash "git push origin v1.2.3"
expect_block "16. workspace evidence-root redirect fails closed" "R4 BLOCKER"
unset GOVERNANCE_EVIDENCE_ROOT
rm -rf "$TMP_DIR/infra/governance/runtime"

jq -n --arg head "$MARKER_HEAD" --arg tree "$MARKER_TREE" --arg digest "$MARKER_DIGEST" '{
  schemaVersion:1,evidenceKind:"release-preflight-attestation",head:$head,tree:$tree,
  version:"1.2.3",ts:"2026-07-21T00:00:00.000Z",repo:"ajenchen/design-system",gatesPassed:2,
  governanceDigest:{agentsMd:$digest,providerRegistry:$digest,coverageMatrix:$digest,preflightGateBaseline:$digest},
  surface:"test",ruleIds:"fixture"
}' > "$NEUTRAL_MARKER"
run_hook_bash "git push origin v1.2.3"
expect_pass_silent "17. neutral marker with matching commit/tree passes"

WRONG_DIGEST=$(printf 'b%.0s' {1..64})
jq --arg digest "$WRONG_DIGEST" '.governanceDigest.agentsMd = $digest' \
  "$NEUTRAL_MARKER" > "$NEUTRAL_MARKER.tmp"
mv "$NEUTRAL_MARKER.tmp" "$NEUTRAL_MARKER"
run_hook_bash "git push origin v1.2.3"
expect_block "18. forged governance digest fails closed" "R4 BLOCKER"
jq --arg digest "$MARKER_DIGEST" '.governanceDigest.agentsMd = $digest' \
  "$NEUTRAL_MARKER" > "$NEUTRAL_MARKER.tmp"
mv "$NEUTRAL_MARKER.tmp" "$NEUTRAL_MARKER"

jq '.gatesPassed = 1' "$NEUTRAL_MARKER" > "$NEUTRAL_MARKER.tmp"
mv "$NEUTRAL_MARKER.tmp" "$NEUTRAL_MARKER"
run_hook_bash "git push origin v1.2.3"
expect_block "19. attestation below gate-count ratchet fails closed" "R4 BLOCKER"
jq '.gatesPassed = 2' "$NEUTRAL_MARKER" > "$NEUTRAL_MARKER.tmp"
mv "$NEUTRAL_MARKER.tmp" "$NEUTRAL_MARKER"

git -C "$TMP_DIR" commit --allow-empty -qm squash-id-change
rm -rf "$TMP_DIR/.claude"
run_hook_bash "git push origin v1.2.3"
expect_pass_silent "20. deleting .claude does not affect identical-tree attestation"

printf 'changed\n' >> "$TMP_DIR/fixture.txt"
git -C "$TMP_DIR" add fixture.txt
git -C "$TMP_DIR" commit -qm changed-tree
run_hook_bash "git push origin v1.2.3"
expect_block "21. changed tree invalidates attestation" "R4 BLOCKER"

MALFORMED_HEAD=$(git -C "$TMP_DIR" rev-parse HEAD)
MALFORMED_TREE=$(git -C "$TMP_DIR" rev-parse 'HEAD^{tree}')
jq -n --arg head "$MALFORMED_HEAD" --arg tree "$MALFORMED_TREE" --arg digest "$MARKER_DIGEST" '{
  schemaVersion:1,evidenceKind:"release-preflight-attestation",head:$head,tree:$tree,
  version:"1.2.3",ts:"2026-07-21T00:00:00.000Z",repo:"other/repository",gatesPassed:2,
  governanceDigest:{agentsMd:$digest,providerRegistry:$digest,coverageMatrix:$digest,preflightGateBaseline:$digest},
  surface:"test",ruleIds:"fixture"
}' > "$NEUTRAL_MARKER"
run_hook_bash "git push origin v1.2.3"
expect_block "22. cross-repository marker replay fails closed" "R4 BLOCKER"

printf '{"head":"%s","tree":"%s"}\n' "$MALFORMED_HEAD" "$MALFORMED_TREE" > "$NEUTRAL_MARKER"
run_hook_bash "git push origin v1.2.3"
expect_block "23. malformed neutral marker fails closed" "R4 BLOCKER"

payload_bypass=$(jq -n '{tool_name:"Bash", session_id:"sess-X", tool_input:{command:"git push origin main"}}')
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
printf '%s' "$payload_bypass" | GOVERNANCE_BYPASS_SOLO_WORKFLOW=1 bash "$HOOK" >"$STDOUT" 2>"$STDERR"
EXIT=$?
set -e
STDERR_TEXT=$(cat "$STDERR")
STDOUT_TEXT=$(cat "$STDOUT")
rm -f "$STDOUT" "$STDERR"
expect_pass_silent "24. audited recovery override passes local hook"

run_hook_bash "GOVERNANCE_BYPASS_SOLO_WORKFLOW=1 git push origin main"
expect_block "25. command text cannot self-authorize recovery override" "R2 BLOCKER"

[ ! -e "$TMP_DIR/infra/governance/runtime" ] || {
  echo "  FAIL  release attestation mutated workspace runtime"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - workspace runtime mutation"
}

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo -e "Failed:$FAILED_TESTS"
  exit 1
fi

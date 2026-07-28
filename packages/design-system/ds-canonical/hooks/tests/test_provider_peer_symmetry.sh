#!/bin/bash
# Provider-neutral behavioral matrix for the legacy-named peer hooks.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIEF_HOOK="$SCRIPT_DIR/../check_codex_brief_invariants.sh"
COLLAB_HOOK="$SCRIPT_DIR/../check_codex_collab_5step.sh"
STOP_HOOK="$SCRIPT_DIR/../stop_self_audit.sh"
TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT
mkdir -p "$TMP_ROOT/project/state"

PASS=0
FAIL=0

set_pair() {
  export GOVERNANCE_PROJECT_DIR="$TMP_ROOT/project"
  export GOVERNANCE_STATE_DIR="$TMP_ROOT/project/state"
  export GOVERNANCE_READ_ONLY=1
  export GOVERNANCE_SELF_PROVIDER="$1"
  export GOVERNANCE_SELF_DISPLAY_NAME="$1"
  export GOVERNANCE_PEER_PROVIDER="$2"
  export GOVERNANCE_PEER_DISPLAY_NAME="$2"
  export GOVERNANCE_PEER_CLI="$2"
  export GOVERNANCE_PEER_LOCAL_EXECUTABLE="node_modules/.bin/$2"
  export GOVERNANCE_PEER_BRIEF_MARKERS_JSON='["review"]'
  export GOVERNANCE_PEER_DISCOVERY_MARKERS_JSON="[\"node_modules/.bin/$2\",\"command -v $2\"]"
  export GOVERNANCE_PEER_REPLY_ARTIFACT_PREFIX="$2-reply"
  export GOVERNANCE_INSTRUCTION_ENTRY=AGENTS.md
  export GOVERNANCE_SHARED_INSTRUCTION_ENTRY=AGENTS.md
}

record() {
  if [ "$1" = "1" ]; then
    echo "  PASS  $2"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $2"
    FAIL=$((FAIL + 1))
  fi
}

for pair in "alpha beta" "beta alpha"; do
  set -- $pair
  self="$1"; peer="$2"
  set_pair "$self" "$peer"

  payload=$(jq -nc --arg cmd "$peer review trivial" '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$cmd}}')
  printf '%s' "$payload" | bash "$BRIEF_HOOK" >/dev/null 2>"$TMP_ROOT/brief.err"
  rc=$?
  record "$([ "$rc" = "2" ] && grep -q 'PEER BRIEF MISSING' "$TMP_ROOT/brief.err" && echo 1 || echo 0)" "${self}→${peer} peer brief is governed"

  payload=$(jq -nc --arg cmd "$self review trivial" '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$cmd}}')
  printf '%s' "$payload" | bash "$BRIEF_HOOK" >/dev/null 2>"$TMP_ROOT/self.err"
  rc=$?
  record "$([ "$rc" = "0" ] && [ ! -s "$TMP_ROOT/self.err" ] && echo 1 || echo 0)" "${self}→${peer} self CLI is not inverted into peer gate"

  payload=$(jq -nc --arg cmd "git commit -m '$peer collab'" '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$cmd}}')
  printf '%s' "$payload" | bash "$COLLAB_HOOK" >/dev/null 2>"$TMP_ROOT/collab.err"
  rc=$?
  record "$([ "$rc" = "0" ] && grep -q "self=$self,peer=$peer" "$TMP_ROOT/collab.err" && echo 1 || echo 0)" "${self}→${peer} collaboration marker is dynamic"

  transcript="$TMP_ROOT/$self-$peer.jsonl"
  printf '%s\n' \
    '{"type":"user","message":{"role":"user","content":"review this"}}' \
    "{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"tool_use\",\"name\":\"Read\",\"input\":{\"file_path\":\"$peer-reply-review.md\"}}]}}" \
    '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"review received"}]}}' \
    > "$transcript"
  payload=$(jq -nc --arg transcript "$transcript" '{hook_event_name:"Stop",transcript_path:$transcript,session_id:"symmetry"}')
  output=$(printf '%s' "$payload" | bash "$STOP_HOOK" 2>/dev/null)
  rc=$?
  record "$([ "$rc" = "0" ] && printf '%s' "$output" | grep -q '"governanceDecision":"block"' && echo 1 || echo 0)" "${self}→${peer} peer reply audit emits neutral Stop decision"
done

echo "Results: $PASS PASS, $FAIL FAIL"
[ "$FAIL" = "0" ]

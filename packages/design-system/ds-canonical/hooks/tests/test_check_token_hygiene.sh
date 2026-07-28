#!/bin/bash
# Focused contract for the advisory token-hygiene helper. The hard PreToolUse registry hook owns
# blocking enforcement; this PostToolUse helper must still consume the same authenticated registry
# and emit one provider-neutral context without mutable-project fallbacks.

set -uo pipefail
HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../lib/_token_hygiene.sh"
REPO_ROOT=$(git -C "$(dirname "$HOOK")" rev-parse --show-toplevel)
REGISTRY="$REPO_ROOT/packages/design-system/src/tokens/utility-registry.json"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
PROJECT="$TMP/project"
FILE="$PROJECT/packages/design-system/src/components/Foo/foo.tsx"
BAD_CORPUS="$TMP/bad-corpus"
mkdir -p "$(dirname "$FILE")" "$BAD_CORPUS"

run_hook() {
  local content="$1" corpus="${2:-$REPO_ROOT}" payload
  printf '%s\n' "$content" > "$FILE"
  payload=$(jq -nc --arg path "$FILE" \
    '{hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:$path}}')
  STDOUT_FILE="$TMP/stdout"
  STDERR_FILE="$TMP/stderr"
  set +e
  printf '%s' "$payload" \
    | GOVERNANCE_PROJECT_DIR="$PROJECT" GOVERNANCE_CORPUS_ROOT="$corpus" \
      GOVERNANCE_READ_ONLY=1 bash "$HOOK" >"$STDOUT_FILE" 2>"$STDERR_FILE"
  EXIT=$?
  set -e
}

run_hook 'export const Clean = () => <div className="bg-surface" />'
if [ "$EXIT" -ne 0 ] || [ -s "$STDOUT_FILE" ] || [ -s "$STDERR_FILE" ]; then
  echo "FAIL clean helper contract"
  exit 1
fi

while IFS= read -r ALIAS; do
  run_hook "export const Bad = () => <div className=\"$ALIAS\" />"
  if [ "$EXIT" -ne 0 ] || [ -s "$STDERR_FILE" ] \
    || ! jq -e --arg alias "$ALIAS" '
      type == "object"
      and (keys == ["governanceContext"])
      and .governanceContext.hookEventName == "PostToolUse"
      and (.governanceContext.message | contains($alias))
    ' "$STDOUT_FILE" >/dev/null 2>&1; then
    echo "FAIL registry alias closure:$ALIAS"
    exit 1
  fi
done < <(jq -r '.shadcn_alias.block.color_alias[]' "$REGISTRY")

SHADOW="$PROJECT/packages/design-system/src/tokens/utility-registry.json"
mkdir -p "$(dirname "$SHADOW")"
printf '{"schemaVersion":1,"shadcn_alias":{"block":{"color_alias":["shadow-only"]}}}\n' > "$SHADOW"
run_hook 'export const Bad = () => <div className="bg-card" />'
if [ "$EXIT" -ne 0 ] || [ -s "$STDERR_FILE" ] \
  || ! jq -e '.governanceContext.message | contains("bg-card")' "$STDOUT_FILE" >/dev/null 2>&1; then
  echo "FAIL mutable project registry shadowed authenticated corpus"
  exit 1
fi

run_hook 'export const Bad = () => <div className="bg-card" />' "$BAD_CORPUS"
if [ "$EXIT" -ne 70 ] || [ -s "$STDOUT_FILE" ] \
  || ! grep -qF 'GOVERNANCE_INTEGRITY:' "$STDERR_FILE"; then
  echo "FAIL missing authenticated registry did not fail closed"
  exit 1
fi

echo '✅ token hygiene helper: authenticated registry closure PASS'

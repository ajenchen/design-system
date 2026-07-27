#!/usr/bin/env bash
set -uo pipefail
HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/check_consumer_code_quality.sh"
REPO_ROOT=$(git -C "$(dirname "$HOOK")" rev-parse --show-toplevel)
REGISTRY="$REPO_ROOT/packages/design-system/src/tokens/utility-registry.json"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export GOVERNANCE_PROJECT_DIR="$TMP"
export GOVERNANCE_CORPUS_ROOT="$REPO_ROOT"
FILE="$TMP/apps/demo/src/App.tsx"
mkdir -p "$(dirname "$FILE")"
payload() { jq -nc --arg p "$FILE" '{hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:$p}}'; }
expect() {
  local want="$1" label="$2"
  set +e; payload | bash "$HOOK" >/dev/null 2>&1; local got=$?; set -e
  [ "$got" -eq "$want" ] || { echo "FAIL $label: expected $want got $got"; exit 1; }
}

printf 'export const clean: string = "ok"\n' > "$FILE"; expect 0 clean
printf 'export const bad: any = 1\n' > "$FILE"; expect 2 any
printf '<div className="flex gap-2 px-[var(--layout-space-loose)] hover:bg-neutral-hover rounded-md" />\n' > "$FILE"; expect 2 raw-row
printf '<div className="px-[var(--layout-space-loose)] border-b border-divider" />\n' > "$FILE"; expect 2 overlay
printf '<AppShell layout="primary-header"><SidebarFooter /></AppShell>\n' > "$FILE"; expect 2 primary-header
printf '<div className="h-[var(--chrome-header-height)] border-b border-divider" />\n' > "$FILE"; expect 2 chrome
printf '<div className="bg-popover text-popover-foreground" />\n' > "$FILE"; expect 2 shadcn-alias
while IFS= read -r ALIAS; do
  printf '<div className="%s" />\n' "$ALIAS" > "$FILE"
  expect 2 "registry-alias-$ALIAS"
done < <(jq -r '.shadcn_alias.block.color_alias[]' "$REGISTRY")

# A consumer can own and mutate its installed package tree. That tree must never shadow the
# runner-authenticated registry selected before hook execution.
SHADOW_REGISTRY="$TMP/node_modules/@qijenchen/design-system/src/tokens/utility-registry.json"
mkdir -p "$(dirname "$SHADOW_REGISTRY")"
printf '{"schemaVersion":1,"shadcn_alias":{"block":{"color_alias":["harmless-shadow-only"]}}}\n' > "$SHADOW_REGISTRY"
printf '<div className="bg-card text-card-foreground text-primary-foreground" />\n' > "$FILE"
expect 2 mutable-installed-registry-cannot-shadow-corpus
printf '// menu-item-handcraft-allow: virtualized third-party row contract\n<div className="flex gap-2 px-[var(--layout-space-loose)] hover:bg-neutral-hover rounded-md" />\n' > "$FILE"; expect 0 reasoned-escape

{
  printf 'export const clean: string = "ok"\n// '
  awk 'BEGIN { for (i = 0; i < 300000; i++) printf "x" }'
  printf '\n'
} >"$FILE"
expect 0 large-clean

{
  printf 'export const bad: any = 1\n// '
  awk 'BEGIN { for (i = 0; i < 300000; i++) printf "x" }'
  printf '\n'
} >"$FILE"
set +e
payload | bash "$HOOK" >"$TMP/large.stdout" 2>"$TMP/large.stderr"
got=$?
set -e
if [ "$got" -ne 2 ] \
  || [ -s "$TMP/large.stdout" ] \
  || ! grep -qF 'GOV-CONSUMER-QUALITY-001:' "$TMP/large.stderr" \
  || grep -qF 'GOVERNANCE_INTEGRITY:' "$TMP/large.stderr"; then
  echo "FAIL large-early-policy: expected stderr-only rc2 without integrity"
  exit 1
fi

echo '✅ consumer code-quality standalone + authenticated registry closure PASS'

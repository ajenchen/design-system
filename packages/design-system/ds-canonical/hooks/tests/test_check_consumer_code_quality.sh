#!/usr/bin/env bash
set -uo pipefail
HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/check_consumer_code_quality.sh"
REPO_ROOT=$(git -C "$(dirname "$HOOK")" rev-parse --show-toplevel)
REGISTRY="$REPO_ROOT/packages/design-system/src/tokens/utility-registry.json"
# 顯式 template 尊重 TMPDIR:macOS BSD mktemp 無 template 時走 _CS_DARWIN_USER_TEMP_DIR,
# 忽略 TMPDIR → 受限環境(agent sandbox / CI 容器)無法指定可寫目錄。
TMP=$(mktemp -d "${TMPDIR:-/tmp}/consumer-code-quality-test.XXXXXX")
# mktemp 硬守衛(失敗記憶索引 2026-07-28 錨例:mktemp 失敗回空字串 → rm -rf "" / cd "" 誤刪 cwd,
# 且下游 mkdir -p "$(dirname "$FILE")" 會變成寫 /apps 這種絕對路徑)。空值或非目錄一律 fail-loud。
[ -n "$TMP" ] && [ -d "$TMP" ] || { echo "FAIL setup: mktemp -d did not yield a directory (TMPDIR=${TMPDIR:-unset})"; exit 1; }
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

# 帳號入口 duplicate(2026-07-30 WM F9 layer 3;dual-entry conjunction,mode 字面不在檔內)
ACCT_HEADER_MENU='<SidebarHeader><DropdownMenu><DropdownMenuTrigger asChild><button aria-label="Open account menu"><Avatar alt="Me" size={24} /></button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>Logout</DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarHeader>'
ACCT_FOOTER_USER='<SidebarFooter><SidebarMenu><SidebarMenuItem><ItemAvatar alt="Me" /></SidebarMenuItem></SidebarMenu></SidebarFooter>'
printf '<Sidebar>%s%s</Sidebar>\n' "$ACCT_HEADER_MENU" "$ACCT_FOOTER_USER" > "$FILE"; expect 2 account-entry-dup
printf '<Sidebar><SidebarHeader><WorkspaceBrand /></SidebarHeader>%s</Sidebar>\n' "$ACCT_FOOTER_USER" > "$FILE"; expect 0 account-entry-footer-only
printf '<Sidebar><SidebarHeader><WorkspaceBrand /><div className="flex-1" /><AccountMenu /></SidebarHeader><SidebarContent /></Sidebar>\n' > "$FILE"; expect 0 account-entry-mobile-mirror
printf '<Sidebar><SidebarHeader><DropdownMenu><DropdownMenuTrigger asChild><button aria-label="Switch workspace"><Avatar alt="Acme" /></button></DropdownMenuTrigger></DropdownMenu></SidebarHeader>%s</Sidebar>\n' "$ACCT_FOOTER_USER" > "$FILE"; expect 0 account-entry-workspace-switcher
printf 'const layouts = ["primary-header", "primary-sidebar"]\n<Sidebar>%s%s</Sidebar>\n' "$ACCT_HEADER_MENU" "$ACCT_FOOTER_USER" > "$FILE"; expect 0 account-entry-multi-mode-demo-skip
printf '// @account-entry-allow: migration 過渡期刻意雙入口\n<Sidebar>%s%s</Sidebar>\n' "$ACCT_HEADER_MENU" "$ACCT_FOOTER_USER" > "$FILE"; expect 0 account-entry-escape
printf '{/* 帳號入口 comment mention only */}\n<Sidebar><SidebarHeader><WorkspaceBrand /></SidebarHeader>%s</Sidebar>\n' "$ACCT_FOOTER_USER" > "$FILE"; expect 0 account-entry-comment-decoy
printf '<Sidebar>%s%s</Sidebar>\n' "$ACCT_HEADER_MENU" "$ACCT_FOOTER_USER" > "$FILE"
set +e
payload | bash "$HOOK" >/dev/null 2>"$TMP/acct.stderr"
set -e
grep -qF 'duplicate account entry' "$TMP/acct.stderr" \
  || { echo "FAIL account-entry-dup-needle: stderr lacks 'duplicate account entry'"; exit 1; }
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

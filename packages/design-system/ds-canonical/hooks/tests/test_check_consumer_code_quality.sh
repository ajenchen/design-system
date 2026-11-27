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
# E16 + E14 (1)(2026-11-27):`any` 對遮罩後的行判 —— 行尾 // 與 {/* … */} 裡的字不算;程式裡的 any 照擋;any-allow 仍對原文判
printf 'export const n: number = 1 // the API may return: any shape\n' > "$FILE"; expect 0 any-in-trailing-comment
printf 'export const V = () => <div>{/* props: any were removed */}</div>\n' > "$FILE"; expect 0 any-in-jsx-comment
printf 'export const bad: any = 1 // legacy\n' > "$FILE"; expect 2 any-code-with-trailing-comment
printf 'export const ok: any = 1 // any-allow: third-party callback payload is untyped upstream\n' > "$FILE"; expect 0 any-allow-same-line
printf '<div className="flex gap-2 px-[var(--layout-space-loose)] hover:bg-neutral-hover rounded-md" />\n' > "$FILE"; expect 2 raw-row
# 2026-09-25 滑過底色放寬:任何 `-hover` 配對 token 都是手刻列簽名(含 var() 與 ! 寫法);非配對 token 不算(對照組)
printf '<div className="flex gap-2 px-[var(--layout-space-loose)] hover:bg-secondary-hover rounded-md" />\n' > "$FILE"; expect 2 raw-row-secondary-hover
printf '<div className="flex gap-2 px-[var(--layout-space-loose)] hover:!bg-[var(--surface-hover)] rounded-md" />\n' > "$FILE"; expect 2 raw-row-var-hover
printf '<div className="flex gap-2 px-[var(--layout-space-loose)] hover:opacity-80 rounded-md" />\n' > "$FILE"; expect 0 raw-row-no-hover-pair-token
printf '<div className="px-[var(--layout-space-loose)] border-b border-divider" />\n' > "$FILE"; expect 2 overlay
# 頁面內有框區塊的標頭(header-canonical.spec.md「何時不用」;user 2026-11-26 E6)→ 不擋;同一塊放進浮層 → 照擋。
printf 'export const S = () => (\n  <div className="rounded-md border border-border bg-surface">\n    <div className="flex items-center px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] border-b border-divider"><h2 className="text-h6">帳單資訊</h2></div>\n    <p>下次扣款日 12/01</p>\n  </div>\n)\n' > "$FILE"; expect 0 overlay-page-block-header
printf 'export const S = () => (\n  <PopoverContent>\n    <div className="rounded-md border border-border bg-surface">\n      <div className="flex items-center px-[var(--layout-space-loose)] py-2 border-b border-divider"><span>帳單資訊</span></div>\n    </div>\n  </PopoverContent>\n)\n' > "$FILE"; expect 2 overlay-page-block-in-popover
printf '<AppShell layout="primary-header"><SidebarFooter /></AppShell>\n' > "$FILE"; expect 2 primary-header
# Menu 浮層補品牌的豁免(2026-10-15):只認「這一份畫在浮層裡」useSidebarSurface();整個 Menu 的 display.menu 兩份同時成立、細列也長出標頭 → 不豁免
printf 'const { display } = useAppShell()\n<AppShell layout="primary-header" globalHeader={<GH />}>{display.menu === "overlay" && <SidebarHeader>brand</SidebarHeader>}</AppShell>\n' > "$FILE"; expect 2 primary-header-display-menu-not-exempt
printf 'const onOverlay = useSidebarSurface() === "overlay"\n<AppShell layout="primary-header" globalHeader={<GH />}>{onOverlay && <SidebarHeader>brand</SidebarHeader>}</AppShell>\n' > "$FILE"; expect 0 primary-header-surface-exempt

# 帳號入口 duplicate(2026-07-30 WM F9 layer 3;dual-entry conjunction,mode 字面不在檔內)
ACCT_HEADER_MENU='<SidebarHeader><DropdownMenu><DropdownMenuTrigger asChild><button aria-label="Open account menu"><Avatar alt="Me" size={24} /></button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>Logout</DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarHeader>'
ACCT_FOOTER_USER='<SidebarFooter><SidebarMenu><SidebarMenuItem><ItemAvatar alt="Me" /></SidebarMenuItem></SidebarMenu></SidebarFooter>'
printf '<Sidebar>%s%s</Sidebar>\n' "$ACCT_HEADER_MENU" "$ACCT_FOOTER_USER" > "$FILE"; expect 2 account-entry-dup
printf '<Sidebar><SidebarHeader><WorkspaceBrand /></SidebarHeader>%s</Sidebar>\n' "$ACCT_FOOTER_USER" > "$FILE"; expect 0 account-entry-footer-only
printf '<Sidebar><SidebarHeader><WorkspaceBrand /><div className="flex-1" /><AccountMenu /></SidebarHeader><SidebarContent /></Sidebar>\n' > "$FILE"; expect 0 account-entry-overlay-mirror
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
# 2026-11-27 r72:shadcn 別名的逐行豁免(以前沒有任何出口)。附理由放行;空理由 / 太短 / 有一行沒標記照擋
printf '<div className="bg-popover text-popover-foreground" /> {/* @shadcn-alias-ok: 第三方日曆套件只吃 shadcn 變數名 */}\n' > "$FILE"; expect 0 shadcn-alias-exempt-same-line
printf '// @shadcn-alias-ok: 第三方日曆套件只吃 shadcn 變數名\n<div className="bg-popover text-popover-foreground" />\n' > "$FILE"; expect 0 shadcn-alias-exempt-previous-line
printf '// @shadcn-alias-ok:\n<div className="bg-popover text-popover-foreground" />\n' > "$FILE"; expect 2 shadcn-alias-empty-reason
printf '// @shadcn-alias-ok: 暫時\n<div className="bg-popover text-popover-foreground" />\n' > "$FILE"; expect 2 shadcn-alias-short-reason
printf '// @shadcn-alias-ok: 第三方日曆套件只吃 shadcn 變數名\n<div className="bg-popover" />\n<p />\n<span className="bg-popover" />\n' > "$FILE"; expect 2 shadcn-alias-one-line-unmarked
printf '<div className="bg-popover" />\n' > "$FILE"
set +e
payload | bash "$HOOK" >/dev/null 2>"$TMP/alias.stderr"
set -e
grep -qF '@shadcn-alias-ok: <至少 8 個字的理由>' "$TMP/alias.stderr" \
  || { echo "FAIL shadcn-alias-teaches-escape: stderr lacks the escape shape"; exit 1; }
printf '<div className="px-[var(--layout-space-loose)] border-b border-divider" />\n' > "$FILE"
set +e
payload | bash "$HOOK" >/dev/null 2>"$TMP/overlay.stderr"
set -e
grep -qF '@overlay-handcraft-allow: <至少 8 個字的理由>' "$TMP/overlay.stderr" \
  || { echo "FAIL overlay-teaches-escape: stderr lacks the escape shape"; exit 1; }
printf '// @overlay-handcraft-allow: 這是報表匯出預覽,不是可關閉的浮層\n<div className="px-[var(--layout-space-loose)] border-b border-divider" />\n' > "$FILE"; expect 0 overlay-escape-with-reason
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

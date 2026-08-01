#!/usr/bin/env bash
# Provider-neutral, standalone consumer source gate. This is intentionally independent of the
# DS-author post_edit_dispatcher/lib tree so it can ship in the immutable fork corpus and replay in
# hooks-off CI. Native Claude/Codex events are only accelerators; exit 2 is also asserted directly.

set -uo pipefail
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_provider_paths.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: consumer quality project resolver unavailable\n' >&2
  exit 70
}
source "$(dirname "$0")/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: hook integrity helper unavailable\n' >&2
  exit 70
}

governance_hook_load_input
governance_hook_require_commands grep head perl python3 tr wc
EVENT=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // .event // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality event extraction failed'
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .file_path // .path // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality path extraction failed'

[ "$EVENT" != "PostToolUse" ] && exit 0
printf '%s' "$FILE_PATH" | grep -Eq '(^|/)apps/[^/]+/src/.*\.[cm]?[jt]sx?$' || exit 0
FILE_PATH=$(governance_hook_project_file_path "$FILE_PATH" 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality target escapes the project or crosses a symlink'
if [ -L "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ] || [ ! -r "$FILE_PATH" ]; then
  governance_hook_integrity_fail 'consumer quality target is unavailable or unsafe'
fi

# Remove comments before structural signatures. Escape markers are checked against the original.
BODY=$(perl -0777 -pe 's{\{/\*.*?\*/\}}{}gs; s{/\*.*?\*/}{}gs; s{^[ \t]*//.*$}{}gm' "$FILE_PATH" 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality target could not be parsed'
VIOLATIONS=""
add_violation() { VIOLATIONS="${VIOLATIONS}\n- $1"; }
has_rationale() {
  local marker="$1"
  grep -Eq "${marker}:[[:space:]]*.{8,}" "$FILE_PATH" 2>/dev/null
}

# The deny-list stays in the runner-authenticated corpus. The fork builder mechanically rewrites
# this canonical source path to references/utility-registry.json; neither role may rediscover a
# mutable consumer installation or a hook-relative fallback after the trust boundary is crossed.
CORPUS_ROOT=$(governance_corpus_root 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality corpus root could not be resolved'
PROJECT_ROOT=$(governance_project_root 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality project root could not be resolved'
REGISTRY="$CORPUS_ROOT/packages/design-system/src/tokens/utility-registry.json"
if [ -L "$REGISTRY" ] || [ ! -f "$REGISTRY" ] || [ ! -r "$REGISTRY" ]; then
  governance_hook_integrity_fail "consumer quality canonical utility registry is unavailable or unsafe:${REGISTRY}"
fi
CANONICAL_REGISTRY_OWNER='packages/design-system'"/src/tokens/utility-registry.json"
SHADCN_ALIASES=$(jq -er --arg owner "$CANONICAL_REGISTRY_OWNER" '
  select(
    type == "object"
    and .schemaVersion == 1
    and ._meta.owner == $owner
    and (._meta.provider_view_policy | type == "string" and length > 0)
  )
  | .shadcn_alias.block.color_alias
  | arrays
  | if length > 0 and (unique | length) == length
    then .[]
    else error("empty or duplicate alias registry")
    end
' "$REGISTRY" 2>/dev/null) || {
  governance_hook_integrity_fail 'consumer quality canonical alias registry is invalid'
}
while IFS= read -r ALIAS; do
  printf '%s' "$ALIAS" | grep -Eq '^[a-z][a-z0-9-]*$' || {
    governance_hook_integrity_fail 'consumer quality canonical alias registry is unsafe'
  }
  if grep -Eq "(^|[^A-Za-z0-9_-])${ALIAS}([^A-Za-z0-9_-]|$)" <<<"$BODY"; then
    add_violation "shadcn compatibility alias ${ALIAS}; consume the direct design-system semantic token"
  fi
done <<< "$SHADCN_ALIASES"

# TypeScript escape hatch requires a concrete rationale on the same or immediately preceding line.
ANY_HITS=$(perl -ne '
  BEGIN { our $prev = 0; our $hit_count = 0 }
  my $allow = /any-allow:\s*.{8,}/; next if /^\s*(\/\/|\*|\/\*)/;
  if (!$prev && !$allow && (/(:\s*any\b|\bas\s+any\b|<any>|\bany\[\]|Record<[^,]+,\s*any>)/)) {
    print "$.:$_";
    $hit_count++;
    exit 0 if $hit_count >= 5;
  }
  $prev = $allow;
' "$FILE_PATH" 2>/dev/null) || governance_hook_integrity_fail 'consumer quality any parser failed'
[ -n "$ANY_HITS" ] && add_violation "TypeScript any without // any-allow: <specific rationale>: ${ANY_HITS//$'\n'/ | }"

if printf '%s' "$FILE_PATH" | grep -qE '\.tsx$'; then
  LINES=$(wc -l < "$FILE_PATH" | tr -d ' ') \
    || governance_hook_integrity_fail 'consumer quality line counter failed'
  FILE_HEAD=$(sed -n '1,20p' "$FILE_PATH")
  if [ "${LINES:-0}" -gt 800 ] && ! grep -Eq 'code-quality-allow:[[:space:]]*file-size[[:space:]]+.{8,}' <<<"$FILE_HEAD"; then
    add_violation "tsx file has ${LINES} lines (>800) without a reasoned file-size exception"
  fi
fi

FLAT=$(printf '%s' "$BODY" | tr '\n' ' ')

OVERLAY=$(printf '%s' "$BODY" | perl -0777 -ne 'print "hit" if /<div\b[^>]*className="(?=[^"]*px-\[var\(--layout-space-loose\)\])(?=[^"]*border-(?:b|t))(?=[^"]*border-divider)[^"]*"/s') \
  || governance_hook_integrity_fail 'consumer quality overlay parser failed'
if [ -n "$OVERLAY" ] && ! has_rationale 'overlay-handcraft-allow'; then
  add_violation 'hand-crafted overlay chrome; consume Popover/Dialog/Sheet/Surface header/body/footer primitives'
fi

RAW_ROW=$(printf '%s' "$BODY" | perl -0777 -ne 'print "hit" if /<div\b[^>]*className="(?=[^"]*\bflex\b)(?=[^"]*\bgap-[12]\b)(?=[^"]*px-\[var\(--layout-space-loose\)\])(?=[^"]*hover:bg-neutral-hover)(?=[^"]*rounded)[^"]*"/s') \
  || governance_hook_integrity_fail 'consumer quality row parser failed'
if [ -n "$RAW_ROW" ] && ! has_rationale 'menu-item-handcraft-allow'; then
  add_violation 'hand-crafted MenuItem-like row; consume the DS row/menu primitive'
fi

if grep -q 'h-\[var(--chrome-header-height)\]' <<<"$FLAT" \
  && grep -q 'border-b' <<<"$FLAT" \
  && grep -q 'border-divider' <<<"$FLAT" \
  && ! has_rationale '@chrome-header-handcraft-allow'; then
  add_violation 'hand-crafted chrome header; consume ChromeHeader'
fi

if grep -Eq 'layout="primary-header"|layout=\{('\''|")primary-header('\''|")\}' <<<"$BODY"; then
  PRIMARY=""
  if ! grep -qE 'globalHeader[[:space:]]*=' <<<"$BODY"; then
    PRIMARY="${PRIMARY}\n- AppShell primary-header layout requires globalHeader"
  fi
  if grep -Eq '<SidebarHeader([^A-Za-z]|$)' <<<"$BODY" && ! grep -qE 'useSidebar|isMobile' <<<"$BODY"; then
    PRIMARY="${PRIMARY}\n- primary-header layout must not duplicate an unguarded SidebarHeader"
  fi
  if grep -Eq '<SidebarFooter([^A-Za-z]|$)' <<<"$BODY"; then
    PRIMARY="${PRIMARY}\n- primary-header account entry belongs in the global/sheet header, not SidebarFooter"
  fi
  if [ -n "$PRIMARY" ] && ! has_rationale '@app-shell-primary-header-allow'; then VIOLATIONS="${VIOLATIONS}${PRIMARY}"; fi
fi

# 帳號入口 duplicate(2026-07-30 WM F9 layer 3;app-shell.spec.md「帳號入口放置 SSOT」:帳號入口只能出現一次)。
# 上段攔「宣告 primary-header + SidebarFooter」;本段補 mode 字面不在檔內的 dual-entry 缺口(WM 錨例 =
# apps/work/src/App.tsx pre-fix 1a26bd1^:SidebarHeader 右上 avatar 帳號選單與 SidebarFooter user 區並存):
#   header 帳號簽名 = SidebarHeader block 內 <AccountMenu> OR(<DropdownMenuTrigger> + <Avatar>/<ItemAvatar>
#   + account/logout 語彙);footer user 簽名 = SidebarFooter block 內 <Avatar>/<ItemAvatar>/<AccountMenu>。
# 零誤判 bound(M23 R9 零誤判簽名 precedent;DS apps/template/src + WM 全 corpus 實測 0 hit、錨例 fire):
#   - workspace switcher in header(trigger+avatar、無 account/logout 語彙)不中 — 語彙 conjunction;
#   - mobile Sheet 鏡像(header AccountMenu、footer 無 user 區,app-shell.spec.md Responsive 子句)不中;
#   - 多 mode demo 檔(primary-header + primary-sidebar 字面並存)skip → 跨 story 誤攔防護,歸 product-ui-audit;
#   - BODY 已 strip 註解(WM 修復檔 SidebarHeader 註解即含「帳號入口」字樣);local 同名元件不中和 —
#     duplicate 語義違規與 primitive 來源無關。
ACCOUNT_DUP=$(printf '%s' "$BODY" | python3 -c '
import re, sys
content = sys.stdin.read()
account = re.compile(r"[Aa]ccount|[Ll]og\s?-?[Oo]ut|LogOut|[Ss]ign\s?-?[Oo]ut|SignOut|登出|個人資料|帳號")
headers = re.findall(r"<SidebarHeader\b[^>]*>.*?</SidebarHeader>", content, re.DOTALL)
footers = re.findall(r"<SidebarFooter\b[^>]*>.*?</SidebarFooter>", content, re.DOTALL)
header_account = any(
    re.search(r"<AccountMenu\b", b)
    or (re.search(r"<DropdownMenuTrigger\b", b)
        and re.search(r"<(Avatar|ItemAvatar)\b", b)
        and account.search(b))
    for b in headers)
footer_user = any(re.search(r"<(Avatar|ItemAvatar|AccountMenu)\b", b) for b in footers)
multi_mode = ("primary-header" in content) and ("primary-sidebar" in content)
if header_account and footer_user and not multi_mode:
    print("DUP")
' 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality account-entry scanner failed'
if [ "$ACCOUNT_DUP" = "DUP" ] && ! has_rationale '@account-entry-allow'; then
  add_violation 'duplicate account entry: SidebarHeader account menu + SidebarFooter user area coexist; app-shell.spec.md 帳號入口只能出現一次(primary-sidebar → SidebarFooter / primary-header → globalHeader 右);escape @account-entry-allow: <rationale>'
fi

if [ -n "$VIOLATIONS" ]; then
  printf 'GOV-CONSUMER-QUALITY-001:%b\nFile:%s\n' "$VIOLATIONS" "$FILE_PATH" >&2
  exit 2
fi
exit 0

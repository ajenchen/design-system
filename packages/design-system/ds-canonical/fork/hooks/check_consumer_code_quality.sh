#!/usr/bin/env bash
# Provider-neutral, standalone consumer source gate. This is intentionally independent of the
# DS-author post_edit_dispatcher/lib tree so it can ship in the immutable fork corpus and replay in
# hooks-off CI. Native Claude/Codex events are only accelerators; exit 2 is also asserted directly.
#
# Two checks share one exit 2 report (2026-11-16, folded in instead of a 61st hook — hard cap 60):
#   1. consumer code quality — unchanged scope: apps/*/src/**/*.[cm]?[jt]sx?
#   2. DS removed / renamed names (lib/_ds_removed_names.sh) — code = (apps/<app>/)src/**/*.[cm]?[jt]sx? or .css,
#      doc = docs/**/*.md or governance/overlay.md; node_modules / dist excluded; names only from the corpus.

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
source "$(dirname "$0")/lib/_ds_removed_names.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: removed-names helper unavailable\n' >&2
  exit 70
}
source "$(dirname "$0")/lib/_comment_mask.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: consumer quality comment mask unavailable\n' >&2
  exit 70
}

governance_hook_load_input
governance_hook_require_commands grep head perl python3 tr wc
EVENT=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // .event // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality event extraction failed'
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .file_path // .path // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality path extraction failed'

[ "$EVENT" != "PostToolUse" ] && exit 0
QUALITY=0
printf '%s' "$FILE_PATH" | grep -Eq '(^|/)apps/[^/]+/src/.*\.[cm]?[jt]sx?$' && QUALITY=1
KIND=""
case "$FILE_PATH" in
  */node_modules/*|*/dist/*) ;;
  *)
    if printf '%s' "$FILE_PATH" | grep -Eq '(^|/)(apps/[^/]+/)?src/.*\.([cm]?[jt]sx?|css)$'; then KIND=code
    elif printf '%s' "$FILE_PATH" | grep -Eq '(^|/)docs/.*\.md$|(^|/)governance/overlay\.md$'; then KIND=doc
    fi ;;
esac
[ "$QUALITY" = 0 ] && [ -z "$KIND" ] && exit 0
FILE_PATH=$(governance_hook_project_file_path "$FILE_PATH" 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality target escapes the project or crosses a symlink'
if [ -L "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ] || [ ! -r "$FILE_PATH" ]; then
  governance_hook_integrity_fail 'consumer quality target is unavailable or unsafe'
fi
VIOLATIONS=""

# ── 1. consumer code quality(原範圍 apps/*/src 的 js/ts/jsx/tsx;以下到「1 結束」一格未改)──
if [ "$QUALITY" = 1 ]; then
# Remove comments before structural signatures. Escape markers are checked against the original.
BODY=$(perl -0777 -pe 's{\{/\*.*?\*/\}}{}gs; s{/\*.*?\*/}{}gs; s{^[ \t]*//.*$}{}gm' "$FILE_PATH" 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality target could not be parsed'
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
REGISTRY="$CORPUS_ROOT/references/utility-registry.json"
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
# 逐行豁免(2026-11-27 r72;以前這條沒有任何出口):用到別名的每一行,同一行或上一行寫
# `@shadcn-alias-ok: <理由>`(冒號後至少 8 個字,與本檔 has_rationale 同一個門檻)。判定照舊用去註解後的 BODY;
# 豁免要「每一個用到該別名的程式行」都有標記才算,一行沒有就照擋(只出現在行尾註解、沒有程式行 = 不算豁免,照舊擋)。
ALIAS_MASKED=$(governance_mask_comments < "$FILE_PATH") \
  || governance_hook_integrity_fail 'consumer quality alias comment mask failed'
while IFS= read -r ALIAS; do
  printf '%s' "$ALIAS" | grep -Eq '^[a-z][a-z0-9-]*$' || {
    governance_hook_integrity_fail 'consumer quality canonical alias registry is unsafe'
  }
  if grep -Eq "(^|[^A-Za-z0-9_-])${ALIAS}([^A-Za-z0-9_-]|$)" <<<"$BODY"; then
    ALIAS_EXEMPT=$(ORIG_PATH="$FILE_PATH" ALIAS_NAME="$ALIAS" perl -e '
      open(my $fh, "<", $ENV{ORIG_PATH}) or exit 3;
      my @orig = <$fh>; close $fh;
      my @masked = split /\n/, do { local $/; my $m = <STDIN>; defined $m ? $m : "" }, -1;
      my $alias = quotemeta $ENV{ALIAS_NAME};
      my $ok = qr/\@shadcn-alias-ok:\s*(?!\*\/)\S.{7,}/;
      my ($seen, $all) = (0, 1);
      for my $i (0 .. $#orig) {
        my $code = defined $masked[$i] ? $masked[$i] : "";
        next unless $code =~ /(^|[^A-Za-z0-9_-])$alias([^A-Za-z0-9_-]|$)/;
        $seen = 1;
        $all = 0 unless $orig[$i] =~ $ok || ($i > 0 && $orig[$i - 1] =~ $ok);
      }
      print(($seen && $all) ? "exempt" : "");
    ' <<< "$ALIAS_MASKED" 2>/dev/null) || governance_hook_integrity_fail 'consumer quality alias exemption parser failed'
    [ "$ALIAS_EXEMPT" = exempt ] \
      || add_violation "shadcn compatibility alias ${ALIAS}; consume the direct design-system semantic token(真有理由:那一行或上一行寫 // @shadcn-alias-ok: <至少 8 個字的理由>)"
  fi
done <<< "$SHADCN_ALIASES"

# TypeScript escape hatch requires a concrete rationale on the same or immediately preceding line.
# 2026-11-27(上游判定 E16 + E14 (1)):`any` 對遮罩後的行判(行尾 //、{/* … */} 裡的字不算),any-allow 豁免仍對原文判。
ANY_MASKED=$(governance_mask_comments < "$FILE_PATH") \
  || governance_hook_integrity_fail 'consumer quality comment mask failed'
ANY_HITS=$(ORIG_PATH="$FILE_PATH" perl -e '
  open(my $fh, "<", $ENV{ORIG_PATH}) or exit 3;
  my @orig = <$fh>; close $fh;
  my @masked = split /\n/, do { local $/; my $m = <STDIN>; defined $m ? $m : "" }, -1;
  my ($prev, $hit_count) = (0, 0);
  for my $i (0 .. $#orig) {
    my $line = $orig[$i];
    my $code = defined $masked[$i] ? $masked[$i] : "";
    my $allow = $line =~ /any-allow:\s*.{8,}/; next if $line =~ /^\s*(\/\/|\*|\/\*)/;
    if (!$prev && !$allow && ($code =~ /(:\s*any\b|\bas\s+any\b|<any>|\bany\[\]|Record<[^,]+,\s*any>)/)) {
      print(($i + 1) . ":$line");
      $hit_count++;
      last if $hit_count >= 5;
    }
    $prev = $allow;
  }
' <<< "$ANY_MASKED" 2>/dev/null) || governance_hook_integrity_fail 'consumer quality any parser failed'
[ -n "$ANY_HITS" ] && add_violation "TypeScript any without // any-allow: <specific rationale>: ${ANY_HITS//$'\n'/ | }"

if printf '%s' "$FILE_PATH" | grep -qE '\.tsx$'; then
  LINES=$(wc -l < "$FILE_PATH" | tr -d ' ') \
    || governance_hook_integrity_fail 'consumer quality line counter failed'
  FILE_HEAD=$(sed -n '1,20p' "$FILE_PATH")
  if [ "${LINES:-0}" -gt 800 ] && ! grep -Eq 'code-quality-allow:[[:space:]]*file-size[[:space:]]+.{8,}' <<<"$FILE_HEAD"; then
    add_violation "tsx file has ${LINES} lines (>800) without a reasoned file-size exception(真有理由:檔案前 20 行寫 // code-quality-allow: file-size <至少 8 個字的理由>)"
  fi
fi

FLAT=$(printf '%s' "$BODY" | tr '\n' ' ')

# 頁面內不可關閉的有框區塊,標頭由消費者自組(header-canonical.spec.md「何時不用」;user 2026-11-26 E6),可能也寫成
# px-loose + border-divider。先用 lib/tsx-governance-analysis.mjs page-block-header-mask(與 story 閘 R9 同一份判法)把
# 「正向認得出、不在浮層裡」的區塊標頭遮掉再跑簽名;解析不了 → 用原文 = 照擋。
OVERLAY_BODY="$BODY"
if grep -qF 'border-divider' <<< "$BODY" && grep -qF 'px-[var(--layout-space-loose)]' <<< "$BODY"; then
  OVERLAY_ANALYZER="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)/lib/tsx-governance-analysis.mjs"
  for OVERLAY_ROOT in "$(governance_project_root 2>/dev/null)" "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null)"; do
    [ -n "$OVERLAY_ROOT" ] && [ -f "$OVERLAY_ANALYZER" ] || continue
    if OVERLAY_MASKED=$(cd "$OVERLAY_ROOT" && node -- "$OVERLAY_ANALYZER" page-block-header-mask 2>/dev/null <<< "$BODY"); then
      OVERLAY_BODY="$OVERLAY_MASKED"
      break
    fi
  done
fi
OVERLAY=$(printf '%s' "$OVERLAY_BODY" | perl -0777 -ne 'print "hit" if /<div\b[^>]*className="(?=[^"]*px-\[var\(--layout-space-loose\)\])(?=[^"]*border-(?:b|t))(?=[^"]*border-divider)[^"]*"/s') \
  || governance_hook_integrity_fail 'consumer quality overlay parser failed'
if [ -n "$OVERLAY" ] && ! has_rationale 'overlay-handcraft-allow'; then
  add_violation 'hand-crafted overlay chrome; consume Popover/Dialog/Sheet/Surface header/body/footer primitives(頁面內不可關閉的有框區塊標頭不在此限:直接寫在 rounded-md + border 區塊最上方、不在浮層裡,由你用 typography + token + item anatomy 自組,見 header-canonical.spec.md「何時不用」;真有理由:檔內寫 // @overlay-handcraft-allow: <至少 8 個字的理由>)'
fi

# 滑過底色認任何 `-hover` 配對 token(2026-09-25;color.spec.md「Hover 換色配對總則」:有自己靜止底色的列換成那個底自己的 -hover,
# 只認 `hover:bg-neutral-hover` 會漏掉用 --secondary-hover / --surface-strong-hover 等配對 token 的手刻列)
RAW_ROW=$(printf '%s' "$BODY" | perl -0777 -ne 'print "hit" if /<div\b[^>]*className="(?=[^"]*\bflex\b)(?=[^"]*\bgap-[12]\b)(?=[^"]*px-\[var\(--layout-space-loose\)\])(?=[^"]*hover:!?bg-(?:\[var\(--)?[a-z0-9-]+-hover\b)(?=[^"]*rounded)[^"]*"/s') \
  || governance_hook_integrity_fail 'consumer quality row parser failed'
if [ -n "$RAW_ROW" ] && ! has_rationale 'menu-item-handcraft-allow'; then
  add_violation 'hand-crafted MenuItem-like row; consume the DS row/menu primitive(真有理由:檔內寫 // @menu-item-handcraft-allow: <至少 8 個字的理由>)'
fi

if grep -q 'h-\[var(--chrome-header-height)\]' <<<"$FLAT" \
  && grep -q 'border-b' <<<"$FLAT" \
  && grep -q 'border-divider' <<<"$FLAT" \
  && ! has_rationale '@chrome-header-handcraft-allow'; then
  add_violation 'hand-crafted chrome header; consume ChromeHeader(真有理由:檔內寫 // @chrome-header-handcraft-allow: <至少 8 個字的理由>)'
fi

if grep -Eq 'layout="primary-header"|layout=\{('\''|")primary-header('\''|")\}' <<<"$BODY"; then
  PRIMARY=""
  if ! grep -qE 'globalHeader[[:space:]]*=' <<<"$BODY"; then
    PRIMARY="${PRIMARY}\n- AppShell primary-header layout requires globalHeader"
  fi
  # Menu 浮層時補品牌的豁免(app-shell.spec.md 浮層精修;觸發條件 = 這一份畫在浮層裡 useSidebarSurface(),
  # 2026-10-14 前是 768 斷點的 isMobile;2026-10-14 版的 useAppShell().display.menu 兩份同時成立、細列也長出標頭,2026-10-15 起不豁免)
  if grep -Eq '<SidebarHeader([^A-Za-z]|$)' <<<"$BODY" && ! grep -qE "useSidebarSurface" <<<"$BODY"; then
    PRIMARY="${PRIMARY}\n- primary-header layout must not duplicate an unguarded SidebarHeader"
  fi
  if grep -Eq '<SidebarFooter([^A-Za-z]|$)' <<<"$BODY"; then
    PRIMARY="${PRIMARY}\n- primary-header account entry belongs in the global header (or the Menu overlay header), not SidebarFooter"
  fi
  if [ -n "$PRIMARY" ] && ! has_rationale '@app-shell-primary-header-allow'; then
    VIOLATIONS="${VIOLATIONS}${PRIMARY}\n- (真有理由:檔內寫 // @app-shell-primary-header-allow: <至少 8 個字的理由>)"
  fi
fi

# 帳號入口 duplicate(2026-07-30 WM F9 layer 3;app-shell.spec.md「帳號入口放置 SSOT」:帳號入口只能出現一次)。
# 上段攔「宣告 primary-header + SidebarFooter」;本段補 mode 字面不在檔內的 dual-entry 缺口(WM 錨例 =
# apps/work/src/App.tsx pre-fix 1a26bd1^:SidebarHeader 右上 avatar 帳號選單與 SidebarFooter user 區並存):
#   header 帳號簽名 = SidebarHeader block 內 <AccountMenu> OR(<DropdownMenuTrigger> + <Avatar>/<ItemAvatar>
#   + account/logout 語彙);footer user 簽名 = SidebarFooter block 內 <Avatar>/<ItemAvatar>/<AccountMenu>。
# 零誤判 bound(M23 R9 零誤判簽名 precedent;DS apps/template/src + WM 全 corpus 實測 0 hit、錨例 fire):
#   - workspace switcher in header(trigger+avatar、無 account/logout 語彙)不中 — 語彙 conjunction;
#   - Menu 浮層鏡像(header AccountMenu、footer 無 user 區,app-shell.spec.md 浮層精修子句)不中;
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
fi
# ── 1 結束 ──

# ── 2. DS 已移除 / 改名的名字(lib/_ds_removed_names.sh;名單只讀 corpus)──
REMOVED_REPORT=""
if [ -n "$KIND" ]; then
  CORPUS_ROOT=$(governance_corpus_root 2>/dev/null) \
    || governance_hook_integrity_fail 'removed-names corpus root could not be resolved'
  PROJECT_ROOT=$(governance_project_root 2>/dev/null) \
    || governance_hook_integrity_fail 'removed-names project root could not be resolved'
  # 範圍以專案根為準:apps/<app>/src 或 src(DS 作者 repo 的 packages/** 是名字的主人,不是消費端);
  # DS 作者 repo(專案根有 packages/design-system/ds-changes.json)不查 docs —— 那裡寫歷史是正常的。
  REL=$(governance_project_relative_path "$FILE_PATH" 2>/dev/null) \
    || governance_hook_integrity_fail 'removed-names target path could not be made project-relative'
  REMOVED_SCOPE=1
  case "$KIND" in
    code) printf '%s' "$REL" | grep -Eq '^(apps/[^/]+/)?src/' || REMOVED_SCOPE=0 ;;
    doc) printf '%s' "$REL" | grep -Eq '^docs/|^governance/overlay\.md$' || REMOVED_SCOPE=0 ;;
  esac
  [ "$KIND" = doc ] && [ -f "$PROJECT_ROOT/packages/design-system/ds-changes.json" ] && REMOVED_SCOPE=0
  if [ "$REMOVED_SCOPE" = 1 ]; then
    REMOVED_REPORT=$(governance_ds_removed_names_scan "$FILE_PATH" "$KIND" "$CORPUS_ROOT")
    REMOVED_STATUS=$?
    case "$REMOVED_STATUS" in
      0|2) ;;
      *) governance_hook_integrity_fail "removed-names matcher failed (exit ${REMOVED_STATUS})" ;;
    esac
  fi
fi

if [ -n "$VIOLATIONS" ] || [ -n "$REMOVED_REPORT" ]; then
  [ -n "$VIOLATIONS" ] && printf 'GOV-CONSUMER-QUALITY-001:%b\nFile:%s\n' "$VIOLATIONS" "$FILE_PATH" >&2
  [ -n "$REMOVED_REPORT" ] && printf '%s\n' "$REMOVED_REPORT" >&2
  exit 2
fi
exit 0

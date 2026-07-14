#!/bin/bash
# check_tabs_content_chrome_body_double_gap.sh — P0 BLOCKER(overlay-body layout-space guardian,2 checks)
#
# **Check 1**(tabs double-gap):`<TabsContent>` 被放進 chrome scroll body(`<DialogBody>` /
#   `<SheetBody>` / `<SurfaceBody>`)內卻沒 `mt-0` override → 雙重 gap owner。
# **Check 2**(overlay-body fixed macro gap,2026-07-01 Sheet gap-4 錨例):浮層 body 自身 className
#   用固定 `gap-[4-9]`(macro)而非 layout-space token → lg density 不縮放,drift。詳見下方 Check 2 段。
#
# 兩者同屬「overlay-body layout-space 合規」domain,折進一 hook(不增 hook 數)。
#
# Root invariant(item-anatomy.spec.md「垂直 padding 歸屬 / 禁雙重 padding」+ layoutSpace.spec.md
# 規則 2「Header → element = 單一 tight」):兩元素之間的 gap 只能有一個 owner。
# - DialogBody/SheetBody/SurfaceBody 內層 padded div 已用 `pt-/py-[var(--layout-space-tight)]`
#   擁有 header→content 的 chrome gap。
# - TabsContent 預設帶 `mt-[var(--layout-space-tight)]`(tabs.tsx,為「緊接 tab bar 下方」而設)。
# - tabsSlot composition 把 tab bar 抬進 header,TabsContent 留在 body → 兩 owner 疊加 =
#   雙重 tight(md 24 / lg 32)。修法 = chrome body 內的 TabsContent 加 `className="mt-0"`
#   把 ownership 轉移給 body(對齊 AppShell 前例 app-shell.stories.tsx + Carbon/Radix「panel
#   單一 owner」benchmark)。
#
# Anchor:2026-07-01 user 在「專案設定」Dialog(dialog.stories.tsx WithTabsInHeader)DevTools
#   抓到「專案名稱」上方兩個 --layout-space-tight。歷次稽核漏抓,因既有
#   check_layout_space_magic_numbers.sh **明確 skip packages/design-system/src/**(該 hook L34)。
#   本 hook **反轉 scope** 專掃 DS src + apps composition,補該盲區。
#
# Scope:只掃 packages/design-system/src/** + apps/** 的 .tsx(含 .stories.tsx)。
# Level:P0 BLOCKER exit 2(layout-space SSOT 一律 P0,非 P1 WARN — per
#   feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27)。窄 gate(必同時含 chrome body + TabsContent)
#   控 false-positive。Escape:`// @tabs-content-gap-ok: <rationale>`(同行或前一註解行)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' 2>/dev/null)

# Scope:DS source + apps,.tsx only(INVERSE of check_layout_space_magic_numbers.sh 的 DS-src skip)
if ! echo "$FILE" | grep -qE '\.tsx$'; then exit 0; fi
if ! echo "$FILE" | grep -qE '(packages/design-system/src/|/apps/|(^|/)apps/)'; then exit 0; fi

# PostToolUse:file 已寫入磁碟,讀「完整檔」做 containment 分析(避免 hunk-only partial-edit 盲區 —
# 部分 edit 的 new_string 可能只含 TabsContent 行不含外層 DialogBody,window 分析會漏)。
[ -f "$FILE" ] || exit 0
CONTENT=$(cat "$FILE" 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

# ── Check 3(2026-07-08 WM 戰役 R4:root 偵測,不只 symptom)──
# WM 實證:app 把 TabsList 塞 DialogBody + `!pt-0` hack 對抗 primitive,TabsContent 加了 mt-0
# 就繞過 Check 2 —— 但 root 錯誤是「沒用 DialogHeader tabsSlot canonical」(雙線 + 底線內縮 +
# spacing owner 自組)。偵測兩個 root 簽名(任一 → BLOCK 指路 tabsSlot):
#   (a) DialogBody/SheetBody/SurfaceBody className 含 `!pt-0`(important 對抗 primitive 的 pt owner)
#   (b) <TabsList 出現在含 DialogBody 的同段 new content 且無 tabsSlot 字樣
ROOT_SIG_A=$(printf '%s\n' "$CONTENT" | grep -nE '(DialogBody|SheetBody|SurfaceBody)[^>]*className=[^>]*!pt-0' | grep -v '@tabs-content-gap-ok:' || true)
ROOT_SIG_B=""
if printf '%s\n' "$CONTENT" | grep -q '<TabsList' && printf '%s\n' "$CONTENT" | grep -qE '<(DialogBody|SheetBody|SurfaceBody)\b' && ! printf '%s\n' "$CONTENT" | grep -q 'tabsSlot' && ! printf '%s\n' "$CONTENT" | grep -q '@tabs-content-gap-ok:'; then
  ROOT_SIG_B=$(printf '%s\n' "$CONTENT" | grep -n '<TabsList' | head -3)
fi
if [ -n "$ROOT_SIG_A" ] || [ -n "$ROOT_SIG_B" ]; then
  cat >&2 << 'EOF_C3'
🚨 TABS-IN-BODY ROOT BLOCKER(P0,2026-07-08 WM 戰役 — 攔 root 非 symptom)

  偵測到「TabsList 手塞 chrome body / body 用 !pt-0 hack」簽名 —— 這是「沒用 header tabsSlot
  canonical」的 root 錯誤(後果:header 與 TabsList 雙底線、tabs 底線被 body padding 內縮不滿寬、
  spacing owner 鏈自組)。WM ProjectSettings/TypeSettings 錨例。

  ── 正解 ──
  <Tabs> wrap → <DialogHeader tabsSlot={<TabsList/>}> → <DialogBody><TabsContent className="mt-0">
  照 dialog.stories.tsx#WithTabsInHeader 逐字結構(header-canonical.spec.md Rule W2)。
  Escape:`// @tabs-content-gap-ok: <rationale>`(例:tabs 本來就不屬 header 的內容分頁場景)
EOF_C3
  exit 2
fi


# ══ Check 2:overlay body 自身用固定 macro gap-N → 該用 layout-space token(2026-07-01 Sheet gap-4 錨例)══
# Root(layoutSpace.spec.md 規則 2/3):浮層 body 直接堆疊內容的垂直 gap 屬 macro layout-space,該用
#   density-scaling token(並列 = loose / functional 交互 = tight),非固定 gap-N(lg 不縮放 → 跟 DS
#   自己 dialog.stories 的 gap-[var(--layout-space-loose)] 不一致)。窄 gate:只抓 overlay body 自身
#   className 的固定 gap-[4-9](macro range;排除 gap-1/2/3 micro + 已 tokenize 的 gap-[var)。
#   全庫掃證實零現存假陽性(純防未來 drift)。Escape:同行或前一註解行 @overlay-body-gap-ok:。
GAP_MARKER='@overlay-body-gap-ok:'
GAP_HITS=$(printf '%s\n' "$CONTENT" | grep -nE '<(DialogBody|SheetBody|PopoverBody|SurfaceBody)[^>]*gap-[4-9]([^0-9]|$)' 2>/dev/null | grep -v 'gap-\[var')
GAP_UNJUSTIFIED=""
if [ -n "$GAP_HITS" ]; then
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    ln="${hit%%:*}"
    cur="${hit#*:}"
    if echo "$cur" | grep -qF "$GAP_MARKER"; then continue; fi
    if [ "$ln" -gt 1 ] 2>/dev/null; then
      prev=$(printf '%s\n' "$CONTENT" | sed -n "$((ln-1))p")
      if echo "$prev" | grep -qF "$GAP_MARKER" && echo "$prev" | grep -qE '^[[:space:]]*(//|\{?/\*|\*)'; then continue; fi
    fi
    GAP_UNJUSTIFIED="${GAP_UNJUSTIFIED}${ln}: $(echo "$cur" | sed 's/^[[:space:]]*//')\n"
  done <<< "$GAP_HITS"
fi
if [ -n "$GAP_UNJUSTIFIED" ]; then
  cat >&2 << EOF
🚨 OVERLAY-BODY FIXED-GAP BLOCKER(P0,2026-07-01 Sheet demo gap-4 錨例)

  在 $FILE 偵測到浮層 body(Dialog/Sheet/Popover/Surface Body)自身用固定 macro gap-N:
$(echo -e "$GAP_UNJUSTIFIED" | sed 's/^/    /' | head -10)

  ── 為什麼 ──
  浮層 body 直接堆疊內容(並列表單欄位 / 區塊)的垂直 gap 屬 macro layout-space,該用
  density-scaling token(並列 = loose / functional 交互 = tight),非固定 gap-N(lg 不縮放 →
  跟 DS 自己 dialog.stories 的 gap-[var(--layout-space-loose)] 不一致)。

  ── 修法 2 選 1 ──
    (a) gap-N → gap-[var(--layout-space-loose)](並列)/ gap-[var(--layout-space-tight)](functional 交互)
    (b) Escape:該行或前一註解行加 \`// @overlay-body-gap-ok: <rationale>\`(刻意 list 間距 / 視覺平衡)

  canonical → tokens/layoutSpace/layoutSpace.spec.md 規則 2/3
EOF
  exit 2
fi

# ══ Check 1:<TabsContent> 在 chrome body 內雙重 gap(原 beta.78 邏輯)══
# Gate:必同時含 chrome body open tag 且 TabsContent 才啟動(narrow surface,絕大多數 edit 靜默)
if ! echo "$CONTENT" | grep -qE '<(DialogBody|SheetBody|SurfaceBody)[ />]'; then exit 0; fi
if ! echo "$CONTENT" | grep -q '<TabsContent'; then exit 0; fi

ESCAPE_MARKER='@tabs-content-gap-ok:'

# 逐行 depth-counter(awk):進 chrome body +1、出 -1;TabsContent 在 depth>0 = 在 chrome body 內。
# - 註解行(JSDoc `*` / `//` / `{/*` / `/*` / `*/`)整行跳過,不計 depth 也不判 TabsContent
#   (避免 JSDoc 內 `<DialogBody>` 範例污染 depth / 內含的 mt-0 example 被誤判)。
# - 同行 open 先加 depth 再判 TabsContent 再減 close → 同行 `<DialogBody><TabsContent>` 與
#   `<TabsContent>...</DialogBody>` 都正確歸屬「inside」。
# - TabsContent opening tag 可能跨行:accumulate 到 `>` 再驗 className 有無 canonical `mt-0`
#   (class-boundary anchored;非-0 / arbitrary 值需 escape marker)。
# 輸出:每個「chrome body 內且無 mt-0 override」的 TabsContent 起始行號(供 bash escape 過濾)。
CANDIDATES=$(printf '%s\n' "$CONTENT" | awk '
  function check_tag(tag, ln) {
    # 只認 canonical `mt-0`(class-boundary anchored):排除 `mt-0.5` / `mt-04` 等 substring 假通過
    # (mt-0.5 是本 DS 真實 class,item-anatomy.stories.tsx:766;2px 不抵銷 pt-tight → 仍雙重)。
    # arbitrary `mt-[...]` / 非-0 值 = 非 canonical → 需 escape marker 明示 documented(非靜默通過)。
    if (tag ~ /(^|[^a-zA-Z0-9])mt-0([^a-zA-Z0-9.]|$)/) return
    print ln
  }
  BEGIN { depth=0; collecting=0; buf=""; startline=0 }
  {
    raw=$0
    if (collecting) {
      buf = buf " " raw
      if (raw ~ />/) { collecting=0; check_tag(buf, startline); buf="" }
      next
    }
    t=raw; sub(/^[ \t]+/,"",t)
    if (t ~ /^(\*|\/\/|\{?\/\*|\*\/)/) next          # skip comment-only lines
    tmp=raw;  o=gsub(/<(DialogBody|SheetBody|SurfaceBody)[ \t\/>]/,"X",tmp)
    tmpc=raw; c=gsub(/<\/(DialogBody|SheetBody|SurfaceBody)>/,"X",tmpc)
    depth += o
    if (raw ~ /<TabsContent/ && depth > 0) {
      idx = index(raw, "<TabsContent")
      rest = substr(raw, idx)
      if (rest ~ />/) { gt = index(rest, ">"); check_tag(substr(rest, 1, gt), NR) }
      else { collecting=1; buf=rest; startline=NR }
    }
    depth -= c
  }
')

if [ -z "$CANDIDATES" ]; then exit 0; fi

# Escape 過濾:同行 OR 前一「註解專用行」含 @tabs-content-gap-ok: → 豁免(對齊
# check_layout_space_magic_numbers.sh L57-69 已 debug 過的 preceding-line marker 邏輯)。
UNJUSTIFIED=""
while IFS= read -r ln; do
  [ -z "$ln" ] && continue
  cur=$(echo "$CONTENT" | sed -n "${ln}p")
  if echo "$cur" | grep -qF "$ESCAPE_MARKER"; then continue; fi
  if [ "$ln" -gt 1 ] 2>/dev/null; then
    prev=$(echo "$CONTENT" | sed -n "$((ln-1))p")
    if echo "$prev" | grep -qF "$ESCAPE_MARKER" && echo "$prev" | grep -qE '^[[:space:]]*(//|\{?/\*|\*)'; then continue; fi
  fi
  UNJUSTIFIED="${UNJUSTIFIED}${ln}: $(echo "$cur" | sed 's/^[[:space:]]*//')\n"
done <<< "$CANDIDATES"


if [ -z "$UNJUSTIFIED" ]; then exit 0; fi

cat >&2 << EOF
🚨 TABS-CONTENT-CHROME-BODY DOUBLE-GAP BLOCKER(P0,2026-07-01 user「專案名稱上方兩個 space-tight」)

  在 $FILE 偵測到 <TabsContent> 放在 chrome scroll body(DialogBody/SheetBody/SurfaceBody)內
  但未 override margin-top:
$(echo -e "$UNJUSTIFIED" | sed 's/^/    /' | head -10)

  ── 為什麼是 bug ──
  DialogBody/SheetBody/SurfaceBody 內層已用 pt-/py-[var(--layout-space-tight)] 擁有 header→content
  的 chrome gap;TabsContent 預設又帶 mt-[var(--layout-space-tight)](tabs.tsx,為緊接 tab bar 而設)。
  tabsSlot composition 把 tab bar 抬進 header 後,兩個 owner 疊加 = 雙重 tight(md 24 / lg 32)。
  一軸只能有一個 spacing owner(item-anatomy.spec.md「垂直 padding 歸屬 / 禁雙重 padding」)。

  ── 修法 2 選 1 ──
    (a) chrome body 內的 TabsContent 加 \`className="mt-0"\` 把 ownership 轉移給 body
        (對齊 AppShell 前例 app-shell.stories.tsx + Carbon/Radix「panel 單一 owner」benchmark)
    (b) Escape:該行或前一註解行加 \`// @tabs-content-gap-ok: <rationale>\`(顯式 documented 例外)

  完整 canonical → components/Tabs/tabs.spec.md「出現在 Dialog」段
                 + tokens/layoutSpace/layoutSpace.spec.md 規則 2
EOF
exit 2

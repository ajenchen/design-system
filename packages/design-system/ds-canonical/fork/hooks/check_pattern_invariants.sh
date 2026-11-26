#!/bin/bash
# Pattern invariants unified hook(2026-05-08 cluster C consolidation)
#
# Merges 4 PreToolUse hooks(原各檔已 retire,合併入此):
#   C.1 overlay panel scroll chain(原 check_overlay_panel_scroll_chain;2026-11-21 起 P0 BLOCK exit 2,M25)
#   C.7 CommandEmpty 手刻簽名(P0 BLOCK,2026-09-08)
#   C.2 inline-action canonical gap(原 check_inline_action_canonical_gap;2026-11-21 起 P0 BLOCK exit 2)
#   C.3 primitive wrapper padding(原 check_primitive_wrapper_padding,P0 BLOCK exit 2)
#   C.4 row slot handcraft(原 check_row_slot_handcraft,P0 BLOCK exit 2)
#   C.5 弱化 icon hover 階梯(2026-07-30 user 拍板,P0 BLOCK exit 2)
#   C.6 selected token 狀態語意(2026-08-11 user 拍板,P0 BLOCK exit 2)
#
# Why merge:皆 element-anatomy / overlay-surface SSOT 消費紀律 invariant,共用 INPUT
# parsing + tsx filter,散裝是 M17 + Anthropic ≤ 15 hook best-practice 偏離。
#
# Output precedence:BLOCK(2,stderr)> silent(0)。
#   2026-11-21 C.1 / C.2 由「只提醒」升為擋(knowledge-prune D4-02 / WP-15b:SSOT invariant 不得只提醒,
#   governance/memory/feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md),本檔已沒有只提醒的規則;
#   exit 0 帶輸出的路徑只剩收容非預期輸出(仍包成 governanceContext,不靜默丟掉),所以 outputMode 維持
#   governance-context-or-block。C.1 / C.2 只看這次寫入的內容(NEW_CONTENT;PreToolUse 拿不到寫完的檔,
#   所以不用 lib/_added_lines.sh 的「新增行」—— 那支只能在 PostToolUse 用)。
#   升擋前全樹重放(a05da20a,340 個 .tsx 逐檔整檔寫入)C.1 2 筆、C.2 3 筆,5 筆全是偵測誤判,升擋時一併修掉
#   (細節在 C.1 / C.2 段);修完重放 C.1 / C.2 0 筆。
#
# Per-rule allowlist:
#   C.1: `// @scroll-chain-allow: <reason>`(any line)
#   C.2: `// @inline-action-gap-allow: <reason>`(any line;豁免早就有,升擋沿用)
#   C.3: `// @primitive-padding-allow: <reason>`(檔案前 5 行)
#   C.4: `// @row-slot-handcraft-allow: <reason>`(any line)
#   C.5: `// @hover-ramp-allow: <reason>`(any line)
#   C.6: `// @token-state-allow: <reason>`(any line)

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

_HOOK_CONTEXT_EVENT="PreToolUse"
_HOOK_OUTPUT_CAPTURE=$(mktemp "${TMPDIR:-/tmp}/check-pattern-invariants.XXXXXX") || {
  printf 'GOVERNANCE_INTEGRITY: pattern invariants output capture unavailable\n' >&2
  exit 70
}
exec 3>&1 4>&2
exec >"$_HOOK_OUTPUT_CAPTURE" 2>&1

_finalize_hook_output() {
  _hook_rc=$?
  trap - EXIT
  exec 1>&3 2>&4
  _hook_output=$(cat "$_HOOK_OUTPUT_CAPTURE" 2>/dev/null || true)
  rm -f "$_HOOK_OUTPUT_CAPTURE" 2>/dev/null || true

  case "$_hook_rc" in
    0)
      [ -z "$_hook_output" ] && exit 0
      if ! jq -cn \
        --arg event "$_HOOK_CONTEXT_EVENT" \
        --arg message "$_hook_output" \
        '{governanceContext:{hookEventName:$event,message:$message}}'; then
        printf 'GOVERNANCE_INTEGRITY: pattern invariants warning envelope encoding failed\n' >&2
        exit 70
      fi
      exit 0
      ;;
    2)
      if grep -q 'GOVERNANCE_INTEGRITY:' <<<"$_hook_output"; then
        printf '%s\n' "$_hook_output" >&2
        exit 70
      elif [ -n "$_hook_output" ]; then
        printf '%s\n' "$_hook_output" >&2
      else
        printf 'pattern invariants hook blocked without diagnostic\n' >&2
      fi
      exit 2
      ;;
    70)
      if [ -n "$_hook_output" ]; then
        printf '%s\n' "$_hook_output" >&2
      else
        printf 'GOVERNANCE_INTEGRITY: pattern invariants failed without diagnostic\n' >&2
      fi
      exit 70
      ;;
    *)
      printf 'GOVERNANCE_INTEGRITY: pattern invariants undefined exit code %s\n' "$_hook_rc" >&2
      [ -n "$_hook_output" ] && printf '%s\n' "$_hook_output" >&2
      exit 70
      ;;
  esac
}
trap _finalize_hook_output EXIT

INPUT=$(cat)
if ! printf '%s' "$INPUT" | jq -e 'type == "object"' >/dev/null 2>&1; then
  printf 'GOVERNANCE_INTEGRITY: pattern invariants invalid input envelope\n' >&2
  exit 70
fi
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

case "$FILE_PATH" in
  *.tsx) ;;
  *) exit 0 ;;
esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")

grep -q '[^[:space:]]' <<<"$NEW_CONTENT" || exit 0

WORST=0
record_worst() { local lvl=$1; [ "$lvl" -gt "$WORST" ] && WORST=$lvl; }

# ── C.6 selected token 狀態語意(P0 BLOCK exit 2;2026-08-11 user 拍板)──────────
# 教義(semantic.css + color.spec.md「Selected state family」):
#   -active = 按壓專屬 / -hover = 可取消切換鈕專屬(已按下的下一階:2026-09-07 由「變淺」改為「變深」neutral-3)。
#   -focus 已於 2026-09-07 退役:鍵盤焦點一律畫框(focus-ring-inset),不改底色(user 2026-09-09 拍板)。
#   (2026-09-25 更正本段過期說法;SSOT = color.spec.md「Selected state family」+ semantic.css 選中家族註解)
# 兩年偏移錨:2026-07-05 D4 借 -active 裝反白、滑鼠搭便車,選單 vs sidebar 因此不一致。
# 本規則攔「-active/-hover 出現在 hover/焦點/反白修飾鏈」的借用寫法(零誤判:合法用途已窮舉排除)。
if ! grep -q '@token-state-allow' <<<"$NEW_CONTENT"; then
  SUSPECT_C6=$(printf '%s' "$NEW_CONTENT" | grep -oE "[][A-Za-z0-9_=:.-]*bg-neutral-selected-(active|hover)" | while IFS= read -r tok; do
    case "$tok" in
      (*active:*) ;;                                # 修飾鏈含按壓(active:)= 合法按壓用途
      (*hover:*bg-neutral-selected-hover) ;;        # 切換鈕 pressed 上 hover 深一階(neutral-2 → neutral-3,2026-09-07 起)= 誕生語意,合法
      (*)
        case "$tok" in
          (*hover:*|*focus-visible:*|*focus:*|*data-\[highlighted*|*data-\[selected*)
            printf '%s\n' "$tok" ;;
        esac ;;
    esac
  done | sort -u)
  if [ -n "$SUSPECT_C6" ]; then
    # 下方 heredoc 沒加引號:反引號要寫成 \` 才是字面值(2026-09-26 修:原本寫成兩個反斜線,反引號變成指令替換,訊息在「例外」那行斷掉並印 syntax error)
    cat >&2 <<EOF

┄┄┄ C.6 check_pattern_invariants — selected token 狀態語意 BLOCKER ┄┄┄

[P0] ${FILE_PATH}
偵測按壓/切換鈕專屬 token 被借用到反白·焦點·hover 修飾鏈:
$SUSPECT_C6

教義(item-anatomy.spec.md「選中 × 互動疊加」+ color.spec.md「Selected state family」):
  滑鼠 hover 選中列 → 釘住 bg-neutral-selected 不變
  鍵盤游標停在任何列 → 畫框(focus-ring-inset)、不上底色;選中列 = 框疊在 bg-neutral-selected 上
    (focus-canonical 規則二,user 2026-09-09 拍板;-focus 深一階 token 已於 2026-09-07 退役)
    ⚠️ **selector 必須對上該元件的焦點模型**:會搶反白的虛擬游標(cmdk data-selected / Radix data-highlighted)
       由元件依 hooks/use-input-modality.ts 的 useCursorMover(反白來歷)才掛 focus-ring-inset;
       aria-activedescendant 容器(TimePicker 欄)看容器自己的 :focus-visible(group-focus-visible/listbox:);
       真焦點元件用 focus-visible:focus-ring-inset。2026-09-06 實測:寫錯 selector 的樣式**從未生效**
       (當時 TreeView 列無 tabIndex、MenuItem 根節點非可聚焦,都曾寫 focus-visible: 而永不 match)。
       正確示範:command.tsx CommandItem 與 dropdown-menu.tsx radixCursorClass(依反白來歷分流)、
       sidebar.tsx / tree-view.tsx 列的 focus-visible:focus-ring-inset(真焦點;TreeView 2026-09-25 起列上 roving tabindex,待辦總帳 B9)。
  bg-neutral-selected-active → 只准出現在含 active:(按壓)的修飾鏈
  bg-neutral-selected-hover  → 只准切換鈕 pressed 上 hover(深一階;2026-09-07 起 neutral-3)
例外:行尾 \`// @token-state-allow: <reason>\`

EOF
    record_worst 2
  fi
fi

# ── C.7 CommandEmpty 手刻簽名(P0 BLOCK exit 2;2026-09-08)────────────────────
# 空狀態由 CommandEmpty own(select-menu.spec.md「Empty state」,2026-09-08 定稿):MenuGroup + 一列 MenuItem message,
# 不經 Empty、沒有任何最小高度(舊 minRows / getMenuListMinHeight 已退役)。
# 2026-09-08 之前 SelectMenu、AgentPanel 各手刻一份、Command 自家 story 是裸文字 —— 三種長相(user 抓到)。
# 攔:`<CommandEmpty` 標籤內出現 items-center / justify-center / minHeight,或它的下一行手放 <Empty。
# 例外:行尾 `// @command-empty-handcraft-ok: <reason>`
if ! grep -q '@command-empty-handcraft-ok' <<<"$NEW_CONTENT"; then
  SUSPECT_C7=$(printf '%s' "$NEW_CONTENT" | tr '\n' ' ' | grep -oE "<CommandEmpty[^>]*(items-center|justify-center|minHeight)[^>]*>|<CommandEmpty[^>]*>[[:space:]]*<Empty\b" | head -3)
  if [ -n "$SUSPECT_C7" ]; then
    cat >&2 <<EOF

┄┄┄ C.7 check_pattern_invariants — CommandEmpty 手刻簽名 BLOCKER ┄┄┄

[P0] ${FILE_PATH}
偵測到在 CommandEmpty 上手刻置中 / 最小高度 / Empty:
$SUSPECT_C7

空狀態的長相由 CommandEmpty own:MenuGroup 包一列 MenuItem message(非互動、次要色、字級同選項、置中),
不經 Empty、沒有任何最小高度(舊 minRows / getMenuListMinHeight 已退役,0 筆與 1 筆結果等高);
consumer 只傳文案:<CommandEmpty size={size}>{emptyText}</CommandEmpty>
loading 放 <CommandLoading label=…/> 當 children(同一種訊息列 + 前綴轉圈)。SSOT:select-menu.spec.md「Empty state」「Loading」。
例外:行尾 \`// @command-empty-handcraft-ok: <reason>\`

EOF
    record_worst 2
  fi
fi

# ── C.1 overlay panel scroll chain(P0 BLOCK exit 2,2026-11-21 由 P1 WARN 升級;M25)──────────────
# 偵測:行首 `<div` 的 class 有固定寬(w-[…] / min-w-[…] / max-w-[…]),缺 flex + flex-col / h-full / min-h-0 其一,
#   而往下 30 行內、遇到 `</div>` 之前出現 <SurfaceBody。
# 2026-11-21 升擋時修的兩個誤判(升擋前全樹重放 C.1 的 2 筆都是 (a)):
#   (a) 寬度判斷原本是子字串 /w-\[/ → `shadow-[…]`(sha-dow-[)也算「固定寬」:
#       components/FileItem/file-item.principles.stories.tsx、patterns/header-canonical/header-canonical.stories.tsx
#       兩支故事裡的卡片示意(不是浮層)因此命中。改成 class 邊界:前一字不是英數 / `_` / `-`,`min-` / `max-` 前綴照算。
#   (b) div 與 SurfaceBody 之間若隔著浮層的 Content(Popover / Dialog / Sheet / HoverCard / DropdownMenu /
#       ContextMenu / AlertDialog),那個 div 在 Portal 外面,不在 root → SurfaceBody 的鏈上(M3 Portal 逃逸),不算。
#       目前樹裡 0 筆是這種,但故事 / 產品頁「固定寬示範框裡放一個 Popover」是常見寫法,升擋前先排除。
#   兩者都是收窄;真正的違規形狀(浮層 Content 裡的固定寬 root 缺 flex 鏈)仍擋 —— 測試 C.1.1 / C.1.6 / C.1.7。
if ! grep -q '@scroll-chain-allow' <<<"$NEW_CONTENT" \
   && grep -q '<SurfaceBody' <<<"$NEW_CONTENT"; then
  SUSPECT_C1=$(printf '%s' "$NEW_CONTENT" | awk '
    /^[[:space:]]*<div[[:space:]]/ {
      line = $0
      while (index(line, ">") == 0 && (getline next_line) > 0) line = line " " next_line
      if (line ~ /(^|[^A-Za-z0-9_-])((min|max)-)?w-\[/ && (line !~ /flex[^"]*flex-col/ || line !~ /h-full/ || line !~ /min-h-0/)) {
        for (k = 0; k < 30 && (getline next_line) > 0; k++) {
          if (next_line ~ /<(Popover|Dialog|Sheet|HoverCard|DropdownMenu|ContextMenu|AlertDialog)Content([^A-Za-z0-9_]|$)/) break
          if (next_line ~ /<SurfaceBody/) {
            print "[panel root w-[...] 缺 flex flex-col h-full min-h-0]: " substr(line, 1, 100)
            break
          }
          if (next_line ~ /<\/div>/) break
        }
      }
    }
  ')
  if [ -n "$SUSPECT_C1" ]; then
    cat >&2 <<EOF

┄┄┄ C.1 check_pattern_invariants — overlay scroll chain BLOCKER ┄┄┄

[P0] ${FILE_PATH}
${SUSPECT_C1}

⚠️  M25 canonical:Popover/HoverCard/Dialog/Sheet viewport-aware scroll 要求 root → SurfaceBody
    所有中間 wrapper forward \`flex flex-col h-full\`。斷鏈 → SurfaceBody flex-1 失效。

修法:wrapper className 加 \`flex flex-col h-full\`(最小組合 \`flex flex-col h-full min-h-0\`)
詳 patterns/overlay-surface/overlay-surface.spec.md「Viewport-aware scroll chain invariant」/ M25
例外:行尾 \`// @scroll-chain-allow: <reason>\`

EOF
    record_worst 2
  fi
fi

# ── C.2 inline-action canonical gap(P0 BLOCK exit 2,2026-11-21 由 P1 WARN 升級)─────────────────
# 規則:inline-action.spec.md「多個 Inline Action 並排」—— 一個宿主上的 inline action 彼此間距 gap-2(8px)。
# 偵測(2026-11-21 改寫):找每個 <ItemInlineAction> / <ItemInlineActionButton> 的「直接排版容器」——
#   往外走過不產生 DOM 的包裝(Fragment / Radix Root 如 DropdownMenu、Popover / asChild 的 *Trigger、PopoverAnchor、Slot)
#   後的第一個小寫 DOM 元素;
#   該元素的屬性(className / cn(…) 全段)帶非 gap-2 的 gap-N 才算違規。往外先碰到其他大寫元件(ItemSuffix 之類,
#   它自己負責排版)→ 不判。
# 改寫前是「這次寫入裡有 ItemInlineAction,就把寫入內容任一行 className 的 gap-1/3/4… 都算」:
#   升擋前全樹重放 C.2 的 3 筆 —— components/AgentPanel/agent-panel.tsx(附件列 gap-1、引用區 flex-col gap-1、
#   標籤列 gap-1)、components/DataTable/data-table.tsx(錯誤訊息清單 flex-col gap-1)、components/Tabs/tabs.tsx
#   (徽章 + 結尾圖示 gap-1)—— 全是同一檔裡跟 inline action 無關的 gap,升成擋會擋錯。這是收窄;
#   違規形狀(同一個容器裡的 inline action 用非 gap-2)仍擋 —— 測試 C.2.1 / C.2.4 / C.2.5 / C.2.6。
# JSX 掃描用 perl(C.3 已依賴 perl,缺 perl 同樣 fail-closed 擋);純註解行與 /* */ 先剝掉(保留行號)。
case "$FILE_PATH" in
  *components/*.tsx|*patterns/*.tsx)
    case "$FILE_PATH" in
      */item-anatomy.tsx|*.stories.tsx|*.test.*) ;; # SSOT/test skip
      *)
        if ! grep -q '@inline-action-gap-allow' <<<"$NEW_CONTENT" \
           && grep -qE '<ItemInlineAction(Button)?([^A-Za-z0-9_]|$)' <<<"$NEW_CONTENT"; then
          if ! command -v perl >/dev/null 2>&1; then
            echo '🚨 check_pattern_invariants: required interpreter perl is unavailable — C.2 gate cannot run(fail-closed)' >&2
            exit 2
          fi
          WRONG_GAP=$(printf '%s' "$NEW_CONTENT" | perl -0777 -ne '
            my $src = $_;
            # 剝註解但保留換行(行號才對得上)
            $src =~ s{/\*.*?\*/}{ (my $m = $&) =~ s/[^\n]//g; $m }gse;
            $src =~ s{^[ \t]*//[^\n]*}{}gm;
            my @stack;
            my %seen;
            # 不產生 DOM 的包裝:Fragment、Radix Root(Context provider)、asChild 觸發點
            my $transparent = qr/^(?:|React\.Fragment|Fragment|Slot|Tooltip|TooltipProvider|DropdownMenu|Popover|HoverCard|ContextMenu|[A-Za-z.]*Trigger|PopoverAnchor)$/;
            my $len = length $src;
            # 標籤起點:前一字不是識別字 / ) / ] / .(排除 useRef<T>、a<b 這類泛型與比較);
            # 名字可空只限 <> / </>(Fragment)
            while ($src =~ /(?<![\w\$)\].])<(\/?)([A-Za-z][\w.]*|(?=>))/g) {
              my ($closing, $name) = ($1, $2);
              my $start = $-[0];
              my $i = $+[0];
              my ($depth, $quote, $selfClose) = (0, "", 0);
              while ($i < $len) {
                my $c = substr($src, $i, 1);
                if ($quote ne "") { $quote = "" if $c eq $quote && substr($src, $i - 1, 1) ne "\\"; $i++; next }
                if ($c eq "\"" || $c eq "\x27" || $c eq "`") { $quote = $c; $i++; next }
                if ($c eq "{") { $depth++; $i++; next }
                if ($c eq "}") { $depth-- if $depth > 0; $i++; next }
                if ($c eq ">" && $depth == 0) { $selfClose = (substr($src, $i - 1, 1) eq "/") ? 1 : 0; last }
                $i++;
              }
              my $attrs = substr($src, $start, $i - $start);
              pos($src) = $i < $len ? $i + 1 : $len;
              if ($closing eq "/") {
                for (my $k = $#stack; $k >= 0; $k--) { if ($stack[$k]{name} eq $name) { splice(@stack, $k); last } }
                next;
              }
              if ($name =~ /^ItemInlineAction(?:Button)?$/) {
                for (my $k = $#stack; $k >= 0; $k--) {
                  my $anc = $stack[$k];
                  next if $anc->{name} =~ $transparent;
                  last if $anc->{name} !~ /^[a-z]/;
                  if ($anc->{attrs} =~ /(?<![\w-])(gap-(?:1|3|4|5|6|8|10|12))(?![\w-])/) {
                    my $gap = $1;
                    my $line = (substr($src, 0, $anc->{start}) =~ tr/\n//) + 1;
                    my $head = $anc->{attrs}; $head =~ s/\s+/ /g; $head = substr($head, 0, 100);
                    print "$line: $head … ($gap)\n" unless $seen{$anc->{start}}++;
                  }
                  last;
                }
              }
              push @stack, { name => $name, attrs => $attrs, start => $start } unless $selfClose;
            }
          ')
          if [ -n "$WRONG_GAP" ]; then
            cat >&2 <<EOF

┄┄┄ C.2 check_pattern_invariants — inline-action gap BLOCKER ┄┄┄

[P0] ${FILE_PATH}
ItemInlineAction* 的直接排版容器用非 \`gap-2\` 的 gap class:
${WRONG_GAP}

⚠️  inline-action.spec.md「多個 Inline Action 並排」:inline action 彼此間距 \`gap-2\`(8px)。
    12px = --table-cell-px(cell L/R padding,不是 inline-action gap)。

修法:該容器的 gap → gap-2 / 真有理由 → 加 \`// @inline-action-gap-allow: <reason>\` 行尾豁免

EOF
            record_worst 2
          fi
        fi
        ;;
    esac
    ;;
esac


# ── C.5 弱化 icon hover 階梯(P0 BLOCK exit 2;2026-07-30 user 拍板)─────────────
# Root invariant:hover 往前一階,不跳階。rest \`text-fg-muted\`(neutral-7)的弱化 icon
# hover 必 \`text-fg-secondary\`(neutral-8),不得直接跳 \`text-foreground\`(neutral-9)。
# rule owner = inline-action.spec.md「Icon 色彩」段 + tokens/color/semantic.css:53。
# 世界級:Fluent 2 neutralForeground3Hover === neutralForeground2 / MUI Chip deleteIcon .26→.4。
# 錨例:2026-04-08 97e62a80 為修「colored Tag 上 fg-muted 不連貫」而 unified 全 variant 繼承文字色,
# 連中性宿主一起改且未經 user 拍板;primitive 本身也一直跳兩階,四個月無機械防線。
# rest 已是 fg-secondary 的整列/文字 hover(→ foreground)本身就是一階,不在射程內。
case "$FILE_PATH" in
  *components/*.tsx|*patterns/*.tsx|*.css)
    if ! grep -q '@hover-ramp-allow' <<<"$NEW_CONTENT"; then
      SKIP_RAMP=$(grep -m 3 -nE 'text-fg-muted[^"'"'"'\`]*hover:text-foreground|hover:text-foreground[^"'"'"'\`]*text-fg-muted' <<<"$NEW_CONTENT" || true)
      if [ -n "$SKIP_RAMP" ]; then
        cat >&2 <<EOF

┄┄┄ C.5 check_pattern_invariants — 弱化 icon hover 跳階 BLOCK ┄┄┄

[P0] ${FILE_PATH}
rest \`text-fg-muted\` 的弱化 icon 直接 hover 到 \`text-foreground\`(跳兩階):
${SKIP_RAMP}

❌ inline-action.spec.md「Icon 色彩」+ tokens/color/semantic.css:53:
   弱化 icon hover 後變 \`fg-secondary\`(neutral-8),不是 \`foreground\`(neutral-9)。
   世界級對照:Fluent 2 neutralForeground3Hover = neutralForeground2 / MUI Chip deleteIcon .26→.4。

修法:\`hover:text-foreground\` → \`hover:text-fg-secondary\`(active 同步);
      優先直接消費 \`ItemInlineActionButton\`(primitive 已內建正確階梯)而非手刻。
      真有理由跳階 → 加 \`// @hover-ramp-allow: <rationale>\` 行豁免。

EOF
        exit 2
      fi
    fi
    ;;
esac

# ── C.3 primitive wrapper padding(P0 BLOCK exit 2)───────────────────────────
# File-level allowlist:檔頭前 5 行
ALLOW_C3=0
FIRST_LINES_NEW=$(printf '%s\n' "$NEW_CONTENT" | sed -n '1,5p')
grep -qE '//[[:space:]]*@primitive-padding-allow:' <<<"$FIRST_LINES_NEW" && ALLOW_C3=1
if [ -f "$FILE_PATH" ] && [ "$ALLOW_C3" = "0" ]; then
  ON_DISK_FIRST=$(sed -n '1,5p' "$FILE_PATH" 2>/dev/null || true)
  grep -qE '//[[:space:]]*@primitive-padding-allow:' <<<"$ON_DISK_FIRST" && ALLOW_C3=1
fi
if [ "$ALLOW_C3" = "0" ]; then
  # 缺 perl = C3 防線無法判 → 明確 BLOCK,不得靜默放行(fail-closed;cloud 前提宣告)。
  if ! command -v perl >/dev/null 2>&1; then
    echo '🚨 check_pattern_invariants: required interpreter perl is unavailable — C3 gate cannot run(fail-closed)' >&2
    exit 2
  fi
  # Calendar 不在名單:它的根節點沒有內距、四周距離由容器給(calendar.spec.md「外殼」的「四周距離:元件不帶外距,由容器給」),
  # 外層包 p-* 是正確用法;2026-11-27 前名單裡有它,會把照規格寫的範例外層擋下(R8-E27)。
  PRIMITIVES_REGEX='DateGrid|Surface|SurfaceHeader|SurfaceBody|SurfaceFooter'
  VIOLATIONS_C3=$(printf '%s' "$NEW_CONTENT" | perl -0777 -ne '
    while (/<div\b[^>]*className\s*=\s*["\x27`][^"\x27`]*\bp-\d+[^"\x27`]*["\x27`][^>]*>(?:[^<]*<(?!\/div\b)){0,8}\s*<('"$PRIMITIVES_REGEX"')\b/gs) {
      my $primitive = $1;
      my $offset = $-[0];
      my $before = substr($_, 0, $offset);
      my $line = ($before =~ tr/\n//) + 1;
      print "line $line: <div className=\"...p-X...\"> wrapping <$primitive>\n";
    }
  ')
  if [ -n "$VIOLATIONS_C3" ]; then
    cat >&2 <<EOF

┄┄┄ C.3 check_pattern_invariants — primitive wrapper padding BLOCKER ┄┄┄

[P0] ${FILE_PATH}
${VIOLATIONS_C3}

SSOT primitive 自帶 outer padding,**consumer 不得另加 padding wrapper**:
  - DateGrid:root 自帶 p-3
  - Surface{Header,Body,Footer}:各 segment 自帶 padding

修法:直接放 primitive,不包 padding div。
  ❌ <div className="p-2"><DateGrid /></div>
  ✅ <DateGrid />

整檔豁免:檔頭前 5 行加 \`// @primitive-padding-allow: <reason>\`(需 spec rationale)。
詳 mindset #2 + M1 SSOT 消費。

EOF
    record_worst 2
  fi
fi

# ── C.4 row slot handcraft(P0 BLOCK exit 2)──────────────────────────────────
case "$FILE_PATH" in
  *components/*.tsx|*patterns/*.tsx)
    case "$FILE_PATH" in
      */item-anatomy.tsx|*/field-wrapper.tsx|*.stories.tsx|*.test.*|*.spec.tsx) ;; # SSOT/test skip
      *)
        # 2026-05-30(dim 39 M7/M34 fix):order-INDEPENDENT — extract className attrs,require ALL 4 tokens
        # present(natural Tailwind 序 `flex items-center gap-2 shrink-0 h-[1lh]` 之前漏抓)。BSD/GNU grep 通用。
        if ! grep -q '@row-slot-handcraft-allow' <<<"$NEW_CONTENT" \
           && echo "$NEW_CONTENT" | grep -oE 'class(Name)?="[^"]*"' | grep -F 'h-[1lh]' | grep -F 'shrink-0' | grep -F 'flex' | grep -F 'items-center' >/dev/null 2>&1; then
          cat >&2 <<EOF

┄┄┄ C.4 check_pattern_invariants — row slot handcraft BLOCKER ┄┄┄

[P0] ${FILE_PATH}
偵測自刻 row-layout slot:\`<span class="h-[1lh] shrink-0 flex items-center...">\`
M1+M17 違反 — 該消費 L1 primitive。

⚠️  M19 canonical(2026-05-05 v8):row prefix/suffix slot 必走 patterns/element-anatomy:
  import { ItemPrefix, ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'
  <ItemPrefix><StartIcon /></ItemPrefix>
  <ItemSuffix>{chevron}</ItemSuffix>

\`<ItemPrefix>\` / \`<ItemSuffix>\` 永遠 \`h-[1lh] shrink-0 flex items-center\`(item-anatomy.spec.md:281-283)。
例外:行尾 \`// @row-slot-handcraft-allow: <reason>\`

EOF
          record_worst 2
        fi
        ;;
    esac
    ;;
esac

exit $WORST

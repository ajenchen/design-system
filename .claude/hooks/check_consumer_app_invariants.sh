#!/bin/bash
# check_consumer_app_invariants.sh — P0 BLOCKER ×4 — consumer app DS 使用紀律(2026-05-27/28 user directive 家族)
#
# 2026-06-11 prune merge(user 拍板「照你建議做」;59→51 headroom):
# #   r1_no_ds_catalog = 原 check_consumer_no_ds_catalog.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
#   r2_story_baseline = 原 check_consumer_story_baseline.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
#   r3_ds_primitive_misuse = 原 check_consumer_ds_primitive_misuse.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
#   r4_app_story_title = 原 check_consumer_app_story_title.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
# 原檔 → .claude/hooks/retired/2026-06-11-prune-merge/
# 各規則跑在 pipeline 子 shell:規則內 exit 不中斷其他規則;任一 exit 2 → 整體 exit 2。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")

# ── Shared: 中和 consumer 自有 local 元件的裸 tag(named-import 除鏽的反向保護,2026-07-10 N6 根治)──
# 多數 r2/r3 pattern 用 `<(DS\.)?X`(named-import 除鏽,抓 fork 用 named import `<Dialog>` 繞過
# `<DS.>` 前綴)→ 但會誤殺 consumer 自有的同名 local 元件。判準:裸 <X> 只在「明確 named-import
# 自非 DS 模組」(local './x' 或他 package)時才確定是 consumer 自有 → 中和成 <LOCAL_X;
# 無 import(fixture 慣例)或 DS-package import → 視為 DS,保留(維持除鏽 intent)。
# namespace <DS.X>(capture 到 "DS" token → skip)/ raw 小寫 HTML tag 不受影響。
neutralize_local_tags() {
  local content="$1"
  # LOCAL_NAMED extraction 用 flattened 副本(抓跨行 import block);但**回傳保留原換行**
  # (r2 的空 @story-baseline: marker 偵測是逐行的,flatten 會讓下一行內容誤填空 marker → P4)。
  local local_named
  local_named=$(printf '%s' "$content" | tr '\n' ' ' \
    | grep -oE "import[[:space:]]*\{[^}]*\}[[:space:]]*from[[:space:]]*['\"][^'\"]+['\"]" \
    | grep -vE "from[[:space:]]*['\"]@qijenchen/design-system" \
    | grep -oE '\{[^}]*\}' | tr -d '{}' | tr ',' '\n' \
    | sed -E 's/.*[[:space:]]as[[:space:]]+([A-Za-z0-9_]+).*/\1/; s/[[:space:]]//g' \
    | grep -E '^[A-Z]' | sort -u)
  local T
  for T in $local_named; do
    [ "$T" = "DS" ] && continue
    content=$(printf '%s' "$content" | sed -E "s#<(/?)$T([[:space:]/>])#<\\1LOCAL_$T\\2#g")
  done
  printf '%s' "$content"
}

r1_no_ds_catalog() {
set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
# Only check consumer storybook files
if ! echo "$FILE" | grep -qE '(^|/)(apps|consumer)/.*\.stories\.tsx$'; then exit 0; fi
# Skip DS source
if echo "$FILE" | grep -qE 'packages/design-system/src/'; then exit 0; fi

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

# Escape clause — 2026-06-03 修(同 R8 fragment-vs-file bug class):Edit 只送 new_string 片段,
# 但 @consumer-catalog-allow marker 在檔頭(不在每次 edit 的片段裡)→ 編輯有 marker 的 portal 檔
# 任一非 marker 行就被誤擋。本 hook 是 PostToolUse(檔已落 disk)→ 補查整檔 marker。
if echo "$CONTENT" | grep -q '@consumer-catalog-allow:'; then exit 0; fi
if [ -f "$FILE" ] && grep -q '@consumer-catalog-allow:' "$FILE" 2>/dev/null; then exit 0; fi

VIOLATIONS=""

# Pattern 1: file basename forbidden
basename=$(basename "$FILE" .stories.tsx)
if echo "$basename" | grep -qE '^(EveryDsComponent|AllDsComponents|AllComponents|DsCatalog|EveryComponent)$'; then
  # AllDsComponents allowed IF it's only portal proxy (check title)
  if [ "$basename" = "AllDsComponents" ] && echo "$CONTENT" | grep -qE 'DsCanonicalPortal|iframe.*design-system|@consumer-catalog-allow'; then
    : # portal proxy OK
  else
    VIOLATIONS="${VIOLATIONS}  - File basename '$basename' = catalog pattern. PW 不該重寫 DS catalog.\n"
  fi
fi

# Pattern 2: title claims per-component default
if echo "$CONTENT" | grep -qE "title:.*['\"](所有 DS 元件|Every DS Component|All DS Components.*render|每元件 default)"; then
  VIOLATIONS="${VIOLATIONS}  - Story title claims per-component default render. PW catalog 只可 import smoke + DS portal proxy.\n"
fi

# Pattern 3: iterate-render anti-pattern
if echo "$CONTENT" | grep -qE 'Object\.keys\(DS\)\.(map|forEach)' || \
   echo "$CONTENT" | grep -qE 'Object\.entries\(DS\)\.(map|forEach)'; then
  VIOLATIONS="${VIOLATIONS}  - Detected Object.keys/entries(DS).map iterate-render pattern. 禁 iterate render DS exports.\n"
fi

# Pattern 4: mass hand-mock(≥5 different <DS.X> tags in same file)
DS_TAG_COUNT=$(echo "$CONTENT" | grep -oE '<DS\.[A-Z][a-zA-Z]+' | sort -u | wc -l | tr -d ' ')
if [ "$DS_TAG_COUNT" -ge 5 ]; then
  VIOLATIONS="${VIOLATIONS}  - Detected ${DS_TAG_COUNT} distinct <DS.X> renders in single file. 大量 hand-mock = drift risk(per 2026-05-27 7-bug 錨例). 重構成 single composition demo.\n"
fi

if [ -n "$VIOLATIONS" ]; then
  cat >&2 << EOF
🚨 CONSUMER-NO-DS-CATALOG BLOCKER(P0,2026-05-27 user 永久 directive「確保跟 ds repo 一模一樣」+ M31 codex synthesis)

  Consumer file $FILE 違反:
$(echo -e "$VIOLATIONS")
  per M31 codex synthesis SSOT:
    - DS owns per-component canonical pixels(62/62 components ×3 tiers stories in DS Storybook)
    - PW(consumer)owns 真實業務 composition demos(AppShell Dashboard etc.)
    - Catalog → DS canonical Storybook iframe/link proxy,**禁** PW 重寫 <DS.X minimal mock>

  歷史錨點 2026-05-27 7 bugs:CircularProgress size=32 hardcode / RadioGroup raw item 沒 SelectionItem / DataTable one-col / LinkInput placeholder mock / Empty 缺 icon / Overlay trigger-only / Tooltip context — ALL 從 PW hand-mock minimal-prop drift.

  修法 2 選 1:
    (a) 改用 DS canonical Storybook iframe portal(per template AllDsComponents.stories.tsx#DsCanonicalPortal pattern)
    (b) Escape:加 \`// @consumer-catalog-allow: <rationale>\` 顯式 documented

  完整 SSOT → DS package ds-story-manifest.json + codex M31 synthesis output /tmp/codex-ssot-output.txt
EOF
  exit 2
fi

exit 0
}

r2_story_baseline() {
set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
# Only check consumer storybook files
if ! echo "$FILE" | grep -qE '(^|/)(apps|consumer)/.*\.stories\.tsx$'; then exit 0; fi
if echo "$FILE" | grep -qE 'packages/design-system/src/'; then exit 0; fi

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

# Escape clauses
if echo "$CONTENT" | grep -qE '@story-baseline-allow:|@consumer-catalog-allow:'; then exit 0; fi

# 中和 consumer 自有 local 元件的裸 tag(N6 over-broad guard;shared helper SSOT)
CONTENT=$(neutralize_local_tags "$CONTENT")

# High-risk DS primitives requiring baseline marker
HIGH_RISK_PRIMITIVES='DataTable|Dialog|Sheet|Popover|DropdownMenu|Tooltip|HoverCard|LinkInput|RadioGroup|CircularProgress|AppShell|Sidebar'

# Detect usage(named-import 除鏽:namespace <DS.X> + DS-named-import 的裸 <X> 皆計入;
# consumer 自有 local 元件已由 neutralize_local_tags 中和成 <LOCAL_X 不會誤匹配)
USED=$(echo "$CONTENT" | grep -oE "<(DS\.)?($HIGH_RISK_PRIMITIVES)\\b" | sort -u | head -10)

if [ -z "$USED" ]; then exit 0; fi

# Check for @story-baseline: marker
if echo "$CONTENT" | grep -qE '@story-baseline:[[:space:]]*\S'; then exit 0; fi

cat >&2 << EOF
🚨 CONSUMER-STORY-BASELINE BLOCKER(P0,2026-05-27 M31 codex synthesis)

  Consumer file $FILE 用高風險 DS primitive 但無 \`// @story-baseline:\` marker:
$(echo "$USED" | sed 's/^/    /')

  per M31 codex synthesis SSOT:「Consumer wrap 高風險 DS primitive 必 @story-baseline:
  marker,由 CI 對 DS canonical story 做 visual diff」.

  High-risk list:DataTable / Dialog / Sheet / Popover / DropdownMenu / Tooltip /
  HoverCard / LinkInput / RadioGroup / CircularProgress / AppShell / Sidebar.

  修法 2 選 1:
    (a) 加 marker(檔頭或 story body):
        // @story-baseline: @qijenchen/design-system/components/<Name>/<name>.stories.tsx#<ExportName>
        例:// @story-baseline: @qijenchen/design-system/components/Sidebar/sidebar.stories.tsx#IconCollapse
    (b) Escape:\`// @story-baseline-allow: <rationale>\` 顯式 documented exception
        (eg. pure behavior test / per ds-story-manifest.json exception list)

  完整 mapping → packages/design-system/ds-story-manifest.json(DS package ship)
EOF
exit 2
}

r3_ds_primitive_misuse() {
set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
# Cover BOTH stories AND production .tsx in consumer apps
if ! echo "$FILE" | grep -qE '(^|/)(apps|consumer)/.*\.(tsx|ts)$'; then exit 0; fi
if echo "$FILE" | grep -qE 'packages/design-system/src/|node_modules/'; then exit 0; fi

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

# 2026-06-03 修(同 R8 bug class):換行→空格 flatten。真實 JSX 屬性跨行(<DS.X\n  size={N}\n/>),
# grep 逐行 + 各 pattern 用 [^>]+ 跨屬性匹配 → 不 flatten 的話多行 component 靜默繞過全部 anti-pattern 檢查
# (= BLOCKER false-negative,consumer DS misuse 沒被擋)。[^>]+ 自帶 tag 邊界(遇 > 停),flatten 後不會跨 component。
CONTENT=$(echo "$CONTENT" | tr '\n' ' ')

# Global escape — file-wide allowlist
if echo "$CONTENT" | grep -q '@ds-misuse-allow:'; then exit 0; fi

# 中和 consumer 自有 local 元件的裸 tag(N6 over-broad guard;shared helper SSOT,對齊 r2_story_baseline)
CONTENT=$(neutralize_local_tags "$CONTENT")

VIOLATIONS=""

# Pattern 1: <CircularProgress size={N}> with literal number (override default 24)
if echo "$CONTENT" | grep -qE '<(DS\.)?CircularProgress[^>]+size=\{[0-9]+\}'; then
  VIOLATIONS="${VIOLATIONS}  - <CircularProgress size={N}> hardcoded number override default 24 (per circular-progress.spec.md:101)\n"
fi

# Pattern 2: <RadioGroupItem> NOT wrapped in <SelectionItem control={...}>
# Approximation: file uses RadioGroupItem but doesn't reference SelectionItem
if echo "$CONTENT" | grep -qE '<(DS\.)?RadioGroupItem\b' && ! echo "$CONTENT" | grep -qE 'SelectionItem|<(DS\.)?RadioGroupItem[^>]+label='; then
  VIOLATIONS="${VIOLATIONS}  - <RadioGroupItem> 沒 wrap <SelectionItem control={<RadioGroupItem>}> (per selection-item.spec.md:23 SSOT spacing/padding)\n"
fi

# Pattern 3: <DataTable columns={[…]}> with literal single column
if echo "$CONTENT" | grep -qE '<(DS\.)?DataTable[^>]+columns=\{\[\s*\{[^}]+\}\s*\]\}' && ! echo "$CONTENT" | grep -qE 'columns=\{[^}]*\},\s*\{'; then
  VIOLATIONS="${VIOLATIONS}  - <DataTable columns={[single-col]}> minimal one-column = 違反 data-table.spec.md canonical(min 2 cols for meaningful render)\n"
fi

# Pattern 4: <LinkInput placeholder=...> without value prop
if echo "$CONTENT" | grep -qE '<(DS\.)?LinkInput[^>]+placeholder=' && ! echo "$CONTENT" | grep -qE '<(DS\.)?LinkInput[^>]+(value|defaultValue)='; then
  VIOLATIONS="${VIOLATIONS}  - <LinkInput placeholder=...> 沒 value prop = placeholder-only mode 抹平 link/edit canonical (per link-input.spec.md:18,48-58)\n"
fi

# Pattern 5: <Empty title=...> without icon and without description
if echo "$CONTENT" | grep -qE '<(DS\.)?Empty[^>]+title=' && \
   ! echo "$CONTENT" | grep -qE '<(DS\.)?Empty[^>]+icon=' && \
   ! echo "$CONTENT" | grep -qE '<(DS\.)?Empty[^>]+description='; then
  VIOLATIONS="${VIOLATIONS}  - <Empty title=...> 無 icon 無 description = 違反 Empty.tsx:11「預設只需 description」minimal mock looks weird\n"
fi

# Pattern 8: 硬寫色值 / 字級 / shadow 繞過 DS token(2026-06-02 CF conformance-model 補主防線 —
# composition-fidelity 從 pixel-identity 收窄成 identity-opt-in 後,「consumer 用對 DS token」改由靜態
# conformance 防線保證,對齊 Polaris stylelint-polaris / Atlassian eslint-plugin / Carbon stylelint。
# 既有 check_layout_space_magic_numbers 守「間距」;此 pattern 補「色值/字級/shadow」缺口。
# 零誤判優先:只抓 hardcoded(`-[var(--...)]` token 用法不匹配)。
if echo "$CONTENT" | grep -qE '\b[a-z][a-z-]*-\[(#[0-9a-fA-F]{3,8}|rgb|rgba|hsl|hsla)[(]?|\btext-\[[0-9]|\bshadow-(sm|md|lg|xl|2xl)\b'; then
  VIOLATIONS="${VIOLATIONS}  - 硬寫色值/字級/shadow 繞過 DS token(bg-[#hex] / text-[14px] / shadow-md)→ 改 semantic color token / text-body 等 typography token / shadow-[var(--elevation-N)](per ui-development.md「Tailwind 5 條核心」rule 3)\n"
fi

# Pattern 9(2026-06-12,user 抓 fork「四不像」G4 補洞):AppShell slot 餵 raw HTML element。
# app-shell.spec.md「Consumer 紀律」段明文禁 sidebar={<div>}/header={<header>},原註「靠 audit 把關」
# 無機械閘 → 兌現成 P0(per memory feedback_ssot_mechanical_p0_not_p1_warn)。
# 零誤判:雙條件 = 同檔有 <DS.AppShell> + slot 屬性直接餵 raw tag(div/header/nav/aside/section)。
if echo "$CONTENT" | grep -qE '<(DS\.)?AppShell\b' && \
   echo "$CONTENT" | grep -qE '\b(header|sidebar|aside)=\{ *<(div|header|nav|aside|section)\b'; then
  VIOLATIONS="${VIOLATIONS}  - <AppShell header/sidebar/aside={<raw element>}> — slot 必餵 DS 元件(ChromeHeader / Sidebar / AppShellAside),raw div/header 漏接 border/scroll/responsive canonical(per app-shell.spec.md「Consumer 紀律」段)\n"
fi

# Pattern 10(2026-06-16,user 抓 fork prototype 手刻 table 不用 DataTable):RAW PRIMITIVE 手刻
# r3 既有 Pattern 1-9 只抓「DS 元件用錯」(<DS.X> 已在用但用法錯),漏掉**根本沒用 DS 元件、亂刻
# raw HTML** —— 即 mindset #2 +「# SSOT 消費 canonical」+ build-ui-canonicals.md:9「命中既有元件
# → 必消費,不 hand-craft raw HTML 繞過」這條**必定遵循大原則**的機械閘缺口。反 pattern 由
# build-ui-canonicals.md ❌→✅ 對照表(SSOT)驅動。零誤判:只抓高信心 raw-tag 訊號;<DS.X> 元件是
# PascalCase + DS. prefix 不匹配小寫 raw tag;node_modules 已於上方排除;有理由可 @ds-misuse-allow escape。
if echo "$CONTENT" | grep -qE '<table\b' && echo "$CONTENT" | grep -qE '<thead\b|<tbody\b|<th\b'; then
  VIOLATIONS="${VIOLATIONS}  - 手刻 raw <table><thead>/<tbody> 資料表 → 必用 <DataTable columns={...} data={...} />(build-ui-canonicals.md:18 ❌→✅ SSOT;這是「優先消費既有元件」大原則,無理由不得手刻)\n"
fi
# 2026-07-08 WM 戰役 R4:偽表格視覺簽名(div-grid 表格繞過字面 <table> 偵測 — WM 5 檔
# MINI_TABLE grid-cols + header bg + row 常數重複宣告實證,spec broad / hook narrow M34 gap)。
# 簽名 = 同段 content 有 grid-cols-[ 且(bg-muted|bg-neutral-selected 當 header 底 或 自創
# ROW_PAD 類常數)。escape:@handcraft-table-ok:(真非表格的 grid 佈局)。
if echo "$CONTENT" | grep -qE 'grid-cols-\[' && echo "$CONTENT" | grep -qE '(bg-muted|bg-neutral-selected)[^a-z-]' && echo "$CONTENT" | grep -qiE 'ROW_PAD|MINI_TABLE|<div[^>]*grid[^>]*font-medium' && ! echo "$CONTENT" | grep -q '@handcraft-table-ok:'; then
  VIOLATIONS="${VIOLATIONS}  - 偽表格簽名(div grid-cols + header bg + row 常數):div-grid 手刻資料表 → 必用 <DataTable size=\"sm\" height=\"auto\">(data-table.spec「嵌入式表格」canonical;WM MembersTab 等 5 檔錨例)。真非表格 grid 佈局 → 行內 @handcraft-table-ok: <rationale>\n"
fi
if echo "$CONTENT" | grep -qE '<img\b[^>]*rounded-full'; then
  VIOLATIONS="${VIOLATIONS}  - 手刻 <img ... rounded-full> 頭像 → 必用 <Avatar>(build-ui-canonicals.md:25)\n"
fi
if echo "$CONTENT" | grep -qE '<select\b'; then
  VIOLATIONS="${VIOLATIONS}  - native <select> 手刻下拉 → 必用 <Select> / <DropdownMenu>(build-ui-canonicals.md:15)\n"
fi
# 2026-07-08 WM 戰役 R4:手刻表單 validation 簽名(WM CreateWorkItemDialog 註解引 canonical
# 卻手刻 showErrors state = M23(d)「cite 存在 ≠ consume」;useFormValidation hook 零消費偵測缺口)。
# 簽名 = 檔內有 showErrors/submitAttempt 類 state + FieldError 渲染,但無 useFormValidation import。
if echo "$CONTENT" | grep -q 'useState' && echo "$CONTENT" | grep -qE '\b(showErrors|showError|submitAttempt|attemptedSubmit)\b' && echo "$CONTENT" | grep -q 'FieldError' && ! echo "$CONTENT" | grep -q 'useFormValidation' && ! echo "$CONTENT" | grep -q '@form-validation-ok:'; then
  VIOLATIONS="${VIOLATIONS}  - 手刻表單 validation state(showErrors/submitAttempt + FieldError)→ 必消費 useFormValidation hook(form-validation.spec 規則 1 blur/7 全驗/8 DOM 序 anchor 隨 hook 自帶;root barrel 有 export)。特殊表單 → 行內 @form-validation-ok: <rationale>\n"
fi
if echo "$CONTENT" | grep -qE '<hr\b'; then
  VIOLATIONS="${VIOLATIONS}  - 手刻 <hr> 分隔線 → 用 <Separator>(或 separator.spec 允許的 CSS border)(build-ui-canonicals.md:23)\n"
fi
# 2026-07-10 WM 戰役收官:手刻 menu-item 可點列簽名(WM TypeSettingsDialog 左 rail 錨例 —
# 手刻 <button hover:bg-neutral-hover + bg-neutral-selected> nav row,未消費 MenuItem)。
# 前置:DS API 根因已修(MenuItem startContent slot,beta.84)→ 有合法替代才上機械攔(避免
# fork 無路可走 brick)。簽名 = hover:bg-neutral-hover 與 bg-neutral-selected 成對出現
# (= menu-item family 狀態語義)+ 可點訊號(<button/<a/onClick),且沒在消費 <MenuItem。
# 注意:不 tag-anchor className(WM 錨例把 class 抽 const 再 className={cls} 引用,
# tag-anchored regex 會漏 — test 27 抓到的真實 shape)。
if echo "$CONTENT" | grep -q 'hover:bg-neutral-hover' && \
   echo "$CONTENT" | grep -q 'bg-neutral-selected' && \
   echo "$CONTENT" | grep -qE '<button\b|<a\b|onClick=' && \
   ! echo "$CONTENT" | grep -q '<MenuItem' && \
   ! echo "$CONTENT" | grep -q '@nav-row-handcraft-ok:'; then
  VIOLATIONS="${VIOLATIONS}  - 手刻 menu-item 可點列(hover:bg-neutral-hover + bg-neutral-selected 成對)→ 必包 <MenuItem>(subpath @qijenchen/design-system/components/Menu;selected prop + startIcon/avatar/startContent slot;menu-item.spec.md「結構」)。非 menu-item 語義 → 行內 @nav-row-handcraft-ok: <rationale>\n"
fi

# ── 2026-07-10 批次 A(治理覆蓋 matrix 收官;來源 .claude/planning/2026-07-10-consumer-coverage-remediation.md)──
# C5 對比配對:深字桶 hue(yellow/amber/orange/lime step-6)配 text-white — 各自合法、組合對比違規
# (tag.spec.md 深字桶 = text-on-emphasis-dark)。修 → 消費 CAT_SOLID token pair。
if echo "$CONTENT" | grep -q 'text-white' && \
   echo "$CONTENT" | grep -qE 'bg-\[var\(--color-(yellow|amber|orange|lime)-[0-9]' && \
   ! echo "$CONTENT" | grep -q '@cat-solid-ok:'; then
  VIOLATIONS="${VIOLATIONS}  - 亮色底(yellow/amber/orange/lime step-6)配 text-white = 對比違規 → 消費 CAT_SOLID / CAT_SOLID_TOKENS pair(深字桶自帶 text-on-emphasis-dark;tokens/categorical-color.ts)。特例 → @cat-solid-ok: <rationale>\n"
fi
# C18 計數串接:element children 出現 {label} ({count/length/total})。attr(aria-label)字串層合法
# — regex 錨 children 的 > 前綴,attribute 不中(item-anatomy.spec.md:176 禁括號串接)。
if echo "$CONTENT" | grep -qE '>[^<]*\{[a-zA-Z0-9_.]+\} *\(\{[a-zA-Z0-9_.]*(count|Count|length|total)[a-zA-Z0-9_.]*\}\)' && \
   ! echo "$CONTENT" | grep -q '@count-in-label-ok:'; then
  VIOLATIONS="${VIOLATIONS}  - 計數括號串接 {label} ({count}) → row header 用「標題左、純數字右 space-between + tabular-nums」(item-anatomy.spec.md:176);互動元素(tab/chip/button)用 badge slot。aria/純文字匯出層 → @count-in-label-ok: <rationale>\n"
fi
# C17 分隔線幾何:vertical Separator 無 mx- = 黏按鈕(action-bar.spec.md「分隔線幾何」h-6 mx-1;
# ButtonGroup 內用 <ButtonDivider/>(mx built-in))。
SEP_TAGS=$(echo "$CONTENT" | grep -oE '<(DS\.)?Separator[^>]*orientation=["'"'"']vertical["'"'"'][^>]*' || true)
if [ -n "$SEP_TAGS" ] && echo "$SEP_TAGS" | grep -qv 'mx-' && \
   ! echo "$CONTENT" | grep -q '@separator-geometry-ok:'; then
  VIOLATIONS="${VIOLATIONS}  - vertical <Separator> 無 mx- = 分隔線黏按鈕 → toolbar 用 className=\"h-6 mx-1\"(dense h-5 mx-1);ButtonGroup 內用 <ButtonDivider/>(action-bar.spec.md「分隔線幾何」)。版面切分 divider → @separator-geometry-ok: <rationale>\n"
fi
# C20 連結字手刻 underline:color.spec.md「Action — Primary」= hover 換色不用底線;
# dropzone 連結走 FileUpload children slot。no-underline / hover:underline 皆不中此 regex 形。
if echo "$CONTENT" | grep -qE '<(span|a|button|div)[^>]*className="([^"]* )?underline( [^"]*)?"'; then
  VIOLATIONS="${VIOLATIONS}  - 手刻 underline 連結字 → Action—Primary canonical = text-primary + hover 換色(text-primary-hover),不用底線(color.spec.md「Action — Primary」);dropzone 連結走 <FileUpload> children slot\n"
fi
# C10 業務 search 被推最右:spacer(flex-1 自閉合 / ml-auto)緊接 Search Input。
# 過濾當前檢視的 search = 業務層,與其他操作同區(action-bar.spec.md:69/76);無標題 toolbar 靠左(:109)。
if echo "$CONTENT" | grep -qE '(flex-1[^>]*/>|ml-auto)[^<]{0,80}<(DS\.)?Input[^>]{0,200}placeholder="(Search|搜尋)' && \
   ! echo "$CONTENT" | grep -q '@search-right-ok:'; then
  VIOLATIONS="${VIOLATIONS}  - 業務 search(過濾當前檢視)被 spacer 推到最右 → 歸業務層與其他操作同區(action-bar.spec.md:69/76;無標題 toolbar 業務層靠左 :109)。工具型跨頁 search 置最右合法 → @search-right-ok: <rationale>\n"
fi
# C11 dialog chrome 雙 X:DialogHeader 之後 250 字窗內手放 startIcon={X} 且窗內無 actions=
# (DialogHeader 自帶 Close;header 操作走 actions slot — action-bar.spec.md:281)。
DH_WIN=$(echo "$CONTENT" | grep -oE '<(DS\.)?DialogHeader.{0,250}' || true)  # BSD grep bound 上限 255
if [ -n "$DH_WIN" ] && echo "$DH_WIN" | grep -qE 'startIcon=\{X\}' && ! echo "$DH_WIN" | grep -q 'actions=' && \
   ! echo "$CONTENT" | grep -q '@dialog-chrome-ok:'; then
  VIOLATIONS="${VIOLATIONS}  - DialogHeader 內手放 X 關閉鈕(DialogHeader 已自帶 Close = 雙 X)→ header 操作走 actions slot(自動 ButtonDivider 分隔,action-bar.spec.md:281)。特例 → @dialog-chrome-ok: <rationale>\n"
fi
# C7 SelectMenu internal 直用(select-menu.spec.md:53 明文禁 consumer 直用 — 它是 Select/
# Combobox 的內部選單面,consumer 用 <Select>/<Combobox>;此為「internal 且 spec 明文禁直用」
# 特例,非一般 internal 包裝即可)。
if echo "$CONTENT" | grep -qE '<SelectMenu\b' && \
   ! echo "$CONTENT" | grep -q '@selectmenu-direct-ok:'; then
  VIOLATIONS="${VIOLATIONS}  - <SelectMenu> 直用(internal 選單面,select-menu.spec.md:53 明文禁)→ 用 <Select> / <Combobox>(自帶 trigger + 選單接線)。極特例 → @selectmenu-direct-ok: <rationale>\n"
fi
# C13 手刻可收合 section header(2026-07-10 收官:R3-7 拍板 SectionHeader 留產品客製、但 layout
# 全消費 canonical — 組合鐵律 codify 於 item-anatomy.spec.md「可收合 section header」;簽名 =
# Chevron toggle + justify-between + 可點,且檔內無 SectionHeader 共用元件)。
if echo "$CONTENT" | grep -qE 'Chevron(Down|Right|Up)' && \
   echo "$CONTENT" | grep -q 'justify-between' && \
   echo "$CONTENT" | grep -qE '<button\b|onClick=' && \
   ! echo "$CONTENT" | grep -q 'SectionHeader' && \
   ! echo "$CONTENT" | grep -q '@section-header-ok:'; then
  VIOLATIONS="${VIOLATIONS}  - 手刻可收合 section 標題列(Chevron + justify-between + 可點)→ 抽共用 SectionHeader 元件並照 item-anatomy.spec.md「可收合 section header 組合 canonical」(chevron = title 後 suffix inline action / desc 用 item-gap token / endSlot 垂直置中;WM SectionHeader 錨例)。非 section 標題語義 → @section-header-ok: <rationale>\n"
fi
# C19 兩欄 dialog 共用捲軸(2026-07-10 user 拍板:兩欄是組合非元件;組合鐵律 = 各欄自帶
# ScrollArea,overlay-surface.spec.md「兩欄 dialog 組合 canonical」)。簽名 = Dialog body +
# 欄分隔 border-l + ScrollArea 少於 2 = 兩欄共用單一捲軸。
if echo "$CONTENT" | grep -qE '<(DS\.)?Dialog(Body|Content)\b' && \
   echo "$CONTENT" | grep -q 'border-l' && \
   echo "$CONTENT" | grep -qE 'className="[^"]*flex[^"]*"' && \
   [ "$(echo "$CONTENT" | grep -o '<ScrollArea' | wc -l | tr -d ' ')" -lt 2 ] && \
   ! echo "$CONTENT" | grep -q '@two-pane-dialog-ok:'; then
  VIOLATIONS="${VIOLATIONS}  - 兩欄 dialog(border-l 欄分隔)但 ScrollArea < 2 = 共用單一捲軸 → 各欄自帶 <ScrollArea> 獨立捲(overlay-surface.spec.md「兩欄 dialog 組合 canonical」;archetype = WM WorkItemDetailDialog / FileViewer InfoPanel)。非兩欄語義 → @two-pane-dialog-ok: <rationale>\n"
fi
# C12 Field family 硬寬:Select/Combobox/DatePicker/PeoplePicker 帶 w-N / w-[Npx] 硬寬
# → width="hug"/"fill" 語義軸(field-controls.spec.md「寬度」)。
if echo "$CONTENT" | grep -qE '<(DS\.)?(Select|Combobox|DatePicker|PeoplePicker)\b[^>]*className="[^"]*\bw-([0-9]+|\[[0-9]+(px|rem)\])' && \
   ! echo "$CONTENT" | grep -q '@field-width-ok:'; then
  VIOLATIONS="${VIOLATIONS}  - Field 家族控件 className 硬寬(w-N / w-[Npx])→ 用 width=\"hug\"(內容自適)或預設 fill(field-controls.spec.md「寬度」;WM 詳情 metadata 全 hug 拍板錨例)。特例 → @field-width-ok: <rationale>\n"
fi

# Pattern 6: Overlay trigger without defaultOpen state for visual demo
# (Skip in production .tsx; only enforce in .stories.tsx where visual snapshot matters)
if echo "$FILE" | grep -qE '\.stories\.tsx$'; then
  for overlay in Tooltip Popover Dialog Sheet DropdownMenu; do
    if echo "$CONTENT" | grep -qE "<(DS\.)?${overlay}\b" && \
       ! echo "$CONTENT" | grep -qE "(defaultOpen|open=\{(true|isOpen)\})"; then
      VIOLATIONS="${VIOLATIONS}  - Story uses <${overlay}> without defaultOpen — visual audit can't see overlay content\n"
    fi
  done
fi

if [ -n "$VIOLATIONS" ]; then
  cat >&2 << EOF
🚨 CONSUMER-DS-PRIMITIVE-MISUSE BLOCKER(P0,2026-05-27 user verbatim「做產品真的要能使用跟 ds repo 一模一樣的元件」)

  File $FILE detected anti-pattern DS API usage:
$(echo -e "$VIOLATIONS")
  per M31 codex synthesis SSOT + DS spec.md citations(file:line 在每條 violation).

  Anchor:user 2026-05-27 抓 7 個 visual bug 全 root cause = consumer minimal-mock 抹平
  DS canonical 設計意圖。本 hook 攔 production 重犯同 pattern。

  修法 2 選 1:
    (a) 改用 DS canonical pattern(per file:line cited spec).
    (b) Escape:加 \`// @ds-misuse-allow: <rationale>\` 顯式 documented per file OR per line.

  Per-bug fix paths → /tmp/codex-ssot-output.txt(M31 codex synthesis 2026-05-27)
EOF
  exit 2
fi

exit 0
}

r4_app_story_title() {
set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
# Scope:apps/<name>/**/*.stories.(tsx|ts|mdx)
if ! echo "$FILE" | grep -qE '(^|/)apps/[^/]+/.+\.stories\.(tsx|ts|mdx)$'; then exit 0; fi

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

# Escape clause
if echo "$CONTENT" | grep -qE '@app-story-title-skip:'; then exit 0; fi

# Extract expected app name from file path
APP_NAME=$(echo "$FILE" | sed -E 's|.*/apps/([^/]+)/.*|\1|')
[ -z "$APP_NAME" ] && exit 0

# Find title field(支援 single/double/backtick quote)
TITLE_LINE=$(echo "$CONTENT" | grep -oE "title:\s*['\"\`][^'\"\`]+['\"\`]" | head -1)

# 若無 title field,skip(no-op stories OK)
[ -z "$TITLE_LINE" ] && exit 0

EXPECTED_PREFIX="Apps/${APP_NAME}/"

# Check title 是否開頭 `Apps/<app-name>/`
if ! echo "$TITLE_LINE" | grep -qE "title:\s*['\"\`]Apps/${APP_NAME}/"; then
  cat >&2 << EOF
🚨 CONSUMER APP STORY TITLE BLOCKER(P0,2026-05-28 codify per create-app duplicate-id anchor)

  File: $FILE
  Detected title: $TITLE_LINE
  Expected prefix: \`title: 'Apps/${APP_NAME}/...'\`

  Why blocked:
    Consumer apps 內 stories 必用 \`Apps/<app-name>/<page-purpose>\` 開頭 namespace
    (per .claude/rules/story-rules.md「Title 命名 2-namespace canonical」)。
    錯 prefix → Storybook glob 撈到後與 template/其他 app 撞 id → build duplicate
    warning + 只顯第一個 → 新 app 在 sidebar 不可見。

  Anchor:2026-05-28 npm run create-app 不改 story title 導致 e2e 抓 4 個 collisions。

  Fix:
    title: 'Apps/${APP_NAME}/<Your Page Purpose>'  // ex: 'Apps/${APP_NAME}/Dashboard'

  Escape(極罕見):add \`// @app-story-title-skip: <rationale>\`
EOF
  exit 2
fi

exit 0
}

for _rule in r1_no_ds_catalog r2_story_baseline r3_ds_primitive_misuse r4_app_story_title; do
  echo "$INPUT" | "$_rule"
  _rc=$?
  if [ "$_rc" -eq 2 ]; then exit 2; fi
done
exit 0

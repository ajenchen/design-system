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

# High-risk DS primitives requiring baseline marker
HIGH_RISK_PRIMITIVES='DataTable|Dialog|Sheet|Popover|DropdownMenu|Tooltip|HoverCard|LinkInput|RadioGroup|CircularProgress|AppShell|Sidebar'

# Detect usage
USED=$(echo "$CONTENT" | grep -oE "<DS\.($HIGH_RISK_PRIMITIVES)\\b" | sort -u | head -10)

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

VIOLATIONS=""

# Pattern 1: <CircularProgress size={N}> with literal number (override default 24)
if echo "$CONTENT" | grep -qE '<DS\.CircularProgress[^>]+size=\{[0-9]+\}'; then
  VIOLATIONS="${VIOLATIONS}  - <CircularProgress size={N}> hardcoded number override default 24 (per circular-progress.spec.md:101)\n"
fi

# Pattern 2: <RadioGroupItem> NOT wrapped in <SelectionItem control={...}>
# Approximation: file uses RadioGroupItem but doesn't reference SelectionItem
if echo "$CONTENT" | grep -qE '<DS\.RadioGroupItem\b' && ! echo "$CONTENT" | grep -qE 'SelectionItem|<DS\.RadioGroupItem[^>]+label='; then
  VIOLATIONS="${VIOLATIONS}  - <RadioGroupItem> 沒 wrap <SelectionItem control={<RadioGroupItem>}> (per selection-item.spec.md:23 SSOT spacing/padding)\n"
fi

# Pattern 3: <DataTable columns={[…]}> with literal single column
if echo "$CONTENT" | grep -qE '<DS\.DataTable[^>]+columns=\{\[\s*\{[^}]+\}\s*\]\}' && ! echo "$CONTENT" | grep -qE 'columns=\{[^}]*\},\s*\{'; then
  VIOLATIONS="${VIOLATIONS}  - <DataTable columns={[single-col]}> minimal one-column = 違反 data-table.spec.md canonical(min 2 cols for meaningful render)\n"
fi

# Pattern 4: <LinkInput placeholder=...> without value prop
if echo "$CONTENT" | grep -qE '<DS\.LinkInput[^>]+placeholder=' && ! echo "$CONTENT" | grep -qE '<DS\.LinkInput[^>]+(value|defaultValue)='; then
  VIOLATIONS="${VIOLATIONS}  - <LinkInput placeholder=...> 沒 value prop = placeholder-only mode 抹平 link/edit canonical (per link-input.spec.md:18,48-58)\n"
fi

# Pattern 5: <Empty title=...> without icon and without description
if echo "$CONTENT" | grep -qE '<DS\.Empty[^>]+title=' && \
   ! echo "$CONTENT" | grep -qE '<DS\.Empty[^>]+icon=' && \
   ! echo "$CONTENT" | grep -qE '<DS\.Empty[^>]+description='; then
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
# app-shell.spec.md:296-299 明文禁 sidebar={<div>}/header={<header>},原註「靠 audit 把關」
# 無機械閘 → 兌現成 P0(per memory feedback_ssot_mechanical_p0_not_p1_warn)。
# 零誤判:雙條件 = 同檔有 <DS.AppShell> + slot 屬性直接餵 raw tag(div/header/nav/aside/section)。
if echo "$CONTENT" | grep -qE '<DS\.AppShell\b' && \
   echo "$CONTENT" | grep -qE '\b(header|sidebar|aside)=\{ *<(div|header|nav|aside|section)\b'; then
  VIOLATIONS="${VIOLATIONS}  - <AppShell header/sidebar/aside={<raw element>}> — slot 必餵 DS 元件(ChromeHeader / Sidebar / AppShellAside),raw div/header 漏接 border/scroll/responsive canonical(per app-shell.spec.md:296-299)\n"
fi

# Pattern 6: Overlay trigger without defaultOpen state for visual demo
# (Skip in production .tsx; only enforce in .stories.tsx where visual snapshot matters)
if echo "$FILE" | grep -qE '\.stories\.tsx$'; then
  for overlay in Tooltip Popover Dialog Sheet DropdownMenu; do
    if echo "$CONTENT" | grep -qE "<DS\.${overlay}\b" && \
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

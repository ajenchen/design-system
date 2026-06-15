#!/bin/bash
# check_consumer_ds_primitive_misuse.sh — P0 BLOCKER
#
# 偵測 consumer production code(`.tsx`)用 DS primitive 但走 anti-pattern API 用法
# (per user 2026-05-27 verbatim「做產品真的能使用跟 ds repo 一模一樣的元件做產品嗎?」
# +「眼不見為淨欸,重點是你他媽做產品真的要能使用跟 ds repo 一模一樣的元件才是目標」)
#
# Anchor 2026-05-27 — 7 bugs caught by user 在 storybook 但同樣的 anti-pattern 會出現在
# production App.tsx / page components:
#   1. <CircularProgress size={N}> 任意 number 而非 default 24
#   2. <RadioGroupItem> 沒 wrap <SelectionItem control={...}>(per selection-item.spec.md:23)
#   3. <DataTable columns={[<2 cols]}> minimal mock 看起來破
#   4. <LinkInput placeholder=...> 沒 value prop = placeholder-only mode 抹平 link/edit pattern
#   5. <Empty title=...> 無 icon AND 無 description = 違反 Empty.tsx:11「預設只需 description」
#   6. <Tooltip|Popover|Dialog|Sheet|DropdownMenu> trigger 後 user 無路徑看 content
#   7. <DS.X> 內 free-form ad-hoc layout 跟 DS canonical 結構差異
#
# Triggers on consumer apps/**/*.tsx + .stories.tsx edit. Blocks anti-patterns above.
#
# Escape:per-line `// @ds-misuse-allow: <rationale>` documented exception.

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
# Cover BOTH stories AND production .tsx in consumer apps
if ! echo "$FILE" | grep -qE '/(apps|consumer)/.*\.(tsx|ts)$'; then exit 0; fi
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

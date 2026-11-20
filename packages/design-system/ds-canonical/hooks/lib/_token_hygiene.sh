#!/bin/bash
# 執法等級:擋(只看這次新增的行)+ 逐行豁免 —— 五條都寫在規格裡(utility-registry.json / AGENTS 失敗記憶 / build-ui-canonicals.md「overflow 使用三規則」),regex 判得出來(D4-02 審計 2026-11-18 起)。
#
# PostToolUse helper(由 post_edit_dispatcher.sh 依序呼叫):DS component / pattern .tsx 的 token 紀律 / 跨 OS 違規。
#
# 五條:
# 1. shadcn compat alias 回流 — 名單 SSOT = utility-registry.json `shadcn_alias.block.color_alias`
# 2. Tailwind v4 `[--foo]` 簡寫 — 必須 `var()` 包(AGENTS.md「失敗記憶索引」:silent 失效;
#    Sidebar `w-[--sidebar-width]` 曾壞 8 處)
# 3. Tailwind 預設陰影 `shadow-sm/md/lg/…` — 必須用 elevation token(elevation.spec.md「層級」)
# 4. 原料色名當 Tailwind utility(bg-neutral-3 / text-blue-6)— silent 失效(color.spec.md「禁止事項」)
# 5. 原生 overflow-{auto,scroll} — 元件 .tsx 內禁止,改用 ScrollArea
#    (references/build-ui-canonicals.md「overflow 使用三規則」1;例外見 scroll-area.spec.md「何時用」)
#
# 判定(D4-02 審計 2026-11-18 起):
#   - 只對**這次編輯新增的行**擋(新增行的定義見 lib/_added_lines.sh)→ exit 2。
#   - 檔案裡早就在的命中不擋,列成「既有」放進 governanceContext,交 /design-system-audit dim 5 收
#     (2026-11-20 全樹唯讀掃描(81df56e4):1–4 條 0 處;第 5 條 4 檔 7 處 —— AppShell/app-shell.tsx 2、DataTable/data-table.tsx 3、
#      patterns/overlay-surface/overlay-surface.tsx 1、Command/command.tsx 1(後者在多行註解裡,屬誤判;不是新增行就不會擋)。
#      逐處清單在 D4-02 審計摘要(本輪 knowledge-prune Phase 5 報告),這裡不寫行號 —— 行號會漂)。
#   - 純註解行(`//`、` *`、`/*`、`{/*` 開頭)不算 —— 文件裡引用 shadcn 原文(DropdownMenu/dropdown-menu.tsx 檔頭說明 data-highlighted 那段)不是用法。
#   - 逐行豁免(同一行,冒號後要寫理由):
#       1 / 3 / 4 → `@token-registry-ok: <理由>`(與 PreToolUse 的 check_opacity_token_usage.sh 同一個標記、同一份 registry)
#       2         → `@css-var-shorthand-ok: <理由>`
#       5         → `@native-overflow-ok: <理由>`(例:DataTable 中央捲動區走原生捲軸,scroll-area.spec.md「何時用」)
#   - 為什麼 PreToolUse 已經擋 1 / 3 / 4 還要在這裡擋:那支只讀 content / new_string,MultiEdit 的 edits[] 它看不到。

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/_provider_paths.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: token hygiene corpus resolver unavailable\n' >&2
  exit 70
}
source "$(dirname "$0")/_added_lines.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: token hygiene added-lines helper unavailable\n' >&2
  exit 70
}

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Scope: only design-system component / pattern .tsx files (not stories, not specs)
if ! grep -qE 'packages/design-system/src/(components|patterns)/.*\.tsx$' <<<"$FILE_PATH"; then
  exit 0
fi
if grep -qE '\.stories\.tsx$' <<<"$FILE_PATH"; then
  exit 0
fi
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

integrity() {
  printf 'GOVERNANCE_INTEGRITY: token hygiene %s\n' "$1" >&2
  exit 70
}

# ── Check 1 的名單:runner 認證過的 utility registry(缺 / 壞 = 量具失效,不另備一份寫死的後備名單)──
_CORPUS_ROOT=$(governance_corpus_root 2>/dev/null) || integrity 'corpus root unavailable'
_REG="$_CORPUS_ROOT/packages/design-system/src/tokens/utility-registry.json"
if [ -L "$_REG" ] || [ ! -f "$_REG" ] || [ ! -r "$_REG" ]; then
  integrity 'utility registry unavailable or unsafe'
fi
_SHADCN_LIST=$(jq -er '
  select(
    .schemaVersion == 1
    and ._meta.owner == "packages/design-system/src/tokens/utility-registry.json"
    and (._meta.provider_view_policy | type == "string" and length > 0)
  )
  | .shadcn_alias.block.color_alias
  | select(type == "array" and length > 0 and (unique | length) == length)
  | join("|")
' "$_REG" 2>/dev/null) || integrity 'utility registry invalid'

WORK=$(mktemp -d "${TMPDIR:-/tmp}/token-hygiene.XXXXXX") || integrity 'work dir unavailable'
trap 'rm -rf -- "$WORK"' EXIT
governance_added_line_numbers "$INPUT" "$FILE_PATH" "$WORK/numbers" || integrity 'added-lines measurement failed'

COMMENT_LINE='^[0-9]+:[[:space:]]*(//|\*|/\*|\{/\*)'
REGISTRY_OK='@token-registry-ok:[ \t]*[^ \t]'
BLOCK=""
EXISTING=""

# 同一條規則:去掉註解行與豁免行 → 依行號分成新增 / 既有 → 組訊息(每份最多列 5 行,只是顯示上限,不是掃描上限)
classify() {
  local name="$1" hits="$2" marker="$3" title="$4" fix="$5" added existing
  hits=$(printf '%s\n' "$hits" | grep -vE "$COMMENT_LINE")
  hits=$(governance_drop_escaped_hits "$hits" "$FILE_PATH" "$marker" same) || integrity "escape filter failed:${name}"
  governance_split_hits "$hits" "$WORK/numbers" "$WORK/$name.added" "$WORK/$name.existing" || integrity "hit split failed:${name}"
  added=$(awk 'NR <= 5' "$WORK/$name.added")
  existing=$(awk 'NR <= 5' "$WORK/$name.existing")
  if [ -n "$added" ]; then
    BLOCK="${BLOCK}"$'\n'"⛔ ${title}(這次新增的行):"$'\n'"${added}"$'\n'"  ${fix}"
  fi
  if [ -n "$existing" ]; then
    EXISTING="${EXISTING}"$'\n'"• ${title}(既有 $(grep -c . "$WORK/$name.existing") 處):"$'\n'"${existing}"
  fi
}

# ── Check 1: shadcn compat alias 回流 ─────────────────────────────────────────
classify shadcn "$(grep -nE "\\b(${_SHADCN_LIST})\\b" "$FILE_PATH" 2>/dev/null)" "$REGISTRY_OK" \
  'shadcn compat alias(必須遷移為 direct token)' \
  "映射: bg-popover→bg-surface-raised / text-popover-foreground→text-foreground / text-muted-foreground→text-fg-muted / bg-accent→bg-neutral-hover / text-accent-foreground→text-foreground / bg-destructive→bg-error / bg-background→bg-canvas / bg-card→bg-surface / text-card-foreground→text-foreground / border-input→border-border / text-primary-foreground→text-on-emphasis(實心底上的字,color.spec.md;不是 text-white)/（其餘 registry alias → 依用途查 color.spec.md 的用途表,見 tokens/color/semantic.css）。豁免:同一行 \`@token-registry-ok: <理由>\`"

# ── Check 2: Tailwind v4 [--foo] 簡寫(silent fail)─────────────────────────
# [&[data-...]] / [&:hover] 這類 arbitrary variant(左括號後是 & 或冒號)不是這種寫法
classify shorthand "$(grep -nE '\[--[a-z][a-z0-9-]*\]' "$FILE_PATH" 2>/dev/null | grep -v '\[&')" \
  '@css-var-shorthand-ok:[ \t]*[^ \t]' \
  'Tailwind v4 [--foo] 簡寫(silent fail,必須 var() 包覆)' \
  '修法:將 [--foo] 改為 [var(--foo)]。豁免:同一行 `@css-var-shorthand-ok: <理由>`'

# ── Check 3: Tailwind 預設陰影 ────────────────────────────────────────────────
# 允許:shadow-none / shadow-[var(--elevation-N)] / shadow-[calc(...)]
classify shadow "$(grep -nE '\bshadow-(2xs|xs|sm|md|lg|xl|2xl|inner)\b' "$FILE_PATH" 2>/dev/null)" "$REGISTRY_OK" \
  'Tailwind 預設陰影(禁用,必須用 elevation token)' \
  '修法:不照 Tailwind 尺寸換名字,依用途選(elevation.spec.md「層級」):頁面內容層 → shadow-[var(--elevation-100)];浮層 → shadow-[var(--elevation-200)](配 bg-surface-raised)。豁免:同一行 `@token-registry-ok: <理由>`'

# ── Check 4: 原料色名當 Tailwind utility(silent fail)─────────────────────
# 原料 token 只在 :root 宣告,沒經 semantic.css 的 @theme inline 橋接 → bg-neutral-3 編譯後不生成任何規則。
# 歷史 bug:2026-04-22 FileItem compact static bg 用 `bg-neutral-3` 完全沒底色。
# 色相 ⊇ tokens/color/primitives.css 的色相(scripts/token-allowlist-invariant.mjs 逐色相驗;2026-11-15 補 amber / lime / magenta / turquoise)
PRIMITIVE_PATTERN='\b(bg|text|border|ring|fill|stroke|shadow|outline|decoration|divide|placeholder|caret|accent)-(neutral|blue|red|green|yellow|orange|purple|pink|cyan|teal|indigo|violet|deep-orange|amber|lime|magenta|turquoise)-[0-9]+\b'
classify primitive "$(grep -nE "$PRIMITIVE_PATTERN" "$FILE_PATH" 2>/dev/null)" "$REGISTRY_OK" \
  '原料色名當 Tailwind utility(silent fail)' \
  '修法:依用途選語意色(color.spec.md 的用途表:表面分層 / 文字層級 / muted vs secondary 等),例 bg-secondary / bg-muted / bg-surface / text-fg-muted。不要改成 bg-[var(--color-…)] 讀原料 —— 那同樣越過語意層(color.spec.md「禁止事項」;只有 Tag / Avatar / Calendar 的類別色例外)。豁免:同一行 `@token-registry-ok: <理由>`'

# ── Check 5: 原生 overflow-{auto,scroll} ─────────────────────────────────────
# 例外(不算命中):刻意隱藏的**水平**捲軸(overflow-x-* 同一行有 scrollbar-none 或 [scrollbar-width:none])=
# horizontal-overflow pattern;use-overflow-items 的消費端。垂直 overflow-y-auto 配隱藏捲軸不在例外裡,照擋。
# 2026-11-18 修:原排除式寫成 `[^\n]*`,在 ERE 的中括號裡那是「不是反斜線、也不是字母 n」——
# `overflow-x-auto overflow-y-hidden [scrollbar-width:none]` 中間的 hidden 有 n,排除失效,Tabs 兩行因此被誤報。
OVERFLOW_HITS=$(grep -nE '\boverflow-(auto|scroll|x-auto|x-scroll|y-auto|y-scroll)\b' "$FILE_PATH" 2>/dev/null \
  | grep -vE 'overflow-x-[a-z]+.*(scrollbar-none|\[scrollbar-width:none\])|(scrollbar-none|\[scrollbar-width:none\]).*overflow-x-[a-z]+' \
  | grep -vE 'useOverflow|horizontal-overflow')
classify overflow "$OVERFLOW_HITS" '@native-overflow-ok:[ \t]*[^ \t]' \
  '原生 overflow-auto/scroll(跨 OS 跑版)' \
  '修法:改用 ScrollArea(`@/design-system/components/ScrollArea/scroll-area`)取得跨 OS 一致的 overlay 捲軸(references/build-ui-canonicals.md「overflow 使用三規則」)。刻意隱藏水平捲軸 + fade-mask 屬 horizontal-overflow pattern。規格明文的例外(scroll-area.spec.md「何時用」:DataTable 中央捲動區)→ 同一行 `@native-overflow-ok: <理由 + 規格出處>`'

[ -n "$BLOCK" ] && BLOCK="Token hygiene:這次編輯新增了違規的行(provider-neutral canonical 禁止項;silent-fail bug class —— 不會 compile error,但 runtime 視覺或行為會壞)。${BLOCK}"
[ -n "$EXISTING" ] && EXISTING="Token hygiene 既有違規(不是這次新增的行,不擋;清單由 /design-system-audit dim 5 收):${EXISTING}"
governance_emit_verdict "$BLOCK" "$EXISTING"

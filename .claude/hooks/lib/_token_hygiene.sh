#!/bin/bash
# PostToolUse hook: catch 5 classes of token hygiene / cross-OS violations on component/pattern tsx edits.
#
# Detects (ALL are silent-fail or cross-OS drift bug classes per CLAUDE.md):
# 1. shadcn compat alias 回流 — bg-popover / text-muted-foreground / bg-accent / text-accent-foreground / text-popover-foreground / bg-destructive / bg-background / bg-card / border-input / text-primary-foreground
#    (these are shadcn safety-net aliases; our DS code MUST use direct tokens)
# 2. Tailwind v4 `[--foo]` shorthand — must be `var(--foo)` wrapped; historical bug:
#    Sidebar's `w-[--sidebar-width]` broke 8 places (silent fail, no error)
# 3. Hardcoded Tailwind shadow — `shadow-sm/md/lg/xl/2xl` is forbidden; must use `shadow-[var(--elevation-N)] N∈{100,200}`
# 4. primitive color name used as Tailwind utility — bg-neutral-3 / text-blue-6 silent-fail; use semantic utility or var()
# 5. Native overflow-{auto,scroll} without ScrollArea — cross-OS scrollbar drift
#    (macOS overlay 不吃寬 / Windows always-visible 吃 17px = 跨 OS 跑版)
#    應改用 ScrollArea(Components/ScrollArea/)— overlay scrollbar 跨 OS 一致
#
# WARN-style (not BLOCK): hook emits additionalContext so AI reads and can fix in next iteration.

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire

FILE_PATH=$(jq -r '.tool_input.file_path // empty')

# Scope: only design-system component / pattern .tsx files (not stories, not specs)
if ! echo "$FILE_PATH" | grep -qE 'packages/design-system/src/(components|patterns)/.*\.tsx$'; then
  exit 0
fi
if echo "$FILE_PATH" | grep -qE '\.stories\.tsx$'; then
  exit 0
fi
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

VIOLATIONS=""

# ── Check 1: shadcn compat alias 回流 ─────────────────────────────────────────
# These are all shadcn safety-net aliases. Our code must use direct tokens instead.
# bg-muted / bg-secondary / ring-ring are OUR tokens (kept), not listed here.
SHADCN_PATTERN='\b(bg-popover|text-popover-foreground|text-muted-foreground|bg-accent|text-accent-foreground|bg-destructive|bg-background|bg-card|text-card-foreground|border-input|text-primary-foreground)\b'
SHADCN_HITS=$(grep -nE "$SHADCN_PATTERN" "$FILE_PATH" 2>/dev/null | head -5)
if [ -n "$SHADCN_HITS" ]; then
  VIOLATIONS="${VIOLATIONS}\n⚠️ shadcn compat alias found (必須遷移為 direct token):\n${SHADCN_HITS}\n  映射: bg-popover→bg-surface-raised / text-popover-foreground→text-foreground / text-muted-foreground→text-fg-muted / bg-accent→bg-neutral-hover / text-accent-foreground→text-foreground / bg-destructive→bg-error / bg-background→bg-canvas / bg-card→bg-surface / border-input→border-border / text-primary-foreground→text-white"
fi

# ── Check 2: Tailwind v4 [--foo] shorthand (silent fail) ─────────────────────
# Arbitrary-value class 引用 CSS variable 必須 var() 包覆,不能 [--foo] shorthand.
# Matches: w-[--foo], h-[--bar-baz], shadow-[--elevation-100] 等
# False positive exclusion: [&[data-...]] / [&:hover] 等 arbitrary variants (open bracket 後跟 & 或冒號)
TWV4_PATTERN='\[--[a-z][a-z0-9-]*\]'
TWV4_HITS=$(grep -nE "$TWV4_PATTERN" "$FILE_PATH" 2>/dev/null | grep -v '\[&' | head -5)
if [ -n "$TWV4_HITS" ]; then
  VIOLATIONS="${VIOLATIONS}\n⚠️ Tailwind v4 [--foo] shorthand found (silent fail,必須 var() 包覆):\n${TWV4_HITS}\n  修法:將 [--foo] 改為 [var(--foo)]"
fi

# ── Check 3: Hardcoded Tailwind shadow ────────────────────────────────────────
# shadow-sm/md/lg/xl/2xl 是 Tailwind 預設,繞過 elevation token 系統——禁止.
# 允許:shadow-none / shadow-[var(--elevation-N)] N∈{100,200} / shadow-[calc(...)]
SHADOW_PATTERN='\bshadow-(sm|md|lg|xl|2xl|inner)\b'
SHADOW_HITS=$(grep -nE "$SHADOW_PATTERN" "$FILE_PATH" 2>/dev/null | head -5)
if [ -n "$SHADOW_HITS" ]; then
  VIOLATIONS="${VIOLATIONS}\n⚠️ Tailwind default shadow found (禁用,必須用 elevation token):\n${SHADOW_HITS}\n  修法:shadow-sm→shadow-[var(--elevation-100)] / shadow-md→shadow-[var(--elevation-200)] / shadow-lg→shadow-[var(--elevation-200)](2026-05-31 修:elevation-300 不存在,最高 tier 是 200)"
fi

# ── Check 4: primitive color name used as Tailwind utility (silent fail) ─────
# Primitive tokens (`--color-neutral-N` / `--color-blue-N` 等) 只在 :root 宣告,
# 沒經 semantic.css 的 `@theme inline` 橋接 → 寫 `bg-neutral-3` / `text-blue-6`
# 當 Tailwind utility 會 silent 失效(class 編譯後不生成任何規則)。
# 正確:用 semantic utility(bg-secondary / bg-muted)或 arbitrary value
# `bg-[var(--color-neutral-3)]`(Tag categorical 色常用)。
# 歷史 bug:2026-04-22 FileItem compact static bg 用 `bg-neutral-3` 完全沒底色,
# user 對照 Badge low 可見才發現;spec layer + 本 hook 同步修。
PRIMITIVE_PATTERN='\b(bg|text|border|ring|fill|stroke|shadow|outline|decoration|divide|placeholder|caret|accent)-(neutral|blue|red|green|yellow|orange|purple|pink|cyan|teal|indigo|violet|deep-orange)-[0-9]+\b'
PRIMITIVE_HITS=$(grep -nE "$PRIMITIVE_PATTERN" "$FILE_PATH" 2>/dev/null | head -5)
if [ -n "$PRIMITIVE_HITS" ]; then
  VIOLATIONS="${VIOLATIONS}\n⚠️ Primitive color name used as Tailwind utility (silent fail):\n${PRIMITIVE_HITS}\n  修法:改用 semantic utility(bg-secondary / bg-muted / bg-surface / text-fg-muted 等)或 arbitrary value(bg-[var(--color-neutral-3)] 給 Tag categorical 色用)。理由:primitive token 沒經 @theme inline 橋接,bg-neutral-3 等會 silent 失效。"
fi

# ── Check 5: native overflow-{auto,scroll} without ScrollArea ─────────────────
# 在 component / pattern .tsx 裡 raw overflow-auto / overflow-scroll =
# 跨 OS scrollbar 不一致(macOS overlay / Windows always-visible 吃 17px)。
# 應改用 ScrollArea(Components/ScrollArea/)。
# 允許:horizontal-overflow pattern(有 scrollbar-none / fade-mask 特殊 UX)/
#      use-overflow-items hook consumers(Tabs/ChipGroup hiding scroll)
# 2026-06-11 deep-audit R2(n=29):豁免 regex 補認 [scrollbar-width:none] arbitrary 語法 —
# Tabs(tabs.tsx:211,307)/ Chip(chip.tsx:173,298)hidden-scrollbar 實寫
# `overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`,與 FileViewer 的
# `scrollbar-none` utility 同語意;舊 regex 只認後者 → 豁免失效噪音 warn。
# 同輪補:剝離純註解行(grep -n 輸出 `N:content` 前綴)— Tabs tabs.tsx:126,173,176,239 等
# rationale 註解提及 overflow-x-auto 屬說明文字,非 className 用法,不構成跨 OS scrollbar drift。
OVERFLOW_PATTERN='\boverflow-(auto|scroll|x-auto|x-scroll|y-auto|y-scroll)\b'
# 2026-06-11 R2 Phase B(codex b3 抓縫):hidden-scrollbar 豁免限水平(overflow-x;canonical =
# horizontal-overflow pattern)— vertical overflow-y-auto 配 scrollbar-width:none 不在 canonical,照 warn。
OVERFLOW_HITS=$(grep -nE "$OVERFLOW_PATTERN" "$FILE_PATH" 2>/dev/null | grep -vE '^[0-9]+:[[:space:]]*(//|\*|/\*|\{/\*)' | grep -vE 'overflow-x-[a-z]+[^\n]*(scrollbar-none|\[scrollbar-width:none\])|(scrollbar-none|\[scrollbar-width:none\])[^\n]*overflow-x-[a-z]+' | grep -vE 'useOverflow|horizontal-overflow' | head -5)
if [ -n "$OVERFLOW_HITS" ]; then
  VIOLATIONS="${VIOLATIONS}\n⚠️ Native overflow-auto/scroll found (可能造成跨 OS 跑版):\n${OVERFLOW_HITS}\n  考慮改用 ScrollArea(\`@/design-system/components/ScrollArea/scroll-area\`)取得跨 OS 一致 overlay 捲軸。例外:刻意隱藏捲軸(scrollbar-none)+ fade-mask UX 屬 horizontal-overflow pattern,不套用本規則。"
fi

# ── Emit warning if any violation found ────────────────────────────────────
if [ -n "$VIOLATIONS" ]; then
  # Escape for JSON (newlines)
  ESCAPED=$(printf "%b" "$VIOLATIONS" | jq -Rs .)
  cat <<EOJSON
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Token hygiene 檢查發現違規 (CLAUDE.md 明文禁止項):${ESCAPED}\n\n這些是 silent-fail bug classes——不會造成 compile error,但 runtime 視覺或行為會壞。下個 Edit 回去修。"}}
EOJSON
fi

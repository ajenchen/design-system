#!/bin/bash
# PostToolUse hook: catch 4 classes of token hygiene / cross-OS violations on component/pattern tsx edits.
#
# Detects (ALL are silent-fail or cross-OS drift bug classes per CLAUDE.md):
# 1. shadcn compat alias 回流 — bg-popover / text-muted-foreground / bg-accent / text-accent-foreground / text-popover-foreground / bg-destructive / bg-background / bg-card / border-input / text-primary-foreground
#    (these are shadcn safety-net aliases; our DS code MUST use direct tokens)
# 2. Tailwind v4 `[--foo]` shorthand — must be `var(--foo)` wrapped; historical bug:
#    Sidebar's `w-[--sidebar-width]` broke 8 places (silent fail, no error)
# 3. Hardcoded Tailwind shadow — `shadow-sm/md/lg/xl/2xl` is forbidden; must use `shadow-[var(--elevation-*)]`
# 4. Native overflow-{auto,scroll} without ScrollArea — cross-OS scrollbar drift
#    (macOS overlay 不吃寬 / Windows always-visible 吃 17px = 跨 OS 跑版)
#    應改用 ScrollArea(Components/ScrollArea/)— overlay scrollbar 跨 OS 一致
#
# WARN-style (not BLOCK): hook emits additionalContext so AI reads and can fix in next iteration.

FILE_PATH=$(jq -r '.tool_input.file_path // empty')

# Scope: only design-system component / pattern .tsx files (not stories, not specs)
if ! echo "$FILE_PATH" | grep -qE 'src/design-system/(components|patterns)/.*\.tsx$'; then
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
# 允許:shadow-none / shadow-[var(--elevation-*)] / shadow-[calc(...)]
SHADOW_PATTERN='\bshadow-(sm|md|lg|xl|2xl|inner)\b'
SHADOW_HITS=$(grep -nE "$SHADOW_PATTERN" "$FILE_PATH" 2>/dev/null | head -5)
if [ -n "$SHADOW_HITS" ]; then
  VIOLATIONS="${VIOLATIONS}\n⚠️ Tailwind default shadow found (禁用,必須用 elevation token):\n${SHADOW_HITS}\n  修法:shadow-sm→shadow-[var(--elevation-100)] / shadow-md→shadow-[var(--elevation-200)] / shadow-lg→shadow-[var(--elevation-300)]"
fi

# ── Check 4: native overflow-{auto,scroll} without ScrollArea ─────────────────
# 在 component / pattern .tsx 裡 raw overflow-auto / overflow-scroll =
# 跨 OS scrollbar 不一致(macOS overlay / Windows always-visible 吃 17px)。
# 應改用 ScrollArea(Components/ScrollArea/)。
# 允許:horizontal-overflow pattern(有 scrollbar-none / fade-mask 特殊 UX)/
#      use-overflow-items hook consumers(Tabs/ChipGroup hiding scroll)
OVERFLOW_PATTERN='\boverflow-(auto|scroll|x-auto|x-scroll|y-auto|y-scroll)\b'
OVERFLOW_HITS=$(grep -nE "$OVERFLOW_PATTERN" "$FILE_PATH" 2>/dev/null | grep -vE 'scrollbar-none|useOverflow|horizontal-overflow' | head -5)
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

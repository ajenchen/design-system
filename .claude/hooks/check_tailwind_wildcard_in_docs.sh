#!/bin/bash
# check_tailwind_wildcard_in_docs.sh — P0 BLOCKER
#
# Per 2026-05-28 beta.27 release fail anchor(6+ CI iterations 燒):
# Tailwind v4 vite plugin scans .md / .spec.md / docs by default。
# 文件範例 like `shadow-[var(--elevation-*)]` 或 `var(--field-height-*)` /
# `var(--elevation-100/200/300)` 是給 dev 看的 shorthand notation(`*` /  `/` 代表
# enumeration placeholder),但 Tailwind 不知 → 當 literal class string 抓 → 產
# invalid CSS `var(--X-*)` `var(--X-A/B/C)` → Storybook FULL smoke 死。
#
# 機械強制 PreToolUse Edit/Write:阻止寫入新檔含此 anti-pattern。
# 改用 math notation:`var(--X-N) N∈{a,b,c}` Tailwind 不會誤判。
#
# Scope:所有 .md / .spec.md / .sh / .ts / .tsx 寫入時 grep new_string。
# Exit 2 BLOCKER + cite this anchor。Escape:`@tailwind-wildcard-allow:` comment。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: hook integrity helper unavailable\n' >&2
  exit 70
}

set -uo pipefail

governance_hook_load_input
governance_hook_require_commands grep sed sort
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'Tailwind wildcard tool extraction failed'

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'Tailwind wildcard path extraction failed'
# Self-exemption:本 hook help-text 合法含 anti-pattern literal 作為文件範例(且 .sh 不被 Tailwind
# vite plugin 掃,無 build 風險)→ 不掃自己,避免 self-trigger false-positive(2026-05-30 test-surfaced)。
case "$FILE" in */check_tailwind_wildcard_in_docs.sh) exit 0 ;; esac
# Provider runtime artifacts no longer live inside the checkout. Do not add provider-specific path
# exemptions here: a future provider receives the same Tailwind protection without hook changes.
# Only check files Tailwind v4 might scan
if ! governance_hook_grep_q 'Tailwind wildcard scope matcher failed' "$FILE" -qE '\.(md|spec\.md|sh|ts|tsx|css|json)$'; then exit 0; fi

CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'Tailwind wildcard content extraction failed'
[ -z "$CONTENT" ] && exit 0

# Escape clause
if governance_hook_grep_q 'Tailwind wildcard escape matcher failed' "$CONTENT" -qE '@tailwind-wildcard-allow:'; then exit 0; fi

# Detect anti-patterns(class form with wildcard / slash enumeration in CSS var)
# 2026-05-30 fix(test-surfaced M34 over-narrow):slash-segment 改 repeatable,
# 否則漏多段斜線列舉形式(beta.27 anchor 的 N-段 enum,hook header 列為必擋 anti-pattern)。
governance_hook_grep_capture ANTI_PATTERNS_UNSORTED 'Tailwind wildcard matcher failed' \
  "$CONTENT" -oE 'var\(--[a-z][a-z0-9-]*([\*/]+[a-z0-9-]*)+\)'
ANTI_PATTERNS=$(sort -u <<< "$ANTI_PATTERNS_UNSORTED" 2>/dev/null) \
  || governance_hook_integrity_fail 'Tailwind wildcard sorter failed'

if [ -n "$ANTI_PATTERNS" ]; then
  cat >&2 << EOF
🚨 TAILWIND v4 WILDCARD-IN-DOCS BLOCKER(P0,2026-05-28 beta.27 anchor)

  File: $FILE
  Detected anti-pattern(s):
$(echo "$ANTI_PATTERNS" | sed 's/^/    /')

  Why blocked:
    Tailwind v4 vite plugin scans .md/.ts/etc → 把 \`var(--X-*)\` / \`var(--X-A/B/C)\`
    當 literal class string 抓 → 產 invalid CSS(CSS 變數名禁 \`*\` / \`/\`)→ Storybook
    build 死 → release CI fail。本 anchor:beta.27 6+ CI iteration 燒此問題。

  改用 math notation(Tailwind 不誤判):
    var(--elevation-*)         → var(--elevation-N) N∈{100,200}
    var(--elevation-100/200) → var(--elevation-N) N∈{100,200}
    var(--field-height-*)      → var(--field-height-N) N∈{sm,md,lg}
    var(--layout-space-*)      → var(--layout-space-N) N∈{loose,tight}
    var(--radix-*-available-height) → var(--radix-{popover|hover-card|dialog}-content-available-height)

  Escape(極罕見,本 file 真需要 wildcard token literal):
    add \`// @tailwind-wildcard-allow: <rationale>\` to file content
EOF
  exit 2
fi

exit 0

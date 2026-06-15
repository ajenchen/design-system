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

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
# Self-exemption:本 hook help-text 合法含 anti-pattern literal 作為文件範例(且 .sh 不被 Tailwind
# vite plugin 掃,無 build 風險)→ 不掃自己,避免 self-trigger false-positive(2026-05-30 test-surfaced)。
case "$FILE" in */check_tailwind_wildcard_in_docs.sh) exit 0 ;; esac
# 2026-06-11 R2 held-item #13:.claude/{tmp,logs} 歷史 artifact(codex brief / reply、audit findings
# json、preflight log)非 Tailwind 掃描對象 — src/globals.css 用 explicit positive @source(只掃 src/ +
# packages/{design-system,storybook-config} + .storybook/)且 `@source not "**/.claude/**"`;盤上 12 檔
# 已含 antiPattern 而 build 連續綠(至 beta.61)= 零 build 風險實證。掃描對象路徑(src/packages/docs)
# 保護不變。
case "$FILE" in */.claude/tmp/*|*/.claude/logs/*|.claude/tmp/*|.claude/logs/*) exit 0 ;; esac
# Only check files Tailwind v4 might scan
if ! echo "$FILE" | grep -qE '\.(md|spec\.md|sh|ts|tsx|css|json)$'; then exit 0; fi

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

# Escape clause
if echo "$CONTENT" | grep -qE '@tailwind-wildcard-allow:'; then exit 0; fi

# Detect anti-patterns(class form with wildcard / slash enumeration in CSS var)
# 2026-05-30 fix(test-surfaced M34 over-narrow):slash-segment 改 repeatable,
# 否則漏多段斜線列舉形式(beta.27 anchor 的 N-段 enum,hook header 列為必擋 anti-pattern)。
ANTI_PATTERNS=$(echo "$CONTENT" | grep -oE 'var\(--[a-z][a-z0-9-]*([\*/]+[a-z0-9-]*)+\)' | sort -u)

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

#!/usr/bin/env bash
# check_dynamic_tailwind_class — 攔「動態 Tailwind utility class」脆弱寫法(2026-07-09 root-cause 防線)
#
# 病根(user 以 GitHub Pages 對比抓出的 DataTable row-height regression):
#   `h-table-row-${size}` 這種「class 名本身含 ${...} 插值」的模板字串,Tailwind **靜態掃描看不到**
#   完整 class → 只能靠專案別處剛好有 literal(如 spec.md)被 content-detection 掃到才生成。
#   一旦那個脆弱 literal 消失 / 掃描樹變動(本 case 是 .gitignore 加 reference/)→ 整組 `.h-table-row-*`
#   規則不生成 → 元件靜默塌成內容高度(non-editable 33px / editable 44px 而非 token 40px)+ 選取控件走位。
#   tsc / build 全綠、CI 不紅 = 沉默陷阱。
#
# 正解(對齊 fieldWrapperStyles 的 `h-field-md` cva-literal 慣例):class 名必須是**完整 literal**;
#   要隨變數選 class 用 literal map:`{ sm:'h-table-row-sm', md:'h-table-row-md', lg:'h-table-row-lg' }[size]`。
#
# Scope:production tsx/ts(packages/design-system/src + apps)。CSS var 插值(`var(--x-${y})` / arbitrary
#   value `[...${...}]`)不在此列(那是值,不是 class 名;且 CSS var 真存在,fail-loud 不同機制)。
# Escape:`// @dynamic-tailwind-allow: <理由>` per-line。
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
set -euo pipefail
INPUT=$(cat)
fp=$(printf '%s' "$INPUT" | python3 -c "import sys,json;print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null || true)
content=$(printf '%s' "$INPUT" | python3 -c "import sys,json;d=json.load(sys.stdin).get('tool_input',{});print(d.get('content') or d.get('new_string') or '')" 2>/dev/null || true)
[ -z "$fp" ] && exit 0
case "$fp" in
  *packages/design-system/src/*.tsx|*packages/design-system/src/*.ts|*apps/*/src/*.tsx|*apps/*/src/*.ts) ;;
  *) exit 0 ;;
esac
[ -z "$content" ] && exit 0

# 抓:backtick 字串內、Tailwind 尺寸/間距 utility 前綴 + 之後含 `${` 讓 class 名不完整。
#   e.g. `h-table-row-${size}` / `h-${x}` / `min-h-${y}` / `w-col-${i}` / `gap-${g}` / `py-${p}`
# 排除:`[` 之後(arbitrary value,如 `h-[var(--x-${y})]`)、`var(` 內。
hits=$(printf '%s' "$content" | grep -nE '`[^`]*\b(h|w|min-h|max-h|min-w|max-w|size|gap|space-[xy]|p[xytblr]?|m[xytblr]?)-[a-z0-9-]*\$\{' 2>/dev/null \
  | grep -vE '@dynamic-tailwind-allow' \
  | grep -vE '\[[^]]*\$\{|var\(' || true)

if [ -n "$hits" ]; then
  echo "🚨 BLOCKER: 動態 Tailwind class(class 名含 \${...} 插值)— Tailwind 靜態掃描看不到 → 靜默不生成規則" >&2
  echo "  file: $fp" >&2
  echo "$hits" | sed 's/^/    /' >&2
  echo "" >&2
  echo "  病根:2026-07-09 DataTable row-height regression(h-table-row-\${size} → utility 消失 → row 塌 + 選取走位)" >&2
  echo "  正解:改 literal map,class 名寫完整字面 —" >&2
  echo "    const cls = { sm: 'h-table-row-sm', md: 'h-table-row-md', lg: 'h-table-row-lg' }[size]" >&2
  echo "  逃生:確實非 class(CSS var 值等)→ 行尾加 // @dynamic-tailwind-allow: <理由>" >&2
  exit 2
fi
exit 0

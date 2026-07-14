#!/bin/bash
set -uo pipefail
# Tailwind token registry enforcement hook(2026-05-18 升級 per audit Dim 47 + codex P1-5):
#   原 hook 名 `check_opacity_token_usage.sh`(keep filename for settings.json registration),
#   實際 logic 已升級成 full Tailwind utility registry compliance(per Dim 47 SSOT)。
#
# SSOT source:`packages/design-system/src/tokens/utility-registry.json`(block list per category)。
# 對齊 Atlassian @atlaskit/tokens / Carbon @carbon/themes / Ant ConfigProvider / Polaris polaris-tokens
# token-first lint enforcement。
#
# 檢的 block category:
#   - opacity:opacity-{5..95} numeric tier(原 logic,保留)
#   - typography:text-{xs..9xl} / font-{thin|light|semibold|black} / leading-{N} numeric / tracking-{wide..widest|tighter|tight}
#   - radius:rounded-{xl|2xl|3xl} / rounded(unscoped)/ rounded-[...] arbitrary(例外 rounded-[inherit])
#   - elevation:shadow-{sm|md|lg|xl|2xl|inner} / shadow(unscoped)
#   - shadcn alias:bg-popover / text-muted-foreground / bg-accent 等
#   - primitive 色名:bg-neutral-N / text-blue-N 等(越過 semantic 層)
#
# 例外:utility-registry.json `_meta.exceptions` 段定義的 anatomy stories / principles code blocks 豁免
#       (本 hook 已 skip *.anatomy.stories.tsx / *.principles.stories.tsx 不檢)
#
# 修法:reuse semantic utility / token reference / var() bracket(詳 utility-registry.json `rationale_path`)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

# Scope:.tsx + .css(DS source);skip stories / tests / token spec 自家 / anatomy/principles per registry exception
case "$FILE_PATH" in
  *.tsx|*.css) ;;
  *) exit 0 ;;
esac
case "$FILE_PATH" in
  # 註解:anatomy + principles stories per utility-registry.json `_meta.exceptions` 豁免
  *.anatomy.stories.tsx|*.principles.stories.tsx) exit 0 ;;
  *.stories.tsx|*.test.*|*.spec.tsx) exit 0 ;;
  *tokens/opacity/*|*tokens/typography/*|*tokens/radius/*|*tokens/elevation/*|*tokens/color/*) exit 0 ;;
esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""')
[ -z "$NEW_CONTENT" ] && exit 0
# Per-line escape(2026-07-07 方向 2 升 P0 配套):行內含 `@token-registry-ok: <rationale>` 豁免該行
NEW_CONTENT=$(printf '%s
' "$NEW_CONTENT" | grep -v '@token-registry-ok:' || true)
[ -z "$NEW_CONTENT" ] && exit 0

# Resolve registry path(absolute via $CLAUDE_PROJECT_DIR or relative fallback)
REGISTRY="${CLAUDE_PROJECT_DIR:-}/packages/design-system/src/tokens/utility-registry.json"
if [ ! -f "$REGISTRY" ]; then
  # Fallback: try relative from hook dir
  REGISTRY="$(dirname "$0")/../../packages/design-system/src/tokens/utility-registry.json"
fi
if [ ! -f "$REGISTRY" ]; then
  # 沒 registry → fall back 到原 opacity-only logic(避免 hook 啞掉)
  HITS=$(echo "$NEW_CONTENT" | grep -oE "opacity-[0-9]+" | grep -vE "^opacity-(0|100)$" | sort -u || true)
  if [ -n "$HITS" ]; then
    echo "" >&2
    echo "⚠️  M23 violation(opacity tier;registry 不可用,fallback mode):" >&2
    echo "$HITS" | sed 's/^/     /' >&2
    echo "" >&2
    echo "   reuse opacity-disabled / alpha 色階。詳 tokens/opacity/opacity.spec.md" >&2
  fi
  exit 0
fi

# Aggregate violations across all categories
VIOLATIONS=""

# 1) Opacity numeric tier(opacity-5..95,除 0/100/disabled)
HITS_OPACITY=$(echo "$NEW_CONTENT" | grep -oE "\bopacity-[0-9]+\b" | grep -vE "^opacity-(0|100)$" | sort -u || true)
if [ -n "$HITS_OPACITY" ]; then
  VIOLATIONS="${VIOLATIONS}\n   [opacity] $(echo "$HITS_OPACITY" | tr '\n' ' ')"
fi

# 2) Typography raw size(text-xs..9xl)— skip semantic text-h*/text-body/text-caption/text-helper/text-label
HITS_TEXT=$(echo "$NEW_CONTENT" | grep -oE "\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b" | sort -u || true)
if [ -n "$HITS_TEXT" ]; then
  VIOLATIONS="${VIOLATIONS}\n   [typography size] $(echo "$HITS_TEXT" | tr '\n' ' ')"
fi

# 3) Typography raw weight
HITS_FONT=$(echo "$NEW_CONTENT" | grep -oE "\bfont-(thin|extralight|light|semibold|extrabold|black)\b" | sort -u || true)
if [ -n "$HITS_FONT" ]; then
  VIOLATIONS="${VIOLATIONS}\n   [typography weight] $(echo "$HITS_FONT" | tr '\n' ' ')"
fi

# 4) Leading numeric(leading-N where N is digit;skip leading-compact/normal/none/tight/snug/relaxed/loose)
HITS_LEADING=$(echo "$NEW_CONTENT" | grep -oE "\bleading-[0-9]+\b" | sort -u || true)
if [ -n "$HITS_LEADING" ]; then
  VIOLATIONS="${VIOLATIONS}\n   [leading numeric] $(echo "$HITS_LEADING" | tr '\n' ' ')"
fi

# 5) Tracking raw(skip tracking-shortcut canonical token)
HITS_TRACKING=$(echo "$NEW_CONTENT" | grep -oE "\btracking-(tighter|tight|wide|wider|widest)\b" | sort -u || true)
if [ -n "$HITS_TRACKING" ]; then
  VIOLATIONS="${VIOLATIONS}\n   [tracking raw] $(echo "$HITS_TRACKING" | tr '\n' ' ')"
fi

# 6) Radius out-of-range
HITS_RADIUS=$(echo "$NEW_CONTENT" | grep -oE "\brounded-(xl|2xl|3xl)\b" | sort -u || true)
if [ -n "$HITS_RADIUS" ]; then
  VIOLATIONS="${VIOLATIONS}\n   [radius out-of-range] $(echo "$HITS_RADIUS" | tr '\n' ' ')"
fi

# 6b) Radius arbitrary bracket(2026-07-04 dim 47 補洞:registry block arbitrary_value 但 hook 從沒偵測)
#     rounded-[6px] / rounded-[var(--radius-md)] / rounded-t-[...] 皆 block;
#     唯一例外 rounded-[inherit](registry radius.allow,passthrough 非 radius 值,anchor scroll-area.tsx Viewport)
HITS_RADIUS_ARB=$(echo "$NEW_CONTENT" | grep -oE "\brounded(-(t|b|l|r|tl|tr|bl|br|s|e|ss|se|es|ee))?-\[[^]]+\]" | grep -v "rounded-\[inherit\]" | sort -u || true)
if [ -n "$HITS_RADIUS_ARB" ]; then
  VIOLATIONS="${VIOLATIONS}\n   [radius arbitrary] $(echo "$HITS_RADIUS_ARB" | tr '\n' ' ')"
fi

# 7) Shadow Tailwind size(shadow-sm/md/lg/xl/2xl/inner — DS 用 shadow-[var(--elevation-N)] N∈{100,200})
HITS_SHADOW=$(echo "$NEW_CONTENT" | grep -oE "\bshadow-(sm|md|lg|xl|2xl|inner)\b" | sort -u || true)
if [ -n "$HITS_SHADOW" ]; then
  VIOLATIONS="${VIOLATIONS}\n   [elevation size] $(echo "$HITS_SHADOW" | tr '\n' ' ')"
fi

# 8) Shadcn compat alias(bg-popover / text-muted-foreground 等)
HITS_SHADCN=$(echo "$NEW_CONTENT" | grep -oE "\b(bg-popover|text-popover-foreground|text-muted-foreground|bg-accent|text-accent-foreground|bg-destructive|bg-background|text-background|border-input)\b" | sort -u || true)
if [ -n "$HITS_SHADCN" ]; then
  VIOLATIONS="${VIOLATIONS}\n   [shadcn alias] $(echo "$HITS_SHADCN" | tr '\n' ' ')"
fi

# 9) Primitive 色名作 utility(bg-neutral-N / text-blue-N 等)
HITS_PRIMITIVE=$(echo "$NEW_CONTENT" | grep -oE "\b(bg|text|border)-(neutral|blue|red|green|yellow|orange|purple|pink|cyan|teal|deep-orange|deep-purple|light-blue|light-green|lime|amber|indigo|brown|gray)-[0-9]+\b" | sort -u || true)
if [ -n "$HITS_PRIMITIVE" ]; then
  VIOLATIONS="${VIOLATIONS}\n   [primitive color as utility] $(echo "$HITS_PRIMITIVE" | tr '\n' ' ')"
fi

# 10) 幻覺 semantic state 尾綴(2026-07-10 批次 A C1:WM hover:bg-neutral-hovered ×3 檔 silent no-op 實證。
#     真尾綴只有 -hover/-active/-selected(+ selected-hover/selected-active);過去式/-pressed 全幻覺,
#     Tailwind 靜默不生成 → hover 無效果、build 不報錯)
HITS_PHANTOM_STATE=$(echo "$NEW_CONTENT" | grep -oE "\b(hover:|active:|focus:)?(bg|text|border|ring)-[a-z][a-z-]*-(hovered|actived|focussed|pressed)\b" | sort -u || true)
if [ -n "$HITS_PHANTOM_STATE" ]; then
  VIOLATIONS="${VIOLATIONS}\n   [phantom state suffix(silent no-op)] $(echo "$HITS_PHANTOM_STATE" | tr '\n' ' ')"
fi

# 11) micro gap(<4px)+ registry fraction width(#71 2026-07-11 接線)——
#     registry micro_gap / fraction 的 rationale 明寫「flag for human review」(非硬禁)→ 走
#     SOFT WARN 非 block(避免誤殺 Calendar/Chart/FileViewer/Carousel 等 4 個既有合法 micro-gap 用途)。
#     fraction 用 registry 明列 14 條(w-1/3.. 不含 w-1/2 = 合法留白),避免廣捕 w-N/M 誤殺。
HITS_MICROGAP=$(echo "$NEW_CONTENT" | grep -oE "\bgap-(px|0\.5|1\.5)\b" | sort -u || true)
HITS_FRACTION=$(echo "$NEW_CONTENT" | grep -oE "\bw-(1/3|2/3|1/4|3/4|1/5|2/5|3/5|4/5|1/6|5/6|1/12|5/12|7/12|11/12)\b" | sort -u || true)
SOFT_NOTES=""
[ -n "$HITS_MICROGAP" ] && SOFT_NOTES="${SOFT_NOTES}\n   [micro gap <4px] $(echo "$HITS_MICROGAP" | tr '\n' ' ')"
[ -n "$HITS_FRACTION" ] && SOFT_NOTES="${SOFT_NOTES}\n   [fraction width] $(echo "$HITS_FRACTION" | tr '\n' ' ')"

if [ -n "$VIOLATIONS" ]; then
  cat >&2 <<'EOF_HEAD'

⚠️  M23 / Dim 47 violation:Tailwind utility 繞 SSOT registry。
EOF_HEAD
  echo -e "$VIOLATIONS" >&2
  cat >&2 <<'EOF_BODY'

   SSOT:packages/design-system/src/tokens/utility-registry.json(block list per category)
   修法 quick map:
     text-xs..9xl  → text-h1..h6 / text-body / text-caption / text-helper / text-label
     font-thin/...black → font-normal / font-medium / font-bold
     leading-{N}   → leading-compact / leading-normal
     tracking-*    → tracking-shortcut(or codify role-specific semantic utility)
     rounded-xl..  → rounded-xs..rounded-lg / rounded-full
     rounded-[..]  → rounded-xs..lg 語意 utility(rounded-[inherit] 唯一例外,registry allow)
     shadow-sm..   → shadow-[var(--elevation-100)] / shadow-[var(--elevation-200)]
     bg-popover .. → direct semantic token(--surface-raised / --fg-muted / --error 等)
     bg-neutral-N  → semantic utility(bg-surface 等)或 bg-[var(--color-neutral-N)]

   詳 utility-registry.json `_meta.spec_sources` + M23「DS 內既有 canonical 優先」。
   Per-line escape:行尾註解 `@token-registry-ok: <rationale>`(audit 可追)。
EOF_BODY
  # P0 BLOCKER(2026-07-07 治理進化方向 2:對齊 user 2026-05-27「SSOT canonical 必 P0」doctrine;
  # 檔級豁免(anatomy/principles stories / token 自家)+ 行級 escape 已備,升級不增誤殺)
  # micro-gap/fraction soft note 附在硬 block 訊息尾(一起讓 AI 看到,但不影響 exit code 判定)
  [ -n "$SOFT_NOTES" ] && { echo "" >&2; echo "   （另有 soft flag,非 block 原因）:" >&2; echo -e "$SOFT_NOTES" >&2; }
  exit 2
fi

# 只有 micro-gap / fraction soft note(無硬 violation)→ WARN 非 block(registry rationale「flag for human review」)
if [ -n "$SOFT_NOTES" ]; then
  echo "" >&2
  echo "⚠️  Dim 47 soft flag(registry micro_gap / fraction「flag for human review」— 非 block,#71 接線):" >&2
  echo -e "$SOFT_NOTES" >&2
  echo "   <4px gap / registry fraction width 常違反 item-anatomy slot 幾何 / layout SSOT → 人工 review。合理則行尾 @token-registry-ok: <rationale>。" >&2
fi

exit 0

#!/bin/bash
# check_orphan_ds_css.sh — P0 BLOCKER
#
# 防 DS CSS file orphan(在 src 但不在 tokens.css aggregator + 沒被任何 tsx import)
# (2026-05-27 user verbatim「之前不就已經整理過一次 token 了?還沒搞好?那到底還要搞幾次?
# 你他媽最好給我保證這是最後一次」永久 codify)
#
# Anchor 錨點:
# - 2026-05-26 sidebar-width token 從 globals.css 搬 uiSize.css(part 1 fix)
# - 但 header-canonical.css / data-table.css 兩個 non-token-home CSS 沒一起 sweep
# - 兩者都在 globals.css 為 DS internal 載入,但 tokens.css consumer aggregator 漏
# - Consumer install DS + import @qijenchen/design-system/styles/tokens 拿不到
#   → sidebar 收合 logo 跑版(--chrome-header-avatar-size missing)+ DataTable cell grid 跑掉
# - User 抓「sidebar 修了一百次都白做,真 root 在 token bundle pipeline」
#
# Stop hook(post-assistant turn)scan packages/design-system/src/**/*.css:
# Orphan condition:file NOT in tokens.css aggregator AND NOT imported by any tsx/ts in DS
# → provider-neutral Stop block decision，由統一 runner 轉成各 provider native transport
#
# Defense layer 補 gen-figma-make-artifacts.mjs auto-scan(generator 自動抓,本 hook 額外驗)。

HOOK_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)" || {
  printf 'GOVERNANCE_INTEGRITY: orphan-CSS hook directory is unavailable\n' >&2
  exit 70
}
source "$HOOK_DIR/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: canonical hook integrity helper is unavailable\n' >&2
  exit 70
}
source "$HOOK_DIR/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

governance_hook_load_input
governance_hook_require_commands find grep basename
EVENT=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // ""') \
  || governance_hook_integrity_fail 'orphan-CSS event could not be decoded'

case "${EVENT:-}" in
  Stop|SubagentStop) ;;
  *) exit 0 ;;
esac

DS_SRC="${GOVERNANCE_PROJECT_DIR:-.}/packages/design-system/src"
AGGREGATOR="$DS_SRC/styles/tokens.css"

if [ ! -d "$DS_SRC" ] || [ ! -f "$AGGREGATOR" ]; then
  governance_hook_integrity_fail \
    "orphan-CSS canonical DS root or aggregator is unavailable:$AGGREGATOR"
fi

CSS_FILES=$(find "$DS_SRC" -name '*.css' -type f -print 2>/dev/null)
FIND_RC=$?
[ "$FIND_RC" -eq 0 ] \
  || governance_hook_integrity_fail "orphan-CSS scan failed(exit=$FIND_RC):$DS_SRC"

ORPHANS=""
while IFS= read -r css; do
  [ -n "$css" ] || continue
  rel="${css#$DS_SRC/}"
  # Skip aggregator itself
  if [ "$rel" = "styles/tokens.css" ]; then continue; fi
  # In aggregator?
  grep -qF "$rel" "$AGGREGATOR" 2>/dev/null
  AGGREGATOR_RC=$?
  case "$AGGREGATOR_RC" in
    0) continue ;;
    1) ;;
    *) governance_hook_integrity_fail "orphan-CSS aggregator could not be scanned:$AGGREGATOR" ;;
  esac
  # Imported by any tsx/ts in DS?
  basename=$(basename "$css")
  IMPORT_MATCHES=$(grep -rln "import.*${basename}\|@import.*${basename}" "$DS_SRC" \
    --include='*.tsx' --include='*.ts' --include='*.css' 2>/dev/null)
  IMPORT_RC=$?
  case "$IMPORT_RC" in
    0)
      if grep -vF "$css" <<<"$IMPORT_MATCHES" | grep . >/dev/null; then
        continue
      fi
      ;;
    1) ;;
    *) governance_hook_integrity_fail "orphan-CSS imports could not be scanned:$DS_SRC" ;;
  esac
  ORPHANS="${ORPHANS}  - $rel\n"
done <<< "$CSS_FILES"

if [ -n "$ORPHANS" ]; then
  REASON=$(printf '🚨 ORPHAN-DS-CSS BLOCKER(2026-05-27 user 永久糾正「之前不就已經整理過一次 token 了?最後一次」)\n\n  DS src 內 CSS 既不在 tokens.css aggregator 也不被任何 tsx/ts import:\n%b\n  Consumer install DS + import @qijenchen/design-system/styles/tokens 拿不到 → 跑版。\n  修法 2 選 1:\n    (a) 加進 tokens.css aggregator(若是 :root token / @theme 宣告):\n        node scripts/gen-figma-make-artifacts.mjs(自動掃 patterns/+components/)\n    (b) 在對應 tsx file 加 `import ./xxx.css`(若是 component-internal scoped style)' "$ORPHANS")
  DECISION=$(jq -nc --arg reason "$REASON" '{governanceDecision:"block",reason:$reason}') \
    || governance_hook_integrity_fail 'orphan-CSS governance decision could not be encoded'
  printf '%s\n' "$DECISION"
  exit 0
fi

exit 0

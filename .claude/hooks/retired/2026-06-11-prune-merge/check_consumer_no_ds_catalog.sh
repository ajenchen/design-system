#!/bin/bash
# check_consumer_no_ds_catalog.sh — P0 BLOCKER
#
# Block consumer apps from authoring per-component DS catalog stories
# (per M31 codex synthesis 2026-05-27: PW only owns composition stories,
# DS canonical Storybook is the sole per-component visual SSOT).
#
# Anchor 2026-05-27 user verbatim:
#   「確保跟 ds repo 一模一樣」+「全盤避免 minimal mock 抹平」
#   7 bugs caught by user(CircularProgress size=32 / RadioGroup raw / DataTable one-col /
#   LinkInput placeholder / Empty 缺 icon / Overlay no-open / Tooltip)— all root cause:
#   consumer hand-mock minimal-prop render ≠ DS canonical → 必 drift.
#
# Triggers on consumer apps/**/*.stories.tsx edit. Blocks:
#   - File named EveryDsComponent / AllDsComponents (catalog naming pattern)
#   - Story title containing「所有 DS 元件」/「Every DS Component」/「per-component default render」
#   - `import * as DS from '@qijenchen/design-system'` + `Object.keys(DS).map`(iterate-render pattern)
#   - `<DS.X minimal-props>` repeated mass render(detect: ≥5 different DS components rendered in same story)
#
# Escape:`// @consumer-catalog-allow: <rationale>` per-file marker(極罕見;eg. portal proxy file).

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
# Only check consumer storybook files
if ! echo "$FILE" | grep -qE '/(apps|consumer)/.*\.stories\.tsx$'; then exit 0; fi
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

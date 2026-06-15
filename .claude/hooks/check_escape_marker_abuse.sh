#!/bin/bash
# check_escape_marker_abuse.sh — P0 BLOCKER (codify warning)
#
# 偵測 consumer code(.tsx/.stories.tsx)濫用 escape markers 跳 SSOT enforcement.
# Per user 2026-05-27 verbatim「不亂加 escape markers — 加就跳 enforcement」.
#
# Escape markers exist for真 exceptions(per-line documented rationale)。但 fork
# user 若大量加 escape markers (eg. ≥3 同一 file) = 違反 escape philosophy → BLOCK.
#
# Detected markers:
#   - @ds-misuse-allow:    (check_consumer_ds_primitive_misuse.sh escape)
#   - @story-baseline-allow:(check_consumer_story_baseline.sh escape)
#   - @consumer-catalog-allow:(check_consumer_no_ds_catalog.sh escape)
#   - @overlay-open-skip:  (check_overlay_open_focus_escape_probe.sh escape)
#   - @template-customized (template canonical sync opt-out)
#   - @layout-space-magic-ok:(check_layout_space_magic_numbers.sh escape)
#   - @story-trait-allow:  (story-baseline / catalog escape)
#   - @story-trait-rationale:(check_story_invariants.sh R3 escape)
#   - @story-split-rationale:(check_story_invariants.sh R2 escape)
#   - @story-name-canonical-allow:(check_story_invariants.sh R4 escape)
#   - @propose-cite-skip:  (check_propose_cite_required.sh escape)
#   - @anatomy-exempt:     (story-rules escape)
#   - @anatomy-exempt-next:(story-rules per-line escape)
#   - @benchmark-unverified: (M22 cite)
#   - @benchmark-citation-allow / @benchmark-unverified-blanket (M22 file-level cite escapes)
#
# Threshold:≥3 distinct markers OR ≥5 total occurrences in same file → BLOCK
# Forces fork user to either (a) fix root cause OR (b) refactor properly OR
# (c) explicitly cite reason in commit message via env override.
#
# 2026-05-31 升級(per 3-hardening-items 調查,折進本 hook 不新增檔):
#   1. Justification gate:escape marker 後空理由(@x-allow: 後純空白 / bare @benchmark-unverified)
#      = 靜默繞過 SSOT → BLOCK(consumer + DS source 都跑)。對齊 ESLint require-description / Google NOLINT。
#   2. Scope 擴 DS source(packages/design-system/src tsx/ts):原整段 skip 讓 DS 內 marker 不受 justification
#      約束;現 DS 跑 justification gate 但跳過 ≥3/≥5 數量 gate(DS 有大量 legit exception 避免誤殺）。
#   3. MARKER_RE 廣化(M7/M34 broad):@<x>-allow 家族用廣義 regex 自動納管,免 enum drift。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
# Scope 分流(2026-05-31 加 DS source — 原整段 skip 讓 DS 內 143 個 marker 不受任何 justification 約束):
#   IS_CONSUMER=apps/consumer tsx/ts → 跑 justification gate + 數量 gate(≥3/≥5)
#   IS_DS=packages/design-system/src tsx/ts → 只跑 justification gate(DS 有大量 legit exception,不套數量上限避免誤殺)
IS_CONSUMER=0; IS_DS=0
if echo "$FILE" | grep -qE '/(apps|consumer)/.*\.(tsx|ts)$'; then IS_CONSUMER=1; fi
if echo "$FILE" | grep -qE 'packages/design-system/src/.*\.(tsx|ts)$'; then IS_DS=1; fi
if [ "$IS_CONSUMER" -eq 0 ] && [ "$IS_DS" -eq 0 ]; then exit 0; fi

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

# Global escape — meta-skip(env override OR explicit comment)
if [ "${CLAUDE_BYPASS_ESCAPE_MARKER_AUDIT:-0}" = "1" ]; then exit 0; fi

# ── Justification gate(2026-05-31,折進本 hook;核心 real gap)──────────────────
# Escape marker 必帶 per-line rationale。空理由 = 靜默繞過 SSOT enforcement。
#   (a) @<x>-allow: 後純空白到行尾(有 marker 有冒號但無理由)
#   (b) bare @benchmark-unverified 後純空白到行尾(非 -blanket / 非 ": 理由" / 非後接說明文字)
# 對齊 ESLint eslint-comments/require-description + Google NOLINT(category) 必帶說明。
EMPTY_RATIONALE=$(echo "$CONTENT" | grep -nE '@[a-z][a-z-]+-allow:[[:space:]]*$|@benchmark-unverified[[:space:]]*$' || true)
if [ -n "$EMPTY_RATIONALE" ]; then
  cat >&2 << EOF
🚨 ESCAPE-MARKER-NO-RATIONALE BLOCKER(P0,2026-05-31 folded into check_escape_marker_abuse)

  File $FILE — escape marker 後無 rationale(空理由 = 靜默繞過 SSOT):
$(echo "$EMPTY_RATIONALE" | sed 's/^/    /')

  修法:marker 冒號後寫具體理由,eg.
    // @ds-misuse-allow: Notion-style inline edit canonical(Field 在 cell 內編輯)
    /* @benchmark-unverified: AG Grid pixel-snapshot 共識,待補 URL cite */

  Escape directive 世界級共識(ESLint require-description / Google NOLINT)必帶 rationale。
EOF
  exit 2
fi

# ── Sanctioned portal 檔 allowlist(2026-06-11 R2 held-item #10)──────────────
# AllDsComponents.stories.tsx 是 documented DS proxy portal(檔頭 @anatomy-exempt +
# @consumer-catalog-allow per 2026-05-27 M31 codex synthesis + @layout-space-magic-ok
# dev-artifact 豁免)— 3 個 marker 各帶 rationale 是它的 sanctioned 常態,數量 gate
# (≥3 distinct)對它必誤擋 = hook-vs-hook 張力。只豁免數量 gate;justification gate
# (空理由 BLOCK)上方已跑完照常生效,真保護不削弱。
IS_SANCTIONED_PORTAL=0
case "$FILE" in
  *apps/*/src/AllDsComponents.stories.tsx) IS_SANCTIONED_PORTAL=1 ;;
esac

# ── 數量 gate(≥3 distinct / ≥5 total）— 僅 consumer(DS source 有大量 legit exception,只走上方 justification gate）──
# 2026-06-11 R2 Phase B(codex b3 抓縫):portal 無限豁免會放走「第 4、5 個新增 marker」——
# 改為提高閾值(portal ≥6 / 一般 ≥3)保留 ceiling,justification gate 不變。
if [ "$IS_SANCTIONED_PORTAL" -eq 1 ]; then DISTINCT_CAP=6; else DISTINCT_CAP=3; fi
if [ "$IS_CONSUMER" -eq 1 ]; then
  # 2026-05-31 廣化 MARKER_RE(M7/M34:spec wording broad「任何 escape marker」→ hook regex 不該 narrow 只 16 種):
  # @<x>-allow 家族用廣義 [a-z][a-z-]*-allow 自動納管(免每次補 enum drift)+ 非 -allow markers 顯式列。
  MARKER_RE='@([a-z][a-z-]*-allow|benchmark-unverified(-blanket)?|template-customized|anatomy-exempt(-next)?|overlay-open-skip|layout-space-magic-ok|propose-cite-skip|story-(trait|split)-rationale)'
  MARKERS_FOUND=$(echo "$CONTENT" | grep -oE "$MARKER_RE" | sort -u)
  # 2026-05-30 fix(test-surfaced):空 MARKERS_FOUND 時 grep -c 印 "0" 已 exit 1,原 `|| echo 0`
  # 會再 append 一個 "0" → "0\n0" → 下方 `[ -ge "$DISTINCT_CAP" ]` integer-expression error。改 `|| true` 不重複。
  DISTINCT_COUNT=$(echo "$MARKERS_FOUND" | grep -c . || true)
  [ -z "$DISTINCT_COUNT" ] && DISTINCT_COUNT=0
  TOTAL_COUNT=$(echo "$CONTENT" | grep -oE "$MARKER_RE" | wc -l | tr -d ' ')

  # Threshold: ≥3 distinct types OR ≥5 total
  if [ "$DISTINCT_COUNT" -ge 3 ] || [ "$TOTAL_COUNT" -ge 5 ]; then
    cat >&2 << EOF
🚨 ESCAPE-MARKER-ABUSE BLOCKER(P0,user 2026-05-27 verbatim「不亂加 escape markers — 加就跳 enforcement」)

  File $FILE:
    Distinct escape markers: $DISTINCT_COUNT(threshold ≥3)
    Total occurrences: $TOTAL_COUNT(threshold ≥5)

  Markers detected:
$(echo "$MARKERS_FOUND" | sed 's/^/    /')

  Escape markers 設計為「rare per-line documented exception」,不該 routine 加。
  Fork user file 大量加 marker = 違反 SSOT 哲學 — 應該:

  修法 3 選 1:
    (a) **重構 code** 走 DS canonical pattern(消除根因,不繞)
    (b) **拆 file**:1 個 escape 對應 1 個 specific case,分散到不同 file
    (c) **Override env**(極罕見,documented in commit msg):
        CLAUDE_BYPASS_ESCAPE_MARKER_AUDIT=1 git commit -m "<rationale>"

  per check_consumer_*.sh hooks SSOT — escape 是 emergency exit,不是 daily tool.
EOF
    exit 2
  fi
fi

exit 0

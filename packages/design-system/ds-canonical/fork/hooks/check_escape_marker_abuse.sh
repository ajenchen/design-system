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
#   - @story-trait-rationale:(check_story_invariants.sh R3 scoped trait exception)
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
#   2. Scope 擴 DS source(node_modules/@qijenchen/design-system/src tsx/ts):原整段 skip 讓 DS 內 marker 不受 justification
#      約束;現 DS 跑 justification gate 但跳過 ≥3/≥5 數量 gate(DS 有大量 legit exception 避免誤殺）。
#   3. MARKER_RE 廣化(M7/M34 broad):@<x>-allow 家族用廣義 regex 自動納管,免 enum drift。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_provider_paths.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: escape-marker project resolver unavailable\n' >&2
  exit 70
}
source "$(dirname "$0")/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: hook integrity helper unavailable\n' >&2
  exit 70
}
source "$(dirname "$0")/lib/_micro_geometry.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: escape-marker micro-geometry classifier unavailable\n' >&2
  exit 70
}

set -uo pipefail

governance_hook_load_input
governance_hook_require_commands grep sed sort tr wc python3
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'escape-marker tool extraction failed'

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'escape-marker path extraction failed'
# Scope 分流(2026-05-31 加 DS source — 原整段 skip 讓 DS 內 143 個 marker 不受任何 justification 約束):
#   IS_CONSUMER=apps/consumer tsx/ts → 跑 justification gate + 數量 gate(≥3/≥5)
#   IS_DS=node_modules/@qijenchen/design-system/src tsx/ts → 只跑 justification gate(DS 有大量 legit exception,不套數量上限避免誤殺)
IS_CONSUMER=0; IS_DS=0
if governance_hook_grep_q 'escape-marker consumer scope matcher failed' "$FILE" -qE '/(apps|consumer)/.*\.(tsx|ts)$'; then IS_CONSUMER=1; fi
if governance_hook_grep_q 'escape-marker DS scope matcher failed' "$FILE" -qE 'node_modules/@qijenchen/design-system/src/.*\.(tsx|ts)$'; then IS_DS=1; fi
if [ "$IS_CONSUMER" -eq 0 ] && [ "$IS_DS" -eq 0 ]; then exit 0; fi

CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'escape-marker content extraction failed'
[ -z "$CONTENT" ] && exit 0

# Global escape — meta-skip(env override OR explicit comment)
if [ "${GOVERNANCE_BYPASS_ESCAPE_MARKER_AUDIT:-0}" = "1" ]; then exit 0; fi

# ── Justification gate(2026-05-31,折進本 hook;核心 real gap)──────────────────
# Escape marker 必帶 per-line rationale。空理由 = 靜默繞過 SSOT enforcement。
#   (a) @<x>-allow: 後純空白到行尾(有 marker 有冒號但無理由)
#   (b) bare @benchmark-unverified 後純空白到行尾(非 -blanket / 非 ": 理由" / 非後接說明文字)
# 對齊 ESLint eslint-comments/require-description + Google NOLINT(category) 必帶說明。
governance_hook_grep_capture EMPTY_RATIONALE 'escape-marker rationale matcher failed' "$CONTENT" -nE \
  '@[a-z][a-z-]+-allow:[[:space:]]*$|@benchmark-unverified[[:space:]]*$'
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

# ── 數量 gate(≥3 distinct / ≥5 total）— 僅 consumer(DS source 有大量 legit exception,只走上方 justification gate）──
# 2026-11-27(上游判定 E18):以前 AllDsComponents.stories.tsx(帶 3 種 marker 的 portal)有專屬放寬(distinct ≥6);
# 範本改名成 DsImportSmoke.stories.tsx 並拿掉全部 marker(0 個)後不再需要,專屬例外刪除 —— 每個檔同一套門檻。
DISTINCT_CAP=3
if [ "$IS_CONSUMER" -eq 1 ]; then
  # 2026-05-31 廣化 marker family 仍在 shared classifier 裡閉包納管。layout-space marker
  # 若附著在 utility-registry 可機械證明的 canonical micro geometry,已沒有繞過
  # enforcement,因此不消耗 escape ceiling;一般 gap-1/2 或其他 marker 仍照常計數。
  MARKERS_UNSORTED=$(governance_countable_escape_markers "$CONTENT") \
    || governance_hook_integrity_fail 'escape-marker structural classification failed'
  MARKERS_FOUND=$(sort -u <<< "$MARKERS_UNSORTED" 2>/dev/null) \
    || governance_hook_integrity_fail 'escape-marker sorter failed'
  # 2026-05-30 fix(test-surfaced):空 MARKERS_FOUND 時 grep -c 印 "0" 已 exit 1,原 `|| echo 0`
  # 會再 append 一個 "0" → "0\n0" → 下方 `[ -ge "$DISTINCT_CAP" ]` integer-expression error。改 `|| true` 不重複。
  governance_hook_grep_capture DISTINCT_COUNT 'escape-marker distinct counter failed' "$MARKERS_FOUND" -c .
  [ -z "$DISTINCT_COUNT" ] && DISTINCT_COUNT=0
  if [ -n "$MARKERS_UNSORTED" ]; then
    governance_hook_grep_capture TOTAL_COUNT 'escape-marker occurrence counter failed' "$MARKERS_UNSORTED" -c .
  else
    TOTAL_COUNT=0
  fi

  # Threshold: ≥3 distinct types OR ≥5 total
  if [ "$DISTINCT_COUNT" -ge "$DISTINCT_CAP" ] || [ "$TOTAL_COUNT" -ge 5 ]; then
    cat >&2 << EOF
🚨 ESCAPE-MARKER-ABUSE BLOCKER(P0,user 2026-05-27 verbatim「不亂加 escape markers — 加就跳 enforcement」)

  File $FILE:
    Distinct escape markers: $DISTINCT_COUNT(threshold ≥$DISTINCT_CAP)
    Total occurrences: $TOTAL_COUNT(threshold ≥5)

  Markers detected:
$(echo "$MARKERS_FOUND" | sed 's/^/    /')

  Escape markers 設計為「rare per-line documented exception」,不該 routine 加。
  Fork user file 大量加 marker = 違反 SSOT 哲學 — 應該:

  修法 3 選 1:
    (a) **重構 code** 走 DS canonical pattern(消除根因,不繞)
    (b) **拆 file**:1 個 escape 對應 1 個 specific case,分散到不同 file
    (c) **Override env**(極罕見,documented in commit msg):
        GOVERNANCE_BYPASS_ESCAPE_MARKER_AUDIT=1 git commit -m "<rationale>"

  per check_consumer_*.sh hooks SSOT — escape 是 emergency exit,不是 daily tool.
EOF
    exit 2
  fi

  # ── Repo 級累計 ratchet(2026-07-08 WM 戰役 R4)──────────────────────────────
  # per-file gate(≥3 distinct/≥5 total)可被「每檔 1-2 個、散多檔」繞過 → repo 級 ceiling。
  # Ratchet 精神(Polaris stylelint migrator):存量 ≥ cap 後只擋「本次 edit 再新增 marker」,
  # 不因存量 brick 無關 edit(本次內容無 marker → 直接放行)。
  if [ -n "$MARKERS_UNSORTED" ]; then
    governance_hook_grep_capture EDIT_ADDS_MARKER 'escape-marker edit counter failed' "$MARKERS_UNSORTED" -c .
  else
    EDIT_ADDS_MARKER=0
  fi
  if [ "${EDIT_ADDS_MARKER:-0}" -gt 0 ]; then
    PROJECT_ROOT=$(governance_project_root 2>/dev/null) \
      || governance_hook_integrity_fail 'escape-marker project root could not be resolved'
    APPS_ROOT="$PROJECT_ROOT/apps"
    REPO_CAP=10
    if [ -L "$APPS_ROOT" ] || [ ! -d "$APPS_ROOT" ] || [ ! -r "$APPS_ROOT" ]; then
      governance_hook_integrity_fail 'escape-marker repository scan root is unavailable or unsafe'
    fi
    # 計數根 = 本次編輯檔所在的 apps/<name>(2026-11-27,上游判定 B1):template 本來就是一個 repo 放多個 app
    #(package.json workspaces = apps/*),全 apps/** 合算會讓合規的 app 被別的 app 拖累而擋。取捨:全 repo 的總上限
    # 因此是「每個 app 各 10」(N 個 app = N×10),同一 app 內「每檔 1-2 個、散多檔」的繞法照舊擋。
    # 編輯檔不在 apps/<name>/ 底下(例:consumer/…)時照舊以整個 apps/ 為根。
    SCAN_ROOT="$APPS_ROOT"
    SCAN_LABEL='apps/**'
    # app 名 = 編輯檔相對專案根的路徑在 apps/ 之後的**第一段**(2026-11-27 規格核對必修 1:以前用貪婪 sed 抓整條
    # 路徑裡最後一個 apps/<x>/,巢狀路徑 apps/alpha/src/apps/zzz/… 取到 zzz、專案根本身在 …/apps/proj/ 底下時取到 proj)。
    # 相對路徑由 governance_project_relative_path 算(realpath,/tmp 與 /private/tmp 同一處;在專案外 = 不屬於任何 app)。
    EDIT_APP=''
    EDIT_REL=$(governance_project_relative_path "$FILE" 2>/dev/null) || EDIT_REL=''
    case "$EDIT_REL" in
      apps/*/*) EDIT_APP=${EDIT_REL#apps/}; EDIT_APP=${EDIT_APP%%/*} ;;
    esac
    case "$EDIT_APP" in
      ''|.*|*[!A-Za-z0-9._-]*) EDIT_APP='' ;;
    esac
    if [ -n "$EDIT_APP" ]; then
      SCAN_ROOT="$APPS_ROOT/$EDIT_APP"
      SCAN_LABEL="apps/$EDIT_APP"
      if [ -L "$SCAN_ROOT" ]; then
        governance_hook_integrity_fail 'escape-marker app scan root is a symlink'
      fi
    fi
    if [ "$SCAN_ROOT" != "$APPS_ROOT" ] && [ ! -e "$SCAN_ROOT" ]; then
      # apps/<x> 還不存在 → 退回整個 apps/ 計數(必修 1 擇一:不 fail closed)。理由:新 app 由 npm run create-app 先建好
      # 資料夾,不存在只剩手動第一筆或路徑異常;以前這裡把存量當 0 = ratchet 整個關掉。退回全 apps 計數讓 ratchet 不關、
      # 最壞是多擋一次並指名 apps/**;fail closed 會把合法的第一筆報成「儀器失效」,訊息不實。
      SCAN_ROOT="$APPS_ROOT"
      SCAN_LABEL="apps/**(apps/$EDIT_APP 還不存在,以整個 apps/ 計)"
    fi
    if [ ! -d "$SCAN_ROOT" ] || [ ! -r "$SCAN_ROOT" ]; then
      governance_hook_integrity_fail 'escape-marker app scan root is unavailable or unsafe'
    fi
    REPO_MARKERS=$(governance_countable_repository_escape_markers "$SCAN_ROOT") \
      || governance_hook_integrity_fail 'escape-marker repository scan failed'
    if [ -n "$REPO_MARKERS" ]; then
      governance_hook_grep_capture REPO_TOTAL 'escape-marker repository counter failed' "$REPO_MARKERS" -c .
    else
      REPO_TOTAL=0
    fi
      # Exhaustive CI replays committed full files, not a prospective edit fragment. In that mode
      # the current snapshot is valid at the ceiling and fails only when it already exceeds it.
      # Native write-time mode keeps the ratchet semantics:once at cap, any marker-bearing edit
      # is blocked so the count cannot grow.
      if [ "${GOVERNANCE_STATIC_REPLAY:-0}" = "1" ]; then
        [ "${REPO_TOTAL:-0}" -le "$REPO_CAP" ] && exit 0
      elif [ "${REPO_TOTAL:-0}" -lt "$REPO_CAP" ]; then
        exit 0
      fi
      if [ "${REPO_TOTAL:-0}" -gt "$REPO_CAP" ] || [ "${GOVERNANCE_STATIC_REPLAY:-0}" != "1" ]; then
        cat >&2 << EOF
🚨 ESCAPE-MARKER-REPO-RATCHET BLOCKER(P0,2026-07-08 WM 戰役 R4)

  $SCAN_LABEL escape marker 存量已 $REPO_TOTAL 個(ceiling 每個 app $REPO_CAP),本次 edit 又要新增 $EDIT_ADDS_MARKER 個。
  每檔 1-2 個散多檔 = 繞 per-file gate 的同型濫用 — repo 級 ratchet 攔。

  修法 2 選 1:
    (a) 先清既有 escape 的根因(重構走 DS canonical),存量 < $REPO_CAP 後再加真必要的
    (b) Override env(極罕見,commit msg 必記 rationale):
        GOVERNANCE_BYPASS_ESCAPE_MARKER_AUDIT=1
EOF
        exit 2
      fi
  fi
fi

exit 0

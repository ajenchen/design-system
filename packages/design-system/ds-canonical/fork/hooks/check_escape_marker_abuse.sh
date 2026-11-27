#!/bin/bash
# check_escape_marker_abuse.sh — P0 BLOCKER (codify warning)
#
# 偵測 consumer code(.tsx/.stories.tsx)濫用 escape markers 跳 SSOT enforcement.
# 舊檔頭寫「Per user 2026-05-27 verbatim「不亂加 escape markers — 加就跳 enforcement」」:2026-11-27 r72 查出處,
# 引入的 commit 0e525f98 訊息、governance/memory、現存對話紀錄都找不到這句 user 原話 → 依 M36 改標「出處未能查證」;
# 下方的額度數字(每檔 ≥3 種 / ≥5 個、每個 app 10 個)是 AI 訂的(0e525f98、2026-07-08 WM 戰役 R4),不是 user 原話。
#
# 2026-11-27 r72(user 同日原話,交接資料夾 notes/decisions/morning-151-answers.md model2:「…當消費者有合理的理由
# 想要修正應該也要給予可以調整的空間吧？…若所有特例都要經過 ds拍板決策同意 那ds的事情不是永遠做不完嗎？」):
#   額度改成「額度內放行;超過額度不再一律擋,改要求每個豁免的理由更具體」——
#   超過額度時,這次內容裡每個計入額度的標記都要寫「冒號 + 至少 10 個字的理由」,而且同一份內容裡不得重複同一句理由
#   (複製貼上的理由 = 沒有針對那一行);做到就放行,做不到照擋並逐行指出哪幾個不夠具體。
#   空理由在任何數量下都照擋(下方 justification gate),預設照擋不變,沒有降成只警告。
#   豁免清單:governance-check 每次都列出各規則被豁免幾次(evidence.exemptions),讓 DS 定期回看補情境。
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
# Threshold:≥3 distinct markers OR ≥5 total occurrences in same file → 超過額度
#   (2026-11-27 r72 起:超過額度 = 每個標記都要具體理由,做到就放行;見檔頭)。
#   修法:(a) 重構走 DS canonical(最好)(b) 每個標記寫這一行自己的具體理由 (c) env override(只在本機寫入當下有效)。
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
# 2026-11-27 r72:家族從只認 `-allow` 擴到 `-allow` / `-ok` / `-skip` 三種(產品端檢查的豁免標記全是這三種字尾,
# 例 @cat-solid-ok / @nondeterministic-ok / @app-story-title-skip),並把「冒號後只剩註解收尾 `*/`、`}`、`-->`」
# 也算空理由(JSX 寫成 {/* @x-ok: */} 以前會漏)。`-rationale` 家族是多行說明的開頭(@anatomy-rationale: 後接下一行),不在此列。
governance_hook_grep_capture EMPTY_RATIONALE 'escape-marker rationale matcher failed' "$CONTENT" -nE \
  '@[a-z][a-z0-9-]*-(allow|ok|skip):[[:space:]]*(\*/|-->|$)|@benchmark-unverified[[:space:]]*$'
if [ -n "$EMPTY_RATIONALE" ]; then
  cat >&2 << EOF
🚨 ESCAPE-MARKER-NO-RATIONALE BLOCKER(P0,2026-05-31 folded into check_escape_marker_abuse)

  File $FILE — 豁免標記冒號後沒有理由(空理由 = 靜默繞過規範,照擋):
$(echo "$EMPTY_RATIONALE" | sed 's/^/    /')

  修法:在同一行的標記冒號後寫這一行為什麼要例外,例:
    // @ds-misuse-allow: Notion-style inline edit canonical(Field 在 cell 內編輯)
    {/* @cat-solid-ok: 品牌指定的活動色塊,白字已量過對比 */}
    /* @benchmark-unverified: AG Grid pixel-snapshot 共識,待補 URL cite */

  有合理理由就可以自己豁免、不必等 DS 同意;理由寫在那一行的註解,DS 會定期看豁免清單補情境。
EOF
  exit 2
fi

# ── 數量 gate(≥3 distinct / ≥5 total）— 僅 consumer(DS source 有大量 legit exception,只走上方 justification gate）──
# 2026-11-27(上游判定 E18):以前 AllDsComponents.stories.tsx(帶 3 種 marker 的 portal)有專屬放寬(distinct ≥6);
# 範本改名成 DsImportSmoke.stories.tsx 並拿掉全部 marker(0 個)後不再需要,專屬例外刪除 —— 每個檔同一套門檻。
DISTINCT_CAP=3
# 超過額度時要求的「具體理由」(2026-11-27 r72,數字為 AI 訂定):冒號後至少這麼多個字(Unicode 字元,不是位元組;
# CI 重播是 LANG=C,所以交給 python 以 UTF-8 解碼後數),而且同一份內容裡不重複同一句理由。
SPECIFIC_MIN=10
UNSPECIFIC=''
UNSPECIFIC_DONE=0
# 印出這次內容裡理由不夠具體的豁免標記(「行號: 原文(原因)」一行一筆);全部夠具體 → 不印任何字。
# 標記家族與 lib/_micro_geometry.sh 的 marker_re(會計入額度的那一組)逐字相同。
collect_unspecific_escape_reasons() {
  [ "$UNSPECIFIC_DONE" = 1 ] && return 0
  UNSPECIFIC=$(printf '%s' "$CONTENT" | python3 -c '
import re, sys
minimum = int(sys.argv[1])
text = sys.stdin.buffer.read().decode("utf-8", "replace")
marker = re.compile(
    r"@(?:[a-z][a-z-]*-allow|benchmark-unverified(?:-blanket)?|template-customized|"
    r"anatomy-exempt(?:-next)?|overlay-open-skip|layout-space-magic-ok|"
    r"propose-cite-skip|story-(?:trait|split)-rationale)(?![a-z0-9-])(:?)"
)
seen = {}
bad = []
for number, line in enumerate(text.splitlines(), 1):
    for match in marker.finditer(line):
        reason = ""
        if match.group(1):
            rest = re.split(r"\*/|-->", line[match.end():], maxsplit=1)[0]
            following = marker.search(rest)
            if following:
                rest = rest[:following.start()]
            reason = re.sub(r"\s+", " ", rest.strip().rstrip("}").strip())
        shown = line.strip()
        if len(reason) < minimum:
            bad.append(f"{number}: {shown}(理由不到 {minimum} 個字)")
        elif reason in seen:
            bad.append(f"{number}: {shown}(與第 {seen[reason]} 行同一句理由)")
        else:
            seen[reason] = number
sys.stdout.buffer.write("\n".join(bad).encode("utf-8"))
' "$SPECIFIC_MIN") || governance_hook_integrity_fail 'escape-marker rationale specificity check failed'
  UNSPECIFIC_DONE=1
}
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

  # Threshold: ≥3 distinct types OR ≥5 total → 超過每檔額度。2026-11-27 r72 起超過額度不再一律擋:
  # 每個標記的理由都夠具體(見 collect_unspecific_escape_reasons)就放行,還有不夠具體的才擋並逐行列出。
  if [ "$DISTINCT_COUNT" -ge "$DISTINCT_CAP" ] || [ "$TOTAL_COUNT" -ge 5 ]; then
    collect_unspecific_escape_reasons
    if [ -n "$UNSPECIFIC" ]; then
      cat >&2 << EOF
🚨 ESCAPE-MARKER-ABUSE BLOCKER(P0;超過每檔豁免額度,而且有豁免的理由不夠具體)

  File $FILE:
    豁免標記種類:$DISTINCT_COUNT(額度:少於 $DISTINCT_CAP 種)
    豁免標記個數:$TOTAL_COUNT(額度:少於 5 個)

  Markers detected:
$(echo "$MARKERS_FOUND" | sed 's/^/    /')

  理由不夠具體的標記:
$(echo "$UNSPECIFIC" | sed 's/^/    /')

  額度內的豁免,冒號後有理由就放行;超過額度時,每一個豁免都要寫「這一行自己的理由」
  (冒號後至少 $SPECIFIC_MIN 個字,同一份內容裡不重複同一句)。做到就放行,不必等 DS 同意。

  修法 3 選 1:
    (a) 重構 code 走 DS canonical pattern(消除根因,最好)
    (b) 把上面列出的每一行理由改寫成針對那一行的具體說明
    (c) Override env(只在本機寫入當下有效,CI 重播不認):GOVERNANCE_BYPASS_ESCAPE_MARKER_AUDIT=1

  DS 會定期看豁免清單(npm run governance:check 的 exemptions 那一行:各規則被豁免幾次)補規格沒想到的情境。
EOF
      exit 2
    fi
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
    # 取法住 lib/_provider_paths.sh governance_app_name_for_path(r4_app_story_title 共用同一支)。
    EDIT_APP=$(governance_app_name_for_path "$FILE")
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
      # the current snapshot is valid at the ceiling and is over quota only when it already exceeds it.
      # Native write-time mode keeps the ratchet semantics:once at cap, any marker-bearing edit is over quota.
      # 2026-11-27 r72:超過額度不再一律擋 —— 這次內容(原生 = 這次寫入的片段;CI = 整份檔)每個標記的理由都夠具體
      # 就放行,還有不夠具體的才擋。每個 app 都在 CI 逐檔重播,所以超過額度的 app 每一個標記都會被要求具體理由。
      if [ "${GOVERNANCE_STATIC_REPLAY:-0}" = "1" ]; then
        [ "${REPO_TOTAL:-0}" -le "$REPO_CAP" ] && exit 0
      elif [ "${REPO_TOTAL:-0}" -lt "$REPO_CAP" ]; then
        exit 0
      fi
      collect_unspecific_escape_reasons
      [ -z "$UNSPECIFIC" ] && exit 0
      cat >&2 << EOF
🚨 ESCAPE-MARKER-REPO-RATCHET BLOCKER(P0,2026-07-08 WM 戰役 R4;2026-11-27 r72 起超過額度改要求具體理由)

  $SCAN_LABEL escape marker 存量已 $REPO_TOTAL 個(額度每個 app $REPO_CAP),本次內容有 $EDIT_ADDS_MARKER 個,其中理由不夠具體的:
$(echo "$UNSPECIFIC" | sed 's/^/    /')

  額度內的豁免,冒號後有理由就放行;超過額度時,每一個豁免都要寫「這一行自己的理由」
  (冒號後至少 $SPECIFIC_MIN 個字,同一份內容裡不重複同一句)。做到就放行,不必等 DS 同意。

  修法 3 選 1:
    (a) 先清既有豁免的根因(重構走 DS canonical),存量回到額度內
    (b) 把上面列出的每一行理由改寫成針對那一行的具體說明
    (c) Override env(只在本機寫入當下有效,CI 重播不認):GOVERNANCE_BYPASS_ESCAPE_MARKER_AUDIT=1

  DS 會定期看豁免清單(npm run governance:check 的 exemptions 那一行:各規則被豁免幾次)補規格沒想到的情境。
EOF
      exit 2
  fi
fi

exit 0

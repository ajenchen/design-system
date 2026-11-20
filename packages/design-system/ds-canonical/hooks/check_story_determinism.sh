#!/bin/bash
# check_story_determinism.sh — stories 寫入時 determinism 哨(2026-07-07 治理進化軌道 7)
# 執法等級:會擋(exit 2)。2026-11-21 knowledge-prune WP-16 依 D4-02 由「寫 stderr、exit 0」升級;逐行豁免 `@nondeterministic-ok: <rationale>`。
#
# Why:story 用真實時間/亂數 → VR baseline 換日假 breach(anchor:2026-07-07 calendar 三 scenario
# 0.07–0.51% 週期性假紅,三修才根治:story 釘日期 → 元件內部時間 → runner 偏移時鐘)。
# runner 層已有偏移時鐘兜底(scripts/visual-audit.mjs),本 hook = 寫入層提前攔,
# 讓 determinism 在出生點就成立(非 VR 撞到才修)。
#
# 偵測(新寫入內容):裸 `new Date()`(無參數)/ `Date.now()` / `Math.random()`。
# escape:行內 `@nondeterministic-ok: <rationale>`(如「即時鐘 demo,VR 不截」)。
# 升為擋之前全樹 *.stories.tsx 未豁免的命中已清到 0(WP-23 補了上傳事件那 4 行的標記),升級不卡既有檔。
#
# 出聲方式(registrations.json outputMode = governance-context-or-block;輸出收法照 check_story_invariants.sh 的 _finalize_hook_output):
#   - 命中 → exit 2,理由只寫 stderr:PreToolUse 擋下這次寫入,模型把理由當工具錯誤讀到。
#   - exit 0 時若有任何輸出 → 包成 {"governanceContext":{hookEventName,message}} 走 stdout,adapter 轉成模型看得到的 additionalContext。
#   - 不再「寫 stderr、exit 0」:官方 hooks 文件 exit code 0 段「Claude never sees stderr from a hook that exits 0」
#     (https://code.claude.com/docs/en/hooks);repo 自己的 hook 證據判法也把 diagnostic 的 stderr 判成 integrity failure
#     (scripts/test-produce-hook-enforced-evidence.mjs 的 `invisible warning` 那格)。
#   - consumer CI(scripts/governance-check.mjs 重播)命中 = GOV-CONTENT-001 BLOCKER(diagnostic 時是 GOV-CONTENT-003)。
#   - 讀不懂輸入(jq / awk 失敗)→ GOVERNANCE_INTEGRITY exit 70,不當成「沒命中」放行。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

_HOOK_CONTEXT_EVENT="PreToolUse"
_HOOK_OUTPUT_CAPTURE=$(mktemp "${TMPDIR:-/tmp}/check-story-determinism.XXXXXX") || {
  printf 'GOVERNANCE_INTEGRITY: story determinism output capture unavailable\n' >&2
  exit 70
}
exec 3>&1 4>&2
exec >"$_HOOK_OUTPUT_CAPTURE" 2>&1

_finalize_hook_output() {
  _hook_rc=$?
  trap - EXIT
  exec 1>&3 2>&4
  _hook_output=$(cat "$_HOOK_OUTPUT_CAPTURE" 2>/dev/null || true)
  rm -f "$_HOOK_OUTPUT_CAPTURE" 2>/dev/null || true

  case "$_hook_rc" in
    0)
      [ -z "$_hook_output" ] && exit 0
      if ! jq -cn \
        --arg event "$_HOOK_CONTEXT_EVENT" \
        --arg message "$_hook_output" \
        '{governanceContext:{hookEventName:$event,message:$message}}'; then
        printf 'GOVERNANCE_INTEGRITY: story determinism context envelope encoding failed\n' >&2
        exit 70
      fi
      exit 0
      ;;
    2)
      if grep -q 'GOVERNANCE_INTEGRITY:' <<< "$_hook_output"; then
        printf '%s\n' "$_hook_output" >&2
        exit 70
      elif [ -n "$_hook_output" ]; then
        printf '%s\n' "$_hook_output" >&2
      else
        printf 'story determinism hook blocked without diagnostic\n' >&2
      fi
      exit 2
      ;;
    70)
      if [ -n "$_hook_output" ]; then
        printf '%s\n' "$_hook_output" >&2
      else
        printf 'GOVERNANCE_INTEGRITY: story determinism failed without diagnostic\n' >&2
      fi
      exit 70
      ;;
    *)
      printf 'GOVERNANCE_INTEGRITY: story determinism undefined exit code %s\n' "$_hook_rc" >&2
      [ -n "$_hook_output" ] && printf '%s\n' "$_hook_output" >&2
      exit 70
      ;;
  esac
}
trap _finalize_hook_output EXIT

_integrity_fail() {
  printf 'GOVERNANCE_INTEGRITY: story determinism %s\n' "$1"
  exit 70
}

INPUT=$(cat) || _integrity_fail 'input read failed'
TOOL=$(jq -r '.tool_name // ""' <<< "$INPUT" 2>/dev/null) || _integrity_fail 'tool extraction failed'
EVENT=$(jq -r '.hook_event_name // ""' <<< "$INPUT" 2>/dev/null) || _integrity_fail 'event extraction failed'
[ "$EVENT" = "PostToolUse" ] && _HOOK_CONTEXT_EVENT="PostToolUse"
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
FILE_PATH=$(jq -r '.tool_input.file_path // ""' <<< "$INPUT" 2>/dev/null) || _integrity_fail 'path extraction failed'
case "$FILE_PATH" in *.stories.tsx) ;; *) exit 0 ;; esac

NEW_CONTENT=$(jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string // ""] | join("\n"))
' <<< "$INPUT" 2>/dev/null) || _integrity_fail 'written-text extraction failed'
grep -q '[^[:space:]]' <<< "$NEW_CONTENT" || exit 0

# 2026-11-17 /knowledge-prune 收窄(D6-3):引號裡的字串(文件表格寫 'new Date()' 當說明,例
# date-grid.anatomy.stories.tsx)不是呼叫,先從該行拿掉再判;同一行另有裸用法照樣擋。
# 「事件處理裡產生的 id」(field.stories.tsx、file-upload.stories.tsx 的 onUpload)**照樣擋**:
# 「只在使用者操作後才出現」是程式結構的性質,單行比對看不出來 —— 拿 `id: \`…${Date.now()}…\`` 的寫法
# 當代理,會連初次渲染資料裡的 id(`[{ id: \`ORD-${Date.now()}\` }]`)一起放行(M37;consumer CI 重播時
# 本 hook 擋 = BLOCKER,放行 = 少一道擋)。那幾行請改用行內 `@nondeterministic-ok: <rationale>`。
HITS=$(printf '%s\n' "$NEW_CONTENT" | awk '
  /@nondeterministic-ok:/ { next }
  {
    probe = $0
    gsub(/["\047](new Date[(][)]|Date[.]now[(][)]|Math[.]random[(][)])["\047]/, "", probe)
    if (probe ~ /new Date[(][)]|Date[.]now[(][)]|Math[.]random[(][)]/) print NR ":" $0
  }') || _integrity_fail 'line scan failed'
[ -z "$HITS" ] && exit 0

cat <<EOF
❌ story 非決定性時間/亂數:這次寫入已擋下(VR baseline 換日假 breach 根因)。
檔案:$FILE_PATH
命中(這次寫入的第幾行:內容):
$HITS
→ 改法:釘固定值(new Date(2026, 6, 15) / 常數 seed)。
→ 真的需要即時值(例:只在使用者操作後才產生、初次渲染與截圖都不會出現)→ 在同一行加 \`@nondeterministic-ok: <理由>\` 再寫一次。
  Anchor:2026-07-07 calendar VR 三修;runner 偏移時鐘為兜底非藉口。roadmap 方向 1(planning/2026-07-07-governance-evolution-roadmap.md)。
EOF
exit 2

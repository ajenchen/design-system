#!/bin/bash
# 執法等級:擋 —— 「每條原則都有 audit dim 涵蓋」由 scripts/audit-preflight.mjs --check 確定性量測;改完治理檔後有缺口 → exit 2(D4-02 審計 2026-11-18 起)。
#
# _governance_coverage_check.sh — PostToolUse helper(由 post_edit_dispatcher.sh 依序呼叫,不算 hook 數):
# 偵測 governance file edit(meta-patterns / spec.md / hook / SKILL / rules / bootstrap)
# → 跑 audit-preflight.mjs --check --json,解析當次唯讀 report(不讀任何有日期的舊報告)
#
# 對應 SSOT:
# - design-system-audit/SKILL.md Phase 0.5 invariant
# - user 原話「確保現在和未來都會自動涵蓋,當有新的準則就務必更新設計系統進階稽核的內容」
#
# 判定(2026-11-18 起):
#   - 當次 report 合法、coverageGaps = 0 → 不出聲。
#   - 當次 report 合法、coverageGaps > 0 → 擋(exit 2):新原則要補 audit dim 進 design-system-audit/SKILL.md,
#     或撤掉原則;heuristic 誤判 → 修 audit-preflight 的判法(不是放行)。量的是整個 corpus(這條性質本來就是全域的),
#     2026-11-20 全樹唯讀(81df56e4)`node scripts/audit-preflight.mjs --check --json` = 91 dims、86 條原則、0 gap,所以缺口一定是之後才出現的。
#   - 逐條豁免:在 references/principle-dim-map.json 把那條原則寫成 `"dims": []`(audit-preflight 認定「已明示不設 dim」,不算缺口);
#     要寫就寫在那條原則自己的項目上(一條一筆),不是在本 helper 放行。
#   - 量具失效(腳本不在 / 是 symlink、結束碼不是 0 或 1、輸出不是合法 report、gap 數與清單長度對不上)
#     → GOVERNANCE_INTEGRITY exit 70。2026-11-18 前這條路徑是「印一段提醒、exit 0」,等於量不到也放行。

source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/_added_lines.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: governance coverage verdict helper unavailable\n' >&2
  exit 70
}

integrity() {
  printf 'GOVERNANCE_INTEGRITY: governance coverage %s\n' "$1" >&2
  exit 70
}

FILE_PATH=$(jq -r '.tool_input.file_path // empty')
[ -z "$FILE_PATH" ] && exit 0

# Governance file scope:M-rule / spec.md frontmatter / hook check / SKILL / canonical rules /
# shared bootstrap or a provider import shell. Generated provider rule views are delivery outputs,
# never an authority-specific trigger dependency.
GOV_RE='(meta-patterns\.md|(^|/)([^/]+\.)?spec\.md$|check_.*\.sh$|/SKILL\.md$|packages/design-system/ds-canonical/rules/.*\.md$|(AGENTS|CLAUDE)\.md$)'
grep -qE "$GOV_RE" <<<"$FILE_PATH" || exit 0

PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
PREFLIGHT="$PROJECT_DIR/scripts/audit-preflight.mjs"
if [ ! -f "$PREFLIGHT" ] || [ -L "$PREFLIGHT" ]; then
  integrity "audit-preflight verifier unavailable:${PREFLIGHT}"
fi

# 跑 preflight check mode(read-only;exit 1 if gap)。stdout 是當次 machine report,
# 不讀 dated file,因此不可能把舊 report 當成新 edit 的證據。
if PREFLIGHT_OUT=$(cd "$PROJECT_DIR" && node scripts/audit-preflight.mjs --check --json 2>/dev/null); then
  PREFLIGHT_EXIT=0
else
  PREFLIGHT_EXIT=$?
fi

if ! printf '%s' "$PREFLIGHT_OUT" | jq -e -s '
  length == 1
  and .[0].schemaVersion == 1
  and .[0].evidenceKind == "audit-preflight"
  and (.[0].ts | type == "string")
  and (.[0].filesCount | type == "object")
  and (.[0].principles | type == "object")
  and (.[0].auditDims | type == "number" and floor == . and . >= 0)
  and (.[0].coverageGaps | type == "number" and floor == . and . >= 0)
  and (.[0].gaps | type == "array" and all(.[]; type == "string"))
  and .[0].coverageGaps == (.[0].gaps | length)
' >/dev/null 2>&1; then
  integrity "audit-preflight produced no valid current-run report(exit ${PREFLIGHT_EXIT})"
fi
GAP_COUNT=$(printf '%s' "$PREFLIGHT_OUT" | jq -r '.coverageGaps') || integrity 'gap count unreadable'

if [ "$PREFLIGHT_EXIT" -eq 0 ] && [ "$GAP_COUNT" -eq 0 ]; then
  exit 0
fi
if [ "$PREFLIGHT_EXIT" -ne 1 ] || [ "$GAP_COUNT" -eq 0 ]; then
  integrity "audit-preflight exit ${PREFLIGHT_EXIT} disagrees with its report(coverageGaps=${GAP_COUNT})"
fi

GAP_SAMPLE=$(jq -r '.gaps[:5] | .[]' <<<"$PREFLIGHT_OUT" 2>/dev/null | paste -sd ',' -)
governance_emit_verdict "⛔ Governance coverage gap(audit-preflight --check):改完 ${FILE_PATH##*/} 之後有 ${GAP_COUNT} 條原則沒有任何 audit dim 涵蓋(前 5 條:${GAP_SAMPLE})。
修法:新加的原則 → 補 audit dim 進 packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md(並更新 references/principle-dim-map.json);
判法誤判 → 修 scripts/audit-preflight.mjs 的判法,不是放行。全清單:node scripts/audit-preflight.mjs --check --json" ""

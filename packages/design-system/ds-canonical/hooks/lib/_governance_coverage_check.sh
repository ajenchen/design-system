#!/bin/bash
# _governance_coverage_check.sh — PostToolUse helper:
# 偵測 governance file edit(meta-patterns / spec.md frontmatter / hook / SKILL / rules)
# → 跑 audit-preflight.mjs --check --json 並解析當次唯讀 report
# → 有 gap → stderr inject 警告:user 必補 audit dim or 撤原則
#
# 對應 SSOT:
# - memory/feedback_audit_preflight_全盤查.md(2026-05-15 codified)
# - design-system-audit/SKILL.md Phase 0.5 invariant
# - user 原話「確保現在和未來都會自動涵蓋,當有新的準則就務必更新設計系統進階稽核的內容」
#
# 由 post_edit_dispatcher.sh orchestrate,non-standalone hook(不算 hook count)

source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire

FILE_PATH=$(jq -r '.tool_input.file_path // empty')
[ -z "$FILE_PATH" ] && exit 0

# Governance file scope:M-rule / spec.md frontmatter / hook check / SKILL / canonical rules /
# shared bootstrap or a provider import shell. Generated provider rule views are delivery outputs,
# never an authority-specific trigger dependency.
GOV_RE='(meta-patterns\.md|(^|/)([^/]+\.)?spec\.md$|check_.*\.sh$|/SKILL\.md$|packages/design-system/ds-canonical/rules/.*\.md$|(AGENTS|CLAUDE)\.md$)'
grep -qE "$GOV_RE" <<<"$FILE_PATH" || exit 0

# Pre-check audit-preflight 存在
PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
PREFLIGHT="$PROJECT_DIR/scripts/audit-preflight.mjs"
if [ ! -f "$PREFLIGHT" ] || [ -L "$PREFLIGHT" ]; then
  jq -n --arg ctx "⚠️ Governance coverage check 無法產生當次 machine report；audit-preflight 已 fail closed，請先修復後再宣稱 coverage 完整。" '{
    governanceContext: { hookEventName: "PostToolUse", message: $ctx }
  }'
  exit 0
fi

# 跑 preflight check mode(read-only;exit 1 if gap)。stdout 是當次 machine report，
# 不讀 dated file，因此不可能把舊 report 當成新 edit 的證據。
if PREFLIGHT_OUT=$(cd "$PROJECT_DIR" && node scripts/audit-preflight.mjs --check --json 2>/dev/null); then
  PREFLIGHT_EXIT=0
else
  PREFLIGHT_EXIT=$?
fi

PREFLIGHT_REPORT_VALID=0
if printf '%s' "$PREFLIGHT_OUT" | jq -e -s '
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
  PREFLIGHT_REPORT_VALID=1
fi

if [ "$PREFLIGHT_EXIT" -eq 1 ] && [ "$PREFLIGHT_REPORT_VALID" -eq 1 ] \
  && [ "$(printf '%s' "$PREFLIGHT_OUT" | jq -r '.coverageGaps')" -gt 0 ]; then
  GAP_COUNT=$(printf '%s' "$PREFLIGHT_OUT" | jq -r '.coverageGaps // 0' 2>/dev/null || echo unknown)
  GAP_SAMPLE=$(jq -r '.gaps[:3] | .[]' <<<"$PREFLIGHT_OUT" 2>/dev/null | tr '\n' ',' | sed 's/,$//')

  ADDITIONAL_CONTEXT="⚠️ Governance coverage gap(audit-preflight): ${FILE_PATH##*/} edit 後 ${GAP_COUNT} 原則無 audit dim cover(包含: ${GAP_SAMPLE})。若新加入的原則 → 必補 audit dim 進 design-system-audit/SKILL.md。若既有 false-positive(heuristic 不準)→ sub-agent semantic verify。SSOT: memory/feedback_audit_preflight_全盤查.md"

  jq -n --arg ctx "$ADDITIONAL_CONTEXT" '{
    governanceContext: { hookEventName: "PostToolUse", message: $ctx }
  }'
elif [ "$PREFLIGHT_EXIT" -ne 0 ] || [ "$PREFLIGHT_REPORT_VALID" -ne 1 ] \
  || [ "$(printf '%s' "$PREFLIGHT_OUT" | jq -r '.coverageGaps // -1' 2>/dev/null || echo -1)" -ne 0 ]; then
  jq -n --arg ctx "⚠️ Governance coverage check 無法產生當次 machine report；audit-preflight 已 fail closed，請先修復後再宣稱 coverage 完整。" '{
    governanceContext: { hookEventName: "PostToolUse", message: $ctx }
  }'
fi

exit 0

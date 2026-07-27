#!/bin/bash
# check_substantive_edit_approval_preflight.sh — Pre-action gate for substantive design edits.
#
# Purpose: PRE-flight 偵測 packages/design-system/src/**.{tsx,ts,css} edit；工程 remediation
# 依 Standing Authorization 執行，產品／UI／UX 真取捨則須有 current-scope exact
# target + exact operation-digest 決策證據，否則 P0 BLOCKER(stderr + exit 2)。
#
# 對比 stop_self_audit.sh post-action BLOCKER:本 hook 是 PRE-action gate,
# 在 edit 落地前就攔(propose-only OR exact target-bound decision evidence),
# 避免「edit → stop hook BLOCKER → revert」waste cycle(user 抓 2026-05-12 anti-pattern)。
#
# 對齊 Option 3 hybrid(M32 split 後 (f) ship gate 的 PRE-flight 補位):
# - PreToolUse P0 BLOCKER = pre-action enforcement(本 hook)
# - Stop hook BLOCKER = post-action backstop(stop_self_audit.sh Mechanism 4)
# - AI inline self-statement = discipline(M31 Layer A/C marker + 本 hook context)
#
# 對齊:AGENTS.md `# 稽核 canonical` Audit-vs-execute 分權 + M31 Layer A/C + M32(f) ship gate。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: hook integrity helper unavailable\n' >&2
  exit 70
}

set -uo pipefail
governance_hook_load_input
governance_hook_require_commands node
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'substantive approval tool extraction failed'
TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'substantive approval transcript extraction failed'
EVENT=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'substantive approval event extraction failed'

# Only PreToolUse for Edit|Write|MultiEdit
[ "$EVENT" != "PreToolUse" ] && exit 0
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac

# MultiEdit/batch payload 的任一 production path 都必須受關；不可用第一個 benign path 遮蔽後續修改。
PATHS=$(printf '%s' "$INPUT" | jq -r '
  [.tool_input.file_path?, .tool_input.path?, .file_path?, .path?,
   (.changed_paths[]?), (.tool_input.changed_paths[]?),
   (.tool_input.edits[]? | .file_path? // .path?)]
  | map(select(type == "string" and length > 0)) | unique[]' 2>/dev/null) \
  || governance_hook_integrity_fail 'substantive approval path extraction failed'

# Substantive scope(2026-05-26 extended per user verbatim「未來其他人 fork 也會偏移 / 該程式化的都沒程式化」):
# - DS internal: packages/design-system/src/**.{tsx,ts,css}
# - Consumer fork-user app code: apps/**.{tsx,ts,css} (product-workspace 或任何 fork 的 monorepo apps/)
# - DS source in node_modules(consumer 改 DS 直接 forbidden — 必走 fork 流程):node_modules/@qijenchen/design-system/**
GOVERNED_PATHS=""
while IFS= read -r candidate; do
  [ -z "$candidate" ] && continue
  case "$candidate" in
    packages/design-system/src/*.tsx|packages/design-system/src/*.ts|packages/design-system/src/*.css|*/packages/design-system/src/*.tsx|*/packages/design-system/src/*.ts|*/packages/design-system/src/*.css|apps/*.tsx|apps/*.ts|apps/*.css|*/apps/*.tsx|*/apps/*.ts|*/apps/*.css|node_modules/@qijenchen/design-system/*|*/node_modules/@qijenchen/design-system/*)
      case "$candidate" in
        *.stories.tsx|*.test.*|*.spec.ts|*/scripts/*) ;;
        *) GOVERNED_PATHS="${GOVERNED_PATHS}${GOVERNED_PATHS:+
}${candidate}" ;;
      esac
      ;;
  esac
done <<EOF
$PATHS
EOF
[ -z "$GOVERNED_PATHS" ] && exit 0

FILE_PATH=$(printf '%s\n' "$GOVERNED_PATHS" | sed -n '1p')
REL_PATH=${FILE_PATH#*/my-project/}

APPROVAL_HELPER="$(dirname "$0")/lib/approval-evidence.mjs"
if [ -L "$APPROVAL_HELPER" ] || [ ! -f "$APPROVAL_HELPER" ] || [ ! -r "$APPROVAL_HELPER" ]; then
  governance_hook_integrity_fail 'approval evidence helper is unavailable or unsafe'
fi

# A provider may legitimately omit transcript evidence. A native pre-tool hook cannot safely infer
# product-vs-engineering intent from source bytes alone, so governed production edits remain blocked
# and must use the provider-neutral runner/hard-gate path. This is missing authority evidence, not a
# request for a human engineering decision. An explicitly supplied transcript that cannot be read is
# an infrastructure fault and must use the reserved integrity result.
if [ -n "$TRANSCRIPT_PATH" ]; then
  if [ -L "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ] || [ ! -r "$TRANSCRIPT_PATH" ]; then
    governance_hook_integrity_fail 'supplied approval transcript is unavailable or unsafe'
  fi
  if ! jq -s -e 'all(.[]; type == "object")' "$TRANSCRIPT_PATH" >/dev/null 2>&1; then
    governance_hook_integrity_fail 'supplied approval transcript is malformed'
  fi
fi

APPROVAL_DECISION="blocked"
APPROVAL_REASON="NO_TRANSCRIPT_EVIDENCE"
APPROVAL_DOMAIN="unknown"
BLOCKED_PATH="$FILE_PATH"
APPROVAL_DECISION="approved"
while IFS= read -r candidate; do
  [ -z "$candidate" ] && continue
  if [ -n "$TRANSCRIPT_PATH" ]; then
    APPROVAL_EVIDENCE=$(printf '%s' "$INPUT" | \
      node "$APPROVAL_HELPER" \
        --transcript "$TRANSCRIPT_PATH" \
        --target "$candidate" \
        --hook-input-stdin 2>/dev/null)
  else
    APPROVAL_EVIDENCE=$(printf '%s' "$INPUT" | \
      node "$APPROVAL_HELPER" \
        --operation-only \
        --target "$candidate" \
        --hook-input-stdin 2>/dev/null)
  fi
    APPROVAL_RC=$?
    case "$APPROVAL_RC" in 0|2) ;; *)
      governance_hook_integrity_fail "approval evidence helper failed with rc=${APPROVAL_RC}"
    esac
    if ! printf '%s' "$APPROVAL_EVIDENCE" | jq -e '
      type == "object"
      and .schemaVersion == 1
      and .kind == "latest-user-design-authorization"
      and (.decision == "approved" or .decision == "blocked")
      and (.decisionDomain == "engineering-remediation"
        or .decisionDomain == "product-ui-ux"
        or .decisionDomain == "unknown")
      and (.target | type == "string" and length > 0)
      and (.targetBinding == null or (.targetBinding | type == "string" and length > 0))
      and (.reasonCode | type == "string" and test("^[A-Z][A-Z0-9_]*$"))
      and (.latestUserMessageSha256 | type == "string" and test("^[0-9a-f]{64}$"))
      and (.decisionMessageSha256 == null
        or (.decisionMessageSha256 | type == "string" and test("^[0-9a-f]{64}$")))
      and (.operationEvidenceSha256 | type == "string" and test("^[0-9a-f]{64}$"))
    ' >/dev/null 2>&1; then
      governance_hook_integrity_fail 'approval evidence helper emitted an invalid contract'
    fi
    APPROVAL_REASON=$(printf '%s' "$APPROVAL_EVIDENCE" | jq -r '.reasonCode') \
      || governance_hook_integrity_fail 'approval evidence reason extraction failed'
    APPROVAL_DECISION=$(printf '%s' "$APPROVAL_EVIDENCE" | jq -r '.decision') \
      || governance_hook_integrity_fail 'approval evidence decision extraction failed'
    APPROVAL_DOMAIN=$(printf '%s' "$APPROVAL_EVIDENCE" | jq -r '.decisionDomain') \
      || governance_hook_integrity_fail 'approval evidence domain extraction failed'
    if [ "$APPROVAL_REASON" = "TRANSCRIPT_UNAVAILABLE_OR_INVALID" ]; then
      governance_hook_integrity_fail 'approval transcript could not be parsed by the evidence helper'
    fi
    if { [ "$APPROVAL_RC" -eq 0 ] && [ "$APPROVAL_DECISION" != "approved" ]; } \
      || { [ "$APPROVAL_RC" -eq 2 ] && [ "$APPROVAL_DECISION" != "blocked" ]; }; then
      governance_hook_integrity_fail 'approval evidence decision did not match helper exit status'
    fi
    if [ "$APPROVAL_DECISION" = "blocked" ]; then
      BLOCKED_PATH="$candidate"
      break
    fi
done <<EOF
$GOVERNED_PATHS
EOF

if [ "$APPROVAL_DECISION" = "approved" ]; then
  exit 0
fi

FILE_PATH="$BLOCKED_PATH"
REL_PATH=${FILE_PATH#*/my-project/}

# 2026-05-15 upgrade per user verbatim:「上述的問題請你務必確實確保永遠他媽不要再給我犯了」
# (memory/feedback_ship_then_revert_anti_pattern.md SSOT)
# Soft warn → P0 BLOCKER on packages/design-system/src/**/*.tsx production substantive without approval。
# BLOCKER:stderr + exit 2 = halt PreToolUse(Edit/Write/MultiEdit)
echo "🚨 BLOCKER: Pre-action gate(check_substantive_edit_approval_preflight,2026-05-15 P0 升級)" >&2
echo "  - 目標: ${REL_PATH}" >&2
echo "  - 範圍: packages/design-system/src production code(substantive SSOT change)" >&2
echo "  - canonical decision evidence: domain=${APPROVAL_DOMAIN}, reason=${APPROVAL_REASON}" >&2
echo "" >&2
if [ "$APPROVAL_DOMAIN" = "engineering-remediation" ]; then
  echo "→ 工程決策已 Standing Authorization；本次只缺 exact target+operation digest 的 trusted" >&2
  echo "  runner/hard-gate evidence。這不是 user engineering decision，也不得向 user 索取核准。" >&2
  echo "  請走同一 canonical governed runner，完成 evidence/readback 後再套用 exact operation。" >&2
  exit 2
fi
echo "→ SSOT-affecting UI/UX edit without verbatim approval = ship-then-revert anti-pattern" >&2
echo "  (memory/feedback_ship_then_revert_anti_pattern.md SSOT)" >&2
echo "" >&2
echo "修法:" >&2
echo "  - 產品／UI／UX 真取捨:先取得 exact target + exact choice，再由可驗證 transcript 重送。" >&2
echo "  - 工程 remediation:補可驗證 operation/transcript evidence；provider 無 transcript 能力時走" >&2
echo "    同一 canonical runner + protected hard gate，不向 user 索取工程核准。" >&2
echo "" >&2
echo "「user echo hypothesis」≠「user approve」— M4 sub-check enforces。" >&2
exit 2

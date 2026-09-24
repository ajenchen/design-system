#!/bin/bash
# check_substantive_edit_approval_preflight.sh — Pre-action gate for substantive design edits.
#
# Purpose: PRE-flight 偵測 packages/design-system/src/**.{tsx,ts,css} edit；工程 remediation
# 依 Standing Authorization 執行，產品／UI／UX 真取捨則須有 user 對 exact target + choice 的
# 明確核准（operation digest 為可選佐證，不得強制；835b519e 先例），否則 P0 BLOCKER(stderr + exit 2)。
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

# Only PreToolUse
[ "$EVENT" != "PreToolUse" ] && exit 0

# 2026-09-24:本閘原本只認 Edit|Write|MultiEdit,於是用 shell 寫同一個檔案(sed -i / heredoc / tee /
# python open(...,'w'))是**零檢查** —— 閘要保證的性質是「沒有未授權的 DS 原始碼改動」,它實際量的卻是
# 「沒有未授權的編輯工具呼叫」,換個工具兩者就分開(M37 identity substitution)。本 session 的 harness
# 另外指示「檔案改動優先用 shell 而非編輯工具」,兩者相乘等於每次改動都預設從洞裡走過去,而且完全沒有訊號。
# 實證:同一天 subagent 就是走 shell 把 file-item.tsx 的焦點幾何落地的,沒有經過任何授權檢查。
# 修法:Bash 事件也進來,從命令字串抓「同時出現受管路徑與寫入動詞」的情形,fail closed。
# 誤判成本 = 跟走 Edit 一樣要授權(可用同一條 escape),遠低於靜默繞過。
case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  Bash)
    BASH_CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null) \
      || governance_hook_integrity_fail 'substantive approval bash command extraction failed'
    # 快速退出:命令裡完全沒提到受管根目錄就不是本閘的事(絕大多數 Bash 呼叫走這條)
    case "$BASH_CMD" in
      *packages/design-system/src/*|*node_modules/@qijenchen/design-system/*|*apps/*) ;;
      *) exit 0 ;;
    esac
    # 寫入動詞:涵蓋原地編輯、重導、複製移動、以及腳本語言的寫檔呼叫
    case "$BASH_CMD" in
      *"sed -i"*|*"perl -i"*|*" > "*|*" >> "*|*">"*|*"tee "*|*"cp "*|*"mv "*|*"truncate"*|*"dd "*\
      |*"writeFileSync"*|*"open("*"'w'"*|*'open('*'"w"'*|*"outputFileSync"*|*"fs.write"*|*"patch "*|*"git apply"*) ;;
      *) exit 0 ;;
    esac
    ;;
  *) exit 0 ;;
esac

# MultiEdit/batch payload 的任一 production path 都必須受關；不可用第一個 benign path 遮蔽後續修改。
PATHS=$(printf '%s' "$INPUT" | jq -r '
  [.tool_input.file_path?, .tool_input.path?, .file_path?, .path?,
   (.changed_paths[]?), (.tool_input.changed_paths[]?),
   (.tool_input.edits[]? | .file_path? // .path?)]
  | map(select(type == "string" and length > 0)) | unique[]' 2>/dev/null) \
  || governance_hook_integrity_fail 'substantive approval path extraction failed'

# Bash 事件沒有 file_path 欄位(2026-09-24):路徑改從命令字串抽,否則 PATHS 為空 → 後面判成「無受管路徑」
# 而放行,等於補了 case 卻仍然是洞(M32:寫完閘先問「弄壞它會紅嗎」——這一步沒做就會假綠)。
if [ "$TOOL" = "Bash" ]; then
  BASH_PATHS=$(printf '%s' "$BASH_CMD" \
    | tr " \t'\"\`(),;|&<>" '\n' \
    | grep -E '(^|/)(packages/design-system/src|node_modules/@qijenchen/design-system|apps)/[^[:space:]]*\.(tsx|ts|css)$' \
    | sort -u) || BASH_PATHS=""
  PATHS=$(printf '%s\n%s' "$PATHS" "$BASH_PATHS" | grep -v '^$' | sort -u)
fi

# Substantive scope(2026-05-26 extended per user verbatim「未來其他人 fork 也會偏移 / 該程式化的都沒程式化」):
# - DS internal: packages/design-system/src/**.{tsx,ts,css}
# - Consumer fork-user app code: apps/**.{tsx,ts,css} (product-workspace 或任何 fork 的 monorepo apps/)
# - DS source in node_modules(consumer 改 DS 直接 forbidden — 必走 fork 流程):node_modules/@qijenchen/design-system/**
GOVERNED_PATHS=""
while IFS= read -r candidate; do
  [ -z "$candidate" ] && continue
  case "$candidate" in
    packages/design-system/src/*.tsx|packages/design-system/src/*.ts|packages/design-system/src/*.css|*/packages/design-system/src/*.tsx|*/packages/design-system/src/*.ts|*/packages/design-system/src/*.css|apps/*.tsx|apps/*.ts|apps/*.css|*/apps/*.tsx|*/apps/*.ts|*/apps/*.css|node_modules/@qijenchen/design-system/*|*/node_modules/@qijenchen/design-system/*)
      # stories-helpers/ 是 story 專用的示範零件(只被 *.stories.tsx import、不進 barrel、不進產品 API),
      # 與 stories 同一類;2026-09-16 user 對示範工具列說「新增任務按鈕和搜尋框至少要間隔 loose space token」,
      # 落地在 stories-helpers/scene/data-toolbar.tsx 卻被當成產品 SSOT 改動擋下 —— 分類錯位,不是授權缺口。
      case "$candidate" in
        *.stories.tsx|*.test.*|*.spec.ts|*/scripts/*|*/stories-helpers/*) ;;
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

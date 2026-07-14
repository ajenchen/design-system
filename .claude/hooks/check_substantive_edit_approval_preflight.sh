#!/bin/bash
# check_substantive_edit_approval_preflight.sh — Pre-action gate for substantive design edits.
#
# Purpose: PRE-flight 偵測 packages/design-system/src/**.{tsx,ts,css} edit + last 5 user msgs 無
# approval keyword → P0 BLOCKER(stderr + exit 2;2026-05-15 由 soft warn 升級,
# per memory/feedback_ship_then_revert_anti_pattern.md SSOT)。
#
# 對比 stop_self_audit.sh post-action BLOCKER:本 hook 是 PRE-action gate,
# 在 edit 落地前就攔(propose-only OR cite approval verbatim + bypass env),
# 避免「edit → stop hook BLOCKER → revert」waste cycle(user 抓 2026-05-12 anti-pattern)。
#
# 對齊 Option 3 hybrid(M32 split 後 (f) ship gate 的 PRE-flight 補位):
# - PreToolUse P0 BLOCKER = pre-action enforcement(本 hook)
# - Stop hook BLOCKER = post-action backstop(stop_self_audit.sh Mechanism 4)
# - AI inline self-statement = discipline(M31 Layer A/C marker + 本 hook context)
#
# False-positive escape:CLAUDE_BYPASS_DESIGN_APPROVAL=1(audit-logged → logs/approval-bypass.jsonl),
# 需 cite user approval verbatim quote 在 commit message + reply。
#
# 對齊:CLAUDE.md `# 稽核 canonical` Audit-vs-execute 分權 + M31 Layer A/C + M32(f) ship gate。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)

# Only PreToolUse for Edit|Write|MultiEdit
[ "$EVENT" != "PreToolUse" ] && exit 0
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac

# Substantive scope(2026-05-26 extended per user verbatim「未來其他人 fork 也會偏移 / 該程式化的都沒程式化」):
# - DS internal: packages/design-system/src/**.{tsx,ts,css}
# - Consumer fork-user app code: apps/**.{tsx,ts,css} (product-workspace 或任何 fork 的 monorepo apps/)
# - DS source in node_modules(consumer 改 DS 直接 forbidden — 必走 fork 流程):node_modules/@qijenchen/design-system/**
case "$FILE_PATH" in
  */packages/design-system/src/*.tsx|*/packages/design-system/src/*.ts|*/packages/design-system/src/*.css) ;;
  */apps/*.tsx|*/apps/*.ts|*/apps/*.css) ;;
  */node_modules/@qijenchen/design-system/*) ;;
  *) exit 0 ;;
esac

# Allowlist:storybook config / scripts / tests 等非 production code
# (dim 59 2026-07-04:*.test.ts → *.test.* 補 .test.tsx;第一道 case 已限 tsx/ts/css,不會誤放 .md)
case "$FILE_PATH" in
  *.stories.tsx|*.test.*|*.spec.ts|*/scripts/*) exit 0 ;;
esac

[ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ] && exit 0

# Scan last 5 真 user msgs(transcript role=user 且 content 非 tool_result)
RECENT_USER_MSGS=$(tail -200 "$TRANSCRIPT_PATH" 2>/dev/null | \
  jq -r 'select(.message.role=="user") |
    .message.content // empty |
    if type=="string" then .
    else (.[]? | select(.type != "tool_result") | .text // empty)
    end' 2>/dev/null | tail -5)

# Approval keywords(對齊 stop_self_audit.sh:172)+ 2026-05-15 升 numbered directive
# (`#1 A` / `#1 ship` 等)+ 「照建議」/「照共識」/「照我的」等 reference style approval
# 2026-05-21 M34 fix(per user verbatim「都給我做到好」approval blocked by 妳/決策N coverage gap):
#   (a) 加「妳」變體(`照妳`= `照你` 文書通用 variant)
#   (b) 加「決策[一二三四五六七八九十1-9]」numbered directive(eg.「決策一改…」「決策3做」)
#   (c) 加「做到好」/「都做」/「全做」auto-approve 變體
# 2026-07-04 M7 detection-breadth fix(user verbatim「同意補詞」拍板):「核可修 production 佇列」曾被判
# 0 approval — 20+ 口語變體卻漏最標準的「核可 / 批准」,補上。
APPROVAL_RE='(同意|採用|採納|拍板|拍\s*[A-Z0-9]|核可|批准|可以|改成|改為|執行|上吧|push|implement|go ahead|approved|OK|好|沒問題|做一做|就做|做吧|做完|全部做完|做到完|做到好|都做|全做|馬不停蹄|建議做|ship|合 main|^#[0-9]+|照你|照妳|照建議|照共識|照我的|按照|決策[一二三四五六七八九十1-9]|[A-Z][0-9]+\s*(做|改|修)|先\s*[A-Z][0-9]+)'
HAS_APPROVAL=$(echo "$RECENT_USER_MSGS" | grep -cE "$APPROVAL_RE" 2>/dev/null)
HAS_APPROVAL=${HAS_APPROVAL:-0}

# Substantive-discuss keywords(若 user 在 discuss mode → 提示 propose-only)
DISCUSS_RE='(propose|提案|建議|討論|比稿|看法|思考|評估|要不要|該不該|是否|怎麼想)'
HAS_DISCUSS=$(echo "$RECENT_USER_MSGS" | grep -cE "$DISCUSS_RE" 2>/dev/null)
HAS_DISCUSS=${HAS_DISCUSS:-0}

# Approval present → silent pass
if [ "$HAS_APPROVAL" -gt 0 ]; then
  exit 0
fi

# 2026-05-15 upgrade per user verbatim:「上述的問題請你務必確實確保永遠他媽不要再給我犯了」
# (memory/feedback_ship_then_revert_anti_pattern.md SSOT)
# Soft warn → P0 BLOCKER on packages/design-system/src/**/*.tsx production substantive without approval。
# Override env var:CLAUDE_BYPASS_DESIGN_APPROVAL=1(audit-logged below)
REL_PATH=${FILE_PATH#*/my-project/}

if [ "${CLAUDE_BYPASS_DESIGN_APPROVAL:-0}" = "1" ]; then
  # Audit log override
  mkdir -p "$(dirname "$0")/../logs" 2>/dev/null
  printf '{"ts":"%s","event":"design-approval-bypass","file":"%s","tool":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$REL_PATH" "$TOOL" \
    >> "$(dirname "$0")/../logs/approval-bypass.jsonl" 2>/dev/null || true
  exit 0
fi

# BLOCKER:stderr + exit 2 = halt PreToolUse(Edit/Write/MultiEdit)
echo "🚨 BLOCKER: Pre-action gate(check_substantive_edit_approval_preflight,2026-05-15 P0 升級)" >&2
echo "  - 目標: ${REL_PATH}" >&2
echo "  - 範圍: packages/design-system/src production code(substantive SSOT change)" >&2
echo "  - 近 5 條 user msg approval keyword: ${HAS_APPROVAL} 次 / discuss keyword: ${HAS_DISCUSS} 次" >&2
echo "" >&2
echo "→ SSOT-affecting UI/UX edit without verbatim approval = ship-then-revert anti-pattern" >&2
echo "  (memory/feedback_ship_then_revert_anti_pattern.md SSOT)" >&2
echo "" >&2
echo "修法 — 2 選 1:" >&2
echo "  (a) Convert to propose-only:列 option + 4-Q 自檢 + 等 user 拍板,撤回 edit" >&2
echo "  (b) Cite user approval verbatim quote 在 commit message + reply,然後設" >&2
echo "      \`CLAUDE_BYPASS_DESIGN_APPROVAL=1\` env var 跑 edit(audit-logged)" >&2
echo "" >&2
echo "「user echo hypothesis」≠「user approve」— M4 sub-check enforces。" >&2
exit 2

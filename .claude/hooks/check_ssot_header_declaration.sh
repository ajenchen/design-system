#!/bin/bash
# check_ssot_header_declaration.sh — 新建 production tsx 必帶「── 消費的 SSOT ──」宣告段
# (2026-07-07 治理進化方向 3 洞 a:原 check_ssot_consultation.sh 2026-05-XX retired 後,
#  CLAUDE.md「# SSOT 消費 canonical」+ ssot-consultation.md:30-51 強制的檔頭宣告段
#  **無任何機械驗證** — 內部盤點實證。本 hook = 精簡復活版,只驗「新檔有無宣告段」,
#  不驗宣告品質(品質靠 audit dim 5 + dim 54 + M18/M29)。)
#
# Scope(ratchet,對齊 Polaris stylelint-adoption 策略):
#   - 只攔 **Write 新檔**(components/ patterns/ 的 .tsx,磁碟上不存在)— 存量檔 Edit 豁免
#   - stories / test / index.ts 豁免
#   - escape:內容含 `@ssot-header-exempt: <rationale>`(audit 可追)
# P0 BLOCKER(user 2026-05-27「SSOT canonical 必 P0」doctrine)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
[ "$TOOL" = "Write" ] || exit 0

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
case "$FILE_PATH" in
  */packages/design-system/src/components/*.tsx|*/packages/design-system/src/patterns/*.tsx) ;;
  *) exit 0 ;;
esac
case "$FILE_PATH" in
  *.stories.tsx|*.test.tsx|*/index.ts|*/index.tsx) exit 0 ;;
esac

# Ratchet:磁碟已存在 = 存量覆寫,豁免(存量清理另走 audit)
[ -f "$FILE_PATH" ] && exit 0

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // ""')
[ -z "${CONTENT//[[:space:]]/}" ] && exit 0

# 宣告段或 escape 任一存在 → 過
if echo "$CONTENT" | grep -q "消費的 SSOT"; then exit 0; fi
if echo "$CONTENT" | grep -q "@ssot-header-exempt:"; then exit 0; fi

cat >&2 <<'EOF'
🚨 [P0 BLOCKER] 新建 production tsx 缺「── 消費的 SSOT ──」檔頭宣告段

CLAUDE.md「# SSOT 消費 canonical」+ .claude/references/ssot-consultation.md:30-51 強制:
新元件 tsx 開頭必列本檔消費的 components / patterns / tokens / spec(沒列 = 自創 = mindset #2 違規)。

修法 — 2 選 1:
  (a) 檔頭補宣告段(格式見 ssot-consultation.md;近例:pagination.tsx 檔頭):
        // ── 消費的 SSOT ──
        // - <primitive / token / spec 清單 + 消費點一句>
  (b) 真的零 SSOT 可消費(罕見,純 utility)→ 內容加 `// @ssot-header-exempt: <rationale>`

對應:mindset #2 / M23 / 治理進化 roadmap 方向 3(planning/2026-07-07-governance-evolution-roadmap.md)
EOF
exit 2

#!/bin/bash
# check_propose_cite_required.sh — P1 BLOCKER
#
# 攔 AI 在對話講「DS 規定 / spec 規定 / canonical 寫 / 必配 / 必須用 / 必須是」
# 沒附 file:line cite 的瞎掰 propose(2026-05-27 user verbatim「沒有好好按照規則
# 和 ssot 跑設計，然後淨問我一下蠢問題」永久 codify)。
#
# Anchor 錨點:2026-05-27 我憑印象斷言「DS spec 規定 caption + muted 是標準組合」,
# user grep verify 發現 semantic.css L49 只是 token use-case 描述,**沒「必配」rule**。
# DS 自家 typography.stories.tsx 同時用 caption+secondary 跟 caption+muted。
# 我瞎掰造成 user 接受錯誤 propose 風險。
#
# Stop hook(post-assistant turn)偵測:
#   - Reply 含 claim keyword:「規定 / 必配 / 必須用 / 必須是 / canonical 寫 / spec 寫 / 強制」
#   - 同 reply 無 cite:`<filename>.{spec\.md|css|tsx|ts}:\d+` 或 `L\d+` 或 `line \d+`
#   - 觸發 BLOCKER 要求 retract 或補 cite
#
# Escape:Reply 含 `<!-- @propose-cite-skip: <rationale> -->` 顯式跳(極罕見)
#
# 對齊:M22 cite invariant(commit/spec)延伸到對話 propose 層 + mindset #2「不憑直覺發明」mechanical 強制。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)

# Only fire on stop events (post-assistant turn)
case "${EVENT:-}" in
  Stop|SubagentStop) ;;
  *) exit 0 ;;
esac

# Read last assistant message
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)
[ -z "$TRANSCRIPT" ] || [ ! -f "$TRANSCRIPT" ] && exit 0

LAST_REPLY=$(tail -200 "$TRANSCRIPT" 2>/dev/null | grep -E '"role":"assistant"|"type":"text"' | tail -50 | tr -d '\n' | head -c 8000)

# Escape clause
if echo "$LAST_REPLY" | grep -q 'propose-cite-skip'; then
  exit 0
fi

# Detect claim keywords
HAS_CLAIM=""
for kw in '規定' '必配' '必須用' '必須是' '一定要' 'canonical 寫' 'spec 寫' '強制' 'DS spec 規定' '明文' 'mandate'; do
  if echo "$LAST_REPLY" | grep -qF "$kw"; then
    HAS_CLAIM="$kw"
    break
  fi
done

if [ -z "$HAS_CLAIM" ]; then
  exit 0
fi

# Detect cite patterns
# Accept: file.spec.md:42 | file.css:42 | file.tsx:42 | file.ts:42 | L42 | line 42 | semantic.css#L42
HAS_CITE=""
if echo "$LAST_REPLY" | grep -qE '\.(spec\.md|css|tsx|ts|json):[0-9]+|#L[0-9]+|line[[:space:]]+[0-9]+|L[0-9]+-[0-9]+|L[0-9]+'; then
  HAS_CITE="found"
fi

if [ -z "$HAS_CITE" ]; then
  cat >&2 << 'EOF'
🚨 PROPOSE-WITHOUT-CITE BLOCKER(2026-05-27 user verbatim「沒有好好按照規則和 ssot 跑設計」)

  你 reply 含 claim keyword(規定 / 必配 / 必須用 / canonical 寫 / spec 寫 / 強制)
  但**無 file:line cite**(`.spec.md:42` / `.css:42` / `.tsx:42` / `L42` / `line 42` 任一)。

  Anchor 2026-05-27:我憑印象斷言「DS spec 規定 caption + muted」,user grep verify
  發現 semantic.css L49 只是 token use-case 描述,**沒「必配」rule**。瞎掰造成 user
  接受錯誤 propose 風險。

  修方向 2 選 1:
    (a) 補 cite — 把 spec / source path:line 補進 reply,讓 user verify
    (b) 撤回 claim — 顯式打「撤回 claim:此條無 SSOT 依據」

  Escape(極罕見):reply 含 `<!-- @propose-cite-skip: <rationale> -->`

  對齊 M22 cite invariant 延伸到對話層 + mindset #2「不憑直覺發明」mechanical 強制。
EOF
  exit 2
fi

exit 0

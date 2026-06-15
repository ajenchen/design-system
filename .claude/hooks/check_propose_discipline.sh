#!/bin/bash
# check_propose_discipline.sh — Stop ×2 — propose 紀律(中文人話 + file:line cite;SSOT memory/feedback_propose_discipline.md)
#
# 2026-06-11 prune merge(user 拍板「照你建議做」;59→51 headroom):
# #   r1_plain_chinese = 原 check_propose_plain_chinese.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
#   r2_cite_required = 原 check_propose_cite_required.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
# 原檔 → .claude/hooks/retired/2026-06-11-prune-merge/
# 各規則跑在 pipeline 子 shell:規則內 exit 不中斷其他規則;任一 exit 2 → 整體 exit 2。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")

r1_plain_chinese() {
set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)

[ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ] && exit 0

# 找最新 user msg line 之後的 assistant text(本 turn AI reply)
LAST_USER_LINE=$(grep -n '"role":"user"' "$TRANSCRIPT_PATH" 2>/dev/null | tail -1 | cut -d: -f1)
[ -z "$LAST_USER_LINE" ] && exit 0

AI_REPLY_TEXT=$(tail -n +$((LAST_USER_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null | \
  jq -r 'select(.message.role=="assistant") | .message.content // empty | if type=="string" then . else (.[]? | select(.type=="text") | .text // empty) end' 2>/dev/null)

[ -z "$AI_REPLY_TEXT" ] && exit 0

# Decision prompt pattern(reply 結尾含 ASK)
DECISION_RE='(回 [A-Z]|→ ?選 [A-Z]|等你(拍板|決策|回|看)|user 決策|user 拍板|拍板.{0,5}決|決策.{0,5}選|一字回|回 OK)'
HAS_DECISION=$(echo "$AI_REPLY_TEXT" | grep -cE "$DECISION_RE" 2>/dev/null)
HAS_DECISION=${HAS_DECISION:-0}

[ "$HAS_DECISION" -eq 0 ] && exit 0

# GAP 4 fix(2026-05-18 M34 codify):升級 narrow 17-keyword fixed list 到
# Python unicode 中英夾雜 density detector(對齊 check_story_invariants.sh R5.5 fix template)。
# Spec wording「任何沒中譯的縮寫 / 內部代號 / hook 名」廣義,hook 過去窄 keyword list 漏:
# Earn-existence / compound-component / Polaris-aligned / wrapper-vs-primitive / Anchor preflight
# / *-canonical-allow / L42-58 / check_xxx.sh 等。
#
# 升級邏輯:
# (a) EXEMPT list:legitimate retained-English(framework/brand/DS API)
# (b) Density measure:jargon-word count / total Chinese-char count ratio
# (c) jargon = 英文 token 不在 EXEMPT(任何 alphanumeric word ≥ 3 char)
JARGON_COUNT=$(python3 -c "
import re, sys
text = sys.stdin.read()
EXEMPT = re.compile(r'\b(cva|Radix|Polaris|Material|Atlassian|Carbon|Ant|Apple|MUI|TanStack|shadcn|Recharts|cmdk|dnd-kit|TypeScript|JavaScript|API|UI|UX|Jira|Stripe|Notion|Figma|Linear|GitHub|Gmail|Dropbox|Slack|Spotify|Discord|Storybook|Tailwind|ARIA|WCAG|FAQ|HSL|CSS|HTML|DOM|DS|F[1-9]|TODO|FIXME|XXX|NOTE|README|MIT|JSON|YAML|TSX|CSS|HTTP|HTTPS|URL|UUID|REST|GraphQL|SDK|CDN|CI|CD|PR|RFC|MR|UI/UX|primary|secondary|tertiary|hover|focus|active|disabled|invalid|readonly|null|true|false|undefined|void)\b', re.I)
words = re.findall(r'\b[a-zA-Z][a-zA-Z\-_]{2,}\b', text)
jargon = [w for w in words if not EXEMPT.fullmatch(w)]
print(len(jargon))
" <<< "$AI_REPLY_TEXT" 2>/dev/null)
JARGON_COUNT=${JARGON_COUNT:-0}

# Threshold:含決策 prompt + jargon count ≥ 10 → warn(Python 計數較廣,threshold 提高)
THRESHOLD=10

if [ "$JARGON_COUNT" -ge "$THRESHOLD" ]; then
  echo "🟡 check_propose_plain_chinese WARN:本 turn reply 含 user 決策 prompt + jargon 密度 ${JARGON_COUNT}(threshold ${THRESHOLD})" >&2
  echo "" >&2
  echo "→ 違反 propose-in-plain-chinese canonical(memory/feedback_propose_discipline.md SSOT)" >&2
  echo "→ User 原話「請講具體人話,為何又跟智障一樣講人聽不懂的話」" >&2
  echo "→ Rewrite reply:必含 3 段(發生什麼 / 影響什麼 / 各選項 outcome — 全中文具體,禁 jargon)" >&2
  echo "" >&2
  # Soft warn,不 BLOCK turn(exit 0)— 讓 AI 看到 stderr 後 self-correct
fi

exit 0
}

r2_cite_required() {
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
}

for _rule in r1_plain_chinese r2_cite_required; do
  echo "$INPUT" | "$_rule"
  _rc=$?
  if [ "$_rc" -eq 2 ]; then exit 2; fi
done
exit 0

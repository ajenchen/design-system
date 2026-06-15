#!/bin/bash
# check_propose_plain_chinese.sh — Stop hook: scan AI 本 turn reply 含「要 user 決策」pattern 但用 jargon 違 propose-in-plain-chinese canonical。
#
# 對應 SSOT:.claude/memory/feedback_propose_discipline.md
#         + CLAUDE.md `# 自主執行 canonical`「SSOT-UI/UX 中文具體人話」明文
#
# User 原話 2026-05-15:「已經跟你說過任何要我決策的東西請講具體人話,為何又跟智障一樣講人聽不懂的話呢?」
#
# Mechanism:
# 1. Tail transcript 取 AI 本 turn 最後 assistant text content
# 2. Detect 決策 prompt pattern(「回 A / B / C」/「→ 選 A」/「等你拍板」/「user 決策」)
# 3. Count jargon density(「M[0-9]+」/「Dim [0-9]+」/「SSOT」/「@watch」/「frontmatter」/「stub」/etc)
# 4. Density > threshold + 含決策 prompt → warn(P1 soft inject)
#
# 不 BLOCK turn,只 inject context warning(避免 false-positive 中斷 work)

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

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

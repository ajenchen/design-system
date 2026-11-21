#!/bin/bash
# check_propose_discipline.sh — Stop ×3 — propose 紀律(中文人話 + file:line cite;SSOT memory/feedback_propose_discipline.md)
#
# 2026-06-11 prune merge(user 拍板「照你建議做」;59→51 headroom):
# #   r1_plain_chinese = 原 check_propose_plain_chinese.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
#   r2_cite_required = 原 check_propose_cite_required.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
# 原檔 → packages/design-system/ds-canonical/hooks/retired/2026-06-11-prune-merge/
# 2026-11-18 knowledge-prune H-M4:
#   r3_planning_doc_cite = 原 check_propose_pre_grep_verify.sh(PreToolUse 只寫 stderr、exit 0,模型看不到)併入,
#   改成 Stop 端會擋;改了什麼、為什麼,寫在 r3 函式上方。
# 各規則跑在 pipeline 子 shell:規則內 exit 不中斷其他規則;任一 exit 2 → 整體 exit 2。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
# 「本回合 / 這一則回覆從 transcript 哪一行開始」只在這支 helper 判(2026-11-21,工作包 E7;與 stop_self_audit.sh 共用)。
# r1 中途文字用「這一則回覆」的起點,r2 / r3 用「本回合」(user 本人上一則訊息)的起點;選擇表在 helper 檔頭。
source "$(dirname "$0")/lib/_turn_boundary.sh" 2>/dev/null || {
  printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: turn-boundary helper unavailable\n' >&2
  exit 70
}

set -uo pipefail
INPUT=$(cat 2>/dev/null) || {
  printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: 無法讀取 canonical input\n' >&2
  exit 70
}
if ! printf '%s' "$INPUT" | jq -e 'type == "object"' >/dev/null 2>&1; then
  printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: invalid input envelope\n' >&2
  exit 70
fi

# ── 「可查證的出處」判準:唯一住處,r2(回覆裡的斷言)與 r3(規劃文件裡的提案)共用 ──
# The rule's intent is "a claim must be verifiable", so the accepted forms must cover every place a
# verifiable claim can live — not only design-system file types. Governance and CI claims live in
# .mjs/.sh/.yml/.json, and claims about provider behaviour can only be sourced to external product
# documentation, which has no repo line number. Keeping the narrow list turned honest citations into
# BLOCKERs (2026-08-02: citing run-provider-hook.mjs and the official sandboxing docs was rejected),
# which is the same "predicate narrower than intent" defect M7 warns about.
# Accept: <file>.<ext>:42 for the source types below | L42 | L42-50 | #L42 | line 42 | https://… URL
#
# Deploy previews are not sources. Every solo-workflow reply carries a per-branch Netlify preview URL
# (AGENTS.md, Git solo-work canonical step 2/5), so counting any URL as a citation would switch this
# check off for exactly the replies it is meant to police. Negative-list rather than allowlist: an
# allowlist of "real" documentation hosts drifts and reproduces the too-narrow predicate this hook
# was widened to fix.
# Blank out the URL text only. Dropping whole lines would also discard a real file:line citation that
# happens to share a line with the preview link. Host-anchored: `[^/[:space:]]*` before the
# alternation means the match must land in the authority component, so a documentation URL that
# merely mentions "localhost" in its path or fragment is not blanked (2026-08-04 adversarial
# review). ajenchen.github.io is this repo's own deployed Storybook — a deploy artifact, not a
# source; scoped to the exact host so genuinely external *.github.io documentation still counts.
# (2026-11-18 從 r2 函式內原封搬到這裡給 r3 共用;判準一個字都沒改,r2 的測試照跑。)
PROPOSE_NON_SOURCE_URL='https?://[^/[:space:]]*(\.netlify\.app|localhost|127\.0\.0\.1|0\.0\.0\.0|ajenchen\.github\.io)[^[:space:]]*'
PROPOSE_VERIFIABLE_CITE_RE='\.(spec\.md|md|css|tsx|ts|mjs|cjs|js|json|sh|ya?ml|toml):[0-9]+|#L[0-9]+|line[[:space:]]+[0-9]+|L[0-9]+-[0-9]+|L[0-9]+|https?://[^[:space:]]+'
propose_has_verifiable_cite() {
  local candidates
  candidates=$(sed -E "s#${PROPOSE_NON_SOURCE_URL}#(deploy-preview)#g" <<<"$1")
  grep -qE "$PROPOSE_VERIFIABLE_CITE_RE" <<<"$candidates"
}

r1_plain_chinese() {
set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
TRANSCRIPT_PATH=$(jq -r '.transcript_path // ""' <<<"$INPUT" 2>/dev/null)
AI_REPLY_TEXT=$(jq -r '.last_assistant_message // ""' <<<"$INPUT" 2>/dev/null)
if [ -z "$AI_REPLY_TEXT" ] && [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # Legacy/versioned transcript fallback.  Native Stop last_assistant_message is the primary,
  # provider-neutral contract and does not require an unstable transcript.
  LAST_USER_LINE=$(grep -n '"role":"user"' "$TRANSCRIPT_PATH" 2>/dev/null | tail -1 | cut -d: -f1)
  if [ -n "$LAST_USER_LINE" ]; then
    AI_REPLY_TEXT=$(tail -n +$((LAST_USER_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null | \
      jq -r 'select(.message.role=="assistant") | .message.content // empty | if type=="string" then . else (.[]? | select(.type=="text") | .text // empty) end' 2>/dev/null)
  fi
fi

[ -z "$AI_REPLY_TEXT" ] && exit 0

# ── 中途文字(2026-11-15):這一輪做事中途插的文字,user 一樣看得到 ──
# 下面的規則只看最後一則回覆(last_assistant_message);中途的 text 區塊從來沒被檢查過,於是中途一路寫英文進度句。
# user 原話(2026-11-15):「為何你他媽又一直回覆我英文？到底要我教你幾次？以及若是沒必要讓我知道的垃圾訊息，你評估真的是垃圾，那就不用讓我看到吧？而不是把垃圾訊息轉成我看不懂的英文然後全部吐出來吧？」
# 做法:從 transcript 取「這一則回覆」起點之後的 assistant text 區塊(起點 = lib/_turn_boundary.sh 的最後一筆 role=user 紀錄,
# 不論種類:說出口的話收不回來,被 Stop hook 擋下之後只看補正那一則;2026-11-21 前這裡自己判一份),
# 排除最後一則回覆本身(它由下面的規則管),逐段(空行分段)判斷:
# 剝掉程式碼區塊 / 行內程式碼 / 路徑 / 網址 / 雜湊後,英文詞 ≥ 6 且英文詞 × 2 > 漢字數 → 擋(exit 2)。
# 中途文字通常一兩句,所以門檻比最後一則(≥ 30 個英文詞)低。transcript 讀不到 → 照舊只檢查最後一則,不因讀不到就擋。
# 最後一則回覆從 stdin 傳(可能很長,不放在命令列參數)。單一段落要英文原文時,那一段寫 `@plain-chinese-skip: 理由`。
MID_PY=''
IFS= read -r -d '' MID_PY <<'MID_PY_SOURCE' || true
import json, re, sys
path = sys.argv[1]
start = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 0
final = sys.stdin.read().strip()
try:
    with open(path, encoding='utf-8') as handle:
        raw_lines = handle.read().splitlines()
except (OSError, UnicodeDecodeError):
    print(json.dumps({'ok': False}))
    sys.exit(0)
def message_of(record):
    msg = record.get('message')
    return msg if isinstance(msg, dict) else {}
def role_of(record):
    return message_of(record).get('role') or record.get('role')
def content_of(record):
    msg = message_of(record)
    return msg['content'] if 'content' in msg else record.get('content')
# 起點由 helper 判(實體行號);0 = transcript 裡沒有任何 role=user 紀錄 → 看不到這一則從哪裡開始,不判。
if start <= 0:
    print(json.dumps({'ok': False}))
    sys.exit(0)
records = []
for line in raw_lines[start:]:
    try:
        record = json.loads(line)
    except ValueError:
        continue
    if not isinstance(record, dict):
        continue
    records.append(record)
blocks = []
for record in records:
    if role_of(record) != 'assistant':
        continue
    content = content_of(record)
    if isinstance(content, str):
        blocks.append(content)
    elif isinstance(content, list):
        for item in content:
            if isinstance(item, dict) and item.get('type') == 'text' and isinstance(item.get('text'), str):
                blocks.append(item['text'])
if final:
    blocks = [b for b in blocks if b.strip() and b.strip() not in final]
else:
    blocks = blocks[:-1]
EXEMPT = re.compile(r'(cva|Radix|Polaris|Material|Atlassian|Carbon|Ant|Apple|MUI|TanStack|shadcn|Recharts|cmdk|dnd-kit|TypeScript|JavaScript|API|UI|UX|Jira|Stripe|Notion|Figma|Linear|GitHub|Gmail|Dropbox|Slack|Spotify|Discord|Storybook|Tailwind|ARIA|WCAG|FAQ|HSL|CSS|HTML|DOM|DS|PR|CI|URL|JSON|SDK|OK|Netlify|Claude|Codex|npm|git)', re.I)
EXT = re.compile(r'[\w.-]+\.(?:tsx?|jsx?|mjs|cjs|json|md|sh|css|ya?ml|py|txt|log|html|png)')
HEX = re.compile(r'[0-9a-f]{7,40}')
def counts(segment):
    body = re.sub(r'`[^`\n]*`', ' ', segment)
    kept = []
    for token in body.split():
        if '/' in token or '\\' in token or token.startswith(('http://', 'https://')):
            continue
        bare = token.strip('()[]{}<>,.;:!?"\'「」『』,。;:!?、')
        if EXT.fullmatch(bare) or HEX.fullmatch(bare):
            continue
        kept.append(token)
    plain = ' '.join(kept)
    han = len(re.findall(r'[㐀-䶿一-鿿]', plain))
    english = [w for w in re.findall(r'[A-Za-z][A-Za-z_-]+', plain) if not EXEMPT.fullmatch(w)]
    return han, len(english)
flagged = []
for block in blocks:
    body = re.sub(r'```.*?```', '\n\n', block, flags=re.S)
    for segment in re.split(r'\n[ \t]*\n', body):
        if not segment.strip() or re.search(r'@plain-chinese-skip:\s*[^\s>]', segment):
            continue
        han, english = counts(segment)
        if english >= 6 and english * 2 > han:
            flagged.append(' '.join(segment.split())[:60])
print(json.dumps({'ok': True, 'count': len(flagged), 'flagged': flagged[:5]}, ensure_ascii=False))
MID_PY_SOURCE
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  LAST_MSG=$(jq -r '.last_assistant_message // ""' <<<"$INPUT" 2>/dev/null)
  MID_MARKS=$(governance_turn_marks "$TRANSCRIPT_PATH") || {
    printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: turn boundary classification failed\n' >&2
    exit 70
  }
  MID_FROM=$(governance_turn_last "$MID_MARKS" human wake feedback meta)
  MID_ANALYSIS=$(printf '%s' "$LAST_MSG" | python3 -c "$MID_PY" "$TRANSCRIPT_PATH" "$MID_FROM" 2>/dev/null) || {
    printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: mid-turn plain-chinese analysis failed\n' >&2
    exit 70
  }
  if [ "$(jq -r '.ok' <<<"$MID_ANALYSIS" 2>/dev/null)" = "true" ] && [ "$(jq -r '.count' <<<"$MID_ANALYSIS" 2>/dev/null)" -gt 0 ]; then
    {
      echo "🚨 PLAIN-CHINESE BLOCKER(中途文字,feedback_propose_discipline Sub-rule 1):這一輪做事中途寫出來的文字有 $(jq -r '.count' <<<"$MID_ANALYSIS") 段以英文為主 —— 中途的字 user 一樣看得到:"
      jq -r '.flagged[]' <<<"$MID_ANALYSIS" | sed 's/^/    • /'
      echo "  中途只寫 user 需要知道的(發現的問題、要 user 決定的、做完的結果),一律繁體中文;沒有必要讓 user 知道的進度句就不要寫,不是翻成英文寫出來。"
      echo "  user 原話(2026-11-15):「為何你他媽又一直回覆我英文？到底要我教你幾次？以及若是沒必要讓我知道的垃圾訊息，你評估真的是垃圾，那就不用讓我看到吧？而不是把垃圾訊息轉成我看不懂的英文然後全部吐出來吧？」"
    } >&2
    exit 2
  fi
fi

# 極罕見的逃生口(例:user 明確要求一段英文原文):reply 內寫明理由
grep -qE '@plain-chinese-skip:[[:space:]]*[^[:space:]>]' <<<"$AI_REPLY_TEXT" && exit 0

# Decision prompt pattern(reply 結尾含 ASK)
DECISION_RE='(回 [A-Z]|→ ?選 [A-Z]|等你(拍板|決策|回|看)|user 決策|user 拍板|拍板.{0,5}決|決策.{0,5}選|一字回|回 OK)'
HAS_DECISION=$(echo "$AI_REPLY_TEXT" | grep -cE "$DECISION_RE" 2>/dev/null)
HAS_DECISION=${HAS_DECISION:-0}

# ── N15(2026-10-07):Sub-rule 1 自 2026-05-31 起管「所有給 user 的 reply」,本規則卻只看含決策提問的
# reply 而且只提醒 —— 規格寬、閘窄(M7 子規則 M34)。這裡補兩道會擋(Stop exit 2,模型必須重寫才能結束):
#   (1) 以英文為主:剝掉程式碼區塊、行內程式碼、網址、檔案路徑、雜湊之後,非豁免英文字數 ≥ 30
#       且多於漢字數的一半(一個中文詞約兩個字)→ 這段回覆 user 讀不懂,等於白做。
#   (2) 要 user 拍板的回覆裡,有一行只列內部代號(N4、OE24、G7…)卻沒有中文說明(該行漢字 < 6)
#       → user 2026-09-25:「這到底在講什麼鬼話？鬼看得懂？」
# 判斷都在下面這段 python 裡,單一住所;沒有命中才往下走原本的術語密度提醒。
# 原始碼用 read + quoted heredoc 讀進變數(不包在 $(...) 裡:bash 3.2 在命令替換內仍會掃引號,
# python 字串裡的單引號會讓整支 hook 語法錯)。
PLAIN_PY=''
IFS= read -r -d '' PLAIN_PY <<'PLAIN_PY_SOURCE' || true
import json, re, sys
text = sys.stdin.read()
# 逐 token 處理,每一步都是線性時間:回覆可能超過 256 KiB(一長串沒有空白的字元也要撐得住,
# 不得用 `\S*[/]\S*` 這種會在長 token 上回溯成平方時間的寫法)。
# 程式碼區塊換成換行(不是空白):區塊前後原本就是不同行,不能被併成一行
body = re.sub(r'```.*?```', '\n', text, flags=re.S)
body = re.sub(r'`[^`\n]*`', ' ', body)
EXT = re.compile(r'[\w.-]+\.(?:tsx?|jsx?|mjs|cjs|json|md|sh|css|ya?ml|py|txt|log|html|png)')
HEX = re.compile(r'[0-9a-f]{7,40}')
kept = []
for token in body.split():
    if '/' in token or '\\' in token or token.startswith(('http://', 'https://')):
        continue
    bare = token.strip('()[]{}<>,.;:!?"\'「」『』,。;:!?、')
    if EXT.fullmatch(bare) or HEX.fullmatch(bare):
        continue
    kept.append(token)
plain = ' '.join(kept)
han = len(re.findall(r'[㐀-䶿一-鿿]', plain))
EXEMPT = re.compile(r'(cva|Radix|Polaris|Material|Atlassian|Carbon|Ant|Apple|MUI|TanStack|shadcn|Recharts|cmdk|dnd-kit|TypeScript|JavaScript|API|UI|UX|Jira|Stripe|Notion|Figma|Linear|GitHub|Gmail|Dropbox|Slack|Spotify|Discord|Storybook|Tailwind|ARIA|WCAG|FAQ|HSL|CSS|HTML|DOM|DS|PR|CI|URL|JSON|SDK|OK|Netlify|Claude|Codex|npm|git)', re.I)
words = re.findall(r'[A-Za-z][A-Za-z_-]+', plain)
english = [w for w in words if not EXEMPT.fullmatch(w)]
code_re = re.compile(r'\b[A-Z]{1,3}[0-9]{1,3}[a-z]?\b')
# 新清單項目的開頭(1. / 1) / - / * / • / (a))
item_start = re.compile(r'^\s*(?:\d+[.)、]|[-*•+]|[(（]?[A-Za-z][)）])\s')
def han_count(value):
    return len(re.findall(r'[㐀-䶿一-鿿]', value))
# 掃的是**已剝掉程式碼區塊與行內程式碼**的 body(N15 複核:掃含程式碼區塊的原文,會把 ``` 裡的
# `SHA256(data)` 當成只寫代號的一行而誤擋)。代號自成一行時,只有「同一項目的接續行」算它的說明:
# 緊接的下一行(不是新的清單項目),或隔空行但有縮排的接續段落(markdown 清單的續段寫法)。
# N15 複核二(2026-10-07):原本取「下一個非空行」,代號後空一行接一句無關的總結(「以上是這次要決定的。」)
# 也被當成說明而放行;頂格、隔空行的那一行是新段落,不是這個項目的說明。
body_lines = body.splitlines()
bare_code_lines = []
for index, line in enumerate(body_lines):
    if not code_re.search(line):
        continue
    if han_count(code_re.sub(' ', line)) >= 6:
        continue
    following = ''
    if index + 1 < len(body_lines) and body_lines[index + 1].strip():
        following = body_lines[index + 1]
    else:
        later = next((item for item in body_lines[index + 1:] if item.strip()), '')
        if later[:1] in (' ', '\t'):
            following = later
    if following and not item_start.match(following) and han_count(code_re.sub(' ', following)) >= 6:
        continue
    bare_code_lines.append(line.strip()[:80])
print(json.dumps({'han': han, 'english': len(english), 'bare_code_lines': bare_code_lines[:5]}, ensure_ascii=False))
PLAIN_PY_SOURCE
PLAIN_ANALYSIS=$(python3 -c "$PLAIN_PY" <<< "$AI_REPLY_TEXT" 2>/dev/null) || {
  # 判斷跑不出來 ≠ 回覆合格:交給 adapter 當成這支 hook 降級(看得見),不靜默放行
  printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: plain-chinese analysis failed\n' >&2
  exit 70
}
if [ -n "$PLAIN_ANALYSIS" ]; then
  PLAIN_HAN=$(jq -r '.han' <<<"$PLAIN_ANALYSIS")
  PLAIN_ENGLISH=$(jq -r '.english' <<<"$PLAIN_ANALYSIS")
  if [ "$PLAIN_ENGLISH" -ge 30 ] && [ $((PLAIN_ENGLISH * 2)) -gt "$PLAIN_HAN" ]; then
    printf '%s\n' \
      "🚨 PLAIN-CHINESE BLOCKER(N15,feedback_propose_discipline Sub-rule 1):這段回覆以英文為主" \
      "  (程式碼、路徑、網址以外的英文字 ${PLAIN_ENGLISH} 個,漢字 ${PLAIN_HAN} 個)。user 看不懂英文,這樣的回覆等於沒有交代。" \
      "  請用繁體中文白話重寫:先說發生什麼、影響什麼、接下來做什麼;必要的檔名 / 指令放在反引號裡並緊跟中文說明。" \
      "  user 原話:「你他媽給我講中文，我們的工作流程不是定義過了嗎」。" >&2
    exit 2
  fi
  if [ "$HAS_DECISION" -gt 0 ]; then
    BARE_CODES=$(jq -r '.bare_code_lines[]' <<<"$PLAIN_ANALYSIS")
    if [ -n "$BARE_CODES" ]; then
      {
        echo "🚨 PLAIN-CHINESE BLOCKER(N15):要你拍板的回覆裡,下面這幾行只寫了內部代號、沒有中文說明:"
        printf '%s\n' "$BARE_CODES" | sed 's/^/    • /'
        echo "  每個要 user 決定的項目都要寫:現在怎樣、改了會怎樣、建議哪個與原因(全中文白話);代號只能當附註。"
        echo "  user 原話:「這到底在講什麼鬼話？鬼看得懂？」"
      } >&2
      exit 2
    fi
  fi
fi

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
  MESSAGE=$(printf '🟡 check_propose_plain_chinese WARN:本 turn reply 含 user 決策 prompt + jargon 密度 %s(threshold %s)\n\n→ 違反 propose-in-plain-chinese canonical(memory/feedback_propose_discipline.md SSOT)\n→ User 原話「請講具體人話,為何又跟智障一樣講人聽不懂的話」\n→ Rewrite reply:必含 3 段(發生什麼 / 影響什麼 / 各選項 outcome — 全中文具體,禁 jargon)' "$JARGON_COUNT" "$THRESHOLD")
  printf '{"governanceContext":{"hookEventName":"Stop","message":%s}}\n' "$(printf '%s' "$MESSAGE" | jq -Rs .)"
fi

exit 0
}

r2_cite_required() {
set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
EVENT=$(jq -r '.hook_event_name // ""' <<<"$INPUT" 2>/dev/null)

# Only fire on stop events (post-assistant turn)
case "${EVENT:-}" in
  Stop|SubagentStop) ;;
  *) exit 0 ;;
esac

# Read the native provider-neutral final reply first; only use a versioned transcript as fallback.
TRANSCRIPT=$(jq -r '.transcript_path // ""' <<<"$INPUT" 2>/dev/null)
LAST_REPLY=$(jq -r '.last_assistant_message // ""' <<<"$INPUT" 2>/dev/null)
if [ -z "$LAST_REPLY" ] && [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
  LAST_REPLY_RAW=$(tail -200 "$TRANSCRIPT" 2>/dev/null | grep -E '"role":"assistant"|"type":"text"' | tail -50 | tr -d '\n')
  LAST_REPLY="${LAST_REPLY_RAW:0:8000}"
fi
# 2026-11-21(工作包 E7;交接 process-audit 根因 8):讀「同一個真 user 回合」裡的全部回覆,不只最後一則。
# 起因:補正回覆常把關鍵字再寫一次(「上一則『照規定』的出處已經補上」),出處卻在同一回合稍早那則 ——
# 只看最後一則就被自己的引述擋(11-18 17:27:10、18:06:06)。回合起點用 lib/_turn_boundary.sh 的 user 本人訊息,
# Stop hook 回饋不切回合,不另外定義「補正鏈」。斷言、出處、escape、撤回都在整個回合裡找。
if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
  R2_MARKS=$(governance_turn_marks "$TRANSCRIPT") || {
    printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: turn boundary classification failed\n' >&2
    exit 70
  }
  R2_FROM=$(governance_turn_last "$R2_MARKS" human)
  if [ "${R2_FROM:-0}" -gt 0 ]; then
    R2_TURN_TEXT=$(governance_assistant_text_after "$TRANSCRIPT" "$R2_FROM")
    [ -n "$R2_TURN_TEXT" ] && LAST_REPLY="${R2_TURN_TEXT}
${LAST_REPLY}"
  fi
fi
[ -z "$LAST_REPLY" ] && exit 0

# Escape clause;「撤回 claim」是擋下訊息給的修法 (b) —— 改讀整個回合之後,被擋的那句還留在範圍裡,
# 要認得這個撤回,否則只剩補出處一條路(2026-11-21 前它只是因為補正回覆不再含關鍵字而碰巧放行)。
if grep -q 'propose-cite-skip' <<<"$LAST_REPLY" || grep -qF '撤回 claim' <<<"$LAST_REPLY"; then
  exit 0
fi

# Detect claim keywords
HAS_CLAIM=""
for kw in '規定' '必配' '必須用' '必須是' '一定要' 'canonical 寫' 'spec 寫' '強制' 'DS spec 規定' '明文' 'mandate'; do
  if grep -qF "$kw" <<<"$LAST_REPLY"; then
    HAS_CLAIM="$kw"
    break
  fi
done

if [ -z "$HAS_CLAIM" ]; then
  exit 0
fi

# Detect cite patterns:判準與理由住在檔頭 propose_has_verifiable_cite(r3 共用)。
HAS_CITE=""
if propose_has_verifiable_cite "$LAST_REPLY"; then
  HAS_CITE="found"
fi

if [ -z "$HAS_CITE" ]; then
  cat >&2 << 'EOF'
🚨 PROPOSE-WITHOUT-CITE BLOCKER(2026-05-27 user verbatim「沒有好好按照規則和 ssot 跑設計」)

  你 reply 含 claim keyword(規定 / 必配 / 必須用 / canonical 寫 / spec 寫 / 強制)
  但**無可驗證 cite**(`.spec.md:42` / `.tsx:42` / `.mjs:42` / `.sh:42` / `.yml:42` /
  `L42` / `line 42` / 外部官方文件 URL 任一)。

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

# ── r3(2026-11-18 knowledge-prune H-M4):規劃 / 報告 / 交接文件裡請 user 拍板,要先附查證的出處(M18 Q0)──
# 原 check_propose_pre_grep_verify.sh(PreToolUse Edit/Write)的提案字眼與三種出處寫法逐字搬入,改了五件事:
#   (1) 擋,不是提醒:原支 outputMode = diagnostic(寫 stderr、exit 0),而「Claude never sees stderr from a hook
#       that exits 0」(https://code.claude.com/docs/en/hooks);搬到 Stop 之後,governance-context 在 Stop 當時只會變成給
#       user 看的 systemMessage,進得了模型的只有擋 ——
#       exit 2 時「Claude receives the stderr message as the explanation for why it should continue」(同一頁 Stop 段)。
#       2026-11-21 PROC-H 起,Stop 的 context 在第一次停下(stop_hook_active 為 false)會走 Stop additionalContext,模型看得到,
#       續跑中仍只給 user(scripts/lib/provider-hook-output-transport.mjs#formatProviderHookContext);r3 照舊用擋:
#       沒出處的拍板請求不該在提醒後才補,而且續跑中那一次的提醒模型看不到。
#       也照 governance/memory/feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md:29(偵測 → 警告但 exit 0 = 假 enforcement)。
#   (2) 範圍:原支只認字面 */planning/*.md|*/reports/*.md|*/handoff/*.md,`handoff-2026-11-12/` 這種目錄名對不上;
#       改成「任一層目錄名以 planning / report / handoff 開頭」的 .md。提案字眼另收全形冒號「選項：」(原支只收半形)。
#   (3) 出處:原支只認反引號裡小寫路徑的 .tsx/.ts/.css/.md,引 `AGENTS.md` 或 .mjs/.sh/.json 的行號都算沒附;
#       改成 propose_has_verifiable_cite(與 r2 同一個判準)或原支三種寫法任一(原本放行的照樣放行)。
#   (4) 出處與 escape 都要在「這一輪寫進這個檔的所有片段」(WRITTEN)裡,而且檔案現在也還有(新判準 = 舊判準 AND
#       本輪寫入判準,舊版擋的不會變成放行)。第一版改看整份檔案現在的內容,結果對既有文件用 Edit 加一段沒出處的提案,
#       只要文件別處早有任何出處(或檔頭早有 escape)就放行 —— repo 裡 planning / report 的 md 大多已有出處,r3 等於
#       不出聲;舊支也只看這次寫進去的內容(WP-13 審查必修 1)。被擋後補一個 Edit 加出處,那筆 Edit 也屬本輪,
#       會收進 WRITTEN,所以照樣放行;要不要查仍看「本輪寫進去的有提案字眼、而且檔案現在仍有」(把提案改掉就放行)。
#       檔案讀不到(已搬走、不是一般檔、超過 8 MiB)就只判本輪寫入的內容。
#   (5) 只算真的寫成功的:對應的 tool_result 存在而且不是 is_error。被 user 拒絕、被權限擋下、Edit 找不到字串的
#       tool_use 都沒有寫進檔案;第一版拿「tool_use 存在」當成「已寫入」(M37),檔案又不在,就改判 transcript 裡那段文字,
#       擋的訊息給的修法(補出處 / escape / 拿掉提案)全都碰不到那段文字,Stop 會一直擋到模型去建 user 剛拒絕的檔
#       (WP-13 審查必修 2)。找不到對應 tool_result = 看不到有沒有寫成,同下面「看不到就不判」。
# 「這一輪」= 最後一則使用者本人訊息之後,起點由 lib/_turn_boundary.sh 判(human;2026-11-21 前這裡是 python 照抄的一份,
#   工作包 E7 收進共用 helper,與 stop_self_audit.sh、r2 同一份)。helper 只認 type 與 role 一致的紀錄 —— 真實 transcript 每則訊息
#   另有一份 api-request-blob 副本(role 也是 user / assistant),算進來會把邊界切在本輪中間。不用 r1 中途文字的邊界:那個邊界在
#   「Stop hook feedback」(isMeta 的 user 紀錄)之後重算,r1 需要這樣(說出口的話收不回來),r3 不行(被擋後要看得到原本那次寫入)。
# 看不到就不判:transcript 讀不到、或找不到使用者訊息(Codex 沒有 versioned transcript:packages/governance/canonical/providers.json:514)
#   → exit 0;解析失敗 → GOVERNANCE_INTEGRITY exit 70,不讀成合格。
# Escape:檔案前 3 行有 `<!-- @propose-pre-verified: 查過什麼、為何不附出處 -->`(冒號後理由必填;原支不檢查理由,改成擋之後補上),
#   而且這一輪有寫進去(見 (4):檔頭舊的 escape 不涵蓋本輪新加的提案)。
R3_PROPOSE_RE='(請拍板|等你拍板|待你拍板|決策 [0-9N]|我推 [ABC]|選項(:|：)|propose for user|你決定|讓我判斷決策)'
R3_LEGACY_CITE_RE='`[a-z][a-z0-9/-]+\.(tsx|ts|css|md):[0-9]+`|`[a-z][a-z0-9/-]+\.(tsx|ts|css|md)`|`packages/design-system/src/'
R3_ESCAPE_RE='@propose-pre-verified:[[:space:]]*[^[:space:]>-]'
r3_has_cite() { propose_has_verifiable_cite "$1" || grep -qE "$R3_LEGACY_CITE_RE" <<<"$1"; }
r3_planning_doc_cite() {
set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
EVENT=$(jq -r '.hook_event_name // ""' <<<"$INPUT" 2>/dev/null)
case "${EVENT:-}" in
  Stop|SubagentStop) ;;
  *) exit 0 ;;
esac
TRANSCRIPT_PATH=$(jq -r '.transcript_path // ""' <<<"$INPUT" 2>/dev/null)
if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi
HOOK_CWD=$(jq -r '.cwd // ""' <<<"$INPUT" 2>/dev/null)
[ -n "$HOOK_CWD" ] || HOOK_CWD=$PWD

R3_PY=''
IFS= read -r -d '' R3_PY <<'R3_PY_SOURCE' || true
import json, os, re, stat, sys
transcript, cwd = sys.argv[1], sys.argv[2]
start = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else 0
DIR_PREFIX = re.compile(r'(?:planning|report|handoff)')
MAX_DOC_BYTES = 8 * 1024 * 1024
def message_of(record):
    msg = record.get('message')
    return msg if isinstance(msg, dict) else {}
def role_of(record):
    return message_of(record).get('role') or record.get('role')
def content_of(record):
    msg = message_of(record)
    return msg['content'] if 'content' in msg else record.get('content')
def kind_of(record):
    role = role_of(record)
    return role if record.get('type') in (None, role) else None
try:
    with open(transcript, encoding='utf-8') as handle:
        raw_lines = handle.read().splitlines()
except (OSError, UnicodeDecodeError):
    print(json.dumps({'ok': False}))
    sys.exit(0)
# 起點(實體行號)由 helper 判;0 = 找不到使用者本人訊息 → 看不到就不判。
if start <= 0:
    print(json.dumps({'ok': False}))
    sys.exit(0)
records = []
for line in raw_lines[start:]:
    try:
        record = json.loads(line)
    except ValueError:
        continue
    if not isinstance(record, dict):
        continue
    records.append(record)
# 寫成功 = 對應的 tool_result 存在而且 is_error 不是 true(被拒絕 / 被擋 / 執行失敗的都是 is_error true)
succeeded, failed = set(), set()
for record in records:
    content = content_of(record)
    if kind_of(record) != 'user' or not isinstance(content, list):
        continue
    for item in content:
        if isinstance(item, dict) and item.get('type') == 'tool_result' and isinstance(item.get('tool_use_id'), str):
            (failed if item.get('is_error') is True else succeeded).add(item['tool_use_id'])
written, order = {}, []
for record in records:
    content = content_of(record)
    if kind_of(record) != 'assistant' or not isinstance(content, list):
        continue
    for item in content:
        if not isinstance(item, dict) or item.get('type') != 'tool_use' or item.get('name') not in ('Write', 'Edit', 'MultiEdit'):
            continue
        tool_id = item.get('id')
        if not isinstance(tool_id, str) or tool_id not in succeeded or tool_id in failed:
            continue
        data = item.get('input') if isinstance(item.get('input'), dict) else {}
        target = data.get('file_path')
        if not isinstance(target, str) or not target.endswith('.md'):
            continue
        if not any(DIR_PREFIX.match(part) for part in target.split('/')[:-1]):
            continue
        chunks = [data[key] for key in ('content', 'new_string') if isinstance(data.get(key), str)]
        if isinstance(data.get('edits'), list):
            chunks += [edit['new_string'] for edit in data['edits'] if isinstance(edit, dict) and isinstance(edit.get('new_string'), str)]
        if target not in written:
            written[target] = []
            order.append(target)
        written[target].extend(chunks)
def current_text(target):
    full = target if os.path.isabs(target) else os.path.join(cwd, target)
    try:
        info = os.lstat(full)
        if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_DOC_BYTES:
            return None
        with open(full, encoding='utf-8') as handle:
            return handle.read()
    except (OSError, UnicodeDecodeError):
        return None
docs = [{'path': target, 'written': '\n'.join(written[target]), 'current': current_text(target)} for target in order]
print(json.dumps({'ok': True, 'docs': docs}, ensure_ascii=False))
R3_PY_SOURCE
R3_MARKS=$(governance_turn_marks "$TRANSCRIPT_PATH") || {
  printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: turn boundary classification failed\n' >&2
  exit 70
}
R3_FROM=$(governance_turn_last "$R3_MARKS" human)
ANALYSIS=$(python3 -c "$R3_PY" "$TRANSCRIPT_PATH" "$HOOK_CWD" "$R3_FROM" 2>/dev/null) \
  && [ "$(jq -r '.ok | type' <<<"$ANALYSIS" 2>/dev/null)" = "boolean" ] || {
  printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: planning-doc cite analysis failed\n' >&2
  exit 70
}
[ "$(jq -r '.ok' <<<"$ANALYSIS")" = "true" ] || exit 0
DOC_COUNT=$(jq -er '.docs | length' <<<"$ANALYSIS" 2>/dev/null) || {
  printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: planning-doc list unreadable\n' >&2
  exit 70
}
FLAGGED=""
INDEX=0
while [ "$INDEX" -lt "$DOC_COUNT" ]; do
  DOC_PATH=$(jq -r --argjson i "$INDEX" '.docs[$i].path' <<<"$ANALYSIS")
  WRITTEN=$(jq -r --argjson i "$INDEX" '.docs[$i].written' <<<"$ANALYSIS")
  DOC=$(jq -r --argjson i "$INDEX" '.docs[$i].current // .docs[$i].written' <<<"$ANALYSIS")
  INDEX=$((INDEX + 1))
  # 本輪寫進去的有提案字眼,而且檔案現在仍有(改掉了就放行)
  grep -qE "$R3_PROPOSE_RE" <<<"$WRITTEN" || continue
  grep -qE "$R3_PROPOSE_RE" <<<"$DOC" || continue
  # escape 與出處:本輪寫進去的要有,檔案現在也要還有(文件別處原有的不算;理由見上方 (4))
  DOC_HEAD=$(sed -n '1,3p' <<<"$DOC")
  grep -qE "$R3_ESCAPE_RE" <<<"$DOC_HEAD" && grep -qE "$R3_ESCAPE_RE" <<<"$WRITTEN" && continue
  r3_has_cite "$WRITTEN" && r3_has_cite "$DOC" && continue
  FLAGGED="${FLAGGED}    • ${DOC_PATH}"$'\n'
done
[ -z "$FLAGGED" ] && exit 0
{
  echo "🚨 PROPOSE-PRE-VERIFY BLOCKER(M18 Q0):這一輪寫進規劃 / 報告 / 交接文件的內容有「請 user 拍板」類字眼,這一輪寫進去的內容裡卻沒有任何可查證的出處(文件別處原有的出處不算):"
  printf '%s' "$FLAGGED"
  echo "  要 user 決定之前,先 grep 全庫、讀相關 spec.md 與實際用法,確認問題真的存在,再用 Edit 把這次提案的證據寫進同一份文件:"
  echo "    檔名加行號(例如 .tsx / .md / .mjs 檔後接冒號與行號)、L 加行號、line 加行號,或官方文件網址;"
  echo "    用反引號包起來的 .tsx / .ts / .css / .md 路徑也算。"
  echo "  查過之後發現不是真問題 → 把提案拿掉。已查證但文件不適合放出處 → 在該檔前 3 行加上"
  echo "    <!-- @propose-pre-verified: 查過什麼、為何不附出處 -->(冒號後理由必填;要在這一輪整行寫進去,"
  echo "    檔頭已經有的話用 Edit 整行重寫 —— 舊的 escape 不涵蓋新加的提案)。"
  echo "  錨例:2026-05-18 Sheet / inline-action / SurfaceBody 三題沒查就丟給 user 拍板,grep 之後 0 個真問題。"
  echo "  SSOT:packages/design-system/ds-canonical/skills/propose-options/SKILL.md 的 Q0 段。"
} >&2
exit 2
}

_CAPTURE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/check-propose-discipline.XXXXXX") || {
  printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: output capture unavailable\n' >&2
  exit 70
}
trap 'rm -rf -- "$_CAPTURE_DIR"' EXIT
_CONTEXTS=""
# 輸入先落檔再餵給每條規則,不用 `printf | rule`(2026-09-25):規則若沒讀 stdin 就先退出
# (例如非 Claude provider 時 r2 直接 exit 0),寫端 printf 會收到 SIGPIPE,pipefail 讓整條管線回 141,
# 被誤判成「規則回傳未定義 exit code」—— 時序決定紅不紅,CI Linux 偶發紅過(21ca94e2)。
# 規則一定要跑在子殼層 `( "$_rule" )`:規則裡的 `exit` 只能結束它自己;原本是管線替它開了子殼層,
# 拿掉管線卻不補子殼層,r1 的 `exit 0` 會直接結束整支 hook,後面的規則全部沒跑(本次改法第一版就犯了)。
_INPUT_FILE="$_CAPTURE_DIR/input"
printf '%s' "$INPUT" >"$_INPUT_FILE"
_RULE_INDEX=0

for _rule in r1_plain_chinese r2_cite_required r3_planning_doc_cite; do
  _RULE_INDEX=$((_RULE_INDEX + 1))
  _stdout="$_CAPTURE_DIR/$_RULE_INDEX.stdout"
  _stderr="$_CAPTURE_DIR/$_RULE_INDEX.stderr"
  ( "$_rule" ) <"$_INPUT_FILE" >"$_stdout" 2>"$_stderr"
  _rc=$?
  case "$_rc" in
    0)
      if [ -s "$_stderr" ]; then
        printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: rule %s rc0 產生 raw stderr\n' \
          "$_rule" >&2
        exit 70
      fi
      if [ -s "$_stdout" ]; then
        if ! jq -e -s '
          length == 1
          and (.[0] |
            type == "object"
            and keys == ["governanceContext"]
            and (.governanceContext |
              type == "object"
              and (keys | sort) == ["hookEventName", "message"]
              and .hookEventName == "Stop"
              and (.message | type == "string" and length > 0)
            )
          )
        ' "$_stdout" >/dev/null 2>&1; then
          printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: rule %s 輸出 malformed context\n' \
            "$_rule" >&2
          exit 70
        fi
        _ctx=$(jq -er '.governanceContext.message' "$_stdout") || {
          printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: rule %s context 無法解碼\n' \
            "$_rule" >&2
          exit 70
        }
        if [ -n "$_CONTEXTS" ]; then
          _CONTEXTS="${_CONTEXTS}"$'\n\n────────\n\n'"$_ctx"
        else
          _CONTEXTS="$_ctx"
        fi
      fi
      ;;
    2)
      if [ ! -s "$_stdout" ] && [ -s "$_stderr" ] \
        && ! grep -qF 'GOVERNANCE_INTEGRITY:' "$_stderr"; then
        cat "$_stderr" >&2
        exit 2
      fi
      printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: rule %s rc2 必須是 stderr-only nonempty policy blocker\n' \
        "$_rule" >&2
      exit 70
      ;;
    70)
      if [ ! -s "$_stdout" ] && [ -s "$_stderr" ] \
        && grep -qF 'GOVERNANCE_INTEGRITY:' "$_stderr"; then
        cat "$_stderr" >&2
      else
        printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: rule %s rc70 必須是 stderr-only marker\n' \
          "$_rule" >&2
      fi
      exit 70
      ;;
    *)
      printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: rule %s 回傳未定義 exit code %s\n' \
        "$_rule" "$_rc" >&2
      exit 70
      ;;
  esac
done

if [ -n "$_CONTEXTS" ]; then
  _encoded=$(printf '%s' "$_CONTEXTS" | jq -Rs .) || {
    printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: combined context 無法編碼\n' >&2
    exit 70
  }
  printf '{"governanceContext":{"hookEventName":"Stop","message":%s}}\n' "$_encoded"
fi
exit 0

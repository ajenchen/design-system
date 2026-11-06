#!/bin/bash
# check_propose_discipline.sh — Stop ×2 — propose 紀律(中文人話 + file:line cite;SSOT memory/feedback_propose_discipline.md)
#
# 2026-06-11 prune merge(user 拍板「照你建議做」;59→51 headroom):
# #   r1_plain_chinese = 原 check_propose_plain_chinese.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
#   r2_cite_required = 原 check_propose_cite_required.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
# 原檔 → packages/design-system/ds-canonical/hooks/retired/2026-06-11-prune-merge/
# 各規則跑在 pipeline 子 shell:規則內 exit 不中斷其他規則;任一 exit 2 → 整體 exit 2。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null) || {
  printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: 無法讀取 canonical input\n' >&2
  exit 70
}
if ! printf '%s' "$INPUT" | jq -e 'type == "object"' >/dev/null 2>&1; then
  printf '🚨 GOVERNANCE_INTEGRITY: PROPOSE DISCIPLINE FAILURE: invalid input envelope\n' >&2
  exit 70
fi

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
[ -z "$LAST_REPLY" ] && exit 0

# Escape clause
if grep -q 'propose-cite-skip' <<<"$LAST_REPLY"; then
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

# Detect cite patterns.
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
NON_SOURCE_URL='https?://[^/[:space:]]*(\.netlify\.app|localhost|127\.0\.0\.1|0\.0\.0\.0|ajenchen\.github\.io)[^[:space:]]*'
CITE_CANDIDATES=$(sed -E "s#${NON_SOURCE_URL}#(deploy-preview)#g" <<<"$LAST_REPLY")
HAS_CITE=""
if grep -qE '\.(spec\.md|md|css|tsx|ts|mjs|cjs|js|json|sh|ya?ml|toml):[0-9]+|#L[0-9]+|line[[:space:]]+[0-9]+|L[0-9]+-[0-9]+|L[0-9]+|https?://[^[:space:]]+' <<<"$CITE_CANDIDATES"; then
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

for _rule in r1_plain_chinese r2_cite_required; do
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

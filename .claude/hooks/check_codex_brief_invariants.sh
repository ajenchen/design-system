#!/bin/bash
# Codex brief invariants enforcement(2026-05-23 永久 per user verbatim「codex 跑的稽核流程理應要跟你跑的深度稽核流程是一模一樣 SSOT 的不能偏移」)
#
# PreToolUse(Bash)hook:catch codex exec / cat ... | codex exec / 任何 codex CLI invocation
# Scan codex brief content for 3 mandatory invariants(per feedback_codex_brief_invariants_2026_05_23.md):
#   1. 全盤閱讀(全部 source 列舉 or 「DS-wide」「全盤閱讀」「全 N files」 keyword)
#   2. Triple-verify(「triple-verify」/「三重驗證」/「grep + Read + canonical exception」 keyword)
#   3. 禁抽樣(「禁抽樣」/「禁 sample」/「NO-SAMPLE」/「DS-wide ALL files」 keyword)
#
# 缺任一 → exit 2 BLOCKER(stop codex 啟動)。Escape:brief 含 `// @codex-brief-invariant-skip: <rationale>`(極罕見)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)

case "${TOOL:-}" in
  Bash) ;;
  *) exit 0 ;;
esac

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)

# Only fire on codex CLI invocations
if ! echo "$CMD" | grep -qE 'codex[[:space:]]+(exec|review)|node_modules/.bin/codex'; then
  exit 0
fi

# Extract brief content — handles `cat /tmp/file | codex exec` OR `codex exec "inline"` patterns
BRIEF_CONTENT=""
if echo "$CMD" | grep -qE 'cat[[:space:]]+[^|]+\|[[:space:]]*[^|]*codex'; then
  # cat-pipe pattern — try reading the cat'd file
  BRIEF_FILE=$(echo "$CMD" | grep -oE 'cat[[:space:]]+[^[:space:]|]+' | head -1 | sed 's/^cat[[:space:]]*//')
  if [ -n "$BRIEF_FILE" ] && [ -f "$BRIEF_FILE" ]; then
    BRIEF_CONTENT=$(cat "$BRIEF_FILE" 2>/dev/null)
  fi
fi
# Inline prompt pattern fallback — grab everything after `codex exec` quotes
if [ -z "$BRIEF_CONTENT" ]; then
  BRIEF_CONTENT="$CMD"
fi

# Escape clause
if echo "$BRIEF_CONTENT" | grep -qE '@codex-brief-invariant-skip:'; then
  exit 0
fi

# Detect 3 invariants
MISSING=""

# 1. 全盤閱讀 invariant
if ! echo "$BRIEF_CONTENT" | grep -qiE '全盤閱讀|全部 source|DS-wide ALL|read all files|全部.*spec\.md|全[[:space:]]*[0-9]+[[:space:]]*spec|全[[:space:]]*[0-9]+[[:space:]]*stories|全[[:space:]]*[0-9]+[[:space:]]*components'; then
  MISSING="${MISSING}  • 1️⃣ 全盤閱讀 invariant 缺(「全盤閱讀全部 source」/「DS-wide ALL files」/「全 N spec.md」keyword)\n"
fi

# 2. Triple-verify invariant
if ! echo "$BRIEF_CONTENT" | grep -qiE 'triple-verify|三重驗證|grep.*Read.*canonical|grep DS-wide.*Read.*exception|前必先 inline 跑|再三確認問題|無病呻吟'; then
  MISSING="${MISSING}  • 2️⃣ Triple-verify invariant 缺(「triple-verify」/「三重驗證」/「禁無病呻吟」keyword)\n"
fi

# 3. 禁抽樣 invariant
if ! echo "$BRIEF_CONTENT" | grep -qiE '禁抽樣|禁 sample|NO-SAMPLE|不抽樣|sub-agent.*sampled.*reject|sample.*reject|spot-check.*reject|不應該抽樣'; then
  MISSING="${MISSING}  • 3️⃣ 禁抽樣 invariant 缺(「禁抽樣」/「NO-SAMPLE」/「sample = reject」keyword)\n"
fi

if [ -n "$MISSING" ]; then
  printf '🚨 CODEX BRIEF MISSING INVARIANTS BLOCKER(2026-05-23 user verbatim:「codex 會跑的稽核流程理應要跟你跑的深度稽核流程是一模一樣 SSOT 的不能偏移」):\n' >&2
  printf '\n  Brief 缺以下 invariant:\n' >&2
  printf '%b' "$MISSING" >&2
  printf '\n  Per memory/feedback_codex_brief_invariants_2026_05_23.md + codex-collab/references/brief-template.md:\n' >&2
  printf '  必含三 invariant 明文(verbatim):\n' >&2
  printf '    1. 全盤閱讀全部 source(列舉 N files / DS-wide / 禁憑記憶)\n' >&2
  printf '    2. Triple-verify per finding(grep + Read + canonical exception check)\n' >&2
  printf '    3. 禁抽樣(DS-wide ALL files / sub-agent sample admission = reject)\n' >&2
  printf '\n  修方向:brief content 補上三 invariant 文字。\n' >&2
  printf '  Escape(極罕見): brief 含 `// @codex-brief-invariant-skip: <rationale>`\n' >&2
  exit 2
fi

exit 0

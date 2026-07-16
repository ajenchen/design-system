#!/bin/bash
# Codex brief invariants enforcement(2026-05-23 永久 per user verbatim「codex 跑的稽核流程理應要跟你跑的深度稽核流程是一模一樣 SSOT 的不能偏移」)
#
# PreToolUse(Bash)hook:catch codex exec / cat ... | codex exec / 任何 codex CLI invocation
# Scan codex brief content for 7 mandatory invariants(per feedback_codex_brief_invariants_2026_05_23.md
# + 2026-07-10 user directive「codex 做的任務 / 資訊 / 閱讀 / 判斷標準都要跟 Claude 一模一樣 SSOT」):
#   1. 全盤閱讀(全部 source 列舉 or 「DS-wide」「全盤閱讀」「全 N files」 keyword)
#   2. Triple-verify(「triple-verify」/「三重驗證」/「grep + Read + canonical exception」 keyword)
#   3. 禁抽樣(「禁抽樣」/「禁 sample」/「NO-SAMPLE」/「DS-wide ALL files」 keyword)
#   4. 禁列檔(「禁列檔」/「禁 rg --files」/「只讀 N file」/「直接出 verdict」 keyword)
#   5. 輸入對等(閱讀清單逐字鏡射 A.0:含 meta-patterns rules + memory MEMORY.md index 錨點)
#   6. 判準對等(brief 給 codex audit-prompts.md 每-dim rubric + 逐 dim 套用)
#   7. A.1b 對等(brief 要求 codex 做 per-component claim-vs-code 對抗驗證 = Claude A.1b 鏡像)
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

# Only fire on codex CLI invocations actually executing a brief
# (must be followed by `exec` or `review` subcommand; bare path mention like
# `ls node_modules/.bin/codex` or `which codex` is discovery, not a brief)
if ! echo "$CMD" | grep -qE '(^|[[:space:]/])codex[[:space:]]+(exec|review)\b'; then
  exit 0
fi

# Discovery / introspection flags are not briefs — skip
if echo "$CMD" | grep -qE '(^|[[:space:]])-{1,2}(help|h|version|V)\b'; then
  exit 0
fi

# Extract brief content — handles multiple invocation patterns:
#   1. `cat /tmp/file | codex exec`          (cat-pipe → file)
#   2. `codex exec "$(cat /tmp/file)"`       (arg-substitution → file)
#   3. `codex exec < /tmp/file`              (stdin redirect → file)
#   4. `codex exec "inline brief..."`        (inline arg → CMD itself)
BRIEF_CONTENT=""
BRIEF_FILE=""

# Pattern 1: cat-pipe
if echo "$CMD" | grep -qE 'cat[[:space:]]+[^|]+\|[[:space:]]*[^|]*codex'; then
  BRIEF_FILE=$(echo "$CMD" | grep -oE 'cat[[:space:]]+[^[:space:]|]+' | head -1 | sed 's/^cat[[:space:]]*//')
fi

# Pattern 2: arg-substitution `"$(cat /path)"` or `$(cat /path)`
if [ -z "$BRIEF_FILE" ] && echo "$CMD" | grep -qE '\$\([[:space:]]*cat[[:space:]]+[^)]+\)'; then
  BRIEF_FILE=$(echo "$CMD" | grep -oE '\$\([[:space:]]*cat[[:space:]]+[^)]+\)' | head -1 | sed -E 's/^\$\([[:space:]]*cat[[:space:]]+//; s/[[:space:]]*\)$//')
fi

# Pattern 3: stdin redirect `< /path`
if [ -z "$BRIEF_FILE" ] && echo "$CMD" | grep -qE 'codex[[:space:]]+exec[[:space:]].*<[[:space:]]*[^[:space:]<>|&]+'; then
  BRIEF_FILE=$(echo "$CMD" | grep -oE '<[[:space:]]*[^[:space:]<>|&]+' | head -1 | sed -E 's/^<[[:space:]]*//')
fi

if [ -n "$BRIEF_FILE" ] && [ -f "$BRIEF_FILE" ]; then
  BRIEF_CONTENT=$(cat "$BRIEF_FILE" 2>/dev/null)
fi

# Pattern 4 fallback — inline prompt (or unparseable cmd): scan CMD itself
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

# 4. 禁列檔 invariant(2026-05-27 codify per codex v1/v2 token-burn anchor)
# Codex CLI 2 次連續 invocation 都跑 `rg --files` / `find` 列 1300+ files 燒光 reasoning。
# Brief 必含 directive 限制 codex 探索範圍 — 「只讀 N 列檔 + 禁列檔 / 禁 rg --files / 禁 find 全 repo」
if ! echo "$BRIEF_CONTENT" | grep -qiE '禁列檔|禁 rg --files|禁 find 全|只讀.*[0-9]+.*file|限定.*file|targeted rg|不需報告探索|直接出'; then
  MISSING="${MISSING}  • 4️⃣ 禁列檔 invariant 缺(「禁列檔」/「禁 rg --files」/「只讀 N file」/「直接出 verdict」keyword)— per 2026-05-27 codex token-burn 2× anchor\n"
fi

# 5️⃣ 輸入對等(2026-07-10 user directive「codex 做的任務、擁有的資訊、閱讀的資訊要跟你一模一樣」):
# 閱讀清單必逐字鏡射 A.0(泛 glob ≠ 對等;至少含 meta-patterns rules + memory index 兩錨點,
# 具名鏡射時自然存在)。
if ! echo "$BRIEF_CONTENT" | grep -qi 'meta-patterns' || ! echo "$BRIEF_CONTENT" | grep -qiE 'MEMORY\.md|memory'; then
  MISSING="${MISSING}  • 5️⃣ 輸入對等 invariant 缺(閱讀清單必逐字鏡射 A.0 六項:含 .claude/rules/meta-patterns.md 等具名 rules + memory MEMORY.md index;泛 glob 不算)\n"
fi

# 6️⃣ 判準對等(2026-07-10 user directive「兩邊都用同樣的完美標準去稽核」):brief 必給 codex
# 我用的每-dim 判準 rubric(audit-prompts.md,SKILL.md:257「Use prompts in audit-prompts.md」=
# 我的 dim sub-agent 判準 SSOT),並要求逐 dim 套用 —— 只給 dim 編號 = codex 憑自己理解判 =
# 判斷標準不對稱(user 錨:「我基於治理判、codex 可能沒有」)。
if ! echo "$BRIEF_CONTENT" | grep -qi 'audit-prompts'; then
  # 2026-07-16 fix:原文用 raw backtick 包路徑在雙引號字串內 = command substitution 每 fire 執行該路徑
  # (stderr 噪音 + 訊息路徑消失)→ 改 \` escape。
  MISSING="${MISSING}  • 6️⃣ 判準對等 invariant 缺(brief 必給 codex \`design-system-audit/references/audit-prompts.md\` 每-dim rubric + 要求逐 dim 套用同一判準;只給 dim 編號 = codex 憑己意判 = 標準不對稱)\n"
fi

# 7️⃣ A.1b 對等(2026-07-10 user「所有稽核任務都應對等」全盤盤點抓):brief 必要求 codex 做
# A.1b(per-component claim-vs-code 對抗驗證,讀每元件 .tsx + wrap lib 逐句驗宣稱)—— Claude
# 最高產出 pass(2026-05-30 抓 403 findings),漏了 = codex 少做一整趟 = 任務不對等。
if ! echo "$BRIEF_CONTENT" | grep -qiE 'A\.1b|claim-vs-code|per-component.*(對抗|逐句|verif)'; then
  MISSING="${MISSING}  • 7️⃣ A.1b 對等 invariant 缺(brief 必要求 codex 做 per-component claim-vs-code 對抗驗證 = Claude SKILL A.1b 鏡像;漏 = 少做最高產出 pass = 任務不對等)\n"
fi

if [ -n "$MISSING" ]; then
  printf '🚨 CODEX BRIEF MISSING INVARIANTS BLOCKER(2026-05-23 user verbatim:「codex 會跑的稽核流程理應要跟你跑的深度稽核流程是一模一樣 SSOT 的不能偏移」):\n' >&2
  printf '\n  Brief 缺以下 invariant:\n' >&2
  printf '%b' "$MISSING" >&2
  printf '\n  Per memory/feedback_codex_brief_invariants_2026_05_23.md + codex-collab/references/brief-template.md:\n' >&2
  printf '  必含七 invariant 明文(verbatim;2026-07-16 同步實數 — 原訊息只列 3,跟上方檢查 7 條 drift):\n' >&2
  printf '    1. 全盤閱讀全部 source(列舉 N files / DS-wide / 禁憑記憶)\n' >&2
  printf '    2. Triple-verify per finding(grep + Read + canonical exception check)\n' >&2
  printf '    3. 禁抽樣(DS-wide ALL files / sub-agent sample admission = reject)\n' >&2
  printf '    4. 禁列檔(禁 rg --files / find 全 repo;只讀 brief 列的 file,直接出 verdict)\n' >&2
  printf '    5. 輸入對等(閱讀清單具名鏡射 A.0:meta-patterns.md rules + memory MEMORY.md index)\n' >&2
  printf '    6. 判準對等(附 design-system-audit/references/audit-prompts.md 每-dim rubric,逐 dim 套用)\n' >&2
  printf '    7. A.1b 對等(per-component claim-vs-code 對抗驗證 = Claude A.1b 鏡像)\n' >&2
  printf '\n  修方向:brief content 補上缺的 invariant 文字(母版 = codex-collab/references/brief-template.md「七 invariant」段)。\n' >&2
  printf '  Escape(極罕見): brief 含 `// @codex-brief-invariant-skip: <rationale>`\n' >&2
  exit 2
fi

exit 0

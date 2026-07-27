#!/bin/bash
# Peer brief invariants enforcement(legacy filename retained for compatibility).
#
# PreToolUse(Bash) hook:catch the registry-resolved independent peer CLI invocation.
# Scan the peer brief content for 7 mandatory invariants(the author and independent peer must
# receive the same task, evidence inventory, and decision rubric):
#   1. 全盤閱讀(全部 source 列舉 or 「DS-wide」「全盤閱讀」「全 N files」 keyword)
#   2. Triple-verify(「triple-verify」/「三重驗證」/「grep + Read + canonical exception」 keyword)
#   3. 禁抽樣(「禁抽樣」/「禁 sample」/「NO-SAMPLE」/「DS-wide ALL files」 keyword)
#   4. 禁列檔(「禁列檔」/「禁 rg --files」/「只讀 N file」/「直接出 verdict」 keyword)
#   5. 輸入對等(閱讀清單逐字鏡射 A.0:含 meta-patterns rules + memory MEMORY.md index 錨點)
#   6. 判準對等(brief 給 peer audit-prompts.md 每-dim rubric + 逐 dim 套用)
#   7. A.1b 對等(brief 要求 peer 做 per-component claim-vs-code 對抗驗證 = author A.1b 鏡像)
#
# 缺任一 → exit 2 BLOCKER(stop peer 啟動)。Escape:brief 含 `// @peer-brief-invariant-skip: <rationale>`(極罕見)。

fail_integrity() {
  printf 'GOVERNANCE_INTEGRITY: peer brief enforcement %s\n' "$1" >&2
  exit 70
}

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_provider_paths.sh" 2>/dev/null \
  || fail_integrity "canonical provider resolver unavailable"

set -uo pipefail

INPUT=$(cat 2>/dev/null) || fail_integrity "could not read hook input"
if ! printf '%s' "$INPUT" | jq -e '
  type == "object"
  and (.tool_name | type == "string")
  and (.tool_input | type == "object")
' >/dev/null 2>&1; then
  fail_integrity "input envelope is invalid"
fi
TOOL=$(jq -r '.tool_name // ""' <<<"$INPUT" 2>/dev/null)
EVENT=$(jq -r '.hook_event_name // ""' <<<"$INPUT" 2>/dev/null)

SELF_PROVIDER="${GOVERNANCE_SELF_PROVIDER:-${GOVERNANCE_PROVIDER:-}}"
PEER_PROVIDER="${GOVERNANCE_PEER_PROVIDER:-}"
PEER_DISPLAY_NAME="${GOVERNANCE_PEER_DISPLAY_NAME:-${PEER_PROVIDER:-independent peer}}"
PEER_CLI="${GOVERNANCE_PEER_CLI:-}"
PEER_MARKERS_JSON="${GOVERNANCE_PEER_BRIEF_MARKERS_JSON:-[]}"

# These values are injected from the validated provider registry. Direct execution without a
# complete context is blocked instead of silently applying a one-way provider assumption.
if ! printf '%s' "$SELF_PROVIDER" | grep -qE '^[a-z][a-z0-9-]*$' \
  || ! printf '%s' "$PEER_PROVIDER" | grep -qE '^[a-z][a-z0-9-]*$' \
  || ! printf '%s' "$PEER_CLI" | grep -qE '^[a-z][a-z0-9-]*$'; then
  fail_integrity "registry-resolved self/peer CLI context is missing or invalid"
fi
CANONICAL_RULE_REL="$(governance_canonical_relative_root rules 2>/dev/null)" \
  || fail_integrity "canonical rule root is unavailable"
CANONICAL_SKILL_REL="$(governance_canonical_relative_root skills 2>/dev/null)" \
  || fail_integrity "canonical skill root is unavailable"

PEER_MARKER_RE=$(
  node -- "$(dirname "$0")/lib/provider-marker-regex.mjs" \
    peer-invocation "$PEER_MARKERS_JSON" 2>/dev/null
) || {
  fail_integrity "registry-resolved peer invocation markers are missing or invalid"
}

case "${TOOL:-}" in
  Bash) ;;
  *) exit 0 ;;
esac

CMD=$(jq -r '.tool_input.command // ""' <<<"$INPUT" 2>/dev/null)

# Only fire on peer CLI invocations actually executing a brief
# (must be followed by `exec` or `review` subcommand; bare path mention like
# `ls node_modules/.bin/<peer>` or `which <peer>` is discovery, not a brief).
if ! grep -qE "(^|[[:space:]/])${PEER_CLI}[[:space:]]+(${PEER_MARKER_RE})([[:space:]]|$)" <<<"$CMD"; then
  exit 0
fi

# Discovery / introspection flags are not briefs — skip
if grep -qE '(^|[[:space:]])-{1,2}(help|h|version|V)\b' <<<"$CMD"; then
  exit 0
fi

# Extract brief content — handles multiple invocation patterns:
#   1. `cat /tmp/file | <peer> <marker>`          (cat-pipe → file)
#   2. `<peer> <marker> "$(cat /tmp/file)"`       (arg-substitution → file)
#   3. `<peer> <marker> < /tmp/file`              (stdin redirect → file)
#   4. `<peer> <marker> "inline brief..."`        (inline arg → CMD itself)
BRIEF_CONTENT=""
BRIEF_FILE=""

# Pattern 1: cat-pipe
if grep -qE "cat[[:space:]]+[^|]+\\|[[:space:]]*[^|]*${PEER_CLI}" <<<"$CMD"; then
  BRIEF_FILE=$(grep -m 1 -oE 'cat[[:space:]]+[^[:space:]|]+' <<<"$CMD" | sed 's/^cat[[:space:]]*//')
fi

# Pattern 2: arg-substitution `"$(cat /path)"` or `$(cat /path)`
if [ -z "$BRIEF_FILE" ] && grep -qE '\$\([[:space:]]*cat[[:space:]]+[^)]+\)' <<<"$CMD"; then
  BRIEF_FILE=$(grep -m 1 -oE '\$\([[:space:]]*cat[[:space:]]+[^)]+\)' <<<"$CMD" | sed -E 's/^\$\([[:space:]]*cat[[:space:]]+//; s/[[:space:]]*\)$//')
fi

# Pattern 3: stdin redirect `< /path`
if [ -z "$BRIEF_FILE" ] && grep -qE "(^|[[:space:]/])${PEER_CLI}[[:space:]]+(${PEER_MARKER_RE})([[:space:]]|$).*<[[:space:]]*[^[:space:]<>|&]+" <<<"$CMD"; then
  BRIEF_FILE=$(grep -m 1 -oE '<[[:space:]]*[^[:space:]<>|&]+' <<<"$CMD" | sed -E 's/^<[[:space:]]*//')
fi

if [ -n "$BRIEF_FILE" ] && [ -f "$BRIEF_FILE" ]; then
  BRIEF_CONTENT=$(cat "$BRIEF_FILE" 2>/dev/null) \
    || fail_integrity "could not read the resolved brief file"
fi

# Pattern 4 fallback — inline prompt (or unparseable cmd): scan CMD itself
if [ -z "$BRIEF_CONTENT" ]; then
  BRIEF_CONTENT="$CMD"
fi

# Escape clause. The neutral marker is canonical;the old Codex marker remains a
# provider-gated compatibility alias so existing reviewed briefs do not break.
if grep -qE '@peer-brief-invariant-skip:' <<<"$BRIEF_CONTENT" \
  || { [ "$PEER_PROVIDER" = "codex" ] && grep -qE '@codex-brief-invariant-skip:' <<<"$BRIEF_CONTENT"; }; then
  exit 0
fi

# Detect 3 invariants
MISSING=""

# 1. 全盤閱讀 invariant
if ! grep -qiE '全盤閱讀|全部 source|DS-wide ALL|read all files|全部.*spec\.md|全[[:space:]]*[0-9]+[[:space:]]*spec|全[[:space:]]*[0-9]+[[:space:]]*stories|全[[:space:]]*[0-9]+[[:space:]]*components' <<<"$BRIEF_CONTENT"; then
  MISSING="${MISSING}  • 1️⃣ 全盤閱讀 invariant 缺(「全盤閱讀全部 source」/「DS-wide ALL files」/「全 N spec.md」keyword)\n"
fi

# 2. Triple-verify invariant
if ! grep -qiE 'triple-verify|三重驗證|grep.*Read.*canonical|grep DS-wide.*Read.*exception|前必先 inline 跑|再三確認問題|無病呻吟' <<<"$BRIEF_CONTENT"; then
  MISSING="${MISSING}  • 2️⃣ Triple-verify invariant 缺(「triple-verify」/「三重驗證」/「禁無病呻吟」keyword)\n"
fi

# 3. 禁抽樣 invariant
if ! grep -qiE '禁抽樣|禁 sample|NO-SAMPLE|不抽樣|sub-agent.*sampled.*reject|sample.*reject|spot-check.*reject|不應該抽樣' <<<"$BRIEF_CONTENT"; then
  MISSING="${MISSING}  • 3️⃣ 禁抽樣 invariant 缺(「禁抽樣」/「NO-SAMPLE」/「sample = reject」keyword)\n"
fi

# 4. 禁列檔 invariant(2026-05-27 token-burn anchor)
# Peer CLI 不得用全庫無界列檔取代 evidence-complete brief。
# Brief 必含 directive 限制 peer 探索範圍 — 「只讀 N 列檔 + 禁列檔 / 禁 rg --files / 禁 find 全 repo」
if ! grep -qiE '禁列檔|禁 rg --files|禁 find 全|只讀.*[0-9]+.*file|限定.*file|targeted rg|不需報告探索|直接出' <<<"$BRIEF_CONTENT"; then
  MISSING="${MISSING}  • 4️⃣ 禁列檔 invariant 缺(「禁列檔」/「禁 rg --files」/「只讀 N file」/「直接出 verdict」keyword)— per 2026-05-27 token-burn anchor\n"
fi

# 5️⃣ 輸入對等:author 與 peer 的任務、資訊、閱讀清單要一致。
# 閱讀清單必逐字鏡射 A.0(泛 glob ≠ 對等;至少含 meta-patterns rules + memory index 兩錨點,
# 具名鏡射時自然存在)。
if ! grep -qF "${CANONICAL_RULE_REL}/meta-patterns.md" <<<"$BRIEF_CONTENT" \
  || ! grep -qF 'governance/memory/MEMORY.md' <<<"$BRIEF_CONTENT"; then
  MISSING="${MISSING}  • 5️⃣ 輸入對等 invariant 缺(閱讀清單必逐字鏡射 A.0 六項:含 ${CANONICAL_RULE_REL}/meta-patterns.md 等具名 rules + governance/memory/MEMORY.md index;泛 glob 不算)\n"
fi

# 6️⃣ 判準對等(2026-07-10 user directive「兩邊都用同樣的完美標準去稽核」):brief 必給 peer
# 我用的每-dim 判準 rubric(audit-prompts.md,SKILL.md:257「Use prompts in audit-prompts.md」=
# 我的 dim sub-agent 判準 SSOT),並要求逐 dim 套用 —— 只給 dim 編號 = peer 憑自己理解判 =
# 否則 peer 會在沒有同一治理資訊時憑自己理解判斷。
if ! grep -qF "${CANONICAL_SKILL_REL}/design-system-audit/references/audit-prompts.md" <<<"$BRIEF_CONTENT"; then
  # 2026-07-16 fix:原文用 raw backtick 包路徑在雙引號字串內 = command substitution 每 fire 執行該路徑
  # (stderr 噪音 + 訊息路徑消失)→ 改 \` escape。
  MISSING="${MISSING}  • 6️⃣ 判準對等 invariant 缺(brief 必給 peer \`${CANONICAL_SKILL_REL}/design-system-audit/references/audit-prompts.md\` 每-dim rubric + 要求逐 dim 套用同一判準;只給 dim 編號 = peer 憑己意判 = 標準不對稱)\n"
fi

# 7️⃣ A.1b 對等(2026-07-10 user「所有稽核任務都應對等」全盤盤點抓):brief 必要求 peer 做
# A.1b(per-component claim-vs-code 對抗驗證,讀每元件 .tsx + wrap lib 逐句驗宣稱)—— author
# 最高產出 pass(2026-05-30 抓 403 findings),漏了 = peer 少做一整趟 = 任務不對等。
if ! grep -qiE 'A\.1b|claim-vs-code|per-component.*(對抗|逐句|verif)' <<<"$BRIEF_CONTENT"; then
  MISSING="${MISSING}  • 7️⃣ A.1b 對等 invariant 缺(brief 必要求 peer 做 per-component claim-vs-code 對抗驗證 = author A.1b 鏡像;漏 = 少做最高產出 pass = 任務不對等)\n"
fi

if [ -n "$MISSING" ]; then
  printf '🚨 PEER BRIEF MISSING INVARIANTS BLOCKER(self=%s,peer=%s):\n' "$SELF_PROVIDER" "$PEER_PROVIDER" >&2
  printf '\n  Brief 缺以下 invariant:\n' >&2
  printf '%b' "$MISSING" >&2
  printf '\n  Per the provider-neutral peer brief canonical:\n' >&2
  printf '  必含七 invariant 明文(verbatim;2026-07-16 同步實數 — 原訊息只列 3,跟上方檢查 7 條 drift):\n' >&2
  printf '    1. 全盤閱讀全部 source(列舉 N files / DS-wide / 禁憑記憶)\n' >&2
  printf '    2. Triple-verify per finding(grep + Read + canonical exception check)\n' >&2
  printf '    3. 禁抽樣(DS-wide ALL files / sub-agent sample admission = reject)\n' >&2
  printf '    4. 禁列檔(禁 rg --files / find 全 repo;只讀 brief 列的 file,直接出 verdict)\n' >&2
  printf '    5. 輸入對等(閱讀清單具名鏡射 A.0:%s/meta-patterns.md + governance/memory/MEMORY.md)\n' "$CANONICAL_RULE_REL" >&2
  printf '    6. 判準對等(附 %s/design-system-audit/references/audit-prompts.md 每-dim rubric,逐 dim 套用)\n' "$CANONICAL_SKILL_REL" >&2
  printf '    7. A.1b 對等(per-component claim-vs-code 對抗驗證 = author A.1b 鏡像)\n' >&2
  printf '\n  修方向:brief content 補上缺的 invariant 文字(使用 provider-neutral brief template 的「七 invariant」段)。\n' >&2
  printf '  Peer runtime: %s (%s)\n' "$PEER_DISPLAY_NAME" "$PEER_CLI" >&2
  printf '  Escape(極罕見): brief 含 `// @peer-brief-invariant-skip: <rationale>`\n' >&2
  exit 2
fi

exit 0

#!/bin/bash
set -uo pipefail
# PreToolUse hook:阻止「沒 source citation 的 world-class benchmark claim」(對齊 M22)。
#
# Bug 史(2026-05-02):
#   AI 在 spec.md / tsx comment 寫「對齊 Ant Design」「Material 共識」「Polaris 派」
#   但沒附 source URL / screenshot / specific impl reference → 寫 code 時憑印象解讀,
#   常常**錯誤**(e.g., 我寫 Ant showTime range 是 2 calendar,實證是 1 calendar)。
#
# 機械化規則:
#   寫 spec / tsx 含 benchmark 關鍵詞 → 段裡**每一個**被提到的名稱都要有自己的 citation:
#     - Inline URL(該名稱自己的官網 / 原始碼位置,網域表見 lib/benchmark-citation-sources.json)
#     - GitHub issue / PR / source path(`#L42` line ref)
#     - Screenshot reference(`snapshots/...`,整段算數)
#     - Marked `@benchmark-unverified`(顯式撤回,整段算數;元件規格不准)
#
# Component-spec zero-debt rule:
#   `packages/design-system/src/components/**/*.spec.md` may not add any benchmark escape.
#   Claims must either carry direct inline evidence or be rewritten as internal product rationale.
#
# 其他 scope 允許 escape:
#   檔頭加 `// @benchmark-citation-allow: <reason>` 整檔豁免(legacy,M22 hook 上線過渡期)
#   檔頭加 `// @benchmark-unverified-blanket: <reason>` 整檔 M22 (d) 撤回(file-level unverified)
#
# 判定的唯一實作 = lib/benchmark-citation.mjs(關鍵字 / 網域 / 來源比對、段落切法、tsx 只看註解與 note=、
# md 跳過程式碼框、逐家比對、元件規格禁標記)。本 hook 只把「這次寫入的文字」交給它,
# 全樹檢查 scripts/benchmark-citation-invariant.mjs(CI 必跑)讀同一支 —— 兩邊不准各寫一份。
#
# 本 hook 只看這一次寫進去的字(寫入當下的加速器,不是信任邊界):沒被改到的舊段從來不經過這裡。
# 舊段的現況與「只准變少」的棘輪在全樹檢查:`node scripts/benchmark-citation-invariant.mjs --list`
# 列出每一段,已知清單在 scripts/benchmark-citation-baseline.json。
# (2026-11-16 A29 更正:此處原寫「元件規格在 beta.107 已清完 D9 證據債」—— 從沒有全樹量過;
#  2026-11-05 K8 盤點元件規格光原 13 名稱就有 237 段沒來源。A29 以逐家比對重量後元件規格清到 0,
#  元件規格不在棘輪裡,新的一段沒來源就紅。)

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

# Only spec.md / .tsx in design-system
case "$FILE_PATH" in
  */packages/design-system/src/**/*.spec.md|*/packages/design-system/src/**/*.tsx) ;;
  *) exit 0 ;;
esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")

grep -q '[^[:space:]]' <<<"$NEW_CONTENT" || exit 0

# 缺 node 或判定失敗 = 這道 M22 防線無法判 → 明確 BLOCK,不得靜默放行(fail-closed;cloud 前提宣告)。
if ! command -v node >/dev/null 2>&1; then
  echo '🚨 check_benchmark_citation: required interpreter node is unavailable — M22 citation gate cannot run(fail-closed)' >&2
  exit 2
fi
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
if ! RESULT=$(printf '%s' "$NEW_CONTENT" | node -- "$HOOK_DIR/lib/benchmark-citation.mjs" hook "$FILE_PATH"); then
  echo '🚨 check_benchmark_citation: shared judge lib/benchmark-citation.mjs failed — M22 citation gate cannot run(fail-closed)' >&2
  exit 2
fi
STATUS=$(jq -r '.status // ""' <<<"$RESULT" 2>/dev/null || echo "")

case "$STATUS" in
  out-of-scope|empty|allowlisted|clean)
    exit 0
    ;;
  forbidden-marker)
    cat >&2 <<EOF

┄┄┄┄ check_benchmark_citation — component spec benchmark evidence debt ┄┄┄┄

[P0 BLOCKER] ${FILE_PATH}
Component specs are a zero-debt scope: \`@benchmark-unverified\`,
\`@benchmark-unverified-blanket\`, and \`@benchmark-citation-allow\` are forbidden.

Keep the claim only with a direct inline primary-source citation that supports it;
otherwise remove the external comparison and state the DS-internal product rationale.
EOF
    exit 2
    ;;
  violations)
    VIOLATIONS=$(jq -r '.violations[] | "  - [\(if .kind == "partial" then "partial:段裡有別家的來源" else "no-source" end);缺:\(.missing | join(" / "))] \(.text | .[0:80])..."' <<<"$RESULT")
    cat >&2 <<EOF

┄┄┄┄ check_benchmark_citation — world-class benchmark claim 缺 source ┄┄┄┄

[P0 BLOCKER] ${FILE_PATH}
偵測到 benchmark claim 段缺 inline citation(段裡每一個被提到的名稱都要有自己的來源):
${VIOLATIONS}
M22 canonical(2026-05-02):**寫 spec / code 含「Ant / Material / Polaris / ...」claim 必附**:
  (a) Inline URL(該名稱自己的官網 / 原始碼位置;網域表 lib/benchmark-citation-sources.json)
  (b) GitHub source path + line ref(\`#L42\`)
  (c) Screenshot reference(\`snapshots/...\`)
  (d) 顯式撤回 \`@benchmark-unverified\`(元件規格不准)

歷史教訓(2026-05-02):
  - 我 claim「Ant showTime range = 2 calendars」憑印象 → 實證是 1 calendar,白忙一場
  - User: 「下次到底該如何完全避免你自己不斷說鬼話?」→ M22 + 本 hook

整檔豁免:
  - \`// @benchmark-citation-allow: <reason>\`(legacy 過渡期暫掛)
  - \`// @benchmark-unverified-blanket: <reason>\`(M22 (d) file-level 撤回)
EOF
    # P0 BLOCKER(2026-07-07 治理進化方向 2:對齊 user 2026-05-27 doctrine「SSOT canonical
    # 必 P0 BLOCKER 禁 P1 WARN」— escape 已備:@benchmark-unverified 逐句撤回 /
    # @benchmark-citation-allow / @benchmark-unverified-blanket 檔級,故升級不增誤殺)
    exit 2
    ;;
  *)
    echo "🚨 check_benchmark_citation: shared judge returned an unknown status(${STATUS:-<empty>})— fail-closed" >&2
    exit 2
    ;;
esac

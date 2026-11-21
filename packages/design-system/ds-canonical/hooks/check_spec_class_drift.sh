#!/bin/bash
# Audit Dim 53 — Code-to-spec reverse drift check(2026-05-17 ship per M31 codex 共識)。
#
# 背景:Phase 1 我把 FileViewer spec.md L103 寫成「h-14 硬寫 known drift」,
# 實際 code 已是 `h-[var(--chrome-header-height)]` — 反向 drift。本 hook 補。
#
# 擋 / 不擋(2026-11-21 起 P0 擋,knowledge-prune D4-02 / WP-15b;原本只回 governance context 提醒):
#   命中而且 spec 檔頭沒有豁免標記 → stderr 訊息 + exit 2;沒命中 → 靜默 exit 0。本 hook 已沒有「只提醒」的路徑。
#   outputMode = governance-context-or-block(registrations.json;audit-coverage-matrix 的 HOOK_RULE_ENFORCEMENT
#   第 53 列寫明「這支只擋」)。升擋前全樹重放(76 份 components/*/*.spec.md 逐檔整檔寫入)只有 FileViewer 一筆命中,
#   而且是下面第 (1) 點的量具誤判;修完重放 0 筆。
#
# 整檔豁免:spec 檔頭寫 `<!-- @spec-class-drift-allow: <reason> -->`(冒號後要有理由;markdown 裡的 `//`
#   不是註解,會直接顯示在文件上)。「檔頭」= 第一個 `## ` 標題之前(frontmatter + 標題 + 開場說明)。
#   看哪一份:Write 送的是寫完的整份檔 → 看它的檔頭;Edit / MultiEdit 只送改動的片段,看不出片段落在哪 →
#   看磁碟上原檔的檔頭(要豁免就先把標記寫進檔頭,那一筆本身沒命中就不會被擋)。
#   2026-11-21 前是「這次寫入的內容任一處有標記就整檔放行」:Edit 的片段沒有檔頭,寫在檔頭的豁免對 Edit 從不生效;
#   反過來,正文任何一處提到標記字串也會放行 —— 兩邊都跟本段原本寫的「檔頭」不一致,升擋時收成檔頭。
#
# 2026-11-21 升擋時一併修的三個量具問題(升擋前不修,誤判會直接變成擋錯):
#   (1) Pattern 1 判「tsx 含不含這個 class」的 regex 原本寫成 `["' ]h-24["' \]]` —— 後半段 bracket 實際是
#       `["' \]` 加一個字面 `]`,只有「h-24 後面接引號 / 空白 / 反斜線、再接 `]`」才算含。真實寫法
#       `'relative shrink-0 h-24 bg-surface-raised'`(file-viewer.tsx)判成「不含」→ 每一句「固定 h-NN」都誤報。
#       改成 class 邊界判斷:前一字不是英數 / `_` / `-`(`min-h-24` 不算)、後一字不是英數 / `_` / `.` / `-`(`h-240` 不算)。
#   (2) 訊息裡的 `「$phrase」` 在 macOS 的 bash 3.2 會把「」的第一個位元組當成變數名的一部分 → 變數讀成空、
#       印出亂碼(原檔頭說的「zsh 下 PHRASE UTF-8 變數 unbound」其實是這件事)。一律寫 `${phrase}`。
#   (3) MultiEdit 的 `edits[].new_string` 原本沒讀(只讀 new_string / content)→ MultiEdit 整個繞過。
#       改成與 check_field_family_invariants / check_pattern_invariants 同一種取法。
#
# 判的是「這次寫進去的文字」(NEW_CONTENT),不是 lib/_added_lines.sh 的「新增行」:那支 helper 要讀寫完的檔,
#   只能在 PostToolUse 用;本 hook 是 PreToolUse(寫入前擋),檔還沒寫,能看的只有寫入內容與磁碟原檔。
#   Write 送整份檔 → 檔內既有的「固定 h-NN」也會被判(整檔寫入 = 這次寫進去的全部內容,本來就該對)。

HOOK_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)" || {
  printf 'GOVERNANCE_INTEGRITY: spec-class hook directory is unavailable\n' >&2
  exit 70
}
source "$HOOK_DIR/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: canonical hook integrity helper is unavailable\n' >&2
  exit 70
}
source "$HOOK_DIR/_log-fire.sh" 2>/dev/null && log_hook_fire

# 不用 set -e / set -u(grep find-nothing 返回 1)
# 全部 defensive `|| true` + ${VAR:-default} 處理

governance_hook_load_input
governance_hook_require_commands grep head awk
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""') \
  || governance_hook_integrity_fail 'spec-class tool name could not be decoded'
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""') \
  || governance_hook_integrity_fail 'spec-class file path could not be decoded'

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

case "${FILE_PATH:-}" in
  */packages/design-system/src/components/*/[a-z-]*.spec.md) ;;
  *) exit 0 ;;
esac

NEW_CONTENT=$(printf '%s' "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
') || governance_hook_integrity_fail 'spec-class edit content could not be decoded'

# 整檔豁免只認檔頭(第一個 `## ` 標題之前)的標記,而且冒號後要有理由
#   讀完整份輸入再判(不提早 exit,上游的 printf 才不會收到 SIGPIPE)
spec_header_allows() {
  awk '
    /^## / { body = 1 }
    !body && /@spec-class-drift-allow:[ \t]*[^ \t>*-]/ { found = 1 }
    END { exit(found ? 0 : 1) }
  '
}
if [ "$TOOL" = "Write" ]; then
  WRITE_CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input.content // ""') \
    || governance_hook_integrity_fail 'spec-class write content could not be decoded'
  if printf '%s\n' "$WRITE_CONTENT" | spec_header_allows; then
    exit 0
  fi
elif [ -f "$FILE_PATH" ]; then
  if spec_header_allows < "$FILE_PATH"; then
    exit 0
  fi
fi

TSX_PATH="${FILE_PATH%.spec.md}.tsx"
if [ ! -f "$TSX_PATH" ]; then
  exit 0
fi

TSX_CONTENT=$(cat "$TSX_PATH" 2>/dev/null) \
  || governance_hook_integrity_fail "spec-class source could not be read:$TSX_PATH"
TSX_CONTENT="${TSX_CONTENT:-}"

WARNINGS=""

# Pattern 1: spec 寫「固定 h-NN」/「h-NN 寫死」/「h-NN 硬寫」keyword,而 tsx 完全不含這個 class
#   同一句只報一次(正式入口的 payload 可能把同一段文字同時放在 content 與 new_string)
PHRASES=$(printf '%s\n' "${NEW_CONTENT:-}" | grep -oE '(固定|寫死|硬寫|hardcode)[[:space:]]+h-[0-9]+' | awk '!seen[$0]++' || true)
if [ -n "$PHRASES" ]; then
  while IFS= read -r phrase; do
    [ -z "$phrase" ] && continue
    class=$(grep -m 1 -oE 'h-[0-9]+' <<<"$phrase")
    [ -z "$class" ] && continue
    if ! grep -qE "(^|[^A-Za-z0-9_-])${class}([^A-Za-z0-9_.-]|\$)" <<<"$TSX_CONTENT"; then
      WARNINGS="${WARNINGS}   • spec 寫「${phrase}」但 tsx 不含 ${class}(可能已 migrate to token)
"
    fi
  done <<EOF
$PHRASES
EOF
fi

# Pattern 2: tsx 已消費 --chrome-header-height,spec 仍寫「固定 h-NN」
HAS_TOKEN_TSX=$(grep -c 'chrome-header-height' <<<"$TSX_CONTENT" 2>/dev/null)
HAS_TOKEN_TSX="${HAS_TOKEN_TSX:-0}"
HAS_DRIFT_SPEC=$(grep -cE '(固定|寫死|硬寫)[[:space:]]+h-(12|14|16)' <<<"${NEW_CONTENT:-}" 2>/dev/null)
HAS_DRIFT_SPEC="${HAS_DRIFT_SPEC:-0}"
if [ "$HAS_TOKEN_TSX" -gt 0 ] 2>/dev/null && [ "$HAS_DRIFT_SPEC" -gt 0 ] 2>/dev/null; then
  WARNINGS="${WARNINGS}   • tsx 已消費 --chrome-header-height token,但 spec 仍寫「固定 h-NN」— 反向 drift
"
fi

if [ -n "$WARNINGS" ]; then
  printf '🚨 SPEC-CODE REVERSE DRIFT BLOCKER(audit Dim 53,P0):\n   Spec: %s\n   Code: %s\n%s  SSOT: packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md Group P Dim 53\n  修方向: 改 spec.md wording 對齊 code 實況\n  整檔豁免: spec 檔頭(第一個 `## ` 標題之前)加 <!-- @spec-class-drift-allow: <rationale> -->;Edit 看的是磁碟上原檔的檔頭,先把標記寫進去再改\n' \
    "$FILE_PATH" "$TSX_PATH" "$WARNINGS" >&2
  exit 2
fi

exit 0

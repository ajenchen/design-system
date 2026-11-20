#!/bin/bash
# 執法等級:擋(新增的 any / 超過 800 行的 tsx 又變長)+ 逐行 / 檔頭豁免 —— code-quality-audit SKILL 表列為 P0,兩條都是確定性判定(D4-02 審計 2026-11-18 起)。
#
# PostToolUse helper(由 post_edit_dispatcher.sh 依序呼叫):tsx / ts 寫入當下的兩條最快的 code quality 檢查。
#   1. `any`(`: any` / `as any` / `<any>` / `any[]` / `Record<X, any>`)沒有 `// any-allow: <理由>`(同一行或上一行)
#   2. tsx 超過 800 行(transition cap;budget 500)沒有檔頭豁免 `// code-quality-allow: file-size <理由>`(前 20 行內;
#      file-size 後面沒寫理由不算豁免 —— 2026-11-20 全樹 15 個 tsx 檔頭豁免都有寫理由,收緊不改變任何既有結果)
# 數值與規則出處:skills/code-quality-audit/SKILL.md 表列 1(any)/ 2(File size .tsx:P0 > 800);
# design-system-audit dim 27。完整稽核(dead export / circular / long function)走 `/code-quality-audit`。
#
# 判定(D4-02 審計 2026-11-18 起):
#   - any:只對**這次新增的行**擋(新增行的定義見 lib/_added_lines.sh);既有的列成「既有」不擋。
#   - file-size:檔案量的是整檔,沒有「哪一行是新的」—— 對應的判法是「這次編輯讓它變長」:
#     超過 800 行、沒有檔頭豁免、而且這次淨增行數 > 0 → 擋;沒變長只列成「既有」。
#     淨增行數:Edit / MultiEdit = Σ(new_string 行數 − old_string 行數);Write = 寫完的行數 − git HEAD 版本行數
#     (不在 HEAD = 新檔,整檔都算新增)。
#   - 既有命中清單交 /design-system-audit dim 27(2026-11-20 全樹唯讀掃描(81df56e4):any 0 處;file-size 4 檔 ——
#     AgentPanel/agent-panel-fab.tsx 985、AppShell/app-shell.tsx 875、Calendar/calendar.tsx 804、SelectMenu/select-menu.tsx 825)。
#   - 消費端 apps/*/src 另有 check_consumer_code_quality.sh 整檔擋同兩條(fork 出貨);本 helper 只在 DS repo 跑。

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/_added_lines.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: code quality added-lines helper unavailable\n' >&2
  exit 70
}

set -uo pipefail

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Scope: only src/ .tsx / .ts files (not stories, not specs)
if ! grep -qE 'src/.*\.tsx?$' <<<"$FILE_PATH"; then
  exit 0
fi
if grep -qE '\.(stories|anatomy\.stories|principles\.stories)\.tsx$' <<<"$FILE_PATH"; then
  exit 0
fi
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

integrity() {
  printf 'GOVERNANCE_INTEGRITY: code quality %s\n' "$1" >&2
  exit 70
}

WORK=$(mktemp -d "${TMPDIR:-/tmp}/code-quality.XXXXXX") || integrity 'work dir unavailable'
trap 'rm -rf -- "$WORK"' EXIT
governance_added_line_numbers "$INPUT" "$FILE_PATH" "$WORK/numbers" || integrity 'added-lines measurement failed'

BLOCK=""
EXISTING=""

# ── Check 1: `any` usage ────────────────────────────────────────────────────
# 整檔掃(不設上限,截斷會把新增行漏掉 —— M10);豁免與新增 / 既有分流在後面做。
ANY_HITS=$(perl -ne '
  next if m{^\s*//};
  next if m{^\s*\*};
  next if m{/\* ?\@ts-};
  if (/:\s*any\b/ || /\bas\s+any\b/ || /<any>/ || /\bany\[\]/ || /Record<[^,]+,\s*any>/) {
    # String literal FPs
    print "$.:$_" unless /[\x27"](any|many)[\x27"]/i;
  }
' "$FILE_PATH" 2>/dev/null) || integrity 'any parser failed'
ANY_HITS=$(governance_drop_escaped_hits "$ANY_HITS" "$FILE_PATH" 'any-allow:[ \t]*[^ \t]' same-or-prev) \
  || integrity 'any escape filter failed'
governance_split_hits "$ANY_HITS" "$WORK/numbers" "$WORK/any.added" "$WORK/any.existing" || integrity 'any hit split failed'
if [ -s "$WORK/any.added" ]; then
  BLOCK="${BLOCK}"$'\n'"⛔ TypeScript \`any\`(這次新增的行,沒有 \`// any-allow: <理由>\`):"$'\n'"$(awk 'NR <= 5' "$WORK/any.added")"$'\n'"  修法:改成正確型別;真的沒辦法(例:3rd-party 型別外部化)→ 同一行或上一行加 \`// any-allow: <具體理由>\`"
fi
if [ -s "$WORK/any.existing" ]; then
  EXISTING="${EXISTING}"$'\n'"• TypeScript \`any\` 沒有 any-allow(既有 $(grep -c . "$WORK/any.existing") 處):"$'\n'"$(awk 'NR <= 5' "$WORK/any.existing")"
fi

# ── Check 2: tsx file size ──────────────────────────────────────────────────
if grep -qE '\.tsx$' <<<"$FILE_PATH"; then
  LINES=$(wc -l < "$FILE_PATH" | tr -d ' ') || integrity 'line counter failed'
  EXEMPT=$(head -20 "$FILE_PATH" | grep -cE 'code-quality-allow:[[:space:]]*file-size[[:space:]]*[^[:space:]]' || true)
  if [ "$LINES" -gt 800 ] && [ "${EXEMPT:-0}" -eq 0 ]; then
    TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) || integrity 'tool extraction failed'
    case "$TOOL" in
      Edit|MultiEdit)
        GROWTH=$(printf '%s' "$INPUT" | jq -r '
          [ (if .tool_name == "Edit" then [.tool_input] else (.tool_input.edits // []) end)[]
            | ((.new_string // "") | split("\n") | length) - ((.old_string // "") | split("\n") | length) ]
          | add // 0
        ' 2>/dev/null) || integrity 'growth measurement failed'
        ;;
      *)
        BASE_LINES=$(git -C "$(dirname "$FILE_PATH")" show "HEAD:./$(basename "$FILE_PATH")" 2>/dev/null | wc -l | tr -d ' ')
        GROWTH=$(( LINES - ${BASE_LINES:-0} ))
        ;;
    esac
    case "$GROWTH" in -*|[0-9]*) ;; *) integrity "growth is not a number:${GROWTH}" ;; esac
    if [ "$GROWTH" -gt 0 ]; then
      BLOCK="${BLOCK}"$'\n'"⛔ tsx file-size P0:${LINES} 行 > 800 transition cap(budget 500),這次編輯又多了 ${GROWTH} 行。架構性拆分:分 sub-component tsx(例 sidebar.tsx → sidebar.tsx + sidebar-menu.tsx + sidebar-group.tsx)。若係 foundational composite(Sidebar / TreeView 等),檔頭前 20 行內加 \`// code-quality-allow: file-size <理由>\` 明文豁免。"
    else
      EXISTING="${EXISTING}"$'\n'"• tsx file-size:${LINES} 行 > 800 transition cap,沒有 \`code-quality-allow: file-size\` 檔頭豁免(既有;這次沒有變長)"
    fi
  fi
fi

[ -n "$BLOCK" ] && BLOCK="Code quality:這次編輯新增了違規(完整稽核走 /code-quality-audit)。${BLOCK}"
[ -n "$EXISTING" ] && EXISTING="Code quality 既有違規(不是這次新增的,不擋;清單由 /design-system-audit dim 27 收):${EXISTING}"
governance_emit_verdict "$BLOCK" "$EXISTING"

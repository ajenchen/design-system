#!/bin/bash
# Naming + abstraction unified hook(2026-05-08 cluster D consolidation)
#
# Merges 3 PreToolUse hooks(原各檔已 retire,合併入此):
#   D.1 premature abstraction(原 check_premature_abstraction,P0 BLOCK)
#   D.2 internal namespace consistency(原 check_internal_namespace_consistency,P0 BLOCK)
#   D.3 primitive color var in tsx(原 check_primitive_color_var_in_tsx,P1 WARN stderr)
#
# Why merge:皆 命名 / 抽象 / token 消費紀律 invariant,共用 INPUT parsing 模式。
# 散裝是 M17 + Anthropic ≤ 15 hook best-practice 偏離。
#
# Per-rule scope 差異(必保留各自 narrow):
#   D.1: Write only + components/X/X.tsx 或 spec.md 主檔 + 新檔
#   D.2: Edit/Write/MultiEdit + *.stories.tsx
#   D.3: Edit/Write/MultiEdit + *.tsx minus Tag/Avatar/Chart/tokens
#
# Per-rule allowlist:
#   D.1: 檔頭 10 行內 `// @separate-component-rationale: <world-class refs + 3-test 通過理由>`
#   D.2: (無 allowlist,但若 file 沒 title namespace 自動 skip)
#   D.3: 行尾 `// @primitive-color-allow: <reason>` OR 檔頭 `// primitive-color-allow-blanket`

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")

[ -z "${NEW_CONTENT//[[:space:]]/}" ] && exit 0

WORST=0
record_worst() { local lvl=$1; [ "$lvl" -gt "$WORST" ] && WORST=$lvl; }

# ── D.1 premature abstraction(Write only,新元件 BLOCK)──────────────────────
if [ "$TOOL" = "Write" ]; then
  case "$FILE_PATH" in
    */packages/design-system/src/components/*/[^.]*.tsx|*/packages/design-system/src/components/*/*.spec.md)
      if [ ! -f "$FILE_PATH" ]; then
        COMPONENT_DIR=$(echo "$FILE_PATH" | sed -E 's|.*/components/([^/]+)/.*|\1|')
        SUFFIX=""
        BASE_NAME=""
        for SFX in Time Range Color Light Dark Filled Outline Compact Rich Variant; do
          if [[ "$COMPONENT_DIR" =~ ${SFX}$ ]] && [ "$COMPONENT_DIR" != "$SFX" ]; then
            BASE=$(echo "$COMPONENT_DIR" | sed -E "s/${SFX}$//")
            [ -z "$BASE" ] && continue
            COMPONENTS_ROOT=$(echo "$FILE_PATH" | sed -E 's|(.*/components)/.*|\1|')
            if [ -d "$COMPONENTS_ROOT/$BASE" ]; then
              SUFFIX="$SFX"; BASE_NAME="$BASE"; break
            fi
          fi
        done
        if [ -n "$SUFFIX" ]; then
          # Allowlist:檔頭 10 行內 rationale comment
          if ! echo "$NEW_CONTENT" | head -10 | grep -qE '//\s*@separate-component-rationale:|^\s*#?\s*@separate-component-rationale:'; then
            cat >&2 <<EOF

┄┄┄ D.1 check_naming_and_abstraction — premature abstraction BLOCKER ┄┄┄

[P0] 新元件 \`${COMPONENT_DIR}\`(後綴 \`${SUFFIX}\`)
基底元件 \`${BASE_NAME}\` 已存在 → 強烈 signal 應為 prop variant on \`${BASE_NAME}\`。

歷史(M21):
  - DateTimePicker → \`<DatePicker showTime>\`
  - DataTableFilterPanel → sub-file pattern

3-test 通過才能分:
  1. \`${BASE_NAME}\` 加 prop 達不到同 DOM/behavior?
  2. ≥3 家 world-class DS 用分離元件而非 prop?(必 cite source)
  3. value 結構或 contract 真的不同(如 Range = [start, end])?

通過 → spec.md 加 rationale + 檔頭 10 行內加:
  // @separate-component-rationale: <world-class refs + 3-test 通過理由>

EOF
            record_worst 2
          fi
        fi
      fi
      ;;
  esac
fi

# ── D.2 internal namespace consistency(stories sibling check,BLOCK)──────────
case "$FILE_PATH" in
  *.stories.tsx)
    NEW_NS=$(printf '%s' "$NEW_CONTENT" | grep -oE "title:[[:space:]]*['\"]Design System/(Components|Internal)/" | head -1 | grep -oE "(Components|Internal)" || true)
    if [ -z "$NEW_NS" ] && [ -f "$FILE_PATH" ]; then
      NEW_NS=$(grep -oE "title:[[:space:]]*['\"]Design System/(Components|Internal)/" "$FILE_PATH" 2>/dev/null | head -1 | grep -oE "(Components|Internal)" || true)
    fi
    if [ -n "$NEW_NS" ]; then
      DIR=$(dirname "$FILE_PATH")
      INCONSISTENT=""
      while IFS= read -r SIB; do
        [ "$SIB" = "$FILE_PATH" ] && continue
        [ -f "$SIB" ] || continue
        SIB_NS=$(grep -oE "title:[[:space:]]*['\"]Design System/(Components|Internal)/" "$SIB" 2>/dev/null | head -1 | grep -oE "(Components|Internal)" || true)
        if [ -n "$SIB_NS" ] && [ "$SIB_NS" != "$NEW_NS" ]; then
          INCONSISTENT="${INCONSISTENT}  - ${SIB} → ${SIB_NS}"$'\n'
        fi
      done < <(find "$DIR" -maxdepth 1 -name '*.stories.tsx' 2>/dev/null)
      if [ -n "$INCONSISTENT" ]; then
        cat >&2 <<EOF

┄┄┄ D.2 check_naming_and_abstraction — sibling stories namespace BLOCKER ┄┄┄

[P0] ${FILE_PATH} → ${NEW_NS}
Sibling stories 不一致:
${INCONSISTENT}
3 stories(展示 / anatomy / principles)title namespace 必全 Components/ 或全 Internal/。

決策:跑 CLAUDE.md「Internal vs Components 3-test」→ 把全 3 檔統一。

EOF
        record_worst 2
      fi
    fi
    ;;
esac

# ── D.3 primitive color var in tsx(P1 WARN stderr only)──────────────────────
case "$FILE_PATH" in
  *.tsx)
    case "$FILE_PATH" in
      */components/Tag/*|*/components/Avatar/*|*/components/Chart/*|*/tokens/*) ;; # codified primitive-consumer skip
      *)
        if ! echo "$NEW_CONTENT" | grep -q 'primitive-color-allow-blanket'; then
          VIOLATIONS_D3=$(printf '%s' "$NEW_CONTENT" | grep -nE 'var\(--color-[a-z][a-z-]*-[0-9]{1,2}(-opaque)?\)' | grep -v 'primitive-color-allow' || true)
          if [ -n "$VIOLATIONS_D3" ]; then
            cat >&2 <<EOF

┄┄┄ D.3 check_naming_and_abstraction — primitive color var WARN ┄┄┄

[P1] ${FILE_PATH}
tsx 內直接消費 primitive token \`var(--color-*-N)\`:
${VIOLATIONS_D3}

⚠️  Token 命名 rule 4:禁 primitive 色名作 utility,用 semantic alias。
修法 3 擇 1:
  1. 加 semantic alias 在 tokens/color/semantic.css(consumer 用 semantic)
  2. 既有 semantic 已存在 → \`var(--border)\` / \`var(--bg-disabled)\`
  3. 例外(Tag / Avatar / Chart 自動 allowed): \`// @primitive-color-allow: <reason>\` 行尾豁免

詳 tokens/color/color.spec.md「架構流派定位」+「Primitive 色票與 Tag / Avatar 的消費」。

EOF
          fi
        fi
        ;;
    esac
    ;;
esac

exit $WORST

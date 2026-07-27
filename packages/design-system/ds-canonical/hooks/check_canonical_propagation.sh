#!/bin/bash
# Canonical propagation unified hook(2026-05-08 cluster E consolidation)
#
# Merges 3 PreToolUse hooks(原各檔已 retire,合併入此):
#   E.1 principles canonical(原 check_principles_canonical,P0 BLOCK new file / P1 warn existing)
#   E.2 L3 primitive import(原 check_l3_primitive_import,P0 BLOCK)
#   E.3 spec-impl default alignment(原 check_spec_impl_default_alignment,P1 context)
#
# Why merge:皆 canonical SSOT propagation invariant — principles structure / L3 layer 邊界 /
# spec→impl 一致性,共用 INPUT parsing 模式。散裝是 M17 + Anthropic ≤ 15 hook 偏離。
#
# File scope per rule:
#   E.1: *.principles.stories.tsx
#   E.2: *.ts / *.tsx outside packages/design-system/src/{components,patterns,tokens,hooks}
#   E.3: *.spec.md
#
# Allowlist tags:
#   E.1: `// @principles-rationale: <reason>`
#   E.2: 檔頭 5 行 `// @l3-import-allow: <reason>`
#   E.3: 檔頭 5 行 `// @spec-impl-allow: <reason>`

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

_HOOK_CONTEXT_EVENT="PreToolUse"
_HOOK_OUTPUT_CAPTURE=$(mktemp "${TMPDIR:-/tmp}/check-canonical-propagation.XXXXXX") || {
  printf 'GOVERNANCE_INTEGRITY: canonical propagation output capture unavailable\n' >&2
  exit 70
}
exec 3>&1 4>&2
exec >"$_HOOK_OUTPUT_CAPTURE" 2>&1

_finalize_hook_output() {
  _hook_rc=$?
  trap - EXIT
  exec 1>&3 2>&4
  _hook_output=$(cat "$_HOOK_OUTPUT_CAPTURE" 2>/dev/null || true)
  rm -f "$_HOOK_OUTPUT_CAPTURE" 2>/dev/null || true

  case "$_hook_rc" in
    0)
      [ -z "$_hook_output" ] && exit 0
      if ! jq -cn \
        --arg event "$_HOOK_CONTEXT_EVENT" \
        --arg message "$_hook_output" \
        '{governanceContext:{hookEventName:$event,message:$message}}'; then
        printf 'GOVERNANCE_INTEGRITY: canonical propagation warning envelope encoding failed\n' >&2
        exit 70
      fi
      exit 0
      ;;
    2)
      if grep -q 'GOVERNANCE_INTEGRITY:' <<<"$_hook_output"; then
        printf '%s\n' "$_hook_output" >&2
        exit 70
      elif [ -n "$_hook_output" ]; then
        printf '%s\n' "$_hook_output" >&2
      else
        printf 'canonical propagation hook blocked without diagnostic\n' >&2
      fi
      exit 2
      ;;
    70)
      if [ -n "$_hook_output" ]; then
        printf '%s\n' "$_hook_output" >&2
      else
        printf 'GOVERNANCE_INTEGRITY: canonical propagation failed without diagnostic\n' >&2
      fi
      exit 70
      ;;
    *)
      printf 'GOVERNANCE_INTEGRITY: canonical propagation undefined exit code %s\n' "$_hook_rc" >&2
      [ -n "$_hook_output" ] && printf '%s\n' "$_hook_output" >&2
      exit 70
      ;;
  esac
}
trap _finalize_hook_output EXIT

INPUT=$(cat)
if ! jq -e 'type == "object"' <<<"$INPUT" >/dev/null 2>&1; then
  printf 'GOVERNANCE_INTEGRITY: canonical propagation invalid input envelope\n' >&2
  exit 70
fi
TOOL=$(jq -r '.tool_name // ""' <<<"$INPUT")
FILE_PATH=$(jq -r '.tool_input.file_path // ""' <<<"$INPUT")

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

NEW_CONTENT=$(jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' <<<"$INPUT" 2>/dev/null || echo "")

grep -q '[^[:space:]]' <<<"$NEW_CONTENT" || exit 0

WORST=0
record_worst() { local lvl=$1; [ "$lvl" -gt "$WORST" ] && WORST=$lvl; }

# ── E.1 principles canonical(*.principles.stories.tsx)──────────────────────
case "$FILE_PATH" in
  *.principles.stories.tsx)
    if ! grep -q "@principles-rationale:" <<<"$NEW_CONTENT"; then
      EXISTING_CONTENT=""
      [ -f "$FILE_PATH" ] && EXISTING_CONTENT=$(cat "$FILE_PATH" 2>/dev/null || echo "")
      FULL_CONTENT="${EXISTING_CONTENT}
${NEW_CONTENT}"
      STORY_EXPORTS=$(grep -oE "^export const [A-Z][a-zA-Z]+" <<<"$FULL_CONTENT" | awk '{print $3}' | sort -u)

      VIOLATIONS_E1=""
      WARNINGS_E1=""

      DEPRECATED_NAMES=("Forbidden" "Donts" "Pitfalls" "Prohibitions" "NonGoals" "VisualDonts")
      for deprecated in "${DEPRECATED_NAMES[@]}"; do
        if grep -qE "^${deprecated}" <<<"$STORY_EXPORTS"; then
          if [ -z "$EXISTING_CONTENT" ]; then
            VIOLATIONS_E1="${VIOLATIONS_E1}\n  • [P0] Deprecated naming '${deprecated}*' — rename to 'WhenNotToUse'"
          else
            WARNINGS_E1="${WARNINGS_E1}\n  • [P1] Deprecated '${deprecated}*' — migrate to 'WhenNotToUse'"
          fi
        fi
      done

      HAS_WHEN_TO_USE=0; HAS_WHEN_NOT_TO_USE=0; HAS_VS_RULE=0; HAS_CONTENT_GUIDELINES=0; HAS_USAGE_GUIDANCE=0
      grep -qE "^WhenToUse$" <<<"$STORY_EXPORTS" && HAS_WHEN_TO_USE=1
      grep -qE "^WhenNotToUse$" <<<"$STORY_EXPORTS" && HAS_WHEN_NOT_TO_USE=1
      grep -qE "^Vs[A-Z].*Rule$|^.+Vs.+Rule$" <<<"$STORY_EXPORTS" && HAS_VS_RULE=1
      grep -qE "^ContentGuidelines$" <<<"$STORY_EXPORTS" && HAS_CONTENT_GUIDELINES=1
      grep -qE "^(UsageScenarioRule|WhatItIs)$" <<<"$STORY_EXPORTS" && HAS_WHEN_TO_USE=1
      for deprecated in "${DEPRECATED_NAMES[@]}"; do
        grep -qE "^${deprecated}" <<<"$STORY_EXPORTS" && HAS_WHEN_NOT_TO_USE=1
      done
      grep -qE "^UsageGuidance$" <<<"$STORY_EXPORTS" && HAS_USAGE_GUIDANCE=1

      CORE_COUNT=$((HAS_WHEN_TO_USE + HAS_WHEN_NOT_TO_USE + HAS_VS_RULE + HAS_CONTENT_GUIDELINES))
      [ "$HAS_USAGE_GUIDANCE" -eq 1 ] && CORE_COUNT=2

      if [ "$CORE_COUNT" -lt 2 ]; then
        if [ -z "$EXISTING_CONTENT" ]; then
          VIOLATIONS_E1="${VIOLATIONS_E1}\n  • [P0] Universal core ≥ 2 required: have ${CORE_COUNT} of {WhenToUse, WhenNotToUse, Vs*Rule, ContentGuidelines}"
        else
          WARNINGS_E1="${WARNINGS_E1}\n  • [P1] Universal core ${CORE_COUNT}/2 — add WhenToUse / WhenNotToUse / Vs*Rule / ContentGuidelines"
        fi
      fi

      if [ -n "$VIOLATIONS_E1" ]; then
        cat >&2 <<EOF

┄┄┄ E.1 check_canonical_propagation — principles canonical BLOCKER ┄┄┄

[P0] ${FILE_PATH}
Violations:$(echo -e "$VIOLATIONS_E1")

Per category-templates.md「Principles canonical」:
  ‣ Universal core ≥ 2 of {WhenToUse, WhenNotToUse, Vs*Rule, ContentGuidelines}
  ‣ Anti-pattern naming → WhenNotToUse(Forbidden/Donts/Pitfalls/Prohibitions/NonGoals/VisualDonts deprecated)
  ‣ 例外:加 \`// @principles-rationale: <reason>\`

EOF
        record_worst 2
      fi
      [ -n "$WARNINGS_E1" ] && echo "⚠️  E.1 principles canonical warning:$(echo -e "$WARNINGS_E1")" >&2
    fi
    ;;
esac

# ── E.2 L3 primitive import(*.ts/.tsx outside DS internal)───────────────────
case "$FILE_PATH" in
  *.ts|*.tsx)
    case "$FILE_PATH" in
      */packages/design-system/src/components/*|*/packages/design-system/src/patterns/*|*/packages/design-system/src/tokens/*|*/packages/design-system/src/hooks/*) ;; # DS internal skip
      *)
        # File-level allowlist:檔頭 5 行
        ALLOW_E2=0
        FIRST_LINES_E2=$(printf '%s\n' "$NEW_CONTENT" | sed -n '1,5p')
        grep -qE '//[[:space:]]*@l3-import-allow:' <<<"$FIRST_LINES_E2" && ALLOW_E2=1
        if [ -f "$FILE_PATH" ] && [ "$ALLOW_E2" = "0" ]; then
          ON_DISK_FIRST=$(sed -n '1,5p' "$FILE_PATH" 2>/dev/null || true)
          grep -qE '//[[:space:]]*@l3-import-allow:' <<<"$ON_DISK_FIRST" && ALLOW_E2=1
        fi
        if [ "$ALLOW_E2" = "0" ]; then
          L3_IMPORT_PATTERN='from\s+["'"'"'][^"'"'"']*patterns/element-anatomy/item-anatomy["'"'"']'
          if grep -qE "$L3_IMPORT_PATTERN" <<<"$NEW_CONTENT"; then
            MATCHED_LINE=$(grep -m 1 -nE "$L3_IMPORT_PATTERN" <<<"$NEW_CONTENT")
            cat >&2 <<EOF

┄┄┄ E.2 check_canonical_propagation — L3 primitive import BLOCKER ┄┄┄

[P0] ${FILE_PATH}
  > ${MATCHED_LINE}

L3 internal primitives(\`ItemInlineAction\` / \`ItemContent\` / \`RowSizeProvider\` 等)
是給 DS 作者建 host 元件用的 building block,不是 app code 用的。

修法(擇一):
  (a) host config API(90%):<Input endAction={...} /> / <TreeItem inlineActions={...} />
  (b) host slot escape(10%):<Input endSlot={<Custom/>} />
  (c) 獨立 button(非 inline):<Button iconOnly variant="text" />

刻意 import L3:檔首 5 行加 \`// @l3-import-allow: <reason + spec.md anchor>\`

EOF
            record_worst 2
          fi
        fi
        ;;
    esac
    ;;
esac

# ── E.3 spec-impl default alignment(*.spec.md)──────────────────────────────
case "$FILE_PATH" in
  *.spec.md)
    FIRST_LINES_E3=$(printf '%s\n' "$NEW_CONTENT" | sed -n '1,5p')
    if ! grep -q '@spec-impl-allow' <<<"$FIRST_LINES_E3"; then
      DEFAULT_LINES=$(grep -m 3 -nE '預設|預値|default[ \t]*[=:]|`default`|預設值' <<<"$NEW_CONTENT")
      if [ -n "$DEFAULT_LINES" ]; then
        cat >&2 <<EOF

┄┄┄ E.3 check_canonical_propagation — spec-impl default alignment WARN ┄┄┄

[P1] ${FILE_PATH}
偵測「default」/「預設」keyword:
${DEFAULT_LINES}

⚠️  spec 寫預設值 → 必對應 impl 驗證一致(M14 + 真實案例:SelectMenu spec 寫
   「width 預設 = trigger-width」但 PopoverContent w-72 hardcode override,canonical 失效)

Self-check:
  - 找對應 implementation file
  - grep 該 default value 是否 hardcode / 是否被外層 override
  - 不一致 → 修 impl OR 修 spec 對齊
  - 一致 → impl 加 inline comment 「Default per spec L<N>」回扣

整檔豁免:檔頭 5 行 \`// @spec-impl-allow: <reason>\`(soft warn 不擋 commit)

EOF
      fi
    fi
    ;;
esac

exit $WORST

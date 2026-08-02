#!/bin/bash
# check_story_invariants.sh — Cluster A merge dispatcher(2026-05-10)
#
# Per codex review red-light + Q-9 (a) inline merge with rule functions:
#   Merges 5 stories.tsx hooks into 1 mega dispatcher with 5 internal rule fn:
#     R1 anatomy(原 lib/check_story_anatomy.sh,PreToolUse Edit|Write|MultiEdit)
#     R2 slot_split(原 lib/check_story_slot_split.sh,Pre)
#     R3 category(原 lib/check_story_category.sh,Pre)
#     R4 title_canonical(原 check_story_title_canonical.sh,Pre)
#     R5 name_jargon(原 lib/check_story_name_jargon.sh,Post — reads disk)
#
# Layer A own 撞 codex Q-9:codex 默認「6 → 1」忽略 event type 異質 —
# compile_drift 是 component tsx + spec.md scope,不適合 merge,留 standalone。
# 實際:5 stories.tsx hooks → 1 dispatcher(file count -4,34 → 30)。
#
# Event branching:
#   - PreToolUse:R1 + R2 + R3 + R4(check incoming new content)
#   - PostToolUse:R5(reads from disk after write)
# settings.json registers same script to both events on Edit|Write|MultiEdit matcher。
#
# Scoped exception markers preserved 1-to-1:
#   R1: @anatomy-exempt: / @anatomy-exempt-next
#   R2: @story-split-rationale:
#   R3: @story-trait-rationale: <declared-trait> -> <existing-story-export> — <non-deferred reason>
#   R4: @story-name-canonical-allow:
#   R5(no allowlist,reads disk;jargon catch is broad warning)

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_provider_paths.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: story invariant canonical provider resolver unavailable\n' >&2
  exit 70
}
source "$(dirname "$0")/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: hook integrity helper unavailable\n' >&2
  exit 70
}

set -uo pipefail

_HOOK_CONTEXT_EVENT="PreToolUse"
_HOOK_OUTPUT_CAPTURE=$(mktemp "${TMPDIR:-/tmp}/check-story-invariants.XXXXXX") || {
  printf 'GOVERNANCE_INTEGRITY: story invariants output capture unavailable\n' >&2
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
        printf 'GOVERNANCE_INTEGRITY: story invariants warning envelope encoding failed\n' >&2
        exit 70
      fi
      exit 0
      ;;
    2)
      if grep -q 'GOVERNANCE_INTEGRITY:' <<< "$_hook_output"; then
        printf '%s\n' "$_hook_output" >&2
        exit 70
      elif [ -n "$_hook_output" ]; then
        printf '%s\n' "$_hook_output" >&2
      else
        printf 'story invariants hook blocked without diagnostic\n' >&2
      fi
      exit 2
      ;;
    70)
      if [ -n "$_hook_output" ]; then
        printf '%s\n' "$_hook_output" >&2
      else
        printf 'GOVERNANCE_INTEGRITY: story invariants failed without diagnostic\n' >&2
      fi
      exit 70
      ;;
    *)
      printf 'GOVERNANCE_INTEGRITY: story invariants undefined exit code %s\n' "$_hook_rc" >&2
      [ -n "$_hook_output" ] && printf '%s\n' "$_hook_output" >&2
      exit 70
      ;;
  esac
}
trap _finalize_hook_output EXIT

governance_hook_load_input
governance_hook_require_commands \
  awk basename cat dirname grep head jq mktemp python3 rm sed sort
TOOL=$(jq -r '.tool_name // ""' <<< "$INPUT" 2>/dev/null) \
  || governance_hook_integrity_fail 'story invariant tool extraction failed'
FILE_PATH=$(jq -r '.tool_input.file_path // ""' <<< "$INPUT" 2>/dev/null) \
  || governance_hook_integrity_fail 'story invariant path extraction failed'
EVENT=$(jq -r '.hook_event_name // ""' <<< "$INPUT" 2>/dev/null) \
  || governance_hook_integrity_fail 'story invariant event extraction failed'
case "$EVENT" in
  PostToolUse) _HOOK_CONTEXT_EVENT="PostToolUse" ;;
  *) _HOOK_CONTEXT_EVENT="PreToolUse" ;;
esac

# Common filters
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
case "$FILE_PATH" in *.stories.tsx) ;; *) exit 0 ;; esac

CANONICAL_REFERENCE_ROOT="$(governance_canonical_root references 2>/dev/null)" || {
  printf 'GOVERNANCE_INTEGRITY: story invariant canonical reference root unavailable\n' >&2
  exit 70
}
CANONICAL_REFERENCE_REL="$(governance_canonical_relative_root references 2>/dev/null)" || {
  printf 'GOVERNANCE_INTEGRITY: story invariant canonical reference relative root unavailable\n' >&2
  exit 70
}
CANONICAL_RULE_REL="$(governance_canonical_relative_root rules 2>/dev/null)" || {
  printf 'GOVERNANCE_INTEGRITY: story invariant canonical rule relative root unavailable\n' >&2
  exit 70
}
CANONICAL_SKILL_REL="$(governance_canonical_relative_root skills 2>/dev/null)" || {
  printf 'GOVERNANCE_INTEGRITY: story invariant canonical skill relative root unavailable\n' >&2
  exit 70
}

NEW_CONTENT=""
if [ "$EVENT" != "PostToolUse" ]; then
  case "${GOVERNANCE_WRITE_STATE_TRUST:-}" in
    runner-v1)
      if ! jq -e '
        .tool_input.governance_write_state as $state
        | ($state | type == "object")
          and ($state.schemaVersion == 1)
          and ($state.path | type == "string" and length > 0)
          and (
            ($state.kind == "text" and ($state.content | type == "string"))
            or ($state.kind == "deleted" and ($state | has("content") | not))
          )
      ' <<< "$INPUT" >/dev/null 2>&1; then
        governance_hook_integrity_fail 'story invariant trusted proposed write state is missing or malformed'
      fi
      STATE_PATH=$(jq -r '.tool_input.governance_write_state.path' <<< "$INPUT" 2>/dev/null) \
        || governance_hook_integrity_fail 'story invariant proposed state path extraction failed'
      STATE_KIND=$(jq -r '.tool_input.governance_write_state.kind' <<< "$INPUT" 2>/dev/null) \
        || governance_hook_integrity_fail 'story invariant proposed state kind extraction failed'
      if [[ "$FILE_PATH" != "$STATE_PATH" && "$FILE_PATH" != */"$STATE_PATH" ]]; then
        governance_hook_integrity_fail 'story invariant proposed state does not match the hook target'
      fi
      [ "$STATE_KIND" = "deleted" ] && exit 0
      NEW_CONTENT=$(jq -r '.tool_input.governance_write_state.content' <<< "$INPUT" 2>/dev/null) \
        || governance_hook_integrity_fail 'story invariant proposed state content extraction failed'
      ;;
    ""|unavailable)
      # Direct/native fallback: select exactly one mutation surface.
      # Normalized event-v1 runners can materialize compatibility aliases
      # together; concatenating them multiplies the same full-file payload.
      NEW_CONTENT=$(jq -r '
        .tool_name as $tool
        | .tool_input as $input
        | def valid_edits:
            (($input.edits | type) == "array")
            and all($input.edits[]?; (.new_string | type) == "string");
        if $tool == "Write" and ($input.content | type) == "string" then
          $input.content
        elif $tool == "Edit" and ($input.new_string | type) == "string" then
          $input.new_string
        elif $tool == "MultiEdit" and valid_edits then
          ([$input.edits[] | .new_string] | join("\n"))
        elif ($input.new_string | type) == "string" then
          $input.new_string
        elif ($input.content | type) == "string" then
          $input.content
        elif valid_edits then
          ([$input.edits[] | .new_string] | join("\n"))
        else
          error("no valid mutation text")
        end
      ' <<< "$INPUT" 2>/dev/null) \
        || governance_hook_integrity_fail 'story invariant edit payload extraction failed'
      ;;
    *)
      governance_hook_integrity_fail 'story invariant proposed state trust marker is unsupported'
      ;;
  esac
fi

WORST=0
record_worst() { local lvl=$1; [ "$lvl" -gt "$WORST" ] && WORST=$lvl; }

# ─────────────────────────────────────────────────────────────────────────────
# R1 — anatomy(PreToolUse,block raw JSX should consume DS canonical)
# ─────────────────────────────────────────────────────────────────────────────
rule_anatomy() {
  [ "$EVENT" = "PostToolUse" ] && return 0
  grep -q '[^[:space:]]' <<< "$NEW_CONTENT" || return 0

  # 2026-06-11 deep-audit R2(n=41 + n=53):anatomy / principles 檔豁免(比照同 hook R2/R3/R4/R6 既有 skip)。
  # M7 3-column gap table:
  #   Spec wording(story-rules.md):anatomy/principles = dev-facing spec stories — 靜態 anatomy preview、
  #     doc-table、canonical footer 示範皆屬 convention(實測 61 個 anatomy/principles 檔用 raw <table>,
  #     45 個無 @anatomy-exempt marker → full-file Write 必被 A.2 誤擋 = corpus 級系統衝突)。
  #   Hook regex:R1 A.1-C 原不分層,anatomy/principles 同樣 BLOCK。
  #   Gap(spec narrow vs hook broad):誤擋 dropdown-menu.anatomy.stories.tsx:490,508(1lh icon 對齊
  #     static preview,A.1 誤命中)+ popover.principles.stories.tsx:264,277(PopoverFooter canonical
  #     取消鍵 = footer 確認/取消對,非 dismiss-X 違規,B 誤命中)。
  #   展示層 *.stories.tsx 全部檢查不變(真保護不削弱);anatomy/principles 仍有 R5/R8/R9 看守。
  case "$FILE_PATH" in *anatomy.stories.tsx|*principles.stories.tsx) return 0 ;; esac

  # File-level allowlist
  FIRST_LINES=$(sed -n '1,3p;3q' <<< "$NEW_CONTENT")
  grep -qE '//[[:space:]]*@anatomy-exempt:' <<< "$FIRST_LINES" && return 0
  if [ "${GOVERNANCE_WRITE_STATE_TRUST:-}" != "runner-v1" ] && [ -f "$FILE_PATH" ]; then
    ON_DISK=$(sed -n '1,3p' "$FILE_PATH" 2>/dev/null || true)
    grep -qE '//[[:space:]]*@anatomy-exempt:' <<< "$ON_DISK" && return 0
  fi

  TMP=$(mktemp) || governance_hook_integrity_fail 'story invariant anatomy scratch file unavailable'
  trap 'rm -f -- "$TMP"' RETURN
  printf '%s\n' "$NEW_CONTENT" > "$TMP" \
    || governance_hook_integrity_fail 'story invariant anatomy scratch write failed'

  local violations
  violations=$(python3 - "$FILE_PATH" "$TMP" <<'PY'
import re
import sys

file_path, source_path = sys.argv[1:]
with open(source_path, encoding='utf-8') as source:
    lines = source.read().splitlines()

allowed_first_tags = {
    'MenuItem', 'ItemIcon', 'ItemAvatar', 'ItemLabel', 'ItemSuffix',
    'ItemInlineAction', 'ItemPrefix', 'ItemContent', 'Field',
    'FieldWrapper', 'Empty', 'Card', 'Coachmark', 'Dialog', 'Sheet',
    'Popover', 'HoverCard', 'DataTable', 'FileItem',
}
exempt_next = re.compile(r'//\s*@anatomy-exempt-next|\{/\*\s*@anatomy-exempt-next')
item_row = re.compile(
    r'<div[^>]*className="[^"]*\bflex\b[^"]*\bitems-center\b[^"]*"'
    r'[^>]*>\s*<([A-Z][a-zA-Z]*)',
)
raw_table = re.compile(r'<table\b')
loading_surface = re.compile(
    r'<div[^>]*className="[^"]*\babsolute\b[^"]*\binset-0\b[^"]*\bflex\b',
)
raw_field = re.compile(r'<input\b[^>]*className="[^"]*\bh-field-')
dismiss_button = re.compile(
    r'<Button\b[^>]*>\s*(關閉|Close|Dismiss|取消|Cancel)\s*</Button>',
)
dismiss_context = re.compile(
    r'onClose\b|onDismiss\b|<(Dialog|Sheet|Popover|Coachmark|Surface)Header\b'
    r'|setOpen\(false\)|dismiss',
)
overlay_surface = re.compile(
    r'<div[^>]*className="[^"]*\babsolute\b[^"]*(bg-|shadow-|border)',
)
overlay_dismiss = re.compile(r'onClose\b|onDismiss\b|setOpen\(false\)')

findings = []
skip_next = False
for index, line in enumerate(lines):
    row = index + 1
    if skip_next:
        skip_next = False
        continue
    if exempt_next.search(line):
        skip_next = True
        continue

    preview = line.lstrip()[:120]
    match = item_row.search(line)
    if match and match.group(1) not in allowed_first_tags:
        findings.append(
            f'\n[A.1 hand-craft item-anatomy] {file_path}:{row}\n'
            f'  > {preview}\n'
            '  改用 <MenuItem> + slot components'
        )

    if '/DataTable/' not in file_path and raw_table.search(line):
        findings.append(
            f'\n[A.2 raw <table>] {file_path}:{row}\n'
            f'  > {preview}\n'
            '  改用 <DataTable columns={...} data={...} />'
        )

    if loading_surface.search(line):
        lookahead = '\n'.join(lines[index + 1:index + 5])
        if re.search(r'\bCircularProgress\b', f'{line} {lookahead}'):
            findings.append(
                f'\n[A.3 hand-craft loading] {file_path}:{row}\n'
                f'  > {preview}\n'
                '  改用 <Empty icon={<CircularProgress />} description="..." />'
            )

    if raw_field.search(line):
        findings.append(
            f'\n[A.4 hand-craft field] {file_path}:{row}\n'
            f'  > {preview}\n'
            '  改用 <Input> / <NumberInput> / <Select> / <Combobox>'
        )

    if dismiss_button.search(line):
        context = '\n'.join(lines[max(0, index - 4):index + 5])
        if dismiss_context.search(context):
            findings.append(
                f'\n[B dismiss via label] {file_path}:{row}\n'
                f'  > {preview}\n'
                '  改用 iconOnly X Button'
            )

    if overlay_surface.search(line):
        lookahead = '\n'.join(lines[index:index + 7])
        if overlay_dismiss.search(lookahead):
            findings.append(
                f'\n[C hand-craft overlay] {file_path}:{row}\n'
                f'  > {preview}\n'
                '  改用 <Popover> / <HoverCard> / <Tooltip> / <Dialog>'
            )

sys.stdout.write('\n'.join(findings))
PY
) || governance_hook_integrity_fail 'story invariant anatomy scan failed'

  if [ -n "$violations" ]; then
    {
      echo ""
      echo "╔═══ R1 anatomy — stories hand-craft 違規 ═══"
      printf '%s\n' "$violations"
      echo "豁免:檔首 // @anatomy-exempt: <reason> 整檔 OR // @anatomy-exempt-next 單行"
    } >&2
    record_worst 2
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# R2 — slot_split(PreToolUse,manual story 拆分原則)
# ─────────────────────────────────────────────────────────────────────────────
rule_slot_split() {
  [ "$EVENT" = "PostToolUse" ] && return 0
  case "$FILE_PATH" in *anatomy.stories.tsx|*principles.stories.tsx) return 0 ;; esac

  # Allowlist
  FIRST_LINES=$(sed -n '1,5p;5q' <<< "$NEW_CONTENT")
  grep -qE '//[[:space:]]*@story-split-rationale:' <<< "$FIRST_LINES" && return 0
  if [ "${GOVERNANCE_WRITE_STATE_TRUST:-}" != "runner-v1" ] && [ -f "$FILE_PATH" ]; then
    DISK=$(sed -n '1,5p' "$FILE_PATH" 2>/dev/null || true)
    grep -qE '//[[:space:]]*@story-split-rationale:' <<< "$DISK" && return 0
  fi

  local violations=""
  local FULL="$NEW_CONTENT"
  HAS_START=$(grep -cE 'export const WithStartIcon\b' <<< "$FULL" || true)
  HAS_END=$(grep -cE 'export const WithEndIcon\b' <<< "$FULL" || true)
  if [ "${HAS_START:-0}" -gt 0 ] && [ "${HAS_END:-0}" -gt 0 ]; then
    violations="${violations}
[反 pattern] WithStartIcon + WithEndIcon 拆兩 story → 合併 WithIcon"
  fi
  HAS_DEFAULT=$(grep -cE 'export const Default\b' <<< "$FULL" || true)
  HAS_ALL_VAR=$(grep -cE 'export const AllVariants\b' <<< "$FULL" || true)
  if [ "${HAS_DEFAULT:-0}" -gt 0 ] && [ "${HAS_ALL_VAR:-0}" -gt 0 ]; then
    violations="${violations}
[反 pattern] Default + AllVariants 同檔 → AllVariants 已 cover default"
  fi
  PRIM=$(grep -cE 'export const (Primary|Secondary|Tertiary)\b' <<< "$FULL" || true)
  if [ "${PRIM:-0}" -ge 2 ]; then
    violations="${violations}
[反 pattern] 多 variant stories 拆細 → 合併 AllVariants 對照 grid"
  fi
  if grep -qE '^export const Variants(\b|:|\s|=)' <<< "$FULL"; then
    violations="${violations}
[命名漂移] Variants → AllVariants"
  fi
  if grep -qE '^export const (DisabledState|DisabledGroup)(\b|:|\s|=)' <<< "$FULL"; then
    violations="${violations}
[命名漂移] DisabledState/Group → Disabled"
  fi
  if grep -qE '^export const SizeVariants(\b|:|\s|=)' <<< "$FULL"; then
    violations="${violations}
[命名漂移] SizeVariants → AllSizes"
  fi
  if grep -qE '^export const [^a-zA-Z_$]' <<< "$FULL"; then
    violations="${violations}
[命名漂移] export const 中文名 → 用 PascalCase 英文,中文寫 \`name: '...'\`"
  fi

  if [ -n "$violations" ]; then
    {
      echo ""
      echo "╔═══ R2 slot_split — manual story 拆分違規 ═══"
      printf '%s\n' "$violations"
      echo "豁免:檔首 // @story-split-rationale: <reason>"
    } >&2
    record_worst 2
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# R3 — category(trait-based check from spec.md frontmatter)
# ─────────────────────────────────────────────────────────────────────────────
rule_category() {
  [ "$EVENT" = "PostToolUse" ] && return 0
  case "$FILE_PATH" in *anatomy.stories.tsx|*principles.stories.tsx) return 0 ;; esac

  COMP_DIR=$(dirname "$FILE_PATH")
  SPEC_FILE=""
  for c in "$COMP_DIR"/*.spec.md; do
    [ -f "$c" ] && SPEC_FILE="$c" && break
  done
  [ -z "$SPEC_FILE" ] && return 0

  # 2026-06-11 deep-audit R2(n=37):traits 改 parse 整段 YAML frontmatter(首尾 --- 之間),
  # 取代 head -30 固定 window — Tag traits 在 tag.spec.md:54(13 個 categorical variant 表前置)
  # 超出舊 window → hook 對 Tag 永遠靜默 skip(62 單元中唯一漏)。
  FRONTMATTER=$(awk '/^---[[:space:]]*$/{n++; if(n==2) exit; next} n==1{print}' "$SPEC_FILE")
  TRAITS=""
  if grep -q "^traits:" <<< "$FRONTMATTER"; then
    TRAITS=$(awk '/^traits:/{i=1;next} i&&/^  - /{sub(/^  - /,"");print;next} i&&!/^  /{i=0}' <<< "$FRONTMATTER")
    TRAITS=${TRAITS//$'\n'/ }
  fi
  [ -z "$TRAITS" ] && return 0

  # 2026-06-11 deep-audit R2(n=36):category-matrix.json 為 SSOT(對齊 audit dim 11)—
  # traitShape != true 的 category(internal=optional / pattern / token / template)不跑 trait 檢查。
  # Category resolution 消費既有 classification SSOT(M23,scripts/category-classification-invariant.mjs
  # L73-77 resolveCategory):internal 權威訊號 = frontmatter `internal: true` OR traits `- isInternal`
  # (9 元件用 trait 形式:Command / SelectMenu / HoverCard 等);patterns/ → pattern;其餘 components/
  # → component。Registry path 用 GOVERNANCE_PROJECT_DIR fallback(R8 同 idiom,防相對路徑靜默失效)。
  CAT_MATRIX="${GOVERNANCE_PROJECT_DIR:-.}/packages/design-system/src/story-governance/category-matrix.json"
  if [ -f "$CAT_MATRIX" ]; then
    UNIT_CATEGORY="component"
    case "$FILE_PATH" in */patterns/*) UNIT_CATEGORY="pattern" ;; esac
    grep -qE '^internal:[[:space:]]*true|^[[:space:]]*-?[[:space:]]*isInternal\b' <<< "$FRONTMATTER" && UNIT_CATEGORY="internal"
    TRAIT_SHAPE=$(jq -r --arg c "$UNIT_CATEGORY" '.categories[$c].traitShape // empty' "$CAT_MATRIX" 2>/dev/null)
    [ "$TRAIT_SHAPE" != "true" ] && return 0
  fi

  if [ "${GOVERNANCE_WRITE_STATE_TRUST:-}" = "runner-v1" ] || [ "$TOOL" = "Write" ]; then
    FULL="$NEW_CONTENT"
  else
    EXISTING=""
    [ -f "$FILE_PATH" ] && EXISTING=$(cat "$FILE_PATH" 2>/dev/null || echo "")
    FULL="${EXISTING}
${NEW_CONTENT}"
  fi
  EXPORTS=$(grep -oE "^export const [A-Z][a-zA-Z0-9]*" <<< "$FULL" | awk '{print $3}' | sort -u)

  has_present() { grep -qE "^${1}$" <<< "$EXPORTS"; }
  has_contains() { grep -qE "${1}" <<< "$EXPORTS"; }

  # A trait rationale is a scoped, mechanically validated exception rather than a
  # file-wide escape. It can only satisfy the named trait and must point at a real
  # reader-facing export that already teaches the omitted trait scenario.
  local rationale_line rationale_trait rationale_target rationale_reason
  local rationale_errors=""
  local valid_rationale_traits=""
  while IFS= read -r rationale_line; do
    [ -n "$rationale_line" ] || continue
    if [[ "$rationale_line" =~ ^[[:space:]]*//[[:space:]]*@story-trait-rationale:[[:space:]]*([A-Za-z][A-Za-z0-9]*)[[:space:]]*\-\>[[:space:]]*([A-Z][A-Za-z0-9]*)[[:space:]]*—[[:space:]]*(.+[^[:space:]])[[:space:]]*$ ]]; then
      rationale_trait="${BASH_REMATCH[1]}"
      rationale_target="${BASH_REMATCH[2]}"
      rationale_reason="${BASH_REMATCH[3]}"

      case "$rationale_trait" in
        hasSizes|hasInteractiveStates|isOverlay|isInputLike|isSelectionMulti) ;;
        *)
          rationale_errors="${rationale_errors}
  • [P0] @story-trait-rationale unknown/non-enforced trait: ${rationale_trait}"
          continue ;;
      esac
      if ! grep -qE "(^|[[:space:]])${rationale_trait}([[:space:]]|$)" <<< "$TRAITS"; then
        rationale_errors="${rationale_errors}
  • [P0] @story-trait-rationale trait not declared in spec: ${rationale_trait}"
        continue
      fi
      if ! has_present "$rationale_target"; then
        rationale_errors="${rationale_errors}
  • [P0] @story-trait-rationale target export missing: ${rationale_target}"
        continue
      fi
      if grep -qiE 'tracked separately|pre-existing|this PR scope|defer(red)?|later|future|待辦|之後|另案|未來|不在本次|另處理|先補' <<< "$rationale_reason"; then
        rationale_errors="${rationale_errors}
  • [P0] @story-trait-rationale reason is deferred rather than resolved: ${rationale_trait} -> ${rationale_target}"
        continue
      fi
      valid_rationale_traits="${valid_rationale_traits}
${rationale_trait}"
    else
      rationale_errors="${rationale_errors}
  • [P0] malformed @story-trait-rationale; expected: // @story-trait-rationale: <declared-trait> -> <existing-story-export> — <non-deferred reason>"
    fi
  done < <(grep '@story-trait-rationale:' <<< "$FULL" || true)

  has_trait_rationale() { grep -qx "$1" <<< "$valid_rationale_traits"; }

  # 2026-06-11 deep-audit R2(n=36):anatomy 分層 credit — 矩陣類 showcase 的 home 在 anatomy 層
  # (category-matrix stateComboMatrix/anatomyDiagram + dim 11 三層分工)。Drift 證據:12 個 hasSizes
  # 元件 SizeMatrix 全在 anatomy 檔,展示檔無 AllSizes;button.stories.tsx:2 等 16 檔被迫用
  # 舊 file-wide @story-trait-rationale 曾繞過整個 hook(marker hack = required-exports
  # 集合與分層 convention 漂移)。現在只接受上方 scoped grammar。
  # Credit 對照:hasSizes ← SizeMatrix / hasInteractiveStates ← StateBehavior。
  # 情境類 trait(isInputLike WithError / isSelectionMulti Group / isOverlay OpenSnapshot)仍 owned by
  # 展示層,不 credit(真保護不削弱)。
  ANATOMY_EXPORTS=""
  ANATOMY_HEADERS=""
  for af in "$COMP_DIR"/*.anatomy.stories.tsx "$COMP_DIR"/*.principles.stories.tsx; do
    [ -f "$af" ] || continue
    ANATOMY_EXPORTS="${ANATOMY_EXPORTS}
$(grep -oE '^export const [A-Z][a-zA-Z0-9]*' "$af" 2>/dev/null | awk '{print $3}')"
    ANATOMY_HEADERS="${ANATOMY_HEADERS}
$(awk '/^import[[:space:]]/{exit} {print}' "$af" 2>/dev/null)"
  done
  anatomy_has() { grep -qE "^${1}$" <<< "$ANATOMY_EXPORTS"; }
  anatomy_has_or_rationale() {
    anatomy_has "$1" && return 0
    grep -q '@anatomy-rationale:' <<< "$ANATOMY_HEADERS" \
      && grep -qE "(^|[^A-Za-z0-9])${1}([^A-Za-z0-9]|$)" <<< "$ANATOMY_HEADERS"
  }

  local violations="$rationale_errors"
  for trait in $TRAITS; do
    case "$trait" in
      hasSizes)
        if ! has_present "AllSizes" && ! has_trait_rationale "hasSizes"; then
          if grep -qE "^(Small|Medium|Large|SizeSm|SizeMd|SizeLg)$" <<< "$EXPORTS"; then
            violations="${violations}
  • [P0] hasSizes → per-size split,merge AllSizes(或遷 anatomy SizeMatrix)"
          elif ! anatomy_has_or_rationale "SizeMatrix"; then
            violations="${violations}
  • [P0] hasSizes → missing AllSizes(展示層)/ SizeMatrix(anatomy 層)"
          fi
        fi ;;
      hasInteractiveStates)
        has_contains "(Disabled|States|Modes)" || anatomy_has_or_rationale "StateBehavior" || has_trait_rationale "hasInteractiveStates" || violations="${violations}
  • [P0] hasInteractiveStates → missing Disabled/States/Modes(展示層)/ StateBehavior(anatomy 層)" ;;
      isOverlay)
        if ! has_present "OpenSnapshot" && ! grep -qE "(defaultOpen|useState\(true\))" <<< "$FULL" && ! has_trait_rationale "isOverlay"; then
          violations="${violations}
  • [P0] isOverlay → missing OpenSnapshot/defaultOpen"
        fi ;;
      isInputLike)
        has_present "WithError" || has_present "ErrorState" || has_trait_rationale "isInputLike" || violations="${violations}
  • [P0] isInputLike → missing WithError" ;;
      isSelectionMulti)
        has_present "VerticalGroup" || has_present "Group" || has_trait_rationale "isSelectionMulti" || violations="${violations}
  • [P0] isSelectionMulti → missing VerticalGroup/Group" ;;
    esac
  done

  if [ -n "$violations" ]; then
    if grep -q "\[P0\]" <<< "$violations"; then
      {
        echo ""
        echo "╔═══ R3 category — trait compliance 違規 ═══"
        echo "  Component: $(basename "$COMP_DIR") / Traits: $TRAITS"
        printf '%s' "$violations"
        echo ""
        echo "Scoped exception: // @story-trait-rationale: <declared-trait> -> <existing-story-export> — <non-deferred reason>"
      } >&2
      record_worst 2
    else
      echo "⚠️ R3 trait warn:$violations" >&2
    fi
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# R4 — title_canonical(non-canonical English-only `name:` 字段)
# ─────────────────────────────────────────────────────────────────────────────
rule_title_canonical() {
  [ "$EVENT" = "PostToolUse" ] && return 0
  case "$FILE_PATH" in *anatomy.stories.tsx|*principles.stories.tsx) return 0 ;; esac

  # Allowlist
  FIRST_LINES=$(sed -n '1,5p;5q' <<< "$NEW_CONTENT")
  grep -q '@story-name-canonical-allow:' <<< "$FIRST_LINES" && return 0
  if [ "${GOVERNANCE_WRITE_STATE_TRUST:-}" != "runner-v1" ] && [ -f "$FILE_PATH" ]; then
    DISK=$(sed -n '1,5p' "$FILE_PATH" 2>/dev/null || true)
    grep -q '@story-name-canonical-allow:' <<< "$DISK" && return 0
  fi

  WHITELIST='^(Default|Display|Anatomy|Overview|Inspector|ColorMatrix|SizeMatrix|StateBehavior|Accessibility|All[A-Z][a-z]+|Loading|Empty|Disabled|Error|Hover|Focus|Active|Pressed|FocusVisible)$'
  VIOLATIONS=$(printf '%s' "$NEW_CONTENT" | grep -oE "name:[[:space:]]*['\"][^'\"]*['\"]" | sed -E "s/name:[[:space:]]*['\"]([^'\"]*)['\"]/\1/" | while IFS= read -r name; do
    [ -z "$name" ] && continue
    if grep -qE '\([a-zA-Z]+\)|=[a-zA-Z]' <<< "$name"; then
      echo "  - \"$name\"  [leak: prop/parameter syntax]"; continue
    fi
    if LC_ALL=C grep -qE '[^\x00-\x7F]' <<< "$name"; then continue; fi
    if grep -qE "$WHITELIST" <<< "$name"; then continue; fi
    echo "  - \"$name\"  [pure English]"
  done)

  if [ -n "$VIOLATIONS" ]; then
    {
      echo ""
      echo "╔═══ R4 title_canonical — non-canonical English `name:` ═══"
      echo "[P1 WARN] ${FILE_PATH}"
      printf '%s\n' "$VIOLATIONS"
      echo "豁免:檔首 // @story-name-canonical-allow: <reason>"
    } >&2
    # P1 warn:not block
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# R5 — name_jargon(PostToolUse,reads from disk)
# ─────────────────────────────────────────────────────────────────────────────
rule_name_jargon() {
  [ "$EVENT" != "PostToolUse" ] && return 0
  if [ ! -e "$FILE_PATH" ] && [ ! -L "$FILE_PATH" ]; then
    return 0
  fi
  local SAFE_FILE
  SAFE_FILE=$(governance_hook_project_file_path "$FILE_PATH" 2>/dev/null) \
    || governance_hook_integrity_fail 'R5 story target escapes the project or crosses a symlink'
  if [ ! -f "$SAFE_FILE" ] || [ ! -r "$SAFE_FILE" ] || [ -L "$SAFE_FILE" ]; then
    governance_hook_integrity_fail 'R5 story target is unavailable or unsafe'
  fi

  local violations=""
  LAYER_HITS=$(grep -m 5 -nE "name:\s*['\"][^'\"]*\bL[0-9]\b" "$SAFE_FILE" 2>/dev/null)
  [ -n "$LAYER_HITS" ] && violations="${violations}
⚠️ story name 含 L<n> layer 代號:
${LAYER_HITS}
  → 改人話描述"

  CANON_HITS=$(grep -m 5 -nE "name:\s*['\"][^'\"]*\bcanonical\b" "$SAFE_FILE" 2>/dev/null)
  [ -n "$CANON_HITS" ] && violations="${violations}
⚠️ story name 含 'canonical' spec 內部術語:
${CANON_HITS}
  → 移除 canonical 後綴"

  SPEC_HITS=$(grep -m 3 -nE "name:\s*['\"][^'\"]*\(spec\b" "$SAFE_FILE" 2>/dev/null)
  [ -n "$SPEC_HITS" ] && violations="${violations}
⚠️ story name 引用 spec:
${SPEC_HITS}"

  # R5.5(2026-05-17 升級補 gap):中英夾雜 detection — common-word 應中文化
  # 對齊 story-rules.md「name: 必中文人話」+ M10 proactive scan。
  # Exempt list:framework / brand / DS API value names(中英並列習慣保留英)
  # Python single-file 一次掃整檔(grep regex 對 unicode + word-boundary 在 macOS bash 不穩)
  MIXED_HITS=$(python3 - "$SAFE_FILE" <<'PY'
import re
import sys

EXEMPT = re.compile(r'\b(cva|Radix|Polaris|Material|Atlassian|Carbon|Ant|Apple|MUI|TanStack|shadcn|Recharts|cmdk|dnd-kit|TypeScript|JavaScript|API|UI|UX|Jira|Stripe|Notion|Figma|Linear|GitHub|Gmail|Dropbox|Slack|Spotify|Discord|VS Code|Sketch|Storybook|Tailwind|onChange|onClick|ARIA|WCAG|FAQ|HSL|CSS|HTML|DOM|DS|F[1-9]|FAB|RWD|MVP|Token|Mode|Variant|Slot|Size|Field|Input|Button|Avatar|Badge|Chip|Tag|Subtle|Solid|Range|Multiple|Single|primary|secondary|tertiary|hover|focus|active|disabled|invalid|readonly|drag|drop|inline|block|naked|bare|fixed|absolute|sticky|null|true|false|Dialog|Sheet|Drawer|Popover|HoverCard|Tooltip|Toast|Notice|Alert|Combobox|Select|MultiSelect|SelectMenu|DropdownMenu|Menu|MenuItem|Sidebar|TreeView|Tabs|Tab|Accordion|Collapsible|Breadcrumb|Pagination|Stepper|Steps|DataTable|FileItem|FileUpload|FileViewer|PeoplePicker|NameCard|OverflowIndicator|Checkbox|Radio|RadioGroup|CheckboxGroup|Switch|SegmentedControl|Slider|Rating|NumberInput|TextArea|SearchBox|DatePicker|TimePicker|DateGrid|Calendar|Carousel|Skeleton|CircularProgress|ProgressBar|LinearProgress|Empty|ScrollArea|AspectRatio|Separator|Toolbar|Header|SurfaceHeader|ChromeHeader|DialogHeader|SheetHeader|PopoverHeader|SidebarHeader|TabsList|TabsTrigger|TabsContent|ColorMatrix|SizeMatrix|StateBehavior|Accessibility|Anatomy|Overview|Inspector|Usage|Default|withTabs|asChild)\b', re.I)
COMMON_JARGON = re.compile(r'\b(row|overlay|per-row|tree-table|chrome|offcanvas|flow|tag|tab|panel|sheet|popup)\b', re.I)
hits = 0
with open(sys.argv[1], encoding='utf-8') as story:
    for lineno, line in enumerate(story, 1):
        match = re.search(r"name:\s*['\"]([^'\"]+)['\"]", line)
        if not match:
            continue
        name = match.group(1)
        if not (re.search(r'[a-zA-Z]', name) and re.search(r'[\u4e00-\u9fff]', name)):
            continue
        stripped = EXEMPT.sub('', name)
        if COMMON_JARGON.search(stripped):
            print(f'{lineno}: {name}')
            hits += 1
            if hits >= 10:
                break
PY
) || governance_hook_integrity_fail 'R5 mixed-language story-name scan failed'
  [ -n "$MIXED_HITS" ] && violations="${violations}
⚠️ story name 中英夾雜(common-word jargon 應中文化):
${MIXED_HITS}
  → row→列 / overlay→浮層 / per-row→逐列 / tree-table→樹狀表格 / chrome→框架 / offcanvas→抽屜收合 / flow→流程 / tag→標籤"

  if [ -n "$violations" ]; then
    CTX=$(printf 'R5 name jargon:%b' "$violations")
    printf '%s\n' "$CTX" >&2
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# R6 — description_jargon(PostToolUse,reads disk — scans `description:` block)
# ─────────────────────────────────────────────────────────────────────────────
# 對齊 user 2026-05-11 糾正:CellErrors 描述出現 `Record<rowId:colId, string | string[]>`
# = 純 programmer jargon,不該在 stakeholder-facing story 描述。對齊 mindset #4「範例必
# 真實業務場景」。Scope:只看 `展示` 層的 stories(.stories.tsx),排除 anatomy /
# principles 因為那些是 dev-facing spec stories,props matrix 用 TS 簽名 OK。
rule_description_jargon() {
  [ "$EVENT" != "PostToolUse" ] && return 0
  if [ ! -e "$FILE_PATH" ] && [ ! -L "$FILE_PATH" ]; then
    return 0
  fi
  local SAFE_FILE
  SAFE_FILE=$(governance_hook_project_file_path "$FILE_PATH" 2>/dev/null) \
    || governance_hook_integrity_fail 'R6 story target escapes the project or crosses a symlink'
  if [ ! -f "$SAFE_FILE" ] || [ ! -r "$SAFE_FILE" ] || [ -L "$SAFE_FILE" ]; then
    governance_hook_integrity_fail 'R6 story target is unavailable or unsafe'
  fi
  # Skip anatomy / principles stories(dev-facing)
  case "$FILE_PATH" in
    *.anatomy.stories.tsx|*.principles.stories.tsx) return 0 ;;
  esac

  # Extract `description:` blocks(Storybook docs.description.{component,story})
  # Pattern conservative:catch backtick / quoted string lines after `description:` containing TS generics
  local violations=""

  # TS generic jargon in description string literals
  local TS_GENERIC_HITS
  TS_GENERIC_HITS=$(awk '
    function emit(line) {
      print line
      hits++
      if (hits >= 5) exit
    }
    /description[[:space:]]*:/ { in_desc=1; row=NR; next }
    in_desc && /^[[:space:]]*\}/ { in_desc=0 }
    in_desc && /Record[[:space:]]*</ { emit(NR": "$0); in_desc=2 }
    in_desc && /Partial[[:space:]]*</ { emit(NR": "$0); in_desc=2 }
    in_desc && /Promise[[:space:]]*</ { emit(NR": "$0); in_desc=2 }
    in_desc && /Awaited[[:space:]]*</ { emit(NR": "$0); in_desc=2 }
    in_desc && /Array[[:space:]]*</ { emit(NR": "$0); in_desc=2 }
    in_desc && /ReactNode/ { emit(NR": "$0); in_desc=2 }
    in_desc && /string[[:space:]]*\|[[:space:]]*string\[\]/ { emit(NR": "$0); in_desc=2 }
    in_desc && /string[[:space:]]*\|[[:space:]]*number/ { emit(NR": "$0); in_desc=2 }
  ' "$SAFE_FILE" 2>/dev/null) \
    || governance_hook_integrity_fail 'R6 type-jargon scan failed'

  [ -n "$TS_GENERIC_HITS" ] && violations="${violations}
⚠️ story description 含 TS generic / type-signature jargon(stakeholder-facing 應人話業務場景):
${TS_GENERIC_HITS}
  → 改寫成業務情境描述,避免 Record<...> / string | string[] / ReactNode 等 API 簽名"

  # Bare prop name in backticks inside description(e.g., \`onSelect\`, \`maxItems\`)
  # 這類 prop ref 在 anatomy story OK,展示 story 該描述「做什麼」不是「prop 叫什麼」
  local PROP_REF_HITS
  PROP_REF_HITS=$(awk '
    function emit(line) {
      print line
      hits++
      if (hits >= 3) exit
    }
    /description[[:space:]]*:/ { in_desc=1; next }
    in_desc && /^[[:space:]]*\}/ { in_desc=0 }
    in_desc && /`(on[A-Z]|enable[A-Z]|max[A-Z]|allow[A-Z]|use[A-Z]|set[A-Z])[a-zA-Z]+`/ { emit(NR": "$0) }
  ' "$SAFE_FILE" 2>/dev/null) \
    || governance_hook_integrity_fail 'R6 prop-reference scan failed'

  [ -n "$PROP_REF_HITS" ] && violations="${violations}
⚠️ story description 直接引用 prop 名(不該以 API 字典 思維寫描述):
${PROP_REF_HITS}
  → 改寫成「使用者看到什麼 / 業務情境是什麼」"

  if [ -n "$violations" ]; then
    CTX=$(printf 'R6 description jargon:%b\n豁免:檔首 // @description-jargon-allow: <reason>' "$violations")
    # Check allowlist marker
    local DISK_HEAD
    DISK_HEAD=$(head -3 "$SAFE_FILE" 2>/dev/null || true)
    if grep -qE '//[[:space:]]*@description-jargon-allow:' <<< "$DISK_HEAD"; then
      return 0
    fi
    printf '%s\n' "$CTX" >&2
  fi
}

# R7 — story_baseline_reference(PreToolUse Write/Edit,2026-05-20 codify per codex anti-drift D2)
# 偵測 stories.tsx wrap 既有 primitive(<Sidebar> / <ChromeHeader> / <DataTable> 等)但跡證顯示
# simplified mock(無 import 該 family helper / 無 @story-baseline marker)— context warn drift。
# Anti-pattern 錨例:AppShell story 用 <Sidebar> 但 <SidebarHeader><span>name</span> 取代既有 WorkspaceBrand。

rule_story_baseline_reference() {
  [ "$EVENT" = "PostToolUse" ] && return 0
  case "$TOOL" in
    Write|Edit|MultiEdit) ;;
    *) return 0 ;;
  esac

  case "$FILE_PATH" in
    *.stories.tsx) ;;
    *) return 0 ;;
  esac

  # 2026-06-11 R2 held-item #12:anatomy / principles 是 per-family 文件 story —— doc-table /
  # description 內 <Dialog> / <DataTable> 是說明文字非真 wrap,16 檔每次編輯固定 FP warn。
  # baseline-cite 要求 scope = scenario stories(story-rules.md「Production-grade composition
  # fidelity」);file-type skip 對齊 lib/_overlay_handcraft.sh L31 + R9 isOverlay-家 skip idiom。
  case "$FILE_PATH" in
    *.anatomy.stories.tsx|*.principles.stories.tsx) return 0 ;;
  esac

  # 跳 same-file:Sidebar / ChromeHeader / DataTable 自己的 stories 不檢查
  case "$FILE_PATH" in
    */Sidebar/*|*/DataTable/*|*/header-canonical/*|*/Dialog/*|*/Sheet/*|*/Popover/*) return 0 ;;
  esac

  # NEW_CONTENT is the trusted full after-image under proposed-text-v1 and the
  # authoritative provider-native field only for direct event-v1 fallback.
  local CONTENT="$NEW_CONTENT"

  # 偵測 wrap 既有 primitive 但無 baseline marker
  if grep -qE '<(Sidebar|ChromeHeader|DataTable|Dialog|Sheet)\b' <<< "$CONTENT"; then
    # 檢 @story-baseline marker(現有檔 OR 新內容)
    local HAS_BASELINE=0
    if [ "${GOVERNANCE_WRITE_STATE_TRUST:-}" != "runner-v1" ] && [ -f "$FILE_PATH" ]; then
      local DISK_HEAD
      DISK_HEAD=$(head -10 "$FILE_PATH" 2>/dev/null || true)
      if grep -qE '@story-baseline:' <<< "$DISK_HEAD"; then
        HAS_BASELINE=1
      fi
    fi
    local CONTENT_HEAD
    CONTENT_HEAD=$(head -10 <<< "$CONTENT")
    if grep -qE '@story-baseline:' <<< "$CONTENT_HEAD"; then
      HAS_BASELINE=1
    fi

    if [ "$HAS_BASELINE" -eq 0 ]; then
      echo "⚠️  R7 story_baseline_reference 違規:" >&2
      echo "   $FILE_PATH wrap <Sidebar|ChromeHeader|DataTable|Dialog|Sheet>" >&2
      echo "   但檔頭無 \`// @story-baseline: <path>#<StoryName>\` cite reference。" >&2
      echo "" >&2
      echo "   寫 stories wrap 既有 primitive 必先 grep family 完整佈局 story" >&2
      echo "   (eg. sidebar.stories IconCollapse / data-table.stories WithBulkActions)" >&2
      echo "   Read 其 helper(WorkspaceBrand / MAIN_NAV / PageContent / toolbar)當 baseline。" >&2
      echo "   詳 ${CANONICAL_RULE_REL}/story-rules.md 「Production-grade composition fidelity」 +" >&2
      echo "   ${CANONICAL_SKILL_REL}/story-writing/SKILL.md Phase 0 +" >&2
      echo "   memory/feedback_nearest_same_purpose_canonical.md" >&2
    fi

    # 偵測明顯 simplified mock anti-pattern
    # 2026-06-03 修(同 R8 bug class):tr 換行→空格 flatten(grep 逐行無法跨行)+ tag anchor 加 [^>]*> 容忍屬性
    # (真實 JSX 是 <ChromeHeader className=...> 多行,原 <ChromeHeader> 死匹配漏)。
    local CONTENT_FLAT7
    CONTENT_FLAT7=$(awk '
      BEGIN { first=1 }
      {
        if (!first) printf " "
        printf "%s", $0
        first=0
      }
    ' <<< "$CONTENT") \
      || governance_hook_integrity_fail 'R7 story content flatten failed'
    if grep -qE '<SidebarHeader[^>]*>[[:space:]]*<span' <<< "$CONTENT_FLAT7"; then
      echo "❌ R7 anti-pattern:<SidebarHeader><span> — 應 wrap WorkspaceBrand-like ItemAvatar block(per sidebar.stories IconCollapse baseline)" >&2
    fi
    if grep -qE '<SidebarMenuButton[^>]*>[^<]*<[A-Z][a-zA-Z]+[[:space:]]+className="size-' <<< "$CONTENT_FLAT7"; then
      echo "❌ R7 anti-pattern:<SidebarMenuButton><Icon className=\"size-N\"> — 應用 startIcon prop + tooltip prop(per sidebar.stories MAIN_NAV map)" >&2
    fi
    if grep -qE '<ChromeHeader[^>]*>.{0,160}<span[[:space:]]+className="[^"]*flex-1' <<< "$CONTENT_FLAT7"; then
      echo "❌ R7 anti-pattern:<ChromeHeader><span flex-1> — 應 SidebarTrigger + h1 緊鄰 gap-2(per sidebar.stories PageContent baseline)" >&2
    fi
  fi
}

# R8 — story_archetype_registry(PreToolUse Write/Edit,2026-05-20 codify per M35 + codex Layer B D4)
# Registry-driven nearest same-purpose canonical enforce。讀
# canonical `references/story-baseline-registry.json` antiPatterns regex,逐條 scan 寫入內容。
# Severity=block → record_worst 2;severity=warn → governance context。Allowlist
# `// @story-baseline-allow: <reason>` 整檔豁免。
# 2026-06-02 升 P0 BLOCKER(block-severity antiPattern):DS + consumer 全掃確認零現有違規後升級。

rule_story_archetype_registry() {
  [ "$EVENT" = "PostToolUse" ] && return 0
  case "$TOOL" in
    Write|Edit|MultiEdit) ;;
    *) return 0 ;;
  esac

  case "$FILE_PATH" in
    *.stories.tsx) ;;
    *) return 0 ;;
  esac

  # Skip self-family
  case "$FILE_PATH" in
    */Sidebar/*|*/DataTable/*|*/header-canonical/*|*/Dialog/*|*/Sheet/*|*/Popover/*) return 0 ;;
  esac

  local REGISTRY="$CANONICAL_REFERENCE_ROOT/story-baseline-registry.json"
  if [ -L "$REGISTRY" ] || [ ! -f "$REGISTRY" ] || [ ! -r "$REGISTRY" ]; then
    governance_hook_integrity_fail "R8 canonical story baseline registry is unavailable or unsafe:${REGISTRY}"
  fi
  if ! jq -e --arg owner "packages/design-system/ds-canonical/references/story-baseline-registry.json" '
    type == "object"
    and .schemaVersion == 1
    and ._meta.owner == $owner
    and (._meta.provider_view_policy | type == "string" and length > 0)
    and (.components | type == "object")
    and (.components | keys | sort) == ["ChromeHeader", "DataTable", "Sidebar"]
    and (
      . as $root
      | ["Sidebar", "DataTable", "ChromeHeader"] as $required
      | all($required[];
          . as $component
          | ($root.components[$component] | type == "object")
          and ($root.components[$component].antiPatterns | type == "array")
          and all($root.components[$component].antiPatterns[];
            type == "object"
            and (.severity == "block" or .severity == "warn")
            and (.regex | type == "string" and length > 0)
            and (.unlessRegex? == null or (.unlessRegex | type == "string"))
          )
        )
    )
  ' "$REGISTRY" >/dev/null 2>&1; then
    governance_hook_integrity_fail "R8 canonical story baseline registry is invalid:${REGISTRY}"
  fi

  local CONTENT="$NEW_CONTENT"

  # Allow override — 2026-06-03 修(同 fragment-vs-file bug class,對抗稽核抓到):Edit 只送 new_string
  # 片段,@story-baseline-allow marker 在檔頭(不在每次 edit 片段)→ 編輯有 marker 的 story 任一非
  # marker 行就被 R8 誤擋。補查整檔 disk head(對齊 R7 L499 disk-check 做法)。
  local CONTENT_HEAD
  CONTENT_HEAD=$(head -10 <<< "$CONTENT")
  if grep -qE '@story-baseline-allow:' <<< "$CONTENT_HEAD"; then
    return 0
  fi
  if [ "${GOVERNANCE_WRITE_STATE_TRUST:-}" != "runner-v1" ] \
    && { [ -e "$FILE_PATH" ] || [ -L "$FILE_PATH" ]; }; then
    local SAFE_FILE DISK_HEAD DISK_MARKER_RC
    SAFE_FILE=$(governance_hook_project_file_path "$FILE_PATH" 2>/dev/null) \
      || governance_hook_integrity_fail 'R8 story target escapes the project or crosses a symlink'
    if [ ! -f "$SAFE_FILE" ] || [ ! -r "$SAFE_FILE" ]; then
      governance_hook_integrity_fail 'R8 story target is unavailable or unsafe'
    fi
    DISK_HEAD=$(head -10 "$SAFE_FILE" 2>/dev/null) \
      || governance_hook_integrity_fail 'R8 story target read failed'
    grep -qE '@story-baseline-allow:' <<< "$DISK_HEAD" 2>/dev/null
    DISK_MARKER_RC=$?
    if [ "$DISK_MARKER_RC" -gt 1 ]; then
      governance_hook_integrity_fail 'R8 story allow-marker matcher failed'
    elif [ "$DISK_MARKER_RC" -eq 0 ]; then
      return 0
    fi
  fi

  # Read antiPatterns regex from registry(per component)
  # Iterate Sidebar/DataTable/ChromeHeader components
  local COMPONENTS="Sidebar DataTable ChromeHeader"
  # Flatten once in linear time. Bash's global newline substitution copies the
  # growing string repeatedly and becomes superlinear on full-file replays.
  local CONTENT_FLAT
  CONTENT_FLAT=$(awk '
    BEGIN { first=1 }
    {
      if (!first) printf " "
      printf "%s", $0
      first=0
    }
  ' <<< "$CONTENT") \
    || governance_hook_integrity_fail 'R8 story content flatten failed'
  for COMP in $COMPONENTS; do
    # Only check if file wraps this component
    grep -qE "<${COMP}\\b" <<< "$CONTENT" 2>/dev/null
    local COMPONENT_RC=$?
    if [ "$COMPONENT_RC" -gt 1 ]; then
      governance_hook_integrity_fail "R8 component matcher failed:${COMP}"
    elif [ "$COMPONENT_RC" -eq 1 ]; then
      continue
    fi

    # Read antiPatterns(block + warn 皆載;2026-07-04 dim 54 修:原只載 block → warn 條目=從未執行的紙防線)
    # 每條三行一組:severity / regex / unlessRegex(jq -r 原始輸出零跳脫;**禁 @tsv/插值** —
    # @tsv 把 regex 反斜線雙跳脫、插值 nested-quote 踩 jq lexer,2026-07-04 smoke 連抓兩雷)。
    # unlessRegex 選填 — ERE 不支援 negative lookahead,兩段式替代:match 且 unless 不 match 才 fire。
    local PATTERNS
    PATTERNS=$(jq -r --arg c "$COMP" '.components[$c].antiPatterns[]? | .severity, .regex, (.unlessRegex // "")' "$REGISTRY" 2>/dev/null) \
      || governance_hook_integrity_fail "R8 registry query failed for component:${COMP}"
    [ -z "$PATTERNS" ] && continue

    # 2026-06-03 修:CONTENT 換行 → 空格再 grep。真實 JSX 是多行(<ChromeHeader> 與 <span> 分行),
    # 而 grep -E 是 line-oriented + registry regex 用 [[:space:]] 可攜語法 → 不正規化的話多行 antiPattern
    # 靜默漏 = 假 P0(對抗稽核抓到)。tr 後整段成單行,[[:space:]]* / .* 才能跨原換行匹配。
    while read -r SEV && read -r PATTERN && { read -r UNLESS || true; }; do
      [ -z "$PATTERN" ] && continue
      # regex self-test(2026-07-04 dim 54:PCRE lookahead 混入曾致 grep exit 2 靜默永不 fire;fail-loud)
      grep -qE "$PATTERN" <<< "x" 2>/dev/null
      local REGEX_RC=$?
      if [ "$REGEX_RC" -gt 1 ]; then
        governance_hook_integrity_fail "R8 registry regex is not executable:${PATTERN}"
      fi
      if [ -n "$UNLESS" ]; then
        grep -qE "$UNLESS" <<< "x" 2>/dev/null
        REGEX_RC=$?
        if [ "$REGEX_RC" -gt 1 ]; then
          governance_hook_integrity_fail "R8 registry unlessRegex is not executable:${UNLESS}"
        fi
      fi
      grep -qE "$PATTERN" <<< "$CONTENT_FLAT" 2>/dev/null
      REGEX_RC=$?
      if [ "$REGEX_RC" -gt 1 ]; then
        governance_hook_integrity_fail "R8 registry matcher failed for component:${COMP}"
      elif [ "$REGEX_RC" -eq 0 ]; then
        # unlessRegex 存在且 match → 豁免(兩段式 negative)
        if [ -n "$UNLESS" ]; then
          grep -qE "$UNLESS" <<< "$CONTENT_FLAT" 2>/dev/null
          REGEX_RC=$?
          if [ "$REGEX_RC" -gt 1 ]; then
            governance_hook_integrity_fail "R8 registry unless matcher failed for component:${COMP}"
          elif [ "$REGEX_RC" -eq 0 ]; then
            continue
          fi
        fi
        echo "⚠️  R8 story_archetype_registry violation(severity: $SEV):" >&2
        echo "   $FILE_PATH wrap <$COMP> matches anti-pattern:" >&2
        echo "   regex: $PATTERN" >&2
        echo "   per registry: ${CANONICAL_REFERENCE_REL}/story-baseline-registry.json#components.$COMP.antiPatterns" >&2
        echo "" >&2
        echo "   修法:Read baseline story + helpers,抄 production archetype。" >&2
        echo "   或加 \`// @story-baseline-allow: <reason>\` 檔頭豁免(audit-logged)。" >&2
        echo "   詳 ${CANONICAL_RULE_REL}/meta-patterns.md M35 + governance/memory/feedback_nearest_same_purpose_canonical.md" >&2
        # 2026-06-02 升 P0 BLOCKER(block-severity record_worst);warn-severity context(2026-07-04 補實作)
        [ "$SEV" = "block" ] && record_worst 2
      fi
    done <<< "$PATTERNS"
  done
}

# ─────────────────────────────────────────────────────────────────────────────
# R9 — hand-craft overlay / chrome header(2026-06-04 codify per upload-manager 面板 drift)
# Story 內手刻 `<div ... px-[var(--layout-space-loose)] ... border-b border-divider ...>`
# = 浮層 / chrome header signature → 必消費 SurfaceHeader / PopoverHeader / DialogHeader primitive。
# 零誤判簽名(DS-wide 量測:px-loose + border-b border-divider 同 div 僅手刻 overlay header 用 —
# doc-table row 用 px-4 硬寫;真 overlay header 寫 `<SurfaceHeader>`,className 不外露)。
# Anchor:upload-manager 面板原手刻 `<div px-loose py-2 border-b border-divider>`(py-2≠py-tight /
# 殼 rounded-md≠lg / border-divider≠border / bg-surface≠raised),既有 3 道網全漏:
#   R1-C(要 div 有 absolute + 附近 onClose/dismiss)、_chrome_header_handcraft(skip stories +
#   只比 h-[chrome-header-height] signature)、R7/R8(只比已註冊 primitive 名)。adversarial workflow 確認。
# ─────────────────────────────────────────────────────────────────────────────
rule_handcraft_overlay_header() {
  # skip primitive / overlay 家(它們定義 / 示範 header primitive 本身)。
  # 含全部 isOverlay 元件家(2026-06-04 adversarial workflow R9-SKIP-001:補 HoverCard/Tooltip/DropdownMenu/FileViewer)。
  case "$FILE_PATH" in
    */overlay-surface/*|*/header-canonical/*|*/ChromeHeader/*|*/Dialog/*|*/Sheet/*|*/Popover/*|*/Coachmark/*|*/Tabs/*|*/HoverCard/*|*/Tooltip/*|*/DropdownMenu/*|*/FileViewer/*) return 0 ;;
  esac
  # allow escape(檔頭 OR 本次片段)
  local CONTENT_HEAD
  CONTENT_HEAD=$(head -10 <<< "$NEW_CONTENT")
  if grep -qE '@story-baseline-allow:' <<< "$CONTENT_HEAD"; then return 0; fi
  if [ "${GOVERNANCE_WRITE_STATE_TRUST:-}" != "runner-v1" ] && [ -f "$FILE_PATH" ]; then
    local DISK_HEAD
    DISK_HEAD=$(head -10 "$FILE_PATH" 2>/dev/null || true)
    if grep -qE '@story-baseline-allow:' <<< "$DISK_HEAD"; then return 0; fi
  fi
  local FLAT
  # 2026-06-04 adversarial workflow 抓 R9 regex 3 漏洞,robustify:
  #   (1) drop 純註解行(^//、^*、^/*、^{/*)再 flatten → 避免 commented-out / 描述用 JSX 含 pattern 誤判(FP-002);
  #       不 strip 行內 // (避免 mutilate https:// URL 造成 FN)。
  #   (2) token 間用 [^">]*(非 [^>]*)→ px-loose 與 border-b 必在「同一 className 字串」內,不跨 " 屬性邊界
  #       (FP-001:data-style="border-b border-divider" 不再誤判)。
  #   (3) border-b[[:space:]]+border-divider(非單空格)→ 多行 className flatten 後多空格不漏(FN-001,同 R8 multiline bug class)。
  FLAT=$(awk '
    BEGIN { first=1 }
    /^[[:space:]]*(\/\/|\*|\/\*|\{\/\*)/ { next }
    {
      if (!first) printf " "
      printf "%s", $0
      first=0
    }
  ' <<< "$NEW_CONTENT") \
    || governance_hook_integrity_fail 'R9 story content flatten failed'
  if grep -qE '<div[^>]*px-\[var\(--layout-space-loose\)\][^">]*border-b[[:space:]]+border-divider|<div[^>]*border-b[[:space:]]+border-divider[^">]*px-\[var\(--layout-space-loose\)\]' <<< "$FLAT"; then
    {
      echo "❌ R9 hand-craft overlay / chrome header:${FILE_PATH}"
      echo "   偵測到 <div ... px-[var(--layout-space-loose)] ... border-b border-divider> = 手刻浮層 / chrome header。"
      echo "   必消費 <SurfaceHeader>(patterns/overlay-surface)/ <PopoverHeader> / <DialogHeader>;"
      echo "   面板殼用 Popover 同款 chrome token(rounded-lg border-border bg-surface-raised elevation-200)。"
      echo "   理由:px-loose + divider border 的 header chrome 是 overlay-surface SSOT(px-loose py-tight + border-b);手刻 = drift。"
      echo "   Anchor:2026-06-04 upload-manager 面板手刻 header(py-2≠py-tight / 殼 token 全偏),user 抓。"
      echo "   豁免:檔頭加 // @story-baseline-allow: <reason>。"
    } >&2
    record_worst 2
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# R10 — link_canonical(2026-06-22 codify per user;color.spec.md「Action — Primary」)
# canonical 文字連結 = text-primary + hover:text-primary-hover(hover 換色,無底線);
# 禁 `text-primary hover:underline`(用底線取代換色)。真元件(Breadcrumb / LinkInput /
# Button / RadioGroup)已遵循;本 rule 防 story LinkTo 導覽連結復發 drift(曾累積 232 處)。
# P1 WARN(story 導覽 style 低風險,不 block)。豁免:檔首 `// @link-style-allow:`。
# ─────────────────────────────────────────────────────────────────────────────
rule_link_canonical() {
  [ "$EVENT" = "PostToolUse" ] && return 0
  grep -q '@link-style-allow:' <<< "$NEW_CONTENT" && return 0
  # text-primary …(中間可隔 tailwind class:cursor-pointer / font-medium 等)… hover:underline。
  # 中間段限 class-char [a-z0-9:_-] → 不誤判描述用 label「text-primary · hover:underline」(· 非 class-char)。
  if grep -qE 'text-primary([[:space:]]+[a-z0-9:_-]+)*[[:space:]]+hover:underline' <<< "$NEW_CONTENT"; then
    {
      echo ""
      echo "╔═══ R10 link_canonical — 連結 hover 樣式 drift ═══"
      echo "[P1 WARN] ${FILE_PATH}"
      echo "  偵測到 'text-primary hover:underline' = 用底線取代換色,偏離 canonical。"
      echo "  canonical(color.spec.md「Action — Primary」)= text-primary + hover:text-primary-hover(換色,無底線)。"
      echo "  修:hover:underline → hover:text-primary-hover。豁免:檔首 // @link-style-allow: <reason>"
    } >&2
    # P1 warn:not block
  fi
}

# ─── Run rules ───
rule_anatomy
rule_slot_split
rule_category
rule_title_canonical
rule_name_jargon
rule_description_jargon
rule_story_baseline_reference
rule_story_archetype_registry
rule_handcraft_overlay_header
rule_link_canonical

exit $WORST

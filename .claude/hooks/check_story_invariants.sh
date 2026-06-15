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
# Allowlist markers preserved 1-to-1:
#   R1: @anatomy-exempt: / @anatomy-exempt-next
#   R2: @story-split-rationale:
#   R3: @story-trait-rationale:
#   R4: @story-name-canonical-allow:
#   R5(no allowlist,reads disk;jargon catch is broad warning)

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)

# Common filters
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
case "$FILE_PATH" in *.stories.tsx) ;; *) exit 0 ;; esac

NEW_CONTENT=""
if [ "$EVENT" != "PostToolUse" ]; then
  NEW_CONTENT=$(echo "$INPUT" | jq -r '
    (.tool_input.content // "") + "\n" +
    (.tool_input.new_string // "") + "\n" +
    ([.tool_input.edits[]? | .new_string] | join("\n"))
  ' 2>/dev/null || echo "")
fi

WORST=0
record_worst() { local lvl=$1; [ "$lvl" -gt "$WORST" ] && WORST=$lvl; }

# ─────────────────────────────────────────────────────────────────────────────
# R1 — anatomy(PreToolUse,block raw JSX should consume DS canonical)
# ─────────────────────────────────────────────────────────────────────────────
rule_anatomy() {
  [ "$EVENT" = "PostToolUse" ] && return 0
  [ -z "${NEW_CONTENT//[[:space:]]/}" ] && return 0

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
  FIRST_LINES=$(printf '%s\n' "$NEW_CONTENT" | sed -n '1,3p')
  echo "$FIRST_LINES" | grep -qE '//[[:space:]]*@anatomy-exempt:' && return 0
  if [ -f "$FILE_PATH" ]; then
    ON_DISK=$(sed -n '1,3p' "$FILE_PATH" 2>/dev/null || true)
    echo "$ON_DISK" | grep -qE '//[[:space:]]*@anatomy-exempt:' && return 0
  fi

  TMP=$(mktemp); trap "rm -f $TMP" RETURN
  printf '%s\n' "$NEW_CONTENT" > "$TMP"

  local violations=""
  local skip_next=0
  local row=0
  local line
  while IFS= read -r line || [ -n "$line" ]; do
    row=$((row+1))
    if [ "$skip_next" = "1" ]; then skip_next=0; continue; fi
    if echo "$line" | grep -qE '//[[:space:]]*@anatomy-exempt-next|\{/\*[[:space:]]*@anatomy-exempt-next'; then
      skip_next=1; continue
    fi
    # A.1 raw item-anatomy row
    if echo "$line" | grep -qE '<div[^>]*className="[^"]*\bflex\b[^"]*\bitems-center\b[^"]*"[^>]*>[[:space:]]*<[A-Z]'; then
      first_tag=$(echo "$line" | grep -oE '<div[^>]*className="[^"]*\bflex\b[^"]*\bitems-center\b[^"]*"[^>]*>[[:space:]]*<[A-Z][a-zA-Z]*' | grep -oE '<[A-Z][a-zA-Z]*$' | head -1)
      case "$first_tag" in
        "<MenuItem"|"<ItemIcon"|"<ItemAvatar"|"<ItemLabel"|"<ItemSuffix"|"<ItemInlineAction"|"<ItemPrefix"|"<ItemContent"|"<Field"|"<FieldWrapper"|"<Empty"|"<Card"|"<Coachmark"|"<Dialog"|"<Sheet"|"<Popover"|"<HoverCard"|"<DataTable"|"<FileItem") ;;
        *)
          violations="${violations}
[A.1 hand-craft item-anatomy] ${FILE_PATH}:${row}
  > $(echo "$line" | sed 's/^[[:space:]]*//' | cut -c1-120)
  改用 <MenuItem> + slot components" ;;
      esac
    fi
    # A.2 raw <table> outside DataTable dir
    if ! echo "$FILE_PATH" | grep -qE '/DataTable/'; then
      if echo "$line" | grep -qE '<table\b'; then
        violations="${violations}
[A.2 raw <table>] ${FILE_PATH}:${row}
  > $(echo "$line" | sed 's/^[[:space:]]*//' | cut -c1-120)
  改用 <DataTable columns={...} data={...} />"
      fi
    fi
    # A.3 hand-craft full-surface loading
    if echo "$line" | grep -qE '<div[^>]*className="[^"]*\babsolute\b[^"]*\binset-0\b[^"]*\bflex\b'; then
      lookahead=$(sed -n "$((row+1)),$((row+4))p" "$TMP" 2>/dev/null || true)
      if echo "$line $lookahead" | grep -qE '\bCircularProgress\b'; then
        violations="${violations}
[A.3 hand-craft loading] ${FILE_PATH}:${row}
  > $(echo "$line" | sed 's/^[[:space:]]*//' | cut -c1-120)
  改用 <Empty icon={<CircularProgress />} description=\"...\" />"
      fi
    fi
    # A.4 hand-craft field control
    if echo "$line" | grep -qE '<input\b[^>]*className="[^"]*\bh-field-'; then
      violations="${violations}
[A.4 hand-craft field] ${FILE_PATH}:${row}
  > $(echo "$line" | sed 's/^[[:space:]]*//' | cut -c1-120)
  改用 <Input> / <NumberInput> / <Select> / <Combobox>"
    fi
    # B dismiss via label Button
    if echo "$line" | grep -qE '<Button\b[^>]*>[[:space:]]*(關閉|Close|Dismiss|取消|Cancel)[[:space:]]*</Button>'; then
      start=$((row-4)); [ $start -lt 1 ] && start=1
      end=$((row+4))
      ctx=$(sed -n "${start},${end}p" "$TMP" 2>/dev/null || true)
      if echo "$ctx" | grep -qE 'onClose\b|onDismiss\b|<(Dialog|Sheet|Popover|Coachmark|Surface)Header\b|setOpen\(false\)|dismiss'; then
        violations="${violations}
[B dismiss via label] ${FILE_PATH}:${row}
  > $(echo "$line" | sed 's/^[[:space:]]*//' | cut -c1-120)
  改用 iconOnly X Button"
      fi
    fi
    # C hand-crafted overlay
    if echo "$line" | grep -qE '<div[^>]*className="[^"]*\babsolute\b[^"]*(bg-|shadow-|border)'; then
      end=$((row+6))
      lookahead=$(sed -n "${row},${end}p" "$TMP" 2>/dev/null || true)
      if echo "$lookahead" | grep -qE 'onClose\b|onDismiss\b|setOpen\(false\)'; then
        violations="${violations}
[C hand-craft overlay] ${FILE_PATH}:${row}
  > $(echo "$line" | sed 's/^[[:space:]]*//' | cut -c1-120)
  改用 <Popover> / <HoverCard> / <Tooltip> / <Dialog>"
      fi
    fi
  done < "$TMP"

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
  FIRST_LINES=$(printf '%s\n' "$NEW_CONTENT" | sed -n '1,5p')
  echo "$FIRST_LINES" | grep -qE '//[[:space:]]*@story-split-rationale:' && return 0
  if [ -f "$FILE_PATH" ]; then
    DISK=$(sed -n '1,5p' "$FILE_PATH" 2>/dev/null || true)
    echo "$DISK" | grep -qE '//[[:space:]]*@story-split-rationale:' && return 0
  fi

  local violations=""
  local FULL="$NEW_CONTENT"
  HAS_START=$(echo "$FULL" | grep -cE 'export const WithStartIcon\b' || true)
  HAS_END=$(echo "$FULL" | grep -cE 'export const WithEndIcon\b' || true)
  if [ "${HAS_START:-0}" -gt 0 ] && [ "${HAS_END:-0}" -gt 0 ]; then
    violations="${violations}
[反 pattern] WithStartIcon + WithEndIcon 拆兩 story → 合併 WithIcon"
  fi
  HAS_DEFAULT=$(echo "$FULL" | grep -cE 'export const Default\b' || true)
  HAS_ALL_VAR=$(echo "$FULL" | grep -cE 'export const AllVariants\b' || true)
  if [ "${HAS_DEFAULT:-0}" -gt 0 ] && [ "${HAS_ALL_VAR:-0}" -gt 0 ]; then
    violations="${violations}
[反 pattern] Default + AllVariants 同檔 → AllVariants 已 cover default"
  fi
  PRIM=$(echo "$FULL" | grep -cE 'export const (Primary|Secondary|Tertiary)\b' || true)
  if [ "${PRIM:-0}" -ge 2 ]; then
    violations="${violations}
[反 pattern] 多 variant stories 拆細 → 合併 AllVariants 對照 grid"
  fi
  if echo "$FULL" | grep -qE '^export const Variants(\b|:|\s|=)'; then
    violations="${violations}
[命名漂移] Variants → AllVariants"
  fi
  if echo "$FULL" | grep -qE '^export const Basic(\b|:|\s|=)'; then
    violations="${violations}
[命名漂移] Basic → Default"
  fi
  if echo "$FULL" | grep -qE '^export const (DisabledState|DisabledGroup)(\b|:|\s|=)'; then
    violations="${violations}
[命名漂移] DisabledState/Group → Disabled"
  fi
  if echo "$FULL" | grep -qE '^export const SizeVariants(\b|:|\s|=)'; then
    violations="${violations}
[命名漂移] SizeVariants → AllSizes"
  fi
  if echo "$FULL" | grep -qE '^export const [^a-zA-Z_$]'; then
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

  # Allowlist — check new content AND disk (align with R4 behavior)
  echo "$NEW_CONTENT" | grep -q "@story-trait-rationale:" && return 0
  if [ -f "$FILE_PATH" ]; then
    DISK_HEAD=$(sed -n '1,5p' "$FILE_PATH" 2>/dev/null || true)
    echo "$DISK_HEAD" | grep -q '@story-trait-rationale:' && return 0
  fi

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
  if printf '%s\n' "$FRONTMATTER" | grep -q "^traits:"; then
    TRAITS=$(printf '%s\n' "$FRONTMATTER" | awk '/^traits:/{i=1;next} i&&/^  - /{sub(/^  - /,"");print;next} i&&!/^  /{i=0}' | tr '\n' ' ')
  fi
  [ -z "$TRAITS" ] && return 0

  # 2026-06-11 deep-audit R2(n=36):category-matrix.json 為 SSOT(對齊 audit dim 11)—
  # traitShape != true 的 category(internal=optional / pattern / token / template)不跑 trait 檢查。
  # Category resolution 消費既有 classification SSOT(M23,scripts/category-classification-invariant.mjs
  # L73-77 resolveCategory):internal 權威訊號 = frontmatter `internal: true` OR traits `- isInternal`
  # (9 元件用 trait 形式:Command / SelectMenu / HoverCard 等);patterns/ → pattern;其餘 components/
  # → component。Registry path 用 CLAUDE_PROJECT_DIR fallback(R8 同 idiom,防相對路徑靜默失效)。
  CAT_MATRIX="${CLAUDE_PROJECT_DIR:-.}/packages/design-system/src/story-governance/category-matrix.json"
  if [ -f "$CAT_MATRIX" ]; then
    UNIT_CATEGORY="component"
    case "$FILE_PATH" in */patterns/*) UNIT_CATEGORY="pattern" ;; esac
    printf '%s\n' "$FRONTMATTER" | grep -qE '^internal:[[:space:]]*true|^[[:space:]]*-?[[:space:]]*isInternal\b' && UNIT_CATEGORY="internal"
    TRAIT_SHAPE=$(jq -r --arg c "$UNIT_CATEGORY" '.categories[$c].traitShape // empty' "$CAT_MATRIX" 2>/dev/null)
    [ "$TRAIT_SHAPE" != "true" ] && return 0
  fi

  EXISTING=""
  [ -f "$FILE_PATH" ] && EXISTING=$(cat "$FILE_PATH" 2>/dev/null || echo "")
  FULL="${EXISTING}
${NEW_CONTENT}"
  EXPORTS=$(echo "$FULL" | grep -oE "^export const [A-Z][a-zA-Z]+" | awk '{print $3}' | sort -u)

  has_present() { echo "$EXPORTS" | grep -qE "^${1}$"; }
  has_contains() { echo "$EXPORTS" | grep -qE "${1}"; }

  # 2026-06-11 deep-audit R2(n=36):anatomy 分層 credit — 矩陣類 showcase 的 home 在 anatomy 層
  # (category-matrix stateComboMatrix/anatomyDiagram + dim 11 三層分工)。Drift 證據:12 個 hasSizes
  # 元件 SizeMatrix 全在 anatomy 檔,展示檔無 AllSizes;button.stories.tsx:2 等 16 檔被迫用
  # @story-trait-rationale escape marker 繞 hook(marker hack = required-exports 集合與分層 convention 漂移)。
  # Credit 對照:hasSizes ← SizeMatrix / Default-AllVariants ← ColorMatrix / hasInteractiveStates ← StateBehavior。
  # 情境類 trait(isInputLike WithError / isSelectionMulti Group / isOverlay OpenSnapshot)仍 owned by
  # 展示層,不 credit(真保護不削弱)。
  ANATOMY_EXPORTS=""
  for af in "$COMP_DIR"/*.anatomy.stories.tsx "$COMP_DIR"/*.principles.stories.tsx; do
    [ -f "$af" ] || continue
    ANATOMY_EXPORTS="${ANATOMY_EXPORTS}
$(grep -oE '^export const [A-Z][a-zA-Z]+' "$af" 2>/dev/null | awk '{print $3}')"
  done
  anatomy_has() { echo "$ANATOMY_EXPORTS" | grep -qE "^${1}$"; }

  local violations=""
  if ! has_present "Default" && ! has_present "AllVariants" && ! anatomy_has "ColorMatrix"; then
    violations="${violations}
  • [P1 warn] missing Default/AllVariants story(anatomy ColorMatrix 亦可)"
  fi
  for trait in $TRAITS; do
    case "$trait" in
      hasSizes)
        if ! has_present "AllSizes"; then
          if echo "$EXPORTS" | grep -qE "^(Small|Medium|Large|SizeSm|SizeMd|SizeLg)$"; then
            violations="${violations}
  • [P0] hasSizes → per-size split,merge AllSizes(或遷 anatomy SizeMatrix)"
          elif ! anatomy_has "SizeMatrix"; then
            violations="${violations}
  • [P0] hasSizes → missing AllSizes(展示層)/ SizeMatrix(anatomy 層)"
          fi
        fi ;;
      hasInteractiveStates)
        has_contains "(Disabled|States|Modes)" || anatomy_has "StateBehavior" || violations="${violations}
  • [P0] hasInteractiveStates → missing Disabled/States/Modes(展示層)/ StateBehavior(anatomy 層)" ;;
      isOverlay)
        if ! has_present "OpenSnapshot" && ! echo "$FULL" | grep -qE "(defaultOpen|useState\(true\))"; then
          violations="${violations}
  • [P0] isOverlay → missing OpenSnapshot/defaultOpen"
        fi ;;
      isInputLike)
        has_present "WithError" || has_present "ErrorState" || violations="${violations}
  • [P0] isInputLike → missing WithError" ;;
      isSelectionMulti)
        has_present "VerticalGroup" || has_present "Group" || violations="${violations}
  • [P0] isSelectionMulti → missing VerticalGroup/Group" ;;
    esac
  done

  if [ -n "$violations" ]; then
    if echo "$violations" | grep -q "\[P0\]"; then
      {
        echo ""
        echo "╔═══ R3 category — trait compliance 違規 ═══"
        echo "  Component: $(basename "$COMP_DIR") / Traits: $TRAITS"
        printf '%s' "$violations"
        echo ""
        echo "豁免:檔首 // @story-trait-rationale: <reason>"
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
  FIRST_LINES=$(printf '%s\n' "$NEW_CONTENT" | sed -n '1,5p')
  echo "$FIRST_LINES" | grep -q '@story-name-canonical-allow:' && return 0
  if [ -f "$FILE_PATH" ]; then
    DISK=$(sed -n '1,5p' "$FILE_PATH" 2>/dev/null || true)
    echo "$DISK" | grep -q '@story-name-canonical-allow:' && return 0
  fi

  WHITELIST='^(Default|Display|Anatomy|Overview|Inspector|ColorMatrix|SizeMatrix|StateBehavior|Accessibility|All[A-Z][a-z]+|Loading|Empty|Disabled|Error|Hover|Focus|Active|Pressed|FocusVisible)$'
  VIOLATIONS=$(printf '%s' "$NEW_CONTENT" | grep -oE "name:[[:space:]]*['\"][^'\"]*['\"]" | sed -E "s/name:[[:space:]]*['\"]([^'\"]*)['\"]/\1/" | while IFS= read -r name; do
    [ -z "$name" ] && continue
    if echo "$name" | grep -qE '\([a-zA-Z]+\)|=[a-zA-Z]'; then
      echo "  - \"$name\"  [leak: prop/parameter syntax]"; continue
    fi
    if echo "$name" | LC_ALL=C grep -qE '[^\x00-\x7F]'; then continue; fi
    if echo "$name" | grep -qE "$WHITELIST"; then continue; fi
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
  [ ! -f "$FILE_PATH" ] && return 0

  local violations=""
  LAYER_HITS=$(grep -nE "name:\s*['\"][^'\"]*\bL[0-9]\b" "$FILE_PATH" 2>/dev/null | head -5)
  [ -n "$LAYER_HITS" ] && violations="${violations}
⚠️ story name 含 L<n> layer 代號:
${LAYER_HITS}
  → 改人話描述"

  CANON_HITS=$(grep -nE "name:\s*['\"][^'\"]*\bcanonical\b" "$FILE_PATH" 2>/dev/null | head -5)
  [ -n "$CANON_HITS" ] && violations="${violations}
⚠️ story name 含 'canonical' spec 內部術語:
${CANON_HITS}
  → 移除 canonical 後綴"

  SPEC_HITS=$(grep -nE "name:\s*['\"][^'\"]*\(spec\b" "$FILE_PATH" 2>/dev/null | head -3)
  [ -n "$SPEC_HITS" ] && violations="${violations}
⚠️ story name 引用 spec:
${SPEC_HITS}"

  # R5.5(2026-05-17 升級補 gap):中英夾雜 detection — common-word 應中文化
  # 對齊 story-rules.md「name: 必中文人話」+ M10 proactive scan。
  # Exempt list:framework / brand / DS API value names(中英並列習慣保留英)
  # Python single-file 一次掃整檔(grep regex 對 unicode + word-boundary 在 macOS bash 不穩)
  MIXED_HITS=$(python3 -c "
import re, sys
EXEMPT = re.compile(r'\b(cva|Radix|Polaris|Material|Atlassian|Carbon|Ant|Apple|MUI|TanStack|shadcn|Recharts|cmdk|dnd-kit|TypeScript|JavaScript|API|UI|UX|Jira|Stripe|Notion|Figma|Linear|GitHub|Gmail|Dropbox|Slack|Spotify|Discord|VS Code|Sketch|Storybook|Tailwind|onChange|onClick|ARIA|WCAG|FAQ|HSL|CSS|HTML|DOM|DS|F[1-9]|FAB|RWD|MVP|Token|Mode|Variant|Slot|Size|Field|Input|Button|Avatar|Badge|Chip|Tag|Subtle|Solid|Range|Multiple|Single|primary|secondary|tertiary|hover|focus|active|disabled|invalid|readonly|drag|drop|inline|block|naked|bare|fixed|absolute|sticky|null|true|false|Dialog|Sheet|Drawer|Popover|HoverCard|Tooltip|Toast|Notice|Alert|Combobox|Select|MultiSelect|SelectMenu|DropdownMenu|Menu|MenuItem|Sidebar|TreeView|Tabs|Tab|Accordion|Collapsible|Breadcrumb|Pagination|Stepper|Steps|DataTable|FileItem|FileUpload|FileViewer|PeoplePicker|NameCard|OverflowIndicator|Checkbox|Radio|RadioGroup|CheckboxGroup|Switch|SegmentedControl|Slider|Rating|NumberInput|TextArea|SearchBox|DatePicker|TimePicker|DateGrid|Calendar|Carousel|Skeleton|CircularProgress|ProgressBar|LinearProgress|Empty|ScrollArea|AspectRatio|Separator|Toolbar|Header|SurfaceHeader|ChromeHeader|DialogHeader|SheetHeader|PopoverHeader|SidebarHeader|TabsList|TabsTrigger|TabsContent|ColorMatrix|SizeMatrix|StateBehavior|Accessibility|Anatomy|Overview|Inspector|Usage|Default|withTabs|asChild)\b', re.I)
COMMON_JARGON = re.compile(r'\b(row|overlay|per-row|tree-table|chrome|offcanvas|flow|tag|tab|panel|sheet|popup)\b', re.I)
with open('$FILE_PATH') as f:
    for lineno, line in enumerate(f, 1):
        m = re.search(r\"name:\s*['\\\"]([^'\\\"]+)['\\\"]\", line)
        if not m: continue
        name = m.group(1)
        if not (re.search(r'[a-zA-Z]', name) and re.search(r'[\u4e00-\u9fff]', name)):
            continue
        stripped = EXEMPT.sub('', name)
        if COMMON_JARGON.search(stripped):
            print(f'{lineno}: {name}')
" 2>/dev/null | head -10)
  [ -n "$MIXED_HITS" ] && violations="${violations}
⚠️ story name 中英夾雜(common-word jargon 應中文化):
${MIXED_HITS}
  → row→列 / overlay→浮層 / per-row→逐列 / tree-table→樹狀表格 / chrome→框架 / offcanvas→抽屜收合 / flow→流程 / tag→標籤"

  if [ -n "$violations" ]; then
    CTX=$(printf 'R5 name jargon:%b' "$violations")
    jq -n --arg ctx "$CTX" '{
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: $ctx }
    }'
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
  [ ! -f "$FILE_PATH" ] && return 0
  # Skip anatomy / principles stories(dev-facing)
  case "$FILE_PATH" in
    *.anatomy.stories.tsx|*.principles.stories.tsx) return 0 ;;
  esac

  # Extract `description:` blocks(Storybook docs.description.{component,story})
  # Pattern conservative:catch backtick / quoted string lines after `description:` containing TS generics
  local violations=""

  # TS generic jargon in description string literals
  local TS_GENERIC_HITS=$(awk '
    /description[[:space:]]*:/ { in_desc=1; row=NR; next }
    in_desc && /^[[:space:]]*\}/ { in_desc=0 }
    in_desc && /Record[[:space:]]*</ { print NR": "$0; in_desc=2 }
    in_desc && /Partial[[:space:]]*</ { print NR": "$0; in_desc=2 }
    in_desc && /Promise[[:space:]]*</ { print NR": "$0; in_desc=2 }
    in_desc && /Awaited[[:space:]]*</ { print NR": "$0; in_desc=2 }
    in_desc && /Array[[:space:]]*</ { print NR": "$0; in_desc=2 }
    in_desc && /ReactNode/ { print NR": "$0; in_desc=2 }
    in_desc && /string[[:space:]]*\|[[:space:]]*string\[\]/ { print NR": "$0; in_desc=2 }
    in_desc && /string[[:space:]]*\|[[:space:]]*number/ { print NR": "$0; in_desc=2 }
  ' "$FILE_PATH" 2>/dev/null | head -5)

  [ -n "$TS_GENERIC_HITS" ] && violations="${violations}
⚠️ story description 含 TS generic / type-signature jargon(stakeholder-facing 應人話業務場景):
${TS_GENERIC_HITS}
  → 改寫成業務情境描述,避免 Record<...> / string | string[] / ReactNode 等 API 簽名"

  # Bare prop name in backticks inside description(e.g., \`onSelect\`, \`maxItems\`)
  # 這類 prop ref 在 anatomy story OK,展示 story 該描述「做什麼」不是「prop 叫什麼」
  local PROP_REF_HITS=$(awk '
    /description[[:space:]]*:/ { in_desc=1; next }
    in_desc && /^[[:space:]]*\}/ { in_desc=0 }
    in_desc && /`(on[A-Z]|enable[A-Z]|max[A-Z]|allow[A-Z]|use[A-Z]|set[A-Z])[a-zA-Z]+`/ { print NR": "$0 }
  ' "$FILE_PATH" 2>/dev/null | head -3)

  [ -n "$PROP_REF_HITS" ] && violations="${violations}
⚠️ story description 直接引用 prop 名(不該以 API 字典 思維寫描述):
${PROP_REF_HITS}
  → 改寫成「使用者看到什麼 / 業務情境是什麼」"

  if [ -n "$violations" ]; then
    CTX=$(printf 'R6 description jargon:%b\n豁免:檔首 // @description-jargon-allow: <reason>' "$violations")
    # Check allowlist marker
    if head -3 "$FILE_PATH" | grep -qE '//[[:space:]]*@description-jargon-allow:'; then
      return 0
    fi
    jq -n --arg ctx "$CTX" '{
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: $ctx }
    }'
  fi
}

# R7 — story_baseline_reference(PreToolUse Write/Edit,2026-05-20 codify per codex anti-drift D2)
# 偵測 stories.tsx wrap 既有 primitive(<Sidebar> / <ChromeHeader> / <DataTable> 等)但跡證顯示
# simplified mock(無 import 該 family helper / 無 @story-baseline marker)— stderr warn drift。
# Anti-pattern 錨例:AppShell story 用 <Sidebar> 但 <SidebarHeader><span>name</span> 取代既有 WorkspaceBrand。

rule_story_baseline_reference() {
  case "$TOOL" in
    Write|Edit) ;;
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

  # 抓寫入內容
  local CONTENT=""
  if [ "$TOOL" = "Write" ]; then
    CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // ""')
  else
    CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // ""')
  fi

  # 偵測 wrap 既有 primitive 但無 baseline marker
  if echo "$CONTENT" | grep -qE '<(Sidebar|ChromeHeader|DataTable|Dialog|Sheet)\b'; then
    # 檢 @story-baseline marker(現有檔 OR 新內容)
    local HAS_BASELINE=0
    if [ -f "$FILE_PATH" ] && head -10 "$FILE_PATH" 2>/dev/null | grep -qE '@story-baseline:'; then
      HAS_BASELINE=1
    fi
    if echo "$CONTENT" | head -10 | grep -qE '@story-baseline:'; then
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
      echo "   詳 .claude/rules/story-rules.md 「Production-grade composition fidelity」 +" >&2
      echo "   .claude/skills/story-writing/SKILL.md Phase 0 +" >&2
      echo "   memory/feedback_nearest_same_purpose_canonical.md" >&2
    fi

    # 偵測明顯 simplified mock anti-pattern
    # 2026-06-03 修(同 R8 bug class):tr 換行→空格 flatten(grep 逐行無法跨行)+ tag anchor 加 [^>]*> 容忍屬性
    # (真實 JSX 是 <ChromeHeader className=...> 多行,原 <ChromeHeader> 死匹配漏)。
    local CONTENT_FLAT7
    CONTENT_FLAT7=$(echo "$CONTENT" | tr '\n' ' ')
    if echo "$CONTENT_FLAT7" | grep -qE '<SidebarHeader[^>]*>[[:space:]]*<span'; then
      echo "❌ R7 anti-pattern:<SidebarHeader><span> — 應 wrap WorkspaceBrand-like ItemAvatar block(per sidebar.stories IconCollapse baseline)" >&2
    fi
    if echo "$CONTENT_FLAT7" | grep -qE '<SidebarMenuButton[^>]*>[^<]*<[A-Z][a-zA-Z]+[[:space:]]+className="size-'; then
      echo "❌ R7 anti-pattern:<SidebarMenuButton><Icon className=\"size-N\"> — 應用 startIcon prop + tooltip prop(per sidebar.stories MAIN_NAV map)" >&2
    fi
    if echo "$CONTENT_FLAT7" | grep -qE '<ChromeHeader[^>]*>.{0,160}<span[[:space:]]+className="[^"]*flex-1'; then
      echo "❌ R7 anti-pattern:<ChromeHeader><span flex-1> — 應 SidebarTrigger + h1 緊鄰 gap-2(per sidebar.stories PageContent baseline)" >&2
    fi
  fi
}

# R8 — story_archetype_registry(PreToolUse Write/Edit,2026-05-20 codify per M35 + codex Layer B D4)
# Registry-driven nearest same-purpose canonical enforce。讀
# `.claude/references/story-baseline-registry.json` antiPatterns regex,逐條 scan 寫入內容。
# Severity=block → record_worst 2;severity=warn → stderr only。Allowlist
# `// @story-baseline-allow: <reason>` 整檔豁免。
# 2026-06-02 升 P0 BLOCKER(block-severity antiPattern):DS + consumer 全掃確認零現有違規後升級。

rule_story_archetype_registry() {
  case "$TOOL" in
    Write|Edit) ;;
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

  local REGISTRY="${CLAUDE_PROJECT_DIR:-.}/.claude/references/story-baseline-registry.json"
  [ -f "$REGISTRY" ] || return 0

  local CONTENT=""
  if [ "$TOOL" = "Write" ]; then
    CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // ""')
  else
    CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // ""')
  fi

  # Allow override — 2026-06-03 修(同 fragment-vs-file bug class,對抗稽核抓到):Edit 只送 new_string
  # 片段,@story-baseline-allow marker 在檔頭(不在每次 edit 片段)→ 編輯有 marker 的 story 任一非
  # marker 行就被 R8 誤擋。補查整檔 disk head(對齊 R7 L499 disk-check 做法)。
  if echo "$CONTENT" | head -10 | grep -qE '@story-baseline-allow:'; then
    return 0
  fi
  if [ -f "$FILE_PATH" ] && head -10 "$FILE_PATH" 2>/dev/null | grep -qE '@story-baseline-allow:'; then
    return 0
  fi

  # Read antiPatterns regex from registry(per component)
  # Iterate Sidebar/DataTable/ChromeHeader components
  local COMPONENTS="Sidebar DataTable ChromeHeader"
  for COMP in $COMPONENTS; do
    # Only check if file wraps this component
    if ! echo "$CONTENT" | grep -qE "<${COMP}\\b"; then
      continue
    fi

    # Read antiPatterns regex list(P0 block only — warn ship later)
    local PATTERNS
    PATTERNS=$(jq -r --arg c "$COMP" '.components[$c].antiPatterns[]? | select(.severity == "block") | .regex' "$REGISTRY" 2>/dev/null)
    [ -z "$PATTERNS" ] && continue

    # 2026-06-03 修:CONTENT 換行 → 空格再 grep。真實 JSX 是多行(<ChromeHeader> 與 <span> 分行),
    # 而 grep -E 是 line-oriented + registry regex 用 [[:space:]] 可攜語法 → 不正規化的話多行 antiPattern
    # 靜默漏 = 假 P0(對抗稽核抓到)。tr 後整段成單行,[[:space:]]* / .* 才能跨原換行匹配。
    local CONTENT_FLAT
    CONTENT_FLAT=$(echo "$CONTENT" | tr '\n' ' ')
    while IFS= read -r PATTERN; do
      [ -z "$PATTERN" ] && continue
      if echo "$CONTENT_FLAT" | grep -qE "$PATTERN"; then
        echo "⚠️  R8 story_archetype_registry violation:" >&2
        echo "   $FILE_PATH wrap <$COMP> matches anti-pattern:" >&2
        echo "   regex: $PATTERN" >&2
        echo "   per registry: .claude/references/story-baseline-registry.json#components.$COMP.antiPatterns" >&2
        echo "" >&2
        echo "   修法:Read baseline story + helpers,抄 production archetype。" >&2
        echo "   或加 \`// @story-baseline-allow: <reason>\` 檔頭豁免(audit-logged)。" >&2
        echo "   詳 .claude/rules/meta-patterns.md M35 + memory/feedback_nearest_same_purpose_canonical.md" >&2
        record_worst 2  # 2026-06-02 升 P0 BLOCKER:DS + consumer(ds-product-template)全掃確認零現有違規後升級(原 2026-05-20 ship-as-warn 的 TODO 條件達成);只 block-severity antiPattern(warn-severity 仍 stderr-only)
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
  if echo "$NEW_CONTENT" | head -10 | grep -qE '@story-baseline-allow:'; then return 0; fi
  if [ -f "$FILE_PATH" ] && head -10 "$FILE_PATH" 2>/dev/null | grep -qE '@story-baseline-allow:'; then return 0; fi
  local FLAT
  # 2026-06-04 adversarial workflow 抓 R9 regex 3 漏洞,robustify:
  #   (1) drop 純註解行(^//、^*、^/*、^{/*)再 flatten → 避免 commented-out / 描述用 JSX 含 pattern 誤判(FP-002);
  #       不 strip 行內 // (避免 mutilate https:// URL 造成 FN)。
  #   (2) token 間用 [^">]*(非 [^>]*)→ px-loose 與 border-b 必在「同一 className 字串」內,不跨 " 屬性邊界
  #       (FP-001:data-style="border-b border-divider" 不再誤判)。
  #   (3) border-b[[:space:]]+border-divider(非單空格)→ 多行 className flatten 後多空格不漏(FN-001,同 R8 multiline bug class)。
  FLAT=$(echo "$NEW_CONTENT" | grep -vE '^[[:space:]]*(//|\*|/\*|\{/\*)' | tr '\n' ' ')
  if echo "$FLAT" | grep -qE '<div[^>]*px-\[var\(--layout-space-loose\)\][^">]*border-b[[:space:]]+border-divider|<div[^>]*border-b[[:space:]]+border-divider[^">]*px-\[var\(--layout-space-loose\)\]'; then
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

exit $WORST

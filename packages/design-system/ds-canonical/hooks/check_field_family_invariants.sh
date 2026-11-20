#!/bin/bash
# Field family unified invariant hook(2026-05-08 cluster A consolidation)
#
# Merges PreToolUse hooks(原各檔已 retire,合併入此)— 共 6 條 sub-rules:
#   A.1 naked row-mode propagation(原 check_naked_row_mode_propagation,P0 BLOCKER)
#   A.2 FieldControlGroup wrapper direct child(原 check_field_control_group_direct_child;2026-11-21 起 P0 BLOCKER)
#   A.3 Field state ring SSOT(原 check_field_state_token_consume,P0 BLOCKER;4 sub-rules ——
#       A.3.3「欄位開著的框」於 2026-11-13 改寫、A.3.4「data-field-open 記號」同日新增)
#   A.4 disabled placeholder color(原 check_disabled_placeholder_color;2026-11-21 起 P0 BLOCKER,M24)
#   A.5 _Group child fieldCtx.id 隔離(2026-05-31 折入,M4 AR34 regression detector,P0 BLOCKER)
#   A.6 空值顯示 SSOT(2026-07-08 user 拍板半形 hyphen,P0 BLOCKER)
#
# Why merge:皆 Field 家族 invariant,共用 INPUT parsing + Edit/Write filter pattern,
#   分散在 4 個 hook 是「散裝 SSOT」(M17 + Anthropic ≤ 15 hook best practice 違反)。
#
# Output precedence:BLOCK(2,stderr)> silent(0)。
#   2026-11-21 A.2 / A.4 由「只提醒」升為擋(knowledge-prune D4-02 / WP-15b:SSOT invariant 不得只提醒,
#   governance/memory/feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md),本檔已沒有只提醒的規則;
#   exit 0 帶輸出的路徑只剩收容非預期輸出(仍包成 governanceContext,不靜默丟掉),所以 outputMode 維持 governance-context-or-block。
#   A.2 / A.4 的觸發只看這次寫入的內容(NEW_CONTENT),檔內別處既有的寫法不會卡住沒碰到它的編輯
#   (不用 lib/_added_lines.sh 的「新增行」:那支要讀寫完的檔,只能在 PostToolUse 用;本 hook 是 PreToolUse)。
#   A.4 的反證(disabled 覆寫 / 豁免標記)另看寫完的整份檔:Edit 片段常帶到檔內既有的 muted 那一行,
#   覆寫卻寫在片段外 —— 只看片段會擋錯合規的檔(WP-15b 審查必修 2;做法見 A.4 段)。
#   升擋前全樹重放(a05da20a,499 個 .ts / .tsx 逐檔整檔寫入):A.2 0 筆、A.4 1 筆(AgentPanel 訊息輸入盒,見 A.4 段)。
#
# Per-rule allowlist(各自獨立):
#   A.1: `// @naked-row-mode-allow: <reason>`
#   A.2: 逐行 —— 寫在該 wrapper 那一行,或緊接在它上一行的純註解行(JSX 寫 `{/* @fcg-wrapper-allow: <reason> */}`);
#        整檔 —— 檔頭前 5 行的檔案註解行 `// @fcg-wrapper-allow: <reason>`(Write 看寫入內容、Edit 看磁碟原檔)。
#        格式比照 `@layout-space-magic-ok`,冒號後要有理由。
#   A.3: `// @field-state-ring-allow: <reason>`
#   A.4: `// @disabled-color-allow: <reason>`(寫完的整份檔任一行;Edit / MultiEdit 看原檔套上改動後的樣子)
#   A.5: `// @group-fieldctx-allow: <reason>`
#   A.6: `// @empty-display-allow: <reason>`

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

_HOOK_CONTEXT_EVENT="PreToolUse"
_HOOK_OUTPUT_CAPTURE=$(mktemp "${TMPDIR:-/tmp}/check-field-family-invariants.XXXXXX") || {
  printf 'GOVERNANCE_INTEGRITY: field family invariants output capture unavailable\n' >&2
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
        printf 'GOVERNANCE_INTEGRITY: field family invariants warning envelope encoding failed\n' >&2
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
        printf 'field family invariants hook blocked without diagnostic\n' >&2
      fi
      exit 2
      ;;
    70)
      if [ -n "$_hook_output" ]; then
        printf '%s\n' "$_hook_output" >&2
      else
        printf 'GOVERNANCE_INTEGRITY: field family invariants failed without diagnostic\n' >&2
      fi
      exit 70
      ;;
    *)
      printf 'GOVERNANCE_INTEGRITY: field family invariants undefined exit code %s\n' "$_hook_rc" >&2
      [ -n "$_hook_output" ] && printf '%s\n' "$_hook_output" >&2
      exit 70
      ;;
  esac
}
trap _finalize_hook_output EXIT

source "$(dirname "$0")/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: hook integrity helper unavailable\n' >&2
  exit 70
}
governance_hook_load_input
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'field family tool extraction failed'
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'field family path extraction failed'

# Tool filter — 只 Edit/Write/MultiEdit 跑
case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

# 不是 .tsx / .ts 直接過(各 rule 內部還會再 narrow)
case "$FILE_PATH" in
  *.tsx|*.ts) ;;
  *) exit 0 ;;
esac

# 讀 merged content(舊檔 + 新 edit 拼起)— A.1 / A.3 需要整檔判 naked variant 存在性
FILE_CONTENT=""
if [ -e "$FILE_PATH" ] || [ -L "$FILE_PATH" ]; then
  FILE_PATH=$(governance_hook_project_file_path "$FILE_PATH" 2>/dev/null) \
    || governance_hook_integrity_fail 'field family target escapes the project or crosses a symlink'
  if [ -L "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ] || [ ! -r "$FILE_PATH" ]; then
    governance_hook_integrity_fail 'field family target is unavailable or unsafe'
  fi
  FILE_CONTENT=$(cat "$FILE_PATH" 2>/dev/null) \
    || governance_hook_integrity_fail 'field family target read failed'
fi
NEW_CONTENT=$(printf '%s' "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null) || governance_hook_integrity_fail 'field family edit payload extraction failed'

# A.2 / A.4 的觸發只看 NEW_CONTENT(diff-level signal;A.4 的反證另看寫完的整份檔),A.1 / A.3 看 MERGED
MERGED_CONTENT="${FILE_CONTENT}
${NEW_CONTENT}"

grep -q '[^[:space:]]' <<<"$MERGED_CONTENT" || exit 0

WORST=0
record_worst() { local lvl=$1; [ "$lvl" -gt "$WORST" ] && WORST=$lvl; }

# ── A.1 naked row-mode propagation(P0 BLOCKER)─────────────────────────────────
case "$FILE_PATH" in
  *components/*.tsx)
    case "$FILE_PATH" in
      */field-wrapper.tsx|*/textarea.tsx) ;; # SSOT host skip
      *)
        if ! grep -q '@naked-row-mode-allow' <<<"$MERGED_CONTENT" \
           && echo "$MERGED_CONTENT" | grep -E "variant:\s*['\"]naked['\"]|variant=\{?['\"]naked['\"]" >/dev/null \
           && echo "$MERGED_CONTENT" | tr '\n' ' ' | grep -E "(inline-flex|flex)[^\"'\`]*items-center" >/dev/null \
           && ! grep -q "nakedCellRowModeAlign" <<<"$MERGED_CONTENT"; then
          cat >&2 <<EOF

┄┄┄ A.1 check_field_family_invariants — naked row-mode propagation BLOCKER ┄┄┄

[P0] ${FILE_PATH}
偵測到此檔消費 \`variant="naked"\` + 內部 wrapper hardcode \`items-center\`,
但**未** import / apply \`nakedCellRowModeAlign\` SSOT。

⚠️  M19 canonical:naked variant 元件所有內部 wrapper 必 propagate host cell
    \`data-row-mode\`(autoRow→items-start / fixed→items-center)。

修法:
  1. import { nakedCellRowModeAlign } from '@/design-system/components/Field/field-wrapper'
  2. wrapper className 加上 SSOT(eg \`cn('flex-1 min-w-0 inline-flex items-center', nakedCellRowModeAlign)\`)
  3. 例外:行尾 \`// @naked-row-mode-allow: <reason>\`

EOF
          record_worst 2
        fi
        ;;
    esac
    ;;
esac

# ── A.2 FieldControlGroup wrapper direct child(P0 BLOCKER,2026-11-21 由 P1 WARN 升級)─────────
# 豁免(2026-11-21 收成逐行 + 檔頭兩種,格式比照 `@layout-space-magic-ok`;冒號後要有理由):
#   逐行 = 標記在 wrapper 那一行,或緊接在它上一行、而且那一行是純註解行(trim 後以 //、{/*、/*、* 開頭)
#          —— JSX 的 `<div …>` 行尾不能放 `//`(會變成畫面上的文字),所以要支援「上一行」;
#          上一行若是程式碼,它行尾的標記只管它自己那一行,不往下串。
#   檔頭 = 檔案前 5 行裡的檔案註解行(trim 後以 //、/*、* 開頭;JSX 的 {/* … */} 不是檔頭註解)= 整檔豁免。
#          Write 看寫入內容的前 5 行(寫完的整份檔);Edit / MultiEdit 只送改動的片段,片段的前幾行不是檔頭 →
#          看磁碟原檔的前 5 行。
#   改前是「寫入內容任一處出現標記就整條規則跳過」:一個標記會連同一次寫入裡其他 wrapper 一起放行,
#   而且比本檔頭與訊息寫的「行尾 / 檔頭」寬 —— 升擋時收回到文件寫的兩種。
A2_MARK_AWK='@fcg-wrapper-allow:[ \t]*[^ \t*]'
case "$FILE_PATH" in
  *.tsx)
    A2_HEADER_ALLOW=0
    if [ "$TOOL" = "Write" ]; then
      A2_HEADER_SOURCE="$NEW_CONTENT"
    else
      A2_HEADER_SOURCE="$FILE_CONTENT"
    fi
    # 讀完整份輸入再判(不在第 5 行就 exit):pipefail 下 awk 提早結束會讓 printf 收到 SIGPIPE,整條管線變成失敗
    if printf '%s\n' "$A2_HEADER_SOURCE" | awk -v re="$A2_MARK_AWK" 'NR <= 5 && $0 ~ re && $0 ~ /^[[:space:]]*(\/\/|\/\*|\*)/ { found = 1 } END { exit(found ? 0 : 1) }'; then
      A2_HEADER_ALLOW=1
    fi
    if [ "$A2_HEADER_ALLOW" = 0 ] && grep -q '<FieldControlGroup' <<<"$NEW_CONTENT"; then
      SUSPECT=$(printf '%s' "$NEW_CONTENT" | awk -v re="$A2_MARK_AWK" '
        /<FieldControlGroup/ { inFCG=1; prev=$0; next }
        /<\/FieldControlGroup>/ { inFCG=0; prev=$0; next }
        inFCG && /^[[:space:]]*<(div|span)[[:space:]>]/ {
          prevAllows = (prev ~ re && prev ~ /^[[:space:]]*(\/\/|[{]?\/\*|\*)/)
          if ($0 !~ /display:[[:space:]]*contents/ && $0 !~ re && !prevAllows) print NR ":" $0
        }
        { prev = $0 }
      ')
      if [ -n "$SUSPECT" ]; then
        cat >&2 <<EOF

┄┄┄ A.2 check_field_family_invariants — FieldControlGroup wrapper BLOCKER ┄┄┄

[P0] ${FILE_PATH}
偵測到 FieldControlGroup 內有 \`<div>\` / \`<span>\` wrapper(會破壞 CSS \`[&>*]\` variants):
${SUSPECT}

修法 3 擇 1:
  1. 移除 wrapper,Field control 直接是 FieldControlGroup direct child
  2. 透過 prop forward className(eg \`<FilterValuePicker className="flex-1 min-w-0">\`)
  3. wrapper 用 \`display:contents\`
例外(逐行):在該 wrapper 上一行加 \`{/* @fcg-wrapper-allow: <reason> */}\`(或同一行);整檔:檔頭前 5 行加 \`// @fcg-wrapper-allow: <reason>\`

EOF
        record_worst 2
      fi
    fi
    ;;
esac

# ── A.3 Field state ring SSOT(P0 BLOCKER,4 sub-rules)─────────────────────────
# A.3.1 / A.3.2:components/ 實作檔(SSOT 宿主 / story / test skip)。
#   `data-[field-open]` = 2026-11-13 起欄位「自己的浮層開著」的記號,與 hover / focus-within / data-[state=open] 同列。
case "$FILE_PATH" in
  *components/*.tsx)
    case "$FILE_PATH" in
      */field-wrapper.tsx|*/textarea.tsx|*.stories.tsx|*.test.*|*.spec.tsx) ;; # SSOT/test skip
      *)
        if ! grep -q '@field-state-ring-allow' <<<"$NEW_CONTENT"; then
          # A.3.1 舊 box-shadow inset
          if echo "$NEW_CONTENT" | grep -E "(hover|focus-within|data-\[state=open\]|data-\[field-open\]):shadow-\[inset" >/dev/null; then
            cat >&2 <<'EOF'

┄┄┄ A.3.1 check_field_family_invariants — Field state ring shadow inset BLOCKER ┄┄┄

[P0] naked variant state ring 用 `box-shadow inset` — v9 retire pattern。
修法:讓 Field default state machine 自動繼承(border-based);cell hover 用 `nakedCellEditableDisplayHover` const。

EOF
            record_worst 2
          fi
          # A.3.2 自寫 outline state ring
          if echo "$NEW_CONTENT" | grep -E "(hover|focus-within|focus-visible|data-\[state=open\]|data-\[field-open\]):outline-(border|primary)" >/dev/null; then
            cat >&2 <<'EOF'

┄┄┄ A.3.2 check_field_family_invariants — Field state ring outline BLOCKER ┄┄┄

[P0] 自寫 `hover:outline-border` / `focus-within:outline-primary` — v13 canonical 禁。
修法:Field default 自動繼承 / cell 用 `nakedCellEditableDisplayHover` const。

EOF
            record_worst 2
          fi
        fi
        ;;
    esac
    ;;
esac

# ── A.3.3 / A.3.4 欄位「自己的浮層開著」的框(2026-11-13 改寫)─────────────────────────
# 規則(AI 建議、user 2026-11-12 採納,原話「我覺得可以照你建議」):欄位 + 它自己打開的浮層 = 同一個欄位 →
#   浮層開著時外框維持「聚焦」的框(一般 border-primary;錯誤欄位維持 border-error);只認欄位自己的浮層;
#   按鈕類觸發照舊「開著 = 自己的 hover」。
#   user 採納的是上面這條規則;「用欄位自己寫的記號 data-field-open 來認」是 2026-11-13 的 AI 工程判斷(實作手段),不是 user 的決定。
# 住所(2026-11-13 工作副本當時位置):
#   樣式 = components/Field/field-wrapper.tsx 三條 compound(:79 一般、:102 錯誤、:238 無框款),只認 `data-[field-open]`;
#   記號 = lib/composite-field-focus.ts `FIELD_OPEN_ATTR`(:47-48「唯一寫入者 = 本模組的 fieldOpenProps」)/ `fieldOpenProps`(:50-53;各欄位外框自己展開,寫在 consumer 的 props 之後);
#   外框為什麼不認 Radix 通用的 data-state="open" = 同檔檔頭最後一段(:36-45);
#   規格 = components/Field/field.spec.md「Field state machine」;按鈕類 = patterns/element-anatomy/inline-action.spec.md「互動狀態」表。
# 改寫前(2026-06-11 版)本段只擋「開著 = 藍」(`open && 'border-primary'`、結尾是 `data-[state=open]:border-primary`),
#   而且 field-wrapper.tsx 整檔不檢查 —— 當時的規定是 `data-[state=open]:border-border-hover`(開著 = hover 框)。
#   照新規則,那個寫法正是要擋的「改回舊寫法」,舊版對它零訊號。
# M7 broad-vs-narrow 3-column:
#   規則用語                               | 本段 regex                                                        | Gap
#   開著的框只住 field-wrapper.tsx          | A.3.3a 各元件 `open && 'border-primary'`(含 `!`)                  | 只認 border-primary 一色(原本就有的擋法,不擴)
#   只認欄位自己的記號、不認通用 data-state  | A.3.3b 畫欄位外框的檔 × `data-[state=open]:…border-*`              | aria-expanded 等其他通用訊號未列(現況 0 筆)
#                                          |        (含 `!`、中間再夾變體、`[&[data-state=open]]:` 寫法)        |
#   開著的框只住 field-wrapper.tsx          | A.3.3c field-wrapper.tsx 以外 × `data-[field-open]:…border-*`      | 讀記號做外框以外的事不擋(FieldControlGroup 的 z-index)
#   記號只有 composite-field-focus.ts 會寫  | A.3.4 手寫屬性 / 物件 key / setAttribute / dataset                 | 字面出現在註解、選擇器(讀)不擋
# 「畫欄位外框的檔」= 路徑是 field-wrapper.tsx / textarea.tsx,或內容(去掉純註解行)消費 Field 外框
#   (fieldWrapperStyles / fieldDefaultChromeCompounds / FIELD_DEFAULT_CHROME_COMPOUNDS / fieldChromeStyles)
#   或掛著欄位自己的浮層(useCompositeFieldBlur / fieldOpenProps)。按鈕類觸發不在內:button.tsx 的
#   `data-[state=open]:border-primary-hover` / `border-error-hover` 是「開著 = 自己的 hover」,照舊放行
#   (所以不能對全部元件擋 `data-[state=open]:border-`,也不能用 token 名字分 —— 兩邊都會用到 `-hover` 結尾的框色)。
# A.3.3a 與「結尾是 data-[state=open]:border-primary」維持原範圍(components/ 實作檔、SSOT 宿主除外);
#   A.3.3b / A.3.3c / A.3.4 不限 components/(patterns/、lib/、產品程式都可能手刻欄位),story / test skip。
# 沿革 2026-06-11 deep-audit R2(n=38):當時的 regex 是 substring、無 boundary、不分註解行 → 誤命中
#   (a) `data-[state=open]:border-primary-hover`(button.tsx,按鈕類觸發;-hover / -active 是合法 token 後綴)、
#   (b) retire 註解裡引用的舊 pattern 文字(`9935caf9:packages/design-system/src/components/Combobox/combobox.tsx:725` /
#       `9935caf9:packages/design-system/src/components/Select/select.tsx:594`,當時位置)。
#   修:純註解行剝離 + border-primary 加字尾 boundary `([^-a-zA-Z]|$)`;兩者 2026-11-13 改寫時都保留。
# 全庫反例掃描 2026-11-13:工作副本 492 個 .ts / .tsx 逐檔以整檔寫入重放 → 全部 exit 0、A.3 命中 0 筆
#   (改寫前的版本對同一批檔逐檔結果相同)。真實檔兩面對照 10 筆:field-wrapper.tsx 在 git HEAD 的內容、
#   date-picker.tsx 把 fieldOpenProps 換回手寫、select.tsx 加回 data-[state=open]:border-border-hover → 該擋 3 筆都擋;
#   五個檔現在的內容 + button.tsx / item-anatomy.tsx → 該放 7 筆都放。同一份對照餵給改寫前的版本 → 該擋的 3 筆全放行。
case "$FILE_PATH" in
  *.stories.tsx|*.test.*|*.spec.tsx) ;; # story / test skip(同 A.3.1 / A.3.2)
  *)
    if ! grep -q '@field-state-ring-allow' <<<"$NEW_CONTENT"; then
      # 純註解行剝離(2026-06-11 deep-audit R2:retire 註解會引用舊 pattern 文字)
      A33_CODE=$(printf '%s\n' "$NEW_CONTENT" | grep -vE '^[[:space:]]*(//|\*|/\*)')
      # 同一個 class 裡,變體之後到 utility 之前的那一段:不跨空白與引號,允許中間再夾變體與 `!`
      A33_CHAIN="[^[:space:]\"'\`]*:!?"

      A33_PER_CONTROL=0 # 原本就有的擋法的範圍
      case "$FILE_PATH" in
        */field-wrapper.tsx|*/textarea.tsx) ;;
        *components/*.tsx) A33_PER_CONTROL=1 ;;
      esac

      A33_FIELD_FRAME=0 # 這個檔在畫欄位外框
      case "$FILE_PATH" in
        */field-wrapper.tsx|*/textarea.tsx) A33_FIELD_FRAME=1 ;;
        *)
          A33_MERGED_CODE=$(printf '%s\n' "$MERGED_CONTENT" | grep -vE '^[[:space:]]*(//|\*|/\*)')
          if grep -qE 'fieldWrapperStyles|fieldDefaultChromeCompounds|FIELD_DEFAULT_CHROME_COMPOUNDS|fieldChromeStyles|useCompositeFieldBlur|fieldOpenProps' <<<"$A33_MERGED_CODE"; then
            A33_FIELD_FRAME=1
          fi
          ;;
      esac

      A33_WHY=""
      # A.3.3a 各元件自己用 open 狀態換框色
      if [ "$A33_PER_CONTROL" = 1 ] \
         && grep -qE "(open|isOpen) +&& +.{0,40}[\"']!?border-primary[\"']" <<<"$A33_CODE"; then
        A33_WHY="${A33_WHY}
  - 元件自己用 open 狀態換框色(\`open && 'border-primary'\` 這類)"
      fi
      # A.3.3b 用通用的 data-state 決定欄位外框色
      if { [ "$A33_PER_CONTROL" = 1 ] \
           && grep -qE "data-\[state=open\]:border-primary([^-a-zA-Z]|$)" <<<"$A33_CODE"; } \
         || { [ "$A33_FIELD_FRAME" = 1 ] \
           && grep -qE "(data-\[state=open\]|\[data-state=[\"']?open[\"']?\])${A33_CHAIN}border-" <<<"$A33_CODE"; }; then
        A33_WHY="${A33_WHY}
  - 用 Radix 通用的 \`data-[state=open]\` 決定欄位外框色(\`data-[state=open]:border-*\`,含帶 \`!\` 的寫法)"
      fi
      # A.3.3c 在住所以外用記號換框色
      case "$FILE_PATH" in
        */field-wrapper.tsx) ;;
        *)
          if grep -qE "(data-\[field-open\]|\[data-field-open\])${A33_CHAIN}border-" <<<"$A33_CODE"; then
            A33_WHY="${A33_WHY}
  - 在 field-wrapper.tsx 以外用 \`data-[field-open]\` 換框色"
          fi
          ;;
      esac
      if [ -n "$A33_WHY" ]; then
        cat >&2 <<EOF

┄┄┄ A.3.3 check_field_family_invariants — 欄位開著的框只有一個住所 BLOCKER ┄┄┄

[P0] ${FILE_PATH}
欄位自己的浮層(選單 / 日曆 / 時間面板)開著時,外框維持「聚焦」的框:一般欄位 border-primary、錯誤欄位維持 border-error。
這條樣式只住在 components/Field/field-wrapper.tsx,而且只認欄位自己寫的記號 \`data-[field-open]\`。
這次寫入踩到:${A33_WHY}

修法:
  1. 各元件不要自己寫開著的框色:外框用 fieldWrapperStyles(...),開著的框由它帶。
  2. 欄位外框不認 Radix 通用的 \`data-[state=open]\`:那個屬性任何一層 Trigger 都會寫,外面的浮層把欄位當觸發點時
     會蓋到欄位外框上(lib/composite-field-focus.ts 檔頭最後一段)。要改開著的框 → 改 field-wrapper.tsx 的 \`data-[field-open]\` 那幾條。
  3. 按鈕類觸發(Button / inline action)不適用本條,照舊「開著 = 自己的 hover」(inline-action.spec.md「互動狀態」表)。
規則:components/Field/field.spec.md「Field state machine」;記號:lib/composite-field-focus.ts(FIELD_OPEN_ATTR / fieldOpenProps)。
例外:行尾 \`// @field-state-ring-allow: <reason>\`

EOF
        record_worst 2
      fi

      # A.3.4 `data-field-open` 記號只有 lib/composite-field-focus.ts 會寫
      #   擋「寫」的形狀:JSX 屬性(`data-field-open=…`、裸屬性)、物件 key(`'data-field-open': …` / `[FIELD_OPEN_ATTR]: …`)、
      #   setAttribute / toggleAttribute、dataset.fieldOpen =。「讀」不擋:`[data-field-open]` 選擇器、註解與說明文字裡的字面。
      case "$FILE_PATH" in
        */lib/composite-field-focus.ts) ;; # 唯一寫入者
        *)
          if grep -qE "(^|[^][a-zA-Z0-9_-])data-field-open[[:space:]]*=|^[[:space:]]*data-field-open[[:space:]]*$|<[A-Za-z][^<>]*[[:space:]]data-field-open([[:space:]/>]|$)|[\"']data-field-open[\"'][[:space:]]*\]?[[:space:]]*:|\[[[:space:]]*FIELD_OPEN_ATTR[[:space:]]*\][[:space:]]*:|(set|toggle)Attribute\([[:space:]]*([\"']data-field-open[\"']|FIELD_OPEN_ATTR)|dataset\.fieldOpen[[:space:]]*=([^=]|$)" <<<"$A33_CODE"; then
            cat >&2 <<EOF

┄┄┄ A.3.4 check_field_family_invariants — data-field-open 記號手寫 BLOCKER ┄┄┄

[P0] ${FILE_PATH}
偵測到手寫 \`data-field-open\`(JSX 屬性 / 物件 key / setAttribute / dataset)。
這個記號代表「這個欄位自己的浮層開著」,外框靠它維持聚焦的框;唯一寫入者是 lib/composite-field-focus.ts 的 \`fieldOpenProps\`。

修法:
  1. 觸發欄位就是外框(PopoverTrigger asChild):把 useCompositeFieldBlur({ …, open }) 回傳的 \`trigger\` 展開上去,記號已經在裡面。
  2. 外框不是 PopoverTrigger(日期區間是 PopoverAnchor):在 \`{...props}\` 之後展開 \`{...fieldOpenProps(open)}\`。
  3. 產品程式不要替 DS 的欄位寫這個記號:欄位元件自己會寫。
規則:components/Field/field.spec.md「Field state machine」;記號:lib/composite-field-focus.ts(FIELD_OPEN_ATTR / fieldOpenProps)。
例外:行尾 \`// @field-state-ring-allow: <reason>\`

EOF
            record_worst 2
          fi
          ;;
      esac
    fi
    ;;
esac

# ── A.4 disabled placeholder color(P0 BLOCKER,2026-11-21 由 P1 context 升級;M24)─────────────────
# 規則:disabled > muted > emphasis(M24;tokens/color/color.spec.md「Disabled state precedence canonical」)。
# 觸發只看這次寫入的內容(NEW_CONTENT):寫了 `placeholder:text-fg-muted`,或 `<span text-fg-muted>{placeholder}`。
#   檔內別處既有的 muted,這次沒寫到就不會卡住編輯。
# 反證(disabled 覆寫 / `@disabled-color-allow`)看寫完的整份檔(A4_AFTER),不只看片段(WP-15b 審查必修 2):
#   覆寫常寫在 muted 的下一兩行(textarea.tsx、field-wrapper.tsx、command.tsx),或同檔別處(date-picker.tsx 的
#   `resolvedMode === 'disabled'` 分支)。Edit 片段只帶到 muted 那一行時,只看片段會把合規的檔擋下 —— 修正前
#   這四個檔各自帶到 muted 那一行的片段都是 exit 2(基準只提醒;a05da20a 全樹 Edit 片段重放 6 筆:合規 5 筆全擋、
#   agent-panel.tsx 1 筆該擋;修正後只剩 agent-panel.tsx)。
#   改成看寫完的整份檔後,同一份檔不論用 Write 還是 Edit 寫出來,判定都一樣。
#   A4_AFTER 怎麼來(只在觸發時才算):
#     Write → 寫入內容就是整份檔。
#     Edit / MultiEdit → 磁碟原檔照 old_string → new_string 套上改動(直接呼叫給 new_string / edits[];
#       正式入口 scripts/run-provider-hook.mjs 的 event-v1 把 new_string 放在 content、old_string 另給)。
#     套不上(old_string 不在檔裡、正式入口的 MultiEdit 只帶第一筆 old_string、apply_patch 沒有 old_string、
#       找不到 python3)→ 退回「磁碟原檔 + 這次片段」(MERGED_CONTENT):只會漏擋「同一次把覆寫刪掉」,不會擋錯合規的檔。
# 已知限制:hook 看不出「這個欄位根本不會 disabled」—— 升擋前全樹重放唯一的命中就是這種:
#   components/AgentPanel/agent-panel.tsx 訊息輸入盒的 textarea(a05da20a 量時第 1423 行的 'placeholder:text-fg-muted'),
#   該 textarea 沒有 disabled 屬性。之後動到那一行(或整檔寫入)時,在同檔加 `// @disabled-color-allow: 此輸入盒沒有 disabled 狀態`。
_A4_AFTER_IMAGE_PY='
import json, os, sys

disk = sys.argv[1]
event = json.loads(sys.stdin.buffer.read())
tool = event.get("tool_name") or ""
tool_input = event.get("tool_input") or {}

pairs = None
if tool == "MultiEdit" and isinstance(tool_input.get("edits"), list) and tool_input["edits"]:
    pairs = [(edit.get("old_string"), edit.get("new_string"), bool(edit.get("replace_all")))
             for edit in tool_input["edits"] if isinstance(edit, dict)]
elif tool == "Edit":
    new = tool_input.get("new_string")
    if not isinstance(new, str):
        new = tool_input.get("content")
    pairs = [(tool_input.get("old_string"), new, bool(tool_input.get("replace_all")))]
if not pairs:
    sys.exit(3)

text = None
if os.path.isfile(disk):
    with open(disk, "rb") as handle:
        text = handle.read().decode("utf-8", "replace")
for old, new, replace_all in pairs:
    if not isinstance(old, str) or not isinstance(new, str):
        sys.exit(3)
    if text is None:
        if old == "":
            text = new
            continue
        sys.exit(3)
    if old == "" or old not in text:
        sys.exit(3)
    text = text.replace(old, new) if replace_all else text.replace(old, new, 1)
if text is None:
    sys.exit(3)
sys.stdout.write(text)
'
A4_MUTED_HIT=0
A4_SPAN_HIT=0
if echo "$NEW_CONTENT" | grep -E "placeholder:text-fg-muted" >/dev/null; then
  A4_MUTED_HIT=1
fi
if echo "$NEW_CONTENT" | tr '\n' ' ' | grep -E '<span[^>]*"text-fg-muted"[^>]*>[[:space:]]*\{[^}]*placeholder' >/dev/null 2>&1; then
  A4_SPAN_HIT=1
fi
if [ "$A4_MUTED_HIT" = 1 ] || [ "$A4_SPAN_HIT" = 1 ]; then
  A4_AFTER="$NEW_CONTENT"
  if [ "$TOOL" != "Write" ]; then
    if command -v python3 >/dev/null 2>&1 \
       && A4_AFTER=$(printf '%s' "$INPUT" | python3 -I -c "$_A4_AFTER_IMAGE_PY" "$FILE_PATH" 2>/dev/null); then
      :
    else
      A4_AFTER="$MERGED_CONTENT"
    fi
  fi
  if ! grep -q '@disabled-color-allow' <<<"$A4_AFTER"; then
    SUSPECT_DP=""
    if [ "$A4_MUTED_HIT" = 1 ] \
       && ! echo "$A4_AFTER" | grep -E "(disabled:placeholder:text-fg-disabled|group-data-\[field-mode=disabled\].*placeholder:text-fg-disabled|resolvedMode\s*===\s*'disabled'.*text-fg-disabled)" >/dev/null; then
      SUSPECT_DP="$SUSPECT_DP [placeholder:text-fg-muted 無 disabled override]"
    fi
    if [ "$A4_SPAN_HIT" = 1 ] \
       && ! echo "$A4_AFTER" | grep -E "resolvedMode\s*===\s*'disabled'" >/dev/null; then
      SUSPECT_DP="$SUSPECT_DP [<span text-fg-muted>{placeholder} 不分 mode]"
    fi
    if [ -n "$SUSPECT_DP" ]; then
      cat >&2 <<EOF

┄┄┄ A.4 check_field_family_invariants — disabled placeholder color BLOCKER ┄┄┄

[P0] ${FILE_PATH}
${SUSPECT_DP}
(覆寫與豁免看的是寫完的整份檔:整份檔都找不到 disabled 覆寫)
修法:disabled:placeholder:text-fg-disabled / group-data-[field-mode=disabled]/field:placeholder:text-fg-disabled / JSX 條件
詳:tokens/color/color.spec.md「Disabled state precedence canonical」/ M24
例外(這個欄位確實不會 disabled 之類):同檔任一行 \`// @disabled-color-allow: <reason>\`

EOF
      record_worst 2
    fi
  fi
fi

# ── A.5 _Group child fieldCtx.id 隔離(P0 BLOCKER,2026-05-31 折入,M4 AR34 regression detector)──
# M4:_Group 元件(CheckboxGroup/RadioGroup/SwitchGroup)的 child item 不可共用 fieldCtx.id —— 否則
# group 內所有 label 被抑制 + 點 label 只 toggle 第一個(AR34 root bug)。正解:item 在 group 內走自己
# 的 generatedId,不 fall back 到共用 fieldCtx.id。偵測 AR34 regression shape(MERGED 整檔,3-signal AND):
#   (1) 消費 *GroupContext  (2) bare `idProp ?? fieldCtx?.id ?? generatedId` fallback
#   (3) 缺 `insideGroup ? generatedId` / `inGroup ? generatedId` group guard
case "$FILE_PATH" in
  *components/*.tsx)
    if ! grep -q '@group-fieldctx-allow' <<<"$MERGED_CONTENT" \
       && grep -qE 'useContext\([A-Za-z_]*GroupContext\)' <<<"$MERGED_CONTENT" \
       && grep -qE 'idProp[[:space:]]*\?\?[[:space:]]*fieldCtx\?\.id[[:space:]]*\?\?[[:space:]]*generatedId' <<<"$MERGED_CONTENT" \
       && ! grep -qE '(insideGroup|inGroup)[[:space:]]*\?[[:space:]]*generatedId' <<<"$MERGED_CONTENT"; then
      cat >&2 <<EOF

┄┄┄ A.5 check_field_family_invariants — _Group child fieldCtx.id 隔離 BLOCKER ┄┄┄

[P0] ${FILE_PATH}
偵測到 _Group child item 消費 GroupContext + bare \`idProp ?? fieldCtx?.id ?? generatedId\` fallback,
但**缺** group guard(\`insideGroup ? generatedId\`)= M4 AR34 regression shape。

⚠️  M4 canonical:Group 內 item 不可共用 fieldCtx.id(否則所有 label 被抑制 + 點 label 只 toggle 第一個)。

修法:
  inputId = idProp ?? (insideGroup ? generatedId : (fieldCtx?.id ?? generatedId))
  即 group 內走自己的 generatedId,不 fall back 共用 fieldCtx.id。
  例外:行尾 \`// @group-fieldctx-allow: <reason>\`

EOF
      record_worst 2
    fi
    ;;
esac

# ── A.6 空值顯示 SSOT(P0 BLOCKER,2026-07-08 user 拍板半形 hyphen)────────────────
# user verbatim「我從頭到尾哪裡有說要用全形的」+ 五情境空值框架。SSOT:符號常數 =
#   field-wrapper.tsx `EMPTY_DISPLAY = '-'`(U+002D 半形);分流 hook = field-context.ts
#   `useFieldEmptyDisplay()`。禁 2 shape:
#   A.6.1 非 owner 檔直接 import `EMPTY_DISPLAY` 常數(應消費 hook 分流,否則 table-cell
#         editable→'' 分流會漏);
#   A.6.2 components/ tsx display 路徑 hardcode 全形 em dash `'—'`/`"—"`(U+2014)字面。
# M7 broad-vs-narrow:spec wording 廣(「禁 hardcode 空值符號」);hook 取「quoted em dash 字面」
#   高信號 subset + owner skip + comment 剝離 + `@empty-display-allow` escape,零誤判導向。
if ! grep -q '@empty-display-allow' <<<"$NEW_CONTENT"; then
  # A.6.1 非 owner 檔 import EMPTY_DISPLAY 常數(剝離註解行)
  case "$FILE_PATH" in
    */field-context.ts|*/field-wrapper.tsx) ;; # SSOT owner(定義 + 分流 hook)skip
    *)
      A61_CONTENT=$(echo "$NEW_CONTENT" | grep -vE '^[[:space:]]*(//|\*|/\*)')
      if printf '%s' "$A61_CONTENT" | grep -E "import.*EMPTY_DISPLAY|EMPTY_DISPLAY.*from" >/dev/null; then
        cat >&2 <<EOF

┄┄┄ A.6.1 check_field_family_invariants — EMPTY_DISPLAY 直引 BLOCKER ┄┄┄

[P0] ${FILE_PATH}
偵測到直接 import \`EMPTY_DISPLAY\` 常數(非 field-context.ts owner)。
空值顯示必經 \`useFieldEmptyDisplay()\` hook 分流(table-cell 可編輯→空白 / 其餘→半形 '-'),
直引常數會漏 surface × editable 分流。

修法:import { useFieldEmptyDisplay } from '@/design-system/components/Field/field-context'
      const emptyDisplay = useFieldEmptyDisplay()
例外:行尾 \`// @empty-display-allow: <reason>\`

EOF
        record_worst 2
      fi
      ;;
  esac
  # A.6.2 components/ tsx hardcode 全形 em dash 空值字面(剝離註解行 + owner/story skip)
  case "$FILE_PATH" in
    *.stories.tsx|*/field-context.ts|*/field-wrapper.tsx) ;; # doc N/A marker + SSOT owner skip
    *components/*.tsx)
      A62_CONTENT=$(echo "$NEW_CONTENT" | grep -vE '^[[:space:]]*(//|\*|/\*)')
      if printf '%s' "$A62_CONTENT" | grep -E "['\"]—['\"]" >/dev/null; then
        cat >&2 <<EOF

┄┄┄ A.6.2 check_field_family_invariants — 全形 em dash 空值 BLOCKER ┄┄┄

[P0] ${FILE_PATH}
偵測到 components/ 實作檔 hardcode 全形 em dash \`'—'\`(U+2014)字面。
user 2026-07-08 拍板:空值符號 = **半形 hyphen '-'(U+002D)**,禁全形。

修法:空值一律 \`{value ?? emptyDisplay}\`(emptyDisplay = useFieldEmptyDisplay()),不 hardcode 符號。
例外:行尾 \`// @empty-display-allow: <reason>\`

EOF
        record_worst 2
      fi
      ;;
  esac
fi

exit $WORST

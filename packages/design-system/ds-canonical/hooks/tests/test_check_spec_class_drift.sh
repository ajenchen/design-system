#!/bin/bash
# Tests for check_spec_class_drift.sh(Audit Dim 53,2026-05-17 ship;2026-11-21 WP-15b 升擋)
#
# Hook 規則:Edit/Write/MultiEdit 對 packages/design-system/src/components/*/[a-z-]*.spec.md
# 偵測 spec.md 寫「固定/寫死/硬寫 h-NN」但對應 tsx 已 migrate to var(--chrome-header-height)
# token,或 tsx 根本不含那個 class → stderr + exit 2(P0 擋;2026-11-21 前只回 governanceContext 提醒)。
#
# 整檔豁免:spec 檔頭(第一個 `## ` 標題之前)有 `@spec-class-drift-allow: <reason>` → silent。
#   Write 看寫入內容的檔頭;Edit / MultiEdit 看磁碟原檔的檔頭(片段不是檔頭)。
# 非 spec.md / tsx 不存在 → silent。
#
# 兩面對照:
#   該擋 —— 4 / 5(兩種偵測)、6b(標記在正文)、6c(標記沒有理由)、6e(Edit 時原檔只有正文有標記)、
#           6f(Edit 片段自己帶標記)、9b(tsx 只有 min-h-24 / h-240)、10(MultiEdit)
#   該放 —— 6(Write 檔頭標記)、6d(Edit 時原檔檔頭有標記)、9(tsx 真的含 h-24,FileViewer 誤判的回歸)

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_spec_class_drift.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
[ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ] || { echo "❌ mktemp -d failed(TMP_DIR;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
trap 'rm -rf "$TMP_DIR"' EXIT

# Build a fake DS component dir with spec.md + tsx pair in TMP_DIR
# so hook's `TSX_PATH="${FILE_PATH%.spec.md}.tsx"` resolves correctly。
build_pair() {
  local comp_name="$1"
  local tsx_content="$2"
  mkdir -p "$TMP_DIR/packages/design-system/src/components/$comp_name"
  printf '%s' "$tsx_content" > "$TMP_DIR/packages/design-system/src/components/$comp_name/${comp_name}.tsx"
  echo "$TMP_DIR/packages/design-system/src/components/$comp_name/${comp_name}.spec.md"
}

run_payload() {
  local payload="$1"
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

run_hook() {
  local tool="$1"
  local file_path="$2"
  local content="$3"
  local payload
  if [ "$tool" = "Edit" ]; then
    payload=$(jq -n --arg tn "$tool" --arg fp "$file_path" --arg c "$content" \
      '{tool_name: $tn, tool_input: {file_path: $fp, old_string: "舊句", new_string: $c}}')
  elif [ "$tool" = "MultiEdit" ]; then
    payload=$(jq -n --arg tn "$tool" --arg fp "$file_path" --arg c "$content" \
      '{tool_name: $tn, tool_input: {file_path: $fp, edits: [{old_string: "甲", new_string: "無關的一句"}, {old_string: "乙", new_string: $c}]}}')
  else
    payload=$(jq -n --arg tn "$tool" --arg fp "$file_path" --arg c "$content" \
      '{tool_name: $tn, tool_input: {file_path: $fp, content: $c}}')
  fi
  run_payload "$payload"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent, exit=$EXIT, stderr=$([ -n "$STDERR_TEXT" ] && echo non-empty || echo empty))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

# 擋 = exit 2、stdout 空(adapter 契約:擋的時候不得寫 stdout)、stderr 含 needle
expect_block() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && [ -z "$STDOUT_TEXT" ] && printf '%s' "$STDERR_TEXT" | grep -qF -- "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit 2 + stderr '$needle', exit=$EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_integrity() {
  local name="$1"
  if [ "$EXIT" = "70" ] && [ -z "$STDOUT_TEXT" ] \
    && echo "$STDERR_TEXT" | grep -qF "GOVERNANCE_INTEGRITY:"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected integrity exit 70, got exit=$EXIT)"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

BLOCKER="SPEC-CODE REVERSE DRIFT BLOCKER"
TOKEN_TSX="
export const Drifty = () => (
  <div className=\"h-[var(--chrome-header-height)]\">...</div>
);
"

echo "=== check_spec_class_drift tests ==="

# 1. Non-spec file (tsx) → skip silent
run_hook "Edit" "$TMP_DIR/some.tsx" "any content"
expect_pass_silent "1. non-spec.md file → skip"

# 2. Non-DS path spec.md → skip silent
run_hook "Edit" "/some/random/path/foo.spec.md" "固定 h-14"
expect_pass_silent "2. spec.md outside DS components/ → skip"

# 3. DS spec.md but no sibling tsx → skip silent
SPEC_PATH="$TMP_DIR/packages/design-system/src/components/orphan/orphan.spec.md"
mkdir -p "$(dirname "$SPEC_PATH")"
run_hook "Edit" "$SPEC_PATH" "固定 h-14 寫死"
expect_pass_silent "3. spec.md without sibling tsx → skip"

# 4. spec 寫「固定 h-14」+ tsx 已消費 chrome-header-height token → 擋
SPEC_PATH=$(build_pair "drifty" "$TOKEN_TSX")
run_hook "Edit" "$SPEC_PATH" "header 高度固定 h-14,不可改"
expect_block "4. spec '固定 h-14' + tsx token → BLOCK" "$BLOCKER"

# 5. spec 寫「寫死 h-12」+ tsx 不含 h-12 → 擋;訊息裡的「」與句子完整(bash 3.2 `「$phrase」` 亂碼的回歸)
SPEC_PATH=$(build_pair "noclass" "$TOKEN_TSX")
run_hook "Edit" "$SPEC_PATH" "container 寫死 h-12 處理"
expect_block "5. spec '寫死 h-12' + tsx 不含 h-12 → BLOCK" "$BLOCKER"
expect_block "5b. 訊息原樣帶出「寫死 h-12」(不是亂碼)" "spec 寫「寫死 h-12」但 tsx 不含 h-12"

# 6. Write:檔頭(第一個 ## 之前)有豁免標記 → silent
SPEC_PATH=$(build_pair "allowed" "$TOKEN_TSX")
run_hook "Write" "$SPEC_PATH" "---
component: Allowed
---
# Allowed
<!-- @spec-class-drift-allow: 這段是 2026-05 的歷史紀錄,保留原文 -->

## Anatomy
header 高度固定 h-14"
expect_pass_silent "6. Write + 檔頭 @spec-class-drift-allow: → silent"

# 6b. Write:標記寫在正文(第一個 ## 之後)→ 不算檔頭 → 擋
run_hook "Write" "$SPEC_PATH" "# Allowed

## Anatomy
<!-- @spec-class-drift-allow: 寫在正文 -->
header 高度固定 h-14"
expect_block "6b. Write + 標記只在正文 → BLOCK" "$BLOCKER"

# 6c. Write:檔頭標記沒有理由 → 不算 → 擋
run_hook "Write" "$SPEC_PATH" "# Allowed
<!-- @spec-class-drift-allow: -->

## Anatomy
header 高度固定 h-14"
expect_block "6c. Write + 檔頭標記沒有理由 → BLOCK" "$BLOCKER"

# 6d. Edit:片段不是檔頭 → 看磁碟原檔;原檔檔頭有標記 → silent
printf '%s\n' '# Allowed' '<!-- @spec-class-drift-allow: 歷史紀錄段落保留原文 -->' '' '## Anatomy' '舊句' > "$SPEC_PATH"
run_hook "Edit" "$SPEC_PATH" "header 高度固定 h-14"
expect_pass_silent "6d. Edit + 磁碟原檔檔頭有標記 → silent"

# 6e. Edit:磁碟原檔只有正文有標記 → 擋
printf '%s\n' '# Allowed' '' '## Anatomy' '<!-- @spec-class-drift-allow: 寫在正文 -->' '舊句' > "$SPEC_PATH"
run_hook "Edit" "$SPEC_PATH" "header 高度固定 h-14"
expect_block "6e. Edit + 原檔標記只在正文 → BLOCK" "$BLOCKER"

# 6f. Edit:片段自己帶標記(看不出它落在不在檔頭)→ 不算 → 擋
printf '%s\n' '# Allowed' '' '## Anatomy' '舊句' > "$SPEC_PATH"
run_hook "Edit" "$SPEC_PATH" "<!-- @spec-class-drift-allow: 片段裡的標記 -->
header 高度固定 h-14"
expect_block "6f. Edit 片段帶標記、原檔沒有 → BLOCK" "$BLOCKER"

# 7. Wrong tool (Read) → skip
run_hook "Read" "$SPEC_PATH" "固定 h-14"
expect_pass_silent "7. tool=Read → skip"

# 8. Malformed canonical input is an integrity fault,never a silent diagnostic.
run_payload 'not-json'
expect_integrity "8. malformed input → integrity 70"

# 9. tsx 真的含 h-24(file-viewer.tsx 的寫法)+ spec「固定 h-24」→ silent
#    (2026-11-21 前判「tsx 含不含」的 regex 壞掉,這種寫法一律判成「不含」→ 全樹重放 FileViewer 誤報)
SPEC_PATH=$(build_pair "filmstrip" "
export const Filmstrip = () => (
  <div className={cn(
    'relative shrink-0 h-24 bg-surface-raised border-t border-divider',
  )} />
);
")
run_hook "Edit" "$SPEC_PATH" "- **Filmstrip 固定 h-24**——預留 thumb 64 + padding"
expect_pass_silent "9. tsx 含 'relative shrink-0 h-24 …' + spec 固定 h-24 → silent"

# 9b. 對照組:tsx 只有 min-h-24 / h-240(不是 h-24 這個 class)→ 擋
SPEC_PATH=$(build_pair "lookalike" "
export const Lookalike = () => <div className='min-h-24 h-240' />
")
run_hook "Edit" "$SPEC_PATH" "- **Filmstrip 固定 h-24**"
expect_block "9b. tsx 只有 min-h-24 / h-240 + spec 固定 h-24 → BLOCK" "tsx 不含 h-24"

# 10. MultiEdit:edits[].new_string 也要判(2026-11-21 前沒讀,MultiEdit 整個繞過)
SPEC_PATH=$(build_pair "multi" "$TOKEN_TSX")
run_hook "MultiEdit" "$SPEC_PATH" "header 高度固定 h-14"
expect_block "10. MultiEdit edits[] 帶 '固定 h-14' → BLOCK" "$BLOCKER"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

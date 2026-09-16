#!/bin/bash
# Tests for check_substantive_edit_approval_preflight.sh(2026-05-15 P0 升級)
#
# Hook 規則:PreToolUse + Edit|Write|MultiEdit + file in packages/design-system/src/**.{tsx,ts,css}
# 工程 remediation 不需 human approval；UI/UX 取捨只接受 exact target-bound decision。
# preflight 與 stop audit 共用 canonical target-bound decision parser，unknown
# 及無法分類一律 fail closed。
# Allowlist:.stories.tsx / .test.ts / .spec.ts → skip。
# 非 PreToolUse event / non-DS path → silent；無 transcript 的 production edit 必須改走
# provider-neutral runner/hard-gate，不能從 code bytes 猜 engineering intent。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_substantive_edit_approval_preflight.sh"
AUTH_HELPER="$SCRIPT_DIR/../lib/approval-evidence.mjs"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# Build a transcript JSONL with N user messages (assistant lines in between).
# Schema: 每 line 一 JSON record。Hook 用 jq `.message.role=="user"` filter + text extract。
build_transcript() {
  local path="$1"; shift
  : > "$path"
  for msg in "$@"; do
    jq -n --arg t "$msg" \
      '{message: {role: "user", content: [{type: "text", text: $t}]}}' >> "$path"
  done
}

operation_digest_content() {
  jq -cjn --arg file_path "$1" --arg content "$2" \
    '{file_path:$file_path,content:$content}' \
    | shasum -a 256 | cut -d ' ' -f1
}

operation_digest_new_string() {
  jq -cjn --arg file_path "$1" --arg new_string "$2" \
    '{file_path:$file_path,new_string:$new_string}' \
    | shasum -a 256 | cut -d ' ' -f1
}

run_hook() {
  local tool="$1"
  local file_path="$2"
  local transcript="$3"
  local content="${4:-// fake edit}"
  local payload
  payload=$(jq -n \
    --arg tn "$tool" --arg fp "$file_path" --arg tp "$transcript" --arg content "$content" \
    '{
       hook_event_name: "PreToolUse",
       tool_name: $tn,
       tool_input: {file_path: $fp, content: $content},
       transcript_path: $tp
     }')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

# Same as run_hook but with custom event (for non-PreToolUse test)
run_hook_event() {
  local event="$1"; local tool="$2"; local file_path="$3"; local transcript="$4"
  local payload
  payload=$(jq -n \
    --arg ev "$event" --arg tn "$tool" --arg fp "$file_path" --arg tp "$transcript" \
    '{
       hook_event_name: $ev,
       tool_name: $tn,
       tool_input: {file_path: $fp, content: "// fake edit"},
       transcript_path: $tp
     }')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

run_evidence() {
  local tool="$1"
  local file_path="$2"
  local transcript="$3"
  local content="$4"
  local payload
  payload=$(jq -n \
    --arg tn "$tool" --arg fp "$file_path" --arg content "$content" \
    '{tool_name: $tn, tool_input: {file_path: $fp, content: $content}}')
  set +e
  EVIDENCE_JSON=$(printf '%s' "$payload" \
    | node "$AUTH_HELPER" --transcript "$transcript" --target "$file_path" --hook-input-stdin)
  EVIDENCE_EXIT=$?
  set -e
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent, exit=$EXIT, stderr=$([ -n "$STDERR_TEXT" ] && echo non-empty || echo empty))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_block() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected BLOCK exit=2 + '$needle', got exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_integrity() {
  local name="$1"; local needle="${2:-GOVERNANCE_INTEGRITY:}"
  if [ "$EXIT" = "70" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected integrity exit=70 + '$needle', got exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_evidence() {
  local name="$1"; local expected_exit="$2"; local decision="$3"; local domain="$4"; local reason="$5"
  if [ "$EVIDENCE_EXIT" = "$expected_exit" ] \
    && printf '%s' "$EVIDENCE_JSON" | jq -e \
      --arg decision "$decision" --arg domain "$domain" --arg reason "$reason" \
      '.decision == $decision and .decisionDomain == $domain and .reasonCode == $reason' \
      >/dev/null 2>&1; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (exit=$EVIDENCE_EXIT evidence=$EVIDENCE_JSON)"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_substantive_edit_approval_preflight tests ==="

# Common transcripts
TX_NEUTRAL="$TMP_DIR/tx_neutral.jsonl"
build_transcript "$TX_NEUTRAL" \
  "請幫我看一下這個 component" \
  "再 review 一次" \
  "我覺得需要 refactor" \
  "幫我跑 audit" \
  "謝謝"

PROD_TSX="/foo/my-project/packages/design-system/src/components/Button/button.tsx"
APPROVED_UI_OPERATION='return <button className="bg-blue-500 hover:bg-blue-600" />'
APPROVED_UI_OPERATION_SHA=$(operation_digest_content "$PROD_TSX" "$APPROVED_UI_OPERATION")
TX_APPROVAL="$TMP_DIR/tx_approval.jsonl"
build_transcript "$TX_APPROVAL" \
  "Button hover 顏色採用藍色並請修改 Button operation sha256:$APPROVED_UI_OPERATION_SHA"

# 1. Non-PreToolUse event → silent
run_hook_event "PostToolUse" "Edit" "$PROD_TSX" "$TX_NEUTRAL"
expect_pass_silent "1. event=PostToolUse → skip"

# 2. Non-Edit tool → silent
run_hook "Read" "$PROD_TSX" "$TX_NEUTRAL"
expect_pass_silent "2. tool=Read → skip"

# 3. Non-DS production path → silent
run_hook "Edit" "/foo/my-project/src/app.tsx" "$TX_NEUTRAL"
expect_pass_silent "3. non-DS production path → skip"

# 4. Stories file in DS → silent (allowlist)
run_hook "Edit" "/foo/my-project/packages/design-system/src/components/Button/button.stories.tsx" "$TX_NEUTRAL"
expect_pass_silent "4. .stories.tsx in DS → skip (allowlist)"

# 4b. stories-helpers/ 示範零件(只被 stories import)與 stories 同類 → silent(2026-09-16 data-toolbar 錨)
run_hook "Edit" "/foo/my-project/packages/design-system/src/stories-helpers/scene/data-toolbar.tsx" "$TX_NEUTRAL" "className='gap-[var(--layout-space-loose)]'"
expect_pass_silent "4b. stories-helpers/*.tsx in DS → skip (allowlist,story 專用零件)"

# 5. A supplied transcript path that cannot be read is an infrastructure failure, not a denial.
run_hook "Edit" "$PROD_TSX" "/nonexistent/path.jsonl"
expect_integrity "5. supplied transcript file missing → integrity failure" "supplied approval transcript"

TX_MALFORMED="$TMP_DIR/tx_malformed.jsonl"
printf '{broken\n' > "$TX_MALFORMED"
run_hook "Edit" "$PROD_TSX" "$TX_MALFORMED"
expect_integrity "5b. malformed transcript → integrity failure" "transcript is malformed"

# 6. DS production tsx + neutral transcript (no approval) → BLOCK
run_hook "Edit" "$PROD_TSX" "$TX_NEUTRAL"
expect_block "6. DS tsx + no approval → BLOCK exit 2" "BLOCKER"

# 6a. Code tokens cannot prove engineering authority without transcript/runner evidence.
run_hook "Edit" "$PROD_TSX" "" 'const nextValue = normalizeValue(value ?? null)'
expect_block "6a. no transcript + engineering-looking source → authority-evidence BLOCK" "PROVIDER_AUTHORITY_EVIDENCE_REQUIRED"

# 6b. Missing transcript never authorizes a product/UI/UX choice.
run_hook "Edit" "$PROD_TSX" "" 'return <button className="bg-blue-500" onClick={navigate} />'
expect_block "6b. no transcript + UI/behavior operation → BLOCK" "EXACT_UI_UX_TARGET_BINDING_MISSING"

# 6c. Missing transcript plus ambiguous production operation remains fail closed.
run_hook "Edit" "$PROD_TSX" "" 'return nextValue'
expect_block "6c. no transcript + ambiguous production operation → BLOCK" "PROVIDER_AUTHORITY_EVIDENCE_REQUIRED"

# 7. Exact target-bound UI choice authorizes only that target.
run_hook "Edit" "$PROD_TSX" "$TX_APPROVAL" "$APPROVED_UI_OPERATION"
expect_pass_silent "7. exact Button UI choice + matching operation digest → pass"

# 2026-08-04 user verbatim「我在這裡說可以就是可以,就是授權給你」: a target-bound directive
# approves WITHOUT quoting an operation digest — the digest requirement was the removed per-PR
# signature family (835b519e). A quoted-but-WRONG digest still fails closed (next case).
TX_APPROVAL_MISSING_OPERATION="$TMP_DIR/tx_approval_missing_operation.jsonl"
build_transcript "$TX_APPROVAL_MISSING_OPERATION" \
  "Button hover 顏色採用藍色並請修改 Button"
run_hook "Edit" "$PROD_TSX" "$TX_APPROVAL_MISSING_OPERATION" "$APPROVED_UI_OPERATION"
expect_pass_silent "7. target-bound UI approval without operation digest → pass(chat approval is the approval)"

TX_APPROVAL_SUBSTITUTED_OPERATION="$TMP_DIR/tx_approval_substituted_operation.jsonl"
build_transcript "$TX_APPROVAL_SUBSTITUTED_OPERATION" \
  "Button hover 顏色採用藍色並請修改 Button operation sha256:$(printf '0%.0s' {1..64})"
run_hook "Edit" "$PROD_TSX" "$TX_APPROVAL_SUBSTITUTED_OPERATION" "$APPROVED_UI_OPERATION"
expect_block "7. substituted UI operation digest → BLOCK" \
  "EXACT_UI_UX_OPERATION_BINDING_MISSING_OR_MISMATCH"

REPLAYED_UI_OPERATION='return <button className="bg-red-500 hover:bg-red-600" />'
run_hook "Edit" "$PROD_TSX" "$TX_APPROVAL" "$REPLAYED_UI_OPERATION"
expect_block "7. replayed approval digest for a different operation → BLOCK" \
  "EXACT_UI_UX_OPERATION_BINDING_MISSING_OR_MISMATCH"

# 7a. Exact engineering intent plus non-UI operation evidence uses standing authorization.
# UI/UX operation markers, denial/revocation, and unknown cases remain fail closed.
for engineering in \
  "請修復 Button 的 TypeScript null bug" \
  "請重構 Button 的資料流，不改 UI" \
  "請補 Button 的 regression test" \
  "請修復 Button governance hook 的 drift" \
  "請完成 Button infra remediation"; do
  tx="$TMP_DIR/tx_engineering_$PASS.jsonl"
  build_transcript "$tx" "$engineering"
  run_hook "Edit" "$PROD_TSX" "$tx" 'const nextValue = normalizeValue(value)'
  expect_pass_silent "7a. engineering domain uses standing authorization: $engineering"
done

# A generic engineering scope cannot authorize an unrelated UI, behavior,
# accessibility-state, or visible-copy change.
TX_ENGINEERING_UI="$TMP_DIR/tx_engineering_ui.jsonl"
build_transcript "$TX_ENGINEERING_UI" "請修復 Button 的 TypeScript null bug"
for ui_operation in \
  '<button type="button" disabled>Save</button>' \
  '<button aria-expanded={true}>Save</button>' \
  '<button>Delete account permanently</button>' \
  '<button onClick={deleteAccount}>Save</button>'; do
  run_hook "Edit" "$PROD_TSX" "$TX_ENGINEERING_UI" "$ui_operation"
  expect_block "7a2. engineering prompt cannot authorize UI/behavior: $ui_operation" "TARGET_BOUND_UI_UX_CHOICE_MISSING"
done

# Exact existing-requirement remediation remains engineering even when the source bytes
# necessarily contain visual, behavior, accessibility, or visible-copy tokens.
while IFS='|' read -r remediation ui_operation; do
  tx="$TMP_DIR/tx_ui_remediation_$PASS.jsonl"
  build_transcript "$tx" "$remediation"
  run_hook "Edit" "$PROD_TSX" "$tx" "$ui_operation"
  expect_pass_silent "7a3. existing UI-looking remediation uses standing authority: $remediation"
done <<'UI_REMEDIATIONS'
請修復 Button 的 hover 顏色 regression，對齊既有 button.spec.md|return <button className="hover:bg-action-hover" />
請修正 Button 的 a11y aria-expanded state，使其符合現有規格|return <button aria-expanded={open}>Save</button>
請修復 Button 的 keyboard interaction behavior bug|return <button onKeyDown={handleKeyDown}>Save</button>
請機械同步 Button 的 visible label 到既有 SSOT 文案|return <button>儲存</button>
請重構 Button render structure 並維持目前 UI/UX semantics|return <button className={buttonStyles}>Save</button>
UI_REMEDIATIONS

# Standing-delegated engineering may close over all existing canonical regressions.
# This is remediation authority, not a global product/UI choice.
TX_GLOBAL_REMEDIATION="$TMP_DIR/tx_global_remediation.jsonl"
build_transcript "$TX_GLOBAL_REMEDIATION" "請修復所有既有 a11y regression，使其符合 canonical 規格"
run_hook "Edit" "$PROD_TSX" "$TX_GLOBAL_REMEDIATION" \
  'return <button aria-expanded={open}>Save</button>'
expect_pass_silent "7a4. all-existing canonical remediation scope → pass"

TX_CLOSED_REMEDIATION_TARGETS="$TMP_DIR/tx_closed_remediation_targets.jsonl"
build_transcript "$TX_CLOSED_REMEDIATION_TARGETS" \
  "請修復 Button 與 Input 的既有 a11y regression"
run_hook "Edit" "$PROD_TSX" "$TX_CLOSED_REMEDIATION_TARGETS" \
  'return <button aria-expanded={open}>Save</button>'
expect_pass_silent "7a4b. closed explicit remediation target list includes Button → pass"

# NFKC normalization preserves an exact target-bound remediation; it does not weaken binding.
TX_NORMALIZED_REMEDIATION="$TMP_DIR/tx_normalized_remediation.jsonl"
build_transcript "$TX_NORMALIZED_REMEDIATION" \
  "請修復 Ｂｕｔｔｏｎ 的 hover regression，對齊既有 SSOT"
run_hook "Edit" "$PROD_TSX" "$TX_NORMALIZED_REMEDIATION" \
  'return <button className="hover:bg-action-hover" />'
expect_pass_silent "7a5. NFKC target normalization preserves exact remediation → pass"

# Engineering intent for another exact target cannot authorize this target.
TX_WRONG_ENGINEERING_TARGET="$TMP_DIR/tx_wrong_engineering_target.jsonl"
build_transcript "$TX_WRONG_ENGINEERING_TARGET" "請修復 Input 的 TypeScript null bug"
run_hook "Edit" "$PROD_TSX" "$TX_WRONG_ENGINEERING_TARGET" 'const nextValue = normalizeValue(value)'
expect_block "7a6. Input engineering intent cannot authorize Button" "UNKNOWN_POTENTIAL_UI_UX_DECISION"

# UI-looking remediation remains exact-target bound.
TX_WRONG_UI_REMEDIATION_TARGET="$TMP_DIR/tx_wrong_ui_remediation_target.jsonl"
build_transcript "$TX_WRONG_UI_REMEDIATION_TARGET" \
  "請修復 Input 的 a11y aria-expanded regression，對齊既有規格"
run_hook "Edit" "$PROD_TSX" "$TX_WRONG_UI_REMEDIATION_TARGET" \
  'return <button aria-expanded={open}>Save</button>'
expect_block "7a7. Input UI remediation cannot authorize Button" "EXACT_UI_UX_TARGET_BINDING_MISSING"

# Mentioning another target's “UI” is not an implicit repository-wide decision.
TX_WRONG_UI_SCOPE="$TMP_DIR/tx_wrong_ui_scope.jsonl"
build_transcript "$TX_WRONG_UI_SCOPE" "Input UI hover 顏色改成藍色，請修改 Input"
run_hook "Edit" "$PROD_TSX" "$TX_WRONG_UI_SCOPE" \
  'return <button className="hover:bg-blue-500" />'
expect_block "7a8. another target's UI wording is not global scope" "EXACT_UI_UX_TARGET_BINDING_MISSING"

# An unresolved product/UI/UX choice remains human-only even if the user delegates execution.
TX_UNRESOLVED_UI_CHOICE="$TMP_DIR/tx_unresolved_ui_choice.jsonl"
build_transcript "$TX_UNRESOLVED_UI_CHOICE" \
  "Button hover 顏色紅色還是藍色由你自行決定"
run_hook "Edit" "$PROD_TSX" "$TX_UNRESOLVED_UI_CHOICE" \
  'return <button className="hover:bg-blue-500" />'
expect_block "7a9. unresolved target-bound UI choice → BLOCK" "TARGET_BOUND_DISCUSSION_OR_QUESTION"

# Product choice/tradeoff semantics take precedence over remediation words. A resolved choice is
# still operation-bound, while an unresolved choice remains human-only.
CHOICE_REMEDIATION_OPERATION='return <button className="hover:bg-blue-500" />'
CHOICE_REMEDIATION_SHA=$(operation_digest_content "$PROD_TSX" "$CHOICE_REMEDIATION_OPERATION")
TX_CHOICE_WITH_REMEDIATION="$TMP_DIR/tx_choice_with_remediation.jsonl"
build_transcript "$TX_CHOICE_WITH_REMEDIATION" \
  "請修復 Button regression 並最終決定 Button hover 採用藍色 operation sha256:$CHOICE_REMEDIATION_SHA"
run_evidence "Edit" "$PROD_TSX" "$TX_CHOICE_WITH_REMEDIATION" "$CHOICE_REMEDIATION_OPERATION"
expect_evidence \
  "7a10. explicit UI choice wins over remediation marker" \
  0 "approved" "product-ui-ux" "TARGET_BOUND_UI_UX_DECISION_APPROVED"

TX_UNRESOLVED_WITH_REMEDIATION="$TMP_DIR/tx_unresolved_with_remediation.jsonl"
build_transcript "$TX_UNRESOLVED_WITH_REMEDIATION" \
  "請修復 Button hover bug 但紅色還是藍色由你自行決定"
run_hook "Edit" "$PROD_TSX" "$TX_UNRESOLVED_WITH_REMEDIATION" "$CHOICE_REMEDIATION_OPERATION"
expect_block "7a11. remediation words cannot bypass unresolved UI choice" \
  "TARGET_BOUND_DISCUSSION_OR_QUESTION"

# Exact target, resolved directive, and operation digest must be in the same active clause.
TX_REFERENCE_ONLY_TARGET="$TMP_DIR/tx_reference_only_target.jsonl"
build_transcript "$TX_REFERENCE_ONLY_TARGET" \
  "參考 Button 作為範例；Input hover 顏色採用藍色 operation sha256:$CHOICE_REMEDIATION_SHA"
run_hook "Edit" "$PROD_TSX" "$TX_REFERENCE_ONLY_TARGET" "$CHOICE_REMEDIATION_OPERATION"
expect_block "7a12. reference-only Button cannot bind Input directive" \
  "EXACT_UI_UX_TARGET_BINDING_MISSING"

TX_CROSS_CLAUSE_DIRECTIVE="$TMP_DIR/tx_cross_clause_directive.jsonl"
build_transcript "$TX_CROSS_CLAUSE_DIRECTIVE" \
  "Button 只供識別；hover 顏色採用藍色 operation sha256:$CHOICE_REMEDIATION_SHA"
run_hook "Edit" "$PROD_TSX" "$TX_CROSS_CLAUSE_DIRECTIVE" "$CHOICE_REMEDIATION_OPERATION"
expect_block "7a13. target and directive in different clauses cannot bind" \
  "EXACT_UI_UX_TARGET_BINDING_MISSING"

TX_OTHER_REFERENCE_EXACT_BUTTON="$TMP_DIR/tx_other_reference_exact_button.jsonl"
build_transcript "$TX_OTHER_REFERENCE_EXACT_BUTTON" \
  "參考 Input 作為範例；Button hover 顏色採用藍色 operation sha256:$CHOICE_REMEDIATION_SHA"
run_hook "Edit" "$PROD_TSX" "$TX_OTHER_REFERENCE_EXACT_BUTTON" "$CHOICE_REMEDIATION_OPERATION"
expect_pass_silent "7a14. another reference does not invalidate exact Button decision"

for reference_only in \
  "Use Button as a guide and set Input hover color to blue operation sha256:$CHOICE_REMEDIATION_SHA" \
  "以 Button 為參考並讓 Input hover 顏色採用藍色 operation sha256:$CHOICE_REMEDIATION_SHA"; do
  tx="$TMP_DIR/tx_reference_variant_$PASS.jsonl"
  build_transcript "$tx" "$reference_only"
  run_hook "Edit" "$PROD_TSX" "$tx" "$CHOICE_REMEDIATION_OPERATION"
  expect_block "7a14b. reference-role variants cannot bind Button" \
    "EXACT_UI_UX_TARGET_BINDING_MISSING"
done

# Direct denials override remediation/continuation language. Unsafe format-control characters
# fail closed before any positive target inference.
ZERO_WIDTH_UNCHANGED=$(printf '保持 Button 不\342\200\213變')
ZERO_WIDTH_DONT_TOUCH=$(printf "Button d\342\200\213on\342\201\240't tou\342\200\213ch")
for denial in \
  "Button don't touch" \
  "保持 Button 不變" \
  "Button hover 不採用藍色 operation sha256:$CHOICE_REMEDIATION_SHA" \
  "Button hover 不要使用藍色 operation sha256:$CHOICE_REMEDIATION_SHA" \
  "Do not use blue for Button hover operation sha256:$CHOICE_REMEDIATION_SHA"; do
  tx="$TMP_DIR/tx_denial_$PASS.jsonl"
  build_transcript "$tx" "$denial"
  run_hook "Edit" "$PROD_TSX" "$tx" "$CHOICE_REMEDIATION_OPERATION"
  expect_block "7a15. target denial remains fail closed: $denial" \
    "TARGET_BOUND_DENIAL_OR_REVOCATION"
done

for unsafe_authority in "$ZERO_WIDTH_UNCHANGED" "$ZERO_WIDTH_DONT_TOUCH"; do
  tx="$TMP_DIR/tx_unsafe_unicode_$PASS.jsonl"
  build_transcript "$tx" "$unsafe_authority"
  run_hook "Edit" "$PROD_TSX" "$tx" "$CHOICE_REMEDIATION_OPERATION"
  expect_block "7a16. unsafe Unicode authority text fails closed" \
    "UNSAFE_UNICODE_AUTHORITY_TEXT"
done

ZERO_WIDTH_BUTTON=$(printf 'But\342\200\213ton')
TX_UNSAFE_POSITIVE="$TMP_DIR/tx_unsafe_positive.jsonl"
build_transcript "$TX_UNSAFE_POSITIVE" \
  "$ZERO_WIDTH_BUTTON hover 顏色採用藍色 operation sha256:$CHOICE_REMEDIATION_SHA"
run_hook "Edit" "$PROD_TSX" "$TX_UNSAFE_POSITIVE" "$CHOICE_REMEDIATION_OPERATION"
expect_block "7a17. unsafe Unicode cannot create a positive target binding" \
  "UNSAFE_UNICODE_AUTHORITY_TEXT"

UNSAFE_TARGET="/foo/my-project/packages/design-system/src/components/${ZERO_WIDTH_BUTTON}/button.tsx"
UNSAFE_TARGET_SHA=$(operation_digest_content "$UNSAFE_TARGET" "$CHOICE_REMEDIATION_OPERATION")
TX_UNSAFE_TARGET="$TMP_DIR/tx_unsafe_target.jsonl"
build_transcript "$TX_UNSAFE_TARGET" \
  "Button hover 顏色採用藍色 operation sha256:$UNSAFE_TARGET_SHA"
run_evidence "Edit" "$UNSAFE_TARGET" "$TX_UNSAFE_TARGET" "$CHOICE_REMEDIATION_OPERATION"
expect_evidence \
  "7a17b. unsafe Unicode target path cannot alias a clean target" \
  2 "blocked" "unknown" "UNSAFE_UNICODE_DECISION_TARGET"

# Quoted, tentative, conditional, or delegated-choice text is not user product authority,
# even when an attacker supplies the current operation digest.
while IFS= read -r non_authoritative; do
  tx="$TMP_DIR/tx_non_authoritative_$PASS.jsonl"
  build_transcript "$tx" "$non_authoritative"
  run_hook "Edit" "$PROD_TSX" "$tx" "$CHOICE_REMEDIATION_OPERATION"
  expect_block "7a18. non-authoritative UI statement remains blocked" \
    "TARGET_BOUND_DISCUSSION_OR_QUESTION"
done <<NON_AUTHORITATIVE_UI
下面是別人的建議 不代表我的決定：「Button hover 顏色採用藍色 operation sha256:${CHOICE_REMEDIATION_SHA}」
Reviewer 說：「Button hover 顏色改成藍色 operation sha256:${CHOICE_REMEDIATION_SHA}」
我在考慮把 Button hover 顏色改成藍色 operation sha256:${CHOICE_REMEDIATION_SHA}
也許 Button hover 顏色改成藍色 operation sha256:${CHOICE_REMEDIATION_SHA}
如果客戶同意就把 Button hover 顏色改成藍色 operation sha256:${CHOICE_REMEDIATION_SHA}
等客戶同意後，把 Button hover 顏色改成藍色 operation sha256:${CHOICE_REMEDIATION_SHA}
Button 顏色請你選擇最佳方案 operation sha256:${CHOICE_REMEDIATION_SHA}
NON_AUTHORITATIVE_UI

TX_GLOBAL_REMEDIATION_WITH_CHOICE="$TMP_DIR/tx_global_remediation_with_choice.jsonl"
build_transcript "$TX_GLOBAL_REMEDIATION_WITH_CHOICE" \
  "請修復所有既有 a11y regression 但紅色還是藍色由你自行決定"
run_hook "Edit" "$PROD_TSX" "$TX_GLOBAL_REMEDIATION_WITH_CHOICE" \
  "$CHOICE_REMEDIATION_OPERATION"
expect_block "7a19. global remediation cannot carry an unresolved product choice" \
  "TARGET_BOUND_DISCUSSION_OR_QUESTION"

for global_resolved_choice in \
  "請修復所有既有 UI regression，顏色統一改成藍色 operation sha256:$CHOICE_REMEDIATION_SHA" \
  "請修復所有既有 UI regression 並把所有 UI 顏色改成藍色 operation sha256:$CHOICE_REMEDIATION_SHA"; do
  tx="$TMP_DIR/tx_global_resolved_choice_$PASS.jsonl"
  build_transcript "$tx" "$global_resolved_choice"
  run_hook "Edit" "$PROD_TSX" "$tx" "$CHOICE_REMEDIATION_OPERATION"
  expect_block "7a20. global remediation cannot carry a resolved product choice" \
    "TARGET_BOUND_DISCUSSION_OR_QUESTION"
done

# 7b. Standing delegation plus non-UI operation evidence authorizes engineering execution.
TX_STANDING_ENGINEERING="$TMP_DIR/tx_standing_engineering.jsonl"
build_transcript "$TX_STANDING_ENGINEERING" \
  "所有 engineering bug、refactor、test、governance、infra remediation 都授權直接完成"
run_hook "Edit" "$PROD_TSX" "$TX_STANDING_ENGINEERING" 'const nextValue = normalizeValue(value)'
expect_pass_silent "7b. standing delegation + non-UI production operation → pass"

# 7c. An older target approval cannot override the latest target denial/revocation.
TX_OLD_APPROVAL_LATEST_DENIAL="$TMP_DIR/tx_old_approval_latest_denial.jsonl"
build_transcript "$TX_OLD_APPROVAL_LATEST_DENIAL" \
  "Button hover 顏色採用藍色，請修改" \
  "撤銷 Button 的 UI 修改核准，先不要修改 Button"
run_hook "Edit" "$PROD_TSX" "$TX_OLD_APPROVAL_LATEST_DENIAL" 'return <button className="bg-blue-500" />'
expect_block "7c. target approval + latest target revocation → BLOCK" "TARGET_BOUND_DENIAL_OR_REVOCATION"

# An older UI denial is not a standing ban on a later, unrelated engineering repair.
TX_OLD_UI_DENIAL_LATEST_ENGINEERING="$TMP_DIR/tx_old_ui_denial_latest_engineering.jsonl"
build_transcript "$TX_OLD_UI_DENIAL_LATEST_ENGINEERING" \
  "Button hover 顏色先不要修改 Button" \
  "請修復 Button 的 TypeScript null bug"
run_hook "Edit" "$PROD_TSX" "$TX_OLD_UI_DENIAL_LATEST_ENGINEERING" 'const nextValue = normalizeValue(value)'
expect_pass_silent "7c2. old UI denial + later engineering repair → pass"

# A denial in the current target-bound engineering instruction still wins.
TX_CURRENT_ENGINEERING_DENIAL="$TMP_DIR/tx_current_engineering_denial.jsonl"
build_transcript "$TX_CURRENT_ENGINEERING_DENIAL" "Button 的 TypeScript bug 先不要修改 Button"
run_hook "Edit" "$PROD_TSX" "$TX_CURRENT_ENGINEERING_DENIAL" 'const nextValue = normalizeValue(value)'
expect_block "7c3. current target-bound engineering denial → BLOCK" "TARGET_BOUND_DENIAL_OR_REVOCATION"

# A generic continuation does not become UI approval, but it also does not convert an already
# target-bound engineering task into a human-decision domain.
TX_ENGINEERING_THEN_GENERIC="$TMP_DIR/tx_engineering_then_generic.jsonl"
build_transcript "$TX_ENGINEERING_THEN_GENERIC" \
  "請修復 Button 的 TypeScript null bug" \
  "go ahead"
run_hook "Edit" "$PROD_TSX" "$TX_ENGINEERING_THEN_GENERIC" 'const nextValue = normalizeValue(value)'
expect_pass_silent "7c4. target engineering task + generic continuation → pass"

# A generic continuation may continue the most recent exact UI-looking remediation scope.
TX_UI_REMEDIATION_THEN_GENERIC="$TMP_DIR/tx_ui_remediation_then_generic.jsonl"
build_transcript "$TX_UI_REMEDIATION_THEN_GENERIC" \
  "請修復 Button 的 hover regression，對齊既有 button.spec.md" \
  "go ahead"
run_hook "Edit" "$PROD_TSX" "$TX_UI_REMEDIATION_THEN_GENERIC" \
  'return <button className="hover:bg-action-hover" />'
expect_pass_silent "7c5. exact UI remediation + generic continuation → pass"

# A current denial still overrides remediation language.
TX_REMEDIATION_DENIED="$TMP_DIR/tx_remediation_denied.jsonl"
build_transcript "$TX_REMEDIATION_DENIED" \
  "請修復 Button 的 a11y regression，但先不要修改 Button"
run_hook "Edit" "$PROD_TSX" "$TX_REMEDIATION_DENIED" \
  'return <button aria-expanded={open}>Save</button>'
expect_block "7c6. target remediation plus current denial → BLOCK" "TARGET_BOUND_DENIAL_OR_REVOCATION"

# A generic continuation cannot jump backward over a later denial/revocation.
TX_REMEDIATION_DENIED_THEN_GENERIC="$TMP_DIR/tx_remediation_denied_then_generic.jsonl"
build_transcript "$TX_REMEDIATION_DENIED_THEN_GENERIC" \
  "請修復 Button 的 a11y regression，對齊既有規格" \
  "撤銷 Button 修改授權，先不要修改 Button" \
  "go ahead"
run_hook "Edit" "$PROD_TSX" "$TX_REMEDIATION_DENIED_THEN_GENERIC" \
  'return <button aria-expanded={open}>Save</button>'
expect_block "7c7. generic continuation cannot bypass later target revocation" "TARGET_BOUND_DENIAL_OR_REVOCATION"

# Nor can a generic continuation revive an older target after the current scope moved elsewhere.
TX_REMEDIATION_WRONG_TARGET_THEN_GENERIC="$TMP_DIR/tx_remediation_wrong_target_then_generic.jsonl"
build_transcript "$TX_REMEDIATION_WRONG_TARGET_THEN_GENERIC" \
  "請修復 Button 的 a11y regression，對齊既有規格" \
  "請修復 Input 的 a11y regression，對齊既有規格" \
  "go ahead"
run_hook "Edit" "$PROD_TSX" "$TX_REMEDIATION_WRONG_TARGET_THEN_GENERIC" \
  'return <button aria-expanded={open}>Save</button>'
expect_block "7c8. generic continuation cannot revive an older wrong target" "EXACT_UI_UX_TARGET_BINDING_MISSING"

# The latest non-generic scope is the only inheritable scope. Older product approvals,
# remediations, or denials are never searched after scope moved elsewhere.
TX_APPROVAL_WRONG_TARGET_THEN_GENERIC="$TMP_DIR/tx_approval_wrong_target_then_generic.jsonl"
build_transcript "$TX_APPROVAL_WRONG_TARGET_THEN_GENERIC" \
  "Button hover 顏色採用藍色 operation sha256:$CHOICE_REMEDIATION_SHA" \
  "請修復 Input 的 hover regression，對齊既有規格" \
  "go ahead"
run_hook "Edit" "$PROD_TSX" "$TX_APPROVAL_WRONG_TARGET_THEN_GENERIC" \
  "$CHOICE_REMEDIATION_OPERATION"
expect_block "7c9. generic continuation cannot revive older Button approval" \
  "EXACT_UI_UX_TARGET_BINDING_MISSING"

TX_MULTI_GENERIC_REMEDIATION="$TMP_DIR/tx_multi_generic_remediation.jsonl"
build_transcript "$TX_MULTI_GENERIC_REMEDIATION" \
  "請修復 Button 的 hover regression，對齊既有規格" \
  "go ahead" \
  "continue"
run_hook "Edit" "$PROD_TSX" "$TX_MULTI_GENERIC_REMEDIATION" \
  "$CHOICE_REMEDIATION_OPERATION"
expect_pass_silent "7c10. multiple generic continuations inherit latest exact Button remediation"

TX_DENIAL_THEN_REMEDIATION_GENERIC="$TMP_DIR/tx_denial_then_remediation_generic.jsonl"
build_transcript "$TX_DENIAL_THEN_REMEDIATION_GENERIC" \
  "保持 Button 不變" \
  "請修復 Button 的 hover regression，對齊既有規格" \
  "go ahead"
run_hook "Edit" "$PROD_TSX" "$TX_DENIAL_THEN_REMEDIATION_GENERIC" \
  "$CHOICE_REMEDIATION_OPERATION"
expect_pass_silent "7c11. newer exact remediation supersedes older Button denial"

# A latest targetless revocation or uncertainty terminates prior scope; it never falls back to
# the older operation-bound product approval.
for targetless_denial in \
  "Actually, don't do that" \
  "Stop." \
  "先不要了"; do
  tx="$TMP_DIR/tx_targetless_denial_$PASS.jsonl"
  build_transcript "$tx" \
    "Button hover 顏色採用藍色 operation sha256:$APPROVED_UI_OPERATION_SHA" \
    "$targetless_denial"
  run_hook "Edit" "$PROD_TSX" "$tx" "$APPROVED_UI_OPERATION"
  expect_block "7c12. latest targetless revocation terminates old Button authority" \
    "TARGET_BOUND_DENIAL_OR_REVOCATION"
done

TX_TARGETLESS_DISCUSSION="$TMP_DIR/tx_targetless_discussion.jsonl"
build_transcript "$TX_TARGETLESS_DISCUSSION" \
  "Button hover 顏色採用藍色 operation sha256:$APPROVED_UI_OPERATION_SHA" \
  "改成紅色還是綠色比較好？"
run_hook "Edit" "$PROD_TSX" "$TX_TARGETLESS_DISCUSSION" "$APPROVED_UI_OPERATION"
expect_block "7c13. latest targetless UI uncertainty terminates old Button authority" \
  "TARGET_BOUND_DISCUSSION_OR_QUESTION"

# 7d. Generic execution language cannot authorize a UI/UX decision.
for generic in \
  "go ahead" \
  "全部做完" \
  "目標合理，就開始馬不停蹄的把所有階段任務全部做完並自行驗證"; do
  tx="$TMP_DIR/tx_generic_$PASS.jsonl"
  build_transcript "$tx" "$generic"
  run_hook "Edit" "$PROD_TSX" "$tx" 'return <button className="bg-blue-500 hover:bg-blue-600" />'
  expect_block "7d. generic directive cannot authorize Button UI: $generic" "EXACT_UI_UX_TARGET_BINDING_MISSING"
done

# 7e. Standing engineering delegation must not authorize a UI/UX tradeoff.
run_hook "Edit" "$PROD_TSX" "$TX_STANDING_ENGINEERING" 'return <button className="bg-blue-500 hover:bg-blue-600" />'
expect_block "7e. standing engineering delegation + UI operation → BLOCK" "EXACT_UI_UX_TARGET_BINDING_MISSING"

# 7f. 「不要等待核准」is workflow delegation, not a denial.
TX_NO_WAIT_ENGINEERING="$TMP_DIR/tx_no_wait_engineering.jsonl"
build_transcript "$TX_NO_WAIT_ENGINEERING" \
  "不要等待核准，繼續修復 Button 的 TypeScript bug"
run_hook "Edit" "$PROD_TSX" "$TX_NO_WAIT_ENGINEERING" 'const nextValue = normalizeValue(value)'
expect_pass_silent "7f. no-wait clause + engineering remediation → pass"

# 7g. A target-bound question is not a product decision.
TX_TARGET_QUESTION="$TMP_DIR/tx_target_question.jsonl"
build_transcript "$TX_TARGET_QUESTION" "Button hover 顏色要不要改成藍色？"
run_hook "Edit" "$PROD_TSX" "$TX_TARGET_QUESTION" 'return <button className="bg-blue-500" />'
expect_block "7g. target-bound UI question → BLOCK" "TARGET_BOUND_DISCUSSION_OR_QUESTION"

# 7h. Approval for another target cannot authorize Button.
TX_WRONG_TARGET="$TMP_DIR/tx_wrong_target.jsonl"
build_transcript "$TX_WRONG_TARGET" "Input hover 顏色採用藍色，請修改 Input"
run_hook "Edit" "$PROD_TSX" "$TX_WRONG_TARGET" 'return <button className="bg-blue-500" />'
expect_block "7h. Input decision cannot authorize Button → BLOCK" "EXACT_UI_UX_TARGET_BINDING_MISSING"

# 7i. Repo-relative paths are governed too (provider adapters need not fabricate an absolute path).
run_hook "Edit" "packages/design-system/src/components/Button/button.tsx" "$TX_NEUTRAL"
expect_block "7i. repo-relative substantive path → BLOCK" "UNKNOWN_POTENTIAL_UI_UX_DECISION"

# 7j. MultiEdit cannot hide a production target behind a benign first path.
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
jq -n --arg tp "$TX_NEUTRAL" '{hook_event_name:"PreToolUse",tool_name:"MultiEdit",transcript_path:$tp,tool_input:{file_path:"README.md",edits:[{file_path:"README.md"},{file_path:"packages/design-system/src/components/Button/button.tsx",new_string:"className=\"bg-blue-500\""}]}}' \
  | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
EXIT=$?
set -e
STDERR_TEXT=$(cat "$STDERR")
rm -f "$STDOUT" "$STDERR"
expect_block "7j. benign-first MultiEdit still governs later production path" "EXACT_UI_UX_TARGET_BINDING_MISSING"

# 7k. Every production target in MultiEdit needs its own exact decision.
MULTI_BUTTON_PATH="packages/design-system/src/components/Button/button.tsx"
MULTI_INPUT_PATH="packages/design-system/src/components/Input/input.tsx"
MULTI_BUTTON_OPERATION='className="bg-blue-500"'
MULTI_INPUT_OPERATION='className="border-blue-500"'
MULTI_BUTTON_SHA=$(operation_digest_new_string "$MULTI_BUTTON_PATH" "$MULTI_BUTTON_OPERATION")
MULTI_INPUT_SHA=$(operation_digest_new_string "$MULTI_INPUT_PATH" "$MULTI_INPUT_OPERATION")
TX_MULTI_BUTTON_ONLY="$TMP_DIR/tx_multi_button_only.jsonl"
build_transcript "$TX_MULTI_BUTTON_ONLY" \
  "Button hover 顏色採用藍色 operation sha256:$MULTI_BUTTON_SHA"
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
jq -n \
  --arg tp "$TX_MULTI_BUTTON_ONLY" \
  --arg button_path "$MULTI_BUTTON_PATH" --arg button_operation "$MULTI_BUTTON_OPERATION" \
  --arg input_path "$MULTI_INPUT_PATH" --arg input_operation "$MULTI_INPUT_OPERATION" \
  '{hook_event_name:"PreToolUse",tool_name:"MultiEdit",transcript_path:$tp,tool_input:{edits:[
    {file_path:$button_path,new_string:$button_operation},
    {file_path:$input_path,new_string:$input_operation}
  ]}}' | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
EXIT=$?
set -e
STDERR_TEXT=$(cat "$STDERR")
rm -f "$STDOUT" "$STDERR"
expect_block "7k. Button decision cannot authorize Input in same MultiEdit" "Input/input.tsx"

# A MultiEdit passes only when each governed target has its own matching operation digest.
TX_MULTI_ALL_TARGETS="$TMP_DIR/tx_multi_all_targets.jsonl"
build_transcript "$TX_MULTI_ALL_TARGETS" \
  "Button hover 顏色採用藍色 operation sha256:${MULTI_BUTTON_SHA}；Input 邊框顏色採用藍色 operation sha256:${MULTI_INPUT_SHA}"
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
jq -n \
  --arg tp "$TX_MULTI_ALL_TARGETS" \
  --arg button_path "$MULTI_BUTTON_PATH" --arg button_operation "$MULTI_BUTTON_OPERATION" \
  --arg input_path "$MULTI_INPUT_PATH" --arg input_operation "$MULTI_INPUT_OPERATION" \
  '{hook_event_name:"PreToolUse",tool_name:"MultiEdit",transcript_path:$tp,tool_input:{edits:[
    {file_path:$button_path,new_string:$button_operation},
    {file_path:$input_path,new_string:$input_operation}
  ]}}' | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
EXIT=$?
set -e
STDERR_TEXT=$(cat "$STDERR")
rm -f "$STDOUT" "$STDERR"
expect_pass_silent "7k2. MultiEdit requires matching operation digest for every target"

# ── 8. AskUserQuestion structured ratification(2026-08-18)──
# 選項元件的回答 = 使用者本人對 exact 提案的核准(harness 寫入 tool_result,assistant 無法
# 偽造 user-role 記錄)。核准位元組只取自 harness 答案文字;目標綁定可來自答案或提問所附的
# assistant 提案文字(綁定本身不授權,沒有真實選擇事件什麼都不給)。之後出現的純文字 user
# 訊息一律蓋過;背景任務通知(SYSTEM NOTIFICATION)永不算 user 發言。

# Transcript: plain user ask → assistant proposal(含 target alias)→ AskUserQuestion → 使用者選擇
build_ask_selection_transcript() {
  local path="$1"; local proposal="$2"; local answer="$3"; local trailing="${4:-}"
  : > "$path"
  jq -n '{message:{role:"user",content:[{type:"text",text:"排序箭頭顏色到底怎麼定?研究一下"}]}}' >> "$path"
  jq -n --arg t "$proposal" '{message:{role:"assistant",content:[{type:"text",text:$t}]}}' >> "$path"
  jq -n '{message:{role:"assistant",content:[{type:"tool_use",id:"toolu_ask_1",name:"AskUserQuestion",input:{questions:[{question:"排序箭頭要怎麼定?",header:"排序箭頭",options:[]}]}}]}}' >> "$path"
  jq -n --arg a "$answer" '{message:{role:"user",content:[{type:"tool_result",tool_use_id:"toolu_ask_1",content:[{type:"text",text:$a}]}]}}' >> "$path"
  if [ -n "$trailing" ]; then
    jq -n --arg t "$trailing" '{message:{role:"user",content:[{type:"text",text:$t}]}}' >> "$path"
  fi
}

TX_ASK_OK="$TMP_DIR/tx_ask_ok.jsonl"
build_ask_selection_transcript "$TX_ASK_OK" \
  "提案:data-table.tsx 的排序箭頭拿掉釘死的 text-fg-secondary,改繼承點擊區文字色與 label 連動。" \
  'The user answered: "排序箭頭拍板"="跟 label 連動(推薦)"'
run_hook "Edit" "packages/design-system/src/components/DataTable/data-table.tsx" "$TX_ASK_OK"
expect_pass_silent "8a. AskUserQuestion selection + proposal 含 target alias → approved"

TX_ASK_NO_ALIAS="$TMP_DIR/tx_ask_no_alias.jsonl"
build_ask_selection_transcript "$TX_ASK_NO_ALIAS" \
  "提案:排序箭頭拿掉釘死的灰色,改繼承文字色。" \
  'The user answered: "排序箭頭拍板"="跟 label 連動(推薦)"'
run_hook "Edit" "packages/design-system/src/components/DataTable/data-table.tsx" "$TX_ASK_NO_ALIAS"
expect_block "8b. selection 但提案與答案都無 target alias → fail closed" "data-table"

TX_ASK_DENY="$TMP_DIR/tx_ask_deny.jsonl"
build_ask_selection_transcript "$TX_ASK_DENY" \
  "提案:data-table.tsx 的排序箭頭改繼承文字色。" \
  'The user answered: "排序箭頭拍板"="先不要改,維持現狀"'
run_hook "Edit" "packages/design-system/src/components/DataTable/data-table.tsx" "$TX_ASK_DENY"
expect_block "8c. selection 答案含否決語 → fail closed" "data-table"

# 8e(2026-09-15):harness 把題目原文也寫進答案(`"題目"="回答"`),題目裡的「要怎麼處理?」「(建議)」不是 user 的猶豫;
# user 回答「照你建議做」是接受建議、「不要改壞既有」是別弄壞 —— 三者以前合起來把已選的核准判成 tentative + denial。
TX_ASK_ACCEPT="$TMP_DIR/tx_ask_accept.jsonl"
build_ask_selection_transcript "$TX_ASK_ACCEPT" \
  "提案:data-table.tsx 的排序箭頭改繼承文字色(建議)。" \
  'The user answered: "data-table.tsx 排序箭頭要怎麼處理?(建議改繼承文字色)"="照你建議做,並看整個 DS 有沒有類似問題,確保不要改壞目前好的東西,確保有驗證到完美"'
run_hook "Edit" "packages/design-system/src/components/DataTable/data-table.tsx" "$TX_ASK_ACCEPT"
expect_pass_silent "8e. 題目含「要怎麼處理?/建議」+ 回答「照你建議做…不要改壞」→ 仍 approved"

# 8f 對照:真的還在評估建議 → 仍 fail closed(接受建議的字串替換不能把「評估你的建議」放行)
TX_ASK_STILL="$TMP_DIR/tx_ask_still.jsonl"
build_ask_selection_transcript "$TX_ASK_STILL" \
  "提案:data-table.tsx 的排序箭頭改繼承文字色(建議)。" \
  'The user answered: "data-table.tsx 排序箭頭要怎麼處理?"="我還在評估你的建議,先不要動"'
run_hook "Edit" "packages/design-system/src/components/DataTable/data-table.tsx" "$TX_ASK_STILL"
expect_block "8f. 回答「還在評估你的建議,先不要動」→ fail closed" "data-table"

TX_ASK_SUPERSEDED="$TMP_DIR/tx_ask_superseded.jsonl"
build_ask_selection_transcript "$TX_ASK_SUPERSEDED" \
  "提案:data-table.tsx 的排序箭頭改繼承文字色。" \
  'The user answered: "排序箭頭拍板"="跟 label 連動(推薦)"' \
  "等等,那 hover 的行為是不是還要再想想?"
run_hook "Edit" "packages/design-system/src/components/DataTable/data-table.tsx" "$TX_ASK_SUPERSEDED"
expect_block "8d. selection 之後有新的純文字 user 訊息 → 選擇被蓋過 fail closed" "data-table"

TX_ASK_NOTIFY="$TMP_DIR/tx_ask_notify.jsonl"
build_ask_selection_transcript "$TX_ASK_NOTIFY" \
  "提案:data-table.tsx 的排序箭頭拿掉釘死的 text-fg-secondary,改繼承點擊區文字色。" \
  'The user answered: "排序箭頭拍板"="跟 label 連動(推薦)"' \
  "[SYSTEM NOTIFICATION - NOT USER INPUT]
<task-notification>Background command completed</task-notification>"
run_hook "Edit" "packages/design-system/src/components/DataTable/data-table.tsx" "$TX_ASK_NOTIFY"
expect_pass_silent "8e. selection 之後只有背景通知 → 不蓋過,仍 approved"

# 9. Blanket approved-spec implementation(AGENTS.md「已核准 UI/UX 實作=Standing Authorization AUTO」
#    +「最新 blanket 授權即核准當下 pending 的 exact 提案」;2026-09-02 分類器詞彙補全)
TX_SPEC_IMPL="$TMP_DIR/tx_spec_impl.jsonl"
build_transcript "$TX_SPEC_IMPL" \
  "規格書 v4 已定稿,實作位置 components/AgentPanel/,含 4 個新 token。" \
  "把所有規格書的東西開始馬不停蹄的實作出來且要確保所做出來的東西都有合規符合我們整個ds的設計規範與設計原則與ssot,不得有任何偏移,該用元件的地方都要用元件,確保ssot"
run_hook "Edit" "/foo/my-project/packages/design-system/src/tokens/motion/motion.css" "$TX_SPEC_IMPL"
expect_pass_silent "9a. blanket 實作所有規格書 → engineering remediation approved"

TX_SPEC_IMPL_Q="$TMP_DIR/tx_spec_impl_q.jsonl"
build_transcript "$TX_SPEC_IMPL_Q" \
  "要不要實作所有規格書的東西?"
run_hook "Edit" "/foo/my-project/packages/design-system/src/tokens/motion/motion.css" "$TX_SPEC_IMPL_Q"
expect_block "9b. 問句版實作所有規格書 → 問句 ≠ 同意 fail closed" "BLOCKER"

TX_SPEC_IMPL_QUOTE="$TMP_DIR/tx_spec_impl_quote.jsonl"
build_transcript "$TX_SPEC_IMPL_QUOTE" \
  "以下是別人的建議:把所有規格書的東西實作出來,符合 ssot。這不代表我的決定。"
run_hook "Edit" "/foo/my-project/packages/design-system/src/tokens/motion/motion.css" "$TX_SPEC_IMPL_QUOTE"
expect_block "9c. 轉述他人建議 + 明示非決定 → fail closed" "BLOCKER"

# 10. 口語 target 別名 + 委託研究(2026-09-02 user 原話:「agent logo 感覺可以改成藍紫色的配色…
#     另外我覺得 logo 的呼吸狀態是否也可以搭配透明度的改變?仔細研究看到底怎樣最完美…fab 招呼的 logo 也應該要因應調整」)
USER_LOGO_MSG="要把拍板的東西到底在哪裡?請你開啟新的artifacts用人類可以
容易理解的話讓我看得懂,不要有術語言簡意賅,

另外我認為 agent logo 感覺可以改成藍紫色的配色
所以把所有有用到綠色的地方全部換掉包括漣漪,漸層,邊框等等請仔細盤查
並確保整體美觀且都有用到最新一致的配色且都有呼應,
另外我覺得 logo 的呼吸狀態是否也可以搭配透明度的改變?
仔細研究看到底怎樣最完美最美觀最有質感最有人性最有呼吸的感覺
確保整體的所有動畫都是有搭配的結果
此外, fab 招呼的 logo 也應該要因應調整,並確保射出的邊框的節奏是有整體搭配的,
反正你仔細研究確保所有動畫都完美"
TX_LOGO="$TMP_DIR/tx_logo.jsonl"
build_transcript "$TX_LOGO" "$USER_LOGO_MSG"
run_hook "Write" "/foo/my-project/packages/design-system/src/components/AgentPanel/agent-panel-logo.tsx" "$TX_LOGO"
expect_pass_silent "10a. 口語「agent logo」= agent-panel-logo.tsx exact target;問句已委託研究 → approved"

run_hook "Write" "/foo/my-project/packages/design-system/src/components/AgentPanel/agent-panel-fab.tsx" "$TX_LOGO"
expect_pass_silent "10b. 家族檔口語「fab」= agent-panel-fab.tsx exact target;「調整」directive → approved"

TX_LOGO_Q="$TMP_DIR/tx_logo_q.jsonl"
build_transcript "$TX_LOGO_Q" "agent logo 的顏色是否要改成紫色?"
run_hook "Write" "/foo/my-project/packages/design-system/src/components/AgentPanel/agent-panel-logo.tsx" "$TX_LOGO_Q"
expect_block "10c. 單獨問句(無委託)→ 問句 ≠ 同意 fail closed" "BLOCKER"

TX_LOGO_Q2="$TMP_DIR/tx_logo_q2.jsonl"
build_transcript "$TX_LOGO_Q2" "另外我覺得 logo 的呼吸狀態是否也可以搭配透明度的改變?"
run_hook "Write" "/foo/my-project/packages/design-system/src/components/AgentPanel/agent-panel-logo.tsx" "$TX_LOGO_Q2"
expect_block "10d. 家族 token「logo」綁定 + 單獨問句 → fail closed" "BLOCKER"

TX_BTN_LOGO="$TMP_DIR/tx_btn_logo.jsonl"
build_transcript "$TX_BTN_LOGO" "$USER_LOGO_MSG"
run_hook "Write" "/foo/my-project/packages/design-system/src/components/Button/button.tsx" "$TX_BTN_LOGO"
expect_block "10e. 同訊息對 Button 無 exact target 綁定 → 不外溢" "BLOCKER"

# 10f. 技能載入的 meta 紀錄(isMeta + sourceToolUseID)不是 user 說話,不得蓋過真正的最新指令
TX_LOGO_META="$TMP_DIR/tx_logo_meta.jsonl"
build_transcript "$TX_LOGO_META" "$USER_LOGO_MSG"
jq -n --arg t "# Workflow authoring reference

A workflow structures work across many agents" \
  '{isMeta: true, sourceToolUseID: "toolu_01skill", message: {role: "user", content: [{type: "text", text: $t}]}}' >> "$TX_LOGO_META"
run_hook "Write" "/foo/my-project/packages/design-system/src/components/AgentPanel/agent-panel-logo.tsx" "$TX_LOGO_META"
expect_pass_silent "10f. 技能 meta 紀錄跟在指令後 → 不算最新 user 訊息,仍 approved"

# 11. 中英夾雜的詞界(2026-09-12)。中文不會在英文詞後面加空格 ——「data table的排序箭頭…」裡
#     `table` 後面緊接的「的」是 \p{L},舊的邊界判定(前後只認「非字母數字」)因此綁不到 data-table。
#     修法只認「ASCII 英數 ↔ CJK」這一種跨字集詞界;同字集內不放寬,所以 metadata table 仍綁不進來。
TX_CJK_ADJ="$TMP_DIR/tx_cjk_adj.jsonl"
build_transcript "$TX_CJK_ADJ" "data table的排序箭頭改成跟 label 連動"
run_hook "Edit" "packages/design-system/src/components/DataTable/data-table.tsx" "$TX_CJK_ADJ"
expect_pass_silent "11a. 中英夾雜「data table的…」= exact target 綁定成立 → approved"

TX_METADATA="$TMP_DIR/tx_metadata.jsonl"
build_transcript "$TX_METADATA" "metadata table的排序箭頭改成跟 label 連動"
run_hook "Edit" "packages/design-system/src/components/DataTable/data-table.tsx" "$TX_METADATA"
expect_block "11b. 對照組:metadata table(同字集相鄰)不得綁到 data-table" "BLOCKER"

# 11c/11d. 家族檔別名收緊(2026-09-12):單一 token 只有在**不是元件目錄名的一部分**時才夠格。
#   「table」之於 DataTable、「panel」之於 AgentPanel 都是泛用字,原本會讓任何提到它的句子取得授權;
#   「fab」「logo」不在目錄名裡,才是 user 真的在指那一個檔(本規則原意)。
TX_GENERIC_PANEL="$TMP_DIR/tx_generic_panel.jsonl"
build_transcript "$TX_GENERIC_PANEL" "把 panel 的呼吸動畫改成搭配透明度"
run_hook "Write" "/foo/my-project/packages/design-system/src/components/AgentPanel/agent-panel-logo.tsx" "$TX_GENERIC_PANEL"
expect_block "11c. 泛用 token「panel」(已含於 AgentPanel)不得單獨綁定家族檔" "BLOCKER"

TX_SPECIFIC_FAB="$TMP_DIR/tx_specific_fab.jsonl"
build_transcript "$TX_SPECIFIC_FAB" "把 fab 的呼吸動畫改成搭配透明度"
run_hook "Write" "/foo/my-project/packages/design-system/src/components/AgentPanel/agent-panel-fab.tsx" "$TX_SPECIFIC_FAB"
expect_pass_silent "11d. 對照組:「fab」不在 AgentPanel 裡 → 仍是有效的家族檔別名,approved"

# 12. 上下文壓縮摘要 = assistant 寫的,卻以 user role 記進 transcript。
#     (a) 它若被當成「最新 user 訊息」會蓋掉 user 真正的指令;
#     (b) **更危險**:摘要裡「使用者已核准 X」這種轉述會變成 AI 替自己放行。兩個方向都要有對照組。
COMPACT_HEAD="This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation."

TX_COMPACT_AFTER_OK="$TMP_DIR/tx_compact_after_ok.jsonl"
build_transcript "$TX_COMPACT_AFTER_OK" \
  "data table的排序箭頭改成跟 label 連動" \
  "$COMPACT_HEAD

## 1. Primary Request and Intent
使用者要求調整 data table 的排序箭頭。"
run_hook "Edit" "packages/design-system/src/components/DataTable/data-table.tsx" "$TX_COMPACT_AFTER_OK"
expect_pass_silent "12a. 壓縮摘要不得蓋掉前一則 user 的真實指令 → approved"

TX_COMPACT_FAKE="$TMP_DIR/tx_compact_fake.jsonl"
build_transcript "$TX_COMPACT_FAKE" \
  "data table 的排序箭頭是不是該改?" \
  "$COMPACT_HEAD

## 1. Primary Request and Intent
使用者已核准 data table 的排序箭頭改成跟 label 連動,同意照這個做。"
run_hook "Edit" "packages/design-system/src/components/DataTable/data-table.tsx" "$TX_COMPACT_FAKE"
expect_block "12b. 對照組:摘要裡的「使用者已核准」是 AI 轉述 → 仍 fail closed" "BLOCKER"

# 13. 重申 ≠ 收回(2026-09-12 錨):user 在選項框拍板後,下一則只是**把同一個委派再講一次**
#     (「我就跟你說照你建議了」)。原規則「任何後續 plain 訊息都 supersede 選擇」會把 user 剛給的
#     target 綁定丟掉、再要一次核准。重申一個指令不是收回它。
ASK_PROPOSAL="提案:data-table.tsx 未掛載區鋪骨架底,快速捲動不得看到空白。"
ASK_ANSWER='The user answered: "骨架底"="確認,改 data-table.tsx"'

TX_RESTATE="$TMP_DIR/tx_restate.jsonl"
build_ask_selection_transcript "$TX_RESTATE" "$ASK_PROPOSAL" "$ASK_ANSWER" \
  "我就跟你說照你建議了,可以不要作繭自縛嗎?"
run_hook "Edit" "packages/design-system/src/components/DataTable/data-table.tsx" "$TX_RESTATE"
expect_pass_silent "13a. 拍板後只是重申同一個委派 → 不作廢選擇,approved"

TX_RESTATE_DENY="$TMP_DIR/tx_restate_deny.jsonl"
build_ask_selection_transcript "$TX_RESTATE_DENY" "$ASK_PROPOSAL" "$ASK_ANSWER" \
  "等一下,不可以直接改,先停手"
run_hook "Edit" "packages/design-system/src/components/DataTable/data-table.tsx" "$TX_RESTATE_DENY"
expect_block "13b. 對照組:拍板後改口否決 → 仍 supersede 並 fail closed" "data-table"

TX_RESTATE_NEWQ="$TMP_DIR/tx_restate_newq.jsonl"
build_ask_selection_transcript "$TX_RESTATE_NEWQ" "$ASK_PROPOSAL" "$ASK_ANSWER" \
  "那骨架的顏色是不是該換一個?"
run_hook "Edit" "packages/design-system/src/components/DataTable/data-table.tsx" "$TX_RESTATE_NEWQ"
expect_block "13c. 對照組:拍板後提出新問句 → 仍 supersede 並 fail closed" "data-table"

# 14. 判「是不是視覺改動」時註解不算(2026-09-12)。
#     錨:修「捲動停下後指標底下那一列不會被標記」時,程式碼本身沒有任何視覺 token,
#     但註解裡寫了 hover 二字 → 整個 edit 被判 product-ui-ux 擋下,等於「為了解釋清楚而被罰」,
#     也逼 agent 去問 user 一個本來就該自主執行的工程修正。
#     **對照組同時證明這不是放寬**:真的改到樣式的程式碼照樣被判成視覺。
TX_NEUTRAL_14="$TMP_DIR/tx_neutral_14.jsonl"
build_transcript "$TX_NEUTRAL_14" "請修好這個 bug"

# 14a. 只有註解提到視覺字眼 → 不算視覺改動
COMMENT_ONLY_OPERATION='// 這次 commit 換了捲動位置時也要同步 hover 標記
const renderedAtNewOffset = S.committedRenderOffset !== S.renderOffset'
run_evidence "Edit" "$PROD_TSX" "$TX_NEUTRAL_14" "$COMMENT_ONLY_OPERATION"
if printf '%s' "$EVIDENCE_JSON" | jq -e '.decisionDomain != "product-ui-ux"' >/dev/null 2>&1; then
  echo "  PASS  14a. 只有註解提到 hover → 不判成 product-ui-ux"; PASS=$((PASS+1))
else
  echo "  FAIL  14a. 只有註解提到 hover → 不判成 product-ui-ux (evidence=$EVIDENCE_JSON)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 14a. 註解不該影響 domain"
fi

# 14b. 對照組:程式碼真的改樣式 → 仍判成視覺(證明 14a 不是放寬)
REAL_VISUAL_OPERATION='return <button className="hover:bg-blue-500" />'
run_evidence "Edit" "$PROD_TSX" "$TX_NEUTRAL_14" "$REAL_VISUAL_OPERATION"
if printf '%s' "$EVIDENCE_JSON" | jq -e '.decisionDomain == "product-ui-ux"' >/dev/null 2>&1; then
  echo "  PASS  14b. 對照組:真的改 className 樣式 → 仍判 product-ui-ux"; PASS=$((PASS+1))
else
  echo "  FAIL  14b. 對照組:真的改 className 樣式 → 仍判 product-ui-ux (evidence=$EVIDENCE_JSON)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 14b. 真視覺改動必須仍判 UI"
fi

# ── 15. 純註解操作(2026-09-15):old/new 剝註解後相同 + 整檔去註解轉譯位元相同 → 不需 UI 授權 ──
# 錨:結案階段 user 說「確保所有內容都有 ssot 沒有漂移、設計語言一致、視覺稽查」,這句含 UI 詞卻沒綁 target,
# 於是連「把過期註解對齊現況」都被判 EXACT_UI_UX_TARGET_BINDING_MISSING。純註解沒有執行差異,沒有東西可拍板。
run_hook_edit() {
  local file_path="$1"; local transcript="$2"; local old_string="$3"; local new_string="$4"
  local payload
  payload=$(jq -n --arg fp "$file_path" --arg tp "$transcript" --arg o "$old_string" --arg n "$new_string" \
    '{hook_event_name:"PreToolUse",tool_name:"Edit",tool_input:{file_path:$fp,old_string:$o,new_string:$n},transcript_path:$tp}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}
TX_CLOSURE="$TMP_DIR/tx_closure.jsonl"
build_transcript "$TX_CLOSURE" \
  "確保該做的事情全部做到完整完美,確保所有內容都有 ssot 沒有漂移,確保所有內容都符合我們一致的設計語言,確保都有透過視覺稽查驗證"
COMMENT_DIR="$TMP_DIR/my-project/packages/design-system/src/components/Button"
mkdir -p "$COMMENT_DIR"
COMMENT_TSX="$COMMENT_DIR/button.tsx"
cat > "$COMMENT_TSX" <<'TSX'
import * as React from 'react'
// 舊註解:padding 公式 (field-height - icon-size) / 2
/** hover 顏色沿用 --primary-hover */
export const label = 'see //docs for details'
export function Button() {
  return <button className="bg-primary hover:bg-primary-hover">{label}</button>
}
TSX
COMMENT_CSS="$COMMENT_DIR/button.css"
printf '%s\n' '/* 舊說明:tag 高度 h-5 */' '.btn { padding: 4px; }' > "$COMMENT_CSS"

run_hook_edit "$COMMENT_TSX" "$TX_CLOSURE" \
  "// 舊註解:padding 公式 (field-height - icon-size) / 2" \
  "// 註解已對齊:padding 公式 (field-height − 2px − tag-height) / 2,SSOT field-wrapper.tsx"
expect_pass_silent "15a. 純 // 註解改動 + 含 UI 詞但無 target 的收尾訊息 → pass"

run_hook_edit "$COMMENT_TSX" "$TX_CLOSURE" \
  "/** hover 顏色沿用 --primary-hover */" \
  "/** hover 顏色沿用 --primary-hover;padding、間距、視覺層級都在 spec 有明文 */"
expect_pass_silent "15b. 純 JSDoc 改動,註解內含 hover/間距/視覺等 UI 詞 → 仍 pass(註解不算)"

run_hook_edit "$COMMENT_TSX" "$TX_CLOSURE" \
  "export const label = 'see //docs for details'" \
  "export const label = 'see //docs for everything'"
expect_block "15c. 字串字面值裡的 // 被 regex 當註解,但轉譯位元不同 → 仍 BLOCK(混入口關閉)" "BLOCKER"

run_hook_edit "$COMMENT_TSX" "$TX_CLOSURE" \
  'className="bg-primary hover:bg-primary-hover"' \
  'className="bg-primary hover:bg-primary-active"'
expect_block "15d. 對照組:真的改 className → BLOCK" "EXACT_UI_UX_TARGET_BINDING_MISSING"

run_hook_edit "$COMMENT_TSX" "$TX_CLOSURE" \
  "import * as React from 'react'" \
  "import * as React from 'react' // 純加註解:old 無註解、new 有,剝掉後相同"
expect_pass_silent "15e. 在程式碼行尾加註解(剝掉後相同、轉譯相同)→ pass"

run_hook_edit "$COMMENT_CSS" "$TX_CLOSURE" \
  "/* 舊說明:tag 高度 h-5 */" \
  "/* 說明已對齊:tag 高度 h-tag-sm(--tag-height-sm) */"
expect_pass_silent "15f. css 純 /* */ 註解改動 → pass"

run_hook_edit "$COMMENT_CSS" "$TX_CLOSURE" \
  "padding: 4px;" \
  "padding: 3px; /* 對齊 */"
expect_block "15g. css 真改 padding(即使附註解)→ BLOCK" "BLOCKER"

run_hook_edit "$COMMENT_TSX" "$TX_CLOSURE" \
  "// 不存在的 old_string" \
  "// 新註解"
expect_block "15h. old_string 不在檔案裡 → 不算純註解,fail closed BLOCK" "BLOCKER"

# 15j. 區塊註解的中段片段(old_string 沒帶 /* */)—— 這是 JSDoc docblock 最常見的改法,必須整檔比才判得對。
cat > "$COMMENT_TSX" <<'TSX'
import * as React from 'react'
/**
 * 結案:漸層 46ms vs 實心 5.9ms,DOM 骨架換不到零空白。
 * 光柵成本已知且接受。
 */
export function Button() {
  return <button className="bg-primary">ok</button>
}
TSX
run_hook_edit "$COMMENT_TSX" "$TX_CLOSURE" \
  " * 結案:漸層 46ms vs 實心 5.9ms,DOM 骨架換不到零空白。" \
  " * 結案:真頁面光柵漸層 46.06ms vs 實心 5.92ms,DOM 骨架換不到零空白。"
expect_pass_silent "15j. JSDoc 中段片段(片段本身無 /* */)純文字改動 → pass(整檔比)"

# 15i 直接呼叫 helper 驗 evidence 契約。fixture 此時是 15j 寫入的 JSDoc 版本(15j 在前),old_string 必須取自它。
set +e
EVIDENCE_JSON=$(jq -n --arg fp "$COMMENT_TSX" --arg o " * 光柵成本已知且接受。" --arg n " * 光柵成本已知且接受(真頁面 46.06ms)。" \
  '{tool_name:"Edit",tool_input:{file_path:$fp,old_string:$o,new_string:$n}}' \
  | node "$AUTH_HELPER" --transcript "$TX_CLOSURE" --target "$COMMENT_TSX" --hook-input-stdin)
EVIDENCE_EXIT=$?
set -e
if [ "$EVIDENCE_EXIT" -eq 0 ] && printf '%s' "$EVIDENCE_JSON" | jq -e '.decision=="approved" and .reasonCode=="COMMENT_ONLY_OPERATION_NO_RUNTIME_EFFECT" and .decisionDomain=="engineering-remediation" and .targetBinding=="comment-only-operation"' >/dev/null; then
  echo "  PASS  15i. evidence 契約:approved / COMMENT_ONLY_OPERATION_NO_RUNTIME_EFFECT / engineering-remediation"
  PASS=$((PASS+1))
else
  echo "  FAIL  15i. evidence 契約 (exit=$EVIDENCE_EXIT evidence=$EVIDENCE_JSON)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 15i. comment-only evidence contract"
fi

# 15k. 「照你建議開工」= 對 pending 提案的直答(2026-09-16):接受建議 ≠ 還在建議;後接完成 / 驗證要求(確保…不要改壞…)也不影響。
#      錨:user 對已逐題回答的兩個 UI 提案說「照你建議開工，確保上述所有更動…不要改壞任何原本好的地方…」,
#      舊版把「建議」當猶豫、「開工」不在直答清單 → EXACT_UI_UX_TARGET_BINDING_MISSING 擋下已授權的改動。
TX_ACCEPT_START="$TMP_DIR/tx_accept_start.jsonl"
build_transcript "$TX_ACCEPT_START" \
  "Agent panel 在視窗小於 break point 之後會變成滿版的設計,我在想此時是否可以讓 agent panel 最左邊與視窗左邊維持一定的邊距,且此時該 agent panel 底下會有滿版的遮罩,若點擊到該遮罩不會有任何反應" \
  "照你建議開工，

確保上述所有更動都有追根究柢的修，該SSOT的部分都要確保SSOT,整個ds不要有漂移,然後確保不要改壞任何原本好的地方，並透過可驗證的方式自行驗證到完整完美，包括視覺稽查"
run_hook "Edit" "/foo/my-project/packages/design-system/src/components/AgentPanel/agent-panel.tsx" "$TX_ACCEPT_START" "isOverlay && 'absolute inset-y-0 right-0 left-[var(--layout-space-viewport-inset)] z-[45]'"
expect_pass_silent "15k. 「照你建議開工」+ 完成 / 驗證要求 → 直答 pending 提案,approved"

# 15l. 同一句尾巴是問號 → 仍是討論,不是同意(問句 ≠ 同意)
TX_ACCEPT_Q="$TMP_DIR/tx_accept_q.jsonl"
build_transcript "$TX_ACCEPT_Q" "照你建議開工?"
run_hook "Edit" "/foo/my-project/packages/design-system/src/components/AgentPanel/agent-panel.tsx" "$TX_ACCEPT_Q" "isOverlay && 'absolute inset-y-0 right-0 z-[45]'"
expect_block "15l. 「照你建議開工?」問句 ≠ 同意 → fail closed" "BLOCKER"

# 15m. 接受建議但同句仍在猶豫(要不要 / 還在考慮)→ fail closed
TX_ACCEPT_TENTATIVE="$TMP_DIR/tx_accept_tentative.jsonl"
build_transcript "$TX_ACCEPT_TENTATIVE" "照你建議開工,但遮罩要不要關我還在考慮"
run_hook "Edit" "/foo/my-project/packages/design-system/src/components/AgentPanel/agent-panel.tsx" "$TX_ACCEPT_TENTATIVE" "isOverlay && 'absolute inset-y-0 right-0 z-[45]'"
expect_block "15m. 「照你建議開工,但…要不要…還在考慮」→ 猶豫語 fail closed" "BLOCKER"

# 15n. bug 回報(2026-09-16 user 原話;target「fab」與「改壞 / root cuase」分在不同句,root cause 還拼錯)→ 該 target 的修復 = 工程 remediation,approved
TX_BUG_REPORT="$TMP_DIR/tx_bug_report.jsonl"
build_transcript "$TX_BUG_REPORT" \
  "然後為何現在拖拉 agent panel 的 fab
很容易一不小心就開啟panel,但我明明就只是要移動它而已
之前這個功能剛做完明明就沒有這問題,
github 歷史上一定有正確的版本
所以感覺就是你改壞了他啊
請你仔細查證看看到底root cuase 是甚麼,
為何它本來好好的結果壞掉了"
run_hook "Edit" "/foo/my-project/packages/design-system/src/components/AgentPanel/agent-panel-fab.tsx" "$TX_BUG_REPORT" "suppressClickRef.current = false"
expect_pass_silent "15n. bug 回報(壞掉 / 改壞 / root cuase 誤拼)+ target 在別句 → engineering remediation approved"

# 15o. 同樣提到 fab,但在問 UI 取捨(門檻要不要改)→ 問句 / 討論 fail closed
TX_BUG_Q="$TMP_DIR/tx_bug_q.jsonl"
build_transcript "$TX_BUG_Q" "fab 拖曳好像壞掉了,門檻要不要改成 12px?"
run_hook "Edit" "/foo/my-project/packages/design-system/src/components/AgentPanel/agent-panel-fab.tsx" "$TX_BUG_Q" "const DRAG_THRESHOLD = 12"
expect_block "15o. bug 回報夾帶「要不要」UI 取捨問句 → fail closed" "BLOCKER"

# 15p. bug 回報但夾帶 UI 決策字眼(顏色)→ 不走 bug 回報捷徑,照舊 fail closed
TX_BUG_UI="$TMP_DIR/tx_bug_ui.jsonl"
build_transcript "$TX_BUG_UI" "fab 壞掉了,順便把它的顏色改成紅色"
run_hook "Edit" "/foo/my-project/packages/design-system/src/components/AgentPanel/agent-panel-fab.tsx" "$TX_BUG_UI" "className='bg-red-500'"
expect_block "15p. bug 回報 + UI 取捨字眼(顏色)→ 不走捷徑,BLOCK" "BLOCKER"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

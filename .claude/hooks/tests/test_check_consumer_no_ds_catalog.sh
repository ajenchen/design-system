#!/bin/bash
# 2026-06-11 payload 正交化:合併檔跑全規則,payload 須對非受測規則 clean(合併前真系統行為相同 — 另一 hook 同樣會攔)
# 2026-06-11 repoint:check_consumer_no_ds_catalog.sh 已合併進 check_consumer_app_invariants.sh(prune merge;測試 payload 不變 = 行為等價驗證)
# Tests for check_consumer_app_invariants.sh(P0 BLOCKER,2026-05-27 user directive「確保跟 ds repo 一模一樣」)
#
# Hook 規則(PreToolUse,Edit|Write|MultiEdit):
#   Scope: tool_input.file_path 必 match /(apps|consumer)/.*\.stories\.tsx$
#          且 NOT packages/design-system/src/(DS source 排除)。
#   Content: tool_input.new_string // tool_input.content。空 → exit 0。
#   Escape: content 含 `@consumer-catalog-allow:` → exit 0。
#   4 violation patterns → exit 2 + stderr 含 "CONSUMER-NO-DS-CATALOG BLOCKER":
#     P1. basename ∈ {EveryDsComponent,AllDsComponents,AllComponents,DsCatalog,EveryComponent}
#         (AllDsComponents + DsCanonicalPortal/iframe.*design-system → portal proxy 例外放行)
#     P2. title 含「所有 DS 元件」/「Every DS Component」/「All DS Components ... render」/「每元件 default」
#     P3. Object.keys/entries(DS).map|forEach iterate-render
#     P4. ≥5 distinct <DS.X> tags in single file(mass hand-mock)
#   Non-Edit/Write/MultiEdit tool / out-of-scope file → silent exit 0。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_consumer_app_invariants.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# Override CLAUDE_PROJECT_DIR so _log-fire.sh state lands in TMP_DIR(不污染 repo .claude/logs/)
export CLAUDE_PROJECT_DIR="$TMP_DIR"
mkdir -p "$TMP_DIR/.claude/logs"

# run_hook <tool> <file_path> <content>
# content 走 tool_input.new_string(Edit)— 與 .content(Write)同 fallback chain。
run_hook() {
  local tool="$1"; local file_path="$2"; local content="$3"
  local payload
  payload=$(jq -n \
    --arg t "$tool" --arg fp "$file_path" --arg c "$content" \
    '{hook_event_name:"PreToolUse", tool_name:$t, tool_input:{file_path:$fp, new_string:$c}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

# run_hook_content_field — 驗 .content fallback(Write 的 field 名)
run_hook_content_field() {
  local tool="$1"; local file_path="$2"; local content="$3"
  local payload
  payload=$(jq -n \
    --arg t "$tool" --arg fp "$file_path" --arg c "$content" \
    '{hook_event_name:"PreToolUse", tool_name:$t, tool_input:{file_path:$fp, content:$c}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

NEEDLE="CONSUMER-NO-DS-CATALOG BLOCKER"

expect_block() {
  local name="$1"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$NEEDLE"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected BLOCK exit=2 + '$NEEDLE', got exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent exit=0, got exit=$EXIT, stderr=$([ -n "$STDERR_TEXT" ] && echo non-empty || echo empty))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

CONSUMER_FILE="/repo/apps/template/src/stories/Foo.stories.tsx"

echo "=== check_consumer_no_ds_catalog tests ==="

# ─────────────────────── POSITIVE cases(SHOULD BLOCK)───────────────────────

# P1: basename = catalog pattern(EveryDsComponent)
run_hook "Write" "/repo/apps/template/src/EveryDsComponent.stories.tsx" \
  "import { Button } from '@qijenchen/design-system'; export const Smoke = () => <Button>x</Button>;"
expect_block "1. P1 basename EveryDsComponent → BLOCK"

# P1: basename DsCatalog
run_hook "Write" "/repo/consumer/x/DsCatalog.stories.tsx" \
  "export const Demo = () => <div>catalog</div>;"
expect_block "2. P1 basename DsCatalog → BLOCK"

# P2: title claims per-component default render
run_hook "Edit" "$CONSUMER_FILE" \
  "const meta = { title: '所有 DS 元件 Catalog', component: Foo }; export default meta;"
expect_block "3. P2 title '所有 DS 元件' → BLOCK"

# P2: English title variant「Every DS Component」
run_hook "Edit" "$CONSUMER_FILE" \
  "const meta = { title: 'Every DS Component Default', component: Foo }; export default meta;"
expect_block "4. P2 title 'Every DS Component' → BLOCK"

# P3: Object.keys(DS).map iterate-render
run_hook "Edit" "$CONSUMER_FILE" \
  "import * as DS from '@qijenchen/design-system'; export const All = () => Object.keys(DS).map((k) => <div key={k}/>);"
expect_block "5. P3 Object.keys(DS).map → BLOCK"

# P3: Object.entries(DS).forEach variant
run_hook "Edit" "$CONSUMER_FILE" \
  "import * as DS from '@qijenchen/design-system'; export const All = () => { Object.entries(DS).forEach(([k,V]) => render(V)); };"
expect_block "6. P3 Object.entries(DS).forEach → BLOCK"

# P4: ≥5 distinct <DS.X> mass hand-mock(REAL violation — guard against over-narrow regex)
run_hook "Edit" "$CONSUMER_FILE" \
  "export const Catalog = () => (<><DS.Button/><DS.Card/><DS.Input/><DS.Select/><DS.Avatar/></>);"
expect_block "7. P4 5 distinct <DS.X> mass mock → BLOCK"

# .content field fallback(Write contract)still triggers
run_hook_content_field "Write" "/repo/apps/template/src/AllComponents.stories.tsx" \
  "export const X = () => <div/>;"
expect_block "8. P1 via .content field fallback → BLOCK"

# ─────────────────────── NEGATIVE cases(SHOULD NOT fire)───────────────────────

# Non-Edit/Write tool → silent(scope gate on tool_name)
run_hook "Read" "$CONSUMER_FILE" "Object.keys(DS).map((k) => <div/>)"
expect_pass_silent "9. tool=Read → silent (even with violating content)"

# Out-of-scope: DS source story(packages/design-system/src/)→ silent
run_hook "Write" "/repo/packages/design-system/src/components/Button/button.stories.tsx" \
  "export const All = () => (<><DS.Button/><DS.Card/><DS.Input/><DS.Select/><DS.Avatar/></>);"
expect_pass_silent "10. DS source story (out-of-scope path) → silent"

# Out-of-scope: consumer file but NOT *.stories.tsx → silent
run_hook "Write" "/repo/apps/template/src/EveryDsComponent.tsx" \
  "import * as DS from '@qijenchen/design-system'; Object.keys(DS).map((k) => null);"
expect_pass_silent "11. consumer non-stories .tsx → silent"

# Escape marker → silent even with real P4 violation
run_hook "Edit" "$CONSUMER_FILE" \
  "// @consumer-catalog-allow: portal proxy 過渡期 — see RFC
export const Catalog = () => (<><DS.Button/><DS.Card/><DS.Input/><DS.Select/><DS.Avatar/></>);"
expect_pass_silent "12. @consumer-catalog-allow escape → silent"

# AllDsComponents basename BUT portal proxy(DsCanonicalPortal)→ silent(documented exception)
run_hook "Write" "/repo/apps/template/src/AllDsComponents.stories.tsx" \
  "export const DsCanonicalPortal = () => <iframe src='/design-system/index.html' title='DS canonical' />;"
expect_pass_silent "13. AllDsComponents + DsCanonicalPortal portal proxy → silent"

# Near-miss P4: exactly 4 distinct <DS.X>(below ≥5 threshold)→ silent
# (guard against over-broad regex firing on legit small composition)
run_hook "Edit" "$CONSUMER_FILE" \
  "export const Dashboard = () => (<><DS.Button/><DS.Card/><DS.Input/><DS.Select/></>);"
expect_pass_silent "14. near-miss 4 distinct <DS.X> (< 5 threshold) → silent"

# Near-miss P2: legit business title(not a catalog claim)→ silent
run_hook "Edit" "$CONSUMER_FILE" \
  "const meta = { title: 'Apps/template/Overview', component: Dashboard }; export default meta;"
expect_pass_silent "15. near-miss legit business title → silent"

# Near-miss P3: Object.keys on NON-DS object → silent(over-broad guard)
run_hook "Edit" "$CONSUMER_FILE" \
  "const cfg = {a:1,b:2}; export const X = () => Object.keys(cfg).map((k) => <div key={k}/>);"
expect_pass_silent "16. near-miss Object.keys(cfg).map (not DS) → silent"

# Legit composition demo: realistic AppShell scenario, < 5 DS tags, normal title → silent
run_hook "Write" "/repo/apps/template/src/Dashboard.stories.tsx" \
  "// @story-baseline: @qijenchen/design-system/components/AppShell/app-shell.stories.tsx#Default
const meta = { title: 'Apps/template/Billing Dashboard' };
export const Default = () => (<DS.AppShell><DS.DataTable rows={invoices} /></DS.AppShell>);"
expect_pass_silent "17. legit business composition demo → silent"

# Empty content → silent(content gate)
run_hook "Edit" "$CONSUMER_FILE" ""
expect_pass_silent "18. empty content → silent"

# 19. 2026-06-03 回歸防護(fragment-vs-file bug class):Edit 只送 new_string 片段,
#     但 @consumer-catalog-allow marker 在檔頭(不在每次 edit 片段)→ 修前編輯有 marker 的 portal
#     檔任一非 marker 行就被誤擋(AllDsComponents basename = catalog pattern)。本 hook 是 PostToolUse
#     (檔已落 disk)→ 補查整檔 marker。建真實 disk 檔(含 marker)+ Edit 無 marker 片段 → 必 silent。
DISK_PORTAL="$TMP_DIR/apps/template/src/AllDsComponents.stories.tsx"
mkdir -p "$(dirname "$DISK_PORTAL")"
printf '%s\n' "// @consumer-catalog-allow: documented proxy portal" "export const ImportSmoke = () => <div/>;" > "$DISK_PORTAL"
run_hook "Edit" "$DISK_PORTAL" "  <p>some unrelated edited line without the marker</p>"
expect_pass_silent "19. Edit 片段無 marker + 檔頭 disk marker → silent(回歸防護)"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

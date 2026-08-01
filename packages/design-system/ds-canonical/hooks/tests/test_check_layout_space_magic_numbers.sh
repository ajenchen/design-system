#!/bin/bash
# Tests for check_layout_space_magic_numbers.sh(P0 BLOCKER,2026-05-27 codified)
#
# Hook 契約(PostToolUse,Edit|Write|MultiEdit):
#   - 讀 tool_name / tool_input.file_path(or notebook_path)/ tool_input.new_string(or content)
#   - Scope:只查 .tsx / .ts;skip packages/design-system/src/ + node_modules/
#   - BLOCKER(exit 2):content 任一行命中 Tailwind spacing magic-number regex
#       \b(p|px|py|pt|pb|pl|pr|gap|space-x|space-y|m|mx|my|mt|mb|ml|mr)-(0\.5|[1-9][0-9]?(\.[0-9])?)\b
#     且該行 **無** escape marker `@layout-space-magic-ok:`
#   - Escape:同行 OR 前一行加 `// @layout-space-magic-ok: <rationale>` → 該行被濾掉
#     (前一行支援 2026-06-03 補實作 — JSX className 行無法放同行 //,必靠前一行 {/* */})
#   - 非 Edit/Write/MultiEdit tool / 非 .tsx,.ts / DS src / 空 content → silent exit 0
#
# M34 broad-vs-narrow symmetry:
#   - over-narrow guard:p-4 / px-6 / gap-3 / gap-0.5 / m-2 等真 violation 必 fire
#   - over-broad guard:p-0(padding zero,regex 不收 `0`)/ token var() 用法 /
#     非 spacing class(text-sm / w-4 / size-3)/ JSX prop(size={24})必 silent

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_layout_space_magic_numbers.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# Override GOVERNANCE_PROJECT_DIR so _log-fire.sh per-hook log lands in TMP_DIR
# (避免污染 repo .claude/logs/)
export GOVERNANCE_PROJECT_DIR="$TMP_DIR"
mkdir -p "$TMP_DIR/.claude/logs"

# run_hook <tool> <file_path> <content_field> <content>
#   content_field ∈ {new_string, content} — 測 hook 兩條讀法都 work
run_hook() {
  local tool="$1"; local file_path="$2"; local field="$3"; local content="$4"
  local payload
  payload=$(jq -n \
    --arg t "$tool" --arg fp "$file_path" --arg c "$content" --arg f "$field" \
    '{hook_event_name:"PostToolUse", tool_name:$t,
      tool_input: ({file_path:$fp} + {($f):$c})}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_block() {
  local name="$1"; local needle="${2:-LAYOUT-SPACE-MAGIC-NUMBER BLOCKER}"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected BLOCK exit=2 + '$needle', got exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent exit=0, got exit=$EXIT, stderr=$([ -n "$STDERR_TEXT" ] && echo non-empty || echo empty))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_layout_space_magic_numbers tests ==="

APP_TSX="/Users/x/my-project/apps/template/src/screens/Dashboard.tsx"
APP_TS="/Users/x/my-project/apps/template/src/lib/layout.ts"
DS_TSX="/Users/x/my-project/packages/design-system/src/components/Button/button.tsx"

# ─────────────────────────────────────────────────────────────
# POSITIVE cases — SHOULD trigger BLOCKER (over-narrow guard)
# ─────────────────────────────────────────────────────────────

# P1. Classic consumer padding magic number → BLOCK
run_hook "Write" "$APP_TSX" "content" \
  'export const Card = () => <div className="p-4 rounded-md">內容</div>;'
expect_block "P1. p-4 consumer padding → BLOCK"

# P2. Multiple spacing classes (px / py / gap) → BLOCK
run_hook "Edit" "$APP_TSX" "new_string" \
  '  return <section className="px-6 py-2 gap-3 flex">{children}</section>;'
expect_block "P2. px-6 py-2 gap-3 (new_string field) → BLOCK"

# P3. space-y magic → BLOCK
run_hook "Write" "$APP_TSX" "content" \
  'const List = () => <ul className="space-y-4">{items}</ul>;'
expect_block "P3. space-y-4 → BLOCK"

# P4. Fractional 0.5 magic (edge of regex) → BLOCK
run_hook "Write" "$APP_TSX" "content" \
  'const Row = () => <div className="gap-0.5">x</div>;'
expect_block "P4. gap-0.5 fractional → BLOCK"

# P5. margin family (mt / mb / mx) → BLOCK
run_hook "Write" "$APP_TSX" "content" \
  'const Hero = () => <div className="mt-8 mb-12 mx-4">hero</div>;'
expect_block "P5. mt-8 mb-12 mx-4 margin → BLOCK"

# P6. Two-digit value (p-10) → BLOCK
run_hook "Write" "$APP_TSX" "content" \
  'const Wide = () => <div className="p-10">wide</div>;'
expect_block "P6. p-10 two-digit → BLOCK"

# P7. Magic number in .ts (not just .tsx) → BLOCK
run_hook "Edit" "$APP_TS" "new_string" \
  'export const cardCls = "px-4 py-3 gap-2";'
expect_block "P7. magic in .ts file → BLOCK"

# P8. Mixed: one escaped line + one un-escaped magic line → still BLOCK
#     (un-escaped line is the real violation)
run_hook "Write" "$APP_TSX" "content" \
'const A = () => (
  <div>
    <span className="gap-1" /> {/* @layout-space-magic-ok: 4px icon stack non-layout */}
    <span className="p-6" />
  </div>
);'
expect_block "P8. mixed escaped + un-escaped magic → BLOCK"

# P9. `gap-2` remains a macro violation when the line has no canonical micro/list/control
#     structure. The fix for canonical item/Button geometry must not become a blanket gap-1/2
#     allowlist.
run_hook "Write" "$APP_TSX" "content" \
  'const Dashboard = () => <div className="flex flex-col gap-2"><SummaryCard /><RecentWork /></div>;'
expect_block "P9. macro parallel-section gap-2 without semantic micro evidence → BLOCK"

# P10. A micro-looking value plus unrelated macro spacing remains a violation. Classification is
#      per complete line, so canonical gap evidence cannot hide p-/m-/space-* magic.
run_hook "Write" "$APP_TSX" "content" \
  'const Label = () => <span className="inline-flex items-center gap-2 p-4"><Icon />Label</span>;'
expect_block "P10. canonical-looking inline gap plus p-4 → BLOCK"

# P11. `flex items-center gap-2` alone is not sufficient:the same utilities can describe a macro
#      row. A recognized inline/list/control/form semantic owner is mandatory.
run_hook "Write" "$APP_TSX" "content" \
  'const Row = () => <div className="flex items-center gap-2"><SummaryCard /><RecentWork /></div>;'
expect_block "P11. generic flex row gap-2 without semantic owner → BLOCK"

# ─────────────────────────────────────────────────────────────
# NEGATIVE cases — should NOT trigger (over-broad guard)
# ─────────────────────────────────────────────────────────────

# N1. layoutSpace token var() usage → silent (the canonical correct form)
run_hook "Write" "$APP_TSX" "content" \
  'const Card = () => <div className="p-[var(--layout-space-loose)] gap-[var(--layout-space-tight)]">ok</div>;'
expect_silent "N1. p-[var(--layout-space-loose)] token → silent"

# N2. NEAR-MISS: p-0 / m-0 (padding/margin zero — regex 不收 `0`) → silent
run_hook "Write" "$APP_TSX" "content" \
  'const Main = () => <main className="p-0 m-0">landmark padding=0 intentional</main>;'
expect_silent "N2. near-miss p-0 m-0 → silent (regex excludes 0)"

# N3. NEAR-MISS: non-spacing utilities that contain digits (w-4 / h-8 / text-sm / size-3 / z-10) → silent
run_hook "Write" "$APP_TSX" "content" \
  'const Icon = () => <svg className="w-4 h-8 text-sm z-10 size-3 rounded-2" />;'
expect_silent "N3. near-miss w-4/h-8/text-sm/size-3 non-spacing → silent"

# N4. Escape marker on the magic line → silent
run_hook "Write" "$APP_TSX" "content" \
  'const Stack = () => <div className="gap-1">x</div>; // @layout-space-magic-ok: 4px icon stack, non-consumer-layout'
expect_silent "N4. magic line with @layout-space-magic-ok escape → silent"

# N4b. 2026-06-03 回歸防護:escape marker 在「前一行」→ silent。JSX className 行無法放同行 //,
#      原 code 只查同行(doc 卻宣稱支援前一行)→ JSX escape 實質失效;修後前一行 marker 必被認。
run_hook "Write" "$APP_TSX" "content" \
  'const C = () => (
  {/* @layout-space-magic-ok: dev artifact wrapper, non-consumer-layout */}
  <div className="p-4">x</div>
);'
expect_silent "N4b. magic line with escape on PRECEDING line → silent(回歸防護)"

# N5. DS source file is excluded from scope → silent (even WITH magic number)
run_hook "Write" "$DS_TSX" "content" \
  'const Btn = () => <button className="px-4 py-2 gap-2">click</button>;'
expect_silent "N5. magic in packages/design-system/src → silent (out of scope)"

# N6. Non-.tsx/.ts file (e.g. .css) → silent
run_hook "Write" "/Users/x/my-project/apps/template/src/globals.css" "content" \
  '.card { padding: 16px; } /* p-4 in a comment */'
expect_silent "N6. .css file → silent (scope is tsx/ts only)"

# N7. Wrong tool (Read) → silent
run_hook "Read" "$APP_TSX" "content" \
  'const Card = () => <div className="p-4">x</div>;'
expect_silent "N7. tool=Read → silent (only Edit/Write/MultiEdit)"

# N8. Empty content → silent
run_hook "Write" "$APP_TSX" "content" ""
expect_silent "N8. empty content → silent"

# N9. Clean consumer code with NO spacing classes at all → silent
run_hook "Write" "$APP_TSX" "content" \
  'export const Greeting = ({ name }: { name: string }) => <h1 className="text-lg font-semibold text-fg">Hello {name}</h1>;'
expect_silent "N9. clean code, no spacing class → silent"

# N10. node_modules path excluded → silent
run_hook "Write" "/Users/x/my-project/node_modules/@qijenchen/design-system/dist/x.tsx" "content" \
  'const X = () => <div className="p-4">x</div>;'
expect_silent "N10. node_modules path → silent (out of scope)"

# N11. Item/Button-style inline anatomy:the inline formatting context + cross-axis alignment is
#      mechanically sufficient evidence that gap-1/2 is fixed internal geometry, not macro layout.
run_hook "Write" "$APP_TSX" "content" \
  'const Meta = () => <span className="inline-flex items-center gap-1"><Info />Details</span>;'
expect_silent "N11. inline item/control gap-1 with structural evidence → silent"

# N12. A phrasing wrapper using flex (rather than inline-flex) is still bounded inline anatomy.
run_hook "Write" "$APP_TSX" "content" \
  'const Title = () => <span className="flex min-w-0 items-start gap-2"><Icon /><span>Title</span></span>;'
expect_silent "N12. span item-anatomy gap-2 with alignment evidence → silent"

# N13. Homogeneous semantic list rows own their fixed row gap per layoutSpace rule 3 boundary.
run_hook "Write" "$APP_TSX" "content" \
  'const List = () => <ul className="flex flex-col gap-2">{items.map((item) => <li key={item.id}>{item.name}</li>)}</ul>;'
expect_silent "N13. semantic homogeneous list gap-2 → silent"

# N14. Toolbar is a named control context; compact Button geometry is deliberately fixed.
run_hook "Write" "$APP_TSX" "content" \
  'const Toolbar = () => <div role="toolbar" className="flex items-center gap-1"><Button iconOnly /><Button iconOnly /></div>;'
expect_silent "N14. toolbar control gap-1 with role evidence → silent"

# N15. layoutSpace rule 5 permits a tightly grouped horizontal field pair at fixed gap-2. Both
#      the group semantic and two nearby field controls are required.
run_hook "Write" "$APP_TSX" "content" \
  'const Range = () => (
  <fieldset className="flex items-start gap-2">
    <Field label="Start"><Input /></Field>
    <Field label="End"><Input /></Field>
  </fieldset>
);'
expect_silent "N15. grouped horizontal field pair gap-2 (rule 5) → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

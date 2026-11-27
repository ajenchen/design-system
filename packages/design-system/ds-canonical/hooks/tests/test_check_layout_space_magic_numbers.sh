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
[ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ] || { echo "❌ mktemp -d failed(TMP_DIR;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
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

# P12. A nested phrasing child is not the class-bearing owner. Only `<span className="...">`
#      itself can establish phrasing micro geometry; otherwise any macro row could smuggle in a
#      harmless child span and bypass the gate.
run_hook "Write" "$APP_TSX" "content" \
  'const Row = () => <div className="flex items-center gap-2"><span>Title</span><SummaryCard /><RecentWork /></div>;'
expect_block "P12. macro div gap-2 cannot borrow nested span semantics → BLOCK"

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

# ─────────────────────────────────────────────────────────────
# 一排 assist chip(chip.spec.md「一排 assist chip(訊息附件以外)」;user 2026-11-26 決策卡 E2
# 選「A:照附件列同一套寫進 chip 規格,閘放行」)。只放行這一個結構,每一格各有對照組:
#   合法樣本 N18 / N19 綠;手刻 div(P17)、沒寫 role="list"(P18)、間距不是 4(P19)、
#   清單裡不是 assist chip(P20 / P21)仍紅;拿掉放行(P22,同一份 N18 樣本)→ 紅。
# ─────────────────────────────────────────────────────────────

CHIP_ROW_MAPPED='const QuickPrompts = () => (
  <ul role="list" className="flex flex-wrap gap-1">
    {prompts.map((prompt) => (
      <li key={prompt.id}>
        <Chip variant="assist" onClick={() => ask(prompt.text)}>{prompt.text}</Chip>
      </li>
    ))}
  </ul>
);'

# N18. 合法:ul role=list + flex-wrap + gap-1,每顆 li 包 assist chip(map 產生)→ silent
run_hook "Write" "$APP_TSX" "content" "$CHIP_ROW_MAPPED"
expect_silent "N18. 一排 assist chip(ul role=list / li / gap-1,map)→ silent"

# N19. 合法:逐顆寫出、props 跨行、onClick(含 =>)寫在 variant 前面 → silent
run_hook "Write" "$APP_TSX" "content" \
'const QuickPrompts = () => (
  <ul role="list" className="flex flex-wrap gap-1">
    <li>
      <Chip onClick={() => ask("摘要這份報告")} variant="assist">摘要這份報告</Chip>
    </li>
    <li>
      <Chip
        onClick={() => ask("列出待辦事項")}
        variant="assist"
      >
        列出待辦事項
      </Chip>
    </li>
  </ul>
);'
expect_silent "N19. 一排 assist chip(逐顆寫、props 跨行、onClick 在 variant 前)→ silent"

# P17. 手刻 div 排一排 assist chip(沒有語意清單)→ BLOCK
run_hook "Write" "$APP_TSX" "content" \
'const QuickPrompts = () => (
  <div className="flex flex-wrap gap-1">
    {prompts.map((prompt) => (
      <Chip key={prompt.id} variant="assist" onClick={() => ask(prompt.text)}>{prompt.text}</Chip>
    ))}
  </div>
);'
expect_block "P17. 手刻 div 排一排 assist chip → BLOCK"

# P18. ul 沒寫 role="list"(Tailwind 拿掉清單符號後讀屏不當清單念)→ BLOCK
run_hook "Write" "$APP_TSX" "content" "${CHIP_ROW_MAPPED/ role=\"list\"/}"
expect_block "P18. 一排 assist chip 的 ul 沒寫 role=list → BLOCK"

# P19. 間距不是 4(gap-2 = ChipGroup filter 的值,不是附件列的值)→ BLOCK
run_hook "Write" "$APP_TSX" "content" "${CHIP_ROW_MAPPED/gap-1/gap-2}"
expect_block "P19. 一排 assist chip 用 gap-2 → BLOCK"

# P20. 清單裡是 filter Chip(沒寫 variant="assist")→ BLOCK
run_hook "Write" "$APP_TSX" "content" "${CHIP_ROW_MAPPED/ variant=\"assist\"/ value=\"x\"}"
expect_block "P20. 換行清單裡是 filter Chip → BLOCK"

# P21. 換行清單裡不是 Chip(Badge 一排)→ BLOCK
run_hook "Write" "$APP_TSX" "content" \
'const Labels = () => (
  <ul role="list" className="flex flex-wrap gap-1">
    {labels.map((label) => (
      <li key={label.id}><Badge>{label.name}</Badge></li>
    ))}
  </ul>
);'
expect_block "P21. 換行清單裡不是 assist chip(Badge)→ BLOCK"

# P22. 拿掉放行:同一份 N18 合法樣本,consumer corpus 的 registry 把 assist_chip_row 的 item_variant
#      換成不存在的值(等同這條放行不在)→ BLOCK。證明 N18 的綠來自這條放行,不是別條規則順手放過。
CHIP_ROW_OFF_CORPUS="$TMP_DIR/chip-row-off-corpus"
mkdir -p "$CHIP_ROW_OFF_CORPUS/references"
python3 - "$SCRIPT_DIR/../../../src/tokens/utility-registry.json" "$CHIP_ROW_OFF_CORPUS/references/utility-registry.json" <<'PY'
import json, sys
registry = json.load(open(sys.argv[1], encoding="utf-8"))
registry["spacing"]["canonical_micro_geometry"]["assist_chip_row"]["item_variant"] = "lane-removed"
json.dump(registry, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
GOVERNANCE_CORPUS_ROOT="$CHIP_ROW_OFF_CORPUS" run_hook "Write" "$APP_TSX" "content" "$CHIP_ROW_MAPPED"
expect_block "P22. 拿掉 assist_chip_row 放行 → 同一份合法樣本 BLOCK"

# ─────────────────────────────────────────────────────────────
# 幻覺 token:白名單從 layoutSpace.css 現讀(寫死 loose|tight|bottom 會漏掉之後新增的 tier)
# ─────────────────────────────────────────────────────────────

# P13. 錨例 2026-07-08 WM:自創 --layout-space-distant(css 沒宣告)→ BLOCK
run_hook "Write" "$APP_TSX" "content" \
  'const Detail = () => <div className="flex flex-col gap-[var(--layout-space-distant)]">內容</div>;'
expect_block "P13. 幻覺 token --layout-space-distant → BLOCK" "幻覺 layout-space token"

# P14. 同一行有一顆合法 token,不得把同行的幻覺 token 一起放掉(逐個 var() 判,不逐行判)→ BLOCK
run_hook "Write" "$APP_TSX" "content" \
  'const Detail = () => <div className="p-[var(--layout-space-loose)] gap-[var(--layout-space-distant)]">內容</div>;'
expect_block "P14. 合法 loose 與幻覺 distant 同一行 → BLOCK" "幻覺 layout-space token"

# N16. --layout-space-viewport-inset 是 layoutSpace.css 宣告的 token(寫死三顆的舊白名單會誤擋)→ silent
run_hook "Write" "$APP_TSX" "content" \
  'const Shell = () => <div className="p-[var(--layout-space-viewport-inset)]">內容</div>;'
expect_silent "N16. layoutSpace.css 宣告的 viewport-inset → silent"

# consumer 端:corpus 是 fork 分發的那一份(只有 references/,沒有 DS 原始碼),
# 改讀已安裝套件裡發布的同一份 layoutSpace.css(package.json files 含 src/**/*.css)
CONSUMER_CORPUS="$TMP_DIR/consumer-corpus"
CONSUMER_PROJECT="$TMP_DIR/consumer-project"
mkdir -p "$CONSUMER_CORPUS/references" "$CONSUMER_PROJECT/node_modules/@qijenchen/design-system/src/tokens/layoutSpace" "$CONSUMER_PROJECT/.claude/logs"
cp "$SCRIPT_DIR/../../../src/tokens/utility-registry.json" "$CONSUMER_CORPUS/references/utility-registry.json"
cp "$SCRIPT_DIR/../../../src/tokens/layoutSpace/layoutSpace.css" \
  "$CONSUMER_PROJECT/node_modules/@qijenchen/design-system/src/tokens/layoutSpace/layoutSpace.css"

# N17. consumer:node_modules 裡的 layoutSpace.css 宣告了 viewport-inset → silent
GOVERNANCE_CORPUS_ROOT="$CONSUMER_CORPUS" GOVERNANCE_PROJECT_DIR="$CONSUMER_PROJECT" run_hook "Write" "$APP_TSX" "content" \
  'const Shell = () => <div className="p-[var(--layout-space-viewport-inset)]">內容</div>;'
expect_silent "N17. consumer 讀 node_modules 的 layoutSpace.css,viewport-inset → silent"

# P15. consumer:同一份 css 下,自創 distant 仍 → BLOCK(讀到白名單不等於全放行)
GOVERNANCE_CORPUS_ROOT="$CONSUMER_CORPUS" GOVERNANCE_PROJECT_DIR="$CONSUMER_PROJECT" run_hook "Write" "$APP_TSX" "content" \
  'const Detail = () => <div className="gap-[var(--layout-space-distant)]">內容</div>;'
expect_block "P15. consumer 讀 node_modules 的 css,distant → BLOCK" "幻覺 layout-space token"

# P16. 兩處都讀不到 layoutSpace.css → 儀器失效(exit 70),不准默默放行
rm -rf "$CONSUMER_PROJECT/node_modules"
GOVERNANCE_CORPUS_ROOT="$CONSUMER_CORPUS" GOVERNANCE_PROJECT_DIR="$CONSUMER_PROJECT" run_hook "Write" "$APP_TSX" "content" \
  'const Shell = () => <div className="p-[var(--layout-space-viewport-inset)]">內容</div>;'
if [ "$EXIT" = "70" ] && echo "$STDERR_TEXT" | grep -qF "layout-space token SSOT unavailable"; then
  echo "  PASS  P16. 讀不到 layoutSpace.css → GOVERNANCE_INTEGRITY exit 70"; PASS=$((PASS+1))
else
  echo "  FAIL  P16. 讀不到 layoutSpace.css(expected exit=70 + integrity message, got exit=$EXIT)"
  echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - P16. 讀不到 layoutSpace.css"
fi

# ── E16 + E14 (1)(2026-11-27):註解不是程式 —— 掃遮罩後的內容,豁免標記仍對原文判 ──
# M1. 行尾註解提到 p-4 → 放行(舊實作逐行掃整段:紅)
run_hook "Write" "$APP_TSX" "content" \
  'export const Card = () => <div className="flex">內容</div>; // 以前是 p-4,已改 token'
expect_silent "M1. 行尾 // 註解裡的 p-4 不算 → silent"
# M2. JSX 註解 {/* gap-2 … */} → 放行
run_hook "Write" "$APP_TSX" "content" \
  'const A = () => <section className="flex">{/* 這裡不要用 gap-2,改用 token */}<span>x</span></section>;'
expect_silent "M2. {/* … */} 裡的 gap-2 不算 → silent"
# M3. 同一行程式真的寫 p-4、只是行尾也有說明 → 照擋(遮罩不吃程式)
run_hook "Write" "$APP_TSX" "content" \
  'export const Card = () => <div className="p-4">內容</div>; // 卡片內距'
expect_block "M3. 程式裡的 p-4 + 行尾一般註解 → BLOCK"
# M4. 同行豁免標記(本身是註解、遮罩後被抹掉)仍對原文判 → 放行
run_hook "Write" "$APP_TSX" "content" \
  'export const Card = () => <div className="p-4">內容</div>; // @layout-space-magic-ok: 第三方嵌入框固定內距'
expect_silent "M4. 同行 @layout-space-magic-ok 仍有效 → silent"
# M5. 字串裡的 https:// 不當註解起點(否則同一行後面的 p-4 會被遮掉 = 漏判)
run_hook "Write" "$APP_TSX" "content" \
  'export const L = () => <a href="https://example.com" className="p-4">x</a>;'
expect_block "M5. href 裡的 // 不是註解,後面的 p-4 照擋 → BLOCK"

# ── H2 + H3 + H4(2026-11-27):規格登記的寫法(utility-registry canonical_micro_geometry.spec_registered_patterns)──
# 三種規格寫法放行(舊分類器:三格全紅 —— 對照組在交接紀錄);反例照擋。
# S1. 檔案清單:flex flex-col gap-2,鄰近 .map( 產出 <FileItem(file-item.spec.md「List wrapper 本身不加視覺」)
run_hook "Write" "$APP_TSX" "content" \
  'const Attachments = () => (
  <div className="flex flex-col gap-2">
    {files.map((f) => <FileItem key={f.id} mode="rich" name={f.name} />)}
  </div>
);'
expect_silent "S1. FileItem 清單 flex-col gap-2(規格寫法)→ silent"
# S1b. compact 清單 gap-1 同一筆登記
run_hook "Write" "$APP_TSX" "content" \
  'const Attachments = () => (
  <div className="flex flex-col gap-1">
    {files.map((f) => <FileItem key={f.id} mode="compact" name={f.name} />)}
  </div>
);'
expect_silent "S1b. FileItem 清單 flex-col gap-1(規格寫法)→ silent"
# S2. 頁面列表列:flex items-start gap-3 px-4 py-3,鄰近頭像 / Item 零件(item-anatomy.spec.md「頁面列表」)
run_hook "Write" "$APP_TSX" "content" \
  'const MemberRow = ({ member }) => (
  <div className="flex items-start gap-3 px-4 py-3">
    <Avatar src={member.photo} alt={member.name} size={32} />
    <ItemContent label={member.name} description={member.role} mode="reading" />
  </div>
);'
expect_silent "S2. 頁面列表列 gap-3 px-4 py-3 + Avatar / ItemContent → silent"
# S3. 浮層清單外框:role=list + flex flex-col py-2,在 DialogBody 底下(overlay-surface.spec.md「List-as-region」)
run_hook "Write" "$APP_TSX" "content" \
  'const Members = () => (
  <Dialog open>
    <DialogContent>
      <DialogBody className="!px-0 !pt-0 !pb-0">
        <div role="list" className="flex flex-col py-2">
          {members.map((m) => <MemberRow key={m.id} member={m} />)}
        </div>
      </DialogBody>
    </DialogContent>
  </Dialog>
);'
expect_silent "S3. DialogBody 裡 role=list flex-col py-2 → silent"
# S3b. <ul> + data-layout-region 在 SheetBody 底下
run_hook "Write" "$APP_TSX" "content" \
  'const Recent = () => (
  <SheetBody>
    <ul data-layout-region="unbounded" className="flex flex-col py-2">
      {projects.map((p) => <li key={p.id}>{p.name}</li>)}
    </ul>
  </SheetBody>
);'
expect_silent "S3b. SheetBody 裡 ul flex-col py-2 → silent"
# X1. 反例:沒有 FileItem 的 flex-col gap-2 → 照擋
run_hook "Write" "$APP_TSX" "content" \
  'const Cards = () => (
  <div className="flex flex-col gap-2">
    {cards.map((c) => <ProjectCard key={c.id} card={c} />)}
  </div>
);'
expect_block "X1. 沒有 FileItem 的 flex-col gap-2 → BLOCK"
# X2. 反例:沒有頭像也沒有 Item 零件的 gap-3 px-4 py-3 → 照擋
run_hook "Write" "$APP_TSX" "content" \
  'const Notice = () => (
  <div className="flex items-start gap-3 px-4 py-3">
    <Info size={16} />
    <span>本週五 22:00 系統維護</span>
  </div>
);'
expect_block "X2. 沒有頭像 / Item 零件的 gap-3 px-4 py-3 → BLOCK"
# X3. 反例:不在浮層主體裡的 py-2 清單 → 照擋
run_hook "Write" "$APP_TSX" "content" \
  'const Members = () => (
  <section>
    <div role="list" className="flex flex-col py-2">
      {members.map((m) => <MemberRow key={m.id} member={m} />)}
    </div>
  </section>
);'
expect_block "X3. 不在 DialogBody / SheetBody / SurfaceBody 裡的 py-2 清單 → BLOCK"
# X3b. 反例:DialogBody 已經關掉,後面那份清單不在它底下 → 照擋
run_hook "Write" "$APP_TSX" "content" \
  'const Page = () => (
  <>
    <DialogBody>摘要</DialogBody>
    <div role="list" className="flex flex-col py-2">
      {members.map((m) => <MemberRow key={m.id} member={m} />)}
    </div>
  </>
);'
expect_block "X3b. DialogBody 已關閉後的 py-2 清單 → BLOCK"
# X4. 反例:規格組合多帶一個 magic(mb-4)→ 整組對不上 → 照擋
run_hook "Write" "$APP_TSX" "content" \
  'const MemberRow = ({ member }) => (
  <div className="flex items-start gap-3 px-4 py-3 mb-4">
    <Avatar src={member.photo} alt={member.name} size={32} />
    <ItemContent label={member.name} mode="reading" />
  </div>
);'
expect_block "X4. 頁面列表列多帶 mb-4 → BLOCK"
# X5. 反例:FileItem 清單換成 gap-3(不在登記的 gap-1 / gap-2)→ 照擋
run_hook "Write" "$APP_TSX" "content" \
  'const Attachments = () => (
  <div className="flex flex-col gap-3">
    {files.map((f) => <FileItem key={f.id} name={f.name} />)}
  </div>
);'
expect_block "X5. FileItem 清單 gap-3(未登記)→ BLOCK"

# ── H26(2026-11-27):layoutSpace 規則 3「標題塊」—— 標題字列 → 它標示的有框內容 = 8(utility-registry title_block)──
# 三種寫法放行(改前分類器:三格全紅 —— 交接紀錄);缺標題 / 底下不是有框內容 / 不是 8 / 有框按鈕的標題列 /
# 夾了工具列 / .map( 產生好幾個 照擋;T9 拿掉放行 → 同一份 T1 樣本紅(證明 T1 的綠來自這一條)。
TITLE_BLOCK_GAP='const Statuses = () => (
  <section className="flex flex-col gap-2">
    <h3 className="text-h6 font-medium">Statuses</h3>
    <DataTable columns={statusColumns} data={statuses} />
  </section>
);'
# T1. 標題與表同包一層 flex flex-col gap-2 → 放行
run_hook "Write" "$APP_TSX" "content" "$TITLE_BLOCK_GAP"
expect_silent "T1. 標題塊:flex-col gap-2 [標題, DataTable] → silent"
# T2. 標題列(右邊無框小圖示鈕)上的 mb-2,下一個兄弟是表 → 放行
run_hook "Write" "$APP_TSX" "content" \
  'const Statuses = () => (
  <>
    <div className="flex items-start justify-between mb-2">
      <h3 className="text-h6 font-medium">Statuses</h3>
      <Button size="xs" iconOnly variant="text" aria-label="新增狀態"><Plus /></Button>
    </div>
    <DataTable columns={statusColumns} data={statuses} />
  </>
);'
expect_silent "T2. 標題塊:無框按鈕的標題列 mb-2 → DataTable → silent"
# T3. 有框內容(一組選項卡)上的 mt-2,className 寫在開標籤的下一行,上一個兄弟是標題 → 放行
run_hook "Write" "$APP_TSX" "content" \
  'const Channels = () => (
  <div>
    <h4 className="text-h6 font-medium">Channels</h4>
    <div
      role="radiogroup"
      className="mt-2 grid grid-cols-3 gap-[var(--layout-space-tight)]"
    >
      <label className="border border-border rounded-md">Email</label>
      <label className="border border-border rounded-md">Push</label>
    </div>
  </div>
);'
expect_silent "T3. 標題塊:標題 → 選項卡群組 mt-2(className 換行)→ silent"
# T4. 標題 → 搜尋列(role=search):mb-2 → 放行(搜尋列 → 表是 tight token,不是 8)
run_hook "Write" "$APP_TSX" "content" \
  'const Priorities = () => (
  <>
    <h3 className="text-h6 font-medium mb-2">Priorities</h3>
    <div role="search" className="flex items-center gap-[var(--layout-space-tight)]">
      <Input size="sm" placeholder="搜尋優先順序" />
    </div>
    <DataTable className="mt-[var(--layout-space-tight)]" columns={priorityColumns} data={priorities} />
  </>
);'
expect_silent "T4. 標題塊:標題 mb-2 → 搜尋列 → (tight)表 → silent"
# TX1. 缺標題(上面是一段說明文字)→ 照擋
run_hook "Write" "$APP_TSX" "content" \
  'const Statuses = () => (
  <section className="flex flex-col gap-2">
    <p>狀態會出現在任務卡片上</p>
    <DataTable columns={statusColumns} data={statuses} />
  </section>
);'
expect_block "TX1. 標題塊:缺標題 → BLOCK"
# TX2. 底下不是有框內容(一段文字)→ 照擋
run_hook "Write" "$APP_TSX" "content" \
  'const Statuses = () => (
  <>
    <h3 className="text-h6 font-medium mb-2">Statuses</h3>
    <p>還沒有任何狀態</p>
  </>
);'
expect_block "TX2. 標題塊:底下不是有框內容 → BLOCK"
# TX3. 數值不是 8(gap-3)→ 照擋
run_hook "Write" "$APP_TSX" "content" "${TITLE_BLOCK_GAP/gap-2/gap-3}"
expect_block "TX3. 標題塊:gap-3(不是 8)→ BLOCK"
# TX4. 標題列放有框按鈕(沒寫 variant=\"text\")= 有框控件列 → 應是 tight,mb-2 照擋
run_hook "Write" "$APP_TSX" "content" \
  'const Statuses = () => (
  <>
    <div className="flex items-start justify-between mb-2">
      <h3 className="text-h6 font-medium">Statuses</h3>
      <Button size="sm" variant="secondary">新增狀態</Button>
    </div>
    <DataTable columns={statusColumns} data={statuses} />
  </>
);'
expect_block "TX4. 標題塊:有框按鈕的標題列 mb-2 → BLOCK"
# TX5. 同一層夾了工具列(標題、工具列、表三個):工具列 → 表應是 tight,整層 gap-2 照擋
run_hook "Write" "$APP_TSX" "content" \
  'const Statuses = () => (
  <section className="flex flex-col gap-2">
    <h3 className="text-h6 font-medium">Statuses</h3>
    <div role="toolbar" className="flex items-center"><Input size="sm" /></div>
    <DataTable columns={statusColumns} data={statuses} />
  </section>
);'
expect_block "TX5. 標題塊:同層夾工具列(三個子元素)→ BLOCK"
# TX6. .map( 產生好幾張有框卡(標題描述的是好幾個東西)→ 照擋
run_hook "Write" "$APP_TSX" "content" \
  'const Projects = () => (
  <section className="flex flex-col gap-2">
    <h3 className="text-h6 font-medium">Projects</h3>
    {projects.map((p) => <article key={p.id} className="border rounded-md">{p.name}</article>)}
  </section>
);'
expect_block "TX6. 標題塊:.map( 產生的好幾張卡 → BLOCK"
# TX7. 同一行多帶別的寫死間距(p-4)→ 照擋
run_hook "Write" "$APP_TSX" "content" "${TITLE_BLOCK_GAP/gap-2/gap-2 p-4}"
expect_block "TX7. 標題塊:同行多帶 p-4 → BLOCK"
# TX8. 擋下時的訊息要講 JSX 裡怎麼寫豁免
run_hook "Write" "$APP_TSX" "content" "${TITLE_BLOCK_GAP/gap-2/gap-3}"
expect_block "TX8. 擋下訊息含 JSX 的豁免寫法" '{/* @layout-space-magic-ok:'
# T5. 整塊寫在同一行(同一行有三個開標籤,只有帶 gap-2 的那一層算)→ 放行
run_hook "Write" "$APP_TSX" "content" \
  'const S = () => <section className="flex flex-col gap-2"><h3 className="text-h6">Statuses</h3><DataTable columns={statusColumns} data={statuses} /></section>;'
expect_silent "T5. 標題塊寫在同一行 → silent"
# TX9. 標題列裡放了搜尋框(有框的控件)= 有框控件列 → 應是 tight,mb-2 照擋
run_hook "Write" "$APP_TSX" "content" \
  'const Statuses = () => (
  <>
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-h6 font-medium">Statuses</h3>
      <Input size="sm" placeholder="搜尋狀態" />
    </div>
    <DataTable columns={statusColumns} data={statuses} />
  </>
);'
expect_block "TX9. 標題塊:標題列裡有搜尋框 mb-2 → BLOCK"
# TX10. 同一行兩層都帶 gap-2,只有內層是標題塊 → 外層仍是版面間距,照擋
run_hook "Write" "$APP_TSX" "content" \
  'const S = () => <div className="flex flex-col gap-2"><section className="flex flex-col gap-2"><h3 className="text-h6">Statuses</h3><DataTable columns={statusColumns} data={statuses} /></section><p>說明</p></div>;'
expect_block "TX10. 同一行外層的 gap-2 不是標題塊 → BLOCK"
# T9. 拿掉放行:consumer corpus 的 registry 把 title_block 的 bordered_components 換成不存在的元件 → 同一份 T1 樣本 BLOCK
TITLE_OFF_CORPUS="$TMP_DIR/title-block-off-corpus"
mkdir -p "$TITLE_OFF_CORPUS/references"
python3 - "$SCRIPT_DIR/../../../src/tokens/utility-registry.json" "$TITLE_OFF_CORPUS/references/utility-registry.json" <<'PY'
import json, sys
registry = json.load(open(sys.argv[1], encoding="utf-8"))
registry["spacing"]["canonical_micro_geometry"]["title_block"]["bordered_components"] = ["LaneRemoved"]
json.dump(registry, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
GOVERNANCE_CORPUS_ROOT="$TITLE_OFF_CORPUS" run_hook "Write" "$APP_TSX" "content" "$TITLE_BLOCK_GAP"
expect_block "T9. 拿掉 title_block 的 DataTable → 同一份 T1 樣本 BLOCK"

# ── H32(2026-11-27,workspace 回報;以 beta.150 實測):規格寫的固定間距檢查卻擋 ──
# R1. 規則 5 非緊密(不同組值並列)gap-4 —— 證據同 gap-2 那一格(橫排 + fieldset / role=group + 兩個以上欄位)→ 放行
run_hook "Write" "$APP_TSX" "content" \
  'const Schedule = () => (
  <fieldset className="flex items-start gap-4">
    <div role="group" aria-label="睡眠時段" className="flex items-start gap-2">
      <Field label="開始"><TimePicker /></Field>
      <Field label="結束"><TimePicker /></Field>
    </div>
    <div role="group" aria-label="工作時段" className="flex items-start gap-2">
      <Field label="開始"><TimePicker /></Field>
      <Field label="結束"><TimePicker /></Field>
    </div>
  </fieldset>
);'
expect_silent "R1. 規則 5 不同組欄位並排 gap-4 → silent"
# RX1. 直排(flex-col)gap-4 = 版面間距,照擋
run_hook "Write" "$APP_TSX" "content" \
  'const Schedule = () => (
  <fieldset className="flex flex-col gap-4">
    <Field label="開始"><TimePicker /></Field>
    <Field label="結束"><TimePicker /></Field>
  </fieldset>
);'
expect_block "RX1. 規則 5:flex-col gap-4 → BLOCK"
# RX2. 沒有群組語意的 div gap-4 → 照擋
run_hook "Write" "$APP_TSX" "content" \
  'const Schedule = () => (
  <div className="flex items-start gap-4">
    <Field label="開始"><TimePicker /></Field>
    <Field label="結束"><TimePicker /></Field>
  </div>
);'
expect_block "RX2. 規則 5:沒有 fieldset / role=group 的 gap-4 → BLOCK"
# RX3. 只有一個欄位 → 照擋
run_hook "Write" "$APP_TSX" "content" \
  'const Schedule = () => (
  <div role="group" className="flex items-start gap-4">
    <Field label="開始"><TimePicker /></Field>
    <Button variant="text">清除</Button>
  </div>
);'
expect_block "RX3. 規則 5:gap-4 只有一個欄位 → BLOCK"
# I1. 公開 Item 零件組的一列:直屬子元素全是 Item 零件、至少兩個、gap-2(item-anatomy.spec.md「消費元件預設」)→ 放行
ITEM_ROW='const Member = ({ m }) => (
  <div className="flex items-start gap-2">
    <ItemContent label={m.name} description={m.email} mode="reading" />
    {m.role ? <ItemSuffix><Badge>{m.role}</Badge></ItemSuffix> : null}
  </div>
);'
run_hook "Write" "$APP_TSX" "content" "$ITEM_ROW"
expect_silent "I1. ItemContent + ItemSuffix 的列 gap-2 → silent"
# IX1. 直屬子元素混了非 Item 零件(Badge 直接放)→ 照擋
run_hook "Write" "$APP_TSX" "content" "${ITEM_ROW/<ItemSuffix><Badge>{m.role}<\/Badge><\/ItemSuffix>/<Badge>{m.role}<\/Badge>}"
expect_block "IX1. Item 列混了非零件的直屬子元素 → BLOCK"
# IX2. 只有一個零件 → 照擋
run_hook "Write" "$APP_TSX" "content" \
  'const Member = ({ m }) => (
  <div className="flex items-start gap-2">
    <ItemContent label={m.name} mode="reading" />
  </div>
);'
expect_block "IX2. Item 列只有一個零件 → BLOCK"
# IX3. 直排(flex-col)→ 照擋
run_hook "Write" "$APP_TSX" "content" "${ITEM_ROW/flex items-start gap-2/flex flex-col items-start gap-2}"
expect_block "IX3. Item 零件直排 flex-col gap-2 → BLOCK"
# M6. 多行 /* … */ 註解裡的 gap-2 → 放行(M1 = 行尾 //、M2 = {/* … */},這一格補第三種寫法)
run_hook "Write" "$APP_TSX" "content" \
  '/*
 * 列與列之間不要寫 gap-2,改用 layout-space token
 */
export const Rows = () => <div className="flex">內容</div>;'
expect_silent "M6. 多行 /* … */ 裡的 gap-2 不算 → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

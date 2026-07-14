#!/bin/bash
# 2026-06-11 payload 正交化:合併檔跑全規則,payload 須對非受測規則 clean(合併前真系統行為相同 — 另一 hook 同樣會攔)
# 2026-06-11 repoint:check_consumer_ds_primitive_misuse.sh 已合併進 check_consumer_app_invariants.sh(prune merge;測試 payload 不變 = 行為等價驗證)
# Tests for check_consumer_app_invariants.sh(P0 BLOCKER,2026-05-27 user verbatim
# 「做產品真的要能使用跟 ds repo 一模一樣的元件」)
#
# Hook 契約(PreToolUse,tool=Edit|Write|MultiEdit):
#   - Scope:tool_input.file_path 必匹配 `/(apps|consumer)/.*\.(tsx|ts)$`
#            (Claude Code 永遠傳 absolute path → leading slash 前綴 apps/consumer)
#            排除 `packages/design-system/src/` + `node_modules/`
#   - Content:tool_input.new_string // tool_input.content
#   - Global escape:content 含 `@ds-misuse-allow:` → silent exit 0
#   - 7 anti-patterns(P1-P5 + P8 任何 .tsx/.ts;P6 僅 .stories.tsx):
#       P1 <DS.CircularProgress size={N}> literal number override default 24
#       P2 <DS.RadioGroupItem> 沒 wrap SelectionItem 且無 label=
#       P3 <DS.DataTable columns={[single-col]}> minimal one-column
#       P4 <DS.LinkInput placeholder=...> 沒 value/defaultValue
#       P5 <DS.Empty title=...> 無 icon 且無 description
#       P6 (.stories.tsx only) overlay trigger 無 defaultOpen
#   - BLOCKER:exit 2 + stderr 含 "CONSUMER-DS-PRIMITIVE-MISUSE BLOCKER"
#   - 非觸發 tool / out-of-scope path / 空 content → silent exit 0
#
# Broad-vs-narrow symmetry(M34):每 pattern 同時測 fire(over-narrow guard)
# + near-miss(over-broad guard,canonical 用法不可誤攔)。

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

# Override CLAUDE_PROJECT_DIR so _log-fire.sh 寫進 TMP_DIR,不污染 repo .claude/logs/
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
export CLAUDE_PROJECT_DIR="$TMP_DIR"
mkdir -p "$TMP_DIR/.claude/logs"

# 真實契約:Claude Code 傳 absolute path。Consumer app prod tsx / story tsx 各一條 base。
PROD_TSX="/Users/x/proj/apps/web/src/App.tsx"
STORY_TSX="/Users/x/proj/apps/web/src/Demo.stories.tsx"

run_hook() {
  local file_path="$1"; local content="$2"; local tool="${3:-Write}"
  local payload
  if [ "$tool" = "Edit" ]; then
    # Edit 走 new_string field
    payload=$(jq -n --arg fp "$file_path" --arg c "$content" --arg t "$tool" \
      '{tool_name:$t, tool_input:{file_path:$fp, new_string:$c}}')
  else
    payload=$(jq -n --arg fp "$file_path" --arg c "$content" --arg t "$tool" \
      '{tool_name:$t, tool_input:{file_path:$fp, content:$c}}')
  fi
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

expect_block() {
  local name="$1"; local needle="${2:-CONSUMER-DS-PRIMITIVE-MISUSE BLOCKER}"
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

echo "=== check_consumer_ds_primitive_misuse tests ==="

# ── Scope / event gating(NEGATIVE: should NOT fire)──────────────────────────

# 1. 非觸發 tool(Read)→ silent
payload_read=$(jq -n --arg fp "$PROD_TSX" '{tool_name:"Read", tool_input:{file_path:$fp}}')
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
printf '%s' "$payload_read" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
EXIT=$?
set -e
STDERR_TEXT=$(cat "$STDERR" 2>/dev/null); rm -f "$STDOUT" "$STDERR"
expect_silent "1. tool=Read → skip"

# 2. Out-of-scope path(DS internal src)→ silent,即使含 anti-pattern
run_hook "/Users/x/proj/packages/design-system/src/Foo.tsx" '<DS.Empty title="無資料" />'
expect_silent "2. packages/design-system/src/ → skip (DS internal)"

# 3. Out-of-scope path(node_modules)→ silent
run_hook "/Users/x/proj/node_modules/@qijenchen/design-system/apps/Foo.tsx" '<DS.Empty title="x" />'
expect_silent "3. node_modules/ → skip"

# 4. Non-consumer path(repo src/ 無 apps|consumer 前綴)→ silent
run_hook "/Users/x/proj/src/lib/util.tsx" '<DS.Empty title="x" />'
expect_silent "4. 非 apps/consumer path → skip"

# 5. 空 content → silent
run_hook "$PROD_TSX" ""
expect_silent "5. empty content → skip"

# 6. Clean innocuous consumer tsx → silent
run_hook "$PROD_TSX" 'export const Card = () => <div className="p-4"><h2>Hello</h2></div>'
expect_silent "6. clean innocuous consumer tsx → silent"

# ── Global escape(NEGATIVE)───────────────────────────────────────────────────

# 7. @ds-misuse-allow escape 即使含 anti-pattern → silent
run_hook "$PROD_TSX" '// @ds-misuse-allow: legacy migration WIP
<DS.Empty title="無資料" />'
expect_silent "7. @ds-misuse-allow escape → silent"

# ── P1 CircularProgress(broad-vs-narrow symmetry)─────────────────────────────

# 8. POSITIVE over-narrow guard:literal size={24} → BLOCK
run_hook "$PROD_TSX" 'export const L = () => <DS.CircularProgress size={24} />'
expect_block "8. P1 <CircularProgress size={24}> → BLOCK"

# 9. NEGATIVE over-broad guard:string variant size="lg" 非 literal number → silent
run_hook "$PROD_TSX" 'export const L = () => <DS.CircularProgress size="lg" />'
expect_silent "9. P1 nearmiss <CircularProgress size=\"lg\"> → silent"

# 9b. 2026-06-03 回歸防護(同 R8 bug class):屬性跨多行的真實 JSX → BLOCK。修前 grep 逐行 +
#     [^>]+ 跨屬性匹配 → 多行 component 靜默繞過全部 anti-pattern(= BLOCKER false-negative,對抗稽核抓到)。
run_hook "$PROD_TSX" 'export const L = () => (
  <DS.CircularProgress
    variant="blue"
    size={48}
  />
)'
expect_block "9b. P1 多行屬性 <CircularProgress size={48}> → BLOCK(回歸防護)"

# ── P2 RadioGroupItem(broad-vs-narrow symmetry)───────────────────────────────

# 10. POSITIVE:RadioGroupItem 裸用,無 SelectionItem 無 label → BLOCK
run_hook "$PROD_TSX" 'export const R = () => <DS.RadioGroupItem value="a" />'
expect_block "10. P2 bare <RadioGroupItem> → BLOCK"

# 11. NEGATIVE:RadioGroupItem wrap 進 SelectionItem(canonical)→ silent
run_hook "$PROD_TSX" 'export const R = () => <DS.SelectionItem control={<DS.RadioGroupItem value="a" />} label="選項 A" />'
expect_silent "11. P2 nearmiss <SelectionItem control={<RadioGroupItem>}> → silent"

# ── P4 LinkInput(broad-vs-narrow symmetry)────────────────────────────────────

# 12. POSITIVE:LinkInput placeholder-only(無 value)→ BLOCK
run_hook "$PROD_TSX" 'export const L = () => <DS.LinkInput placeholder="https://example.com" />'
expect_block "12. P4 <LinkInput placeholder-only> → BLOCK"

# 13. NEGATIVE:LinkInput 有 value prop(canonical link/edit pattern)→ silent
run_hook "$PROD_TSX" 'export const L = () => <DS.LinkInput placeholder="https://example.com" value={url} onChange={setUrl} />'
expect_silent "13. P4 nearmiss <LinkInput value={url}> → silent"

# ── P5 Empty(broad-vs-narrow symmetry)────────────────────────────────────────

# 14. POSITIVE:Empty title 無 icon 無 description → BLOCK
run_hook "$PROD_TSX" 'export const E = () => <DS.Empty title="尚無檔案" />'
expect_block "14. P5 <Empty title-only> → BLOCK"

# 15. NEGATIVE:Empty title + description(canonical「預設只需 description」)→ silent
run_hook "$PROD_TSX" 'export const E = () => <DS.Empty title="尚無檔案" description="點右上角上傳第一份文件" />'
expect_silent "15. P5 nearmiss <Empty title+description> → silent"

# 16. NEGATIVE:Empty title + icon(也滿足 canonical)→ silent
run_hook "$PROD_TSX" 'export const E = () => <DS.Empty title="尚無檔案" icon={<DS.FileIcon />} />'
expect_silent "16. P5 nearmiss <Empty title+icon> → silent"

# ── P6 overlay(.stories.tsx scope-gated;prod tsx 不攔)────────────────────────

# 17. POSITIVE:story 用 Dialog overlay 無 defaultOpen → BLOCK
run_hook "$STORY_TSX" '// @story-baseline: x.stories.tsx#Default\nexport const S = () => <DS.Dialog><DS.DialogContent>內容</DS.DialogContent></DS.Dialog>'
expect_block "17. P6 story <Dialog> 無 defaultOpen → BLOCK"

# 18. NEGATIVE over-broad guard:同 overlay 在 prod .tsx(非 story)→ silent
run_hook "$PROD_TSX" 'export const S = () => <DS.Dialog><DS.DialogContent>內容</DS.DialogContent></DS.Dialog>'
expect_silent "18. P6 prod .tsx <Dialog>(非 story scope)→ silent"

# 19. NEGATIVE:story Dialog 有 defaultOpen(canonical visual-snapshot 用法)→ silent
run_hook "$STORY_TSX" '// @story-baseline: x.stories.tsx#Default\nexport const S = () => <DS.Dialog defaultOpen><DS.DialogContent>內容</DS.DialogContent></DS.Dialog>'
expect_silent "19. P6 nearmiss story <Dialog defaultOpen> → silent"

# ── Edit field-path 契約(new_string 而非 content)────────────────────────────

# 20. POSITIVE:Edit tool 走 tool_input.new_string,anti-pattern → BLOCK
run_hook "$PROD_TSX" 'export const L = () => <DS.CircularProgress size={48} />' "Edit"
expect_block "20. Edit(new_string)<CircularProgress size={48}> → BLOCK"

# ── P8 硬寫色值/字級/shadow 繞 token(broad-vs-narrow symmetry,2026-06-02 CF conformance 主防線)──

# 21. POSITIVE:硬寫 hex 色 bg-[#hex] → BLOCK
run_hook "$PROD_TSX" 'export const C = () => <div className="bg-[#3b82f6] text-white">x</div>'
expect_block "21. P8 硬寫 hex 色 bg-[#hex] → BLOCK"

# 22. NEGATIVE over-broad guard:用 token bg-[var(--color-blue-6)] → silent
run_hook "$PROD_TSX" 'export const C = () => <div className="bg-[var(--color-blue-6)] text-body">x</div>'
expect_silent "22. P8 nearmiss bg-[var(--color-blue-6)] + text-body → silent"

# 23. POSITIVE:硬寫字級 text-[14px] → BLOCK
run_hook "$PROD_TSX" 'export const C = () => <p className="text-[14px]">x</p>'
expect_block "23. P8 硬寫字級 text-[14px] → BLOCK"

# 24. POSITIVE:raw shadow-md → BLOCK
run_hook "$PROD_TSX" 'export const C = () => <div className="shadow-md rounded">x</div>'
expect_block "24. P8 raw shadow-md → BLOCK"

# 25. NEGATIVE:用 elevation token shadow-[var(--elevation-100)] → silent
run_hook "$PROD_TSX" 'export const C = () => <div className="shadow-[var(--elevation-100)] rounded">x</div>'
expect_silent "25. P8 nearmiss shadow-[var(--elevation-100)] → silent"

# 26. NEGATIVE over-broad guard:arbitrary 非色/字級值(max-w-[600px] / grid layout)不該誤攔 → silent
run_hook "$PROD_TSX" 'export const C = () => <div className="max-w-[600px] grid-cols-[1fr_2fr]">x</div>'
expect_silent "26. P8 nearmiss max-w-[600px]/grid-cols-[...](非色字 shadow)→ silent"

# ── 手刻 menu-item 可點列(2026-07-10 WM TypeSettingsDialog 左 rail 錨例)──
# 27. POSITIVE:手刻 button + hover:bg-neutral-hover + bg-neutral-selected 成對 → BLOCK
run_hook "$PROD_TSX" 'const cls = `flex w-full items-center gap-2 rounded-md hover:bg-neutral-hover ${sel ? "bg-neutral-selected" : ""}`; export const C = () => <button type="button" className={cls}>Task</button>'
expect_block "27. 手刻 nav row(hover+selected 成對)→ BLOCK"

# 28. NEGATIVE:同簽名 token 出現但已消費 <MenuItem>(正道)→ silent
run_hook "$PROD_TSX" 'export const C = () => <MenuItem size="sm" selected startContent={<Badge/>}>Task</MenuItem> /* hover:bg-neutral-hover bg-neutral-selected */'
expect_silent "28. 消費 <MenuItem> → silent"

# 29. NEGATIVE:只有 hover 無 selected(單純 hover row,非 menu-item family 簽名)→ silent
run_hook "$PROD_TSX" 'export const C = () => <button className="hover:bg-neutral-hover">row</button>'
expect_silent "29. 只 hover 無 selected → silent"

# 30. NEGATIVE:escape marker → silent
run_hook "$PROD_TSX" 'export const C = () => <div className="hover:bg-neutral-hover bg-neutral-selected">x</div> // @nav-row-handcraft-ok: calendar cell 非 menu 語義'
expect_silent "30. @nav-row-handcraft-ok escape → silent"

# ── 2026-07-10 批次 A(治理覆蓋 matrix 收官)──
# 31. C5 POSITIVE:亮色底 + text-white 對比配對違規 → BLOCK
run_hook "$PROD_TSX" 'export const T = () => <span className="bg-[var(--color-amber-6)] text-white size-4">A</span>'
expect_block "31. C5 亮色底+text-white 配對 → BLOCK"

# 32. C5 NEGATIVE:CAT_SOLID 正道(深字桶自帶 on-emphasis-dark)→ silent
run_hook "$PROD_TSX" 'export const T = () => <span className={`size-4 ${CAT_SOLID[hue]}`}>A</span>'
expect_silent "32. C5 消費 CAT_SOLID → silent"

# 33. C18 POSITIVE:children 計數括號串接 → BLOCK
run_hook "$PROD_TSX" 'export const H = () => <span>{group.label} ({items.length})</span>'
expect_block "33. C18 {label} ({count}) 串接 → BLOCK"

# 34. C18 NEGATIVE:aria-label 字串層(attr 非 children)→ silent
run_hook "$PROD_TSX" 'export const H = () => <span aria-label={`${label} (${count})`}>{label}</span>'
expect_silent "34. C18 aria-label 括號形 → silent"

# 35. C17 POSITIVE:vertical Separator 無 mx → BLOCK
run_hook "$PROD_TSX" 'export const B = () => <><Button>A</Button><Separator orientation="vertical" className="h-6" /><Button>B</Button></>'
expect_block "35. C17 vertical Separator 無 mx → BLOCK"

# 36. C17 NEGATIVE:h-6 mx-1 canonical → silent
run_hook "$PROD_TSX" 'export const B = () => <><Button>A</Button><Separator orientation="vertical" className="h-6 mx-1" /><Button>B</Button></>'
expect_silent "36. C17 h-6 mx-1 canonical → silent"

# 37. C20 POSITIVE:手刻 underline 連結字 → BLOCK
run_hook "$PROD_TSX" 'export const D = () => <span className="text-primary underline">upload</span>'
expect_block "37. C20 裸 underline 連結 → BLOCK"

# 38. C20 NEGATIVE:no-underline(合規移除底線)→ silent
run_hook "$PROD_TSX" 'export const D = () => <a className="no-underline text-primary">upload</a>'
expect_silent "38. C20 no-underline → silent"

# 39. C10 POSITIVE:spacer 把 Search 推最右 → BLOCK
run_hook "$PROD_TSX" 'export const T = () => <div><Button>Add</Button><span className="flex-1" /><Input placeholder="Search employees" /></div>'
expect_block "39. C10 業務 search 被推最右 → BLOCK"

# 40. C10 NEGATIVE:search 在業務層(無 spacer 前置)→ silent
run_hook "$PROD_TSX" 'export const T = () => <div><Button>Add</Button><Input placeholder="Search employees" /><span className="flex-1" /></div>'
expect_silent "40. C10 search 歸業務層 → silent"

# 41. C11 POSITIVE:DialogHeader 手放 X(雙 X)→ BLOCK
run_hook "$PROD_TSX" 'export const D = () => <DialogHeader><DialogTitle>Edit</DialogTitle><Button iconOnly startIcon={X} aria-label="Close" /></DialogHeader>'
expect_block "41. C11 DialogHeader 雙 X → BLOCK"

# 42. C11 NEGATIVE:header 操作走 actions slot → silent
run_hook "$PROD_TSX" 'export const D = () => <DialogHeader actions={<Button iconOnly startIcon={X} aria-label="Prev" />}><DialogTitle>Edit</DialogTitle></DialogHeader>'
expect_silent "42. C11 actions slot → silent"

# 43. C12 POSITIVE:Select 硬寬 w-36 → BLOCK
run_hook "$PROD_TSX" 'export const F = () => <Select className="w-36" options={opts} />'
expect_block "43. C12 Select 硬寬 w-36 → BLOCK"

# 44. C12 NEGATIVE:width="hug" 語義軸 → silent
run_hook "$PROD_TSX" 'export const F = () => <Select width="hug" options={opts} />'
expect_silent "44. C12 width=hug → silent"

# 45. named-import 除鏽 POSITIVE:無 DS. 前綴的 LinkInput placeholder-only 也要抓 → BLOCK
run_hook "$PROD_TSX" 'export const L = () => <LinkInput placeholder="https://" />'
expect_block "45. named-import <LinkInput placeholder-only → BLOCK(除鏽)"

# ── C19 兩欄 dialog 共用捲軸(2026-07-10 user 拍板組合 canonical)──
# 46. POSITIVE:兩欄(border-l)+ 只有 1 個 ScrollArea = 共用捲軸 → BLOCK
run_hook "$PROD_TSX" 'export const D = () => <DialogBody><ScrollArea><div className="flex"><div>main</div><aside className="border-l">meta</aside></div></ScrollArea></DialogBody>'
expect_block "46. C19 兩欄共用單一 ScrollArea → BLOCK"

# 47. NEGATIVE:各欄自帶 ScrollArea(組合 canonical)→ silent
run_hook "$PROD_TSX" 'export const D = () => <DialogBody><div className="flex"><ScrollArea>main</ScrollArea><aside className="border-l"><ScrollArea>meta</ScrollArea></aside></div></DialogBody>'
expect_silent "47. C19 各欄自帶 ScrollArea → silent"

# 48. NEGATIVE:escape → silent
run_hook "$PROD_TSX" 'export const D = () => <DialogBody><div className="flex border-l">x</div></DialogBody> // @two-pane-dialog-ok: 非兩欄,版面裝飾線'
expect_silent "48. C19 @two-pane-dialog-ok escape → silent"

# ── C7 SelectMenu 直用 + C13 手刻 section header(2026-07-10 收官)──
# 49. C7 POSITIVE:<SelectMenu> 直用 → BLOCK
run_hook "$PROD_TSX" 'export const M = () => <SelectMenu options={opts} onSelect={pick} />'
expect_block "49. C7 <SelectMenu> 直用 → BLOCK"

# 50. C7 NEGATIVE:<Select>(正道)→ silent
run_hook "$PROD_TSX" 'export const M = () => <Select options={opts} onChange={pick} />'
expect_silent "50. C7 <Select> 正道 → silent"

# 51. C13 POSITIVE:手刻可收合標題列(Chevron + justify-between + button)→ BLOCK
run_hook "$PROD_TSX" 'export const H = () => <button onClick={toggle} className="flex w-full items-center justify-between"><span>Description</span><ChevronDown className="size-4" /></button>'
expect_block "51. C13 手刻可收合標題列 → BLOCK"

# 52. C13 NEGATIVE:共用 SectionHeader 元件(正道)→ silent
run_hook "$PROD_TSX" 'export const H = () => <SectionHeader title="Description" collapsed={c} onToggle={toggle} />'
expect_silent "52. C13 共用 SectionHeader → silent"

# 53. C13 NEGATIVE:escape(非 section 標題語義)→ silent
run_hook "$PROD_TSX" 'export const P = () => <button onClick={next} className="flex justify-between">next<ChevronRight /></button> // @section-header-ok: 分頁導航非 section 標題'
expect_silent "53. C13 @section-header-ok escape → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

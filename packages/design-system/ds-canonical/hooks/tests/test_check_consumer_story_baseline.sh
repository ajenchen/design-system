#!/bin/bash
# 2026-06-11 payload 正交化:bare `open` 不匹配 R3 P6 regex(open={true})、Sheet 無 defaultOpen 觸 R3 — 合併檔跑全規則,payload 須對非受測規則 clean
# 2026-06-11 repoint:check_consumer_story_baseline.sh 已合併進 check_consumer_app_invariants.sh(prune merge;測試 payload 不變 = 行為等價驗證)
# Tests for check_consumer_app_invariants.sh(P0 BLOCKER,M31 codex synthesis 2026-05-27)
#
# Hook 規則(PreToolUse,Edit|Write|MultiEdit):
#   - tool_name not in {Edit,Write,MultiEdit} → silent exit 0
#   - file_path 必 match /(apps|consumer)/.*\.stories\.tsx$ 且 NOT packages/design-system/src/ → 否則 silent
#   - content = tool_input.new_string // tool_input.content;空 → silent
#   - escape:content 含 @story-baseline-allow: 或 @consumer-catalog-allow: → silent
#   - 偵測高風險 primitive 用法 regex `<DS\.(DataTable|Dialog|Sheet|Popover|DropdownMenu|
#     Tooltip|HoverCard|LinkInput|RadioGroup|CircularProgress|AppShell|Sidebar)\b`
#   - 若用了高風險 primitive 但無 `@story-baseline:[[:space:]]*\S` marker → BLOCK exit 2 + stderr
#   - 否則 silent exit 0
#
# Broad-vs-narrow(M34)symmetry coverage:
#   - over-narrow guard:真實 violation(<DS.Dialog 無 marker)必 BLOCK
#   - over-broad guard:near-miss(bare <Dialog / 註解提到 Dialog / <DS.SidebarItem)必 silent

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

# Override CLAUDE_PROJECT_DIR so any _log-fire.sh state lands in TMP_DIR
# (避免污染 repo .claude/logs/)
export CLAUDE_PROJECT_DIR="$TMP_DIR"
mkdir -p "$TMP_DIR/.claude/logs"

# run_hook <tool_name> <file_path> <content>
# content 走 tool_input.content(Write 形 shape);hook 讀 new_string // content 皆可。
run_hook() {
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

# run_hook_edit <file_path> <new_string>
# 走 tool_input.new_string(Edit 形 shape)驗 new_string 路徑也讀得到。
run_hook_edit() {
  local file_path="$1"; local new_string="$2"
  local payload
  payload=$(jq -n \
    --arg fp "$file_path" --arg ns "$new_string" \
    '{hook_event_name:"PreToolUse", tool_name:"Edit", tool_input:{file_path:$fp, new_string:$ns}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
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

echo "=== check_consumer_story_baseline tests ==="

CONSUMER_STORY="/repo/apps/template/src/Foo.stories.tsx"

# ── POSITIVE cases(SHOULD BLOCK exit 2)──────────────────────────────

# P1. apps/** stories wrap <DS.Dialog> 無 marker → BLOCK
#     (over-narrow guard:真實 violation 必被抓)
CONTENT_VIOLATION='import * as DS from "@qijenchen/design-system";
export const Basic = () => (
  <DS.Dialog open>
    <DS.Dialog.Content>hi</DS.Dialog.Content>
  </DS.Dialog>
);'
run_hook "Write" "$CONSUMER_STORY" "$CONTENT_VIOLATION"
expect_block "P1. <DS.Dialog> 無 marker → BLOCK" "CONSUMER-STORY-BASELINE BLOCKER"

# P2. consumer/** path variant + <DS.DataTable> 無 marker → BLOCK
CONTENT_DT='import * as DS from "@qijenchen/design-system";
export const Grid = () => <DS.DataTable data={rows} columns={cols} />;'
run_hook "Edit" "/repo/consumer/dashboard/Table.stories.tsx" "$CONTENT_DT"
# note: Edit shape via run_hook uses content field — hook reads new_string // content,content works.
expect_block "P2. consumer/** <DS.DataTable> 無 marker → BLOCK" "CONSUMER-STORY-BASELINE BLOCKER"

# P3. new_string path(Edit shape)+ <DS.Sidebar> 無 marker → BLOCK
NS_SIDEBAR='import * as DS from "@qijenchen/design-system";
export const Nav = () => <DS.Sidebar collapsible="icon" />;'
run_hook_edit "$CONSUMER_STORY" "$NS_SIDEBAR"
expect_block "P3. new_string path <DS.Sidebar> 無 marker → BLOCK" "CONSUMER-STORY-BASELINE BLOCKER"

# P4. empty @story-baseline: marker(no value after colon)→ 仍 BLOCK
#     (over-narrow guard on marker side:marker 必須有 non-whitespace value)
CONTENT_EMPTY_MARKER='// @story-baseline:
import * as DS from "@qijenchen/design-system";
export const Basic = () => <DS.Popover />;'
run_hook "Write" "$CONSUMER_STORY" "$CONTENT_EMPTY_MARKER"
expect_block "P4. empty @story-baseline: value → still BLOCK" "CONSUMER-STORY-BASELINE BLOCKER"

# ── NEGATIVE cases(SHOULD NOT trigger,silent exit 0)─────────────────

# N1. 高風險 primitive + 有效 @story-baseline: marker → silent
CONTENT_OK='// @story-baseline: @qijenchen/design-system/components/Dialog/dialog.stories.tsx#Basic
import * as DS from "@qijenchen/design-system";
export const Basic = () => <DS.Dialog defaultOpen><DS.Dialog.Content>hi</DS.Dialog.Content></DS.Dialog>;'
run_hook "Write" "$CONSUMER_STORY" "$CONTENT_OK"
expect_pass_silent "N1. <DS.Dialog> + valid marker → silent"

# N2. escape clause @story-baseline-allow: → silent(即使無 marker)
CONTENT_ALLOW='// @story-baseline-allow: pure behavior test, no visual baseline needed
import * as DS from "@qijenchen/design-system";
export const KeyboardOnly = () => <DS.Sheet defaultOpen />;'
run_hook "Write" "$CONSUMER_STORY" "$CONTENT_ALLOW"
expect_pass_silent "N2. @story-baseline-allow: escape → silent"

# N3. non-stories consumer file(App.tsx)→ out of scope → silent
run_hook "Write" "/repo/apps/template/src/App.tsx" "$CONTENT_VIOLATION"
expect_pass_silent "N3. non-stories file (App.tsx) → out of scope silent"

# N4. DS internal stories(packages/design-system/src/)→ excluded → silent
run_hook "Write" "/repo/packages/design-system/src/components/Dialog/dialog.stories.tsx" "$CONTENT_VIOLATION"
expect_pass_silent "N4. DS internal stories → excluded silent"

# N5. non-Edit/Write/MultiEdit tool(Read)→ silent
run_hook "Read" "$CONSUMER_STORY" "$CONTENT_VIOLATION"
expect_pass_silent "N5. tool=Read → silent"

# N6. over-broad guard A:bare <Dialog>(no DS. namespace prefix)→ silent
#     consumer 用自己的 local Dialog,不是高風險 DS primitive → 不該 fire
CONTENT_BARE='import { Dialog } from "./local-dialog";
export const Basic = () => <Dialog open>hi</Dialog>;'
run_hook "Write" "$CONSUMER_STORY" "$CONTENT_BARE"
expect_pass_silent "N6. bare <Dialog> (no DS. prefix) → silent (over-broad guard)"

# N7. over-broad guard B:comment / prose mentioning "Dialog DataTable Sheet" but no JSX usage → silent
CONTENT_PROSE='// This story demonstrates a layout. We avoid Dialog and DataTable here.
import * as DS from "@qijenchen/design-system";
export const Layout = () => <DS.Stack gap="md"><DS.Button>ok</DS.Button></DS.Stack>;'
run_hook "Write" "$CONSUMER_STORY" "$CONTENT_PROSE"
expect_pass_silent "N7. prose mentions primitives but no <DS.X> usage → silent (over-broad guard)"

# N8. over-broad guard C:near-miss token <DS.SidebarItem>(longer ident, Sidebar\b 不該 match)→ silent
#     Sidebar\b 要求 word boundary;SidebarItem 的 'r'→'I' 非邊界 → 不 match,正確不 fire
CONTENT_NEARMISS='import * as DS from "@qijenchen/design-system";
export const Nav = () => <DS.SidebarItem label="Home" />;'
run_hook "Write" "$CONSUMER_STORY" "$CONTENT_NEARMISS"
expect_pass_silent "N8. <DS.SidebarItem> (not Sidebar\\b) → silent (over-broad guard)"

# N9. empty content → silent
run_hook "Write" "$CONSUMER_STORY" ""
expect_pass_silent "N9. empty content → silent"

# N10. consumer stories with only non-high-risk DS primitives → silent
CONTENT_LOWRISK='import * as DS from "@qijenchen/design-system";
export const Form = () => (<DS.Field><DS.Input /><DS.Button>Save</DS.Button></DS.Field>);'
run_hook "Write" "$CONSUMER_STORY" "$CONTENT_LOWRISK"
expect_pass_silent "N10. only low-risk DS primitives → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

#!/bin/bash
# Tests for check_overlay_open_focus_escape_probe.sh(P0 BLOCKER,codex M31 finding 2026-05-27)
#
# Hook 規則(PreToolUse,Edit|Write|MultiEdit,只在 *.stories.tsx):
#   - Reads content from tool_input.new_string // tool_input.content。
#   - 只在 file_path 匹配 \.stories\.tsx$ 才作用,否則 exit 0 silent。
#   - File-level escapes(任一命中 → silent):
#       `@overlay-open-skip:` OR `@story-trait-allow:.*missing-opensnapshot`
#   - 偵測 overlay primitive trigger usage:
#       <(DS\.)?(Tooltip|Popover|Dialog|Sheet|DropdownMenu|HoverCard)Trigger\b
#   - 若用了 overlay trigger 但無 open-state mechanism →
#       BLOCK exit 2 + stderr「OVERLAY-OPEN-PROBE BLOCKER」。
#     open-state mechanism = defaultOpen | open={true|isOpen|isVisible}
#                            | play: async | play(...click
#
# M34 broad-vs-narrow symmetry:
#   - near-miss(over-broad guard):<DialogTriggerWrapper> 不該 fire(\b 阻擋)
#   - real violation(over-narrow guard):<DialogTrigger> 無 open → 必 fire

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_overlay_open_focus_escape_probe.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# Override GOVERNANCE_PROJECT_DIR so any _log-fire.sh state lands in TMP_DIR
# (避免污染 repo .claude/logs/)
export GOVERNANCE_PROJECT_DIR="$TMP_DIR"
mkdir -p "$TMP_DIR/.claude/logs"

# run-hook helper: pipes JSON into the hook via stdin.
#   $1 tool_name, $2 file_path, $3 content (mapped to new_string)
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

# Variant that puts content under tool_input.content (Write convention) to
# exercise the `.tool_input.new_string // .tool_input.content` fallback.
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

STORY="apps/template/src/components/Demo.stories.tsx"
BLOCK_NEEDLE="OVERLAY-OPEN-PROBE BLOCKER"

echo "=== check_overlay_open_focus_escape_probe tests ==="

# ---------------------------------------------------------------------------
# POSITIVE cases — SHOULD trigger BLOCKER (exit 2)
# ---------------------------------------------------------------------------

# P1. Dialog trigger, no open mechanism → BLOCK (over-narrow guard: real violation)
run_hook "Edit" "$STORY" \
  'export const Basic = () => (<Dialog><DialogTrigger>Open</DialogTrigger><DialogContent>Hi</DialogContent></Dialog>)'
expect_block "P1. DialogTrigger no open → BLOCK" "$BLOCK_NEEDLE"

# P2. Namespaced DS.PopoverTrigger, no open mechanism → BLOCK
run_hook "Write" "$STORY" \
  'export const Pop = () => (<DS.Popover><DS.PopoverTrigger>x</DS.PopoverTrigger><DS.PopoverContent>c</DS.PopoverContent></DS.Popover>)'
expect_block "P2. DS.PopoverTrigger no open → BLOCK" "$BLOCK_NEEDLE"

# P3. Tooltip trigger with open={false} (NOT a real open state) → BLOCK
#     guards that regex anchors on true/isOpen/isVisible, not any open= prop
run_hook "Edit" "$STORY" \
  'export const T = () => (<Tooltip open={false}><TooltipTrigger>?</TooltipTrigger><TooltipContent>tip</TooltipContent></Tooltip>)'
expect_block "P3. TooltipTrigger open={false} (not real open) → BLOCK" "$BLOCK_NEEDLE"

# P4. content field (Write convention) instead of new_string → still BLOCK (field fallback)
run_hook_content_field "Write" "$STORY" \
  'export const S = () => (<Sheet><SheetTrigger>menu</SheetTrigger><SheetContent>side</SheetContent></Sheet>)'
expect_block "P4. SheetTrigger via tool_input.content fallback → BLOCK" "$BLOCK_NEEDLE"

# ---------------------------------------------------------------------------
# NEGATIVE cases — should NOT trigger (silent exit 0)
# ---------------------------------------------------------------------------

# N1. DialogTrigger WITH defaultOpen → silent
run_hook "Edit" "$STORY" \
  'export const Open = () => (<Dialog defaultOpen><DialogTrigger>x</DialogTrigger><DialogContent>c</DialogContent></Dialog>)'
expect_pass_silent "N1. DialogTrigger + defaultOpen → silent"

# N2. PopoverTrigger WITH open={true} controlled → silent
run_hook "Edit" "$STORY" \
  'export const Ctl = () => (<Popover open={true}><PopoverTrigger>x</PopoverTrigger><PopoverContent>c</PopoverContent></Popover>)'
expect_pass_silent "N2. PopoverTrigger + open={true} → silent"

# N3. DropdownMenuTrigger WITH play() click interaction → silent
run_hook "Edit" "$STORY" \
  'export const Play = {render: () => (<DropdownMenu><DropdownMenuTrigger>m</DropdownMenuTrigger></DropdownMenu>), play: async ({canvasElement}) => { await userEvent.click(trigger); }}'
expect_pass_silent "N3. DropdownMenuTrigger + play: async → silent"

# N4. HoverCardTrigger no open BUT file-level @overlay-open-skip escape → silent
run_hook "Edit" "$STORY" \
  '// @overlay-open-skip: behavior-only test, no visual snapshot needed
export const HC = () => (<HoverCard><HoverCardTrigger>@u</HoverCardTrigger><HoverCardContent>card</HoverCardContent></HoverCard>)'
expect_pass_silent "N4. HoverCardTrigger + @overlay-open-skip escape → silent"

# N5. HoverCardTrigger no open BUT @story-trait-allow missing-opensnapshot escape → silent
run_hook "Edit" "$STORY" \
  '// @story-trait-allow: missing-opensnapshot (HoverCard codex exception)
export const HC2 = () => (<HoverCard><HoverCardTrigger>@u</HoverCardTrigger></HoverCard>)'
expect_pass_silent "N5. HoverCardTrigger + @story-trait-allow missing-opensnapshot → silent"

# N6. No overlay primitive at all (plain Button story) → silent
run_hook "Edit" "$STORY" \
  'export const Btn = () => (<Button variant="primary">Save</Button>)'
expect_pass_silent "N6. plain Button story (no overlay) → silent"

# N7. Non-stories file (component .tsx) using a trigger → silent (scope excluded)
run_hook "Edit" "apps/template/src/components/Demo.tsx" \
  'export const D = () => (<Dialog><DialogTrigger>x</DialogTrigger></Dialog>)'
expect_pass_silent "N7. non-stories .tsx file → silent (scope excluded)"

# N8. Non-Edit/Write/MultiEdit tool (Read) → silent
run_hook "Read" "$STORY" \
  'export const D = () => (<Dialog><DialogTrigger>x</DialogTrigger></Dialog>)'
expect_pass_silent "N8. tool=Read → silent (event excluded)"

# N9. OVER-BROAD GUARD (near-miss): <DialogTriggerWrapper> is a DIFFERENT identifier.
#     \b after 'Trigger' must NOT match because 'W' is a word char → no false fire.
run_hook "Edit" "$STORY" \
  'export const W = () => (<DialogTriggerWrapper>custom non-DS wrapper, not a real overlay trigger</DialogTriggerWrapper>)'
expect_pass_silent "N9. near-miss <DialogTriggerWrapper> → silent (over-broad guard)"

# N10. Empty content payload → silent (hook guards [ -z CONTENT ])
run_hook "Edit" "$STORY" ''
expect_pass_silent "N10. empty content → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

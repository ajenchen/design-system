#!/bin/bash
# check_overlay_open_focus_escape_probe.sh — P0 BLOCKER
#
# Codex M31 P0 finding 2026-05-27:Overlay canonical rules require open visual
# states, but active hooks check overlay handcraft/static code only;沒 runtime
# probe Tooltip/Popover/Dialog/Sheet/DropdownMenu/HoverCard 真 open / focus / Esc.
#
# Triggers on consumer apps/**/*.stories.tsx edit. For each story using overlay
# primitive, verify story contains:
#   - `defaultOpen` prop OR
#   - controlled `open={...}` / bare `open` boolean attr(2026-07-16 dim 74 加廣)OR
#   - `play()` interaction function clicking trigger OR
#   - `// @overlay-open-skip: <rationale>` per-story escape
# Otherwise story is「trigger-only」= visual snapshot 看不到 overlay content (per
# Empty-content rendered in sweep,user 2026-05-27 抓「overlay 沒彈出」7-bug 錨點).
#
# Scope: consumer storybook + DS canonical anatomy/principles stories.

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: hook integrity helper unavailable\n' >&2
  exit 70
}

set -uo pipefail

governance_hook_load_input
governance_hook_require_commands grep sed sort
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'overlay-open tool extraction failed'

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'overlay-open path extraction failed'
if ! governance_hook_grep_q 'overlay-open scope matcher failed' "$FILE" -qE '\.stories\.tsx$'; then exit 0; fi

CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'overlay-open content extraction failed'
[ -z "$CONTENT" ] && exit 0

# File-level escape
if governance_hook_grep_q 'overlay-open skip matcher failed' "$CONTENT" -q '@overlay-open-skip:'; then exit 0; fi
# HoverCard documented exception (per codex 2026-05-27)
if governance_hook_grep_q 'overlay-open trait escape matcher failed' "$CONTENT" -q '@story-trait-allow:.*missing-opensnapshot'; then exit 0; fi

# Detect overlay primitive usage
OVERLAY_PRIMITIVES='Tooltip|Popover|Dialog|Sheet|DropdownMenu|HoverCard'
governance_hook_grep_capture USED_UNSORTED 'overlay-open primitive matcher failed' \
  "$CONTENT" -oE "<(DS\.)?($OVERLAY_PRIMITIVES)Trigger\b"
USED=$(sort -u <<< "$USED_UNSORTED" 2>/dev/null) \
  || governance_hook_integrity_fail 'overlay-open primitive sorter failed'

if [ -z "$USED" ]; then exit 0; fi

# Detect open-state mechanism
# 2026-07-16 dim 74 regex 加廣:原只認 open={true|isOpen|isVisible} 3 個字面名 —
# 漏 controlled `open={<任意變數/expression>}`(如 open={open} / open={!collapsed})與
# bare `open` boolean attr(JSX `<Popover open>` = true)→ 合法 controlled story 被誤殺。
#   - bare attr 兩形態:tag 內 `<Sheet open>` / `<Popover open onX>`(`<Tag[^<>]* open` 限同 tag,
#     `[^<>]*` 不可跨 `>` → JSX 內文 / 註解 prose 的「open / close」不誤中)+ 多行 prop 排版
#     「整行只有 open」(`^\s*open\s*$`)。存量驗證:Coachmark principles(行只有 open)pass、
#     dropdown-menu.anatomy prose「浮層 open / close」不誤 pass。
#   - defaultOpen 原本就有,保留
# 2026-07-18 修 bde8973c 過廣 bug:原 `open=\{[!a-zA-Z_]` 把 false/null/undefined 的首字 f/n/u
#   誤中 → `open={false}`(假 open,控制成關閉)被當成「有 open 機制」→ 漏擋 trigger-only story
#   (test P3 失敗 → ci.yml Hook test suite 紅 → 下游 gate 全跳過)。修:controlled open={<expr>}
#   單獨抽出偵測,排除三個「關閉字面值」open={false|null|undefined}(空白容忍);identifier/negation
#   /true 仍認(如 open={showMenu} / open={!collapsed} / open={true})。
HAS_OPEN=""
if governance_hook_grep_q 'overlay-open mechanism matcher failed' "$CONTENT" -qE \
  'defaultOpen|<[A-Za-z][^<>]*[[:space:]]open([[:space:]>]|$)|^[[:space:]]*open[[:space:]]*$|play:\s*async|play\(.*click'; then
  HAS_OPEN="found"
fi
# controlled open={<expr>}:認任意 identifier / negation / true,但排除關閉字面值 false|null|undefined
if [ -z "$HAS_OPEN" ]; then
  governance_hook_grep_capture CONTROLLED_CANDIDATES 'overlay-open controlled-state matcher failed' \
    "$CONTENT" -oE 'open=\{[^}]*\}'
  governance_hook_grep_capture CONTROLLED_OPEN 'overlay-open closed-state filter failed' \
    "$CONTROLLED_CANDIDATES" -vE '^open=\{[[:space:]]*(false|null|undefined)[[:space:]]*\}$'
  if [ -n "$CONTROLLED_OPEN" ]; then
    HAS_OPEN="found"
  fi
fi

if [ -z "$HAS_OPEN" ]; then
  cat >&2 << EOF
🚨 OVERLAY-OPEN-PROBE BLOCKER(P0,codex M31 finding 2026-05-27 + user 7-bug 錨點)

  Story $FILE uses overlay primitive trigger but no open-state mechanism:
$(echo "$USED" | sed 's/^/    /')

  Without defaultOpen / open={true} / play() click, visual snapshot 永遠 看不到
  overlay content。User 2026-05-27 verbatim「圖四,首先會彈出 overlay 的,感覺都沒
  正常彈出」.

  修法 2 選 1:
    (a) 加 \`defaultOpen\` prop OR controlled \`open={true}\` OR Storybook \`play\` interaction
        click trigger before screenshot
    (b) Escape per-file:\`// @overlay-open-skip: <rationale>\`(eg. behavior-only
        test) OR \`// @story-trait-allow: missing-opensnapshot\`(per codex
        canonical exception list)
EOF
  exit 2
fi

exit 0

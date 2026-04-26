#!/bin/bash
# PostToolUse hook: when editing a *.anatomy.stories.tsx file, verify section
# numbering matches canonical slot rules (updated 2026-04-22 to align with
# anatomy-standard.md's「保留 canonical 編號」rule).
#
# Canonical slots:
#   1 = Overview      (reserved)
#   2 = Inspector     (reserved)
#   3 = ColorMatrix   (reserved)
#   4 = SizeMatrix    (reserved)
#   5 = StateBehavior (reserved)
#   6+ = custom sections (contiguous from 6 onwards)
#
# **N/A slots keep their reserved number unused** (e.g. Calendar has no
# SizeMatrix → file has 1,2,3,5 with a gap at 4). This is correct per canonical;
# the previous hook version enforced strict contiguous 1..N which contradicted
# canonical — reconciled 2026-04-22.
#
# Rules:
#   - Slots in 1..5 MUST be one of the canonical set (1=Overview/2=Inspector/...)
#     but may have gaps for N/A sections
#   - Slots 6+ MUST be contiguous starting from 6 (no gaps in custom section tail)
#   - No duplicate numbers anywhere
#
# Trigger: PostToolUse on Edit/Write/MultiEdit where file_path ends in
# `.anatomy.stories.tsx`.

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

FILE_PATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-}"

case "$FILE_PATH" in
  *.anatomy.stories.tsx) ;;
  *) exit 0 ;;
esac

[ -f "$FILE_PATH" ] || exit 0

NUMS=$(grep -oE "name:[[:space:]]*'[0-9]+\." "$FILE_PATH" 2>/dev/null | grep -oE "[0-9]+" | tr '\n' ' ')

if [ -z "${NUMS// }" ]; then
  exit 0
fi

BROKEN=0
BROKEN_DETAIL=""
SEEN=""

# Sort numbers to check set properties (Storybook sidebar sorts by name prefix,
# so file export order doesn't matter for UX)
SORTED=$(echo "$NUMS" | tr ' ' '\n' | sort -n | tr '\n' ' ')

# Check 1: no duplicates
for N in $NUMS; do
  case " $SEEN " in
    *" $N "*)
      BROKEN=1
      BROKEN_DETAIL="${BROKEN_DETAIL}\n  • Duplicate slot number: ${N}"
      ;;
  esac
  SEEN="$SEEN $N"
done

# Check 2: custom sections 6+ must form contiguous block starting from 6
PREV=5
for N in $SORTED; do
  if [ "$N" -ge 6 ]; then
    EXPECTED=$((PREV + 1))
    if [ "$N" -ne "$EXPECTED" ]; then
      BROKEN=1
      BROKEN_DETAIL="${BROKEN_DETAIL}\n  • Custom section gap: expected ${EXPECTED}, got ${N}(6+ 必連續,不可跳號)"
    fi
    PREV="$N"
  fi
done

# Check 3: canonical slot range validation
for N in $NUMS; do
  if [ "$N" -lt 1 ]; then
    BROKEN=1
    BROKEN_DETAIL="${BROKEN_DETAIL}\n  • Invalid slot: ${N}(must be ≥ 1)"
  fi
done

if [ "$BROKEN" = "1" ]; then
  cat <<EOF
⚠️  Anatomy story numbering drift — $FILE_PATH

Got sequence: $NUMS

Issues:$(printf "%b" "$BROKEN_DETAIL")

Canonical slots(anatomy-standard.md「保留 canonical 編號」):
  1 = Overview     2 = Inspector     3 = ColorMatrix
  4 = SizeMatrix   5 = StateBehavior
  6+ = custom sections(contiguous from 6)

N/A canonical slot 保留編號不 renumber(e.g. 無 SizeMatrix → 1,2,3,5 正確)。
自訂 section 必從 6 開始連續(不可混入 1-5 slot 號)。
EOF
fi

exit 0

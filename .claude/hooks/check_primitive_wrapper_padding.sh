#!/bin/bash
# PreToolUse hook: 阻止在 SSOT primitive 外加 padding wrapper(M1 SSOT 消費紀律)。
#
# Motivation(2026-05-02 訂):
#   DateTimePicker 開發過程中,我加了 `<div className="p-2"><DateGrid /></div>` wrapper,
#   但 DateGrid 自己 root 已內建 `p-3`,造成 popover edge 到第一個 day cell = 8 + 12 = 20px
#   的雙重 padding。違反 mindset #2「優先消費既有 SSOT」+ M1「視覺決策前必消費 SSOT」。
#
#   markdown rule 不夠 — 需 mechanical hook 攔截 anti-pattern。
#
# 偵測 anti-pattern:
#   <div className="...p-X..."> + child = SSOT primitive(DateGrid / Calendar / Surface)
#
# SSOT primitive 清單(自帶 outer padding,consumer 不得另加 padding wrapper):
#   - DateGrid     — root p-3
#   - Calendar     — root p-3(react-day-picker / 同 DateGrid)
#   - Surface      — header / body / footer 各自 p-X(overlay-surface)
#   - SurfaceHeader / SurfaceBody / SurfaceFooter
#
# 允許情境(若有正當理由):
#   //  @primitive-padding-allow: <reason>(整檔豁免,需 spec rationale)
#
# Exit codes:
#   exit 2 — 阻止(P0 block,canonical 違反)
#   exit 0 — pass

# Per-hook fire logging
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

case "$FILE_PATH" in
  *.tsx) ;;
  *) exit 0 ;;
esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")

if [ -z "${NEW_CONTENT//[[:space:]]/}" ]; then
  exit 0
fi

# File-level allowlist
FIRST_LINES=$(printf '%s\n' "$NEW_CONTENT" | sed -n '1,5p')
if echo "$FIRST_LINES" | grep -qE '//[[:space:]]*@primitive-padding-allow:'; then
  exit 0
fi
if [ -f "$FILE_PATH" ]; then
  ON_DISK_FIRST=$(sed -n '1,5p' "$FILE_PATH" 2>/dev/null || true)
  if echo "$ON_DISK_FIRST" | grep -qE '//[[:space:]]*@primitive-padding-allow:'; then
    exit 0
  fi
fi

# Anti-pattern detection: 用 perl `-0` slurp + multi-line regex 比 awk alternation 簡單可靠
# Pattern:`<div className=...p-[1-9]...>` 接著 N 行內出現 `<{Primitive}`(N=10 hop)
PRIMITIVES_REGEX='DateGrid|Calendar|Surface|SurfaceHeader|SurfaceBody|SurfaceFooter'

VIOLATIONS=$(printf '%s' "$NEW_CONTENT" | perl -0777 -ne '
  while (/<div\b[^>]*className\s*=\s*["\x27`][^"\x27`]*\bp-\d+[^"\x27`]*["\x27`][^>]*>(?:[^<]*<(?!\/div\b)){0,8}\s*<('"$PRIMITIVES_REGEX"')\b/gs) {
    my $primitive = $1;
    my $offset = $-[0];
    my $before = substr($_, 0, $offset);
    my $line = ($before =~ tr/\n//) + 1;
    print "line $line: <div className=\"...p-X...\"> wrapping <$primitive>\n";
  }
')

if [ -n "$VIOLATIONS" ]; then
  cat >&2 <<EOF

┄┄┄┄ check_primitive_wrapper_padding — SSOT primitive 不可外加 padding wrapper ┄┄┄┄

[P0 BLOCK] ${FILE_PATH}
${VIOLATIONS}

SSOT primitive 自帶 outer padding,**consumer 不得另加 padding wrapper**:
  - DateGrid / Calendar:root 自帶 p-3
  - Surface / SurfaceHeader / SurfaceBody / SurfaceFooter:各 segment 自帶 padding

修法:直接放 primitive 在 popover/parent 內,不另包 padding div。
  ❌ <div className="p-2"><DateGrid ... /></div>
  ✅ <DateGrid ... />

如果真的需要(極少數場景),在檔案前 5 行加:
  // @primitive-padding-allow: <理由>

詳 \`patterns/element-anatomy/inline-action.spec.md\` mindset #2 + M1 SSOT 消費。
EOF
  exit 2
fi

exit 0

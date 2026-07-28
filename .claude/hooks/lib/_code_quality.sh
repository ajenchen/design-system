#!/bin/bash
# PostToolUse hook: lightweight code quality check on tsx/ts edit.
# Only runs the 2 fastest checks:
#   1. `any` usage without `// any-allow:` escape hatch
#   2. tsx file-size P0 (> 800 transition cap)
#
# Full audit (dead export / circular / long function) — use `/code-quality-audit` skill.

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

FILE_PATH=$(jq -r '.tool_input.file_path // empty')

# Scope: only src/ .tsx / .ts files (not stories, not specs)
if ! grep -qE 'src/.*\.tsx?$' <<<"$FILE_PATH"; then
  exit 0
fi
if grep -qE '\.(stories|anatomy\.stories|principles\.stories)\.tsx$' <<<"$FILE_PATH"; then
  exit 0
fi
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

VIOLATIONS=""

# ── Check 1: `any` usage ────────────────────────────────────────────────────
# Flag `: any` / `as any` / `<any>` / `any[]` / `Record<X, any>`
# Skip lines with `any-allow` OR previous line with `any-allow`.
ANY_HITS=$(perl -ne '
  BEGIN { our $prev_allow = 0; our $hit_count = 0; }
  my $has_allow = /any-allow/;
  my $line = $_;
  if (!$prev_allow && !$has_allow) {
    next if m{^\s*//};
    next if m{^\s*\*};
    next if m{/\* ?@ts-};
    # Patterns
    if (/:\s*any\b/ || /\bas\s+any\b/ || /<any>/ || /\bany\[\]/ || /Record<[^,]+,\s*any>/) {
      # String literal FPs
      unless (/[\x27"](any|many)[\x27"]/i) {
        print "$.:$line";
        $hit_count++;
        exit 0 if $hit_count >= 5;
      }
    }
  }
  $prev_allow = $has_allow;
' "$FILE_PATH" 2>/dev/null)

if [ -n "$ANY_HITS" ]; then
  VIOLATIONS="${VIOLATIONS}\n⚠️ TypeScript \`any\` usage(無 \`// any-allow: {rationale}\`):\n${ANY_HITS}\n  修法:改 proper type;真沒辦法(e.g. 3rd-party 類型外部化)→ 在同行或上一行加 \`// any-allow: {具體 rationale}\`"
fi

# ── Check 2: tsx file size ──────────────────────────────────────────────────
if grep -qE '\.tsx$' <<<"$FILE_PATH"; then
  LINES=$(wc -l < "$FILE_PATH" | tr -d ' ')
  # Exemption marker in top 20 lines: `// code-quality-allow: file-size {rationale}`
  EXEMPT=$(head -20 "$FILE_PATH" | grep -cE 'code-quality-allow:\s*file-size' || true)
  if [ "$LINES" -gt 800 ] && [ "$EXEMPT" -eq 0 ]; then
    VIOLATIONS="${VIOLATIONS}\n⚠️ tsx file-size P0:${LINES} 行 > 800 transition cap(budget 500)。架構性拆分考慮:分 sub-component tsx(e.g. sidebar.tsx → sidebar.tsx + sidebar-menu.tsx + sidebar-group.tsx)。若係 foundational composite(Sidebar/TreeView 等),tsx 頂部加 \`// code-quality-allow: file-size {rationale}\` 明文豁免。"
  fi
fi

# ── Emit warning ─────────────────────────────────────────────────────────
if [ -n "$VIOLATIONS" ]; then
  CTX=$(printf 'Code quality lite check(full audit via /code-quality-audit):%b' "$VIOLATIONS")
  jq -n --arg ctx "$CTX" '{governanceContext:{hookEventName:"PostToolUse",message:$ctx}}'
fi

exit 0

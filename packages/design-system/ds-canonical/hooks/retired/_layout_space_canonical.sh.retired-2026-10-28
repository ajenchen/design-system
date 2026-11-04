#!/bin/bash
# PostToolUse hook: detect layoutSpace canonical violations in stories / showcase tsx.
#
# Catches typical block-vs-inline gap mistakes per layoutSpace.spec.md:
# 1. Hardcoded mt-N / mb-N / pt-N / pb-N (4/6/8) instead of tokens — should use --layout-space-*
# 2. gap-tight on a flex column form with all-inline elements (should be loose per rule 3)
# 3. block element (DataTable / Textarea / Editor) followed by mt-tight on next sibling
#    (block → 容器底 / chrome band 應該 loose,規則 4)
#
# Scope: design-system stories.tsx + app/ + explorations/ (consumer-side layout).
# WARN-style (not BLOCK): emit additionalContext so AI reads and can fix.

# Per-hook fire logging
source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire

FILE_PATH=$(jq -r '.tool_input.file_path // empty')

# Scope: only stories.tsx + app code (not core component .tsx — they own their own internal padding)
if ! grep -qE '(\.stories\.tsx$|src/app/.*\.tsx$|src/explorations/.*\.tsx$)' <<<"$FILE_PATH"; then
  exit 0
fi
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

VIOLATIONS=""

# ── Check 1: hardcoded mt-N / mb-N adjacent to <DataTable / Textarea / Editor> ──
# Block elements need loose bottom/top gap; tight is rule violation.
# Pattern: <DataTable...>...</...> followed by <Alert / BulkActionBar / div with mt-tight>
BLOCK_TIGHT_HITS=$(grep -m 5 -nE "(mt|mb)-\[var\(--layout-space-tight\)\]" "$FILE_PATH" 2>/dev/null)
if [ -n "$BLOCK_TIGHT_HITS" ]; then
  # Only flag if file ALSO contains block elements (DataTable / Textarea / Editor / CodeBlock)
  if grep -qE '<(DataTable|Textarea|Editor|CodeBlock)' "$FILE_PATH" 2>/dev/null; then
    VIOLATIONS="${VIOLATIONS}\n⚠️ tight margin near block element(可能違反規則 4:block → 容器底 / chrome band = loose):\n${BLOCK_TIGHT_HITS}\n  → 確認該位置:block 旁邊應 loose;只有 block ↔ block 緊鄰且都在 form 內才用 tight。"
  fi
fi

# ── Check 3: gap-tight on flex column form with all-inline (likely violation)──
# 規則 3:inline ↔ inline = loose,不是 tight
GAP_TIGHT_FLEX=$(grep -m 3 -nE 'flex-col\s+gap-\[var\(--layout-space-tight\)\]' "$FILE_PATH" 2>/dev/null)
if [ -n "$GAP_TIGHT_FLEX" ]; then
  VIOLATIONS="${VIOLATIONS}\n⚠️ flex-col gap-tight(若內容全是 inline 元件就違反規則 3:inline ↔ inline 應 loose):\n${GAP_TIGHT_FLEX}\n  → 確認 form 內含 block(Table/Textarea/Editor)?有 → 保留 tight 合規;全 inline → 改 loose。"
fi

if [ -n "$VIOLATIONS" ]; then
  ADDITIONAL_CONTEXT=$(printf '⚠️ layoutSpace canonical 提醒(tokens/layoutSpace/layoutSpace.spec.md):%b' "$VIOLATIONS")
  jq -n --arg ctx "$ADDITIONAL_CONTEXT" '{
    governanceContext: {
      hookEventName: "PostToolUse",
      message: $ctx
    }
  }'
fi

exit 0

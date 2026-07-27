#!/bin/bash
# PostToolUse hook: catch sparse PersonData literals that violate name-card.spec「DS-wide 預設展示一致 canonical」.
#
# Per name-card.spec.md:
#   所有 PersonData 來源(table seller / picker member / dialog reviewer)展示 NameCard 時
#   description / status / statusMessage / fields 4 個 section 預設都應提供
#   sparse `{ name, avatarUrl }` 資料 = bug,違反一致呈現
#
# Detects literal `{ name: '...', avatar(Url)?: '...' }` with NO other PersonData fields.

source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire

FILE_PATH=$(jq -r '.tool_input.file_path // empty')

if ! grep -qE '\.(tsx|stories\.tsx)$' <<<"$FILE_PATH"; then
  exit 0
fi
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Skip the canonical sources(NameCard / Avatar / person-display 自身)
if grep -qE '(NameCard|Avatar|person-display|avatar\.spec)' <<<"$FILE_PATH"; then
  exit 0
fi

# Match `{ name: '...', avatarUrl?: '...' }` with no other PersonData fields on same line.
# A "rich" PersonData usually spans multiple lines OR has description/status/statusMessage/fields.
# Heuristic: single-line literal with only name + avatarUrl(no other PersonData props on same line).
SPARSE_HITS=$(grep -m 5 -nE "\{\s*name:\s*['\"][^'\"]+['\"],\s*avatar(Url)?:\s*['\"][^'\"]+['\"]\s*\}" "$FILE_PATH" 2>/dev/null)

if [ -n "$SPARSE_HITS" ]; then
  ADDITIONAL_CONTEXT=$(printf 'Sparse PersonData literal(違反 name-card.spec「DS-wide 預設展示一致 canonical」):\n%s\n  → 補上 description / status / statusMessage / fields 4 sections,讓 NameCard hover 展示資訊量一致' "$SPARSE_HITS")
  jq -n --arg ctx "$ADDITIONAL_CONTEXT" '{
    governanceContext: {
      hookEventName: "PostToolUse",
      message: $ctx
    }
  }'
fi

exit 0

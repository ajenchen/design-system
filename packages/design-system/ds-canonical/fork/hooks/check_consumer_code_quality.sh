#!/usr/bin/env bash
# Provider-neutral, standalone consumer source gate. This is intentionally independent of the
# DS-author post_edit_dispatcher/lib tree so it can ship in the immutable fork corpus and replay in
# hooks-off CI. Native Claude/Codex events are only accelerators; exit 2 is also asserted directly.

set -uo pipefail
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_provider_paths.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: consumer quality project resolver unavailable\n' >&2
  exit 70
}
source "$(dirname "$0")/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: hook integrity helper unavailable\n' >&2
  exit 70
}

governance_hook_load_input
governance_hook_require_commands grep head perl python3 tr wc
EVENT=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // .event // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality event extraction failed'
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .file_path // .path // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality path extraction failed'

[ "$EVENT" != "PostToolUse" ] && exit 0
printf '%s' "$FILE_PATH" | grep -Eq '(^|/)apps/[^/]+/src/.*\.[cm]?[jt]sx?$' || exit 0
FILE_PATH=$(governance_hook_project_file_path "$FILE_PATH" 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality target escapes the project or crosses a symlink'
if [ -L "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ] || [ ! -r "$FILE_PATH" ]; then
  governance_hook_integrity_fail 'consumer quality target is unavailable or unsafe'
fi

# Remove comments before structural signatures. Escape markers are checked against the original.
BODY=$(perl -0777 -pe 's{\{/\*.*?\*/\}}{}gs; s{/\*.*?\*/}{}gs; s{^[ \t]*//.*$}{}gm' "$FILE_PATH" 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality target could not be parsed'
VIOLATIONS=""
add_violation() { VIOLATIONS="${VIOLATIONS}\n- $1"; }
has_rationale() {
  local marker="$1"
  grep -Eq "${marker}:[[:space:]]*.{8,}" "$FILE_PATH" 2>/dev/null
}

# The deny-list stays in the runner-authenticated corpus. The fork builder mechanically rewrites
# this canonical source path to references/utility-registry.json; neither role may rediscover a
# mutable consumer installation or a hook-relative fallback after the trust boundary is crossed.
CORPUS_ROOT=$(governance_corpus_root 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality corpus root could not be resolved'
PROJECT_ROOT=$(governance_project_root 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer quality project root could not be resolved'
REGISTRY="$CORPUS_ROOT/references/utility-registry.json"
if [ -L "$REGISTRY" ] || [ ! -f "$REGISTRY" ] || [ ! -r "$REGISTRY" ]; then
  governance_hook_integrity_fail "consumer quality canonical utility registry is unavailable or unsafe:${REGISTRY}"
fi
CANONICAL_REGISTRY_OWNER='packages/design-system'"/src/tokens/utility-registry.json"
SHADCN_ALIASES=$(jq -er --arg owner "$CANONICAL_REGISTRY_OWNER" '
  select(
    type == "object"
    and .schemaVersion == 1
    and ._meta.owner == $owner
    and (._meta.provider_view_policy | type == "string" and length > 0)
  )
  | .shadcn_alias.block.color_alias
  | arrays
  | if length > 0 and (unique | length) == length
    then .[]
    else error("empty or duplicate alias registry")
    end
' "$REGISTRY" 2>/dev/null) || {
  governance_hook_integrity_fail 'consumer quality canonical alias registry is invalid'
}
while IFS= read -r ALIAS; do
  printf '%s' "$ALIAS" | grep -Eq '^[a-z][a-z0-9-]*$' || {
    governance_hook_integrity_fail 'consumer quality canonical alias registry is unsafe'
  }
  if grep -Eq "(^|[^A-Za-z0-9_-])${ALIAS}([^A-Za-z0-9_-]|$)" <<<"$BODY"; then
    add_violation "shadcn compatibility alias ${ALIAS}; consume the direct design-system semantic token"
  fi
done <<< "$SHADCN_ALIASES"

# TypeScript escape hatch requires a concrete rationale on the same or immediately preceding line.
ANY_HITS=$(perl -ne '
  BEGIN { our $prev = 0; our $hit_count = 0 }
  my $allow = /any-allow:\s*.{8,}/; next if /^\s*(\/\/|\*|\/\*)/;
  if (!$prev && !$allow && (/(:\s*any\b|\bas\s+any\b|<any>|\bany\[\]|Record<[^,]+,\s*any>)/)) {
    print "$.:$_";
    $hit_count++;
    exit 0 if $hit_count >= 5;
  }
  $prev = $allow;
' "$FILE_PATH" 2>/dev/null) || governance_hook_integrity_fail 'consumer quality any parser failed'
[ -n "$ANY_HITS" ] && add_violation "TypeScript any without // any-allow: <specific rationale>: ${ANY_HITS//$'\n'/ | }"

if printf '%s' "$FILE_PATH" | grep -qE '\.tsx$'; then
  LINES=$(wc -l < "$FILE_PATH" | tr -d ' ') \
    || governance_hook_integrity_fail 'consumer quality line counter failed'
  FILE_HEAD=$(sed -n '1,20p' "$FILE_PATH")
  if [ "${LINES:-0}" -gt 800 ] && ! grep -Eq 'code-quality-allow:[[:space:]]*file-size[[:space:]]+.{8,}' <<<"$FILE_HEAD"; then
    add_violation "tsx file has ${LINES} lines (>800) without a reasoned file-size exception"
  fi
fi

FLAT=$(printf '%s' "$BODY" | tr '\n' ' ')

OVERLAY=$(printf '%s' "$BODY" | perl -0777 -ne 'print "hit" if /<div\b[^>]*className="(?=[^"]*px-\[var\(--layout-space-loose\)\])(?=[^"]*border-(?:b|t))(?=[^"]*border-divider)[^"]*"/s') \
  || governance_hook_integrity_fail 'consumer quality overlay parser failed'
if [ -n "$OVERLAY" ] && ! has_rationale 'overlay-handcraft-allow'; then
  add_violation 'hand-crafted overlay chrome; consume Popover/Dialog/Sheet/Surface header/body/footer primitives'
fi

RAW_ROW=$(printf '%s' "$BODY" | perl -0777 -ne 'print "hit" if /<div\b[^>]*className="(?=[^"]*\bflex\b)(?=[^"]*\bgap-[12]\b)(?=[^"]*px-\[var\(--layout-space-loose\)\])(?=[^"]*hover:bg-neutral-hover)(?=[^"]*rounded)[^"]*"/s') \
  || governance_hook_integrity_fail 'consumer quality row parser failed'
if [ -n "$RAW_ROW" ] && ! has_rationale 'menu-item-handcraft-allow'; then
  add_violation 'hand-crafted MenuItem-like row; consume the DS row/menu primitive'
fi

if grep -q 'h-\[var(--chrome-header-height)\]' <<<"$FLAT" \
  && grep -q 'border-b' <<<"$FLAT" \
  && grep -q 'border-divider' <<<"$FLAT" \
  && ! has_rationale '@chrome-header-handcraft-allow'; then
  add_violation 'hand-crafted chrome header; consume ChromeHeader'
fi

if grep -Eq 'layout="primary-header"|layout=\{('\''|")primary-header('\''|")\}' <<<"$BODY"; then
  PRIMARY=""
  if ! grep -qE 'globalHeader[[:space:]]*=' <<<"$BODY"; then
    PRIMARY="${PRIMARY}\n- AppShell primary-header layout requires globalHeader"
  fi
  if grep -Eq '<SidebarHeader([^A-Za-z]|$)' <<<"$BODY" && ! grep -qE 'useSidebar|isMobile' <<<"$BODY"; then
    PRIMARY="${PRIMARY}\n- primary-header layout must not duplicate an unguarded SidebarHeader"
  fi
  if grep -Eq '<SidebarFooter([^A-Za-z]|$)' <<<"$BODY"; then
    PRIMARY="${PRIMARY}\n- primary-header account entry belongs in the global/sheet header, not SidebarFooter"
  fi
  if [ -n "$PRIMARY" ] && ! has_rationale '@app-shell-primary-header-allow'; then VIOLATIONS="${VIOLATIONS}${PRIMARY}"; fi
fi

if [ -n "$VIOLATIONS" ]; then
  printf 'GOV-CONSUMER-QUALITY-001:%b\nFile:%s\n' "$VIOLATIONS" "$FILE_PATH" >&2
  exit 2
fi
exit 0

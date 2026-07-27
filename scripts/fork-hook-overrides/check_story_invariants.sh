#!/bin/bash
# check_story_invariants.sh — SHIP_REWRITTEN fork override(consumer 版,2026-07-08 WM 戰役 R4)
#
# WHY REWRITE(非 SHIP_AS_IS / 非 DROP):
#   DS-author 原版 10 條 rule 多數 scope 在 DS src stories(anatomy 6-canonical / trait category /
#   title canonical 等 DS-author 撰寫紀律),fork 消費端不適用;但 provider-neutral product
#   instruction 的 consume-before-inventing/nearest-canonical 原則需要
#   「Registry SSOT story-baseline-registry.json + hook check_story_invariants.sh R8 + R9 機械強制」
#   — 原版整支 DROP = doc-vs-corpus drift(對 fork 承諾了防線、corpus 卻沒 ship,紙老虎)。
#   本 override 只 ship fork 真需要的兩條(WM 2026-07-08 實證 drift class):
#     R8 story_archetype_registry — 讀 corpus 內 registry antiPatterns,攔 simplified-mock
#        (wrap Sidebar/DataTable/ChromeHeader 卻手刻 span/div 取代 primitive 結構)
#     R9 hand_craft_overlay_header — 手刻浮層 / chrome header 簽名(px-loose + border-b
#        border-divider 同 className;零誤判簽名,DS-wide 量測 anchor 2026-06-04 upload-manager)
#   Scope 擴到 apps/**/*.tsx:fork 手刻 drift 主戰場在產品 code,非只 stories(WM detail modal 實證)。
#   Escape 與 DS-author 版同源:@story-baseline-allow: <reason>(檔頭 10 行內或本次片段)。
#
# Registry 路徑:只接受 runner 驗證後的 $GOVERNANCE_CORPUS_ROOT/references；
# 不從 hook 位置、cwd 或 consumer node_modules 猜測，避免 mutable fallback 成為第二權威。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd -P)" || {
  printf 'GOVERNANCE_INTEGRITY: consumer story invariant hook root unavailable\n' >&2
  exit 70
}
source "$SCRIPT_DIR/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$SCRIPT_DIR/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: consumer story invariant integrity helper unavailable\n' >&2
  exit 70
}
source "$SCRIPT_DIR/lib/_provider_paths.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: consumer story invariant corpus resolver unavailable\n' >&2
  exit 70
}

set -uo pipefail

_HOOK_CONTEXT_EVENT="PreToolUse"
_HOOK_OUTPUT_CAPTURE=$(mktemp "${TMPDIR:-/tmp}/consumer-story-invariants.XXXXXX") || {
  printf 'GOVERNANCE_INTEGRITY: consumer story invariant output capture unavailable\n' >&2
  exit 70
}
exec 3>&1 4>&2
exec >"$_HOOK_OUTPUT_CAPTURE" 2>&1

_finalize_hook_output() {
  _hook_rc=$?
  trap - EXIT
  exec 1>&3 2>&4
  _hook_output=$(cat "$_HOOK_OUTPUT_CAPTURE" 2>/dev/null || true)
  rm -f "$_HOOK_OUTPUT_CAPTURE" 2>/dev/null || true

  case "$_hook_rc" in
    0)
      [ -z "$_hook_output" ] && exit 0
      if ! jq -cn \
        --arg event "$_HOOK_CONTEXT_EVENT" \
        --arg message "$_hook_output" \
        '{governanceContext:{hookEventName:$event,message:$message}}'; then
        printf 'GOVERNANCE_INTEGRITY: consumer story invariant warning envelope encoding failed\n' >&2
        exit 70
      fi
      exit 0
      ;;
    2)
      case "$_hook_output" in
        *GOVERNANCE_INTEGRITY:*)
          printf '%s\n' "$_hook_output" >&2
          exit 70
          ;;
      esac
      if [ -n "$_hook_output" ]; then
        printf '%s\n' "$_hook_output" >&2
      else
        printf 'consumer story invariant hook blocked without diagnostic\n' >&2
      fi
      exit 2
      ;;
    70)
      if [ -n "$_hook_output" ]; then
        printf '%s\n' "$_hook_output" >&2
      else
        printf 'GOVERNANCE_INTEGRITY: consumer story invariant failed without diagnostic\n' >&2
      fi
      exit 70
      ;;
    *)
      printf 'GOVERNANCE_INTEGRITY: consumer story invariant undefined exit code %s\n' "$_hook_rc" >&2
      [ -n "$_hook_output" ] && printf '%s\n' "$_hook_output" >&2
      exit 70
      ;;
  esac
}
trap _finalize_hook_output EXIT

governance_hook_load_input
governance_hook_require_commands awk grep jq python3 sed
TOOL=$(jq -r '.tool_name // ""' <<< "$INPUT" 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer story invariant tool extraction failed'
FILE_PATH=$(jq -r '.tool_input.file_path // ""' <<< "$INPUT" 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer story invariant path extraction failed'
EVENT=$(jq -r '.hook_event_name // ""' <<< "$INPUT" 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer story invariant event extraction failed'

case "$EVENT" in
  PostToolUse) _HOOK_CONTEXT_EVENT="PostToolUse" ;;
  *) _HOOK_CONTEXT_EVENT="PreToolUse" ;;
esac
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
[ "$EVENT" = "PostToolUse" ] && exit 0

# Scope:fork 產品 code(apps/**/*.tsx)+ 任何 stories.tsx;DS 內部 / node_modules 不管
case "$FILE_PATH" in
  *node_modules/*|*packages/design-system/*) exit 0 ;;
  *.stories.tsx) ;;
  apps/*.tsx|*/apps/*.tsx) ;;
  *) exit 0 ;;
esac

SAFE_FILE=$(governance_hook_project_file_path "$FILE_PATH" 2>/dev/null) \
  || governance_hook_integrity_fail 'consumer story target escapes the project or crosses a symlink'
if [ -e "$SAFE_FILE" ] || [ -L "$SAFE_FILE" ]; then
  if [ -L "$SAFE_FILE" ] || [ ! -f "$SAFE_FILE" ] || [ ! -r "$SAFE_FILE" ]; then
    governance_hook_integrity_fail 'consumer story target is unavailable or unsafe'
  fi
fi

# proposed-text-v1 consumes only the runner-validated full after-image. Direct
# event-v1 probes retain a strict typed fallback for compatibility, but raw
# fragments and compatibility aliases never outrank a trusted proposed state.
NEW_CONTENT=""
case "${GOVERNANCE_WRITE_STATE_TRUST:-}" in
  runner-v1)
    if ! jq -e '
      .tool_input.governance_write_state as $state
      | ($state | type == "object")
        and ($state.schemaVersion == 1)
        and ($state.path | type == "string" and length > 0)
        and (
          ($state.kind == "text" and ($state.content | type == "string"))
          or ($state.kind == "deleted" and ($state | has("content") | not))
        )
    ' <<< "$INPUT" >/dev/null 2>&1; then
      governance_hook_integrity_fail 'consumer story invariant trusted proposed write state is missing or malformed'
    fi
    STATE_PATH=$(jq -r '.tool_input.governance_write_state.path' <<< "$INPUT" 2>/dev/null) \
      || governance_hook_integrity_fail 'consumer story invariant proposed state path extraction failed'
    STATE_KIND=$(jq -r '.tool_input.governance_write_state.kind' <<< "$INPUT" 2>/dev/null) \
      || governance_hook_integrity_fail 'consumer story invariant proposed state kind extraction failed'
    if [[ "$FILE_PATH" != "$STATE_PATH" && "$FILE_PATH" != */"$STATE_PATH" ]]; then
      governance_hook_integrity_fail 'consumer story invariant proposed state does not match the hook target'
    fi
    [ "$STATE_KIND" = "deleted" ] && exit 0
    NEW_CONTENT=$(jq -r '.tool_input.governance_write_state.content' <<< "$INPUT" 2>/dev/null) \
      || governance_hook_integrity_fail 'consumer story invariant proposed state content extraction failed'
    ;;
  ""|unavailable)
    # Select exactly one valid string surface. Provider-neutral event-v1
    # envelopes may carry aliases together; concatenating them multiplies the
    # same full-file payload. A present null alias is not valid text and must
    # not shadow another valid compatibility field.
    NEW_CONTENT=$(jq -r '
      .tool_name as $tool
      | .tool_input as $input
      | def valid_edits:
          (($input.edits | type) == "array")
          and all($input.edits[]?; (.new_string | type) == "string");
      if $tool == "Write" and ($input.content | type) == "string" then
        $input.content
      elif $tool == "Edit" and ($input.new_string | type) == "string" then
        $input.new_string
      elif $tool == "MultiEdit" and valid_edits then
        ([$input.edits[] | .new_string] | join("\n"))
      elif ($input.new_string | type) == "string" then
        $input.new_string
      elif ($input.content | type) == "string" then
        $input.content
      elif valid_edits then
        ([$input.edits[] | .new_string] | join("\n"))
      else
        error("no valid mutation text")
      end
    ' <<< "$INPUT" 2>/dev/null) \
      || governance_hook_integrity_fail 'consumer story edit payload extraction failed'
    ;;
  *)
    governance_hook_integrity_fail 'consumer story invariant proposed state trust marker is unsupported'
    ;;
esac
governance_hook_grep_q \
  'consumer story non-whitespace matcher failed' \
  "$NEW_CONTENT" -q '[^[:space:]]' \
  || exit 0

# Escape(檔頭 10 行 — 本次片段 or 磁碟上既有檔頭)。Capture the
# bounded prefix first; producer→head→grep pipelines can SIGPIPE under pipefail.
CONTENT_HEAD=$(sed -n '1,10p;10q' <<< "$NEW_CONTENT") \
  || governance_hook_integrity_fail 'consumer story content header read failed'
if governance_hook_grep_q \
  'consumer story content allow-marker matcher failed' \
  "$CONTENT_HEAD" -qE '@story-baseline-allow:'; then
  exit 0
fi
if [ "${GOVERNANCE_WRITE_STATE_TRUST:-}" != "runner-v1" ] && [ -f "$SAFE_FILE" ]; then
  DISK_HEAD=$(sed -n '1,10p;10q' "$SAFE_FILE" 2>/dev/null) \
    || governance_hook_integrity_fail 'consumer story target header read failed'
  if governance_hook_grep_q \
    'consumer story target allow-marker matcher failed' \
    "$DISK_HEAD" -qE '@story-baseline-allow:'; then
    exit 0
  fi
fi

WORST=0
record_worst() {
  local level="$1"
  [ "$level" -gt "$WORST" ] && WORST="$level"
}

# ── Registry 定位(只讀 runner-authenticated immutable corpus) ──
CORPUS_ROOT=$(governance_corpus_root 2>/dev/null) \
  || governance_hook_integrity_fail 'R8 consumer story baseline corpus root could not be resolved'
REGISTRY_CANDIDATE="$CORPUS_ROOT/references/story-baseline-registry.json"
REGISTRY=$(python3 - "$CORPUS_ROOT" "$REGISTRY_CANDIDATE" <<'PY'
import os
import sys

root = os.path.realpath(os.path.abspath(sys.argv[1]))
target = os.path.abspath(sys.argv[2])
try:
    if os.path.commonpath([root, target]) != root:
        raise ValueError("outside corpus")
except ValueError:
    raise SystemExit(2)
relative = os.path.relpath(target, root)
cursor = root
if os.path.islink(cursor):
    raise SystemExit(2)
for segment in relative.split(os.sep):
    cursor = os.path.join(cursor, segment)
    if not os.path.lexists(cursor):
        break
    if os.path.islink(cursor):
        raise SystemExit(2)
print(target)
PY
) || governance_hook_integrity_fail 'R8 consumer story baseline registry escapes the corpus or crosses a symlink'
if [ -L "$REGISTRY" ] || [ ! -f "$REGISTRY" ] || [ ! -r "$REGISTRY" ]; then
  governance_hook_integrity_fail "R8 consumer story baseline registry is unavailable or unsafe:${REGISTRY}"
fi
if ! jq -e --arg owner "packages/design-system/ds-canonical/references/story-baseline-registry.json" '
  type == "object"
  and .schemaVersion == 1
  and ._meta.owner == $owner
  and (._meta.provider_view_policy | type == "string" and length > 0)
  and (.components | type == "object")
  and (.components | keys | sort) == ["ChromeHeader", "DataTable", "Sidebar"]
  and (
    . as $root
    | ["Sidebar", "DataTable", "ChromeHeader"] as $required
    | all($required[];
        . as $component
        | ($root.components[$component] | type == "object")
        and ($root.components[$component].antiPatterns | type == "array" and length > 0)
        and all($root.components[$component].antiPatterns[];
          type == "object"
          and (.severity == "block" or .severity == "warn")
          and (
            .regex
            | type == "string"
              and length > 0
              and (explode | all(. >= 32 and . != 127))
          )
          and (
            .unlessRegex? == null
            or (
              .unlessRegex
              | type == "string"
                and (explode | all(. >= 32 and . != 127))
            )
          )
        )
      )
  )
' "$REGISTRY" >/dev/null 2>&1; then
  governance_hook_integrity_fail "R8 consumer story baseline registry is invalid:${REGISTRY}"
fi

# Flatten each payload once in linear time. Registry EREs deliberately use
# [[:space:]] and bounded .{N} spans across originally separate JSX lines.
CONTENT_FLAT=$(awk '
  BEGIN { first=1 }
  {
    if (!first) printf " "
    printf "%s", $0
    first=0
  }
' <<< "$NEW_CONTENT") \
  || governance_hook_integrity_fail 'R8 consumer story content flatten failed'

# ─────────────────────────────────────────────────────────────────────────────
# R8 — story_archetype_registry(registry antiPatterns 攔 simplified-mock)
# ─────────────────────────────────────────────────────────────────────────────
for COMP in Sidebar DataTable ChromeHeader; do
  if ! governance_hook_grep_q \
    "R8 consumer component matcher failed:${COMP}" \
    "$NEW_CONTENT" -qE "<${COMP}\\b"; then
    continue
  fi

  # 每條三行一組:severity / regex / unlessRegex。Schema forbids control
  # characters, so one registry value cannot corrupt the record framing.
  if ! PATTERNS=$(jq -er --arg c "$COMP" '
    .components[$c].antiPatterns[]
    | .severity, .regex, (.unlessRegex // "")
  ' "$REGISTRY" 2>/dev/null); then
    governance_hook_integrity_fail "R8 consumer registry query failed for component:${COMP}"
  fi
  [ -n "$PATTERNS" ] \
    || governance_hook_integrity_fail "R8 consumer registry query returned no patterns:${COMP}"

  while IFS= read -r SEV \
    && IFS= read -r PATTERN \
    && { IFS= read -r UNLESS || true; }; do
    [ -n "$PATTERN" ] \
      || governance_hook_integrity_fail "R8 consumer registry returned an empty regex:${COMP}"

    grep -qE "$PATTERN" <<< "x" 2>/dev/null
    REGEX_RC=$?
    if [ "$REGEX_RC" -gt 1 ]; then
      governance_hook_integrity_fail "R8 consumer registry regex is not executable:${PATTERN}"
    fi
    if [ -n "$UNLESS" ]; then
      grep -qE "$UNLESS" <<< "x" 2>/dev/null
      REGEX_RC=$?
      if [ "$REGEX_RC" -gt 1 ]; then
        governance_hook_integrity_fail "R8 consumer registry unlessRegex is not executable:${UNLESS}"
      fi
    fi

    grep -qE "$PATTERN" <<< "$CONTENT_FLAT" 2>/dev/null
    REGEX_RC=$?
    if [ "$REGEX_RC" -gt 1 ]; then
      governance_hook_integrity_fail "R8 consumer registry matcher failed for component:${COMP}"
    elif [ "$REGEX_RC" -eq 0 ]; then
      if [ -n "$UNLESS" ]; then
        grep -qE "$UNLESS" <<< "$CONTENT_FLAT" 2>/dev/null
        REGEX_RC=$?
        if [ "$REGEX_RC" -gt 1 ]; then
          governance_hook_integrity_fail "R8 consumer registry unless matcher failed for component:${COMP}"
        elif [ "$REGEX_RC" -eq 0 ]; then
          continue
        fi
      fi
      {
        echo "⚠️  R8 story_archetype_registry violation(severity: $SEV):"
        echo "   $FILE_PATH wrap <$COMP> matches anti-pattern:"
        echo "   regex: $PATTERN"
        echo ""
        echo "   修法:Read DS baseline story + helpers,抄 production archetype 結構,"
        echo "   不憑印象手刻 simplified mock(<SidebarHeader><span> / 手刻 filter Button 等)。"
        echo "   Baseline registry:node_modules/@qijenchen/design-system/ds-canonical/references/story-baseline-registry.json"
        echo "   Canonical:product AGENTS 的 consume-before-inventing；nearest same-purpose canonical wins。"
        echo "   豁免:檔頭加 // @story-baseline-allow: <reason>(audit-logged)。"
      } >&2
      [ "$SEV" = "block" ] && record_worst 2
    fi
  done <<< "$PATTERNS"
done

# ─────────────────────────────────────────────────────────────────────────────
# R9 — hand_craft_overlay_header(零誤判簽名:px-loose + border-b border-divider 同 className)
# ─────────────────────────────────────────────────────────────────────────────
# Drop pure comment lines and flatten in one awk pass. Do not strip inline //
# because doing so mutilates URLs and changes executable JSX.
FLAT9=$(awk '
  /^[[:space:]]*(\/\/|\*|\/\*|\{\/\*)/ { next }
  {
    if (!first) printf " "
    printf "%s", $0
    first=0
  }
' <<< "$NEW_CONTENT") \
  || governance_hook_integrity_fail 'R9 consumer story content flatten failed'
if governance_hook_grep_q \
  'R9 consumer hand-craft matcher failed' \
  "$FLAT9" -qE '<div[^>]*px-\[var\(--layout-space-loose\)\][^">]*border-b[[:space:]]+border-divider|<div[^>]*border-b[[:space:]]+border-divider[^">]*px-\[var\(--layout-space-loose\)\]'; then
  {
    echo "❌ R9 hand-craft overlay / chrome header:${FILE_PATH}"
    echo "   偵測到 <div ... px-[var(--layout-space-loose)] ... border-b border-divider> = 手刻浮層 / chrome header。"
    echo "   必消費 DS primitive:<SurfaceHeader>(patterns/overlay-surface)/ <PopoverHeader> / <DialogHeader>;"
    echo "   面板殼用 Popover 同款 chrome token(rounded-lg border-border bg-surface-raised elevation-200)。"
    echo "   理由:px-loose + divider border 的 header chrome 是 overlay-surface SSOT;手刻 = drift"
    echo "   (anchor 2026-06-04 upload-manager 手刻面板 py-2≠py-tight / 殼 token 全偏,user 抓)。"
    echo "   Spec:node_modules/@qijenchen/design-system/src/patterns/overlay-surface/overlay-surface.spec.md"
    echo "   豁免:檔頭加 // @story-baseline-allow: <reason>。"
  } >&2
  record_worst 2
fi

exit "$WORST"

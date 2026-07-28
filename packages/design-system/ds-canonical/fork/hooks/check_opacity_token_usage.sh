#!/bin/bash
set -uo pipefail
# Tailwind token registry enforcement hook(2026-05-18 升級 per audit Dim 47 + codex P1-5):
#   原 hook 名 `check_opacity_token_usage.sh`(keep filename for settings.json registration),
#   實際 logic 已升級成 full Tailwind utility registry compliance(per Dim 47 SSOT)。
#
# SSOT source:`node_modules/@qijenchen/design-system/src/tokens/utility-registry.json`(block list per category)。
# 對齊 Atlassian @atlaskit/tokens / Carbon @carbon/themes / Ant ConfigProvider / Polaris polaris-tokens
# token-first lint enforcement。
#
# 檢的 block category:
#   - opacity:opacity-{5..95} numeric tier(原 logic,保留)
#   - typography:text-{xs..9xl} / font-{thin|light|semibold|black} / leading-{N} numeric / tracking-{wide..widest|tighter|tight}
#   - radius:rounded-{xl|2xl|3xl} / rounded(unscoped)/ rounded-[...] arbitrary(例外 rounded-[inherit])
#   - elevation:shadow-{sm|md|lg|xl|2xl|inner} / shadow(unscoped)
#   - shadcn alias:bg-popover / text-muted-foreground / bg-accent 等
#   - primitive 色名:bg-neutral-N / text-blue-N 等(越過 semantic 層)
#
# 例外:utility-registry.json `_meta.exceptions` 段定義的 anatomy stories / principles code blocks 豁免
#       (本 hook 已 skip *.anatomy.stories.tsx / *.principles.stories.tsx 不檢)
#
# 修法:reuse semantic utility / token reference / var() bracket(詳 utility-registry.json `rationale_path`)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_provider_paths.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: token registry provider resolver unavailable\n' >&2
  exit 70
}
source "$(dirname "$0")/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: hook integrity helper unavailable\n' >&2
  exit 70
}

_HOOK_CONTEXT_EVENT="PreToolUse"
_HOOK_OUTPUT_CAPTURE=$(mktemp "${TMPDIR:-/tmp}/check-opacity-token-usage.XXXXXX") || {
  printf 'GOVERNANCE_INTEGRITY: token registry output capture unavailable\n' >&2
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
        printf 'GOVERNANCE_INTEGRITY: token registry warning envelope encoding failed\n' >&2
        exit 70
      fi
      exit 0
      ;;
    2)
      if grep -q 'GOVERNANCE_INTEGRITY:' <<<"$_hook_output"; then
        printf '%s\n' "$_hook_output" >&2
        exit 70
      elif [ -n "$_hook_output" ]; then
        printf '%s\n' "$_hook_output" >&2
      else
        printf 'token registry hook blocked without diagnostic\n' >&2
      fi
      exit 2
      ;;
    70)
      if [ -n "$_hook_output" ]; then
        printf '%s\n' "$_hook_output" >&2
      else
        printf 'GOVERNANCE_INTEGRITY: token registry failed without diagnostic\n' >&2
      fi
      exit 70
      ;;
    *)
      printf 'GOVERNANCE_INTEGRITY: token registry undefined exit code %s\n' "$_hook_rc" >&2
      [ -n "$_hook_output" ] && printf '%s\n' "$_hook_output" >&2
      exit 70
      ;;
  esac
}
trap _finalize_hook_output EXIT

governance_hook_load_input
governance_hook_require_commands grep python3 sed
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'token registry tool extraction failed'
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'token registry path extraction failed'

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

# Scope:.tsx + .css(DS source);skip stories / tests / token spec 自家 / anatomy/principles per registry exception
case "$FILE_PATH" in
  *.tsx|*.css) ;;
  *) exit 0 ;;
esac
case "$FILE_PATH" in
  # 註解:anatomy + principles stories per utility-registry.json `_meta.exceptions` 豁免
  *.anatomy.stories.tsx|*.principles.stories.tsx) exit 0 ;;
  *.stories.tsx|*.test.*|*.spec.tsx) exit 0 ;;
  *tokens/opacity/*|*tokens/typography/*|*tokens/radius/*|*tokens/elevation/*|*tokens/color/*) exit 0 ;;
esac

NEW_CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'token registry content extraction failed'
[ -z "$NEW_CONTENT" ] && exit 0
# Per-line escape(2026-07-07 方向 2 升 P0 配套):行內含 `@token-registry-ok: <rationale>` 豁免該行
governance_hook_grep_capture NEW_CONTENT_FILTERED 'token registry escape filter failed' \
  "$NEW_CONTENT" -v '@token-registry-ok:'
NEW_CONTENT="$NEW_CONTENT_FILTERED"
[ -z "$NEW_CONTENT" ] && exit 0

# The registry is corpus-owned SSOT. The project resolver is still required to validate the active
# provider project boundary; no hook-relative or opacity-only fallback may silently weaken policy.
CORPUS_ROOT=$(governance_corpus_root 2>/dev/null) \
  || governance_hook_integrity_fail 'token registry corpus root could not be resolved'
PROJECT_ROOT=$(governance_project_root 2>/dev/null) \
  || governance_hook_integrity_fail 'token registry project root could not be resolved'
REGISTRY="$CORPUS_ROOT/references/utility-registry.json"
if [ -L "$REGISTRY" ] || [ ! -f "$REGISTRY" ] || [ ! -r "$REGISTRY" ]; then
  governance_hook_integrity_fail "canonical utility registry is unavailable or unsafe:${REGISTRY}"
fi
# `_meta.owner` is the canonical identity of the source record, not its projected install path.
# Keep the two path segments separate so the fork path projection rewrites REGISTRY above without
# rewriting this identity assertion.
CANONICAL_REGISTRY_OWNER='packages/design-system'"/src/tokens/utility-registry.json"
# The registry carries both the token lists and the executable matcher inventory. The hook only
# implements one bounded engine; it never repeats aliases in shell regexes. Adding a token to an
# authenticated list therefore changes enforcement immediately, while schema/build closure rejects
# a new list that was not deliberately wired to either block or warn behavior.
SCAN_RESULT=$(python3 - "$REGISTRY" "$CANONICAL_REGISTRY_OWNER" 3<<<"$NEW_CONTENT" <<'PY'
import json
import os
import re
import sys

registry_path = sys.argv[1]
expected_owner = sys.argv[2]
content = os.fdopen(3, encoding="utf-8").read()
with open(registry_path, encoding="utf-8") as source:
    registry = json.load(source)

if (
    not isinstance(registry, dict)
    or registry.get("schemaVersion") != 1
    or registry.get("_meta", {}).get("owner") != expected_owner
    or not isinstance(registry.get("_meta", {}).get("provider_view_policy"), str)
    or registry.get("enforcement", {}).get("schemaVersion") != 1
    or registry.get("enforcement", {}).get("engine") != "utility-registry-rules-v1"
):
    raise ValueError("registry identity is invalid")

expected_pointers = {
    "block": {
        "/typography/block/size_raw",
        "/typography/block/weight_raw",
        "/typography/block/tracking_raw",
        "/radius/block/out_of_range",
        "/radius/block/ambiguous_default",
        "/radius/block/arbitrary_value",
        "/opacity/block/numeric_tier",
        "/elevation/block/tailwind_size",
        "/shadcn_alias/block/color_alias",
        "/primitive_color_as_utility/block/primitive_class",
    },
    "warn": {
        "/spacing/warn/micro_gap",
        "/sizing/warn/fraction",
    },
}

def pointer_value(pointer):
    if not isinstance(pointer, str) or not pointer.startswith("/") or "~" in pointer:
        raise ValueError("unsafe registry pointer")
    value = registry
    for segment in pointer[1:].split("/"):
        if not segment or not isinstance(value, dict) or segment not in value:
            raise ValueError("unresolved registry pointer")
        value = value[segment]
    return value

def token_list(pointer):
    value = pointer_value(pointer)
    if (
        not isinstance(value, list)
        or not value
        or any(not isinstance(token, str) or not token or any(ord(char) < 32 or ord(char) == 127 for char in token) for token in value)
        or len(set(value)) != len(value)
    ):
        raise ValueError("invalid registry token list")
    return value

result = {"block": [], "warn": []}
seen_ids = set()
for level in ("block", "warn"):
    rules = registry["enforcement"].get(level)
    if not isinstance(rules, list) or not rules:
        raise ValueError("missing enforcement rules")
    actual_pointers = set()
    for rule in rules:
        if not isinstance(rule, dict):
            raise ValueError("invalid enforcement rule")
        identifier = rule.get("id")
        label = rule.get("label")
        if (
            not isinstance(identifier, str)
            or not re.fullmatch(r"[a-z][a-z0-9-]*", identifier)
            or identifier in seen_ids
            or not isinstance(label, str)
            or not label
            or any(ord(char) < 32 or ord(char) == 127 for char in label)
        ):
            raise ValueError("invalid enforcement rule identity")
        seen_ids.add(identifier)

        if "tokenListPointer" in rule:
            if set(rule) != {"id", "label", "tokenListPointer"}:
                raise ValueError("open token-list enforcement rule")
            pointer = rule["tokenListPointer"]
            if pointer in actual_pointers:
                raise ValueError("duplicate token-list enforcement rule")
            actual_pointers.add(pointer)
            tokens = token_list(pointer)
            matcher = re.compile(
                r"(?<![A-Za-z0-9_-])(?:" + "|".join(re.escape(token) for token in sorted(tokens, key=len, reverse=True)) + r")(?![A-Za-z0-9_-])"
            )
            hits = {match.group(0) for match in matcher.finditer(content)}
        else:
            allowed_keys = {"id", "label", "pattern", "excludeTokenListPointer"}
            if set(rule) - allowed_keys or not {"id", "label", "pattern"}.issubset(rule):
                raise ValueError("open pattern enforcement rule")
            pattern = rule["pattern"]
            if not isinstance(pattern, str) or not pattern:
                raise ValueError("empty enforcement pattern")
            matcher = re.compile(pattern)
            excluded = set(token_list(rule["excludeTokenListPointer"])) if "excludeTokenListPointer" in rule else set()
            hits = {match.group(0) for match in matcher.finditer(content) if match.group(0) not in excluded}

        if hits:
            result[level].append({
                "id": identifier,
                "label": label,
                "hits": sorted(hits),
            })
    if actual_pointers != expected_pointers[level]:
        raise ValueError("registry token lists are outside exact behavioral closure")

print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
PY
) || governance_hook_integrity_fail "canonical utility registry scan failed:${REGISTRY}"
if ! jq -e '
  type == "object"
  and (keys | sort) == ["block", "warn"]
  and all(.block[], .warn[];
    type == "object"
    and (keys | sort) == ["hits", "id", "label"]
    and (.id | type == "string" and length > 0)
    and (.label | type == "string" and length > 0)
    and (.hits | type == "array" and length > 0 and all(.[]; type == "string" and length > 0))
  )
' <<<"$SCAN_RESULT" >/dev/null 2>&1; then
  governance_hook_integrity_fail 'canonical utility registry scan emitted an invalid result'
fi

VIOLATIONS=$(jq -r '.block[] | "   [\(.label)] \(.hits | join(" "))"' <<<"$SCAN_RESULT" 2>/dev/null) \
  || governance_hook_integrity_fail 'canonical utility block result could not be decoded'
SOFT_NOTES=$(jq -r '.warn[] | "   [\(.label)] \(.hits | join(" "))"' <<<"$SCAN_RESULT" 2>/dev/null) \
  || governance_hook_integrity_fail 'canonical utility warning result could not be decoded'
[ -n "$VIOLATIONS" ] && VIOLATIONS=$'\n'"$VIOLATIONS"
[ -n "$SOFT_NOTES" ] && SOFT_NOTES=$'\n'"$SOFT_NOTES"

if [ -n "$VIOLATIONS" ]; then
  cat >&2 <<'EOF_HEAD'

⚠️  M23 / Dim 47 violation:Tailwind utility 繞 SSOT registry。
EOF_HEAD
  echo -e "$VIOLATIONS" >&2
  cat >&2 <<'EOF_BODY'

   SSOT:node_modules/@qijenchen/design-system/src/tokens/utility-registry.json(block list per category)
   修法 quick map:
     text-xs..9xl  → text-h1..h6 / text-body / text-caption / text-helper / text-label
     font-thin/...black → font-normal / font-medium / font-bold
     leading-{N}   → leading-compact / leading-normal
     tracking-*    → tracking-shortcut(or codify role-specific semantic utility)
     rounded-xl..  → rounded-xs..rounded-lg / rounded-full
     rounded-[..]  → rounded-xs..lg 語意 utility(rounded-[inherit] 唯一例外,registry allow)
     shadow-sm..   → shadow-[var(--elevation-100)] / shadow-[var(--elevation-200)]
     bg-popover .. → direct semantic token(--surface-raised / --fg-muted / --error 等)
     bg-neutral-N  → semantic utility(bg-surface 等)或 bg-[var(--color-neutral-N)]

   詳 utility-registry.json `_meta.spec_sources` + M23「DS 內既有 canonical 優先」。
   Per-line escape:行尾註解 `@token-registry-ok: <rationale>`(audit 可追)。
EOF_BODY
  # P0 BLOCKER(2026-07-07 治理進化方向 2:對齊 user 2026-05-27「SSOT canonical 必 P0」doctrine;
  # 檔級豁免(anatomy/principles stories / token 自家)+ 行級 escape 已備,升級不增誤殺)
  # micro-gap/fraction soft note 附在硬 block 訊息尾(一起讓 AI 看到,但不影響 exit code 判定)
  [ -n "$SOFT_NOTES" ] && { echo "" >&2; echo "   （另有 soft flag,非 block 原因）:" >&2; echo -e "$SOFT_NOTES" >&2; }
  exit 2
fi

# 只有 micro-gap / fraction soft note(無硬 violation)→ WARN 非 block(registry rationale「flag for human review」)
if [ -n "$SOFT_NOTES" ]; then
  echo "" >&2
  echo "⚠️  Dim 47 soft flag(registry micro_gap / fraction「flag for human review」— 非 block,#71 接線):" >&2
  echo -e "$SOFT_NOTES" >&2
  echo "   <4px gap / registry fraction width 常違反 item-anatomy slot 幾何 / layout SSOT → 人工 review。合理則行尾 @token-registry-ok: <rationale>。" >&2
fi

exit 0

#!/bin/bash
# Enforcement-integrity tests for post_edit_dispatcher.sh.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$SCRIPT_DIR/../post_edit_dispatcher.sh"
FIXTURE=$(mktemp -d)
trap 'rm -rf -- "$FIXTURE"' EXIT
mkdir -p "$FIXTURE/lib"
cp "$SOURCE" "$FIXTURE/post_edit_dispatcher.sh"

HELPERS=(
  _token_hygiene.sh
  _hardcoded_strings.sh
  _code_quality.sh
  _layout_space_canonical.sh
  _person_data_richness.sh
  _overlay_handcraft.sh
  _cva_default_sync.sh
  _story_compile_drift.sh
  _governance_coverage_check.sh
)

PASS=0
FAIL=0
VALID_PAYLOAD='{"hook_event_name":"PostToolUse","tool_name":"Write","tool_input":{"file_path":"apps/demo/src/App.tsx","content":"const x = 1"}}'

write_helper() {
  local helper="$1"
  local mode="${2:-clean}"
  rm -f "$FIXTURE/lib/$helper"
  case "$mode" in
    clean)
      printf '#!/bin/bash\ncat >/dev/null\nexit 0\n' >"$FIXTURE/lib/$helper"
      ;;
    context-one)
      printf '%s\n' \
        '#!/bin/bash' \
        'cat >/dev/null' \
        'printf '\''{"governanceContext":{"hookEventName":"PostToolUse","message":"context one"}}\n'\''' \
        'exit 0' >"$FIXTURE/lib/$helper"
      ;;
    context-two)
      printf '%s\n' \
        '#!/bin/bash' \
        'cat >/dev/null' \
        'printf '\''{"governanceContext":{"hookEventName":"PostToolUse","message":"context two"}}\n'\''' \
        'exit 0' >"$FIXTURE/lib/$helper"
      ;;
    rc1)
      printf '#!/bin/bash\ncat >/dev/null\nexit 1\n' >"$FIXTURE/lib/$helper"
      ;;
    rc2)
      printf '#!/bin/bash\ncat >/dev/null\nexit 2\n' >"$FIXTURE/lib/$helper"
      ;;
    malformed)
      printf '%s\n' \
        '#!/bin/bash' \
        'cat >/dev/null' \
        'printf '\''not-json\n'\''' \
        'exit 0' >"$FIXTURE/lib/$helper"
      ;;
    wrong-event)
      printf '%s\n' \
        '#!/bin/bash' \
        'cat >/dev/null' \
        'printf '\''{"governanceContext":{"hookEventName":"PreToolUse","message":"wrong event"}}\n'\''' \
        'exit 0' >"$FIXTURE/lib/$helper"
      ;;
    raw-stderr)
      printf '%s\n' \
        '#!/bin/bash' \
        'cat >/dev/null' \
        'printf '\''raw diagnostic\n'\'' >&2' \
        'exit 0' >"$FIXTURE/lib/$helper"
      ;;
    *)
      printf 'unknown helper mode: %s\n' "$mode" >&2
      exit 1
      ;;
  esac
}

reset_helpers() {
  local helper
  for helper in "${HELPERS[@]}"; do
    write_helper "$helper" clean
  done
}

run_hook() {
  local payload="$1"
  set +e
  printf '%s' "$payload" \
    | bash "$FIXTURE/post_edit_dispatcher.sh" >"$FIXTURE/stdout" 2>"$FIXTURE/stderr"
  EXIT=$?
  set -e
}

run_real_hook() {
  local payload="$1"
  set +e
  printf '%s' "$payload" \
    | GOVERNANCE_TELEMETRY_OPT_IN=0 bash "$SOURCE" >"$FIXTURE/stdout" 2>"$FIXTURE/stderr"
  EXIT=$?
  set -e
}

pass() {
  PASS=$((PASS + 1))
  printf '  PASS  %s\n' "$1"
}

fail() {
  FAIL=$((FAIL + 1))
  printf '  FAIL  %s\n' "$1"
  sed 's/^/    stdout: /' "$FIXTURE/stdout"
  sed 's/^/    stderr: /' "$FIXTURE/stderr"
}

expect_clean() {
  local name="$1"
  if [ "$EXIT" -eq 0 ] && [ ! -s "$FIXTURE/stdout" ] && [ ! -s "$FIXTURE/stderr" ]; then
    pass "$name"
  else
    fail "$name (expected clean exit 0, got $EXIT)"
  fi
}

expect_integrity_failure() {
  local name="$1"
  local needle="$2"
  if [ "$EXIT" -eq 70 ] \
    && [ ! -s "$FIXTURE/stdout" ] \
    && grep -qF 'GOVERNANCE_INTEGRITY:' "$FIXTURE/stderr" \
    && grep -qF "$needle" "$FIXTURE/stderr"; then
    pass "$name"
  else
    fail "$name (expected stderr-only integrity exit 70 containing '$needle', got $EXIT)"
  fi
}

set -e
printf '%s\n' '=== post_edit_dispatcher enforcement-integrity tests ==='

reset_helpers
run_hook "$VALID_PAYLOAD"
expect_clean 'all required helpers clean'

write_helper "_token_hygiene.sh" context-one
write_helper "_code_quality.sh" context-two
run_hook "$VALID_PAYLOAD"
if [ "$EXIT" -eq 0 ] \
  && [ ! -s "$FIXTURE/stderr" ] \
  && jq -e '
    keys == ["governanceContext"]
    and .governanceContext.hookEventName == "PostToolUse"
    and (.governanceContext.message | contains("context one") and contains("context two"))
  ' "$FIXTURE/stdout" >/dev/null 2>&1; then
  pass 'valid helper contexts aggregate into one exact PostToolUse envelope'
else
  fail "valid helper context aggregation (got exit $EXIT)"
fi

reset_helpers
rm -f "$FIXTURE/lib/_story_compile_drift.sh"
run_hook "$VALID_PAYLOAD"
expect_integrity_failure 'missing required helper fails closed' 'required helper'

reset_helpers
printf '#!/bin/bash\ncat >/dev/null\nexit 0\n' >"$FIXTURE/clean-target.sh"
rm -f "$FIXTURE/lib/_story_compile_drift.sh"
ln -s "$FIXTURE/clean-target.sh" "$FIXTURE/lib/_story_compile_drift.sh"
run_hook "$VALID_PAYLOAD"
expect_integrity_failure 'symlink helper replacement fails closed' 'symlink'

reset_helpers
write_helper "_hardcoded_strings.sh" rc1
run_hook "$VALID_PAYLOAD"
expect_integrity_failure 'helper exit 1 fails closed' 'exit code 1'

reset_helpers
write_helper "_hardcoded_strings.sh" rc2
run_hook "$VALID_PAYLOAD"
expect_integrity_failure 'advisory helper exit 2 is integrity failure' 'exit code 2'

reset_helpers
write_helper "_layout_space_canonical.sh" malformed
run_hook "$VALID_PAYLOAD"
expect_integrity_failure 'malformed helper stdout fails closed' 'malformed or wrong-event envelope'

reset_helpers
write_helper "_layout_space_canonical.sh" wrong-event
run_hook "$VALID_PAYLOAD"
expect_integrity_failure 'wrong-event helper context fails closed' 'malformed or wrong-event envelope'

reset_helpers
write_helper "_person_data_richness.sh" raw-stderr
run_hook "$VALID_PAYLOAD"
expect_integrity_failure 'raw helper stderr fails closed' 'raw stderr'

reset_helpers
run_hook 'not-json'
expect_integrity_failure 'malformed canonical input fails closed' 'malformed or wrong-event canonical envelope'

run_hook '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"apps/demo/src/App.tsx"}}'
expect_integrity_failure 'misrouted event input fails closed' 'malformed or wrong-event canonical envelope'

# Exercise the real dispatcher and all nine real helpers with both a >256 KiB
# canonical event and a file containing far more matches than every diagnostic
# cap. This guards against producer -> early-closing grep/head pipelines
# surfacing EPIPE as a false helper-integrity failure.
REAL_COMPONENT_DIR="$FIXTURE/workspace/packages/design-system/src/components/SigpipeFixture"
REAL_COMPONENT="$REAL_COMPONENT_DIR/sigpipe-fixture.tsx"
mkdir -p "$REAL_COMPONENT_DIR"
{
  printf '%s\n' \
    'import { cva } from "class-variance-authority";' \
    'const variants = cva("", { variants: { size: { md: "" } }, defaultVariants: { size: "md" } });'
  fixture_index=0
  while [ "$fixture_index" -lt 1200 ]; do
    printf 'const unsafeAny%s: any = null;\n' "$fixture_index"
    printf 'const hardcodedLabel%s = "這是使用者介面文字";\n' "$fixture_index"
    printf '<div className="bg-popover shadow-lg bg-neutral-3 overflow-auto w-[--fixture-width]">row</div>;\n'
    printf '<div className="px-[var(--layout-space-loose)] border-b border-divider">overlay</div>;\n'
    printf 'const sparsePerson%s = { name: "Person", avatarUrl: "/avatar.png" };\n' "$fixture_index"
    fixture_index=$((fixture_index + 1))
  done
} >"$REAL_COMPONENT"

REAL_PAYLOAD=$(
  jq -Rs --arg path "$REAL_COMPONENT" '{
    hook_event_name: "PostToolUse",
    tool_name: "Write",
    tool_input: {
      file_path: $path,
      content: .
    }
  }' <"$REAL_COMPONENT"
)

run_real_hook "$REAL_PAYLOAD"
if [ "$(wc -c <"$REAL_COMPONENT" | tr -d ' ')" -gt 262144 ] \
  && [ "$EXIT" -eq 0 ] \
  && [ ! -s "$FIXTURE/stderr" ] \
  && jq -e '
    keys == ["governanceContext"]
    and .governanceContext.hookEventName == "PostToolUse"
    and (
      .governanceContext.message
      | contains("Token hygiene")
        and contains("i18n hygiene")
        and contains("Code quality lite")
        and contains("Primitive consumption")
        and contains("cva/defaultVariants touched")
    )
  ' "$FIXTURE/stdout" >/dev/null 2>&1; then
  pass 'real dispatcher handles >256 KiB event and high-match helper scans without EPIPE/integrity noise'
else
  fail "real dispatcher large-input/high-match regression (got exit $EXIT)"
fi

printf 'Passed: %s / %s\n' "$PASS" "$((PASS + FAIL))"
[ "$FAIL" -eq 0 ]

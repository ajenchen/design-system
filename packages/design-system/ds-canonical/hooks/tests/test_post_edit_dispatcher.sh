#!/bin/bash
# Enforcement-integrity tests for post_edit_dispatcher.sh.
# 2026-11-18 D4-02:dispatcher 由「只出聲」改成「會擋」(outputMode governance-context-or-block)——
# helper exit 2 + stderr-only = 擋;擋與既有違規一起給;其餘異常一律 fail closed(exit 70)。
# 真 dispatcher 的格同時餵兩種輸入形狀:provider 原樣(new_string / edits[])與正式入口 run-provider-hook.mjs 的(content + old_string)。

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$SCRIPT_DIR/../post_edit_dispatcher.sh"
REAL_LIB="$SCRIPT_DIR/../lib"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
FIXTURE=$(mktemp -d)
[ -n "${FIXTURE:-}" ] && [ -d "$FIXTURE" ] || { echo "❌ mktemp -d failed(FIXTURE;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
trap 'rm -rf -- "$FIXTURE"' EXIT
mkdir -p "$FIXTURE/lib"
cp "$SOURCE" "$FIXTURE/post_edit_dispatcher.sh"

HELPERS=(
  _token_hygiene.sh
  _code_quality.sh
  _overlay_handcraft.sh
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
    block-one)
      printf '%s\n' \
        '#!/bin/bash' \
        'cat >/dev/null' \
        'printf '\''block one\n'\'' >&2' \
        'exit 2' >"$FIXTURE/lib/$helper"
      ;;
    block-two)
      printf '%s\n' \
        '#!/bin/bash' \
        'cat >/dev/null' \
        'printf '\''block two\n'\'' >&2' \
        'exit 2' >"$FIXTURE/lib/$helper"
      ;;
    block-with-stdout)
      printf '%s\n' \
        '#!/bin/bash' \
        'cat >/dev/null' \
        'printf '\''{"governanceContext":{"hookEventName":"PostToolUse","message":"mixed"}}\n'\''' \
        'printf '\''mixed block\n'\'' >&2' \
        'exit 2' >"$FIXTURE/lib/$helper"
      ;;
    block-empty)
      printf '#!/bin/bash\ncat >/dev/null\nexit 2\n' >"$FIXTURE/lib/$helper"
      ;;
    block-integrity-marker)
      printf '%s\n' \
        '#!/bin/bash' \
        'cat >/dev/null' \
        'printf '\''GOVERNANCE_INTEGRITY: helper instrument broke\n'\'' >&2' \
        'exit 2' >"$FIXTURE/lib/$helper"
      ;;
    rc1)
      printf '#!/bin/bash\ncat >/dev/null\nexit 1\n' >"$FIXTURE/lib/$helper"
      ;;
    rc70)
      printf '%s\n' \
        '#!/bin/bash' \
        'cat >/dev/null' \
        'printf '\''GOVERNANCE_INTEGRITY: helper verifier unavailable\n'\'' >&2' \
        'exit 70' >"$FIXTURE/lib/$helper"
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

# 擋:helper exit 2 + stderr-only → dispatcher exit 2,stderr 帶齊兩支擋的理由與另一支的既有清單,stdout 空
reset_helpers
write_helper "_token_hygiene.sh" block-one
write_helper "_overlay_handcraft.sh" block-two
write_helper "_code_quality.sh" context-one
run_hook "$VALID_PAYLOAD"
if [ "$EXIT" -eq 2 ] && [ ! -s "$FIXTURE/stdout" ] \
  && grep -qF 'block one' "$FIXTURE/stderr" && grep -qF 'block two' "$FIXTURE/stderr" \
  && grep -qF 'context one' "$FIXTURE/stderr" && ! grep -qF 'GOVERNANCE_INTEGRITY' "$FIXTURE/stderr"; then
  pass 'helper blocks propagate as one stderr-only exit 2 carrying every reason plus existing-violation context'
else
  fail "helper block propagation (got exit $EXIT)"
fi

# 擋的 helper 排在後面也一樣:不得因為前面有人出聲就漏掉後面的擋
reset_helpers
write_helper "_token_hygiene.sh" context-one
write_helper "_governance_coverage_check.sh" block-one
run_hook "$VALID_PAYLOAD"
if [ "$EXIT" -eq 2 ] && [ ! -s "$FIXTURE/stdout" ] && grep -qF 'block one' "$FIXTURE/stderr"; then
  pass 'last helper block still blocks after an earlier context'
else
  fail "late block (got exit $EXIT)"
fi

reset_helpers
write_helper "_story_compile_drift.sh" block-with-stdout
run_hook "$VALID_PAYLOAD"
expect_integrity_failure 'exit 2 that also writes stdout fails closed' 'stderr-only'

reset_helpers
write_helper "_story_compile_drift.sh" block-empty
run_hook "$VALID_PAYLOAD"
expect_integrity_failure 'exit 2 without a reason fails closed' 'stderr-only'

reset_helpers
write_helper "_story_compile_drift.sh" block-integrity-marker
run_hook "$VALID_PAYLOAD"
expect_integrity_failure 'exit 2 carrying the integrity marker is an integrity failure, not a policy block' 'stderr-only'

reset_helpers
write_helper "_governance_coverage_check.sh" rc70
run_hook "$VALID_PAYLOAD"
expect_integrity_failure 'helper exit 70 fails closed and forwards its diagnostic' 'helper verifier unavailable'

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

# 會擋的 helper 換成 symlink 也一樣(D4-02 升為擋的五支各換一次;現有行為不能退化)
for helper in "${HELPERS[@]}"; do
  reset_helpers
  rm -f "$FIXTURE/lib/$helper"
  ln -s "$FIXTURE/clean-target.sh" "$FIXTURE/lib/$helper"
  run_hook "$VALID_PAYLOAD"
  expect_integrity_failure "symlink replacement of blocking helper ${helper} fails closed" 'symlink'
done

reset_helpers
write_helper "_code_quality.sh" rc1
run_hook "$VALID_PAYLOAD"
expect_integrity_failure 'helper exit 1 fails closed' 'exit code 1'

reset_helpers
write_helper "_overlay_handcraft.sh" malformed
run_hook "$VALID_PAYLOAD"
expect_integrity_failure 'malformed helper stdout fails closed' 'malformed or wrong-event envelope'

reset_helpers
write_helper "_overlay_handcraft.sh" wrong-event
run_hook "$VALID_PAYLOAD"
expect_integrity_failure 'wrong-event helper context fails closed' 'malformed or wrong-event envelope'

reset_helpers
write_helper "_code_quality.sh" raw-stderr
run_hook "$VALID_PAYLOAD"
expect_integrity_failure 'raw helper stderr on exit 0 fails closed' 'raw stderr'

reset_helpers
run_hook 'not-json'
expect_integrity_failure 'malformed canonical input fails closed' 'malformed or wrong-event canonical envelope'

run_hook '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"apps/demo/src/App.tsx"}}'
expect_integrity_failure 'misrouted event input fails closed' 'malformed or wrong-event canonical envelope'

# 共用的「新增行」判法不見了 → 會擋的 helper 不得把「量不到」讀成「沒有新增違規」
LIBLESS="$FIXTURE/libless"
mkdir -p "$LIBLESS/lib"
cp "$SOURCE" "$LIBLESS/post_edit_dispatcher.sh"
for helper in "${HELPERS[@]}" _provider_paths.sh; do
  cp "$REAL_LIB/$helper" "$LIBLESS/lib/$helper"
done
LIBLESS_COMPONENT="$FIXTURE/libless-workspace/packages/design-system/src/components/Libless/libless.tsx"
mkdir -p "$(dirname "$LIBLESS_COMPONENT")"
printf '%s\n' 'export const Libless = () => <div className="bg-surface" />' >"$LIBLESS_COMPONENT"
set +e
jq -nc --arg path "$LIBLESS_COMPONENT" \
  '{hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:$path}}' \
  | GOVERNANCE_TELEMETRY_OPT_IN=0 GOVERNANCE_CORPUS_ROOT="$REPO_ROOT" bash "$LIBLESS/post_edit_dispatcher.sh" \
    >"$FIXTURE/stdout" 2>"$FIXTURE/stderr"
EXIT=$?
set -e
expect_integrity_failure 'missing shared added-lines helper fails closed' 'added-lines helper unavailable'

# Exercise the real dispatcher and all five real helpers with both a >256 KiB
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

# 新寫的檔(不在任何 git HEAD 裡)= 每一行都是新增 → 三支會擋的 helper 都擋,一次給齊,沒有 integrity 雜訊
run_real_hook "$REAL_PAYLOAD"
if [ "$(wc -c <"$REAL_COMPONENT" | tr -d ' ')" -gt 262144 ] \
  && [ "$EXIT" -eq 2 ] \
  && [ ! -s "$FIXTURE/stdout" ] \
  && ! grep -qF 'GOVERNANCE_INTEGRITY' "$FIXTURE/stderr" \
  && grep -qF 'Token hygiene:這次編輯新增了違規的行' "$FIXTURE/stderr" \
  && grep -qF 'Code quality:這次編輯新增了違規' "$FIXTURE/stderr" \
  && grep -qF 'Primitive consumption:這次編輯新增了自刻結構' "$FIXTURE/stderr" \
  && ! grep -qF 'i18n hygiene' "$FIXTURE/stderr" \
  && ! grep -qF 'cva/defaultVariants touched' "$FIXTURE/stderr" \
  && ! grep -qF 'Sparse PersonData' "$FIXTURE/stderr"; then
  pass 'real dispatcher blocks a >256 KiB new file with high-match scans, without EPIPE/integrity noise or retired helpers'
else
  fail "real dispatcher large-input/high-match block regression (got exit $EXIT)"
fi

# 同一個檔、這次只新增一行乾淨的程式 → 不擋;既有違規只在 governanceContext 列出(交稽核)
EDIT_PAYLOAD=$(jq -nc --arg path "$REAL_COMPONENT" '{
  hook_event_name: "PostToolUse", tool_name: "Edit",
  tool_input: { file_path: $path, old_string: "import x from \"y\";", new_string: "import { cva } from \"class-variance-authority\";" }
}')
run_real_hook "$EDIT_PAYLOAD"
if [ "$EXIT" -eq 0 ] && [ ! -s "$FIXTURE/stderr" ] \
  && jq -e '
    .governanceContext.hookEventName == "PostToolUse"
    and (.governanceContext.message
      | contains("Token hygiene 既有違規")
        and contains("Code quality 既有違規")
        and contains("Primitive consumption 既有違規"))
  ' "$FIXTURE/stdout" >/dev/null 2>&1; then
  pass 'edit that adds no violating line does not block; existing violations stay visible as context'
else
  fail "existing-violation context on a clean edit (got exit $EXIT)"
fi

# deep-audit 的整檔重播(old_string == new_string == 整檔內容)不是一次真實編輯 → 只列既有,不擋
REPLAY_PAYLOAD=$(jq -Rs --arg path "$REAL_COMPONENT" '{
  hook_event_name: "PostToolUse", tool_name: "Edit",
  tool_input: { file_path: $path, old_string: ., new_string: ., content: ., edits: [{ old_string: ., new_string: . }] }
}' <"$REAL_COMPONENT")
run_real_hook "$REPLAY_PAYLOAD"
if [ "$EXIT" -eq 0 ] && [ ! -s "$FIXTURE/stderr" ] \
  && jq -e '.governanceContext.message | contains("Token hygiene 既有違規")' "$FIXTURE/stdout" >/dev/null 2>&1; then
  pass 'full-file evidence replay reports existing violations as context instead of blocking'
else
  fail "full-file replay classification (got exit $EXIT)"
fi

# ── 正式入口的形狀(WP-15a 審查必修 1、2)──
# 正式路徑是 .claude/settings.json → scripts/run-provider-hook.mjs → 本 dispatcher。runner 交來的 event-v1 輸入
# 沒有 new_string、沒有 edits[](寫入類不帶原始 tool_input;逐檔 payload 只放 path / content / old_string,edits 刪掉):
# Edit 的 content = 那一筆 new_string;MultiEdit 的 content = 每筆 new_string 用換行接起來、old_string 只有第一筆;
# 純刪除時連 content 都不帶。上面每一格都直接餵 provider 原樣(new_string / edits[]),這個形狀一格都沒測到 ——
# 修正前下面兩格「擋」都是 exit 0 + 既有(直接呼叫全綠,正式路徑上三支逐行 helper 從沒擋過)。
RUNNER_COMPONENT="$FIXTURE/workspace/packages/design-system/src/components/RunnerShape/runner-shape.tsx"
mkdir -p "$(dirname "$RUNNER_COMPONENT")"
printf '%s\n' 'export const RunnerShape = () => (' '  <div className="flex shrink-0 shadow-md" />' ')' >"$RUNNER_COMPONENT"
runner_shape_payload() { # <tool> <old_string> <content> —— 欄位照 run-provider-hook.mjs 的 normalizedBase + 逐檔 payload
  jq -nc --arg path "$RUNNER_COMPONENT" --arg tool "$1" --arg o "$2" --arg c "$3" '{
    hook_event_name: "PostToolUse", event: "PostToolUse", tool_name: $tool, tool: $tool, operation: "write",
    tool_input: { file_path: $path, path: $path, old_string: $o, content: $c },
    changed_paths: [$path]
  }'
}
run_real_hook "$(runner_shape_payload Edit 'shrink-0"' 'shrink-0 shadow-md"')"
if [ "$EXIT" -eq 2 ] && [ ! -s "$FIXTURE/stdout" ] \
  && grep -qF 'Token hygiene:這次編輯新增了違規的行' "$FIXTURE/stderr" \
  && grep -qF 'Tailwind 預設陰影' "$FIXTURE/stderr" \
  && ! grep -qF 'GOVERNANCE_INTEGRITY' "$FIXTURE/stderr"; then
  pass 'runner-shape Edit (content + old_string, no new_string) that adds a violation blocks through the real dispatcher'
else
  fail "runner-shape Edit block (got exit $EXIT)"
fi
run_real_hook "$(runner_shape_payload MultiEdit 'RunnerShape0' "$(printf '%s\n%s' 'RunnerShape' 'shrink-0 shadow-md"')")"
if [ "$EXIT" -eq 2 ] && [ ! -s "$FIXTURE/stdout" ] && grep -qF 'Tailwind 預設陰影' "$FIXTURE/stderr" \
  && ! grep -qF 'GOVERNANCE_INTEGRITY' "$FIXTURE/stderr"; then
  pass 'runner-shape MultiEdit (joined content, first old_string only) that adds a violation blocks through the real dispatcher'
else
  fail "runner-shape MultiEdit block (got exit $EXIT)"
fi
# 另一面:同一個檔,runner 形狀的 Edit 改的是別行 → 既有違規只列不擋(寬判不能把別行算成新增)
run_real_hook "$(runner_shape_payload Edit 'RunnerShape0 =' 'RunnerShape =')"
if [ "$EXIT" -eq 0 ] && [ ! -s "$FIXTURE/stderr" ] \
  && jq -e '.governanceContext.message | contains("Token hygiene 既有違規") and contains("shadow-md")' "$FIXTURE/stdout" >/dev/null 2>&1; then
  pass 'runner-shape Edit on another line leaves the existing violation as context instead of blocking'
else
  fail "runner-shape existing-violation context (got exit $EXIT)"
fi

printf 'Passed: %s / %s\n' "$PASS" "$((PASS + FAIL))"
[ "$FAIL" -eq 0 ]

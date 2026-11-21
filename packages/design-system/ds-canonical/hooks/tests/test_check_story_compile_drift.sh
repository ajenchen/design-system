#!/bin/bash
# Contract for lib/_story_compile_drift.sh(2026-11-18 D4-02 起會擋)。
#   - 範圍要真的比得到現行路徑 packages/design-system/src/components/<元件>/(原 `*/design-system/components/*` 搬家後
#     從未觸發 —— 這裡用一支會留下呼叫紀錄的替身 compile-stories.mjs 證明「有在跑」)。
#   - 這次編輯的元件有 drift → exit 2;只有別的元件 drift → exit 0 + 既有;乾淨 → 不出聲;
#     量具失效(腳本不在 / 印不出明細的紅 / 當掉)→ exit 70。
#   - 最後用真的 repo + 真的 compile-stories.mjs 跑一次:現況全綠(2026-11-18:64 個元件對齊、0 drift)。
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../lib/_story_compile_drift.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not exec"; exit 1; }
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
PROJECT=$(mktemp -d)
[ -n "${PROJECT:-}" ] && [ -d "$PROJECT" ] || { echo "❌ mktemp -d failed(PROJECT;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
trap 'rm -rf "$PROJECT"' EXIT
PROJECT="$(cd "$PROJECT" && pwd -P)"
COMP_DIR="$PROJECT/packages/design-system/src/components/Foo"
mkdir -p "$COMP_DIR" "$PROJECT/scripts"
printf '%s\n' 'export const fooMeta = {' '  component: "Foo",' '} as const' > "$COMP_DIR/foo.tsx"
printf '%s\n' 'export const FooPart = () => null' > "$COMP_DIR/foo-part.tsx"
printf '%s\n' '---' 'traits: []' '---' > "$COMP_DIR/foo.spec.md"
printf '%s\n' 'export const Story = {}' > "$COMP_DIR/foo.stories.tsx"
CALLS="$PROJECT/calls.log"
# 替身:記下每次呼叫的參數,依 STUB_MODE 印出 compile-stories.mjs --all --check 的各種結果
cat > "$PROJECT/scripts/compile-stories.mjs" <<'STUB'
import { appendFileSync } from 'node:fs'
appendFileSync(process.env.STUB_CALLS, `${process.argv.slice(2).join(' ')}\n`)
const mode = process.env.STUB_MODE
if (mode === 'clean') { console.log('✅ 2 component(s) canonical aligned; 0 skipped(migration 未做)'); process.exit(0) }
if (mode === 'own') { console.error('❌ 2 component(s) with spec/tsx canonical drift:\n\n  Bar:\n    - sizes spec-only: lg\n  Foo:\n    - variants tsx-only: ghost'); process.exit(1) }
if (mode === 'other') { console.error('❌ 1 component(s) with spec/tsx canonical drift:\n\n  Bar:\n    - sizes spec-only: lg'); process.exit(1) }
if (mode === 'vacuous') { console.error('❌ 0 component(s) compiled; 0 skipped. Refusing vacuous canonical-drift coverage.'); process.exit(1) }
throw new Error('stub crash')
STUB
PASS=0; FAIL=0

run_case() { # <file> <mode>
  : > "$CALLS"
  set +e
  jq -nc --arg path "$1" '{hook_event_name:"PostToolUse",tool_name:"Edit",tool_input:{file_path:$path,old_string:"a",new_string:"b"}}' \
    | STUB_MODE="$2" STUB_CALLS="$CALLS" GOVERNANCE_PROJECT_DIR="$PROJECT" bash "$HOOK" >"$PROJECT/stdout" 2>"$PROJECT/stderr"
  EXIT=$?
  set -e
}
ok() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1(exit $EXIT)"; sed 's/^/    stdout: /' "$PROJECT/stdout"; sed 's/^/    stderr: /' "$PROJECT/stderr"; }
invoked() { grep -qx -- '--all --check' "$CALLS"; }

set -e
echo '=== story compile drift helper(blocking since D4-02)==='

run_case "/tmp/random.txt" clean
if [ "$EXIT" -eq 0 ] && [ ! -s "$PROJECT/stdout" ] && [ ! -s "$PROJECT/stderr" ] && ! invoked; then ok 'non-matching file stays silent and never runs the verifier'; else bad 'non-matching file'; fi

run_case "$COMP_DIR/foo.tsx" clean
if [ "$EXIT" -eq 0 ] && [ ! -s "$PROJECT/stdout" ] && [ ! -s "$PROJECT/stderr" ] && invoked; then ok 'current layout path reaches the verifier(dead-path regression)and clean stays silent'; else bad 'current layout clean'; fi

run_case "$COMP_DIR/foo.tsx" own
if [ "$EXIT" -eq 2 ] && [ ! -s "$PROJECT/stdout" ] && grep -qF 'variants tsx-only: ghost' "$PROJECT/stderr" \
  && ! grep -qF 'sizes spec-only: lg' "$PROJECT/stderr" && ! grep -qF 'GOVERNANCE_INTEGRITY' "$PROJECT/stderr"; then
  ok "edited component's own drift blocks with only its own details"
else bad 'own drift block'; fi

run_case "$COMP_DIR/foo.spec.md" own
if [ "$EXIT" -eq 2 ] && grep -qF 'variants tsx-only: ghost' "$PROJECT/stderr"; then ok 'spec.md edit with own drift blocks'; else bad 'spec drift block'; fi

run_case "$COMP_DIR/foo.tsx" other
if [ "$EXIT" -eq 0 ] && [ ! -s "$PROJECT/stderr" ] \
  && jq -e '.governanceContext.message | contains("既有") and contains("Bar")' "$PROJECT/stdout" >/dev/null 2>&1; then
  ok "another component's drift is existing context, not a block"
else bad 'other drift context'; fi

run_case "$COMP_DIR/foo-part.tsx" own
if [ "$EXIT" -eq 0 ] && [ ! -s "$PROJECT/stdout" ] && ! invoked; then ok 'tsx without a componentMeta export is out of scope'; else bad 'non-meta tsx'; fi

run_case "$COMP_DIR/foo.stories.tsx" own
if [ "$EXIT" -eq 0 ] && ! invoked; then ok 'stories are out of scope'; else bad 'stories scope'; fi

run_case "$COMP_DIR/foo.tsx" vacuous
if [ "$EXIT" -eq 70 ] && grep -qF 'GOVERNANCE_INTEGRITY:' "$PROJECT/stderr"; then ok 'red without a drift report is an instrument failure'; else bad 'vacuous'; fi

run_case "$COMP_DIR/foo.tsx" crash
if [ "$EXIT" -eq 70 ] && grep -qF 'GOVERNANCE_INTEGRITY:' "$PROJECT/stderr"; then ok 'verifier crash fails closed'; else bad 'crash'; fi

mv "$PROJECT/scripts/compile-stories.mjs" "$PROJECT/scripts/compile-stories.mjs.off"
run_case "$COMP_DIR/foo.tsx" clean
if [ "$EXIT" -eq 70 ] && grep -qF 'verifier unavailable' "$PROJECT/stderr"; then ok 'missing verifier fails closed'; else bad 'missing verifier'; fi
mv "$PROJECT/scripts/compile-stories.mjs.off" "$PROJECT/scripts/compile-stories.mjs"

# 真的 repo、真的 compile-stories.mjs:Button 的 tsx 有 componentMeta,現況全綠 → 不出聲
set +e
jq -nc --arg path "$REPO_ROOT/packages/design-system/src/components/Button/button.tsx" \
  '{hook_event_name:"PostToolUse",tool_name:"Edit",tool_input:{file_path:$path,old_string:"a",new_string:"b"}}' \
  | GOVERNANCE_PROJECT_DIR="$REPO_ROOT" bash "$HOOK" >"$PROJECT/stdout" 2>"$PROJECT/stderr"
EXIT=$?
set -e
if [ "$EXIT" -eq 0 ] && [ ! -s "$PROJECT/stdout" ] && [ ! -s "$PROJECT/stderr" ]; then ok 'real repository Button edit is clean against the real verifier'; else bad 'real repository'; fi

echo "Results: $PASS PASS, $FAIL FAIL"
[ "$FAIL" -eq 0 ] || exit 1

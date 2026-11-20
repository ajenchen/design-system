#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../lib/_governance_coverage_check.sh"
ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)" || {
  echo "FATAL: canonical hook test is not inside a Git worktree"
  exit 1
}
ROOT="$(cd "$ROOT" && pwd -P)"
FIXTURE=$(mktemp -d)
if [ -z "${FIXTURE:-}" ] || [ ! -d "$FIXTURE" ]; then
  echo "❌ mktemp -d failed(TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2
  exit 1
fi
trap 'rm -rf "$FIXTURE"' EXIT

write_file() {
  local path="$1"
  mkdir -p "$(dirname "$FIXTURE/$path")"
  cat > "$FIXTURE/$path"
}

git -C "$FIXTURE" init -q
GIT_DIR="$(git -C "$FIXTURE" rev-parse --absolute-git-dir)"
mkdir -p "$FIXTURE/scripts/lib"
cp "$ROOT/scripts/audit-preflight.mjs" "$FIXTURE/scripts/audit-preflight.mjs"
cp "$ROOT/scripts/lib/governance-runtime-evidence.mjs" "$FIXTURE/scripts/lib/governance-runtime-evidence.mjs"
cp "$ROOT/packages/governance/src/closed-tool-execution.mjs" "$FIXTURE/scripts/lib/closed-tool-execution.mjs"
printf '| **M1** | canonical fixture | evidence |\n' | write_file 'packages/design-system/ds-canonical/rules/meta-patterns.md'
printf '# fixture\n' | write_file 'packages/design-system/ds-canonical/rules/self-verify.md'
printf '#!/bin/bash\n' | write_file 'packages/design-system/ds-canonical/hooks/check_fixture.sh'
printf '| 1 | **Fixture dimension** | deterministic |\n' | write_file 'packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md'
printf 'export const Fixture = 1\n' | write_file 'packages/design-system/src/components/Fixture/fixture.tsx'
printf '%s\n' '---' 'traits: []' '---' | write_file 'packages/design-system/src/components/Fixture/fixture.spec.md'
printf '# ordinary documentation\n' | write_file 'docs/fixture.md'
MAP="$FIXTURE/packages/design-system/ds-canonical/references/principle-dim-map.json"
printf '%s\n' '{"mRules":{"M1":{"dims":[1]}},"traits":{},"hooks":{"fixture":{"dims":[1]}}}' | write_file 'packages/design-system/ds-canonical/references/principle-dim-map.json'

# 2026-11-18 D4-02 起會擋:缺口 → exit 2(只寫 stderr);量具失效 → exit 70(GOVERNANCE_INTEGRITY)。
# run_hook <payload>:把 exit code / stdout / stderr 分開收,不讓 set -e 在預期的非 0 上中斷。
run_hook() {
  set +e
  printf '%s' "$1" | GOVERNANCE_PROJECT_DIR="$FIXTURE" GOVERNANCE_READ_ONLY=1 bash "$HOOK" >"$FIXTURE/.hook-stdout" 2>"$FIXTURE/.hook-stderr"
  EXIT=$?
  set -e
}
expect_integrity() { # <name>
  if [ "$EXIT" -eq 70 ] && [ ! -s "$FIXTURE/.hook-stdout" ] && grep -qF 'GOVERNANCE_INTEGRITY:' "$FIXTURE/.hook-stderr"; then
    echo "  PASS  $1"
  else
    echo "FAIL: $1(exit $EXIT)"; cat "$FIXTURE/.hook-stdout" "$FIXTURE/.hook-stderr"; exit 1
  fi
}

# Poisoned provider-local/workspace reports may not create a warning when the current check passes.
printf '%s\n' '{"coverageGaps":999,"gaps":["poison"]}' | write_file '.claude/logs/audit-preflight-2099-01-01.json'
printf '%s\n' '{"coverageGaps":999,"gaps":["workspace-poison"]}' | write_file 'infra/governance/runtime/audit/preflight/audit-preflight-2099-01-01.json'
PAYLOAD=$(jq -nc --arg path "$FIXTURE/packages/design-system/ds-canonical/rules/meta-patterns.md" '{tool_input:{file_path:$path}}')
run_hook "$PAYLOAD"
[ "$EXIT" -eq 0 ] && [ ! -s "$FIXTURE/.hook-stdout" ] && [ ! -s "$FIXTURE/.hook-stderr" ] || { echo "FAIL: stale provider report affected passing check(exit $EXIT)"; exit 1; }
echo '  PASS  passing current-run report ignores poisoned provider/workspace reports'

# An exit code alone is not a machine report. A broken preflight process is an instrument failure
# (exit 70),never a gap and never a silent pass.
cp "$FIXTURE/scripts/audit-preflight.mjs" "$FIXTURE/scripts/audit-preflight.real.mjs"
printf '%s\n' 'process.exit(1)' > "$FIXTURE/scripts/audit-preflight.mjs"
run_hook "$PAYLOAD"
expect_integrity 'missing current-run machine report fails closed as an instrument failure'

SPEC_PAYLOAD=$(jq -nc --arg path "$FIXTURE/packages/design-system/src/components/Fixture/fixture.spec.md" '{tool_input:{file_path:$path}}')
run_hook "$SPEC_PAYLOAD"
expect_integrity 'component *.spec.md edits trigger the coverage verifier'

NON_GOV_PAYLOAD=$(jq -nc --arg path "$FIXTURE/docs/fixture.md" '{tool_input:{file_path:$path}}')
run_hook "$NON_GOV_PAYLOAD"
[ "$EXIT" -eq 0 ] && [ ! -s "$FIXTURE/.hook-stdout" ] && [ ! -s "$FIXTURE/.hook-stderr" ] || { echo "FAIL: ordinary documentation triggered governance coverage"; exit 1; }
echo '  PASS  ordinary documentation remains out of scope'

rm "$FIXTURE/scripts/audit-preflight.mjs"
run_hook "$PAYLOAD"
expect_integrity 'missing verifier executable fails closed'
mv "$FIXTURE/scripts/audit-preflight.real.mjs" "$FIXTURE/scripts/audit-preflight.mjs"

# 兩面對照:同一份 fixture,拿掉 M1 的 dim 對應 → 擋(exit 2,只寫 stderr,帶出當次的缺口);還原 → 不出聲。
printf '%s\n' '{"mRules":{},"traits":{},"hooks":{"fixture":{"dims":[1]}}}' > "$MAP"
run_hook "$PAYLOAD"
if [ "$EXIT" -eq 2 ] && [ ! -s "$FIXTURE/.hook-stdout" ] \
  && grep -qF '1 條原則沒有任何 audit dim 涵蓋' "$FIXTURE/.hook-stderr" && grep -qF 'meta-pattern:M1' "$FIXTURE/.hook-stderr" \
  && ! grep -qF 'GOVERNANCE_INTEGRITY' "$FIXTURE/.hook-stderr"; then
  echo '  PASS  failing current-run JSON blocks with the exact gap and no report write'
else
  echo "FAIL: coverage gap must block(exit $EXIT)"; cat "$FIXTURE/.hook-stdout" "$FIXTURE/.hook-stderr"; exit 1
fi

if [ -e "$GIT_DIR/governance-runtime" ]; then
  echo 'FAIL: --check wrote runtime evidence'
  exit 1
fi

rm -rf "$FIXTURE/.claude"
run_hook "$PAYLOAD"
if [ "$EXIT" -eq 2 ] && grep -qF 'meta-pattern:M1' "$FIXTURE/.hook-stderr"; then
  echo '  PASS  deleting .claude does not change the coverage verdict'
else
  echo "FAIL: deleting .claude changed the coverage verdict(exit $EXIT)"; exit 1
fi

printf '%s\n' '{"mRules":{"M1":{"dims":[1]}},"traits":{},"hooks":{"fixture":{"dims":[1]}}}' > "$MAP"
run_hook "$PAYLOAD"
[ "$EXIT" -eq 0 ] && [ ! -s "$FIXTURE/.hook-stdout" ] && [ ! -s "$FIXTURE/.hook-stderr" ] || { echo "FAIL: restored dim map must be silent(exit $EXIT)"; exit 1; }
echo '  PASS  restoring the dim mapping returns to silent(control group)'

echo '✅ governance coverage current-report test PASS'

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

# Poisoned provider-local/workspace reports may not create a warning when the current check passes.
printf '%s\n' '{"coverageGaps":999,"gaps":["poison"]}' | write_file '.claude/logs/audit-preflight-2099-01-01.json'
printf '%s\n' '{"coverageGaps":999,"gaps":["workspace-poison"]}' | write_file 'infra/governance/runtime/audit/preflight/audit-preflight-2099-01-01.json'
PAYLOAD=$(jq -nc --arg path "$FIXTURE/packages/design-system/ds-canonical/rules/meta-patterns.md" '{tool_input:{file_path:$path}}')
OUTPUT=$(printf '%s' "$PAYLOAD" | GOVERNANCE_PROJECT_DIR="$FIXTURE" GOVERNANCE_READ_ONLY=1 bash "$HOOK")
[ -z "$OUTPUT" ] || { echo "FAIL: stale provider report affected passing check"; exit 1; }
echo '  PASS  passing current-run report ignores poisoned provider/workspace reports'

# An exit code alone is not a machine report. A broken preflight process must
# produce the explicit fail-closed context instead of masquerading as a gap.
cp "$FIXTURE/scripts/audit-preflight.mjs" "$FIXTURE/scripts/audit-preflight.real.mjs"
printf '%s\n' 'process.exit(1)' > "$FIXTURE/scripts/audit-preflight.mjs"
OUTPUT=$(printf '%s' "$PAYLOAD" | GOVERNANCE_PROJECT_DIR="$FIXTURE" GOVERNANCE_READ_ONLY=1 bash "$HOOK")
printf '%s' "$OUTPUT" | jq -e '.governanceContext.message | contains("無法產生當次 machine report")' >/dev/null
echo '  PASS  missing current-run machine report fails closed'

SPEC_PAYLOAD=$(jq -nc --arg path "$FIXTURE/packages/design-system/src/components/Fixture/fixture.spec.md" '{tool_input:{file_path:$path}}')
OUTPUT=$(printf '%s' "$SPEC_PAYLOAD" | GOVERNANCE_PROJECT_DIR="$FIXTURE" GOVERNANCE_READ_ONLY=1 bash "$HOOK")
printf '%s' "$OUTPUT" | jq -e '.governanceContext.message | contains("無法產生當次 machine report")' >/dev/null
echo '  PASS  component *.spec.md edits trigger the coverage verifier'

NON_GOV_PAYLOAD=$(jq -nc --arg path "$FIXTURE/docs/fixture.md" '{tool_input:{file_path:$path}}')
OUTPUT=$(printf '%s' "$NON_GOV_PAYLOAD" | GOVERNANCE_PROJECT_DIR="$FIXTURE" GOVERNANCE_READ_ONLY=1 bash "$HOOK")
[ -z "$OUTPUT" ] || { echo "FAIL: ordinary documentation triggered governance coverage"; exit 1; }
echo '  PASS  ordinary documentation remains out of scope'

rm "$FIXTURE/scripts/audit-preflight.mjs"
OUTPUT=$(printf '%s' "$PAYLOAD" | GOVERNANCE_PROJECT_DIR="$FIXTURE" GOVERNANCE_READ_ONLY=1 bash "$HOOK")
printf '%s' "$OUTPUT" | jq -e '.governanceContext.message | contains("無法產生當次 machine report")' >/dev/null
mv "$FIXTURE/scripts/audit-preflight.real.mjs" "$FIXTURE/scripts/audit-preflight.mjs"
echo '  PASS  missing verifier executable fails closed'

# The exact failing run supplies count/sample directly on stdout; no dated file exists.
printf '%s\n' '{"mRules":{},"traits":{},"hooks":{"fixture":{"dims":[1]}}}' > "$MAP"
OUTPUT=$(printf '%s' "$PAYLOAD" | GOVERNANCE_PROJECT_DIR="$FIXTURE" GOVERNANCE_READ_ONLY=1 bash "$HOOK")
printf '%s' "$OUTPUT" | jq -e '.governanceContext.message | contains("1 原則無 audit dim cover") and contains("meta-pattern:M1")' >/dev/null
echo '  PASS  failing current-run JSON supplies exact gap without a report write'

if [ -e "$GIT_DIR/governance-runtime" ]; then
  echo 'FAIL: --check wrote runtime evidence'
  exit 1
fi

rm -rf "$FIXTURE/.claude"
OUTPUT=$(printf '%s' "$PAYLOAD" | GOVERNANCE_PROJECT_DIR="$FIXTURE" GOVERNANCE_READ_ONLY=1 bash "$HOOK")
printf '%s' "$OUTPUT" | jq -e '.governanceContext.message | contains("meta-pattern:M1")' >/dev/null
echo '  PASS  deleting .claude does not change coverage warning'

echo '✅ governance coverage current-report test PASS'

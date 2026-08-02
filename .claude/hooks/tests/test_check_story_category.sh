#!/bin/bash
# Tests for check_story_category.sh
# Verifies trait-based compliance enforcement

set -u

export GOVERNANCE_PROVIDER=codex
export GOVERNANCE_READ_ONLY=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Cluster A merge(2026-05-10):check_story_category.sh fold 進
# check_story_invariants.sh dispatcher R3。Test 走 dispatcher。
HOOK="$SCRIPT_DIR/../check_story_invariants.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }

PASS=0; FAIL=0; FAILED=""

setup_proj() {
  TMP_PROJ=$(mktemp -d)
  mkdir -p "$TMP_PROJ/src/design-system/components/Foo" "$TMP_PROJ/.claude/hooks"
  echo 'log_hook_fire() { :; }' > "$TMP_PROJ/.claude/hooks/_log-fire.sh"
}
teardown_proj() { rm -rf "$TMP_PROJ"; }

run_hook() {
  local content="$1"
  local file_path="$2"
  local payload
  payload=$(jq -n \
    --arg fp "$file_path" \
    --arg ct "$content" \
    '{hook_event_name:"PreToolUse", tool_name:"Write", tool_input:{file_path:$fp, content:$ct}}')
  STDOUT=$(echo "$payload" | bash "$HOOK" 2>&1)
  EXIT=$?
}

run_proposed_hook() {
  local content="$1"
  local file_path="$2"
  local relative_path="$3"
  local payload
  payload=$(jq -n \
    --arg fp "$file_path" \
    --arg rp "$relative_path" \
    --arg ct "$content" \
    '{
      hook_event_name:"PreToolUse",
      tool_name:"Edit",
      tool_input:{
        file_path:$fp,
        new_string:"raw fragment must not win",
        governance_write_state:{
          schemaVersion:1,
          path:$rp,
          kind:"text",
          content:$ct
        }
      }
    }')
  STDOUT=$(printf '%s' "$payload" \
    | GOVERNANCE_PROJECT_DIR="$TMP_PROJ" GOVERNANCE_WRITE_STATE_TRUST=runner-v1 \
      bash "$HOOK" 2>&1)
  EXIT=$?
}

# ── Test 1: no spec.md → silent pass ─────────────────────────────────────────
echo "Test 1: no spec.md → silent pass"
setup_proj
run_hook "export const Default = {};" "$TMP_PROJ/src/design-system/components/Foo/foo.stories.tsx"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then
  echo "  PASS  Test 1"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 1 (exit=$EXIT, output=${STDOUT:0:100})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 1"
fi
teardown_proj

# ── Test 2: spec without traits frontmatter → silent pass ────────────────────
echo "Test 2: spec without traits → silent pass"
setup_proj
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.spec.md" <<EOF
# Foo
Some content.
EOF
run_hook "export const Default = {};" "$TMP_PROJ/src/design-system/components/Foo/foo.stories.tsx"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then
  echo "  PASS  Test 2"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 2 (exit=$EXIT, output=${STDOUT:0:100})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 2"
fi
teardown_proj

# ── Test 3: hasSizes trait + AllSizes present → pass ─────────────────────────
echo "Test 3: hasSizes + AllSizes present → pass"
setup_proj
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.spec.md" <<EOF
---
component: Foo
traits:
  - hasSizes
  - hasInteractiveStates
---
# Foo
EOF
run_hook "export const Default = {};
export const AllSizes = {};
export const Disabled = {};" "$TMP_PROJ/src/design-system/components/Foo/foo.stories.tsx"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then
  echo "  PASS  Test 3"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 3 (exit=$EXIT, output=${STDOUT:0:200})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 3"
fi
teardown_proj

# ── Test 4: hasSizes trait + per-size split → BLOCK ──────────────────────────
echo "Test 4: hasSizes + Small/Medium/Large split → block P0"
setup_proj
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.spec.md" <<EOF
---
traits:
  - hasSizes
---
EOF
run_hook "export const Default = {};
export const Small = {};
export const Medium = {};
export const Large = {};" "$TMP_PROJ/src/design-system/components/Foo/foo.stories.tsx"
if [ "$EXIT" = "2" ] && echo "$STDOUT" | grep -q "hasSizes → per-size split"; then
  echo "  PASS  Test 4 per-size split blocked"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 4 (exit=$EXIT, output=${STDOUT:0:200})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 4"
fi
teardown_proj

# ── Test 5: isOverlay trait + no OpenSnapshot → BLOCK ────────────────────────
echo "Test 5: isOverlay + no OpenSnapshot → block P0"
setup_proj
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.spec.md" <<EOF
---
traits:
  - isOverlay
---
EOF
run_hook "export const Default = {};" "$TMP_PROJ/src/design-system/components/Foo/foo.stories.tsx"
if [ "$EXIT" = "2" ] && echo "$STDOUT" | grep -q "isOverlay"; then
  echo "  PASS  Test 5 overlay missing OpenSnapshot blocked"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 5 (exit=$EXIT, output=${STDOUT:0:200})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 5"
fi
teardown_proj

# ── Test 6: isOverlay + defaultOpen present → pass ───────────────────────────
echo "Test 6: isOverlay + defaultOpen=true present → pass"
setup_proj
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.spec.md" <<EOF
---
traits:
  - isOverlay
---
EOF
run_hook "export const Default = { args: { defaultOpen: true } };" "$TMP_PROJ/src/design-system/components/Foo/foo.stories.tsx"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then
  echo "  PASS  Test 6 defaultOpen ✓ pass"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 6 (exit=$EXIT, output=${STDOUT:0:200})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 6"
fi
teardown_proj

# ── Test 7: valid scoped rationale ───────────────────────────────────────────
echo "Test 7: valid scoped @story-trait-rationale → pass"
setup_proj
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.spec.md" <<EOF
---
traits:
  - isInputLike
---
EOF
run_hook "// @story-trait-rationale: isInputLike -> Validation — Validation renders invalid chrome and recovery, so an error-only duplicate adds no teaching value.
export const Validation = {};" "$TMP_PROJ/src/design-system/components/Foo/foo.stories.tsx"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then
  echo "  PASS  Test 7 scoped rationale works"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 7 (exit=$EXIT, output=${STDOUT:0:200})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 7"
fi
teardown_proj

# ── Test 8: anatomy/principles stories skipped ──────────────────────────────
echo "Test 8: .anatomy.stories.tsx skipped(not subject to trait typology)"
setup_proj
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.spec.md" <<EOF
---
traits:
  - hasSizes
---
EOF
run_hook "export const Small = {};" "$TMP_PROJ/src/design-system/components/Foo/foo.anatomy.stories.tsx"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then
  echo "  PASS  Test 8 anatomy stories exempted"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 8 (exit=$EXIT, output=${STDOUT:0:200})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 8"
fi
teardown_proj

# ── Test 9: trusted after-image cannot borrow removed exports from disk ───────
echo "Test 9: proposed removal of required export → block"
setup_proj
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.spec.md" <<EOF
---
traits:
  - hasSizes
---
EOF
STORY_REL="src/design-system/components/Foo/foo.stories.tsx"
STORY_PATH="$TMP_PROJ/$STORY_REL"
cat > "$STORY_PATH" <<EOF
export const Default = {};
export const AllSizes = {};
EOF
run_proposed_hook "export const Default = {};" "$STORY_PATH" "$STORY_REL"
if [ "$EXIT" = "2" ] && echo "$STDOUT" | grep -q "missing AllSizes"; then
  echo "  PASS  Test 9 old-disk export gives no proposed-state credit"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 9 (exit=$EXIT, output=${STDOUT:0:200})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 9"
fi
teardown_proj

# ── Test 10: removing a trait escape marker takes effect immediately ─────────
echo "Test 10: proposed removal of trait rationale → block"
setup_proj
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.spec.md" <<EOF
---
traits:
  - hasSizes
---
EOF
STORY_REL="src/design-system/components/Foo/foo.stories.tsx"
STORY_PATH="$TMP_PROJ/$STORY_REL"
cat > "$STORY_PATH" <<EOF
// @story-trait-rationale: hasSizes -> Baseline — Baseline renders the complete size comparison in one reader-facing scenario.
export const Baseline = {};
EOF
run_proposed_hook "export const Baseline = {};" "$STORY_PATH" "$STORY_REL"
if [ "$EXIT" = "2" ] && echo "$STDOUT" | grep -q "missing AllSizes"; then
  echo "  PASS  Test 10 stale disk marker gives no proposed-state exemption"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 10 (exit=$EXIT, output=${STDOUT:0:200})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 10"
fi
teardown_proj

# ── Test 11: legacy file-wide marker is malformed ───────────────────────────
echo "Test 11: legacy file-wide trait marker → block"
setup_proj
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.spec.md" <<EOF
---
traits:
  - hasSizes
---
EOF
run_hook "// @story-trait-rationale: experimental design exploration
export const Baseline = {};" "$TMP_PROJ/src/design-system/components/Foo/foo.stories.tsx"
if [ "$EXIT" = "2" ] && echo "$STDOUT" | grep -q "malformed @story-trait-rationale"; then
  echo "  PASS  Test 11 file-wide escape blocked"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 11 (exit=$EXIT, output=${STDOUT:0:240})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 11"
fi
teardown_proj

# ── Test 12: rationale trait must be declared ────────────────────────────────
echo "Test 12: rationale for undeclared trait → block"
setup_proj
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.spec.md" <<EOF
---
traits:
  - hasSizes
---
EOF
run_hook "// @story-trait-rationale: isInputLike -> Validation — Validation already renders the resolved invalid state.
export const Validation = {};
export const AllSizes = {};" "$TMP_PROJ/src/design-system/components/Foo/foo.stories.tsx"
if [ "$EXIT" = "2" ] && echo "$STDOUT" | grep -q "trait not declared in spec"; then
  echo "  PASS  Test 12 undeclared trait blocked"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 12 (exit=$EXIT, output=${STDOUT:0:240})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 12"
fi
teardown_proj

# ── Test 13: rationale target must exist ─────────────────────────────────────
echo "Test 13: rationale target missing → block"
setup_proj
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.spec.md" <<EOF
---
traits:
  - isInputLike
---
EOF
run_hook "// @story-trait-rationale: isInputLike -> Validation — Validation already renders the resolved invalid state.
export const Baseline = {};" "$TMP_PROJ/src/design-system/components/Foo/foo.stories.tsx"
if [ "$EXIT" = "2" ] && echo "$STDOUT" | grep -q "target export missing: Validation"; then
  echo "  PASS  Test 13 missing target blocked"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 13 (exit=$EXIT, output=${STDOUT:0:240})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 13"
fi
teardown_proj

# ── Test 14: deferred reasons are not rationales ─────────────────────────────
echo "Test 14: deferred rationale → block"
setup_proj
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.spec.md" <<EOF
---
traits:
  - isInputLike
---
EOF
run_hook "// @story-trait-rationale: isInputLike -> Validation — WithError is tracked separately for later.
export const Validation = {};" "$TMP_PROJ/src/design-system/components/Foo/foo.stories.tsx"
if [ "$EXIT" = "2" ] && echo "$STDOUT" | grep -q "reason is deferred"; then
  echo "  PASS  Test 14 deferred reason blocked"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 14 (exit=$EXIT, output=${STDOUT:0:240})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 14"
fi
teardown_proj

# ── Test 15: marker only satisfies its exact trait ───────────────────────────
echo "Test 15: scoped marker cannot exempt another trait"
setup_proj
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.spec.md" <<EOF
---
traits:
  - hasSizes
  - isInputLike
---
EOF
run_hook "// @story-trait-rationale: hasSizes -> Baseline — Baseline renders every supported size in one comparison.
export const Baseline = {};" "$TMP_PROJ/src/design-system/components/Foo/foo.stories.tsx"
if [ "$EXIT" = "2" ] && echo "$STDOUT" | grep -q "isInputLike → missing WithError" && ! echo "$STDOUT" | grep -q "hasSizes → missing"; then
  echo "  PASS  Test 15 exact-trait scope enforced"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 15 (exit=$EXIT, output=${STDOUT:0:260})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 15"
fi
teardown_proj

# ── Test 16: typed anatomy export receives structural credit ────────────────
echo "Test 16: typed anatomy SizeMatrix → pass"
setup_proj
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.spec.md" <<EOF
---
traits:
  - hasSizes
---
EOF
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.anatomy.stories.tsx" <<EOF
import type { StoryObj } from '@storybook/react';
type Story = StoryObj;
export const SizeMatrix: Story = {};
EOF
run_hook "export const Representative = {};" "$TMP_PROJ/src/design-system/components/Foo/foo.stories.tsx"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then
  echo "  PASS  Test 16 typed anatomy export credited"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 16 (exit=$EXIT, output=${STDOUT:0:240})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 16"
fi
teardown_proj

# ── Test 17: scoped anatomy omission rationale receives credit ───────────────
echo "Test 17: anatomy SizeMatrix rationale → pass"
setup_proj
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.spec.md" <<EOF
---
traits:
  - hasSizes
---
EOF
cat > "$TMP_PROJ/src/design-system/components/Foo/foo.anatomy.stories.tsx" <<EOF
// @anatomy-rationale:
//   SizeMatrix represented by Overview — the component has one fixed visual tier.
import type { StoryObj } from '@storybook/react';
export const Overview = {};
EOF
run_hook "export const Representative = {};" "$TMP_PROJ/src/design-system/components/Foo/foo.stories.tsx"
if [ "$EXIT" = "0" ] && [ -z "$STDOUT" ]; then
  echo "  PASS  Test 17 anatomy rationale credited"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 17 (exit=$EXIT, output=${STDOUT:0:240})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 17"
fi
teardown_proj

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "  Results: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED"; exit 1
fi
exit 0

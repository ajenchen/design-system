#!/bin/bash
# Tests for check_full_story_visual_interaction_sweep.sh(P0 BLOCKER,codex M31 2026-05-27)
#
# Hook 規則(PreToolUse,Write|Edit|MultiEdit):
#   - File gate:tool_input.file_path 必 match `(sweep|audit-report)\.json$`,否則 silent。
#   - Content 必為 schema-valid report JSON；空/壞 JSON → integrity 70。
#   - Escape:valid report 的 `_sampling_allowed` 非空 rationale → silent。
#   - Story count:`.storyResults // .results | length`,fallback `.storySummary.total // .summary.total // .total`。
#   - Manifest:$GOVERNANCE_PROJECT_DIR/packages/design-system/ds-story-manifest.json .totalStories。
#       manifest 不存在 / malformed / total=0 → integrity 70。STORY_COUNT=0 → policy block 2。
#   - BLOCKER:STORY_COUNT < MANIFEST_TOTAL → exit 2 + stderr「FULL-STORY-SWEEP BLOCKER」。
#   - STORY_COUNT >= MANIFEST_TOTAL → silent(全跑通過)。
#
# Non-Write/Edit tool / 非 sweep|audit-report 檔名 → silent。
#
# Determinism:TMP_DIR + GOVERNANCE_PROJECT_DIR override(manifest fixture totalStories=916),
# 不碰 repo 真 manifest / 不寫 repo logs。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_full_story_visual_interaction_sweep.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# Override GOVERNANCE_PROJECT_DIR so manifest lookup + _log-fire land in TMP_DIR
# (不污染 repo packages/ 與 .claude/logs/)
export GOVERNANCE_PROJECT_DIR="$TMP_DIR"
mkdir -p "$TMP_DIR/.claude/logs"
mkdir -p "$TMP_DIR/packages/design-system"

MANIFEST="$TMP_DIR/packages/design-system/ds-story-manifest.json"
MANIFEST_TOTAL=916
# Deterministic manifest fixture(mirrors real SSOT totalStories at write time)
jq -n --argjson t "$MANIFEST_TOTAL" '{totalStories:$t}' > "$MANIFEST"

# run_hook: feed Write/Edit JSON payload via stdin.
#   $1 = file_path
#   $2 = content (goes into tool_input.content)
#   $3 = tool_name (default Write)
#   $4 = use_new_string ("1" → put $2 into tool_input.new_string instead of content)
run_hook() {
  local file_path="$1"; local content="$2"
  local tool="${3:-Write}"; local use_new_string="${4:-0}"
  local payload
  if [ "$use_new_string" = "1" ]; then
    payload=$(jq -n --arg fp "$file_path" --arg c "$content" --arg tn "$tool" \
      '{hook_event_name:"PreToolUse", tool_name:$tn, tool_input:{file_path:$fp, new_string:$c}}')
  else
    payload=$(jq -n --arg fp "$file_path" --arg c "$content" --arg tn "$tool" \
      '{hook_event_name:"PreToolUse", tool_name:$tn, tool_input:{file_path:$fp, content:$c}}')
  fi
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent, exit=$EXIT, stderr=$([ -n "$STDERR_TEXT" ] && echo non-empty || echo empty))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_block() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected BLOCK exit=2 + '$needle', got exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_integrity() {
  local name="$1"; local needle="${2:-GOVERNANCE_INTEGRITY:}"
  if [ "$EXIT" = "70" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected integrity exit=70 + '$needle', got exit=$EXIT)"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

# Build a sampled audit-report content (storyResults array of N entries)
sampled_results() {
  local n="$1"
  jq -n --argjson n "$n" '{storyResults:[range(0;$n)|{id:("s"+(.|tostring)), pass:true}]}'
}

echo "=== check_full_story_visual_interaction_sweep tests ==="

# ── POSITIVE cases(SHOULD BLOCK)──────────────────────────────────

# 1. POSITIVE: audit-report.json with 900 < 916 stories → BLOCK
run_hook "/tmp/codex-2026-sweep/audit-report.json" "$(sampled_results 900)"
expect_block "1. [POS] audit-report.json sampled 900<916 → BLOCK" "FULL-STORY-SWEEP BLOCKER"

# 2. POSITIVE: filename ending *-sweep.json (the OTHER regex branch) → BLOCK
#    Guards the file-gate regex breadth: both `sweep` and `audit-report` must fire.
run_hook "/tmp/claude-visual-sweep.json" "$(sampled_results 1)"
expect_block "2. [POS] *-sweep.json sampled 1<916 → BLOCK (file-gate breadth)" "FULL-STORY-SWEEP BLOCKER"

# 3. POSITIVE (near-complete, M34 over-narrow guard): 915 < 916 by one story → BLOCK
#    Guards against a hook that only fires on grossly-undersampled reports.
run_hook "/tmp/codex-sweep/audit-report.json" "$(sampled_results 915)"
expect_block "3. [POS] off-by-one 915<916 → BLOCK (no slack)" "FULL-STORY-SWEEP BLOCKER"

# 4. POSITIVE via fallback field: summary.total=500 (no storyResults) → BLOCK
run_hook "/tmp/x-sweep.json" '{"summary":{"total":500}}'
expect_block "4. [POS] fallback summary.total=500<916 → BLOCK" "FULL-STORY-SWEEP BLOCKER"

# 5. POSITIVE via Edit tool + new_string field → BLOCK
run_hook ".claude/snapshots/visual-audit-report.json" "$(sampled_results 100)" "Edit" "1"
expect_block "5. [POS] Edit new_string sampled 100<916 → BLOCK" "FULL-STORY-SWEEP BLOCKER"

# ── NEGATIVE cases(should NOT block)──────────────────────────────

# 6. NEGATIVE: full sweep storyResults == 916 → silent
run_hook "/tmp/codex-2026-sweep/audit-report.json" "$(sampled_results 916)"
expect_pass_silent "6. [NEG] full 916==916 → silent (complete sweep passes)"

# 7. NEGATIVE: over-count 920 >= 916 → silent (hook uses < not !=)
run_hook "/tmp/codex-2026-sweep/audit-report.json" "$(sampled_results 920)"
expect_pass_silent "7. [NEG] 920>=916 → silent"

# 8. NEGATIVE escape: sampled but `_sampling_allowed` rationale present → silent
run_hook "/tmp/codex-sweep/audit-report.json" \
  '{"_sampling_allowed":"smoke test only","storyResults":[{"id":"s0"}]}'
expect_pass_silent "8. [NEG] _sampling_allowed escape → silent"

# 9. NEGATIVE near-miss filename (M34 over-broad guard):
#    "sweeper-config.json" / "audit-reporter.json" do NOT end in (sweep|audit-report).json
run_hook "/tmp/sweeper-config.json" "$(sampled_results 1)"
expect_pass_silent "9. [NEG] sweeper-config.json (not *sweep.json) → silent (regex not over-broad)"

# 10. NEGATIVE near-miss filename: audit-reporter.json (suffix, not audit-report.json)
run_hook "/tmp/audit-reporter.json" "$(sampled_results 1)"
expect_pass_silent "10. [NEG] audit-reporter.json → silent (regex anchored, not over-broad)"

# 11. NEGATIVE: unrelated .json file (regular config) → silent
run_hook "/tmp/some-component-data.json" "$(sampled_results 1)"
expect_pass_silent "11. [NEG] unrelated *.json → silent (file gate)"

# 12. NEGATIVE: non-Write/Edit tool (Read) on a sweep file → silent
run_hook "/tmp/codex-sweep/audit-report.json" "$(sampled_results 1)" "Read"
expect_pass_silent "12. [NEG] tool=Read → silent (event gate)"

# 13. A schema-valid audit report with no coverage is a real policy violation.
run_hook "/tmp/codex-sweep/audit-report.json" '{"meta":{"note":"warmup"}}'
expect_block "13. [POS] valid report with count=0 → BLOCK" "FULL-STORY-SWEEP BLOCKER"

# 14. Empty report content is invalid enforcement evidence.
run_hook "/tmp/codex-sweep/audit-report.json" ""
expect_integrity "14. empty report → integrity failure" "report is malformed or invalid"

# 15. Missing manifest means the hook cannot evaluate completeness.
#     Temporarily point at a project dir without a manifest.
NOMANIFEST_DIR=$(mktemp -d)
mkdir -p "$NOMANIFEST_DIR/.claude/logs"
payload=$(jq -n --arg fp "/tmp/codex-sweep/audit-report.json" --arg c "$(sampled_results 10)" \
  '{hook_event_name:"PreToolUse", tool_name:"Write", tool_input:{file_path:$fp, content:$c}}')
STDOUT=$(mktemp); STDERR=$(mktemp)
set +e
printf '%s' "$payload" | GOVERNANCE_PROJECT_DIR="$NOMANIFEST_DIR" bash "$HOOK" >"$STDOUT" 2>"$STDERR"
EXIT=$?
set -e
STDERR_TEXT=$(cat "$STDERR")
rm -f "$STDOUT" "$STDERR"
expect_integrity "15. manifest missing → integrity failure" "manifest is unavailable or unsafe"
rm -rf "$NOMANIFEST_DIR"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

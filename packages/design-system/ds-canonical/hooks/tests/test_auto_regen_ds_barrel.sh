#!/bin/bash
# Tests for auto_regen_ds_barrel.sh(2026-05-25 SSOT auto-sync invariant)
#
# Hook 規則(PostToolUse Write|Edit|MultiEdit,reads tool_input.file_path):
#   - 這是 auto-fix-up hook,不是 policy BLOCKER；成功/no-op exit 0。
#   - generator/config/tool fault 則以 GOVENANCE_INTEGRITY + exit 70 fail closed。
#   - "Fire"(positive)= 在 stdout emit JSON additionalContext(hookSpecificOutput),
#     發生條件:file_path 在 packages/design-system/src/(components|patterns|hooks|lib)/
#     且非 stories/spec/test,且 gen-design-system-barrel.mjs 輸出含 'generated' / 'with N components'。
#   - "Silent"(negative)= 無 stdout(exit 0),發生條件:
#       (a) file_path 空
#       (b) file_path 不在 scope(components|patterns|hooks|lib)
#       (c) file_path 是 .stories/.spec/.test/.spec.md
#       (d) barrel 腳本沒印 'generated' 關鍵字
#
# Determinism:GOVERNANCE_PROJECT_DIR 指向 TMP_DIR,內含 **stub** gen scripts,
#   控制 barrel 是否印 'generated' + 不污染 real repo barrel 檔案。Hook 在 line 38-39
#   會 cd 進 GOVERNANCE_PROJECT_DIR 再 `node scripts/...`。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../auto_regen_ds_barrel.sh"

if [ ! -f "$HOOK" ]; then echo "FATAL: hook not found: $HOOK"; exit 1; fi
if ! command -v node >/dev/null 2>&1; then echo "FATAL: node not on PATH (hook 需要 node)"; exit 1; fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# --- Build isolated project dir with stub gen scripts ----------------------
# index 腳本只需成功 run;barrel 腳本控制是否印 'generated'(emission gate)。
mkdir -p "$TMP_DIR/scripts" "$TMP_DIR/.claude/logs"
cat > "$TMP_DIR/scripts/gen-component-indexes.mjs" <<'EOF'
console.log("component indexes regenerated");
EOF

# Default barrel stub = 印 'generated'(讓 in-scope case 會 emit)
write_barrel_with_generated() {
  cat > "$TMP_DIR/scripts/gen-design-system-barrel.mjs" <<'EOF'
console.log("barrel src/index.ts generated with 12 components");
EOF
}
# Alt barrel stub = 不印 'generated'(模擬 no-op,emission 應被抑制)
write_barrel_without_generated() {
  cat > "$TMP_DIR/scripts/gen-design-system-barrel.mjs" <<'EOF'
console.log("nothing changed; up to date");
EOF
}
write_index_failure() {
  cat > "$TMP_DIR/scripts/gen-component-indexes.mjs" <<'EOF'
console.error("fixture index failure");
process.exit(9);
EOF
}
write_index_success() {
  cat > "$TMP_DIR/scripts/gen-component-indexes.mjs" <<'EOF'
console.log("component indexes regenerated");
EOF
}
write_barrel_failure() {
  cat > "$TMP_DIR/scripts/gen-design-system-barrel.mjs" <<'EOF'
console.error("fixture barrel failure");
process.exit(11);
EOF
}
write_barrel_with_generated

export GOVERNANCE_PROJECT_DIR="$TMP_DIR"

# --- run-hook helper:pipe JSON into hook via stdin -------------------------
run_hook() {
  local file_path="$1"
  local payload
  payload=$(jq -n --arg fp "$file_path" \
    '{hook_event_name:"PostToolUse", tool_name:"Write", tool_input:{file_path:$fp, content:""}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT" 2>/dev/null)
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

# POSITIVE assertion:hook fires = exit 0 + stdout 含 additionalContext needle
expect_fire() {
  local name="$1"
  if [ "$EXIT" = "0" ] && echo "$STDOUT_TEXT" | grep -qF "auto-regen DS barrel"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected FIRE: exit 0 + additionalContext, got exit=$EXIT, stdout=$([ -n "$STDOUT_TEXT" ] && echo non-empty || echo empty))"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

# NEGATIVE assertion:hook silent = exit 0 + 無 stdout(且 never block / exit 2)
expect_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected SILENT: exit 0 + no stdout, got exit=$EXIT, stdout=$([ -n "$STDOUT_TEXT" ] && echo non-empty || echo empty))"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_integrity() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "70" ] && [ -z "$STDOUT_TEXT" ] \
    && echo "$STDERR_TEXT" | grep -qF "GOVERNANCE_INTEGRITY:" \
    && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected integrity exit 70 + '$needle', got exit=$EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== auto_regen_ds_barrel tests ==="

# ---------------------------------------------------------------------------
# POSITIVE cases(SHOULD fire = emit additionalContext)
# ---------------------------------------------------------------------------

# 1. In-scope component primary tsx → fire(real violation, guards over-narrow regex)
run_hook "packages/design-system/src/components/Badge/badge.tsx"
expect_fire "1. components/Badge/badge.tsx → FIRE (regen)"

# 2. In-scope pattern tsx → fire(scope 'patterns' alt)
run_hook "packages/design-system/src/patterns/element-anatomy/item-anatomy.tsx"
expect_fire "2. patterns/.../item-anatomy.tsx → FIRE"

# 3. In-scope hooks/*.ts → fire(barrel includes hooks)
run_hook "packages/design-system/src/hooks/use-disclosure.ts"
expect_fire "3. hooks/use-disclosure.ts → FIRE"

# 4. In-scope lib/*.ts → fire(barrel includes lib)
run_hook "packages/design-system/src/lib/cn.ts"
expect_fire "4. lib/cn.ts → FIRE"

# 5. In-scope per-component index.ts → fire(barrel 也 include index 改動)
run_hook "packages/design-system/src/components/Badge/index.ts"
expect_fire "5. components/Badge/index.ts → FIRE"

# 6. NEAR-MISS guard against OVER-BROAD exclusion regex:
#    'specimen.tsx' 含 'spec' substring 但 **不是** .spec 檔 → 必須 FIRE,不可被誤排除。
#    (exclusion regex 是 \.(...spec...)\.(tsx?|md)$ anchored,specimen 不該命中)
run_hook "packages/design-system/src/components/Specimen/specimen.tsx"
expect_fire "6. NEAR-MISS specimen.tsx (含 'spec' 子字串) → FIRE (regex 非過寬)"

# ---------------------------------------------------------------------------
# NEGATIVE cases(should NOT fire = silent, exit 0)
# ---------------------------------------------------------------------------

# 7. Empty file_path → silent(line 26 early exit)
run_hook ""
expect_silent "7. empty file_path → silent"

# 8. Out-of-scope app consumer tsx → silent(不在 design-system scope)
run_hook "apps/template/src/App.tsx"
expect_silent "8. apps/template/src/App.tsx (out of scope) → silent"

# 9. NEAR-MISS scope guard:design-system/src/tokens/ 不在 (components|patterns|hooks|lib) → silent
#    (guards against over-broad scope regex matching all of design-system/src)
run_hook "packages/design-system/src/tokens/colors.ts"
expect_silent "9. NEAR-MISS tokens/colors.ts (DS src but 非 barrel scope) → silent"

# 10. In-scope .stories.tsx → silent(line 34 exclusion)
run_hook "packages/design-system/src/components/Badge/badge.stories.tsx"
expect_silent "10. badge.stories.tsx → silent (excluded)"

# 11. In-scope .anatomy.stories.tsx → silent
run_hook "packages/design-system/src/components/Badge/badge.anatomy.stories.tsx"
expect_silent "11. badge.anatomy.stories.tsx → silent (excluded)"

# 12. In-scope .spec.md → silent
run_hook "packages/design-system/src/components/Badge/badge.spec.md"
expect_silent "12. badge.spec.md → silent (excluded)"

# 13. In-scope .spec.ts → silent
run_hook "packages/design-system/src/components/Badge/badge.spec.ts"
expect_silent "13. badge.spec.ts → silent (excluded)"

# 14. In-scope .test.tsx → silent
run_hook "packages/design-system/src/components/Badge/badge.test.tsx"
expect_silent "14. badge.test.tsx → silent (excluded)"

# 15. Emission gate:in-scope tsx BUT barrel 沒印 'generated' → silent(no additionalContext)
#     即使 scripts run 成功,grep 'generated|with N components' 沒命中 → 不 emit。
write_barrel_without_generated
run_hook "packages/design-system/src/components/Badge/badge.tsx"
expect_silent "15. in-scope tsx, barrel no 'generated' output → silent (emission gate)"
write_barrel_with_generated  # restore for any later cases

# 16. Component-index generator failure is infrastructure failure,not fake success.
write_index_failure
run_hook "packages/design-system/src/components/Badge/badge.tsx"
expect_integrity "16. component-index generator nonzero → integrity 70" "component-index generator failed"
write_index_success

# 17. Barrel generator failure is infrastructure failure,not fake success.
write_barrel_failure
run_hook "packages/design-system/src/components/Badge/badge.tsx"
expect_integrity "17. barrel generator nonzero → integrity 70" "barrel generator failed"
write_barrel_with_generated

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

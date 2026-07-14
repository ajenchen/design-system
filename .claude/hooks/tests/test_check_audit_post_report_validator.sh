#!/bin/bash
# Tests for check_audit_post_report_validator.sh
#
# Hook(PostToolUse Write/Edit/MultiEdit):驗 audit report quality:
#   A) NO-SAMPLE keyword 偵測
#   B) Dim ≥ 46 coverage
#   C) audit-prompts.md prompt count
#   D) @benchmark-unverified-blanket count drift
#   E) prune-chain-trigger → emit additionalContext JSON
#
# 只 fire 在 file_path matches `*/audit-report-*.json` 或 `*/project_audit_progress.md`,
# 且 file 必須真實存在於 disk(`[ -f "$FILE_PATH" ] || exit 0`)。
# 輸出至 stdout(JSON additionalContext)時是 trigger_prune=1 路徑;非 prune trigger 走 silent。
# 注意:hook 內 WARNINGS 累積但 stderr 不直接 print(只 stdout JSON);此測試 verify stdout JSON。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_audit_post_report_validator.sh"
TMPDIR_TEST=$(mktemp -d)
trap 'rm -rf "$TMPDIR_TEST"' EXIT

if [ ! -f "$HOOK" ]; then echo "FATAL: hook not found: $HOOK"; exit 1; fi

PASS=0
FAIL=0
FAILED_TESTS=""

run_hook() {
  local file_path="$1"; local tool="$2"
  local payload
  payload=$(jq -n --arg fp "$file_path" --arg tn "$tool" \
    '{tool_name: $tn, tool_input: {file_path: $fp}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  export CLAUDE_PROJECT_DIR="$TMPDIR_TEST"
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT")
  STDERR_TEXT=$(cat "$STDERR")
  rm -f "$STDOUT" "$STDERR"
}

expect_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (exit=$EXIT, stdout=[$STDOUT_TEXT], stderr non-empty=$([ -n "$STDERR_TEXT" ] && echo yes))"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_stdout_contains() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "0" ] && echo "$STDOUT_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected stdout contains '$needle', got exit $EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

# 2026-05-31:Validator C/F/G critical fail 現 exit 2 真 block(原只 additionalContext soft)。
expect_block_stderr() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "2" ] && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected exit 2 + stderr '$needle', got exit $EXIT)"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_audit_post_report_validator tests ==="

# 1. Non-audit file path → skip silently
run_hook "/tmp/random.txt" "Write"
expect_silent "1. non-audit path → skip"

# 2. Non-Write/Edit tool → skip silently
run_hook "$TMPDIR_TEST/.claude/logs/audit-report-foo.json" "Read"
expect_silent "2. Read tool → skip"

# 3. Audit-report path but file not on disk → skip
run_hook "$TMPDIR_TEST/.claude/logs/audit-report-missing.json" "Write"
expect_silent "3. missing file → skip"

# 4. project_audit_progress.md with NO-SAMPLE keyword but no audit-prompts.md → no prune trigger, silent stdout
mkdir -p "$TMPDIR_TEST/.claude/memory"
cat > "$TMPDIR_TEST/.claude/memory/project_audit_progress.md" <<'EOF'
# Audit progress
Dim 1: pass
Dim 2: pass
Dim 3: pass
EOF
run_hook "$TMPDIR_TEST/.claude/memory/project_audit_progress.md" "Write"
# B fires (DIM_COUNT < 46) but no TRIGGER_PRUNE since audit-prompts.md absent + no bench debt
# stdout should be silent (TRIGGER_PRUNE=0)
expect_silent "4. valid file no prune trigger → silent stdout"

# 5. judgment dim(dim 99 PURE-JUDGMENT)缺 `## 99.` prompt → Validator C CRITICAL → exit 2 真 block
#    (2026-05-31:原測 additionalContext soft;改測 set-membership C + exit-2 block)
mkdir -p "$TMPDIR_TEST/.claude/skills/design-system-audit/references"
cat > "$TMPDIR_TEST/.claude/logs/audit-coverage-matrix.json" <<'EOF'
{"coverage_by_dim":{"99":{"tier":"PURE-JUDGMENT","mechanism":"test judgment dim"}}}
EOF
cat > "$TMPDIR_TEST/.claude/skills/design-system-audit/references/audit-prompts.md" <<'EOF'
## 1. foo
prompt
EOF
cat > "$TMPDIR_TEST/.claude/memory/project_audit_progress.md" <<'EOF'
# Audit progress
Dim 1: pass
EOF
run_hook "$TMPDIR_TEST/.claude/memory/project_audit_progress.md" "Edit"
expect_block_stderr "5. judgment dim 缺 prompt → Validator C exit-2 block" "VALIDATOR BLOCK"

# 6/7. Validator K 決策品質四要件(2026-07-14;SSOT = deep-audit SKILL C.1「🔒 決策品質四要件」)
#    拍板 section 內每個決策 block 必含 SSOT-check / 世界級 cite(URL)/ codex verdict / design-fit 四 marker。
#    先補 `## 99.` prompt 讓 test 5 留下的 Validator C 條件通過,隔離 K 的判定。
cat > "$TMPDIR_TEST/.claude/skills/design-system-audit/references/audit-prompts.md" <<'EOF'
## 1. foo
prompt
## 99. test judgment dim
prompt
EOF
mkdir -p "$TMPDIR_TEST/.claude/logs/deep-audit-test"
cat > "$TMPDIR_TEST/.claude/logs/deep-audit-test/C1-final-report.md" <<'EOF'
# Deep Audit 報告
Dim 1: pass

### 待你拍板
1. 決策一:Popover 內距是否改 12px
   - SSOT 理由:改跨元件 canonical 視覺結構
   - SSOT-check:grep spec + memory,無既有拍板
   - codex verdict:agree(辯論共識)
   - 設計語言 fit:符合 density canonical
EOF
run_hook "$TMPDIR_TEST/.claude/logs/deep-audit-test/C1-final-report.md" "Write"
expect_block_stderr "6. 決策缺世界級 cite → Validator K exit-2 block" "決策四要件不全"

cat > "$TMPDIR_TEST/.claude/logs/deep-audit-test/C1-final-report.md" <<'EOF'
# Deep Audit 報告
Dim 1: pass

### 待你拍板
1. 決策一:Popover 內距是否改 12px
   - SSOT 理由:改跨元件 canonical 視覺結構
   - SSOT-check:grep spec + memory,無既有拍板
   - 世界級:Polaris https://polaris.shopify.com/tokens/space / Material / Ant(3 家)
   - codex verdict:agree(辯論共識)
   - 設計語言 fit:符合 density canonical
EOF
run_hook "$TMPDIR_TEST/.claude/logs/deep-audit-test/C1-final-report.md" "Write"
if [ "$EXIT" = "0" ]; then
  echo "  PASS  7. 四要件齊 → Validator K pass(exit 0)"; PASS=$((PASS+1))
else
  echo "  FAIL  7. 四要件齊 → Validator K pass (expected exit 0, got $EXIT, stderr=[$STDERR_TEXT])"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 7. 四要件齊 pass"
fi

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed:$FAILED_TESTS"
  exit 1
fi

#!/bin/bash
# Tests for check_codex_brief_invariants.sh
# (2026-05-23 per user verbatim「codex 跑的稽核流程理應要跟你跑的深度稽核流程是一模一樣 SSOT 的不能偏移」)
#
# Hook 規則(PreToolUse,Bash only):
#   - tool_name != Bash → silent exit 0
#   - tool_input.command 不含 `codex (exec|review)`(word-boundary `(^|[space]/)`)→ silent exit 0
#     · bare mention(`ls .../codex` / `mycodex exec` / git commit msg 含 "codex")→ silent
#     · `--help` / `--version` 等 introspection flag → silent
#   - 命中 codex exec/review → 擷取 brief content(cat-pipe / $(cat) / stdin `<` / inline arg)
#   - Brief 必含 7 invariant keyword,缺任一 → exit 2 BLOCKER:
#       1️⃣ 全盤閱讀  2️⃣ Triple-verify  3️⃣ 禁抽樣  4️⃣ 禁列檔
#       5️⃣ 輸入對等(A.0 鏡射錨點)  6️⃣ 判準對等(audit-prompts rubric)  7️⃣ A.1b(per-component claim-vs-code)
#   - Escape:brief 含 `@codex-brief-invariant-skip:` → silent exit 0
#
# Positive(should BLOCK exit 2):缺 invariant 的 brief。
# Negative(should be silent exit 0):全 4 invariant 齊備 / 非 codex / near-miss word-boundary。
# M34 broad-vs-narrow symmetry:
#   - near-miss(`mycodex exec` / commit msg)守 over-broad regex(不該 fire)
#   - 真 violation(`node_modules/.bin/codex exec` path-prefixed + 缺 invariant)守 over-narrow regex(該 fire)

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_codex_brief_invariants.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# Override CLAUDE_PROJECT_DIR so _log-fire.sh state lands in TMP_DIR(不污染 repo .claude/logs/)
export CLAUDE_PROJECT_DIR="$TMP_DIR"
mkdir -p "$TMP_DIR/.claude/logs"

# ── Brief fixtures ────────────────────────────────────────────────
# Full brief:含全 4 invariant keyword(全盤閱讀 / triple-verify / 禁抽樣 / 禁列檔)
GOOD_BRIEF="$TMP_DIR/good-brief.md"
cat > "$GOOD_BRIEF" <<'EOF'
# Codex deep-audit brief
1. 全盤閱讀全部 source(列舉 N files,禁憑記憶)
2. triple-verify per finding(grep + Read + canonical exception check)
3. 禁抽樣 — DS-wide ALL files,sub-agent sampled = reject
4. 禁列檔 — 只讀 12 file,直接出 verdict
5. 閱讀清單鏡射 A.0:CLAUDE.md + .claude/rules/meta-patterns.md 等 5 rules + 4 references + 全 spec.md + memory MEMORY.md index
6. 判準對等:codex 讀 design-system-audit/references/audit-prompts.md 每 dim rubric,逐 dim 套用
7. A.1b per-component claim-vs-code 對抗驗證:讀每元件 .tsx + wrap lib 逐句驗宣稱
EOF

# Partial brief:缺 invariant 3(禁抽樣);其餘 3 個 keyword 齊
PARTIAL_BRIEF="$TMP_DIR/partial-brief.md"
cat > "$PARTIAL_BRIEF" <<'EOF'
# Codex audit brief
1. 全盤閱讀全部 source
2. triple-verify per finding
4. 禁列檔 — 只讀 12 file,直接出
EOF

# Skip-marker brief:空殼但含 escape clause
SKIP_BRIEF="$TMP_DIR/skip-brief.md"
cat > "$SKIP_BRIEF" <<'EOF'
audit the button component padding
// @codex-brief-invariant-skip: trivial one-line smoke check
EOF

# ── Harness ───────────────────────────────────────────────────────
run_hook() {
  # $1 = command string (becomes tool_input.command), $2 = tool_name (default Bash)
  local cmd="$1"; local tool="${2:-Bash}"
  local payload
  payload=$(jq -n --arg c "$cmd" --arg t "$tool" \
    '{hook_event_name:"PreToolUse", tool_name:$t, tool_input:{command:$c}}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

run_hook_raw_payload() {
  # $1 = full JSON payload string
  local payload="$1"
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent exit 0, got exit=$EXIT, stderr=$([ -n "$STDERR_TEXT" ] && echo non-empty || echo empty))"
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

echo "=== check_codex_brief_invariants tests ==="

# Build the codex subcommand token at runtime so THIS test file's own argv /
# transcript does not contain the literal `codex exec`(避免 live PreToolUse 同名 hook
# 在跑 test 時誤觸)。Payload 內容仍是真實字串,經 stdin 餵給 target hook。
CX="cod""ex"

# ── NEGATIVE(should be silent)───────────────────────────────────

# 1. Non-Bash tool → silent
run_hook "${CX} exec \"whatever\"" "Read"
expect_pass_silent "1. tool=Read → skip(non-Bash)"

# 2. Bash but bare codex mention(discovery, no exec/review)→ silent
run_hook "ls -la node_modules/.bin/${CX}"
expect_pass_silent "2. bare codex path mention → silent"

# 3. codex exec --help(introspection flag)→ silent
run_hook "${CX} exec --help"
expect_pass_silent "3. codex exec --help → silent"

# 4. M34 over-broad guard: 'mycodex exec' is NOT word-boundary codex → silent
run_hook "my${CX} exec foo"
expect_pass_silent "4. mycodex exec(no word boundary)→ silent"

# 5. M34 over-broad guard: git commit msg mentioning codex, no exec/review → silent
run_hook "git commit -m \"${CX} collab notes\""
expect_pass_silent "5. git commit msg 含 codex,無 exec/review → silent"

# 6. inline codex exec WITH all 4 invariants → silent
GOOD_INLINE="${CX} exec \"全盤閱讀全部 source(鏡射 A.0:meta-patterns rules + memory MEMORY.md index)。triple-verify per finding。禁抽樣 DS-wide ALL files。禁列檔 只讀 10 file 直接出 verdict。判準對等:讀 audit-prompts.md 逐 dim rubric。A.1b per-component claim-vs-code 對抗驗證讀 .tsx 逐句驗宣稱。\""
run_hook "$GOOD_INLINE"
expect_pass_silent "6. inline brief 全 4 invariant → silent"

# 7. cat-pipe brief file WITH all 4 invariants → silent
run_hook "cat $GOOD_BRIEF | ${CX} exec"
expect_pass_silent "7. cat-pipe full-brief file → silent"

# 8. \$(cat) arg-substitution full brief → silent
run_hook "${CX} exec \"\$(cat $GOOD_BRIEF)\""
expect_pass_silent "8. \$(cat) full-brief file → silent"

# 8b. 4 invariant 齊但缺輸入對等錨點(泛 glob 閱讀清單)→ BLOCK(2026-07-10 5️⃣)
NOPARITY_BRIEF="$TMP_DIR/noparity-brief.md"
cat > "$NOPARITY_BRIEF" <<'EOF'
# Codex deep-audit brief
1. 全盤閱讀全部 source(.claude/rules/* 泛 glob,禁憑記憶)
2. triple-verify per finding(grep + Read + canonical exception check)
3. 禁抽樣 — DS-wide ALL files,sub-agent sampled = reject
4. 禁列檔 — 只讀 12 file,直接出 verdict
EOF
run_hook "cat $NOPARITY_BRIEF | ${CX} exec"
expect_block "8b. 缺輸入對等錨點(泛 glob)→ BLOCK" "5️⃣"

# 8c. 5 invariant 齊但缺判準對等(audit-prompts)→ 6️⃣ BLOCK(2026-07-10)
NORUBRIC_BRIEF="$TMP_DIR/norubric-brief.md"
cat > "$NORUBRIC_BRIEF" <<'EOF'
# Codex deep-audit brief
1. 全盤閱讀全部 source(.claude/rules/meta-patterns.md + memory MEMORY.md,禁憑記憶)
2. triple-verify per finding(grep + Read + canonical exception check)
3. 禁抽樣 — DS-wide ALL files,sub-agent sampled = reject
4. 禁列檔 — 只讀 12 file,直接出 verdict
EOF
run_hook "cat $NORUBRIC_BRIEF | ${CX} exec"
expect_block "8c. 缺判準對等(無 audit-prompts)→ BLOCK" "6️⃣"

# 8d. 1️⃣-6️⃣ 齊但缺 A.1b(per-component claim-vs-code)→ 7️⃣ BLOCK(2026-07-10)
NOA1B_BRIEF="$TMP_DIR/noa1b-brief.md"
cat > "$NOA1B_BRIEF" <<'EOF'
# Codex deep-audit brief
1. 全盤閱讀全部 source(.claude/rules/meta-patterns.md + memory MEMORY.md,禁憑記憶)
2. triple-verify per finding(grep + Read + canonical exception check)
3. 禁抽樣 — DS-wide ALL files,sub-agent sampled = reject
4. 禁列檔 — 只讀 12 file,直接出 verdict
5. 判準對等:讀 design-system-audit/references/audit-prompts.md 每 dim rubric,逐 dim 套用
EOF
run_hook "cat $NOA1B_BRIEF | ${CX} exec"
expect_block "8d. 缺 A.1b(per-component claim-vs-code)→ 7️⃣ BLOCK" "7️⃣"

# 9. stdin redirect full brief → silent
run_hook "${CX} exec < $GOOD_BRIEF"
expect_pass_silent "9. stdin redirect full-brief file → silent"

# 10. Escape clause @codex-brief-invariant-skip → silent even when invariants missing
run_hook "cat $SKIP_BRIEF | ${CX} exec"
expect_pass_silent "10. @codex-brief-invariant-skip escape → silent"

# ── POSITIVE(should BLOCK exit 2)─────────────────────────────────

# 11. inline brief MISSING all 4 invariants → BLOCK
run_hook "${CX} exec \"please audit the button component padding\""
expect_block "11. inline brief 缺全 4 invariant → BLOCK" "CODEX BRIEF MISSING INVARIANTS BLOCKER"

# 12. M34 over-narrow guard(real violation, near-complete brief): cat-pipe file
#     缺 invariant 3(禁抽樣)only → BLOCK,且 stderr 必指出 3️⃣
run_hook "cat $PARTIAL_BRIEF | ${CX} exec"
expect_block "12. partial brief 缺 1 invariant(禁抽樣)→ BLOCK" "3️⃣ 禁抽樣 invariant 缺"

# 12b. 同 partial brief:確認其餘 3 invariant 未被誤報(over-broad sanity)
if echo "$STDERR_TEXT" | grep -qE '1️⃣|2️⃣|4️⃣'; then
  echo "  FAIL  12b. partial brief 誤報其餘 invariant(over-broad regex)"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 12b. partial false-positive"
else
  echo "  PASS  12b. partial brief 只報 3️⃣,不誤報 1/2/4"; PASS=$((PASS+1))
fi

# 13. M34 over-narrow guard: path-prefixed `node_modules/.bin/codex exec`(真實 local
#     transport)+ 缺全 invariant → BLOCK(word-boundary `/` 必須匹配)
run_hook "node_modules/.bin/${CX} exec \"audit the table\""
expect_block "13. path-prefixed codex exec 缺 invariant → BLOCK" "CODEX BRIEF MISSING INVARIANTS BLOCKER"

# 14. codex review subcommand(非 exec)缺 invariant → BLOCK
run_hook "${CX} review \"check the current diff\""
expect_block "14. codex review subcommand 缺 invariant → BLOCK" "CODEX BRIEF MISSING INVARIANTS BLOCKER"

# 15. empty tool_input(robustness)→ silent
run_hook_raw_payload '{"tool_name":"Bash","tool_input":{}}'
expect_pass_silent "15. empty tool_input → silent"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0

#!/bin/bash
# Tests for session_start_governance_check.sh
#
# Scenarios:
#   1. healthy project — silent (no reminders)
#   2. shared AGENTS.md > 600 (soft) — remains silent by noise-reduction policy
#   3. shared AGENTS.md > 800 (hard) — BLOCKERS fire
#   4. corrections > 40 (hard) — BLOCKERS fire
#   5. fire-weighted gap (G7) — surfaces hot hook without test
#  10. read-only replay cannot rewrite counters or start benchmark fetch
#  11. neutral writer/reader loop ignores poison in provider-owned logs

set -u

# Test 9 intentionally verifies an isolated provider-cache write. Do not inherit
# the read-only replay flag from the aggregate runner.
export GOVERNANCE_READ_ONLY=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../session_start_governance_check.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }

PASS=0; FAIL=0; FAILED=""

setup_proj() {
  TMP_PROJ=$(mktemp -d)
  # 2026-05-08 fix:test isolation — empty memory dir 強制 hook 走 PROJECT_DIR scope,
  # committed repo memory is the only SSOT; isolate it inside the fixture.
  mkdir -p "$TMP_PROJ/.governance-hooks/tests" "$TMP_PROJ/governance/memory"
  # NOTE: deliberately NOT creating benchmarks dir(absent dir = no warning,
  # creating an empty one = "never fetched" warning fires)
  # codex stub:hook L270 env-smoke 檢查 node_modules/.bin/codex(cd 到 PROJECT_DIR 後相對)。
  # TMP_PROJ 無 node_modules → env-smoke「codex 缺」advisory 會 fire,污染 governance 斷言。
  # 放可執行 stub 讓 env-smoke deterministic 靜默,測試只驗 governance 邏輯(2026-05-30 加,
  # 修 env-smoke feature 加入後沒同步更 test 的 pre-existing 失敗)。
  mkdir -p "$TMP_PROJ/node_modules/.bin"
  printf '#!/bin/sh\n' > "$TMP_PROJ/node_modules/.bin/codex"
  chmod +x "$TMP_PROJ/node_modules/.bin/codex"
  # 5-line healthy provider-neutral bootstrap
  printf '%s\n' a b c d e > "$TMP_PROJ/AGENTS.md"
  # init git for last-prune check (no commits → -1)
  ( cd "$TMP_PROJ" && git init -q && git -c commit.gpgsign=false -c user.name=test -c user.email=t@t.com commit --allow-empty -m "init" -q ) 2>/dev/null
  TEST_GIT_DIR=$(git -C "$TMP_PROJ" rev-parse --absolute-git-dir)
  TEST_GIT_DIR=$(cd "$TEST_GIT_DIR" && pwd -P)
  GOVERNANCE_TEST_STATE="$TEST_GIT_DIR/governance-runtime"
  mkdir -p "$GOVERNANCE_TEST_STATE"
}

teardown_proj() { rm -rf "$TMP_PROJ"; }

run_hook() {
  STDOUT=$(mktemp)
  set +e
  GOVERNANCE_PROJECT_DIR="$TMP_PROJ" \
    GOVERNANCE_RUNTIME_ROOT="$GOVERNANCE_TEST_STATE" \
    GOVERNANCE_STATE_DIR="$GOVERNANCE_TEST_STATE" \
    GOVERNANCE_CANONICAL_HOOK_ROOT=".governance-hooks" \
    GOVERNANCE_TELEMETRY_OPT_IN=0 \
    bash "$HOOK" < /dev/null > "$STDOUT" 2>&1
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT"); rm -f "$STDOUT"
}

# Test 1: healthy project → silent
echo "Test 1: healthy project silent"
setup_proj
run_hook
if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ]; then
  echo "  PASS  Test 1 healthy silent"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 1 (exit=$EXIT, output='$STDOUT_TEXT')"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 1"
fi
teardown_proj

# Test 2: AGENTS.md > 600 (strong-warn) → reminder remains silent by noise-reduction policy
echo "Test 2: AGENTS.md strong-warn threshold (601)"
setup_proj
yes '.' | head -650 > "$TMP_PROJ/AGENTS.md"
run_hook
if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ]; then
  echo "  PASS  Test 2 silent on soft (601 lines, noise reduction 2026-04-26)"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 2 (output: $STDOUT_TEXT)"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 2"
fi
teardown_proj

# Test 3: AGENTS.md > 800 (transition cap breach) → BLOCKERS
echo "Test 3: AGENTS.md transition cap breach (801)"
setup_proj
yes '.' | head -850 > "$TMP_PROJ/AGENTS.md"
run_hook
if [ "$EXIT" = "0" ] && echo "$STDOUT_TEXT" | grep -q "BLOCKER" && echo "$STDOUT_TEXT" | grep -qE "(hard|transition) cap 800 (breached|exceeded)"; then
  echo "  PASS  Test 3 hard-cap 800 BLOCKER"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 3 (output: $STDOUT_TEXT)"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 3"
fi
teardown_proj

# Test 4: corrections > 40 (hard) → BLOCKERS
echo "Test 4: corrections hard threshold"
setup_proj
yes '{}' | head -45 > "$GOVERNANCE_TEST_STATE/user-corrections.jsonl"
run_hook
if [ "$EXIT" = "0" ] && echo "$STDOUT_TEXT" | grep -q "BLOCKER" && echo "$STDOUT_TEXT" | grep -q "HARD THRESHOLD 40"; then
  echo "  PASS  Test 4 corrections hard BLOCKER"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 4 (output: $STDOUT_TEXT)"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 4"
fi
teardown_proj

# Test 5: fire-weighted gap (G7)
echo "Test 5: fire-weighted gap"
setup_proj
# Generate 150 fire entries for hook 'foo'
for i in $(seq 1 150); do
  echo '{"hook":"foo.sh"}'
done > "$GOVERNANCE_TEST_STATE/hook-fires-per-hook.jsonl"
# foo has no test (tests dir is empty)
run_hook
if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ]; then
  echo "  PASS  Test 5 silent on soft fire-weighted gap (noise reduction)"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 5 (output: $STDOUT_TEXT)"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 5"
fi
teardown_proj

# Test 6: Hook count > 26 (soft prune trigger) — auto-prune fires
echo "Test 6: hook count 27 → soft prune trigger"
setup_proj
# Create 27 fake hooks(超過 soft 26)
for i in $(seq 1 27); do
  : > "$TMP_PROJ/.governance-hooks/check_fake_${i}.sh"
done
run_hook
if [ "$EXIT" = "0" ] && echo "$STDOUT_TEXT" | grep -qE "(Auto-prune triggers|Hook count)"; then
  echo "  PASS  Test 6 hook count soft trigger"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 6 (output: ${STDOUT_TEXT:0:200})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 6"
fi
teardown_proj

# Test 7: Hook count > hard cap → BLOCKER
# Cap 從 SSOT(session_start_governance_check.sh `HOOK_COUNT" -gt N`)動態讀,避免 cap 升級後測試 re-drift。
# Anchor:2026-05-29 cap 已升 45→60 但本測試寫死 46/「hard 45」→ CI hook-test 失敗 → 連帶 storybook
# build + GitHub Pages deploy 全卡(deploy-storybook job gated 在 Verify pass)。改動態讀後永不 drift。
HARD_CAP=$(grep -oE 'HOOK_COUNT" -gt [0-9]+' "$HOOK" | grep -oE '[0-9]+' | head -1)
echo "Test 7: hook count > hard cap ${HARD_CAP} → BLOCKER (cap 從 SSOT 讀)"
setup_proj
for i in $(seq 1 $((HARD_CAP + 5))); do
  : > "$TMP_PROJ/.governance-hooks/check_fake_${i}.sh"
done
run_hook
if [ "$EXIT" = "0" ] && echo "$STDOUT_TEXT" | grep -q "BLOCKER" && echo "$STDOUT_TEXT" | grep -qE "hard ${HARD_CAP}"; then
  echo "  PASS  Test 7 hook count hard BLOCKER (cap ${HARD_CAP})"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 7 (output: ${STDOUT_TEXT:0:200})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 7"
fi
teardown_proj

# Test 8: every registry-declared provider branch namespace participates in one sprawl count.
echo "Test 8: Claude + Codex branch namespaces are counted together"
setup_proj
( cd "$TMP_PROJ" && git branch claude/one && git branch codex/two )
export GOVERNANCE_BRANCH_NAMESPACES_JSON='["claude/","codex/"]'
run_hook
unset GOVERNANCE_BRANCH_NAMESPACES_JSON
if [ "$EXIT" = "0" ] && echo "$STDOUT_TEXT" | grep -q "Local branch sprawl 2" && echo "$STDOUT_TEXT" | grep -q "claude/,codex/"; then
  echo "  PASS  Test 8 provider-neutral branch sprawl"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 8 (output: ${STDOUT_TEXT:0:300})"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 8"
fi
teardown_proj

# Test 9: optional memory sync is provider runtime data; Codex never guesses a Claude HOME cache.
echo "Test 9: two HOME / two-provider memory sync isolation"
setup_proj
mkdir -p "$TMP_PROJ/scripts" "$TMP_PROJ/home-claude" "$TMP_PROJ/home-codex"
printf '%s\n' \
  'import { mkdirSync, writeFileSync } from "node:fs"' \
  'import { join } from "node:path"' \
  'mkdirSync(join(process.env.HOME, ".provider-cache"), { recursive: true })' \
  'writeFileSync(join(process.env.HOME, ".provider-cache/synced"), "yes")' \
  'console.log("copied: 1")' \
  > "$TMP_PROJ/scripts/sync-fixture.mjs"
HOME="$TMP_PROJ/home-claude" GOVERNANCE_MEMORY_SYNC_SCRIPT="scripts/sync-fixture.mjs" run_hook
HOME="$TMP_PROJ/home-codex" GOVERNANCE_MEMORY_SYNC_SCRIPT="" run_hook
if [ -f "$TMP_PROJ/home-claude/.provider-cache/synced" ] && [ ! -e "$TMP_PROJ/home-codex/.provider-cache" ]; then
  echo "  PASS  Test 9 provider runtime controls HOME cache"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 9 (Claude marker=$(test -f "$TMP_PROJ/home-claude/.provider-cache/synced" && echo yes || echo no),Codex cache=$(test -e "$TMP_PROJ/home-codex/.provider-cache" && echo yes || echo no))"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 9"
fi
teardown_proj

# Test 10: read-only SessionStart must not rewrite tracked counters or launch background fetch.
echo "Test 10: read-only replay has zero workspace/background writes"
setup_proj
mkdir -p "$TMP_PROJ/scripts" "$TMP_PROJ/governance/benchmarks" "$GOVERNANCE_TEST_STATE/benchmarks"
cat > "$TMP_PROJ/scripts/sync-governance-counters.mjs" <<'EOF'
import { writeFileSync } from 'node:fs'
if (!process.argv.includes('--check')) writeFileSync('counter-was-rewritten', 'bad\n')
EOF
cat > "$TMP_PROJ/governance/benchmarks/fetch.sh" <<'EOF'
#!/bin/sh
printf 'bad\n' > benchmark-fetch-ran
EOF
chmod +x "$TMP_PROJ/governance/benchmarks/fetch.sh"
BEFORE_TREE=$(find "$TMP_PROJ" -type f -print0 | sort -z | xargs -0 shasum)
export GOVERNANCE_READ_ONLY=1
run_hook
export GOVERNANCE_READ_ONLY=0
AFTER_TREE=$(find "$TMP_PROJ" -type f -print0 | sort -z | xargs -0 shasum)
if [ "$EXIT" = "0" ] && [ "$BEFORE_TREE" = "$AFTER_TREE" ] && [ ! -e "$TMP_PROJ/counter-was-rewritten" ] && [ ! -e "$TMP_PROJ/benchmark-fetch-ran" ]; then
  echo "  PASS  Test 10 read-only tree fingerprint is exact"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 10 (exit=$EXIT,counter=$(test -e "$TMP_PROJ/counter-was-rewritten" && echo yes || echo no),fetch=$(test -e "$TMP_PROJ/benchmark-fetch-ran" && echo yes || echo no))"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 10"
fi
teardown_proj

# Test 11: provider-owned poison is ignored; the neutral runtime feedback loop is live.
echo "Test 11: neutral feedback wins over provider-owned poison"
setup_proj
mkdir -p "$TMP_PROJ/.claude/logs"
yes '{}' | head -45 > "$TMP_PROJ/.claude/logs/user-corrections.jsonl"
run_hook
POISON_OUTPUT="$STDOUT_TEXT"
yes '{}' | head -45 > "$GOVERNANCE_TEST_STATE/user-corrections.jsonl"
: > "$TMP_PROJ/.claude/logs/user-corrections.jsonl"
run_hook
if [ -z "$POISON_OUTPUT" ] && echo "$STDOUT_TEXT" | grep -q "HARD THRESHOLD 40"; then
  echo "  PASS  Test 11 neutral feedback loop ignores .claude poison"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 11 (poison='${POISON_OUTPUT:0:120}',neutral='${STDOUT_TEXT:0:120}')"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 11"
fi
teardown_proj

# Test 12: recovery guidance must remain delegated, non-destructive and protected.
echo "Test 12: divergence recovery guidance is delegated and non-destructive"
if ! grep -qF "git reset --hard" "$HOOK" \
  && grep -qF "git pull --ff-only" "$HOOK" \
  && grep -qF "Standing Authorization" "$HOOK" \
  && grep -qF "recovery branch" "$HOOK" \
  && grep -qF "protected PR" "$HOOK" \
  && grep -qF "禁止 reset、force rewrite 或 ruleset bypass" "$HOOK" \
  && ! grep -qF "取得 user 明確授權" "$HOOK"; then
  echo "  PASS  Test 12 delegated protected recovery without destructive rewrite"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 12 destructive, approval-gated, or incomplete divergence guidance"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 12"
fi

echo ""
echo "════ Results: $PASS PASS, $FAIL FAIL ════"
[ "$FAIL" -gt 0 ] && { printf "Failed:%b\n" "$FAILED"; exit 1; }
exit 0

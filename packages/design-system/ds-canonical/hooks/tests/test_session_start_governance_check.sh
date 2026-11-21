#!/bin/bash
# Tests for session_start_governance_check.sh
#
# Scenarios:
#   1. healthy project — silent
#   2. shared AGENTS.md 800 行(剛好在上限)— 安靜
#   3. shared AGENTS.md 801 行 — BLOCKER
#   4. corrections 41 筆 — BLOCKER;40 筆 — 安靜
#   6. hook count 27 — soft prune trigger
#   7. hook count > hard cap — BLOCKER
#   8. provider branch namespaces counted together
#   9. memory sync isolation between provider HOMEs
#  10. read-only replay cannot rewrite counters
#  11. neutral writer/reader loop ignores poison in provider-owned logs
#  12. divergence recovery guidance is delegated and non-destructive
#  13. provider view group reachability(Check 12)
#  14. 上次 prune 181 天 — BLOCKER;100 天 — 安靜(Check 2)
#  15. 靜態:hook 裡沒有「只累加、從不讀」的變數(含合成檔對照組)
#  16. memory 索引條數(Check 8):上限 +1 → BLOCKER;等於上限 → 不出 BLOCKER(soft 照舊);索引與檔數分開數;
#      上限讀 contract;量具失效 → 點名「量不到」
#  (原 Test 5 fire-weighted gap 與 Test 10 的 benchmark fetch 那格,隨 Check 5 / Check 4 刪除而刪除,2026-11-18)

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
  [ -n "${TMP_PROJ:-}" ] && [ -d "$TMP_PROJ" ] || { echo "❌ mktemp -d failed(TMP_PROJ;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
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

# Test 2 / 3:Check 1 的邊界兩面 —— 800 行(剛好在上限)安靜、801 行 BLOCKER。
#   舊的 500 / 600 兩段只寫進不輸出的提醒變數,2026-11-18 刪除;這兩格證明刪的時候沒把 > 800 那段一起刪掉。
echo "Test 2: AGENTS.md 800 lines (at cap) stays silent"
setup_proj
yes '.' | head -800 > "$TMP_PROJ/AGENTS.md"
run_hook
if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ]; then
  echo "  PASS  Test 2 silent at 800 lines"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 2 (output: $STDOUT_TEXT)"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 2"
fi
teardown_proj

echo "Test 3: AGENTS.md 801 lines → BLOCKER"
setup_proj
yes '.' | head -801 > "$TMP_PROJ/AGENTS.md"
run_hook
if [ "$EXIT" = "0" ] && echo "$STDOUT_TEXT" | grep -q "BLOCKER" && echo "$STDOUT_TEXT" | grep -qF "total 801 lines(hard cap 800 breached)"; then
  echo "  PASS  Test 3 hard-cap 800 BLOCKER at 801 lines"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 3 (output: $STDOUT_TEXT)"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 3"
fi
teardown_proj

# Test 4:Check 3 的邊界兩面 —— 41 筆 BLOCKER、40 筆安靜(舊的 > 20 soft 段已刪)。
echo "Test 4: corrections 41 → BLOCKER / 40 → silent"
setup_proj
yes '{}' | head -41 > "$GOVERNANCE_TEST_STATE/user-corrections.jsonl"
run_hook
OVER_OUT_4="$STDOUT_TEXT"; OVER_EXIT_4="$EXIT"
yes '{}' | head -40 > "$GOVERNANCE_TEST_STATE/user-corrections.jsonl"
run_hook
if [ "$OVER_EXIT_4" = "0" ] && echo "$OVER_OUT_4" | grep -q "BLOCKER" && echo "$OVER_OUT_4" | grep -qF "41 user-corrections pending(HARD THRESHOLD 40 breached)" \
  && [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ]; then
  echo "  PASS  Test 4 corrections 41 BLOCKER / 40 silent"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 4 (41: '${OVER_OUT_4:0:200}'; 40: '${STDOUT_TEXT:0:200}')"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 4"
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

# Test 10: read-only SessionStart must not rewrite tracked counters.
#   (原本這格還放了一支假 fetch.sh 驗「不會去抓 benchmark」—— 那是 Check 4 的格,Check 4 已刪,2026-11-18。
#   任何寫入仍由下面的整樹指紋抓。)
echo "Test 10: read-only replay has zero workspace writes"
setup_proj
mkdir -p "$TMP_PROJ/scripts"
cat > "$TMP_PROJ/scripts/sync-governance-counters.mjs" <<'EOF'
import { writeFileSync } from 'node:fs'
if (!process.argv.includes('--check')) writeFileSync('counter-was-rewritten', 'bad\n')
EOF
BEFORE_TREE=$(find "$TMP_PROJ" -type f -print0 | sort -z | xargs -0 shasum)
export GOVERNANCE_READ_ONLY=1
run_hook
export GOVERNANCE_READ_ONLY=0
AFTER_TREE=$(find "$TMP_PROJ" -type f -print0 | sort -z | xargs -0 shasum)
if [ "$EXIT" = "0" ] && [ "$BEFORE_TREE" = "$AFTER_TREE" ] && [ ! -e "$TMP_PROJ/counter-was-rewritten" ]; then
  echo "  PASS  Test 10 read-only tree fingerprint is exact"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 10 (exit=$EXIT,counter=$(test -e "$TMP_PROJ/counter-was-rewritten" && echo yes || echo no))"
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

# Test 13: Check 12(2026-09-24)—— 產生檢視漏掉一群 hook 時,SessionStart 必須在 soft 通道印出提示(exit 0、不阻擋)。
#   fixture 用**真實**的 provider-view-group-reachability-invariant.mjs 與它讀的每一份文件的原樣副本
#   (腳本以自己所在目錄的上一層當 ROOT,所以整組搬進 TMP_PROJ 就能對 fixture 文件跑)。
#   儀器先有對照組:文件齊全時腳本本身要綠、hook 要安靜;之後才拿掉 claude 檢視 PreToolUse 最後一群,
#   要求 hook 點名該 event / 群組序號與失去覆蓋的 hook 名。序號與 hook 名都從 fixture 文件算,不寫死。
echo "Test 13: Check 12 provider 檢視漏群組 → SessionStart soft 提示"
setup_proj
REPO_ROOT_13="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
REGISTRY_13="packages/governance/canonical/providers.json"
REACH_REG_13=$(jq -r '.canonical.hookRegistrations' "$REPO_ROOT_13/$REGISTRY_13")
CLAUDE_VIEW_13=$(jq -r '.providers[] | select(.id == "claude") | .hookConfig' "$REPO_ROOT_13/$REGISTRY_13")
REACH_VIEWS_13=$(jq -r '.providers[] | select(.capabilities.nativeHooks == true and .hookConfigFormat == "json") | .hookConfig' "$REPO_ROOT_13/$REGISTRY_13")
FIXTURE_OK_13=1
for f in scripts/provider-view-group-reachability-invariant.mjs scripts/lib/provider-runtime-contract.mjs \
         packages/governance/src/provider-review-binding.mjs packages/governance/src/canonical-order.mjs \
         "$REGISTRY_13" "$REACH_REG_13" $REACH_VIEWS_13; do
  if [ ! -f "$REPO_ROOT_13/$f" ]; then
    echo "  FAIL  Test 13 fixture source missing: $f"; FIXTURE_OK_13=0; break
  fi
  mkdir -p "$TMP_PROJ/$(dirname "$f")" && cp "$REPO_ROOT_13/$f" "$TMP_PROJ/$f"
done
if [ "$FIXTURE_OK_13" = "1" ]; then
  # 對照組:文件齊全 → 真實腳本在 fixture 裡要綠,hook 要安靜(證明 fixture 本身不是紅的來源)
  CONTROL_OUT_13=$(cd "$TMP_PROJ" && node scripts/provider-view-group-reachability-invariant.mjs 2>&1); CONTROL_RC_13=$?
  run_hook
  CONTROL_HOOK_EXIT_13="$EXIT"; CONTROL_HOOK_OUT_13="$STDOUT_TEXT"
  # 弄壞:拿掉 claude 檢視 PreToolUse 最後一群;期望的群組序號 = 原群數 − 1,失去覆蓋的 hook 名從 registrations 讀
  GROUPS_13=$(jq -r '.hooks.PreToolUse | length' "$TMP_PROJ/$CLAUDE_VIEW_13")
  LOST_INDEX_13=$((GROUPS_13 - 1))
  LOST_HOOK_13=$(jq -r --argjson i "$LOST_INDEX_13" '.hooks.PreToolUse[$i].hooks[0].hook' "$TMP_PROJ/$REACH_REG_13")
  jq '.hooks.PreToolUse |= .[:-1]' "$TMP_PROJ/$CLAUDE_VIEW_13" > "$TMP_PROJ/view.tmp" && mv "$TMP_PROJ/view.tmp" "$TMP_PROJ/$CLAUDE_VIEW_13"
  run_hook
  if [ "$CONTROL_RC_13" = "0" ] && [ "$CONTROL_HOOK_EXIT_13" = "0" ] && [ -z "$CONTROL_HOOK_OUT_13" ] \
    && [ "$EXIT" = "0" ] \
    && echo "$STDOUT_TEXT" | grep -qF "本 session 有 hook 群組沒有派工入口" \
    && echo "$STDOUT_TEXT" | grep -qF "[claude] PreToolUse 第 ${LOST_INDEX_13} 群" \
    && echo "$STDOUT_TEXT" | grep -qF "失去覆蓋的 hook: ${LOST_HOOK_13}" \
    && echo "$STDOUT_TEXT" | grep -qF "重開 session" \
    && ! echo "$STDOUT_TEXT" | grep -q "BLOCKER"; then
    echo "  PASS  Test 13 齊全時安靜;漏群組時 soft 點名 PreToolUse 第 ${LOST_INDEX_13} 群 + ${LOST_HOOK_13}"; PASS=$((PASS+1))
  else
    echo "  FAIL  Test 13 (control: script rc=$CONTROL_RC_13 hook exit=$CONTROL_HOOK_EXIT_13 out='${CONTROL_HOOK_OUT_13:0:120}'; broken: exit=$EXIT out='${STDOUT_TEXT:0:400}')"
    FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 13"
  fi
else
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 13 (fixture source missing)"
fi
teardown_proj

# Test 14:Check 2 的邊界兩面 —— 上次 prune commit 在 181 天前 → BLOCKER;100 天前 → 安靜(舊的 > 90 soft 段已刪)。
#   日期寫進 fixture commit 的 committer date(Check 2 讀 %ct),相對於「現在」推導,不寫死日期(M37 第九種形狀)。
echo "Test 14: last prune 181 days → BLOCKER / 100 days → silent"
prune_commit_days_ago() {
  local ts=$(( $(date +%s) - $1 * 86400 - 60 ))
  ( cd "$TMP_PROJ" && GIT_AUTHOR_DATE="$ts +0000" GIT_COMMITTER_DATE="$ts +0000" \
      git -c commit.gpgsign=false -c user.name=test -c user.email=t@t.com \
      commit --allow-empty -q -m "prune(knowledge-prune fixture): days-ago prune" )
}
setup_proj
prune_commit_days_ago 181
run_hook
OVER_OUT_14="$STDOUT_TEXT"; OVER_EXIT_14="$EXIT"
teardown_proj
setup_proj
prune_commit_days_ago 100
run_hook
if [ "$OVER_EXIT_14" = "0" ] && echo "$OVER_OUT_14" | grep -q "BLOCKER" \
  && echo "$OVER_OUT_14" | grep -qF "Last /knowledge-prune was 181 days ago(HARD THRESHOLD 180 breached)" \
  && [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ]; then
  echo "  PASS  Test 14 prune 181d BLOCKER / 100d silent"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 14 (181d: '${OVER_OUT_14:0:200}'; 100d: '${STDOUT_TEXT:0:200}')"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 14"
fi
teardown_proj

# Test 15:hook 裡不得有「只累加、從不讀」的變數(M37④:看起來像保護、其實沒有人看得到)。
#   2026-11-18 刪掉的舊提醒變數就是這種:Check 1 / 2 / 3 / 4 / 5 / 6 都往它累加,檔尾卻只輸出 BLOCKERS 與 PRUNE_TRIGGERS。
#   判法:形如 VAR="${VAR}…" 的累加變數,把它自己的累加片段拿掉之後,非註解行裡必須還讀得到 $VAR / ${VAR…}。
#   對照組:合成檔裡放一個只累加不讀的 DEAD(含 `cond && DEAD="${DEAD}…"` 這種不在行首的寫法)與一個有讀的 GOOD,
#   判法必須只點名 DEAD;之後拿真的 hook 跑,必須沒有任何名字。
echo "Test 15: no accumulate-only variables in the hook (static)"
dead_accumulators() {
  local file=$1 name code
  code=$(grep -vE '^[[:space:]]*#' "$file")
  for name in $(printf '%s\n' "$code" \
      | grep -oE '[A-Z_][A-Z0-9_]*="\$\{[A-Z_][A-Z0-9_]*\}' \
      | sed -E 's/^([A-Z0-9_]+)="\$\{([A-Z0-9_]+)\}$/\1 \2/' \
      | awk '$1 == $2 { print $1 }' | sort -u); do
    if ! printf '%s\n' "$code" | sed -E "s/${name}=\"\\\$\\{${name}\\}//g" \
        | grep -qE "\\\$\\{?${name}([^A-Za-z0-9_]|\$)"; then
      printf '%s\n' "$name"
    fi
  done
}
setup_proj
cat > "$TMP_PROJ/accumulator-fixture.sh" <<'EOF'
#!/bin/bash
GOOD=""
DEAD=""
GOOD="${GOOD}\n- read later"
DEAD="${DEAD}\n- never read"
[ -n "${X:-}" ] && DEAD="${DEAD}\n- never read either"
# a comment that mentions $DEAD does not count as a read
printf '%b' "$GOOD"
EOF
CONTROL_15=$(dead_accumulators "$TMP_PROJ/accumulator-fixture.sh")
REAL_15=$(dead_accumulators "$HOOK")
if [ "$CONTROL_15" = "DEAD" ] && [ -z "$REAL_15" ]; then
  echo "  PASS  Test 15 control names DEAD only; hook has no accumulate-only variable"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 15 (control='${CONTROL_15}' expected 'DEAD'; hook='${REAL_15}' expected empty)"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 15"
fi
teardown_proj

# Test 16:Check 8 數的是 MEMORY.md 的索引條目(和 CI 的 validate-memory-contract.mjs 同一個函式),上限讀 contract.json。
#   fixture 用真實的 validate-memory-contract.mjs 與 contract.json 原樣副本(腳本以自己所在目錄的上一層當 ROOT)。
#   上限從 contract.json 讀,不寫死(MAX_16)。各格:
#   (a) 索引 MAX+1 條、0 個內容檔 → BLOCKER(改前數檔數 = 0,會安靜 —— 這格分得出新舊數法)
#   (b) 索引 MAX 條 → 沒有 BLOCKER;soft(MAX−2)照舊進 PRUNE_TRIGGERS
#   (c) 索引 MAX−3 條 → 安靜
#   (d) 索引 MAX−3 條、MAX+2 個內容檔 → 安靜(改前數檔數會出 BLOCKER —— 這格也分得出新舊數法)
#   (e) contract 的 maxIndexEntries 改成 10、索引 11 條 → BLOCKER「hard 10」(證明上限是讀 contract 的)
#   (f) 有 contract、沒有 validator → PRUNE_TRIGGERS 點名「量不到」,不出 BLOCKER(量具失效不當成沒超標)
echo "Test 16: Check 8 counts MEMORY.md index entries against contract maxIndexEntries"
REPO_ROOT_16="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
MAX_16=$(jq -r '.maxIndexEntries' "$REPO_ROOT_16/governance/memory/contract.json")
write_memory_index() {
  local i
  : > "$TMP_PROJ/governance/memory/MEMORY.md"
  for i in $(seq 1 "$1"); do
    printf -- '- [Entry %s](entry_%s.md) — fixture\n' "$i" "$i" >> "$TMP_PROJ/governance/memory/MEMORY.md"
  done
}
memory_fixture() {  # $1 = 索引條數;$2 = 要不要放 validator(1/0)
  mkdir -p "$TMP_PROJ/scripts"
  cp "$REPO_ROOT_16/governance/memory/contract.json" "$TMP_PROJ/governance/memory/contract.json"
  [ "$2" = "1" ] && cp "$REPO_ROOT_16/scripts/validate-memory-contract.mjs" "$TMP_PROJ/scripts/validate-memory-contract.mjs"
  write_memory_index "$1"
}
if printf '%s' "$MAX_16" | grep -qE '^[0-9]+$' && [ "$MAX_16" -ge 4 ]; then
  setup_proj; memory_fixture $((MAX_16 + 1)) 1; run_hook; A_16="$EXIT|$STDOUT_TEXT"; teardown_proj
  setup_proj; memory_fixture "$MAX_16" 1; run_hook; B_16="$EXIT|$STDOUT_TEXT"; teardown_proj
  setup_proj; memory_fixture $((MAX_16 - 3)) 1; run_hook; C_16="$EXIT|$STDOUT_TEXT"; teardown_proj
  setup_proj; memory_fixture $((MAX_16 - 3)) 1
  for i in $(seq 1 $((MAX_16 + 2))); do : > "$TMP_PROJ/governance/memory/note_${i}.md"; done
  run_hook; D_16="$EXIT|$STDOUT_TEXT"; teardown_proj
  setup_proj; memory_fixture 11 1
  jq '.maxIndexEntries = 10' "$TMP_PROJ/governance/memory/contract.json" > "$TMP_PROJ/contract.tmp" \
    && mv "$TMP_PROJ/contract.tmp" "$TMP_PROJ/governance/memory/contract.json"
  run_hook; E_16="$EXIT|$STDOUT_TEXT"; teardown_proj
  setup_proj; memory_fixture $((MAX_16 + 1)) 0; run_hook; F_16="$EXIT|$STDOUT_TEXT"; teardown_proj
  CHECK_16=""
  case "$A_16" in "0|"*BLOCKER*"Memory index entries $((MAX_16 + 1))(hard ${MAX_16} = governance/memory/contract.json maxIndexEntries"*) ;; *) CHECK_16="${CHECK_16} a" ;; esac
  case "$B_16" in *BLOCKER*) CHECK_16="${CHECK_16} b" ;; "0|"*"Memory index entries ${MAX_16}(soft $((MAX_16 - 2)) trigger"*) ;; *) CHECK_16="${CHECK_16} b" ;; esac
  [ "$C_16" = "0|" ] || CHECK_16="${CHECK_16} c"
  [ "$D_16" = "0|" ] || CHECK_16="${CHECK_16} d"
  case "$E_16" in "0|"*BLOCKER*"Memory index entries 11(hard 10 = "*) ;; *) CHECK_16="${CHECK_16} e" ;; esac
  case "$F_16" in *BLOCKER*) CHECK_16="${CHECK_16} f" ;; "0|"*"Memory index 量不到"*) ;; *) CHECK_16="${CHECK_16} f" ;; esac
  if [ -z "$CHECK_16" ]; then
    echo "  PASS  Test 16 index entries vs contract cap (a)–(f)"; PASS=$((PASS+1))
  else
    echo "  FAIL  Test 16 failing cells:${CHECK_16}"
    echo "    a='${A_16:0:220}'"; echo "    b='${B_16:0:220}'"; echo "    c='${C_16:0:220}'"
    echo "    d='${D_16:0:220}'"; echo "    e='${E_16:0:220}'"; echo "    f='${F_16:0:220}'"
    FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 16"
  fi
else
  echo "  FAIL  Test 16 contract maxIndexEntries unreadable or < 4: '${MAX_16}'"
  FAIL=$((FAIL+1)); FAILED="${FAILED}\n  - Test 16 (contract unreadable)"
fi

echo ""
echo "════ Results: $PASS PASS, $FAIL FAIL ════"
[ "$FAIL" -gt 0 ] && { printf "Failed:%b\n" "$FAILED"; exit 1; }
exit 0

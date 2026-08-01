#!/bin/bash
# Smoke + behavior test for stop_self_audit.sh
# 2026-04-30:升 BLOCKER 行為(Mechanism 1 claim-verify gap)後加 case 2-4
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../stop_self_audit.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not executable"; exit 1; }
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)" || {
  echo "FATAL: canonical hook test is not inside a Git worktree"
  exit 1
}
REPO_ROOT="$(cd "$REPO_ROOT" && pwd -P)"

TMPDIR=$(mktemp -d)
if [ -z "${TMPDIR:-}" ] || [ ! -d "$TMPDIR" ]; then
  echo "❌ mktemp -d failed;fixture unavailable" >&2
  exit 1
fi
trap 'rm -rf "$TMPDIR"' EXIT
PROJECT_DIR="$TMPDIR/project"
mkdir -p "$PROJECT_DIR/scripts/lib" \
  "$PROJECT_DIR/packages/design-system/src/components/Button"
git -C "$PROJECT_DIR" init -q
GIT_DIR="$(git -C "$PROJECT_DIR" rev-parse --absolute-git-dir)"
GIT_DIR="$(cd "$GIT_DIR" && pwd -P)"
EVIDENCE_ROOT="$GIT_DIR/governance-runtime/evidence"
cp "$REPO_ROOT/scripts/lib/governance-runtime-evidence.mjs" "$PROJECT_DIR/scripts/lib/governance-runtime-evidence.mjs"
cp "$REPO_ROOT/packages/governance/src/closed-tool-execution.mjs" "$PROJECT_DIR/scripts/lib/closed-tool-execution.mjs"
cat > "$PROJECT_DIR/scripts/verify-deep-audit-coverage.mjs" <<'VERIFY_FIXTURE'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const selfIndex = process.argv.indexOf('--self-provider')
const peerIndex = process.argv.indexOf('--peer-provider')
const selfIsExact = selfIndex >= 0 && process.argv[selfIndex + 1] === 'alpha'
const stateRoot = process.env.GOVERNANCE_STATE_DIR
const neutralReceipt = stateRoot
  ? resolve(stateRoot, '..', 'evidence/deep-audit/fixture-complete.json')
  : null
let receipt = null
try { receipt = neutralReceipt && existsSync(neutralReceipt) ? JSON.parse(readFileSync(neutralReceipt, 'utf8')) : null } catch {}
const immutableProviderClosure = receipt?.secondOpinion === 'waived-by-user'
  || (receipt?.secondOpinion === 'completed' && receipt?.peerEvidence === true)
process.exit(selfIsExact && peerIndex === -1 && immutableProviderClosure ? 0 : 1)
VERIFY_FIXTURE
{
  echo 'const DIMS = {'
  for dim in $(seq 1 91); do
    case "$dim" in
      2) tier='PURE-JUDGMENT' ;;
      3) tier='HOOK-ENFORCED' ;;
      4) tier='CI-ENFORCED' ;;
      *) tier='DETERMINISTIC' ;;
    esac
    printf "  %s: { tier: '%s' },\n" "$dim" "$tier"
  done
  echo '}'
} > "$PROJECT_DIR/scripts/audit-coverage-matrix.mjs"
printf 'export const Button = 1\n' > "$PROJECT_DIR/packages/design-system/src/components/Button/button.tsx"
export GOVERNANCE_PROJECT_DIR="$PROJECT_DIR"
export GOVERNANCE_STATE_DIR="$GIT_DIR/governance-runtime/state"
export GOVERNANCE_READ_ONLY=1
export GOVERNANCE_SELF_PROVIDER=alpha
export GOVERNANCE_SELF_DISPLAY_NAME="Alpha"
export GOVERNANCE_PEER_PROVIDER=beta
export GOVERNANCE_PEER_DISPLAY_NAME="Beta"
export GOVERNANCE_PEER_CLI=beta
export GOVERNANCE_PEER_LOCAL_EXECUTABLE=node_modules/.bin/beta
export GOVERNANCE_PEER_REPLY_ARTIFACT_PREFIX=beta-reply
export GOVERNANCE_PEER_DISCOVERY_MARKERS_JSON='["node_modules/.bin/beta","command -v beta"]'
export GOVERNANCE_INSTRUCTION_ENTRY=AGENTS.md
export GOVERNANCE_SHARED_INSTRUCTION_ENTRY=AGENTS.md

PASS=0; FAIL=0
run_test() {
  local name="$1"; local expect_block="$2"; local transcript_content="$3"; local direct_message="${4:-}"
  local transcript="$TMPDIR/transcript-$$.jsonl"
  printf '%s\n' "$transcript_content" > "$transcript"
  local input
  input=$(jq -nc --arg path "$transcript" --arg message "$direct_message" \
    '{transcript_path:$path,session_id:"test",last_assistant_message:$message}')
  local stdout stderr_file exit_code
  stderr_file=$(mktemp)
  set +e
  stdout=$(echo "$input" | bash "$HOOK" 2>"$stderr_file")
  exit_code=$?
  set -e
  if [ "$expect_block" = "1" ]; then
    if [ "$exit_code" = "0" ] && echo "$stdout" | grep -q '"governanceDecision":"block"'; then
      echo "  PASS  $name (blocked as expected)"; PASS=$((PASS+1))
    else
      echo "  FAIL  $name (expected block, exit=$exit_code, got: ${stdout:0:120}, stderr: $(head -c 160 "$stderr_file"))"; FAIL=$((FAIL+1))
    fi
  else
    if [ "$exit_code" != "0" ]; then
      echo "  FAIL  $name (unexpected exit=$exit_code, stderr: $(head -c 160 "$stderr_file"))"; FAIL=$((FAIL+1))
    elif echo "$stdout" | grep -q '"governanceDecision":"block"'; then
      echo "  FAIL  $name (unexpected block: ${stdout:0:120})"; FAIL=$((FAIL+1))
    else
      echo "  PASS  $name (no block)"; PASS=$((PASS+1))
    fi
  fi
  rm -f "$stderr_file"
}

run_exact_io_test() {
  local name="$1"; local expected_stdout="$2"; local input_file="$3"
  local sequence=$((PASS + FAIL + 1))
  local stdout_file="$TMPDIR/exact-stdout-$sequence"
  local stderr_file="$TMPDIR/exact-stderr-$sequence"
  local exit_code

  bash "$HOOK" < "$input_file" > "$stdout_file" 2> "$stderr_file"
  exit_code=$?

  local stdout_ok=0
  if [ "$expected_stdout" = "empty" ]; then
    [ ! -s "$stdout_file" ] && stdout_ok=1
  elif [ "$expected_stdout" = "claim-block" ]; then
    if [ "$(wc -l < "$stdout_file" | tr -d ' ')" = "1" ] \
      && jq -e -s '
        length == 1
        and (.[0].governanceDecision == "block")
        and ((.[0].reason // "") | contains("CLAIM-VERIFY GAP BLOCKER"))
      ' "$stdout_file" >/dev/null 2>&1; then
      stdout_ok=1
    fi
  fi

  if [ "$exit_code" = "0" ] && [ "$stdout_ok" = "1" ] && [ ! -s "$stderr_file" ]; then
    echo "  PASS  $name (exit=0, stdout=$expected_stdout, stderr=empty)"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $name (exit=$exit_code, stdout-bytes=$(wc -c < "$stdout_file" | tr -d ' '), stderr-bytes=$(wc -c < "$stderr_file" | tr -d ' '))"
    FAIL=$((FAIL+1))
  fi
}

peer_edit_transcript() {
  local user_text="$1"
  local operation_text="$2"
  local assistant_text="${3:-Layer A own: inspected independently. Layer C dissent: retained only supported evidence.}"
  local target="packages/design-system/src/components/Button/button.tsx"
  jq -nc --arg text "$user_text" \
    '{message:{role:"user",content:[{type:"text",text:$text}]}}'
  jq -nc \
    '{message:{role:"assistant",content:[{type:"tool_use",name:"Read",input:{file_path:"/tmp/beta-reply-review.md"}}]}}'
  jq -nc --arg target "$target" \
    '{message:{role:"assistant",content:[{type:"tool_use",name:"Read",input:{file_path:$target}}]}}'
  jq -nc --arg target "$target" --arg operation "$operation_text" \
    '{message:{role:"assistant",content:[{type:"tool_use",name:"Edit",input:{file_path:$target,new_string:$operation}}]}}'
  jq -nc --arg text "$assistant_text" \
    '{message:{role:"assistant",content:[{type:"text",text:$text}]}}'
}

peer_operation_digest() {
  jq -cjn \
    --arg file_path "packages/design-system/src/components/Button/button.tsx" \
    --arg new_string "$1" \
    '{file_path:$file_path,new_string:$new_string}' \
    | shasum -a 256 | cut -d ' ' -f1
}

echo "Test 1: minimal payload → no crash"
out=$(echo '{}' | bash "$HOOK" 2>&1); exit_code=$?
if [ "$exit_code" = "0" ] && ! echo "$out" | grep -q "GOVERNANCE_INTEGRITY:"; then
  echo "  PASS exit=$exit_code"; PASS=$((PASS+1))
else
  echo "  FAIL exit=$exit_code output=${out:0:120}"; FAIL=$((FAIL+1))
fi

# Config faults are infrastructure failures,not policy decisions.
export GOVERNANCE_PEER_REPLY_ARTIFACT_PREFIX=invalid
out=$(echo '{}' | bash "$HOOK" 2>&1)
exit_code=$?
if [ "$exit_code" = "70" ] && echo "$out" | grep -q "GOVERNANCE_INTEGRITY:"; then
  echo "  PASS  Test 1b invalid peer config → integrity 70"; PASS=$((PASS+1))
else
  echo "  FAIL  Test 1b expected integrity 70, got exit=$exit_code output=${out:0:120}"; FAIL=$((FAIL+1))
fi
export GOVERNANCE_PEER_REPLY_ARTIFACT_PREFIX=beta-reply

# Test 2: claim「verified」+ no tsc → BLOCK
# NOTE(2026-05-01): hook find last 真 user prompt(role=user 且 content
# 非 tool_result),fixtures 必有 user msg 在 assistant 之前反映真實
# transcript 結構。
USER_MSG='{"message":{"role":"user","content":[{"type":"text","text":"幫我修 bug"}]}}'

T2="$USER_MSG
"'{"message":{"role":"assistant","content":[{"type":"text","text":"已修完,verified ✓ 全部 done"}]}}'
run_test "Test 2: claim+no-verify → block" 1 "$T2"

# Test 3: claim「verified」+ tsc 跑過 → no block
T3="$USER_MSG
"'{"message":{"role":"assistant","content":[{"type":"text","text":"已修完,verified"}]}}
{"message":{"role":"assistant","content":[{"type":"tool_use","name":"Bash","input":{"command":"npx tsc -b"}}]}}'
run_test "Test 3: claim+tsc → no block" 0 "$T3"

# Test 4: claim「verified」+「撤回 claim」escape → no block
T4="$USER_MSG
"'{"message":{"role":"assistant","content":[{"type":"text","text":"先前 verified 說錯,撤回 claim,實際未修好"}]}}'
run_test "Test 4: claim+retract escape → no block" 0 "$T4"

# Test 5: 純對話無 claim → no block
T5="$USER_MSG
"'{"message":{"role":"assistant","content":[{"type":"text","text":"我來看看這個 bug 是怎麼回事"}]}}'
run_test "Test 5: no claim → no block" 0 "$T5"

# Test 6: claim-denial「明確不 claim verified」preemptive denial → no block
T6="$USER_MSG
"'{"message":{"role":"assistant","content":[{"type":"text","text":"我這次明確不 claim verified,只 tsc 過,實際 browser 行為要 user 驗"}]}}'
run_test "Test 6: preemptive claim denial → no block" 0 "$T6"

# Test 7: Mechanism 7 完整性宣告閘 — 宣告「全部做完」+ 2 edits + 無全庫掃描 → BLOCK
T7="$USER_MSG
"'{"message":{"role":"assistant","content":[{"type":"tool_use","name":"Edit","input":{}}]}}
{"message":{"role":"assistant","content":[{"type":"tool_use","name":"Write","input":{}}]}}
{"message":{"role":"assistant","content":[{"type":"text","text":"全部做完了,beta 已上架,tree 乾淨。"}]}}'
run_test "Test 7: M7 完整性宣告+多改+無掃描 → block" 1 "$T7"

# Test 8: 同上但本 turn 有 grep -rn 全庫掃描 → no block(掃描證據被認列)
T8="$USER_MSG
"'{"message":{"role":"assistant","content":[{"type":"tool_use","name":"Edit","input":{}}]}}
{"message":{"role":"assistant","content":[{"type":"tool_use","name":"Bash","input":{"command":"grep -rn foo .claude packages"}}]}}
{"message":{"role":"assistant","content":[{"type":"tool_use","name":"Write","input":{}}]}}
{"message":{"role":"assistant","content":[{"type":"text","text":"全部做完了,已全庫掃描確認無 loose end。"}]}}'
run_test "Test 8: M7 完整性宣告+多改+有全庫掃描 → no block" 0 "$T8"

# Test 9: M7 negation 排除 — 含「全做完」字串但是 disclaimer(還沒說全做完)+ 多改 + 無掃描 → NO block
T9="$USER_MSG
"'{"message":{"role":"assistant","content":[{"type":"tool_use","name":"Edit","input":{}}]}}
{"message":{"role":"assistant","content":[{"type":"tool_use","name":"Write","input":{}}]}}
{"message":{"role":"assistant","content":[{"type":"text","text":"還沒說「全做完」——等 beta.51 落地 + 最後掃過才有資格。核心做完,完整性掃描待跑。"}]}}'
run_test "Test 9: M7 negation disclaimer(還沒說全做完)→ no block" 0 "$T9"

# Test 10: a complete-looking legacy/provider-local ledger must not satisfy deep-audit completion.
mkdir -p "$PROJECT_DIR/.claude/logs/dim-audit" "$PROJECT_DIR/.claude/logs/codex-dim-audit" \
  "$PROJECT_DIR/.claude/logs/hook-residue" "$PROJECT_DIR/.claude/logs/claude-a1b-deep" \
  "$PROJECT_DIR/.claude/logs/codex-phaseB"
printf '── dim 1: poison\n   exit=0\n' > "$PROJECT_DIR/.claude/logs/dim-audit/_deterministic-results.txt"
printf '%s\n' '{"dim":2,"filesScanned":1,"findings":[]}' > "$PROJECT_DIR/.claude/logs/dim-audit/dim-2.json"
cp "$PROJECT_DIR/.claude/logs/dim-audit/dim-2.json" "$PROJECT_DIR/.claude/logs/codex-dim-audit/dim-2.json"
printf '%s\n' '{"dim":3,"hook":"poison","residueCount":0,"findings":[]}' > "$PROJECT_DIR/.claude/logs/hook-residue/dim-3.json"
printf '%s\n' '{"component":"Button","claimsVerified":1,"falseClaims":[]}' > "$PROJECT_DIR/.claude/logs/claude-a1b-deep/Button.json"
cp "$PROJECT_DIR/.claude/logs/claude-a1b-deep/Button.json" "$PROJECT_DIR/.claude/logs/codex-phaseB/Button.json"
set +e
(cd "$PROJECT_DIR" && node scripts/verify-deep-audit-coverage.mjs --self-provider alpha >/dev/null 2>&1)
VERIFY_FIXTURE_EXIT=$?
set -e
[ "$VERIFY_FIXTURE_EXIT" = "1" ] || { echo "FATAL: incomplete verifier fixture must exit 1, got $VERIFY_FIXTURE_EXIT"; exit 1; }
T10="$USER_MSG
"'{"message":{"role":"assistant","content":[{"type":"text","text":"deep audit 完成"}]}}'
run_test "Test 10: poisoned .claude deep-audit ledger → block" 1 "" "deep audit 完成"

# Test 11: the hook accepts a manifest-authorized one-run waiver after `.claude` deletion,
# and never forwards adapter-injected ambient peer metadata as a verifier assertion.
# Full immutable run/envelope closure belongs to scripts/test-verify-deep-audit-coverage.mjs;
# this focused fixture proves argument wiring and that provider-home poison is never authority.
mkdir -p "$EVIDENCE_ROOT/deep-audit"
printf '%s\n' '{"secondOpinion":"waived-by-user"}' > "$EVIDENCE_ROOT/deep-audit/fixture-complete.json"
rm -rf "$PROJECT_DIR/.claude"
run_test "Test 11: waived immutable run + ambient peer + deleted .claude → no block" 0 "" "deep audit 完成"
[ ! -e "$PROJECT_DIR/infra/governance/runtime" ] || { echo "  FAIL  deep-audit evidence mutated workspace runtime"; FAIL=$((FAIL+1)); }

# A waived run remains valid when the adapter has no peer runtime at all.
unset GOVERNANCE_PEER_PROVIDER GOVERNANCE_PEER_DISPLAY_NAME GOVERNANCE_PEER_CLI \
  GOVERNANCE_PEER_LOCAL_EXECUTABLE GOVERNANCE_PEER_REPLY_ARTIFACT_PREFIX \
  GOVERNANCE_PEER_DISCOVERY_MARKERS_JSON
run_test "Test 11b: waived immutable run + no peer runtime → no block" 0 "" "deep audit 完成"

# Merely switching prose/context to no peer cannot waive a selected run: the
# immutable verifier still requires the selected peer's complete evidence.
printf '%s\n' '{"secondOpinion":"completed","peerEvidence":false}' > "$EVIDENCE_ROOT/deep-audit/fixture-complete.json"
run_test "Test 11c: selected run without peer evidence → block" 1 "" "稽核全部完成"
printf '%s\n' '{"secondOpinion":"completed","peerEvidence":true}' > "$EVIDENCE_ROOT/deep-audit/fixture-complete.json"
run_test "Test 11d: selected run with complete peer evidence → no block" 0 "" "deep audit 完成"

# Restore the normal registry-resolved peer context for the peer-specific hook tests below.
export GOVERNANCE_PEER_PROVIDER=beta
export GOVERNANCE_PEER_DISPLAY_NAME="Beta"
export GOVERNANCE_PEER_CLI=beta
export GOVERNANCE_PEER_LOCAL_EXECUTABLE=node_modules/.bin/beta
export GOVERNANCE_PEER_REPLY_ARTIFACT_PREFIX=beta-reply
export GOVERNANCE_PEER_DISCOVERY_MARKERS_JSON='["node_modules/.bin/beta","command -v beta"]'

# Tests 12-14: inputs larger than a pipe buffer must preserve exact policy and I/O contracts.
# Put each positive marker at the beginning so a producer→`grep -q` implementation would close
# the pipe early and reproduce the historical Bash `echo: write error: Broken pipe` failure.
LARGE_DIRECT_TEXT="$TMPDIR/large-direct-assistant.txt"
{
  printf 'deep audit 完成 '
  awk 'BEGIN { for (i = 0; i < 300000; i++) printf "x" }'
} > "$LARGE_DIRECT_TEXT"
LARGE_DIRECT_INPUT="$TMPDIR/large-direct-input.json"
{
  printf '{"session_id":"test","last_assistant_message":'
  jq -cRs . < "$LARGE_DIRECT_TEXT"
  printf '}\n'
} > "$LARGE_DIRECT_INPUT"

if [ "$(wc -c < "$LARGE_DIRECT_TEXT" | tr -d ' ')" -gt 262144 ]; then
  run_exact_io_test "Test 12: >256KiB direct assistant early deep-audit match" empty "$LARGE_DIRECT_INPUT"
else
  echo "  FAIL  Test 12 fixture is not larger than 256KiB"; FAIL=$((FAIL+1))
fi

LARGE_CLAIM_TEXT="$TMPDIR/large-transcript-assistant.txt"
{
  printf 'verified '
  awk 'BEGIN { for (i = 0; i < 300000; i++) printf "x" }'
} > "$LARGE_CLAIM_TEXT"
LARGE_NO_VERIFY_TRANSCRIPT="$TMPDIR/large-no-verify.jsonl"
printf '%s\n' "$USER_MSG" > "$LARGE_NO_VERIFY_TRANSCRIPT"
jq -cRs '{message:{role:"assistant",content:[{type:"text",text:.}]}}' \
  < "$LARGE_CLAIM_TEXT" >> "$LARGE_NO_VERIFY_TRANSCRIPT"
LARGE_NO_VERIFY_INPUT="$TMPDIR/large-no-verify-input.json"
jq -nc --arg path "$LARGE_NO_VERIFY_TRANSCRIPT" \
  '{transcript_path:$path,session_id:"test"}' > "$LARGE_NO_VERIFY_INPUT"

if [ "$(wc -c < "$LARGE_NO_VERIFY_TRANSCRIPT" | tr -d ' ')" -gt 262144 ]; then
  run_exact_io_test "Test 13: >256KiB transcript early claim without verify" claim-block "$LARGE_NO_VERIFY_INPUT"
else
  echo "  FAIL  Test 13 fixture is not larger than 256KiB"; FAIL=$((FAIL+1))
fi

LARGE_WITH_VERIFY_TRANSCRIPT="$TMPDIR/large-with-verify.jsonl"
printf '%s\n' "$USER_MSG" > "$LARGE_WITH_VERIFY_TRANSCRIPT"
printf '%s\n' \
  '{"message":{"role":"assistant","content":[{"type":"tool_use","name":"Bash","input":{"command":"npx tsc -b"}}]}}' \
  >> "$LARGE_WITH_VERIFY_TRANSCRIPT"
jq -cRs '{message:{role:"assistant",content:[{type:"text",text:.}]}}' \
  < "$LARGE_CLAIM_TEXT" >> "$LARGE_WITH_VERIFY_TRANSCRIPT"
LARGE_WITH_VERIFY_INPUT="$TMPDIR/large-with-verify-input.json"
jq -nc --arg path "$LARGE_WITH_VERIFY_TRANSCRIPT" \
  '{transcript_path:$path,session_id:"test"}' > "$LARGE_WITH_VERIFY_INPUT"
run_exact_io_test "Test 14: >256KiB transcript early verify marker" empty "$LARGE_WITH_VERIFY_INPUT"

# Tests 15-20: Mechanism 4 consumes the same target-bound decision parser as preflight.
T15=$(peer_edit_transcript \
  "請修復 Button 的 TypeScript null bug" \
  'const nextValue = normalizeValue(value)')
run_test "Test 15: peer + exact production engineering remediation → no approval block" 0 "$T15"

T16_OPERATION='return <button className="bg-blue-500 hover:bg-blue-600" />'
T16_OPERATION_SHA=$(peer_operation_digest "$T16_OPERATION")
T16=$(peer_edit_transcript \
  "Button hover 顏色採用藍色並請修改 Button operation sha256:$T16_OPERATION_SHA" \
  "$T16_OPERATION")
run_test "Test 16: peer + exact target-bound UI choice → no approval block" 0 "$T16"

T17=$(peer_edit_transcript \
  "go ahead，全部做完" \
  'return <button className="bg-blue-500 hover:bg-blue-600" />')
run_test "Test 17: peer + generic directive + UI operation → block" 1 "$T17"

T18=$(peer_edit_transcript \
  "所有 engineering bug、refactor、test、governance、infra remediation 都授權直接完成" \
  'return <button className="bg-blue-500 hover:bg-blue-600" />')
run_test "Test 18: peer + standing engineering delegation + UI operation → block" 1 "$T18"

T18A=$(peer_edit_transcript \
  "所有 engineering bug、refactor、test、governance、infra remediation 都授權直接完成" \
  'const nextValue = normalizeValue(value)')
run_test "Test 18a: peer + standing engineering delegation + pure engineering operation → no approval block" 0 "$T18A"

T18B=$(peer_edit_transcript \
  "請修正 Button 的 a11y aria-expanded regression，使其符合既有規格" \
  'return <button aria-expanded={open}>Save</button>')
run_test "Test 18b: peer + exact existing a11y remediation → no approval block" 0 "$T18B"

T18C=$(peer_edit_transcript \
  "請修復 Button 的 keyboard interaction behavior bug" \
  'return <button onKeyDown={handleKeyDown}>Save</button>')
run_test "Test 18c: peer + exact existing behavior remediation → no approval block" 0 "$T18C"

T18D=$(peer_edit_transcript \
  "Button hover 顏色紅色還是藍色由你自行決定" \
  'return <button className="hover:bg-blue-500" />')
run_test "Test 18d: peer + unresolved target UI choice → block" 1 "$T18D"

T18E=$(peer_edit_transcript \
  "請修復 Button hover bug 但紅色還是藍色由你自行決定" \
  'return <button className="hover:bg-blue-500" />')
run_test "Test 18e: peer + remediation wording cannot bypass unresolved UI choice" 1 "$T18E"

T18F_DENIAL=$(printf '保持 Button 不\342\200\213變')
T18F=$(peer_edit_transcript \
  "$T18F_DENIAL" \
  'return <button className="hover:bg-blue-500" />')
run_test "Test 18f: peer + default-ignorable denial remains blocked" 1 "$T18F"

T18G=$(peer_edit_transcript \
  "下面是別人的建議 不代表我的決定：「Button hover 顏色採用藍色 operation sha256:${T16_OPERATION_SHA}」" \
  "$T16_OPERATION")
run_test "Test 18g: peer + quoted non-authoritative product statement → block" 1 "$T18G"

T18H=$(peer_edit_transcript \
  "Button 顏色請你選擇最佳方案 operation sha256:$T16_OPERATION_SHA" \
  "$T16_OPERATION")
run_test "Test 18h: peer + delegated unresolved product choice → block" 1 "$T18H"

T18I=$(peer_edit_transcript \
  "請修復所有既有 a11y regression 但紅色還是藍色由你自行決定" \
  "$T16_OPERATION")
run_test "Test 18i: peer + global remediation carrying unresolved UI choice → block" 1 "$T18I"

for denial in \
  "Button hover 不採用藍色 operation sha256:$T16_OPERATION_SHA" \
  "Button hover 不要使用藍色 operation sha256:$T16_OPERATION_SHA" \
  "Do not use blue for Button hover operation sha256:$T16_OPERATION_SHA"; do
  T18J=$(peer_edit_transcript "$denial" "$T16_OPERATION")
  run_test "Test 18j: peer + negated use/adopt remains blocked" 1 "$T18J"
done

while IFS= read -r non_authoritative; do
  T18K=$(peer_edit_transcript "$non_authoritative" "$T16_OPERATION")
  run_test "Test 18k: peer + attribution/tentative/conditional variant remains blocked" 1 "$T18K"
done <<NON_AUTHORITATIVE_UI_VARIANTS
Reviewer 說：「Button hover 顏色改成藍色 operation sha256:${T16_OPERATION_SHA}」
也許 Button hover 顏色改成藍色 operation sha256:${T16_OPERATION_SHA}
等客戶同意後，把 Button hover 顏色改成藍色 operation sha256:${T16_OPERATION_SHA}
NON_AUTHORITATIVE_UI_VARIANTS

for reference_only in \
  "Use Button as a guide and set Input hover color to blue operation sha256:$T16_OPERATION_SHA" \
  "以 Button 為參考並讓 Input hover 顏色採用藍色 operation sha256:$T16_OPERATION_SHA"; do
  T18L=$(peer_edit_transcript "$reference_only" "$T16_OPERATION")
  run_test "Test 18l: peer + reference-role variant cannot bind Button" 1 "$T18L"
done

for global_resolved_choice in \
  "請修復所有既有 UI regression，顏色統一改成藍色 operation sha256:$T16_OPERATION_SHA" \
  "請修復所有既有 UI regression 並把所有 UI 顏色改成藍色 operation sha256:$T16_OPERATION_SHA"; do
  T18M=$(peer_edit_transcript "$global_resolved_choice" "$T16_OPERATION")
  run_test "Test 18m: peer + global remediation carrying resolved UI choice → block" 1 "$T18M"
done

OLDER_UI_APPROVAL=$(jq -nc --arg text "Button hover 顏色採用藍色，請修改 Button" \
  '{message:{role:"user",content:[{type:"text",text:$text}]}}')
T19="$OLDER_UI_APPROVAL
$(peer_edit_transcript \
  "撤銷 Button 的 UI 修改核准，先不要修改 Button" \
  'return <button className="bg-blue-500" />' \
  'Layer A own: edit already happened. 撤回採納 beta。Layer C dissent: user denial controls.')"
run_test "Test 19: target denial wins even when peer retract marker exists" 1 "$T19"

OLDER_UI_REMEDIATION=$(jq -nc --arg text \
  "請修復 Button 的 a11y regression，對齊既有規格" \
  '{message:{role:"user",content:[{type:"text",text:$text}]}}')
LATER_UI_REVOCATION=$(jq -nc --arg text \
  "撤銷 Button 修改授權，先不要修改 Button" \
  '{message:{role:"user",content:[{type:"text",text:$text}]}}')
T19A="$OLDER_UI_REMEDIATION
$LATER_UI_REVOCATION
$(peer_edit_transcript \
  "go ahead" \
  'return <button aria-expanded={open}>Save</button>')"
run_test "Test 19a: generic continuation cannot jump over later target revocation" 1 "$T19A"

OLDER_BOUND_UI_APPROVAL=$(jq -nc \
  --arg text "Button hover 顏色採用藍色 operation sha256:$T16_OPERATION_SHA" \
  '{message:{role:"user",content:[{type:"text",text:$text}]}}')
LATER_INPUT_REMEDIATION=$(jq -nc --arg text \
  "請修復 Input 的 hover regression，對齊既有規格" \
  '{message:{role:"user",content:[{type:"text",text:$text}]}}')
T19B="$OLDER_BOUND_UI_APPROVAL
$LATER_INPUT_REMEDIATION
$(peer_edit_transcript \
  "go ahead" \
  "$T16_OPERATION")"
run_test "Test 19b: generic continuation cannot revive older Button approval after Input scope" 1 "$T19B"

T19C="$OLDER_BOUND_UI_APPROVAL
$(peer_edit_transcript \
  "Actually, don't do that" \
  "$T16_OPERATION")"
run_test "Test 19c: latest targetless revocation terminates old Button approval" 1 "$T19C"

T20=$(peer_edit_transcript \
  "不要等待核准，繼續修復 Button 的 TypeScript bug" \
  'const nextValue = normalizeValue(value)')
run_test "Test 20: no-wait clause + exact engineering operation → no approval block" 0 "$T20"

T20A=$(peer_edit_transcript \
  "請修復 Input 的 TypeScript null bug" \
  'const nextValue = normalizeValue(value)')
run_test "Test 20a: wrong-target engineering intent cannot authorize Button → block" 1 "$T20A"

echo "Results: $PASS PASS, $FAIL FAIL"
[ "$FAIL" -eq 0 ] || exit 1

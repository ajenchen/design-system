#!/bin/bash
# Tests for stop_repository_text_checks.sh
# 2026-11-17 /knowledge-prune:原 test_stop_audit_content_quality.sh、test_stop_extract_canonical_rules.sh、
# test_stop_repository_command_context.sh 三份合併;每條規則的「有缺口會出聲 / 沒缺口靜默 / 指令失敗可見」
# 兩面都保留,另加「兩條同時出聲」與「一條失敗不吞掉另一條」。
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../stop_repository_text_checks.sh"
ORIGINAL_PATH="$PATH"
TMP_ROOT=$(mktemp -d)
[ -n "$TMP_ROOT" ] && [ -d "$TMP_ROOT" ] || { echo "FATAL: mktemp failed"; exit 1; }
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM
mkdir -p "$TMP_ROOT/bin" "$TMP_ROOT/project/scripts"

# Fake node:依被叫的腳本分流,兩條規則各自有模式。
FAKE_NODE="$TMP_ROOT/bin/node"
printf '%s\n' '#!/bin/bash' \
  'case "$(basename "$1")" in' \
  '  audit-content-quality.mjs) MODE="${FAKE_CQ_MODE:-silent}"' \
  '    case "$MODE" in' \
  '      message) printf "noise\\n[P0] synthetic finding\\n✅ checked\\n" ;;' \
  '      silent) printf "ordinary output\\n" ;;' \
  '      failure) printf "synthetic command failure\\n" >&2; exit 17 ;;' \
  '      *) exit 19 ;;' \
  '    esac ;;' \
  '  extract-canonical-rules.mjs) MODE="${FAKE_RULES_MODE:-silent}"' \
  '    case "$MODE" in' \
  '      message) printf "noise\\nGAPS: synthetic rule gap\\nkeywords missing: synthetic\\n" ;;' \
  '      silent) printf "ordinary output\\n" ;;' \
  '      failure) printf "synthetic extraction failure\\n" >&2; exit 23 ;;' \
  '      *) exit 29 ;;' \
  '    esac ;;' \
  '  *) exit 31 ;;' \
  'esac' > "$FAKE_NODE"
chmod +x "$FAKE_NODE"

PASS=0
FAIL=0
pass() { printf '  PASS  %s\n' "$1"; PASS=$((PASS+1)); }
fail() { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL+1)); }

run_hook() {
  local cq="$1" rules="$2"
  STDOUT_FILE=$(mktemp); STDERR_FILE=$(mktemp)
  set +e
  printf '{"hook_event_name":"Stop","last_assistant_message":"fixture"}\n' \
    | PATH="$TMP_ROOT/bin:$ORIGINAL_PATH" FAKE_CQ_MODE="$cq" FAKE_RULES_MODE="$rules" \
      GOVERNANCE_PROJECT_DIR="$TMP_ROOT/project" bash "$HOOK" >"$STDOUT_FILE" 2>"$STDERR_FILE"
  EXIT_CODE=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT_FILE"); STDERR_TEXT=$(cat "$STDERR_FILE")
  rm -f "$STDOUT_FILE" "$STDERR_FILE"
}
msg_has() { printf '%s' "$STDOUT_TEXT" | jq -e --arg n "$1" '.governanceContext.message | contains($n)' >/dev/null 2>&1; }

if bash -n "$HOOK"; then pass 'syntax is valid'; else fail 'syntax is valid'; fi

run_hook silent silent
if [ "$EXIT_CODE" = 0 ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
  pass 'both checks clean → silent'
else
  fail "both checks clean → silent (exit=$EXIT_CODE stdout=$STDOUT_TEXT stderr=$STDERR_TEXT)"
fi

run_hook message silent
if [ "$EXIT_CODE" = 0 ] && [ -z "$STDERR_TEXT" ] && msg_has 'Content-quality Stop check:' && msg_has '[P0] synthetic finding' \
  && ! msg_has '✅ checked' && ! msg_has 'Canonical-rule extraction'; then
  pass 'content-quality finding alone is reported (green line filtered)'
else
  fail "content-quality finding alone (exit=$EXIT_CODE stdout=$STDOUT_TEXT stderr=$STDERR_TEXT)"
fi

run_hook silent message
if [ "$EXIT_CODE" = 0 ] && [ -z "$STDERR_TEXT" ] && msg_has 'Canonical-rule extraction Stop check:' && msg_has 'GAPS: synthetic rule gap' \
  && ! msg_has 'Content-quality'; then
  pass 'canonical-rule gap alone is reported'
else
  fail "canonical-rule gap alone (exit=$EXIT_CODE stdout=$STDOUT_TEXT stderr=$STDERR_TEXT)"
fi

run_hook message message
if [ "$EXIT_CODE" = 0 ] && msg_has '[P0] synthetic finding' && msg_has 'GAPS: synthetic rule gap' \
  && printf '%s' "$STDOUT_TEXT" | jq -e 'keys == ["governanceContext"] and (.governanceContext | keys == ["hookEventName", "message"]) and .governanceContext.hookEventName == "Stop" and (.governanceContext.message | type == "string")' >/dev/null; then
  pass 'both findings share one exact provider-neutral JSON envelope'
else
  fail "both findings share one envelope ($STDOUT_TEXT)"
fi

run_hook failure message
if [ "$EXIT_CODE" = 0 ] && [ -z "$STDERR_TEXT" ] && msg_has 'execution failed (exit 17)' && msg_has 'synthetic command failure' \
  && msg_has 'GAPS: synthetic rule gap'; then
  pass 'content-quality command failure is visible and does not swallow the other check'
else
  fail "content-quality failure visible (exit=$EXIT_CODE stdout=$STDOUT_TEXT stderr=$STDERR_TEXT)"
fi

run_hook silent failure
if [ "$EXIT_CODE" = 0 ] && [ -z "$STDERR_TEXT" ] && msg_has 'execution failed (exit 23)' && msg_has 'synthetic extraction failure'; then
  pass 'canonical-rule command failure is visible without becoming a false blocker'
else
  fail "canonical-rule failure visible (exit=$EXIT_CODE stdout=$STDOUT_TEXT stderr=$STDERR_TEXT)"
fi

# 真 node + 專案內 fixture 腳本(原 test_stop_repository_command_context.sh):repository command 被 JSON 包好
REAL="$TMP_ROOT/real"
mkdir -p "$REAL/scripts"
printf 'console.log("[P0] fixture content drift")\n' > "$REAL/scripts/audit-content-quality.mjs"
printf 'console.log("GAPS fixture canonical keyword")\n' > "$REAL/scripts/extract-canonical-rules.mjs"
STDOUT_TEXT=$(printf '{"hook_event_name":"Stop","last_assistant_message":"fixture"}\n' | GOVERNANCE_PROJECT_DIR="$REAL" bash "$HOOK" 2>/dev/null)
if msg_has '[P0] fixture content drift' && msg_has 'GAPS fixture canonical keyword'; then
  pass 'real repository commands are JSON-wrapped'
else
  fail "real repository commands are JSON-wrapped ($STDOUT_TEXT)"
fi

printf '\nResults: %s PASS, %s FAIL\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

#!/bin/bash
set -uo pipefail
# Stop hook: AI self-audit — detect 3 anti-patterns + inject corrective context.
#
# 1. Claim-verification gap:assistant claimed「verified / done / 全部 / pass / 完成」
#    in transcript but no verify cmd(tsc / hook test / compile / audit)ran this turn
# 2. Auto-prune trigger:CLAUDE.md > 500 OR foundational SSOT spec > cap → inject
#    /knowledge-prune chain reminder
# 3. Repeated-topic detector:user 問同 topic ≥ 3 turns within session → inject
#    /ensure-canonical reminder(M19 trigger phrase auto-pipeline)
#
# Why: M14 / M19 markdown rules rely on AI memory(unreliable). 本 hook 是 mechanical
# 落地 — AI 不需要記得自我審查,hook 強制 inject 反思 prompt to next turn。
#
# Triggers: every Stop event(low cost ~50ms per turn)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0

INPUT=$(cat 2>/dev/null || echo "{}")
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""' 2>/dev/null)

WARNINGS=""

# ── Mechanism 1: Claim-verification gap ─────────────────────────────────────
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # NOTE(2026-05-01 v3): Claude transcript 把 tool_result 也標 role="user"。
  # 之前 awk 抓到 tool_result line 當「真 user prompt」→ scope window 算錯
  # → fire false positive。
  # 修:grep filter 真 user prompt(role=user 且 content 不是 tool_result),
  # 整 transcript scan(不 tail 500 windowed,避免 edge case)。
  LAST_USER_LINE=$(grep -n '"role":"user"' "$TRANSCRIPT_PATH" 2>/dev/null | \
    grep -v '"type":"tool_result"' | tail -1 | cut -d: -f1)
  LAST_USER_LINE=${LAST_USER_LINE:-0}
  if [ "$LAST_USER_LINE" -gt 0 ]; then
    LAST_ASSISTANT=$(tail -n +$((LAST_USER_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null | \
      jq -r 'select(.message.role=="assistant") | .message.content[]?.text // empty' 2>/dev/null)
  else
    LAST_ASSISTANT=""
  fi

  # Detect claim keywords
  # NOTE(2026-05-01): 縮窄 CLAIM_RE — 移除「完成 / 沒問題 / 全部 done / 全綠 / 永遠合規」
  # over-broad conversational 字眼(每 turn 結尾「commit 完成 push」/「沒問題」自然出現,
  # false positive 率高)。保留 strong verification claim(verified / 0 errors / tsc 0 等)。
  # NOTE(2026-05-01): 移除「✅」— 我用 ✅ 在 markdown table 列 status(「✅ 同樣 / ✅ 已 done」)
  # 不是 claim verified done。CLAIM_RE match ✅ 在 table context = false positive。
  # 仍保留 strong verbal claim:verified / 0 errors / done\.(literal period)/ tsc 0
  CLAIM_RE='(verified|all green|all pass|0 errors|tsc 0|done\.|complete\.)'
  # 撤回 escape:assistant 已明確撤回 / 認錯 / 預先聲明否定 / 已 inline 跑 verify → 不 trigger gap
  # 包含 claim-denial patterns(「不 claim」「沒 claim」「明確不」)避免 false positive。
  # 加 verify-result patterns(2026-05-01):AI inline 跑 tsc / build 顯示 result 字眼,
  # 證明本 turn 已驗證,不應 trigger gap。
  RETRACT_RE='(撤回 claim|false claim|沒修好|未驗證|未驗 真實|撤回|不 claim|沒 claim|明確不|明確未|not yet verified|tsc exit 0|tsc:[[:space:]]*0|built in [0-9]+|✓ built|build-storybook exit 0|exit code 0)'
  if echo "$LAST_ASSISTANT" | grep -qiE "$CLAIM_RE" && ! echo "$LAST_ASSISTANT" | grep -qiE "$RETRACT_RE"; then
    # Check if any verify-class tool_use happened in THIS turn(after last user msg)
    VERIFY_RE='(npx tsc|bash .claude/hooks/tests|compile-stories|npm run build|npm run test|design-system-audit|visual-audit)'
    if [ "$LAST_USER_LINE" -gt 0 ]; then
      THIS_TURN_TOOLS=$(tail -n +$((LAST_USER_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null)
    else
      THIS_TURN_TOOLS=""
    fi
    if ! echo "$THIS_TURN_TOOLS" | grep -qE "$VERIFY_RE"; then
      WARNINGS="${WARNINGS}\n  • Claim-verify gap:你說 verified / done / 完成 等,但本 turn 無 tsc / test / audit 真執行。下輪實跑驗證或撤回 claim。"
      # 標記 CRITICAL — Mechanism 1 升 BLOCKER(2026-04-30 升級):AI claim done 但無驗證
      # = 100+ 次重複 failure mode。不再 silent log,exit `decision: block` 強制 turn 不結束。
      CRITICAL_CLAIM_VERIFY=1
    fi
  fi
fi

# ── Mechanism 2: Auto-prune trigger ─────────────────────────────────────────
if [ -f CLAUDE.md ]; then
  L=$(wc -l < CLAUDE.md | tr -d ' ')
  if [ "$L" -gt 500 ]; then
    WARNINGS="${WARNINGS}\n  • CLAUDE.md ${L} 行(over 500 — auto-prune trigger)。下輪 invoke /knowledge-prune scope=full,不 defer。"
  fi
fi

# Foundational SSOT spec over cap
for f in src/design-system/tokens/color/color.spec.md \
         src/design-system/patterns/element-anatomy/item-anatomy.spec.md \
         src/design-system/components/Sidebar/sidebar.spec.md \
         src/design-system/components/TreeView/tree-view.spec.md \
         src/design-system/components/Field/field.spec.md \
         src/design-system/components/Field/field-controls.spec.md \
         src/design-system/components/Button/button.spec.md \
         src/design-system/patterns/overlay-surface/overlay-surface.spec.md \
         src/design-system/patterns/action-bar/action-bar.spec.md \
         src/design-system/tokens/uiSize/uiSize.spec.md; do
  [ -f "$f" ] || continue
  L=$(wc -l < "$f" | tr -d ' ')
  case "$f" in
    */item-anatomy.spec.md) cap=1200 ;;
    *) cap=800 ;;
  esac
  if [ "$L" -gt "$cap" ]; then
    WARNINGS="${WARNINGS}\n  • $f ${L}/${cap} cap — auto-prune trigger,下輪 /knowledge-prune"
  fi
done

# ── Mechanism 3: Repeated-topic detector(session-scope, M13/M19 trigger)──
#
# Threshold rationale(對齊 ≥ 3 家世界級 governance system,M8 binding)─────
#
# | 工具 | Threshold 哲學 | 對應本 hook |
# |------|---------------|-------------|
# | Bugsnag | occurrence count = 5 before alerting | trigger ≥ 5 |
# | PagerDuty | time-window dedup = 5 min | dedup window 30m(below) |
# | Datadog Watchdog | mean + 2σ outlier detection | TODO: dynamic threshold(baseline) |
# | ESLint | max-warnings = 10 | topic > 10 |
# | Sentry | alert frequency = 10 events/hour | topic > 10 |
# | SonarQube | cognitive complexity = 15(較寬)| topic upper bound reference |
#
# Current threshold(fixed,對齊 Bugsnag/ESLint/Sentry minimum 共識):
# - Trigger phrase: ≥ 5(對齊 Bugsnag occurrence count 5)
# - Topic repeat: > 10(對齊 ESLint max-warnings 10 + Sentry alert freq 10)
# - Dedup count: ≥ 5(對齊 Bugsnag occurrence count 5;同 warning fired
#   ≥ 5 次 still 沒解 = 該 user 主動處理,inject 第 6 次仍無效)
#
# TODO: When `.claude/logs/self-audit-baseline-counts.jsonl` 累積 ≥ 100 samples,
# 改 dynamic threshold = baseline mean + 2σ(對齊 Datadog Watchdog 哲學)。
# Baseline capture mechanism 在本檔結尾(每 turn 寫 trigger/topic count
# 不論 fire 與否,讓 future analysis 有 ground truth distribution)。
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # Extract user message texts from transcript(縮 500→200,只看最近 turns)
  USER_MSGS=$(tail -200 "$TRANSCRIPT_PATH" 2>/dev/null | \
    jq -r 'select(.message.role=="user") | .message.content // empty | if type=="string" then . else (.[]? | .text // empty) end' 2>/dev/null)

  # Detect M13/M19-style trigger phrases repeated across turns
  TRIGGER_RE='(確保|永遠|不留待辦|不能漂移|沒例外|ensure|always|never|world-class|世界級)'
  TRIGGER_COUNT=$(echo "$USER_MSGS" | grep -ciE "$TRIGGER_RE" 2>/dev/null)
  TRIGGER_COUNT=${TRIGGER_COUNT:-0}

  if [ "$TRIGGER_COUNT" -ge 5 ]; then
    WARNINGS="${WARNINGS}\n  • User trigger-phrase 累計 ${TRIGGER_COUNT} 次(M19 strong signal)。確認 /ensure-canonical 5-layer 全做完;若有任一 layer skip = 違反 M19。"
  fi

  # Same-topic repetition(quick keyword overlap heuristic)
  TOPIC_KEYWORDS=$(echo "$USER_MSGS" | tr -s '[:space:]' '\n' | \
    grep -iE '^(audit|prune|principles|trait|canonical|hook|skill|world-class|infra)$' | \
    sort | uniq -c | sort -rn | head -3)
  TOP_COUNT=$(echo "$TOPIC_KEYWORDS" | head -1 | awk '{print $1}')

  if [ -n "$TOP_COUNT" ] && [ "$TOP_COUNT" -gt 10 ]; then
    TOP_TOPIC=$(echo "$TOPIC_KEYWORDS" | head -1 | awk '{print $2}')
    WARNINGS="${WARNINGS}\n  • Topic「${TOP_TOPIC}」repeated ${TOP_COUNT}x — likely user 第 N 次提示同主題,可能 prior turns 落地不徹底。"
  fi

  # ── Baseline capture(每 turn always log trigger/topic counts,不論 fire)
  # 為 future dynamic threshold(mean + 2σ)累積 ground truth distribution。
  BASELINE_FILE="$PROJECT_DIR/.claude/logs/self-audit-baseline-counts.jsonl"
  mkdir -p "$(dirname "$BASELINE_FILE")" 2>/dev/null
  printf '{"ts":"%s","trigger":%d,"topic":%d,"fired":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "${TRIGGER_COUNT:-0}" \
    "${TOP_COUNT:-0}" \
    "$([ -n "$WARNINGS" ] && echo true || echo false)" \
    >> "$BASELINE_FILE" 2>/dev/null || true
fi

# Silent if nothing
[ -z "$WARNINGS" ] && exit 0

# Dedup(2026-05-01):若同樣 warning content 已連續寫 ≥ 5 次 entry,skip 本次
# 寫入 — 對齊 Bugsnag occurrence count = 5 哲學:同 warning fired ≥ 5 次仍沒解
# = 該 user 主動處理,inject 第 6 次仍無效。避免 inject 一直 echo 老 warning。
if [ -f "$PROJECT_DIR/.claude/logs/self-audit-warnings.jsonl" ]; then
  WARN_HASH=$(printf '%b' "$WARNINGS" | shasum -a 256 2>/dev/null | cut -c1-16)
  RECENT_HASHES=$(tail -5 "$PROJECT_DIR/.claude/logs/self-audit-warnings.jsonl" 2>/dev/null | \
    jq -r '.warnings // empty' 2>/dev/null | \
    while IFS= read -r w; do printf '%s' "$w" | shasum -a 256 2>/dev/null | cut -c1-16; done)
  DEDUP_COUNT=$(echo "$RECENT_HASHES" | grep "^${WARN_HASH}$" 2>/dev/null | wc -l | tr -d ' ')
  DEDUP_COUNT=${DEDUP_COUNT:-0}
  if [ "$DEDUP_COUNT" -ge 5 ]; then
    exit 0
  fi
fi

# 永遠 log warnings(下 turn 透過 inject_pending_self_audit 看到)
mkdir -p "$PROJECT_DIR/.claude/logs" 2>/dev/null
printf '{"ts":"%s","warnings":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$(printf '%b' "$WARNINGS" | jq -Rs .)" \
  >> "$PROJECT_DIR/.claude/logs/self-audit-warnings.jsonl" 2>/dev/null || true

# ── BLOCKER upgrade(2026-04-30):Mechanism 1 claim-verify gap 升 block ──
# Anthropic Stop hook 接受 stdout JSON `{"decision":"block","reason":...}` 強制 turn
# 不結束,AI 必先處理 reason 再能完成。這修補 100+ 次重複 failure:AI claim done →
# 下 turn user 才發現未修 → 我重發現 → 補修。
#
# 防 infinite loop:同一 claim hash 已 block 過 1 次 → 該 turn 不再 block(降 warn)。
# 假設同一 claim hash:assistant text 末 200 char 的 sha256 prefix。
if [ "${CRITICAL_CLAIM_VERIFY:-0}" = "1" ] && [ -n "$LAST_ASSISTANT" ]; then
  CLAIM_HASH=$(echo "$LAST_ASSISTANT" | tail -c 200 | shasum -a 256 | cut -c1-16)
  LAST_BLOCKED_FILE="$PROJECT_DIR/.claude/logs/.last-blocked-claim.txt"
  LAST_BLOCKED=""
  [ -f "$LAST_BLOCKED_FILE" ] && LAST_BLOCKED=$(cat "$LAST_BLOCKED_FILE" 2>/dev/null || echo "")

  if [ "$CLAIM_HASH" != "$LAST_BLOCKED" ]; then
    # 第一次 block,記 hash 防 loop
    echo "$CLAIM_HASH" > "$LAST_BLOCKED_FILE" 2>/dev/null || true
    REASON=$(printf '%s' \
      "🚨 CLAIM-VERIFY GAP BLOCKER:你 claim「verified / done / 完成」但本 turn 沒跑 tsc / test / audit / visual 真驗證。立刻 (a) 跑 npx tsc -b + 對應驗證指令,OR (b) 在本 turn 明確撤回 claim(打「撤回 claim」/「未驗證」)。否則 turn 不結束。" \
      "本機制 = M20 100+ 次 failure mode 升 BLOCKER(原 silent inject → block)。")
    # Anthropic Stop hook decision:block 格式
    printf '{"decision":"block","reason":%s}\n' "$(printf '%s' "$REASON" | jq -Rs .)"
    exit 0
  fi
fi

exit 0

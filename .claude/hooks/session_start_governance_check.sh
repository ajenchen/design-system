#!/bin/bash
set -uo pipefail
# SessionStart hook: check if governance hygiene actions are overdue; if so,
# inject reminder into session context so Claude proactively addresses them.
#
# Why: M10 — silent tech debt violates. If /knowledge-prune last ran 3+ months
# ago, CLAUDE.md is over 800 lines, or user-corrections.jsonl has pending
# entries not yet codified → user / Claude should know at session start, not
# discover later when things break.
#
# Two-tier thresholds(2026-04-25 G1):
#   • Soft — inject reminder,non-blocking
#   • Hard(2x soft)— inject BLOCKER context requiring Claude's first action
#     to be /knowledge-prune(SessionStart hooks cannot truly block session,
#     but hard-tier context is prefixed with 🚨 BLOCKER / REQUIRED_FIRST_ACTION
#     so Claude reads it as must-address-first instruction)
#
# Checks + thresholds:
#   1. CLAUDE.md line count     — soft 400 / hard 800(CLAUDE.md L34 SSOT: transition 400 / hard cap 800)
#   2. Days since last prune    — soft 90   / hard 180
#   3. user-corrections pending — soft 20   / hard 40
#   4. Benchmarks freshness     — auto-fetch at 30 days(no hard tier)

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0

REMINDERS=""
BLOCKERS=""

# Check 1: CLAUDE.md size(soft 800 / hard 1000)
if [ -f CLAUDE.md ]; then
  LINES=$(wc -l < CLAUDE.md | tr -d ' ')
  # 2026-04-26 tightened thresholds(對應 M19 + user 質問「auto self-improve」要更主動):
  # 400 hard target / 500 soft / 600 strong-warn / 800 transition-cap blocker
  if [ "$LINES" -gt 800 ]; then
    BLOCKERS="${BLOCKERS}\n- CLAUDE.md is ${LINES} lines(transition cap 800 breached). /knowledge-prune REQUIRED FIRST ACTION this session."
  elif [ "$LINES" -gt 600 ]; then
    REMINDERS="${REMINDERS}\n- CLAUDE.md is ${LINES} lines(50% over 400 hard target). /knowledge-prune strongly recommended this session."
  elif [ "$LINES" -gt 500 ]; then
    REMINDERS="${REMINDERS}\n- CLAUDE.md is ${LINES} lines(approaching 600 strong-warn). Consider /knowledge-prune."
  fi
fi

# Check 2: Last /knowledge-prune commit(soft 90d / hard 180d)
LAST_PRUNE=$(git log --format='%ct' --grep='knowledge-prune\|prune:\|governance.*prune' -1 2>/dev/null || echo "")
if [ -n "$LAST_PRUNE" ]; then
  NOW=$(date +%s)
  DAYS=$(( (NOW - LAST_PRUNE) / 86400 ))
  if [ "$DAYS" -gt 180 ]; then
    BLOCKERS="${BLOCKERS}\n- Last /knowledge-prune was ${DAYS} days ago(HARD THRESHOLD 180 breached). /knowledge-prune REQUIRED FIRST ACTION this session."
  elif [ "$DAYS" -gt 90 ]; then
    REMINDERS="${REMINDERS}\n- Last /knowledge-prune commit was ${DAYS} days ago (target: quarterly ≤ 90 days)."
  fi
fi

# Check 3: user-corrections pending(soft 20 / hard 40)
CORRECTIONS_LOG="$PROJECT_DIR/.claude/logs/user-corrections.jsonl"
if [ -f "$CORRECTIONS_LOG" ]; then
  CORRECTION_COUNT=$(wc -l < "$CORRECTIONS_LOG" | tr -d ' ')
  if [ "$CORRECTION_COUNT" -gt 40 ]; then
    BLOCKERS="${BLOCKERS}\n- ${CORRECTION_COUNT} user-corrections pending(HARD THRESHOLD 40 breached). /codify-corrections REQUIRED FIRST ACTION this session."
  elif [ "$CORRECTION_COUNT" -gt 20 ]; then
    REMINDERS="${REMINDERS}\n- ${CORRECTION_COUNT} user-correction signals pending codification (.claude/logs/user-corrections.jsonl). Review + codify pending ones."
  fi
fi

# Check 4: benchmarks freshness — AUTO-RUN fetcher if > 30 days or never fetched
# (對齊 M14 AUTO integrate pipeline — external signal refresh 不等 user 提醒)
BENCH_DIR="$PROJECT_DIR/.claude/benchmarks"
if [ -d "$BENCH_DIR" ]; then
  LAST_FETCH_FILE="$BENCH_DIR/last-fetch.txt"
  SHOULD_AUTO_FETCH=0

  if [ ! -f "$LAST_FETCH_FILE" ]; then
    SHOULD_AUTO_FETCH=1
    FETCH_REASON="never fetched"
  else
    LAST_TS=$(stat -f '%m' "$LAST_FETCH_FILE" 2>/dev/null || echo "0")
    NOW=$(date +%s)
    DAYS=$(( (NOW - LAST_TS) / 86400 ))
    if [ "$DAYS" -gt 30 ]; then
      SHOULD_AUTO_FETCH=1
      FETCH_REASON="${DAYS} days stale"
    fi
  fi

  # Background fetch(不 block session 起動,寫結果供下次 session 用)
  # 只有 fetcher 存在才跑,容忍網路錯誤(fetch.sh 內建 fail-silent)
  if [ "$SHOULD_AUTO_FETCH" = "1" ] && [ -x "$BENCH_DIR/fetch.sh" ]; then
    (bash "$BENCH_DIR/fetch.sh" > "$BENCH_DIR/.last-auto-fetch.log" 2>&1 &) 2>/dev/null
    REMINDERS="${REMINDERS}\n- Benchmarks ${FETCH_REASON} → auto-fetching in background(結果寫 .last-auto-fetch.log,下次 session 生效)"
  elif [ "$SHOULD_AUTO_FETCH" = "1" ]; then
    REMINDERS="${REMINDERS}\n- Benchmarks ${FETCH_REASON} → manually run \`bash .claude/benchmarks/fetch.sh\`"
  fi
fi

# Check 6: Fix commits without /scan-similar-bugs invoke(M10 mechanical 落地)
# Detect 24h 內 fix( commit 但 skill-invokes log 沒對應 scan-similar-bugs invoke
RECENT_FIX_COMMITS=$(git log --since='24 hours ago' --grep='^fix(\|^bugfix:\|^fix:' --oneline 2>/dev/null | head -5 || true)
if [ -n "$RECENT_FIX_COMMITS" ]; then
  SKILL_LOG="$PROJECT_DIR/.claude/logs/skill-invokes.jsonl"
  RECENT_SCAN_INVOKE=0
  if [ -f "$SKILL_LOG" ]; then
    # Check 24h 內有 scan-similar-bugs invoke
    NOW_EPOCH=$(date -u +%s)
    DAY_AGO_EPOCH=$(( NOW_EPOCH - 86400 ))
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      if echo "$line" | grep -q "scan-similar-bugs"; then
        TS=$(echo "$line" | jq -r '.ts // empty' 2>/dev/null)
        if [ -n "$TS" ]; then
          TS_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$TS" +%s 2>/dev/null || echo 0)
          if [ "$TS_EPOCH" -gt "$DAY_AGO_EPOCH" ]; then
            RECENT_SCAN_INVOKE=1
            break
          fi
        fi
      fi
    done < "$SKILL_LOG"
  fi
  if [ "$RECENT_SCAN_INVOKE" = "0" ]; then
    FIX_LIST=$(echo "$RECENT_FIX_COMMITS" | sed 's/^/  - /' | head -3)
    REMINDERS="${REMINDERS}\n- 24h 內 fix commit(s) 未 follow /scan-similar-bugs(M10 mechanical 落地):\n${FIX_LIST}\n  考慮 invoke /scan-similar-bugs 確認 DS-wide 同類 bug 全清。"
  fi
fi

# Check 5: Fire-weighted test gap(G7)— hooks with fires > 100 but no test
FIRES_LOG="$PROJECT_DIR/.claude/logs/hook-fires-per-hook.jsonl"
TESTS_DIR="$PROJECT_DIR/.claude/hooks/tests"
if [ -f "$FIRES_LOG" ] && [ -d "$TESTS_DIR" ]; then
  # Top hot hooks by fire count(讀近 10000 lines 防 log 太長跑太久)
  HOT_HOOKS=$(tail -10000 "$FIRES_LOG" 2>/dev/null \
    | jq -r '.hook // empty' 2>/dev/null \
    | sort | uniq -c | sort -rn \
    | awk '$1 > 100 { sub(/\.sh$|\.py$/, "", $2); print $1, $2 }')
  HOT_GAPS=""
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    COUNT=$(echo "$line" | awk '{print $1}')
    NAME=$(echo "$line" | awk '{print $2}')
    if [ ! -f "$TESTS_DIR/test_${NAME}.sh" ]; then
      HOT_GAPS="${HOT_GAPS}\n  - ${NAME}(${COUNT} fires,無 test)"
    fi
  done <<< "$HOT_HOOKS"
  if [ -n "$HOT_GAPS" ]; then
    REMINDERS="${REMINDERS}\n- Fire-weighted test gap(hook > 100 fires 仍無 test):${HOT_GAPS}\n  推力:寫 \`.claude/hooks/tests/test_<name>.sh\`,參考 test_check_story_anatomy.sh。"
  fi
fi

# Check 7: Hook count auto-trigger(soft 25 / hard 30 — Anthropic guideline ~15)
PRUNE_TRIGGERS=""
HOOKS_DIR="$PROJECT_DIR/.claude/hooks"
HOOK_COUNT=0
if [ -d "$HOOKS_DIR" ]; then
  HOOK_COUNT=$(find "$HOOKS_DIR" -maxdepth 1 \( -name "*.sh" -o -name "*.py" \) -not -name "_log-fire*" 2>/dev/null | wc -l | tr -d ' ')
  HOOK_COUNT=${HOOK_COUNT:-0}
fi
if [ "$HOOK_COUNT" -gt 30 ]; then
  BLOCKERS="${BLOCKERS}\n- Hook count ${HOOK_COUNT}(hard 30 — Anthropic guideline ~15). /knowledge-prune REQUIRED FIRST ACTION 評估 retire / consolidate."
elif [ "$HOOK_COUNT" -gt 25 ]; then
  PRUNE_TRIGGERS="${PRUNE_TRIGGERS}\n- Hook count ${HOOK_COUNT}(soft 25 trigger — Anthropic guideline ~15). /knowledge-prune 評估 retire / consolidate 候選."
fi

# Check 8: Memory entries auto-trigger(soft 18 / hard 20)
# Path resolution(2026-05-01):harness user-local 為 SSOT,fallback 到 repo `.claude/memory/`
# 讓 cloud sandbox(claude.ai/code / Codespaces / Cursor cloud)mirror snapshot 仍 trigger 正確 prune signal
HARNESS_MEMORY_DIR="$HOME/.claude/projects/-Users-chenqiren-Library-CloudStorage-GoogleDrive-qijenchen-gmail-com--------my-project/memory"
REPO_MEMORY_DIR=".claude/memory"
if [ -d "$HARNESS_MEMORY_DIR" ]; then
  MEMORY_DIR="$HARNESS_MEMORY_DIR"
elif [ -d "$REPO_MEMORY_DIR" ]; then
  MEMORY_DIR="$REPO_MEMORY_DIR"
else
  MEMORY_DIR=""
fi
MEM_COUNT=0
if [ -n "$MEMORY_DIR" ] && [ -d "$MEMORY_DIR" ]; then
  MEM_COUNT=$(find "$MEMORY_DIR" -maxdepth 1 -name "*.md" -not -name "MEMORY.md" -not -name "README.md" 2>/dev/null | wc -l | tr -d ' ')
  MEM_COUNT=${MEM_COUNT:-0}
fi
if [ "$MEM_COUNT" -gt 20 ]; then
  BLOCKERS="${BLOCKERS}\n- Memory entries ${MEM_COUNT}(hard 20 cap). /knowledge-prune REQUIRED FIRST ACTION."
elif [ "$MEM_COUNT" -ge 18 ]; then
  PRUNE_TRIGGERS="${PRUNE_TRIGGERS}\n- Memory entries ${MEM_COUNT}(soft 18 trigger,20 = hard cap). /knowledge-prune 建議排程."
fi

# Inject if HARD BLOCKERS(must)or auto-prune-triggers or quarterly-prune-overdue
QUARTERLY_DUE=""
if [ -f .claude/logs/.last-prune ]; then
  PRUNE_DAYS=$(( ( $(date +%s) - $(stat -f %m .claude/logs/.last-prune 2>/dev/null || stat -c %Y .claude/logs/.last-prune 2>/dev/null || echo 0) ) / 86400 ))
  [ "$PRUNE_DAYS" -ge 90 ] && QUARTERLY_DUE="\n- Last /knowledge-prune ${PRUNE_DAYS} days ago(quarterly target ≤ 90 days). Invoke /knowledge-prune this session if convenient."
fi

[ -z "$BLOCKERS" ] && [ -z "$QUARTERLY_DUE" ] && [ -z "$PRUNE_TRIGGERS" ] && exit 0

if [ -n "$BLOCKERS" ]; then
  MSG="🚨 BLOCKER — governance hard thresholds breached (SessionStart):${BLOCKERS}\n\n"
  MSG="${MSG}⚠️ REQUIRED_FIRST_ACTION:先 invoke 上述 skill(/knowledge-prune 或 /codify-corrections)"
  MSG="${MSG}把 governance 帶回健康區間,再處理 user 的實際請求。"
  [ -n "$PRUNE_TRIGGERS" ] && MSG="${MSG}\n\n附 soft prune triggers:${PRUNE_TRIGGERS}"
  [ -n "$QUARTERLY_DUE" ] && MSG="${MSG}\n${QUARTERLY_DUE}"
elif [ -n "$PRUNE_TRIGGERS" ]; then
  MSG="⚙️ Auto-prune triggers fired (SessionStart):${PRUNE_TRIGGERS}\n建議 invoke /knowledge-prune scope=full 評估 retire / consolidate.${QUARTERLY_DUE}"
else
  MSG="🧭 Governance hygiene reminder (SessionStart):${QUARTERLY_DUE}\nNot blocking — address inline when convenient."
fi
ESCAPED=$(printf '%b' "$MSG" | jq -Rs .)
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":%s}}\n' "$ESCAPED"
exit 0

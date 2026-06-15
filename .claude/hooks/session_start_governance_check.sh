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

# 2026-05-30:移除 -e(對齊 L2 set -uo)。本 hook = 非阻塞 governance reminder,必永遠 exit 0;
# set -e 會讓任何未 guard 的 command(eg. L38 grep no-match pipeline 在 node-missing degraded env)
# 殺掉整個 session-start hook。fail-open > fail-closed。adversarial-verify 2026-05-30 抓出此真 bug。
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0

# 2026-05-26 folded auto_sync_memory.sh in here(retire that hook for D8a budget):
# Per CLAUDE.md governance hook count budget,SessionStart-only utility helper inline
# under main governance hook 比 separate hook 更合 anti-bloat。
# Memory sync = harness ↔ repo mirror auto-fix-up,not blocking,always exit 0。
if [ -f scripts/sync-memory.mjs ]; then
  SYNC_OUT=$(node scripts/sync-memory.mjs 2>&1 || true)
  COPIED=$(echo "$SYNC_OUT" | grep -oE 'copied: [0-9]+' | grep -oE '[0-9]+' | head -1 || true)
  # COPIED > 0 → 加入 REMINDERS(下面 main flow inject)
  if [ -n "$COPIED" ] && [ "$COPIED" -gt 0 ]; then
    MEMSYNC_NOTE="\n- 🔄 auto sync-memory(SessionStart): harness → repo mirrored ${COPIED} memory file(s)。"
  fi
fi

REMINDERS="${MEMSYNC_NOTE:-}"
BLOCKERS=""

# Check 1: CLAUDE.md size(soft 800 / hard 1000)
if [ -f CLAUDE.md ]; then
  LINES=$(wc -l < CLAUDE.md | tr -d ' ')
  # 2026-04-26 tightened thresholds(對應 M19 + user 質問「auto self-improve」要更主動):
  # SSOT alignment per CLAUDE.md L35: target ≤ 200 / transition ≤ 400 / hard cap 800
  # Stratified soft warnings: 500 approaching / 600 strong / 800 hard-cap blocker
  if [ "$LINES" -gt 800 ]; then
    BLOCKERS="${BLOCKERS}\n- CLAUDE.md is ${LINES} lines(hard cap 800 breached). /knowledge-prune REQUIRED FIRST ACTION this session."
  elif [ "$LINES" -gt 600 ]; then
    REMINDERS="${REMINDERS}\n- CLAUDE.md is ${LINES} lines(50% over 400 transition cap). /knowledge-prune strongly recommended this session."
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

# Check 7: Hook count auto-trigger(soft 26 / hard 60 — Anthropic guideline ~15;真值見下方 -gt 判斷 + CLAUDE.md `# 治理 canonical`)
# 2026-05-09 fix:tree-recursive count(含 lib/ helpers)。前身 -maxdepth 1 只 count root,
# 漏 16 個 lib/ helpers → metric reports 19,reality 35 = system gaming own metric。
# 2026-05-13 prune consolidation:`_*.sh` 約定 = internal helper(Unix convention)。
# Lib helpers renamed `_<name>.sh` 並 fold under `post_edit_dispatcher.sh`(1 registered hook)。
# Find rule 排除 `_*` 因 _ prefix 表「非 first-class hook,由 dispatcher orchestrate」—
# 對齊 `_log-fire.sh` 既有 exclusion 原則。Settings.json 中 _* files 不可作 hook registration。
# 排除:retired/ + tests/ + _* internal helpers.
PRUNE_TRIGGERS=""
HOOKS_DIR="$PROJECT_DIR/.claude/hooks"
HOOK_COUNT=0
if [ -d "$HOOKS_DIR" ]; then
  HOOK_COUNT=$(find "$HOOKS_DIR" \( -name "*.sh" -o -name "*.py" \) \
    -not -path "*/retired/*" -not -path "*/tests/*" -not -name "_*" \
    2>/dev/null | wc -l | tr -d ' ')
  HOOK_COUNT=${HOOK_COUNT:-0}
fi
# 2026-06-11 deep-audit R2(n=8)重估:訊息原以 3 consumer hooks(check_consumer_no_ds_catalog /
# check_consumer_story_baseline / check_consumer_ds_primitive_misuse)作 60 cap rationale,該 3 hook
# 已 2026-06-11 prune-merge 入 check_consumer_app_invariants.sh(retired/2026-06-11-prune-merge/),
# 現值 52。重估 verdict:60 維持 — 52 + 8 headroom(~15%)符合「升 cap 只為已 justified 新 hook」
# 歷史節奏;降 cap 屬治理 substantive(soft 26 已在 27+ 提供 advisory),留 /knowledge-prune 評估。
if [ "$HOOK_COUNT" -gt 60 ]; then
  BLOCKERS="${BLOCKERS}\n- Hook count ${HOOK_COUNT}(hard 60 — Anthropic guideline ~15;含 root + lib/,排 retired/tests/). 2026-05-27 升 50→55→60(當時 3 consumer hooks ship;該 3 hook 已 2026-06-11 prune-merge 入 check_consumer_app_invariants,現值基準 52,cap 60 經 2026-06-11 重估維持)。超 60 = 先跑 /knowledge-prune 評估 retire / consolidate,不直接 re-raise。"
elif [ "$HOOK_COUNT" -gt 26 ]; then
  # 2026-05-15 raised soft cap 25→26 per /knowledge-prune D2 audit:
  # 26 wired hooks reflects M30 wrapper-schema-drift 新增 dedicated hook(justified evolution
  # not bloat,per Task #19 closed analysis)。Re-raise to 27+ 需 audit re-justify。
  PRUNE_TRIGGERS="${PRUNE_TRIGGERS}\n- Hook count ${HOOK_COUNT}(soft 26 trigger,2026-05-15 升 — Anthropic guideline ~15;含 root + lib/). /knowledge-prune 評估 retire / consolidate 候選."
fi

# Check 8: Memory entries auto-trigger(soft 18 / hard 20)
# Path resolution(2026-05-08 fix):isolation-friendly precedence —
#   1. PROJECT_DIR/.claude/memory(讓 test sandbox CLAUDE_PROJECT_DIR 隔離 work)
#   2. harness user-local SSOT(實際 production 路徑)
#   3. repo mirror fallback(cloud sandbox snapshot)
HARNESS_MEMORY_DIR="$HOME/.claude/projects/-Users-chenqiren-Library-CloudStorage-GoogleDrive-qijenchen-gmail-com--------my-project/memory"
REPO_MEMORY_DIR="$PROJECT_DIR/.claude/memory"
if [ -d "$REPO_MEMORY_DIR" ]; then
  MEMORY_DIR="$REPO_MEMORY_DIR"
elif [ -d "$HARNESS_MEMORY_DIR" ]; then
  MEMORY_DIR="$HARNESS_MEMORY_DIR"
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

# Check 9: Branch sprawl(M28 — solo work = 1 chat = 1 branch / 0-1 active feature)
# 開場掃 local + remote claude/* branch,> 1 active 或 local main divergent → warn。
LOCAL_CLAUDE_BRANCHES=$(git -C "$PROJECT_DIR" branch 2>/dev/null | grep -c "claude/" || true)
REMOTE_CLAUDE_BRANCHES=$(git -C "$PROJECT_DIR" branch -r 2>/dev/null | grep -cE "origin/claude/" || true)
if [ "$LOCAL_CLAUDE_BRANCHES" -gt 1 ]; then
  PRUNE_TRIGGERS="${PRUNE_TRIGGERS}\n- Local branch sprawl ${LOCAL_CLAUDE_BRANCHES} active claude/* branches(M28: 1 session = 1 branch). git branch -d <merged> 清掉,只留當前 active feature."
fi
if [ "$REMOTE_CLAUDE_BRANCHES" -gt 1 ]; then
  PRUNE_TRIGGERS="${PRUNE_TRIGGERS}\n- Remote branch sprawl ${REMOTE_CLAUDE_BRANCHES} stale claude/* branches on origin(sandbox HTTP 403 攔 push --delete). User GitHub UI 手動刪 OR 'git push origin --delete <branch>'."
fi
# Local main divergent from origin/main(sandbox commits 殘留 / 未 merge)
if git -C "$PROJECT_DIR" rev-parse origin/main >/dev/null 2>&1; then
  AHEAD_BEHIND=$(git -C "$PROJECT_DIR" rev-list --left-right --count main...origin/main 2>/dev/null || echo "0	0")
  AHEAD=$(echo "$AHEAD_BEHIND" | cut -f1)
  BEHIND=$(echo "$AHEAD_BEHIND" | cut -f2)
  if [ -n "$AHEAD" ] && [ -n "$BEHIND" ]; then
    if [ "$AHEAD" -gt 0 ] || [ "$BEHIND" -gt 0 ]; then
      PRUNE_TRIGGERS="${PRUNE_TRIGGERS}\n- Local main divergent (ahead ${AHEAD} / behind ${BEHIND} vs origin/main). 'git fetch && git checkout main && git reset --hard origin/main' 對齊。"
    fi
  fi
fi

# Check 10: SSOT auto-sync drift(2026-05-23 — sync-governance-counters drift report)
SSOT_DRIFT=""
if command -v node >/dev/null 2>&1 && [ -f scripts/sync-governance-counters.mjs ]; then
  DRIFT_OUT=$(node scripts/sync-governance-counters.mjs --quiet 2>&1 || true)
  if echo "$DRIFT_OUT" | grep -q "Hardcoded drift detected"; then
    SSOT_DRIFT=$(echo "$DRIFT_OUT" | sed -n '/Hardcoded drift detected/,/^Log:/p' | grep '^  - ' | head -8)
    if [ -n "$SSOT_DRIFT" ]; then
      PRUNE_TRIGGERS="${PRUNE_TRIGGERS}\n- SSOT drift detected:\n${SSOT_DRIFT}\n  → 跑 node scripts/sync-governance-counters.mjs 看完整 + 對齊 SSOT 數字 / npm scope / plugin manifest。"
    fi
  fi
fi

# Check 11: Cross-repo env smoke(2026-05-30 — NON-BLOCKING:只進 PRUNE_TRIGGERS soft channel,
# 永不進 BLOCKER 路徑、永不非零退出。set -uo pipefail(無 -e)→ 探針非零返回不殺 script;
# 但 set -u 下 unset var 必 ${VAR:-} guard。每探針獨立、無 network、無 blocking subshell。
ENV_SMOKE=""
# (a) plugin-mode 完整性 — CLAUDE_PLUGIN_ROOT 在 ds-repo native mode 可能 UNSET → 先 guard 才用
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ ! -d "${CLAUDE_PLUGIN_ROOT:-}/hooks" ]; then
  ENV_SMOKE="${ENV_SMOKE}\n    - Plugin mode:\$CLAUDE_PLUGIN_ROOT 有設但 hooks/ 找不到 → plugin install 可能不完整(跑 /plugin marketplace update)。"
fi
# (b) node 在 PATH — audit scripts 依賴
if ! command -v node >/dev/null 2>&1; then
  ENV_SMOKE="${ENV_SMOKE}\n    - node 不在 PATH → audit scripts(dispatch-audit-dims / content-quality)在此環境跑不動。"
fi
# (c) codex transport(informational;缺 = fork repo 正常,Phase B 自動 fallback)
if [ ! -x node_modules/.bin/codex ] && ! command -v codex >/dev/null 2>&1; then
  ENV_SMOKE="${ENV_SMOKE}\n    - codex CLI 缺 → deep-audit Phase B dual-track 自動 fallback Phase-A-only(fork repo 屬正常;要雙軌跑 npm i -D @openai/codex)。"
fi
# (d) consumer-mode DS resolution — fork repo 引 npm DS 但未安裝
if [ -f package.json ] && grep -q '"@qijenchen/design-system"' package.json 2>/dev/null && [ ! -d node_modules/@qijenchen/design-system ]; then
  ENV_SMOKE="${ENV_SMOKE}\n    - Consumer repo 引用 @qijenchen/design-system 但 node_modules 沒裝(跑 npm install)。"
fi
if [ -n "$ENV_SMOKE" ]; then
  PRUNE_TRIGGERS="${PRUNE_TRIGGERS}\n- 🩺 env-smoke(non-blocking,環境健檢):${ENV_SMOKE}"
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
  MSG="⚙️ Auto-prune triggers fired (SessionStart):${PRUNE_TRIGGERS}\nAI 必 AUTO-RUN /knowledge-prune(禁問 user 要不要跑;P0+P1 自動執行,P2 retire 候選列拍板清單 — per deep-audit-cross-codex SKILL C.0a,2026-06-11 user 糾正 codify).${QUARTERLY_DUE}"
else
  MSG="🧭 Governance hygiene reminder (SessionStart):${QUARTERLY_DUE}\nNot blocking — address inline when convenient."
fi
# fail-open:無 jq(eg. 殘缺 PATH / minimal cloud sandbox)→ 靜默 exit 0,不吐 malformed JSON(2026-05-30 硬化)
command -v jq >/dev/null 2>&1 || exit 0
ESCAPED=$(printf '%b' "$MSG" | jq -Rs .)
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":%s}}\n' "$ESCAPED"
exit 0

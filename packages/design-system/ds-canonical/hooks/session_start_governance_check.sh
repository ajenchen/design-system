#!/bin/bash
set -uo pipefail
# SessionStart hook: check if governance hygiene actions are overdue; if so,
# inject reminder into session context so the active provider proactively addresses them.
#
# Why: M10 — silent tech debt violates. If /knowledge-prune last ran 3+ months
# ago, the shared/bootstrap instruction set is over 800 lines, or user-corrections.jsonl has pending
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
#   1. Registry-resolved bootstrap line count — soft 400 / hard 800(AGENTS.md budget SSOT)
#   2. Days since last prune    — soft 90   / hard 180
#   3. user-corrections pending — soft 20   / hard 40
#   4. Benchmarks freshness     — read-only reminder at 30 days(no hard tier)

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

# 2026-05-30:移除 -e(對齊 L2 set -uo)。本 hook = 非阻塞 governance reminder,必永遠 exit 0;
# set -e 會讓任何未 guard 的 command(eg. L38 grep no-match pipeline 在 node-missing degraded env)
# 殺掉整個 session-start hook。fail-open > fail-closed。adversarial-verify 2026-05-30 抓出此真 bug。
set -uo pipefail

PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0
INSTRUCTION_ENTRY="${GOVERNANCE_INSTRUCTION_ENTRY:-AGENTS.md}"
SHARED_INSTRUCTION_ENTRY="${GOVERNANCE_SHARED_INSTRUCTION_ENTRY:-AGENTS.md}"
MEMORY_SYNC_SCRIPT="${GOVERNANCE_MEMORY_SYNC_SCRIPT:-}"
CANONICAL_HOOK_ROOT="${GOVERNANCE_CANONICAL_HOOK_ROOT:-packages/design-system/ds-canonical/hooks}"
PEER_DISPLAY_NAME="${GOVERNANCE_PEER_DISPLAY_NAME:-independent peer}"
PEER_CLI="${GOVERNANCE_PEER_CLI:-}"
PEER_LOCAL_EXECUTABLE="${GOVERNANCE_PEER_LOCAL_EXECUTABLE:-}"

# Runtime feedback is shared across providers and is never read from a provider discovery tree.
# The main adapter has already validated these paths; direct invocations still have to prove the
# exact Git-owned runtime root and reject every existing symlink component.
RUNTIME_STATE_DIR=""
GIT_DIR="$(git -C "$PROJECT_DIR" rev-parse --absolute-git-dir 2>/dev/null || true)"
if [ -n "$GIT_DIR" ] && declare -F _governance_safe_runtime_path >/dev/null 2>&1; then
  GIT_DIR="$(cd "$GIT_DIR" 2>/dev/null && pwd -P)" || GIT_DIR=""
  EXPECTED_RUNTIME_ROOT="${GIT_DIR:+$GIT_DIR/governance-runtime}"
  if [ -n "$EXPECTED_RUNTIME_ROOT" ] && [ "${GOVERNANCE_RUNTIME_ROOT:-}" = "$EXPECTED_RUNTIME_ROOT" ] && [ -n "${GOVERNANCE_STATE_DIR:-}" ]; then
    RUNTIME_STATE_DIR="$(_governance_safe_runtime_path "$EXPECTED_RUNTIME_ROOT" "$GOVERNANCE_STATE_DIR" 2>/dev/null || true)"
  fi
fi

# 2026-05-26 folded auto_sync_memory.sh in here(retire that hook for D8a budget):
# Per AGENTS.md governance hook count budget,SessionStart-only utility helper inline
# under main governance hook 比 separate hook 更合 anti-bloat。
# Memory sync = committed repo SSOT → an explicitly declared provider cache. Providers without
# a registry binding (Codex today) must never inherit or guess another provider's private HOME.
case "$MEMORY_SYNC_SCRIPT" in
  ""|/*|*..*) MEMORY_SYNC_SCRIPT="" ;;
esac
if [ -n "$MEMORY_SYNC_SCRIPT" ] && [ "${GOVERNANCE_READ_ONLY:-0}" != "1" ] && [ -f "$MEMORY_SYNC_SCRIPT" ]; then
  SYNC_OUT=$(node "$MEMORY_SYNC_SCRIPT" 2>&1 || true)
  COPIED=$(grep -m 1 -oE 'copied: [0-9]+' <<<"$SYNC_OUT" | grep -oE '[0-9]+' | sed -n '1p' || true)
  # COPIED > 0 → 加入 REMINDERS(下面 main flow inject)
  if [ -n "$COPIED" ] && [ "$COPIED" -gt 0 ]; then
    MEMSYNC_NOTE="\n- 🔄 auto sync-memory(SessionStart): committed repo SSOT → provider cache refreshed ${COPIED} memory file(s)。"
  fi
fi

REMINDERS="${MEMSYNC_NOTE:-}"
BLOCKERS=""

# Check 1: bootstrap size(provider entry + shared entry,unique and registry-resolved).
LINES=0
BOOTSTRAP_LABELS=""
for ENTRY in "$INSTRUCTION_ENTRY" "$SHARED_INSTRUCTION_ENTRY"; do
  case "$ENTRY" in ""|/*|*..*) continue ;; esac
  case "|$BOOTSTRAP_LABELS|" in *"|$ENTRY|"*) continue ;; esac
  BOOTSTRAP_LABELS="${BOOTSTRAP_LABELS:+$BOOTSTRAP_LABELS|}$ENTRY"
  [ -f "$ENTRY" ] && LINES=$((LINES + $(wc -l < "$ENTRY" | tr -d ' ')))
done
if [ "$LINES" -gt 0 ]; then
  # 2026-04-26 tightened thresholds(對應 M19 + user 質問「auto self-improve」要更主動):
  # SSOT alignment per AGENTS.md: target ≤ 250 / transition ≤ 400 / hard cap 800
  # Stratified soft warnings: 500 approaching / 600 strong / 800 hard-cap blocker
  if [ "$LINES" -gt 800 ]; then
    BLOCKERS="${BLOCKERS}\n- Bootstrap instructions(${BOOTSTRAP_LABELS}) total ${LINES} lines(hard cap 800 breached). /knowledge-prune REQUIRED FIRST ACTION this session."
  elif [ "$LINES" -gt 600 ]; then
    REMINDERS="${REMINDERS}\n- Bootstrap instructions(${BOOTSTRAP_LABELS}) total ${LINES} lines(50% over 400 transition cap). /knowledge-prune strongly recommended this session."
  elif [ "$LINES" -gt 500 ]; then
    REMINDERS="${REMINDERS}\n- Bootstrap instructions(${BOOTSTRAP_LABELS}) total ${LINES} lines(approaching 600 strong-warn). Consider /knowledge-prune."
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
CORRECTIONS_LOG="${RUNTIME_STATE_DIR:+$RUNTIME_STATE_DIR/user-corrections.jsonl}"
if [ -f "$CORRECTIONS_LOG" ]; then
  CORRECTION_COUNT=$(wc -l < "$CORRECTIONS_LOG" | tr -d ' ')
  if [ "$CORRECTION_COUNT" -gt 40 ]; then
    BLOCKERS="${BLOCKERS}\n- ${CORRECTION_COUNT} user-corrections pending(HARD THRESHOLD 40 breached). /codify-corrections REQUIRED FIRST ACTION this session."
  elif [ "$CORRECTION_COUNT" -gt 20 ]; then
    REMINDERS="${REMINDERS}\n- ${CORRECTION_COUNT} user-correction signals pending codification (provider-neutral runtime state). Review + codify pending ones."
  fi
fi

# Check 4: benchmark freshness is advisory and read-only. Network refresh is an explicit
# operator/automation action; a SessionStart hook must never mutate the checkout in background.
BENCH_DIR="${RUNTIME_STATE_DIR:+$RUNTIME_STATE_DIR/benchmarks}"
BENCH_FETCHER="$PROJECT_DIR/governance/benchmarks/fetch.sh"
if [ -n "$BENCH_DIR" ] && [ -x "$BENCH_FETCHER" ]; then
  LAST_FETCH_FILE="$BENCH_DIR/last-fetch.txt"
  SHOULD_AUTO_FETCH=0

  if [ ! -f "$LAST_FETCH_FILE" ]; then
    SHOULD_AUTO_FETCH=1
    FETCH_REASON="never fetched"
  else
    # GNU coreutils first, BSD/macOS second — same portability order as stop_passive_logging.sh:181.
    # Without the GNU form this silently returned 0 on Linux, which made every staleness window
    # look infinitely old on containerized hosts.
    LAST_TS=$(stat -c '%Y' "$LAST_FETCH_FILE" 2>/dev/null || stat -f '%m' "$LAST_FETCH_FILE" 2>/dev/null || echo "0")
    NOW=$(date +%s)
    DAYS=$(( (NOW - LAST_TS) / 86400 ))
    if [ "$DAYS" -gt 30 ]; then
      SHOULD_AUTO_FETCH=1
      FETCH_REASON="${DAYS} days stale"
    fi
  fi

  [ "$SHOULD_AUTO_FETCH" = "1" ] && REMINDERS="${REMINDERS}\n- Benchmarks ${FETCH_REASON} → explicitly run \`bash governance/benchmarks/fetch.sh\` or the scheduled refresh workflow."
fi

# Check 6: Fix commits without /scan-similar-bugs invoke(M10 mechanical 落地)
# Detect 24h 內 fix( commit 但 skill-invokes log 沒對應 scan-similar-bugs invoke
RECENT_FIX_COMMITS=$(git log -5 --since='24 hours ago' --grep='^fix(\|^bugfix:\|^fix:' --oneline 2>/dev/null || true)
if [ -n "$RECENT_FIX_COMMITS" ]; then
  SKILL_LOG="${RUNTIME_STATE_DIR:+$RUNTIME_STATE_DIR/skill-invokes.jsonl}"
  RECENT_SCAN_INVOKE=0
  if [ -f "$SKILL_LOG" ]; then
    # Check 24h 內有 scan-similar-bugs invoke
    NOW_EPOCH=$(date -u +%s)
    DAY_AGO_EPOCH=$(( NOW_EPOCH - 86400 ))
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      if grep -q "scan-similar-bugs" <<<"$line"; then
        TS=$(echo "$line" | jq -r '.ts // empty' 2>/dev/null)
        if [ -n "$TS" ]; then
          TS_EPOCH=$(date -u -d "$TS" +%s 2>/dev/null || date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$TS" +%s 2>/dev/null || echo 0)
          if [ "$TS_EPOCH" -gt "$DAY_AGO_EPOCH" ]; then
            RECENT_SCAN_INVOKE=1
            break
          fi
        fi
      fi
    done < "$SKILL_LOG"
  fi
  if [ "$RECENT_SCAN_INVOKE" = "0" ]; then
    FIX_LIST=$(sed 's/^/  - /' <<<"$RECENT_FIX_COMMITS" | awk 'NR <= 3')
    REMINDERS="${REMINDERS}\n- 24h 內 fix commit(s) 未 follow /scan-similar-bugs(M10 mechanical 落地):\n${FIX_LIST}\n  考慮 invoke /scan-similar-bugs 確認 DS-wide 同類 bug 全清。"
  fi
fi

# Check 5: Fire-weighted test gap(G7)— hooks with fires > 100 but no test
FIRES_LOG="${RUNTIME_STATE_DIR:+$RUNTIME_STATE_DIR/hook-fires-per-hook.jsonl}"
TESTS_DIR="$PROJECT_DIR/$CANONICAL_HOOK_ROOT/tests"
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
    REMINDERS="${REMINDERS}\n- Fire-weighted test gap(hook > 100 fires 仍無 test):${HOT_GAPS}\n  推力:在 canonical hook tests 寫 \`test_<name>.sh\`,參考 test_check_story_anatomy.sh。"
  fi
fi

# Check 7: Hook count auto-trigger(soft 26 / hard 60 — Anthropic guideline ~15;真值見下方 -gt 判斷 + AGENTS.md `# 治理 canonical`)
# 2026-05-09 fix:tree-recursive count(含 lib/ helpers)。前身 -maxdepth 1 只 count root,
# 漏 16 個 lib/ helpers → metric reports 19,reality 35 = system gaming own metric。
# 2026-05-13 prune consolidation:`_*.sh` 約定 = internal helper(Unix convention)。
# Lib helpers renamed `_<name>.sh` 並 fold under `post_edit_dispatcher.sh`(1 registered hook)。
# Find rule 排除 `_*` 因 _ prefix 表「非 first-class hook,由 dispatcher orchestrate」—
# 對齊 `_log-fire.sh` 既有 exclusion 原則。Settings.json 中 _* files 不可作 hook registration。
# 排除:retired/ + tests/ + _* internal helpers.
PRUNE_TRIGGERS=""
case "$CANONICAL_HOOK_ROOT" in ""|/*|*..*) CANONICAL_HOOK_ROOT="packages/design-system/ds-canonical/hooks" ;; esac
HOOKS_DIR="$PROJECT_DIR/$CANONICAL_HOOK_ROOT"
HOOK_COUNT=0
if printf '%s' "${GOVERNANCE_REGISTERED_HOOK_COUNT:-}" | grep -qE '^[0-9]+$'; then
  HOOK_COUNT="$GOVERNANCE_REGISTERED_HOOK_COUNT"
elif [ -d "$HOOKS_DIR" ]; then
  HOOK_COUNT=$(find "$HOOKS_DIR" \( -name "*.sh" -o -name "*.py" \) \
    -not -path "*/retired/*" -not -path "*/tests/*" -not -name "_*" \
    2>/dev/null | wc -l | tr -d ' ')
  HOOK_COUNT=${HOOK_COUNT:-0}
fi
# 2026-08-05 canonical inventory:同一個 find predicate 算得現值 59(2026-08-04 退役潮
# 收回 1 支,headroom=1)。60 維持為邊界,不是新基準的自動調升理由；下一支 first-class hook 必先由
# /knowledge-prune retire / consolidate 既有 hook。降 cap 仍屬治理 substantive
# (soft 26 已在 27+ 提供 advisory),留 /knowledge-prune 評估。
if [ "$HOOK_COUNT" -gt 60 ]; then
  BLOCKERS="${BLOCKERS}\n- Hook count ${HOOK_COUNT}(hard 60 — Anthropic guideline ~15;含 root + lib/,排 retired/tests/；2026-07-31 canonical inventory 已為 60、零 headroom)。超 60 = 先跑 /knowledge-prune 評估 retire / consolidate,不直接 re-raise。"
elif [ "$HOOK_COUNT" -gt 26 ]; then
  # 2026-05-15 raised soft cap 25→26 per /knowledge-prune D2 audit:
  # 26 wired hooks reflects M30 wrapper-schema-drift 新增 dedicated hook(justified evolution
  # not bloat,per Task #19 closed analysis)。Re-raise to 27+ 需 audit re-justify。
  PRUNE_TRIGGERS="${PRUNE_TRIGGERS}\n- Hook count ${HOOK_COUNT}(soft 26 trigger,2026-05-15 升 — Anthropic guideline ~15;含 root + lib/). /knowledge-prune 評估 retire / consolidate 候選."
fi

# Check 8: Memory entries auto-trigger(soft 18 / hard 20)
# Always count the committed provider-neutral SSOT. Home state is an optional cache and cannot
# change governance outcomes.
REPO_MEMORY_DIR="$PROJECT_DIR/governance/memory"
if [ -d "$REPO_MEMORY_DIR" ]; then
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

# Check 9: Branch sprawl(M28 — solo work = 1 chat = 1 branch / 0-1 active feature).
# Count every registered provider namespace; adding a model is registry data,not a hook rewrite.
BRANCH_NAMESPACES=$(printf '%s' "${GOVERNANCE_BRANCH_NAMESPACES_JSON:-[]}" \
  | jq -r '.[]? | select(type=="string" and test("^[a-z][a-z0-9-]*/$"))' 2>/dev/null || true)
if [ -n "$BRANCH_NAMESPACES" ]; then
  BRANCH_NAMESPACE_RE=$(printf '%s' "$BRANCH_NAMESPACES" | paste -sd'|' -)
  LOCAL_PROVIDER_BRANCHES=$(git -C "$PROJECT_DIR" branch --format='%(refname:short)' 2>/dev/null \
    | grep -cE "^(${BRANCH_NAMESPACE_RE})" || true)
  REMOTE_PROVIDER_BRANCHES=$(git -C "$PROJECT_DIR" branch -r --format='%(refname:short)' 2>/dev/null \
    | grep -cE "^[^/]+/(${BRANCH_NAMESPACE_RE})" || true)
  LOCAL_PROVIDER_BRANCHES=${LOCAL_PROVIDER_BRANCHES:-0}
  REMOTE_PROVIDER_BRANCHES=${REMOTE_PROVIDER_BRANCHES:-0}
  BRANCH_LABEL=$(printf '%s' "$BRANCH_NAMESPACES" | paste -sd, -)
  if [ "$LOCAL_PROVIDER_BRANCHES" -gt 1 ]; then
    PRUNE_TRIGGERS="${PRUNE_TRIGGERS}\n- Local branch sprawl ${LOCAL_PROVIDER_BRANCHES} active provider branches(namespaces:${BRANCH_LABEL};M28:1 session = 1 branch). Delete merged branches and keep only the active feature."
  fi
  if [ "$REMOTE_PROVIDER_BRANCHES" -gt 1 ]; then
    PRUNE_TRIGGERS="${PRUNE_TRIGGERS}\n- Remote branch sprawl ${REMOTE_PROVIDER_BRANCHES} stale provider branches(namespaces:${BRANCH_LABEL}). Delete merged remote branches."
  fi
fi
# Local main divergent from origin/main(sandbox commits 殘留 / 未 merge)
if git -C "$PROJECT_DIR" rev-parse origin/main >/dev/null 2>&1; then
  AHEAD_BEHIND=$(git -C "$PROJECT_DIR" rev-list --left-right --count main...origin/main 2>/dev/null || echo "0	0")
  AHEAD=$(echo "$AHEAD_BEHIND" | cut -f1)
  BEHIND=$(echo "$AHEAD_BEHIND" | cut -f2)
  if [ -n "$AHEAD" ] && [ -n "$BEHIND" ]; then
    if [ "$AHEAD" -gt 0 ] || [ "$BEHIND" -gt 0 ]; then
      PRUNE_TRIGGERS="${PRUNE_TRIGGERS}\n- Local main divergent (ahead ${AHEAD} / behind ${BEHIND} vs origin/main). 先跑 \`git fetch\` 並檢視 ahead/behind；只有可 fast-forward 時才用 \`git switch main && git pull --ff-only\` 對齊。若 history 已分叉，保留 refs/worktree 與 before-image，依 Standing Authorization 建 recovery branch 並走 protected PR／forward recovery + external readback；禁止 reset、force rewrite 或 ruleset bypass。"
    fi
  fi
fi

# Check 10: SSOT auto-sync drift(2026-05-23 — sync-governance-counters drift report)
SSOT_DRIFT=""
if command -v node >/dev/null 2>&1 && [ -f scripts/sync-governance-counters.mjs ]; then
  DRIFT_OUT=$(node scripts/sync-governance-counters.mjs --check --quiet 2>&1 || true)
  if grep -q "Hardcoded drift detected" <<<"$DRIFT_OUT"; then
    SSOT_DRIFT=$(sed -n '/Hardcoded drift detected/,/^Log:/p' <<<"$DRIFT_OUT" | grep '^  - ' | awk 'NR <= 8')
    if [ -n "$SSOT_DRIFT" ]; then
      PRUNE_TRIGGERS="${PRUNE_TRIGGERS}\n- SSOT drift detected:\n${SSOT_DRIFT}\n  → 跑 node scripts/sync-governance-counters.mjs 看完整 + 對齊 SSOT 數字 / npm scope / plugin manifest。"
    fi
  fi
fi

# Check 11: Cross-repo env smoke(2026-05-30 — NON-BLOCKING:只進 PRUNE_TRIGGERS soft channel,
# 永不進 BLOCKER 路徑、永不非零退出。set -uo pipefail(無 -e)→ 探針非零返回不殺 script;
# 但 set -u 下 unset var 必 ${VAR:-} guard。每探針獨立、無 network、無 blocking subshell。
ENV_SMOKE=""
# (a) plugin-mode 完整性 — GOVERNANCE_PLUGIN_ROOT 在 ds-repo native mode 可能 UNSET → 先 guard 才用
if [ -n "${GOVERNANCE_PLUGIN_ROOT:-}" ] && [ ! -d "${GOVERNANCE_PLUGIN_ROOT:-}/hooks" ]; then
  ENV_SMOKE="${ENV_SMOKE}\n    - Plugin mode:\$GOVERNANCE_PLUGIN_ROOT 有設但 hooks/ 找不到 → plugin install 可能不完整(C-prime 主路徑 = committed-config + \`npm run sync-all\`〔npm-only〕;刻意用 plugin 才跑 /plugin marketplace update)。"
fi
# (b) node 在 PATH — audit scripts 依賴
if ! command -v node >/dev/null 2>&1; then
  ENV_SMOKE="${ENV_SMOKE}\n    - node 不在 PATH → audit scripts(dispatch-audit-dims / content-quality)在此環境跑不動。"
fi
# (c) independent peer transport(informational;missing = review track unavailable)
if [ -n "$PEER_CLI" ] && [ ! -x "$PEER_LOCAL_EXECUTABLE" ] && ! command -v "$PEER_CLI" >/dev/null 2>&1; then
  ENV_SMOKE="${ENV_SMOKE}\n    - ${PEER_DISPLAY_NAME} CLI 缺 → independent review track unavailable(local:${PEER_LOCAL_EXECUTABLE};command:${PEER_CLI})。"
fi
# (d) consumer-mode DS resolution — fork repo 引 npm DS 但未安裝
if [ -f package.json ] && grep -q '"@qijenchen/design-system"' package.json 2>/dev/null && [ ! -d node_modules/@qijenchen/design-system ]; then
  ENV_SMOKE="${ENV_SMOKE}\n    - Consumer repo 引用 @qijenchen/design-system 但 node_modules 沒裝(跑 npm install)。"
fi
# (e) 長駐 bypass env 偵測(2026-07-16 加):GOVERNANCE_BYPASS_* 設計為單次 audit-logged escape,
# session 進程繼承殘留(export 後沒 unset / shell profile 誤設)= 對應 approval / anchor / solo-workflow
# 閘每次 edit 都靜默放行 = 治理失效。泛掃 GOVERNANCE_BYPASS_ prefix(機械生成精神,新 bypass var 自動涵蓋;
# 已知住戶:DESIGN_APPROVAL / SOLO_WORKFLOW / DS_ANCHOR / MAIN_WORKBENCH / ESCAPE_MARKER_AUDIT 等)。
LINGERING_BYPASS=$(env 2>/dev/null | grep -E '^GOVERNANCE_BYPASS_[A-Z_]+=' | grep -vE '=0?$' | cut -d= -f1 | sort | paste -sd, -)
if [ -n "${LINGERING_BYPASS:-}" ]; then
  ENV_SMOKE="${ENV_SMOKE}\n    - ⚠ bypass env 長駐,approval 閘失效中:${LINGERING_BYPASS}(bypass 應單次使用即 unset;跑 \`unset ${LINGERING_BYPASS%%,*}\` 或檢查 shell profile / 啟動環境是否誤 export)。"
fi
if [ -n "$ENV_SMOKE" ]; then
  PRUNE_TRIGGERS="${PRUNE_TRIGGERS}\n- 🩺 env-smoke(non-blocking,環境健檢):${ENV_SMOKE}"
fi

# Inject if HARD BLOCKERS(must)or auto-prune-triggers or quarterly-prune-overdue
# Check 2 already derives prune recency from committed Git history. The former
# `.last-prune` provider-local receipt had no writer and duplicated that authority.
QUARTERLY_DUE=""

[ -z "$BLOCKERS" ] && [ -z "$QUARTERLY_DUE" ] && [ -z "$PRUNE_TRIGGERS" ] && exit 0

if [ -n "$BLOCKERS" ]; then
  MSG="🚨 BLOCKER — governance hard thresholds breached (SessionStart):${BLOCKERS}\n\n"
  MSG="${MSG}⚠️ REQUIRED_FIRST_ACTION:先 invoke 上述 skill(/knowledge-prune 或 /codify-corrections)"
  MSG="${MSG}把 governance 帶回健康區間,再處理 user 的實際請求。"
  [ -n "$PRUNE_TRIGGERS" ] && MSG="${MSG}\n\n附 soft prune triggers:${PRUNE_TRIGGERS}"
  [ -n "$QUARTERLY_DUE" ] && MSG="${MSG}\n${QUARTERLY_DUE}"
elif [ -n "$PRUNE_TRIGGERS" ]; then
  MSG="⚙️ Auto-prune triggers fired (SessionStart):${PRUNE_TRIGGERS}\nAI 必 AUTO-RUN /knowledge-prune(禁問 user 要不要跑；P0/P1/P2E 工程治理自主執行，只有產品／UI／UX SSOT 真取捨的 P2H 才列拍板清單 — per deep-audit-cross-codex SKILL C.0a).${QUARTERLY_DUE}"
else
  MSG="🧭 Governance hygiene reminder (SessionStart):${QUARTERLY_DUE}\nNot blocking — address inline when convenient."
fi
# fail-open:無 jq(eg. 殘缺 PATH / minimal cloud sandbox)→ 靜默 exit 0,不吐 malformed JSON(2026-05-30 硬化)
command -v jq >/dev/null 2>&1 || exit 0
ESCAPED=$(printf '%b' "$MSG" | jq -Rs .)
printf '{"governanceContext":{"hookEventName":"SessionStart","message":%s}}\n' "$ESCAPED"
exit 0

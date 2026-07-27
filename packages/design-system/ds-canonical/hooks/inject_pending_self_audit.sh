#!/bin/bash
set -uo pipefail
# UserPromptSubmit hook: 把上 turn Stop hook 累積的 warnings inject 到 next turn additionalContext.
#
# 修補 known issue:Stop hook silent-log 沒 inject → AI 看不到 self-audit warnings → reactive 模式持續。
# 對齊 canonical meta-patterns M14 / M20「auto-inject corrective prompt」原意。
#
# Reads:
#   $GOVERNANCE_STATE_DIR/self-audit-warnings.jsonl(stop_self_audit 寫入,behavioral check)
#   $GOVERNANCE_STATE_DIR/score-history.jsonl(stop_meta_self_audit 寫入,infra-score regression)
#   $GOVERNANCE_STATE_DIR/audit-post-report-validator.jsonl(check_audit_post_report_validator 寫入,
#                                                           prune-chain-trigger signal)
# State:
#   $GOVERNANCE_STATE_DIR/last-inject-ts.txt — 上次 inject 的 timestamp
#
# Logic:
#   1. 讀 LAST_TS,撈兩個 log 中 ts > LAST_TS 的條目
#   2. 有條目 → format 成 additionalContext,inject 給 AI
#   3. 不論有無條目,更新 LAST_TS = NOW(避免 stuck on 舊 warnings)

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0
STATE_DIR="$(governance_prepare_runtime_state_dir 2>/dev/null)" || exit 0

LAST_TS_FILE="$(governance_runtime_file_path last-inject-ts.txt "$STATE_DIR" 2>/dev/null)" || exit 0
BEHAVIORAL_LOG="$(governance_runtime_file_path self-audit-warnings.jsonl "$STATE_DIR" 2>/dev/null)" || exit 0
SCORE_LOG="$(governance_runtime_file_path score-history.jsonl "$STATE_DIR" 2>/dev/null)" || exit 0
AUDIT_VALIDATOR_LOG="$(governance_runtime_file_path audit-post-report-validator.jsonl "$STATE_DIR" 2>/dev/null)" || exit 0
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# Default LAST_TS: 30 分鐘前(防呆 — session cutoff,老 warning 自動 expire 避免 echo)
# 之前 24h 太寬,session 跨 hour 仍 inject 老 warning。30m sliding window 讓 fresh
# warning 進 inject,old warning 自動老化。Cross-platform GNU + BSD date。
DEFAULT_AGO=$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
              date -u -v-30M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
              date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
              echo "1970-01-01T00:00:00Z")
LAST_TS="$DEFAULT_AGO"
if [ -f "$LAST_TS_FILE" ]; then
  STORED=$(cat "$LAST_TS_FILE" 2>/dev/null)
  # 用 stored OR 30m-ago 較新者(避免被重置成 1970)
  [ -n "$STORED" ] && [[ "$STORED" > "$LAST_TS" ]] && LAST_TS="$STORED"
fi

# ── Acknowledge detection(防呆)──────────────────────────────────────────
# 若 last user msg(transcript)含 acknowledge keyword,stop inject 該類 warning
# 這 turn — 表示 user 已 see + 接受該 warning,持續 inject 是 spam。
ACK_DETECTED=0
TRANSCRIPT_PATH=$(echo "${1:-}" | jq -r '.transcript_path // ""' 2>/dev/null || echo "")
if [ -z "$TRANSCRIPT_PATH" ]; then
  # UserPromptSubmit hook 從 stdin JSON 讀 transcript_path
  TRANSCRIPT_PATH=$(cat 2>/dev/null | jq -r '.transcript_path // ""' 2>/dev/null || echo "")
fi
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  LAST_USER=$(tail -50 "$TRANSCRIPT_PATH" 2>/dev/null | \
    jq -r 'select(.message.role=="user") | .message.content // empty | if type=="string" then . else (.[]? | .text // empty) end' 2>/dev/null | tail -3)
  ACK_RE='(收到|知道了|了解|acknowledged|ok 撤回|不用再 inject|停止 inject|skip warning|不要再警告)'
  if grep -qiE "$ACK_RE" <<<"$LAST_USER"; then
    ACK_DETECTED=1
  fi
fi

# ── Aggregate warnings 去重 + 計數(extract_warnings_dedup helper)─────────
# Reads stdin JSONL, filters by ts > LAST_TS, extracts .warnings, dedups bullet lines, prepends count.
extract_warnings_dedup() {
  awk -v cutoff="$LAST_TS" '
    BEGIN { in_str=0; for(k in seen) delete seen[k]; for(k in count) delete count[k]; n=0 }
    {
      # crude jsonl ts extract
      if (match($0, /"ts":"[^"]+"/)) {
        ts=substr($0, RSTART+6, RLENGTH-7)
        if (ts <= cutoff) next
      }
      # extract warnings field(may contain \n escape)
      if (match($0, /"warnings":"[^"]*"/)) {
        w=substr($0, RSTART+12, RLENGTH-13)
        # split by \\n
        nlines=split(w, lines, "\\\\n")
        for (i=1; i<=nlines; i++) {
          line=lines[i]
          gsub(/^[[:space:]]+/, "", line)
          # strip leading "• " from source(避免 double bullet)
          gsub(/^•[[:space:]]*/, "", line)
          if (line == "") continue
          if (!(line in seen)) {
            seen[line] = 1
            count[line] = 1
            order[++n] = line
          } else {
            count[line]++
          }
        }
      }
    }
    END {
      for (i=1; i<=n; i++) {
        l = order[i]
        c = count[l]
        if (c > 1) printf "  • [×%d] %s\n", c, l
        else printf "  • %s\n", l
      }
    }
  '
}

WARNINGS_BEHAVIORAL=""
WARNINGS_SCORE=""
LATEST_SCORE=""
PRUNE_CHAIN_TRIGGER=0
PRUNE_CHAIN_REASONS=""

# ── Read behavioral warnings since LAST_TS ─────────────────────────────────
if [ -f "$BEHAVIORAL_LOG" ]; then
  WARNINGS_BEHAVIORAL=$(extract_warnings_dedup < "$BEHAVIORAL_LOG")
fi

# ── Read infra-score warnings since LAST_TS ─────────────────────────────────
if [ -f "$SCORE_LOG" ]; then
  WARNINGS_SCORE=$(extract_warnings_dedup < "$SCORE_LOG")
  # Latest score(取 file 最後一行 ts > cutoff 的)
  LATEST_SCORE=$(awk -v cutoff="$LAST_TS" '
    {
      if (match($0, /"ts":"[^"]+"/)) {
        ts=substr($0, RSTART+6, RLENGTH-7)
        if (ts <= cutoff) next
      }
      if (match($0, /"score":[0-9]+/)) {
        s=substr($0, RSTART+8, RLENGTH-8)
        last_s=s
      }
    }
    END { print last_s }
  ' "$SCORE_LOG")
fi

# ── Read prune-chain-trigger signal(2026-05-27 v2 ship per user directive)──
# check_audit_post_report_validator.sh emit signal to validator jsonl when audit
# completes with retire candidates(audit-prompts coverage < 100% OR @benchmark-
# unverified-blanket > 0 OR design-system-audit Phase 4.5 9-trigger conditions met).
# Without this handler the signal is half-shipped — emitted but no one listens.
if [ -f "$AUDIT_VALIDATOR_LOG" ]; then
  PRUNE_SIGNAL=$(awk -v cutoff="$LAST_TS" '
    {
      if (match($0, /"ts":"[^"]+"/)) {
        ts=substr($0, RSTART+6, RLENGTH-7)
        if (ts <= cutoff) next
      }
      if (match($0, /"trigger_prune":1/)) {
        if (match($0, /"warnings":"[^"]*"/)) {
          w=substr($0, RSTART+12, RLENGTH-13)
          gsub(/\\\\n/, " | ", w)
          print w
        } else {
          print "trigger_prune=1"
        }
      }
    }
  ' "$AUDIT_VALIDATOR_LOG" 2>/dev/null | tail -1)
  if [ -n "$PRUNE_SIGNAL" ]; then
    PRUNE_CHAIN_TRIGGER=1
    PRUNE_CHAIN_REASONS="$PRUNE_SIGNAL"
  fi
fi

# Update LAST_TS regardless(若 inject 失敗,下 turn 會重看到 — 但 jq 出錯就靜默)
echo "$NOW" > "$LAST_TS_FILE"

# Silent exit if nothing accumulated
if [ -z "$WARNINGS_BEHAVIORAL" ] && [ -z "$WARNINGS_SCORE" ] && [ "$PRUNE_CHAIN_TRIGGER" -eq 0 ]; then
  exit 0
fi

# 防呆 layer 2:user 已 acknowledge → silent skip inject 本 turn
if [ "$ACK_DETECTED" = "1" ]; then
  exit 0
fi

# ── Format additionalContext ────────────────────────────────────────────────
CTX_PARTS=""
if [ -n "$WARNINGS_BEHAVIORAL" ]; then
  CTX_PARTS="${CTX_PARTS}## Behavioral self-audit(stop_self_audit):
${WARNINGS_BEHAVIORAL}

"
fi
if [ -n "$WARNINGS_SCORE" ]; then
  SCORE_LABEL=""
  [ -n "$LATEST_SCORE" ] && SCORE_LABEL=" current=${LATEST_SCORE}/100"
  CTX_PARTS="${CTX_PARTS}## Infra-score audit(stop_meta_self_audit,${SCORE_LABEL}):
${WARNINGS_SCORE}

"
fi

# ── 偵測 directive 觸發類型,加 explicit 指示 ─────────────────────────────
DIRECTIVE=""
if grep -q "trigger-phrase 累計" <<<"${WARNINGS_BEHAVIORAL}${WARNINGS_SCORE}"; then
  DIRECTIVE="${DIRECTIVE}
🚨 **DIRECTIVE — M19 trigger phrase auto-pipeline 啟動**:
  當 user 反覆問「確保 / 一定 / 不會 / 是否能 / 永遠 / 是否符合原則」之類問題時(本 case 已累計多次),你**必須立刻 invoke \`/ensure-canonical\` skill** 跑 5-layer pipeline,不可只給 verbal 答覆 / 不可只 quote score / 不可只「下次承諾」。
  不確定主題 → 就用最近 user 提到的關鍵字當 ensure-canonical args。"
fi
if grep -q "Topic.*repeated" <<<"${WARNINGS_BEHAVIORAL}${WARNINGS_SCORE}"; then
  DIRECTIVE="${DIRECTIVE}
🚨 **DIRECTIVE — M10 proactive exhaustive scan**:
  Topic 重複表示 prior turns 落地不徹底。**必須 grep DS-wide 同 pattern 批量修**(不只 user 點到的那個 case),否則持續 reactive。"
fi
if grep -q "Claim-verify gap" <<<"${WARNINGS_BEHAVIORAL}${WARNINGS_SCORE}"; then
  DIRECTIVE="${DIRECTIVE}
🚨 **DIRECTIVE — Claim-verify gap**:
  你說 done / verified / 通過 但本 turn 沒跑 \`tsc -b\` / hook test / score script。**現在立刻跑驗證**或在回答中明撤回 claim。"
fi
if [ "$PRUNE_CHAIN_TRIGGER" -eq 1 ]; then
  DIRECTIVE="${DIRECTIVE}
🚨 **DIRECTIVE — Prune-chain-trigger fire(2026-05-17 user directive)**:
  上一 audit cycle(via /design-system-audit --deep Phase 4.5 OR /deep-audit-cross-codex Phase A.1 → Phase 4.5 transitive chain)post-report validator E 偵測到 retire 候選 signal。**立刻 invoke \`/knowledge-prune\` scope=full** via \`Skill\` tool(SSOT-direct,不重寫 prune logic)。
  Reasons: ${PRUNE_CHAIN_REASONS}"
  # Add to CTX_PARTS so it shows in self-audit section
  CTX_PARTS="${CTX_PARTS}## Prune-chain-trigger signal(audit-post-report-validator E):
  • ${PRUNE_CHAIN_REASONS}

"
fi

ADDITIONAL_CONTEXT=$(printf '⚠️ 來自上 turn(s) 的 governance self-audit warnings — M14/M20 auto-inject:

%s%s

→ 這些是 stop hook 偵測到、應該主動處理的事項。在你回答 user prompt 前先處理(grep / fix / invoke skill / 跑驗證),不要等 user 提醒。' "$CTX_PARTS" "$DIRECTIVE")

# Safety cap:max 3KB(避免 inject context 過大)
MAX_LEN=3000
CTX_LEN=${#ADDITIONAL_CONTEXT}
if [ "$CTX_LEN" -gt "$MAX_LEN" ]; then
  ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT:0:$MAX_LEN}

[truncated — 原 ${CTX_LEN}B,顯示前 ${MAX_LEN}B。如要看全文請查看 provider-neutral governance runtime state 中的 self-audit-warnings.jsonl + score-history.jsonl]"
fi

# Output provider-neutral JSON; the boundary adapter selects the native transport.
jq -n --arg ctx "$ADDITIONAL_CONTEXT" '{
  governanceContext: {
    hookEventName: "UserPromptSubmit",
    message: $ctx
  }
}'

exit 0

#!/usr/bin/env bash
# run-codex-judgment-autoresume.sh — 等 Phase B 完成後,自動穿越額度 reset 跑完 codex 27 判準 dim。
# (2026-07-12 user「codex 獨立全跑 27 dim 最嚴格」)
set -u
cd "$(dirname "$0")/.."
OUT=".claude/logs/codex-dim-audit"
mkdir -p "$OUT"
LOG="$OUT/_autoresume.log"
SLEEP_SECS=${SLEEP_SECS:-2700}
MAX_CYCLES=${MAX_CYCLES:-40}
say() { echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG"; }

# 1. 等 Phase B 徹底跑完(phaseB autoresume wrapper 消失 = Phase B 全收齊或終止)— 避免 2 codex driver 併行
say "judgment autoresume START — 先等 Phase B 完成(避免併行 codex)"
while ps aux | grep -E 'run-codex-phaseB(-autoresume)?' | grep -v grep >/dev/null 2>&1; do
  sleep 120
done
say "Phase B 已結束 → 開始 judgment dim grind"

# 2. quota-resume 迴圈跑 judgment driver
for ((i=1; i<=MAX_CYCLES; i++)); do
  say "── judgment cycle $i"
  rm -f "$OUT/_QUOTA_HALT.json"
  node scripts/run-codex-judgment-dims.mjs
  code=$?
  if [ "$code" -eq 0 ]; then
    # driver 跑完一輪;但 timeout-SKIP 的 dim 可能還缺 → 查 ledger,滿了才 DONE,沒滿刪 SKIP 再跑一輪(60-min timeout 給重的更多時間)
    if node scripts/verify-deep-audit-coverage.mjs 2>/dev/null | grep -q "codex(27): 27/27"; then
      say "✅ codex 27/27 判準 dim DONE after $i cycle(s)."
      exit 0
    fi
    gaps=$(node scripts/verify-deep-audit-coverage.mjs 2>/dev/null | grep -oE "codex\(27\): [0-9]+/27")
    say "⟳ driver 跑完但 codex 判準未滿(${gaps})→ 刪 SKIP 再跑一輪補 timeout dim"
    rm -f "$OUT"/dim-*.SKIP.json
  elif [ "$code" -eq 3 ]; then
    done_n=$(ls "$OUT"/dim-*.json 2>/dev/null | grep -v SKIP | wc -l | tr -d ' ')
    say "🛑 quota halt (cycle $i). judgment dims done: ${done_n}/27. sleep ${SLEEP_SECS}s for reset…"
    sleep "$SLEEP_SECS"
  else
    say "❌ driver exit $code (non-quota) — STOP for investigation."
    exit "$code"
  fi
done
say "⚠️ hit MAX_CYCLES=$MAX_CYCLES — stopping (safety)."
exit 4

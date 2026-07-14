#!/usr/bin/env bash
# run-codex-phaseB-autoresume.sh — 自動穿越 codex 額度 reset 把 Phase B 跑完(2026-07-11 user「全跑最強」)。
#
# 為何:codex 最強推理每 ~3-4 元件撞 usage-limit;driver 偵測到 QUOTA 會 exit 3 + 寫 _QUOTA_HALT.json。
#   本 wrapper 迴圈:跑 driver → 若 quota-halt 睡 reset 窗口 → 續跑(driver resumable 自動 skip 已收元件)。
#   直到全收齊(driver exit 0)或撞真錯或到安全上限。全程背景、不需 user babysit。
#
# 用法:nohup bash scripts/run-codex-phaseB-autoresume.sh &  (或 run_in_background)
set -u
cd "$(dirname "$0")/.."
OUT=".claude/logs/codex-phaseB"
LOG="$OUT/_autoresume.log"
SLEEP_SECS=${SLEEP_SECS:-2700}   # 45 min 預設 reset 窗口(自我修正:仍 blocked 會再睡一輪)
MAX_CYCLES=${MAX_CYCLES:-40}     # 安全上限(防無限迴圈)
say() { echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG"; }

say "autoresume START — sleep=${SLEEP_SECS}s max_cycles=${MAX_CYCLES}"
for ((i=1; i<=MAX_CYCLES; i++)); do
  say "── cycle $i: run driver"
  rm -f "$OUT/_QUOTA_HALT.json"
  node scripts/run-codex-phaseB.mjs
  code=$?
  if [ "$code" -eq 0 ]; then
    say "✅ driver exit 0 — ALL components collected. autoresume DONE after $i cycle(s)."
    exit 0
  elif [ "$code" -eq 3 ]; then
    done_n=$(ls "$OUT"/*.json 2>/dev/null | grep -vE '_state|_driver|_QUOTA' | wc -l | tr -d ' ')
    say "🛑 quota halt (cycle $i). collected so far: ${done_n}. sleeping ${SLEEP_SECS}s for reset…"
    sleep "$SLEEP_SECS"
  else
    say "❌ driver exit $code (non-quota error) — STOP autoresume for investigation."
    exit "$code"
  fi
done
say "⚠️ hit MAX_CYCLES=$MAX_CYCLES — stopping (safety). Re-launch to continue if needed."
exit 4

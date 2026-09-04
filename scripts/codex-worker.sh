#!/usr/bin/env bash
# codex-worker — 讓沙箱內的 AI 不必請 user 剪貼,就能把 brief 交給 second opinion 執行。
#
# ── 為什麼需要它 ──
# Claude Code 的沙箱把 unix socket 全關(`allowUnixSockets: []`),而 codex CLI 需要開
# in-process app-server,所以**沙箱內起不來**(實測:`failed to initialize in-process
# app-server client: Operation not permitted`)。這是平台安全邊界,不是我們自家的鎖,
# 不該去解它;而讀 auth token 直接打 HTTPS 會被權限分類器擋(讀憑證 + 對外送出),
# 那道也不該繞。
#
# 解法是**佇列 + 常駐 worker**:user 在自己的終端機跑一次本腳本,之後 AI 只要把 brief
# 寫進 `$QUEUE/inbox/`,worker 就會執行並把結果寫回 `$QUEUE/outbox/`,AI 自己讀。
# 兩邊都只碰 `/tmp/claude`(沙箱本來就可讀寫),不放寬任何安全邊界、不需要 API key、
# 用的是 user 既有訂閱。這正是 `governance/memory/feedback_codex_full_access_standing_auth.md`
# B.2 早就寫下、但一直沒有被實作出來的那個解。
#
# ── 用法 ──
#   npm run codex:worker           # 常駐(在 repo root 的終端機跑,不要用對話裡的 `!`)
#   npm run codex:worker -- --once # 只處理目前佇列中的項目後離開(測試用)
#
# ── 契約 ──
#   inbox/<id>.md    AI 寫入的 brief(純文字/markdown)
#   outbox/<id>.json worker 寫回的結果 { id, outcome, exitStatus, startedAt, endedAt, reply }
#   outbox/<id>.done 完成旗標(AI 只在看到它之後才讀 json,避免讀到半寫入的檔)
#   worker.alive     心跳(每輪更新;AI 用它判斷 worker 是否還活著)
#   logs/<id>.log    codex 原始輸出(保留供追查)
#
# ── 不變條件 ──
# 1. **禁降檔**:不帶 `-m`、不帶 `-c model_reasoning_effort`。模型與算力的唯一來源是
#    `~/.codex/config.toml`(memory B.3;user 2026-07-10「應強制使用 codex 最新最強的模型與算力」)。
# 2. **brief 是唯讀產出**:以 `--sandbox read-only` 執行,機械保證 codex 不會寫/刪/改 source
#    (memory A 的邊界:「brief 限 read-only 產出,禁 codex 寫/刪/改 source」)。
#    這是**收緊**而非放寬 —— config.toml 全域是 danger-full-access,這裡逐次覆寫成唯讀。
# 3. **守衛入口**:每次執行後一律經 `scripts/codex-run-guarded.mjs --classify` 判定 outcome;
#    非 SUCCESS(QUOTA / AUTH / EMPTY / ERROR)一律如實寫進結果,**禁把空輸出當 0 findings**
#    (memory B.4;user 2026-07-10「codex 額度不足你會知道嗎?應通知你」)。
set -uo pipefail

QUEUE="${CODEX_QUEUE_DIR:-/tmp/claude/codex-queue}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ONCE=0
[ "${1:-}" = "--once" ] && ONCE=1

mkdir -p "$QUEUE/inbox" "$QUEUE/outbox" "$QUEUE/logs"

# ── codex 探索:4-test 固定順序(memory B.1;`which` 失敗 ≠ unreachable)──
find_codex() {
  if [ -x "$ROOT/node_modules/.bin/codex" ]; then echo "$ROOT/node_modules/.bin/codex"; return 0; fi
  if command -v codex >/dev/null 2>&1; then command -v codex; return 0; fi
  if [ -f "$HOME/.codex/auth.json" ] && command -v npx >/dev/null 2>&1; then echo "npx --yes @openai/codex"; return 0; fi
  return 1
}

CODEX="$(find_codex)" || {
  echo "✗ 找不到 codex 執行檔,也無法經 npx 取得。" >&2
  echo "  4-test 順序:node_modules/.bin/codex → which codex → ~/.codex/auth.json + npx" >&2
  exit 1
}

echo "codex-worker 啟動"
echo "  codex   : $CODEX"
echo "  queue   : $QUEUE"
echo "  repo    : $ROOT"
echo "  模型算力: 由 ~/.codex/config.toml 決定(本腳本刻意不帶 -m / effort)"
echo "  沙箱    : read-only(brief 是唯讀產出,codex 不得改 source)"
echo "按 Ctrl+C 結束。"

json_escape() { python3 -c 'import json,sys; sys.stdout.write(json.dumps(sys.stdin.read()))'; }

process_one() {
  local brief="$1"
  local id started ended status outcome log claimed
  id="$(basename "$brief" .md)"
  claimed="$QUEUE/logs/$id.md"
  log="$QUEUE/logs/$id.log"

  # 先搬走再執行 = 認領:同一個 brief 不會被重複跑,中途崩潰也看得出來卡在哪。
  mv "$brief" "$claimed" 2>/dev/null || return 0

  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "▶ [$id] 執行中…"

  # 提示詞走 stdin:brief 可能很長,不受 argv 長度限制。
  ( cd "$ROOT" && $CODEX exec --sandbox read-only --skip-git-repo-check - < "$claimed" ) > "$log" 2>&1
  status=$?
  ended="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  outcome="$(node "$ROOT/scripts/codex-run-guarded.mjs" --classify --status "$status" --log-file "$log" --last-text "$(tail -c 4000 "$log")" 2>/dev/null | sed -n 's/^CODEX-OUTCOME: //p')"
  [ -n "$outcome" ] || outcome="ERROR"

  {
    printf '{\n'
    printf '  "id": %s,\n' "$(printf '%s' "$id" | json_escape)"
    printf '  "outcome": %s,\n' "$(printf '%s' "$outcome" | json_escape)"
    printf '  "exitStatus": %s,\n' "$status"
    printf '  "startedAt": %s,\n' "$(printf '%s' "$started" | json_escape)"
    printf '  "endedAt": %s,\n' "$(printf '%s' "$ended" | json_escape)"
    printf '  "reply": %s\n' "$(json_escape < "$log")"
    printf '}\n'
  } > "$QUEUE/outbox/$id.json"

  : > "$QUEUE/outbox/$id.done"
  echo "✔ [$id] $outcome(exit=$status)→ $QUEUE/outbox/$id.json"
}

while true; do
  date -u +%Y-%m-%dT%H:%M:%SZ > "$QUEUE/worker.alive"
  shopt -s nullglob
  for brief in "$QUEUE"/inbox/*.md; do
    process_one "$brief"
  done
  shopt -u nullglob
  [ "$ONCE" = "1" ] && break
  sleep 2
done

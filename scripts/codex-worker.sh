#!/usr/bin/env bash
# codex-worker — 讓沙箱內的 AI 不必請 user 剪貼,就能把 brief 交給 second opinion 執行。
#
# ── 狀態:備援(2026-09-05 起不是主路徑)──
# **主路徑是 `node scripts/codex-exec.mjs --brief <path> --out <path>`,沙箱內直接跑,不需要
# 任何人開終端機。** 本檔留作它失效時的備援。
#
# 本檔原本的理由「沙箱把 unix socket 全關,codex 起不來,那是平台安全邊界」**歸因錯了**。
# 2026-09-05 逐項實測,兩道其實都是自家的鎖:
#   (a) `~/.codex/config.toml` 裡有三個 MCP server(pencil 的 .app、`npx @playwright/mcp`、
#       node_repl),codex 啟動時去 spawn 它們被沙箱擋 → app-server 初始化失敗。
#       用一份只刪掉 `[mcp_servers.*]` 的臨時 CODEX_HOME 就正常啟動。
#   (b) 沙箱的過濾代理做 TLS 攔截,codex(rustls)不認它的 CA → `invalid peer certificate:
#       UnknownIssuer`。curl 用 `/etc/ssl/cert.pem` 就通,把同一份指給 rustls(`SSL_CERT_FILE`)即可。
# 兩道都沒有放寬任何安全邊界(同一個代理、同一份系統信任庫、同一份 user 訂閱)。
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

  # ── AUTH 自癒:worker 跑在 user 自己的終端機,寫得動 `~/.codex`,登入就該由這裡完成 ──
  # Claude 的沙箱 write allow-list 不含 `~/.codex`(實測 `operation not permitted`),所以
  # AI 那端**無法**完成登入 —— 它能把 OAuth 流程起起來,卻存不回 auth.json。
  # 與其把使用者踢去另一個終端機打指令,不如由這裡直接把瀏覽器叫起來讓他按同意:
  # OAuth 同意本來就只能是真人給的(AGENTS.md 的 human-only 邊界),但「打哪一行指令」不必是。
  # 每個 brief 只自動重登一次(`.authretry` 旗標),避免帳號真的失效時無限迴圈。
  if [ "$outcome" = "AUTH" ] && [ ! -e "$QUEUE/logs/$id.authretry" ]; then
    : > "$QUEUE/logs/$id.authretry"
    echo ""
    echo "⚠ [$id] codex 認證已過期。現在開啟登入流程 —— 請在跳出的瀏覽器分頁按下同意。"
    echo "  (登入完成後本 brief 會自動重跑,你不需要再做任何事。)"
    echo ""
    ( cd "$ROOT" && $CODEX login )
    if [ $? -eq 0 ]; then
      echo "✔ 登入完成,重新排入 [$id]"
      mv "$claimed" "$QUEUE/inbox/$id.md"
      rm -f "$QUEUE/outbox/$id.json" "$QUEUE/outbox/$id.done"
      return 0
    fi
    echo "✗ 登入未完成;[$id] 的結果維持 AUTH,不重跑。"
  fi

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

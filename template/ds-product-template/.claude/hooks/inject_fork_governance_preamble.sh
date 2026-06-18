#!/bin/bash
# inject_fork_governance_preamble.sh — C-prime SessionStart 治理 init(install-if-missing + 事前指引注入)
#
# 2026-06-17 合併原 check_governance_bootstrap 的 install(adversarial run-4 MAJOR — cloud-flow race):
#   原本 SessionStart 有 3 個 hook(bootstrap 裝 / inject 注入 / dispatcher),Claude Code 同組 hook「並行」跑。
#   雲端 fresh-clone 時 bootstrap 還在前景 `npm install`(冷裝 30s–4min),inject 並行跑完一次 `[ -f preamble ]`
#   檢查 → 檔案還沒到 → 靜默 exit 0 → 什麼都沒注入 = proactive 指引在雲端首次 session 失效(且每 session 重演)。
#   修:把 install 與 inject 放「同一 hook process 內 sequential」→ 消除並行 race + 避免兩個並發 npm install 衝突。
#   dispatcher 不再掛 SessionStart(manifest 無 SessionStart body = 本來就 no-op);它留在 Pre/Post/UserPromptSubmit。
#
# fail-open:install 失敗 / preamble 缺 → notice + exit 0,永不 brick。
# 對齊既有用 additionalContext 的 hook 輸出契約。

set -uo pipefail
PD="${CLAUDE_PROJECT_DIR:-.}"
FORK="$PD/node_modules/@qijenchen/design-system/ds-canonical/fork"
PREAMBLE="$FORK/preamble.md"

# (1) 治理本體缺(雲端 fresh-clone / 還沒裝)+ 有 package.json → 前景裝 @beta。
# 這裡 block 到裝完才往下讀 → sequential,後面的讀取保證在 install 之後(消除 race)。
# codex risk 2:plain `npm install` 會被 lockfile 重現舊樹 → 明確 @beta 拿最新治理。
if [ ! -f "$PREAMBLE" ] && [ -f "$PD/package.json" ]; then
  echo "💡 DS 治理本體缺(可能雲端 fresh-clone session)→ 自動裝最新治理(@beta)…" >&2
  ( cd "$PD" && npm install @qijenchen/design-system@beta @qijenchen/storybook-config@beta --legacy-peer-deps --no-audit --no-fund >/dev/null 2>&1 ) || true
fi

# (1b) 自我修復 skills/commands/agents:本體在但 .claude/skills 尚未送達(C-prime 之前的舊 fork / 尚未 sync-all)→ 從 npm 補。
# ⚠️ Claude Code 在 SessionStart hook 跑「之前」就掃過 .claude/skills → 補的 skill「下個 session」才可叫用(self-heal,非當場;
#    全新 use-template/fork 因 committed scaffold 不走此路、session-1 即有)。fail-open:任何錯都不阻擋。
if [ -f "$PREAMBLE" ] && [ ! -e "$PD/.claude/skills/prototype" ] && [ -f "$PD/scripts/refresh-fork-launchers.mjs" ]; then
  echo "💡 偵測 .claude/skills 尚未送達 → 從 npm 自我修復(下個 session 可叫用 /prototype 等 skill)…" >&2
  ( cd "$PD" && node scripts/refresh-fork-launchers.mjs >/dev/null 2>&1 ) || true
fi

# (2) 本體在(本機持久 / 剛裝完)→ 讀 + 經 additionalContext 注入設計紀律
if [ -f "$PREAMBLE" ]; then
  CONTENT=$(cat "$PREAMBLE" 2>/dev/null)
  if [ -n "$CONTENT" ]; then
    jq -n --arg ctx "$CONTENT" '{
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: ("# DS 設計治理(npm-current,事前主動遵循)\n\n" + $ctx)
      }
    }'
    exit 0
  fi
fi

# (3) 仍缺(install 失敗 / 無 package.json)→ notice,不阻擋(fail-open)
cat >&2 << 'EOF'
💡 DS 治理尚未就位(npm install 未完成或失敗)。請手動執行 → npm install(或 npm run sync-all)。
   注:現在「不阻擋」你工作,只是提醒;治理本體就位後設計治理 hook 才會機械把關。
EOF
exit 0

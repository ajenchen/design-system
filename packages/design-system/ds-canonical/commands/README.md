# .claude/commands/ Legacy charter

Claude Code 已將 custom commands 併入 skills，新增 workflow 一律寫入 canonical owner `packages/design-system/ds-canonical/skills/<name>/SKILL.md`；provider discovery view 由 build graph 生成，以便 Claude、Codex 與其他 Agent Skills runtime 共用同一 SSOT。

此目錄只保留舊 consumer 的相容 pointer；新的 `/<name>` 由同名 skill 提供。

**本檔不投影**:它是這個住處的 charter,不是指令。Claude Code 會把 `.claude/commands/` 底下每個 `.md` 都當成一個 slash command(本檔被投影時,session 的指令清單真的多出一個 `/README`),所以 `packages/governance/canonical/providers.json` 的 `repositoryManagedTreeExcludes.commands` 把本檔排除在投影外。居民 0 時 `.claude/commands/` 不存在,plugin 也不帶 `commands/` alias(plugin 只給 DS 作者端點;外部 consumer 的 legacy pointer 走 fork 的 `compatibilityProjections.legacyClaudeInstruction.discoveryCategories` 白名單)。

## 當前居民(0)

原 `/gov-status` 已改為 `packages/design-system/ds-canonical/skills/governance-status/SKILL.md`，並移除主機絕對路徑與 Claude-only 假設。

## 這裡**不收**(反例)

| 疑似要放這但其實不是 | 正確去處 | 為什麼 |
|---------------------|---------|--------|
| 任何可重複 workflow(單步或多階段) | `packages/design-system/ds-canonical/skills/` | Agent Skills 是跨 provider 共用面 |
| 機械 tool-event 檢查 | `packages/design-system/ds-canonical/hooks/` | hook 是 pre/post tool 觸發,不是 user 觸發(Claude 經 `.claude/settings.json` → `scripts/run-provider-hook.mjs` 執行這份 canonical;`.claude/hooks/` 鏡像 2026-08-04 已退役)|
| 需要 isolated context / scoped tools | `.claude/agents/` | agent 是 AI worker,command 是 quick action |

## 相容保留原則

只有現存外部 consumer 仍固定呼叫 `.claude/commands/<name>.md` 時才可暫留 legacy command，並必須只是同名 skill 的 thin pointer，不得擁有另一份 substantive workflow。

# .claude/commands/ Legacy charter

Claude Code 已將 custom commands 併入 skills，新增 workflow 一律放 `.claude/skills/<name>/SKILL.md`，以便 Claude、Codex 與其他 Agent Skills runtime 共用同一 SSOT。

此目錄只保留舊 consumer 的相容 pointer；新的 `/<name>` 由同名 skill 提供。

## 當前居民(0)

原 `/gov-status` 已改為 `.claude/skills/governance-status/SKILL.md`，並移除主機絕對路徑與 Claude-only 假設。

## 這裡**不收**(反例)

| 疑似要放這但其實不是 | 正確去處 | 為什麼 |
|---------------------|---------|--------|
| 任何可重複 workflow(單步或多階段) | `.claude/skills/` | Agent Skills 是跨 provider 共用面 |
| 機械 tool-event 檢查 | `.claude/hooks/` | hook 是 pre/post tool 觸發,不是 user 觸發 |
| 需要 isolated context / scoped tools | `.claude/agents/` | agent 是 AI worker,command 是 quick action |

## 相容保留原則

只有現存外部 consumer 仍固定呼叫 `.claude/commands/<name>.md` 時才可暫留 legacy command，並必須只是同名 skill 的 thin pointer，不得擁有另一份 substantive workflow。

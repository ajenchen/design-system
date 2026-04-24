# .claude/commands/ Charter

## 這裡只收:**one-shot slash commands**(無 phase,單次 action)

每個 command 一檔 `.md`,用戶打 `/<name>` 直接觸發。**vs Skill**:skill 是多 phase workflow + user CP;command 是單次動作無 CP。

## 當前居民(1 pilot,2026-04-24)

| Command | 觸發 | 用途 |
|---------|------|------|
| `/gov-status` | user 輸入 `/gov-status` | 一次印 governance health snapshot(行數/retire rate/logs freshness/drift/pending)—不走 skill workflow,不要 CP,純 dump |

## 這裡**不收**(反例)

| 疑似要放這但其實不是 | 正確去處 | 為什麼 |
|---------------------|---------|--------|
| 多 phase + user 決策 | `.claude/skills/` | skill 管 phase + CP |
| 機械 tool-event 檢查 | `.claude/hooks/` | hook 是 pre/post tool 觸發,不是 user 觸發 |
| 需要 isolated context / scoped tools | `.claude/agents/` | agent 是 AI worker,command 是 quick action |

## 新 command criteria

1. **< 10 秒完成**(不是 workflow)
2. **無 user CP**(有決策點 = skill)
3. **輸出簡潔**(一段 markdown / 表)
4. **可重複 run**(每次同 behaviour)

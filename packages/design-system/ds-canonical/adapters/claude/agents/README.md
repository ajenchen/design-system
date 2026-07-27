# .claude/agents/ Charter

## 這裡只收:**特化 subagent**(scoped tools + isolated context)

每個 agent 一檔 `.md`,格式:
```markdown
---
name: agent-name-kebab-case
description: 何時 invoke(main AI 透過 Task tool `subagent_type: 'agent-name-kebab-case'` 調用)
tools: [Read, Grep, Bash, Glob]  # scoped — 該 agent 需要的最小集
---

System prompt body — agent 收到 prompt + 本檔內容 作為 context。
```

**vs Skill**:skill 是 main AI 驅動的 workflow；只有真正產品／UI／UX SSOT 取捨才含
user-decision checkpoint。agent 是 main AI 呼叫的特化 worker(isolated context,返回 summary)。

**vs 一般 general-purpose Agent**:registered agent 有 scoped tools(不能亂改檔)+ 特化 system prompt(專業知識內建)+ 更易 audit。

## 當前居民(1,2026-07-20 verified against Claude Code 2.1.215)

| Agent | 用途 | Workflow SSOT |
|---|---|---|
| `canonical-reviewer` | 在隔離 context 做唯讀治理審查 | `packages/design-system/ds-canonical/skills/canonical-reviewer/SKILL.md` |

Claude Code 專案級 subagent 現在會讀取 `.claude/agents/*.md`。共用 workflow 由 provider registry 生成的 skill `context: fork` + `agent` frontmatter 注入；這條路徑也避開 2.1.215 將 agent 當主 session 以 `--agent` 啟動時未套用 `skills` preload 的實測差異。Agent 檔只放 provider-specific 的隔離、工具權限與輸出契約；判準不在這裡複製。此目錄是 deterministic output；新增或修改 agent 應改 `packages/design-system/ds-canonical/adapters/claude/agents/` 後重生 provider view，並重開 Claude Code session 才會重載。

## 這裡**不收**(反例)

| 疑似要放這但其實不是 | 正確去處 | 為什麼 |
|---------------------|---------|--------|
| 可能含產品／UI／UX SSOT 決策的 workflow | `.claude/skills/` | agent 返回一次 summary；真正 P2H checkpoint 需在 main AI 端處理 |
| 一次性 script | `.claude/commands/` | agent 是 AI worker,不是 script |
| 每 session signal rule | `CLAUDE.md` | agent 只在 invoke 時載入 |
| 機械 tool-level 檢查 | `.claude/hooks/` | hook 是 pre/post tool event,不是 AI agent |

## 新 agent 的 criteria

1. **Scope isolated**(main AI 不需知道 agent 內部思考,只讀 agent return summary)
2. **Scoped tools** 明確寫在 frontmatter(不是「全權」,是 minimal set)
3. **被 ≥ 1 skill 調用**(orphan agent 不建)
4. **Main AI 可 deterministic 消費 return**(agent 輸出結構清楚)

## Skill vs Agent 選擇指南

```
問題可能需要產品／UI／UX SSOT 真取捨?
  → YES: skill(main AI 驅動,phase + exact P2H CP)
  → NO:
      問題是 scan / analysis / lookup?
        → YES: agent(scoped tools,isolated,可 parallel / background)
        → NO: 用 skill 或 command
```

## 當 runtime 不支援 project subagent

直接載入同名 skill 在主 context 執行唯讀流程，並在結果標示「未隔離執行」。不得因 provider 沒有 subagent 功能而改寫或簡化判準。

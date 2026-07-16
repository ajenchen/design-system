---
name: project-provider-neutral-governance
description: "PNG 工程(2026-07-16 user 拍板):AGENTS.md 治理核心 + CLAUDE.md @import 薄殼已上線(P1 done,codex 原生 discovery 實測 PASS);P2-P4 進行中;SSOT = planning doc"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3fb5856b-7b97-40a4-afa1-5db311326bea
---

**目標**:Claude/Codex/未來 provider 同 SSOT、同 rule coverage、同證據要求、同 blocking outcome;增刪改治理只改一處自動同步。**完整軌道 SSOT → `.claude/planning/2026-07-16-provider-neutral-governance.md`**(逐項打勾 + commit 記錄;任何 session 從該檔接續)。

- **P1 done(commit d88ceac2)**:AGENTS.md = 治理核心(provider-neutral,≤32KiB);CLAUDE.md = `@AGENTS.md` + Claude 機制層(Anthropic 官方模式)。**增刪改治理只改 AGENTS.md**。gate = `scripts/check-agents-bootstrap.mjs`(preflight wired):≤32KiB / @import 完整 / Rule Index 零死鏈 / 無雙 SSOT / npm mirror 同步。
- **codex 原生 discovery 實測 PASS**:canary probe 不讀檔答出「release:preflight與CI」。
- **最終 authority = release:preflight + CI**(provider-neutral,任何 agent 產出同一套擋);hooks 定位 = Claude write-time 加速器非信任邊界。
- **Certified Surface Registry** → `.claude/references/certified-surfaces.md`(三態,只有實測證據能升級;Codex cloud/IDE = Uncertified)。
- 8 個 CLAUDE.md 內容 consumer 已改讀 AGENTS.md(counters/score-infra bootstrap 合計 ≤250/mirror/dangling-ref/session-start Check1/codex 雙 brief 生成器/npm files)。
- P2-P4 剩:codex hooks/skills 研究實測、.codex adapter、consumer 投影(cli-init/fork corpus)、rule-ID 化、waiver schema、branch-protection probe、tamper fixtures。

相關:[[reference-cloud-governance-loading]](Claude cloud 實證)、[[feedback-codex-exec-transport-canonical]](codex transport)。

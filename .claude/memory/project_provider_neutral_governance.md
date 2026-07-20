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
- **P4 測試矩陣殘項 2026-07-19 補齊(beta.93)**:§8 per-rule mutation = 28 gate meta-test(inject 真違規→exit≠0→restore),debt 31→5(剩 5 render/env-性,baseline debtReasons 記);新 `run-gate-meta-tests.mjs`(PID-lock 抗併發)實跑全部進 preflight;§9-11 rollback + §36 atomicity = test-sync-ds-canonical-recovery / test-sync-atomicity;§14-17 ignore-scripts + §31 offline = 新 `check-clean-install-safety` gate(published 無 install-lifecycle script);pnpm=Unsupported。矩陣 ✅27/◑3/❌1。
- **剩餘唯環境/決策擋(非 do-able)**:§20-23 Codex cloud discovery + §30 Windows = 無該環境(單人 macOS)→ Uncertified/Unsupported 誠實標;§26/§27 branch-protection = **決策不啟**(啟用擋 solo 直推 main 發版,與 canonical 衝突),preflight+CI 紀律等效。

相關:[[reference-cloud-governance-loading]](Claude cloud 實證)、[[feedback-codex-exec-transport-canonical]](codex transport)。

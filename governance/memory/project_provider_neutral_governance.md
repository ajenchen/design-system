---
name: project-provider-neutral-governance
description: "PNG 工程 SHIPPED(2026-07-29):PR12-20 全 merge、beta.95/96 OIDC+provenance 發版、GitHub Release、WM 消費驗證;發版鏈 13 棒燒閘史 + 硬化(冪等/readback 重試/tamper 隔離);殘留 = owner 動作 3 項"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3fb5856b-7b97-40a4-afa1-5db311326bea
  modified: 2026-07-29T12:49:57.081Z
---

**目標達成**:Claude/Codex 同 SSOT(AGENTS.md 核心 + CLAUDE.md @import)、最終 authority = provider-neutral verifier + 受保護 CI;**2026-07-29 全鏈出貨**。

- **P1-P4 done**(細節見 git 史 + `governance/planning/2026-07-16-provider-neutral-governance.md`);codex 原生 discovery 實測 PASS;Certified Surface Registry 三態制。
- **收官戰役(2026-07-28~29,PR 12-20)**:codex 交接 → 有界去過度工程化 → PR 12 七輪收綠 merge → 發版鏈 13 棒每棒燒一閘(OIDC 信任/ajv 依賴/簽章車道/SBOM serialNumber/prerelease --tag/npm 傳播延遲/tamper 時序),**beta.95 + beta.96 三包(design-system/storybook-config/governance)OIDC Trusted Publishing + provenance + GitHub Release 全到位**;beta.96 = DataTable a11y rowgroup + InlineEdit 四語意 + 22 處截斷 tooltip。
- **鏈硬化(永久資產)**:publish loop 冪等(integrity skip / 異位元組 fail-closed,`scripts/release-published-integrity.mjs`)、readback 12×10s 重試、tamper meta-test 移 deterministic-isolated(時序探針的效度前提 = 時間隔離)、managed-host 測試版本改讀 package.json(bump 永不假紅)。**下次發版 = merge → tag → dispatch 一棒 ~45 分**(beta.96 第 13 棒實證)。
- **npm 帳號一次性設定已完成(user 2026-07-29)**:3 套件 Trusted Publisher(ajenchen/design-system/release.yml/npm-release)+ governance 首發 bootstrap(beta.94 占位,新套件不能 OIDC 首發 npm/cli#8544)。
- **殘留 owner 動作**:①GitHub App secrets(GOVERNANCE_CHECK_APP_ID/KEY)或移除 anchor App verdict ②desired ruleset 套用(admin)③特權授權儀式 = 數學死鎖(授權檔以 head sha 命名+須 commit 進同 head → 循環不動點),修或拆需拍板;closure 6 缺口已修(PR 17)。
- **WM 消費驗證**:beta.96 后 13/13 對齊 + tsc + build 綠;Audit 回 main 基線(2 既存違規 = DS 層 follow-up:tooltip trigger span aria-allowed-attr + muted 對比度)。

相關:[[reference-cloud-governance-loading]]、[[feedback-codex-exec-transport-canonical]]、[[project-wm-ds-alignment-campaign]]。

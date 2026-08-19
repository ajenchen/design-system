---
name: project-provider-neutral-governance
description: "Provider-neutral governance 現行索引：AGENTS.md 共用 bootstrap；Claude/Codex/future-provider views 全為生成 adapter；standard release 只依五步 machine SSOT 自動執行。"
metadata:
  node_type: memory
  type: project
  originSessionId: 3fb5856b-7b97-40a4-afa1-5db311326bea
---

**目標**:Claude Code、Codex 與未來 provider 共用同一批 canonical bytes、applicable rule coverage、證據要求與 blocking outcome;provider 差異只出現在生成式 discovery/transport adapter。

- **Bootstrap**:`AGENTS.md` 是跨 provider 的簡潔導航;`CLAUDE.md` 是 `@AGENTS.md` + Claude-specific generated-adapter 說明。Nested package instructions 由 `scripts/package-role-sources/` 獨立短 source 生成,root→cwd 累積不得超過 Codex 預設 32KiB。
- **Canonical authority**:`infra/governance/protected-root-classification.json` 封閉 owner/output/non-authority;`packages/governance/canonical/manifest.json` 封閉發布輸入;`scripts/governance-build-graph.json` 只從 canonical source 產生 Claude/Codex/template/fork/control-plane views。Standard release machine SSOT=`infra/governance/release-workflow.json`;`governance/planning/2026-07-16-provider-neutral-governance.md` 為歷史紀錄。
- **Enforcement**:唯一五步=`pr-checks→merge→publish→readback→consumer`,全 AUTO;只有未決產品/UI/UX SSOT 真取捨 ASK。Login/MFA/OAuth/credential reference 完成後 AUTO resume。hard gates 清單以 `infra/governance/release-workflow.json` 為準(prose 對照 = `feedback_solo_dev_workflow.md`「Release hard gate」,不在此重述)。
- **Model neutrality**:model judgment 由 content-addressed bounded shards + closed reducer 供給 provider adapter;model 不直接讀 repo,不信任 provider transcript 作為 coverage authority。新 provider 透過 registry/profile/schema/fixture/certification 接軌,未認證即 fail closed。
- **Distribution**:Claude plugin、Codex plugin/hooks、npm package 與 product template 都是不可變 release 的 adapter/delivery view;WM 是下游 product-consumer canary,用來回饋 DS/template/governance/package 的 root cause,不是第二個治理 owner。
- **WM 身分 SSOT(2026-07-28 user 指示每 session 必知)+ canary 操作檔案**:**WM = 由 `ds-product-template` template 生出的 consumer 實例、專門用來迭代 DS 的試驗品**——模擬「其他使用者 fork template 建產品」,確保 template→consumer 整條流程(exact-version 依賴、治理載入、升級、品質閘)都能產出完美品質的產品;fleet/rollout 語意裡 WM 是第一個真實 consumer。操作檔案(2026-08-18 自 campaign memory 併入):repo `../work-management`(remote `github.com/ajenchen/work-management`;package.json name `ds-product-template` = template 血統)。Harness 已列 additional working directory **可直接讀寫**,fine-grained 憑證含 WM;Checks API 對 WM 無讀取權 → Actions runs/jobs 等強度替代(release orchestrator 已內建)。WM `.claude/skills/` 有在地 skill,DS 升級 smoke 時**必保留其在地修改**。可選 follow-up:WM `cell-select.tsx` 本地 widen 可換用 DS `WithFieldVariantInternal` 型別(beta.85 起已出通道,WM 檔頭「DS 側修復中」註解已 stale)。戰役史(46 findings 根因、beta.84/85、lockfile 真綠、WM main 4e83402 零殘項)在 `governance/archive/memory-retired/2026-08-18-prune/` + WM repo `docs/2026-07-08-ds-alignment-handoff.md`。
- **Legacy assurance**:`candidate-freeze`、offline signatures、72h soak、fleet promotion 對 standard profile retired；broad external activation 與 model certification non-blocking。它們可留作歷史／額外 assurance，但不得改寫五步 completion 或要求 user 核准。
- **當前誠實狀態(2026-08-01 更新)**:live completion 只由 exact-head deep-audit evidence 與 `npm run release:status` 的 GitHub/npm/consumer readback判定，不以 planning prose、candidate receipt、activation ledger、certification、fleet 或 soak 冒充／阻擋 standard release completion。
- **歷史交接**:`governance/planning/2026-07-31-outstanding-work-inventory.md` 已是 `reference / non-executable`，只保存 2026-07-31 provenance。Future agent 不必先讀長篇 ledger，也不得由它重啟舊 P0／activation／certification／fleet／soak；machine state 才是 current authority。

相關:[[reference-cloud-governance-loading]](歷史 Claude cloud 實證)。退役的 provider-specific transport 原文只存於 `governance/archive/memory-retired/` 作 non-authority provenance,不是 current required read。

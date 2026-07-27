---
name: project-provider-neutral-governance
description: "Provider-neutral governance 現行索引：AGENTS.md 共用 bootstrap；Claude/Codex/future-provider views 全為生成 adapter；machine-readable manifest/build graph/evidence/release/rollout contracts 是執行 authority；外部啟用未簽署前 fail closed。"
metadata:
  node_type: memory
  type: project
  originSessionId: 3fb5856b-7b97-40a4-afa1-5db311326bea
---

**目標**:Claude Code、Codex 與未來 provider 共用同一批 canonical bytes、applicable rule coverage、證據要求與 blocking outcome；provider 差異只出現在生成式 discovery/transport adapter。

- **Bootstrap**:`AGENTS.md` 是跨 provider 的簡潔導航；`CLAUDE.md` 是 `@AGENTS.md` + Claude-specific generated-adapter 說明。Nested package instructions 由 `scripts/package-role-sources/` 獨立短 source 生成，root→cwd 累積不得超過 Codex 預設 32KiB。
- **Canonical authority**:`infra/governance/protected-root-classification.json` 封閉 owner/output/non-authority；`packages/governance/canonical/manifest.json` 封閉發布輸入；`scripts/governance-build-graph.json` 只從 canonical source 產生 Claude/Codex/template/fork/control-plane views。`governance/planning/2026-07-16-provider-neutral-governance.md` 為歷史遷移紀錄，不再是執行 authority。
- **Enforcement**:instructions/skills 是導航；native hooks 是早期回饋；只有 frozen-run-bound deterministic/model/hook/CI evidence、protected GitHub gates、immutable release/BOM、template+WM canary、fleet receipts 與 soak 都通過後，才能宣稱 promotion eligible。
- **Model neutrality**:model judgment 由 content-addressed bounded shards + closed reducer 供給 provider adapter；model 不直接讀 repo，不信任 provider transcript 作為 coverage authority。新 provider 透過 registry/profile/schema/fixture/certification 接軌，未認證即 fail closed。
- **Distribution**:Claude plugin、Codex plugin/hooks、npm package 與 product template 都是不可變 release 的 adapter/delivery view；WM 是下游 product-consumer canary，用來回饋 DS/template/governance/package 的 root cause，不是第二個治理 owner。
- **當前誠實狀態**:本機可完成 contracts/generators/poison tests/read-only plans；issuer registry、managed workflow/image identity、GitHub Apps/ruleset、npm trusted publisher、真實雙 provider model certification、WM rollout 與 72h soak 尚無外部簽署證據，必須維持 blocked/not-certified，不可用本機 JSON 代替。

相關:[[reference-cloud-governance-loading]](歷史 Claude cloud 實證)。退役的 provider-specific transport 原文只存於 `governance/archive/memory-retired/` 作 non-authority provenance，不是 current required read。

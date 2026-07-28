---
name: reference-cloud-governance-loading
description: "2026-06 Claude Code 雲端 adapter 的 point-in-time 實證；僅供歷史追溯，不是目前 cloud certification"
metadata:
  node_type: memory
  type: reference
  originSessionId: 3fb5856b-7b97-40a4-afa1-5db311326bea
---

# 雲端 sandbox 治理載入：歷史實證與目前契約

**Q**:fork 使用者(尤其在 web Claude Code / claude.ai/code 雲端 sandbox)怎麼可靠拿到 DS 治理(hooks/skills/commands),且官方控管不可客製?

> **證據狀態**:下列 2026-06-16/17 結果只綁定當時的 Claude Code 版本、cloud target、
> exact source snapshot 與 prerelease。它們不能證明目前版本，也不能外推到 Codex、其他 provider
> 或所有 cloud。當前 certification 必由 registry-declared target 的新鮮、target-bound signed evidence
> 與外部 enforcement readback 決定；缺任一項即 `not-certified`。

## 2026-06 point-in-time 實證(歷史證據)

- 當時 committed `.claude/settings.json` adapter 的 SessionStart / PreToolUse / PostToolUse /
  UserPromptSubmit 都曾在該 Claude cloud target fire。原始 `.claude/logs/` 只保留 legacy
  provenance 意義；它不符合目前 target-bound certification contract，也不把 `.claude` 升格為 SSOT。
- 當時 `/plugin install` 曾回報成功但第一個 cloud session 的 hooks 未 fire，且 project
  `enabledPlugins` 曾被忽略(anthropics/claude-code#63028/#62174)。這是歷史 false-positive anchor，
  不是「plugin 永遠不可用」的當前產品事實；引用前必依目前 provider 版本重驗。
- 當時 `claude --cloud` 的 headless/TTY 行為與 Claude discovery 路徑也只代表該版本。
  這些觀察促成 committed generated adapter，但不構成目前 cloud certification。

## 目前架構契約

- Canonical authority = provider-neutral corpus + registry/materializer；`.claude`、`.agents`、Codex
  hooks 與未來 provider surface 都只是 generated delivery/discovery adapter。
- 每個 fresh local/hosted checkout 都必在該環境的 setup lifecycle 顯式跑
  **`npm run setup:all`**。它先依 committed exact versions/lock 執行 role-bound governance
  setup、驗簽並跑 hard gate，再 provision canonical peer CLI；SessionStart 不 install、不 refresh、
  不把 mutable tag 當輸入。
- Cloud/local/remote/CI 套同一 hard-gate contract，但 certification 是 per target/per snapshot；
  「adapter 檔存在」「以前 fire 過」或「plugin 顯示 installed」都不能替代 protected CI、managed-host
  attestation 與 external readback。共識方案見 `governance/memory/project_provider_neutral_governance.md`。

## Mid-session reload(2026-06-18 歷史行為筆記，使用前重驗)

當時 fork 中途完成 authenticated `sync-all` 後三軌行為不同；以下不可當成未來 provider 保證:
- **Hook command scripts**:每次 fire 重 spawn + 重讀 disk → **即時**(dispatcher 讀 node_modules manifest 當下最新)。
- **settings.json(hooks/permissions)**:**file watcher 自動 hot-reload**,有 `ConfigChange` hook event;**非必重啟**(docs verbatim: "Direct edits to hooks in settings files are normally picked up automatically by the file watcher")。
- **preamble / CLAUDE.md(provider-specific generated adapter) / rules / skills**:SessionStart-only(`source` = startup/resume/**clear**/compact)→ `/clear` 或下個 session 才重讀;skills 在 session 開始前掃 → 同理需 `/clear`/新 session。
- **結論**:只有「事前指引 preamble + skills」需 `/clear` 或新 session;機械 hook 即時、settings 自動 reload。`UserPromptSubmit` 可每 prompt 注 `additionalContext`(理論可做 in-session preamble re-inject,但 preamble 大→token 成本高→**不採用**,/clear 是乾淨慣例)。
- **目前實作已不同**:full-text preamble 已退役；provider-neutral common instruction 是 committed managed
  檔，SessionStart 相容 launcher 只做唯讀驗證並輸出短狀態。是否 hot-reload 仍是 provider host
  能力，不作治理保證；升級 managed instruction/hook registration 後以完整重啟該 provider process
  作為可攜式驗證方式，不能把上述 2026-06 `/clear` 行為外推成當前契約。
- Fresh cloud checkout 的**目前契約**不是 SessionStart mutable install；必由 cloud setup lifecycle 跑
  `npm run setup:all`。若該 target 沒有本次 snapshot 的 runtime evidence，狀態仍是
  `not-certified`，即使歷史 session 曾成功。

## C-prime committed-config milestone(歷史 release evidence)

2026-06-17 當時的 exact prerelease(`beta.70` milestone,commit `c8f198b5`;main `81912f8d`)
曾提供下列 point-in-time evidence；它不證明目前 package、provider 或 cloud target。

- **架構**:fork 治理本體(fork hooks + 設計紀律 preamble + manifest)隨 npm ship 在 `node_modules/@qijenchen/design-system/ds-canonical/fork/`;3 個 shared thin launcher 只 committed 一次於 provider-neutral `governance/bin/`，`.claude/settings.json` 與 `.codex/hooks.json` 各自只註冊同一入口。`inject_fork_governance_preamble.sh` 做 SessionStart 唯讀驗證；`fork-governance-dispatcher.sh` 於 Pre/Post/UserPromptSubmit 讀 manifest 跑官方 fork hook。`npm run sync-all` transactionally 刷新唯一 launcher tree、provider configs、skills 與 obsolete registration；刪除/retire `.claude` 不會破壞 Codex/future runtime。**不需 plugin**(理由 = 上方 plugin 不可靠實證)。
- 當時 source harness/dogfood/CI 與對抗稽核曾通過；這些是歷史 release evidence，不是目前 gate result。
- 2026-06-17 的單一 claude.ai/code 真機 session 曾同時看到 proactive 指引，且在手刻
  `<table>` 時收到 consumer misuse BLOCKER。這只證明那個 target/snapshot 的兩條路徑，
  **不得再描述為「cloud 100% 蓋章」或所有環境無條件生效**。
- 副產:fork telemetry 僅在 explicit opt-in 時寫入 Git metadata 下的 `governance-runtime/`，不再把 shared runtime state 綁到任一 provider home。SSOT 分類 = `scripts/fork-governance-classification.json`。

**時效注意**:provider 行為、cloud image 與外部 controls 都會變；任何 current claim 必重驗並綁定
provider/model/version、target、commit/tree、lock 與 evidence expiry。

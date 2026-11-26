# Changesets

2026-05-22 Phase 4 team-distribution-roadmap ship。Semver release for
`@qijenchen/design-system` + `@qijenchen/storybook-config`(linked versions per `config.json`)。

**2026-05-29 起 release 走手動 bump + GitHub Releases auto-notes**(commit 0146e02f):changesets 一直沒被 consume、`changeset-release/main` bot 支線是純 noise 已刪。目前 `.changeset/config.json` 保留備用(未來若改回 changesets-driven 可直接 re-adopt),但實際 release 不再依賴 `npx changeset` / `changeset-bot` / `changeset publish`。

## Current workflow（standard path）

1. **Bump**:`packages/design-system/package.json` 是版本輸入；`npm run governance:generate`
   透過 build graph 同步所有 package、plugin、marketplace 與 consumer projection。
2. **Content PR**:同一 task branch commit/push；protected required CI + conversation resolution 通過。
3. **Release**:`npm run release:auto` 依
   `infra/governance/release-workflow.json` 自動續跑
   `pr-checks → merge → publish → readback → consumer`。Orchestrator 才建立 exact-main tag、送
   protected repository dispatch、驗 GitHub/npm immutable version，並完成 template 的 exact-version readback。
   **產品 canary `ajenchen/workspace` 每次發版自動收到升級 PR,合併由它自己決定**(user 2026-11-25 原話:「此外，設計系統 repo 要把 canary 換成 ajenchen/workspace，換過來之後，設計系統出新版時，這個 repo 也會自動收到升級 PR。」):
   它在 `infra/governance/release-workflow.json` 標 `merge: consumer-owned`,第五步只替它派工、開 PR、讀回連結與檢查狀態;
   不合併、不等合併,它的檢查紅也不讓發版失敗,不是第五步的完成條件(「只開 PR、不等合併」是 AI 的工程判斷)。
   template 照舊每次自動升級並合併。判定唯一實作在 `scripts/lib/release-consumer-selection.mjs`。

不要手動打 tag、直接 push main、直接 publish，或把 legacy preflight/candidate/soak 插回 standard
path。`.changeset/config.json` 與手動 workflow 只是 future-reserved authoring surface；未來明確採用
Changesets 時，它最後也必交回同一個 five-step release orchestrator。

## Codemod for breaking change

破壞性變更怎麼處理(留不留舊名、要不要標 @deprecated、發布說明怎麼寫)的唯一住處是 `packages/design-system/ds-canonical/references/props-naming.md`「相容政策」(0.x / 預發布版不留舊名,改由變更帳本 `packages/design-system/ds-changes.json` 逐條寫明,隨 npm 出貨,GitHub Release 說明由它產生);本段只講 1.0 以後的 codemod 工具,不另訂規則。

Major version bump 必伴隨 codemod(per roadmap Phase 4 deliverable):
- `packages/design-system/codemods/v1-to-v2/` etc.
- jscodeshift-based migration script
- README docs path

## World-class ref

- changesets/changesets GitHub repo
- Vercel `pkg.pr.new` pre-release model
- Material UI / Storybook / Radix UI 全 npm ecosystem 慣例

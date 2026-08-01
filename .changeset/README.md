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
   protected repository dispatch、驗 GitHub/npm immutable version，並完成 template/WM exact-version readback。

不要手動打 tag、直接 push main、直接 publish，或把 legacy preflight/candidate/soak 插回 standard
path。`.changeset/config.json` 與手動 workflow 只是 future-reserved authoring surface；未來明確採用
Changesets 時，它最後也必交回同一個 five-step release orchestrator。

## Codemod for breaking change

Major version bump 必伴隨 codemod(per roadmap Phase 4 deliverable):
- `packages/design-system/codemods/v1-to-v2/` etc.
- jscodeshift-based migration script
- README docs path

## World-class ref

- changesets/changesets GitHub repo
- Vercel `pkg.pr.new` pre-release model
- Material UI / Storybook / Radix UI 全 npm ecosystem 慣例

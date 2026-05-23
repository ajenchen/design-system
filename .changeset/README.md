# Changesets

2026-05-22 Phase 4 team-distribution-roadmap ship。Changesets-driven semver release pipeline for
`@qijenchen/design-system` + `@qijenchen/storybook-config`(linked versions per `config.json`)。

## 何時加 changeset

每個 PR 修 `packages/*` substantive code → 必加一個 `*.md` 到此目錄,描述:
- 影響哪 package(`@qijenchen/design-system` / `@qijenchen/storybook-config`)
- patch / minor / major(per semver)
- 用戶可見 change summary

CI(`.github/workflows/release.yml`)強制 PR 有 changeset,no changeset = blocked。

## Workflow

1. **Author**:`npx changeset` interactive → 產 `.changeset/<random>.md`
2. **Review**:reviewer 看 changeset 對齊 PR 影響
3. **Merge to main**:`changeset-bot` 自動開「Version Packages」PR
4. **Release**:merge bot PR → CI 跑 `changeset publish` → npm publish + GitHub Release + changelog

## Codemod for breaking change

Major version bump 必伴隨 codemod(per roadmap Phase 4 deliverable):
- `packages/design-system/codemods/v1-to-v2/` etc.
- jscodeshift-based migration script
- README docs path

## World-class ref

- changesets/changesets GitHub repo
- Vercel `pkg.pr.new` pre-release model
- Material UI / Storybook / Radix UI 全 npm ecosystem 慣例

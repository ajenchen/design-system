# @qijenchen/product-workspace

Team monorepo consuming `@qijenchen/design-system`(via npm)+ `design-system@qijenchen`(via Claude plugin marketplace)。

## Quick start(5 命令上線)

```bash
git clone github.com/qijenchen/product-workspace
cd product-workspace
npm install                    # → 自動拉 @qijenchen/design-system + storybook-config + Claude plugin enable
claude                          # Claude session 啟動 → auto detect plugin → 27 skills / 37 hooks / rules / CLAUDE.md
npm run create-app order-dashboard   # 生新 product 在 apps/order-dashboard/
npm run storybook              # localhost:6006
```

## 架構

```
product-workspace/
├── apps/                              ← 多 product folders(team 共編)
│   ├── _template/                     ← npm run create-app <name> 從這 copy
│   ├── order-dashboard/
│   └── analytics-portal/
├── packages/                          ← 跨 product shared utility
│   └── shared-utils/
├── .storybook/                        ← shared(import @qijenchen/storybook-config)
├── .claude/settings.json              ← enable design-system@qijenchen plugin
├── .github/{CODEOWNERS, workflows/}   ← team review + audit + deploy
├── codemods/                          ← DS major bump migration scripts
├── docs/                              ← onboarding(see docs/01-first-time-setup.md)
└── renovate.json                      ← auto-update DS bumps
```

## DS 自動跟版

Renovate 每週一 6am 掃 `@qijenchen/design-system` 新版 → 開 PR(label `ds-bump`)→ CI 全綠 → team merge:

| Bump type | Strategy |
|---|---|
| **Patch / Minor** | Renovate 開 PR,audit 全綠,team review merge |
| **Major** | Renovate 開 PR + label `needs-codemod` → 跑 `codemods/v<N>-to-v<N+1>/transform.ts`(jscodeshift)→ merge |
| **Pre-release(@beta)** | Renovate 不自動,consumer manually pin `@qijenchen/design-system@beta` 試 |

詳細 upgrade 流程 → [docs/04-ds-upgrade.md](docs/04-ds-upgrade.md)

## CI

- **audit.yml**:每 PR 跑 tsc / content-quality / code-quality / build / storybook
- **deploy.yml**:per-app Vercel deploy(matrix on `apps/*`,排 `_template`)

## 不准改的

DS 在 `node_modules/@qijenchen/design-system/` read-only。需 component 改動 → 開 issue 給 DS owner repo。需自己組件 → 寫在 `apps/<your-app>/src/components/` 不污染 DS。

## Docs

- [01-first-time-setup.md](docs/01-first-time-setup.md)
- [02-create-new-product.md](docs/02-create-new-product.md)
- [03-co-edit-workflow.md](docs/03-co-edit-workflow.md)
- [04-ds-upgrade.md](docs/04-ds-upgrade.md)
- [05-troubleshooting.md](docs/05-troubleshooting.md)

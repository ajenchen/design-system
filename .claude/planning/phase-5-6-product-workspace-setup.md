# Phase 5+6 — Product Workspace Setup(deferred to separate repo)

2026-05-22 Phase 5+6 handoff doc。

## Why deferred

Phase 5+6 deliverables 屬 **獨立 GitHub repo `qijenchen/product-workspace`**(per roadmap L182):

```
qijenchen GitHub:
├── design-system        ← 本 repo(Phase 1-4 已完成)
└── product-workspace    ← NEW repo,team 全員 collaborator
```

DS repo internal autonomous work 無法跨 repo create / clone / configure。Phase 5+6 需要:
- 創 GitHub repo(`qijenchen/product-workspace`)
- Setup org-level permissions(team collaborators)
- Configure CI/CD secrets(NPM_TOKEN / Netlify / Vercel)
- 這些是 user-driven 一次性 GitHub UI / CLI ops,不在 Claude session 自動執行範圍

## Phase 5 — product-workspace template repo

### User 需手動做(GitHub UI / CLI):

1. **Create new GitHub repo** `qijenchen/product-workspace`
2. **Team collaborators**:add 全 team(write access)
3. **Branch protection**:main 要 1 reviewer approval(同 team 互審)
4. **CI secrets**:NPM_TOKEN(consume `@qijenchen/design-system`)/ Netlify Vercel token(deploy preview)

### Claude session 可協助生 boilerplate(等 user trigger):

下次 session user 講「開 product-workspace template」→ Claude 可協助:

```
product-workspace/
├── package.json            workspaces: ["apps/*", "packages/*"]
│                           dependencies: @qijenchen/design-system / @qijenchen/storybook-config
├── .claude/
│   └── settings.json       enabledPlugins: { "design-system@qijenchen": true }
│                           defaultMode: "auto"
├── apps/
│   └── _template/          single-app boilerplate(src/main.tsx + Vite + Storybook)
├── packages/
│   └── shared-utils/       跨 product utility(若 team 之後抽出)
├── .storybook/
│   └── main.ts             import preset from '@qijenchen/storybook-config/preset'
│   └── preview.tsx         import preview from '@qijenchen/storybook-config/preview'
├── .github/
│   ├── CODEOWNERS          * @team
│   ├── workflows/
│   │   ├── audit.yml       tsc + build + storybook + audit-content-quality + code-quality +
│   │                       visual-audit + audit-orphan-tokens + audit-preflight +
│   │                       sync-governance-counters --check
│   │   └── deploy.yml      per-app Vercel/Netlify deploy(matrix on apps/*)
├── scripts/
│   └── create-app.mjs      `npm run create-app <name>` generator(copy _template/ → apps/<name>/)
├── README.md               Quick start(5 命令上線)
├── .gitignore
└── .husky/
    └── pre-commit          client-side warning if 試圖 import non-public DS internal
```

### Acceptance(roadmap L191-194):
- Clone template → `npm install` → `npm run create-app foo` → `apps/foo/` 自動建好可直接寫 product
- `npm run storybook` 跑,看到全 addons
- Mock PR → GitHub Actions 跑全套 audit

## Phase 6 — Onboarding documentation

寫在 `product-workspace/docs/`(非本 DS repo)。User 創完 repo 後 invoke Claude 協助生:

- `README.md`:Quick start(5 命令上線)
- `docs/01-first-time-setup.md`:全流程
- `docs/02-create-new-product.md`:`npm run create-app` walkthrough
- `docs/03-co-edit-workflow.md`:多人共編 PR / merge / conflict resolution
- `docs/04-ds-upgrade.md`:`npm update` + 看 changelog + 跑 codemod
- `docs/05-troubleshooting.md`:常見問題

Acceptance:新 team member 不問你,看 doc 從零到 ship 第一個 PR。

## Trigger to resume

User 完成 Phase 5 pre-req(GitHub repo create + team add + CI secrets)後,
回 Claude session 講「開做 product-workspace boilerplate」/「Phase 5 開做」→ Claude 走 pickup contract。

## Reference

- Vercel `create-next-app` template
- shadcn `next.js` starter
- Stripe Engineering monorepo internal docs
- Stripe API docs onboarding
- Vercel Quickstart
- shadcn install flow

# template/

2026-05-23 ship per team-distribution-roadmap Phase 5+6 — pre-built scaffold 給 user 不用等 Claude 在 new repo 內生 boilerplate。

## 安全 / 部署模式(per 2026-05-23 user directive)

**Repo**:**Private**(team member-only collaborators,non-member 看不到 source)
**App / Storybook host**:**Netlify**(non-GitHub Pages — public host 不適合 private workspace)
**權限控管**:Netlify Identity(免費,invite-only)OR Site Password(Pro)OR RBAC(Enterprise)— per `deploy.yml` / `storybook-deploy.yml` 註解

不適用 host(本 template 已 ban):
- ❌ **GitHub Pages**:public host,private workspace 不該 expose
- ❌ **Vercel free tier**:可,但本 template 統一 Netlify(reduce host fragmentation)

## 怎麼用

```bash
# 1. Create new GitHub repo(必 --private,per security posture)
gh repo create qijenchen/product-workspace --private --confirm

# 2. Clone empty
git clone github.com/qijenchen/product-workspace
cd product-workspace

# 3. Copy template content
cp -r /path/to/this-ds-repo/template/product-workspace/. .
# Note:dot . at end 包含 hidden files(.claude / .storybook / .github / .gitignore)

# 4. Edit placeholders
sed -i '' 's/qijenchen/<YOUR_ORG>/g' package.json .github/CODEOWNERS renovate.json README.md
# (or use IDE find-replace)

# 5. Install + first commit
npm install
git add . && git commit -m "chore: initial scaffold from DS template"
git push origin main

# 6. Add Renovate / Vercel apps 到 GitHub repo
# 7. Set secrets:VERCEL_TOKEN(if deploy.yml)
# 8. Add team collaborators + branch protection
```

完成,team 之後從這 GitHub repo clone 開工(per [docs/01-first-time-setup.md](product-workspace/docs/01-first-time-setup.md))。

## Files included

```
template/product-workspace/
├── README.md                            ← consumer-facing quick start
├── package.json                          ← workspaces + DS deps + scripts
├── tsconfig.json                         ← (TODO consumer 自添)
├── vite.config.ts                        ← (TODO consumer 自添)
├── .gitignore
├── renovate.json                         ← auto DS bump PR
├── .claude/
│   └── settings.json                     ← enable design-system@qijenchen plugin
├── .storybook/
│   ├── main.ts                           ← import from @qijenchen/storybook-config
│   └── preview.tsx                       ← import shared preview
├── .github/
│   ├── CODEOWNERS                        ← team review
│   └── workflows/
│       ├── audit.yml                     ← per-PR tsc + content + code + build + storybook
│       └── deploy.yml                    ← per-app Vercel matrix deploy
├── apps/
│   └── _template/                        ← npm run create-app <name> source
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           └── main.tsx                  ← demo with DS Button + Avatar
├── packages/
│   └── shared-utils/                     ← (TODO consumer fill 跨 product utility)
├── scripts/
│   └── create-app.mjs                    ← npm run create-app <name> generator
├── codemods/
│   └── README.md                         ← DS major bump migration scripts hub
└── docs/
    ├── 01-first-time-setup.md            ← Day 0 上工
    ├── 02-create-new-product.md          ← 生新 app
    ├── 03-co-edit-workflow.md            ← team PR / merge
    ├── 04-ds-upgrade.md                  ← auto-update propagation 機制
    └── 05-troubleshooting.md             ← 排查
```

## DS side preconditions(must be satisfied first)

1. `@qijenchen/design-system` published to npm(or internal registry consumer can pull from)
2. `@qijenchen/storybook-config` published(same as DS)
3. `design-system@qijenchen` Claude plugin published to marketplace(per host decision)
4. NPM_TOKEN(or alternative auth)distributed to product-workspace as CI secret
5. Renovate app installed to `qijenchen` GitHub org

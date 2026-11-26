# template/

2026-05-23 ship per team-distribution-roadmap Phase 5+6 — pre-built scaffold 給 user 不用等 Claude 在 new repo 內生 boilerplate。

## 安全 / 部署模式(per 2026-05-23 user directive)

**Repo**:**Private**(team member-only collaborators,non-member 看不到 source)
**App / Storybook host**:**Netlify**(non-GitHub Pages — public host 不適合 private workspace)
**權限控管**:**免費 = HTTP Basic Auth via Netlify Edge Function**(本 template 內建 `netlify/edge-functions/basic-auth.ts` + `netlify.toml` 已 wire `[[edge_functions]]`;fork user 在 Netlify 設 env var `STORYBOOK_BASIC_AUTH`=`user:password` 即生效,瀏覽器原生帳密彈窗,Edge Functions 含 free 全方案可用、`.netlify.app` 預設網址直接生效、無需自訂網域)OR **Pro Password Protection**($20/mo dashboard 開關,美化密碼頁 + 可只擋 preview 放行 production)OR **Cloudflare Access**(免費 50 user 真 SSO,需自架 Cloudflare proxy 在 Netlify 前)。注意:Netlify 內建密碼〔dashboard「Password protection」**與** `_headers` Basic-Auth header〕都是 Pro 專屬($20/mo,官方 docs + support forum 證實),free-tier 沒有(且 `_headers` 不套用到 edge function)→ 免費方法走 Edge Function 自做 Basic Auth,非 dashboard password 也非 `_headers`

不適用 host(本 template 已 ban):
- ❌ **GitHub Pages**:public host,private workspace 不該 expose
- ❌ **Vercel free tier**:可,但本 template 統一 Netlify(reduce host fragmentation)

## 命名 SSOT(2026-05-29 對齊完成,前期歷史 drift 已修)

- **DS-internal source dir**: `template/ds-product-template/`(本目錄,scaffold source SSOT,2026-05-29 從歷史名 `product-workspace` 重命名對齊 published repo)
- **Published GitHub Template Repository**: [`ajenchen/ds-product-template`](https://github.com/ajenchen/ds-product-template)(fork user 真實看到 / fork 的 repo,2026-05-27 從 `product-workspace` 重命名)
- **Fork user 創的 new repo**: `<their-username>/<their-product-name>`(他們自選)

**3 層命名現完全對齊** `ds-product-template`(DS-internal 名 = published 名,fork user 自選自由)。

## 怎麼用(2026-05-27 已升級成「Use this template」按鈕,以下為 owner setup 流程)

**Owner setup once**:在 `ajenchen/ds-product-template` GitHub repo → `Settings → General → Template repository ✓` 勾選 + `Settings → General → Change visibility: Public`。本 DS repo `template/ds-product-template/` 內容透過 sync 機制(or 手動 push)同步到 `ajenchen/ds-product-template`。

**Fork user**:在 `ajenchen/ds-product-template` 點「Use this template」→ 自動建他自己的 repo,流程詳該 repo `README.md`「Template Usage」段。

**(歷史:legacy bash 流程 — 在 template-repository 機制前用)**
```bash
gh repo create ajenchen/ds-product-template --private --confirm
git clone github.com/ajenchen/ds-product-template
cd ds-product-template
cp -r /path/to/this-ds-repo/template/ds-product-template/. .
sed -i '' 's/qijenchen/<YOUR_ORG>/g' package.json .github/CODEOWNERS README.md
npm install
git add . && git commit -m "chore: initial scaffold from DS template"
git push origin main
```

完成,team 之後從 [`ajenchen/ds-product-template`](https://github.com/ajenchen/ds-product-template) repo 「Use this template」開工(per [docs/01-first-time-setup.md](product-workspace/docs/01-first-time-setup.md))。

## Files included

```
template/ds-product-template/
├── README.md                            ← consumer-facing quick start
├── CLAUDE.md                            ← fork-and-go onboarding + consumer canonical
├── package.json                          ← workspaces + DS deps + scripts
├── tsconfig.json                         ← workspace base tsconfig
├── netlify.toml                          ← Storybook build + edge-function Basic Auth wire + noindex headers (Netlify Git integration)
├── netlify/
│   └── edge-functions/
│       └── basic-auth.ts                 ← FREE 密碼保護:讀 STORYBOOK_BASIC_AUTH env var 自做 HTTP Basic Auth
├── .gitignore
├── .npmrc
├── .env.example
├── .claude/
│   └── settings.json                     ← enable design-system@qijenchen plugin
├── .devcontainer/
│   ├── devcontainer.json                 ← Codespaces cloud-dev path
│   └── onboard-banner.sh
├── .storybook/
│   ├── main.ts                           ← import from @qijenchen/storybook-config
│   ├── preview.tsx                       ← import shared preview
│   ├── manager-head.html
│   └── storybook.css
├── .github/
│   ├── CODEOWNERS                        ← team review
│   ├── dependabot.yml                    ← daily DS version bump PR
│   ├── pull_request_template.md          ← PR 說明提醒(改到別人負責的 app:寫明動了哪個 app、為什麼)
│   └── workflows/
│       └── audit.yml                     ← per-PR locked install + hooks-off governance:check + typecheck + lint:imports + build(a11y 是選用 lane:npm run audit:a11y;要擋請另建自己的 workflow)。接收升級的 sync-design-system.yml 下一版才出貨,這一版升級在本機跑 sync-all
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
4. NPM_TOKEN(or alternative auth)distributed to `ajenchen/ds-product-template` as CI secret
5. Renovate app installed to `qijenchen` GitHub org

# DS Product Template

> **GitHub Template Repository** for product team apps consuming [`@qijenchen/design-system`](https://github.com/ajenchen/design-system)。
>
> **Use this template** on GitHub → fork 為你自己的 repo,跑 `npm install` + `npm run create-app <product-name>` 就上線。

## Status

- **2026-05-27** repo 重命名 + template-friendly restructure(per fork-and-go workflow)
- Seed app: `apps/template/`(預設範例,fork user 跑 create-app 後可刪)
- Add a new product app: `npm run create-app <kebab-case-name>` → 在 `apps/<name>/` 開新 app

## Template Usage(Day 0 onboarding,fork user 必讀)

### Step 1 — Fork

**Owner setup once**(本 repo 擁有者):GitHub `Settings → General → Template repository ✓` 勾選 + `Settings → General → Danger Zone → Change visibility: Public`(讓 fork user 看到「Use this template」按鈕)。

**Fork user**:GitHub「Use this template」按鈕 → Create new repo from template。

或:`git clone <this-repo>` + `git remote set-url origin <your-new-repo>`。

### Step 2 — npm install(plugin install warning 自動跑)

```bash
npm install   # postinstall 紅色 warning 提示 /plugin install
```

### Step 3 — Claude Code:plugin install + DS canonical cross-load

```
/plugin marketplace add github:ajenchen/design-system
/plugin install design-system@qijenchen-ds
```

### Step 4 — Spawn your first product app

```bash
npm run create-app order-dashboard   # 在 apps/order-dashboard/ 開新 app
cd apps/order-dashboard
npm run dev   # localhost vite 啟動
```

Storybook root config `.storybook/main.ts` 自動 glob `apps/**/*.stories.tsx`,**每加新 app stories 自動現身 storybook**,不用手動 register。

### Step 5 — Setup Netlify(自動 site + 手動 password,3 分鐘)

```bash
npm run setup:netlify   # 自動:CLI install + GitHub OAuth login + site 建 + 連 repo
                        # 最後印 dashboard URL + 教你 30 秒設 Basic Password
```

**為何 Basic Password?** Identity(原本 invite-only 機制)2024 起 Netlify 已 deprecated,新帳號可能根本看不到 Identity menu;Team protection 鎖 Pro plan($19/mo)。**Basic Password 是 free-tier 唯一真擋陌生人的方法**(設一組共用 password,分享給 stakeholder)。

### Step 6 — Push main → 自動部署

```bash
git push origin main   # Netlify auto build storybook + per-branch preview
```

DS-side hook 自動 inject deploy URL into Claude reply(plugin 提供)。

### Step 7 — Keep DS plugin + npm deps 永遠最新(auto-sync chain)

DS repo 任何 push main → 兩條 auto-chain 同時跑,確保 fork repo 不偏移:

**Chain 1 — npm dependency**(自動):
- DS bump version + tag push → `release.yml` 跑 npm publish → `repository_dispatch ds-published`
- DS push main(non-version SSOT change)→ `ssot-sync-dispatch.yml` 跑 → `repository_dispatch ds-ssot-changed`
- 此 PW repo `.github/workflows/sync-design-system.yml` 收 event → `npm update @qijenchen/*` + commit + push
- Netlify auto rebuild → DataTable / 全 token / 全 component 永遠最新

**Chain 2 — Plugin hooks/skills/memory**(半自動):
- DS 改 hook / skill / governance → plugin.json + marketplace.json 自動 bump version(per DS `sync-version-to-all-manifests.mjs`)
- Fork user 在 terminal 跑 1 command(2026-05-27 改用 Claude CLI `claude plugin` integration):

```bash
npm run sync-all   # 同時 update npm + plugin marketplace + plugin install
```

完整等同手動跑:`npm update @qijenchen/*` + `claude plugin marketplace update qijenchen-ds` + `claude plugin update design-system@qijenchen-ds`。

Plugin 改動需 **restart Claude Code session** 才 apply(SDK 限制)。

Session_start hook `check_plugin_freshness.sh` 偵測 marketplace stale → prompt run `sync-all`。

## Layout

```
ds-product-template/
├── apps/                       ← Product apps (each is independent Vite + React)
│   └── template/              ← Copy this via `npm run create-app <name>`
│       ├── src/
│       │   ├── main.tsx        ← React root + TooltipProvider
│       │   ├── App.tsx         ← Replace with your product UI
│       │   └── globals.css     ← @import tailwindcss + DS tokens
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── packages/                   ← Cross-app shared utilities (if any)
├── scripts/
│   ├── create-app.mjs          ← `npm run create-app <name>` generator
│   └── lint-ds-internal-imports.mjs  ← Guard against importing DS internals
├── .claude/
│   └── settings.json           ← Claude Code config (plugin marketplace flow)
├── .storybook/                 ← Shared Storybook config (imports @qijenchen/storybook-config)
├── .github/
│   ├── CODEOWNERS              ← Code review routing
│   └── workflows/
│       ├── audit.yml           ← tsc + lint + build per push/PR
│       └── deploy.yml          ← Per-app Netlify deploy
├── package.json                ← workspaces + DS deps
├── tsconfig.json               ← Base TS config (apps extend)
└── README.md                   ← You are here
```

## Claude Code plugin setup(first time)

```
/plugin marketplace add github:ajenchen/design-system
/plugin install design-system@qijenchen-ds
```

Then plugin auto-enables (`.claude/settings.json` `defaultMode: "auto"`). You get:
- 22+ skills (`/component-quality-gate`, `/visual-audit`, etc.)
- 59 hooks (auto-fire pre/post tool events)
- 31 active M-rules (CLAUDE.md instructions inherit on every session)

## Important rules(read CLAUDE.md from `design-system` repo via plugin)

- **Never modify** `node_modules/@qijenchen/design-system/`(install another copy if you need experimental changes — file PR to DS repo instead)
- Import only from public surface: `@qijenchen/design-system` top barrel,`@qijenchen/design-system/styles/tokens`,`@qijenchen/design-system/hooks/<name>`
- Run `npm run lint:imports` before commit to catch internal-path leaks

## Cloud-dev paths(全雲端,3 條路選一條走)

**Path 1 — Claude Code 直連 repo(推薦,真正零地端依賴)**:在 claude.ai/code(或 Claude 桌面 / VS Code extension)直接連你的 GitHub fork repo;Claude 把 repo clone 進 ephemeral sandbox,所有 governance hooks + skills + npm + git ops 在 sandbox 內跑。寫完 commit / push 回 GitHub。**這是 user 目前實際工作流**;不需要 Codespaces 也不需本地 IDE。

**Path 2 — GitHub Codespaces(2026-05-29 ship `.devcontainer/`,給不用 Claude Code 直連的 user)**:fork repo → `<> Code → Codespaces → Create codespace on main` → container 自動裝 Node 22 + gh CLI + jq + `@anthropic-ai/claude-code` + `netlify-cli` + Tailwind / ESLint / Prettier ext + `npm install`(via `postCreateCommand`)。Terminal 自動顯示中文 onboard banner。免費 60h/月。

**Path 3 — 本地**:`git clone` + `npm install` + `claude`(本地 macOS/Linux/WSL)。

**3 path 共通 3 step 上工**(無論在 sandbox / Codespaces / 本地 都一樣):
```bash
claude                                                         # ① 啟動 Claude Code
# 內輸: /plugin marketplace add github:ajenchen/design-system    # ② 拿 DS 治理 plugin
# 內輸: /plugin install design-system@qijenchen-ds                #    啟用 22 skills + 59 hooks
npm run setup:netlify                                          # ③ Netlify OAuth + 印 dashboard URL
# 開瀏覽器點 Visitor access → Basic protection → 輸 password → Save
```

Deploy URL 在 push 後 hook `inject_deploy_url_after_push.sh` 自動 inject 進 Claude reply(`https://<branch>--<owner>-<repo>.netlify.app` 推導 + curl 200 verify + Storybook content sniff)。

## Storybook deploy(無需 GitHub secret)

**Step 1 — Connect Netlify**:
1. Netlify Dashboard → **Add new project** → 連 fork 後的 `ds-product-template` repo
2. Netlify 自動讀根目錄 `netlify.toml` → build `storybook-static` → deploy
3. 每次 push main → Netlify auto rebuild。Per-branch preview 自動啟用。

**Step 2 — 🔒 設 Basic Password Protection**(free-tier 唯一可用 access control):

`npm run setup:netlify` 自動跑完 CLI install + login + site 建 + 連 repo,**最後印 dashboard 連結 + 30 秒 password 設定指引**。

跟著 script 印的步驟手動 dashboard 設:
1. 打開 `https://app.netlify.com/projects/<your-site>/configuration/visitor-access`
2. **Password Protection** → 選「**Basic protection**」→ 輸 password → **Save**
3. 把 site URL + password 私訊給 stakeholder(team Slack / DM)

**為何只用 Basic Password?**(誠實版,2026-05-29 確認):
- ❌ **Identity** = 2024 起 Netlify 公告 deprecated;新帳號可能看不到 Identity menu。原本「invite-only per-user」路徑**不再可用**
- ❌ **Team protection 🔒** = 鎖,要 Pro plan $19/mo(fork user 不該被迫付費)
- ❌ **Non-production deploys only 🔒** = 同上鎖
- ✅ **Basic Password** = free-tier 唯一真擋陌生人的方法(設共用 password,分享 team)

**Defense-in-depth**(`netlify.toml` 已 ship):X-Robots-Tag noindex(搜尋引擎不收錄 URL)+ Referrer strict-origin + X-Frame SAMEORIGIN — SEO 層加固,**真實擋人**靠 Basic Password 那一層。

**要更細權限**?三條路:
- 升 **Netlify Pro** $19/mo → 解鎖 Team protection(per-account login + audit log)
- 自架 **Cloudflare Access**(免費 50 user;setup 比 Netlify 複雜)
- 公開 site,只防 SEO(`X-Robots-Tag noindex`)— 若 stakeholder 不介意 URL 知道就能看

### App deploy(`apps/template/dist`)— 需 GitHub Actions secret
App 是 monorepo sub-dir build(root install + cd apps/X build),Netlify Git integration 不適合
(會在 root run build 但 publish dir 在 sub-dir)。所以走 GitHub Actions workflow:

| Secret | 用途 | 取得方式 |
|---|---|---|
| `NETLIFY_AUTH_TOKEN` | Netlify auth | Netlify → User settings → Applications → Personal access tokens |
| `NETLIFY_SITE_ID_TEMPLATE` | template app site ID | 新建 Netlify site for app → Site overview → Site ID |

設完 secrets 後 `.github/workflows/deploy.yml` push main → deploy `apps/template/dist`。

完整 step-by-step 詳 `docs/01-first-time-setup.md`。

## License

UNLICENSED — internal use only.

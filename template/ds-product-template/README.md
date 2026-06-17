# DS Product Template

> **GitHub Template Repository** for product team apps consuming [`@qijenchen/design-system`](https://github.com/ajenchen/design-system)。
>
> **Use this template** on GitHub → fork 為你自己的 repo,跑 `npm install` + `npm run create-app <product-name>` 就上線。
>
> **設計治理(item-anatomy / layout-space / 命名 / SSOT 消費 / 防手刻 primitive)由 C-prime committed-config 自動送達 —— 不需裝 plugin。** 詳 `CLAUDE.md`「治理怎麼到你手上」。

## Status

- **2026-06-17** 治理改 C-prime committed-config-first(免 /plugin install;治理本體隨 npm + committed hooks 自動生效)
- Seed app: `apps/template/`(預設範例,fork user 跑 create-app 後可刪)
- Add a new product app: `npm run create-app <kebab-case-name>` → 在 `apps/<name>/` 開新 app

## Template Usage(Day 0 onboarding,fork user 必讀)

### Step 1 — Fork

**Owner setup once**(本 repo 擁有者):GitHub `Settings → General → Template repository ✓` 勾選 + `Settings → General → Danger Zone → Change visibility: Public`(讓 fork user 看到「Use this template」按鈕)。

**Fork user**:GitHub「Use this template」按鈕 → Create new repo from template。或:`git clone <this-repo>` + `git remote set-url origin <your-new-repo>`。

### Step 2 — npm install(治理本體隨 npm 落地)

```bash
npm install   # 拉 @qijenchen/design-system + storybook-config;
              # 治理本體(fork hooks + 設計紀律 preamble + 接線骨架)隨 npm 落地
              # node_modules/@qijenchen/design-system/ds-canonical/fork/
```

postinstall 會印一行 notice 確認治理本體就位(或缺時提示——**不需 /plugin install**)。

### Step 3 — 開 Claude Code session → 治理自動生效

committed `.claude/settings.json` 的 hook 自動 fire(全環境含雲端,已實證):
- **SessionStart**:注入 npm-current 設計紀律 preamble(寫產品 code 前主動遵循)+ dispatcher 跑官方治理 + bootstrap(雲端 fresh-clone 缺本體時自動 `npm install @beta`)。
- **PreToolUse / PostToolUse**:編輯被官方 fork hook 機械把關(手刻 table / 硬寫間距色值 / 誤用 primitive 被擋)。

不需 `/plugin install`、不需 `@import`、不需 path-scoped rules(那幾個官方證實在雲端不可靠)。

### Step 4 — Spawn your first product app

```bash
npm run create-app order-dashboard   # 在 apps/order-dashboard/ 開新 app
npm install                          # ← 必跑:重新 link workspace symlinks 讓新 app 拿 DS deps
cd apps/order-dashboard
npm run dev                          # localhost vite 啟動
```

**為何 `npm run create-app` 後要再跑 `npm install`?** npm workspaces 在新增 workspace dir 後需重新 `npm install` 才能把 `@qijenchen/design-system` symlink 到 `apps/order-dashboard/node_modules/`。漏跑 → vite 起來抓不到 DS package。

Storybook root config `.storybook/main.ts` 自動 glob `apps/**/*.stories.tsx`,**每加新 app stories 自動現身 storybook**,不用手動 register。

### Step 5 — Setup Netlify(自動 site + 免費密碼,3 分鐘)

```bash
npm run setup:netlify   # 自動:CLI install + GitHub OAuth login + site 建 + 連 repo
                        # 最後印 dashboard URL + 教你 30 秒設 STORYBOOK_BASIC_AUTH env var
```

**為何要密碼?** Storybook 含內部 product UI,Netlify deploy 預設公開,要擋陌生人。**免費做法 = Netlify Edge Function 自做 HTTP Basic Auth**(Edge Functions 免費方案可用、`.netlify.app` 預設網址直接生效、無需自訂網域,瀏覽器原生帳密彈窗)。本 template 已內建:`netlify/edge-functions/basic-auth.ts` 讀 Authorization header、比對 Netlify env var `STORYBOOK_BASIC_AUTH`(格式 `user:password`,多組空格分隔),缺/錯回 401 + WWW-Authenticate;`netlify.toml` 已 wire `[[edge_functions]]` path="/*";未設 env var = 站台公開(pass-through)。

> Netlify 內建密碼 —— Dashboard 的「Password protection / Basic protection」(Site settings → Access & security)**與** `_headers` 的 Basic-Auth header —— **兩個都是 Pro 方案專屬**($20/mo,官方 docs + support forum 證實;且 `_headers` basic-auth 不套用到 edge function),free-tier 都沒有——所以免費路徑走上面的 edge function,不走 dashboard、也不靠 `_headers`。

**fork user 設定(30 秒,免費)**:Netlify → Site configuration → Environment variables → 加 `STORYBOOK_BASIC_AUTH` = `user:password` → 下次 deploy(push main / Trigger deploy)站台自動跳帳密彈窗。密碼只存 Netlify 後台 env var,**不進 public repo**。

### Step 6 — 預覽 → 確認 → 上線

**不用為了看而手動 push**:AI 做完一段會**自動推草稿分支** → Netlify 出**草稿預覽網址**(治理 hook 在 push 後自動把連結吐進 Claude reply;此 hook 經 **npm 治理 corpus**〔`ds-canonical/fork`〕送達,非直接 committed 在 `.claude/hooks/`)。你看 OK → 說「push / 合 main」→ AI 合併 main → **正式站(密碼保護)rebuild**。

```bash
# 你只在「確認上正式」時做(或讓 AI 代勞):
git push origin main   # → Netlify production rebuild
```

> 草稿預覽需 Netlify「branch deploys」啟用(`npm run setup:netlify` 設定;或後台開「Deploy all branches」)。詳套件內 CLAUDE.md「🚦 預覽 → 確認 → 上線」段。

### Step 7 — Keep 治理 + npm deps 永遠最新(auto-sync chain)

DS repo 任何 push main → fork repo 自動同步,不偏移。兩層都同步:

**內容層(hook 邏輯 / 設計紀律 preamble / manifest)——自動**:
- DS bump version + tag push → `release.yml` npm publish → `repository_dispatch ds-published`
- DS push main(non-version SSOT change)→ `ssot-sync-dispatch.yml` → `repository_dispatch ds-ssot-changed`
- 本 repo `.github/workflows/sync-design-system.yml` 收 event → `npm install @qijenchen/*@^version --save` + commit + push
- Netlify auto rebuild → DataTable / 全 token / 全 component / 設計紀律永遠最新

**接線骨架層(settings.json hooks 區塊 + 3 個啟動器)——一個指令**:

```bash
npm run sync-all   # npm install @beta(內容層最新)+ 從 npm idempotent 刷新接線骨架
```

`sync-all` 純 npm(不需 `claude plugin` 指令)。骨架刷新帶 `.github/no-governance-sync` opt-out、不 clobber 你自有的非治理 hook。改完 **restart Claude Code session** 才 apply。

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
│   ├── sync-all.mjs            ← 一鍵同步治理(npm + 接線骨架)
│   ├── refresh-fork-launchers.mjs ← sync-all 用:從 npm 刷新接線骨架
│   └── lint-ds-internal-imports.mjs  ← Guard against importing DS internals
├── .claude/
│   ├── settings.json           ← C-prime committed 治理(dispatcher hooks + fail-open bootstrap)
│   └── hooks/                  ← 3 個極穩定啟動器(bootstrap / dispatcher / inject preamble)
├── .storybook/                 ← Shared Storybook config (imports @qijenchen/storybook-config)
├── netlify/
│   └── edge-functions/
│       └── basic-auth.ts       ← FREE HTTP Basic Auth (reads STORYBOOK_BASIC_AUTH env var)
├── netlify.toml                ← build storybook-static + wire edge function + SEO headers
├── .github/
│   ├── CODEOWNERS              ← Code review routing
│   └── workflows/
│       ├── audit.yml           ← tsc + lint + build per push/PR
│       └── sync-design-system.yml ← Dependabot + DS 版本同步(repository_dispatch)
├── package.json                ← workspaces + DS deps
├── tsconfig.json               ← Base TS config (apps extend)
└── README.md                   ← You are here
```

## 治理怎麼到你手上(C-prime,免 plugin)

治理本體全在 npm 套件(`npm install` 覆蓋 = 官方控管、改不動);`.claude/` 只 commit 極穩定的啟動器:
- **事前主動指引** → committed SessionStart hook 讀 npm-current `ds-canonical/fork/preamble.md` 注入 context(可靠 + 最新 + 零 drift)。
- **機械強制** → committed dispatcher 跑 npm fork-corpus hook(轉發攔截)。
- **本體 SSOT** 全在 npm;`npm run sync-all` 更到最新。

詳細在套件內 `CLAUDE.md`「🧭 治理怎麼到你手上」段。

## Important rules(詳 node_modules/@qijenchen/design-system/CLAUDE.md)

- **Never modify** `node_modules/@qijenchen/design-system/`(含治理本體;要改 file PR 回 DS repo,本機改 npm install 會覆蓋)
- Import only from public surface: `@qijenchen/design-system` top barrel,`@qijenchen/design-system/styles/tokens`,`@qijenchen/design-system/hooks/<name>`
- Run `npm run lint:imports` before commit to catch internal-path leaks
- 寫某元件 UI 前先讀官方範例:`node_modules/@qijenchen/design-system/src/components/<Name>/<name>.stories.tsx` + `.spec.md`

## Cloud-dev paths(全雲端,3 條路選一條走)

**Path 1 — Claude Code 直連 repo(推薦,真正零地端依賴)**:在 claude.ai/code(或 Claude 桌面 / VS Code extension)直接連你的 GitHub fork repo;Claude 把 repo clone 進 ephemeral sandbox,committed 治理 hook + npm + git ops 在 sandbox 內跑。雲端 fresh-clone 沒 node_modules → SessionStart bootstrap 自動 `npm install @beta` 啟用治理。寫完 commit / push 回 GitHub。**這是 user 目前實際工作流**;不需 Codespaces 也不需本地 IDE。

**Path 2 — GitHub Codespaces(`.devcontainer/` 已配)**:fork repo → `<> Code → Codespaces → Create codespace on main` → container 自動裝 Node 22 + gh CLI + jq + `@anthropic-ai/claude-code` + `netlify-cli` + `npm install`(via `postCreateCommand`)。免費 60h/月。

**Path 3 — 本地**:`git clone` + `npm install` + `claude`(本地 macOS/Linux/WSL)。

**3 path 共通上工步驟**(無論 sandbox / Codespaces / 本地):
```bash
npm install                 # ① 拉 DS + 治理本體(雲端由 bootstrap 自動跑)
claude                      # ② 啟動 Claude Code → committed 治理 hook 自動生效(免 /plugin install)
npm run setup:netlify       # ③ Netlify OAuth + 印 dashboard URL
# Netlify Dashboard → Environment variables → 加 STORYBOOK_BASIC_AUTH=user:password(免費上密碼)
```

Deploy URL 在 push 後 committed hook `inject_deploy_url_after_push.sh` 自動 inject 進 Claude reply(`https://<branch>--<owner>-<repo>.netlify.app` 推導 + curl 200 verify + Storybook content sniff)。

## Storybook deploy(無需 GitHub secret)

**Step 1 — Connect Netlify**:
1. Netlify Dashboard → **Add new project** → 連 fork 後的 `ds-product-template` repo
2. Netlify 自動讀根目錄 `netlify.toml` → build `storybook-static` → deploy
3. 每次 push main → Netlify auto rebuild。Per-branch preview 自動啟用。

**Step 2 — 🔒 設 STORYBOOK_BASIC_AUTH 上密碼**(免費,Edge Functions 免費方案可用):

免費的 access control = **Netlify Edge Function 自做 HTTP Basic Auth**(edge 層擋,瀏覽器原生帳密彈窗)。本 template 已內建:`netlify/edge-functions/basic-auth.ts` 讀 Authorization header、比對 Netlify env var `STORYBOOK_BASIC_AUTH`,缺/錯回 401;`netlify.toml` 已 wire `[[edge_functions]]` path="/*"。fork user 設定 30 秒:

1. Netlify → **Site configuration → Environment variables → Add a variable**
2. Key = `STORYBOOK_BASIC_AUTH`,Value = `user:password`(多組帳密空格分隔:`alice:pw1 bob:pw2`)
3. 下次 deploy(push main / Trigger deploy)→ 站台自動跳帳密彈窗。把 site URL + 帳密私訊 stakeholder(team Slack / DM)

> 密碼只存 Netlify 後台 env var,**不進 public repo**(public repo 不能 commit 明文帳密);未設 env var = 站台公開(pass-through)。

**為何不走 Dashboard 的 Password Protection?**(2026-06-05 官方 docs + support forum 三重證實):
- ❌ **Dashboard「Password protection / Basic protection」**(Site settings → Access & security)= **Pro 方案專屬**($20/mo);free-tier 沒這個開關,按下去會被要求升級付費
- ❌ **`_headers` 的 Basic-Auth header** = 同樣 **Pro 方案專屬**($20/mo);且官方限制頁載明 `_headers` basic-auth **不會套用到 edge function**——免費寫進 `_headers` 不會生效
- ❌ **Identity** = 完整 signup/login 系統(要自己接 login UI widget),對「上個簡單密碼」是 overkill
- ✅ **`STORYBOOK_BASIC_AUTH` env var → Edge Function `netlify/edge-functions/basic-auth.ts`** = 免費、`.netlify.app` 預設網址直接生效、無需自訂網域,本 template 已內建

**Defense-in-depth**(`netlify.toml` 已 ship):X-Robots-Tag noindex(搜尋引擎不收錄 URL)+ Referrer strict-origin + X-Frame SAMEORIGIN — 只防 SEO 索引,不擋直接訪問;**真實擋人**靠上面的 `STORYBOOK_BASIC_AUTH` Edge Function Basic Auth 那一層。

**要更好體驗才升級**(非必須):
- 升 **Netlify Pro** $20/mo → Dashboard Password Protection(美化密碼頁、可只擋 deploy preview 放行 production、團隊登入)
- 自架 **Cloudflare Access**(免費 50 user 真 SSO;需在 Netlify 前架 Cloudflare proxy,setup 較複雜)
- 公開 site,只防 SEO(`X-Robots-Tag noindex`)— 若 stakeholder 不介意 URL 知道就能看

### Workflow 機制總覽

本 repo `.github/workflows/` 實際只有 2 個 workflow,deploy 不走 GitHub Actions:

| 機制 | 觸發 | 做什麼 |
|---|---|---|
| `audit.yml` | push / PR | tsc + `lint:imports` + build CI gate |
| `sync-design-system.yml` | Dependabot daily + `repository_dispatch`(DS release/SSOT change)| `npm install @qijenchen/*@^version --save` + commit + push,讓 DS deps + 治理永遠最新 |
| `netlify.toml`(Netlify Git integration)| push main / per-branch | build `storybook-static` → deploy(無需 GitHub secret)|

Storybook(含真實 product UI demo)透過 `netlify.toml` 的 Netlify Git integration 直接 deploy,push main 即 auto rebuild;不需要 `NETLIFY_AUTH_TOKEN` / site ID secret。

完整 step-by-step 詳 `docs/01-first-time-setup.md`。

## License

UNLICENSED — internal use only.

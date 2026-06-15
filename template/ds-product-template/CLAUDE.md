# Product Workspace — Claude Code Instructions

## 🚨 4 件 critical 事(fork user 必做才能 SSOT 對齊 DS)

per 2026-05-27 user verbatim「fork template 必須要能跟 ds repo 完全 ssot 一模一樣」+ 完整 hook chain audit:

1. **`npm run sync-all`** — 1 命令 sync npm + plugin marketplace + plugin install(取代之前 3 個跨環境命令)。**DS 拿掉 daily cron,fork user 必主動跑**
2. **Restart Claude Code session** — sync-all 完後必 restart(plugin/addon 改動 SDK 限制需 restart 才 apply)
3. **不亂加 escape markers** — `@ds-misuse-allow / @story-baseline-allow / @consumer-catalog-allow / @overlay-open-skip / @template-customized / @layout-space-magic-ok / @story-trait-allow / @story-trait-rationale / @story-split-rationale / @story-name-canonical-allow / @propose-cite-skip / @anatomy-exempt / @anatomy-exempt-next / @benchmark-unverified / @benchmark-citation-allow / @benchmark-unverified-blanket`。Hook `check_escape_marker_abuse.sh` 攔 ≥3 distinct OR ≥5 total 同 file
4. **走 DS primitive composition** — 不自寫 `<MyButton>` widget bypass(hook `check_consumer_ds_primitive_misuse` + `check_consumer_no_ds_catalog` 攔)

跑完 4 條件 = SSOT 設計原則 100% 對齊 DS;若不跑 chain 會 degrade gracefully(hook 攔 anti-pattern,不靜默 drift)。

---

## 🛑 第 −1 步:Plugin install BLOCKER(2026-05-26 anchor — 沒裝 = 視覺跑版 + AI 憑記憶寫 mock)

**Claude 開啟本 repo 第一件事(沒裝 plugin 不准動 production code)**:

```bash
/plugin marketplace add github:ajenchen/design-system
/plugin install design-system@qijenchen-ds
```

> **2026-05-30 機械強制**:本規則現由 fork 自帶(不依賴 plugin)的 bootstrap hook 落地 —— `.claude/hooks/check_plugin_bootstrap.sh`(SessionStart 每 session 提醒)+ `block_production_edit_without_plugin.sh`(PreToolUse **硬攔** `apps/**` production edit,沒裝 plugin 直接 BLOCK)。補「plugin 硬 hook 隨 plugin 才裝」的 chicken-egg。極罕見純 prototype 才用 escape `CLAUDE_BYPASS_PLUGIN_BOOTSTRAP=1`。

**之後同步用**:`npm run sync-all`(per critical step 1)。

**沒裝後果**(2026-05-26 anchor case):
- 52 個 DS governance hooks 全部不 fire(M29 anchor preflight / approval-preflight / SSOT propagation 全失效)
- AI 寫 `apps/template/src/App.tsx` 憑記憶寫 simplified mock(漏 SidebarTrigger / collapsible / startIcon / tooltip / footer)
- 視覺直接跑版 + 互動破損(menu toggle 不見 / sidebar 收不起來)

**自動 detect**:`npm install` 後跑 `scripts/check-plugin-installed.mjs` 印紅色 warning(不 exit 1 避免擋 CI);DS-side SessionStart hook `check_fork_user_plugin_install.sh` 二次攔截(plugin 裝完後自帶)。

---

## 🚨 第 0 步:Cross-load DS canonical(Claude 開啟本 repo 第二件事必做)

**Why**:本 repo 消費 `@qijenchen/design-system`。DS 設計原則 / M-rules / spec / rules / references 是 **SSOT 在 DS repo**,隨 npm package 自動 ship 到本地 `node_modules/`,**但 Claude 不會自動 cross-load**。

**Claude 開啟本 repo 第一件事(必執行,不可跳)**:

```bash
# Read DS canonical(SSOT,every session)
@node_modules/@qijenchen/design-system/CLAUDE.md
@node_modules/@qijenchen/design-system/ds-canonical/rules/meta-patterns.md
```

Plus on-demand 讀 `ds-canonical/` 內:
- `rules/` — 31 M-rules + ui-development / spec-rules / story-rules / self-verify
- `references/` — naming-conventions / ssot-consultation / tailwind-gotchas / props-naming 等 SSOT lookup tables
- `skills/` — 22 skills(/prototype / /component-quality-gate / /codify-corrections 等)— via plugin install 也 expose

### 🧩 寫某元件 UI 前必讀:DS 官方範例(stories)= 最新最正確的設計參考

**重要**:DS npm 套件**已 ship 全部元件範例原始碼**到 `node_modules/@qijenchen/design-system/src/`(含全部 197 支 `.stories.tsx` + 同元件 `.spec.md`,**含 internal 元件**)。寫某元件 UI 前 / 不確定 composition 怎麼排時,**先讀對應元件的 stories 看官方真實寫法**,不要憑記憶寫 simplified mock(憑記憶寫 = 漏 slot / 漏 prop / 視覺跑版的根因):

```bash
# 看某元件官方 composition 範例(取代 Figma inspect / 憑印象):
@node_modules/@qijenchen/design-system/src/components/<Name>/<name>.stories.tsx
@node_modules/@qijenchen/design-system/src/components/<Name>/<name>.spec.md          # 何時用 / variant / size / 設計原則
# pattern 同理:src/patterns/<name>/<name>.stories.tsx
# 全範例索引:@node_modules/@qijenchen/design-system/ds-story-manifest.json(62 元件 / 914 story id)
```

範例隨 `npm install @qijenchen/design-system@beta`(或 `sync-all` / Dependabot)自動更新到最新 = 天然 SSOT、不 drift。本 repo 自己的 Storybook 只放 product 範例(`apps/**`),DS 元件範例**不在本 repo render**,看 rendered 版到 DS 部署的 Storybook(<https://ajenchen-design-system.netlify.app/>);**AI 取設計參考則直接讀上面 node_modules 的 source**(雲端 sandbox 讀 source 比開網頁可靠)。

→ **DS canonical 永遠是 SSOT,本 repo 規則只 extend / override consumer-specific 部分**。

---

## 🚀 Fork-and-go onboarding(Claude 自動執行流程)

Fork 本 repo 後,user 用 Claude 開啟,Claude **必依以下順序**做 painless onboarding:

| Step | Action | Why |
|---|---|---|
| 0 | Cross-load DS canonical(見上)| 拿 design SSOT |
| 1 | `npm install` | 拉 `@qijenchen/design-system` + `@qijenchen/storybook-config` npm deps + DS canonical 隨 npm 落地 |
| 2 | `/plugin marketplace add github:ajenchen/design-system` | 拿 DS governance plugin(22 skills / 52 hooks 自動下載) |
| 3 | `/plugin install design-system@qijenchen-ds` | 啟動 plugin |
| 4 | `npm run setup:netlify` | Netlify CLI install + login + site 建 + 連 repo;最後印 dashboard URL + 教 fork user 在 Netlify 設 `STORYBOOK_BASIC_AUTH` env var(`user:password`)→ Edge Function `netlify/edge-functions/basic-auth.ts` 在 edge 層做 HTTP Basic Auth 上密碼(免費,Edge Functions 所有方案含 free-tier 可用)。Dashboard 的 Password protection 與 `_headers` Basic-Auth 都是 Pro 專屬($20/mo),非必須 |
| 5 | `npm run create-app <new-app-name>`(若需新 product app) | copy `template/` → 新 app folder |
| 6 | `npm run storybook` 本地 verify | 確認 DS components 視覺正確 |
| 7 | Push main → Netlify auto-deploy + Storybook auto-rebuild | done |

---

## 🔄 Daily dev workflow(SSOT auto-sync)

| 事件 | 自動發生什麼 |
|---|---|
| DS publish 新 beta | Dependabot daily(`.github/dependabot.yml`)+ `sync-design-system.yml` repository_dispatch → 本 repo 自動 bump deps + commit |
| Plugin / skills / hooks 更新 | User 偶爾跑 `/plugin marketplace update` 拿最新 |
| 你寫 product code | Plugin hooks 自動 enforce SSOT(import DS internals 攔截 / canonical drift 警告 / story 規範等) |
| Push main | `audit.yml` tsc + lint:imports + build / apps + Storybook 經 `netlify.toml`(Netlify Git integration)auto-rebuild |

---

## 📐 Consumer canonical(本 repo specific)

1. **禁** import DS internals(`@qijenchen/design-system/src/...` or `/dist/...`)— 用 public surface only。Hook + `npm run lint:imports` 攔。
2. **禁** 修 `node_modules/@qijenchen/design-system/` — 有需求 file PR 回 DS repo,不在 product workspace fork。
3. 每新 app(`npm run create-app <name>`)務必走 `template/`(已配 AppShell + Sidebar + globals.css + storybook 標準 import)。
4. App-level CSS 只 extend / override,**不重寫** DS tokens(`--color-*` / `--space-*` 等)。
5. **App.tsx 起點走 AppShell + Sidebar**,不從孤立 Button 開始(per `template` 範例)。

---

## 📚 Storybook 用途分工

- **DS repo Storybook**(<https://ajenchen-design-system.netlify.app/>)= DS library 元件 reference docs(public 或 password protected by DS owner)
- **本 repo Storybook**(Netlify deploy,HTTP Basic Auth via Edge Function 保護)= **真實 product UI demo**(PM / designer / QA 看業務情境)
- Stories 寫 PRODUCT scenarios(不是 DS element trait grid)— DS trait grid 是 DS repo 責任

---

## 🔒 Access control — 免費 HTTP Basic Auth via Edge Function(2026-06-05 二修)

**Default(免費)= Netlify Edge Function 自做 HTTP Basic Auth**(本 template 內建,`netlify/edge-functions/basic-auth.ts`)。Edge Functions 所有方案含 free-tier 可用,`.netlify.app` 預設網址直接生效、無需自訂網域,edge 層擋,瀏覽器原生帳密彈窗。

**為何不是 Netlify 內建密碼(Dashboard Password Protection / `_headers` Basic-Auth)?**
- Netlify Dashboard 的「Password protection / Basic protection」(Site settings → Access & security)**與** `_headers` 裡的 Basic-Auth header — **兩個都是 Pro 方案專屬**($20/mo,官方 docs + support forum 2026-06-05 三重證實);**free-tier 都沒有**(這就是 fork user 卡住的原因)。官方限制頁另載明 `_headers` 的 basic-auth header **不會套用到 edge function**。
- 免費要真擋陌生人 → 用 Edge Function 自己實作 HTTP Basic Auth(讀 Authorization header → 比對 env var → 缺/錯回 401)。本 template 已內建。

**內建機制**:
- `netlify.toml` build command = `npm run build-storybook`,並 wire `[[edge_functions]]` path=`/*` function=`basic-auth`
- `netlify/edge-functions/basic-auth.ts` 在 edge 層讀 request 的 `Authorization` header,比對 Netlify env var `STORYBOOK_BASIC_AUTH`(格式 `user:password`,多組空格分隔 `"u1:p1 u2:p2"`);缺/錯 → 回 401 + `WWW-Authenticate`(瀏覽器原生帳密彈窗)。未設 env var = pass-through(站台公開)。
- **密碼不進 repo**(public repo 不能 commit 明文)— 只存 Netlify 後台 env var,edge 執行時讀取。

**fork user 設定(30 秒,免費)**:
1. `npm run setup:netlify` 自動跑 CLI install + login + site 建 + 連 repo(並印 dashboard URL)
2. Netlify → Site configuration → Environment variables → 加 `STORYBOOK_BASIC_AUTH` = `user:password`
3. 下次 deploy(push main / Trigger deploy)→ 站台自動跳帳密彈窗
4. 把 URL + 帳密私訊 stakeholder

**進階(要更好體驗才升級,非必須)**:
- **Pro Password Protection**($20/mo):dashboard 開關,美化密碼頁、可只擋 deploy preview 放行 production、團隊登入。
- **Cloudflare Access**(免費 50 user 真 SSO):需自訂網域 + 自架 Cloudflare proxy 在 Netlify 前面。

**`.storybook/manager-head.html`**:無需 client-side auth widget(Basic Auth 在 Netlify edge function 層擋)。

### 🆘 Claude 引導使用者 — Netlify onboarding(user 不一定知道 Netlify)

**當 user 卡在「不知道該怎麼設定 deploy / Netlify」時,Claude 必依以下話術引導**:

1. **解釋 Netlify 是什麼**(一句話):「Netlify 是免費 deploy 平台(類似 Vercel),用來自動跑 Storybook + 給 team 看內部 product UI。Free tier 100GB bandwidth / 0 maintenance」
2. **沒帳號?GitHub 1-click 自動建**:「fork 本 repo 必有 GitHub 帳號 → 跑 `npm run setup:netlify` 會開瀏覽器 OAuth → 點『Continue with GitHub』授權 → Netlify 自動建帳號(<5 秒)」
3. **設密碼(免費)= Netlify 後台加 1 個 env var**:「script 跑完印 dashboard URL。打開 Netlify → Site configuration → Environment variables → 加 `STORYBOOK_BASIC_AUTH` = `user:password`,下次 deploy 站台就自動跳帳密彈窗(30 秒)。免費 — 靠本 template 內建的 Edge Function(`netlify/edge-functions/basic-auth.ts`)在 edge 層擋,Edge Functions 所有方案含 free-tier 可用。Dashboard 那個 Password Protection 開關是 Pro 專屬($20/mo),不用碰。」
4. **防 SEO** 已自動:「`netlify.toml` 已 ship `X-Robots-Tag noindex`,Google 不收錄 URL。但**真擋陌生人靠上面 Edge Function 的 Basic Auth**,SEO header 只防搜尋引擎不防直接訪問」
5. **驗證 deploy 成功**:「push main 後 2-3 min,Netlify Dashboard `Deploys` tab 變綠勾 = OK。Site URL = `https://<site-name>.netlify.app`」
6. **GitHub CLI 未 login?**「Setup script Step 0 偵測 `gh auth status`;沒 login 建議先跑 `gh auth login`(瀏覽器 OAuth,1 分鐘)」
7. **Cloud-dev path**:「不想本地?GitHub Codespaces 跑得動(`<> Code → Codespaces → Create`),內裝 `npm i -g @anthropic-ai/claude-code` 後 governance 全 fire。免費 60h/月」

### 🚦 真實「斷點」清單(2026-05-29 verified)

| # | 斷點 | 可自動? | 為何 / 替代 |
|---|---|---|---|
| 1 | Plugin install slash command | ❌ Architecture | Postinstall warning 印 copy-paste,30 秒 |
| 2 | `netlify login` OAuth | ❌ OAuth security | 瀏覽器 click「Authorize」1 次 |
| 3 | `netlify init` site 建立 | ✅ **已自動**:`sites:create` + `link`,site name = `<gh-user>-<repo>` |
| 4 | **設密碼(免費 Edge Function)** | ⚠️ 半自動 | Edge Function Basic Auth 機制已內建;user 只需在 Netlify 後台加 1 個 env var `STORYBOOK_BASIC_AUTH`=`user:password`(30 秒),下次 deploy 自動生效 |
| 5 | 分享 password 給 stakeholder | ❌ 沒辦法自動 | Team chat / Slack DM 私訊 |
| 6 | Push main 觸發 production | ❌ **設計上 user gate**(Git solo-work canonical) | 不修 |

→ **真斷點剩 4 個**:plugin install(30 秒)+ OAuth(1 click)+ password 設(30 秒)+ password 分享(私訊)。Total 約 5 分鐘。

### 📋 Frictionless onboarding modes

**互動模式**(預設,本地 macOS):
```bash
npm install                      # postinstall warning
# (Claude session) /plugin marketplace add github:ajenchen/design-system
# (Claude session) /plugin install design-system@qijenchen-ds
npm run setup:netlify            # CLI + site + 印 dashboard URL
# Netlify 後台加 env var STORYBOOK_BASIC_AUTH=user:password → Edge Function basic-auth 下次 deploy 自動上密碼(免費)→ done
```

**Cloud-dev 模式**(3 path 選一):
- **Path 1 推薦** — Claude Code 直連 fork repo(sandbox 自動 clone + governance 跑):從 claude.ai/code 或 Claude 桌面新增 GitHub repo → sandbox 內直接 `claude` 跑 + `npm install` + 寫 code + push。**user 目前工作流,零地端**
- **Path 2** — GitHub Codespaces(`.devcontainer/` 已 ship):fork → Code → Codespaces → Create → container 自動裝齊
- **Path 3** — 本地 `git clone` + `npm install` + `claude`

**Claude DO NOT**:假設 user 已知 Netlify / 跳過 onboarding 直接寫 code / 沒解釋就要 user 跑 setup 命令 / 叫 user 去 Dashboard 開 Password Protection 當免費方案(那是 Pro 專屬 $20/mo,免費請走 `STORYBOOK_BASIC_AUTH` env var → Edge Function `basic-auth`)/ 講「`_headers` Basic-Auth 免費」「Dashboard Basic Password 免費 / 是 free-tier 唯一可用 / 唯一真擋陌生人的方法」(全錯;`_headers` Basic-Auth 與 Dashboard Password 都是 Pro $20/mo,免費是 Edge Function Basic Auth)/ 講 build-time 注入 `_headers` 或 `inject-basic-auth.mjs`(該機制已刪,改 edge function)/ 推薦 Netlify Identity 當簡單密碼方案(它是完整 signup/login 系統,對「Storybook 上個密碼」overkill;另注:2026-02 官方已撤回 Identity 的 deprecate,**別再講它「已 deprecated」**那是過期錯誤資訊)。

---

## ✅ Compliance check(永遠合規 + 永遠 SSOT 機制)

Plugin install 後自動執行的合規 gate(逐 phase):

| Phase | Gate | 自動 trigger |
|---|---|---|
| Edit time | Hook `check_substantive_edit_approval_preflight.sh` | Pre-write 攔 SSOT-affecting edit 需 user approval |
| Edit time | Hook `check_canonical_propagation.sh` / `auto_regen_ds_barrel.sh` | 偵 import / canonical drift |
| Pre-commit | `audit-content-quality.mjs` | DS spec 一致性 |
| CI(push)| `audit.yml` tsc + lint:imports + build | 攔語法 / 邊界 |
| Pre-deploy | Storybook smoke + visual baseline(via DS repo CI) | 視覺 drift |
| 季度 / 大改 | `/design-system-audit --deep` skill | 88 dim 全掃 |

→ **Claude 寫 code 時 plugin hooks 自動 fire,user 不必每次提醒,違規 = 立即 BLOCKER**。

---

## 🗂 Task navigation

| 任務 | 走法 |
|------|-------|
| 建新 product UI / 開新 page | `/prototype` skill(走 DS plugin)|
| 元件用法問題 | DS Storybook URL OR `node_modules/@qijenchen/design-system/dist/index.d.ts` types |
| App 完成要 ship | `/component-quality-gate` skill → review → push main |
| Bug fix | 查 DS spec(`ds-canonical/`)+ grep 本 repo apps/* 既有用法,**不發明新 pattern** |
| 新 product | `npm run create-app <name>` |
| 升 DS 版本 | Dependabot auto-PR / `npm update @qijenchen/design-system` |

---

## Stack

Vite + React 19 + TypeScript + Tailwind v4 + Storybook 8.6 + `@qijenchen/design-system@beta`.

## CI

- `audit.yml` — tsc + lint:imports + build per push/PR
- `netlify.toml` — apps + Storybook Netlify Git integration(無需 secret,直接讀 build command + access headers)— 無獨立 `deploy.yml` workflow,deploy 全經 Netlify Git integration
- `sync-design-system.yml` — Dependabot daily + repository_dispatch(DS release 自動 bump deps)

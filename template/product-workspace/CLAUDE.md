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

**之後同步用**:`npm run sync-all`(per critical step 1)。

**沒裝後果**(2026-05-26 anchor case):
- 59 個 DS governance hooks 全部不 fire(M29 anchor preflight / approval-preflight / SSOT propagation 全失效)
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

→ **DS canonical 永遠是 SSOT,本 repo 規則只 extend / override consumer-specific 部分**。

---

## 🚀 Fork-and-go onboarding(Claude 自動執行流程)

Fork 本 repo 後,user 用 Claude 開啟,Claude **必依以下順序**做 painless onboarding:

| Step | Action | Why |
|---|---|---|
| 0 | Cross-load DS canonical(見上)| 拿 design SSOT |
| 1 | `npm install` | 拉 `@qijenchen/design-system` + `@qijenchen/storybook-config` npm deps + DS canonical 隨 npm 落地 |
| 2 | `/plugin marketplace add github:ajenchen/design-system` | 拿 DS governance plugin(22 skills / 59 hooks 自動下載) |
| 3 | `/plugin install design-system@qijenchen-ds` | 啟動 plugin |
| 4 | `npm run setup:netlify` | Netlify CLI install + login + site 建 + 連 repo;最後印 dashboard URL + Basic Password 設定指引(2026-05-29 改:Identity deprecated;Basic Password 是 free-tier 唯一可用 access control)|
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
| Push main | `audit.yml` tsc + lint:imports + build / `deploy.yml` apps Netlify / Storybook netlify.toml auto-rebuild |

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
- **本 repo Storybook**(Netlify deploy,Basic Password protected)= **真實 product UI demo**(PM / designer / QA 看業務情境)
- Stories 寫 PRODUCT scenarios(不是 DS element trait grid)— DS trait grid 是 DS repo 責任

---

## 🔒 Access control — Basic Password(2026-05-29 改 from Identity)

**Default = Netlify Basic Password**(free-tier 唯一可用 access control,共用 password)。

**為何不是 Identity?**
- Netlify 2024 公告 Identity **deprecated**,新帳號可能看不到 Identity menu
- Team protection 🔒 鎖,要 Pro plan $19/mo
- → Basic Password 是 free-tier 真實可用方案

**設定流程**:
1. `npm run setup:netlify` 自動跑 CLI install + login + site 建 + 連 repo
2. Script 跑完印 dashboard URL → 跟著做 2 step 設 password(30 秒)
3. 把 URL + password 私訊 stakeholder

**手動 dashboard 步驟**(script 印出):
- 打開 `https://app.netlify.com/projects/<site>/configuration/visitor-access`
- **Password Protection** → 「**Basic protection**」→ 輸 password → **Save**

**`.storybook/manager-head.html`**:Identity widget 已移除(Basic Password 在 Netlify edge 層擋,client widget 不需要)。

### 🆘 Claude 引導使用者 — Netlify onboarding(user 不一定知道 Netlify)

**當 user 卡在「不知道該怎麼設定 deploy / Netlify」時,Claude 必依以下話術引導**:

1. **解釋 Netlify 是什麼**(一句話):「Netlify 是免費 deploy 平台(類似 Vercel),用來自動跑 Storybook + 給 team 看內部 product UI。Free tier 100GB bandwidth / 0 maintenance」
2. **沒帳號?GitHub 1-click 自動建**:「fork 本 repo 必有 GitHub 帳號 → 跑 `npm run setup:netlify` 會開瀏覽器 OAuth → 點『Continue with GitHub』授權 → Netlify 自動建帳號(<5 秒)」
3. **設 Basic Password** 不在 CLI 範圍:「script 跑完印 dashboard URL,你打開連結點 2 個 radio button 輸 password 即可(30 秒)。Netlify CLI 沒提供 password protection 的 API(2026-05-29 verified),只能手動。」
4. **防 SEO** 已自動:「`netlify.toml` 已 ship `X-Robots-Tag noindex`,Google 不收錄 URL。但**真擋陌生人靠 password**,SEO header 只防搜尋引擎不防直接訪問」
5. **驗證 deploy 成功**:「push main 後 2-3 min,Netlify Dashboard `Deploys` tab 變綠勾 = OK。Site URL = `https://<site-name>.netlify.app`」
6. **GitHub CLI 未 login?**「Setup script Step 0 偵測 `gh auth status`;沒 login 建議先跑 `gh auth login`(瀏覽器 OAuth,1 分鐘)」
7. **Cloud-dev path**:「不想本地?GitHub Codespaces 跑得動(`<> Code → Codespaces → Create`),內裝 `npm i -g @anthropic-ai/claude-code` 後 governance 全 fire。免費 60h/月」

### 🚦 真實「斷點」清單(2026-05-29 verified)

| # | 斷點 | 可自動? | 為何 / 替代 |
|---|---|---|---|
| 1 | Plugin install slash command | ❌ Architecture | Postinstall warning 印 copy-paste,30 秒 |
| 2 | `netlify login` OAuth | ❌ OAuth security | 瀏覽器 click「Authorize」1 次 |
| 3 | `netlify init` site 建立 | ✅ **已自動**:`sites:create` + `link`,site name = `<gh-user>-<repo>` |
| 4 | **設 Basic Password** | ❌ **Netlify CLI 沒提供 password API**(2026-05-29 verified) | Script 印 dashboard URL,user 點 2 radio button + 輸 password + Save(30 秒) |
| 5 | 分享 password 給 stakeholder | ❌ 沒辦法自動 | Team chat / Slack DM 私訊 |
| 6 | Push main 觸發 production | ❌ **設計上 user gate**(Git solo-work canonical) | 不修 |

→ **真斷點剩 4 個**:plugin install(30 秒)+ OAuth(1 click)+ password 設(30 秒)+ password 分享(私訊)。Total 約 5 分鐘。

### 📋 Frictionless onboarding modes

**互動模式**(預設,本地 macOS):
```bash
npm install                      # postinstall warning
# (Claude session) /plugin marketplace add github:ajenchen/design-system
# (Claude session) /plugin install design-system@qijenchen-ds
npm run setup:netlify            # CLI + site + 印 password dashboard URL
# 開瀏覽器點 Save password → done
```

**Cloud-dev 模式**(3 path 選一):
- **Path 1 推薦** — Claude Code 直連 fork repo(sandbox 自動 clone + governance 跑):從 claude.ai/code 或 Claude 桌面新增 GitHub repo → sandbox 內直接 `claude` 跑 + `npm install` + 寫 code + push。**user 目前工作流,零地端**
- **Path 2** — GitHub Codespaces(`.devcontainer/` 已 ship):fork → Code → Codespaces → Create → container 自動裝齊
- **Path 3** — 本地 `git clone` + `npm install` + `claude`

**Claude DO NOT**:假設 user 已知 Netlify / 跳過 onboarding 直接寫 code / 沒解釋就要 user 跑 setup 命令 / 嘗試「fully headless password 設定」(Netlify CLI 不支援,做不到)/ 推薦 Identity(已 deprecated)。

---

## ✅ Compliance check(永遠合規 + 永遠 SSOT 機制)

Plugin install 後自動執行的合規 gate(逐 phase):

| Phase | Gate | 自動 trigger |
|---|---|---|
| Edit time | Hook `check_substantive_edit_approval_preflight.sh` | Pre-write 攔 SSOT-affecting edit 需 user approval |
| Edit time | Hook `check_ssot_consultation.sh` / `auto_regen_ds_barrel.sh` | 偵 import / canonical drift |
| Pre-commit | `audit-content-quality.mjs` | DS spec 一致性 |
| CI(push)| `audit.yml` tsc + lint:imports + build | 攔語法 / 邊界 |
| Pre-deploy | Storybook smoke + visual baseline(via DS repo CI) | 視覺 drift |
| 季度 / 大改 | `/design-system-audit --deep` skill | 82 dim 全掃 |

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
- `deploy.yml` — `apps/template/dist` per-app Netlify(需 NETLIFY_AUTH_TOKEN + NETLIFY_SITE_ID_TEMPLATE secrets)
- `netlify.toml` — Storybook Netlify Git integration(無需 secret,直接讀 build command + access headers)
- `sync-design-system.yml` — Dependabot daily + repository_dispatch(DS release 自動 bump deps)

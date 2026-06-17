# Product Workspace — Claude Code Instructions

> 本 repo 消費 `@qijenchen/design-system`(npm)做產品。**設計治理(item-anatomy / layout-space / 命名 / SSOT 消費 / 防手刻 primitive 等)由 C-prime committed-config 自動送達,不需裝 plugin**。本檔由 DS repo 生成(mirror),consumer-specific 部分可 extend,核心治理走 SSOT。

## 🚀 Onboarding(C-prime:fork → npm install → 治理自動生效,免 /plugin install)

| Step | Action | 為何 |
|---|---|---|
| 1 | `npm install`(或本機已裝跳過)| 拉 `@qijenchen/design-system` + `storybook-config`;**治理本體(fork hooks + 設計紀律 preamble)隨 npm 落地 `node_modules/.../ds-canonical/fork/`** |
| 2 | 開啟 Claude Code session | committed `.claude/settings.json` 的 hook 自動 fire(全環境含雲端,已實證):**SessionStart 注入 npm-current 設計紀律 + dispatcher 跑官方治理 + bootstrap 缺本體自動裝**。(skills slash command 非 C-prime 自動送達 — 見下方「治理怎麼到你手上」)|
| 3 | `npm run setup:netlify`(要 deploy 才需)| Netlify site + 密碼保護(見下)|
| 4 | `npm run create-app <name>`(要新 app)| 從 `apps/template/` 複製 |
| 5 | `npm run storybook` 本地 verify | 確認 DS 元件視覺正確 |
| 6 | Push main → Netlify auto-deploy | done |

> **雲端(claude.ai/code)**:每個 session 是 fresh clone(node_modules 不留)→ committed bootstrap 偵測缺本體會**自動 `npm install @beta`** 啟用治理。網路政策需可達 npm/github。
> **既有 fork adopt / 同步骨架**:跑 `npm run sync-all` 一鍵搞定——拉治理本體 **+ 從 npm idempotent 刷新接線骨架**(committed 啟動器 + settings.json hooks 區塊),帶 `.github/no-governance-sync` opt-out。所以 DS 改了接線層,fork 重跑 sync-all 就同步,不用手動 git-checkout。**(全新 fork 不需此步——骨架已隨模板 ship。唯一例外:C-prime 之前的舊 fork,自己的 sync-all 是舊版 → 先一次性從「模板種子 repo」`ajenchen/ds-product-template`〔不是 DS repo `ajenchen/design-system`,那會 dump 一整套 DS-author corpus〕取新 scaffold:`git remote add ds-template https://github.com/ajenchen/ds-product-template.git && git fetch ds-template && git checkout ds-template/main -- scripts .claude`,之後 `npm run sync-all` 自我維護〔含移除舊 plugin-era hook 防 brick〕。)**

## 🧭 治理怎麼到你手上(C-prime 多軌,皆 committed 隨 repo 走)
- **事前主動指引**(寫產品 code 前就遵循 item-anatomy/layout-space/命名/SSOT 消費/4-family)→ committed SessionStart hook `inject_fork_governance_preamble.sh` 讀 npm-current `ds-canonical/fork/preamble.md` 注入 context。**可靠 + 最新 + 零 drift**(非 @import / 非 path-scoped rules,那兩個官方證實不可靠)。
- **機械強制**(手刻 table / 硬寫間距色值 / 誤用 primitive 等被擋)→ committed `fork-governance-dispatcher.sh` 跑 npm fork-corpus hook(轉發攔截)。
- **Skills(slash command,如 `/prototype`)→ 非 C-prime 自動送達**:Claude Code 只從 `.claude/skills` / plugin 載入、**不認 node_modules**,且專案級 `enabledPlugins` 被官方靜默忽略(#62174)。要 slash command 需自行 commit 進 `.claude/skills/` 或裝 plugin。**但設計治理不靠 skills** — 事前指引(preamble)+ 機械強制(hooks)已涵蓋核心,skills 只是便利包裝。
- **本體 SSOT** 全在 npm(`npm install` 覆蓋 = 官方控管、改不動);`npm run sync-all` 更到最新。

### 🧩 寫某元件 UI 前必讀:DS 官方範例(stories)
DS npm 套件已 ship 全部元件範例原始碼到 `node_modules/@qijenchen/design-system/src/`(197 `.stories.tsx` + `.spec.md`)。寫 UI 前/不確定 composition 時,**先讀對應元件官方寫法**,不憑記憶寫 simplified mock(漏 slot/prop/視覺跑版的根因):
```
node_modules/@qijenchen/design-system/src/components/<Name>/<name>.stories.tsx   # 官方 composition
node_modules/@qijenchen/design-system/src/components/<Name>/<name>.spec.md        # 何時用 / variant / 設計原則
node_modules/@qijenchen/design-system/ds-story-manifest.json                     # 全範例索引
```
範例隨 `npm install @beta` / `sync-all` 自動最新 = 天然 SSOT。看 rendered 版到 DS 部署 Storybook(<https://ajenchen-design-system.netlify.app/>);取設計參考則直接讀上面 node_modules source(雲端可靠)。

## 📐 Consumer canonical
1. **禁** import DS internals(`@qijenchen/design-system/src/...` 或 `/dist/...`)— 用 public surface。`npm run lint:imports` 攔。
2. **禁** 修 `node_modules/@qijenchen/design-system/`(含治理本體)— 有需求 PR 回 DS repo。治理本體 npm 覆蓋,本機改無效。
3. 每新 app 走 `npm run create-app <name>`(已配 AppShell + Sidebar + globals.css + storybook 標準 import)。
4. App-level CSS 只 extend / override,**不重寫** DS token。
5. **App.tsx 起點走 AppShell + Sidebar**,不從孤立 Button 開始。
6. **不亂加 escape marker**(`@ds-misuse-allow` / `@story-baseline-allow` / `@layout-space-magic-ok` 等);hook `check_escape_marker_abuse` 攔 ≥3 distinct OR ≥5 total 同檔。

## 🔒 Access control — 免費 HTTP Basic Auth via Edge Function

**Default(免費)= Netlify Edge Function 自做 Basic Auth**(本 template 內建 `netlify/edge-functions/basic-auth.ts`)。Edge Functions 含 free-tier 可用。

**為何不是 Netlify 內建密碼?** Dashboard Password Protection 與 `_headers` Basic-Auth **都是 Pro $20/mo**;free-tier 沒有 → 免費要真擋陌生人就用 Edge Function。

**fork user 設定(30 秒,免費)**:
1. `npm run setup:netlify`(CLI install + login + site 建 + 連 repo + 印 dashboard URL)
2. Netlify → Site configuration → Environment variables → 加 `STORYBOOK_BASIC_AUTH` = `user:password`
3. 下次 deploy → 站台自動跳帳密彈窗。把 URL + 帳密私訊 stakeholder。

### 🆘 Claude 引導 Netlify onboarding(user 不熟 Netlify 時)
1. **Netlify 是什麼**:免費 deploy 平台(類 Vercel),自動跑 Storybook 給 team 看 product UI。
2. **沒帳號?**:`npm run setup:netlify` 開瀏覽器 GitHub OAuth → 自動建帳號。
3. **設密碼(免費)**:後台加 1 個 env var `STORYBOOK_BASIC_AUTH`=`user:password`(Edge Function 擋,免費)。**別**叫 user 開 Dashboard Password Protection(那是 Pro $20/mo);**別**講「`_headers` Basic-Auth 免費」(也是 Pro)。
4. **防 SEO** 已自動(`netlify.toml` ship `X-Robots-Tag noindex`)。
5. **驗證**:push main 後 2-3 min,Netlify Deploys tab 綠勾 = OK。
6. **Cloud-dev**:claude.ai/code 直連本 repo(sandbox 自動 clone + 治理自動跑)/ Codespaces(`.devcontainer` 已配)/ 本地 clone。

### 🚦 真實「斷點」清單
| # | 斷點 | 可自動? |
|---|---|---|
| 1 | `npm install`(取治理本體)| ✅ 雲端 bootstrap 自動 / 本地一行 |
| 2 | `netlify login` OAuth | ❌ OAuth 安全,瀏覽器 click 1 次 |
| 3 | 設密碼 env var | ⚠️ 半自動,後台加 1 var 30 秒 |
| 4 | 分享密碼給 stakeholder | ❌ 私訊 |
| 5 | Push main 觸發 production | ❌ 設計上 user gate |

→ 真斷點剩 ~3 個(OAuth click + 密碼設 + 密碼分享),約 3 分鐘。**治理本身零斷點**(committed + npm 自動)。

## 🚦 預覽 → 確認 → 上線(git 流程,fork 版;**不含** DS 發版鏈)

做產品的 git 節奏:
1. **AI 做完一段** → 自動 `commit` + `push` 一個**草稿分支**(working branch)→ Netlify 自動 build → **出一個草稿預覽網址**(committed deploy-url hook 在 push 後自動吐連結進 reply)。
2. **你看草稿**(不影響正式站)→ 要改就繼續講,AI 再推、預覽再更新。
3. **確認 OK** → 你說「push / 合 main」→ AI squash-merge 到 main → **正式站(密碼保護)更新**。
4. **只想看不想上線** → 停在草稿預覽即可。

**重點**:你**不用為了「看」而特別下令 push** —— AI 做完會自動推草稿分支出預覽;你的「push / OK」是**上正式站**的關卡(對齊 DS 的 user-gate 精神,但 fork 端**沒有** bump 版本 / tag / npm publish / GitHub Pages 那些)。

> ⚠️ 草稿預覽需 Netlify「branch deploys」啟用(`npm run setup:netlify` 會設定;或到 Netlify 後台開「Deploy all branches」)。未啟用時 → 改用 main 的密碼保護站當團隊預覽(push main → 團隊在唯一網址看,外人被密碼擋)。

## 🔄 Daily dev workflow
| 事件 | 自動發生 |
|---|---|
| DS publish 新 beta | Dependabot daily + `sync-design-system.yml` → 自動 bump deps + commit |
| 你想手動同步治理到最新 | `npm run sync-all`(`npm install @beta` → 治理本體最新 **+ idempotent 刷新接線骨架**〔啟動器 + settings hooks〕;重啟 session 生效)|
| 你寫 product code | committed 治理 hook 自動 enforce(注入指引 + 擋違規);違規 = 立即提示/BLOCKER |
| Push main | `audit.yml`(tsc + lint:imports + build)+ Netlify auto-rebuild |

## 📚 Storybook 用途
- **DS repo Storybook** = DS library 元件 reference。
- **本 repo Storybook** = 真實 product UI demo(PM/designer/QA 看業務情境);stories 寫 **product scenarios**(`Apps/<app-name>/...` namespace),非 DS trait grid。

## 🗂 Task navigation
| 任務 | 走法 |
|---|---|
| 建新 product UI / 開新 page | `/prototype`(committed skill)|
| 元件用法 | 讀 `node_modules/@qijenchen/design-system/src/<Name>/<name>.spec.md` + stories |
| App 完成要 ship | `/product-ui-audit` + `/delivery-handoff` → review → push main |
| Bug fix | 查 node_modules DS spec + grep 本 repo `apps/**` 既有用法,**不發明新 pattern** |
| 新 product | `npm run create-app <name>` |
| 升 DS 版本 | Dependabot auto-PR / `npm run sync-all` |

## Stack
Vite + React 19 + TypeScript + Tailwind v4 + Storybook 8.6 + `@qijenchen/design-system@beta`.

## CI
- `audit.yml` — tsc + lint:imports + build per push/PR
- `netlify.toml` — apps + Storybook 經 Netlify Git integration
- `sync-design-system.yml` — Dependabot daily + repository_dispatch(DS release 自動 bump)

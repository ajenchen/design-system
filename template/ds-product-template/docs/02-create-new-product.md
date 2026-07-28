# Create New Product App

從 template 生新 product app — 1 command, 自動 setup。

## Generator command

```
npm run create-app <kebab-case-name>
# Example: npm run create-app order-dashboard
```

行為(`scripts/create-app.mjs`,2026-05-28 全盤 sweep):
1. **Validate name**:kebab-case lowercase / 不可為 `template`(reserved) / 不可 duplicate
2. **Copy** `apps/template/` → `apps/<name>/`(filter callback 排除 `node_modules / dist / storybook-static / .turbo / .next / .cache / tsconfig.tsbuildinfo`)
3. **Patch `package.json`** name → `@product/<name>`
4. **Patch `index.html`** `<title>` → `<name>`
5. **Patch story titles** `*.stories.{tsx,ts,mdx}` 內 `title: 'Apps/template/...'` → `Apps/<name>/...`(防 Storybook duplicate id 與 template 衝突)
6. **REQUIRED file invariant check**:5 critical files(`package.json` / `tsconfig.json` / `vite.config.ts` / `index.html` / `src`)缺一 → error
7. **Safety-net rmSync**:filter 漏抓 dist / tsbuildinfo / storybook-static → 兜底清
8. **Print** Storybook + dev guidance(含 sidebar path `apps-<name>-...`)

## After generation

```
cd apps/<name>
npm run dev        # http://localhost:5173
npm run build      # production build to dist/
npm run typecheck  # tsc no-emit
```

## 第一個 component

`apps/<name>/src/App.tsx` 用 DS:

```tsx
import { Button, Avatar, TooltipProvider } from '@qijenchen/design-system'

export default function App() {
  return (
    <main className="bg-canvas text-foreground p-8">
      <h1 className="text-h2 mb-4">My Product</h1>
      <Button variant="primary">Save</Button>
      <Avatar name="Wendy" />
    </main>
  )
}
```

注意:
- **Top barrel import only**(`from '@qijenchen/design-system'`)
- 禁 import `/src/...`、`/dist/...` 內部路徑(`npm run lint:imports` CI gate 攔)
- 樣式 token(`bg-canvas` / `text-foreground` / `text-h2`)由 globals.css 引入的 DS tokens 提供

## Deploy(Dashboard 連線後自動,帳密不進 Git)

新 app 自動進 Storybook(`netlify.toml:14` `build.command = "npm run build-storybook"`)；變更經 required checks 與 review 後合併 PR 到 `main`，Netlify 便會自動 rebuild，可見於 `https://<your-netlify-site>/?path=/story/apps-<name>-...`。

**Fork user 第一次 setup**:
- `npm run setup:netlify` 只做唯讀診斷並列 Dashboard 步驟；它不安裝、不下載、不呼叫 Netlify CLI，也不自動登入或建站。看到 exit 2 / `MANUAL ACTION REQUIRED` 是預期的 fail-closed 狀態。
- 開啟 Netlify Dashboard → **Add new project → Import an existing project → GitHub** → 選擇目前 fork；確認它讀到 repo root `netlify.toml` 後按 Publish。連好 repo 後，push 才會觸發 continuous deployment。
- **加密碼(30 秒,免費)**:Netlify → Site configuration → Environment variables → 加 `STORYBOOK_BASIC_AUTH` = `user:password`(多組空格分隔 `"u1:p1 u2:p2"`；帳號／密碼皆不可空白或含空格)→ 下次 deploy 時 Edge Function `netlify/edge-functions/basic-auth.ts` 在 edge 層讀 `Authorization` header 比對此 env var。未設／格式錯誤回 503 fail closed；設定有效但帳密缺失／錯誤回 401 + `WWW-Authenticate`(瀏覽器跳原生帳密彈窗)；只有正確帳密才放行。`netlify.toml` 已 wire `[[edge_functions]]` path=`/*` function=`basic-auth`。**密碼只存 Netlify 後台 env var,不進 public repo**。Edge Function Basic Auth 是 Netlify 免費方案(含 free-tier)可用、`.netlify.app` 預設網址直接生效、無需自訂網域的 edge 層擋法(Netlify 內建密碼〔Dashboard Password Protection 與 `_headers` Basic-Auth〕都是 Pro $20/mo;`_headers` 的 basic-auth 也不套用到 edge function)
- 之後每次 PR 通過 required checks 並明確合併到 `main`，就會自動 build + deploy；執行 `npm run deploy-url` 可隨時取得目前網址。

> **要更好體驗才升級(非必須)**:Netlify Dashboard 的「Password protection / Basic protection」(Site settings → Access & security)是 **Pro 方案專屬**($20/mo)— 美化密碼頁、可只擋 deploy preview 放行 production;**free-tier 沒這開關**,按下去會被要求升 Pro。真 SSO 走 Cloudflare Access(免費 50 user,需自訂網域 + 自架 Cloudflare proxy 在 Netlify 前)。`netlify.toml` 的 `X-Robots-Tag noindex` 只防搜尋引擎索引,不擋直接訪問 → 真擋人靠上面的 `STORYBOOK_BASIC_AUTH` Edge Function Basic Auth。

**Per-app standalone deploy**(`apps/<name>/dist` 獨立 site)若需要,自建 `.github/workflows/<app>-deploy.yml` + Netlify secrets。但通常不用 — template Storybook 已統一展示所有 apps,沒必要 fragment deploy。

## 找 DS component 用法

- Storybook: https://ajenchen-design-system.netlify.app/
- 元件總覽 / 設計規格 / 設計原則 3 層 stories
- Claude session 跑 `/component-quality-gate` audit 你產品 UI 對 DS canonical 對齊度

## Next

→ `docs/03-co-edit-workflow.md` 多人共編 workflow

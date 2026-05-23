# 02 — Create new product

從零生新 product app。

## 一鍵 generator

```bash
npm run create-app order-dashboard
```

從 `apps/_template/` 複製 → `apps/order-dashboard/`,替換 `__APP_NAME__` / `__APP_PASCAL__` 佔位符。

## 預設結構

```
apps/order-dashboard/
├── package.json         (name: @qijenchen/order-dashboard,deps DS + react)
├── tsconfig.json
├── vite.config.ts
├── index.html
└── src/
    └── main.tsx         (entry,demo imports DS Button + Avatar)
```

## 開發

```bash
cd apps/order-dashboard
npm run dev               # http://localhost:5173
```

Claude session(workspace root)看到 apps/order-dashboard/ 後跟你共事。問 `Claude:幫我建一個列表頁` → 走 `/new-component` skill 流程,從 DS 找近親 → 寫元件 → 加 stories。

## 用 DS 元件

```tsx
import { Button, Avatar, DataTable } from '@qijenchen/design-system'
import '@qijenchen/design-system/styles/globals.css'  // 全 token

// 用即可,DS 自動處理 theme / density / a11y
```

## 用 Storybook(可選 per-app)

每 app 可有自己 stories,放 `apps/<name>/src/**/*.stories.tsx`。workspace root `.storybook/main.ts` 已 cover 全 apps glob。

## 部署

push 後 `.github/workflows/deploy.yml` 自動 detect `apps/*` 並 per-app Vercel deploy(matrix)。

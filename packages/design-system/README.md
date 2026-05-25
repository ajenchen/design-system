# @qijenchen/design-system

World-class design system — components, patterns, tokens, hooks (single source of truth for team distribution).

```bash
npm install @qijenchen/design-system
```

Tailwind v4 + React 18+ project required. License: UNLICENSED (internal use).

---

## Quick start(consumer side,完整 4 步驟)

新 consumer 跑通 Button + tokens 需要這 4 件,缺一不可:

### 1. CSS entry — 載 tokens(必要)

```css
/* globals.css (or main.css / src/index.css) */
@import 'tailwindcss';
@import '@qijenchen/design-system/styles/tokens';

/* 必要:讓 Tailwind v4 掃 DS 元件原始碼產生 utility class */
@source '../node_modules/@qijenchen/design-system/src/**/*.{js,ts,jsx,tsx}';
```

> ⚠️ **`@source` 不能省**。Tailwind v4 預設只掃 `src/**`,不掃 `node_modules`。沒這行,DS 元件內部用的 `h-field-md` / `bg-primary-hover` 等 class 不會被產出 → 元件看起來像沒套樣式(P0.2 of common-mistakes)。

### 2. App-level Provider(必要)

```tsx
// main.tsx / index.tsx
import { TooltipProvider } from '@qijenchen/design-system'

createRoot(document.getElementById('root')!).render(
  <TooltipProvider delayDuration={500} skipDelayDuration={300}>
    <App />
  </TooltipProvider>
)
```

> ⚠️ iconOnly Button 內建自動 tooltip,缺 `<TooltipProvider>` 會 warn + 部分元件 crash。

### 3. Sidebar context(僅用 Sidebar 時)

```tsx
import { SidebarProvider } from '@qijenchen/design-system'

<SidebarProvider activeId={currentRouteId} onSelect={setActiveId}>
  <Sidebar>...</Sidebar>
  <main>...</main>
</SidebarProvider>
```

> Sidebar 預設 active 樣式由 `SidebarProvider activeId` driven,**不用** `isActive` prop(會破壞 single-selection 行為)。

### 4. Dark mode(可選)

```html
<html data-theme="dark">
```

Token system 用 `data-theme="light"|"dark"` attribute 切換,非 class-based。

---

## 使用 component

```tsx
import { Button, Avatar, Dialog } from '@qijenchen/design-system'

<Button variant="primary">儲存</Button>
<Avatar name="Wendy" />
<Dialog>...</Dialog>
```

**只用 top barrel import**(對齊 Material UI canonical)。`./components/<Name>` subpath 目前未支援 — v1.0.0 stable 才會開啟(待 cross-component export name collision rename 完成)。

Tree-shake 透過 `sideEffects: ["**/*.css"]` 配置自動 work,unused JS 被 bundler 剝除。

---

## 字型(可選)

Token `--font-sans` stack = `Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", ...`。Roboto 沒附,如要載:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
```

無此載入時,fallback 到系統字(macOS = SF Pro,Windows = Segoe UI,Linux = sans-serif default)。

---

## Figma Make 相容性

直接走 Quick start 4 步。Figma Make 預設 React 19 + Tailwind v4 + Vite 跟 DS stack 對齊。

完整指南 → `docs/figma-make-setup.md`(本 repo)。

---

## Storybook(consumer 看 DS 元件用法)

- Production:**https://ajenchen.github.io/design-system/**
- 看每個元件的「展示」/「設計規格」/「設計原則」3 層 stories

---

## API contract / 公開 surface

| 路徑 | 內容 |
|---|---|
| `@qijenchen/design-system` | Top barrel — components / patterns / hooks / lib utilities |
| `@qijenchen/design-system/styles/tokens` | CSS aggregator(全 token + Tailwind `@theme inline`)|
| `@qijenchen/design-system/hooks/<name>` | 單一 hook subpath |
| `@qijenchen/design-system/tokens/<category>` | Token JS 模組(eg `motion`, `icon-size`)— CSS 透過 `styles/tokens` aggregator |

**禁** import:
- `@qijenchen/design-system/src/...`(internal source path,未來 SSOT 結構改會壞)
- `@qijenchen/design-system/dist/...`(internal build artifact,未來 build pipeline 改會壞)

---

## Compatibility matrix

| Dependency | Required version | Notes |
|---|---|---|
| `react` | `>= 18.0.0` | peer |
| `react-dom` | `>= 18.0.0` | peer |
| `tailwindcss` | `>= 4.0.0` | peer,Tailwind v4 only |
| `lucide-react` | `>= 0.400.0` | peer(consumer 已裝,DS 不重複,避免 hoisting 雙裝)|

---

## Troubleshooting

| 症狀 | 原因 / 修法 |
|---|---|
| 元件 render 但**完全沒樣式** | 漏 `@source` directive(Tailwind v4 不掃 node_modules),補 globals.css `@source '../node_modules/@qijenchen/design-system/**/*.{js,ts,jsx,tsx}'` |
| `Failed to resolve "./dist/globals.css"` | beta.6 以前 exports map bug,升 `@beta` latest (beta.7+ 已 fix) |
| iconOnly Button 卡死 / warn | App root 缺 `<TooltipProvider>` |
| Sidebar selection 行為怪 | 不用 `isActive={true}`,改用 `<SidebarProvider activeId={...}>` |
| Dark mode 不切換 | 確認 `<html data-theme="dark">`(attribute,非 class)|
| TypeScript `FieldMode` type 找不到 | beta.6 以前 .d.ts 有 `@/` alias leak,升 beta.7+(tsc-alias 已修)|

---

## License

UNLICENSED — internal use only.

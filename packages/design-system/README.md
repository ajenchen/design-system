# @qijenchen/design-system

World-class design system — components, patterns, tokens, hooks (single source of truth for team distribution).

```bash
npm install @qijenchen/design-system
```

Tailwind v4 + React 18+ project required. License: UNLICENSED (internal use).

---

## Quick start(consumer side)

### CSS entry — 3 line setup(Tailwind v4 canonical)

```css
/* globals.css (or main.css / src/index.css) */
@import 'tailwindcss';
@import '@qijenchen/design-system/styles/tokens';
@source '../node_modules/@qijenchen/design-system/src/**/*.{js,ts,jsx,tsx}';
```

3 行皆必要:
1. `@import 'tailwindcss'` — Tailwind v4 entry
2. `@import '@qijenchen/design-system/styles/tokens'` — DS token system(`@theme inline` + color / spacing / typography / radius)
3. `@source '../node_modules/...'` — **不能省**。Tailwind v4 預設只掃 `src/**` 不掃 `node_modules`,沒這行 DS 元件內用的 `h-field-md` / `bg-primary-hover` 等 class 不會被產出 → 元件純文字無樣式。

> 為何不能合 1 行 preset?Tailwind v4 `@source` directive 在從 `node_modules` 來的 imported CSS 內不被正確 resolve(本 DS 試過 preset.css 失敗),consumer 必須 inline 寫 `@source` 在自己的 entry CSS。對齊 Material UI / Polaris / shadcn 慣例(各自 README 都要 consumer 寫 Tailwind config)。

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

**預設用 top barrel import**(對齊 Material UI canonical)。需要更窄的 import surface 時,也支援 `@qijenchen/design-system/components/<Name>` / `patterns/<Name>` / `hooks/<name>` subpath(見 package `exports`)。

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

- Production:**https://ajenchen-design-system.netlify.app/**(GH Pages mirror: <https://ajenchen.github.io/design-system/>)
- 看每個元件的「展示」/「設計規格」/「設計原則」3 層 stories

---

## API contract / 公開 surface

| 路徑 | 內容 |
|---|---|
| `@qijenchen/design-system` | Top barrel — components / patterns / hooks / lib utilities / token JS mirrors。**策展後 front-door**(2026-07-14 API 策展):named re-exports,`*Meta`(componentMeta 建置/稽核 metadata)與 internal 單元不在此 |
| `@qijenchen/design-system/components/<Dir>`、`…/patterns/<dir>` | Per-component subpath — 完整 `export *`(含 `*Meta`;internal 單元「包裝後 + 自行確認」的唯一管道)|
| `@qijenchen/design-system/styles/tokens` | CSS aggregator(全 token + Tailwind `@theme inline`)|
| `@qijenchen/design-system/hooks/<name>` | 單一 hook subpath |
| `@qijenchen/design-system/tokens/<path>` | Token JS 模組(編譯品;eg `tokens/motion/motion`、`tokens/uiSize/icon-size`)— 原始 `.ts` / `.spec.md` 不經此路徑曝露;CSS 透過 `styles/tokens` aggregator |

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

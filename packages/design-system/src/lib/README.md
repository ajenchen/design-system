# lib/ Charter

## 這裡只收:cross-cutting non-visual utility module

每個 lib 子模組提供**跨元件共用、無 visual surface 的 infrastructure / utility**:

- React Context Provider + hook(non-visual cross-cutting feature)
- 純運算 / 格式化 helper(date / number / a11y string)
- TypeScript type module(無 runtime,共用 type-only export)
- 第三方 library 的 thin wrapper(對齊 DS API 風格)

**核心特徵**:沒有 visual surface(不 render UI),但 ≥ 2 個 DS 元件 import 它使用。

---

## 跟 hooks/ / patterns/ / components/ 分權

| Home | 收什麼 | 反例(錯誤 home)|
|------|-------|----------------|
| `lib/{topic}/` | cross-cutting feature module(Provider + hook + types 集合)| 純 hook 一個檔案 → 應 `hooks/use-*.ts` |
| `hooks/use-*.ts` | 單純 stateless hook(無 Context / 無 Provider)| 帶 Provider → `lib/{topic}/` |
| `patterns/{topic}/` | runtime visual primitive(`<Item>` / `<ActionBar>` 等渲染 UI)| 沒 visual surface → `lib/` |
| `components/{Name}/` | user-facing 元件(public API)| internal cross-cutting → `lib/` |

**判斷 flow**:

```
有 visual surface(render UI 元素)?
├─ Yes → 是 user-facing? → components/ : patterns/
└─ No → 是純 stateless hook 一支?
        ├─ Yes → hooks/use-*.ts
        └─ No(Provider + hook + types 一組,或 utility module)→ lib/{topic}/
```

---

## 當前居民

| Module | 提供什麼 | Consumer | 世界級對齊 |
|--------|---------|----------|-----------|
| `i18n/` | `<I18nProvider>` + `useI18n()` hook + `I18nLabels` types(opt-in context-based label catalog,additive 與 prop API 並存)| 全 DS 元件 opt-in consumer | Material `@mui/material/locale` / Ant `<ConfigProvider locale>` / Carbon `<PrefixContext>` 共識:i18n 是 utility/locale module 非 visual pattern |
| `roving-list-keyboard.ts` | 「列上有小按鈕的一串」鍵盤路線的唯一判定(`resolveRovingKey` 純函式)+ 落點 / Tab 停靠點(`pickRovingTarget` / `pickRovingTabStop`)+ 真焦點宿主的執行器(`applyRovingAction`)+ 列裡可走到的東西(`listRovingControls`)與文字輸入判準(`isTextEntryElement`)。規則住 `ds-canonical/references/keyboard-model-canonical.md`「列上有小按鈕的一串」;2026-09-26 由四份平行實作合一 | Sidebar(SidebarMenu)/ FileUpload(檔案清單)/ TreeView / Command;`isTextEntryElement` 另有 `hooks/use-input-modality.ts`、SelectMenu 鍵盤橋接 | W3C APG grid / treegrid「一組一站 + 方向鍵」、Adobe React Aria GridList(→ 進列內、Tab 整串離開)、Fluent List |
| `focus-after-trigger.ts` | 「彈出框開著按 Tab:收起,焦點從觸發點往下 / 往上走一站」的唯一落點計算(`tabStopFromTrigger` / `focusFromTrigger` / `tabbableOrder`)。規則住 `keyboard-model-canonical.md`「彈出框開著時的 Tab 與 Esc」;2026-09-26 由兩份合一 | DropdownMenu(`dropdown-menu-keyboard.ts`)/ SelectMenu(`select-menu-keyboard.ts`) | W3C menu「close all menus and submenus」、W3C 單選下拉 Tab、Fluent「tab to next element after the root trigger」 |

---

## 命名鐵律

- 子目錄名 kebab-case(對齊 components/ / patterns/)
- 入口 module 名描述功能(`i18n-context.tsx` / `formatters.ts`),非 generic 名(`utils.ts` / `helpers.ts` 違反 — 後者該歸到 `src/lib/utils.ts` 專案級)
- 違反 → audit Dim 19 home-name-vs-scope 抓

---

## 這裡**不收**(反例 + 正確去處)

| 疑似要放這但其實不是 | 實際應去 | 為什麼 |
|-------------------|---------|--------|
| 「`cn()` Tailwind 合併」工具 | `src/lib/utils.ts` | shadcn 慣例 home,專案級非 DS 內部 |
| 「`useControllable` 雙模式 hook」 | `packages/design-system/src/hooks/use-controllable.ts` | 純 stateless hook,無 Context |
| 「Toast 行為 primitive(渲染 UI)」 | `packages/design-system/src/patterns/{name}/` | 有 visual surface |
| 「formik / react-hook-form 整合」 | 不在 DS scope | DS 不耦合 form library;consumer 自己 wire |

---

## 新增 lib module 的 criteria(必須全部通過)

1. **無 visual surface**(不 render UI 元素;Context Provider 例外因 wrap children)
2. **≥ 2 個 DS 元件消費**(spec / README 必列 consumers)
3. **≥ 3 家世界級對照**(MUI / Polaris / Ant / Carbon / Material 任一以上)
4. **不適合 hooks/**(超過單一 stateless hook,有 Provider / types / multi-file 結構)

---

## 為什麼新建這個 home(2026-05-01)

i18n-context 原放 `patterns/i18n/`,但 patterns/ 定義是「runtime visual primitive」,i18n 無 visual surface(只是 Context + hook + types)→ home-name-vs-scope 不符(audit Dim 19 抓到)。

世界級三家共識:**i18n 是 utility / locale module,不是 visual pattern**:
- Material `@mui/material/locale` 是 utility sub-package
- Ant `<ConfigProvider locale>` 是 provider config 非 visual element
- Carbon `<PrefixContext>` 是 DI module 非 visual primitive

新建 `lib/` 為這類 cross-cutting non-visual primitive 留 home,patterns/ 純化只收 visual primitive。

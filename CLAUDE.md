# 專案規則

本專案使用：

- Vite + React + TypeScript
- Tailwind CSS v4（@tailwindcss/vite）
- shadcn/ui 元件庫
- Storybook
- 自訂 Design Token 系統

專案必須可以正常啟動。

必要檔案：

- index.html（位於專案根目錄）
- src/main.tsx
- src/globals.css
- vite.config.ts
- package.json
- tsconfig.json

若缺少上述檔案，請先建立再進行其他修改。


# 技術架構概覽

```
src/
├── globals.css                        ← Tailwind v4 入口 + CSS token bridge
├── lib/
│   └── utils.ts                       ← cn() 工具（clsx + tailwind-merge）
├── design-system/
│   ├── tokens/
│   │   ├── color/
│   │   │   ├── primitives.css         ← 原始色票（靜態 CSS）
│   │   │   ├── semantic.css           ← 語義色彩 + dark mode（靜態 CSS）
│   │   │   ├── color.spec.md          ← 色彩設計原則與使用規則
│   │   │   └── color.stories.tsx
│   │   ├── typography/
│   │   │   ├── typography.css         ← utilities（靜態 CSS）
│   │   │   ├── typography.spec.md     ← 字體設計原則與使用規則
│   │   │   └── typography.stories.tsx
│   │   ├── uiSize/
│   │   │   ├── uiSize.css             ← 元件尺寸 tokens（md/lg 兩種模式）
│   │   │   └── uiSize.spec.md         ← 元件尺寸使用規則
│   │   ├── layoutSpace/
│   │   │   ├── layoutSpace.css        ← 版面間距 tokens（md/lg 兩種模式）
│   │   │   └── layoutSpace.spec.md    ← 版面間距使用規則
│   │   ├── density/
│   │   │   ├── density.spec.md        ← Density 系統說明（data-density 統一控制）
│   │   │   └── density.stories.tsx    ← UI Size + Layout Space 合併展示
│   │   ├── elevation/
│   │   │   ├── elevation.spec.md      ← 陰影層級使用規則
│   │   │   └── elevation.stories.tsx  ← 陰影層級展示
│   │   └── radius/
│   │       ├── radius.spec.md         ← 圓角使用規則
│   │       └── radius.stories.tsx
│   ├── components/                    ← shadcn 積木元件（一個元件一個資料夾）
│   │   ├── Badge/                     ← 通知計數指示器（紅點 / 計數膠囊）
│   │   ├── Tag/                       ← inline label（分類標籤 / 狀態標記）
│   │   ├── Avatar/                    ← 視覺身份標識（人物 / 實體）
│   │   ├── Button/                    ← 觸發操作或導覽
│   │   ├── Switch/                    ← 即時開關切換
│   │   ├── Checkbox/                  ← 選擇控件（方形，含 indeterminate）
│   │   ├── Radio/                     ← 選擇控件（圓形，互斥）
│   │   ├── Tooltip/                   ← hover 短文字提示
│   │   ├── SelectionControl/          ← Checkbox/Radio 共用的 SelectionItem 佈局
│   │   ├── Command/                   ← shadcn Command（cmdk 搜尋 + 鍵盤導覽）
│   │   ├── Popover/                   ← shadcn Popover（浮動容器）
│   │   ├── Dialog/                    ← shadcn Dialog
│   │   ├── ScrollArea/                ← shadcn ScrollArea
│   │   ├── SelectMenu/                ← 下拉選單浮層（由 SelectField 消費）
│   │   │   ├── select-menu.tsx        ← SelectMenu（Popover + Command 組合）
│   │   │   ├── select-menu-item.tsx   ← MenuItem + Group + Footer
│   │   │   └── select-menu-item.spec.md ← 設計原則（含 searchIn 規則）
│   │   ├── DropdownMenu/              ← 操作選單（由 Button 觸發）
│   │   │   ├── dropdown-menu.tsx      ← Radix DropdownMenu + 設計系統 token
│   │   │   └── dropdown-menu.spec.md
│   │   ├── TreeView/                  ← 階層結構遞迴元件（expand/collapse + drag + keyboard）
│   │   ├── Sidebar/                   ← 佈局外殼（Provider + Header + Content + Footer + Trigger）
│   │   ├── Field/                     ← shadcn Field（Label + Control + Description + Message）
│   │   │   ├── field.tsx
│   │   │   └── field-context.ts       ← FieldContext + useFieldContext（獨立檔案避免循環引用）
│   │   └── fields/                    ← 資料輸入 / 顯示元件
│   │       ├── field-types.ts         ← FieldMode、InlineActionConfig 共用型別
│   │       ├── field-wrapper.tsx      ← 共用 wrapper 樣式
│   │       ├── field.spec.md          ← Field 共用設計原則（含驗證標準）
│   │       ├── TextField/
│   │       ├── NumberField/
│   │       ├── CheckboxField/
│   │       ├── DateField/
│   │       ├── SelectField/
│   │       ├── MultiSelectField/
│   │       ├── SwitchField/           ← Switch 欄位（即時開關切換）
│   │       └── LinkField/             ← URL 輸入，藍色連結 + Pencil 編輯
│   └── patterns/                      ← 複合元件 / 已定案的 UI 流程（依互動領域分資料夾）
│       ├── action-bar/                ← 工具列、操作列
│       │   ├── action-bar.spec.md
│       │   └── action-bar.stories.tsx
│       └── item-layout/               ← prefix + content 佈局原則（掃描/閱讀兩種模式）
│           └── item-layout.spec.md
└── explorations/                      ← 未定案的 prototype 比稿
```


# Token 系統運作方式

**所有 token 均為純 CSS（不需 JavaScript）：**
- `color/primitives.css`：原始色票
- `color/semantic.css`：語義色彩，用 CSS selector 處理 dark mode
- `typography/typography.css`：字體尺寸 utilities
- `uiSize/uiSize.css`：元件尺寸，用 `[data-ui-size="lg"]` 處理模式切換
- `layoutSpace/layoutSpace.css`：版面間距，用 `[data-layout-space="lg"]` 處理模式切換
- radius 透過 `globals.css` 的 `@theme inline` 定義

**初始狀態在 `index.html` 設定，無需 JavaScript：**

```html
<html data-theme="light" data-density="md">
```

**動態切換**（例如使用者切換 dark mode）直接操作 attribute：

```ts
document.documentElement.setAttribute('data-theme', 'dark')
document.documentElement.setAttribute('data-density', 'lg')  // 同時切換 uiSize + layoutSpace
// 若需單獨控制，可直接用 data-ui-size / data-layout-space（逃生艙）
```

**JS 端使用色彩**（inline style、canvas 等場景）直接用 CSS 變數字串：

```ts
element.style.color = 'var(--color-neutral-4)'
element.style.backgroundColor = 'var(--primary)'
```


# Spec 規則

- **回答任何設計問題前，必須先讀取所有相關的 spec.md**，以實際內容為基礎，不憑記憶回答
- **每次回答必須有邏輯、有架構、符合世界級設計水準**——不提出未經深思的建議，不為了回答而回答
- **編輯 spec.md 時，必須交叉比對所有相關的 spec.md 與 Storybook 範例**，確認無矛盾、無術語不一致、無重複定義
- **若結論與既有 spec.md 有邏輯衝突或概念混淆，必須主動提出討論**，不默默修改、不迴避矛盾
- **所有元件必須遵循 shadcn 框架**，確保保留 shadcn 的結構優勢（forwardRef、Slot、data-* attributes、cva 等），不從零重寫
- **spec.md 與 .tsx 的職責分離**：spec 只記錄設計原則（「為什麼」和「何時用」），讓 AI 能舉一反三推導邊緣情況；可程式化的規則（具體 token class name、pixel 值、條件邏輯）寫進元件 .tsx，不寫在 spec 裡。判斷標準：「這條規則能直接變成 code 嗎？」能 → .tsx；不能、需要人類判斷 → spec
- **可推導的值用 `calc()` 或公式表達，不硬寫結果**——讓依賴關係留在 code 裡，上游值變動時下游自動跟著算。例：divider 內縮 = `(行高 - 文字行高) / 2`，改行高時 divider 自動調整，不需要有人記得去改


# 建立 UI 前必讀

建立任何 UI 前，必須先讀對應的 spec：

- **色彩**：`src/design-system/tokens/color/color.spec.md`
- **字體**：`src/design-system/tokens/typography/typography.spec.md`
- **密度系統**：`src/design-system/tokens/density/density.spec.md`
- **元件尺寸**：`src/design-system/tokens/uiSize/uiSize.spec.md`
- **版面間距**：`src/design-system/tokens/layoutSpace/layoutSpace.spec.md`
- **陰影**：`src/design-system/tokens/elevation/elevation.spec.md`
- **圓角**：`src/design-system/tokens/radius/radius.spec.md`

並檢查以下資料夾確認可用元件：

- `src/design-system/components/`（shadcn 積木元件）
- `src/design-system/patterns/`（已定案的 UI 流程）

不要依賴 CLAUDE.md 列出的固定元件名稱，以實際目錄內容為準。


# UI 開發規則

- 必須優先重用 `src/design-system/components/` 內已存在的元件
- 必須使用 design tokens（透過 Tailwind utilities 或 CSS 變數）
- 不要硬寫顏色、font-size、spacing、radius
- 建立新 UI 前，必須先檢查是否已有對應 pattern
- 若缺少元件，請明確指出，不要假裝元件已存在
- 使用 `cn()` 合併 Tailwind class（來自 `@/lib/utils`）

## 新增數值前必須先查既有 pattern（舉一反三原則）

**寫任何 gap、padding、font-size、line-height、icon size、border-radius 等數值之前,必須先 grep 系統內同類型的值,確認是否有既有 pattern 可以直接套用。不要憑直覺發明新值。**

檢查清單：
- `gap` → 查 `fieldWrapperStyles`（gap-2）、SelectMenuItem cva、SelectionItem cva
- `padding` → 查 `--layout-space-loose/tight`、fieldWrapperStyles `px-3`
- `font-size` → 查 `typography.css` utilities + `item-layout.spec.md` reading/scanning 模式規則
- `line-height` → 查 `typography.css`（scanning = leading-compact 1.3,reading = default 1.5）
- `icon size` → 查 `ICON_SIZE` 常數（sm/md=16, lg=20）
- `inline action` → 查 `uiSize.spec.md`（icon size、hover bg size=icon+2、gap-2 between actions、fg-muted → hover foreground）

**舉一反三**：如果 Select 的 inline action gap 是 gap-2,那所有元件的 inline action gap 都是 gap-2——不需要每個元件都被糾正一次。同理,如果 SelectMenuItem 的 description 是 reading mode min 14px,那所有 reading mode consumer 的 description 都是 min 14px。

**如果確實需要新值**,先提出理由讓使用者確認,不要自己決定後寫進去。


# Tailwind 使用規則

**間距與尺寸**：Tailwind 預設間距（`p-4`、`gap-2`、`mt-6` 等）可正常使用。
需對應 token 時使用任意值：

```tsx
<div className="p-[var(--layout-space-loose)]" />
<div className="h-[var(--ui-height-36)]" />
```

**圓角**：

| Utility class   | 值                         |
|----------------|---------------------------|
| `rounded-md`   | 4px（--radius-md）    |
| `rounded-lg`   | 8px（--radius-lg）    |
| `rounded-full` | 9999px（--radius-full）|

## tailwind-merge 自訂 utility 註冊規則(必讀)

`cn()`(`src/lib/utils.ts`)用 `tailwind-merge` 解決 class 衝突。tailwind-merge 看到 `text-{xxx}` 類 utility 時會用 heuristic 猜分組——猜錯就會把不該衝突的 class 誤判為衝突,strip 掉其中一個。

**已發生過的 bug**:`text-body`(font-size 14px)和 `text-fg-secondary`(color)被誤判為同組,tailwind-merge 把 `text-body` 吃掉,description 失去自己的 font-size、從父層繼承 16px。

### 規則:任何新增的 `text-*` 自訂 utility 都必須在 `lib/utils.ts` 顯式註冊

**font-size 類**(影響 `--font-{xxx}-size`)→ 註冊到 `font-size` group:
```ts
'font-size': ['text-h1', ..., 'text-body-lg', 'text-body', 'text-caption', 'text-footnote', 'text-你的新size']
```

**color 類**(影響 `color`)→ 註冊到 `text-color` group:
```ts
'text-color': [
  'text-foreground', 'text-fg-secondary', 'text-fg-muted', 'text-fg-disabled',
  'text-inverse-fg', 'text-error-text', 'text-success-text', ...,
  'text-你的新色'
]
```

**判斷法**:你新增的 utility 是設 font-size 還是 color?寫進對應的 group。**兩個 group 都要顯式列舉,不能讓 tailwind-merge 用 heuristic 自動猜**。

### 不只是 text-*。其他可能誤判的 utility prefix

| Utility 類型 | tailwind-merge 預設 group |
|---|---|
| `text-{xxx}` | `font-size` 或 `text-color` |
| `bg-{xxx}` | `background-color` 或 `background-image` |
| `border-{xxx}` | `border-color` 或 `border-width` 或 `border-style` |
| `ring-{xxx}` | `ring-color` 或 `ring-width` |

新增**任何**自訂 `{prefix}-{semantic-name}` utility 後,先確認它落在哪個 group。如果 cn() 後 class 不見了,99% 是 tailwind-merge 誤判,去 `lib/utils.ts` 註冊。

### 終極逃生艙:inline style + CSS variable

若 utility class 真的無法解決(例如同 element 同 cn() chain 必定衝突),改用 inline style + CSS variable,**仍然是 design token,沒有硬寫 px**:

```tsx
<span style={{ fontSize: 'var(--font-body-size)' }}>
```

inline style 的 specificity 高過 utility class,絕對不會被 strip。但這是逃生艙,不是預設做法——優先讓 utility 正確 work。


# Token 命名原則

所有 design token（color、typography、spacing、radius、opacity 等）必須遵循一致命名邏輯——看到 token 名就能判斷它的層級、角色和關聯，不需要查文件。

## 1. Primitive vs Semantic 區分

| 層級 | 命名特徵 | 範例 |
|------|---------|------|
| **Primitive**（原始值，無語意） | `--color-*` 前綴 + 編號 / 類別 + 具體值 | `--color-blue-6`、`--color-neutral-9`、`--font-h1-size`、`--field-height-md` |
| **Semantic**（賦予 purpose） | 無 `--color-` 前綴，直接表 purpose | `--primary`、`--foreground`、`--neutral-hover`、`--inverse-fg` |

**判斷法**：看到 `--color-*` 或具體編號 → primitive；看到無前綴的 purpose 名 → semantic。

## 2. Namespace + Role 結構

Token 命名 = `--{namespace}-{role}-{variant?}`

- **Namespace**：上下文（`primary`、`error`、`neutral`、`inverse`、`fg`、`bg`、`field`）
- **Role**：角色（`fg`、`bg`、`hover`、`active`、`subtle`、`text`、`height`、`size`）
- **Variant**：變體（`secondary`、`muted`、`disabled`、`xs`/`sm`/`md`/`lg`）

範例：
- `--neutral-hover` = neutral 上下文的 hover 狀態
- `--inverse-fg` = inverse 上下文的 foreground 文字
- `--primary-subtle` = primary 上下文的 subtle 變體
- `--field-height-md` = field 上下文的 height、md 變體

## 3. 對齊既有 family

新增 token 必須鏡射既有 family 的命名模式，不孤立發明。

| 既有 family | 新增應對齊 |
|------|------|
| `--foreground` / `--fg-secondary` / `--fg-muted` / `--fg-disabled` | 新文字 base 用 `--{ctx}-fg`、變體用 `--{ctx}-fg-secondary` 等 |
| `--neutral-hover` / `--neutral-active` | 新互動覆蓋層用 `--{ctx}-neutral-hover`（明確指出鏡射 neutral 互動） |
| `--{semantic}-hover` / `--{semantic}-active` | 新語義 hover 對齊（如 `--primary-hover`） |
| `--field-height-{xs,sm,md,lg}` | 新 height token 對齊既有尺寸維度 |

**判斷標準**：
- `--inverse-fg` → 應該預期它對應 `--foreground`
- `--inverse-neutral-hover` → 應該預期它鏡射 `--neutral-hover`
- 如果新 token 找不到對應 family，先質疑這個 token 是否真的需要

## 4. 不混語義名和色名

分類元件（Tag、Avatar）和語義元件（Button、Checkbox）的 token 不能混用：

- **分類**用 primitive 色名：`var(--color-deep-orange-1)`（Tag 的 red variant）
- **語義**用 purpose 名：`var(--error-subtle)`（Button 的 destructive variant）

雖然兩者底層可能指向相同 primitive，但消費端必須明確選擇是「色」還是「義」。改 `--error` 從 deep-orange 改成別的色，不應該影響 Tag 的 red variant——這是 Tag 直接用 primitive 而非 semantic 的根本原因。

## 5. 禁止事項

- ❌ **籠統命名**：`--inverse-hover`（不知道是 text/bg/border）→ 用 `--inverse-neutral-hover` 明確指出鏡射對象
- ❌ **孤立命名**：`--strong-text` 沒對齊任何既有 family → 先找對齊對象
- ❌ **自創縮寫**：`--fg`、`--bg` 作為 base token（已用 `--foreground`、`--background`）
- ❌ **Primitive 帶語意**：`--color-primary-6`（primitive 不該有 purpose）
- ❌ **Semantic 帶色相**：`--primary-blue`（semantic 不該暗示色相）
- ❌ **Categorical 中間層**：`--blue` / `--blue-hover` 等（已廢除——Tag 直接用 primitive，Button 用 semantic）

## 6. 新增語意色相必須依照 SOP

新增 semantic 色相（如 `--accent`、`--brand-secondary` 等）**必須遵循** `src/design-system/tokens/color/color.spec.md` 的「新增語意色相的標準流程」，完整執行 4 步：

1. Primitive base-6（如不存在）
2. Semantic 五件套：`base` / `hover` / `active` / `subtle` / `text`（**不可缺任何一個**）
3. Dark mode `hover` / `active` 方向反轉
4. Tailwind bridge 五件套

對應規則固定不可改：base=-6、hover=-5、active=-7、subtle=-1、text=-7。
所有現有 semantic 色相（`--primary` / `--info` / `--error` / `--success` / `--warning`）都遵守這個結構，新色相必須一致。

## 7. 色彩架構流派立場

本系統採 **Atlassian-style Semantic State Token** 流派（業界四大流派之一），意思是：

- **靜態色**（不需要 mode 翻轉知識）→ 用 primitive `--color-{hue}-N`
- **互動狀態**（需要 dark mode swap）→ 用 semantic state token `--{hue}-hover` / `--{hue}-active` / `--primary-hover` 等

**Tag/Avatar 同時用 primitive（靜態）和 semantic（互動）是有意的職責分離，不是 code smell**。兩個概念（raw color value vs interaction state with mode awareness）本來就該住不同層。

我們**有意拒絕**其他三個流派：
- **Radix Numbered Role Scale**（step number = role）——工程量極大，需重構整套 12-step scale
- **Material 3 State Layer Overlay**（互動用透明 overlay）——跟我們 Button 用 solid shade change 的視覺語言不一致
- **Tailwind Consumer-side Mode Handling**（consumer 寫 `dark:hover:`）——放棄 token 層級的抽象化價值

**重要**：未來討論色彩架構或新增色彩 token 時，**先讀 `color.spec.md` 的「架構流派定位」段落**確認方向，避免無意間漂移到別的流派造成設計斷裂。


# 元件 Props 命名原則

**按「是什麼」命名，不按「在哪裡」命名。** 參考 Material（Chip: avatar / icon / deleteIcon）、Ant Design（Tag: icon / closeIcon）等世界級設計系統。

- slot 只接受 icon → 命名帶 `icon`（如 `startIcon`、`endIcon`），型別用 `LucideIcon`，元件內部控制尺寸
- slot 接受任意視覺元素 → 命名描述內容類型（如 `avatar`），型別用 `ReactNode`
- slot 是行為 → 用 callback（如 `onDismiss`），元件內部渲染互動元素並控制尺寸與樣式
- ❌ 不用 `prefix` / `suffix` / `left` / `right` 等純位置名——這些不傳達內容本質，也無法約束型別


# shadcn 元件規範

元件位置：`src/design-system/components/{ComponentName}/`

每個元件一個資料夾：
- `{name}.tsx` — 元件本體
- `{name}.spec.md` — 使用原則與設計規範
- `{name}.stories.tsx` — 展示（設計規格的便利瀏覽版）
- `{name}.anatomy.stories.tsx` — 設計規格（完整技術規格）
- `{name}.principles.stories.tsx` — 設計原則（do/don't 使用判斷）

新增 shadcn 元件：

```bash
npx shadcn add card
npx shadcn add input
```

元件結構範例：

```tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const componentVariants = cva('base-classes', {
  variants: {
    variant: { /* ... */ },
    size: { /* ... */ },
  },
  defaultVariants: { /* ... */ },
})

interface ComponentProps extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof componentVariants> {}

const Component = React.forwardRef<HTMLDivElement, ComponentProps>(
  ({ className, variant, size, ...props }, ref) => (
    <div className={cn(componentVariants({ variant, size, className }))} ref={ref} {...props} />
  )
)
Component.displayName = 'Component'

export { Component, componentVariants }
```

Import 路徑：

```tsx
import { Button } from '@/design-system/components/Button/button'
import { cn } from '@/lib/utils'
// 不再有 tokens.ts — 顏色與字體直接用 CSS 變數或 Tailwind class
```


# Pattern 規則

`src/design-system/patterns/` 用於已定案的 UI 流程與元件組合。

- 建立新 UI 前必須先檢查是否已有對應 pattern
- 不得跳過 patterns 直接重新設計
- 若 exploration 已定案，應整理後升級為 pattern
- `patterns/` 目前保持平坦結構（一個 pattern 一個資料夾）。同一領域累積三個以上 pattern 時，再建領域子資料夾

每個 pattern 可包含：`*.spec.md`、`*.stories.tsx`、`*.example.tsx`


# 元件完成清單

每個元件在進入 design-system 前必須逐項對照。這是品質閘門，不可跳過。

## Spec（`{name}.spec.md`）

**定義**
- 元件定位一句話說清楚（是什麼、不是什麼）
- 所有 props / variants 都有明確的「何時用 / 何時不用」
- 互斥規則寫清楚（哪些 props 不能並用、哪些組合無效）
- 每個規則都有「為什麼」，不只寫「怎麼做」

**文字品質**
- 沒有描述視覺形狀或實作細節（如「窄長形」「會變寬」「zero layout shift」）
- 術語一致，沒有同一概念用兩種名稱
- 禁止事項（❌）列出所有常見誤用

**邊界案例**
- 有 disabled / loading / empty 狀態的說明（如適用）
- 有 dark mode / density 行為的說明（如適用）
- 有 icon-only 的使用規則（如適用）

## Code（`{name}.tsx`）

**shadcn 結構規則（優先）**
- 以 shadcn 原始碼為基底，不從零重寫
- `React.forwardRef` + `ref` 傳到底層 DOM 元素
- `...props` spread 到底層元素，保留所有原生 HTML 屬性
- `displayName` 設定
- variants 用 `cva()` 管理，不用條件字串拼接
- 同時 export 元件本體與 `cva` 物件（供外部組合使用）
- 支援 `asChild`（透過 Radix `Slot`）
- 不移除 Radix UI 的 `data-state`、`data-disabled`、`data-orientation` 等屬性
- 樣式優先用 `data-*` attribute selector，而非自訂 class 模擬狀態

**Design Token 規則**
- 不硬寫顏色、字體、padding、border-radius、高度
- 所有尺寸使用 design token（CSS 變數或對應 Tailwind utility）
- 使用 `cn()` 合併 class

**Accessibility**
- 所有互動元素有正確的 ARIA 屬性
- icon-only 元素必須有 `aria-label`

## Stories（`{name}.stories.tsx` + `{name}.principles.stories.tsx`）

**範例正確性**
- 每個範例的 variant / props 語意正確（不為了填版面而用錯 variant）
- 同類型場景的 icon 維持一致順序
- 範例中的文字 / icon 能清楚傳達使用情境，不用「按鈕一」「按鈕二」佔位

**完整性**
- 每個重要規則都有正確範例
- 常見誤用都有錯誤範例（對比呈現）
- Rule note 只寫規則與原因，不描述視覺細節
- **Rule note 必須傳達原則，讓讀者能舉一反三**——寫「為什麼」而不只是「是什麼」。例如：不寫「禁止 primary」，而寫「工具層必須是視覺重量最低的一層，否則搶走業務焦點」；不寫「全程 icon-only」，而寫「這些 icon 在此脈絡下約定成俗，使用者不需 label 就能辨識」

**視覺品質**
- Toolbar 範例統一使用 `ToolbarFrame`（滿版 + 短標題），不用裸 `ButtonGroup` 漂在半空
- `ToolbarFrame` 標題模擬真實產品（2–4 字如「文件」「專案」），說明放在下方 `Label`，不塞進標題導致文字與按鈕碰撞
- 同一個 story 內的範例容器必須一致，不混用不同寬度
- ❌/✅ 判斷放在 `Label`（如 `❌ 設定是工具操作...`），不放在 ToolbarFrame 標題內
- **排版層級清晰**：主標用 `h3`（深色、正常大小），副標用 `text-caption`（灰色、限寬 720px），Label 用 `text-footnote`（最小字、範例解說）。三層必須視覺上有明顯區隔，讀者一眼能分辨標題、說明、範例註解

**文案品質**
- 所有文案必須是「任何設計師或開發者都能看懂」的語言，不用只有作者和 AI 才懂的術語
- 避免：spec 內部代號（如 Rule A/B）、抽象符號表達式（如 `│─ 業務 ─│`）、未經解釋的概念名稱
- Label 用口語描述現象，不用代號引用規則。例如：不寫「角色接壤」，寫「業務操作接工具操作，同為無框，邊界不可見」
- Storybook 是公開文件，寫法標準是「新加入的設計師打開就能看懂」

**Accessibility**
- 所有 icon-only 按鈕有 `aria-label`
- 互動範例可以用鍵盤操作

## 上線前

- 本地 `npm run storybook` 確認所有 stories 正常渲染
- 沒有 TypeScript 錯誤
- import 路徑正確（`@/design-system/...`）
- 元件加入 `CLAUDE.md` 的目錄結構（如有異動）


# 正式系統與探索區的區別

| 區域 | 用途 |
|------|------|
| `src/design-system/` | 正式、已定案、可重用的元件與模式 |
| `src/explorations/` | 比稿、版本比較、尚未定案的 prototype |

正式產品程式碼不得 import `src/explorations/`。


# Exploration 規則

所有未定案的 prototype 放在 `src/explorations/{topic}/`，每個題目一個資料夾：

```
src/explorations/create-project-form/
  ├── CreateProjectForm.v1.stories.tsx
  ├── CreateProjectForm.v2.stories.tsx
  └── notes.md
```

- 同一題目所有版本放在同一資料夾
- `notes.md` 記錄差異、假設、比較重點
- explorations 可隨時刪除，不視為正式產品程式碼


# Story 規則

| 類型 | 位置 |
|------|------|
| 正式 story | `src/design-system/components/**` 或 `src/design-system/patterns/**` |
| Exploration story | `src/explorations/{topic}/` |

不要把 exploration stories 放進 design-system，反之亦然。


# Story 三層定位

每個元件有三種 story，各有明確職責，互不重複：

| 層 | 檔案 | 職責 | 類比 |
|---|---|---|---|
| **展示** | `{name}.stories.tsx` | 設計規格的便利瀏覽版——視覺目錄，快速掃視所有 variant / size / state 的渲染結果 | 車子展示間 |
| **設計規格** | `{name}.anatomy.stories.tsx` | 完整技術規格——token 查閱、尺寸藍圖、對照表。取代 Figma inspect + 規格標註 | 車子規格表 |
| **設計原則** | `{name}.principles.stories.tsx` | 使用判斷指南——do / don't、情境選擇、排列規則 | 駕駛手冊 |

**關係**：展示是設計規格的便利展示版（看結果），設計規格是精確查閱（查 token），設計原則是情境判斷（做決策）。三層從「看」到「查」到「判斷」，閱讀深度遞進。


# 設計規格 Story 標準（`{name}.anatomy.stories.tsx`）

以 `Button/button.anatomy.stories.tsx` 為範本。每個元件的設計規格必須包含以下 story：

## 1. 元件總覽
- Anatomy 圖——標示所有 slot（標準版面 + iconOnly 等變體版面）
- Variant 一覽——每個 variant 一行：渲染元件 + 一句話角色描述
- Props 速查表——prop / type / default / 說明

## 2. 元件檢閱器（取代 Figma inspect）
- 控制項：variant / danger / state / size / iconOnly（依元件調整）
- 左側：即時預覽 + 尺寸藍圖
- 右側：Inspect 面板，分區顯示 Color / Layout / Typography / Style
- **State 使用開發術語**：default / hover / active / disabled（不用 rest）

## 3. 色彩對照表
- Variant × State 矩陣
- 每格：渲染元件 + bg / text / border token 標註（含即時色塊）
- 標準 variant 與 danger variant 分開

## 4. 尺寸對照表
- Size token 對照表（每個 size 的所有 token 一覽）
- 含 iconOnly 等變體模式的覆寫說明
- 視覺預覽矩陣（Variant × Size，含變體模式）

## 5. 狀態行為
- 每個互動狀態的前後對照（如 loading spinner 替換規則）
- 所有 variant 的 disabled 渲染（含變體模式）
- 元件特有狀態（如 checked toggle）

## 設計規格品質規則

- **Token-first**：所有數值以 token name 為主（如 `h-field-sm`），resolved px 值為輔助灰字。開發者只需確認 token 正確——theme / density 的值解析由系統處理
- **不含 density 雙值**：不顯示 `28px (md) / 32px (lg)`，只顯示 token name + 當前 resolved 值
- **Dev 語言**：使用開發術語（default 不是 rest，用 Tailwind utility name 如 `px-3` `gap-1`）
- **藍圖完整性**：render 函式中**每一層**的 padding / margin / gap 都必須在藍圖中呈現——包括子元素的間距（如 label span 的 `px-1`），不可遺漏
- **範例驗證**：每個範例必須用 spec.md 的所有規則逐條驗證（如 badge 不應出現在 loading / disabled 狀態）
- **色塊即時渲染**：使用 `var()` 內聯樣式，確保切換 dark mode / density 時自動更新
- **資料正確性**：TOKEN_MAP / SIZE_SPECS 等資料必須與元件 `.tsx` 的 `cva()` 定義交叉比對，確認完全一致
- **值溯源完整性**：設計規格中出現的每個行為描述，必須追到 code 中的具體值。不可只描述行為模式而省略數值——包括 Provider 層級設定（如 `delayDuration`）、全域設定檔（`main.tsx`、`preview.tsx`）、CSS 變數定義檔。規則：**如果 code 裡有具體數字，設計規格就必須標出來**

## 連動更新規則

三份文件互為依賴，任一變動必須同步更新其他兩份：

| 異動來源 | 必須連動更新 |
|---------|-------------|
| **`.tsx` 元件程式碼**（variant / size / token / 內部結構） | → 設計規格（TOKEN_MAP、SIZE_SPECS、藍圖、Inspect 面板）<br>→ 展示（如有對應的 story） |
| **`.spec.md` 設計原則**（新增 / 修改 / 刪除規則） | → 設計原則 stories（do/don't 範例必須反映最新 spec）<br>→ 設計規格（範例驗證：確認規格中的範例不違反新規則） |
| **設計規格 story**（結構調整、新增對照維度） | → 展示（確保展示仍是規格的便利瀏覽版，不脫節） |

**執行方式**：修改元件 `.tsx` 或 `.spec.md` 後，必須主動檢查並更新對應的 story 檔案。不可只改程式碼而留下過時的規格文件。


# Prototype 建立流程

1. 描述畫面結構
2. 列出使用到的 design-system 元件
3. 說明假設
4. 在對應 topic 資料夾下建立 story 檔案

本專案的 prototype 展示以 Storybook 為主。


# 清理規則

若某個 exploration 題目不再需要，刪除整個資料夾。
不再使用但需保留的內容移至 `src/explorations/_archive/`。

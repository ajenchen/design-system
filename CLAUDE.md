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
│   │   └── Button/
│   │       ├── button.tsx
│   │       ├── button-group.tsx
│   │       ├── button.spec.md
│   │       ├── button.stories.tsx
│   │       └── button.principles.stories.tsx
│   └── patterns/                      ← 複合元件 / 已定案的 UI 流程（依互動領域分資料夾）
│       └── action-bar/                ← 工具列、操作列
│           ├── action-bar.spec.md
│           └── action-bar.stories.tsx
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


# shadcn 元件規範

元件位置：`src/design-system/components/{ComponentName}/`

每個元件一個資料夾：
- `{name}.tsx` — 元件本體
- `{name}.spec.md` — 使用原則與設計規範
- `{name}.stories.tsx` — Storybook 展示

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


# Prototype 建立流程

1. 描述畫面結構
2. 列出使用到的 design-system 元件
3. 說明假設
4. 在對應 topic 資料夾下建立 story 檔案

本專案的 prototype 展示以 Storybook 為主。


# 清理規則

若某個 exploration 題目不再需要，刪除整個資料夾。
不再使用但需保留的內容移至 `src/explorations/_archive/`。

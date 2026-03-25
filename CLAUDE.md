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
│   ├── CLAUDE.md                      ← Design system 使用規則（必讀）
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
│   │   ├── density.stories.tsx        ← UI Size + Layout Space 合併展示（因共用 data-density）
│   │   ├── elevation.stories.tsx      ← 陰影層級展示
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
│   └── patterns/                      ← 複合元件 / 已定案的 UI 流程
└── explorations/                      ← 未定案的 prototype 比稿
```


# Token 系統運作方式

色彩與字體 token 分為靜態與動態兩種：

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

# Design System 使用規則

## 建立 UI 前必讀

建立任何 UI 前，必須先讀：

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


## UI 開發規則

- 必須優先重用 `src/design-system/components/` 內已存在的元件
- 必須使用 design tokens（透過 Tailwind utilities 或 CSS 變數）
- 不要硬寫顏色、font-size、spacing、radius
- 建立新 UI 前，必須先檢查是否已有對應 pattern
- 若缺少元件，請明確指出，不要假裝元件已存在
- 使用 `cn()` 合併 Tailwind class（來自 `@/lib/utils`）


## Tailwind 使用規則

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


## shadcn 元件規範

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


## Pattern 規則

`src/design-system/patterns/` 用於已定案的 UI 流程與元件組合。

- 建立新 UI 前必須先檢查是否已有對應 pattern
- 不得跳過 patterns 直接重新設計
- 若 exploration 已定案，應整理後升級為 pattern

每個 pattern 可包含：`*.pattern.md`、`*.example.tsx`、`*.stories.tsx`

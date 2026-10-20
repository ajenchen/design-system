import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'

const meta: Meta = {
  title: 'Design System/Tokens/Elevation',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
陰影系統。兩個層級對應兩種「浮起高度」，用 CSS 變數 \`box-shadow\` 實現。Light / dark mode 自動切換。

完整規則：\`packages/design-system/src/tokens/elevation/elevation.spec.md\`

**⚠️ \`--elevation-200\` 的容器必須搭配 \`bg-surface-raised\`（不透明）。**
        `,
      },
    },
  },
}

export default meta
type Story = StoryObj


function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-[var(--layout-space-tight)] text-caption font-medium uppercase tracking-wider text-fg-muted">
      {children}
    </p>
  )
}


export const Overview: Story = {
  name: '總覽',
  render: () => (
    // @layout-space-magic-ok: 陰影樣本段之間 32px = elevation-200 模糊半徑(primitives.css:248),再近兩個陰影會相融(layoutSpace.spec.md:167 視覺平衡)
    <div className="space-y-8">
      <div>
        <SectionLabel>elevation-100 — Card</SectionLabel>
        {/* 樣本卡寬 224px:卡內距吃 loose(lg 24px)後,最長的 token 名「--elevation-200-hover」仍放得下一行(寬 192px 時 lg 會在「-hover」前斷行) */}
        {/* @layout-space-magic-ok: 並列陰影樣本卡之間 32px = elevation-200 模糊半徑(primitives.css:248)的留白(layoutSpace.spec.md:167 視覺平衡) */}
        <div className="flex flex-wrap gap-8">
          <div
            className="flex h-24 w-56 flex-col items-start justify-end rounded-md border border-border bg-surface p-[var(--layout-space-loose)]"
            style={{ boxShadow: 'var(--elevation-100)' }}
          >
            <code className="text-caption font-medium">--elevation-100</code>
            <span className="text-caption text-fg-muted">靜止狀態</span>
          </div>
          <div
            className="flex h-24 w-56 flex-col items-start justify-end rounded-md border border-border bg-surface p-[var(--layout-space-loose)]"
            style={{ boxShadow: 'var(--elevation-100-hover)' }}
          >
            <code className="text-caption font-medium">--elevation-100-hover</code>
            <span className="text-caption text-fg-muted">hover / 拖拽</span>
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>elevation-200 — Modal / Popover / Dropdown</SectionLabel>
        {/* @layout-space-magic-ok: 並列陰影樣本卡之間 32px = elevation-200 模糊半徑(primitives.css:248)的留白(layoutSpace.spec.md:167 視覺平衡) */}
        <div className="flex flex-wrap gap-8">
          <div
            className="flex h-24 w-56 flex-col items-start justify-end rounded-lg border border-border bg-surface-raised p-[var(--layout-space-loose)]"
            style={{ boxShadow: 'var(--elevation-200)' }}
          >
            <code className="text-caption font-medium">--elevation-200</code>
            <span className="text-caption text-fg-muted">靜止狀態</span>
          </div>
          <div
            className="flex h-24 w-56 flex-col items-start justify-end rounded-lg border border-border bg-surface-raised p-[var(--layout-space-loose)]"
            style={{ boxShadow: 'var(--elevation-200-hover)' }}
          >
            <code className="text-caption font-medium">--elevation-200-hover</code>
            <span className="text-caption text-fg-muted">hover 狀態</span>
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>層級對比 — Card 在下，Popover 浮在上</SectionLabel>
        <div className="relative flex h-52 w-full max-w-lg items-center justify-center rounded-md bg-canvas">
          <div
            className="absolute left-8 top-8 h-28 w-40 rounded-md border border-border bg-surface p-[var(--layout-space-loose)]"
            style={{ boxShadow: 'var(--elevation-100)' }}
          >
            <span className="text-caption text-fg-muted">Card（100）</span>
          </div>
          {/* Popover 疊在 Card 右下角上(左上角落在 Card 內 64 × 64px),才看得出「浮在上」:陰影落在 Card 上、邊框蓋過 Card 的邊。
              2026-10-20 前兩張卡水平相距 120px、完全不重疊,標題說的「浮在上」看不到(獨立驗證 OV-V06) */}
          <div
            className="absolute left-32 top-20 h-28 w-44 rounded-lg border border-border bg-surface-raised p-[var(--layout-space-loose)]"
            style={{ boxShadow: 'var(--elevation-200)' }}
          >
            <span className="text-caption text-fg-muted">Popover（200）</span>
          </div>
        </div>
      </div>
    </div>
  ),
}

import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'

const meta: Meta = {
  title: 'Design System/Tokens/Elevation',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
陰影系統。兩個層級對應兩種「浮起高度」，用 CSS 變數 \`box-shadow\` 實現。Light / dark mode 自動切換。

完整規則：\`src/design-system/tokens/elevation/elevation.spec.md\`

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
    <p className="mb-3 text-caption font-medium uppercase tracking-wider text-fg-muted">
      {children}
    </p>
  )
}


export const Overview: Story = {
  name: 'Overview',
  render: () => (
    <div className="space-y-8">
      <div>
        <SectionLabel>elevation-100 — Card</SectionLabel>
        <div className="flex flex-wrap gap-8">
          <div
            className="flex h-24 w-48 flex-col items-start justify-end rounded-md border border-border bg-surface p-4"
            style={{ boxShadow: 'var(--elevation-100)' }}
          >
            <code className="text-caption font-medium">--elevation-100</code>
            <span className="text-caption text-fg-muted">靜止狀態</span>
          </div>
          <div
            className="flex h-24 w-48 flex-col items-start justify-end rounded-md border border-border bg-surface p-4"
            style={{ boxShadow: 'var(--elevation-100-hover)' }}
          >
            <code className="text-caption font-medium">--elevation-100-hover</code>
            <span className="text-caption text-fg-muted">hover / 拖拽</span>
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>elevation-200 — Modal / Popover / Dropdown</SectionLabel>
        <div className="flex flex-wrap gap-8">
          <div
            className="flex h-24 w-48 flex-col items-start justify-end rounded-lg border border-border bg-surface-raised p-4"
            style={{ boxShadow: 'var(--elevation-200)' }}
          >
            <code className="text-caption font-medium">--elevation-200</code>
            <span className="text-caption text-fg-muted">靜止狀態</span>
          </div>
          <div
            className="flex h-24 w-48 flex-col items-start justify-end rounded-lg border border-border bg-surface-raised p-4"
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
            className="absolute left-8 top-8 h-28 w-40 rounded-md border border-border bg-surface p-3"
            style={{ boxShadow: 'var(--elevation-100)' }}
          >
            <span className="text-caption text-fg-muted">Card（100）</span>
          </div>
          <div
            className="absolute bottom-6 right-6 h-28 w-44 rounded-lg border border-border bg-surface-raised p-3"
            style={{ boxShadow: 'var(--elevation-200)' }}
          >
            <span className="text-caption text-fg-muted">Popover（200）</span>
          </div>
        </div>
      </div>
    </div>
  ),
}

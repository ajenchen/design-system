import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '@/design-system/components/Button/button'
import { Plus } from 'lucide-react'

const meta: Meta = {
  title: 'Design System/Tokens/Radius',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
圓角系統。四個選項,對應四種尺寸情境。

完整規則:\`packages/design-system/src/tokens/radius/radius.spec.md\`
        `,
      },
    },
  },
}

export default meta
type Story = StoryObj


export const Overview: Story = {
  name: '總覽',
  render: () => (
    <div className="max-w-2xl space-y-8">
      {/* rounded-xs */}
      <div>
        <div className="flex items-baseline gap-3 mb-3">
          <code className="text-caption font-medium">rounded-xs</code>
          <span className="text-caption text-fg-muted">2px — 極小 indicator(≤ 10px)</span>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div aria-hidden="true" className="rounded-xs bg-primary h-2 w-2" />
          <div aria-hidden="true" className="rounded-xs bg-success h-2 w-2" />
          <div aria-hidden="true" className="rounded-xs bg-error h-2 w-2" />
          <span className="text-caption text-fg-muted ml-2">Chart legend swatch(8×8 色塊):md 4px 在 8×8 上接近 50% 圓,xs 2px 保留「色塊」而非「膠囊」語意</span>
        </div>
      </div>

      {/* rounded-md */}
      <div>
        <div className="flex items-baseline gap-3 mb-3">
          <code className="text-caption font-medium">rounded-md</code>
          <span className="text-caption text-fg-muted">4px — 一般元件</span>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <Button variant="primary" startIcon={Plus}>Button</Button>
          <div className="rounded-md border border-border bg-surface px-3 h-field-sm flex items-center text-body text-fg-muted w-40">Input</div>
          <div className="rounded-md bg-muted px-2 h-6 flex items-center text-caption font-medium">Tag</div>
          <div className="rounded-md border border-border bg-surface p-3 text-caption text-fg-muted">Card</div>
        </div>
      </div>

      {/* rounded-lg */}
      <div>
        <div className="flex items-baseline gap-3 mb-3">
          <code className="text-caption font-medium">rounded-lg</code>
          <span className="text-caption text-fg-muted">8px — 浮層 / 容器</span>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-4 max-w-xs" style={{ boxShadow: 'var(--elevation-200)' }}>
          <p className="text-body font-medium mb-1">Popover</p>
          <p className="text-caption text-fg-muted">Modal、Popover、Dropdown 等浮層使用 rounded-lg。</p>
        </div>
      </div>

      {/* rounded-full */}
      <div>
        <div className="flex items-baseline gap-3 mb-3">
          <code className="text-caption font-medium">rounded-full</code>
          <span className="text-caption text-fg-muted">9999px — Pill / 圓形</span>
        </div>
        <div className="flex gap-3 items-center">
          <div className="rounded-full bg-primary h-8 w-8 flex items-center justify-center text-white text-caption font-medium">A</div>
          <span
            className="rounded-full inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-white text-footnote font-medium leading-none"
            style={{ background: 'var(--notification)' }}
          >3</span>
          <div className="rounded-full bg-[var(--primary-subtle)] text-[var(--primary)] px-3 h-6 flex items-center text-caption font-medium">Badge</div>
        </div>
      </div>
    </div>
  ),
}

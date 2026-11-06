import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '@/design-system/components/Button/button'
import { Input } from '@/design-system/components/Input/input'
import { Tag } from '@/design-system/components/Tag/tag'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { Badge } from '@/design-system/components/Badge/badge'
import { Switch } from '@/design-system/components/Switch/switch'
import { Plus } from 'lucide-react'

const meta: Meta = {
  title: 'Design System/Tokens/Radius',
  tags: ['autodocs'],
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
    <div className="max-w-2xl space-y-[var(--layout-space-loose)]">
      {/* rounded-xs */}
      <div>
        {/* @layout-space-magic-ok: 行內 token 名 ↔ 說明 8px,與 color.stories 邊框列「名稱 ↔ 說明」同值(layoutSpace.spec.md:166 micro) */}
        <div className="flex items-baseline gap-2 mb-[var(--layout-space-tight)]">
          <code className="text-caption font-medium">rounded-xs</code>
          <span className="text-caption text-fg-muted">2px — 極小 indicator(≤ 10px)</span>
        </div>
        <div className="flex flex-wrap gap-[var(--layout-space-tight)] items-center">
          <div className="flex gap-[var(--layout-space-loose)] items-center">
            <div aria-hidden="true" className="rounded-xs bg-primary h-2 w-2" />
            <div aria-hidden="true" className="rounded-xs bg-success h-2 w-2" />
            <div aria-hidden="true" className="rounded-xs bg-error h-2 w-2" />
          </div>
          <span className="text-caption text-fg-muted">Chart legend swatch(8×8 色塊):md 4px 在 8×8 上接近 50% 圓,xs 2px 保留「色塊」而非「膠囊」語意</span>
        </div>
      </div>

      {/* rounded-md */}
      <div>
        {/* @layout-space-magic-ok: 行內 token 名 ↔ 說明 8px,與 color.stories 邊框列「名稱 ↔ 說明」同值(layoutSpace.spec.md:166 micro) */}
        <div className="flex items-baseline gap-2 mb-[var(--layout-space-tight)]">
          <code className="text-caption font-medium">rounded-md</code>
          <span className="text-caption text-fg-muted">4px — 一般元件</span>
        </div>
        <div className="flex flex-wrap gap-[var(--layout-space-loose)] items-center">
          {/* 2026-10-01:Input / Tag 原為手刻仿製(自帶 12px / 8px 水平內距),改消費真元件 —— 圓角樣本必須就是元件本身,
              元件改了這裡跟著變,不會出現「token 頁的 Tag 與真 Tag 長得不一樣」的漂移 */}
          <Button variant="primary" startIcon={Plus}>Button</Button>
          <div className="w-40"><Input placeholder="Input" aria-label="圓角示意輸入框" /></div>
          <Tag>Tag</Tag>
          <div className="rounded-md border border-border bg-surface p-[var(--layout-space-loose)] text-caption text-fg-muted">Card</div>
        </div>
      </div>

      {/* rounded-lg */}
      <div>
        {/* @layout-space-magic-ok: 行內 token 名 ↔ 說明 8px,與 color.stories 邊框列「名稱 ↔ 說明」同值(layoutSpace.spec.md:166 micro) */}
        <div className="flex items-baseline gap-2 mb-[var(--layout-space-tight)]">
          <code className="text-caption font-medium">rounded-lg</code>
          <span className="text-caption text-fg-muted">8px — 浮層 / 容器</span>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-[var(--layout-space-loose)] max-w-xs" style={{ boxShadow: 'var(--elevation-200)' }}>
          <p className="text-body font-medium mb-[var(--item-gap-label-desc-reading)]">Popover</p>
          <p className="text-caption text-fg-muted">Modal、Popover、Dropdown 等浮層使用 rounded-lg。</p>
        </div>
      </div>

      {/* rounded-full */}
      <div>
        {/* @layout-space-magic-ok: 行內 token 名 ↔ 說明 8px,與 color.stories 邊框列「名稱 ↔ 說明」同值(layoutSpace.spec.md:166 micro) */}
        <div className="flex items-baseline gap-2 mb-[var(--layout-space-tight)]">
          <code className="text-caption font-medium">rounded-full</code>
          <span className="text-caption text-fg-muted">9999px — Pill / 圓形</span>
        </div>
        <div className="flex gap-[var(--layout-space-loose)] items-center">
          {/* 2026-10-01:原為手刻仿製 —— 計數「3」自帶 20px 高 / 6px 內距(真 Badge 是 16px 高、4px 內距,樣本與元件已漂移)、
              「Badge」文字膠囊在 DS 裡根本沒有對應元件(DS 的 Badge 是計數指示器)。改消費真元件,
              並換成 radius.spec.md「rounded-full」列出的 Avatar / Switch */}
          <Avatar size={32} alt="Alice" />
          <Badge variant="critical" count={3} />
          <Switch defaultChecked aria-label="接收通知" />
        </div>
      </div>
    </div>
  ),
}

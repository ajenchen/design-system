import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { within } from '@storybook/test'
import { Tag } from './tag'

const meta: Meta<typeof Tag> = {
  title: 'Design System/Components/Tag/展示',
  component: Tag,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Inline label，用於分類標籤、狀態標記、多選已選值。以色名命名 variant，語義由消費端決定。',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof Tag>

/* ── Avatar ── */
export const WithAvatar: Story = {
  name: '頭像',
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Tag color="neutral" avatar={
        <img src="https://i.pravatar.cc/32?u=alice" alt="" className="rounded-full object-cover" />
      }>
        Alice Chen
      </Tag>
      <Tag color="neutral" avatar={
        <img src="https://i.pravatar.cc/32?u=bob" alt="" className="rounded-full object-cover" />
      }>
        Bob Lin
      </Tag>
      <p className="w-full text-caption text-fg-muted">Tag 內部統一 avatar 為 16px（跟 icon 一致），消費端不用指定尺寸</p>
    </div>
  ),
}

/* ── Dismiss ── */
export const Dismissable: Story = {
  name: '可移除',
  render: () => {
    const [tags, setTags] = React.useState(['Electronics', 'Furniture', 'Food'])
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1">
          {tags.map(t => (
            <Tag key={t} color="neutral" onRemove={() => setTags(prev => prev.filter(x => x !== t))}>{t}</Tag>
          ))}
        </div>
        {tags.length === 0 && <p className="text-caption text-fg-muted">全部移除了，重新整理頁面可恢復</p>}
      </div>
    )
  },
}

// neutral subtle Tag 是 beta.97 校正的 neutral host 分支:
// remove action 應由 fg-muted 只前進一階到 fg-secondary。
export const DismissHoverState: Story = {
  name: '移除標籤懸停狀態',
  tags: ['!autodocs'],
  render: () => (
    <div className="flex items-center gap-2">
      <Tag color="neutral" onRemove={() => {}}>付款待確認</Tag>
      <span className="text-caption text-fg-secondary">發票篩選條件</span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const dismiss = await canvas.findByRole('button', { name: '移除 付款待確認' })
    dismiss.setAttribute('data-visual-hover-target', '')
  },
}

/* ── 截斷 + Tooltip ── */
export const Truncation: Story = {
  name: '截斷 + Tooltip',
  render: () => (
    <div className="flex flex-col gap-3" style={{ maxWidth: 300 }}>
      <Tag color="neutral">Bug</Tag>
      <Tag color="blue">Q3 Checkout Funnel Redesign — Payment Step</Tag>
      <p className="text-caption text-fg-muted">超過 160px 自動截斷，hover 顯示完整文字 tooltip</p>
    </div>
  ),
}

import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Hash, Circle, Star } from 'lucide-react'
import { Tag } from './tag'

const meta: Meta<typeof Tag> = {
  title: 'Design System/Components/Tag',
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

const variants = ['neutral', 'blue', 'red', 'green', 'yellow', 'turquoise', 'purple', 'magenta', 'indigo'] as const

/* ── 全部 Variants ── */
export const AllVariants: Story = {
  name: '全部 Variants',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {variants.map(v => (
          <Tag key={v} variant={v}>{v}</Tag>
        ))}
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-2">建議用法</p>
        <div className="flex flex-wrap gap-2">
          <Tag variant="blue">進行中</Tag>
          <Tag variant="green">已完成</Tag>
          <Tag variant="red">已封鎖</Tag>
          <Tag variant="yellow">待審核</Tag>
          <Tag variant="neutral">草稿</Tag>
          <Tag variant="purple">設計</Tag>
          <Tag variant="turquoise">前端</Tag>
          <Tag variant="magenta">行銷</Tag>
          <Tag variant="indigo">研究</Tag>
        </div>
      </div>
    </div>
  ),
}

/* ── 尺寸 ── */
export const Sizes: Story = {
  name: '尺寸',
  render: () => (
    <div className="flex flex-col gap-3">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size} className="flex items-center gap-3">
          <span className="text-caption text-fg-muted w-8">{size}</span>
          <Tag size={size} variant="blue">Electronics</Tag>
          <Tag size={size} variant="green">Approved</Tag>
          <Tag size={size} variant="neutral">Draft</Tag>
        </div>
      ))}
    </div>
  ),
}

/* ── Icon ── */
export const WithIcon: Story = {
  name: 'Icon',
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Tag variant="blue" icon={Hash}>channel</Tag>
      <Tag variant="purple" icon={Circle}>design</Tag>
      <Tag variant="green" icon={Star}>featured</Tag>
    </div>
  ),
}

/* ── Avatar ── */
export const WithAvatar: Story = {
  name: 'Avatar',
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Tag variant="neutral" avatar={
        <img src="https://i.pravatar.cc/32?u=alice" alt="" className="w-4 h-4 rounded-full object-cover" />
      }>
        Alice Chen
      </Tag>
      <Tag variant="neutral" avatar={
        <span className="w-4 h-4 rounded-full bg-muted text-foreground inline-grid place-content-center text-[10px] font-medium">BL</span>
      }>
        Bob Lin
      </Tag>
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
            <Tag key={t} variant="neutral" onDismiss={() => setTags(prev => prev.filter(x => x !== t))}>{t}</Tag>
          ))}
        </div>
        {tags.length === 0 && <p className="text-caption text-fg-muted">全部移除了，重新整理頁面可恢復</p>}
      </div>
    )
  },
}

/* ── 截斷 + Tooltip ── */
export const Truncation: Story = {
  name: '截斷 + Tooltip',
  render: () => (
    <div className="flex flex-col gap-3" style={{ maxWidth: 300 }}>
      <Tag variant="neutral">Short</Tag>
      <Tag variant="blue">This is a very long tag label that should truncate</Tag>
      <p className="text-caption text-fg-muted">超過 160px 自動截斷，hover 顯示完整文字 tooltip</p>
    </div>
  ),
}

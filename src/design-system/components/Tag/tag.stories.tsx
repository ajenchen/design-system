import type { Meta, StoryObj } from '@storybook/react'
import { X } from 'lucide-react'
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

/* ── Prefix / Suffix ── */
export const WithPrefixSuffix: Story = {
  name: 'Prefix / Suffix',
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Tag variant="blue" suffix={
          <button type="button" className="grid place-content-center text-fg-muted hover:text-foreground transition-colors" style={{ width: 16, height: 16 }} aria-label="移除">
            <X size={16} />
          </button>
        }>
          可移除
        </Tag>
        <Tag variant="green" suffix={
          <button type="button" className="grid place-content-center text-fg-muted hover:text-foreground transition-colors" style={{ width: 16, height: 16 }} aria-label="移除">
            <X size={16} />
          </button>
        }>
          Electronics
        </Tag>
      </div>
    </div>
  ),
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

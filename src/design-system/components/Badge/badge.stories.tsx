import type { Meta, StoryObj } from '@storybook/react'
import { Badge } from './badge'

const meta: Meta<typeof Badge> = {
  title: 'Design System/Components/Badge',
  component: Badge,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '通知計數指示器，用於未讀數量、待辦計數。四個層級（critical / high / medium / low）＋ dot 模式。',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof Badge>

/* ── 四個層級 ── */
export const Variants: Story = {
  name: '四個層級',
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Badge count={3} variant="critical" />
        <Badge count={3} variant="high" />
        <Badge count={3} variant="medium" />
        <Badge count={3} variant="low" />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-caption text-fg-muted w-16">critical</span>
        <Badge count={1} variant="critical" />
        <Badge count={12} variant="critical" />
        <Badge count={150} variant="critical" max={99} />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-caption text-fg-muted w-16">high</span>
        <Badge count={1} variant="high" />
        <Badge count={12} variant="high" />
        <Badge count={150} variant="high" max={99} />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-caption text-fg-muted w-16">medium</span>
        <Badge count={1} variant="medium" />
        <Badge count={12} variant="medium" />
        <Badge count={150} variant="medium" max={99} />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-caption text-fg-muted w-16">low</span>
        <Badge count={1} variant="low" />
        <Badge count={12} variant="low" />
        <Badge count={150} variant="low" max={99} />
      </div>
    </div>
  ),
}

/* ── 形狀：正圓 vs 膠囊 ── */
export const Shape: Story = {
  name: '正圓 vs 膠囊',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Badge count={1} />
        <Badge count={5} />
        <Badge count={9} />
        <span className="text-caption text-fg-muted">個位數 → 正圓（16×16）</span>
      </div>
      <div className="flex items-center gap-3">
        <Badge count={10} />
        <Badge count={42} />
        <Badge count={99} />
        <span className="text-caption text-fg-muted">多位數 → 膠囊</span>
      </div>
      <div className="flex items-center gap-3">
        <Badge count={100} max={99} />
        <Badge count={1000} max={999} />
        <span className="text-caption text-fg-muted">超過上限 → "max+"</span>
      </div>
    </div>
  ),
}

/* ── Dot 模式 ── */
export const Dot: Story = {
  name: 'Dot 模式',
  render: () => (
    <div className="flex items-center gap-4">
      <Badge dot variant="critical" />
      <Badge dot variant="high" />
      <Badge dot variant="medium" />
      <Badge dot variant="low" />
      <span className="text-caption text-fg-muted">6×6px 純色圓點</span>
    </div>
  ),
}

/* ── Max 上限 ── */
export const MaxCount: Story = {
  name: 'Max 上限',
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Badge count={5} max={9} />
        <Badge count={10} max={9} />
        <span className="text-caption text-fg-muted">max=9 → 超過顯示 "9+"</span>
      </div>
      <div className="flex items-center gap-3">
        <Badge count={50} max={99} />
        <Badge count={100} max={99} />
        <span className="text-caption text-fg-muted">max=99 → 超過顯示 "99+"</span>
      </div>
      <div className="flex items-center gap-3">
        <Badge count={500} max={999} />
        <Badge count={1000} max={999} />
        <span className="text-caption text-fg-muted">max=999 → 超過顯示 "999+"</span>
      </div>
    </div>
  ),
}

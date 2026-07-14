import type { Meta, StoryObj } from '@storybook/react'
import { Badge } from './badge'

const meta: Meta<typeof Badge> = {
  title: 'Design System/Components/Badge/展示',
  component: Badge,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '通知計數指示器，用於未讀數量、待辦計數。count 四級 severity（critical / high / medium / low）；dot 模式只 critical / high（單一 attention 點）。',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof Badge>

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
  name: '圓點模式',
  render: () => (
    <div className="flex items-center gap-4">
      {/* dot 無文字 → 必帶 aria-label(badge.spec.md 禁止事項:「dot 模式不帶 aria-label——
          無文字的 dot 對 screen reader 完全不存在」) */}
      <Badge dot variant="critical" aria-label="有緊急待處理事項" />
      <Badge dot variant="high" aria-label="有新通知" />
      <span className="text-caption text-fg-muted">6×6px attention 點 —— 只 critical / high(單一注意點,不分 medium/low)</span>
    </div>
  ),
}

/* ── Max 上限 ── */
export const MaxCount: Story = {
  name: '數量上限',
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

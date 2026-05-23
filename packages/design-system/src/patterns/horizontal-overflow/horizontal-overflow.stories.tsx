// @story-baseline: packages/design-system/src/components/OverflowIndicator/overflow-indicator.stories.tsx#Default
// 2026-05-23 ship per patterns/README.md charter「每 pattern 提供 .stories.tsx 展示」
// horizontal-overflow 提供 toolbar / tag-list 橫向溢出工具(fade-mask / scroll-arrow / overflow-menu-trigger)— 公開 API
import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { OverflowScrollArrow, OverflowMenuTriggerButton, buildFadeMask } from './horizontal-overflow'

const meta: Meta = {
  title: 'Design System/Internal Patterns/Horizontal Overflow',
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj

export const FadeMaskAndArrow: Story = {
  name: '橫向溢出:漸層遮罩配滾動箭頭',
  render: () => (
    <div className="flex items-center gap-2 max-w-[420px]">
      <OverflowScrollArrow direction="start" disabled />
      <div
        className="relative overflow-hidden border border-divider rounded-md flex-1"
        style={{
          maskImage: buildFadeMask({ start: true, end: true }),
          WebkitMaskImage: buildFadeMask({ start: true, end: true }),
        }}
      >
        <div className="flex gap-2 px-loose py-2 whitespace-nowrap">
          {['全部', '進行中', '待審', '已完成', '已封存', '逾期', '草稿'].map((label) => (
            <span key={label} className="text-caption px-2 py-1 rounded bg-secondary">{label}</span>
          ))}
        </div>
      </div>
      <OverflowScrollArrow direction="end" />
    </div>
  ),
}

export const OverflowMenuTrigger: Story = {
  name: '溢出選單觸發按鈕',
  render: () => (
    <div className="flex items-center gap-2 border border-divider rounded-md p-2">
      <span className="text-caption px-2 py-1 rounded bg-secondary">全部</span>
      <span className="text-caption px-2 py-1 rounded bg-secondary">進行中</span>
      <OverflowMenuTriggerButton count={5} aria-label="顯示其他 5 項" />
    </div>
  ),
}

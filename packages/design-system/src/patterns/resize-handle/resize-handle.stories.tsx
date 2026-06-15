// @story-baseline: none — primitive 用 minimal scenario showcase visual + cursor + a11y
import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { ResizeHandle } from './resize-handle'

const meta: Meta<typeof ResizeHandle> = {
  title: 'Design System/Patterns/Resize Handle',
  component: ResizeHandle,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof ResizeHandle>

// Demo:DataTable「訂單金額」欄頭右緣的 resize handle(spec 首要 consumer 場景)
const ColumnDemo: React.FC<{ isResizing?: boolean; disabled?: boolean }> = ({ isResizing, disabled }) => (
  <div className="relative inline-block bg-surface border border-divider px-[var(--layout-space-loose)] py-2 w-[200px]">
    <span className="text-body font-medium">訂單金額</span>
    <ResizeHandle
      direction="horizontal"
      position="end"
      isResizing={isResizing}
      disabled={disabled}
      aria-label="拖曳調整欄寬"
    />
  </div>
)

export const Default: Story = {
  name: '預設',
  render: () => (
    <div className="flex flex-col gap-4">
      <ColumnDemo />
      <p className="text-caption text-fg-secondary">滑鼠移到右邊緣時,游標變成左右拖拉樣式,分隔線顏色加深提示可以拖拉</p>
    </div>
  ),
}

export const Dragging: Story = {
  name: '拖拉中',
  render: () => (
    <div className="flex flex-col gap-4">
      <ColumnDemo isResizing />
      <p className="text-caption text-fg-secondary">拖拉進行中時,整條分隔線變成主色高亮,讓使用者清楚知道正在調整尺寸</p>
    </div>
  ),
}

export const Disabled: Story = {
  name: '禁用',
  render: () => (
    <div className="flex flex-col gap-4">
      <ColumnDemo disabled />
      <p className="text-caption text-fg-secondary">停用時不顯示拖拉游標,輔助技術也會忽略此元件,分隔線維持原本的灰色</p>
    </div>
  ),
}

export const Vertical: Story = {
  name: '垂直方向',
  render: () => (
    <div className="relative bg-surface border border-divider px-[var(--layout-space-loose)] py-2 w-[300px] h-[120px]">
      <span className="text-body">查詢結果面板</span>
      <ResizeHandle
        direction="vertical"
        position="end"
        aria-label="拖曳調整面板高度"
      />
    </div>
  ),
}
